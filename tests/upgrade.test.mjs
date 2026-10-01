import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {readFile} from 'node:fs/promises';
import {createRenderQuality} from '../src/render-quality.js';
import {createAudioLifecycle} from '../src/audio-lifecycle.js';
import {createHarness,eventTarget} from './helpers/browser.mjs';
import {createMaze,lineOfSight} from '../src/maze.js';
import {createGame} from '../src/game.js';
import {createCorridorFieldView} from '../src/corridor-view.js';
import {PRESENTATION} from '../src/presentation-config.js';
import {updateDirector,updateFeedback} from '../src/threat-director.js';
import {enterOpenField} from '../src/corridor-run.js';
import {senseZombie} from '../src/zombie-ai.js';
import {createWoodPanels} from '../src/wood-panels.js';
import {createWeather} from '../src/weather.js';
import {createWeatherView} from '../src/weather-view.js';

test('automatic quality ignores pauses and spikes, then responds to sustained load without oscillating',()=>{
  const quality=createRenderQuality({initial:'high'});
  for(let i=0;i<100;i++)quality.sample(.1,false);
  quality.sample(10);assert.equal(quality.snapshot().tier,'high');
  for(let i=0;i<65;i++)quality.sample(.1);
  assert.equal(quality.snapshot().tier,'balanced');
  for(let i=0;i<600;i++)quality.sample(1/60);
  assert.equal(quality.snapshot().tier,'balanced');
  quality.set('high');for(let i=0;i<100;i++)quality.sample(.1);
  assert.equal(quality.snapshot().tier,'high');
});

test('quality changes field detail but preserves corn placement count and gameplay',()=>{
  const maze=createMaze({corridors:true}),game=createGame(maze),scene=new THREE.Scene();
  const floor=new THREE.Mesh(new THREE.PlaneGeometry(100,100),new THREE.MeshStandardMaterial());
  const view=createCorridorFieldView(scene,maze,floor);
  const door=maze.cornDoors.find(door=>door.fieldEntrance);game.cornDoors[door.index].amount=1;
  assert(enterOpenField(game,door));
  Object.assign(game.player,{zone:'field',x:8,z:8});
  const before=JSON.stringify(game);
  view.setQuality(PRESENTATION.quality.high);view.update(game);
  const high={...view.stats};
  view.setQuality(PRESENTATION.quality.low);view.update(game);
  assert.equal(view.stats.near+view.stats.far,high.near+high.far);
  assert(view.stats.near<high.near);assert.equal(JSON.stringify(game),before);
});

test('audio interruption pauses once, suppresses automatic recovery, and resumes only on request',async()=>{
  const context={...eventTarget(),state:'suspended',resume(){this.state='running';this.dispatch('statechange');return Promise.resolve();},suspend(){this.state='suspended';this.dispatch('statechange');return Promise.resolve();}};
  let interrupted=0;const owner=createAudioLifecycle(context,()=>interrupted++);
  await owner.resume();context.state='interrupted';context.dispatch('statechange');
  assert.equal(interrupted,1);assert.equal(context.state,'suspended');
  context.state='running';context.dispatch('statechange');assert.equal(context.state,'suspended');
  await owner.resume();assert(owner.active);
  owner.pause();assert.equal(interrupted,1);owner.dispose();assert.equal(context.listenerCount(),0);
});

test('late audio resume cannot reverse pause intent and rejected suspension is contained',async()=>{
  let resolve;const context={...eventTarget(),state:'suspended',resume(){return new Promise(r=>resolve=r);},suspend(){this.state='suspended';return Promise.reject(new Error('browser closed'));}};
  const owner=createAudioLifecycle(context,()=>{}),pending=owner.resume();owner.pause();context.state='running';resolve();
  assert.equal(await pending,false);assert.equal(context.state,'suspended');owner.dispose();
});

test('an older audio resume cannot suspend a newer explicit resume, in either completion order',async()=>{
  for(const order of [[0,1],[1,0]]){
    const pending=[],context={...eventTarget(),state:'suspended',resume(){return new Promise(r=>pending.push(()=>{this.state='running';this.dispatch('statechange');r();}));},suspend(){this.state='suspended';this.dispatch('statechange');}};
    let interrupts=0;const owner=createAudioLifecycle(context,()=>interrupts++),first=owner.resume();owner.pause();const second=owner.resume();
    pending[order[0]]();await Promise.resolve();pending[order[1]]();assert.equal(await first,false);assert.equal(await second,true);assert(owner.active);assert.equal(interrupts,0);owner.dispose();
  }
});

test('rain quality persists across frames and reduced effects retain their cap',()=>{
  const maze=createMaze({corridors:true}),game=createGame(maze),weather=createWeather(maze),scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera();scene.fog=new THREE.FogExp2();game.mode='playing';
  const view=createWeatherView(scene,weather),rain=scene.getObjectByName('Recycled local rain');view.setQuality(PRESENTATION.quality.low);
  for(let i=0;i<3;i++)view.update(camera,game,{});
  assert.equal(rain.geometry.drawRange.count,Math.floor(weather.state.limits.rain*.5)*2);
  view.setQuality(PRESENTATION.quality.high);view.update(camera,game,{});assert.equal(rain.geometry.drawRange.count,weather.state.limits.rain*2);
  weather.state.reduced=true;view.update(camera,game,{});assert(view.stats.rain<=100);
});

