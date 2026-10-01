import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import * as THREE from 'three';
import {anchorGroundUV} from '../src/corridor-view.js';
import {viewmodelPose,createActorHeading,renderFirstPersonLayers} from '../src/viewmodel-pose.js';
import {installHands} from '../src/hands.js';
import {updateDirector} from '../src/threat-director.js';
import {senseZombie} from '../src/zombie-ai.js';
import {createGame} from '../src/game.js';
import {createMaze} from '../src/maze.js';
import {playingScenario} from './helpers/scenarios.mjs';
import {createHarness} from './helpers/browser.mjs';

test('first-person lighting uses separate camera layers, keeps depth and restores renderer state',()=>{
  const camera=new THREE.PerspectiveCamera();camera.layers.enable(1);
  const background=new THREE.Color(),scene={background},calls=[];
  let resets=0;const renderer={autoClear:true,info:{autoReset:true,reset(){resets++;}},render(s,c){calls.push({mask:c.layers.mask,background:s.background,clear:this.autoClear});}};
  renderFirstPersonLayers(renderer,scene,camera,true);
  assert.deepEqual(calls,[{mask:1,background,clear:true},{mask:2,background:null,clear:false}]);
  assert.equal(resets,1);assert.equal(camera.layers.mask,3);assert.equal(scene.background,background);assert(renderer.autoClear);assert(renderer.info.autoReset);
  renderer.render=()=>{throw new Error('context fixture');};
  assert.throws(()=>renderFirstPersonLayers(renderer,scene,camera,true),/context fixture/);
  assert.equal(camera.layers.mask,3);assert.equal(scene.background,background);assert(renderer.autoClear);assert(renderer.info.autoReset);
});

test('field mud samples a fixed world point identically as its patch moves in both axes',()=>{
  const geometry=new THREE.PlaneGeometry(140,140);
  const sample=(x,z)=>{
    anchorGroundUV(geometry,{x,z},120,240);
    const uv=geometry.attributes.uv;
    // Interpolate the top left UV to world point (5, 8).
    return [uv.getX(0)+(5-(x-70))/120,uv.getY(0)-(8-(z-70))/240];
  };
  const a=sample(0,0),b=sample(19,-27);
  for(let i=0;i<2;i++)assert(Math.abs(a[i]-b[i])<1e-7);
});

test('director retains pressure until the final active local pursuer stops',()=>{
  const game=createGame(createMaze({corridors:true}));
  Object.assign(game.enemy,{state:'observe',active:true,zone:game.player.zone});
  const chase={state:'chase',active:true,zone:game.player.zone};game.enemies=[game.enemy,chase];
  updateDirector(game,.1);assert.equal(game.threat.pacing.phase,'pressure');
  chase.zone='elsewhere';game.elapsed=1;updateDirector(game,.1);assert.equal(game.threat.pacing.phase,'recovery');
  chase.zone=game.player.zone;chase.active=false;game.elapsed=20;updateDirector(game,.1);assert.notEqual(game.threat.pacing.phase,'pressure');
  chase.active=true;game.interaction={phase:'recovery'};updateDirector(game,.1);assert.equal(game.threat.pacing.phase,'recovery');
});

test('fresh sight wins over an older sound while independent sound memory is retained',()=>{
  const game=playingScenario();game.elapsed=2;
  const heard={x:game.enemy.x+.2,z:game.enemy.z};
  game.evidence=[{type:'gunshot',position:heard,radius:40,priority:10,at:1.6}];
  const perception=senseZombie(game,[]);assert(perception.seen);
  assert.deepEqual(game.enemy.memory.lastKnown,{x:game.player.x,z:game.player.z});
  assert.equal(game.enemy.memory.lastObservation.source,'vision');assert.deepEqual(game.enemy.memory.lastHeard,heard);
  game.player.hidden=true;game.evidence=[{type:'gunshot',position:heard,radius:40,priority:10,at:2}];
  assert(!senseZombie(game,[]).seen);assert.deepEqual(game.enemy.memory.lastKnown,heard);
});

test('actor turns use the shortest arc and reset on run, teleport and choreography',()=>{
  const actor={x:0,z:0,yaw:Math.PI-.1,zone:'corridor'},heading=createActorHeading();
  const before=heading.sample(actor,1,0);actor.yaw=-Math.PI+.1;
  const after=heading.sample(actor,1,.016);assert(Math.abs(after-before)<.04);assert(after>before);
  actor.yaw=0;assert.equal(heading.sample(actor,2,.016),Math.PI);
  actor.yaw=1;assert.equal(heading.sample(actor,2,.016,{immediate:true}),Math.PI+1);
  actor.x=20;actor.yaw=2;assert.equal(heading.sample(actor,2,.016),Math.PI+2);
});

test('reduced effects freeze viewmodel motion and proximity lowers it without changing aim',()=>{
  const still=viewmodelPose({reduced:true}),moving=viewmodelPose({time:20,steps:10,moving:true,recoil:.16,reduced:true});
  for(const key of ['position','rotation'])for(let i=0;i<3;i++)assert(Math.abs(still[key][i]-moving[key][i])<1e-12);
  const wall=viewmodelPose({reduced:true,nearWall:true});assert(wall.position[1]<still.position[1]);
  for(const aspect of [.45,1.7,2.4])assert(Object.values(viewmodelPose({aspect})).flat().every(Number.isFinite));
});

