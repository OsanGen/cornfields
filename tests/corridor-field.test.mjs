import test from 'node:test';
import assert from 'node:assert/strict';
import {createMaze,canOccupy,pathTo} from '../src/maze.js';
import {createGame,startGame,updateGame,blocksFor} from '../src/game.js';
import {enterOpenField,leaveOpenField,advanceCorridorRun,activeEnemies} from '../src/corridor-run.js';
import {fireGun} from '../src/combat.js';
import {beginTackle} from '../src/grapple.js';
import {addEvidence} from '../src/game-config.js';
import {senseZombie} from '../src/zombie-ai.js';
import {createHarness} from './helpers/browser.mjs';

function setup(){const g=createGame(createMaze({corridors:true}));startGame(g);g.entered=true;g.corridorRun.started=true;Object.assign(g.player,g.maze.corridorLayout.sections[1].anchor);g.grace=1000;blocksFor(g);return g;}
function field(g){const d=g.maze.cornDoors.find(d=>d.fieldEntrance);Object.assign(g.cornDoors[d.index],{amount:1,target:1});Object.assign(g.player,{x:d.x,z:d.z-.9});assert.equal(enterOpenField(g,d),true);blocksFor(g);return d;}

test('production corridor layout has breathing room and optional field doors',()=>{
  const maze=createMaze({corridors:true});
  assert.ok(maze.corridorLayout);
  assert.ok(maze.corridorLayout.clearWidth>=3);
  assert.equal(maze.cornDoors.filter(d=>d.fieldEntrance).length,9);
  assert.equal(maze.survivalLayout,undefined);
});

