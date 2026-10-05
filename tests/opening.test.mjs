import test from 'node:test';
import assert from 'node:assert/strict';
import {createOpening} from '../src/opening.js';
import {createHarness} from './helpers/browser.mjs';
const gameOnly=app=>{const {opening,...game}=app.snapshot();return game;};

test('opening waits for a real exit and credits hand off at exactly twenty seconds',()=>{
  const opening=createOpening();opening.begin();opening.tick(300);
  assert.equal(opening.snapshot().story.waitingForExit,true);assert.equal(opening.stage,'prologue');
  opening.tick(.1,{interact:true});assert.equal(opening.snapshot().story.waitingForExit,false);
  opening.skipStory();opening.tick(19.95);assert.equal(opening.phase,'playing');
  opening.tick(.05);assert.equal(opening.phase,'ready');opening.finish();assert.equal(opening.active,false);
});

test('skip story retains credits; skip opening is immediate with no return hold',()=>{
  const opening=createOpening();opening.begin();opening.tick(2);opening.skipStory();assert.equal(opening.stage,'credits');
  opening.pause();opening.tick(100);assert.equal(opening.phase,'paused');opening.resume();opening.tick(3);
  opening.skip();assert.equal(opening.phase,'ready');assert.equal(opening.snapshot().skipped,true);
});

test('entire opening freezes gameplay and enters directly once at the original spawn',async()=>{
  const h=createHarness({prologue:true,weather:true,corridors:true}),before=gameOnly(h.app);
  await h.app.enter();assert.equal(h.document.pointerLockElement,h.node('scene'));
  h.key('KeyW');h.key('Space');h.fire();h.app.advance(100000);
  assert.deepEqual(gameOnly(h.app),before);assert.equal(h.audio.ticks,0);assert.equal(h.audio.gameStarts,undefined);
  assert.equal(h.app.introSnapshot().story.waitingForExit,true);
  h.key('KeyE');h.app.advance(1000);h.key('KeyF');h.app.advance(50);
  assert.equal(h.app.introSnapshot().story.player.flashlightOn,true);
  h.key('KeyJ');h.app.advance(20000);
  assert.equal(h.app.snapshot().mode,'playing');assert.equal(h.app.snapshot().elapsed,0);assert.equal(h.app.snapshot().player.ammo,2);
  assert.equal(h.app.introSnapshot().phase,'finished');assert.equal(h.audio.gameStarts,1);
  assert.equal(h.node('ending-caption').hidden,false);
  h.app.advance(100);assert.equal(h.app.snapshot().player.moving,true);
  assert.equal(h.app.snapshot().player.flashlightOn,true);h.app.dispose();
});

test('Escape and focus loss pause story; Continue resumes with capture and no time jump',async()=>{
  const h=createHarness({prologue:true});await h.app.enter();h.app.advance(6000);h.key('Escape');
  assert.equal(h.app.introSnapshot().phase,'paused');assert.equal(h.document.pointerLockElement,null);h.app.advance(300000);
  assert.ok(Math.abs(h.app.introSnapshot().time-6)<1e-6);h.click('intro-continue');await h.flush();h.app.advance(1000);
  assert.ok(Math.abs(h.app.introSnapshot().time-7)<1e-6);h.window.dispatch('blur');assert.equal(h.app.introSnapshot().phase,'paused');h.app.dispose();
});

test('keyboard skips work while pointer captured; restart bypasses opening',async()=>{
  const h=createHarness({prologue:true});await h.app.enter();h.key('KeyJ');assert.equal(h.app.introSnapshot().stage,'credits');
  h.key('KeyK');h.app.advance(4000);assert.equal(h.app.snapshot().mode,'playing');await h.app.restart();
  assert.equal(h.app.introSnapshot().phase,'finished');assert.equal(h.app.snapshot().elapsed,0);h.app.dispose();
});

test('replay preserves existing hunt and returns to its pause screen',async()=>{
  const h=createHarness({prologue:true});await h.app.enter();h.key('KeyK');h.app.advance(4000);h.app.step(.2,{fire:true});h.app.pause();
  const before=gameOnly(h.app);h.click('replay-intro');await h.flush();h.key('KeyK');h.app.advance(4000);
  assert.deepEqual(gameOnly(h.app),before);assert.equal(h.app.introSnapshot().phase,'finished');assert.equal(h.document.pointerLockElement,null);h.app.dispose();
});

test('loading, portrait and capture denial cannot start the opening or hunt',async()=>{
  let resolve;const h=createHarness({prologue:true,ready:new Promise(r=>resolve=r),denyLock:true});await h.app.enter();
  assert.equal(h.app.introSnapshot().phase,'preflight');resolve();await h.flush();await h.app.enter();assert.equal(h.app.introSnapshot().phase,'preflight');
  assert.equal(h.app.snapshot().mode,'menu');h.app.dispose();
  const phone=createHarness({prologue:true,touch:true,width:390,height:844});await phone.app.enter();assert.equal(phone.app.introSnapshot().phase,'preflight');
  phone.window.innerWidth=844;phone.window.innerHeight=390;phone.window.dispatch('resize');await phone.app.enter();phone.app.advance(1000);
  phone.window.innerHeight=900;phone.window.dispatch('resize');assert.equal(phone.app.introSnapshot().phase,'paused');phone.app.dispose();
});

