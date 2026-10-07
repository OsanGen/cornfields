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

// A boundary adapter records the real runtime's accepted traversal without changing game state.
async function breathingHarness(options={}){
  const {createPlayerBreathing,playerBreathingAllowed}=await import('../src/player-breathing.js');
  const h=createHarness({corridors:true,...options}),model=createPlayerBreathing(),samples=[];
  h.audio.stopPlayerBreathing=()=>model.reset();
  const pause=h.audio.pause.bind(h.audio),reset=h.audio.reset.bind(h.audio);
  h.audio.pause=()=>{model.reset();pause();};h.audio.reset=()=>{model.reset();reset();};
  h.audio.updatePlayerBreathing=(game,dt,{distance,visible})=>{
    const allowed=visible&&!h.audio.muted&&game.mode==='playing'&&playerBreathingAllowed(game);
    samples.push({distance,dt,allowed,phase:game.survivalEnding?.phase,interaction:game.interaction?.phase});
    if(allowed)model.update(distance,dt);else model.reset();
  };
  return {...h,breathing:model,samples};
}

test('breathing sees collision-resolved distance, never wall pushing or camera movement',async()=>{
  const h=await breathingHarness();await h.app.enter();h.app.fixture('viewmodel');
  h.app.step(1,{yaw:.3,pitch:.1,lookDelta:80});
  assert.equal(h.breathing.snapshot().effort,0);assert.ok(h.samples.every(s=>s.distance===0));
  h.app.step(20,{forward:1,yaw:0});const position=h.app.snapshot().player;
  const before=h.samples.length;h.app.step(10,{forward:1,yaw:0});
  assert.equal(h.app.snapshot().player.x,position.x);assert.equal(h.app.snapshot().player.z,position.z);assert.ok(h.samples.slice(before).every(s=>s.distance===0));
  assert.notEqual(h.breathing.snapshot().state,'exerted');h.app.dispose();
});

test('diagonal movement has no breathing advantage and neither path changes gameplay',async()=>{
  const cardinal=await breathingHarness(),diagonal=await breathingHarness();
  for(const h of [cardinal,diagonal]){await h.app.enter();h.app.fixture('field');}
  cardinal.app.step(1,{forward:1});diagonal.app.step(1,{forward:1,strafe:1});
  assert.ok(Math.abs(cardinal.breathing.snapshot().effort-diagonal.breathing.snapshot().effort)<1e-10);
  const sum=h=>h.samples.reduce((total,s)=>total+s.distance,0);assert.ok(Math.abs(sum(cardinal)-sum(diagonal))<1e-9);
  const plain=createHarness({corridors:true});await plain.app.enter();plain.app.fixture('field');plain.app.step(1,{forward:1});
  assert.deepEqual(cardinal.app.snapshot(),plain.app.snapshot());
  cardinal.app.dispose();diagonal.app.dispose();plain.app.dispose();
});

test('breathing agrees between 30/60/120 rendered frames and fixed simulation stepping',async()=>{
  const results=[];
  for(const hz of [30,60,120]){
    const h=await breathingHarness();h.maze.spawn={...h.maze.corridorLayout.sections[3].anchor};await h.app.restart();h.app.startLoop();h.key('KeyW');
    for(let i=1;i<=hz*2;i++)h.frame(i*1000/hz);
    results.push({breathing:h.breathing.snapshot(),game:h.app.snapshot()});h.app.dispose();
  }
  const stepped=await breathingHarness();stepped.maze.spawn={...stepped.maze.corridorLayout.sections[3].anchor};await stepped.app.restart();stepped.app.step(2,{forward:1,movementIntent:true});
  results.push({breathing:stepped.breathing.snapshot(),game:stepped.app.snapshot()});stepped.app.dispose();
  assert.ok(results[0].breathing.effort>0,'frame-rate comparison must exercise active breathing');
  for(const result of results){assert.deepEqual(result.game,results[0].game);assert.deepEqual(result.breathing,results[0].breathing);}
});

test('breathing resets through pause, focus, page lifecycle, restart and title exit',async()=>{
  for(const interrupt of [h=>h.app.pause(),h=>h.window.dispatch('blur'),h=>h.window.dispatch('pagehide'),h=>{h.document.hidden=true;h.document.dispatch('visibilitychange');}]){
    const h=await breathingHarness();await h.app.enter();h.app.fixture('viewmodel');h.app.step(.7,{forward:1});
    assert.ok(h.breathing.snapshot().effort>0);interrupt(h);assert.equal(h.breathing.snapshot().effort,0);
    h.app.step(2,{forward:1});assert.equal(h.breathing.snapshot().effort,0);h.document.hidden=false;
    await h.app.restart();assert.equal(h.breathing.snapshot().effort,0);h.app.fixture('viewmodel');h.app.step(.7,{forward:1});
    h.click('title-btn');assert.equal(h.breathing.snapshot().effort,0);h.app.dispose();
  }
});

test('arrival, grapple, story transition, death and opening replay cannot retain breathing',async()=>{
  const arrival=await breathingHarness({ending:true});await arrival.app.enter();arrival.app.step(.5,{forward:1});
  assert.ok(arrival.samples.every(s=>!s.allowed));assert.equal(arrival.breathing.snapshot().effort,0);arrival.app.dispose();
  const h=await breathingHarness({ending:true});await h.app.enter();h.app.fixture('viewmodel');h.app.step(.7,{forward:1});
  h.app.fixture('survival-expire');h.app.step(.05);
  assert.equal(h.samples.at(-1).phase,'transform');assert.equal(h.samples.at(-1).allowed,false);assert.equal(h.breathing.snapshot().effort,0);
  const grapple=await breathingHarness();await grapple.app.enter();grapple.app.fixture('encounter');grapple.app.step(.5);
  assert.ok(grapple.samples.some(s=>s.interaction));assert.equal(grapple.breathing.snapshot().effort,0);grapple.app.dispose();
  h.app.fixture('survival-death');h.app.step(10);assert.equal(h.app.snapshot().mode,'dead');assert.equal(h.breathing.snapshot().effort,0);h.app.dispose();
  const replay=await breathingHarness({prologue:true});await replay.app.enter();replay.app.step(.5);
  assert.equal(replay.samples.length,0);replay.app.pause();replay.click('replay-intro');assert.equal(replay.breathing.snapshot().effort,0);replay.app.dispose();
});
