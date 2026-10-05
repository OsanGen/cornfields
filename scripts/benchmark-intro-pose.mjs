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
import {createTexturedPrologueActor as createBaseline} from '../verification/baseline-cpu/prologue-model-actor.js';
const cast=await castFixture();const result={kind:'Node CPU pose sampling only; no WebGL/GPU/network/browser FPS. Same shared host and stripped-texture rig; concurrent work may affect timing.',samples:1800};
for(const [name,create]of [['baseline',createBaseline],['polished',createTexturedPrologueActor]]){
 const actor=create({gltf:cast,police:false}),samples=[];
 for(let i=0;i<1860;i++){const time=i/60,distance=time*.8,phase=distance/.48*Math.PI;actor.root.position.set(0,0,distance);const start=performance.now();actor.pose({time,mode:'walk',phase,gait:1,speaking:true,performance:{lineId:'WAL-01',lineOffset:time%6,emphasis:.5,blink:0},support:{time,distance,phase,stride:.48,grounded:true,moving:true,segment:'outdoors'}});if(i>=60)samples.push(performance.now()-start);}
 samples.sort((a,b)=>a-b);result[name]={p50Ms:samples[Math.floor(samples.length*.5)],p95Ms:samples[Math.floor(samples.length*.95)],p99Ms:samples[Math.floor(samples.length*.99)]};actor.dispose();
}
console.log(JSON.stringify(result,null,2));
