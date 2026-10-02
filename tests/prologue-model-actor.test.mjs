import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {createTexturedPrologueActor} from '../src/prologue-model-actor.js';
import {createPrologueActor} from '../src/prologue-actors.js';
import {BANG_TIMES,sampleRoadsideConfrontation} from '../src/prologue-confrontation.js';

// Keep actual animation, skinning, and geometry, without requiring browser image
// decoding in Node. Texture ownership is checked with an injected texture below.
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
const cast = await castFixture();

test('roadside approach, two contacts and cabin retreat share continuous endpoints',()=>{
  assert.deepEqual(sampleRoadsideConfrontation({chapter:'emergence',chapterProgress:1}).position,sampleRoadsideConfrontation({chapter:'bang',chapterTime:0}).position);
  assert.deepEqual(sampleRoadsideConfrontation({chapter:'bang',chapterTime:2}).position,sampleRoadsideConfrontation({chapter:'cabin',chapterTime:0}).position);
  for(const chapterTime of BANG_TIMES){const sample=sampleRoadsideConfrontation({chapter:'bang',chapterTime});assert.equal(sample.bang,1);assert.equal(sample.impact,1);}
  assert.deepEqual(sampleRoadsideConfrontation({chapter:'cabin',chapterTime:.7}).position,[2.1,0,-2.25]);
});

test('both cast rigs reach the passenger-window targets and retract between impacts',()=>{
  const targets=[[.18,1.08,.395],[-.18,1.08,.395]];
  for(const actor of [createTexturedPrologueActor({gltf:cast,police:false}),createPrologueActor({police:false})]){
    actor.root.position.set(1.42,0,-.48);actor.root.rotation.y=-Math.PI/2;
    actor.pose({mode:'bang',bang:1,bangTargets:targets});const contact=actor.diagnostics();
    for(let i=0;i<2;i++)assert.ok(Math.hypot(...contact.windowContacts[i].map((v,j)=>v-contact.windowTargets[i][j]))<.015);
    actor.pose({mode:'bang',bang:0,bangTargets:targets});const retreat=actor.diagnostics();
    assert.ok(retreat.windowContacts.every((point,i)=>point[2]<contact.windowContacts[i][2]-.15));actor.dispose?.();
  }
});
function bones(actor) {
  const result = new Map(); actor.root.traverse(object => { if (object.isBone) result.set(object.name, object); }); return result;
}
function point(actor, bone) { return actor.root.worldToLocal(bone.getWorldPosition(new THREE.Vector3())).toArray(); }
function snapshot(actor) { return [...bones(actor)].map(([name, bone]) => [name, ...point(actor, bone), ...bone.quaternion.toArray()]); }

test('textured actor samples movement by shared stride phase, and seeks without accumulated posing', () => {
  const actor = createTexturedPrologueActor({gltf:cast});
  actor.pose({mode:'walk', time:1, phase:.7}); const expected = snapshot(actor);
  actor.pose({mode:'drive', time:27, steer:.1, look:.6});
  actor.pose({mode:'limp', corpse:true, dissolve:.8});
  actor.pose({mode:'walk', time:300, phase:.7}); assert.deepEqual(snapshot(actor), expected);
  actor.pose({mode:'walk', phase:.7 + Math.PI}); assert.notDeepEqual(snapshot(actor), expected);
  assert.equal(actor.diagnostics().height, 1.8); actor.dispose();
});

test('seated driver pins both hands to the wheel when actor or parent rotates', () => {
  const actor = createTexturedPrologueActor({gltf:cast});
  const stage = new THREE.Group(); stage.position.set(4, 2, -3); stage.rotation.y = .9; stage.add(actor.root);
  actor.root.position.set(-.45, -.38, .09); actor.root.rotation.y = Math.PI;
  for (const steer of [-.12, 0, .12]) {
    actor.pose({mode:'drive', time:8, steer});
    const joints = bones(actor), targets = actor.diagnostics().wristTargets;
    for (const [index, side] of ['L', 'R'].entries()) {
      const hand = point(actor, joints.get(`hand${side}`));
      assert.ok(Math.hypot(...hand.map((value, axis) => value - targets[index][axis])) < 1e-6);
      const forearm = point(actor, joints.get(`armlo${side}`));
      assert.ok(Math.hypot(...hand.map((value, axis) => value - forearm[axis])) < .34, 'wrist must remain within forearm reach');
    }
  }
  actor.dispose();
});

