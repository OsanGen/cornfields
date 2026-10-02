import test from 'node:test';
import assert from 'node:assert/strict';
import {createMaze,canOccupy,pathTo} from '../src/maze.js';
import {createGame,startGame,updateGame,blocksFor,interactionPrompt,interact} from '../src/game.js';
import {gateAt,requestDoor} from '../src/corn-world.js';
import {enterOpenField,leaveOpenField,corridorMovement} from '../src/corridor-run.js';
import {createHidePortals} from '../src/hide-portals.js';
import * as THREE from 'three';

function setup(){const g=createGame(createMaze({corridors:true}));startGame(g);g.entered=true;g.corridorRun.started=true;g.grace=1000;for(const e of g.enemies)e.active=false;blocksFor(g);return g;}
test('corn entrances are clear permanent passages and cannot be closed by interaction',()=>{
 const g=setup(),doors=g.maze.cornDoors.filter(d=>d.fieldEntrance);assert.equal(doors.length,9);
 for(const d of doors){
  assert.equal(d.permanentOpen,true);assert.equal(g.cornDoors[d.index].amount,1);
  Object.assign(g.player,{x:d.x,z:d.z+1,yaw:0});assert.equal(gateAt(g),null);assert.equal(interactionPrompt(g),'');
  interact(g);assert.equal(requestDoor(g,d,false),false);
  for(const z of [-.65,0,.65])assert(canOccupy(g.maze,d.x,d.z+z,g.player.radius,blocksFor(g)));
 }
 const main=g.maze.cornDoors[g.maze.corridorLayout.entrance];
 assert.equal(main.permanentOpen,undefined);assert.equal(requestDoor(g,main,true),true);
 assert.equal(pathTo(g.maze,g.player,g.maze.daughter,blocksFor(g)).length,0);
});
test('walk-through entrances keep the matching return and pause corridor progression without interaction',()=>{
 for(const slot of [0,4,8]){
  const g=setup(),d=g.maze.cornDoors.find(d=>d.fieldEntrance&&d.slot===slot);
  Object.assign(g.player,{x:d.x,z:d.z+1.3,yaw:0});updateGame(g,.8,{forward:1});
  assert.equal(g.player.zone,'field');assert.equal(g.fieldTrip.doorId,d.id);const time=g.corridorRun.elapsed;
  assert.equal(interactionPrompt(g),'');updateGame(g,.5,{});assert.equal(g.corridorRun.elapsed,time);
  g.player.yaw=0;updateGame(g,1,{forward:1});assert.equal(g.player.zone,'corridor');assert(Math.abs(g.player.x-d.x)<.01);
  const serial=g.fieldTrip.serial;updateGame(g,.5,{});assert.equal(g.fieldTrip.serial,serial);assert.equal(g.player.zone,'corridor');
 }
});
test('corridors have one walking speed without Shift or diagonal boost',()=>{
 const walk=setup(),run=setup(),diagonal=setup();
 for(const g of [walk,run,diagonal])Object.assign(g.player,g.maze.corridorLayout.sections[1].anchor,{yaw:Math.PI,flashlightOn:false});
 const start={x:run.player.x,z:run.player.z};updateGame(walk,.2,{forward:1});updateGame(run,.2,{forward:1,sprint:true});updateGame(diagonal,.1,{forward:1,strafe:1,sprint:true});
 assert.equal(run.player.z,walk.player.z);assert.equal(run.player.sprinting,false);
 assert(Math.abs(Math.hypot(diagonal.player.x-start.x,diagonal.player.z-start.z)-.395)<1e-8);
 updateGame(run,.02,{});assert.equal(run.player.sprinting,false);
 run.mode='paused';const before={...run.player};updateGame(run,1,{forward:1,sprint:true});assert.deepEqual(run.player,before);
});

test('crossing buffer and occupied return point cannot flicker zones or overlap the pursuer',()=>{
 const g=setup(),d=g.maze.cornDoors.find(d=>d.fieldEntrance);Object.assign(g.player,{x:d.x,z:d.z-.7});assert(enterOpenField(g,d));
 Object.assign(g.player,{x:0,z:-.7});corridorMovement(g,{x:0,z:-.6},.1);
 assert.equal(g.player.zone,'field');assert.equal(g.player.z,-.6);
 Object.assign(g.enemies[0],{active:true,zone:'corridor',x:d.x,z:d.z+.9});assert.equal(leaveOpenField(g),true);
 assert.equal(g.player.zone,'corridor');assert(Math.hypot(g.player.x-g.enemies[0].x,g.player.z-g.enemies[0].z)>.59);
});

test('pushing against an occupied entrance cannot credit stationary qualification distance',()=>{
 const g=setup(),d=g.maze.cornDoors.find(d=>d.fieldEntrance);Object.assign(g.player,{x:d.x,z:d.z+.3,yaw:0});
 Object.assign(g.enemies[1],{active:true,zone:'field',x:0,z:.85});updateGame(g,.4,{forward:1});
 const before={x:g.player.x,z:g.player.z,distance:g.corridorRun.distance,steps:g.steps};updateGame(g,.5,{forward:1});
 assert.equal(g.player.zone,'corridor');assert.equal(g.player.x,before.x);assert.equal(g.player.z,before.z);
 assert.equal(g.corridorRun.distance,before.distance);assert.equal(g.steps,before.steps);assert.equal(g.player.moving,false);
});

test('psychedelic passages cap nearby draws, freeze reduced effects and dispose late optional mist',()=>{
 const maze=createMaze({corridors:true}),front=new THREE.Group(),back=new THREE.Group();let onLoad;
 const portals=createHidePortals(front,back,maze,{loader:{load(url,ready){onLoad=ready;}}});
 const d=maze.cornDoors.find(d=>d.fieldEntrance),game={elapsed:1,player:{x:d.x,z:d.z+2,zone:'corridor'}};
 portals.update(game);assert(portals.stats.visible>0&&portals.stats.visible<=2);assert(portals.stats.draws<=8);
 portals.update(game,true);assert.equal(portals.stats.time,0);game.elapsed=20;portals.update(game,true);assert.equal(portals.stats.time,0);
 portals.setQuality({rain:.5});portals.update(game);assert.equal(portals.stats.maxVisible,1);assert(portals.stats.draws<=2);
 game.player.zone='field';portals.update(game);assert.equal(portals.stats.visible,0);assert.equal(portals.stats.draws,1);
 portals.dispose();const texture=new THREE.Texture();let disposed=0;texture.addEventListener('dispose',()=>disposed++);onLoad(texture);assert.equal(disposed,1);
});
