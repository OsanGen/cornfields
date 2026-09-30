import test from 'node:test';
import assert from 'node:assert/strict';
import {createMaze,centerOf,canOccupy,cornZoneAt,moveBody,key} from '../src/maze.js';
import {createGame,startGame,updateGame,pauseGame,resumeGame,fail,win,blocksFor} from '../src/game.js';
import {beginTackle,findCornLanding,sweptClear} from '../src/grapple.js';
import {fireGun,attackPlayer} from '../src/combat.js';
import {transition} from '../src/enemy-state.js';
import {createInput} from '../src/input.js';
import {createTouchInput} from '../src/touch-input.js';
import {eventTarget} from './helpers/browser.mjs';

function scenario(health=100){
  const g=createGame(createMaze());startGame(g);g.entered=true;g.doorOpen=true;
  Object.assign(g.player,centerOf(3,20),{health,flashlightOn:false});
  Object.assign(g.enemy,centerOf(3,20),{z:g.player.z-.6,visible:true,state:'chase',yaw:Math.PI});
  assert.ok(beginTackle(g));return g;
}
const presses=Array.from({length:8},(_,i)=>.6+i*.12);
function escape(){const g=scenario();updateGame(g,2.15,{stabTimes:presses});assert.equal(g.interaction?.phase,'recovery');return g;}

