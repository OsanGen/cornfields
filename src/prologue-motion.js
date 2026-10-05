import {WEST_APPROACH,approachPoint,approachPathPosition,approachYaw,approachViewYaw,approachDepth} from './prologue-layout.js';
import {EXIT_SECONDS,samplePrologueExit} from './prologue-performance.js';
import {GAME_CONFIG} from './game-config.js';
import {sampleRoadsideConfrontation,ROADSIDE_DISTANCE,roadsideSteps,roadsideFootAnchors} from './prologue-confrontation.js';

const clamp=value=>Math.max(0,Math.min(1,Number(value)||0));
const smooth=value=>{const t=clamp(value);return t*t*(3-2*t);};
const mix=(a,b,t)=>a+(b-a)*t;
const WALK={walk:[0,.27],history:[.27,.62],disappearance:[.62,.84],arrival:[.84,1]};
const CHAPTERS=Object.keys(WALK),IDS=['mike','clarence','stanley'],EYE=GAME_CONFIG.player.eyeHeight;
const STEP={mike:.50,clarence:.45,stanley:.48},OFFSET={mike:0,clarence:.37,stanley:.73};
const RUN_DISTANCE=ROADSIDE_DISTANCE,RUN_STEP=.85;

/** Shared distance phase: heel contact stays exactly on the audio contact clock. */
export function samplePrologueSoleGait(phase=0,index=0,{running=false,gait=1}={}){
  const cycles=phase/(Math.PI*2)+index*.5,cycle=Math.floor(cycles),u=cycles-cycle;
  const stance=running?.38:.62,heelEnd=stance*.22,toeStart=stance*.71;
  const swing=clamp((u-stance)/(1-stance));
  const heel=running?-.15:-.20,toe=running?.38:.30;
  const pitch=u<heelEnd?heel*(1-smooth(u/heelEnd)):u<toeStart?0:u<stance?toe*smooth((u-toeStart)/(stance-toeStart)):mix(toe,heel,smooth(swing));
  return {cycle,u,stance,swing,planted:u<stance,pitch:pitch*clamp(gait),contact:u<heelEnd?'heel':u<toeStart?'sole':u<stance?'toe':'swing',lift:u<stance?0:Math.sin(swing*Math.PI)*(running?.17:.075)};
}

export function prologueWorldTransition(frame={},available=false){
  const p=clamp(frame.chapterProgress),arrival=frame.chapter==='arrival';
  return {world:available&&(!!frame.returning||frame.chapter==='rupture'||arrival&&p>=.16),
    cover:available&&arrival&&!frame.returning?(p<.16?smooth(p/.13):1-smooth((p-.22)/.18)):0};
}

export function prologueBlocking(frame={}){
  const chapter=frame.chapter||'car',p=clamp(frame.chapterProgress),t=Number(frame.time)||0;
  const returning=!!frame.returning,walk=WALK[chapter];
  const travel=returning||chapter==='rupture'?1:walk?mix(...walk,smooth(p)):0;
  const exit=walk||chapter==='flashlight'||chapter==='rupture'||returning?1:chapter==='exit'?clamp((frame.chapterTime??p*8)/EXIT_SECONDS):0;
  const camera=samplePrologueExit(exit*EXIT_SECONDS).position;
  const look=[mix(-.08,2.2,exit),mix(1.12,1.5,exit),mix(-8,-3.1,exit)];
  if(walk||chapter==='rupture'||returning){camera.splice(0,3,...approachPathPosition('mike',travel,EYE));const facing=Math.PI/2*smooth((travel-.035)/.04);look.splice(0,3,camera[0]-(facing>=Math.PI/2?1:Math.sin(facing))*8,EYE,camera[2]-(facing>=Math.PI/2?0:Math.cos(facing))*8);}
  if(chapter==='car'||chapter==='dispatch'){
    const speaking=String(frame.speaker||'').toLowerCase().includes('clarence');
    const glance=chapter==='car'?(speaking?.86:.5+.5*Math.sin(t*.095)):.28;
    look[0]=mix(-.08,-4.8,glance*.78);look[2]=-3.8;
  }
  if(chapter==='emergence'){look[0]=mix(.2,2.2,smooth(p*3));look[2]=mix(-6,-2.2,smooth(p*3));}
  if(chapter==='rupture'&&!frame.reduced){const turn=Math.sin(smooth(p/.48)*Math.PI)*1.5;look[0]=camera[0]-Math.cos(turn)*8;look[2]=camera[2]+Math.sin(turn)*8;}
  if(returning){look[0]=-56;look[1]=EYE;look[2]=WEST_APPROACH.centerZ;}
  return {camera,look,exit,travel,inCar:exit<.999&&!walk&&chapter!=='rupture'&&!returning,
    menVisible:!returning&&!(chapter==='rupture'&&clamp(frame.mist)>.86),chapter,progress:p};
}

