import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {attachZombieModel} from '../src/zombie.js';
import {zombiePoseState} from '../src/zombie-poses.js';

// Use the shipped geometry, bones, skin weights and clip without browser textures.
async function fixture() {
  const bytes = await readFile(new URL('../assets/field/zombie.glb', import.meta.url));
  const length = bytes.readUInt32LE(12);
  const json = JSON.parse(bytes.subarray(20, 20 + length));
  delete json.images; delete json.textures; delete json.materials;
  json.meshes.forEach(mesh => mesh.primitives.forEach(primitive => delete primitive.material));
  json.buffers[0].uri = 'data:application/octet-stream;base64,' + bytes.subarray(28 + length).toString('base64');
  globalThis.ProgressEvent ||= class { constructor(type, properties) { this.type = type; Object.assign(this, properties); } };
  const gltf = await new GLTFLoader().parseAsync(JSON.stringify(json), '');
  const group = new THREE.Group();
  const adapter = attachZombieModel(group, gltf);
  const game = {enemy:{state:'stalk', stateStartedAt:0, timer:0, x:0, z:0}, player:{health:100}, interaction:null};
  return {group, adapter, game, gltf};
}

test('real rig binds and preserves its only source clip and child motion', async () => {
  const h = await fixture();
  const original = h.gltf.animations[0].tracks.map(track => [...track.values]);
  h.adapter.update(h.game, .5);
  assert.equal(h.adapter.diagnostics().joints, 56);
  assert.deepEqual(h.gltf.animations[0].tracks.map(track => [...track.values]), original);
  assert.equal(h.adapter.diagnostics().externalClipsIntegrated, false);
});

test('inverted charge articulates spine and places four finite contacts near the floor', async () => {
  const h = await fixture();
  Object.assign(h.game.enemy, {state:'rage_chase', stateStartedAt:0});
  h.adapter.update(h.game, 1);
  const pose = h.adapter.diagnostics();
  assert.equal(pose.pose, 'inverted');
  assert(pose.head[1] < 1.1, JSON.stringify(pose));
  for (const contact of [...pose.hands, ...pose.feet]) {
    assert(contact.every(Number.isFinite));
    assert(contact[1] > -.08 && contact[1] < .3, JSON.stringify(pose));
  }
  assert.equal(h.group.children[0].rotation.x, 0);
  assert.equal(h.group.children[0].rotation.z, 0);
});

test('stagger collapse fits the authoritative short timer and returns upright', () => {
  const sample = time => zombiePoseState({state:'staggered', stateStartedAt:0, timer:3-time}, time);
  assert.equal(sample(0).eyes, 'burst');
  assert.equal(sample(1).weight, 1);
  assert(sample(2.9).weight < .1);
  assert.equal(sample(3).weight, 0);
});

test('recovery pose reads the fixed deadline and never mutates gameplay', async () => {
  const h = await fixture();
  h.game.interaction = {phase:'recovery', phaseStartedAt:0, recoveryDeadline:10};
  const before = JSON.stringify(h.game);
  h.adapter.update(h.game, 8);
  assert.equal(h.adapter.diagnostics().pose, 'fetal');
  assert.equal(JSON.stringify(h.game), before);
  assert.equal(zombiePoseState(h.game.enemy, 10, h.game).weight, 0);
});

test('pause samples remain identical and repeated updates cannot accumulate bone offsets', async () => {
  const h = await fixture();
  h.adapter.update(h.game, 2);
  const before = h.adapter.diagnostics();
  for (let i = 0; i < 30; i++) h.adapter.update(h.game, 2);
  assert.deepEqual(h.adapter.diagnostics(), before);
  for (let i = 0; i < 20; i++) h.adapter.update(h.game, 2 + i / 60);
  assert(h.adapter.diagnostics().head.every(Number.isFinite));
});

test('eyes are attached to the real head, depth tested, and follow world transforms', async () => {
  const h = await fixture();
  h.adapter.update(h.game, 1);
  const eye = h.group.getObjectByName('Creature left eye');
  assert.equal(eye.parent.name, 'Bip01_Head');
  assert.equal(eye.material.depthTest, true);
  h.group.updateMatrixWorld(true);
  const outward = new THREE.Vector3(0, 1, 0).transformDirection(eye.parent.matrixWorld);
  const origin = h.adapter.getEyeWorld().clone().addScaledVector(outward, .3);
  const ray = new THREE.Raycaster(origin, outward.negate(), 0, .4);
  assert.equal(ray.intersectObject(h.adapter.model, true)[0]?.object, eye, 'The face must not bury the eye glow');
  const before = h.adapter.getEyeWorld().clone();
  h.group.position.x = 5;
  assert(Math.abs(h.adapter.getEyeWorld().x - before.x - 5) < 1e-6);
});

test('tackle, struggle, eye stab, throw and recovery use one presentation owner', async () => {
  const h = await fixture();
  for (const [phase, name] of [['tackle','tackle'], ['qte','grapple'], ['stab','stab'], ['throw','throw'], ['recovery','fetal']]) {
    h.game.interaction = {phase, phaseStartedAt:0, presses:4, targetPresses:8, recoveryDeadline:10};
    h.adapter.update(h.game.enemy, .2, h.game);
    assert.equal(h.adapter.diagnostics().pose, name);
    assert(h.adapter.getEyeWorld().toArray().every(Number.isFinite));
  }
});

test('clock rewind clears locomotion phase for a restart', async () => {
  const h = await fixture();
  h.adapter.update(h.game, 0);
  const initial = h.adapter.diagnostics();
  h.game.enemy.x = 3;
  h.adapter.update(h.game, 2);
  h.game.enemy.x = 0;
  h.adapter.update(h.game, 0);
  assert.deepEqual(h.adapter.diagnostics(), initial);
});
