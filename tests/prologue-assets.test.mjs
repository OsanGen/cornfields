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
