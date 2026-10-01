import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createFootstepBank,FOOTSTEP_FILES} from '../src/footsteps.js';
import {FieldAudio} from '../src/audio.js';

function fixture(fetcher=async()=>({ok:true,arrayBuffer:async()=>new ArrayBuffer(10)})){
  const requests=[],sources=[];
  const param=()=>({value:0,setValueAtTime(v){this.value=v;},linearRampToValueAtTime(){},setTargetAtTime(){}});
  const node=()=>({gain:param(),pan:param(),frequency:param(),playbackRate:param(),connect(target){this.target=target;return target;},disconnect(){}});
  const audio={muted:false,master:node(),gameGain:node(),noise:{duration:3},ctx:{state:'running',currentTime:1,
    createGain:node,createBiquadFilter:node,createStereoPanner:node,decodeAudioData:async()=>({duration:.32}),
    createBufferSource(){const s={...node(),start(){this.started=true;},stop(at){if(at===undefined)this.cancelled=true;}};sources.push(s);return s;}}};
  const bank=createFootstepBank(audio,{fetcher:(...args)=>{requests.push(args[0].pathname);return fetcher(...args);}});
  return {audio,bank,requests,sources};
}

test('bank caches once, varies contacts, and wet impact layers share one logical footfall',async()=>{
  const h=fixture();await h.bank.load();await h.bank.load();assert.equal(h.requests.length,14);
  assert.equal(h.bank.diagnostics().state,'ready');
  h.bank.play({surface:'soft'});const first=h.sources[0].buffer;h.bank.stop();h.bank.play({surface:'soft'});
  assert.notEqual(h.sources[1].buffer,first);h.bank.stop();
  h.bank.play({surface:'mud',wet:true});assert.equal(h.sources.length,4);
  assert.equal(h.bank.diagnostics().played,3);assert.equal(h.bank.diagnostics().wet,1);
  assert.equal(h.bank.diagnostics().voices,2);h.bank.dispose();
});

test('missing clips retain bounded fallback, never replay late and respect mute and bus ownership',async()=>{
  const h=fixture(async()=>({ok:false}));await h.bank.load();
  assert.equal(h.requests.length,14);assert.equal(h.bank.diagnostics().state,'fallback');
  const opening={};h.bank.play({owner:'prologue',bus:opening});h.bank.play({owner:'game'});
  let end=h.sources[0];for(let i=0;i<4;i++)end=end.target;assert.equal(end,opening);
  h.bank.stop('prologue');assert.ok(h.sources[0].cancelled);assert.equal(h.sources[1].cancelled,undefined);
  for(let i=0;i<30;i++)h.bank.play();assert.equal(h.bank.diagnostics().voices,10);
  h.bank.stop();h.audio.muted=true;assert.equal(h.bank.play(),false);
  h.audio.muted=false;h.audio.ctx.state='suspended';assert.equal(h.bank.play(),false);
  const count=h.sources.length;await h.bank.load();assert.equal(h.sources.length,count);h.bank.dispose();
});

test('late decode after disposal cannot repopulate the shared cache',async()=>{
  let resolve;const h=fixture(()=>new Promise(r=>resolve=r));const loading=h.bank.load();h.bank.dispose();
  resolve({ok:true,arrayBuffer:async()=>new ArrayBuffer(10)});await loading;
  assert.equal(h.bank.diagnostics().buffers,0);assert.equal(h.bank.play(),false);
});

test('weather dry and wet events route once; per-zombie cursors do not suppress each other',()=>{
  const audio=new FieldAudio(),calls=[];audio.ctx={state:'running',currentTime:0};audio.footstep=options=>calls.push(options);
  const enemy={id:'pursuer',active:true,zone:'corridor',visible:true,x:2,z:0,step:0,state:'stunned'};
  const other={...enemy,id:'field-0',x:-2};
  const game={mode:'playing',player:{x:0,z:0,yaw:0,zone:'corridor'},enemy,enemies:[enemy,other],steps:0};
  audio.weatherEvent({type:'footstep',wet:false,surface:'soft'},game);
  audio.weatherEvent({type:'footstep',wet:true,surface:'mud'},game);assert.equal(calls.length,2);
  audio.update(game,.016,{footsteps:false});enemy.step=2;other.step=2;audio.update(game,.016,{footsteps:false});
  assert.equal(calls.length,4);assert.equal(calls[2].actor,'pursuer');assert.equal(calls[3].actor,'field-0');
  assert.ok(calls[2].pan>0&&calls[3].pan<0);
  other.zone='field';other.step=8;audio.update(game,.016,{footsteps:false});assert.equal(calls.length,4);
  other.zone='corridor';audio.update(game,.016,{footsteps:false});assert.equal(calls.length,4);
  game.mode='paused';enemy.step=4;audio.update(game,.016);assert.equal(calls.length,4);
});

test('footstep recording manifest matches compact locally hosted nonclipping media',async()=>{
  const source=JSON.parse(await readFile(new URL('../assets/audio/footsteps/sources.json',import.meta.url)));
  assert.equal(source.license,'CC0-1.0');assert.equal(source.files.length,12);
  let size=0;
  for(const entry of source.files){const bytes=await readFile(new URL(`../assets/audio/footsteps/${entry.file}`,import.meta.url));
    assert.equal(createHash('sha256').update(bytes).digest('hex'),entry.sha256);size+=bytes.length;
    assert.ok(entry.peak<.9&&entry.duration<.5);}
  assert.ok(size<300000);assert.equal(Object.keys(FOOTSTEP_FILES).length,14);
});
