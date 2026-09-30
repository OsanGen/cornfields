import test from 'node:test';
import assert from 'node:assert/strict';
import {createMaze,canOccupy,pathTo,centerOf,cellOf} from '../src/maze.js';
import {createGame,startGame,updateGame,blocksFor,interact,interactionPrompt,pauseGame,gameSnapshot} from '../src/game.js';
import {cornPath,openDoor} from '../src/corn-world.js';
import {sectionAt,setReturnOpen,paintSection,protectedSections,streamSections} from '../src/corn-layout.js';
import {advanceCornSurvival,survivalLocomotion,finishCornSurvival} from '../src/corn-survival.js';
import {findCornLanding,beginTackle} from '../src/grapple.js';
import {createWeather,containsPuddle} from '../src/weather.js';
import {updateCornPresence} from '../src/hiding.js';
import {predictionCandidates,choosePrediction} from '../src/zombie-ai.js';
import {createHarness} from './helpers/browser.mjs';

const template=createMaze({survival:true});
const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
function fixture(){const g=createGame(template);startGame(g);g.grace=10000;return g;}
function walk(g,target,limit=30){
  let ticks=0;
  while(distance(g.player,target)>.08&&ticks++<limit*60){
    if(g.mode==='won'&&target===g.maze.daughter)return;
    if(g.interaction&&g.interaction.phase!=='recovery'){updateGame(g,1/60,{stab:true});continue;}
    const route=pathTo(g.maze,g.player,target,blocksFor(g));assert(route.length,'A physical route must exist');
    const next=route.find(p=>distance(g.player,p)>.08)||target;
    updateGame(g,1/60,{forward:1,yaw:Math.atan2(g.player.x-next.x,g.player.z-next.z)});
  }
  assert(distance(g.player,target)<.09,`Walking must reach ${target.id||JSON.stringify(target)}; mode=${g.mode}, distance=${distance(g.player,target)}, interaction=${g.interaction?.phase}`);
}
function enter(g){
  const l=g.maze.survivalLayout,d=g.maze.cornDoors[l.outer];
  walk(g,{x:d.x,z:d.z-1});g.player.yaw=Math.PI;
  assert.equal(interactionPrompt(g),'E - OPEN');interact(g);updateGame(g,.5);
  walk(g,l.sections[1].anchor);updateGame(g,.5);
  assert.equal(g.cornSurvival.state,'active_survival');return g;
}
function revealReturn(g){
  for(const slot of [7,6,3,0,3,6,7,8,5,2,5,8]){
    if(g.cornSurvival.state==='return_route')break;
    walk(g,g.maze.survivalLayout.sections[slot].anchor);updateGame(g,.1);
  }
  assert.equal(g.cornSurvival.state,'return_route',`A moving player must encounter a safe return commit; root pins ${[...(protectedSections(g).get(1)||[])].join(',')}; enemy ${g.enemy.state} ${sectionAt(g.maze,g.enemy)?.slot}`);
}

test('real entry walks through both gates; original onward door stays locked',()=>{
  const g=enter(fixture()),l=g.maze.survivalLayout;
  assert(g.cornDoors[l.outer].locked);assert(g.cornDoors[l.inner].locked);
  assert.equal(g.maze.survivalLayout.sealOpen,false);assert.equal(g.doorOpen,false);
  assert(Math.abs(g.cornSurvival.elapsed-(g.elapsed-g.cornSurvival.startedAt))<1e-6);
  assert.equal(g.events.filter(e=>e.type==='corn_survival_started').length,1);
  assert.equal(g.cornSurvival.complete,false);
});

test('run geometry, locks and section generations are independent',()=>{
  const a=enter(fixture()),b=fixture();
  paintSection(a.maze.cornWorld,a.maze.survivalLayout.sections[8],'long');
  assert.notDeepEqual(a.maze.cornWorld.walk,b.maze.cornWorld.walk);
  assert.equal(b.maze.survivalLayout.sections[8].generation,1);
  assert.equal(b.cornSurvival.elapsed,0);assert.equal(b.maze.survivalLayout.sealOpen,true);
  assert.equal(template.survivalLayout.sections[8].generation,1);
});

