import test from 'node:test';
import assert from 'node:assert/strict';
import {createPrologueAudio} from '../src/prologue-audio.js';
import {PROLOGUE_LINES,PROLOGUE_FOLLOW_LINES,PROLOGUE_END_LINE} from '../src/prologue-script.js';

function fixture(fetcher=async()=>({ok:true,arrayBuffer:async()=>new ArrayBuffer(10)})){
  const sources=[],requests=[],param=()=>({value:0,setValueAtTime(v){this.value=v;},setTargetAtTime(v){this.value=v;},linearRampToValueAtTime(){},exponentialRampToValueAtTime(){}});
  const node=()=>({gain:param(),frequency:param(),Q:param(),connect(){return this;},disconnect(){this.disconnected=true;}});
  const source=()=>{const s={...node(),start(...args){this.started=args;},stop(){this.stopped=true;}};sources.push(s);return s;};
  const audio={muted:false,master:node(),gameGain:node(),noise:{},ctx:{state:'running',currentTime:0,createGain:node,createBiquadFilter:node,createBufferSource:source,createOscillator:source,decodeAudioData:async()=>({duration:30})}};
  const opening=createPrologueAudio(audio,{fetcher:(url,options)=>{requests.push(url.pathname);return fetcher(url,options);}});
  return {audio,opening,requests,sources,flush:()=>new Promise(resolve=>setImmediate(resolve))};
}
function frame(time=1,line=PROLOGUE_LINES.find(line=>line.audioMode==='recorded'),extra={}){
  return {time:line.start+time,line,chapter:line.chapter,chapterProgress:.1,...extra};
}
function motion(time,index,moving=true){
  return {time,listener:{position:[0,1.65,0],yaw:0},actors:Object.fromEntries(['mike','clarence','stanley'].map((id,i)=>[id,{position:[i,0,-i],contactIndex:index,segment:'approach',grounded:true,moving,surface:'soft',mode:'walk'}]))};
}

test('dialogue seeks to clock offset, resumes without restarting and uses bounded lookahead',async()=>{
  const h=fixture(),f=frame();h.opening.sync(f);await h.flush();h.opening.sync(f);
  assert.equal(h.opening.diagnostics().playing,true);assert.equal(h.requests.length,3);
  const speech=h.sources.at(-1);assert.equal(speech.started[1],1);
  h.audio.ctx.currentTime=.05;h.opening.sync(frame(1.05));assert.equal(h.sources.at(-1),speech);
  h.opening.pause();assert.equal(speech.stopped,true);assert.equal(h.opening.diagnostics().playing,false);
  h.opening.sync(frame(2));assert.equal(h.sources.at(-1).started[1],2);
  assert.equal(h.audio.gameGain.gain.value,0);h.opening.dispose();assert.equal(h.opening.diagnostics().buffers,0);
});

test('failed voices do not stall presentation and are not fetched every frame',async()=>{
  const h=fixture(async()=>({ok:false}));h.opening.sync(frame());await h.flush();h.opening.sync(frame(2));await h.flush();
  assert.equal(h.requests.length,3);assert.equal(h.opening.diagnostics().playing,false);assert.equal(h.opening.diagnostics().failed.length,3);h.opening.dispose();
});

test('late fetch after release cannot restore decoded voices or start sound',async()=>{
  let resolve;const h=fixture(()=>new Promise(r=>resolve=r));h.opening.sync(frame());h.opening.release();
  resolve({ok:true,arrayBuffer:async()=>new ArrayBuffer(10)});await h.flush();assert.equal(h.opening.diagnostics().buffers,0);assert.equal(h.opening.diagnostics().playing,false);h.opening.dispose();
});

test('mute and pause cancel owned voices and crash effects without gameplay sources',async()=>{
  const h=fixture();h.opening.sync(frame());await h.flush();h.opening.sync(frame());h.opening.cue('crash');
  h.audio.muted=true;h.opening.sync(frame(2));assert.ok(h.sources.every(source=>source.stopped));assert.equal(h.opening.diagnostics().playing,false);h.opening.dispose();
});

test('actual motion drives contacts, with no footsteps for idle actors or after a seek',async()=>{
  const h=fixture(),steps=[];h.audio.footstep=contact=>{steps.push(contact);return true;};
  for(let index=0;index<4;index++)h.opening.sync(frame(index*.2,PROLOGUE_LINES[0],{motion:motion(index*.2,index)}));
  for(const actor of ['mike','clarence','stanley'])assert.ok(steps.some(step=>step.actor===actor),actor);
  assert.ok(steps.every(step=>step.owner==='prologue'&&step.bus!==h.audio.gameGain));
  assert.ok(steps.some(step=>step.pan!==0));assert.ok(steps.every(step=>step.gain<.35));
  const count=steps.length;h.opening.sync(frame(1,PROLOGUE_LINES[0],{motion:motion(.8,3,false)}));assert.equal(steps.length,count);
  h.opening.pause();h.opening.sync(frame(2,PROLOGUE_LINES[0],{motion:motion(2,12)}));assert.equal(steps.length,count);
  h.opening.dispose();
});

test('follow callouts load independently and final line preserves the live game audio bus',async()=>{
  const h=fixture(),follow=PROLOGUE_FOLLOW_LINES[1];h.opening.sync(frame(.1,follow));await h.flush();h.opening.sync(frame(.1,follow));
  assert.equal(h.opening.diagnostics().voice,'FOL-02');assert.equal(h.requests.length,1);
  h.opening.pause();h.audio.gameGain.gain.value=.8;
  h.opening.sync(frame(.1,PROLOGUE_END_LINE,{gameplay:true}));await h.flush();h.opening.sync(frame(.1,PROLOGUE_END_LINE,{gameplay:true}));
  assert.equal(h.opening.diagnostics().voice,'END-01');assert.equal(h.audio.gameGain.gain.value,.8);
  assert.equal(h.requests.length,2);h.opening.dispose();
});


test('quiet final-line preparation fetches without speech, ambience or game-bus mutation',async()=>{
  const h=fixture();h.audio.gameGain.gain.value=.7;
  h.opening.prepareLine(PROLOGUE_END_LINE);await h.flush();
  assert.equal(h.requests.length,1);assert.equal(h.sources.length,0);assert.equal(h.audio.gameGain.gain.value,.7);
  assert.equal(h.opening.diagnostics().buffers,1);assert.equal(h.opening.diagnostics().playing,false);h.opening.dispose();
});

test('approved subtitle-only cues skip audio requests while preloading the next recorded line',async()=>{
 const h=fixture();const first=PROLOGUE_LINES.find(l=>l.id==='CAR-00');
 h.opening.sync(frame(.2,first));await h.flush();h.opening.sync(frame(.5,first));
 assert.equal(h.opening.diagnostics().playing,false);assert.equal(h.opening.diagnostics().missed,0);
 assert(h.requests.some(p=>p.endsWith('/CAR-01.mp3')));assert(h.requests.every(p=>!p.endsWith('/CAR-00.mp3')&&!p.endsWith('/UND-01.mp3')));
 const hallucination=PROLOGUE_LINES.find(l=>l.id==='UND-01');h.opening.sync(frame(.2,hallucination));await h.flush();
 assert(h.requests.some(p=>p.endsWith('/WAL-06.mp3')));assert(h.requests.every(p=>!p.endsWith('/UND-01.mp3')));assert.equal(h.opening.diagnostics().failed.length,0);h.opening.dispose();
});
