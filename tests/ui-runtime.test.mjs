import test from 'node:test';
import assert from 'node:assert/strict';
import {createHarness} from './helpers/browser.mjs';

test('denied pointer lock leaves both game and sound paused', async () => {
  const h = createHarness({denyLock: true});
  await h.app.enter();
  assert.equal(h.app.snapshot().mode, 'paused');
  assert.equal(h.audio.ctx.state, 'suspended');
});

test('one fire click consumes one round across 60 catch-up steps', async () => {
  const h = createHarness();
  await h.app.enter();
  h.fire(); h.app.advance(1000);
  assert.equal(h.app.snapshot().player.ammo, 1);
  assert.equal(h.app.snapshot().metrics.shotsFired, 1);
});

test('one flashlight key edge toggles once and all stepping updates audio', async () => {
  const h = createHarness();
  await h.app.enter();
  h.key('KeyF'); h.app.advance(1000);
  assert.equal(h.app.snapshot().player.flashlightOn, false);
  const before = h.audio.ticks;
  h.app.step(0.1, {});
  assert.equal(h.audio.ticks - before, 6);
});

test('pause clears queued shots and movement before resuming', async () => {
  const h = createHarness();
  await h.app.enter();
  h.fire(); h.key('KeyW'); h.key('Escape');
  const paused = h.app.snapshot();
  h.app.advance(1000);
  assert.deepEqual(h.app.snapshot(), paused);
  await h.app.enter();
  h.app.advance(1000);
  assert.equal(h.app.snapshot().player.ammo, 2);
  assert.equal(h.app.snapshot().player.moving, false);
});

test('real restart resets the changed run and restores realtime advancement', async () => {
  const h = createHarness();
  await h.app.enter();
  h.app.startLoop();
  h.app.step(0.8, {forward: 1, fire: true, flashlight: true});
  assert.equal(h.app.snapshot().player.ammo, 1);
  h.key('Escape'); h.click('restart-btn'); await h.flush();
  const fresh = h.app.snapshot();
  assert.equal(fresh.mode, 'playing');
  assert.equal(fresh.elapsed, 0);
  assert.equal(fresh.player.ammo, 2);
  assert.equal(fresh.player.health, 100);
  assert.equal(fresh.player.hidden, false);
  assert.equal(fresh.metrics.shotsFired, 0);
  assert.deepEqual(fresh.progress.activatedCheckpoints, []);
  assert.equal(h.audio.resets, 1);
  h.frame(100);
  assert.ok(h.app.snapshot().elapsed > 0);
});

test('real frames and deterministic stepping agree on game and audio', async () => {
  const live = createHarness(), stepped = createHarness();
  await live.app.enter(); await stepped.app.enter();
  live.app.startLoop(); live.key('KeyW');
  for (let time = 100; time <= 500; time += 100) live.frame(time);
  stepped.app.step(0.5, {forward: 1, movementIntent: true});
  assert.deepEqual(live.app.snapshot(), stepped.app.snapshot());
  assert.equal(live.audio.ticks, stepped.audio.ticks);
});

test('blur pauses gameplay and a delayed audio unlock cannot unpause it', async () => {
  let release;
  const h = createHarness({audioUnlock: () => new Promise(resolve => { release = resolve; })});
  const entering = h.app.enter();
  h.window.dispatch('blur');
  release(); await entering;
  assert.equal(h.app.snapshot().mode, 'paused');
  assert.equal(h.audio.ctx.state, 'suspended');
});

test('an old capture rejection cannot pause a later successful entry', async () => {
  let rejectFirst, attempts = 0;
  const h = createHarness({lockRequest: () => ++attempts === 1
    ? new Promise((_, reject) => { rejectFirst = reject; }) : Promise.resolve()});
  await h.app.enter();
  h.app.pause();
  await h.app.enter();
  rejectFirst(new Error('Old request')); await h.flush();
  assert.equal(h.app.snapshot().mode, 'playing');
});

test('settings, pointer loss and visibility use the real runtime handlers', async () => {
  const h = createHarness();
  await h.app.enter();
  h.node('motion').dispatch('change', {target: {checked: true}});
  h.node('volume').dispatch('input', {target: {value: '25'}});
  assert.equal(h.app.diagnostics().reducedMotion, true);
  assert.equal(h.audio.volume, 0.25);
  h.document.exitPointerLock();
  assert.equal(h.app.snapshot().mode, 'paused');
  await h.app.enter();
  h.document.hidden = true;
  h.document.dispatch('visibilitychange');
  assert.equal(h.app.snapshot().mode, 'paused');
});

test('a delayed capture-error event cannot cancel an acquired mouse lock', async () => {
  const h = createHarness();
  await h.app.enter();
  h.document.dispatch('pointerlockerror');
  assert.equal(h.app.snapshot().mode, 'playing');
  h.document.pointerLockElement = null;
  h.document.dispatch('pointerlockerror');
  assert.equal(h.app.snapshot().mode, 'paused');
});

test('dispose cancels frames and removes runtime and input listeners', async () => {
  const h = createHarness();
  await h.app.enter(); h.app.startLoop();
  h.app.dispose(); h.app.dispose();
  assert.equal(h.frames.size, 0);
  assert.equal(h.window.listenerCount(), 0);
  assert.equal(h.document.listenerCount(), 0);
  assert.equal(h.node('scene').listenerCount(), 0);
  assert.equal(h.audio.ctx.state, 'suspended');
});
