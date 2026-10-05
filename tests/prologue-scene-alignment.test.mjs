import nodeTest from 'node:test';import assert from 'node:assert/strict';import * as T from 'three';
import {load} from '../scripts/load-glb-cpu.mjs';import {prepareCruiser} from '../src/prologue-assets.js';import {createTexturedPrologueActor} from '../src/prologue-model-actor.js';
import {CABIN_FIT} from '../src/prologue-cabin.js';import {createPrologueVisuals} from '../src/prologue-visuals.js';
import {WEST_APPROACH,approachStageTransform,approachPoint,approachPathPosition,followApproachTarget} from '../src/prologue-layout.js';
import {cornInstanceEnvelope,parkedCruiserClearanceBox} from '../src/prologue-clearance.js';import {samplePrologueMotion,createPrologueContactTracker} from '../src/prologue-motion.js';
import {createPrologue} from '../src/prologue.js';import {samplePrologueExit} from '../src/prologue-performance.js';import {PROLOGUE_VOICE_TIMING} from '../src/prologue-voice-timing.js';import {createPrologueTimeline} from '../src/prologue-script.js';import {samplePrologueDriving} from '../src/prologue-driving.js';
for(const asset of ['cast.glb','cast-clarence.glb','cast-stanley.glb']){
const cast=await load('assets/intro/'+asset);
const test=(title,run)=>nodeTest(asset+': '+title,run);
function handPoints(actor,side,frame){const points=[];actor.root.traverse(mesh=>{if(!mesh.isSkinnedMesh)return;mesh.skeleton.update();const ids=mesh.geometry.attributes.skinIndex,w=mesh.geometry.attributes.skinWeight,bi=mesh.skeleton.bones.map((b,i)=>new RegExp(`^(hand${side}|f[12]${side})`).test(b.name)?i:-1).filter(i=>i>=0);for(let v=0;v<ids.count;v++){let weight=0;for(let k=0;k<4;k++)if(bi.includes(ids.getComponent(v,k)))weight+=w.getComponent(v,k);if(weight>.5)points.push(mesh.localToWorld(mesh.getVertexPosition(v,new T.Vector3())).applyMatrix4(frame));}});return points;}
const visible=o=>{for(let p=o;p;p=p.parent)if(!p.visible)return false;return true;};
const rimGap=p=>Math.abs(Math.hypot(Math.hypot(p.x,p.y)-CABIN_FIT.rimRadius,p.z)-CABIN_FIT.rimTube);

test('actual skinned palm/fingers contact the rendered rim throughout driving, steering and breath',async()=>{
  const car=prepareCruiser((await load('assets/intro/cruiser.glb')).scene),actor=createTexturedPrologueActor({gltf:cast}),stage=new T.Group(),chassis=new T.Group();stage.position.set(7,2,-9);stage.rotation.y=.72;stage.add(chassis);chassis.add(car.model,actor.root);actor.root.position.fromArray(CABIN_FIT.driverSeat);actor.root.rotation.y=CABIN_FIT.driverYaw;
  const timeline=createPrologueTimeline({durations:PROLOGUE_VOICE_TIMING}),chapter=timeline.chapters.find(c=>c.id==='dispatch');
  for(let i=0;i<=32;i++){
    const drive=samplePrologueDriving({chapter:'dispatch',chapterTime:i/32*(chapter.end-chapter.start)},{timeline});chassis.position.fromArray(drive.position);chassis.rotation.set(drive.bodyPitch,drive.yaw,drive.bodyRoll,'YXZ');car.update(drive);stage.updateMatrixWorld(true);actor.pose({mode:'drive',time:i*.21,steer:drive.steer,performance:{breath:Math.sin(i)*.018},wheelMatrix:car.steering.matrixWorld});stage.updateMatrixWorld(true);
    const inverse=car.steering.matrixWorld.clone().invert();
    for(const side of ['L','R']){const points=handPoints(actor,side,inverse),distances=points.map(rimGap).sort((a,b)=>a-b),contact=distances.filter(d=>d<.008).length,normal=points.map(p=>p.z);
      assert(points.length>700,'use actual shipped skinned surfaces, not wrist targets');assert(distances[Math.floor(distances.length/2)]<.016,`${side} median visible skin gap`);assert(distances[Math.floor(distances.length*.9)]<.025,`${side} 90th percentile skin gap`);assert(contact>150,`${side} substantial palm/finger surface contact`);assert(Math.min(...normal)<-.02&&Math.max(...normal)>.018,`${side} fingers/palm wrap around both sides of rim`);
    }
  }actor.dispose();
});

test('passenger sees the wheel above the actual dashboard, rather than embedded in it',async()=>{
  const car=prepareCruiser((await load('assets/intro/cruiser.glb')).scene),actor=createTexturedPrologueActor({gltf:cast}),stage=new T.Group();stage.add(car.model,actor.root);actor.root.position.fromArray(CABIN_FIT.driverSeat);actor.root.rotation.y=Math.PI;car.update({steer:0,wheelRoll:0});stage.updateMatrixWorld(true);actor.pose({mode:'drive',steer:0,wheelMatrix:car.steering.matrixWorld});stage.updateMatrixWorld(true);actor.root.traverse(o=>{if(o.isSkinnedMesh){o.skeleton.update();o.computeBoundingSphere();o.computeBoundingBox();}});
  const eye=new T.Vector3(.5,1.13,.35),rim=car.steering.getObjectByName('Fitted wheel leather rim');let clear=0,total=0,dash=0;
  for(let i=0;i<rim.geometry.attributes.position.count;i+=3){const p=rim.localToWorld(rim.getVertexPosition(i,new T.Vector3())),d=p.clone().sub(eye),len=d.length();const hits=new T.Raycaster(eye,d.normalize(),0,len-.008).intersectObject(stage,true).filter(h=>visible(h.object)&&h.object.material.opacity>.2&&!h.object.name.startsWith('Fitted wheel')&&h.object.name!=='Wheel top stitching');total++;if(!hits.length)clear++;if(hits.some(h=>/^InteriorDash/.test(h.object.name)))dash++;}
  assert.equal(dash,0,'dashboard must not intersect any sampled rim sightline');assert(clear/total>.40,'substantial wheel silhouette remains visible around the real arms');assert(rim.material.color.r>.08,'rim must not use near-black source rubber');actor.dispose();
});

function stub(onRender){const rect=new T.Vector4(0,0,800,600),color=new T.Color();return{domElement:{clientWidth:800,clientHeight:600},autoClear:true,info:{autoReset:true,render:{calls:0},reset(){}},getRenderTarget:()=>null,setRenderTarget(){},getScissorTest:()=>false,setScissorTest(){},getViewport:p=>p.copy(rect),getScissor:p=>p.copy(rect),setViewport(){},setScissor(){},getClearColor:p=>p.copy(color),getClearAlpha:()=>1,setClearColor(){},render(s,c){s.updateMatrixWorld(true);onRender(s,c);}};}
test('every parked corn instance clears actual car and opened doors with leaf/sway allowance',async()=>{
  const car=prepareCruiser((await load('assets/intro/cruiser.glb')).scene),guard=parkedCruiserClearanceBox();
  for(let i=0;i<=20;i++){car.update({steer:0,wheelRoll:0},i/20);car.model.updateMatrixWorld(true);car.model.traverse(o=>{if(!o.isMesh||!visible(o))return;for(let j=0;j<o.geometry.attributes.position.count;j++){const p=o.localToWorld(o.getVertexPosition(j,new T.Vector3()));assert(guard.containsPoint(p),`door/body envelope ${o.name} ${p.toArray()}`);}});}
  // A deliberately large leaf, not a point or stalk origin, verifies clearance.
  const geometry=new T.BoxGeometry(1.7,3.0,1.25),material=new T.MeshStandardMaterial();let scene;const view=createPrologueVisuals(stub(s=>{scene=s;}),{getCorn:()=>[{geometry,material}]});view.render({chapter:'walk',chapterProgress:.5,time:3});const location=scene.getObjectByName('Cruiser interior, passenger on right').parent,inverse=location.matrixWorld.clone().invert();let checked=0,west=0;
  scene.traverse(o=>{if(!o.isInstancedMesh||!(/corn/i.test(o.name)))return;for(let i=0;i<o.count;i++){const matrix=new T.Matrix4();o.getMatrixAt(i,matrix);const parent=inverse.clone().multiply(o.matrixWorld),envelope=cornInstanceEnvelope(o.geometry,matrix,parent);assert(!envelope.intersectsBox(guard),`${o.name} instance${i} clips opened car/leaf envelope`);checked++;if(o.parent.name==='Westward cornfield approach and threshold'){assert(envelope.max.x<-7,'field lies west of road and car');west++;}}});assert(checked>850);assert(west>600);view.dispose();geometry.dispose();material.dispose();
});

test('guided approach clears the hood then walks west across the road into field depth',()=>{
  for(const id of ['mike','clarence','stanley']){let previous=approachPathPosition(id,0);for(let i=1;i<=400;i++){const next=approachPathPosition(id,i/400);assert(Math.hypot(next[0]-previous[0],next[2]-previous[2])<.28,'continuous sampled approach');if(next[0]<-2)assert(next[2]<-3,'turn only after clearing the hood');previous=next;}assert(previous[0]<-47);assert(Math.abs(previous[2]-WEST_APPROACH.centerZ)<.8);}
  const midpoint=samplePrologueMotion({chapter:'history',chapterProgress:.5},{worldAvailable:false});assert(midpoint.blocking.camera[0]<-18);assert(Math.abs(midpoint.blocking.camera[2]+4.2)<.001);assert(midpoint.listener.yaw>1.5&&midpoint.listener.yaw<1.6);
});

test('westward threshold and camera heading map exactly to unchanged gameplay spawn',()=>{
  for(const spawn of [{x:0,z:0,yaw:0},{x:23,z:-7,yaw:.8},{x:-12,z:41,yaw:-2.2}]){const fit=approachStageTransform(spawn),matrix=new T.Matrix4().compose(new T.Vector3().fromArray(fit.position),new T.Quaternion().setFromAxisAngle(new T.Vector3(0,1,0),fit.yaw),new T.Vector3(1,1,1));const camera=new T.Vector3().fromArray(approachPoint([0,1.58,-48])).applyMatrix4(matrix);assert(camera.distanceTo(new T.Vector3(spawn.x,1.58,spawn.z))<1e-10);const direction=new T.Vector3(-1,0,0).transformDirection(matrix);assert(direction.distanceTo(new T.Vector3(-Math.sin(spawn.yaw),0,-Math.cos(spawn.yaw)))<1e-10);}
});

test('ordinary interactive controls follow escorts west without changing gates, cues or story outcome',()=>{
  const cues=[],story=createPrologue({durations:PROLOGUE_VOICE_TIMING,onCue:id=>cues.push(id)});story.begin();let west=0,deep=0,steps=0;
  while(story.phase!=='finished'&&steps++<9000){const f=story.frame(),s=story.snapshot();let controls={};if(f.waitingForExit)controls.interact=true;else if(f.canMove&&f.chapter!=='redroom'){const target=followApproachTarget(f.player,s.escorts),dx=target.x-f.player.x,dz=target.z-f.player.z;if(Math.hypot(dx,dz)>.28)controls={forward:1,yaw:Math.atan2(-dx,-dz)};}story.tick(.05,controls);if(f.player.x<-10){west++;assert(Math.abs(f.player.z-WEST_APPROACH.centerZ)<.6);}if(f.player.x<-30)deep++;}
  assert.equal(story.phase,'finished');assert(west>300&&deep>50,'player reaches deep western field');assert.equal(cues.filter(c=>c==='door_open').length,1);assert.equal(cues.filter(c=>c==='car_bang_1').length,1);assert.equal(cues.filter(c=>c==='car_bang_2').length,1);assert(story.snapshot().followCalls<3,'bounded follower stays close');story.dispose();
});


test('wheel rim stays below driver eyes and safely inside the actual windshield',async()=>{
  const car=prepareCruiser((await load('assets/intro/cruiser.glb')).scene),actor=createTexturedPrologueActor({gltf:cast});actor.root.position.fromArray(CABIN_FIT.driverSeat);actor.root.rotation.y=Math.PI;actor.pose({mode:'drive',time:8});car.model.updateMatrixWorld(true);
  const rim=car.steering.getObjectByName('Fitted wheel leather rim'),bounds=new T.Box3().setFromObject(rim),eyes=[];actor.root.traverse(o=>{if(o.isBone&&/^eye[LR]$/.test(o.name))eyes.push(o.getWorldPosition(new T.Vector3()).y);});assert(Math.min(...eyes)-bounds.max.y>.10,'top of rim more than 10cm below eyes');
  const glass=car.model.getObjectByName('BodyWindshield'),prior=glass.material.side;glass.material.side=T.DoubleSide;let checked=0;
  for(let i=0;i<rim.geometry.attributes.position.count;i++){const p=rim.localToWorld(rim.getVertexPosition(i,new T.Vector3())),hits=new T.Raycaster(new T.Vector3(p.x,p.y,2),new T.Vector3(0,0,-1),0,5).intersectObject(glass);if(!hits.length)continue;checked++;assert(p.z-hits.at(-1).point.z>.04,'rim retains at least 4cm inside windshield');}assert(checked>180);glass.material.side=prior;
  assert.equal(car.model.getObjectByName('Fitted steering column').geometry.parameters.height,.15);actor.dispose();
});

test('driver smoothly releases the fitted rim before turning through the exit',async()=>{
  const car=prepareCruiser((await load('assets/intro/cruiser.glb')).scene),actor=createTexturedPrologueActor({gltf:cast});car.model.updateMatrixWorld(true);actor.root.position.fromArray(CABIN_FIT.driverSeat);actor.root.rotation.y=Math.PI;actor.pose({mode:'drive',time:0,wheelMatrix:car.steering.matrixWorld});const hands=['L','R'].map(side=>actor.root.getObjectByName('hand'+side));let previous=hands.map(b=>b.getWorldPosition(new T.Vector3()));
  for(let i=0;i<=50;i++){const t=i/120,exitPose=samplePrologueExit(t);actor.root.position.fromArray(exitPose.driver);actor.root.rotation.y=exitPose.driverYaw;actor.pose({mode:'exit',time:t,exitPose,wheelMatrix:car.steering.matrixWorld});for(let j=0;j<2;j++){const p=hands[j].getWorldPosition(new T.Vector3());assert(p.distanceTo(previous[j])<(i===0?.0001:.045),'no wrist snap at release/turn');previous[j]=p;}}actor.dispose();
});


test('shipped corn variants also pass clearance at every staged instance transform',async()=>{
  const kit=await load('assets/field/cornfield-kit.glb');kit.scene.updateMatrixWorld(true);const parts=[];kit.scene.traverse(o=>{if(o.isMesh&&/^corn_near_[012]$/.test(o.name))parts.push({geometry:o.geometry.clone().applyMatrix4(o.matrixWorld),material:o.material});});assert.equal(parts.length,3);
  let scene;const view=createPrologueVisuals(stub(s=>{scene=s;}),{getCorn:()=>parts});view.render({chapter:'walk',chapterProgress:.5,time:3});const location=scene.getObjectByName('Cruiser interior, passenger on right').parent,inverse=location.matrixWorld.clone().invert(),guard=parkedCruiserClearanceBox();let checked=0;
  scene.traverse(o=>{if(!o.isInstancedMesh||!(/corn/i.test(o.name)))return;for(let i=0;i<o.count;i++){const matrix=new T.Matrix4();o.getMatrixAt(i,matrix);assert(!cornInstanceEnvelope(o.geometry,matrix,inverse.clone().multiply(o.matrixWorld)).intersectsBox(guard));checked++;}});assert(checked>850);view.dispose();for(const p of parts)p.geometry.dispose();
});


test('westward follower does not deadlock at the hood corner at 60 or 144Hz',()=>{
  for(const fps of [60,144]){const story=createPrologue({durations:PROLOGUE_VOICE_TIMING});story.begin();let steps=0;while(story.phase!=='finished'&&steps++<fps*300){const f=story.frame(),s=story.snapshot();let controls={};if(f.waitingForExit)controls.interact=true;else if(f.canMove&&f.chapter!=='redroom'){const target=followApproachTarget(f.player,s.escorts),dx=target.x-f.player.x,dz=target.z-f.player.z;if(Math.hypot(dx,dz)>.28)controls={forward:1,yaw:Math.atan2(-dx,-dz)};}story.tick(1/fps,controls);}assert.equal(story.phase,'finished',`${fps}Hz complete story`);assert(story.player.x<-30,`${fps}Hz reaches deep field`);assert.equal(story.snapshot().followCalls,0);story.dispose();}
});

}

