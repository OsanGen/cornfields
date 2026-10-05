import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {clone as cloneSkeleton} from 'three/addons/utils/SkeletonUtils.js';
import {load} from '../scripts/load-glb-cpu.mjs';
import {installHands,createStoryForearmFit} from '../src/hands.js';
import {createPrologueEquipment} from '../src/scene.js';
import {samplePrologueBodyReach} from '../src/viewmodel-pose.js';
import {createEntertainmentRadio} from '../src/prologue-cabin.js';

const loader={loadAsync:url=>load(new URL(url))};
function skinPoints(root){root.updateMatrixWorld(true);const points=[];root.traverse(mesh=>{if(!mesh.isSkinnedMesh)return;mesh.skeleton.update();for(let i=0;i<mesh.geometry.attributes.position.count;i++)points.push(mesh.getVertexPosition(i,new THREE.Vector3()).applyMatrix4(mesh.matrixWorld));});return points;}
function skinSnapshot(root){const result=[];root.traverse(mesh=>{if(mesh.isSkinnedMesh)result.push({mesh,geometry:mesh.geometry,array:[...mesh.geometry.attributes.position.array],weights:[...mesh.geometry.attributes.skinWeight.array]});});return result;}
function armLengths(root){const at=n=>root.getObjectByName(n).getWorldPosition(new THREE.Vector3());return ['R','L'].map(s=>[at('armup'+s).distanceTo(at('armlo'+s)),at('armlo'+s).distanceTo(at('hand'+s))]);}
function cuffSurfaceGap(scene,arm){
  const shirt=scene.getObjectByName('shirt');shirt.skeleton.update();const points=[];for(let i=0;i<shirt.geometry.attributes.position.count;i++)points.push(shirt.getVertexPosition(i,new THREE.Vector3()).applyMatrix4(shirt.matrixWorld));
  const elbow=scene.getObjectByName('Mike body anchor').getObjectByName('armloR').getWorldPosition(new THREE.Vector3()),wrist=skinPoints(arm).filter(p=>p.distanceTo(elbow)<.07),index=shirt.geometry.index,triangle=new THREE.Triangle(),closest=new THREE.Vector3();let gap=Infinity;
  for(const p of wrist)for(let i=0;i<index.count;i+=3){triangle.set(points[index.getX(i)],points[index.getX(i+1)],points[index.getX(i+2)]);triangle.closestPointToPoint(p,closest);gap=Math.min(gap,closest.distanceTo(p));}
  return gap;
}

async function fixture(){
  const gun=new THREE.Group(),knife=new THREE.Group(),torch=new THREE.Group();
  const hands=installHands({gun,knife,torch,placeholders:[],loader});await hands.ready;assert.equal(hands.stats.status,'ready');
  let scene;const equipment=createPrologueEquipment({autoClear:true,info:{autoReset:true},render:s=>{scene=s;}},{gun,torch,bodyLoader:loader,radioLoader:loader});
  const camera=new THREE.PerspectiveCamera(65,1.7,.035,175),radio=createEntertainmentRadio();radio.group.updateMatrixWorld(true);
  const target=radio.contact.getWorldPosition(new THREE.Vector3()),identity=new THREE.Matrix4().elements;
  function draw({reach=0,turn=0,chapter='car',yaw=0,pitch=0,aspect=1.7,cameraPosition=null,...other}={}){
    camera.aspect=aspect;camera.updateProjectionMatrix();camera.position.set(.5,1.13,.35).add(new THREE.Vector3(...samplePrologueBodyReach(reach).eyeOffset));if(cameraPosition)camera.position.fromArray(cameraPosition);camera.rotation.set(pitch,yaw,0,'YXZ');
    equipment.render(camera,{chapter,radioHandReach:reach,radioHandTurn:turn,radioHandTarget:target.toArray(),cabinMatrix:identity,locationMatrix:identity,chapterTime:1,chapterProgress:.4,time:4,player:{},...other});scene.updateMatrixWorld(true);return scene;
  }
  draw();await new Promise(r=>setTimeout(r,40));draw();assert.equal(equipment.stats.body.status,'ready');
  return {gun,hands,equipment,camera,target,draw,get scene(){return scene;},dispose(){equipment.dispose();hands.dispose();}};
}

test('canonical v3 forearms remain anatomical on owned geometry and preserve every wrist/finger vertex',async()=>{
  const source=(await load(new URL('../assets/field/player-arms.glb',import.meta.url))).scene;
  for(const side of ['R','L']){
    const original=source.getObjectByName(side==='R'?'RightArm':'LeftArm'),arm=cloneSkeleton(original),pivot=new THREE.Group();pivot.add(arm);
    const sourceState=skinSnapshot(original),before=skinPoints(arm),bones=[];arm.traverse(o=>{if(o.isBone)bones.push({bone:o,position:o.position.clone(),scale:o.scale.clone(),quaternion:o.quaternion.clone()});});
    const owned=[],fit=createStoryForearmFit(arm,{side,ownGeometry:g=>owned.push(g)}),after=skinPoints(arm);
    assert.equal(arm.userData.anatomicalForearmV3,true);assert(new THREE.Box3().setFromPoints(before).getSize(new THREE.Vector3()).z<.45,'Authored v3 asset has no inherited eight-fold extension');
    assert(new THREE.Box3().setFromPoints(after).getSize(new THREE.Vector3()).z<.45);
    before.forEach((point,i)=>{assert(after[i].toArray().every(Number.isFinite));if(point.z<=.025)assert(point.distanceTo(after[i])<1e-7);});
    for(const state of sourceState){assert.deepEqual([...state.geometry.attributes.position.array],state.array);assert.deepEqual([...state.geometry.attributes.skinWeight.array],state.weights);}
    for(const {bone,position,scale,quaternion}of bones){assert(bone.position.equals(position));assert(bone.scale.equals(scale));assert(bone.quaternion.equals(quaternion));}
    pivot.position.set(.2,.8,-.3);pivot.rotation.set(.2,.6,-.2);pivot.updateMatrixWorld(true);fit.fit(pivot.localToWorld(new THREE.Vector3(side==='R'?-.08:.08,.07,.28)));assert(skinPoints(arm).every(p=>p.toArray().every(Number.isFinite)));
    owned.forEach(g=>g.dispose());
  }
});

