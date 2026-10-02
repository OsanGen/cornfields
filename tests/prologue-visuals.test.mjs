import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {prologueBlocking,prologueWorldTransition,withPrologueWorld,prologueVisionState,applyPrologueCamera,attachPrologueLiquid,createPrologueVisuals} from '../src/prologue-visuals.js';
import {createPrologueActor} from '../src/prologue-actors.js';
import {createPrologueEquipment} from '../src/scene.js';
import {GAME_CONFIG} from '../src/game-config.js';
import {createPrologue} from '../src/prologue.js';

test('prologue starts with Mike in the passenger seat and exits at standing height',()=>{
  const car=prologueBlocking({chapter:'car',chapterProgress:0,time:0});
  assert.ok(car.camera[0]>0);assert.equal(car.inCar,true);assert.equal(car.camera[1],1.13);
  const exit=prologueBlocking({chapter:'exit',chapterProgress:1});
  assert.equal(exit.inCar,false);assert.equal(exit.camera[1],GAME_CONFIG.player.eyeHeight);
});

test('guided chapters join at identical camera positions',()=>{
  const chapters=['exit','walk','history','disappearance','arrival','rupture'];
  for(let i=0;i<chapters.length-1;i++){
    const end=prologueBlocking({chapter:chapters[i],chapterProgress:1});
    const next=prologueBlocking({chapter:chapters[i+1],chapterProgress:0});
    assert.deepEqual(end.camera,next.camera,`${chapters[i]} to ${chapters[i+1]}`);
  }
});

test('return holds the exact threshold pose and never restores the men',()=>{
  const end=prologueBlocking({chapter:'arrival',chapterProgress:1});
  const returned=prologueBlocking({chapter:'rupture',chapterProgress:.2,returning:true,returnTime:3});
  assert.deepEqual(returned.camera,end.camera);assert.deepEqual(returned.camera,[0,GAME_CONFIG.player.eyeHeight,-48]);
  assert.deepEqual(returned.look,[0,GAME_CONFIG.player.eyeHeight,-56]);assert.equal(returned.menVisible,false);
});

test('disappearance is concealed by dense mist and reduced mode removes the head turn',()=>{
  assert.equal(prologueBlocking({chapter:'rupture',chapterProgress:.4,mist:.25}).menVisible,true);
  assert.equal(prologueBlocking({chapter:'rupture',chapterProgress:.9,mist:.95}).menVisible,false);
  const reduced=prologueBlocking({chapter:'rupture',chapterProgress:.25,reduced:true});
  assert.deepEqual(reduced.look,[0,GAME_CONFIG.player.eyeHeight,-56]);
});

test('live maze transfer happens only while fully covered and persists through return',()=>{
  assert.deepEqual(prologueWorldTransition({chapter:'arrival',chapterProgress:.01},false),{world:false,cover:0});
  assert.equal(prologueWorldTransition({chapter:'arrival',chapterProgress:.15},true).world,false);
  for(const p of [.15,.16,.18,.22])assert.equal(prologueWorldTransition({chapter:'arrival',chapterProgress:p},true).cover,1);
  assert.equal(prologueWorldTransition({chapter:'arrival',chapterProgress:.16},true).world,true);
  assert.deepEqual(prologueWorldTransition({chapter:'arrival',chapterProgress:1},true),{world:true,cover:0});
  assert.equal(prologueWorldTransition({chapter:'rupture',returning:true},true).world,true);
});

