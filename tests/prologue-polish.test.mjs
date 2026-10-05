import test from 'node:test';
import assert from 'node:assert/strict';
import {samplePrologueExit,EXIT_SECONDS,performanceFor} from '../src/prologue-performance.js';
import {sampleSpeech,SPEECH_ENVELOPES} from '../src/prologue-speech.js';
import {sampleRoadsideConfrontation,RETREAT_START,RETREAT_SECONDS} from '../src/prologue-confrontation.js';
import {sampleInteractivePrologueMotion,samplePrologueMotion} from '../src/prologue-motion.js';
import {createPrologueTimeline} from '../src/prologue-script.js';
import {PROLOGUE_VOICE_TIMING} from '../src/prologue-voice-timing.js';
import {createPrologue} from '../src/prologue.js';

test('approved exit adds only 0.75 seconds, stages clearance then support, and lands exactly',()=>{
  assert.equal(EXIT_SECONDS,1.6);
  const timeline=createPrologueTimeline({durations:PROLOGUE_VOICE_TIMING});// 2026-10-04: v1 adds waking, bridge speech and the approved vision edges. Exit duration itself stays locked.
  const bridge=timeline.lines.find(l=>l.id==='CAR-00');
  assert(Math.abs(timeline.duration-(163.33829354838724+5.55+(bridge.end-bridge.start)+.18+3.2+2.4))<1e-8,'only the approved waking, bridge and vision durations extend the baseline');
  assert(Math.abs(timeline.chapters.find(c=>c.id==='exit').end-timeline.chapters.find(c=>c.id==='exit').start-7.467448387096773)<1e-8);
  assert(Math.abs(timeline.lines.find(l=>l.id==='ARR-01').start-timeline.chapters.find(c=>c.id==='exit').start-EXIT_SECONDS)<1e-8);
  assert.deepEqual(samplePrologueExit(0).position,[.5,1.13,.35]);assert.deepEqual(samplePrologueExit(1.6).position,[1.85,1.58,-.35]);
  const early=samplePrologueExit(.3),plant=samplePrologueExit(.95);assert(early.door>early.transfer);assert.equal(early.transfer,0);assert.equal(plant.plant,1);assert(plant.transfer<1);
  let prior=samplePrologueExit(0);for(let t=.01;t<1.61;t+=.01){const now=samplePrologueExit(t);assert(now.position[0]>=prior.position[0]);assert(now.door>=prior.door);assert(now.position.every(Number.isFinite));prior=now;}
});

test('retreat is delayed until response and stays within a supported walk speed',()=>{
  const first=sampleRoadsideConfrontation({chapter:'cabin',chapterTime:0});
  assert.deepEqual(sampleRoadsideConfrontation({chapter:'cabin',chapterTime:RETREAT_START}).position,first.position);
  let maxSpeed=0,prior=first;for(let t=.01;t<=3.2;t+=.01){const now=sampleRoadsideConfrontation({chapter:'cabin',chapterTime:t});maxSpeed=Math.max(maxSpeed,Math.hypot(now.position[0]-prior.position[0],now.position[2]-prior.position[2])/.01);assert(Number.isFinite(now.yaw));prior=now;}
  assert(maxSpeed<1.81);assert.deepEqual(sampleRoadsideConfrontation({chapter:'cabin',chapterTime:RETREAT_START+RETREAT_SECONDS}).position,[2.1,0,-2.25]);
});

test('live and guided roadside now use identical phases and world contact endpoints',()=>{
  for(const chapter of ['emergence','bang','cabin'])for(const p of [.05,.32,.5,.8,1]){
    const frame={chapter,chapterProgress:p,chapterTime:p*(chapter==='cabin'?4:chapter==='bang'?2:3.67322580645),time:100+p,elapsed:100+p,exitProgress:0,player:{x:.5,y:1.13,z:.35,yaw:0,distance:0}};
    const r=sampleRoadsideConfrontation(frame),escorts={clarence:{x:-.45,z:.09,distance:0},stanley:{x:r.position[0],z:r.position[2],distance:r.travel,moving:r.moving}};
    const a=sampleInteractivePrologueMotion(frame,escorts).actors.stanley,b=samplePrologueMotion(frame).actors.stanley;
    assert.equal(a.phase,b.phase);assert.deepEqual(a.position,b.position);assert.equal(a.mode,b.mode);
  }
});

test('speech energy tracks come from recordings and close outside audible duration',()=>{
  for(const id of ['CAR-05','ARR-00','CAB-01','WAL-16']){
    const record=SPEECH_ENVELOPES[id];assert(record&&record.energy.length>10);assert(record.energy.every(n=>Number.isInteger(n)&&n>=0&&n<=255));
    assert.equal(sampleSpeech(id,-1),0);assert.equal(sampleSpeech(id,record.duration+.01),0);
    assert(record.energy.some(x=>x>120));assert(record.energy.some(x=>x<20));
  }assert.equal(sampleSpeech('missing',1),0);
});

test('acting belongs to line-local time and never forces an actor to follow a target behind it',()=>{
  const frame={time:2,elapsed:2,line:{voice:'clarence',id:'CAR-05',start:1,end:4}};
  const pose={yaw:0,position:[0,0,0],mode:'drive'},a=performanceFor(frame,'clarence',pose,[0,1,-5]);
  assert(a.speaking);assert.equal(a.lineOffset,1);assert(Math.abs(a.look)<.3);assert(Math.abs(a.eyeLook)<.2);
  const listener=performanceFor(frame,'stanley',{...pose,mode:'standing'},[2,1,1]);assert(!listener.speaking);assert.equal(listener.emphasis,0);
});

test('repeated exit input does not replay door cue, and look survives the supported exit',()=>{
  const cues=[],story=createPrologue({durations:PROLOGUE_VOICE_TIMING,onCue:c=>cues.push(c)});story.begin();story.tick(80);assert(story.frame().waitingForExit);
  for(let t=0;t<1.7;t+=.05)story.tick(.05,{interact:true,yaw:.8,pitch:-.2});
  assert(story.frame().canMove);assert.equal(story.player.yaw,.8);assert.equal(story.player.pitch,-.2);assert.equal(cues.filter(c=>c==='door_open').length,1);story.dispose();
});
