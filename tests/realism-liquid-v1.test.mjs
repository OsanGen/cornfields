import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import * as T from 'three';
import {createOpening} from '../src/opening.js';
import {createPrologueTimeline,PROLOGUE_AUDIO_LINES} from '../src/prologue-script.js';
import {PROLOGUE_VOICE_TIMING} from '../src/prologue-voice-timing.js';
import {sampleRealismSequence,REALISM_SEQUENCE} from '../src/prologue-return-sequence.js';
import {sampleRoomTransition} from '../src/prologue-liquid-transition.js';
import {followApproachTarget,WEST_APPROACH} from '../src/prologue-layout.js';
import {createRoadsideDog,roadsideDogPose,ROADSIDE_DOG} from '../src/roadside-dog.js';
import {load} from '../scripts/load-glb-cpu.mjs';
import {createPrologueAssets} from '../src/prologue-assets.js';
import {runtimeAssets} from '../scripts/build.mjs';
const hash=v=>createHash('sha256').update(v).digest('hex');
const timeline=createPrologueTimeline({durations:PROLOGUE_VOICE_TIMING});
function controls(opening){const s=opening.snapshot().story,p=s.player;if(s.waitingForExit)return{interact:true};if(opening.stage!=='prologue'||!opening.frame().canMove)return{};const a=followApproachTarget(p,s.escorts),dx=a.x-p.x,dz=a.z-p.z;return Math.hypot(dx,dz)>.28?{forward:1,yaw:Math.atan2(-dx,-dz)}:{};}
function runUntil(opening,stop){for(let n=0;n<12000&&!stop();n++)opening.tick(.05,controls(opening));assert(stop(),'bounded deterministic control driver reaches target');}

test('approved order is rise/world liquid, existing titles, solid return, gun, reaction, projector once',()=>{
 const o=createOpening(),events=[],seen=[];o.begin();let old=null;
 for(let n=0;n<10000&&o.phase!=='ready';n++){const f=o.frame(),key=o.stage==='credits'?'credits':f.chapter;if(key!==old){seen.push(key);old=key;}o.tick(.05,controls(o));}
 assert.equal(o.phase,'ready');assert.deepEqual(seen.slice(-6),['rupture','credits','solid_return','gun_recovery','reaction','redroom']);
 assert.equal(o.snapshot().credits.time,20);assert.equal(o.snapshot().story.fired.filter(x=>x==='redroom').length,1);
 assert.equal(timeline.lines.filter(l=>l.id==='END-01').length,1);assert(!timeline.lines.some(l=>l.id==='RET-01'));
 assert.equal(o.player.x,WEST_APPROACH.thresholdX);assert.equal(o.player.z,WEST_APPROACH.centerZ);
 o.dispose();
});

test('titles pause exactly at full liquid; resume does not consume story time or repeat titles',()=>{
 const o=createOpening();o.begin();runUntil(o,()=>o.stage==='credits');const at=o.snapshot().time;assert.equal(at,o.snapshot().titlesAt);assert.equal(sampleRealismSequence({chapter:'rupture',chapterTime:12}).cover,1);
 o.tick(9);o.pause();const paused=o.snapshot();o.tick(90);assert.deepEqual(o.snapshot(),paused);o.resume();o.tick(20-o.snapshot().credits.time);assert.equal(o.stage,'prologue');assert.equal(o.snapshot().time,at);assert.equal(o.frame().chapter,'solid_return');assert.equal(sampleRealismSequence(o.frame()).cover,1);
 o.skipStory();assert.equal(o.phase,'ready');assert.equal(o.snapshot().credits.time,20);o.dispose();
});

