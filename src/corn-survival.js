import {GAME_CONFIG as C, emitEvent} from './game-config.js';
import {requestDoor} from './corn-world.js';
import {interactionLocked} from './grapple.js';
import {SURVIVAL_LAYOUT,sectionAt,setReturnOpen,canChangeReturn,streamSections,protectedSections} from './corn-layout.js';

export function createCornSurvival(maze,seed=394729) {
  if(!maze.survivalLayout)return null;
  return {state:'inactive',seed,rng:seed,elapsed:0,distance:0,movementQualified:false,exitReady:false,
    complete:false,commits:0,cursor:0,streamWait:0,innerCrossed:false,outerCrossed:false,returnCommittedAt:null,
    previous:{...maze.spawn},exitCrossed:false,startedAt:null};
}
function crossed(previous,player,door,direction){
  const z=door.z+direction*(player.radius+.15);
  if((previous.z-z)*direction>=0||(player.z-z)*direction<0)return false;
  const t=(z-previous.z)/(player.z-previous.z),x=previous.x+(player.x-previous.x)*t;
  return Math.abs(x-door.x)<door.width/2-player.radius;
}
function lock(game,index,value){
  const state=game.cornDoors[index];if(state.locked===value)return;
  state.locked=value;game.doorRevision++;
}
function close(game,index){
  const state=game.cornDoors[index];
  if(state.amount>0){state.target=0;state.requestedBy='survival';game.movingDoors.add(index);return false;}
  lock(game,index,true);return true;
}
export function initializeCornSurvival(game){
  if(!game.cornSurvival)return;
  const layout=game.maze.survivalLayout;
  Object.assign(game.cornDoors[layout.inner],{amount:1,target:1,locked:false,swing:1});
  Object.assign(game.enemy,layout.enemySpawn);
  game.player.yaw=Math.PI;
}
export function survivalLocomotion(game,moved){
  const s=game.cornSurvival;if(!s||!['active_survival','exit_armed','return_route'].includes(s.state))return;
  if(!sectionAt(game.maze,game.player))return;
  if(Number.isFinite(moved)&&moved>0)s.distance+=moved;
  if(s.distance>=C.cornSurvival.distance&&!s.movementQualified){
    s.movementQualified=true;emitEvent(game,'corn_movement_qualified');
  }
}
// Runs before the QTE early return. Clocks use only authoritative simulation dt.
export function advanceCornSurvival(game,dt){
  const s=game.cornSurvival;if(!s||s.complete)return;
  const layout=game.maze.survivalLayout,w=game.maze.cornWorld,p=game.player;
  const outer=w.doors[layout.outer],inner=w.doors[layout.inner];
  const previous=s.previous;s.previous={x:p.x,z:p.z};
  if(s.state==='inactive'&&crossed(previous,p,outer,1)){s.state='entry_transition';s.outerCrossed=true;}
  if(s.state==='entry_transition'){
    const outerClosed=close(game,layout.outer);
    if(crossed(previous,p,inner,1))s.innerCrossed=true;
    if(s.innerCrossed&&outerClosed&&close(game,layout.inner)){
      s.state='active_survival';s.startedAt=game.elapsed;game.entered=true;
      game.chapter='THE LOST ROWS';game.objective='FIND SADIE YATES';
      emitEvent(game,'corn_survival_started');
    }
    return;
  }
  // Commitment owns the clock. Conceal the vestibule only after its cap is clear
  // and occluded; the locked physical gates remain authoritative in the meantime.
  if(s.state==='active_survival'&&layout.sealOpen&&sectionAt(game.maze,p)&&canChangeReturn(game))setReturnOpen(game.maze,false);
  if(['active_survival','exit_armed','return_route','exiting'].includes(s.state))s.elapsed+=dt;
  if(s.elapsed>=C.cornSurvival.seconds&&s.movementQualified&&!s.exitReady){
    s.exitReady=true;s.state='exit_armed';emitEvent(game,'corn_exit_ready');
  }
  // Eligibility never alters a tackle/throw/recovery reservation.
  if(s.state==='exit_armed'&&!interactionLocked(game)&&canChangeReturn(game)){
    setReturnOpen(game.maze,true);lock(game,layout.inner,false);
    s.state='return_route';s.returnCommittedAt=game.elapsed;
    emitEvent(game,'corn_return_route');
  }
  if(s.state==='return_route'&&crossed(previous,p,inner,-1)){
    s.state='exiting';lock(game,layout.outer,false);
  }
  if(s.state==='exiting'&&crossed(previous,p,outer,-1))s.exitCrossed=true;
  streamSections(game,dt);
}
// Finalized after combat. A lethal tick or scripted interaction cannot complete.
export function finishCornSurvival(game){
  const s=game.cornSurvival;if(!s||s.state!=='exiting'||!s.exitCrossed||game.mode!=='playing'||game.player.health<=0||interactionLocked(game))return;
  const layout=game.maze.survivalLayout;
  s.complete=true;s.state='complete';
  // Leave the actual route available for the same pursuer and safe re-entry.
  for(const index of [layout.outer,layout.inner]){
    lock(game,index,false);
    if(requestDoor(game,game.maze.cornWorld.doors[index],true))game.movingDoors.add(index);
  }
  game.chapter='THE THRESHOLD';game.objective='FIND SADIE YATES';
  emitEvent(game,'corn_survival_complete','',game.player);
}
export function survivalSnapshot(game){
  const s=game.cornSurvival;if(!s)return null;
  const layout=game.maze.survivalLayout;
  return {...s,sectionCount:layout.sections.length+2,maxSections:SURVIVAL_LAYOUT.maxSections,revision:game.maze.cornWorld.revision,
    playerSection:sectionAt(game.maze,game.player)?.id||null,zombieSection:sectionAt(game.maze,game.enemy)?.id||null,
    protected:[...protectedSections(game)].map(([slot,reasons])=>({slot,reasons:[...reasons]})),
    sections:layout.sections.map(({slot,id,variant,anchor,ports})=>({slot,id,variant,anchor,ports}))};
}