test('wheel fitting deforms the visible palm and sleeve vertices toward the wheel', () => {
  const actor = createTexturedPrologueActor({gltf:cast});
  actor.root.position.set(-.45, -.38, .09); actor.root.rotation.y = Math.PI;
  actor.pose({mode:'drive', time:8, steer:0});
  const region = boneName => {
    const sum = new THREE.Vector3(); let count = 0;
    actor.root.traverse(mesh => {
      if (!mesh.isSkinnedMesh) return;
      const indices = mesh.geometry.attributes.skinIndex, weights = mesh.geometry.attributes.skinWeight;
      const bone = mesh.skeleton.bones.findIndex(bone => bone.name === boneName);
      for (let index = 0; index < indices.count; index++) {
        let weight = 0;
        for (let slot = 0; slot < 4; slot++) if (indices.getComponent(index, slot) === bone) weight += weights.getComponent(index, slot);
        if (weight < .8) continue;
        const point = mesh.getVertexPosition(index, new THREE.Vector3());
        sum.add(actor.root.worldToLocal(mesh.localToWorld(point))); count++;
      }
    });
    assert.ok(count > 10); return sum.divideScalar(count);
  };
  for (const side of ['L', 'R']) {
    const palm = region(`hand${side}`), sleeve = region(`armlo${side}`);
    const target = new THREE.Vector3().fromArray(actor.diagnostics().wristTargets[side === 'L' ? 0 : 1]);
    assert.ok(palm.distanceTo(target) < .12, `${side} visible palm must surround its wheel target`);
    assert.ok(palm.z > .60 && palm.z < .82, `${side} palm ${palm.toArray()}`);
    assert.ok(sleeve.z > .25, `${side} sleeve ${sleeve.toArray()}`);
  }
  actor.dispose();
});

test('visible face points along actor forward in standing and driving poses', () => {
  const actor = createTexturedPrologueActor({gltf:cast}); actor.root.rotation.set(0, Math.PI, 0, 'YXZ');
  let face; actor.root.traverse(object => {if (object.isSkinnedMesh && object.name === 'headHDmale') face = object;});
  assert.ok(face);
  for (const mode of ['standing', 'drive']) {
    actor.pose({mode, time:2});
    const nose = new THREE.Vector3(), positions = face.geometry.attributes.position; let count = 0;
    // Central, protruding face vertices are a visible landmark, independent of
    // whichever axis the source rig's mouth control happens to use.
    for (let index = 0; index < positions.count; index++) {
      if (Math.abs(positions.getX(index)) > .04 || positions.getZ(index) < .25) continue;
      nose.add(actor.root.worldToLocal(face.localToWorld(face.getVertexPosition(index, new THREE.Vector3())))); count++;
    }
    assert.ok(count > 2); nose.divideScalar(count);
    const head = point(actor, bones(actor).get('head'));
    assert.ok(nose.z > head[2] + .08, `${mode}: face must point along actor +Z`);
  }
  actor.dispose();
});

test('cast instances own poses and materials, share source geometry, and restore corpse tint', () => {
  const first = createTexturedPrologueActor({gltf:cast}), second = createTexturedPrologueActor({gltf:cast, police:false});
  const meshes = actor => { const result = []; actor.root.traverse(object => {if (object.isSkinnedMesh) result.push(object);}); return result; };
  const a = meshes(first), b = meshes(second);
  assert.ok(a.length > 0); assert.equal(a[0].geometry, b[0].geometry); assert.notEqual(a[0].material, b[0].material); assert.notEqual(a[0].skeleton, b[0].skeleton);
  first.pose({mode:'standing'}); second.pose({mode:'standing'});
  const initial = a.map(mesh => mesh.material.color.getHex()), untouched = snapshot(second);
  first.pose({mode:'limp', corpse:true, dissolve:.65});
  assert.notDeepEqual(a.map(mesh => mesh.material.color.getHex()), initial);
  assert.deepEqual(snapshot(second), untouched);
  const shader = {uniforms:{}, vertexShader:'#include <begin_vertex>', fragmentShader:'#include <clipping_planes_fragment>'};
  a[0].material.onBeforeCompile(shader); assert.equal(shader.uniforms.prologueDecay.value, .65);
  first.pose({mode:'standing'}); assert.deepEqual(a.map(mesh => mesh.material.color.getHex()), initial);
  assert.equal(shader.uniforms.prologueDecay.value, 0);
  let disposedGeometry = false; a[0].geometry.addEventListener('dispose', () => {disposedGeometry = true;});
  first.dispose(); first.dispose(); assert.equal(disposedGeometry, false); second.dispose();
});

test('missing cast keeps the established procedural actor contract', () => {
  const actor = createTexturedPrologueActor(); actor.pose({mode:'limp', corpse:true, dissolve:.5});
  assert.equal(actor.root.name, 'Prologue Clarence'); assert.equal(actor.diagnostics().pose, 'limp');
  assert.equal(actor.diagnostics().dissolve, .5); actor.dispose();
});
