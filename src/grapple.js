import {canOccupy,pathTo,cornZoneAt} from './maze.js';
import {GAME_CONFIG as C,distance,emitEvent} from './game-config.js';
import {actorPosition} from './hiding.js';
import {transition} from './enemy-state.js';

export const interactionLocked=g=>!!g.interaction&&g.interaction.phase!=='recovery';
const point=p=>({x:p.x,z:p.z});
export function sweptClear(maze,a,b,r,blocks=[]){
  const n=Math.max(1,Math.ceil(distance(a,b)/.08));
  for(let i=0;i<=n;i++)if(!canOccupy(maze,a.x+(b.x-a.x)*i/n,a.z+(b.z-a.z)*i/n,r,blocks))return false;
  return true;
}

/** Reserve an actual nearby route before contact. No wall crossing or distant warp. */
export function findCornLanding(game,blocks=[]){
  const from=point(actorPosition(game,'player')),r=game.player.radius;
  const candidates=(game.maze.landingZones||[]).filter(a=>distance(a,from)<3.2)
    .sort((a,b)=>distance(a.pocket,from)-distance(b.pocket,from));
  for(const anchor of candidates){
    let route=pathTo(game.maze,from,anchor.pocket,blocks);
    if(!route.length)continue;
    route=[from,...route.slice(1)];
    // The first corridor center is needed when coming from an off-center contact.
    if(!cornZoneAt(game.maze,from))route=[from,point(anchor),point(anchor.pocket)];
    const length=route.slice(1).reduce((sum,p,i)=>sum+distance(route[i],p),0);
    if(length<.75||length>4.5)continue;
    if(route.slice(1).every((p,i)=>sweptClear(game.maze,route[i],p,r,blocks)))return {anchor,route,length};
  }
  return null;
}

export function beginTackle(game,blocks=[]){
  if(game.interaction||game.mode!=='playing'||game.player.health<=0)return false;
  const landing=findCornLanding(game,blocks);
  if(!landing){game.enemy.reason='seeking_safe_contact';return false;}
  const from=landing.route[0],p=game.player;
  const enemyAt=point(actorPosition(game,'enemy'));
  // Repeated contact can start beside a fallen creature. Reserve breathing room
  // for the face/knife composition, then move there continuously during tackle.
  let contact=enemyAt;
  if(distance(enemyAt,from)<.65){
    const angle=distance(enemyAt,from)>.01?Math.atan2(enemyAt.x-from.x,enemyAt.z-from.z):p.yaw+Math.PI;
    for(const offset of [0,.4,-.4,.8,-.8]){
      const candidate={x:from.x+Math.sin(angle+offset)*.65,z:from.z+Math.cos(angle+offset)*.65};
      if(sweptClear(game.maze,enemyAt,candidate,game.enemy.radius,blocks)){contact=candidate;break;}
    }
  }
  Object.assign(game.enemy,enemyAt,{ingressDepth:0,rushAnchorId:null});
  p.x=from.x;p.z=from.z;p.hidden=false;p.hideAnchorId=null;p.returnTransform=null;p.moving=false;
  p.yaw=Math.atan2(-(actorPosition(game,'enemy').x-p.x),-(actorPosition(game,'enemy').z-p.z));
  p.pitch=-.1;
  game.interaction={id:++game.interactionSerial,phase:'tackle',startedAt:game.elapsed,
    phaseStartedAt:game.elapsed,until:game.elapsed+C.grapple.tackleSeconds,
    presses:0,targetPresses:C.grapple.targetPresses,landing,origin:point(p),yaw:p.yaw,
    enemyOrigin:enemyAt,enemyContact:contact};
  game.metrics.hitsTaken++;
  transition(game,'tackle','close_contact');
  emitEvent(game,'tackle','',from);
  return true;
}

