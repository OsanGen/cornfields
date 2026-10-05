import test from 'node:test';
import assert from 'node:assert/strict';
import {createMaze} from '../src/maze.js';
import {createGame,startGame,updateGame,fail} from '../src/game.js';
import {enterOpenField,leaveOpenField} from '../src/corridor-run.js';
import {checkpointVisionState} from '../src/checkpoint-vision.js';
const setup=()=>{const g=createGame(createMaze({corridors:true}));startGame(g);g.entered=true;g.grace=1000;g.enemies.forEach(e=>e.active=false);return g;};
test('a recovery checkpoint grants its reward immediately and presents a full vision after recovery',()=>{
 const g=setup();Object.assign(g.player,g.maze.checkpoints[0]);g.player.health=10;
 g.interaction={phase:'recovery',enemyId:g.enemy.id,recoveryDeadline:g.elapsed+2,until:g.elapsed+2};
 updateGame(g,.1);assert.equal(g.player.health,100);assert.equal(g.metrics.checkpointTimes.length,1);assert.equal(checkpointVisionState(g).active,false);
 updateGame(g,2);assert.equal(checkpointVisionState(g).active,true);assert.ok(checkpointVisionState(g).age<.2);assert.equal(checkpointVisionState(g).caption,'WE ARE ONE');
 updateGame(g,1.4);assert.equal(checkpointVisionState(g).active,false);assert.equal(g.metrics.checkpointTimes.length,1);
});
test('safe recovery crossings work both ways while struggle and throw remain blocked',()=>{
 for(const phase of ['recovery','struggle','throw']){const g=setup(),d=g.maze.cornDoors.find(d=>d.fieldEntrance);g.interaction={phase};
 const allowed=phase==='recovery';assert.equal(enterOpenField(g,d),allowed,phase);if(allowed){assert.equal(g.player.zone,'field');assert.equal(leaveOpenField(g,{x:0,z:.02}),true);assert.equal(g.player.zone,'corridor');assert.equal(leaveOpenField(g),false);}}
});
test('death cancels a deferred checkpoint presentation without removing its reward',()=>{
 const g=setup();Object.assign(g.player,g.maze.checkpoints[0]);g.interaction={phase:'recovery',enemyId:g.enemy.id,recoveryDeadline:20,until:20};updateGame(g,.1);fail(g);assert.equal(checkpointVisionState(g).active,false);assert.equal(g.progress.activatedCheckpoints.length,1);
});
