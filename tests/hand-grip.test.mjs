import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {clone as cloneSkeleton} from 'three/addons/utils/SkeletonUtils.js';
import {applyHandGrip,fitKnifeForearm,HAND_GRIP_CONTACT} from '../src/hand-grip.js';

async function loadGeometry(file){
  const bytes=await readFile(new URL(`../assets/field/${file}`,import.meta.url)),length=bytes.readUInt32LE(12);
  const json=JSON.parse(bytes.subarray(20,20+length));
  delete json.images;delete json.textures;delete json.materials;
  json.meshes.forEach(mesh=>mesh.primitives.forEach(primitive=>delete primitive.material));
  json.buffers[0].uri='data:application/octet-stream;base64,'+bytes.subarray(28+length).toString('base64');
  globalThis.ProgressEvent ||= class {constructor(type,properties){this.type=type;Object.assign(this,properties);}};
  return (await new GLTFLoader().parseAsync(JSON.stringify(json),'')).scene;
}
const source=await loadGeometry('player-arms.glb');
function arm(side='R'){return cloneSkeleton(source.getObjectByName(side==='R'?'RightArm':'LeftArm'));}
function at(root,name){root.updateMatrixWorld(true);return root.getObjectByName(name).getWorldPosition(new THREE.Vector3());}
function joints(root){const result=[];root.traverse(o=>{if(o.isBone)result.push(o);});return result;}

test('pistol finger reaches the shipped trigger and the thumb closes alongside the grip',async()=>{
  const right=arm(),before=at(right,'f_index03R_end');
  const pistol=await loadGeometry('service-pistol.glb');pistol.position.set(-.032,.01,-.12);pistol.updateMatrixWorld(true);
  const trigger=new THREE.Box3().setFromObject(pistol.getObjectByName('PistolTrigger')).expandByScalar(.008);
  assert(!trigger.containsPoint(before),'Source grip reproduces the index floating behind the trigger');
  applyHandGrip(right,'pistol');
  assert(trigger.containsPoint(at(right,'f_index03R_end')),JSON.stringify(at(right,'f_index03R_end').toArray()));
  const thumb=at(right,'thumb03R_end');
  assert(thumb.y>.01&&thumb.y<.045,'Thumb stays beside the grip, below the slide');
  assert(thumb.x<-.045&&thumb.x>-.067&&thumb.z<-.11&&thumb.z>-.14);
});

test('knife closes the index around a handle rather than retaining the trigger pose',()=>{
  const pistol=arm(),knife=arm();applyHandGrip(pistol,'pistol');applyHandGrip(knife,'knife');
  const index=at(knife,'f_index03R_end'),trigger=at(pistol,'f_index03R_end');
  assert(index.distanceTo(trigger)>.06);
  assert(index.z>-.105&&index.z<-.077&&index.x<-.025&&index.x>-.055);
  for(const finger of ['index','middle','ring','pinky']){
    const tip=at(knife,`f_${finger}03R_end`),c=HAND_GRIP_CONTACT.knife;
    const radial=Math.hypot(tip.x-c[0],tip.z-c[2]);
    assert(radial>.009&&radial<.036,`${finger}: ${radial}`);
  }
});

test('both grips preserve bone lengths, local positions, skin weights and source rig',()=>{
  const original=joints(source).map(b=>b.quaternion.toArray());
  for(const side of ['R','L'])for(const kind of ['pistol','knife']){
    const root=arm(side),bones=joints(root),positions=bones.map(b=>b.position.toArray()),scales=bones.map(b=>b.scale.toArray());
    const lengths=bones.map(b=>b.parent?.isBone?at(root,b.name).distanceTo(at(root,b.parent.name)):null);
    applyHandGrip(root,kind,side);
    bones.forEach((b,i)=>{
      assert.deepEqual(b.position.toArray(),positions[i]);assert.deepEqual(b.scale.toArray(),scales[i]);
      if(lengths[i]!==null)assert(Math.abs(at(root,b.name).distanceTo(at(root,b.parent.name))-lengths[i])<1e-7);
    });
    root.traverse(mesh=>{if(mesh.isSkinnedMesh){mesh.skeleton.update();const p=new THREE.Vector3();
      for(let i=0;i<mesh.geometry.attributes.position.count;i+=17){p.fromBufferAttribute(mesh.geometry.attributes.position,i);mesh.applyBoneTransform(i,p);assert(p.toArray().every(Number.isFinite));}
    }});
  }
  assert.deepEqual(joints(source).map(b=>b.quaternion.toArray()),original);
});

