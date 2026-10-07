import test from 'node:test';
import assert from 'node:assert/strict';
import {createPlayerBreathing,createPlayerBreathingAudio,playerBreathingAllowed} from '../src/player-breathing.js';
import {FieldAudio} from '../src/audio.js';
import {createAudioLifecycle} from '../src/audio-lifecycle.js';
import {eventTarget} from './helpers/browser.mjs';

const speed=3.95,near=(a,b,epsilon=1e-9)=>assert.ok(Math.abs(a-b)<epsilon,`${a} != ${b}`);
function drive(model,seconds,pace=1,hz=60){for(let i=0;i<Math.round(seconds*hz);i++)model.update(speed*pace/hz,1/hz);return model.snapshot();}
function audioFixture(){
  const sources=[],nodes=[];
  const param=()=>({value:0,events:[],setValueAtTime(v,t){this.value=v;this.events.push(['set',v,t]);},setTargetAtTime(v,t,tau){this.value=v;this.events.push(['target',v,t,tau]);},linearRampToValueAtTime(v,t){this.value=v;this.events.push(['ramp',v,t]);},exponentialRampToValueAtTime(v,t){this.value=v;this.events.push(['exponential',v,t]);},cancelScheduledValues(t){this.events.push(['cancel',0,t]);}});
  const node=()=>{const n={gain:param(),frequency:param(),Q:param(),playbackRate:{value:1},connect(next){this.destination=next;return next;},disconnect(){this.disconnected=true;}};nodes.push(n);return n;};
  const source=()=>{const n={...node(),starts:[],stops:[],start(...args){this.starts.push(args);},stop(...args){this.stops.push(args);}};sources.push(n);return n;};
  const context={...eventTarget(),state:'running',currentTime:0,sampleRate:48000,createGain:node,createBiquadFilter:node,createBufferSource:source,createOscillator:source,
    createBuffer(channels,length,sampleRate){const data=new Float32Array(length);return {length,duration:length/sampleRate,getChannelData:()=>data};},
    resume(){this.state='running';},suspend(){this.state='suspended';},
  };
  const audio=createPlayerBreathingAudio(context,node());
  return {audio,context,sources,nodes,advance(seconds,pace=1,extra={}){for(let i=0;i<Math.round(seconds*60);i++){
    context.currentTime+=1/60;
    for(const source of sources)if(!source.disconnected&&source.stops.length&&source.stops.at(-1)[0]<=context.currentTime)source.onended?.();
    audio.update({distance:speed*pace/60,dt:1/60,allowed:true,...extra});
  }}};
}

test('silent rest, soft walk, sustained exertion and slower recovery are audio-only',()=>{
  const model=createPlayerBreathing();assert.deepEqual(model.snapshot(),{state:'calm',effort:0,moving:false,period:4.8});
  assert.equal(drive(model,3,0).state,'calm');assert.equal(drive(model,2).state,'walking');
  assert.equal(drive(model,15).state,'exerted');const high=model.snapshot();
  assert.equal(drive(model,2,0).state,'recovery');assert.ok(model.snapshot().effort>high.effort*.8);
  assert.equal(drive(model,60,0).state,'calm');assert.equal(model.snapshot().effort,0);
});

test('accepted pace is bounded, hysteretic and consistent across 30, 60 and 120 Hz',()=>{
  const samples=[30,60,120].map(hz=>{const m=createPlayerBreathing();drive(m,12,1,hz);drive(m,5,0,hz);return m.snapshot();});
  for(const sample of samples){near(sample.effort,samples[0].effort);assert.equal(sample.state,'recovery');}
  const m=createPlayerBreathing();drive(m,12);assert.equal(m.snapshot().state,'exerted');
  drive(m,1,.5);assert.equal(m.snapshot().state,'exerted','separate entry/exit thresholds');
  const still=createPlayerBreathing();drive(still,10,0);assert.equal(still.snapshot().effort,0);
  assert.equal(still.update(speed*.04/60,1/60).moving,false);
  assert.equal(still.update(speed*.06/60,1/60).moving,true);
  assert.equal(still.update(speed*.04/60,1/60).moving,true);
});

test('reset, teleport and invalid timing never create exertion',()=>{
  for(const [distance,dt] of [[100,1/60],[-1,1/60],[NaN,1/60],[1,0],[1,NaN],[1,1]]){
    const m=createPlayerBreathing();drive(m,12);assert.equal(m.update(distance,dt).state,'calm');
  }
});

test('only active living cornfield traversal is eligible; every story and grapple phase is suppressed',()=>{
  const base={mode:'playing',entered:true,player:{health:100,zone:'corridor'}};
  for(const zone of ['corridor','field'])assert.equal(playerBreathingAllowed({...base,player:{...base.player,zone}}),true);
  for(const phase of ['arrival','entry','room','exit','transform','pit','fall'])assert.equal(playerBreathingAllowed({...base,survivalEnding:{phase}}),false,phase);
  assert.equal(playerBreathingAllowed({...base,survivalEnding:{phase:'active'}}),true);
  for(const mode of ['menu','paused','dead','won','playtest-ended'])assert.equal(playerBreathingAllowed({...base,mode}),false);
  for(const phase of ['tackle','qte','stab','throw','recovery'])assert.equal(playerBreathingAllowed({...base,interaction:{phase}}),false);
  assert.equal(playerBreathingAllowed({...base,player:{...base.player,hidden:true}}),false);
  assert.equal(playerBreathingAllowed({...base,player:{...base.player,health:0}}),false);
});

