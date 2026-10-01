import test from 'node:test';
import assert from 'node:assert/strict';
import {createPrologueAudio} from '../src/prologue-audio.js';
import {prologueFrame} from '../src/prologue.js';

function fixture(fetcher=async()=>({ok:true,arrayBuffer:async()=>new ArrayBuffer(10)})){
  const sources=[],requests=[],param=()=>({value:0,setValueAtTime(v){this.value=v;},setTargetAtTime(v){this.value=v;},linearRampToValueAtTime(){},exponentialRampToValueAtTime(){}});
  const node=()=>({gain:param(),frequency:param(),Q:param(),connect(){return this;},disconnect(){this.disconnected=true;}});
  const source=()=>{const s={...node(),start(...args){this.started=args;},stop(){this.stopped=true;}};sources.push(s);return s;};
  const audio={muted:false,master:node(),gameGain:node(),noise:{},ctx:{state:'running',currentTime:0,createGain:node,createBiquadFilter:node,createBufferSource:source,createOscillator:source,decodeAudioData:async()=>({duration:30})}};
  const opening=createPrologueAudio(audio,{fetcher:(url,options)=>{requests.push(url.pathname);return fetcher(url,options);}});
  return {audio,opening,requests,sources,flush:()=>new Promise(resolve=>setImmediate(resolve))};
}

test('dialogue seeks to clock offset, resumes without restarting and uses bounded lookahead',async()=>{
  const h=fixture(),frame=prologueFrame(5);h.opening.sync(frame);await h.flush();h.opening.sync(frame);
  assert.equal(h.opening.diagnostics().playing,true);assert.equal(h.requests.length,3);
  const speech=h.sources.at(-1);assert.equal(speech.started[1],3);
  h.audio.ctx.currentTime=.05;h.opening.sync(prologueFrame(5.05));assert.equal(h.sources.at(-1),speech);
  h.opening.pause();assert.equal(speech.stopped,true);assert.equal(h.opening.diagnostics().playing,false);
  h.opening.sync(prologueFrame(6));assert.equal(h.sources.at(-1).started[1],4);
  assert.equal(h.audio.gameGain.gain.value,0);h.opening.dispose();assert.equal(h.opening.diagnostics().buffers,0);
});

test('failed voices do not stall presentation and are not fetched every frame',async()=>{
  const h=fixture(async()=>({ok:false}));h.opening.sync(prologueFrame(5));await h.flush();h.opening.sync(prologueFrame(6));await h.flush();
  assert.equal(h.requests.length,3);assert.equal(h.opening.diagnostics().playing,false);assert.equal(h.opening.diagnostics().failed.length,3);h.opening.dispose();
});

test('late fetch after release cannot restore decoded voices or start sound',async()=>{
  let resolve;const h=fixture(()=>new Promise(r=>resolve=r));h.opening.sync(prologueFrame(5));h.opening.release();
  resolve({ok:true,arrayBuffer:async()=>new ArrayBuffer(10)});await h.flush();assert.equal(h.opening.diagnostics().buffers,0);assert.equal(h.opening.diagnostics().playing,false);h.opening.dispose();
});

test('mute and pause cancel owned voices and crash effects without gameplay sources',async()=>{
  const h=fixture();h.opening.sync(prologueFrame(5));await h.flush();h.opening.sync(prologueFrame(5));h.opening.cue('crash');
  h.audio.muted=true;h.opening.pause();assert.ok(h.sources.every(source=>source.stopped));h.opening.sync(prologueFrame(6));assert.equal(h.opening.diagnostics().playing,false);h.opening.dispose();
});

test('cast contacts continue under dialogue, use the opening bus, and rebase on pause and seek',async()=>{
  const h=fixture(),steps=[];h.audio.footstep=contact=>{steps.push(contact);return true;};
  for(let time=150;time<165;time+=1/60){h.audio.ctx.currentTime=time;h.opening.sync(prologueFrame(time));if(time===150)await h.flush();}
  for(const actor of ['mike','clarence','stanley'])assert.ok(steps.some(step=>step.actor===actor),actor);
  assert.ok(steps.every(step=>step.owner==='prologue'&&step.bus!==h.audio.gameGain));
  assert.ok(steps.some(step=>step.pan!==0));assert.ok(steps.every(step=>step.gain<.35));
  const count=steps.length;h.opening.pause();h.opening.sync(prologueFrame(170));assert.equal(steps.length,count);
  h.opening.sync(prologueFrame(300));h.opening.sync(prologueFrame(310));assert.equal(steps.length,count);
  h.audio.muted=true;h.opening.sync(prologueFrame(155));assert.equal(steps.length,count);h.opening.dispose();
});
