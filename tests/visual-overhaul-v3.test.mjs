import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import * as T from 'three';
import {load} from '../scripts/load-glb-cpu.mjs';
import {installHands} from '../src/hands.js';
import {createPrologueEquipment} from '../src/scene.js';
import {createEntertainmentRadio} from '../src/prologue-cabin.js';
import {samplePrologueBodyReach} from '../src/viewmodel-pose.js';
import {createPrologueTimeline} from '../src/prologue-script.js';
import {prologueFrame} from '../src/prologue.js';
import {PROLOGUE_OPENING,prologueRadioOffTime,samplePrologueWake} from '../src/prologue-performance.js';
import {ROADSIDE_HOLLOWS,wetGroundHeight,wetGroundContact,wetGroundGeometry,createGroundedPuddles,applyEnvironmentSurface} from '../src/environment-materials.js';
import {createRoadsideDog,ROADSIDE_DOG} from '../src/roadside-dog.js';
import {collectRuntimeFiles} from '../scripts/build.mjs';
const hash=b=>createHash('sha256').update(b).digest('hex');
const loader={loadAsync:url=>load(new URL(url))};
const source=JSON.parse(await readFile(new URL('./fixtures/visual-overhaul-v3-public-source.json',import.meta.url)));

test('v3 preserves all 388 public protected source, dependency, weapon, projector, cast and voice bytes',async()=>{
 assert.equal(source.protectedFiles.length,388);assert.equal(new Set(source.protectedFiles.map(x=>x.path)).size,388);
 for(const item of source.protectedFiles)assert.equal(hash(await readFile(new URL('../'+item.path,import.meta.url))),item.sha256,item.path);
});
test('v3 music is a real longer bounded excerpt and one timeline cue owns all three stop actions',async()=>{
 const timeline=createPrologueTimeline(),car0=timeline.lines.find(l=>l.id==='CAR-00'),car1=timeline.lines.find(l=>l.id==='CAR-01');
 assert.equal(car0.start,14);assert.equal(car0.text,'Clarence, I gotta tell you something.');assert.equal(car0.audioMode,'subtitle-only');assert.equal(timeline.cues.find(([id])=>id==='entertainment_off')[1],car1.start);
 for(const durations of [{},{'CAR-00':8}]){const t=createPrologueTimeline({durations}),cut=t.lines.find(l=>l.id==='CAR-01').start;for(const delta of [-.01,0,.01]){const frame=prologueFrame(cut+delta,{timeline:t});assert.equal(frame.radioOffAt,cut);assert.equal(frame.wake.radioOn,delta<0);assert.equal(samplePrologueWake(frame).reach,1);assert.equal(prologueRadioOffTime(frame),cut);}}
 const bytes=await readFile(new URL('../assets/audio/prologue/entertainment-music.mp3',import.meta.url)),m=JSON.parse(await readFile(new URL('../assets/audio/prologue/sources.json',import.meta.url))).humanRoadsideV2.newMusic;assert.equal(hash(bytes),m.sha256);assert(bytes.length>50512&&bytes.length<=PROLOGUE_OPENING.musicByteCap);assert.equal(m.decodedDurationSeconds,20);assert(m.decodedDurationSeconds>car1.start);assert.equal(m.sourceSha256,'a7d0b772f05b99c4ac3df28cb2feaa5190781c2b87bceef5052cc45408b6fc75');
});
test('all new human skin weights remain finite, non-negative, normalized and bounded',async()=>{
 for(const name of ['assets/intro/mike-body.glb','assets/intro/cast-clarence.glb','assets/field/player-arms.glb']){
  const gltf=await load(new URL('../'+name,import.meta.url));gltf.scene.traverse(mesh=>{if(!mesh.isSkinnedMesh)return;const w=mesh.geometry.attributes.skinWeight;for(let i=0;i<w.count;i++){let sum=0;for(let c=0;c<4;c++){const v=w.getComponent(i,c);assert(Number.isFinite(v)&&v>=0&&v<=1,name);sum+=v;}assert(Math.abs(sum-1)<2e-7,`${name} weight sum ${sum}`);}});
 }
});
function points(mesh){mesh.updateWorldMatrix(true,false);mesh.skeleton?.update();return Array.from({length:mesh.geometry.attributes.position.count},(_,i)=>mesh.getVertexPosition(i,new T.Vector3()).applyMatrix4(mesh.matrixWorld));}
function triangles(mesh,clothOnly=false){const p=points(mesh),i=mesh.geometry.index,c=mesh.geometry.attributes.color,result=[];for(let n=0;n<i.count;n+=3){const ids=[i.getX(n),i.getX(n+1),i.getX(n+2)];if(clothOnly&&(!c||ids.some(id=>c.getX(id)>.1)))continue;const v=ids.map(id=>p[id]),normal=v[1].clone().sub(v[0]).cross(v[2].clone().sub(v[0]));if(normal.lengthSq()<1e-14)continue;normal.normalize();result.push({v,normal,box:new T.Box3().setFromPoints(v)});}return result;}
function strictCross(a,b){if(!a.box.intersectsBox(b.box))return false;for(const [plane,tri]of[[a,b],[b,a]]){const d=tri.v.map(p=>p.clone().sub(plane.v[0]).dot(plane.normal));if(Math.min(...d)>=-1e-5||Math.max(...d)<=1e-5)continue;for(let k=0;k<3;k++){const j=(k+1)%3;if(d[k]*d[j]>=-1e-10)continue;const p=tri.v[k].clone().lerp(tri.v[j],d[k]/(d[k]-d[j])),bc=new T.Vector3();T.Triangle.getBarycoord(p,...plane.v,bc);if(Math.min(bc.x,bc.y,bc.z)>1e-4)return true;}}return false;}
async function equipmentFixture(){
 const gun=new T.Group(),knife=new T.Group(),torch=new T.Group(),hands=installHands({gun,knife,torch,placeholders:[],loader});await hands.ready;assert.equal(hands.stats.status,'ready');let scene;const equipment=createPrologueEquipment({autoClear:true,info:{autoReset:true},render:s=>scene=s},{gun,torch,bodyLoader:loader,radioLoader:loader});const camera=new T.PerspectiveCamera(65,16/9,.035,175),radio=createEntertainmentRadio(),identity=new T.Matrix4().elements;radio.group.updateMatrixWorld(true);const target=radio.contact.getWorldPosition(new T.Vector3());
 const draw=(reach=1,yaw=0,pitch=.5)=>{camera.position.set(.5,1.13,.35).add(new T.Vector3(...samplePrologueBodyReach(reach).eyeOffset));camera.rotation.set(pitch,yaw,0,'YXZ');equipment.render(camera,{chapter:'car',radioHandReach:reach,radioHandTurn:.6,radioHandTarget:target.toArray(),cabinMatrix:identity,locationMatrix:identity,time:17,player:{}});scene.updateMatrixWorld(true);return scene;};draw();await new Promise(r=>setTimeout(r,50));draw();assert.equal(equipment.stats.body.status,'ready');return{gun,draw,dispose(){equipment.dispose();hands.dispose();}};
}
test('actual animated forearm triangles do not cross the fitted undershirt through the full radio reach',async()=>{
 const f=await equipmentFixture();try{for(const reach of [.05,.25,.5,.75,1])for(const yaw of[-1.4,0,1.4]){const scene=f.draw(reach,yaw),body=scene.getObjectByName('Mike body anchor'),shirt=body.getObjectByName('shirt'),arm=scene.getObjectByName('Story hand on passenger door').getObjectByName('RightArm'),cloth=triangles(shirt,true);let skin=[];arm.traverse(o=>{if(o.isSkinnedMesh)skin.push(...triangles(o));});let intersections=0;for(const a of cloth)for(const b of skin)if(strictCross(a,b))intersections++;assert.equal(intersections,0,`signed triangle crossing reach=${reach}, yaw=${yaw}`);}}finally{f.dispose();}
});
test('Mike keeps both anatomical hands at rest and exchanges only the active right hand during reach',async()=>{
 const f=await equipmentFixture();try{let scene=f.draw(0);for(const side of ['R','L']){const root=scene.getObjectByName('Mike resting '+side+' anatomical hand and forearm');assert(root?.visible);let surfaces=0;root.traverse(o=>{if(o.isSkinnedMesh){surfaces++;assert(points(o).every(p=>p.toArray().every(Number.isFinite)));}});assert.equal(surfaces,1);}scene=f.draw(1);assert.equal(scene.getObjectByName('Mike resting R anatomical hand and forearm').visible,false);assert.equal(scene.getObjectByName('Mike resting L anatomical hand and forearm').visible,true);}finally{f.dispose();}
});
test('canonical forearm caps close both cropped rims and gameplay endpoints stay below the view',async()=>{
 const gltf=await load(new URL('../assets/field/player-arms.glb',import.meta.url));assert.equal(gltf.asset.extras.elbowCapsClosed,true);gltf.scene.updateMatrixWorld(true);
 for(const name of ['RightArm','LeftArm']){const arm=gltf.scene.getObjectByName(name);assert.equal(arm.userData.anatomicalForearmV3,true);arm.traverse(mesh=>{if(!mesh.isSkinnedMesh)return;const p=points(mesh),index=mesh.geometry.index,keys=p.map(v=>v.toArray().map(x=>Math.round(x*1e5)).join(',')),edges=new Map();for(let i=0;i<index.count;i+=3)for(const [a,b]of[[index.getX(i),index.getX(i+1)],[index.getX(i+1),index.getX(i+2)],[index.getX(i+2),index.getX(i)]]){const key=[keys[a],keys[b]].sort().join('|'),e=edges.get(key)||{count:0,a,b};e.count++;edges.set(key,e);}const open=[...edges.values()].filter(e=>e.count===1&&p[e.a].z>.18&&p[e.b].z>.18);assert.equal(open.length,0,name+' has no open cropped elbow boundary');});}
 const gun=new T.Group(),knife=new T.Group(),torch=new T.Group(),hands=installHands({gun,knife,torch,placeholders:[],loader});await hands.ready;gun.updateMatrixWorld(true);let maxY=-Infinity;const arm=gun.getObjectByName('RightArm');arm.traverse(o=>{if(o.isSkinnedMesh){const p=points(o);for(const q of p)if(q.z>-.12)maxY=Math.max(maxY,q.y);}});assert(maxY<-.25,'elbow end routes toward lower screen rather than becoming a horizontal spike');hands.dispose();
});
test('every water-bank boundary shares the actual terrain height and wetness mask',()=>{
 const ground=wetGroundGeometry();for(let i=0;i<ground.attributes.position.count;i++){const p=new T.Vector3().fromBufferAttribute(ground.attributes.position,i);assert(Math.abs(p.y-wetGroundHeight(p.x,p.z))<2e-6);}const mat=new T.MeshStandardMaterial(),group=createGroundedPuddles(mat);assert.equal(group.children.length,ROADSIDE_HOLLOWS.length);
 for(const water of group.children){const p=water.geometry.attributes.position;for(let i=1;i<p.count;i++){const x=p.getX(i),y=p.getY(i),z=p.getZ(i);assert(Math.abs(y-.001-wetGroundHeight(x,z))<2e-6,'water edge touches bank; no floating plane');assert(wetGroundContact(x,z).wetness>.2);}water.geometry.dispose();}ground.dispose();mat.dispose();
 const material=new T.MeshStandardMaterial();applyEnvironmentSurface(material,{terrainProfile:true});const shader={uniforms:{},vertexShader:T.ShaderLib.standard.vertexShader,fragmentShader:T.ShaderLib.standard.fragmentShader};material.onBeforeCompile(shader);assert.match(shader.fragmentShader,/terrainWetness/);assert.equal((shader.fragmentShader.match(/float hr=/g)||[]).length,ROADSIDE_HOLLOWS.length);material.dispose();
});
test('house windows are recessed real apertures and remain within approved topology/draw budgets',async()=>{
 const gltf=await load(new URL('../assets/intro/roadside-set.glb',import.meta.url));assert.equal(gltf.asset.extras.litWindows,4);gltf.scene.updateMatrixWorld(true);for(const [z,y]of[[5.20,1.80],[9.25,1.80],[5.20,3.89],[9.25,3.89]]){const hits=new T.Raycaster(new T.Vector3(5,y,z),new T.Vector3(1,0,0),0,3).intersectObject(gltf.scene,true);assert(hits.length);assert.match(hits[0].object.name,/Warm_recessed_house_window_glass/);assert(hits[0].point.x>7.32,'window glass is behind the front facade');}
});
test('dog animation keeps all paw/body vertices planted and its tether bounded across phases',async()=>{
 const parent=new T.Group(),dog=createRoadsideDog(parent,{heightAt:wetGroundHeight});dog.accept(await load(new URL('../assets/intro/roadside-dog-v1.glb',import.meta.url)));dog.update({chapter:'walk',time:0});parent.updateMatrixWorld(true);const body=dog.root.getObjectByName('DogBody'),before=points(body);for(let time=0;time<20;time+=.1){dog.update({chapter:'walk',time});parent.updateMatrixWorld(true);points(body).forEach((p,i)=>assert(p.distanceTo(before[i])<1e-8));assert(dog.stats.tetherLength<ROADSIDE_DOG.tetherLength);assert(dog.stats.barkMotion>=0&&dog.stats.barkMotion<=1);}dog.update({chapter:'redroom',time:30},false);assert.equal(dog.stats.visible,false);dog.dispose();dog.dispose();assert.equal(parent.children.length,0);
});
test('total changed runtime payload stays below the approved ten MiB growth cap',async()=>{
 const files=await collectRuntimeFiles(),baseline=new Map(source.baselineManifest.map(x=>[x.path,x.bytes]));let increase=0;for(const [name,bytes]of files)if(!name.startsWith('vendor/'))increase+=Math.max(0,bytes.length-(baseline.get(name)||0));assert(increase<=10*1024*1024,`${increase} bytes`);
});
test('shared hollow wetness follows the rotated translated prologue stage rather than unrelated world coordinates',async()=>{
 const {createPrologueVisuals}=await import('../src/prologue-visuals.js'),{rendererStub}=await import('./helpers/foliage-motion-cpu.mjs');let scene;const view=createPrologueVisuals(rendererStub(s=>scene=s),{spawn:{x:23,z:-7,yaw:.8}});view.render({chapter:'walk',time:40,chapterProgress:.5});const ground=scene.getObjectByName('Continuous graded mud, verge and shallow hollows'),shader={uniforms:{},vertexShader:T.ShaderLib.standard.vertexShader,fragmentShader:T.ShaderLib.standard.fragmentShader};ground.material.onBeforeCompile(shader);const fromWorld=shader.uniforms.environmentTerrainFromWorld.value;assert(!fromWorld.equals(new T.Matrix4()));for(const h of ROADSIDE_HOLLOWS){const source=new T.Vector3(h.x,wetGroundHeight(h.x,h.z),h.z),world=ground.localToWorld(source.clone()),restored=world.applyMatrix4(fromWorld);assert(restored.distanceTo(source)<1e-10);assert.equal(wetGroundContact(restored.x,restored.z).wetness,1);}view.dispose();
});

test('approved bark bytes and shared recorded jaw phase are retained in the runtime package',async()=>{
 const bytes=await readFile(new URL('../assets/audio/prologue/roadside-dog-bark.wav',import.meta.url));assert.equal(hash(bytes),'bbd0f908b3514dd3bd7d2bc04dcf64f8d360a161e7f43cac5d6761e7add79451');assert.equal(bytes.length,179848);assert(bytes.length<=256*1024);assert.equal(bytes.toString('ascii',0,4),'RIFF');
 const files=await collectRuntimeFiles();assert.equal(hash(files.get('assets/audio/prologue/roadside-dog-bark.wav')),hash(bytes));
 const {roadsideDogPose,ROADSIDE_DOG_SOUND}=await import('../src/roadside-dog.js');assert.equal(ROADSIDE_DOG_SOUND.durationSeconds,89902/44100);for(const time of [94.01,94.54,95.16,95.72]){const pose=roadsideDogPose({chapter:'walk',time});assert(pose.soundWindow&&pose.bark>.2);assert(pose.jaw<0);}assert.equal(roadsideDogPose({chapter:'walk',time:97}).bark,0);assert.equal(roadsideDogPose({chapter:'redroom',time:94.01}).soundWindow,false);
});