test('hard locks block player, AI and throws while sound can cross with attenuation',()=>{
  const g=fixture(),l=g.maze.survivalLayout,d=g.maze.cornDoors[l.outer],s=g.cornDoors[l.outer];
  Object.assign(s,{amount:0,target:0,locked:true});
  const a={x:d.x,z:d.z-.6},b={x:d.x,z:d.z+.6},blocks=blocksFor(g);
  assert.equal(cornPath(g.maze.cornWorld,a,b,blocks,{allowDoors:true}).length,0);
  assert(cornPath(g.maze.cornWorld,a,b,blocks,{allowDoors:true,sound:true,maxDistance:12}).length);
  openDoor(g,d);assert.equal(s.target,0);
  Object.assign(g.player,a,{yaw:Math.PI});interact(g);assert.equal(s.target,0);
  const landing=findCornLanding(g,blocks);
  if(landing)assert(landing.route.every(p=>p.z<d.z));
});

test('hidden qualification excludes blocked input, looking and scripted displacement; pause freezes time',()=>{
  const g=enter(fixture()),s=g.cornSurvival;
  s.distance=0;const at={x:g.player.x,z:g.player.z};
  updateGame(g,.2,{yaw:1.2,lookDelta:20});assert.equal(s.distance,0);
  Object.assign(g.player,{x:at.x+.1,z:at.z});updateGame(g,.1);assert.equal(s.distance,0);
  survivalLocomotion(g,119.9);assert.equal(s.movementQualified,false);
  survivalLocomotion(g,.1);assert.equal(s.movementQualified,true);
  assert.equal(g.player.health,100);assert.equal(g.player.ammo,2);
  const before=s.elapsed;pauseGame(g);updateGame(g,10,{forward:1});assert.equal(s.elapsed,before);
});

test('QTE/recovery survival time advances but return geometry waits for reservations',()=>{
  const g=enter(fixture()),s=g.cornSurvival;s.elapsed=179.9;survivalLocomotion(g,120);
  g.interaction={phase:'qte',landing:{route:[{...g.player}]}};
  advanceCornSurvival(g,.1);assert(s.exitReady);assert.equal(s.state,'exit_armed');assert.equal(g.maze.survivalLayout.sealOpen,false);
  const moved=s.distance;advanceCornSurvival(g,2);assert.equal(s.distance,moved);
  g.interaction=null;advanceCornSurvival(g,.02);assert.equal(s.state,'exit_armed');
  revealReturn(g);
});

test('valid physical return uses original gates, completes once and preserves daughter/checkpoints',()=>{
  const g=enter(fixture()),s=g.cornSurvival,l=g.maze.survivalLayout;
  s.elapsed=180;survivalLocomotion(g,120);advanceCornSurvival(g,.02);
  revealReturn(g);
  assert.equal(s.state,'return_route');
  const inner=g.maze.cornDoors[l.inner],outer=g.maze.cornDoors[l.outer];
  walk(g,{x:inner.x,z:inner.z+1});g.player.yaw=0;interact(g);updateGame(g,.5);
  walk(g,{x:inner.x,z:inner.z-1});assert.equal(s.state,'exiting');assert.equal(g.cornDoors[l.outer].locked,false);
  walk(g,{x:outer.x,z:outer.z+1});g.player.yaw=0;interact(g);updateGame(g,.5);
  walk(g,{x:outer.x,z:outer.z-1});
  assert(s.complete);assert.equal(g.events.filter(e=>e.type==='corn_survival_complete').length,1);
  finishCornSurvival(g);assert.equal(g.events.filter(e=>e.type==='corn_survival_complete').length,1);
  assert.equal(g.progress.checkpointIndex,0);assert.equal(g.progress.daughterFound,false);assert.equal(g.mode,'playing');
  const onward=centerOf(g.maze.door.x,g.maze.door.z);
  walk(g,{x:onward.x,z:onward.z+1.5});interact(g);updateGame(g,.5);assert(g.doorOpen);
  for(const checkpoint of g.maze.checkpoints)walk(g,checkpoint,90);
  assert.equal(g.progress.checkpointIndex,2);
  walk(g,g.maze.daughter,90);assert.equal(g.mode,'won');assert.equal(g.progress.daughterFound,true);
});

test('passage is not concealment; every module has a real reachable QTE landing',()=>{
  const g=fixture();setReturnOpen(g.maze,false);
  for(const section of g.maze.survivalLayout.sections)for(const variant of ['short','long']){
    paintSection(g.maze.cornWorld,section,variant);Object.assign(g.player,section.anchor);g.player.cornZoneId=null;
    updateCornPresence(g,{});g.elapsed+=1;updateCornPresence(g,{});assert.equal(g.player.hidden,false);
    const landing=findCornLanding(g,blocksFor(g));assert(landing,`Missing landing ${section.slot}/${variant}`);
    assert(landing.route.every(p=>canOccupy(g.maze,p.x,p.z,.25,blocksFor(g))));
  }
});

