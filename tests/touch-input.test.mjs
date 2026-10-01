import test from 'node:test';
import assert from 'node:assert/strict';
import {createTouchInput} from '../src/touch-input.js';
import {eventTarget, createHarness} from './helpers/browser.mjs';

function fixture() {
  const nodes = new Map();
  const node = id => {
    if (!nodes.has(id)) nodes.set(id, {
      ...eventTarget(), style: {setProperty() {}},
      getBoundingClientRect: () => ({left: 0, top: 0, width: 124, height: 124}),
    });
    return nodes.get(id);
  };
  let pauses = 0;
  const input = createTouchInput({document: {getElementById: node}, isPlaying: () => true, onPause: () => pauses++});
  const send = (id, type, pointerId, x = 62, y = 62) => node(id).dispatch(type, {pointerId, clientX: x, clientY: y, button: 0});
  return {input, node, send, read: () => input.read({yaw: 0, pitch: 0}), pauses: () => pauses};
}

test('touch supports movement, look and fire together with one shot per tap', () => {
  const h = fixture();
  h.send('move-stick', 'pointerdown', 1, 62, 20);
  h.send('look-zone', 'pointerdown', 2, 400, 100);
  h.send('look-zone', 'pointermove', 2, 425, 110);
  h.send('touch-fire', 'pointerdown', 3);
  const first = h.read(), held = h.read();
  assert.ok(first.forward > 0.9); assert.equal(first.movementIntent, true);
  assert.equal(first.yaw, -0.1); assert.equal(first.pitch, -0.04);
  assert.equal(first.fire, true); assert.equal(held.fire, false);
  assert.equal(held.lookDelta, 0); assert.ok(held.forward > 0.9);
  h.send('move-stick', 'pointerup', 1);
  assert.equal(h.read().movementIntent, false);
});

test('action fingers and static joystick contact never count as hiding movement', () => {
  const h = fixture();
  h.send('move-stick', 'pointerdown', 1, 64, 64);
  h.send('touch-interact', 'pointerdown', 2);
  h.send('touch-interact', 'pointermove', 2, 100, 120);
  const value = h.read();
  assert.equal(value.interact, true); assert.equal(value.lookDelta, 0);
  assert.equal(value.movementIntent, false);
  h.send('look-zone', 'pointerdown', 3, 400, 100);
  h.send('look-zone', 'pointermove', 3, 403, 100);
  h.send('look-zone', 'pointermove', 3, 400, 100);
  const look = h.read();
  assert.equal(look.yaw, 0); assert.equal(look.lookDelta, 6);
});

test('a second finger cannot steal the movement role', () => {
  const h = fixture();
  h.send('move-stick', 'pointerdown', 1, 62, 20);
  h.send('move-stick', 'pointerdown', 2, 62, 104);
  h.send('move-stick', 'pointermove', 2, 62, 104);
  h.send('move-stick', 'pointerup', 2);
  assert.ok(h.read().forward > 0.9);
});

test('brief joystick movement retains hiding evidence through return or release before a tick', () => {
  for (const release of [false, true]) {
    const h = fixture();
    h.send('move-stick', 'pointerdown', 1);
    h.send('move-stick', 'pointermove', 1, 62, 20);
    h.send('move-stick', 'pointermove', 1, 62, 62);
    if (release) h.send('move-stick', 'pointerup', 1);
    const value = h.read();
    assert.equal(value.forward, 0); assert.equal(value.movementIntent, true);
    assert.equal(h.read().movementIntent, false);
  }
});

test('cancel, lost capture and clear remove held movement and pending actions', () => {
  for (const type of ['pointercancel', 'lostpointercapture', 'clear']) {
    const h = fixture();
    h.send('move-stick', 'pointerdown', 1, 62, 20);
    h.send('touch-fire', 'pointerdown', 2);
    if (type === 'clear') h.input.clear(); else h.send('move-stick', type, 1);
    const value = h.read();
    assert.equal(value.movementIntent, false); assert.equal(value.fire, false);
  }
});

test('touch dispose removes handlers and resets controls', () => {
  const h = fixture();
  h.send('touch-pause', 'pointerdown', 1); assert.equal(h.pauses(), 1);
  h.input.dispose();
  for (const id of ['move-stick', 'look-zone', 'touch-fire', 'touch-interact', 'touch-light', 'touch-pause']) assert.equal(h.node(id).listenerCount(), 0);
});

test('joystick outer edge sprints and releasing or cancelling immediately stops it',()=>{
  const h=fixture();h.send('move-stick','pointerdown',1,62,42);assert.equal(h.read().sprint,false);
  h.send('move-stick','pointermove',1,62,20);assert.equal(h.read().sprint,true);
  h.send('move-stick','pointerup',1);assert.equal(h.read().sprint,false);
  h.send('move-stick','pointerdown',2,62,20);assert.equal(h.read().sprint,true);
  h.send('move-stick','pointercancel',2);assert.equal(h.read().sprint,false);
});

test('touch start/resume ignores unavailable mouse capture and capture error events', async () => {
  const h = createHarness({touch: true, denyLock: true});
  await h.app.enter();
  assert.equal(h.app.snapshot().mode, 'playing'); assert.equal(h.audio.ctx.state, 'running');
  assert.equal(h.document.pointerLockElement, null);
  h.document.dispatch('pointerlockchange'); h.document.dispatch('pointerlockerror');
  assert.equal(h.app.snapshot().mode, 'playing');
  h.node('touch-fire').dispatch('pointerdown', {pointerId: 1});
  h.app.advance(1000);
  assert.equal(h.app.snapshot().metrics.shotsFired, 1);
  h.node('touch-pause').dispatch('pointerdown', {pointerId: 2});
  assert.equal(h.app.snapshot().mode, 'paused');
  await h.app.enter(); h.app.advance(1000);
  assert.equal(h.app.snapshot().metrics.shotsFired, 1);
});

test('portrait blocks entry and pauses gameplay; rotation back requires explicit resume', async () => {
  const h = createHarness({touch: true, width: 390, height: 844});
  await h.app.enter(); assert.equal(h.app.snapshot().mode, 'menu');
  assert.equal(h.node('rotate').hidden, false);
  Object.assign(h.window, {innerWidth: 844, innerHeight: 390}); h.window.dispatch('resize');
  assert.equal(h.node('rotate').hidden, true);
  await h.app.enter(); assert.equal(h.app.snapshot().mode, 'playing');
  Object.assign(h.window, {innerWidth: 390, innerHeight: 844}); h.window.dispatch('resize');
  assert.equal(h.app.snapshot().mode, 'paused');
  Object.assign(h.window, {innerWidth: 844, innerHeight: 390}); h.window.dispatch('resize');
  assert.equal(h.app.snapshot().mode, 'paused');
});

test('touch restart, background and orientation clear held movement', async () => {
  const h = createHarness({touch: true}); await h.app.enter();
  const move = () => h.node('move-stick').dispatch('pointerdown', {pointerId: 1, clientX: 62, clientY: 20});
  for (const cause of ['restart', 'background', 'orientation']) {
    move();
    if (cause === 'restart') await h.app.restart();
    if (cause === 'background') { h.document.hidden = true; h.document.dispatch('visibilitychange'); h.document.hidden = false; await h.app.enter(); }
    if (cause === 'orientation') { h.window.dispatch('orientationchange'); await h.app.enter(); }
    h.app.advance(100);
    assert.equal(h.app.snapshot().player.moving, false);
  }
});