test('wake body/camera share the actual seated lean and both anatomical arm lengths stay constant',async()=>{
  const f=await fixture();try{
    f.draw();const body=f.scene.getObjectByName('Mike body anchor'),baseline=armLengths(body),head0=body.getObjectByName('head').getWorldPosition(new THREE.Vector3()).applyMatrix4(f.camera.matrixWorld),eye0=f.camera.position.clone();
    for(const reach of [.001,.1,.25,.5,.75,1,.75,.5,.25,.001,0]){
      f.draw({reach});const head=body.getObjectByName('head').getWorldPosition(new THREE.Vector3()).applyMatrix4(f.camera.matrixWorld),eye=f.camera.position;
      assert(head.clone().sub(head0).distanceTo(eye.clone().sub(eye0))<.002,'Camera follows the actual posed head origin');
      armLengths(body).forEach((lengths,i)=>lengths.forEach((v,j)=>assert(Math.abs(v-baseline[i][j])<1e-5,`No arm length stretch reach=${reach} ${i}/${j}: ${v} vs ${baseline[i][j]}`)));
      if(reach>.001)assert(f.equipment.stats.body.armContacts.R.error<.001);
    }
  }finally{f.dispose();}
});

test('actual visible index-tip contacts the knob cap within 5mm and all hand triangles stay outside its front plane',async()=>{
  const f=await fixture();try{
    for(const turn of [0,.2,.5,.75,1])for(const yaw of [-1.4,0,1.4]){
      f.draw({reach:1,turn,yaw,pitch:.5});const arm=f.scene.getObjectByName('Story hand on passenger door').getObjectByName('RightArm'),world=skinPoints(arm).map(p=>p.applyMatrix4(f.camera.matrixWorld));
      if(yaw===0)assert(cuffSurfaceGap(f.scene,arm)<.01,'Anatomical elbow skin meets the exposed upper-arm surface within 1cm');
      assert.equal(arm.userData.storyContact.bone,'f_index03R','Contact is actual distal index skin, not a wrist bone');
      assert(Math.min(...world.map(p=>p.distanceTo(f.target)))<=.005);
      // A linear triangle lies wholly in a halfspace when all its vertices do.
      assert(Math.min(...world.map(p=>p.z))>=f.target.z-1e-6,'No hand triangle penetrates the physical knob front cap');
      assert(new THREE.Box3().setFromPoints(world).getSize(new THREE.Vector3()).length()<.75,'No multi-metre gameplay extension');
      assert(f.equipment.stats.body.armContacts.R.error<.001);
    }
  }finally{f.dispose();}
});

test('dispatch skin/radio stay cabin-anchored through supported free look and source gameplay data are unchanged',async()=>{
  const f=await fixture(),before=skinSnapshot(f.gun);try{
    let reference=null;for(const aspect of [16/9,1,.56])for(const yaw of [-1.45,0,1.45])for(const pitch of [-1,0,1]){
      f.draw({chapter:'dispatch',yaw,pitch,aspect});const root=f.scene.getObjectByName('Story hand and radio'),world=skinPoints(root).map(p=>p.applyMatrix4(f.camera.matrixWorld)),box=new THREE.Box3().setFromPoints(world);
      assert(box.max.x<=1.015,'Actual hand skin keeps passenger-glass margin');assert(f.equipment.stats.radioClearance.clear);
      if(reference)world.forEach((p,i)=>assert(p.distanceTo(reference[i])<1e-5,`Drift ${p.distanceTo(reference[i])} at ${i}; yaw ${yaw}, pitch ${pitch}, aspect ${aspect}`));else reference=world;
      assert(f.equipment.stats.body.armContacts.R.error<.001);
    }
    for(const state of before){assert.equal(state.mesh.geometry,state.geometry);assert.deepEqual([...state.geometry.attributes.position.array],state.array);assert.deepEqual([...state.geometry.attributes.skinWeight.array],state.weights);}
  }finally{f.dispose();}
});


test('Mike foot support stays in the physical world when the first-person eye frame moves',async()=>{
  const f=await fixture();try{
    const player={x:0,y:1.58,z:0,yaw:0,moving:false,distance:0};
    f.draw({chapter:'walk',player,cameraPosition:[0,1.58,0]});
    const body=f.scene.getObjectByName('Mike body anchor'),worldFeet=()=>['L','R'].map(side=>body.getObjectByName('foot1'+side).getWorldPosition(new THREE.Vector3()).applyMatrix4(f.camera.matrixWorld));
    const baseline=worldFeet();
    for(const x of [.025,.10,-.1,0]){f.draw({chapter:'walk',player,cameraPosition:[x,1.58,0]});worldFeet().forEach((p,i)=>assert(p.distanceTo(baseline[i])<.001,'A changing view frame must not drag planted feet'));}
  }finally{f.dispose();}
});
