import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createPrologueAssets} from '../src/prologue-assets.js';
import {resolvePublicFile} from '../scripts/server-path.mjs';
const turn=()=>new Promise(resolve=>setImmediate(resolve));
const asset=()=>({scene:new THREE.Group().add(new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshStandardMaterial()))});

test('partial asphalt failure cannot be overwritten by later successful components',async()=>{
  const owner=createPrologueAssets({gltfLoader:{loadAsync:async()=>asset()},textureLoader:{loadAsync:async url=>{if(url.includes('nor_gl'))throw Error('missing normal');return new THREE.Texture();}}});
  await turn();assert.equal(owner.stats.road,'fallback');assert.deepEqual(owner.stats.roadComponents,{map:'ready',normalMap:'fallback',roughnessMap:'ready'});owner.dispose();
});

test('ownership prevents duplicate scene cleanup and late arrivals are disposed once',async()=>{
  const resolveLate=[];let accepted=0,disposed=0;
  const car=asset(),late=asset();car.scene.children[0].geometry.addEventListener('dispose',()=>disposed++);late.scene.children[0].geometry.addEventListener('dispose',()=>disposed++);
  const owner=createPrologueAssets({onCar:()=>accepted++,onCast:()=>accepted++,gltfLoader:{loadAsync:url=>url.includes('cruiser')?Promise.resolve(car):new Promise(resolve=>{resolveLate.push(resolve);})},textureLoader:{loadAsync:async()=>new THREE.Texture()}});
  await turn();assert.equal(owner.owns(car.scene.children[0].geometry),true);
  // The set traversal releases only its own primitives; the importer owns GLBs.
  car.scene.traverse(o=>{if(o.geometry&&!owner.owns(o.geometry))o.geometry.dispose();});
  owner.dispose();owner.dispose();resolveLate[0](late);const other=asset();other.scene.children[0].geometry.addEventListener('dispose',()=>disposed++);resolveLate[1](other);await turn();assert.equal(accepted,1);assert.equal(disposed,3);
});

test('source preview serves the same selected new media as the packaged build',async()=>{
  for(const file of ['assets/intro/cruiser.glb','assets/intro/cast-clarence.glb','assets/intro/cast-stanley.glb','assets/intro/asphalt_nor_gl.jpg','assets/field/handheld-flashlight.glb','assets/audio/pistol-shot.wav']){
    assert.ok((await resolvePublicFile(process.cwd(),'/'+file)).endsWith(file));
  }
  await assert.rejects(resolvePublicFile(process.cwd(),'/art/reference/intro-gameplay/steve.zip'));
  await assert.rejects(resolvePublicFile(process.cwd(),'/assets/intro/cast.glb'),'legacy source stays local, not in runtime package');
});


test('threshold reuses local timber maps with correct color spaces and bounded ownership',async()=>{
 const maps=[],urls=[];
 const owner=createPrologueAssets({onWood:(key,map)=>maps.push([key,map]),gltfLoader:{loadAsync:async()=>asset()},textureLoader:{loadAsync:async url=>{urls.push(url);return new THREE.Texture();}}});
 await turn();assert.equal(maps.length,3);assert.equal(urls.filter(u=>u.includes('wood_planks_dirt')).length,3);
 let disposed=0;for(const [key,map] of maps){assert.equal(map.colorSpace,key==='map'?THREE.SRGBColorSpace:THREE.NoColorSpace);assert.deepEqual(map.repeat.toArray(),[5,1.325]);assert.ok(owner.owns(map));map.addEventListener('dispose',()=>disposed++);}
 owner.dispose();owner.dispose();assert.equal(disposed,3);
});

test('late timber arrivals cannot mutate a released set',async()=>{
 const pending=[];let accepted=0,disposed=0;
 const owner=createPrologueAssets({onWood:()=>accepted++,gltfLoader:{loadAsync:async()=>asset()},textureLoader:{loadAsync:url=>url.includes('wood_planks_dirt')?new Promise(resolve=>pending.push(resolve)):Promise.resolve(new THREE.Texture())}});
 owner.dispose();for(const resolve of pending){const t=new THREE.Texture();t.addEventListener('dispose',()=>disposed++);resolve(t);}await turn();assert.equal(accepted,0);assert.equal(disposed,3);
});