test('committed alternatives stay connected and prediction uses the field, not the daughter route',()=>{
  const g=enter(fixture());
  for(const section of g.maze.survivalLayout.sections){
    paintSection(g.maze.cornWorld,section,'long');
    assert(pathTo(g.maze,g.player,section.anchor,blocksFor(g)).length);
  }
  assert(predictionCandidates(g,blocksFor(g)).every(p=>sectionAt(g.maze,p)));
  const pins=protectedSections(g);assert(pins.has(sectionAt(g.maze,g.player).slot));
  assert(pins.has(sectionAt(g.maze,g.enemy).slot));
});

test('seeded section selection stays bounded and preserves actor occupancy',()=>{
  const a=enter(fixture()),b=enter(fixture());
  for(let i=0;i<80;i++){
    for(const g of [a,b])streamSections(g,.5);
  }
  assert.deepEqual(a.maze.survivalLayout.sections,b.maze.survivalLayout.sections);
  assert(a.cornSurvival.commits>0,'The pool must actually select and commit different sections');
  assert(a.maze.survivalLayout.sections.length+2<=16);
  assert(canOccupy(a.maze,a.player.x,a.player.z,.25,blocksFor(a)));
  assert(canOccupy(a.maze,a.enemy.x,a.enemy.z,.24,blocksFor(a)));
});

test('time alone and movement alone cannot arm the exit; qualification is silent and one-time',()=>{
  const a=enter(fixture()),b=enter(fixture());
  a.cornSurvival.elapsed=181;advanceCornSurvival(a,.01);assert.equal(a.cornSurvival.exitReady,false);
  survivalLocomotion(b,120);advanceCornSurvival(b,.01);assert.equal(b.cornSurvival.exitReady,false);
  const caption=b.caption;survivalLocomotion(b,20);
  assert.equal(b.events.filter(e=>e.type==='corn_movement_qualified').length,1);
  assert.equal(b.caption,caption);assert.equal(b.player.health,100);assert.equal(b.player.ammo,2);
  assert.equal(gameSnapshot(b).cornSurvival,undefined);
  assert.equal(gameSnapshot(b,{diagnostic:true}).cornSurvival.movementQualified,true);
});

test('pushing into a real wall adds no qualified distance after contact',()=>{
  const g=enter(fixture());g.player.flashlightOn=false;
  updateGame(g,5,{forward:1,yaw:Math.PI});const before=g.cornSurvival.distance;
  updateGame(g,1,{forward:1});assert.equal(g.cornSurvival.distance,before);
});

test('completion needs the gatepost crossing and death wins over the exit event',()=>{
  const g=enter(fixture()),s=g.cornSurvival;
  s.state='exiting';Object.assign(g.player,{x:1,z:1});finishCornSurvival(g);assert.equal(s.complete,false);
  s.exitCrossed=true;g.player.health=0;finishCornSurvival(g);assert.equal(s.complete,false);
  g.mode='dead';const before=s.elapsed;updateGame(g,10);assert.equal(s.elapsed,before);
});

test('actual QTE protects its route, excludes throw distance and retains exact recovery timing',()=>{
  const g=enter(fixture());g.grace=0;g.cornSurvival.elapsed=179.8;survivalLocomotion(g,120);
  Object.assign(g.enemy,{x:g.player.x,z:g.player.z-.65,state:'chase'});
  assert(beginTackle(g,blocksFor(g)));const revision=g.maze.cornWorld.revision,meters=g.cornSurvival.distance;
  updateGame(g,.56);assert.equal(g.interaction.phase,'qte');assert.equal(g.cornSurvival.state,'exit_armed');
  assert.equal(g.maze.cornWorld.revision,revision);
  for(let i=0;i<8;i++)updateGame(g,.01,{stab:true});
  updateGame(g,1);assert.equal(g.interaction.phase,'recovery');assert.equal(g.cornSurvival.distance,meters);
  assert.equal(g.interaction.recoveryDeadline-g.interaction.phaseStartedAt,10);
  const deadline=g.interaction.recoveryDeadline;updateGame(g,deadline-g.elapsed+.02);
  assert.equal(g.interaction,null);assert(Math.abs(g.skyRedUntil-deadline-3)<1e-6);
  assert.equal(g.events.filter(e=>e.type==='hunt_resume').length,1);
  revealReturn(g);
});