test('grip application is repeatable and switching grip does not accumulate rotations',()=>{
  const root=arm();applyHandGrip(root,'knife');const expected=joints(root).map(b=>b.quaternion.toArray());
  for(let i=0;i<5;i++){applyHandGrip(root,'pistol');applyHandGrip(root,'knife');}
  joints(root).forEach((bone,i)=>bone.quaternion.toArray().forEach((v,j)=>assert(Math.abs(v-expected[i][j])<1e-8)));
});

test('left-hand grip mirrors the right hand and incomplete rigs remain usable',()=>{
  const right=arm(),left=arm('L');applyHandGrip(right,'knife');applyHandGrip(left,'knife','L');
  for(const finger of ['f_index03','f_middle03','thumb03']){
    const r=at(right,`${finger}R_end`),l=at(left,`${finger}L_end`);r.x*=-1;assert(r.distanceTo(l)<.001);
  }
  assert.equal(applyHandGrip(new THREE.Group(),'pistol'),null);
});

test('knife forearm fitting preserves the wrist and fingers and owns only its cloned geometry',()=>{
  const root=arm();applyHandGrip(root,'knife');root.updateMatrixWorld(true);
  let mesh;root.traverse(o=>{if(o.isSkinnedMesh)mesh=o;});mesh.skeleton.update();
  const shared=mesh.geometry,original=[...shared.attributes.position.array],before=[];
  for(let i=0;i<shared.attributes.position.count;i++)before.push(mesh.getVertexPosition(i,new THREE.Vector3()).applyMatrix4(mesh.matrixWorld));
  const bones=joints(root).map(b=>b.quaternion.toArray());fitKnifeForearm(root);
  assert.notEqual(mesh.geometry,shared);assert.deepEqual([...shared.attributes.position.array],original);
  let changed=0;for(let i=0;i<before.length;i++){
    const after=mesh.getVertexPosition(i,new THREE.Vector3()).applyMatrix4(mesh.matrixWorld),point=before[i];
    assert(after.toArray().every(Number.isFinite));
    if(point.z<=.05)assert(after.distanceTo(point)<1e-7);
    else{assert(Math.abs(after.x-point.x)<1e-6);assert(Math.abs(after.z-point.z)<1e-6);assert(after.y>point.y);changed++;}
  }
  assert(changed>100);assert.deepEqual(joints(root).map(b=>b.quaternion.toArray()),bones);
  const fitted=[...mesh.geometry.attributes.position.array];fitKnifeForearm(root);assert.deepEqual([...mesh.geometry.attributes.position.array],fitted);
});

test('fitted hand remains identical after runtime knife parenting and attached skin matrix updates',()=>{
  const baseline=arm(),fitted=arm();applyHandGrip(baseline,'knife');applyHandGrip(fitted,'knife');
  let a,b;baseline.traverse(o=>{if(o.isSkinnedMesh)a=o;});fitted.traverse(o=>{if(o.isSkinnedMesh)b=o;});
  baseline.updateMatrixWorld(true);a.skeleton.update();
  const hand=[];for(let i=0;i<a.geometry.attributes.position.count;i++)if(a.getVertexPosition(i,new THREE.Vector3()).applyMatrix4(a.matrixWorld).z<=.05)hand.push(i);
  fitKnifeForearm(fitted);
  const scene=new THREE.Scene();
  for(const root of [baseline,fitted]){
    const knife=new THREE.Group(),pivot=new THREE.Group();knife.position.set(.18,-.12,-.4);knife.rotation.set(-.8,.4,.1);
    pivot.position.set(.029,-.107,.023);pivot.rotation.x=Math.PI/2;pivot.add(root);knife.add(pivot);scene.add(knife);
  }
  scene.updateMatrixWorld(true);a.skeleton.update();b.skeleton.update();
  for(const i of hand){
    const before=a.getVertexPosition(i,new THREE.Vector3()).applyMatrix4(a.matrixWorld),after=b.getVertexPosition(i,new THREE.Vector3()).applyMatrix4(b.matrixWorld);
    assert(after.distanceTo(before)<1e-7,`Hand vertex ${i} moved after parent attachment`);
  }
  assert.deepEqual(Object.keys(a.geometry.attributes),Object.keys(b.geometry.attributes));
  for(const key of ['normal','tangent','uv','skinIndex','skinWeight'])if(a.geometry.attributes[key])assert.deepEqual(a.geometry.attributes[key].array,b.geometry.attributes[key].array,key);
});