test('each distinct role loads once and one missing role cannot replace the other fallback',async()=>{
 const accepted=[],urls=[];
 const owner=createPrologueAssets({onCast:(role,gltf)=>accepted.push({role,gltf}),gltfLoader:{loadAsync:async url=>{urls.push(url);if(url.endsWith('cast-stanley.glb'))throw Error('missing Stanley');return asset();}},textureLoader:{loadAsync:async()=>new THREE.Texture()}});
 await turn();assert.deepEqual(accepted.map(x=>x.role),['clarence']);assert.deepEqual(owner.stats.castRoles,{clarence:'ready',stanley:'fallback'});assert.equal(owner.stats.cast,'fallback');
 assert.equal(urls.filter(url=>url.endsWith('cast-clarence.glb')).length,1);assert.equal(urls.filter(url=>url.endsWith('cast-stanley.glb')).length,1);assert.equal(urls.some(url=>url.endsWith('/cast.glb')),false);owner.dispose();
});

test('distinct role deadlines reject only expired role and dispose its late geometry',async()=>{
 let resolveStanley,accepted=[],disposed=0;
 const owner=createPrologueAssets({deadlineMs:10,onCast:role=>accepted.push(role),gltfLoader:{loadAsync:url=>url.endsWith('cast-stanley.glb')?new Promise(resolve=>{resolveStanley=resolve;}):Promise.resolve(asset())},textureLoader:{loadAsync:async()=>new THREE.Texture()}});
 await new Promise(resolve=>setTimeout(resolve,25));assert.deepEqual(owner.stats.castRoles,{clarence:'ready',stanley:'fallback'});
 const late=asset();late.scene.children[0].geometry.addEventListener('dispose',()=>disposed++);resolveStanley(late);await turn();assert.deepEqual(accepted,['clarence']);assert.equal(disposed,1);owner.dispose();
});

test('approved roadside and projector assets are optional, owned and rejected after release',async()=>{
 const pending=new Map(),accepted=[],disposed=[];
 const owner=createPrologueAssets({onRoadside:g=>accepted.push(g),onProjector:g=>accepted.push(g),gltfLoader:{loadAsync:url=>/roadside-set|projector/.test(url)?new Promise(resolve=>pending.set(url.split('/').at(-1),resolve)):Promise.resolve(asset())},textureLoader:{loadAsync:async()=>new THREE.Texture()}});
 assert.equal(pending.size,2);const roadside=asset();roadside.scene.children[0].geometry.addEventListener('dispose',()=>disposed.push('roadside'));
 pending.get('roadside-set.glb')(roadside);await turn();assert.equal(owner.stats.roadside,'ready');assert(owner.owns(roadside.scene.children[0].geometry));owner.dispose();
 const projector=asset();projector.scene.children[0].geometry.addEventListener('dispose',()=>disposed.push('projector'));pending.get('projector.glb')(projector);await turn();
 assert.deepEqual(accepted,[roadside]);assert.deepEqual(disposed,['roadside','projector']);
});

test('original v2 props validate actual GLB topology, packaging and bounded geometry',async()=>{
 const {readFile}=await import('node:fs/promises'),{load}=await import('../scripts/load-glb-cpu.mjs');
 for(const [name,maxTriangles,maxDraws,maxBytes] of [['roadside-set',12000,8,6*1024*1024],['projector',5000,3,1024*1024]]){
  const data=await readFile(new URL(`../assets/intro/${name}.glb`,import.meta.url));assert.equal(data.readUInt32LE(0),0x46546c67);assert.equal(data.readUInt32LE(8),data.length);
  const json=JSON.parse(data.subarray(20,20+data.readUInt32LE(12)));let triangles=0,draws=0;
  for(const mesh of json.meshes)for(const primitive of mesh.primitives){assert.equal(primitive.mode??4,4);triangles+=json.accessors[primitive.indices].count/3;draws++;}
  assert(triangles<=maxTriangles);assert(draws<=maxDraws);assert(data.length<=maxBytes);assert.equal(json.extensionsUsed?.includes('KHR_lights_punctual')||false,false);
  const model=await load(new URL(`../assets/intro/${name}.glb`,import.meta.url));model.scene.updateMatrixWorld(true);const bounds=new THREE.Box3().setFromObject(model.scene);
  if(name==='projector'){
   assert(Math.abs(bounds.min.y+.98)<=.005);assert(model.scene.getObjectByName('Feed_reel'));assert(model.scene.getObjectByName('Takeup_reel'));
   const uv=model.scene.getObjectByName('Projector_housing_and_threaded_film').geometry.attributes.uv;let filmVertices=0;for(let i=0;i<uv.count;i++)if(uv.getX(i)>.75&&uv.getY(i)<.25)filmVertices++;assert.equal(filmVertices,16,'all four threaded film faces retain the scrolling atlas region after GLB export');
  }else{assert(bounds.min.x>=-.95);assert(bounds.min.z>3);assert(bounds.min.y>=-.045,'v3 graded driveway is intentionally recessed less than 4.5cm; the house foundation is unchanged');assert(bounds.max.x<14);}
 }
});
