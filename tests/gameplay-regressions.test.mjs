import test from 'node:test';
import assert from 'node:assert/strict';
import { centerOf } from '../src/maze.js';
import { leaveCorn } from '../src/hiding.js';
import { GAME_CONFIG as C, addEvidence } from '../src/game-config.js';
import { STEP, playingScenario, nearCornScenario, hiddenScenario, advance, navigationState } from './helpers/scenarios.mjs';

test('checkpoint refreshes an already active disengage reason and full timer', () => {
  const game = playingScenario();
  Object.assign(game.player, game.maze.checkpoints[0]);
  Object.assign(game.enemy, { state: 'disengage', reason: 'false_withdrawal', timer: .1 });
  advance(game, STEP);
  assert.equal(game.enemy.state, 'disengage');
  assert.equal(game.enemy.reason, 'checkpoint_grace');
  assert.ok(game.enemy.timer > 2.9);
});

for (const [name, action] of [
  ['flashlight', { flashlight: true }],
  ['fire', { fire: true }],
  ['held movement', { movementIntent: true, forward: 0, strafe: 0 }],
]) {
  test(`corn entry plus ${name} reveals the new hiding episode immediately`, () => {
    const game = nearCornScenario();
    advance(game, STEP, { interact: true, ...action });
    assert.equal(game.player.hidden, true);
    assert.equal(game.metrics.hidesDetected, 1);
    assert.equal(game.enemy.memory.anchorId, game.player.hideAnchorId);
    assert.equal(game.enemy.state, 'corn_rush');
  });
}

test('opposing held movement keys still rustle while hidden', () => {
  const game = hiddenScenario();
  advance(game, STEP, { forward: 0, strafe: 0, movementIntent: true });
  assert.equal(game.metrics.hidesDetected, 1);
  assert.equal(game.enemy.state, 'corn_rush');
});

test('mouse aiming before corn entry is not replayed as hidden movement', () => {
  const game = nearCornScenario();
  advance(game, STEP, { interact: true, yaw: 1, lookDelta: 5 });
  assert.equal(game.player.hidden, true);
  assert.equal(game.metrics.hidesDetected, 0);
});

test('unheard unseen corn exit does not change a remote enemy decision', () => {
  const hidden = hiddenScenario(), exited = hiddenScenario();
  for (const game of [hidden, exited]) advance(game, STEP, { forward: 1 });
  leaveCorn(exited, []);
  for (const game of [hidden, exited]) advance(game, STEP);
  assert.deepEqual(navigationState(exited), navigationState(hidden));
});

test('stagger recovery uses remembered hide evidence rather than remote current occupancy', () => {
  const hidden = hiddenScenario(), exited = hiddenScenario();
  for (const game of [hidden, exited]) {
    advance(game, STEP, { forward: 1 });
    game.enemy.state = 'staggered';
    game.enemy.timer = STEP;
  }
  leaveCorn(exited, []);
  for (const game of [hidden, exited]) advance(game, STEP);
  assert.equal(hidden.enemy.state, 'corn_rush');
  assert.deepEqual(navigationState(exited), navigationState(hidden));
});

test('rage predictions never overwrite the last confirmed observation', () => {
  const game = hiddenScenario();
  const confirmed = centerOf(3, 20);
  Object.assign(game.enemy, { ...confirmed, state: 'rage_chase', target: { ...confirmed } });
  game.enemy.memory.lastKnown = { ...confirmed };
  game.enemy.memory.lastHeard = { ...confirmed };
  game.enemy.memory.lastHeardAt = game.elapsed;
  const observation = { source: 'rustle', position: { ...confirmed }, at: game.elapsed, anchorId: null };
  game.enemy.memory.lastObservation = structuredClone(observation);
  advance(game, STEP);
  assert.ok(game.metrics.predictions > 0);
  assert.deepEqual(game.enemy.memory.lastKnown, confirmed);
  assert.deepEqual(game.enemy.memory.lastObservation, observation);
  assert.notDeepEqual(game.enemy.target, confirmed);
});

test('new audible evidence replaces a rage prediction with a confirmed target', () => {
  const game = hiddenScenario();
  const observed = centerOf(3, 20), next = centerOf(17, 3);
  Object.assign(game.enemy, { ...observed, state: 'rage_chase', target: centerOf(3, 17) });
  game.enemy.memory.lastKnown = { ...observed };
  addEvidence(game, 'gunshot', next, 100, 4);
  advance(game, STEP);
  assert.deepEqual(game.enemy.target, next);
  assert.deepEqual(game.enemy.memory.lastKnown, next);
  assert.equal(game.enemy.memory.lastObservation.source, 'gunshot');
});

test('an abandoned hide is discovered only when the enemy inspects its pocket', () => {
  const game = hiddenScenario();
  advance(game, STEP, { forward: 1 });
  leaveCorn(game, []);
  advance(game, STEP);
  assert.equal(game.enemy.state, 'corn_rush');

  // Fixture arrival at the physical inspection point, outside sight of the escaped player.
  const anchor = game.maze.hideAnchors[0];
  Object.assign(game.player, centerOf(7, 23));
  Object.assign(game.enemy, { x: anchor.x, z: anchor.z, ingressDepth: C.hiding.pocketDepth - .1 });
  advance(game, STEP);
  assert.equal(game.enemy.state, 'investigate');
  assert.equal(game.enemy.reason, 'hide_searched_empty');
  assert.equal(game.enemy.memory.anchorId, null);
});

test('a second valid hit refreshes the full stagger through the shared transition', () => {
  const game = playingScenario();
  advance(game, STEP, { fire: true });
  advance(game, 1);
  advance(game, STEP, { fire: true });
  assert.equal(game.enemy.reason, 'shot_hit');
  assert.ok(game.enemy.timer > C.zombie.staggerSecondsByTier[0] - .02);
  advance(game, C.zombie.staggerSecondsByTier[0] - .05);
  assert.equal(game.enemy.state, 'staggered');
  advance(game, .08);
  assert.notEqual(game.enemy.state, 'staggered');
});

test('repeated shots permit real timed recovery without manually clearing cooldowns', () => {
  const game = playingScenario();
  for (let shot = 0; shot < C.player.startAmmo; shot++) {
    advance(game, STEP, { fire: true });
    assert.equal(game.enemy.state, 'staggered');
    advance(game, C.zombie.staggerSecondsByTier[0] - .05);
    assert.equal(game.enemy.state, 'staggered');
    advance(game, .08);
    assert.notEqual(game.enemy.state, 'staggered');
    assert.equal(game.enemy.visible, true);
    assert.equal(game.enemy.health, undefined);
  }
  assert.equal(game.player.ammo, 0);
  assert.equal(game.metrics.shotsHit, 2);
});
