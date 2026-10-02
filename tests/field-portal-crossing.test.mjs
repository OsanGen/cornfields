import test from 'node:test';
import assert from 'node:assert/strict';
import {createMaze,canOccupy} from '../src/maze.js';
import {createGame,startGame,updateGame,blocksFor} from '../src/game.js';
import {paintCorridor} from '../src/corridor-layout.js';
import {corridorMovement,enterOpenField,leaveOpenField} from '../src/corridor-run.js';
import {createCorridorFieldView} from '../src/corridor-view.js';
import * as THREE from 'three';

function setup(slot=0,variant=0){
  const g=createGame(createMaze({corridors:true}));startGame(g);
  g.grace=1000;g.corridorRun.recycleWait=Infinity;
  for(const e of g.enemies)e.active=false;
  paintCorridor(g.maze.cornWorld,g.maze.corridorLayout.sections[slot],variant);
  const d=g.maze.cornDoors.find(d=>d.fieldEntrance&&d.slot===slot);
  Object.assign(g.player,{x:d.x,z:d.z+1.3,yaw:0});blocksFor(g);
  return {g,d};
}

test('every opening accepts the entire collision passage when walking or sprinting',()=>{
  for(const variant of [0,1])for(let slot=0;slot<9;slot++)for(const offset of [-.53333323,-.53,-.515,0,.515,.53,.53333323])for(const sprint of [false,true]){
    const {g,d}=setup(slot,variant);g.player.x+=offset;
    assert(canOccupy(g.maze,g.player.x,d.z-.8,g.player.radius,blocksFor(g)));
    for(let i=0;i<60&&g.player.zone==='corridor';i++)updateGame(g,1/60,{forward:1,sprint});
    assert.equal(g.player.zone,'field',JSON.stringify({slot,variant,offset,sprint}));
    assert.equal(g.fieldTrip.doorId,d.id);assert.equal(g.fieldTrip.serial,1);
  }
});

test('entry occurs at the visible glow, before reaching the wooden recess',()=>{
  const {g,d}=setup();g.player.z=d.z+.08;
  updateGame(g,1/60,{forward:1});assert.equal(g.player.zone,'field');
});

test('sideways correction inside the old wooden trap recovers without backing out',()=>{
  for(const side of [-1,1]){
    const {g,d}=setup();Object.assign(g.player,{x:d.x+side*.515,z:d.z-1.29});
    updateGame(g,1/60,{strafe:-side});assert.equal(g.player.zone,'field');
  }
});

test('off-centre return uses the matching opening and a legal landing',()=>{
  for(const offset of [-.53,.53]){
    const {g,d}=setup();assert(enterOpenField(g,d));g.elapsed=1;
    Object.assign(g.player,{x:offset,z:.08,yaw:0});
    updateGame(g,1/60,{forward:1});assert.equal(g.player.zone,'corridor');
    assert(Math.abs(g.player.x-(d.x-offset))<1e-8);
    assert(canOccupy(g.maze,g.player.x,g.player.z,g.player.radius,blocksFor(g)));
  }
});

test('a diagonal crossing uses its intersection with the opening, not the endpoint',()=>{
  const {g,d}=setup();const before={x:d.x+.49,z:d.z+.09};
  Object.assign(g.player,{x:d.x+.56,z:d.z+.02});corridorMovement(g,before,.1);
  assert.equal(g.player.zone,'field');assert(Math.abs(g.player.x)<.534);
});

test('diagonal walking and sprinting follow the portal rotation without repeated crossings',()=>{
  for(const side of [-1,1])for(const sprint of [false,true]){
    const {g,d}=setup();Object.assign(g.player,{x:d.x+side*.46,z:d.z+.09});
    updateGame(g,.5,{forward:1,strafe:side,sprint});
    assert.equal(g.player.zone,'field');assert.equal(g.fieldTrip.serial,1);
    assert(g.player.z>.85);assert.equal(g.player.yaw,Math.PI);
  }
});

test('nearby corridor movement, backing out, pause and distant field movement do not trigger entry',()=>{
  for(const [x,z,input] of [[.8,.09,{forward:1}],[0,-1,{forward:-1}],[0,.3,{strafe:1}]]){
    const {g,d}=setup();Object.assign(g.player,{x:d.x+x,z:d.z+z});
    updateGame(g,1/60,input);assert.equal(g.player.zone,'corridor');
  }
  const {g,d}=setup();Object.assign(g.player,{z:d.z+.08});g.mode='paused';
  updateGame(g,.5,{forward:1});assert.equal(g.player.zone,'corridor');g.mode='playing';
  assert(enterOpenField(g,d));g.elapsed=1;
  Object.assign(g.player,{x:.55,z:-10,yaw:0});updateGame(g,.1,{strafe:-1});assert.equal(g.player.zone,'field');
});

test('an occupied field destination rejects atomically and succeeds after it clears',()=>{
  const {g,d}=setup(),maze=g.maze;const before={x:d.x+.515,z:d.z+.08};
  Object.assign(g.enemies[1],{active:true,zone:'field',x:-.515,z:.85});
  Object.assign(g.player,{...before,z:d.z+.02});
  assert.equal(corridorMovement(g,before,.06),0);assert.equal(g.maze,maze);
  assert.equal(g.player.zone,'corridor');assert.equal(g.player.z,before.z);assert.equal(g.fieldTrip.serial,0);
  g.enemies[1].active=false;Object.assign(g.player,{z:d.z+.02});corridorMovement(g,before,.06);
  assert.equal(g.player.zone,'field');assert.equal(g.fieldTrip.serial,1);
});

test('diagonal returns use a nearby clear landing when the crossing point is occupied',()=>{
  const {g,d}=setup();assert(enterOpenField(g,d));g.elapsed=1;
  const field=g.maze,before={x:.49,z:.09};Object.assign(g.player,{x:.56,z:.02});
  Object.assign(g.enemies[0],{active:true,zone:'corridor',x:d.x-.515,z:d.z+.9});
  corridorMovement(g,before,.1);assert.notEqual(g.maze,field);
  assert.equal(g.player.zone,'corridor');assert(canOccupy(g.maze,g.player.x,g.player.z,g.player.radius,blocksFor(g)));
  assert(enterOpenField(g,d));const maze=g.maze;Object.assign(g.player,{x:1000,z:0});
  assert.equal(leaveOpenField(g),false);assert.equal(g.maze,maze);assert.equal(g.player.zone,'field');
});

test('the transition hides wooden panels in the same rendered update',()=>{
  const {g,d}=setup(),scene=new THREE.Scene();
  const floor=new THREE.Mesh(new THREE.PlaneGeometry(100,100),new THREE.MeshStandardMaterial());
  const view=createCorridorFieldView(scene,g.maze,floor);view.update(g);
  const walls=scene.children.find(group=>group.children.some(child=>child.isInstancedMesh));
  assert(walls.visible);Object.assign(g.player,{x:d.x+.515,z:d.z+.08});
  updateGame(g,1/60,{forward:1});view.update(g);
  assert.equal(view.stats.activeZone,'field');assert.equal(walls.visible,false);view.dispose();
});
