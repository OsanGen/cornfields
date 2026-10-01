import test from 'node:test';
import assert from 'node:assert/strict';
import {createMaze,canOccupy,lineOfSight,moveBody} from '../src/maze.js';
import {createGame,startGame,blocksFor,updateGame} from '../src/game.js';
import {GAME_CONFIG as C,distance} from '../src/game-config.js';
import {cornPath} from '../src/corn-world.js';
import {enterOpenField} from '../src/corridor-run.js';
import {senseZombie,updateZombie} from '../src/zombie-ai.js';
import {fireGun,attackPlayer} from '../src/combat.js';

const dt=1/60;
const point=p=>({x:p.x,z:p.z});
function setup(){
  const g=createGame(createMaze({corridors:true}));startGame(g);
  g.entered=true;g.corridorRun.started=true;
  Object.assign(g.player,g.maze.corridorLayout.sections[4].anchor,{flashlightOn:false});
  blocksFor(g);return g;
}
function tick(g,seconds){for(let t=0;t<seconds-1e-9;t+=dt){g.elapsed+=dt;updateZombie(g,dt,blocksFor(g));}}
function routeLength(g){const route=cornPath(g.maze.cornWorld,g.enemy,g.player,blocksFor(g),{allowDoors:true});assert.ok(route.length);return route.slice(1).reduce((n,p,i)=>n+distance(p,route[i]),0);}

test('corridor route perception starts with the run and preserves real observation memory',()=>{
  const g=setup(),e=g.enemy;assert.equal(lineOfSight(g.maze,e,g.player,g.blocks),false);
  e.memory.lastKnown={x:e.x,z:e.z};e.memory.lastHeard={x:e.x,z:e.z};e.memory.lastHeardAt=0;
  e.memory.lastObservation={source:'footsteps',position:point(e),at:0};const before=structuredClone(e.memory);
  g.corridorRun.started=false;assert.equal(senseZombie(g,g.blocks).corridorTarget,null);
  g.corridorRun.started=true;const sensed=senseZombie(g,g.blocks);
  assert.equal(sensed.seen,false);assert.equal(sensed.heard,null);
  assert.deepEqual(sensed.corridorTarget,point(g.player));assert.deepEqual(e.corridorTarget,point(g.player));
  assert.deepEqual(e.memory,before,'routing knowledge is not sight or hearing evidence');
  e.corridorTarget.x++;assert.notEqual(e.corridorTarget.x,g.player.x,'the route point is a snapshot');
  g.corridorRun.complete=true;assert.equal(senseZombie(g,g.blocks).corridorTarget,null);
  g.corridorRun.complete=false;g.enemy=g.enemies[1];g.enemy.zone='corridor';
  assert.equal(senseZombie(g,g.blocks).corridorTarget,null,'field extras do not inherit the primary route target');
});

test('unseen corridor pursuit closes around a corner without idle states or teleporting',()=>{
  const g=setup(),before=routeLength(g);assert.equal(lineOfSight(g.maze,g.enemy,g.player,g.blocks),false);
  for(let i=0;i<180;i++){
    const from=point(g.enemy);g.elapsed+=dt;updateZombie(g,dt,blocksFor(g));
    assert.equal(g.enemy.state,'chase');assert.ok(distance(from,g.enemy)<=4.21*dt+1e-8);
    assert.ok(canOccupy(g.maze,g.enemy.x,g.enemy.z,g.enemy.radius,g.blocks));
  }
  assert.ok(routeLength(g)<before-10,'graph distance should close while sight is blocked');
  assert.equal(g.enemy.memory.lastSeen,null);assert.equal(g.metrics.predictions,0,'route pursuit does not fan out into prediction searches');
});

test('corridor walking loses space while sprint speed gains it on the same route',()=>{
  const gaps=[];
  for(const speed of [C.player.moveSpeed,C.player.sprintSpeed]){
    const g=setup(),anchor=g.maze.corridorLayout.sections[0].anchor;
    Object.assign(g.enemy,{x:anchor.x+2,z:anchor.z,yaw:-Math.PI/2});
    Object.assign(g.player,{x:anchor.x+11,z:anchor.z,yaw:-Math.PI/2});
    const before=distance(g.enemy,g.player);
    for(let i=0;i<180;i++){
      moveBody(g.maze,g.player,speed*dt,0,blocksFor(g));g.elapsed+=dt;updateZombie(g,dt,g.blocks);
    }
    gaps.push(distance(g.enemy,g.player)-before);
  }
  assert.ok(gaps[0]<-.15,`walking should lose space: ${gaps[0]}`);
  assert.ok(gaps[1]>1.5,`sprinting should gain space: ${gaps[1]}`);
});

