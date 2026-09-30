import test from 'node:test';
import assert from 'node:assert/strict';
import {INTRO,createIntro,introFrame} from '../src/intro.js';
import {createHarness} from './helpers/browser.mjs';

test('canonical credits have clean readable holds and the title remains at ready',()=>{
  for(const [time,name,label] of [[4,'OPENGAMES','CREATED BY'],[10,'JACOB NANGLE','STORY BY'],[14,'OSCAR SANCHEZ',INTRO.roles],[19,'CORNFIELDS','']]){
    const frame=introFrame(time);assert.equal(frame.name,name);assert.equal(frame.label,label);assert.equal(frame.opacity,1);assert.equal(frame.accent,0);
  }
  assert.equal(introFrame(20,{ready:true}).opacity,1);
  for(const t of [0,2.99,6,8.99])assert.equal(introFrame(t).name,'');
});

test('deterministic samples keep three accents, bounded fold and reduced effects',()=>{
  for(const t of [5.9,11.9,17.9])assert.ok(introFrame(t).accent>.99);
  for(const t of [0,1,5.7,6.1,11.7,12.1,17.7,18.1,20])assert.equal(introFrame(t).accent,0);
  const frame=introFrame(17.9);assert.deepEqual(frame,introFrame(17.9));
  const reduced=introFrame(17.9,{reduced:true});
  assert.equal(reduced.accent,0);assert.equal(reduced.breathing,0);assert.equal(reduced.tunnel,0);assert.ok(reduced.red>0);
});

test('active clock freezes on pause and fires crossed cues once, dropping stale impacts',()=>{
  const cues=[],intro=createIntro({onCue:id=>cues.push(id)});intro.begin();
  intro.tick(2.85);assert.deepEqual(cues,['studio_swell']);intro.pause();intro.tick(200);assert.equal(intro.snapshot().time,2.85);
  intro.resume();intro.tick(3);assert.deepEqual(cues,['studio_swell','studio_tear']);
  intro.tick(14.15);assert.equal(intro.phase,'ready');assert.ok(intro.snapshot().dropped.includes('title_sting'));
  intro.tick(10);assert.equal(cues.length,2);
});

test('skip, completion, repeated begin and dispose are idempotent',()=>{
  for(const seconds of [0,4,7,10,14,17,19]){
    const cues=[],intro=createIntro({onCue:id=>cues.push(id)});intro.begin();intro.tick(seconds);const before=[...cues];
    intro.skip();intro.skip();intro.begin();assert.equal(intro.phase,'ready');assert.deepEqual(cues,before);
    intro.finish();intro.dispose();intro.begin({replay:true});assert.equal(intro.phase,'finished');
  }
});

test('begin and full intro never update the game, weather, game audio or capture the mouse',async()=>{
  const h=createHarness({intro:true,weather:true});const before=h.app.snapshot();
  h.click('start-btn');await h.flush();
  h.key('KeyW');h.key('Space');h.fire();h.app.advance(20000);
  assert.deepEqual(h.app.snapshot(),before);assert.equal(h.document.pointerLockElement,null);
  assert.equal(h.audio.ticks,0);assert.equal(h.audio.gameStarts,undefined);assert.deepEqual(h.audio.events,[]);
  assert.equal(h.app.introSnapshot().phase,'ready');h.app.dispose();
});

test('every shot skips to ready with no new audio cues and requires a separate entry',async()=>{
  for(const time of [0,4000,7000,10000,14000,17000,19000]){
    const h=createHarness({intro:true});h.click('start-btn');await h.flush();h.app.advance(time);
    const before=h.app.snapshot(),count=h.audio.introCues?.length||0;h.key('Escape');
    assert.equal(h.app.introSnapshot().phase,'ready');assert.deepEqual(h.app.snapshot(),before);
    assert.equal(h.audio.introCues?.length||0,count);await h.app.enter();
    assert.equal(h.app.snapshot().mode,'playing');assert.equal(h.app.snapshot().elapsed,0);assert.equal(h.app.snapshot().player.ammo,2);h.app.dispose();
  }
});

test('blur pauses intro and visibility time is not counted',async()=>{
  const h=createHarness({intro:true});h.click('start-btn');await h.flush();h.app.advance(4200);
  h.window.dispatch('blur');const frozen=h.app.introSnapshot().time;h.app.advance(120000);
  assert.equal(h.app.introSnapshot().time,frozen);assert.equal(h.app.introSnapshot().phase,'paused');
  h.click('intro-continue');await h.flush();h.app.advance(800);assert.equal(h.app.introSnapshot().time,5);h.app.dispose();
});

