import test from 'node:test';
import assert from 'node:assert/strict';
import {FieldAudio} from '../src/audio.js';

function fixture(){
  const audio=new FieldAudio({weatherEnabled:false}),sources=[];
  const param=()=>({value:0,setValueAtTime(v){this.value=v;},setTargetAtTime(v){this.value=v;},linearRampToValueAtTime(v){this.value=v;},exponentialRampToValueAtTime(v){this.value=v;},cancelScheduledValues(){}});
  const node=()=>({gain:param(),frequency:param(),pan:param(),connect(target){this.target=target;return target;},disconnect(){this.disconnected=true;}});
  const source=()=>{const s={...node(),playbackRate:param(),stops:[],start(){this.started=true;},stop(at){this.stops.push(at);}};sources.push(s);return s;};
  audio.ctx={state:'running',currentTime:1,createGain:node,createBiquadFilter:node,createStereoPanner:node,createBufferSource:source,createOscillator:source};
  audio.master=node();audio.gameGain=node();audio.noise={duration:3};audio.samples.pistol={duration:.9};
  const game={elapsed:0,player:{x:0,z:0,yaw:0},enemy:{x:10,z:0}};
  return {audio,sources,game,send:(type,id)=>audio.event({type,id,runId:1,position:{x:0,z:0}},game)};
}

test('a shot survives a detection cue from the same simulation tick',()=>{
  const {sources,send}=fixture();send('shot',1);send('detection',2);
  assert(sources.length>0);assert(sources.every(s=>!s.stops.includes(undefined)));
});

test('checkpoint speech escalates once per event and stops with pause or mute',()=>{
  const {audio,sources,game}=fixture();audio.samples.unity={duration:.75};
  const send=(id,tier)=>audio.event({type:'checkpoint',id,runId:1,tier,position:{x:0,z:0}},game);
  send(1,1);const first=sources.find(s=>s.buffer===audio.samples.unity);assert(first);
  const count=sources.length;send(1,1);assert.equal(sources.length,count);
  game.elapsed=1;send(2,2);const second=sources.filter(s=>s.buffer===audio.samples.unity).at(-1);assert.ok(second.playbackRate.value<first.playbackRate.value);
  assert(first.stops.includes(undefined));audio.pause();assert(second.stops.includes(undefined));
  audio.muted=true;const stopped=sources.length;send(3,2);assert.equal(sources.length,stopped);
});

test('creature attacks vary recorded roars and the eye-stab adds contact impact once',()=>{
  const {audio,sources,send,game}=fixture();audio.samples.roar={duration:1.2};audio.samples.roarAlt={duration:1.8};audio.samples.scream={duration:1};
  send('chase',1);const first=sources.find(s=>s.buffer===audio.samples.roarAlt);assert(first);assert(sources.some(s=>!s.buffer));
  game.elapsed=1;send('rage',2);assert(sources.some(s=>s.buffer===audio.samples.roar));assert(first.stops.includes(undefined));
  const count=sources.length;send('eye_stab',3);assert.equal(sources.length,count+3);send('eye_stab',3);assert.equal(sources.length,count+3);
  audio.toggleMute();assert.equal(audio.transients.size,0);
});

test('missing new creature samples use the existing recordings immediately',()=>{
  const {audio,sources,game}=fixture();audio.samples.scream={duration:1};audio.samples.distress={duration:1};
  audio.vocal('roar',game,{x:1,z:1},2,2.5);assert.equal(sources[0].buffer,audio.samples.scream);
  game.elapsed=2;audio.vocal('growl',game,{x:1,z:1},2,1.9);assert.equal(sources[1].buffer,audio.samples.distress);
});

test('full ambience voices cannot drop a weapon shot',()=>{
  const {audio,sources,send}=fixture();audio.eventRun=1;
  for(let i=0;i<16;i++)audio.transients.add({stop(){}});
  send('shot',1);assert(sources.some(s=>s.started));
});

test('sampled shots use the gameplay bus, deduplicate events and keep a two-voice cap',()=>{
  const {audio,sources,send}=fixture();send('shot',1);send('shot',1);
  assert.equal(sources.length,1);assert.equal(sources[0].buffer,audio.samples.pistol);
  assert.equal(sources[0].target.target,audio.gameGain);
  send('shot',2);send('shot',3);assert.equal(audio.weaponVoices.size,2);
  assert(sources[0].stops.includes(undefined));assert.equal(audio.weaponStats.played,3);
  send('empty',4);assert.equal(audio.weaponStats.played,3);
});

test('missing sample plays immediate fallback without replaying when loading completes',()=>{
  const {audio,sources,send}=fixture();delete audio.samples.pistol;send('shot',1);
  assert.equal(audio.weaponStats.fallback,1);assert.equal(audio.weaponVoices.size,2);
  const count=sources.length;audio.samples.pistol={duration:.9};assert.equal(sources.length,count);
  send('shot',2);assert.equal(sources.at(-1).buffer,audio.samples.pistol);
});

test('mute, pause, run reset and terminal events stop weapon tails',()=>{
  for(const stop of [a=>a.toggleMute(),a=>a.pause(),a=>a.reset(),(a,send)=>send('death',2),(a,send)=>send('win',2)]){
    const {audio,sources,send}=fixture();send('shot',1);const weapon=sources[0];stop(audio,send);
    assert(weapon.stops.includes(undefined));assert.equal(audio.weaponVoices.size,0);
  }
  const {audio,send}=fixture();audio.muted=true;send('shot',1);assert.equal(audio.weaponStats.played,0);
  audio.muted=false;audio.ctx.state='suspended';send('shot',2);assert.equal(audio.weaponStats.played,0);
});