test('puddle pool and spatial lookup follow committed geometry and restart without growing',()=>{
  const g=enter(fixture()),weather=createWeather(template);weather.update(g,.01);
  const count=weather.state.puddles.length,section=g.maze.survivalLayout.sections[8];
  const surface=weather.state.puddles.find(p=>p.section===8),old={x:surface.x,z:surface.z};
  assert.equal(weather.state.puddles.filter(p=>p.section!==undefined).length,9);
  weather.state.ripples[0].born=0;paintSection(g.maze.cornWorld,section,'long');g.maze.cornWorld.revision++;
  weather.update(g,.01);assert.equal(weather.state.puddles.length,count);
  assert.equal(weather.puddleAt(section.anchor.x,section.anchor.z),surface);
  assert.equal(containsPuddle(surface,old.x,old.z),false);assert.equal(weather.state.ripples[0].born,-Infinity);
  for(const p of weather.state.puddles.filter(p=>p.section!==undefined))assert(canOccupy(g.maze,p.x,p.z,.3));
  weather.reset();assert.equal(surface.x,template.survivalLayout.sections[8].anchor.x);
  const next=fixture();weather.update(next,.01);
  assert.equal(surface.x,template.survivalLayout.sections[8].anchor.x);
});

test('all long/short corridor cells have a physical return shorter than 15 seconds at walk speed',()=>{
  for(const variant of ['long','short']){
    const g=fixture(),l=g.maze.survivalLayout,w=g.maze.cornWorld;
    for(const section of l.sections)paintSection(w,section,variant);
    setReturnOpen(g.maze,false);setReturnOpen(g.maze,true);
    const target={x:w.doors[l.inner].x,z:w.doors[l.inner].z+1};
    for(const section of l.sections)for(let z=section.z;z<section.z+6;z++)for(let x=section.x;x<section.x+6;x++){
      if(!w.walk[z*w.width+x])continue;
      const origin={x:(x+.5)*w.size,z:(z+.5)*w.size},route=pathTo(g.maze,origin,target,blocksFor(g));
      assert(route.length);const meters=route.slice(1).reduce((sum,p,i)=>sum+distance(route[i],p),0);
      assert(meters/3.8<15,`Return route is too long: ${meters}`);
    }
  }
});

test('left, right, alternating and backtracking routes survive the full clock on the same graph',()=>{
  const policies={left:[1,0,3,6,7,8,5,2],right:[1,2,5,8,7,6,3,0],
    alternating:[1,4,7,8,5,2,1,0,3,6,7,4],backtrack:[1,0,3,0,1,4,7,4]};
  for(const [name,slots] of Object.entries(policies)){
    const g=enter(fixture());g.grace=0;g.player.flashlightOn=false;
    let index=1,ticks=0;const initialEntity=g.enemy;
    while(!g.maze.survivalLayout.returnFunnel&&ticks++<16000){
      assert.equal(g.mode,'playing',`${name}: ordinary route with responsive QTE must remain survivable`);
      if(g.interaction&&g.interaction.phase!=='recovery'){updateGame(g,1/60,{stab:true});continue;}
      const target=g.maze.survivalLayout.sections[slots[index%slots.length]].anchor;
      if(distance(g.player,target)<.08){index++;continue;}
      const route=pathTo(g.maze,g.player,target,blocksFor(g));assert(route.length,`${name}: disconnected movement target`);
      const next=route.find(p=>distance(g.player,p)>.08)||target;
      const before={x:g.enemy.x,z:g.enemy.z};
      try{updateGame(g,1/60,{forward:1,yaw:Math.atan2(g.player.x-next.x,g.player.z-next.z)});}
      catch(error){throw new Error(`${name} at tick ${ticks}, enemy ${g.enemy.x},${g.enemy.z}, clearance .24=${canOccupy(g.maze,g.enemy.x,g.enemy.z,.24,blocksFor(g))} .25=${canOccupy(g.maze,g.enemy.x,g.enemy.z,.25,blocksFor(g))}`,{cause:error});}
      assert(distance(before,g.enemy)<=.2,`${name}: zombie cannot teleport`);
      assert(canOccupy(g.maze,g.enemy.x,g.enemy.z,g.enemy.radius,blocksFor(g)));
    }
    assert(g.cornSurvival.exitReady,`${name}: qualification stalled`);
    assert(g.maze.survivalLayout.returnFunnel,`${name}: a safe return commit must become available during continued movement`);
    assert(g.cornSurvival.elapsed>=180);assert(g.cornSurvival.distance>=120);
    assert.equal(g.enemy,initialEntity);assert.equal(g.cornSurvival.complete,false);
    assert(g.cornSurvival.commits>0);assert(g.maze.survivalLayout.sections.length+2<=16);
  }
});

