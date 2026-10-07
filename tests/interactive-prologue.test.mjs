import {followApproachTarget} from '../src/prologue-layout.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {createPrologue,prologueFrame} from '../src/prologue.js';
import {createOpening} from '../src/opening.js';
import {createPrologueTimeline,PROLOGUE_END_LINE} from '../src/prologue-script.js';
import {PROLOGUE_VOICE_TIMING} from '../src/prologue-voice-timing.js';
import {createHarness} from './helpers/browser.mjs';
import {createUI} from '../src/ui.js';

const DT=.05,timeline=createPrologueTimeline({durations:PROLOGUE_VOICE_TIMING});
const chapter=id=>timeline.chapters.find(c=>c.id===id);
const fixture=()=>{const cues=[],story=createPrologue({durations:PROLOGUE_VOICE_TIMING,onCue:id=>cues.push(id)});story.begin();return {story,cues};};
// Test driver supplies ordinary controls. Production code has no automatic follow.
function followControls(frame,snapshot){
  if(frame.waitingForExit)return {interact:true};
  if(!frame.canMove||frame.chapter==='redroom')return {};
  const escorts=snapshot.escorts||snapshot.story?.escorts;
  const target=followApproachTarget(frame.player,escorts),dx=target.x-frame.player.x,dz=target.z-frame.player.z;
  return Math.hypot(dx,dz)>.28?{forward:1,yaw:Math.atan2(-dx,-dz)}:{};
}
function drive(story,until,{max=260,controls}={}){
  let elapsed=0;
  while(!until(story.frame(),story.snapshot())&&elapsed<max){
    const frame=story.frame(),snapshot=story.snapshot();
    story.tick(DT,controls?controls(frame,snapshot):followControls(frame,snapshot));elapsed+=DT;
  }
  assert(until(story.frame(),story.snapshot()),'driver reached target within bounded time');return elapsed;
}

test('free look is immediate and persists; Mike exits only after a valid stopped-car action',()=>{
  const {story}=fixture();
  story.tick(.1,{yaw:1.12,pitch:.42,interact:true,forward:1});
  assert.equal(story.frame().player.yaw,1.12);assert.equal(story.frame().player.pitch,.42);
  assert.equal(story.frame().player.x,.5);assert.equal(story.frame().canMove,false);
  story.tick(1);assert.equal(story.frame().player.yaw,1.12);
  story.tick(chapter('cabin').end+2);const wait=story.snapshot();
  assert.equal(wait.waitingForExit,true);assert.equal(wait.time,chapter('cabin').end);
  assert.equal(wait.escorts.clarence.x,-.45,'Clarence stays seated for the private exchange');
  story.tick(20,{forward:1});assert.equal(story.snapshot().time,wait.time);assert.equal(story.frame().player.x,.5);
  story.tick(.05,{interact:true});story.tick(1.61);assert.equal(story.frame().waitingForExit,false);assert.equal(story.frame().canMove,true);
  const before=story.frame().player.z;story.tick(.2,{forward:1,yaw:0});assert(story.frame().player.z<before);
  story.dispose();
});

test('confrontation stays in the stopped car, Mike speaks privately, and door/knocks fire once',()=>{
  const {story,cues}=fixture();
  drive(story,f=>f.chapter==='bang',{controls:()=>({interact:true})});
  assert.equal(story.frame().driving.parked,true);
  assert.equal(story.frame().canMove,false);
  assert.equal(story.frame().exitProgress,0);
  assert.equal(cues.includes('door_open'),false);
  story.tick(.61,{interact:true});assert.equal(cues.filter(x=>x==='car_bang_1').length,1);
  story.pause();const before=story.snapshot();story.tick(10,{interact:true});assert.deepEqual(story.snapshot(),before);story.resume();
  drive(story,f=>f.line?.id==='FLA-03',{controls:()=>({interact:true})});
  assert.equal(story.frame().speaker,'MIKE');assert.equal(story.frame().chapter,'cabin');
  assert.equal(story.snapshot().escorts.clarence.z,.09);
  assert.equal(cues.filter(x=>x==='car_bang_2').length,1);
  drive(story,f=>f.waitingForExit,{controls:()=>({})});
  assert.equal(cues.includes('door_open'),false);
  story.tick(.05,{interact:true});story.tick(.2,{interact:true});
  assert.equal(cues.filter(x=>x==='door_open').length,1);
  assert.equal(story.frame().line,null);
  story.skip();story.begin();assert.deepEqual(story.snapshot().fired,[]);assert.equal(story.snapshot().escorts.clarence.z,.09);story.dispose();
});