test('borrowed scene, camera and membership restore when world rendering throws',()=>{
  const scene=new THREE.Scene(),gameCamera=new THREE.PerspectiveCamera(),cinematic=new THREE.PerspectiveCamera(),ownScene=new THREE.Scene(),location=new THREE.Group(),stage=new THREE.Group();
  const first=new THREE.Group(),actor=new THREE.Group(),last=new THREE.Group(),haze=new THREE.Group();
  ownScene.add(location,stage,haze);location.add(first,actor,last);stage.visible=false;
  scene.add(gameCamera);gameCamera.position.set(5,1.58,7);gameCamera.rotation.y=.8;
  const photograph=new THREE.Mesh(new THREE.SphereGeometry(1),new THREE.MeshBasicMaterial({color:0xaabbcc}));photograph.name='Photographic night sky';scene.add(photograph);
  scene.fog=new THREE.FogExp2(0x202020,.075);scene.background=new THREE.Color(0x131920);
  const fog=scene.fog,background=scene.background,color=photograph.material.color.clone(),children=[...scene.children],ownedChildren=[...ownScene.children],pose=gameCamera.matrix.clone();
  assert.throws(()=>withPrologueWorld({scene,camera:gameCamera},{camera:cinematic,stage,actors:[actor,haze],fog:new THREE.FogExp2(0xaa0000,.4),background:new THREE.Color(0x220000),red:1},(active,view)=>{
    assert.equal(active,scene);assert.equal(view,cinematic);assert.equal(gameCamera.visible,false);assert.equal(actor.parent,stage);throw new Error('render failed');
  }),/render failed/);
  assert.equal(scene.fog,fog);assert.equal(scene.background,background);assert.equal(gameCamera.visible,true);assert.deepEqual(gameCamera.matrix,pose);
  assert.deepEqual(scene.children,children);assert.deepEqual(ownScene.children,ownedChildren);assert.deepEqual(location.children,[first,actor,last]);assert.equal(stage.visible,false);assert.ok(photograph.material.color.equals(color));
  photograph.geometry.dispose();photograph.material.dispose();
});

test('the new visions preserve their order and information in reduced effects',()=>{
  for(const reduced of [false,true]){
    const vision=(chapter,chapterTime)=>prologueVisionState({chapter,chapterTime,reduced});
    assert.equal(vision('flashlight',4).corpse,false);
    assert.equal(vision('undead',1).corpse,true);assert.equal(vision('history',0).corpse,false);
    assert.equal(vision('redroom',9.9).room,true);assert.equal(vision('return_walk',0).room,false);
    assert.equal(vision('liquid',0).liquid,0);assert.ok(vision('liquid',2).liquid>0);assert.equal(vision('liquid',5).liquid,0);
    assert.equal(vision('rupture',.5).limp,false);assert.equal(vision('rupture',2).limp,true);assert.equal(vision('rupture',2).rise,0);
    assert.ok(vision('rupture',5).rise>.4);assert.equal(vision('rupture',5).dissolve,0);
    assert.equal(vision('rupture',7).binary,true);assert.ok(vision('rupture',7).dissolve>0);assert.ok(vision('rupture',7).mist<.2);
    assert.equal(vision('rupture',9.1).escortsVisible,false);assert.equal(vision('rupture',9.1).binary,false);assert.equal(vision('rupture',12).mist,1);
    if(reduced)for(const t of [0,1,3.1,6.1,9])assert.equal(vision('rupture',t).lightning,0);
  }
});

test('camera uses the interactive position and retains yaw and pitch without authored aiming',()=>{
  const camera=new THREE.PerspectiveCamera(),motion={blocking:{camera:[1.2,1.58,-3],look:[800,30,800]}};
  applyPrologueCamera(camera,motion,{yaw:1.4,pitch:-.27});assert.deepEqual(camera.position.toArray(),motion.blocking.camera);
  assert.equal(camera.rotation.order,'YXZ');assert.equal(camera.rotation.y,1.4);assert.equal(camera.rotation.x,-.27);
  motion.blocking.look=[-300,-40,-300];applyPrologueCamera(camera,motion,{yaw:1.4,pitch:-.27});assert.equal(camera.rotation.y,1.4);
});