test('application retry clears dynamic geometry, clocks, locks, input and weather',async()=>{
  const h=createHarness({survival:true,weather:true});await h.app.enter();
  h.app.fixture('encounter');h.app.step(.56);assert.equal(h.app.snapshot().interaction.phase,'qte');
  h.key('KeyE');h.key('Space');h.key('Escape');h.click('restart-btn');await h.flush();
  const s=h.app.snapshot(true),layout=h.app.survivalLayout();
  assert.equal(s.mode,'playing');assert.equal(s.cornSurvival.state,'inactive');assert.equal(s.cornSurvival.elapsed,0);
  assert.equal(s.cornSurvival.distance,0);assert.equal(s.interaction,null);assert.equal(s.enemy.memory.lastKnown,null);
  assert.equal(layout.sealOpen,true);assert(layout.sections.every(section=>section.generation===1));
  h.app.step(.1);assert.equal(h.app.snapshot(true).cornSurvival.state,'inactive');
  assert.equal(h.app.snapshot().weather.wetSteps,0);h.app.dispose();
});

test('enemy pathfinding uses its real radius at a tight corner, without hidden-player targeting',()=>{
  const g=fixture(),section=g.maze.survivalLayout.sections[4],w=g.maze.cornWorld;
  paintSection(w,section,'long');
  Object.assign(g.enemy,{x:(section.x+1)*w.size+.245,z:(section.z+3.5)*w.size});
  assert(canOccupy(g.maze,g.enemy.x,g.enemy.z,.24));assert.equal(canOccupy(g.maze,g.enemy.x,g.enemy.z,.25),false);
  assert(cornPath(w,g.enemy,section.anchor,blocksFor(g)).length);
  const candidates=predictionCandidates(g,blocksFor(g));assert(candidates.length>1);
  Object.assign(g.player,g.maze.survivalLayout.sections[8].anchor,{hidden:true});
  assert.deepEqual(predictionCandidates(g,blocksFor(g)),candidates);
  assert(choosePrediction(g,blocksFor(g)));
});

test('the committed return removes every section loop and both turn policies reach the original entry',()=>{
  const g=fixture(),l=g.maze.survivalLayout;setReturnOpen(g.maze,false);setReturnOpen(g.maze,true);
  const vectors=[[0,-1],[1,0],[0,1],[-1,0]];
  assert.equal(l.sections.reduce((sum,s)=>sum+s.ports.filter(d=>!(s.slot===1&&d===0)).length,0)/2,8);
  for(const variant of ['short','long']){
    // Use a fresh pool because the final return intentionally freezes variants.
    const maze=createMaze({survival:true});for(const s of maze.survivalLayout.sections)paintSection(maze.cornWorld,s,variant);
    setReturnOpen(maze,false);setReturnOpen(maze,true);
    for(const start of maze.survivalLayout.sections)for(const turn of [-1,1])for(let facing=0;facing<4;facing++){
      let section=start,heading=facing,steps=0,exited=false;
      while(steps++<20){
        const d=[heading+turn,heading,heading-turn,heading+2].map(n=>(n+4)%4).find(n=>section.ports.includes(n));
        if(section.slot===1&&d===0){exited=true;break;}
        const [dx,dz]=vectors[d],next=maze.survivalLayout.sections[section.slot+dx+dz*3];
        assert(pathTo(maze,section.anchor,next.anchor).length);section=next;heading=d;
      }
      assert(exited,`${variant} from ${start.slot}, turn ${turn}, heading ${facing}`);
    }
  }
});

test('the added field cannot bypass the original door or either checkpoint, even with all side gates open',()=>{
  const maze=createMaze({survival:true}),doors=maze.cornDoors.map(()=>({amount:1,swing:1}));
  assert.equal(maze.cornDoors.filter(d=>d.survival).length,2);
  assert.equal(new Set(maze.cornDoors.map(d=>d.id)).size,maze.cornDoors.length);
  assert(pathTo(maze,maze.spawn,maze.daughter,Object.assign([],{doors})).length);
  for(const cell of [maze.door,...maze.checkpoints.map(cellOf)]){
    assert.equal(pathTo(maze,maze.spawn,maze.daughter,Object.assign([cell],{doors})).length,0);
  }
});
