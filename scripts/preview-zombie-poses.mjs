// Bounded offline silhouette proof. No browser, texture decode, or gameplay mutation.
import {readFile, writeFile} from 'node:fs/promises';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {attachZombieModel} from '../src/zombie.js';

globalThis.ProgressEvent ||= class { constructor(type, properties) { this.type = type; Object.assign(this, properties); } };
const bytes = await readFile(new URL('../assets/field/zombie.glb', import.meta.url));
const length = bytes.readUInt32LE(12);
const json = JSON.parse(bytes.subarray(20, 20 + length));
delete json.images; delete json.textures; delete json.materials;
json.meshes.forEach(mesh => mesh.primitives.forEach(primitive => delete primitive.material));
json.buffers[0].uri = 'data:application/octet-stream;base64,' + bytes.subarray(28 + length).toString('base64');
const samples = [];
for (const [name, state, interaction] of [
  ['painful', 'stalk', null], ['inverted', 'rage_chase', null],
  ['fetal', 'staggered', null], ['struggle', 'chase', {phase:'qte', phaseStartedAt:0, presses:4, targetPresses:8}],
  ['recoil', 'flashlight_recoil', null],
]) {
  const gltf = await new GLTFLoader().parseAsync(JSON.stringify(json), '');
  const group = new THREE.Group();
  const adapter = attachZombieModel(group, gltf);
  const game = {enemy:{state, x:0, z:0, stateStartedAt:0, timer:2}, interaction};
  adapter.update(game, 1);
  group.updateMatrixWorld(true);
  const meshes = [];
  group.traverse(object => {
    if (!object.isMesh || !object.visible) return;
    const positions = object.geometry.getAttribute('position'), indices = object.geometry.index;
    const vertices = [], faces = [];
    for (let index = 0; index < positions.count; index++) {
      const point = new THREE.Vector3().fromBufferAttribute(positions, index);
      if (object.isSkinnedMesh) object.applyBoneTransform(index, point);
      point.applyMatrix4(object.matrixWorld);
      vertices.push([point.x, -point.z, point.y]);
    }
    for (let index = 0; index < (indices?.count || positions.count); index += 3) {
      faces.push(indices ? [indices.getX(index), indices.getX(index + 1), indices.getX(index + 2)] : [index, index + 1, index + 2]);
    }
    meshes.push({name:object.name, vertices, faces, eye:object.name.includes('eye'), color:object.material.color?.toArray()});
  });
  samples.push({name, meshes, diagnostics:adapter.diagnostics()});
}
const target = new URL('../output/horror-update/zombie-pose-samples.json', import.meta.url);
await writeFile(target, JSON.stringify(samples));
console.log(JSON.stringify(samples.map(({name, diagnostics}) => ({name, ...diagnostics}))));
