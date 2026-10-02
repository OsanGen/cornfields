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
  let resolveLate,accepted=0,disposed=0;
  const car=asset(),late=asset();car.scene.children[0].geometry.addEventListener('dispose',()=>disposed++);late.scene.children[0].geometry.addEventListener('dispose',()=>disposed++);
  const owner=createPrologueAssets({onCar:()=>accepted++,onCast:()=>accepted++,gltfLoader:{loadAsync:url=>url.includes('cruiser')?Promise.resolve(car):new Promise(resolve=>{resolveLate=resolve;})},textureLoader:{loadAsync:async()=>new THREE.Texture()}});
  await turn();assert.equal(owner.owns(car.scene.children[0].geometry),true);
  // The set traversal releases only its own primitives; the importer owns GLBs.
  car.scene.traverse(o=>{if(o.geometry&&!owner.owns(o.geometry))o.geometry.dispose();});
  owner.dispose();owner.dispose();resolveLate(late);await turn();assert.equal(accepted,1);assert.equal(disposed,2);
});

test('source preview serves the same selected new media as the packaged build',async()=>{
  for(const file of ['assets/intro/cruiser.glb','assets/intro/cast.glb','assets/intro/asphalt_nor_gl.jpg','assets/field/handheld-flashlight.glb','assets/audio/pistol-shot.wav']){
    assert.ok((await resolvePublicFile(process.cwd(),'/'+file)).endsWith(file));
  }
  await assert.rejects(resolvePublicFile(process.cwd(),'/art/reference/intro-gameplay/steve.zip'));
});