test('procedural original sound is bounded, dry and centered, with one finite source',()=>{
  const h=audioFixture();h.advance(2,0);assert.equal(h.sources.length,0);
  h.advance(60);const d=h.audio.diagnostics();assert.ok(d.cycles>=12);assert.equal(d.maxSources,1);
  assert.equal(d.bufferBytes,48000*8*4);
  const periods=h.sources.slice(1).map((s,i)=>s.starts[0][0]-h.sources[i].starts[0][0]);
  assert.ok(new Set(periods.map(p=>p.toFixed(2))).size>8,'cycles vary');
  for(const source of h.sources){
    assert.equal(source.loop,false);assert.equal(source.starts.length,1);assert.ok(source.stops[0][0]>source.starts[0][0]);
    const high=source.destination,low=high.destination,level=low.destination;
    assert.equal(high.type,'highpass');assert.equal(low.type,'lowpass');
    assert.ok(level.gain.events.every(([,value])=>value>=0&&value<.09));
    assert.equal(level.gain.events.at(-1)[1],0);
  }
});

test('speech ducks existing and future breaths, then releases gently',()=>{
  const h=audioFixture();h.advance(3);h.audio.duck(true);
  const bus=h.sources.at(-1).destination.destination.destination.destination;
  assert.deepEqual(bus.gain.events.at(-1).filter((_,i)=>i!==2),['target',.16,.025]);
  h.advance(8,1,{speech:true});assert.equal(h.audio.diagnostics().ducked,true);
  h.advance(1,1,{speech:false});assert.equal(h.audio.diagnostics().ducked,false);
  assert.ok(bus.gain.events.some(([type,value,,tau])=>type==='target'&&value===1&&tau===.45));
});

test('pause/reset/restart owns no duplicate or late breath; stale completions cannot clear new owner',()=>{
  const h=audioFixture();h.advance(2);const old=h.sources.at(-1);h.audio.stop();
  assert.equal(old.disconnected,true);assert.equal(h.audio.diagnostics().sources,0);assert.equal(h.audio.diagnostics().effort,0);
  h.context.currentTime+=20;assert.equal(h.sources.length,1,'no timers start a late source');
  h.advance(2);const fresh=h.sources.at(-1);assert.notEqual(old,fresh);old.onended();assert.equal(h.audio.diagnostics().sources,1);
  h.audio.update({allowed:false});assert.equal(h.audio.diagnostics().enabled,false);assert.equal(h.audio.diagnostics().effort,0);
  const stop= fresh.stops.at(-1)[0];near(stop,h.context.currentTime+.025);
  h.audio.stop();assert.equal(h.audio.diagnostics().sources,0);assert.equal(fresh.disconnected,true);
  h.audio.dispose();h.audio.dispose();
});

test('suspension and denied state cannot schedule audio; finite breaths expire without callbacks',()=>{
  const h=audioFixture();h.advance(2);h.context.state='suspended';h.advance(3);assert.equal(h.audio.diagnostics().sources,0);
  assert.equal(h.sources.length,1);h.context.state='running';h.advance(2);assert.equal(h.sources.length,2);
  h.context.currentTime+=10;h.audio.update({allowed:true,dt:1/60,distance:speed/60});
  assert.equal(h.audio.diagnostics().sources,1);assert.equal(h.sources.length,3);
});

test('FieldAudio gates, mute, volume, interruption, reset and intro use the same owner',async()=>{
  const h=audioFixture(),field=new FieldAudio({weatherEnabled:false});
  field.ctx=h.context;field.master=h.context.createGain();field.gameGain=h.context.createGain();field.noise={};
  field.lifecycle=createAudioLifecycle(field.ctx,()=>field.stopPlayerBreathing());await field.lifecycle.resume();
  const game={runId:1,mode:'playing',entered:true,player:{health:100,zone:'corridor'}};
  function update(){field.ctx.currentTime+=1/60;field.updatePlayerBreathing(game,1/60,{distance:speed/60});}
  for(let i=0;i<180;i++)update();const owner=field.playerBreathing;assert.equal(owner.diagnostics().sources,1);
  field.unityVoice={};update();assert.equal(owner.diagnostics().ducked,true);field.unityVoice=null;
  field.toggleMute();assert.equal(owner.diagnostics().sources,0);update();assert.equal(owner.diagnostics().effort,0);
  field.toggleMute();for(let i=0;i<120;i++)update();field.setVolume(0);assert.equal(owner.diagnostics().sources,0);
  field.setVolume(.55);for(let i=0;i<120;i++)update();field.pause();assert.equal(owner.diagnostics().sources,0);
  await field.lifecycle.resume();for(let i=0;i<120;i++)update();field.reset();assert.equal(owner.diagnostics().sources,0);
  for(let i=0;i<120;i++)update();field.startIntro();assert.equal(owner.diagnostics().sources,0);field.stopIntro();
  game.survivalEnding={phase:'room'};update();assert.equal(owner.diagnostics().enabled,false);
  delete game.survivalEnding;for(let i=0;i<120;i++)update();game.runId++;update();assert.equal(owner.diagnostics().sources,0);assert.equal(owner.diagnostics().effort,0);
  assert.equal(field.playerBreathing,owner);
  for(let i=0;i<120;i++)update();field.ctx.state='suspended';update();assert.equal(owner.diagnostics().sources,0,'direct non-running FieldAudio path releases nodes');
  field.pause();
});