test('three minute progress freezes in field while the gameplay clock keeps running',()=>{
  const g=setup();updateGame(g,1,{});const before=g.corridorRun.elapsed;field(g);updateGame(g,2,{});
  assert.equal(g.corridorRun.elapsed,before);assert.ok(g.elapsed>=2.99);
  leaveOpenField(g);updateGame(g,1,{});assert.ok(g.corridorRun.elapsed>before+.99);
});
test('field is freely walkable far beyond the old maze and returns to its own doorway',()=>{
  const g=setup(),health=g.player.health,ammo=g.player.ammo,d=field(g);
  for(const [x,z]of [[50,50],[-50,50],[500,-500],[-500,-500]])assert.equal(canOccupy(g.maze,x,z,.25,blocksFor(g)),true);
  Object.assign(g.player,{x:0,z:-.8});leaveOpenField(g);
  assert.equal(g.player.x,d.x);assert.equal(g.player.z,d.z+.9);assert.equal(g.player.health,health);assert.equal(g.player.ammo,ammo);
});
test('corridor routes are wide, connected and cannot pass the daughter gate early',()=>{
  const g=setup(),w=g.maze.cornWorld;
  for(const s of g.maze.corridorLayout.sections){assert.ok(pathTo(g.maze,g.player,s.anchor,blocksFor(g)).length);assert.ok(canOccupy(g.maze,s.anchor.x+1,s.anchor.z,.25,g.blocks));}
  assert.equal(pathTo(g.maze,g.player,g.maze.daughter,blocksFor(g)).length,0);
  Object.assign(g.corridorRun,{elapsed:180,distance:120});advanceCorridorRun(g,0);updateGame(g,.5,{});
  assert.equal(g.corridorRun.ready,true);assert.ok(pathTo(g.maze,g.player,g.maze.daughter,blocksFor(g)).length);
});
test('field spawns are capped, gradual, outside visibility and absent near the entrance',()=>{
  const g=setup();field(g);advanceCorridorRun(g,1);assert.equal(activeEnemies(g).length,0);
  Object.assign(g.player,{x:0,z:50});
  for(let i=0;i<30;i++){g.elapsed++;advanceCorridorRun(g,1);}
  assert.equal(activeEnemies(g).length,3);
  for(const e of activeEnemies(g))assert.ok(Math.hypot(e.x-g.player.x,e.z-g.player.z)>=11.9);
  Object.assign(g.player,{x:0,z:1});advanceCorridorRun(g,1);assert.equal(activeEnemies(g).length,0);
});
test('all zombies receive the same sound and one shot hits only the nearest target',()=>{
  const g=setup();field(g);Object.assign(g.player,{x:0,z:10,yaw:Math.PI,pitch:-.1,hidden:false,flashlightOn:false});
  for(const [i,e]of g.enemies.slice(1,3).entries())Object.assign(e,{active:true,zone:'field',x:0,z:12+i,visible:true,state:'observe'});
  addEvidence(g,'gunshot',g.player,18,4);
  for(const e of activeEnemies(g)){g.enemy=e;assert.equal(senseZombie(g,blocksFor(g)).heard.type,'gunshot');}
  fireGun(g,blocksFor(g));assert.equal(g.enemies[1].state,'staggered');assert.equal(g.enemies[2].state,'observe');assert.equal(g.metrics.shotsHit,1);
});
test('corridor QTE reserves a valid local landing and has exactly one owner',()=>{
  const g=setup();g.grace=0;Object.assign(g.enemy,{x:g.player.x,z:g.player.z-.7,state:'chase'});
  assert.equal(beginTackle(g,blocksFor(g)),true);assert.equal(g.interaction.enemyId,'pursuer');assert.equal(g.interaction.landing.anchor.id,null);
  assert.equal(beginTackle(g,blocksFor(g)),false);
  for(const p of g.interaction.landing.route)assert.ok(canOccupy(g.maze,p.x,p.z,.25,g.blocks));
});
test('real controls walk through a side opening and return without a timer reset',()=>{
  const g=setup(),d=g.maze.cornDoors.find(d=>d.fieldEntrance);
  Object.assign(g.player,{x:d.x,z:d.z+1.3,yaw:0});
  assert.equal(g.cornDoors[d.index].amount,1);
  updateGame(g,.8,{forward:1});assert.equal(g.player.zone,'field');const time=g.corridorRun.elapsed;
  updateGame(g,.25,{});assert.equal(g.corridorRun.elapsed,time);
  g.player.yaw=0;updateGame(g,1,{forward:1});assert.equal(g.player.zone,'corridor');assert.ok(g.corridorRun.elapsed>=time);
});
test('independent runs and pause do not mutate another corridor layout or advance clocks',()=>{
  const a=setup(),b=setup();a.maze.cornWorld.walk[100]=1;assert.equal(b.maze.cornWorld.walk[100],0);
  a.mode='paused';updateGame(a,30,{forward:1});assert.equal(a.elapsed,0);assert.equal(a.corridorRun.elapsed,0);
});
test('a real three-minute corridor circuit qualifies and leads to the daughter',()=>{
  const g=setup(),sequence=[0,3,6,7,8,5,2,1,4];let at=0;
  const walk=target=>{
    g.grace=1000; // Controlled navigation test; QTE damage is exercised separately.
    const route=pathTo(g.maze,g.player,target,blocksFor(g));assert.ok(route.length,'current route remains reachable');
    const next=route.find(p=>Math.hypot(p.x-g.player.x,p.z-g.player.z)>.08)||target;
    updateGame(g,.06,{forward:1,yaw:Math.atan2(g.player.x-next.x,g.player.z-next.z)});
  };
  for(let i=0;i<3100&&!g.corridorRun.ready;i++){
    const target=g.maze.corridorLayout.sections[sequence[at%sequence.length]].anchor;
    if(Math.hypot(target.x-g.player.x,target.z-g.player.z)<.3)at++;
    else walk(target);
  }
  assert.ok(g.corridorRun.ready,JSON.stringify({run:g.corridorRun,mode:g.mode}));assert.ok(g.corridorRun.distance>=120);assert.ok(g.corridorRun.elapsed>=180);
  updateGame(g,.5,{});
  for(let i=0;i<1800&&g.mode==='playing';i++)walk(g.maze.daughter);
  assert.equal(g.mode,'won');assert.equal(g.progress.daughterFound,true);
});
test('standing beside a field door is not a tackle immunity spot',()=>{
  const g=setup(),d=g.maze.cornDoors.find(d=>d.fieldEntrance);
  Object.assign(g.player,{x:d.x,z:d.z+.4});Object.assign(g.enemy,{x:d.x,z:d.z+1.05,state:'chase'});g.grace=0;
  assert.equal(beginTackle(g,blocksFor(g)),true);
  assert.ok(g.interaction.landing.anchor.pocket.z>d.z);
});
test('a pursuer follows only a known open doorway and retains independent state',()=>{
  const g=setup(),d=g.maze.cornDoors.find(d=>d.fieldEntrance),e=g.enemies[0];
  Object.assign(e,{x:d.x,z:d.z+1.8,state:'chase'});e.memory.lastKnown={x:d.x,z:d.z+1};
  field(g);Object.assign(g.player,{x:0,z:3});
  updateGame(g,1.5,{});assert.equal(e.zone,'field');assert.equal(e.id,'pursuer');assert.ok(e.z>=.3);
  assert.equal(g.enemies[1].memory.lastKnown,null);
});
test('application retry clears field enemies, trip state and corridor qualification',async()=>{
  const h=createHarness({corridors:true,touch:true,weather:true});await h.app.enter();h.app.fixture('gate');h.app.step(.5,{interact:true});h.app.step(.8,{forward:1});
  assert.equal(h.app.snapshot(true).zone,'field');h.app.step(11,{forward:1,yaw:Math.PI});h.app.step(18);
  assert.ok(h.app.snapshot(true).enemies.length>0);await h.app.restart();
  const s=h.app.snapshot(true);assert.equal(s.zone,'corridor');assert.equal(s.fieldTrip.active,false);assert.equal(s.corridorRun.elapsed,0);assert.equal(s.corridorRun.ready,false);assert.equal(s.enemies.length,1);h.app.dispose();
});
test('shooting a pursuer before hiding preserves its stagger across the zone boundary',()=>{
  const g=setup(),d=g.maze.cornDoors.find(d=>d.fieldEntrance),e=g.enemies[0];
  Object.assign(e,{x:d.x,z:d.z+1.8,state:'staggered',timer:2});e.memory.lastKnown={x:d.x,z:d.z+1};field(g);
  const from={x:e.x,z:e.z};updateGame(g,1,{});assert.equal(e.zone,'corridor');assert.equal(e.x,from.x);assert.equal(e.z,from.z);
});
test('batched verification advances real gameplay and renders only the requested frame',async()=>{
  const h=createHarness({corridors:true,touch:true});await h.app.enter();h.app.fixture('corridor');let renders=0;h.view.render=()=>renders++;
  const before=h.app.snapshot(true).corridorRun.elapsed;
  for(let i=0;i<10;i++)h.app.step(.1,{forward:1},false);
  assert.equal(renders,0);assert.ok(h.app.snapshot(true).corridorRun.elapsed>before+.99);
  h.app.step(0);assert.equal(renders,1);h.app.dispose();
});
