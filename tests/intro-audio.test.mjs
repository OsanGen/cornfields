import test from 'node:test';
import assert from 'node:assert/strict';
import {FieldAudio} from '../src/audio.js';
import {createAudioLifecycle} from '../src/audio-lifecycle.js';
import {eventTarget} from './helpers/browser.mjs';

function fixture(){
  const audio=new FieldAudio({weatherEnabled:false}),sources=[];
  const param=()=>({value:0,setValueAtTime(v){this.value=v;},setTargetAtTime(v){this.value=v;},linearRampToValueAtTime(v){this.value=v;},exponentialRampToValueAtTime(v){this.value=v;},cancelScheduledValues(){}});
  const node=()=>({gain:param(),frequency:param(),connect(){return this;},disconnect(){this.disconnected=true;}});
  const source=()=>{const s={...node(),stopped:0,start(){},stop(){this.stopped++;}};sources.push(s);return s;};
  audio.ctx={...eventTarget(),state:'running',currentTime:1,createGain:node,createBiquadFilter:node,createBufferSource:source,createOscillator:source,resume(){this.state='running';},suspend(){this.state='suspended';}};
  audio.lifecycle=createAudioLifecycle(audio.ctx,()=>{});void audio.lifecycle.resume();
  audio.master=node();audio.gameGain=node();audio.noise={};audio.samples.distress={};
  return {audio,sources};
}

test('intro audio owns its sources without touching gameplay identity or sources',()=>{
  const {audio,sources}=fixture(),unrelated={stop(){throw new Error('borrowed game source stopped');}};
  audio.sources.push(unrelated);audio.eventRun=5;audio.eventId=22;
  audio.startIntro();assert.equal(sources.length,2);assert.equal(audio.gameGain.gain.value,0);
  for(const id of ['cry','studio_tear','title_sting'])audio.introCue(id);
  assert.equal(audio.eventRun,5);assert.equal(audio.eventId,22);assert.equal(audio.transients.size,0);
  audio.stopIntro();assert.equal(audio.introSources.size,0);assert.equal(audio.introGain,null);
  assert.ok(sources.every(s=>s.stopped>0));assert.equal(audio.ctx.state,'running');
});

test('mute, pause and repeated stop cancel only intro-owned audio',()=>{
  const {audio}=fixture();audio.startIntro();audio.toggleMute();assert.equal(audio.introSources.size,0);
  audio.startIntro();assert.equal(audio.introSources.size,0);audio.toggleMute();audio.startIntro();assert.equal(audio.introSources.size,2);
  audio.pause();audio.stopIntro();assert.equal(audio.introSources.size,0);assert.equal(audio.ctx.state,'suspended');
});

test('gameplay ambience starts once after the intro and survives repeat entry',()=>{
  const {audio,sources}=fixture();audio.startIntro();audio.startGameplay();const count=sources.length;
  assert.equal(audio.introGain,null);assert.equal(audio.gameGain.gain.value,1);
  audio.startGameplay();assert.equal(sources.length,count);
  audio.startIntro();audio.startGameplay();assert.equal(sources.length,count+2);
});