test('rise, world deformation, coverage and recovery are continuous and low-motion retains story information',()=>{
 for(const reduced of [false,true]){
  const a=t=>sampleRealismSequence({chapter:'rupture',chapterTime:t,reduced});assert.equal(a(0).bodyLiquid,0);assert(a(2).bodyLiquid>0);assert.equal(a(2).worldLiquid,0);assert.equal(a(7).worldLiquid,1);assert.equal(a(11.35).cover,1);
  assert(a(3.3).lift>0);assert(a(3.3).lift<=(reduced?.30:.90));let previous=a(0);
  for(let t=.01;t<12;t+=.01){const current=a(t);assert(Math.abs(current.lift-previous.lift)<.01);assert(Math.abs(current.cover-previous.cover)<.02);previous=current;}
  const returnEnd=sampleRealismSequence({chapter:'solid_return',chapterTime:4,reduced});assert.equal(returnEnd.worldLiquid,0);assert.equal(returnEnd.bodyLiquid,0);assert.equal(returnEnd.cover,0);assert.equal(returnEnd.lift,0);
 }
 for(const t of [1.2,2,2.99])assert(sampleRealismSequence({chapter:'gun_recovery',chapterTime:t}).gun.rest);
 assert(sampleRealismSequence({chapter:'gun_recovery',chapterTime:3}).gun.contact);assert(sampleRealismSequence({chapter:'gun_recovery',chapterTime:5.8}).gun.settled);
 assert.equal(REALISM_SEQUENCE.projector,12.4);for(const t of [.6,11.8])assert.equal(sampleRoomTransition({chapter:'redroom',chapterTime:t}).cover,1);
});

test('cinematic action freezes position, view input and flashlight while pause, skip and replay stay deterministic',()=>{
 const o=createOpening();o.begin();runUntil(o,()=>o.frame().chapter==='gun_recovery');const before={...o.player};o.tick(.8,{forward:1,strafe:1,yaw:9,pitch:1,fire:true,interact:true,flashlight:true});for(const k of ['x','z','yaw','pitch','flashlightOn'])assert.equal(o.player[k],before[k],k);
 o.pause();const held=o.snapshot();o.tick(60);assert.deepEqual(o.snapshot(),held);o.resume();o.skip();assert.equal(o.phase,'ready');assert.equal(o.snapshot().skipped,true);o.finish();o.begin({replay:true});assert.equal(o.snapshot().time,0);assert.equal(o.snapshot().titlesPlayed,false);assert.equal(o.stage,'prologue');o.dispose();
});

test('original dog and tree GLBs embed bounded maps and no external resource references',()=>{
 for(const [file,triCap,drawCap,byteCap]of [['roadside-dog-v2.glb',35000,12,2*1024*1024],['background-trees-v1.glb',10000,6,1024*1024]]){
  const raw=readFileSync(new URL('../assets/intro/'+file,import.meta.url)),j=JSON.parse(raw.subarray(20,20+raw.readUInt32LE(12)));assert.equal(raw.readUInt32LE(8),raw.length);assert(raw.length<=byteCap);assert(j.images.length>=1);
  for(const image of j.images){assert.equal(image.uri,undefined);assert(Number.isInteger(image.bufferView));}
  assert(j.meshes.reduce((sum,m)=>sum+m.primitives.reduce((n,p)=>n+j.accessors[p.indices].count/3,0),0)<=triCap);
  assert(j.meshes.reduce((sum,m)=>sum+m.primitives.length,0)<=drawCap);assert(!j.extensionsUsed?.includes('KHR_lights_punctual'));assert(runtimeAssets.includes('assets/intro/'+file));
 }
});

test('dog body effort is distinct from grounded paws and the unchanged bark drives every jaw beat',async()=>{
 const root=new T.Group(),dog=createRoadsideDog(root);dog.accept(await load('assets/intro/roadside-dog-v2.glb'));dog.update({chapter:'walk',time:.05});assert.equal(dog.stats.status,'ready');assert(dog.stats.bodyEffort>0);assert.equal(dog.stats.pawDisplacement,0);assert(dog.stats.tetherLength<ROADSIDE_DOG.tetherLength);
 const mesh=dog.root.getObjectByName('DogChest'),shader={uniforms:{},vertexShader:T.ShaderLib.standard.vertexShader,fragmentShader:T.ShaderLib.standard.fragmentShader};mesh.material.onBeforeCompile(shader);assert.match(shader.vertexShader,/smoothstep\(.13,.58,dogHeight\)/);assert(shader.uniforms.dogEffort.value>0);
 for(const time of [94.01,94.54,95.16,95.72]){const p=roadsideDogPose({chapter:'walk',time});assert(p.bark>.2);assert(p.jaw>0,'new forward +Z model lowers its jaw with positive X rotation');}
 assert.equal(hash(readFileSync('assets/audio/prologue/roadside-dog-bark.wav')),'bbd0f908b3514dd3bd7d2bc04dcf64f8d360a161e7f43cac5d6761e7add79451');dog.dispose();assert.equal(root.children.length,0);
});

