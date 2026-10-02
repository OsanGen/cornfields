import {GAME_CONFIG as C,emitEvent} from './game-config.js';
import {actorPosition} from './hiding.js';
import {SURVIVAL_LINES,ROOM_DURATION} from './survival-script.js';
import {PROLOGUE_VOICE_TIMING} from './prologue-voice-timing.js';

// Presentation and a deadline attached to the existing run. The active phase
// never changes combat, AI, progression rewards, navigation, or field spawning.
export function attachSurvivalEnding(game,{briefing=true}={}){
  game.survivalEnding={phase:briefing?'arrival':'active',time:0,remaining:180,
    roomPlayer:{x:0,z:3,yaw:0,pitch:0},origin:null,center:null,jumped:false};
  return game.survivalEnding;
}
export function survivalLine(state){
  if(!state)return null;
  const chapter=state.phase==='room'?'room':state.phase==='pit'?'pit':null;
  return SURVIVAL_LINES.find(line=>line.chapter===chapter&&state.time>=line.start&&state.time<line.end)||null;
}
export function survivalTime(state){
  const seconds=Math.max(0,Math.ceil(state.remaining-1e-9));
  return `${String(Math.floor(seconds/60)).padStart(2,'0')}:${String(seconds%60).padStart(2,'0')}`;
}
function phase(state,next){state.phase=next;state.time=0;}
export function completeSurvival(game){
  const s=game.survivalEnding;if(!s||s.phase!=='active')return;
  const position=actorPosition(game,'player');
  Object.assign(game.player,position,{hidden:false,cornZoneId:null,hideAnchorId:null,returnTransform:null,moving:false,sprinting:false,muzzleFlash:0});
  s.remaining=0;s.origin={...position};
  s.center={x:position.x-Math.sin(game.player.yaw)*14,z:position.z-Math.cos(game.player.yaw)*14};
  game.interaction=null;game.pendingStabs.length=0;game.skyRedUntil=0;
  for(const enemy of game.enemies||[game.enemy]){enemy.active=false;enemy.visible=false;}
  Object.assign(game.threat,{activeMessage:null,activeMessageTime:0,intensity:0,pressure:0});
  game.caption='';game.captionTime=0;game.objective='TRIAL COMPLETE';game.chapter='DEEPER ACCESS';
  game.landmark='';phase(s,'transform');emitEvent(game,'trial_complete');
}

export function pitPrompt(game){
  const s=game.survivalEnding;
  return s?.phase==='pit'&&Math.hypot(game.player.x-s.center.x,game.player.z-s.center.z)<=11.8?'E - JUMP':'';
}
function movePresentation(game,dt,input,room=false){
  const s=game.survivalEnding,p=room?s.roomPlayer:game.player;
  if(Number.isFinite(input.yaw))p.yaw=input.yaw;
  if(Number.isFinite(input.pitch))p.pitch=Math.max(-1.25,Math.min(1.25,input.pitch));
  // Input uses the current player angles as its absolute look baseline.
  if(room){game.player.yaw=p.yaw;game.player.pitch=p.pitch;}
  if(input.flashlight)game.player.flashlightOn=!game.player.flashlightOn;
  const f=Number(input.forward)||0,r=Number(input.strafe)||0,n=Math.hypot(f,r),before={x:p.x,z:p.z};
  if(n){
    const speed=room?2.5:C.player.moveSpeed;
    let x=p.x+(-Math.sin(p.yaw)*f+Math.cos(p.yaw)*r)/n*speed*dt;
    let z=p.z+(-Math.cos(p.yaw)*f-Math.sin(p.yaw)*r)/n*speed*dt;
    if(room){x=Math.max(-2.8,Math.min(2.8,x));z=Math.max(-4.35,Math.min(4.35,z));
      // Keep the sole prop solid without introducing room navigation machinery.
      if(Math.abs(x)<.5&&Math.abs(z-1.7)<.55){x=p.x;z=p.z;}
    }else{
      const dx=x-s.center.x,dz=z-s.center.z,d=Math.hypot(dx,dz);
      if(d<10.6||d>22){x=p.x;z=p.z;}
    }
    p.x=x;p.z=z;
  }
  const moved=Math.hypot(p.x-before.x,p.z-before.z);
  game.player.moving=moved>.0001;game.player.sprinting=false;game.steps+=moved;
}

// Returns true only while a story/end presentation owns this substep. During
// active play the old authoritative game tick runs unchanged beneath the timer.
export function advanceSurvivalPresentation(game,dt,input,moveArrival){
  const s=game.survivalEnding;if(!s)return false;
  if(s.phase==='active'){
    s.remaining=Math.max(0,s.remaining-dt);
    if(s.remaining<=1e-9){game.elapsed+=dt;completeSurvival(game);return true;}
    return false;
  }
  s.time+=dt;
  if(s.phase==='arrival'){
    game.elapsed+=dt;
    moveArrival(game,dt,input);
    if(s.time>=PROLOGUE_VOICE_TIMING['END-01'].duration+.8){s.origin={...game.player};phase(s,'entry');emitEvent(game,'projector_start');}
  }else if(s.phase==='entry'){
    game.player.moving=false;
    if(s.time>=2){game.player.yaw=0;game.player.pitch=0;phase(s,'room');}
  }else if(s.phase==='room'){
    movePresentation(game,dt,input,true);
    if(s.time>=ROOM_DURATION){phase(s,'exit');emitEvent(game,'projector_stop');}
  }else if(s.phase==='exit'){
    game.player.moving=false;
    if(s.time>=1.5){Object.assign(game.player,s.origin,{moving:false,sprinting:false});phase(s,'active');}
  }else if(s.phase==='transform'){
    game.player.moving=false;
    if(Number.isFinite(input.yaw))game.player.yaw=input.yaw;
    if(Number.isFinite(input.pitch))game.player.pitch=input.pitch;
    if(s.time>=4){phase(s,'pit');game.objective='DEEPER ACCESS PERMITTED';}
  }else if(s.phase==='pit'){
    movePresentation(game,dt,input);
    if(input.interact&&pitPrompt(game)){s.jumped=true;phase(s,'fall');game.objective='';emitEvent(game,'pit_jump');}
  }else if(s.phase==='fall'){
    if(Number.isFinite(input.yaw))game.player.yaw=input.yaw;
    if(Number.isFinite(input.pitch))game.player.pitch=input.pitch;
    game.player.moving=false;
    if(s.time>=3.2){game.mode='playtest-ended';game.metrics.outcome='playtest-ended';game.metrics.completionTime=game.elapsed;}
  }
  return true;
}
