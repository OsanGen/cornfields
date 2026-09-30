import test from 'node:test';
import assert from 'node:assert/strict';
import { centerOf } from '../src/maze.js';
import { hiddenInput, updateCornPresence } from '../src/hiding.js';
import { senseZombie } from '../src/zombie-ai.js';
import { blocksFor } from '../src/game.js';
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

for(const [name,action] of [
  ['flashlight',{flashlight:true}],['fire',{fire:true}],['opposing held keys',{movementIntent:true}],
]){
  test(`corn ${name} creates local evidence without informing a remote enemy`,()=>{
    const game=hiddenScenario();hiddenInput(game,action);
    assert.equal(game.evidence.at(-1).type,'rustle');
    senseZombie(game,blocksFor(game));
    assert.equal(game.enemy.memory.lastKnown,null);
  });
}
test('mouse aiming outside corn is not replayed on a later silent entry',()=>{
  const game=nearCornScenario();advance(game,STEP,{yaw:1,lookDelta:5});
  assert.equal(game.metrics.hidesEntered,0);assert.equal(game.enemy.memory.lastKnown,null);
});
test('unheard unseen corn exit does not change a remote enemy decision',()=>{
  const hidden=hiddenScenario(),exited=hiddenScenario();
  Object.assign(exited.player,centerOf(3,23));updateCornPresence(exited,{});
  for(const game of [hidden,exited])advance(game,STEP);
  assert.deepEqual(navigationState(exited),navigationState(hidden));
});
test('stagger recovery uses remembered corn evidence regardless of remote occupancy',()=>{
  const hidden=hiddenScenario(),exited=hiddenScenario();
  for(const game of [hidden,exited]){
    game.enemy.memory.lastKnown={x:game.player.x,z:game.player.z};
    game.enemy.memory.lastHeardAt=game.elapsed;
    game.enemy.state='staggered';game.enemy.timer=STEP;
  }
  Object.assign(exited.player,centerOf(3,23));updateCornPresence(exited,{});
  for(const game of [hidden,exited])advance(game,STEP);
  assert.equal(hidden.enemy.state,'corn_rush');
  assert.deepEqual(navigationState(exited),navigationState(hidden));
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

test('arrival at stale sound starts search without reading the escaped player position',()=>{
  const game=hiddenScenario(),known={x:game.player.x,z:game.player.z};
  Object.assign(game.player,centerOf(29,3));updateCornPresence(game,{});
  Object.assign(game.enemy,known,{state:'corn_rush',target:{...known}});
  game.enemy.memory.lastKnown={...known};game.enemy.memory.lastHeardAt=game.elapsed;
  advance(game,STEP);
  assert.equal(game.enemy.state,'predictive_search');
  assert.deepEqual(game.enemy.memory.lastKnown,known);
});

test('a second valid hit does not refresh the committed short stagger', () => {
  const game = playingScenario();
  advance(game, STEP, { fire: true });
  advance(game, 1);
  const remaining=game.enemy.timer;
  game.player.pitch=Math.atan2(.5-C.player.eyeHeight,Math.hypot(game.enemy.x-game.player.x,game.enemy.z-game.player.z));
  advance(game, STEP, { fire: true });
  assert.equal(game.enemy.reason, 'shot_hit');
  assert.ok(Math.abs(game.enemy.timer-(remaining-STEP))<1e-7);
  assert.equal(game.metrics.shotsHit,2);
  advance(game, remaining-STEP-.05);
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