test('page history restoration stays paused and clears held input until explicit resume',async()=>{
  const h=createHarness({touch:true,corridors:true});await h.app.enter();h.app.startLoop();h.key('KeyW');h.window.dispatch('pagehide');
  const frozen=h.app.snapshot();assert.equal(frozen.mode,'paused');assert.equal(h.audio.ctx.state,'suspended');
  h.window.dispatch('pageshow',{persisted:true});h.frame(300000);assert.deepEqual(h.app.snapshot(),frozen);
  assert.equal(h.frames.size,1);await h.app.enter();h.app.step(.1);assert.equal(h.app.snapshot().mode,'playing');
  h.audio.interrupt();assert.equal(h.app.snapshot().mode,'paused');h.app.dispose();assert.equal(h.audio.interruptionListeners.size,0);
});

test('intro interruption freezes its clock and restoration requires Continue',async()=>{
  const h=createHarness({touch:true,intro:true});h.click('start-btn');await h.flush();h.app.advance(2000);h.window.dispatch('pagehide');
  const before=h.app.introSnapshot();h.window.dispatch('pageshow',{persisted:true});h.app.advance(5000);
  assert.deepEqual(h.app.introSnapshot(),before);assert.equal(before.phase,'paused');h.app.dispose();
});

test('pacing recovery suppresses discretionary messages without removing the pursuing actor or changing qualification',()=>{
  const game=createGame(createMaze({corridors:true}));game.enemy.zone=game.player.zone;game.enemy.state='chase';game.enemy.visible=true;
  const timer=JSON.stringify(game.corridorRun);updateDirector(game,.1);assert.equal(game.threat.pacing.phase,'pressure');
  game.enemy.state='observe';game.elapsed=1;updateDirector(game,.1);assert.equal(game.threat.pacing.phase,'recovery');
  updateFeedback(game,.1);assert.equal(game.threat.activeMessage,null);assert(game.enemy.visible);
  game.elapsed=10;updateDirector(game,.1);assert.notEqual(game.threat.pacing.phase,'recovery');
  assert.equal(JSON.stringify(game.corridorRun),timer);
});

test('additional animation bank is finite, credited, in place and bounded',async()=>{
  const bank=JSON.parse(await readFile(new URL('../assets/field/zombie-clips.json',import.meta.url)));
  assert.equal(bank.license,'CC-BY-3.0');assert.equal(bank.clips.length,2);
  for(const data of bank.clips){const clip=THREE.AnimationClip.parse(data);assert(clip.validate());assert(clip.duration<5);
    for(const track of clip.tracks){assert([...track.values].every(Number.isFinite));if(track.name==='Bip01.position')for(let i=3;i<track.values.length;i+=3){assert.equal(track.values[i],track.values[0]);assert.equal(track.values[i+2],track.values[2]);}}
  }
});

test('quiet footsteps behind wood lose range while a loud shot still supplies its recorded position',()=>{
  const game=createGame(createMaze({corridors:true})),world=game.maze.cornWorld;
  const points=[];for(let z=0;z<world.height;z++)for(let x=0;x<world.width;x++)if(world.walk[z*world.width+x])points.push({x:(x+.5)*world.size,z:(z+.5)*world.size});
  let pair;
  for(const a of points){for(const b of points){const d=Math.hypot(a.x-b.x,a.z-b.z);if(d>5&&d<8&&!lineOfSight(game.maze,a,b,[])){pair=[a,b];break;}}if(pair)break;}
  assert(pair);Object.assign(game.enemy,pair[0]);Object.assign(game.player,{x:10000,z:10000,flashlightOn:false});
  const event={type:'footsteps',position:pair[1],radius:9,priority:2,at:game.elapsed,zone:'corridor'};game.evidence=[event];
  assert.equal(senseZombie(game,[]).heard,null);
  event.type='gunshot';assert.deepEqual(senseZombie(game,[]).heard.position,pair[1]);assert.deepEqual(game.enemy.memory.lastKnown,pair[1]);
});

test('wall batches retire recycled cells and maintain finite bounds',()=>{
  const parent=new THREE.Group(),walls=createWoodPanels(parent,new THREE.MeshStandardMaterial(),{spatial:true});
  const world={width:80,height:3,size:1,walk:new Uint8Array(240)};world.walk[81]=1;
  assert.equal(walls.rebuild(world).count,4);const old=parent.children[0];
  world.walk[81]=0;world.walk[150]=1;assert.equal(walls.rebuild(world).count,4);
  assert(!parent.children.includes(old));assert.equal(parent.children.length,3);
  for(const mesh of parent.children){assert(mesh.frustumCulled);assert(Number.isFinite(mesh.boundingSphere.radius));assert(mesh.boundingSphere.center.x>60);}
});