test('tackle has no legacy hit damage; prompt grace then continuous persistent health drain',()=>{
  const g=scenario(50);updateGame(g,.3);assert.equal(g.interaction.phase,'qte');assert.equal(g.player.health,50);
  updateGame(g,.2);assert.equal(g.player.health,50);updateGame(g,.3);assert.ok(Math.abs(g.player.health-40)<1e-7);
});
test('the same timed presses resolve identically across frame rates and batched stepping',()=>{
  const results=[];
  for(const fps of [10,30,60,120]){
    const g=scenario();updateGame(g,1/fps,{stabTimes:presses});
    for(let t=1/fps;t<2.2-1e-8;t+=1/fps)updateGame(g,Math.min(1/fps,2.2-t));
    results.push([g.player.health,g.interaction.recoveryDeadline,g.player.x,g.player.z]);
  }
  for(const row of results)row.forEach((n,i)=>assert.ok(Math.abs(n-results[0][i])<1e-7));
  const g=scenario();updateGame(g,2.2,{stabTimes:presses});assert.ok(Math.abs(g.player.health-results[0][0])<1e-7);
});
test('death at the final press timestamp wins and cannot also throw',()=>{
  const g=scenario(10),times=[.31,.32,.33,.34,.35,.36,.37,.8];
  updateGame(g,1,{stabTimes:times});assert.equal(g.mode,'dead');assert.equal(g.interaction,null);
  assert.equal(g.events.filter(e=>e.type==='eye_stab').length,0);
});
test('a final press just before zero health commits success once',()=>{
  const g=scenario(10);updateGame(g,1,{stabTimes:[.31,.32,.33,.34,.35,.36,.37,.799]});
  assert.ok(g.player.health>0);assert.equal(g.mode,'playing');assert.equal(g.events.filter(e=>e.type==='eye_stab').length,1);
});
test('pre-activation presses and ordinary fire cannot charge the QTE',()=>{
  const g=scenario();updateGame(g,.4,{stabTimes:[0,.1,.2],fire:true});assert.equal(g.interaction.presses,0);assert.equal(g.player.ammo,2);
});
test('pause freezes health and deadlines and clears unprocessed presses',()=>{
  const g=scenario();updateGame(g,.7,{stabTimes:[2]});pauseGame(g);const h=g.player.health;
  updateGame(g,30);assert.equal(g.player.health,h);assert.equal(g.pendingStabs.length,0);
  resumeGame(g);updateGame(g,.1);assert.ok(g.player.health<h);
});
test('landing returns real walking control with exactly ten seconds of recovery',()=>{
  const g=escape(),q=g.interaction;assert.equal(q.recoveryDeadline-q.phaseStartedAt,10);
  assert.ok(cornZoneAt(g.maze,g.player));assert.ok(canOccupy(g.maze,g.player.x,g.player.z,g.player.radius));
  const old={x:g.player.x,z:g.player.z};updateGame(g,.1,{forward:1,movementIntent:true});
  assert.ok(Math.hypot(g.player.x-old.x,g.player.z-old.z)>0);
});
test('shots, flashlight and fresh rustle cannot refresh or cancel recovery',()=>{
  const g=escape(),deadline=g.interaction.recoveryDeadline,pos={x:g.enemy.x,z:g.enemy.z};
  updateGame(g,1,{fire:true,flashlight:true,forward:1,movementIntent:true});
  assert.equal(g.interaction.recoveryDeadline,deadline);assert.equal(g.enemy.state,'post_qte_recovery');
  assert.deepEqual({x:g.enemy.x,z:g.enemy.z},pos);
  transition(g,'rage_chase','test');assert.equal(g.enemy.state,'post_qte_recovery');
});
test('expiry screams once and red sky lasts exactly three active seconds',()=>{
  const g=escape(),deadline=g.interaction.recoveryDeadline;updateGame(g,deadline-g.elapsed);
  assert.equal(g.interaction,null);assert.ok(g.enemy.attackCooldown>=.99);
  assert.equal(g.events.filter(e=>e.type==='hunt_resume').length,1);assert.equal(g.skyRedUntil,deadline+3);
  g.enemy.visible=false;g.enemy.x=1000;g.enemy.z=1000;
  updateGame(g,3);assert.ok(g.elapsed+1e-8>=g.skyRedUntil);
});
test('terminal modes cancel interaction, queued inputs and temporary sky',()=>{
  for(const finish of [fail,win]){const g=escape();g.skyRedUntil=99;finish(g);assert.equal(g.interaction,null);assert.equal(g.skyRedUntil,0);}
});
test('safe landing reservations cover ordinary route cells with physically swept routes',()=>{
  const maze=createMaze(),g=createGame(maze);g.doorOpen=true;let checked=0;const uncovered=[];
  const opened=[];opened.doors=g.cornDoors.map(()=>({amount:1,swing:1}));
  for(const [id] of maze.distances){
    const [x,z]=id.split(',').map(Number);if(z>=30||x>=13&&x<=19&&z>=13&&z<=17)continue;
    for(const [dx,dz] of [[0,0],[.8,0],[-.8,0],[0,.8],[0,-.8]]){
      const cell=centerOf(x,z);Object.assign(g.player,{x:cell.x+dx,z:cell.z+dz});
      const landing=findCornLanding(g);
      if(!landing){uncovered.push(id+':'+dx+','+dz);continue;}
      checked++;
      assert.ok(cornZoneAt(maze,landing.anchor.pocket));
      for(let i=1;i<landing.route.length;i++)assert.ok(sweptClear(maze,landing.route[i-1],landing.route[i],g.player.radius,opened));
      assert.ok(landing.length<=4.5);
    }
  }
  assert.ok(checked>1500);assert.deepEqual(uncovered,[]);
});
test('close attacks require fresh windup and a shot interrupts before tackle',()=>{
  const g=scenario();g.interaction=null;g.enemy.state='chase';g.enemy.contactSince=null;
  assert.equal(attackPlayer(g,[]),false);g.elapsed+=.23;
  g.player.yaw=0;g.player.pitch=Math.atan2(.8-1.58,.6);fireGun(g,[]);assert.equal(attackPlayer(g,[]),false);assert.equal(g.interaction,null);
});
test('a repeat tackle creates face clearance along a valid continuous contact path',()=>{
  const g=scenario();g.interaction=null;g.enemy.x=g.player.x+.15;g.enemy.z=g.player.z;
  const start={x:g.enemy.x,z:g.enemy.z};assert.ok(beginTackle(g));
  updateGame(g,.15);assert.ok(Math.hypot(g.enemy.x-start.x,g.enemy.z-start.z)<.51);
  assert.ok(canOccupy(g.maze,g.enemy.x,g.enemy.z,g.enemy.radius));
  updateGame(g,.15);assert.ok(Math.hypot(g.enemy.x-g.player.x,g.enemy.z-g.player.z)>=.64);
  assert.ok(sweptClear(g.maze,start,g.enemy,g.enemy.radius));
});
test('keyboard QTE requires released edges and retains every rapid press',()=>{
  const document=eventTarget(),canvas=eventTarget();let active=false;
  const input=createInput({document,canvas,isPlaying:()=>true,onPause(){},onMute(){},isQte:()=>active,inputTime:t=>t});
  document.dispatch('keydown',{code:'Space',timeStamp:0});active=true;
  document.dispatch('keydown',{code:'Space',timeStamp:.1});assert.deepEqual(input.read({}).stabTimes,[]);
  for(let i=0;i<8;i++){document.dispatch('keyup',{code:'Space'});document.dispatch('keydown',{code:'Space',timeStamp:i+.2});}
  document.dispatch('keydown',{code:'Space',repeat:true,timeStamp:9});
  assert.equal(input.read({}).stabTimes.length,8);assert.equal(input.read({}).stabTimes.length,0);
});
test('touch STAB counts released taps, not two held fingers, and leaves movement held',()=>{
  const nodes=new Map();const node=id=>{if(!nodes.has(id)){const n=eventTarget();n.style={setProperty(){}};n.getBoundingClientRect=()=>({left:0,top:0,width:100,height:100});nodes.set(id,n);}return nodes.get(id);};
  const input=createTouchInput({document:{getElementById:node},isPlaying:()=>true,onPause(){},isQte:()=>true,inputTime:t=>t});
  node('move-stick').dispatch('pointerdown',{pointerId:1,clientX:50,clientY:10});
  node('touch-stab').dispatch('pointerdown',{pointerId:2,timeStamp:.1});node('touch-stab').dispatch('pointerdown',{pointerId:3,timeStamp:.2});
  assert.equal(input.read({yaw:0,pitch:0}).stabTimes.length,1);
  input.clearEdges();assert.ok(input.read({yaw:0,pitch:0}).forward>0);
  node('touch-stab').dispatch('pointerup',{pointerId:2});node('touch-stab').dispatch('pointerdown',{pointerId:4,timeStamp:.3});
  assert.deepEqual(input.read({yaw:0,pitch:0}).stabTimes,[.3]);input.dispose();
});
