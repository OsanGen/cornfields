import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as THREE from 'three';
import {load} from '../scripts/load-glb-cpu.mjs';
import {createPrologueRadio,validateRadioAsset,PROLOGUE_RADIO} from '../src/prologue-radio.js';
import {createPrologueEquipment} from '../src/scene.js';
import {runtimeAssets} from '../scripts/build.mjs';

const path=new URL('../assets/intro/dispatch-radio.glb',import.meta.url);
const cpuAsset=()=>load(path);
function resourceCounts(scene){
  const found=new Map();scene.traverse(o=>{
    for(const r of [o.geometry,...[o.material].flat()].filter(Boolean))found.set(r,0);
    for(const m of [o.material].flat().filter(Boolean))for(const r of Object.values(m))if(r?.isTexture)found.set(r,0);
  });for(const r of found.keys())r.addEventListener('dispose',()=>found.set(r,found.get(r)+1));return found;
}

test('authored dispatch GLB stays within the exact triangle, material, byte and local-texture budget',async()=>{
  const bytes=await readFile(path),n=bytes.readUInt32LE(12),j=JSON.parse(bytes.subarray(20,20+n));
  assert(bytes.length<=PROLOGUE_RADIO.maxBytes);assert.equal(j.buffers.length,1);assert(!j.buffers[0].uri);
  assert.equal(j.materials.length,3);assert(j.images.length>=2);for(const im of j.images){assert.equal(im.uri,undefined);assert.equal(im.mimeType,'image/png');assert(Number.isInteger(im.bufferView));const v=j.bufferViews[im.bufferView],png=bytes.subarray(28+n+v.byteOffset,28+n+v.byteOffset+v.byteLength);assert.equal(png.readUInt32BE(16),256);assert([128,256].includes(png.readUInt32BE(20)));}
  let triangles=0;for(const m of j.meshes)for(const p of m.primitives){triangles+=j.accessors[p.indices].count/3;for(const key of ['POSITION','NORMAL','TEXCOORD_0'])assert(Number.isInteger(p.attributes[key]),key);}
  assert(triangles>108&&triangles<=2000);assert(runtimeAssets.includes('assets/intro/dispatch-radio.glb'));
  const asset=await cpuAsset();const inventory=validateRadioAsset(asset.scene);assert.equal(inventory.triangles,triangles);assert.equal(inventory.draws,3);
  asset.scene.traverse(o=>{if(!o.isMesh)return;const normal=o.geometry.attributes.normal;for(let i=0;i<normal.count;i++)assert(Math.abs(Math.hypot(normal.getX(i),normal.getY(i),normal.getZ(i))-1)<1e-5);});
  for(const m of j.materials)assert(!m.alphaMode||m.alphaMode==='OPAQUE');
  const lcd=j.materials.find(m=>m.name==='Muted green LCD');assert(lcd.emissiveFactor.every(v=>v>=0&&v<=.2));assert(lcd.emissiveTexture);
});

test('radio loader uses local GLB, replaces only its fallback and owns repeated cleanup',async()=>{
  const asset=await cpuAsset(),owned=resourceCounts(asset.scene),prepared=new Set();let url;
  const radio=createPrologueRadio({loader:{loadAsync:async u=>(url=u,asset)},prepareMaterial:m=>prepared.add(m)}),fallback=resourceCounts(radio.root);
  assert.equal(radio.stats.status,'loading');assert.equal(radio.root.children[0].children.length,3);await radio.ready;assert.equal(radio.stats.status,'ready');assert(url.endsWith('/assets/intro/dispatch-radio.glb'));
  assert.equal(radio.root.children.length,1);assert.equal(radio.root.children[0],asset.scene);for(const count of fallback.values())assert.equal(count,1);
  assert.equal(prepared.size,6);radio.dispose();radio.dispose();assert.equal(radio.stats.status,'disposed');for(const count of owned.values())assert.equal(count,1);
});

test('load failure and malformed assets leave a usable fallback without rejecting ready',async()=>{
  for(const loader of [{loadAsync:async()=>{throw new Error('Offline');}},{loadAsync:async()=>({scene:new THREE.Group()})}]){
    const radio=createPrologueRadio({loader});await radio.ready;assert.equal(radio.stats.status,'fallback');assert(radio.stats.error);assert.equal(radio.root.children[0].name,'Dispatch radio fallback');radio.dispose();
  }
});

