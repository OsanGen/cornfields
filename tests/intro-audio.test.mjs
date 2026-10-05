import test from 'node:test';
import assert from 'node:assert/strict';
import {FieldAudio} from '../src/audio.js';
import {createAudioLifecycle} from '../src/audio-lifecycle.js';
import {introFrame} from '../src/intro.js';
import {eventTarget} from './helpers/browser.mjs';

function fixture(){
  const audio=new FieldAudio({weatherEnabled:false}),sources=[];
  const param=()=>({value:0,events:[],setValueAtTime(v,t){this.value=v;this.events.push(['set',v,t]);},setTargetAtTime(v,t){this.value=v;this.events.push(['target',v,t]);},linearRampToValueAtTime(v,t){this.value=v;this.events.push(['ramp',v,t]);},exponentialRampToValueAtTime(v){this.value=v;},cancelScheduledValues(){}});
  const node=()=>({gain:param(),frequency:param(),connect(next){this.destination=next;return next;},disconnect(){this.disconnected=true;}});
  const source=()=>{const s={...node(),stopped:0,stops:[],start(...args){this.started=args;},stop(...args){this.stopped++;this.stops.push(args);}};sources.push(s);return s;};
  audio.ctx={...eventTarget(),state:'running',currentTime:1,createGain:node,createBiquadFilter:node,createBufferSource:source,createOscillator:source,resume(){this.state='running';},suspend(){this.state='suspended';}};
  audio.lifecycle=createAudioLifecycle(audio.ctx,()=>{});void audio.lifecycle.resume();
  audio.master=node();audio.gameGain=node();audio.noise={};audio.samples.distress={};
  return {audio,sources};
}
const near=(actual,expected)=>assert.ok(Math.abs(actual-expected)<1e-8,`${actual} != ${expected}`);
function musicFixture(){const h=fixture();h.audio.samples.titleMusic={duration:3};return h;}

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

test('title music starts only from a visible rendered CORNFIELDS frame, never its earlier cue',()=>{
  const {audio}=musicFixture();audio.syncIntro(introFrame(18));assert.equal(audio.titleMusicVoice,undefined);
  audio.startIntro();
  for(const frame of [null,introFrame(16),introFrame(17.8),{...introFrame(18),shot:'creator'},introFrame(20,{ready:true})])audio.syncIntro(frame);
  audio.introCue('title_sting');assert.equal(audio.titleMusicVoice,undefined);
  audio.syncIntro(introFrame(17.81));const {source,level}=audio.titleMusicVoice;
  assert.equal(source.buffer,audio.samples.titleMusic);assert.equal(source.loop,false);
  near(source.started[1],.01);near(source.started[2],2.19);
  assert.equal(source.destination,level);assert.equal(level.destination,audio.introGain);assert.equal(audio.introGain.destination,audio.master);
  assert.equal(audio.transients.size,0);assert.equal(audio.sources.length,0);
  audio.stopIntro();
});

test('title music follows volume and schedules silence by twenty seconds, including late visible frames',()=>{
  const {audio}=musicFixture();audio.startIntro();audio.setVolume(.2);audio.syncIntro(introFrame(19.8));
  const {source,level}=audio.titleMusicVoice;near(audio.master.gain.value,.2*.48);
  near(source.started[1],2);near(source.started[2],.2);near(source.stops[0][0],audio.ctx.currentTime+.2);
  const events=level.gain.events;assert.equal(events.at(-1)[0],'ramp');assert.equal(events.at(-1)[1],0);near(events.at(-1)[2],audio.ctx.currentTime+.2);
  assert.ok(events.every(([,value])=>value>=0&&value<=1));
  audio.syncIntro(introFrame(20));assert.equal(audio.titleMusicVoice,null);assert.equal(source.disconnected,true);
});

test('matching frames reuse one voice; a clamped slow frame seeks without adding a second voice',()=>{
  const {audio,sources}=musicFixture();audio.startIntro();audio.syncIntro(introFrame(18));const first=audio.titleMusicVoice.source;
  audio.ctx.currentTime+=.05;audio.syncIntro(introFrame(18.05));assert.equal(audio.titleMusicVoice.source,first);
  audio.ctx.currentTime+=.5;audio.syncIntro(introFrame(18.15));const next=audio.titleMusicVoice.source;
  assert.notEqual(next,first);assert.equal(first.disconnected,true);near(next.started[1],.35);assert.equal(audio.introSources.size,3);
  first.onended();assert.equal(audio.titleMusicVoice.source,next,'old completion must not clear the current voice');
  audio.syncIntro(null);const count=sources.length;audio.syncIntro(introFrame(20));assert.equal(sources.length,count);assert.equal(audio.titleMusicVoice,null);
  audio.stopIntro();
});

