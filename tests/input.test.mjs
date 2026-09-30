import test from 'node:test';
import assert from 'node:assert/strict';
import {createInput} from '../src/input.js';
import {eventTarget} from './helpers/browser.mjs';

function inputFixture() {
  const document = eventTarget(), canvas = eventTarget();
  document.pointerLockElement = canvas;
  const input = createInput({
    document, canvas, isPlaying: () => true, onPause() {}, onMute() {},
  });
  const key = code => document.dispatch('keydown', {code});
  const read = () => input.read({yaw: 0, pitch: 0});
  return {input, document, canvas, key, read};
}

test('opposite held keys retain movement intent even with a zero vector', () => {
  for (const pair of [['KeyW', 'KeyS'], ['KeyA', 'KeyD']]) {
    const h = inputFixture();
    pair.forEach(h.key);
    const value = h.read();
    assert.equal(value.forward, 0);
    assert.equal(value.strafe, 0);
    assert.equal(value.movementIntent, true);
    assert.equal(h.read().movementIntent, true);
    h.input.clear();
    assert.equal(h.read().movementIntent, false);
  }
});

test('actions are consumed once while held movement persists', () => {
  const h = inputFixture();
  h.key('KeyW'); h.key('KeyF'); h.key('KeyE');
  h.canvas.dispatch('mousedown', {button: 0});
  const first = h.read(), second = h.read();
  for (const edge of ['fire', 'flashlight', 'interact']) {
    assert.equal(first[edge], true);
    assert.equal(second[edge], false);
  }
  assert.equal(second.forward, 1);
});

test('opposite mouse deltas preserve raw movement evidence', () => {
  const h = inputFixture();
  h.document.dispatch('mousemove', {movementX: 2, movementY: 0});
  h.document.dispatch('mousemove', {movementX: -2, movementY: 0});
  const value = h.read();
  assert.equal(value.yaw, 0);
  assert.equal(value.lookDelta, 4);
  assert.equal(h.read().lookDelta, 0);
});

test('key repeats and form controls do not queue gameplay actions', () => {
  const h = inputFixture();
  h.document.dispatch('keydown', {code: 'KeyF', repeat: true});
  h.document.dispatch('keydown', {code: 'KeyE', target: {tagName: 'INPUT'}});
  assert.equal(h.read().flashlight, false);
  assert.equal(h.read().interact, false);
});

test('disposing input removes its browser listeners', () => {
  const h = inputFixture();
  h.input.dispose();
  assert.equal(h.document.listenerCount(), 0);
  assert.equal(h.canvas.listenerCount(), 0);
});