test('optional model timeout keeps placeholders and disposes a late asset without installing it',async()=>{
  const pending=[],gun=new THREE.Group(),knife=new THREE.Group(),placeholder=new THREE.Object3D();gun.add(placeholder);
  const loader={loadAsync(){return new Promise(resolve=>pending.push(resolve));}};
  const hands=installHands({gun,knife,placeholders:[placeholder],loader,deadlineMs:5});await hands.ready;
  assert.equal(hands.stats.status,'fallback');assert(placeholder.visible);
  let disposals=0;
  for(const resolve of pending){const scene=new THREE.Group(),mesh=new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshStandardMaterial());scene.add(mesh);mesh.geometry.addEventListener('dispose',()=>disposals++);resolve({scene});}
  await new Promise(resolve=>setImmediate(resolve));assert.equal(disposals,2);assert.equal(gun.children.length,1);hands.dispose();
});

test('player GLBs contain the actual skinned rig and separate slide, and match provenance hashes',async()=>{
  const manifest=JSON.parse(await readFile(new URL('../assets/field/player-viewmodel-source.json',import.meta.url)));
  let total=0;
  for(const [name,record] of Object.entries(manifest.runtime)){
    const data=await readFile(new URL('../assets/field/'+name,import.meta.url));total+=data.length;
    assert.equal(createHash('sha256').update(data).digest('hex'),record.sha256);
    assert.equal(data.toString('ascii',0,4),'glTF');const gltf=JSON.parse(data.toString('utf8',20,20+data.readUInt32LE(12)));
    if(name==='player-arms.glb'){assert.equal(gltf.skins.length,2);assert(gltf.skins.every(s=>s.joints.length>=20));assert(gltf.nodes.some(n=>n.name==='RightArm'));}
    else{assert(gltf.nodes.some(n=>n.name==='PistolSlide'));assert(!gltf.nodes.some(n=>n.name?.includes('magazine_empty')));}
  }
  assert(total<4000000);assert(manifest.sources.every(s=>s.license==='CC0-1.0'));
});

test('disposing a loading player view settles readiness without a late presentation commit',async()=>{
  const pending=[],gun=new THREE.Group(),knife=new THREE.Group();
  const hands=installHands({gun,knife,placeholders:[],loader:{loadAsync(){return new Promise(resolve=>pending.push(resolve));}}});
  hands.dispose();await hands.ready;assert.equal(hands.stats.status,'disposed');
  for(const resolve of pending)resolve({scene:new THREE.Group()});await new Promise(resolve=>setImmediate(resolve));
  assert.equal(gun.children.length,0);assert.equal(knife.children.length,0);
});

test('application teardown disposes its view exactly once',()=>{
  const h=createHarness();h.app.dispose();h.app.dispose();assert.equal(h.view.disposals,1);
});

function modelFixtures(){
  const arms=new THREE.Group(),pistol=new THREE.Group();
  for(const name of ['RightArm','LeftArm']){
    const root=new THREE.Group();root.name=name;arms.add(root);
    const bone=new THREE.Bone(),geometry=new THREE.BoxGeometry(.1,.2,.1);
    const count=geometry.attributes.position.count;
    geometry.setAttribute('skinIndex',new THREE.Uint16BufferAttribute(new Uint16Array(count*4),4));
    const weights=new Float32Array(count*4);for(let i=0;i<count;i++)weights[i*4]=1;
    geometry.setAttribute('skinWeight',new THREE.Float32BufferAttribute(weights,4));
    const skin=new THREE.SkinnedMesh(geometry,new THREE.MeshStandardMaterial());root.add(bone,skin);skin.bind(new THREE.Skeleton([bone]));
  }
  for(const name of ['PistolBody','PistolSlide']){const mesh=new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshStandardMaterial());mesh.name=name;pistol.add(mesh);}
  return [arms,pistol];
}

test('successful player installation frees cloned skeleton textures and knife materials',async()=>{
  const [arms,pistol]=modelFixtures(),gun=new THREE.Group(),knife=new THREE.Group();
  const blade=new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshStandardMaterial());knife.add(blade);
  const hands=installHands({gun,knife,placeholders:[],loader:{loadAsync(url){return Promise.resolve({scene:url.includes('player-arms')?arms:pistol});}}});
  await hands.ready;assert.equal(hands.stats.status,'ready');
  let freed=0,materialFreed=0;
  for(const root of [gun,knife])root.traverse(object=>{if(object.isSkinnedMesh){object.skeleton.computeBoneTexture();object.skeleton.boneTexture.addEventListener('dispose',()=>freed++);}});
  blade.material.addEventListener('dispose',()=>materialFreed++);
  hands.dispose();hands.dispose();assert.equal(freed,3);assert.equal(materialFreed,1);
});

test('partial player installation failure frees cloned resources and keeps fallback visible',async()=>{
  const [arms,pistol]=modelFixtures(),gun=new THREE.Group(),knife=new THREE.Group(),placeholder=new THREE.Object3D();
  let freed=0;pistol.children[0].material.clone=()=>{throw new Error('material fixture');};
  const originalAdd=gun.add.bind(gun);gun.add=(...objects)=>{for(const object of objects)object.addEventListener('childadded',event=>event.child.traverse(mesh=>{if(mesh.isSkinnedMesh)mesh.material.addEventListener('dispose',()=>freed++);}));return originalAdd(...objects);};
  const hands=installHands({gun,knife,placeholders:[placeholder],loader:{loadAsync(url){return Promise.resolve({scene:url.includes('player-arms')?arms:pistol});}}});
  await hands.ready;assert.equal(hands.stats.status,'fallback');assert(placeholder.visible);assert.equal(gun.children.length,0);assert(freed>0);hands.dispose();
});