test('pause, mute and repeated intro entry cancel and seek only their current title voice',async()=>{
  const {audio,sources}=musicFixture();audio.startIntro();audio.syncIntro(introFrame(18.4));const first=audio.titleMusicVoice.source;
  audio.pause();audio.syncIntro(introFrame(18.4));assert.equal(audio.titleMusicVoice,null);assert.equal(first.disconnected,true);
  await audio.lifecycle.resume();audio.startIntro();audio.syncIntro(introFrame(18.4));const resumed=audio.titleMusicVoice.source;near(resumed.started[1],.6);
  audio.toggleMute();assert.equal(resumed.disconnected,true);audio.syncIntro(introFrame(18.4));assert.equal(audio.titleMusicVoice,null);
  audio.toggleMute();const mutedCount=sources.length;audio.syncIntro(introFrame(18.4));assert.equal(sources.length,mutedCount,'unmute alone cannot revive a stopped intro');
  audio.startIntro();audio.syncIntro(introFrame(18.5));const unmuted=audio.titleMusicVoice.source;near(unmuted.started[1],.7);
  audio.startIntro();assert.equal(unmuted.disconnected,true);audio.syncIntro(introFrame(17.85));near(audio.titleMusicVoice.source.started[1],.05);
  assert.equal(audio.introSources.size,3);audio.startGameplay();assert.equal(audio.titleMusicVoice,null);assert.equal(audio.introGain,null);
});

test('missing or short excerpts remain optional and the existing intro voice cap still applies',()=>{
  const {audio}=fixture();audio.startIntro();audio.syncIntro(introFrame(18));assert.equal(audio.titleMusicVoice,undefined);
  audio.samples.titleMusic={duration:.3};audio.syncIntro(introFrame(17.9));near(audio.titleMusicVoice.source.started[2],.2);
  audio.syncIntro(introFrame(18.2));assert.equal(audio.titleMusicVoice,null);
  audio.samples.titleMusic={duration:3};while(audio.introSources.size<8)audio.introSound({loop:true});
  audio.syncIntro(introFrame(18.3));assert.equal(audio.titleMusicVoice,null);assert.equal(audio.introSources.size,8);audio.stopIntro();
});

test('the bounded local loader keeps one title decode and a late completion never autoplays',async t=>{
  const {audio,sources}=fixture(),requests=[],decoded=[];let resolveTitle;
  audio.footsteps={load:async()=>{}};
  audio.ctx.decodeAudioData=async bytes=>{const buffer={duration:3,bytes};decoded.push(buffer);return buffer;};
  t.mock.method(globalThis,'fetch',async(url,options)=>{
    requests.push({url,options});
    if(url.pathname.endsWith('/title-music.mp3'))return new Promise(resolve=>resolveTitle=resolve);
    return {ok:true,arrayBuffer:async()=>new ArrayBuffer(1)};
  });
  await audio.prepare();audio.startIntro();audio.syncIntro(introFrame(18));assert.equal(audio.titleMusicVoice,undefined);
  audio.startGameplay();const count=sources.length;
  resolveTitle({ok:true,arrayBuffer:async()=>new ArrayBuffer(250)});await audio.samplesReady;
  assert.equal(sources.length,count);assert.equal(audio.titleMusicVoice,undefined);assert.equal(audio.introGain,null);
  const buffer=audio.samples.titleMusic;assert.equal(buffer.bytes.byteLength,250);
  await audio.prepare();await audio.samplesReady;
  assert.equal(requests.filter(({url})=>url.pathname.endsWith('/title-music.mp3')).length,1);
  assert.equal(audio.samples.titleMusic,buffer);assert.equal(decoded.filter(value=>value===buffer).length,1);
  assert.ok(requests.every(({url,options})=>url.protocol==='file:'&&options.signal instanceof AbortSignal));
  audio.syncIntro(introFrame(18.5));assert.equal(sources.length,count,'a stale frame has no intro bus after gameplay starts');
});

test('a title asset arriving within its live window seeks on the next frame, never from fetch completion',async t=>{
  const {audio,sources}=fixture();let resolveTitle;
  audio.footsteps={load:async()=>{}};audio.ctx.decodeAudioData=async()=>({duration:3});
  t.mock.method(globalThis,'fetch',async url=>url.pathname.endsWith('/title-music.mp3')?new Promise(resolve=>resolveTitle=resolve):{ok:false});
  await audio.prepare();audio.startIntro();audio.syncIntro(introFrame(18));const count=sources.length;
  resolveTitle({ok:true,arrayBuffer:async()=>new ArrayBuffer(100)});await audio.samplesReady;assert.equal(sources.length,count);
  audio.syncIntro(introFrame(19));near(audio.titleMusicVoice.source.started[1],1.2);near(audio.titleMusicVoice.source.started[2],1);
  audio.stopIntro();
});

test('failed and oversized title assets are not decoded or requested repeatedly',async t=>{
  for(const response of [{ok:false},{ok:true,arrayBuffer:async()=>new ArrayBuffer(300001)}]){
    const {audio}=fixture();let titleRequests=0,decodes=0;
    audio.footsteps={load:async()=>{}};audio.ctx.decodeAudioData=async()=>{decodes++;return {duration:3};};
    const mock=t.mock.method(globalThis,'fetch',async url=>{if(url.pathname.endsWith('/title-music.mp3')){titleRequests++;return response;}return {ok:false};});
    await audio.prepare();await audio.samplesReady;await audio.prepare();await audio.samplesReady;
    assert.equal(titleRequests,1);assert.equal(decodes,0);assert.equal(audio.samples.titleMusic,undefined);
    audio.startIntro();audio.syncIntro(introFrame(18));assert.equal(audio.titleMusicVoice,undefined);audio.stopIntro();mock.mock.restore();
  }
});