test('radio-only profile wraps the wider rear and side without changing the source or other grip profiles',()=>{
  const original=joints(source).map(b=>b.quaternion.toArray());
  const right=arm();applyHandGrip(right,'radio');const radio=joints(right).map(b=>b.quaternion.toArray());
  const bounds={left:-.0525,back:-.108};
  for(const finger of ['index','middle','ring','pinky']){
    const tip=at(right,`f_${finger}03R_end`);
    assert(tip.x<bounds.left+.008||tip.z<bounds.back+.006,`${finger} sits outside the rear or thumb-side surface: ${tip.toArray()}`);
    assert(tip.toArray().every(Number.isFinite));
    if(finger!=='pinky')assert(tip.x>-.068&&tip.x<-.0525,`${finger} keeps near-contact instead of floating away from the side`);
  }
  const thumb=at(right,'thumb03R_end');assert(thumb.x<-.05&&thumb.z>-.105&&thumb.z<-.055,`Thumb reaches the side PTT: ${thumb.toArray()}`);
  for(let i=0;i<4;i++){applyHandGrip(right,'flashlight');applyHandGrip(right,'radio');}
  joints(right).forEach((bone,i)=>bone.quaternion.toArray().forEach((v,j)=>assert(Math.abs(v-radio[i][j])<1e-8)));
  assert.deepEqual(joints(source).map(b=>b.quaternion.toArray()),original);
  const torch=arm();applyHandGrip(torch,'flashlight');assert(at(torch,'f_index03R_end').distanceTo(at(right,'f_index03R_end'))>.02);
});

test('radio grip changes only joint rotations, preserves all attributes, and mirrors without drift',()=>{
  const right=arm(),left=arm('L');
  for(const [root,side] of [[right,'R'],[left,'L']]){
    const bones=joints(root),positions=bones.map(b=>b.position.toArray()),scales=bones.map(b=>b.scale.toArray()),meshes=[];
    root.traverse(o=>{if(o.isSkinnedMesh)meshes.push({o,geometry:o.geometry,attributes:Object.fromEntries(Object.entries(o.geometry.attributes).map(([key,value])=>[key,[...value.array]]))});});
    applyHandGrip(root,'radio',side);
    bones.forEach((b,i)=>{assert.deepEqual(b.position.toArray(),positions[i]);assert.deepEqual(b.scale.toArray(),scales[i]);});
    for(const {o,geometry,attributes} of meshes){assert.equal(o.geometry,geometry);for(const [key,data] of Object.entries(attributes))assert.deepEqual([...o.geometry.attributes[key].array],data);}
  }
  for(const name of ['f_index03','f_middle03','thumb03']){const r=at(right,name+'R_end'),l=at(left,name+'L_end');r.x*=-1;assert(r.distanceTo(l)<.001);}
});

test('dispatch regrips the actual scaled-pistol clone with the same radio fingertip contacts',()=>{
  const player=arm();applyHandGrip(player,'pistol','R',{weaponScale:1.15});const original=joints(player).map(b=>b.quaternion.toArray()),radio=cloneSkeleton(player),direct=arm();
  applyHandGrip(radio,'radio');applyHandGrip(direct,'radio');
  for(const finger of ['f_index','f_middle','f_ring','f_pinky','thumb'])assert(at(radio,finger+'03R_end').distanceTo(at(direct,finger+'03R_end'))<1e-6);
  assert.deepEqual(joints(player).map(b=>b.quaternion.toArray()),original);
  radio.updateMatrixWorld(true);radio.traverse(o=>{if(o.isSkinnedMesh){o.skeleton.update();for(let i=0;i<o.geometry.attributes.position.count;i++)assert(o.getVertexPosition(i,new THREE.Vector3()).toArray().every(Number.isFinite));}});
});
