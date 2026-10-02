import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,startGame,updateGame,pauseGame,resumeGame,blocksFor,gameSnapshot} from '../src/game.js';
import {createMaze} from '../src/maze.js';
import {attachSurvivalEnding,completeSurvival,survivalTime,pitPrompt,survivalLine} from '../src/survival-ending.js';
import {ROOM_DURATION,SURVIVAL_LINES} from '../src/survival-script.js';
import {enterOpenField} from '../src/corridor-run.js';
import {beginTackle} from '../src/grapple.js';
import {createHarness} from './helpers/browser.mjs';
import * as THREE from 'three';
import {createSurvivalVisuals} from '../src/survival-visuals.js';

function setup(briefing=false){const g=createGame(createMaze({corridors:true}));attachSurvivalEnding(g,{briefing});startGame(g);g.grace=1000;blocksFor(g);return g;}
function normalized(g){const s=gameSnapshot(g,{diagnostic:true});delete s.survivalEnding;return s;}

test('deadline has no gameplay side effects: same AI, movement, ammo, rewards, field spawning, and corridor changes',()=>{
  const original=createGame(createMaze({corridors:true})),timed=setup();startGame(original);original.grace=1000;
  for(const g of [original,timed]){g.runId=100;Object.assign(g.player,g.maze.corridorLayout.sections[4].anchor);g.entered=true;g.corridorRun.started=true;}
  for(let i=0;i<300;i++){
    original.grace=timed.grace=1000;
    const controls={forward:i%7?1:0,strafe:i%11===0?1:0,yaw:(i%120)/40,pitch:0,sprint:i%3===0,fire:i%41===0,flashlight:i%59===0};
    updateGame(original,.05,controls);updateGame(timed,.05,controls);
    assert.deepEqual(normalized(timed),normalized(original),`input step ${i}`);
  }
  const doors=original.maze.cornDoors.filter(d=>d.fieldEntrance),door=doors[0];
  for(const g of [original,timed]){Object.assign(g.player,{x:door.x,z:door.z-.9});assert.ok(enterOpenField(g,door));Object.assign(g.player,{x:0,z:50});}
  original.grace=timed.grace=1000;
  updateGame(original,20,{});updateGame(timed,20,{});assert.deepEqual(normalized(timed),normalized(original));
  assert.ok(timed.enemies.some(e=>e.extra&&e.active));
});
test('active seconds include corn and grapple time, but actual pause freezes the deadline',()=>{
  const g=setup();updateGame(g,1);assert.ok(Math.abs(g.survivalEnding.remaining-179)<1e-8);
  const d=g.maze.cornDoors.find(d=>d.fieldEntrance);Object.assign(g.player,{x:d.x,z:d.z-.9});enterOpenField(g,d);updateGame(g,2);assert.ok(g.survivalEnding.remaining<177.01);
  pauseGame(g);const remaining=g.survivalEnding.remaining;updateGame(g,9);assert.equal(g.survivalEnding.remaining,remaining);resumeGame(g);updateGame(g,1);assert.ok(g.survivalEnding.remaining<remaining);
});
test('room is free movement, bounded, harmless, complete script, no premature timer',()=>{
  const g=setup(true);g.survivalEnding.phase='room';const health=g.player.health;
  updateGame(g,1,{forward:1,yaw:.2,pitch:.3,fire:true});assert.notEqual(g.survivalEnding.roomPlayer.z,3);assert.equal(g.player.health,health);assert.equal(g.player.ammo,2);assert.equal(g.survivalEnding.remaining,180);
  assert.equal(SURVIVAL_LINES.filter(l=>l.chapter==='room').length,9);assert.ok(ROOM_DURATION+3.5<=30);
  assert.match(SURVIVAL_LINES.find(l=>l.id==='GATE-HEAL').text,/glowing scarecrows.*restore you.*only once/);
  for(const line of SURVIVAL_LINES.filter(l=>l.chapter==='room'))assert.equal(survivalLine({phase:'room',time:line.start+.01}).id,line.id);
  assert.equal(g.elapsed,0,'room presentation must not age combat/AI clocks');
});
test('every presentation phase follows actual pause without aging the game clock',()=>{
  for(const phase of ['arrival','entry','room','exit','active','transform','pit','fall']){
    const g=setup();Object.assign(g.survivalEnding,{phase,center:{x:0,z:0}});pauseGame(g);
    const state=structuredClone(g.survivalEnding),elapsed=g.elapsed;updateGame(g,10);
    assert.deepEqual(g.survivalEnding,state);assert.equal(g.elapsed,elapsed);
  }
});
test('zero is authoritative in every grapple phase and in the open field, with no late damage',()=>{
  for(const phase of ['tackle','qte','stab','throw','recovery','field']){
    const g=setup();Object.assign(g.player,g.maze.corridorLayout.sections[4].anchor);g.grace=0;Object.assign(g.enemy,{x:g.player.x,z:g.player.z-.7,state:'chase'});
    if(phase==='field'){const d=g.maze.cornDoors.find(d=>d.fieldEntrance);Object.assign(g.player,{x:d.x,z:d.z-.9});enterOpenField(g,d);}
    else {assert.ok(beginTackle(g,blocksFor(g)));g.interaction.phase=phase;g.pendingStabs.push(g.elapsed+.01);}
    g.player.health=.01;g.survivalEnding.remaining=.01;updateGame(g,1/60,{stab:true,fire:true});
    assert.equal(g.mode,'playing');assert.equal(g.player.health,.01);assert.equal(g.survivalEnding.phase,'transform');assert.equal(g.interaction,null);assert.equal(g.pendingStabs.length,0);assert.ok(g.enemies.every(e=>!e.active));
    updateGame(g,4.1,{});assert.equal(g.survivalEnding.phase,'pit');assert.ok(Math.hypot(g.player.x-g.survivalEnding.center.x,g.player.z-g.survivalEnding.center.z)>10.6);
  }
});
test('stable display never shows zero early; exactly 180 simulated active seconds completes',()=>{
  const g=setup();g.survivalEnding.remaining=.01;assert.equal(survivalTime(g.survivalEnding),'00:01');
  g.survivalEnding.remaining=180;for(let i=0;i<3;i++)updateGame(g,60);
  assert.equal(g.survivalEnding.remaining,0);assert.equal(survivalTime(g.survivalEnding),'00:00');assert.equal(g.survivalEnding.phase,'transform');assert.ok(Math.abs(g.elapsed-180)<1e-6);
});
test('pit blocks walking off rim; jump is voluntary and ends without a daughter win',()=>{
  const g=setup();completeSurvival(g);updateGame(g,4.1);const center=g.survivalEnding.center;
  Object.assign(g.player,{x:center.x,z:center.z+11,yaw:0});updateGame(g,2,{forward:1});assert.ok(g.player.z-center.z>=10.6);assert.equal(g.survivalEnding.phase,'pit');assert.equal(pitPrompt(g),'E - JUMP');
  updateGame(g,10);assert.equal(g.survivalEnding.phase,'pit');updateGame(g,.02,{interact:true});assert.equal(g.survivalEnding.phase,'fall');updateGame(g,3.3);assert.equal(g.mode,'playtest-ended');assert.equal(g.progress.daughterFound,false);
});
test('application focus loss freezes briefing and timer; retry starts existing game without story',async()=>{
  const h=createHarness({corridors:true,ending:true});h.click('start-btn');await h.flush();h.app.step(1);const time=h.app.snapshot().survivalEnding.time;
  h.window.dispatch('blur');h.app.step(9);assert.equal(h.app.snapshot().survivalEnding.time,time);
  h.click('resume-btn');await h.flush();h.app.step(1);assert.ok(h.app.snapshot().survivalEnding.time>time);
  h.click('retry-btn');await h.flush();assert.equal(h.app.snapshot().survivalEnding.phase,'active');assert.equal(h.app.snapshot().survivalEnding.remaining,180);assert.equal(h.app.snapshot().player.health,100);assert.equal(h.app.snapshot().player.ammo,2);h.app.dispose();
});
test('story/title skip still flows through one arrival line and briefing into the existing run',async()=>{
  const h=createHarness({corridors:true,prologue:true,ending:true});h.click('start-btn');await h.flush();
  h.key('KeyK');await h.flush();assert.equal(h.app.snapshot().mode,'playing');assert.equal(h.app.snapshot().survivalEnding.phase,'arrival');
  h.app.step(2.8);assert.equal(h.app.snapshot().survivalEnding.phase,'entry');
  h.app.step(ROOM_DURATION+3.6);assert.equal(h.app.snapshot().survivalEnding.phase,'active');assert.ok(h.app.snapshot().survivalEnding.remaining>179.8);h.app.dispose();
});
test('pit retry releases owned instance data without disposing borrowed game corn',()=>{
  const geometry=new THREE.ConeGeometry(1,2,4),material=new THREE.MeshBasicMaterial(),disposed=[];
  geometry.addEventListener('dispose',()=>disposed.push('borrowed geometry'));material.addEventListener('dispose',()=>disposed.push('borrowed material'));
  let instances=0;
  const renderer={domElement:{clientWidth:800,clientHeight:600},render(scene){scene.traverse(o=>{if(o.isInstancedMesh){instances++;o.addEventListener('dispose',()=>disposed.push('instance'));}});}};
  const view=createSurvivalVisuals({renderer,introCorn:()=>[{geometry,material}]});
  const g=setup();completeSurvival(g);g.survivalEnding.phase='pit';view.render(g);view.release();
  assert.equal(instances,1);assert.deepEqual(disposed,['instance']);assert.equal(view.diagnostics().active,false);view.dispose();
  geometry.dispose();material.dispose();
});