test('late original tree and dog arrivals cannot repopulate a released scene',async()=>{
 const pending=[],accepted=[];let disposed=0;const owner=createPrologueAssets({onTrees:g=>accepted.push(g),onDog:g=>accepted.push(g),gltfLoader:{loadAsync:url=>/background-trees|roadside-dog/.test(url)?new Promise(resolve=>pending.push(resolve)):Promise.resolve({scene:new T.Group()})},textureLoader:{loadAsync:async()=>new T.Texture()}});
 owner.dispose();for(const resolve of pending){const mesh=new T.Mesh(new T.BoxGeometry(),new T.MeshStandardMaterial());mesh.geometry.addEventListener('dispose',()=>disposed++);resolve({scene:new T.Group().add(mesh)});}await new Promise(r=>setImmediate(r));assert.deepEqual(accepted,[]);assert.equal(disposed,2);
});

test('reactive line is available once while preserved projector pleas and audio remain bounded',()=>{
 const reaction=timeline.lines.find(l=>l.id==='END-01');assert.equal(reaction.chapter,'reaction');assert(reaction.start>=timeline.chapters.find(c=>c.id==='gun_recovery').end);assert(reaction.end<timeline.chapters.find(c=>c.id==='redroom').start);
 assert.equal(PROLOGUE_AUDIO_LINES.filter(l=>l.id==='END-01').length,1);assert.deepEqual(timeline.lines.filter(l=>l.chapter==='redroom').map(l=>l.text),['Help me.',"I'm trapped here.",'Free me.']);
});

test('actual cloned gun contacts the ground and re-grips with continuous body arms and planted feet',async()=>{
 const {installHands}=await import('../src/hands.js'),{createPrologueEquipment}=await import('../src/scene.js');
 const loader={loadAsync:url=>load(new URL(url))},gun=new T.Group(),torch=new T.Group(),hands=installHands({gun,torch,knife:new T.Group(),placeholders:[],loader});await hands.ready;assert.equal(hands.stats.status,'ready');
 const source=gun.getObjectByName('ServicePistol'),sourceTransform=source.matrix.clone();let overlay;
 const equipment=createPrologueEquipment({autoClear:true,info:{autoReset:true},render:s=>overlay=s},{gun,torch,bodyLoader:loader,radioLoader:loader}),camera=new T.PerspectiveCamera(70,16/9,.035,175);
 const draw=t=>{const frame={chapter:'gun_recovery',chapterTime:t,time:180+t,elapsed:180+t,player:{x:0,y:1.58,z:0,yaw:0,pitch:0,flashlightOn:true},locationMatrix:new T.Matrix4().elements,cabinMatrix:new T.Matrix4().elements,exitProgress:1,motion:{blocking:{inCar:false},actors:{mike:{phase:0,support:{time:180+t,moving:false,gait:0,grounded:true,distance:0}}}}};const sequence=sampleRealismSequence(frame);camera.position.set(0,1.58-sequence.crouch*.82,0);camera.rotation.set(sequence.cameraPitch,0,0,'YXZ');camera.updateMatrixWorld(true);equipment.render(camera,frame);overlay.updateMatrixWorld(true);};
 try{draw(0);await new Promise(r=>setTimeout(r,80));
  for(let t=0;t<=5.81;t+=.1){draw(t);const state=equipment.stats,weapon=overlay.getObjectByName('Story low-ready pistol').getObjectByName('ServicePistol');assert.equal(state.recovery.weaponObjects,1);assert.notEqual(weapon,source);assert.equal(state.recovery.inventoryMutation,false);
   assert(state.body.armContacts.R.error<.03,'actual wrist reaches the gun hand without stretching or a disconnected gap');for(const foot of state.body.recoveryFeet||[])assert(foot.error<.005,'same planted feet during the crouch');
   if(t>1.10&&t<3){let bottom=Infinity;weapon.traverse(mesh=>{if(!mesh.isMesh||!mesh.visible)return;const p=mesh.geometry.attributes.position;for(let i=0;i<p.count;i++)bottom=Math.min(bottom,new T.Vector3().fromBufferAttribute(p,i).applyMatrix4(mesh.matrixWorld).applyMatrix4(camera.matrixWorld).y);});assert(Math.abs(bottom-.008)<1e-5,'actual rendered gun vertices meet ground clearance');}
   if(t>=3)assert.equal(state.recovery.gripError,0,'same source attachment restored at contact');
  }
  assert(source.matrix.equals(sourceTransform),'live gameplay weapon transform is untouched');
 }finally{equipment.dispose();hands.dispose();}
});