function phase(game,name,at,duration){
  Object.assign(game.interaction,{phase:name,phaseStartedAt:at,until:at+duration});
  game.enemy.state=name==='recovery'?'post_qte_recovery':name;
  game.enemy.stateStartedAt=at;
}
function drain(game,a,b){
  const q=game.interaction,p=game.player;
  const amount=Math.max(0,b-Math.max(a,q.readyAt+C.grapple.inputReadyGrace))*p.maxHealth/C.grapple.fullHealthSeconds;
  const damage=Math.min(p.health,amount);
  p.health=Math.max(0,p.health-damage);
  // One numeric boundary: <=1e-8 health is death, including an exact timestamp tie.
  if(p.health<=1e-8)p.health=0;
  game.metrics.damageTaken+=damage;
}
function positionOnRoute(landing,t){
  let remaining=landing.length*Math.max(0,Math.min(1,t));
  for(let i=1;i<landing.route.length;i++){
    const a=landing.route[i-1],b=landing.route[i],d=distance(a,b);
    if(remaining<=d)return {x:a.x+(b.x-a.x)*(remaining/(d||1)),z:a.z+(b.z-a.z)*(remaining/(d||1))};
    remaining-=d;
  }
  return point(landing.anchor.pocket);
}

/** Only active simulation seconds own health, progress, landing and recovery. */
export function updateInteraction(game,dt,input={}){
  const q=game.interaction;if(!q)return;
  const end=game.elapsed,start=end-dt;
  if(q.phase==='tackle'){
    const t=Math.min(1,Math.max(0,(end-q.phaseStartedAt)/C.grapple.tackleSeconds));
    game.enemy.x=q.enemyOrigin.x+(q.enemyContact.x-q.enemyOrigin.x)*t;
    game.enemy.z=q.enemyOrigin.z+(q.enemyContact.z-q.enemyOrigin.z)*t;
    game.enemy.yaw=Math.atan2(game.enemy.x-game.player.x,game.enemy.z-game.player.z);
    game.player.yaw=Math.atan2(game.player.x-game.enemy.x,game.player.z-game.enemy.z);
  }
  if(q.phase==='tackle'&&end+1e-9>=q.until){
    const at=q.until;phase(game,'qte',at,Infinity);q.readyAt=at;q.lastDrainAt=at;
    emitEvent(game,'qte');
  }
  if(q.phase==='qte'){
    const times=(input.stabTimes||[]).filter(Number.isFinite).sort((a,b)=>a-b);
    if(input.stab)times.push(end);
    for(const at of times){
      if(at<q.readyAt||at<q.lastDrainAt-1e-9||at>end+1e-9)continue;
      drain(game,q.lastDrainAt,at);q.lastDrainAt=at;
      if(!game.player.health)break;
      q.presses++;
      emitEvent(game,'stab_press','',null,{presses:q.presses});
      if(q.presses>=q.targetPresses){
        phase(game,'stab',at,C.grapple.stabSeconds);emitEvent(game,'eye_stab');break;
      }
    }
    if(q.phase==='qte'){drain(game,Math.max(q.lastDrainAt,start),end);q.lastDrainAt=end;}
  }
  if(game.player.health<=0)return;
  if(q.phase==='stab'&&end+1e-9>=q.until){phase(game,'throw',q.until,C.grapple.throwSeconds);emitEvent(game,'throw');}
  if(q.phase==='throw'){
    Object.assign(game.player,positionOnRoute(q.landing,(end-q.phaseStartedAt)/C.grapple.throwSeconds));
    if(end+1e-9>=q.until){
      const at=q.until;phase(game,'recovery',at,C.grapple.recoverySeconds);q.recoveryDeadline=q.until;
      Object.assign(game.player,point(q.landing.anchor.pocket));
      game.player.cornZoneId=q.landing.anchor.id;
      game.player.damageCooldown=0;
      game.enemy.ingressDepth=0;game.enemy.rushAnchorId=null;
      Object.assign(game.enemy.memory,{lastKnown:point(q.landing.anchor.pocket),lastHeard:point(q.landing.anchor.pocket),lastHeardAt:at,
        anchorId:q.landing.anchor.id,lastObservation:{source:'throw_landing',position:point(q.landing.anchor.pocket),at,anchorId:q.landing.anchor.id}});
      emitEvent(game,'landing','',q.landing.anchor.pocket);
    }
  }
  if(q.phase==='recovery'&&end+1e-9>=q.recoveryDeadline){
    game.skyRedUntil=q.recoveryDeadline+C.grapple.redSkySeconds;
    game.skyRedStartedAt=q.recoveryDeadline;
    game.enemy.attackCooldown=C.grapple.retackleGrace;
    transition(game,game.grace>0?'disengage':'investigate','qte_recovered',game.grace);
    game.enemy.target=game.enemy.memory.lastKnown;
    emitEvent(game,'hunt_resume','',actorPosition(game,'enemy'));
    game.interaction=null;
  }
}