test('loading and denied pointer lock cannot advance the hunt',async()=>{
  let resolve;const ready=new Promise(r=>{resolve=r;});const h=createHarness({intro:true,denyLock:true,ready});
  h.click('preflight-skip');const before=h.app.snapshot();await h.app.enter();assert.deepEqual(h.app.snapshot(),before);
  resolve();await h.flush();await h.app.enter();h.app.advance(1000);
  assert.equal(h.app.introSnapshot().phase,'ready');assert.deepEqual(h.app.snapshot(),before);assert.equal(h.audio.gameStarts,undefined);h.app.dispose();
});

test('capture is requested before audio and delayed capture keeps gameplay frozen',async()=>{
  let release;const order=[];
  const h=createHarness({intro:true,lockRequest:()=>{order.push('lock');return new Promise(r=>{release=r;});},audioUnlock:()=>{order.push('audio');}});
  h.click('preflight-skip');const before=h.app.snapshot(),entering=h.app.enter();
  assert.deepEqual(order,['lock','audio']);h.app.advance(4000);assert.deepEqual(h.app.snapshot(),before);
  release();await entering;assert.equal(h.app.snapshot().mode,'playing');h.app.dispose();
});

test('held Space and movement must release before rearming after entry',async()=>{
  const h=createHarness({intro:true});h.click('start-btn');h.key('KeyW');h.key('Space');h.click('intro-skip');await h.app.enter();
  h.key('KeyW');h.app.advance(100);assert.equal(h.app.snapshot().player.moving,false);
  h.release('KeyW');h.key('KeyW');h.app.advance(100);assert.equal(h.app.snapshot().player.moving,true);h.app.dispose();
});

test('native Space activation is not prevented during the intro',()=>{
  const h=createHarness({intro:true});let prevented=false;
  h.key('Space',{target:{tagName:'BUTTON'},preventDefault(){prevented=true;}});assert.equal(prevented,false);h.app.dispose();
});

test('portrait ready explains orientation and re-enables entry in landscape',()=>{
  const h=createHarness({intro:true,touch:true,width:390,height:844});h.click('preflight-skip');
  assert.equal(h.node('intro-enter').disabled,true);assert.match(h.node('intro-status').textContent,/TURN YOUR PHONE/);
  h.window.innerWidth=844;h.window.innerHeight=390;h.window.dispatch('resize');h.app.advance(0);
  assert.equal(h.node('intro-enter').disabled,false);h.app.dispose();
});

test('disabled intro cannot be reactivated through replay controls',()=>{
  const h=createHarness();h.click('credits-replay');h.click('replay-intro');
  assert.equal(h.app.introSnapshot().phase,'finished');assert.equal(h.node('credits-replay').hidden,true);assert.equal(h.node('replay-intro').hidden,true);h.app.dispose();
});

test('replay returns to pause with the same run and restart bypasses the intro',async()=>{
  const h=createHarness({intro:true});h.click('preflight-skip');await h.app.enter();h.app.step(.2,{fire:true});h.app.pause();
  const before=h.app.snapshot();h.click('replay-intro');h.app.advance(20000);assert.deepEqual(h.app.snapshot(),before);assert.equal(h.app.introSnapshot().phase,'finished');
  h.click('restart-btn');await h.flush();assert.equal(h.app.snapshot().mode,'playing');assert.equal(h.app.introSnapshot().phase,'finished');assert.equal(h.app.snapshot().player.ammo,2);h.app.dispose();
});

test('reduced effects can change during playback without resetting its clock',()=>{
  const h=createHarness({intro:true});h.click('start-btn');h.app.advance(6500);
  h.node('intro-motion').dispatch('change',{target:{checked:true}});
  assert.equal(h.app.introSnapshot().time,6.5);assert.equal(h.app.diagnostics().reducedMotion,true);h.app.dispose();
});

test('late preparation cannot revive a disposed intro or leave frames/listeners',async()=>{
  let release;const h=createHarness({intro:true,audioUnlock:()=>new Promise(r=>{release=r;})});
  h.click('start-btn');h.app.startLoop();h.app.dispose();release();await h.flush();
  assert.equal(h.audio.introStarts,undefined);assert.equal(h.frames.size,0);assert.equal(h.window.listenerCount(),0);assert.equal(h.document.listenerCount(),0);
  assert.equal(h.audio.ctx.state,'suspended');
});
