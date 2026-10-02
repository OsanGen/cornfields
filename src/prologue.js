import {PROLOGUE,PROLOGUE_FOLLOW_LINES,createPrologueTimeline} from './prologue-script.js';
import {sampleInteractivePrologueMotion} from './prologue-motion.js';
import {GAME_CONFIG} from './game-config.js';
import {samplePrologueDriving} from './prologue-driving.js';
export {PROLOGUE,PROLOGUE_CHAPTERS,PROLOGUE_LINES,createPrologueTimeline} from './prologue-script.js';

const clamp=value=>Math.max(0,Math.min(1,value));
const smooth=value=>{const t=clamp(value);return t*t*(3-2*t);};
const defaultTimeline=createPrologueTimeline();

/** Sampled dialogue survives slow frames; it is never a disposable sound cue. */
export function prologueFrame(seconds,{reduced=false,timeline,durations}={}){
  const script=timeline||(durations?createPrologueTimeline({durations}):defaultTimeline);
  const time=Number.isFinite(seconds)?Math.max(0,Math.min(script.duration,seconds)):0;
  const chapter=script.chapters.find(chapter=>time<chapter.end)||script.chapters.at(-1);
  const current=script.lines.find(line=>time>=line.start&&time<line.end)||null;
  const subtitle=current?.subtitles.find(chunk=>time>=chunk.start&&time<chunk.end);
  const rupture=script.chapters.find(chapter=>chapter.id==='rupture'),crash=script.cues.find(([id])=>id==='crash')[1];
  const frame={
    time,chapter:chapter.id,chapterTime:time-chapter.start,chapterProgress:clamp((time-chapter.start)/(chapter.end-chapter.start)),
    speaker:current?.speaker||'',spoken:subtitle?.text||'',line:current,nextLine:current?null:script.lines.find(line=>line.start>time)||null,
    red:smooth((time-crash)/(reduced?1.5:.8)),mist:smooth((time-(crash+2))/Math.max(1,rupture.end-crash-4)),
    reduced,returning:false,returnTime:0,
  };
  frame.driving=samplePrologueDriving(frame,{timeline:script});
  return frame;
}