function shoeSkin(actor){
  const feet={L:[],R:[]};
  actor.root.traverse(mesh=>{
    if(!mesh.isSkinnedMesh||!/shoe/i.test(mesh.name))return;
    for(const side of ['L','R']){
      const boneIds=new Set(mesh.skeleton.bones.map((bone,index)=>bone.name==='foot1'+side||bone.name==='foot2'+side?index:-1));
      const ids=mesh.geometry.attributes.skinIndex,weights=mesh.geometry.attributes.skinWeight;
      for(let vertex=0;vertex<ids.count;vertex++){
        let weight=0;for(let slot=0;slot<4;slot++)if(boneIds.has(ids.getComponent(vertex,slot)))weight+=weights.getComponent(vertex,slot);
        if(weight>.75)feet[side].push({mesh,vertex,weight});
      }
    }
  });
  for(const side of ['L','R'])assert(feet[side].length>100,'measure actual skinned shoes, not ankle origins');
  return feet;
}
function soleMonitor(actor){
  const skin=shoeSkin(actor),previous=new Map(),locks=new Map();let lastYaw=null;
  const values={frames:0,minY:Infinity,maxSupportY:0,maxFlatDrift:0,maxFlexibleSoleDrift:0,maxRollDrift:0,maxFootTravel:0,maxFootAngle:0,maxRootAngle:0,contacts:0,heel:0,toe:0,holds:0,audioContacts:0,maxAudioClearance:0};
  function record(sample,{measure=true,hold=false,events=[]}={}){
    actor.root.position.fromArray(sample.position);actor.root.rotation.y=sample.yaw;actor.pose({...sample,time:sample.support.time});
    if(!measure){previous.clear();locks.clear();lastYaw=null;return;}
    values.frames++;if(hold)values.holds++;
    if(lastYaw!==null)values.maxRootAngle=Math.max(values.maxRootAngle,Math.abs(Math.atan2(Math.sin(sample.yaw-lastYaw),Math.cos(sample.yaw-lastYaw))));lastYaw=sample.yaw;
    for(const foot of actor.diagnostics().feet){
      const points=skin[foot.side].map(({mesh,vertex})=>{mesh.skeleton.update();return mesh.localToWorld(mesh.getVertexPosition(vertex,new T.Vector3()));});
      const lowest=points.reduce((index,point,i)=>point.y<points[index].y?i:index,0),minY=points[lowest].y;
      values.minY=Math.min(values.minY,minY);const quaternion=actor.root.getObjectByName('foot1'+foot.side).getWorldQuaternion(new T.Quaternion()),prev=previous.get(foot.side);
      if(prev){values.maxFootTravel=Math.max(values.maxFootTravel,...points.map((point,i)=>point.distanceTo(prev.points[i])));values.maxFootAngle=Math.max(values.maxFootAngle,quaternion.angleTo(prev.quaternion));}
      if(foot.planted&&foot.contactLocked&&sample.gait>=.999){
        values.maxSupportY=Math.max(values.maxSupportY,minY);const key=foot.side+foot.cycle+foot.contact;let lock=locks.get(key);
        if(!lock){
          // The rear shoe edge intentionally includes calf weights. Track its
          // flex separately; the rigid supporting sole is entirely foot-skinned.
          const rigid=points.reduce((index,point,i)=>skin[foot.side][i].weight>.9999&&(index<0||point.y<points[index].y)?i:index,-1);
          assert(rigid>=0,'visible rigid sole vertices exist');const vertex=foot.contact==='sole'?rigid:lowest;
          lock={vertex,position:points[vertex].clone(),flexVertex:lowest,flexPosition:points[lowest].clone()};locks.set(key,lock);values.contacts++;
        }
        const change=points[lock.vertex].clone().sub(lock.position),drift=Math.hypot(change.x,change.z);
        if(foot.contact==='sole'){values.maxFlatDrift=Math.max(values.maxFlatDrift,drift);const flex=points[lock.flexVertex].clone().sub(lock.flexPosition);values.maxFlexibleSoleDrift=Math.max(values.maxFlexibleSoleDrift,Math.hypot(flex.x,flex.z));}else values.maxRollDrift=Math.max(values.maxRollDrift,drift);
      }
      if(foot.pitch<-.15)values.heel++;if(foot.pitch>.25)values.toe++;
      const identity=actor.diagnostics().identity;
      if(events.some(event=>event.actor===identity&&event.foot===(foot.side==='L'?'left':'right')&&!event.stepOut)){values.audioContacts++;values.maxAudioClearance=Math.max(values.maxAudioClearance,minY);}
      previous.set(foot.side,{points,quaternion});
    }
  }
  return {record,values};
}

