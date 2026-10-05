import test from 'node:test';import assert from 'node:assert/strict';import * as T from 'three';
import {load} from '../scripts/load-glb-cpu.mjs';import {createTexturedPrologueActor} from '../src/prologue-model-actor.js';import {CABIN_FIT,steeringMatrix,wheelGrip} from '../src/prologue-cabin.js';
const variants=await Promise.all(['cast.glb','cast-clarence.glb','cast-stanley.glb'].map(async file=>({file,gltf:await load(new URL('../assets/intro/'+file,import.meta.url))})));
const point=b=>b.getWorldPosition(new T.Vector3()),axis=(b,v)=>new T.Vector3(...v).applyQuaternion(b.getWorldQuaternion(new T.Quaternion())),angle=(a,b)=>T.MathUtils.radToDeg(a.angleTo(b));
const rimGap=p=>Math.abs(Math.hypot(Math.hypot(p.x,p.y)-CABIN_FIT.rimRadius,p.z)-CABIN_FIT.rimTube);
function fixture(cast){
 const actor=createTexturedPrologueActor({gltf:cast}),stage=new T.Group();stage.position.set(7,2,-9);stage.rotation.set(.03,.72,-.02,'YXZ');stage.add(actor.root);actor.root.position.fromArray(CABIN_FIT.driverSeat);actor.root.rotation.y=CABIN_FIT.driverYaw;actor.pose({mode:'standing'});
 const arms=['L','R'].map(side=>{
  const upper=actor.root.getObjectByName('armup'+side),lower=actor.root.getObjectByName('armlo'+side),hand=actor.root.getObjectByName('hand'+side);
  const forward=point(hand).sub(point(lower)).normalize(),back=axis(hand,[0,0,1]);back.addScaledVector(forward,-back.dot(forward)).normalize();const dorsalLocal=back.applyQuaternion(lower.getWorldQuaternion(new T.Quaternion()).invert()),regions={all:[],fingers:[],thumb:[]};
  actor.root.traverse(mesh=>{if(!mesh.isSkinnedMesh)return;const ids=mesh.geometry.attributes.skinIndex,weights=mesh.geometry.attributes.skinWeight,names=mesh.skeleton.bones.map(b=>b.name.replaceAll('.',''));
   for(const [name,match]of Object.entries({all:new RegExp(`^(hand${side}|f[12]${side})`),fingers:new RegExp(`^f[12]${side}(002)?$`),thumb:new RegExp(`^f1${side}004$`)}))for(let i=0;i<ids.count;i++){let weight=0;for(let j=0;j<4;j++)if(match.test(names[ids.getComponent(i,j)]))weight+=weights.getComponent(i,j);if(weight>.5)regions[name].push({mesh,index:i});}
  });return{side,upper,lower,hand,dorsalLocal,regions};
 });
 const pose=(steer,time=8)=>{stage.updateMatrixWorld(true);const wheel=stage.matrixWorld.clone().multiply(steeringMatrix(steer));actor.pose({mode:'drive',time,steer,wheelMatrix:wheel,performance:{breath:Math.sin(time)*.018}});return wheel;};
 const points=(arm,region,inverse)=>arm.regions[region].map(({mesh,index})=>mesh.localToWorld(mesh.getVertexPosition(index,new T.Vector3())).applyMatrix4(inverse));return{actor,arms,pose,points};
}
for(const variant of variants){
const fixtureForRole=()=>fixture(variant.gltf);
test(variant.file+': driver wrists align anatomically with forearms and dorsal twist across the entire steering clamp',()=>{
 const {actor,arms,pose}=fixtureForRole(),prior=new Map();
 for(let i=0;i<=120;i++){const steer=-.12+i*.002,wheel=pose(steer,i/60),center=new T.Vector3().setFromMatrixPosition(wheel);
  for(const arm of arms){const forearm=point(arm.hand).sub(point(arm.lower)).normalize(),palm=axis(arm.hand,[0,1,0]),back=axis(arm.hand,[0,0,1]);
   assert(angle(forearm,palm)<1,`${arm.side} wrist bend ${angle(forearm,palm)} degrees at ${steer}`);
   const sleeveBack=arm.dorsalLocal.clone().applyQuaternion(arm.lower.getWorldQuaternion(new T.Quaternion()));assert(angle(sleeveBack,back)<2,`${arm.side} no sleeve/palm twist discontinuity ${angle(sleeveBack,back)}`);
   const radial=wheelGrip(arm.side,wheel).contact.sub(center).normalize();radial.addScaledVector(palm,-radial.dot(palm)).normalize();assert(angle(back,radial)<1,`${arm.side} knuckles face outward from rim`);
   const q=arm.hand.getWorldQuaternion(new T.Quaternion()),old=prior.get(arm.side);if(old)assert(T.MathUtils.radToDeg(old.angleTo(q))<7,`${arm.side} no hand-frame flip`);prior.set(arm.side,q);
  }
 }actor.dispose();
});
test(variant.file+': actual curled fingers and opposing thumbs retain separate fitted-rim contact through steer and breath',()=>{
 const {actor,arms,pose,points}=fixtureForRole();
 for(let i=0;i<=24;i++){const steer=-.12+i*.01,wheel=pose(steer,i*.23),inverse=wheel.clone().invert();
  for(const arm of arms){const skin=points(arm,'all',inverse),gaps=skin.map(rimGap).sort((a,b)=>a-b);assert(skin.length>700,'measure shipped skin, not controls');assert(gaps[Math.floor(gaps.length*.5)]<.016,`${arm.side} median surface gap`);assert(gaps[Math.floor(gaps.length*.9)]<.025,`${arm.side} 90th percentile surface gap`);assert(gaps.filter(d=>d<.008).length>150,`${arm.side} substantial skin contact`);
   const contact=wheelGrip(arm.side,wheel).contact.applyMatrix4(inverse),forward=axis(arm.hand,[0,1,0]).transformDirection(inverse),mean=pts=>pts.reduce((s,p)=>s.add(p),new T.Vector3()).divideScalar(pts.length),thumbs=points(arm,'thumb',inverse),fingers=points(arm,'fingers',inverse);
   assert(thumbs.length>=25&&fingers.length>200,'measure both actual digit regions');assert(thumbs.filter(p=>rimGap(p)<.008).length>=10,`${arm.side} separate thumb contact`);assert(fingers.filter(p=>rimGap(p)<.008).length>90,`${arm.side} curled finger contact`);assert(mean(thumbs).sub(contact).dot(forward)<-.003,`${arm.side} thumb opposes grip behind rim center`);assert(mean(fingers).sub(contact).dot(forward)>.008,`${arm.side} fingers wrap ahead of rim center`);
  }
 }actor.dispose();
});
test(variant.file+': driver grip restarts exactly without accumulating wrist twist after other poses',()=>{
 const{actor,arms,pose}=fixtureForRole(),snapshot=()=>arms.flatMap(a=>[a.upper,a.lower,a.hand,actor.root.getObjectByName('f1'+a.side+'004')]).map(b=>[...point(b).toArray(),...b.getWorldQuaternion(new T.Quaternion()).toArray()]);pose(0,8);const before=snapshot();
 for(let cycle=0;cycle<3;cycle++){for(const steer of [-.12,.12,0])pose(steer,27+cycle);actor.pose({mode:'standing'});actor.pose({mode:'walk',phase:.7,time:1});actor.pose({mode:'limp',corpse:true});pose(0,8);assert.deepEqual(snapshot(),before);}
 actor.dispose();
});

}
