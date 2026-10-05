import {readFile} from 'node:fs/promises';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
async function castFixture() {
  const bytes = await readFile(new URL('../assets/intro/cast.glb', import.meta.url));
  const length = bytes.readUInt32LE(12), json = JSON.parse(bytes.subarray(20, 20 + length));
  for (const material of json.materials) {
    delete material.pbrMetallicRoughness.baseColorTexture;
    delete material.pbrMetallicRoughness.metallicRoughnessTexture;
    for (const key of ['normalTexture', 'occlusionTexture', 'emissiveTexture']) delete material[key];
  }
  delete json.images; delete json.textures; delete json.samplers;
  const source = Buffer.from(JSON.stringify(json)), padded = Buffer.alloc(Math.ceil(source.length / 4) * 4, 32);
  source.copy(padded);
  const binary = bytes.subarray(20 + length), output = Buffer.alloc(20 + padded.length + binary.length);
  bytes.copy(output, 0, 0, 12); output.writeUInt32LE(output.length, 8);
  output.writeUInt32LE(padded.length, 12); output.writeUInt32LE(0x4e4f534a, 16);
  padded.copy(output, 20); binary.copy(output, 20 + padded.length);
  return new GLTFLoader().parseAsync(output.buffer, '');
}

import {createTexturedPrologueActor} from '../src/prologue-model-actor.js';
const cast=await castFixture(),actor=createTexturedPrologueActor({gltf:cast,police:false});actor.root.position.set(1.42,0,.30);actor.root.rotation.y=-Math.PI/2;actor.pose({mode:'bang',bang:1,crouch:1,bangTargets:[[.18,1.08,.395],[-.18,1.08,.395]]});const results=[];
for(const side of ['L','R']){const names=new Set();actor.root.traverse(o=>{if(o.isBone&&o.name==='hand'+side)o.traverse(b=>{if(b.isBone)names.add(b.name)})});let min=Infinity,max=-Infinity,count=0;actor.root.traverse(mesh=>{if(!mesh.isSkinnedMesh)return;const ids=new Set(mesh.skeleton.bones.map((b,i)=>names.has(b.name)?i:-1).filter(i=>i>=0)),index=mesh.geometry.attributes.skinIndex,weight=mesh.geometry.attributes.skinWeight;for(let v=0;v<index.count;v++){let w=0;for(let s=0;s<4;s++)if(ids.has(index.getComponent(v,s)))w+=weight.getComponent(v,s);if(w<.75)continue;const p=mesh.localToWorld(mesh.getVertexPosition(v,new THREE.Vector3()));min=Math.min(min,p.x);max=Math.max(max,p.x);count++;}});results.push({side,min,max,count,penetration:1.025-min});}console.log(JSON.stringify(results,null,2));actor.dispose();