test('moved projector retains its existing central-hold walking and free look, then restores the exact field pose',()=>{
 const o=createOpening();o.begin();runUntil(o,()=>o.frame().chapter==='reaction');const outdoors={...o.player};runUntil(o,()=>o.frame().chapter==='redroom'&&o.frame().chapterTime>=1.3);assert.equal(o.frame().canMove,true);
 o.tick(.5,{strafe:1,yaw:0,pitch:.4});assert(o.player.x>0);assert.equal(o.player.pitch,.4);o.pause();const held=o.snapshot();o.tick(40,{forward:1});assert.deepEqual(o.snapshot(),held);o.resume();
 runUntil(o,()=>o.phase==='ready');for(const key of ['x','y','z','yaw','pitch','flashlightOn'])assert.equal(o.player[key],outdoors[key],key);assert.equal(o.snapshot().story.fired.filter(x=>x==='redroom').length,1);o.dispose();
});

test('short reaction matches exact public audio bytes and measured timing with retained provenance',()=>{
 const expected='2f437ea51a38f510d241105359fc27ceb336517ad868e62f63090a5a4ecf2a38',runtime=readFileSync('assets/audio/prologue/END-01.mp3'),evidence=JSON.parse(readFileSync(new URL('./fixtures/cornfields-public-integration-p1.json',import.meta.url))).audio;assert.equal(hash(runtime),expected);assert.equal(evidence.sha256,expected);assert.equal(evidence.path,'assets/audio/prologue/END-01.mp3');assert.equal(runtime.length,9644);assert.equal(evidence.bytes,runtime.length);assert.equal(evidence.sampleFrames,26977);assert.equal(evidence.sampleRate,24000);assert.equal(evidence.decodedDurationSeconds,26977/24000);assert.equal(evidence.legacyDurationSeconds,1.904);
 const provenance=JSON.parse(readFileSync('assets/audio/prologue/sources.json')).realismLiquidV1.end01;assert.equal(provenance.sourceFileRecord.sha256,'e28eebd99e4e28dd1f814da3fd0fa524353ccfe23e2faeb6a09e1fcbb5436072');assert.equal(evidence.baselineSha256,provenance.sourceFileRecord.sha256);assert.equal(provenance.sha256,expected);assert.equal(provenance.bytes,runtime.length);assert.equal(provenance.sampleFrames,evidence.sampleFrames);assert.equal(provenance.sampleRate,evidence.sampleRate);assert.equal(provenance.decodedDurationSeconds,evidence.decodedDurationSeconds);assert.equal(provenance.ownerListeningConfirmedAtUTC,undefined);assert.equal(provenance.ownerListeningScope,undefined);assert.equal(provenance.newSpendUSD,0);
 const line=timeline.lines.find(l=>l.id==='END-01');assert.equal(line.text,'Am I going crazy?');assert.equal(line.chapter,'reaction');assert.equal(PROLOGUE_VOICE_TIMING['END-01'].decodedDuration,26977/24000);assert.equal(PROLOGUE_VOICE_TIMING['END-01'].duration,1.904,'retain the separate legacy survival-arrival clock');assert(line.end-line.start>=PROLOGUE_VOICE_TIMING['END-01'].decodedDuration);assert(line.end-line.start<1.5,'new reaction captions use actual short-clip timing');assert.equal(timeline.lines.filter(l=>l.id==='END-01').length,1);
});

