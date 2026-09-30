import {lineOfSight,cornZoneAt} from './maze.js';
import {GAME_CONFIG as C,distance,addEvidence,emitEvent} from './game-config.js';
import {gateAt} from './corn-world.js';

export const actorPosition=(game,who)=>game[who];
export const hideAnchor=(game,id=game.player.hideAnchorId)=>game.maze.cornDoors.find(a=>a.id===id)||null;
export const nearestHideAnchor=game=>game.entered?gateAt(game):null;

export function seesPlayer(game,blocks,ignoreHidden=false){
  if(game.enemies&&game.enemy.zone!==game.player.zone)return false;
  const e=game.enemy,p=game.player,d=distance(e,p),wide=['chase','rage_chase','corn_rush'].includes(e.state);
  if(p.hidden&&!ignoreHidden&&d>1.25)return false;
  const facing=d<.01?1:(-Math.sin(e.yaw)*(p.x-e.x)-Math.cos(e.yaw)*(p.z-e.z))/d;
  return d<C.zombie.visionDistance&&facing>Math.cos(wide?C.zombie.chaseHalfAngle:C.zombie.visionHalfAngle)&&lineOfSight(game.maze,e,p,blocks);
}

export function hiddenInput(game,input){
  const p=game.player;if(!p.cornZoneId)return;
  const noisy=input.movementIntent||input.forward||input.strafe||input.fire||input.flashlight||input.interact||Math.abs(input.lookDelta||0)>C.hiding.mouseMovementThresholdPixels;
  if(!noisy)return;
  p.stillSince=game.elapsed;p.hidden=false;
  addEvidence(game,'rustle',p,C.hearing.rustleRadius,5,{corn:true});
  if(game.elapsed-(p.lastRustleSoundAt??-10)>.45){emitEvent(game,'rustle','',p);p.lastRustleSoundAt=game.elapsed;}
}

export function updateCornPresence(game,input,alreadyNoisy=false){
  const p=game.player,zone=cornZoneAt(game.maze,p),previous=p.cornZoneId;
  p.cornZoneId=zone?.id||null;
  if(zone&&!previous){
    p.cornEnteredAt=game.elapsed;p.stillSince=game.elapsed;p.flashlightOn=false;
    game.metrics.hidesEntered++;
    emitEvent(game,'hide',game.tutorial.entered?'':'STAY STILL. EVEN LOOKING MAKES NOISE.',p);
    game.tutorial.entered=true;
  }else if(!zone&&previous){game.metrics.hidesSurvived++;emitEvent(game,'leave','',p);}
  if(!alreadyNoisy)hiddenInput(game,input);
  p.hidden=!!zone&&game.elapsed-(p.stillSince??game.elapsed)>=.15;
  p.hideAnchorId=null;p.returnTransform=null;p.hideDepth=0;
}

export function localIngressVisible(game){
  if(game.enemies&&game.enemy.zone!==game.player.zone)return false;
  return !!cornZoneAt(game.maze,game.player)&&distance(game.enemy,game.player)<1.5&&lineOfSight(game.maze,game.enemy,game.player,game.blocks||[]);
}
