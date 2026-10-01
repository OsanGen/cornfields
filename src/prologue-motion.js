import {GAME_CONFIG} from './game-config.js';

const clamp=value=>Math.max(0,Math.min(1,Number(value)||0));
const smooth=value=>{const t=clamp(value);return t*t*(3-2*t);};
const mix=(a,b,t)=>a+(b-a)*t;
const WALK={walk:[0,.27],history:[.27,.62],disappearance:[.62,.84],arrival:[.84,1]};
const CHAPTERS=Object.keys(WALK),IDS=['mike','clarence','stanley'],EYE=GAME_CONFIG.player.eyeHeight;
const STEP={mike:.50,clarence:.45,stanley:.48},OFFSET={mike:0,clarence:.37,stanley:.73};
const RUN_DISTANCE=Math.hypot(4.5-2.1,7.5-2.25),RUN_STEP=.85;

export function prologueWorldTransition(frame={},available=false){
  const p=clamp(frame.chapterProgress),arrival=frame.chapter==='arrival';
  return {world:available&&(!!frame.returning||frame.chapter==='rupture'||arrival&&p>=.16),
    cover:available&&arrival&&!frame.returning?(p<.16?smooth(p/.13):1-smooth((p-.22)/.18)):0};
}

export function prologueBlocking(frame={}){
  const chapter=frame.chapter||'car',p=clamp(frame.chapterProgress),t=Number(frame.time)||0;
  const returning=!!frame.returning,walk=WALK[chapter];
  const travel=returning||chapter==='rupture'?1:walk?mix(...walk,smooth(p)):0;
  const exit=chapter==='emergence'?smooth((p-.65)/.3):walk||chapter==='rupture'||returning?1:0;
  const camera=[mix(.50,1.85,exit),mix(1.13,EYE,exit),mix(.35,-.35,exit)];
  const look=[mix(-.08,2.2,exit),mix(1.12,1.5,exit),mix(-8,-3.1,exit)];
  if(walk||chapter==='rupture'||returning){camera[0]=1.85*(1-smooth(travel*3));camera[1]=EYE;camera[2]=mix(-.35,-48,travel);look[0]=0;look[1]=EYE;look[2]=camera[2]-8;}
  if(chapter==='car'||chapter==='dispatch'){
    const speaking=String(frame.speaker||'').toLowerCase().includes('clarence');
    const glance=chapter==='car'?(speaking?.86:.5+.5*Math.sin(t*.095)):.28;
    look[0]=mix(-.08,-4.8,glance*.78);look[2]=-3.8;
  }
  if(chapter==='emergence'){look[0]=mix(.2,2.2,smooth(p*3));look[2]=mix(-6,-2.2,smooth(p*3));}
  if(chapter==='rupture'&&!frame.reduced){const turn=Math.sin(smooth(p/.48)*Math.PI)*1.5;look[0]=-Math.sin(turn)*8;look[2]=camera[2]-Math.cos(turn)*8;}
  if(returning){look[0]=0;look[1]=EYE;look[2]=-56;}
  return {camera,look,exit,travel,inCar:exit<.999&&!walk&&chapter!=='rupture'&&!returning,
    menVisible:!returning&&!(chapter==='rupture'&&clamp(frame.mist)>.86),chapter,progress:p};
}

function pathPosition(id,chapter,p){
  const travel=mix(...WALK[chapter],smooth(p)),z=mix(-.35,-48,travel),turn=chapter==='walk'?smooth(p/.07):1;
  if(id==='mike')return [1.85*(1-smooth(travel*3)),EYE,z];
  if(id==='clarence')return [mix(-.84,-.72,turn),0,z-mix(1.75,1.85,turn)];
  return [mix(2.1,.48,turn),0,z-mix(1.9,3.25,turn)];
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
    b.camera=[0,EYE,-48];b.travel=1;b.look=[0,EYE,-56];
    if(chapter==='rupture'&&!frame.reduced&&!returning){const turn=Math.sin(smooth(p/.48)*Math.PI)*1.5;b.look=[-Math.sin(turn)*8,EYE,-48-Math.cos(turn)*8];}
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
      phase=((id==='stanley'?RUN_DISTANCE/RUN_STEP:id==='clarence'?1:0)+walkDistance(id,distanceChapter,distanceP)/STEP[id]+OFFSET[id])*Math.PI;
      position=transition.world?(id==='mike'?[0,EYE,-48]:id==='clarence'?[-.58,0,-49.15]:[.58,0,-49.25]):pathPosition(id,finalChapter,finalP);
      moving=inApproach&&!transition.world&&p>0&&p<1&&!returning;
      grounded=!returning;mode=moving?'walk':id==='stanley'?'breathe':'standing';surface='soft';
      yaw=id==='stanley'?mix(-.35,Math.PI+(speaking?1.5:0),turn):Math.PI-(speaking?1.5:0);
    }else if(id==='mike'){
      position=[...b.camera];stepOut=chapter==='emergence'&&b.exit>=.95;grounded=stepOut;mode=grounded?'standing':'seated';
    }else if(id==='clarence'){
      const step=smooth((b.exit-.15)/.85);position=[mix(-.45,-.84,step),mix(-.38,0,step),mix(.09,-2.1,step)];
      stepOut=chapter==='emergence'&&step>=.98;grounded=stepOut;mode=step<.15?'drive':step<1?'walk':'standing';
      // The exit is one authored landing contact, not a walking treadmill.
      phase=clamp(step/.98)*Math.PI;
    }else{
      const emerge=chapter==='emergence'?smooth(p/.34):0;
      position=[mix(4.5,2.1,emerge),0,mix(-7.5,-2.25,emerge)];yaw=mix(-1.5,-.35,emerge);
      distance=RUN_DISTANCE*emerge;phase=(distance/RUN_STEP+OFFSET[id])*Math.PI;
      moving=chapter==='emergence'&&p>0&&p<.34;grounded=chapter==='emergence';mode=moving?'run':'breathe';
      surface=emerge<.72?'soft':'hard';
    }
    actors[id]={id,position,yaw,mode,moving,grounded,surface,distance,phase,contactIndex:Math.floor(phase/Math.PI+1e-9),segment,stepOut};
  }
  return {time:Number(frame.time)||0,chapter,returning,blocking:b,...transition,listener:{position:[...b.camera],yaw:Math.atan2(b.camera[0]-b.look[0],b.camera[2]-b.look[2])},actors};
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
