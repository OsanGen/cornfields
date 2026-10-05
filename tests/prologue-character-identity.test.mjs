import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as THREE from 'three';
import {load} from '../scripts/load-glb-cpu.mjs';
import {createPrologueActor} from '../src/prologue-actors.js';
import {createTexturedPrologueActor} from '../src/prologue-model-actor.js';

const roles=['clarence','stanley'];
const variants=Object.fromEntries(await Promise.all(roles.map(async role=>[role,await load(new URL(`../assets/intro/cast-${role}.glb`,import.meta.url))])));
function disposeFallback(actor){const geometries=new Set(),materials=new Set();actor.root.traverse(o=>{if(o.geometry)geometries.add(o.geometry);for(const m of [].concat(o.material||[]))materials.add(m);});for(const g of geometries)g.dispose();for(const m of materials)m.dispose();}
const triangles=root=>{let count=0;root.traverse(o=>{if(o.isMesh)count+=(o.geometry.index?.count||o.geometry.attributes.position.count)/3;});return count;};

test('role fallbacks have independent head silhouettes and both fit the full actor triangle budget',()=>{
 const actors=roles.map((role,i)=>createPrologueActor({name:role,police:i===0}));
 const sizes=actors.map((actor,i)=>{const head=actor.root.getObjectByName(`Fallback ${roles[i]} head`);assert.ok(head);assert.equal(actor.diagnostics().identity,roles[i]);assert.equal(actor.diagnostics().assetId,`fallback:${roles[i]}`);assert(triangles(actor.root)<=7000);return new THREE.Box3().setFromObject(head).getSize(new THREE.Vector3());});
 assert(sizes[1].x>sizes[0].x*1.14,'Stanley has a materially broader head independent of color and wardrobe');
 assert(sizes[0].y/sizes[0].x>sizes[1].y/sizes[1].x*1.1,'Clarence has a narrower, longer facial silhouette');
 actors.forEach(disposeFallback);
});

test('separate authored faces change actual head positions, not only textures or clothing',()=>{
 const head=role=>variants[role].scene.getObjectByName('headHDmale').geometry;
 const a=head('clarence'),b=head('stanley');
 assert.notDeepEqual(Array.from(a.attributes.position.array),Array.from(b.attributes.position.array));
 a.computeBoundingBox();b.computeBoundingBox();const ca=a.boundingBox.getSize(new THREE.Vector3()),st=b.boundingBox.getSize(new THREE.Vector3());
 assert(st.x>ca.x*1.1,'Stanley head must read wider in geometry alone');
 assert(ca.y/ca.x>st.y/st.x*1.08,'Clarence must read narrower in geometry alone');
 // Rig heights remain stable so the standing-height fitter cannot shift grips.
 const boxes=roles.map(role=>new THREE.Box3().setFromObject(variants[role].scene));
 assert(Math.abs(boxes[0].getSize(new THREE.Vector3()).y-boxes[1].getSize(new THREE.Vector3()).y)<1e-5);
});

for(const [index,role] of roles.entries()){
 test(`${role} identity remains bound to the requested role through expressions and restart`,()=>{
  const actor=createTexturedPrologueActor({name:role==='clarence'?'Clarence':'Stanley Yates',police:index===0,gltf:variants[role]});
  for(const pose of [{mode:'standing'},{mode:'drive',steer:-.12},{mode:'walk',phase:.9},{speaking:true,performance:{lineId:'ARR-00',lineOffset:.2,blink:1}},{corpse:true},{mode:'standing'}]){
   actor.pose(pose);const d=actor.diagnostics();assert.equal(d.identity,role);assert.equal(d.assetId,`cast-${role}.glb`);assert.equal(d.height,1.8);
  }
  assert(triangles(actor.root)<=18000,'approved whole-actor cap includes generated fitted lids');
  const lids=[];actor.root.traverse(o=>{if(o.name.startsWith('Fitted '))lids.push(o);});assert.equal(lids.length,4,'exactly one fitted lid set');actor.dispose();
 });
 test(`${role} keeps embedded role-specific face maps and compatible clip/joint contracts`,async()=>{
  const bytes=await readFile(new URL(`../assets/intro/cast-${role}.glb`,import.meta.url));const json=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)));
  assert.equal(json.skins[0].joints.length,56);assert.deepEqual(json.animations.map(a=>a.name).sort(),['Seated','Talk','Walk']);
  const head=json.materials.find(m=>/headHDmale/.test(m.name));assert(head?.pbrMetallicRoughness?.baseColorTexture);assert(json.images.length>0);assert(json.images.every(i=>Number.isInteger(i.bufferView)&&!i.uri),'textures must be embedded and private to this export');
 });
}