function pathPosition(id,chapter,p){
  return approachPathPosition(id,mix(...WALK[chapter],smooth(p)),id==='mike'?EYE:0);
}

// Fixed arc-length tables are tiny, deterministic and independent of frame rate.
// Every table uses the exact same position function consumed by the renderer.
const DIVISIONS=128,ARCS={},PREFIX={};
for(const id of IDS){
  ARCS[id]={};PREFIX[id]={};let prefix=0;
  for(const chapter of CHAPTERS){
    const table=[0];let previous=pathPosition(id,chapter,0);PREFIX[id][chapter]=prefix;
    for(let i=1;i<=DIVISIONS;i++){const next=pathPosition(id,chapter,i/DIVISIONS);table.push(table.at(-1)+Math.hypot(next[0]-previous[0],next[2]-previous[2]));previous=next;}
    ARCS[id][chapter]=table;prefix+=table.at(-1);
  }
}
function walkDistance(id,chapter,p){
  const cursor=clamp(p)*DIVISIONS,index=Math.min(DIVISIONS-1,Math.floor(cursor)),table=ARCS[id][chapter];
  return PREFIX[id][chapter]+mix(table[index],table[index+1],cursor-index);
}

/** Local coordinates share one rigid transform, so they also support spatial audio. */
export function samplePrologueMotion(frame={}, {worldAvailable=true}={}){
  const b=prologueBlocking(frame),transition=prologueWorldTransition(frame,worldAvailable),p=b.progress,chapter=b.chapter;
  const inApproach=!!WALK[chapter],returning=!!frame.returning;
  if(transition.world){
    b.camera=approachPoint([0,EYE,-48]);b.travel=1;b.look=approachPoint([0,EYE,-56]);
    if(chapter==='rupture'&&!frame.reduced&&!returning){const turn=Math.sin(smooth(p/.48)*Math.PI)*1.5;b.look=approachPoint([-Math.sin(turn)*8,EYE,-48-Math.cos(turn)*8]);}
  }
  const speaker=String(frame.speaker||'').toLowerCase(),actors={};
  for(const id of IDS){
    const speaking=speaker.includes(id),turn=chapter==='walk'?smooth(p/.07):1;
    let position,mode='standing',moving=false,grounded=false,distance=0,phase=OFFSET[id]*Math.PI,stepOut=false,surface='hard',yaw=Math.PI;
    const segment=transition.world?'threshold':returning?'return':chapter==='rupture'?'threshold':'approach';
    if(inApproach||chapter==='rupture'||returning){
      const finalChapter=inApproach?chapter:'arrival',finalP=inApproach?p:1;
      const distanceP=transition.world?.16:finalP,distanceChapter=transition.world?'arrival':finalChapter;
      distance=walkDistance(id,distanceChapter,distanceP)+(id==='stanley'?RUN_DISTANCE:0);
      phase=((id==='stanley'?roadsideSteps(RUN_DISTANCE):id==='clarence'?1.75/STEP.clarence:0)+walkDistance(id,distanceChapter,distanceP)/STEP[id]+OFFSET[id])*Math.PI;
      position=transition.world?approachPoint(id==='mike'?[0,EYE,-48]:id==='clarence'?[-.58,0,-49.15]:[.58,0,-49.25]):pathPosition(id,finalChapter,finalP);
      moving=inApproach&&!transition.world&&p>0&&p<1&&!returning;
      grounded=!returning;mode=moving?'walk':id==='stanley'?'breathe':'standing';surface='soft';
      const travel=mix(...WALK[finalChapter],smooth(finalP)),cornerTurn=smooth((travel-.035)/.04);
      const startYaw=id==='stanley'?mix(Math.PI*2-.35,Math.PI,smooth(travel/.025)):Math.PI;
      yaw=mix(startYaw,Math.PI*1.5,cornerTurn)+(speaking?(id==='stanley'?1.5:-1.5)*cornerTurn:0);
    }else if(id==='mike'){
      position=[...b.camera];stepOut=b.exit>=.95;grounded=stepOut;mode=grounded?'standing':'seated';
    }else if(id==='clarence'){
      const ex=samplePrologueExit(b.exit*EXIT_SECONDS),after=chapter==='exit'?clamp(((frame.chapterTime??p*8)-EXIT_SECONDS)/ (1.75/1.35)):b.exit>=1?1:0;position=ex.driver.slice();if(ex.finished)position[2]=mix(-.35,-2.1,after);yaw=ex.driverYaw;
      stepOut=chapter==='exit'&&ex.finished;grounded=stepOut;moving=ex.finished&&after>0&&after<1;distance=after*1.75;mode=b.exit<=0?'drive':b.exit<1?'exit':moving?'walk':'standing';
      phase=ex.finished?(after*1.75/STEP.clarence+OFFSET.clarence)*Math.PI:clamp(b.exit)*Math.PI;
    }else{
      const roadside=sampleRoadsideConfrontation(frame);
      position=roadside?.position||(['exit','flashlight'].includes(chapter)?[2.1,0,-2.25]:[4.5,0,-7.5]);
      yaw=roadside?.yaw??-.35;moving=roadside?.moving||false;grounded=!!roadside||['exit','flashlight'].includes(chapter);mode=roadside?.mode||'breathe';
      distance=roadside?.travel??(grounded?RUN_DISTANCE:0);phase=(roadsideSteps(distance)+OFFSET[id])*Math.PI;
      surface='hard';
    }
    actors[id]={id,position,yaw,mode,moving,grounded,surface,distance,phase,contactIndex:Math.floor(phase/Math.PI+1e-9),segment,stepOut};
    const roadside=id==='stanley'?sampleRoadsideConfrontation(frame):null;if(roadside)Object.assign(actors[id],roadside);
    actors[id].gait=moving?1:0;actors[id].exitPose=mode==='exit'?samplePrologueExit(b.exit*EXIT_SECONDS):null;
    actors[id].support={time:Number(frame.time)||0,distance,phase,moving,grounded,stride:roadside?.mode==='run'?RUN_STEP:STEP[id],anchors:roadside?roadsideFootAnchors(roadside,OFFSET[id]):null,segment};
  }
  return {time:Number(frame.time)||0,chapter,returning,blocking:b,...transition,listener:{position:[...b.camera],yaw:Math.atan2(b.camera[0]-b.look[0],b.camera[2]-b.look[2])},actors};
}

