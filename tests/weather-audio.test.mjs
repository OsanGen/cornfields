import test from 'node:test';
import assert from 'node:assert/strict';
import {FieldAudio} from '../src/audio.js';

function audioFixture() {
  const audio=new FieldAudio(),sources=[];
  const node=()=>({connect(){return this;},disconnect(){},gain:{setValueAtTime(){},linearRampToValueAtTime(){},setTargetAtTime(){}}});
  audio.master=node();
  audio.ctx={state:'running',currentTime:1,createGain:node,createBufferSource(){
    const source={...node(),stops:[],start(){},stop(at){this.stops.push(at);}};sources.push(source);return source;
  }};
  audio.weatherSamples={thunder:{duration:5},splash0:{duration:.3},splash1:{duration:.3}};
  return {audio,sources,game:{mode:'playing'}};
}

test('a critical cue cancels an already playing thunder source',()=>{
  const {audio,sources,game}=audioFixture();
  audio.weatherEvent({type:'thunder'},game);assert.equal(audio.weatherVoices.size,1);
  audio.weatherState(game,{enabled:true,quiet:true});
  assert.ok(sources[0].stops.includes(undefined));assert.equal(audio.weatherVoices.size,0);
  audio.weatherEvent({type:'thunder'},game);assert.equal(sources.length,1);
});

test('missing thunder sample fallback is also cancellable by a critical cue',()=>{
  const {audio,game}=audioFixture();delete audio.weatherSamples.thunder;
  let stopped=false;audio.sound=()=>({stop(){stopped=true;}});
  audio.weatherEvent({type:'thunder'},game);audio.weatherState(game,{enabled:true,quiet:true});
  assert.equal(stopped,true);
});

test('weather voices do not consume gameplay event identity or the reserved source slots',()=>{
  const {audio,sources,game}=audioFixture();audio.eventRun=7;audio.eventId=19;
  const steps=[];audio.footstep=event=>steps.push(event);
  audio.weatherEvent({type:'footstep',wet:true,variant:0},game);
  assert.equal(audio.eventRun,7);assert.equal(audio.eventId,19);
  assert.equal(steps.length,1);assert.equal(steps[0].wet,true);assert.equal(sources.length,0);
  for(let i=0;i<10;i++)audio.transients.add({});
  audio.weatherEvent({type:'thunder'},game);assert.equal(sources.length,0);
});

test('mute drops new weather voices and pauses rain gain when the run ends',()=>{
  const {audio,sources,game}=audioFixture();audio.muted=true;
  audio.weatherEvent({type:'thunder'},game);assert.equal(sources.length,0);
  audio.weatherState(game,{enabled:true,quiet:false});assert.ok(audio.rainTarget>0);
  game.mode='dead';audio.weatherState(game,{enabled:true,quiet:false});assert.equal(audio.rainTarget,0);
});
