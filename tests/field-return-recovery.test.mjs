import test from 'node:test';
import assert from 'node:assert/strict';
import {createMaze,canOccupy} from '../src/maze.js';
import {createGame,startGame,blocksFor,updateGame} from '../src/game.js';
import {enterOpenField,leaveOpenField} from '../src/corridor-run.js';
import {fireGun} from '../src/combat.js';

function setup(slot=0){
  const g=createGame(createMaze({corridors:true}));startGame(g);g.entered=true;g.grace=1000;g.corridorRun.recycleWait=Infinity;
  for(const e of g.enemies)e.active=false;
  const d=g.maze.cornDoors.find(d=>d.fieldEntrance&&d.slot===slot);
  Object.assign(g.player,{x:d.x,z:d.z+2.5,yaw:0,pitch:0,flashlightOn:false});
  Object.assign(g.enemies[0],{active:true,visible:true,zone:'corridor',x:d.x,z:d.z+.9,state:'investigate',followDoor:null});blocksFor(g);
  return {g,d,e:g.enemies[0]};
}
test('shooting beside any doorway permits return while the pursuer is down',()=>{
  for(let slot=0;slot<9;slot++){
    const {g,d,e}=setup(slot);assert(fireGun(g,g.blocks));assert.equal(e.state,'staggered');
    assert(enterOpenField(g,d));assert(leaveOpenField(g,{x:0,z:.02}));
    assert(canOccupy(g.maze,g.player.x,g.player.z,g.player.radius,blocksFor(g)));
    assert(Math.hypot(g.player.x-e.x,g.player.z-e.z)>e.radius+g.player.radius+.1);
  }
});
test('off-zone stagger expires without doorway evidence or remote player knowledge',()=>{
  const {g,d,e}=setup();assert(fireGun(g,g.blocks));assert(enterOpenField(g,d));
  const memory=structuredClone(e.memory),maze=g.maze;
  for(let i=0;i<240;i++)updateGame(g,1/60,{});
  assert.equal(e.state,'investigate');assert.equal(e.timer,0);assert.equal(g.maze,maze);
  assert.deepEqual(e.memory,memory);assert(leaveOpenField(g,{x:0,z:.02}));
});
test('a fully occupied return remains atomic, gives feedback, and recovers after clearance',()=>{
  const {g,d}=setup();assert(enterOpenField(g,d));const maze=g.maze;
  for(let i=0;i<3;i++)Object.assign(g.enemies[i],{active:true,zone:'corridor',x:d.x,z:d.z+.9+i*.7});
  const before={...g.player};assert.equal(leaveOpenField(g,{x:0,z:.02}),false);
  assert.equal(g.maze,maze);assert.deepEqual(g.player,before);assert(g.events.some(e=>e.type==='portal_blocked'));
  for(const e of g.enemies)e.active=false;
  assert(leaveOpenField(g,{x:0,z:.02}));assert.equal(g.player.zone,'corridor');
});
