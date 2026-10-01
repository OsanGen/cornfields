import test from 'node:test';
import assert from 'node:assert/strict';
import {createOpening} from '../src/opening.js';
import {createHarness} from './helpers/browser.mjs';
const gameOnly=app=>{const {opening,...game}=app.snapshot();return game;};

test('one opening clock carries time through story, credits and return',()=>{
  const opening=createOpening({durations:{}});opening.begin();opening.tick(326);
  assert.equal(opening.stage,'credits');opening.tick(24);assert.equal(opening.phase,'ready');
  const second=createOpening({durations:{}});second.begin();second.tick(350);assert.equal(second.phase,'ready');
  second.finish();assert.equal(second.active,false);
});

test('skip story retains title credits; skip opening retains the isolated return',()=>{
  const opening=createOpening();opening.begin();opening.tick(2);opening.skipStory();assert.equal(opening.stage,'credits');
  opening.pause();opening.tick(100);assert.equal(opening.phase,'paused');opening.resume();opening.tick(3);
  opening.skip();opening.tick(2);opening.skip();assert.equal(opening.snapshot().returnTime,2);opening.tick(2);assert.equal(opening.phase,'ready');
});

test('entire opening freezes gameplay and enters directly once at the original spawn',async()=>{
  const h=createHarness({prologue:true,weather:true,corridors:true}),before=gameOnly(h.app);
  await h.app.enter();assert.equal(h.document.pointerLockElement,h.node('scene'));
  h.key('KeyW');h.key('Space');h.fire();h.app.advance(100000);
  assert.deepEqual(gameOnly(h.app),before);assert.equal(h.audio.ticks,0);assert.equal(h.audio.gameStarts,undefined);
  h.app.advance((h.app.introSnapshot().duration-100)*1000);
  assert.equal(h.app.snapshot().mode,'playing');assert.equal(h.app.snapshot().elapsed,0);assert.equal(h.app.snapshot().player.ammo,2);
  assert.equal(h.app.introSnapshot().phase,'finished');assert.equal(h.audio.gameStarts,1);
  h.key('KeyW');h.app.advance(100);assert.equal(h.app.snapshot().player.moving,false);
  h.release('KeyW');h.key('KeyW');h.app.advance(100);assert.equal(h.app.snapshot().player.moving,true);h.app.dispose();
});

test('Escape and focus loss pause story; Continue resumes with capture and no time jump',async()=>{
  const h=createHarness({prologue:true});await h.app.enter();h.app.advance(6000);h.key('Escape');
  assert.equal(h.app.introSnapshot().phase,'paused');assert.equal(h.document.pointerLockElement,null);h.app.advance(300000);
  assert.equal(h.app.introSnapshot().time,6);h.click('intro-continue');await h.flush();h.app.advance(1000);
  assert.equal(h.app.introSnapshot().time,7);h.window.dispatch('blur');assert.equal(h.app.introSnapshot().phase,'paused');h.app.dispose();
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
