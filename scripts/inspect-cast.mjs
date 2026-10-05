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

const cast=await castFixture();const model=cast.scene;const mixer=new THREE.AnimationMixer(model);for(const c of cast.animations){mixer.stopAllAction();const a=mixer.clipAction(c).play();a.time=0;mixer.update(0);model.updateMatrixWorld(true);console.log('CLIP',c.name);model.traverse(o=>{if(o.isBone&&/^(head|eye|mouth|leg|foot|arm|hand|pelvis|waist|torso)/.test(o.name))console.log(o.name,'pos',o.position.toArray().map(n=>+n.toFixed(3)),'quat',o.quaternion.toArray().map(n=>+n.toFixed(3)),'world',o.getWorldPosition(new THREE.Vector3()).toArray().map(n=>+n.toFixed(3)));});}
model.traverse(o=>{if(o.isMesh&&/eye/.test(o.name)){o.geometry.computeBoundingBox();console.log('EYE',o.name,o.geometry.boundingBox,o.position,o.matrixWorld.elements)}});
