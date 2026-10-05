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
import {samplePrologueExit} from '../src/prologue-performance.js';
const cast=await castFixture(),actor=createTexturedPrologueActor({gltf:cast});const stage=new THREE.Group();stage.add(actor.root);let maximum=0,plantedMax=0,where=null;
for(let t=0;t<=1.601;t+=1/120){const exitPose=samplePrologueExit(t);actor.root.position.fromArray(exitPose.driver);actor.root.rotation.y=exitPose.driverYaw;actor.pose({mode:'exit',exitPose,time:t,gait:0});for(const f of actor.diagnostics().feet){if(f.error>maximum){maximum=f.error;where={t,...f}}if(f.planted)plantedMax=Math.max(plantedMax,f.error);}}
console.log(JSON.stringify({maximum,plantedMax,where},null,2));actor.dispose();
