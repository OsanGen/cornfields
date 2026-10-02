import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {zombieBeamState, clipZombieBeam, createZombieBeams} from '../src/zombie-beams.js';
import {attachZombieModel} from '../src/zombie.js';

const enemy = (state = 'chase') => ({state, stateStartedAt:0, active:true, visible:true, zone:'corridor', x:1, z:1});
const game = state => ({enemy:enemy(state), mode:'playing', player:{zone:'corridor', health:100}, interaction:null});

test('beams honor eye activation delays and turn off for recovery, trial, QTE and other zones', () => {
  for (const [state, time, active] of [['chase', 0, true], ['rage_chase', 2, true], ['corn_rush', 1, true], ['detection_tell', .07, false], ['detection_tell', .09, true], ['flashlight_recoil', .44, false], ['flashlight_recoil', .46, true], ['staggered', .01, false], ['stalk', 1, false]]) {
    const g = game(state); assert.equal(zombieBeamState(g.enemy, time, g).active, active, `${state} at ${time}`);
  }
  for (const alteration of [g => {g.interaction = {phase:'qte'};}, g => {g.interaction = {phase:'recovery'};}, g => {g.player.zone = 'field';}, g => {g.enemy.active = false;}, g => {g.mode = 'dead';}, g => {g.enemy.visible = false;}]) {
    const g = game(); alteration(g); const snapshot = JSON.stringify(g);
    assert.equal(zombieBeamState(g.enemy, 1, g).active, false); assert.equal(JSON.stringify(g), snapshot);
  }
  const g = game(); assert.equal(zombieBeamState(g.enemy, 1, g, {trial:true}).active, false);
  assert.equal(zombieBeamState(g.enemy, 1, g, {suppressed:true}).active, false);
});

test('sweeps are deterministic, rage is more restless, and reduced effects remain dim and steady', () => {
  const g = game('rage_chase'); const at = zombieBeamState(g.enemy, 7.25, g);
  for (let t = 0; t < 7; t += .017) zombieBeamState(g.enemy, t, g);
  assert.deepEqual(zombieBeamState(g.enemy, 7.25, g), at);
  let chase = 0, rage = 0, reduced = 0;
  for (let t = 0; t < 10; t += .1) {
    chase += zombieBeamState(enemy(), t).yaw ** 2;
    rage += zombieBeamState(g.enemy, t).yaw ** 2;
    const soft = zombieBeamState(g.enemy, t, g, {reduced:true}); reduced += soft.yaw ** 2;
    assert.equal(soft.noiseTime, 0); assert.ok(soft.intensity < at.intensity);
  }
  assert.ok(rage > chase * 4); assert.ok(reduced < rage * .1);
});

test('beam length stops ahead of solid cells and thin wooden boundaries, but crosses an open field', () => {
  const origin = new THREE.Vector3(1, 1, 1), direction = new THREE.Vector3(1, 0, 0);
  const maze = {grid:[[0,0,1],[0,0,1],[0,0,1]]};
  const distance = clipZombieBeam(maze, origin, direction, 7.2);
  assert.ok(distance >= 3.15 && distance <= 3.45, distance);
  const world = {width:6, height:6, size:1, walk:new Uint8Array(36).fill(1), buckets:new Map(), doorBuckets:new Map(), segments:[{a:{x:2,z:0},b:{x:2,z:6}}]};
  for (let id = 0; id < 36; id++) world.buckets.set(id, [0]);
  const thin = clipZombieBeam({cornWorld:world}, origin, direction, 4);
  assert.ok(thin > .6 && thin < .95, thin);
  const field = {cornWorld:{openField:true,activeDoor:0,doors:[{permanentOpen:true}]}};
  assert.equal(clipZombieBeam(field, origin, direction, 99), 7.2);
  assert.ok(clipZombieBeam(field, origin, new THREE.Vector3(0,-1,0), 5) < 1);
});

test('pooled cones track eye origins and face rotation, and copies add no real lights', () => {
  const space = new THREE.Group(), head = new THREE.Bone(); space.add(head); head.position.y = 1.5;
  const eyes = [-1,1].map(side => {const eye = new THREE.Object3D(); eye.position.set(.1,.13,side*.06); head.add(eye); return eye;});
  const beams = createZombieBeams({space,head,eyes,primary:false}), g = game();
  for (const yaw of [0,.9,-1.3]) {
    space.position.set(3,0,5); space.rotation.y = yaw; head.rotation.z = -.6;
    beams.update(g, 2); const data = beams.diagnostics();
    for (let index = 0; index < 2; index++) assert.ok(new THREE.Vector3().fromArray(data.origins[index]).distanceTo(eyes[index].getWorldPosition(new THREE.Vector3())) < 1e-8);
    const forward = new THREE.Vector3(0,1,0).transformDirection(head.matrixWorld);
    const cone = beams.root.getObjectByName('Creature eye beam 1');
    assert.ok(forward.dot(new THREE.Vector3(0,0,1).transformDirection(cone.matrixWorld)) > .97);
  }
  let lights = 0; space.traverse(object => {if (object.isLight) lights++;}); assert.equal(lights, 0);
  const count = beams.root.children.length; for (let i = 0; i < 40; i++) beams.update(g, i / 30);
  assert.equal(beams.root.children.length, count);
  beams.dispose(); beams.dispose(); assert.equal(space.getObjectByName('Creature eye searchlights'), undefined);
  assert.ok(eyes.every(eye => eye.children.length === 0));
});

test('real rig beams follow its inverted head and gate same-clock interactions without changing simulation', async () => {
  const bytes = await readFile(new URL('../assets/field/zombie.glb', import.meta.url));
  const length = bytes.readUInt32LE(12), json = JSON.parse(bytes.subarray(20, 20 + length));
  delete json.images; delete json.textures; delete json.materials;
  json.meshes.forEach(mesh => mesh.primitives.forEach(primitive => delete primitive.material));
  json.buffers[0].uri = 'data:application/octet-stream;base64,' + bytes.subarray(28 + length).toString('base64');
  globalThis.ProgressEvent ||= class {constructor(type, properties) {this.type = type; Object.assign(this, properties);}};
  const gltf = await new GLTFLoader().parseAsync(JSON.stringify(json), ''), space = new THREE.Group();
  const adapter = attachZombieModel(space, gltf), g = game('rage_chase');
  const before = JSON.stringify(g); adapter.update(g, 1, {reduced:true});
  const data = adapter.diagnostics(); assert.equal(data.beams.active, true); assert.equal(data.beams.reduced, true);
  assert.ok(data.beams.lightIntensity > 0); assert.equal(JSON.stringify(g), before);
  for (const [index, side] of ['left','right'].entries()) assert.ok(adapter.getEyeWorld(side).distanceTo(new THREE.Vector3().fromArray(data.beams.origins[index])) < 1e-8);
  g.player.zone = 'field'; adapter.update(g, 1); assert.equal(adapter.diagnostics().beams.active, false);
  g.player.zone = 'corridor'; adapter.trial('walk'); adapter.update(g, 1); assert.equal(adapter.diagnostics().beams.active, false);
  adapter.dispose();
});