test('variant full-blink lids follow eye depth instead of becoming flat patches',()=>{
 for(const [index,role]of roles.entries()){
  const actor=createTexturedPrologueActor({gltf:variants[role],police:index===0});actor.pose({performance:{blink:1}});
  const head=actor.root.getObjectByName('head');actor.root.updateMatrixWorld(true);
  actor.root.traverse(lid=>{if(!lid.name.startsWith('Fitted '))return;
   const p=lid.geometry.attributes.position,world=[];for(let i=0;i<p.count;i++)world.push(actor.root.worldToLocal(lid.localToWorld(new THREE.Vector3().fromBufferAttribute(p,i))));
   const depth=Math.max(...world.map(p=>p.z))-Math.min(...world.map(p=>p.z));assert(depth>.002,'closed shell has anatomical depth across rim and center');
  });assert.ok(head);actor.dispose();
 }
});


test('full blink occludes the visible iris samples of each distinct face',()=>{
 for(const [index,role]of roles.entries()){
  const actor=createTexturedPrologueActor({gltf:variants[role],police:index===0});actor.pose({performance:{blink:1}});actor.root.updateMatrixWorld(true);
  for(const eyeName of ['eye0','eye1']){
   const eye=actor.root.getObjectByName(eyeName),box=new THREE.Box3();eye.skeleton.update();for(let i=0;i<eye.geometry.attributes.position.count;i++)box.expandByPoint(eye.localToWorld(eye.getVertexPosition(i,new THREE.Vector3())));
   const c=box.getCenter(new THREE.Vector3()),r=box.getSize(new THREE.Vector3()).multiplyScalar(.5);
   for(const u of [-.45,0,.45])for(const v of [-.4,0,.4]){
    const origin=new THREE.Vector3(c.x+u*r.x,c.y+v*r.y,box.max.z+.15),ray=new THREE.Raycaster(origin,new THREE.Vector3(0,0,-1),0,.4);
    const hit=ray.intersectObject(actor.root,true)[0];assert.ok(hit,role+' eye sample has a surface');assert(!/^eye[01]$/.test(hit.object.name),role+' iris remains exposed in full blink');
   }
  }actor.dispose();
 }
});


test('Clarence fallback exposed skin matches the darker authored character direction',()=>{
 const actor=createPrologueActor({police:true}),colors=[];
 actor.root.traverse(o=>{if(o.isMesh)colors.push(o.material.color.getHex());});
 assert(colors.includes(0x61402d));assert(colors.includes(0x432b22));disposeFallback(actor);
});


test('gaze rotates each eyeball at its own source-side socket instead of the opposite eye',()=>{
 for(const [index,role] of roles.entries()){
  const actor=createTexturedPrologueActor({gltf:variants[role],police:index===0});
  const centers=()=>['eye0','eye1'].map(name=>{const eye=actor.root.getObjectByName(name),box=new THREE.Box3();actor.root.updateMatrixWorld(true);eye.skeleton.update();for(let i=0;i<eye.geometry.attributes.position.count;i++)box.expandByPoint(actor.root.worldToLocal(eye.localToWorld(eye.getVertexPosition(i,new THREE.Vector3()))));return box.getCenter(new THREE.Vector3());});
  actor.pose({mode:'standing',time:0,performance:{eyeLook:0,blink:0}});const rest=centers();
  for(const eyeLook of [-.18,.18,0]){actor.pose({mode:'standing',time:0,performance:{eyeLook,blink:0}});centers().forEach((center,i)=>assert(center.distanceTo(rest[i])<.003,'gaze keeps the eyeball seated in its own socket'));}
  actor.dispose();
 }
});