test('flashlight actions toggle once per input tick and pause freezes motion and authored time',()=>{
  const {story}=fixture();drive(story,f=>f.canMove);
  assert.equal(story.frame().player.flashlightOn,false);story.tick(.4,{flashlight:true});assert.equal(story.frame().player.flashlightOn,true);
  story.tick(.4);assert.equal(story.frame().player.flashlightOn,true);story.tick(.1,{flashlight:true});assert.equal(story.frame().player.flashlightOn,false);
  story.pause();const before=story.snapshot();story.tick(20,{forward:1,yaw:2,flashlight:true});assert.deepEqual(story.snapshot(),before);assert.equal(story.frame().spoken,'');
  assert(story.resume());story.tick(.1,{yaw:2});assert.equal(story.frame().player.yaw,2);assert(story.snapshot().time>before.time);story.dispose();
});

test('separation finishes the sentence, holds upcoming story, spaces callouts and resumes without replay',()=>{
  const {story,cues}=fixture();
  drive(story,f=>f.line?.id==='WAL-01');
  const sentence=story.frame().line;
  drive(story,(_,s)=>s.followCalls===1,{controls:()=>({strafe:1,yaw:0}),max:20});
  const first=story.snapshot(),heldTime=first.time;
  assert(heldTime>=sentence.end);assert(story.frame().line.id.startsWith('FOL-'));assert(first.followHeld);
  const calls=[first.elapsed],ids=[story.frame().line.id];let previous=1;
  for(let t=0;t<18;t+=DT){
    story.tick(DT);const now=story.snapshot();
    assert.equal(now.time,heldTime,'essential story does not continue out of earshot');
    if(now.followCalls!==previous){calls.push(now.elapsed);ids.push(story.frame().line.id);previous=now.followCalls;}
  }
  for(let i=1;i<calls.length;i++)assert(calls[i]-calls[i-1]>=8-DT);
  assert(ids.length>=2);assert.notEqual(ids[0],ids[1]);
  drive(story,(_,s)=>s.time>heldTime+.4,{max:25});
  assert(story.frame().storyTime>=sentence.end);assert.notEqual(story.frame().line?.id,'WAL-01');
  drive(story,f=>f.chapter==='history',{max:50});
  assert.equal(cues.filter(id=>id==='undead').length,1);story.dispose();
});

test('redroom transfers only under liquid cover, permits held-room walking and restores the exact outdoor pose',()=>{
  const {story}=fixture();
  drive(story,f=>f.storyTime>=chapter('redroom').start-.1);
  const before=story.frame().player;
  // Arrive exactly on the scene boundary, with no movement on that last step.
  story.tick(chapter('redroom').start-story.frame().storyTime);
  assert.equal(story.frame().chapter,'redroom');
  // 2026-10-04 approved liquid v1: preserve the outdoor pose until full cover.
  assert.equal(story.frame().player.x,before.x);assert.equal(story.frame().player.z,before.z);
  story.tick(.7);assert.equal(story.frame().transfer.cover,1);
  assert.equal(story.frame().player.x,0);assert.equal(story.frame().player.z,2);
  story.tick(.6);
  const escorts=story.snapshot().escorts;
  story.tick(1,{strafe:1,yaw:0,pitch:.4});
  assert(story.frame().player.x>0);assert.equal(story.frame().player.pitch,.4);
  const stationary=Object.fromEntries(Object.entries(escorts).map(([id,actor])=>[id,[actor.x,actor.z,actor.distance]]));
  assert.deepEqual(Object.fromEntries(Object.entries(story.snapshot().escorts).map(([id,actor])=>[id,[actor.x,actor.z,actor.distance]])),stationary);
  story.pause();const paused=story.snapshot();story.tick(30,{forward:1});assert.deepEqual(story.snapshot(),paused);story.resume();
  story.tick(chapter('redroom').end-story.frame().storyTime);
  assert.equal(story.phase,'finished');assert.equal(story.frame().chapter,'redroom');
  for(const key of ['x','z','yaw','pitch','distance','flashlightOn'])assert.equal(story.frame().player[key],before[key],key);
  assert.equal(story.snapshot().followCalls,0);story.dispose();
});

test('all visions fire once, retain fixed durations under reduced effects and complete within attentive budget',()=>{
  const {story,cues}=fixture(),seen=new Set();let wall=0;
  while(story.phase!=='finished'&&wall<240){
    const frame=story.frame(),snapshot=story.snapshot();seen.add(frame.chapter);
    if(['undead','redroom','liquid'].includes(frame.chapter)){
      const reduced=story.frame(true);assert.equal(reduced.spoken,frame.spoken);assert.equal(reduced.canMove,frame.canMove);if(frame.chapter==='redroom')assert.equal(reduced.canMove,frame.transfer.room&&frame.transfer.cover===0);
    }
    story.tick(DT,followControls(frame,snapshot));wall+=DT;
  }
  assert.equal(story.phase,'finished');assert.equal(story.snapshot().followCalls,0);
  for(const id of ['undead','redroom','liquid','crash'])assert.equal(cues.filter(c=>c===id).length,1,id);
  for(const [id,duration] of [['undead',5.2],['redroom',12.4],['rupture',12],['solid_return',4],['gun_recovery',5.8],['reaction',2.4]])assert(Math.abs(chapter(id).end-chapter(id).start-duration)<1e-8);
  assert(seen.has('redroom')&&seen.has('rupture')&&seen.has('gun_recovery'));
  assert(wall+20<240,'same four-minute total opening budget; reaction is now part of the story');
  assert.deepEqual(story.snapshot().dropped,[]);story.dispose();
});