nodeTest('both role skins keep heel/sole/toe support on the floor through starts and stops',async()=>{
  for(const [role,stride,offset]of [['clarence',.45,.37],['stanley',.48,.73]]){
    const actor=createTexturedPrologueActor({gltf:await load(`assets/intro/cast-${role}.glb`),police:role==='clarence'}),monitor=soleMonitor(actor);let distance=0;
    for(let frame=0;frame<600;frame++){
      const time=frame/60,moving=frame>20&&frame<500;distance+=(moving?.65:0)/60;
      const phase=(distance/stride+offset)*Math.PI,gait=Math.min(1,Math.max(0,(frame-20)/17),Math.max(0,(517-frame)/17));
      monitor.record({position:[0,0,distance],yaw:0,phase,mode:moving?'walk':'standing',gait,moving,support:{time,distance,phase,moving,grounded:true,stride,segment:'outdoors'}});
    }
    const m=monitor.values;assert(m.contacts>25,role+' has measured real support');assert(m.heel>20&&m.toe>20,role+' uses both heel contact and toe off');
    assert(m.minY>=-.002,role+' sole penetration '+m.minY);assert(m.maxSupportY<.008,role+' support clearance '+m.maxSupportY);
    assert(m.maxFlatDrift<.002,role+' rigid supporting sole drift '+m.maxFlatDrift);assert(m.maxFlexibleSoleDrift<.005,role+' calf-weighted heel flex '+m.maxFlexibleSoleDrift);assert(m.maxRollDrift<.01,role+' conservative rolling material-point drift '+m.maxRollDrift);
    assert(m.maxFootTravel<.06,role+' adjacent-frame shoe travel '+m.maxFootTravel);assert(m.maxFootAngle<.06,role+' adjacent-frame shoe angle '+m.maxFootAngle);actor.dispose();
  }
});