test('limp ascent and the main binary reveal remain visible in a level forward gaze',()=>{
  const camera=new THREE.PerspectiveCamera(65,16/9,.035,175);camera.position.set(0,1.58,0);camera.updateMatrixWorld(true);
  for(const time of [5,6,7]){
    const vision=prologueVisionState({chapter:'rupture',chapterTime:time});
    assert.ok(vision.rise>=0&&vision.rise<=1.4);
    for(const z of [-1.85,-3.25]){
      const head=new THREE.Vector3(0,vision.rise+1.72,z).project(camera);
      assert.ok(Math.abs(head.y)<1,`head remains on screen at ${time}s / ${z}m`);
      const torso=new THREE.Vector3(0,vision.rise+.95+vision.dissolve*.12,z).project(camera);
      assert.ok(Math.abs(torso.y)<.8,`binary body stays readable at ${time}s / ${z}m`);
    }
  }
});

test('same escort rigs become corpses, go limp and dissolve without persistent material changes',()=>{
  const actor=createPrologueActor(),meshes=[];actor.root.traverse(o=>{if(o.isMesh)meshes.push(o);});
  const colors=meshes.map(m=>m.material.color.getHex());actor.pose({mode:'walk',corpse:true});assert.equal(actor.diagnostics().corpse,true);
  assert.ok(meshes.some((m,i)=>m.material.color.getHex()!==colors[i]));
  actor.pose({mode:'limp',dissolve:.6,time:7});assert.equal(actor.diagnostics().pose,'limp');assert.equal(actor.diagnostics().dissolve,.6);
  actor.pose({mode:'standing'});assert.deepEqual(meshes.map(m=>m.material.color.getHex()),colors);assert.equal(actor.diagnostics().dissolve,0);
  const shader={uniforms:{},vertexShader:'#include <begin_vertex>',fragmentShader:'#include <clipping_planes_fragment>'};meshes[0].material.onBeforeCompile(shader);
  assert.ok(shader.fragmentShader.includes('discard'));assert.equal(shader.uniforms.prologueDecay.value,0);
  const geometries=new Set(meshes.map(m=>m.geometry)),materials=new Set(meshes.map(m=>m.material));for(const g of geometries)g.dispose();for(const m of materials)m.dispose();
});

test('liquid deformation changes actual vertices and material response while preserving the prior shader hook',()=>{
  const material=new THREE.MeshStandardMaterial();let calls=0;material.onBeforeCompile=shader=>{calls++;shader.uniforms.previous={value:3};};
  const uniforms=attachPrologueLiquid(material);assert.equal(attachPrologueLiquid(material),uniforms);
  const shader={uniforms:{},vertexShader:'#include <begin_vertex>',fragmentShader:'#include <color_fragment>\n#include <roughnessmap_fragment>'};material.onBeforeCompile(shader);
  assert.equal(calls,1);assert.equal(shader.uniforms.previous.value,3);assert.equal(shader.uniforms.prologueLiquid,uniforms.amount);
  assert.ok(shader.vertexShader.includes('transformed.x+='));assert.ok(shader.fragmentShader.includes('roughnessFactor=mix'));
  uniforms.amount.value=.3;assert.equal(shader.uniforms.prologueLiquid.value,.3);material.dispose();
});

function rendererStub(onRender){
  const viewport=new THREE.Vector4(0,0,800,600),color=new THREE.Color(0x152025);
  return {domElement:{clientWidth:800,clientHeight:600},autoClear:true,info:{autoReset:true,render:{calls:0},reset(){this.render.calls=0;}},
    getRenderTarget:()=>null,setRenderTarget(){},getScissorTest:()=>false,setScissorTest(){},getViewport:target=>target.copy(viewport),getScissor:target=>target.copy(viewport),setViewport(){},setScissor(){},getClearColor:target=>target.copy(color),getClearAlpha:()=>1,setClearColor(){},
    render(scene,camera){scene.updateMatrixWorld(true);this.info.render.calls++;onRender(scene,camera);}};
}