test('credits occur once between world liquid and the approved return sequence, then enter gameplay',t=>{
  const opening=createOpening();opening.begin();let elapsed=0,creditsStarted=null,creditsEnded=null;
  while(opening.phase!=='ready'&&elapsed<240){
    const frame=opening.frame(),snapshot=opening.snapshot();
    if(opening.stage==='credits'&&creditsStarted===null)creditsStarted=elapsed;else if(opening.stage==='prologue'&&creditsStarted!==null&&creditsEnded===null){creditsEnded=elapsed;assert.equal(frame.chapter,'solid_return');}
    opening.tick(DT,opening.stage==='prologue'?followControls(frame,snapshot):{});elapsed+=DT;
  }
  assert.equal(opening.phase,'ready');assert.equal(opening.stage,'prologue');assert.equal(opening.frame().chapter,'redroom');
  assert(Math.abs(creditsEnded-creditsStarted-20)<DT*2);assert(elapsed<240);assert.equal(opening.snapshot().story.fired.filter(c=>c==='redroom').length,1);
  t.diagnostic(`Attentive control-driver run: ${elapsed.toFixed(2)} seconds for the complete reordered opening, including its reaction and projector.`);
  assert.equal(opening.snapshot().credits.time,20);opening.finish();assert.equal(opening.active,false);opening.dispose();
});

test('skipping and replay clear cue state; invalid deltas cannot advance the presentation',()=>{
  const {story,cues}=fixture();for(const delta of [NaN,Infinity,-1,0])story.tick(delta);assert.equal(story.snapshot().time,0);
  story.tick(1);story.pause();assert(story.skip());assert.equal(story.phase,'finished');assert.equal(story.snapshot().skipped,true);assert.deepEqual(cues,[]);
  assert(story.begin());assert.equal(story.snapshot().skipped,false);assert.equal(story.snapshot().time,0);assert.equal(story.snapshot().followCalls,0);
  story.dispose();assert.equal(story.begin(),false);assert.equal(story.resume(),false);
  assert.equal(prologueFrame(-1).time,0);
});


test('diagonal movement toward the group slides around the cruiser instead of sticking to its side',()=>{
  const {story}=fixture();drive(story,f=>f.canMove);
  for(let t=0;t<3;t+=DT){
    const p=story.frame().player,dx=-.1-p.x,dz=-7-p.z;
    story.tick(DT,{forward:1,yaw:Math.atan2(-dx,-dz)});
  }
  assert(story.frame().player.z<-3.2);assert(story.frame().player.x<1.02);story.dispose();
});


test('skipping and returning to title never duplicate the earlier reaction in gameplay',async()=>{
  const h=createHarness({prologue:true});await h.app.enter();h.key('KeyJ');h.app.advance(20000);
  assert.equal(h.node('ending-caption').hidden,true);h.app.advance(1000);h.app.pause();
  h.click('title-btn');await h.app.enter();h.app.advance(50);
  assert.equal(h.app.snapshot().mode,'playing');assert.equal(h.node('ending-caption').hidden,true);h.app.dispose();
});

test('look tutorial clears on genuine look input rather than ignoring it until a timer expires',async()=>{
  const h=createHarness({prologue:true});await h.app.enter();h.app.advance(100);
  assert.equal(h.node('story-tutorial').hidden,false);
  h.document.dispatch('mousemove',{movementX:30,movementY:10});h.app.advance(50);
  assert.equal(h.node('story-tutorial').hidden,true);h.app.dispose();
});


test('liquid phrase stays readable once without a duplicate subtitle and clears after its vision',()=>{
  const h=createHarness(),ui=createUI(h.document);
  const line=timeline.lines.find(l=>l.id==='LIQ-01');assert.equal(line.chapter,'rupture');
  for(const [time,visible]of [[line.start-.1,false],[line.start+.01,true],[line.end-.01,true],[line.end+.1,false]]){
    const frame={...prologueFrame(time,{timeline}),stage:'prologue',player:{flashlightOn:true},canMove:false};
    ui.renderOpening({active:true,phase:'playing',frame:()=>frame});
    assert.equal(h.node('liquid-phrase').hidden,true,'no duplicate legacy full-screen phrase');assert.equal(h.node('story-caption').hidden,!visible);
    if(visible)assert.equal(h.node('story-subtitle').textContent,'WE ARE ONE');
  }
  assert.equal(timeline.lines.filter(l=>l.id==='LIQ-01').length,1);h.app.dispose();
});