nodeTest('both role skins retain contact timing and continuous turns through a real follow hold',async()=>{
  const rigs=await Promise.all(['clarence','stanley'].map(async role=>{const actor=createTexturedPrologueActor({gltf:await load(`assets/intro/cast-${role}.glb`),police:role==='clarence'});return {role,actor,monitor:soleMonitor(actor)};}));
  const story=createPrologue({durations:PROLOGUE_VOICE_TIMING}),tracker=createPrologueContactTracker();story.begin();let stopStart=null,stopDone=false;
  for(let i=0;i<60*420&&story.phase!=='finished';i++){
    const f=story.frame(),snapshot=story.snapshot();let controls={};
    if(f.waitingForExit)controls.interact=true;
    else if(f.canMove&&f.chapter!=='redroom'){
      if(!stopDone&&f.player.x<-8&&stopStart===null)stopStart=f.elapsed;
      if(stopStart===null||f.elapsed-stopStart>28){stopDone=stopStart!==null;const target=followApproachTarget(f.player,snapshot.escorts),dx=target.x-f.player.x,dz=target.z-f.player.z;if(Math.hypot(dx,dz)>.28)controls={forward:1,yaw:Math.atan2(-dx,-dz)};}
    }
    story.tick(1/60,controls);const next=story.frame(),events=tracker.update(next.motion),measure=['flashlight','walk','history','return_walk','disappearance','arrival'].includes(next.chapter);
    // Keep the solver's history current through vision chapters, but do not
    // compare their separated visible walking frames as if they were adjacent.
    if(next.exitProgress>=1)for(const rig of rigs)rig.monitor.record(next.motion.actors[rig.role],{measure,hold:next.followHeld,events});
  }
  assert.equal(story.phase,'finished');assert(story.snapshot().followCalls>0);assert(story.player.x<-30);
  for(const {role,actor,monitor}of rigs){
    const m=monitor.values;assert(m.frames>5000&&m.holds>900&&m.contacts>150,role+' complete walking and hold samples');
    assert(m.minY>=-.002,role+' sole penetration '+m.minY);assert(m.maxSupportY<.008,role+' support clearance '+m.maxSupportY);
    assert(m.maxFlatDrift<.002,role+' rigid supporting sole drift '+m.maxFlatDrift);assert(m.maxFlexibleSoleDrift<.005,role+' calf-weighted heel flex '+m.maxFlexibleSoleDrift);assert(m.maxRollDrift<.01,role+' rolling material-point drift '+m.maxRollDrift);
    assert(m.maxRootAngle<.05,role+' root turn continuity '+m.maxRootAngle);assert(m.maxFootTravel<.10,role+' foot travel continuity '+m.maxFootTravel);assert(m.maxFootAngle<.15,role+' foot angle continuity '+m.maxFootAngle);
    assert(m.audioContacts>70,role+' measured audio contacts');assert(m.maxAudioClearance<.008,role+' contact clock matches skinned sole '+m.maxAudioClearance);actor.dispose();
  }
  story.dispose();
});