test('refined original dog retains the earlier bounds, grounded shader origin and exact collar anchor',async()=>{
 const gltf=await load('assets/intro/roadside-dog-v2.glb'),box=new T.Box3().setFromObject(gltf.scene),body=gltf.scene.getObjectByName('DogChest'),anchor=gltf.scene.getObjectByName('DogCollarTether');
 assert(box.min.x>=-.278&&box.max.x<=.278,'no wider dog footprint');assert(box.min.z>=-1.084&&box.max.z<=.963,'no longer dog footprint');assert(box.min.y>=0&&box.min.y<.01,'paws meet existing ground clearance');assert(box.max.y<=1.175,'original dog height envelope retained');
 assert(body?.isMesh);assert(Math.abs(body.position.y-.68)<1e-6,'existing grounded effort shader origin');assert(Math.abs(body.position.z+.01)<1e-6);
 assert.deepEqual(anchor.position.toArray().map(n=>+n.toFixed(3)),[-.18,.85,.5],'same collar contact in exported axes');
 const raw=readFileSync('assets/intro/roadside-dog-v2.glb'),j=JSON.parse(raw.subarray(20,20+raw.readUInt32LE(12)));
 assert(j.meshes.reduce((s,m)=>s+m.primitives.length,0)<=10,'no added dog material draws');assert(j.meshes.reduce((s,m)=>s+m.primitives.reduce((n,p)=>n+j.accessors[p.indices].count/3,0),0)<=31573,'no more dog triangles than the earlier candidate');assert(raw.length<=1701864,'no larger dog download than the earlier candidate');assert.equal(j.images.length,2);
 assert.equal(hash(readFileSync('assets/intro/background-trees-v1.glb')),'63c047ef575a596e15834ebd24aaad5b31080f8dbb6abe867bb95541f8cb986b','tree asset unchanged by the dog-only iteration');
});

test('bark effort owns only a torso material and cannot separate head coat from eyes or jaw',async()=>{
 const gltf=await load('assets/intro/roadside-dog-v2.glb'),body=gltf.scene.getObjectByName('DogChest'),headCoat=gltf.scene.getObjectByName('DogHeadSculpt'),shared=body.material;
 assert.equal(headCoat.material,shared,'fixture reproduces the shared source coat');
 // The CPU loader intentionally omits images. Synthetic maps exercise material
 // lifetime here; the existing GLB tests validate the actual embedded maps.
 shared.map=new T.Texture();shared.normalMap=new T.Texture();const parts=[];gltf.scene.traverse(o=>{if(o.isMesh)parts.push(o);});const beforeCount=parts.length,sharedCompile=shared.onBeforeCompile,sharedKey=shared.customProgramCacheKey();let originalDisposed=0,mapDisposed=0,cloneDisposed=0;shared.addEventListener('dispose',()=>originalDisposed++);shared.map.addEventListener('dispose',()=>mapDisposed++);
 const dog=createRoadsideDog(new T.Group());dog.accept(gltf);const owned=body.material;owned.addEventListener('dispose',()=>cloneDisposed++);assert.notEqual(owned,shared);assert.equal(owned.map,shared.map);assert.equal(owned.normalMap,shared.normalMap);
 assert.equal(headCoat.material,shared);assert.equal(shared.onBeforeCompile,sharedCompile);assert.equal(shared.customProgramCacheKey(),sharedKey);
 for(const part of parts.filter(o=>o!==body&&o.material===shared)){const shader={uniforms:{},vertexShader:T.ShaderLib.standard.vertexShader,fragmentShader:T.ShaderLib.standard.fragmentShader};part.material.onBeforeCompile(shader);assert.doesNotMatch(shader.vertexShader,/dogEffort|dogHeight/,part.name+' remains rigid in its own animated node');}
 const shader={uniforms:{},vertexShader:T.ShaderLib.standard.vertexShader,fragmentShader:T.ShaderLib.standard.fragmentShader};owned.onBeforeCompile(shader);assert.match(shader.vertexShader,/dogHeight=position.y\+0.68/);
 const head=gltf.scene.getObjectByName('DogHead'),home=head.position.clone();dog.update({chapter:'walk',time:94.54});const pose=roadsideDogPose({chapter:'walk',time:94.54});assert.equal(shader.uniforms.dogEffort.value,pose.chest);assert(Math.abs(head.position.y-home.y-pose.chest*.013)<1e-9);assert(Math.abs(head.position.z-home.z-pose.chest*.020)<1e-9);assert.equal(gltf.scene.getObjectByName('DogJaw').rotation.x,pose.jaw);assert.equal(dog.stats.pawDisplacement,0);
 let afterCount=0;gltf.scene.traverse(o=>{if(o.isMesh)afterCount++;});assert.equal(afterCount,beforeCount,'no additional render primitives');dog.dispose();dog.dispose();assert.equal(cloneDisposed,1);assert.equal(originalDisposed,0,'source material stays owned by the asset cache');assert.equal(mapDisposed,0,'shared coat maps stay owned by the asset cache');
});