export function createPrologue({onCue=()=>{},durations={},timeline}={}){
  const script=timeline||createPrologueTimeline({durations});
  let phase='preflight',time=0,elapsed=0,disposed=false,skipped=false,exited=false,outdoor=null;
  let separationTime=0,lastCall=-Infinity,callCount=0,follow=null,held=false,chapterId='car';
  const player={},escorts={clarence:{},stanley:{}};
  const reset=()=>{
    Object.assign(player,{x:.5,y:1.13,z:.35,yaw:0,pitch:0,flashlightOn:false,distance:0,moving:false,looked:false});
    Object.assign(escorts.clarence,{x:-.45,z:.09,distance:0,moving:false});
    Object.assign(escorts.stanley,{x:4.5,z:-7.5,distance:0,moving:false});
  };
  reset();
  const fired=new Set(),dropped=new Set();
  const emergenceEnd=script.chapters.find(c=>c.id==='emergence').end;
  const chapter=()=>script.chapters.find(c=>time<c.end-1e-8)||script.chapters.at(-1);
  const walking=new Set(['walk','history','return_walk','disappearance','arrival']);
  const vision=new Set(['undead','redroom','liquid']);
  function moveActor(actor,x,z,dt,speed){
    const distance=Math.hypot(x-actor.x,z-actor.z),amount=Math.min(distance,speed*dt);
    actor.moving=amount>.00001;
    if(distance){actor.x+=(x-actor.x)*amount/distance;actor.z+=(z-actor.z)*amount/distance;actor.distance+=amount;}
  }
  function enterChapter(c){
    if(c.id!==chapterId){
      if(c.id==='redroom'){
        outdoor={...player};Object.assign(player,{x:0,y:GAME_CONFIG.player.eyeHeight,z:2,yaw:0,pitch:0,moving:false});
      }else if(chapterId==='redroom'&&outdoor){Object.assign(player,outdoor,{moving:false});outdoor=null;}
      chapterId=c.id;
    }
  }
  function update(dt,controls){
    const c=chapter();enterChapter(c);
    if(controls.lookDelta>0||Number.isFinite(controls.yaw)&&Math.abs(controls.yaw-player.yaw)>.001||Number.isFinite(controls.pitch)&&Math.abs(controls.pitch-player.pitch)>.001)player.looked=true;
    if(Number.isFinite(controls.yaw))player.yaw=controls.yaw;
    if(Number.isFinite(controls.pitch))player.pitch=Math.max(-1.25,Math.min(1.25,controls.pitch));
    if(!exited&&time>=emergenceEnd-1e-8&&controls.interact)exited=true;
    const exit=c.id==='exit'?clamp((time-c.start)/.85):exited?1:0;
    if(exited&&exit<1){player.x=.5+1.35*smooth(exit);player.z=.35-.7*smooth(exit);player.y=1.13+(GAME_CONFIG.player.eyeHeight-1.13)*smooth(exit);}
    const movable=exited&&exit>=1&&c.id!=='rupture';
    if(exited&&controls.flashlight)player.flashlightOn=!player.flashlightOn;
    player.moving=false;
    if(movable){
      player.y=GAME_CONFIG.player.eyeHeight;
      const forward=Number(controls.forward)||0,strafe=Number(controls.strafe)||0,n=Math.max(1,Math.hypot(forward,strafe));
      const speed=GAME_CONFIG.player.moveSpeed*dt/n;
      const x=player.x+(-Math.sin(player.yaw)*forward+Math.cos(player.yaw)*strafe)*speed;
      const z=player.z+(-Math.cos(player.yaw)*forward-Math.sin(player.yaw)*strafe)*speed;
      const room=c.id==='redroom',nx=Math.max(room?-2.75:-10,Math.min(room?2.75:10,x)),nz=Math.max(room?-4.35:-55,Math.min(room?3.5:7,z));
      // The cruiser remains a solid prop once outside. The route itself is open.
      const clear=(x,z)=>room||Math.abs(x)>1.02||z< -2.85||z>2.85;
      const sx=clear(nx,player.z)?nx:player.x,sz=clear(sx,nz)?nz:player.z;
      const distance=Math.hypot(sx-player.x,sz-player.z);player.distance+=distance;player.moving=distance>.00001;player.x=sx;player.z=sz;
    }
    for(const actor of Object.values(escorts))actor.moving=false;
    if(c.id==='emergence')moveActor(escorts.stanley,2.1,-2.25,dt,2.7);
    if(c.id==='emergence'&&time-c.start>.65)moveActor(escorts.clarence,-1.45,-2.1,dt,1.5);
    if(exited&&['exit','flashlight'].includes(c.id))moveActor(escorts.clarence,-.84,-2.1,dt,2);
    const distance=Math.hypot(player.x-(escorts.clarence.x+escorts.stanley.x)/2,player.z-(escorts.clarence.z+escorts.stanley.z)/2);
    if(walking.has(c.id)){
      separationTime=distance>8?separationTime+dt:0;
      const away=distance>8&&separationTime>=2;
      const line=script.lines.find(l=>time>=l.start&&time<l.end);
      // Complete an intelligible sentence before pausing the conversation.
      held=away&&!line||!!follow;
      if(held&&!follow&&elapsed-lastCall>=8){
        const index=callCount===0?0:distance>14||separationTime>12?(callCount%2?1:2):0;
        const raw=PROLOGUE_FOLLOW_LINES[index],duration=Math.max(raw.end,Number(durations[raw.id]?.duration||durations[raw.id])||0);
        follow={...raw,start:elapsed,end:elapsed+duration,subtitles:[{text:raw.text,start:elapsed,end:elapsed+duration}]};lastCall=elapsed;callCount++;
      }
      if(!away&&!follow)held=false;
      if(distance<8&&!follow){
        const z=Math.max(-49.3,escorts.stanley.z-.65*dt);
        moveActor(escorts.stanley,.48,z,dt,.8);
        moveActor(escorts.clarence,-.72,z+1.4,dt,.8);
      }
    }else{held=false;if(!vision.has(c.id))separationTime=0;}
    if(follow&&elapsed>=follow.end){follow=null;held=distance>8;}
    elapsed+=dt;
    const waiting=!exited&&time>=emergenceEnd-1e-8;
    if(!waiting&&!held){
      const previous=time;time=Math.min(c.end,time+dt);
      if(c.end-time<1e-8)time=c.end;
      for(const [id,at] of script.cues)if(previous<=at&&time>=at&&!fired.has(id)){fired.add(id);onCue(id);}
      enterChapter(chapter());
    }
    if(time>=script.duration-1e-8){time=script.duration;phase='finished';}
  }
  return {
    get phase(){return phase;},get active(){return phase!=='finished';},get player(){return player;},
    begin(){
      if(disposed||!['preflight','finished'].includes(phase))return false;
      time=0;elapsed=0;skipped=false;exited=false;outdoor=null;held=false;follow=null;separationTime=0;lastCall=-Infinity;callCount=0;chapterId='car';reset();fired.clear();dropped.clear();phase='playing';return true;
    },
    tick(dt,controls={}){
      if(disposed||phase!=='playing'||!Number.isFinite(dt)||dt<=0)return 0;
      let used=0;
      while(used<dt-1e-8&&phase==='playing'){
        const step=Math.min(.05,dt-used,Math.max(1e-6,chapter().end-time));
        update(step,controls);used+=step;
        controls={...controls,interact:false,flashlight:false};
      }
      return used;
    },
    pause(){if(phase!=='playing')return false;phase='paused';return true;},
    resume(){if(disposed||phase!=='paused')return false;phase='playing';return true;},
    finish(){if(disposed)return false;time=script.duration;phase='finished';return true;},
    skip(){if(disposed||phase==='finished')return false;skipped=true;time=script.duration;phase='finished';return true;},
    frame(reduced=false){
      const frame=prologueFrame(time,{reduced,timeline:script});
      frame.player={...player};frame.elapsed=elapsed;frame.exitProgress=exited?(frame.chapter==='exit'?clamp(frame.chapterTime/.85):1):0;
      frame.waitingForExit=!exited&&time>=emergenceEnd-1e-8;
      if(frame.waitingForExit){frame.chapter='emergence';frame.spoken='';frame.line=null;}
      if(follow){Object.assign(frame,{time:elapsed,line:follow,nextLine:null,spoken:follow.text,speaker:follow.speaker});}
      frame.storyTime=time;frame.followHeld=held;frame.canMove=exited&&frame.exitProgress>=1&&frame.chapter!=='rupture';
      frame.motion=sampleInteractivePrologueMotion(frame,escorts);
      if(phase==='paused'){frame.spoken='';frame.speaker='';}
      return frame;
    },
    snapshot(){return {phase,time,elapsed,delaySeconds:Math.max(0,elapsed-time),duration:script.duration,skipped,chapter:chapterId,player:{...player},escorts:structuredClone(escorts),waitingForExit:!exited&&time>=emergenceEnd-1e-8,followHeld:held,followCalls:callCount,fired:[...fired],dropped:[...dropped]};},
    dispose(){disposed=true;phase='finished';fired.clear();dropped.clear();},
  };
}
