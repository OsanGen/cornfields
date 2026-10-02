import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {clone as cloneSkeleton} from 'three/addons/utils/SkeletonUtils.js';
import {installHands} from '../src/hands.js';
import {applyHandGrip,HAND_GRIP_CONTACT} from '../src/hand-grip.js';
import {PLAYER_VIEWMODEL as POSE,flashlightPose} from '../src/viewmodel-pose.js';

async function geometryOnly(name){
  const bytes=await readFile(new URL(`../assets/field/${name}`,import.meta.url)),size=bytes.readUInt32LE(12),json=JSON.parse(bytes.subarray(20,20+size));
  delete json.images;delete json.textures;delete json.materials;
  for(const mesh of json.meshes)for(const primitive of mesh.primitives)delete primitive.material;
  json.buffers[0].uri='data:application/octet-stream;base64,'+bytes.subarray(28+size).toString('base64');
  globalThis.ProgressEvent ||= class {constructor(type,properties){Object.assign(this,{type},properties);}};
  return (await new GLTFLoader().parseAsync(JSON.stringify(json),'')).scene;
}
function fixtures(){
  const arms=new THREE.Group(),pistol=new THREE.Group(),light=new THREE.Group();
  for(const name of ['RightArm','LeftArm']){
    const arm=new THREE.Group();arm.name=name;arms.add(arm);
    const bone=new THREE.Bone(),geometry=new THREE.BoxGeometry(.05,.1,.05),count=geometry.attributes.position.count;
    geometry.setAttribute('skinIndex',new THREE.Uint16BufferAttribute(new Uint16Array(count*4),4));
    const weights=new Float32Array(count*4);for(let i=0;i<count;i++)weights[i*4]=1;
    geometry.setAttribute('skinWeight',new THREE.Float32BufferAttribute(weights,4));
    const mesh=new THREE.SkinnedMesh(geometry,new THREE.MeshStandardMaterial());arm.add(bone,mesh);mesh.bind(new THREE.Skeleton([bone]));
  }
  for(const name of ['PistolBody','PistolSlide']){const mesh=new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshStandardMaterial());mesh.name=name;pistol.add(mesh);}
  light.add(new THREE.Mesh(new THREE.CylinderGeometry(.025,.022,.23,8),new THREE.MeshStandardMaterial()));
  const gun=new THREE.Group(),knife=new THREE.Group(),torch=new THREE.Group(),muzzle=new THREE.Object3D();gun.add(muzzle);
  const loader={loadAsync(url){return Promise.resolve({scene:url.includes('player-arms')?arms:url.includes('service-pistol')?pistol:light});}};
  return {arms,pistol,light,gun,knife,torch,muzzle,loader,placeholders:[]};
}
const nextTurn=()=>new Promise(resolve=>setImmediate(resolve));

test('larger weapon expands around palm contact and muzzle follows while arm scale stays unchanged',async()=>{
  const f=fixtures(),hands=installHands(f);await hands.ready;
  assert.equal(hands.stats.status,'ready');assert.equal(hands.stats.flashlightStatus,'ready');
  assert.deepEqual(f.pistol.scale.toArray(),[1.15,1.15,1.15]);assert.deepEqual(f.gun.getObjectByName('RightArm').scale.toArray(),[1,1,1]);
  const contact=HAND_GRIP_CONTACT.pistol.map((v,i)=>v+POSE.grip[i]);
  const oldMuzzle=[.168,-.148,-.535];
  for(let i=0;i<3;i++)assert.ok(Math.abs((f.muzzle.position.toArray()[i]-contact[i])-(oldMuzzle[i]-contact[i])*1.15)<1e-10);
  assert.ok(f.muzzle.position.z<oldMuzzle[2]);assert.equal(f.torch.getObjectByName('LeftArm').name,'LeftArm');
  f.torch.updateMatrixWorld(true);assert.ok(f.light.localToWorld(new THREE.Vector3(0,0,.112)).z<-.1,'Source bulb points forward after mounting');hands.dispose();
});