test('repeated driving frames never accumulate a half-turn in the seated actor',()=>{
  let scene;const renderer=rendererStub(s=>{scene=s;}),view=createPrologueVisuals(renderer);
  const story=createPrologue();story.begin();story.tick(2);const frame=story.frame();
  for(let i=0;i<8;i++){
    view.render(frame);const driver=scene.getObjectByName('Prologue Clarence');
    const forward=new THREE.Vector3(0,0,1).applyQuaternion(driver.quaternion);
    assert.ok(forward.z<-.99,`driver faces the windshield on frame ${i}`);
  }
  view.dispose();story.dispose();
});

test('rendering consumes live motion, draws the red room and capped ascent, then restores owned resources',()=>{
  let scene,drawnCamera,stageDraws=0,equipmentDraws=0;
  const geometry=new THREE.BoxGeometry(.1,2,.1),material=new THREE.MeshStandardMaterial({color:0x5b653f}),priorHook=material.onBeforeCompile;
  let borrowedDisposed=0;geometry.addEventListener('dispose',()=>borrowedDisposed++);material.addEventListener('dispose',()=>borrowedDisposed++);
  const renderer=rendererStub((s,c)=>{scene=s;drawnCamera=c;stageDraws++;});
  const view=createPrologueVisuals(renderer,{getCorn:()=>[{geometry,material}],renderEquipment:(camera,frame)=>{assert.equal(camera,drawnCamera);assert.ok(stageDraws>equipmentDraws);assert.ok(frame.player);equipmentDraws++;}});
  function draw(chapter,chapterTime,reduced=false){
    const frame={chapter,chapterTime,time:chapterTime,reduced,player:{x:2,z:-6,yaw:.42,pitch:.12,flashlightOn:true},motion:{time:chapterTime,world:false,cover:0,blocking:{chapter,progress:.5,camera:[2,1.58,-6],look:[100,100,100],travel:.5,exit:1,inCar:false,menVisible:true},actors:{mike:{moving:false},clarence:{position:[-.6,0,-8],yaw:0,phase:0,mode:'standing'},stanley:{position:[.6,0,-9],yaw:0,phase:0,mode:'standing'}}}};
    if(chapter==='redroom')frame.motion.blocking.camera=[1,1.58,2];
    view.render(frame);return view.diagnostics();
  }
  let d=draw('walk',1);assert.equal(d.camera.yaw,.42);assert.equal(d.flashlight,true);assert.equal(scene.getObjectByName('Ten second red room').visible,false);
  d=draw('undead',1);assert.ok(d.actors.every(a=>a.corpse));
  d=draw('redroom',4);assert.equal(d.environment,'red room');assert.deepEqual(d.roomContents,['projector','original abstract face projection']);assert.equal(scene.getObjectByName('Ten second red room').visible,true);assert.equal(d.camera.pitch,.12);
  d=draw('liquid',2);assert.ok(d.liquidMaterials>10);assert.equal(scene.getObjectByName('Ten second red room').visible,false);
  d=draw('rupture',5);assert.ok(d.actors.every(a=>a.pose==='limp'));assert.ok(scene.getObjectByName('Prologue Clarence').position.y>.4);assert.equal(d.binaryFragments,0);
  d=draw('rupture',7,true);assert.equal(d.binaryFragments,96);assert.ok(d.actors.every(a=>a.dissolve>0));assert.equal(d.vision.lightning,0);
  d=draw('rupture',10);assert.equal(d.menVisible,false);assert.equal(d.binaryFragments,0);
  assert.equal(material.onBeforeCompile,priorHook);assert.equal(material.userData.prologueLiquid,undefined);
  view.release();assert.equal(borrowedDisposed,0);view.dispose();geometry.dispose();material.dispose();assert.equal(borrowedDisposed,2);
});

