import {GAME_CONFIG as C,distance,emitEvent,addEvidence} from './game-config.js';
import {createEnemy,updateZombie} from './zombie-ai.js';
import {cornPath,openDoor,cornOccupy} from './corn-world.js';
import {recycleCorridor,prepareCorridorExit} from './corridor-layout.js';

export const activeEnemies=g=>g.enemies?g.enemies.filter(e=>e.active&&e.zone===g.player.zone):[g.enemy];
export function withEnemy(g,e,fn){const previous=g.enemy;g.enemy=e;try{return fn();}finally{g.enemy=previous;}}
export function initializeCorridorRun(g){
  if(!g.maze.corridorLayout)return;
  g.corridorMaze=g.maze;g.player.zone='corridor';g.player.yaw=Math.PI;g.doorOpen=true;
  g.corridorRun={elapsed:0,distance:0,ready:false,started:false,complete:false,recycleWait:1,cursor:0,recycles:0};
  g.fieldTrip={active:false,doorId:null,returnDoor:null,warningAt:-100,nextSpawnAt:0,maxDepth:0,serial:0};
  Object.assign(g.enemy,g.maze.corridorLayout.enemySpawn,{id:'pursuer',active:true,zone:'corridor'});
  g.enemies=[g.enemy,...Array.from({length:3},(_,i)=>Object.assign(createEnemy(),{id:`field-${i}`,active:false,zone:'field',extra:true}))];
  g.cornDoors[g.maze.corridorLayout.exit].locked=true;
  g.objective='Enter the wooden corridors. Find your daughter.';
}
function fieldMaze(g,door){
  const base=g.corridorMaze,w=base.cornWorld;
  const doors=w.doors.map(d=>({...d,x:100000+d.index*10,z:100000,hinge:{x:100000+d.index*10,z:100000}}));
  doors[door.index]={...door,x:0,z:0,hinge:{x:door.width/2,z:0},pocket:{x:0,z:1.2},fieldReturn:true};
  return {...base,zone:'field',cornDoors:doors,hideAnchors:[doors[door.index]],landingZones:[],
    cornWorld:{...w,openField:true,activeDoor:door.index,doors},checkpoints:[],landmarks:[]};
}
export function enterOpenField(g,door){
  if(!g.corridorRun||g.fieldTrip.active||g.interaction||!door.fieldEntrance||g.cornDoors[door.index].amount<.96)return false;
  const p=g.player,trip=g.fieldTrip;
  const destination={x:-(p.x-door.x),z:Math.max(.85,-(p.z-door.z))};
  if(g.enemies.some(e=>e.active&&e.zone==='field'&&distance(e,destination)<e.radius+p.radius+.1))return false;
  Object.assign(trip,{active:true,doorId:door.id,returnDoor:door,serial:trip.serial+1});
  const primary=g.enemies[0];
  // Only a real observation near the doorway can give the pursuer an ingress.
  if(primary.zone==='corridor'&&primary.memory.lastKnown&&distance(primary.memory.lastKnown,door)<5)primary.followDoor=door.index;
  g.maze=fieldMaze(g,door);g.fieldMaze=g.maze;
  Object.assign(p,destination,{yaw:p.yaw+Math.PI,zone:'field',hidden:false,cornZoneId:'open-field',stillSince:g.elapsed});g.metrics.hidesEntered++;
  emitEvent(g,'hide','Stay still to hide. Your daughter is back in the corridors.',p);
  return true;
}
export function leaveOpenField(g){
  if(!g.fieldTrip.active||g.interaction)return false;
  const p=g.player,door=g.fieldTrip.returnDoor;
  g.maze=g.corridorMaze;g.fieldTrip.active=false;
  Object.assign(p,{x:door.x-p.x,z:door.z+.9,yaw:p.yaw-Math.PI,zone:'corridor',hidden:false,cornZoneId:null,stillSince:g.elapsed});
  const primary=g.enemies[0];
  if(primary.zone==='field'){
    primary.followDoor=door.index;
    primary.followAfter=g.elapsed+(primary.memory.lastKnown&&distance(primary.memory.lastKnown,{x:0,z:0})<5?0:8);
  }
  g.metrics.hidesSurvived++;
  emitEvent(g,'leave','Find your daughter. Keep moving.',p);
  return true;
}
export function corridorMovement(g,before,moved){
  if(!g.corridorRun)return;
  const p=g.player;
  if(p.zone==='corridor'){
    if(g.corridorRun.started)g.corridorRun.distance+=moved;
    for(const d of g.maze.cornDoors.filter(d=>d.fieldEntrance))if(before.z>=d.z-.65&&p.z<d.z-.65&&Math.abs(p.x-d.x)<d.width/2-p.radius){enterOpenField(g,d);break;}
  }else if(before.z>=-.65&&p.z<-.65&&Math.abs(p.x)<g.fieldTrip.returnDoor.width/2-p.radius)leaveOpenField(g);
}
export function advanceCorridorRun(g,dt){
  const run=g.corridorRun;if(!run)return;
  if(g.player.zone==='corridor'){
    if(!run.started&&g.player.z>9*g.maze.cornWorld.size){run.started=true;g.entered=true;g.chapter='THE WOODEN ROWS';g.objective='FIND YOUR DAUGHTER';}
    if(run.started&&!run.complete)run.elapsed+=dt;
    if(!run.ready&&run.elapsed>=C.cornSurvival.seconds&&run.distance>=C.cornSurvival.distance){run.ready=true;emitEvent(g,'corridor_exit_ready');}
    if(run.ready&&!g.interaction){
      run.returnConnected=prepareCorridorExit(g);
      const index=g.maze.corridorLayout.exit,state=g.cornDoors[index];
      if(state.locked){state.locked=false;g.doorRevision++;openDoor(g,g.maze.cornDoors[index],'player');emitEvent(g,'corridor_route_open','A lantern ahead. Keep going.');}
    }
    recycleCorridor(g,dt);
  }
  updateFieldPressure(g);
}
function updateFieldPressure(g){
  if(!g.fieldTrip.active||g.interaction)return;
  const trip=g.fieldTrip,p=g.player,depth=Math.hypot(p.x,p.z);trip.maxDepth=Math.max(trip.maxDepth,depth);
  if(depth>=15&&g.elapsed-trip.warningAt>=18){trip.warningAt=g.elapsed;emitEvent(g,'field_warning','Too deep. Return to the corridors. Find your daughter.');}
  const desired=depth>=40?3:depth>=25?1:0;
  const extras=g.enemies.filter(e=>e.extra&&e.active);
  // Retreat releases only distant creatures hidden by the field's dense corn.
  for(const e of extras)if(desired===0&&distance(e,p)>15)e.active=false;
  if(extras.length>=desired||g.elapsed<trip.nextSpawnAt)return;
  const e=g.enemies.find(e=>e.extra&&!e.active);if(!e)return;
  const angle=Math.atan2(p.x,p.z)+(g.enemies.indexOf(e)-2)*1.2;
  const position={x:p.x+Math.sin(angle)*12,z:p.z+Math.cos(angle)*12};
  if(Math.hypot(position.x,position.z)<18||!cornOccupy(g.maze.cornWorld,position.x,position.z,.3,g.blocks))return;
  const id=e.id;Object.assign(e,createEnemy(),position,{id,extra:true,active:true,zone:'field',visible:true,rng:Math.floor(g.elapsed*1000)+g.enemies.indexOf(e)});
  trip.nextSpawnAt=g.elapsed+8;
}
// Inactive-zone pursuit uses its last doorway evidence, not the player's remote
// transform. Actors cross only after physically reaching the open threshold.
function followAcrossDoor(g,e,dt){
  e.attackCooldown=Math.max(0,e.attackCooldown-dt);e.timer=Math.max(0,e.timer-dt);
  if(['staggered','flashlight_recoil'].includes(e.state)&&e.timer>0)return;
  if(e.followDoor==null||g.elapsed<(e.followAfter||0))return;
  const d=g.corridorMaze.cornDoors[e.followDoor],fromField=e.zone==='field';
  const maze=fromField?g.fieldMaze:g.corridorMaze;
  const target=fromField?{x:0,z:.85}:{x:d.x,z:d.z+.85};
  const blocks=[];blocks.doors=g.cornDoors;
  if(distance(e,target)<1.5&&g.cornDoors[d.index].amount<.96){
    const previous=g.maze;g.maze=maze;
    try{withEnemy(g,e,()=>openDoor(g,maze.cornDoors[d.index],'enemy'));}finally{g.maze=previous;}
    return;
  }
  const path=cornPath(maze.cornWorld,e,target,blocks,{allowDoors:true});
  const to=path.find(p=>distance(p,e)>.08);
  if(to){const length=distance(e,to),step=Math.min(length,dt*C.zombie.investigateSpeed),x=e.x+(to.x-e.x)/length*step,z=e.z+(to.z-e.z)/length*step;
    if(cornOccupy(maze.cornWorld,x,z,e.radius,blocks)){e.yaw=Math.atan2(e.x-x,e.z-z);e.x=x;e.z=z;e.step+=step;}}
  if(distance(e,target)>.2||g.cornDoors[d.index].amount<.96)return;
  const arrival=fromField?{x:d.x,z:d.z+.3,zone:'corridor'}:{x:0,z:.3,zone:'field'};
  if([g.player,...g.enemies.filter(other=>other!==e&&other.active)].some(other=>other.zone===arrival.zone&&distance(other,arrival)<e.radius+other.radius+.03))return;
  Object.assign(e,arrival);
  e.followDoor=null;e.path=[];e.searchCells=[];e.target=null;e.state='investigate';
  e.memory={...createEnemy().memory,lastKnown:{x:e.x,z:e.z},lastHeardAt:g.elapsed,lastObservation:{source:'doorway',position:{x:e.x,z:e.z},at:g.elapsed}};
}
export function updateCorridorEnemies(g,dt,blocks){
  if(!g.enemies){updateZombie(g,dt,blocks);return;}
  for(const e of g.enemies){
    if(!e.active)continue;
    if(e.zone!==g.player.zone){if(!g.interaction)followAcrossDoor(g,e,dt);continue;}
    withEnemy(g,e,()=>updateZombie(g,dt,blocks));
  }
  g.evidence.length=0;
  if(g.interaction){g.enemy=g.enemies.find(e=>e.id===g.interaction.enemyId)||g.enemy;return;}
  g.enemy=activeEnemies(g).sort((a,b)=>distance(a,g.player)-distance(b,g.player))[0]||g.enemies[0];
}