test('expanded grip reaches enlarged shipped trigger and dedicated torch grip preserves rig anatomy',async()=>{
  const source=await geometryOnly('player-arms.glb'),pistol=await geometryOnly('service-pistol.glb'),right=cloneSkeleton(source.getObjectByName('RightArm'));
  pistol.scale.setScalar(POSE.pistolScale);pistol.position.fromArray(POSE.pistol);pistol.updateMatrixWorld(true);
  const trigger=new THREE.Box3().setFromObject(pistol.getObjectByName('PistolTrigger')).expandByScalar(.009);
  applyHandGrip(right,'pistol','R',{weaponScale:POSE.pistolScale});right.updateMatrixWorld(true);
  const tip=right.getObjectByName('f_index03R_end').getWorldPosition(new THREE.Vector3());
  assert.ok(trigger.containsPoint(tip),`Index ${tip.toArray()} must contact enlarged trigger ${trigger.min.toArray()} / ${trigger.max.toArray()}`);
  const left=cloneSkeleton(source.getObjectByName('LeftArm')),bones=[];
  left.traverse(o=>{if(o.isBone)bones.push({bone:o,position:o.position.toArray(),scale:o.scale.toArray()});});
  applyHandGrip(left,'flashlight','L');
  for(const {bone,position,scale} of bones){assert.deepEqual(bone.position.toArray(),position);assert.deepEqual(bone.scale.toArray(),scale);assert.ok(bone.quaternion.toArray().every(Number.isFinite));}
  const once=bones.map(({bone})=>bone.quaternion.toArray());applyHandGrip(left,'knife','L');applyHandGrip(left,'flashlight','L');
  bones.forEach(({bone},i)=>bone.quaternion.toArray().forEach((v,j)=>assert.ok(Math.abs(v-once[i][j])<1e-8)));
});

test('missing flashlight never discards usable pistol or knife and pose remains valid for phone views',async()=>{
  const f=fixtures(),coreLoader=f.loader;f.loader={loadAsync(url){return url.includes('handheld-flashlight')?Promise.reject(new Error('missing optional torch')):coreLoader.loadAsync(url);}};
  const hands=installHands(f);await hands.ready;
  assert.equal(hands.stats.status,'ready');assert.equal(hands.stats.flashlightStatus,'fallback');assert.match(hands.stats.flashlightError,/missing optional torch/);
  assert.ok(f.gun.getObjectByName('PistolBody'));assert.ok(f.knife.getObjectByName('LeftArm'));assert.equal(f.torch.children.length,0);
  for(const aspect of [.45,1,1.7,2.4])assert.ok(Object.values(flashlightPose({aspect,moving:true,time:50,steps:20})).flat().every(Number.isFinite));
  assert.deepEqual(flashlightPose({reduced:true}),flashlightPose({reduced:true,time:50,steps:20,moving:true}));hands.dispose();
});

test('torch timeout rejects late installation and disposes late resources without touching the working gun',async()=>{
  const f=fixtures(),coreLoader=f.loader;let resolveTorch,freed=0,gunFreed=0;
  f.light.children[0].geometry.addEventListener('dispose',()=>freed++);f.pistol.children[0].geometry.addEventListener('dispose',()=>gunFreed++);
  f.loader={loadAsync(url){return url.includes('handheld-flashlight')?new Promise(resolve=>{resolveTorch=resolve;}):coreLoader.loadAsync(url);}};
  const hands=installHands({...f,deadlineMs:5});await hands.ready;
  assert.equal(hands.stats.status,'ready');assert.equal(hands.stats.flashlightStatus,'fallback');resolveTorch({scene:f.light});await nextTurn();
  assert.equal(freed,1);assert.equal(gunFreed,0);assert.equal(f.torch.children.length,0);hands.dispose();assert.equal(gunFreed,1);
});

test('teardown releases the fourth cloned hand once and settles a pending torch load',async()=>{
  const f=fixtures(),hands=installHands(f);await hands.ready;
  let skeletonFreed=0,torchFreed=0;
  for(const root of [f.gun,f.knife,f.torch])root.traverse(o=>{if(o.isSkinnedMesh){o.skeleton.computeBoneTexture();o.skeleton.boneTexture.addEventListener('dispose',()=>skeletonFreed++);}});
  f.light.children[0].geometry.addEventListener('dispose',()=>torchFreed++);
  hands.dispose();hands.dispose();assert.equal(skeletonFreed,4);assert.equal(torchFreed,1);assert.equal(f.torch.children.length,0);
  const pending=fixtures(),coreLoader=pending.loader;let resolveTorch;
  pending.loader={loadAsync(url){return url.includes('handheld-flashlight')?new Promise(resolve=>{resolveTorch=resolve;}):coreLoader.loadAsync(url);}};
  const cancelled=installHands(pending);await nextTurn();cancelled.dispose();await cancelled.ready;resolveTorch({scene:pending.light});await nextTurn();
  assert.equal(cancelled.stats.status,'disposed');assert.equal(cancelled.stats.flashlightStatus,'disposed');assert.equal(pending.torch.children.length,0);
});