test('field pursuit clears corridor targeting and is invariant to silent hidden coordinates',()=>{
  const games=[setup(),setup()];
  for(const [i,g]of games.entries()){
    const d=g.maze.cornDoors.find(d=>d.fieldEntrance);Object.assign(g.cornDoors[d.index],{amount:1,target:1});
    Object.assign(g.player,{x:d.x,z:d.z+.2});senseZombie(g,blocksFor(g));
    assert.equal(enterOpenField(g,d),true);Object.assign(g.enemy,{zone:'field',x:0,z:1,state:'predictive_search',searchCells:[{x:0,z:3}]});
    g.enemy.memory.lastKnown={x:0,z:.3};g.enemy.memory.lastObservation={source:'doorway',position:{x:0,z:.3},at:0};
    Object.assign(g.player,{x:i?-40:40,z:40,hidden:true,flashlightOn:false,yaw:i?2:0});
    assert.equal(senseZombie(g,blocksFor(g)).corridorTarget,null);assert.equal(g.enemy.corridorTarget,null);
    tick(g,.5);
  }
  assert.deepEqual(point(games[0].enemy),point(games[1].enemy));
  assert.deepEqual(games[0].enemy.target,games[1].enemy.target);
  assert.deepEqual(games[0].enemy.memory.lastKnown,{x:0,z:.3});
});

test('corridor pursuit honors gun stagger before returning to the route',()=>{
  const g=setup(),e=g.enemy;Object.assign(g.player,{x:e.x+3,z:e.z,yaw:Math.PI/2,pitch:-.25});
  e.visible=true;assert.equal(fireGun(g,blocksFor(g)),true);const before=point(e);
  tick(g,C.zombie.staggerSecondsByTier[0]-.1);assert.equal(e.state,'staggered');assert.deepEqual(point(e),before);
  tick(g,.2);assert.equal(e.state,'chase');assert.ok(distance(e,before)>0);
});

test('corridor route targeting preserves flashlight recoil and rage escape',()=>{
  const g=setup(),e=g.enemy;Object.assign(g.player,{x:e.x+3,z:e.z,yaw:Math.PI/2,pitch:0,flashlightOn:true});
  tick(g,C.zombie.flashlightConfirmSeconds+.02);assert.equal(e.state,'flashlight_recoil');const before=point(e);
  tick(g,.5);assert.deepEqual(point(e),before);tick(g,.2);assert.equal(e.state,'rage_chase');
  Object.assign(g.player,g.maze.corridorLayout.sections[8].anchor,{flashlightOn:false});
  tick(g,C.zombie.rageEscapeHoldSeconds+.1);assert.equal(e.state,'disengage');assert.equal(e.reason,'rage_escape');
});

test('corridor route updates do not clear contact windup or interrupt QTE recovery',()=>{
  const g=setup(),e=g.enemy;Object.assign(e,{x:g.player.x,z:g.player.z-.7,state:'chase'});
  g.grace=0;assert.equal(attackPlayer(g,blocksFor(g)),false);const contact=e.contactSince,from=point(e);
  tick(g,.15);assert.equal(e.contactSince,contact);assert.deepEqual(point(e),from);
  g.elapsed+=.1;assert.equal(attackPlayer(g,blocksFor(g)),true);
  updateGame(g,2.2,{stabTimes:Array.from({length:8},(_,i)=>g.elapsed+.6+i*.12)});
  assert.equal(g.interaction?.phase,'recovery');const deadline=g.interaction.recoveryDeadline,recovering=point(e);
  updateGame(g,1,{forward:1,flashlight:true});assert.equal(e.state,'post_qte_recovery');
  assert.equal(g.interaction.recoveryDeadline,deadline);assert.deepEqual(point(e),recovering);
});