/** Actual travel drives the interactive camera, gait and audio contact clock. */
export function sampleInteractivePrologueMotion(frame,escorts){
  const player=frame.player,chapter=frame.chapter,room=chapter==='redroom',exit=frame.exitProgress;
  const camera=[player.x,player.y,player.z],inCar=exit<.999;
  const actors={};
  for(const id of IDS){
    const a=id==='mike'?player:escorts[id],roadside=id==='stanley'?sampleRoadsideConfrontation(frame):null;
    const visibleGround=id==='mike'?(!inCar||(frame.exitPose?.plant||0)>.98):!!roadside||!inCar||(id==='clarence'&&(frame.exitPose?.plant||0)>.98);
    const phase=(id==='stanley'?roadsideSteps(Math.min(a.distance,ROADSIDE_DISTANCE))+Math.max(0,a.distance-ROADSIDE_DISTANCE)/STEP[id]+OFFSET[id]:a.distance/STEP[id]+OFFSET[id])*Math.PI;
    const seated=id==='clarence'&&exit===0;const exiting=id==='clarence'&&exit>0&&exit<1;
    const presentation=id!=='mike'&&!seated&&!exiting?a.presentation:null;
    actors[id]={id,position:[presentation?.x??a.x,id==='mike'?player.y:exiting?a.y:seated?-.38:0,presentation?.z??a.z],
      yaw:id==='mike'?player.yaw:exiting?a.exit.driverYaw:seated?Math.PI:Number.isFinite(presentation?.yaw)?presentation.yaw:Number.isFinite(a.yaw)?a.yaw:Math.PI,mode:seated?'drive':exiting?'exit':a.moving?'walk':'standing',
      exitPose:exiting?a.exit:null,runWeight:a.runBlend||0,gait:a.gait??(a.moving?1:0),
      moving:a.moving,grounded:visibleGround&&!room,surface:room||a.x>WEST_APPROACH.entranceX?'hard':'soft',distance:a.distance,phase,
      contactIndex:Math.floor(phase/Math.PI+1e-9),segment:room?'redroom':'outdoors',stepOut:(id==='mike'||id==='clarence')&&(frame.exitPose?.plant??exit)>=.98};
    if(roadside){Object.assign(actors[id],roadside);actors[id].phase=(roadsideSteps(roadside.travel)+OFFSET[id])*Math.PI;actors[id].contactIndex=Math.floor(actors[id].phase/Math.PI+1e-9);}
    actors[id].support={time:frame.elapsed,distance:actors[id].distance,phase:actors[id].phase,moving:actors[id].moving,grounded:actors[id].grounded,stride:id==='stanley'&&roadside?.mode==='run'?RUN_STEP:STEP[id],anchors:roadside?roadsideFootAnchors(roadside,OFFSET[id]):null,segment:actors[id].segment};
  }
  if(room)actors.mike.grounded=true;
  return {time:frame.elapsed,chapter,returning:false,world:false,cover:0,
    blocking:{camera,look:[player.x-Math.sin(player.yaw)*8,player.y,player.z-Math.cos(player.yaw)*8],exit,inCar,travel:clamp(approachDepth(camera)/48),menVisible:!room,chapter,progress:frame.chapterProgress},
    listener:{position:camera,yaw:player.yaw},actors};
}

/** Contact cursors own no clock, audio, or renderer. Pauses should call reset(). */
export function createPrologueContactTracker({maxGap=.5}={}){
  let previous=null;
  return {
    reset(){previous=null;},
    update(sample){
      const prior=previous;previous=sample;
      if(!prior||sample.time<=prior.time||sample.time-prior.time>maxGap||sample.returning)return [];
      const contacts=[];
      for(const id of IDS){
        const now=sample.actors[id],before=prior.actors[id];
        if(now.segment!==before.segment||!now.grounded)continue;
        const stepOut=now.stepOut&&!before.stepOut;
        const advance=now.contactIndex-before.contactIndex;
        if(!stepOut&&(!(now.moving||before.moving)||advance!==1))continue;
        contacts.push({actor:id,foot:stepOut?'left':now.contactIndex%2?'right':'left',position:[now.position[0],0,now.position[2]],surface:now.surface,mode:now.mode,stepOut});
      }
      return contacts;
    },
  };
}