test('deadline releases a late asset once and never installs it over the fallback',async()=>{
  let resolve;const asset=await cpuAsset(),owned=resourceCounts(asset.scene);
  const radio=createPrologueRadio({loader:{loadAsync:()=>new Promise(r=>resolve=r)},deadlineMs:4});await radio.ready;assert.equal(radio.stats.status,'fallback');resolve(asset);await new Promise(r=>setTimeout(r,0));assert.equal(radio.root.children[0].name,'Dispatch radio fallback');for(const count of owned.values())assert.equal(count,1);radio.dispose();
});

test('dispose during loading removes owned fallback and disposes late GPU geometry/material/texture',async()=>{
  let resolve;const asset=await cpuAsset(),texture=new THREE.Texture();asset.scene.traverse(o=>{if(o.isMesh)o.material.map=texture;});const owned=resourceCounts(asset.scene);
  const radio=createPrologueRadio({loader:{loadAsync:()=>new Promise(r=>resolve=r)}}),fallback=resourceCounts(radio.root);await Promise.resolve();radio.dispose();await radio.ready;resolve(asset);await new Promise(r=>setTimeout(r,0));assert.equal(radio.root.children.length,0);for(const count of [...owned.values(),...fallback.values()])assert.equal(count,1);
});

test('dispatch lift/lower, unchanged door grip and fresh radio after release remain independent of art readiness',async()=>{
  const gun=new THREE.Group(),grip=new THREE.Group(),pivot=new THREE.Group(),arm=new THREE.Group();arm.name='RightArm';gun.add(grip);grip.add(pivot);pivot.add(arm);
  arm.add(new THREE.Mesh(new THREE.BoxGeometry(.02,.08,.1),new THREE.MeshStandardMaterial()));let scene,loads=0;const assets=[await cpuAsset(),await cpuAsset()];
  const loader={loadAsync:async()=>{loads++;return assets.shift();}};
  const renderer={autoClear:true,info:{autoReset:true},render:s=>{scene=s;}};
  const view=createPrologueEquipment(renderer,{gun,radioLoader:loader}),camera=new THREE.PerspectiveCamera(65,1.7,.035,175);
  const draw=(time,progress)=>view.render(camera,{chapter:'dispatch',chapterTime:time,chapterProgress:progress});
  draw(0,0);const held=scene.getObjectByName('Story hand and radio'),low=held.position.clone();draw(1,.4);assert(held.position.y>low.y+.30);assert.deepEqual(held.getObjectByName('Handheld dispatch radio').position.toArray(),PROLOGUE_RADIO.position);
  draw(9,1);assert(held.position.distanceTo(low)<1e-8);
  await new Promise(r=>setImmediate(r));assert.equal(loads,1);assert.equal(view.stats.radio.status,'ready');
  assert.equal(scene.getObjectByName('Story hand on passenger door').getObjectByName('Handheld dispatch radio').children.length,0);
  view.release();assert.equal(view.stats.active,false);draw(1,.4);await new Promise(r=>setImmediate(r));assert.equal(loads,2);assert.equal(view.stats.radio.status,'ready');view.dispose();view.dispose();
});


test('radio validation rejects corrupt geometry, transforms, excessive size and draw counts',async()=>{
  for(const mutate of [
    scene=>{scene.traverse(o=>{if(o.isMesh)o.geometry.attributes.position.array[0]=NaN;});},
    scene=>{scene.traverse(o=>{if(o.isMesh)o.geometry.index.array[0]=65535;});},
    scene=>{scene.traverse(o=>{if(o.isMesh)o.geometry.attributes.normal.array[0]=Infinity;});},
    scene=>{scene.scale.setScalar(100);},
    scene=>{scene.position.x=NaN;},
    scene=>{const extra=new THREE.Mesh(new THREE.BoxGeometry(.01,.01,.01),new THREE.MeshStandardMaterial());scene.add(extra);},
  ]){const asset=await cpuAsset();mutate(asset.scene);assert.throws(()=>validateRadioAsset(asset.scene),/Dispatch radio/);}
});