test('delayed audio preparation cannot revive an opening after disposal',async()=>{
  let release;const h=createHarness({prologue:true,audioUnlock:()=>new Promise(r=>release=r)});await h.app.enter();h.app.dispose();release();await h.flush();
  assert.equal(h.audio.ctx.state,'suspended');assert.equal(h.audio.gameStarts,undefined);assert.equal(h.window.listenerCount(),0);assert.equal(h.document.listenerCount(),0);
});

test('skipping a paused desktop opening captures from the skip gesture without a second gate',async()=>{
  const h=createHarness({prologue:true});await h.app.enter();h.app.pause();
  h.click('intro-skip');await h.flush();assert.equal(h.app.snapshot().mode,'playing');
  assert.equal(h.document.pointerLockElement,h.node('scene'));assert.equal(h.app.introSnapshot().phase,'finished');h.app.dispose();
});

test('finished prologue yields touch visibility back to gameplay and QTE',async()=>{
  const h=createHarness({prologue:true,touch:true,corridors:true});await h.app.enter();h.click('intro-skip');
  h.app.fixture('encounter');h.app.step(.56);
  assert.equal(h.app.snapshot().interaction.phase,'qte');
  assert.equal(h.node('touch-fire').hidden,true);assert.equal(h.node('touch-light').hidden,true);assert.equal(h.node('touch-stab').hidden,false);
  h.app.pause();h.click('replay-intro');await h.flush();assert.equal(h.node('look-zone').hidden,false);assert.equal(h.node('touch-stab').hidden,true);h.app.dispose();
});

test('title audio receives the rendered credits frame only while playing, with pause, mute and skip cleanup',async()=>{
  const h=createHarness({prologue:true}),frames=[];
  h.audio.syncIntro=frame=>frames.push({frame,name:h.node('intro-name').textContent,opacity:Number(h.node('intro-card').style.opacity),muted:h.audio.muted});
  h.app.advance(0);assert.equal(frames.at(-1).frame,null,'preflight has no music frame');
  await h.app.enter();h.app.advance(1000);assert.equal(frames.at(-1).frame,null,'story has no credits-music frame');
  h.key('KeyJ');h.app.advance(17750);assert.equal(frames.at(-1).frame.opacity,0);
  h.app.advance(100);let rendered=frames.at(-1);
  assert.equal(rendered.name,'CORNFIELDS');assert.ok(rendered.opacity>0);assert.equal(rendered.frame.opacity,rendered.opacity);
  const at=h.app.introSnapshot().credits.time;h.app.pause();assert.equal(frames.at(-1).frame,null);
  h.click('intro-mute');assert.equal(frames.at(-1).muted,true);
  h.click('intro-continue');await h.flush();assert.equal(frames.at(-1).frame.time,at,'continue preserves the title offset');
  assert.equal(frames.at(-1).muted,true);h.app.pause();h.click('intro-mute');h.click('intro-continue');await h.flush();
  assert.equal(frames.at(-1).muted,false);assert.equal(frames.at(-1).frame.time,at);
  h.key('KeyK');assert.equal(frames.at(-1).frame,null);assert.equal(h.app.snapshot().mode,'playing');
  assert.equal(h.app.snapshot().elapsed,0);assert.equal(h.audio.ticks,0);h.app.dispose();
});

test('a skipped render window never sends a late title-music frame and replay uses the new credits offset',async()=>{
  const h=createHarness({prologue:true}),frames=[];h.audio.syncIntro=frame=>frames.push(frame);
  await h.app.enter();h.key('KeyJ');frames.length=0;h.app.advance(20000);
  assert.ok(frames.every(frame=>frame===null),'catch-up cues cannot substitute for a rendered title');
  assert.equal(h.app.snapshot().mode,'playing');h.app.pause();h.click('replay-intro');await h.flush();h.key('KeyJ');h.app.advance(18000);
  assert.ok(Math.abs(frames.at(-1).time-18)<1e-8);assert.ok(frames.at(-1).opacity>0);
  h.document.hidden=true;h.document.dispatch('visibilitychange');assert.equal(frames.at(-1),null);
  h.app.dispose();
});

test('title-only fallback also syncs visible frames and silences music at its ready screen',async()=>{
  const h=createHarness({intro:true}),frames=[];h.audio.syncIntro=frame=>frames.push(frame);
  await h.app.enter();await h.flush();h.app.advance(18100);
  assert.equal(frames.at(-1).shot,'title');assert.ok(frames.at(-1).opacity>0);
  h.click('intro-skip');assert.equal(h.app.introSnapshot().phase,'ready');assert.equal(frames.at(-1),null);h.app.dispose();
});