test('equipment overlay shows a held radio and liquid gun/skin without touching the gameplay rig or clearing world depth',()=>{
  const originalParent=new THREE.Group(),gun=new THREE.Group();originalParent.add(gun);
  const grip=new THREE.Group(),right=new THREE.Group();right.name='RightArm';grip.position.set(.2,-.22,-.275);grip.add(right);gun.add(grip);
  const skin=new THREE.Mesh(new THREE.BoxGeometry(.08,.12,.14),new THREE.MeshStandardMaterial({color:0x9b7861})),weapon=new THREE.Mesh(new THREE.BoxGeometry(.1,.15,.3),new THREE.MeshStandardMaterial({color:0x293a38}));
  skin.name='Test skin';weapon.name='PistolBody';right.add(skin);grip.add(weapon);
  const muzzle=new THREE.Group();muzzle.name='Muzzle burst';const burstLight=new THREE.PointLight(0xff0000,9);muzzle.add(burstLight);gun.add(muzzle);
  let clears=0,draws=0,lastScene;const renderer={autoClear:true,info:{autoReset:true},clearDepth(){clears++;},render(scene,camera){assert.equal(this.autoClear,false);assert.equal(this.info.autoReset,false);lastScene=scene;draws++;}};
  const storyCamera=new THREE.PerspectiveCamera(65,1.7,.035,175);storyCamera.position.set(90,1.58,-4);storyCamera.rotation.set(.2,.7,0);const matrix=storyCamera.matrix.clone();
  const equipment=createPrologueEquipment(renderer,{gun,skinMaterial:skin.material});
  const frame={chapter:'car',time:1,chapterTime:1,chapterProgress:.5};equipment.render(storyCamera,frame);assert.equal(draws,0);
  equipment.render(storyCamera,{...frame,chapter:'dispatch'});assert.equal(equipment.stats.kind,'radio');assert.ok(lastScene.getObjectByName('Handheld dispatch radio'));
  assert.equal(lastScene.getObjectByName('Muzzle burst'),undefined);
  const heldRadio=lastScene.getObjectByName('Story hand and radio');assert.equal(heldRadio.visible,true);assert.equal(heldRadio.getObjectByName('PistolBody').visible,false);assert.equal(heldRadio.getObjectByName('Test skin').visible,true);
  equipment.render(storyCamera,{...frame,chapter:'liquid',chapterTime:2});assert.equal(equipment.stats.kind,'gun');assert.equal(equipment.stats.liquid,1);
  const lowReady=lastScene.getObjectByName('Story low-ready pistol');
  for(const name of ['Test skin','PistolBody'])assert.equal(lowReady.getObjectByName(name).material.userData.prologueLiquid.amount.value,1);
  assert.equal(skin.material.userData.prologueLiquid,undefined);assert.equal(weapon.material.userData.prologueLiquid,undefined);assert.equal(gun.parent,originalParent);assert.equal(burstLight.intensity,9);assert.deepEqual(storyCamera.matrix,matrix);assert.equal(clears,0);
  equipment.render(storyCamera,{...frame,chapter:'walk'});assert.equal(lowReady.getObjectByName('Test skin').material.userData.prologueLiquid.amount.value,0);
  equipment.render(storyCamera,{...frame,chapter:'rupture',chapterTime:12});assert.equal(equipment.stats.active,false);
  renderer.render=()=>{throw new Error('overlay context failure');};assert.throws(()=>equipment.render(storyCamera,{...frame,chapter:'walk'}),/overlay context failure/);assert.equal(renderer.autoClear,true);assert.equal(renderer.info.autoReset,true);
  let borrowedDisposed=0;for(const mesh of [skin,weapon]){mesh.geometry.addEventListener('dispose',()=>borrowedDisposed++);mesh.material.addEventListener('dispose',()=>borrowedDisposed++);}
  equipment.release();assert.equal(equipment.stats.meshes,0);assert.equal(equipment.stats.active,false);assert.equal(borrowedDisposed,0);
  renderer.render=()=>{};equipment.render(storyCamera,{...frame,chapter:'dispatch'});assert.equal(equipment.stats.kind,'radio');assert.ok(equipment.stats.meshes>0);
  equipment.dispose();assert.equal(borrowedDisposed,0);for(const mesh of [skin,weapon]){mesh.geometry.dispose();mesh.material.dispose();}assert.equal(borrowedDisposed,4);
});
