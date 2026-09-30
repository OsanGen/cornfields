import test from 'node:test';
import assert from 'node:assert/strict';
import {createMaze,cellOf,centerOf,canOccupy,pathTo,lineOfSight,cornZoneAt} from '../src/maze.js';
import {createGame,startGame,updateGame,blocksFor,interact,interactionPrompt,pauseGame} from '../src/game.js';
import {cornNode,cornNeighbors,cornOccupy,doorLeaf,openDoor} from '../src/corn-world.js';
import {hiddenInput,updateCornPresence} from '../src/hiding.js';
import {senseZombie,updateZombie} from '../src/zombie-ai.js';
import {findCornLanding,beginTackle,sweptClear} from '../src/grapple.js';
import {GAME_CONFIG as C,addEvidence} from '../src/game-config.js';
const maze=createMaze(),dt=1/60;
function fixture(){
  const g=createGame(maze),d=maze.hideAnchors[0];startGame(g);g.doorOpen=g.entered=true;g.grace=100;
  Object.assign(g.player,{x:d.x-d.normal.x*.7,z:d.z-d.normal.z*.7,yaw:d.entryYaw,flashlightOn:false});
  Object.assign(g.enemy,centerOf(29,3));blocksFor(g);return {g,d};
}
function entered(){const {g,d}=fixture();updateGame(g,.4,{interact:true});updateGame(g,.3,{forward:1});updateGame(g,.2);return {g,d};}
test('all 660 boundary spans have stable operable or genuine outer-containment coverage',()=>{
  const w=maze.cornWorld;assert.equal(w.doors.length,631);assert.equal(w.exclusions.length,29);
  assert.equal(new Set(w.doors.map(d=>d.id)).size,631);
  for(const d of w.doors){assert.equal(w.corn[d.cornNode],1);assert.equal(w.walk[d.corridorNode],1);}
});
test('every physically traversable corn component contains a cycle and a return gate',()=>{
  const w=maze.cornWorld,blocks=[];blocks.doors=w.doors.map(()=>({amount:1,swing:1}));blocks.physical=true;
  const seen=new Set();let count=0;
  for(let id=0;id<w.corn.length;id++)if(w.corn[id]&&!seen.has(id)){
    const q=[id];seen.add(id);let edges=0;
    for(let i=0;i<q.length;i++)for(const n of cornNeighbors(w,q[i],blocks))if(w.corn[n]){edges++;if(!seen.has(n)){seen.add(n);q.push(n);}}
    assert.ok(edges/2>=q.length,`noncyclic component at ${id}`);
    assert.ok(w.doors.some(d=>q.includes(d.cornNode)));count++;
  }
  assert.equal(count,25);
});
test('all open gates preserve both mandatory checkpoints and the entrance',()=>{
  const blocks=[];blocks.doors=maze.cornDoors.map(()=>({amount:1,swing:1}));
  assert.ok(pathTo(maze,maze.spawn,maze.center,blocks).length);
  for(const cut of [maze.door,...maze.checkpoints.map(cellOf),maze.gate])assert.equal(pathTo(maze,maze.spawn,maze.center,Object.assign([cut],{doors:blocks.doors})).length,0);
});
test('one E edge opens one aimed door; walking physically enters and stillness settles',()=>{
  const {g,d}=fixture(),before={x:g.player.x,z:g.player.z};assert.equal(interactionPrompt(g),'E - OPEN');
  updateGame(g,.4,{interact:true});assert.deepEqual({x:g.player.x,z:g.player.z},before);
  assert.equal(g.cornDoors.filter(s=>s.amount>0).length,1);assert.equal(g.cornDoors[d.index].amount,1);
  updateGame(g,.3,{forward:1});assert.ok(g.player.cornZoneId);assert.equal(g.player.hidden,false);
  updateGame(g,.2);assert.equal(g.player.hidden,true);assert.equal(g.player.returnTransform,null);
});
test('gates stay open across time and corn movement; both sides can close and reopen',()=>{
  const {g,d}=entered();updateGame(g,1);assert.equal(g.cornDoors[d.index].amount,1);
  updateGame(g,.18,{strafe:1});
  g.player.yaw=Math.atan2(g.player.x-d.x,g.player.z-d.z);updateGame(g,.4,{interact:true});assert.equal(g.cornDoors[d.index].amount,0);
  updateGame(g,.4,{interact:true});assert.equal(g.cornDoors[d.index].amount,1);
  g.player.yaw=d.entryYaw;updateGame(g,.18,{strafe:-1});
  g.player.yaw=d.entryYaw+Math.PI;updateGame(g,.3,{forward:1});assert.equal(g.player.cornZoneId,null);
});
test('closed gates block both body and vision, all fully open gates pass both actor radii',()=>{
  for(const d of maze.cornDoors){const b=[];b.doors=maze.cornDoors.map(()=>({amount:1,swing:1}));b.doors[d.index].amount=0;
    assert.equal(canOccupy(maze,d.x,d.z,.25,b),false,d.id);
    const a={x:d.x-d.normal.x*.4,z:d.z-d.normal.z*.4},c={x:d.x+d.normal.x*.4,z:d.z+d.normal.z*.4};
    assert.equal(lineOfSight(maze,a,c,b),false,d.id);b.doors[d.index].amount=1;
    for(const r of [.24,.25])assert.ok(sweptClear(maze,a,c,r,b),d.id);
  }
});
test('closing on an actor safely stops and pause freezes a partially opened door',()=>{
  const {g,d}=entered();Object.assign(g.player,{x:d.x,z:d.z,yaw:d.entryYaw+Math.PI});
  g.cornDoors[d.index].target=0;g.movingDoors.add(d.index);updateGame(g,.5);
  assert.ok(g.cornDoors[d.index].amount>0);assert.equal(g.player.health,100);
  pauseGame(g);const amount=g.cornDoors[d.index].amount;updateGame(g,10);assert.equal(g.cornDoors[d.index].amount,amount);
});
test('moving, blocked intent and deliberate look rustle; passive presentation does not',()=>{
  for(const input of [{forward:1},{movementIntent:true},{lookDelta:3},{fire:true},{flashlight:true},{interact:true}]){
    const {g}=entered();g.evidence=[];hiddenInput(g,input);assert.equal(g.evidence.at(-1).type,'rustle');assert.deepEqual(g.evidence.at(-1).position,{x:g.player.x,z:g.player.z});
  }
  const {g}=entered();g.evidence=[];for(const input of [{},{lookDelta:.5},{stab:true},{rain:true},{tremor:true}])hiddenInput(g,input);assert.equal(g.evidence.length,0);
});
test('nearby heard corn movement commits rush; distant rustle does not reveal location',()=>{
  const {g,d}=entered();g.grace=0;Object.assign(g.enemy,{x:d.x-d.normal.x*1.1,z:d.z-d.normal.z*1.1,yaw:d.entryYaw+Math.PI});
  hiddenInput(g,{lookDelta:3});updateZombie(g,dt,blocksFor(g));assert.equal(g.enemy.state,'corn_rush');assert.ok(g.enemy.memory.lastKnown);
  const far=entered().g;far.grace=0;hiddenInput(far,{lookDelta:3});senseZombie(far,blocksFor(far));assert.equal(far.enemy.memory.lastKnown,null);
});
test('closed gate sound has local attenuation and cannot cross progression partitions',()=>{
  const {g,d}=entered();g.cornDoors[d.index].amount=0;Object.assign(g.enemy,{x:d.x-d.normal.x*1,z:d.z-d.normal.z*1,yaw:d.entryYaw+Math.PI});
  hiddenInput(g,{lookDelta:3});assert.equal(senseZombie(g,blocksFor(g)).heard.type,'rustle');
  assert.equal(C.hearing.rustleRadius,12);
});
test('AI visibly opens a blocking gate and remains still during QTE recovery',()=>{
  const {g,d}=entered();g.grace=0;g.cornDoors[d.index].amount=0;g.cornDoors[d.index].target=0;
  Object.assign(g.enemy,{x:d.x-d.normal.x*.8,z:d.z-d.normal.z*.8,yaw:d.entryYaw,state:'corn_rush'});g.enemy.memory.lastKnown={x:g.player.x,z:g.player.z};
  for(let i=0;i<90&&!g.interaction;i++)updateGame(g,dt);
  assert.ok(g.cornDoors[d.index].amount>.9);
  g.interaction={id:99,phase:'recovery',phaseStartedAt:g.elapsed,recoveryDeadline:g.elapsed+10,until:g.elapsed+10};
  const at={x:g.enemy.x,z:g.enemy.z};updateGame(g,1);assert.deepEqual({x:g.enemy.x,z:g.enemy.z},at);
});
test('a reserved throw opens its aperture, lands physically and starts exactly ten seconds',()=>{
  const {g,d}=fixture();g.grace=0;Object.assign(g.enemy,{x:g.player.x+.65,z:g.player.z,state:'chase'});
  assert.ok(beginTackle(g,blocksFor(g)));updateGame(g,2.2,{stabTimes:Array.from({length:8},(_,i)=>.6+i*.12)});
  assert.equal(g.interaction.phase,'recovery');assert.equal(g.interaction.recoveryDeadline-g.interaction.phaseStartedAt,10);
  assert.ok(cornZoneAt(maze,g.player));assert.ok(canOccupy(maze,g.player.x,g.player.z,.25,blocksFor(g)));
});
test('new run resets door states independently of other runs',()=>{
  const {g,d}=entered(),fresh=createGame(maze);assert.equal(fresh.cornDoors[d.index].amount,0);assert.equal(g.cornDoors[d.index].amount,1);
});
