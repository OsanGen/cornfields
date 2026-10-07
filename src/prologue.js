import {sampleRealismSequence,POST_TITLE_CHAPTERS} from './prologue-return-sequence.js';
import {sampleRoomTransition} from './prologue-liquid-transition.js';
import {samplePrologueWake} from './prologue-performance.js';
import {WEST_APPROACH,approachWaypoint,approachLateral,clampApproachPosition,approachYaw} from './prologue-layout.js';
import {EXIT_SECONDS,samplePrologueExit} from './prologue-performance.js';
import {PROLOGUE,PROLOGUE_FOLLOW_LINES,createPrologueTimeline} from './prologue-script.js';
import {sampleInteractivePrologueMotion} from './prologue-motion.js';
import {GAME_CONFIG} from './game-config.js';
import {samplePrologueDriving} from './prologue-driving.js';
import {sampleRoadsideConfrontation} from './prologue-confrontation.js';
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
    radioOffAt:script.cues.find(([id])=>id==='entertainment_off')[1]-script.chapters.find(c=>c.id==='car').start,
    reduced,returning:false,returnTime:0,
  };
  frame.sequence=sampleRealismSequence(frame);
  if(frame.sequence.afterTitles){frame.red=0;frame.mist=0;}
  frame.wake=samplePrologueWake(frame);frame.transfer=sampleRoomTransition(frame);
  frame.driving=samplePrologueDriving(frame,{timeline:script});
  return frame;
}

export function createPrologue({onCue=()=>{},durations={},timeline}={}){
  const script=timeline||createPrologueTimeline({durations});
  let phase='preflight',time=0,elapsed=0,disposed=false,skipped=false,exited=false,outdoor=null,inRoom=false;
  let separationTime=0,lastCall=-Infinity,callCount=0,follow=null,held=false,chapterId='car';
  const player={},escorts={clarence:{},stanley:{}};
  const reset=()=>{
    Object.assign(player,{x:.5,y:1.13,z:.35,yaw:0,pitch:0,flashlightOn:false,distance:0,moving:false,looked:false});
    Object.assign(escorts.clarence,{westReady:false,yaw:Math.PI,x:-.45,y:-.38,z:.09,distance:0,moving:false,exit:null,gait:0,runBlend:0,phaseOffset:0,presentation:null});
    Object.assign(escorts.stanley,{westReady:false,yaw:-.35,x:4.5,y:0,z:-7.5,distance:0,moving:false,gait:0,runBlend:0,phaseOffset:0,presentation:null});
  };
  reset();
  const fired=new Set(),dropped=new Set();
  const cabinEnd=script.chapters.find(c=>c.id==='cabin').end;
  const chapter=()=>script.chapters.find(c=>time<c.end-1e-8)||script.chapters.at(-1);
  const walking=new Set(['walk','history','disappearance','arrival']);
  const vision=new Set(['undead','redroom','liquid']);
  // Presentation smoothing leaves gameplay routes, cumulative travel and the audio
  // phase untouched. Two critically damped channels blend acceleration and stops;
  // angular interpolation always takes the short arc through a corner.
  function blendEscortPose(actor,dt,authored=false){
    if(authored||!actor.presentation){actor.presentation={x:actor.x,z:actor.z,yaw:actor.yaw,vx:0,vz:0,turnVelocity:0};return;}
    const p=actor.presentation,omega=22,decay=Math.exp(-omega*dt);
    for(const [axis,velocity]of [['x','vx'],['z','vz']]){
      const error=p[axis]-actor[axis],change=(p[velocity]+omega*error)*dt;
      p[axis]=actor[axis]+(error+change)*decay;p[velocity]=(p[velocity]-omega*change)*decay;
      if(Math.abs(p[axis]-actor[axis])<.000001&&Math.abs(p[velocity])<.00001){p[axis]=actor[axis];p[velocity]=0;}
    }
    const angle=Math.atan2(Math.sin(actor.yaw-p.yaw),Math.cos(actor.yaw-p.yaw));
    const wanted=Math.sign(angle)*Math.min(2.8,Math.sqrt(20*Math.abs(angle)));
    p.turnVelocity=(p.turnVelocity||0)+Math.max(-10*dt,Math.min(10*dt,wanted-(p.turnVelocity||0)));
    const turn=p.turnVelocity*dt;
    p.yaw+=Math.sign(turn)===Math.sign(angle)&&Math.abs(turn)>Math.abs(angle)?angle:turn;
  }
  function moveActor(actor,x,z,dt,speed){
    const distance=Math.hypot(x-actor.x,z-actor.z),amount=Math.min(distance,speed*dt);
    actor.moving=amount>.00001;
    if(distance){actor.yaw=Math.atan2(x-actor.x,z-actor.z);actor.x+=(x-actor.x)*amount/distance;actor.z+=(z-actor.z)*amount/distance;actor.distance+=amount;}
  }
  function enterChapter(c){
    if(c.id!==chapterId){
      if(c.id==='solid_return'){Object.assign(player,{x:WEST_APPROACH.thresholdX,y:GAME_CONFIG.player.eyeHeight,z:WEST_APPROACH.centerZ,yaw:Math.PI/2,pitch:0,moving:false});}
      if(c.id==='redroom'){
        outdoor={...player};inRoom=false;
      }else if(chapterId==='redroom'&&outdoor){Object.assign(player,outdoor,{moving:false});outdoor=null;inRoom=false;}
      chapterId=c.id;
    }
  }
  function update(dt,controls){
    const c=chapter();enterChapter(c);
    const transfer=sampleRoomTransition({chapter:c.id,chapterTime:time-c.start});
    if(c.id==='redroom'&&transfer.room!==inRoom){inRoom=transfer.room;if(inRoom)Object.assign(player,{x:0,y:GAME_CONFIG.player.eyeHeight,z:2,yaw:0,pitch:0,moving:false});else if(outdoor)Object.assign(player,outdoor,{moving:false});}
    if(controls.lookDelta>0||Number.isFinite(controls.yaw)&&Math.abs(controls.yaw-player.yaw)>.001||Number.isFinite(controls.pitch)&&Math.abs(controls.pitch-player.pitch)>.001)player.looked=true;
    if(Number.isFinite(controls.yaw)&&(!POST_TITLE_CHAPTERS.includes(c.id)||c.id==='redroom')&&c.id!=='rupture')player.yaw=controls.yaw;
    if(Number.isFinite(controls.pitch)&&(!POST_TITLE_CHAPTERS.includes(c.id)||c.id==='redroom')&&c.id!=='rupture')player.pitch=Math.max(-1.25,Math.min(1.25,controls.pitch));
    if(!exited&&time>=cabinEnd-1e-8&&controls.interact){
      exited=true;fired.add('door_open');onCue('door_open');
    }
    const exit=c.id==='exit'?clamp((time-c.start)/EXIT_SECONDS):exited?1:0;
    if(exited&&exit<1){const pose=samplePrologueExit(exit*EXIT_SECONDS);[player.x,player.y,player.z]=pose.position;}
    const cinematic=c.id==='rupture'||POST_TITLE_CHAPTERS.includes(c.id)&&c.id!=='redroom';
    const movable=exited&&exit>=1&&!cinematic&&(c.id!=='redroom'||transfer.cover===0&&transfer.room);
    if(exited&&!cinematic&&controls.flashlight)player.flashlightOn=!player.flashlightOn;
    player.moving=false;
    if(movable){
      player.y=GAME_CONFIG.player.eyeHeight;
      const forward=Number(controls.forward)||0,strafe=Number(controls.strafe)||0,n=Math.max(1,Math.hypot(forward,strafe));
      const speed=GAME_CONFIG.player.moveSpeed*dt/n;
      const x=player.x+(-Math.sin(player.yaw)*forward+Math.cos(player.yaw)*strafe)*speed;
      const z=player.z+(-Math.cos(player.yaw)*forward-Math.sin(player.yaw)*strafe)*speed;
      const room=inRoom,[nx,nz]=room?[Math.max(-2.75,Math.min(2.75,x)),Math.max(-4.35,Math.min(3.5,z))]:clampApproachPosition(x,z);
      // The cruiser remains a solid prop once outside. The route itself is open.
      const clear=(x,z)=>room||Math.abs(x)>1.02||z< -2.85||z>2.85;
      const sx=clear(nx,player.z)?nx:player.x,sz=clear(sx,nz)?nz:player.z;
      const distance=Math.hypot(sx-player.x,sz-player.z);player.distance+=distance;player.moving=distance>.00001;player.x=sx;player.z=sz;
    }
    for(const actor of Object.values(escorts))actor.moving=false;
    // Roadside Stanley is sampled from the same authored motion as his hands.
    // Clarence stays seated until Mike accepts the exit action.
    const roadside=sampleRoadsideConfrontation({chapter:c.id,chapterTime:time-c.start,chapterProgress:clamp((time-c.start)/(c.end-c.start))});
    if(roadside){
      const a=escorts.stanley;const distance=Math.hypot(roadside.position[0]-a.x,roadside.position[2]-a.z);
      a.distance=roadside.travel;a.x=roadside.position[0];a.z=roadside.position[2];a.yaw=roadside.yaw;a.moving=roadside.moving&&distance>.00001;
    }
    if(exited&&c.id==='exit'){const pose=samplePrologueExit(exit*EXIT_SECONDS),a=escorts.clarence;if(exit<1){[a.x,a.y,a.z]=pose.driver;a.exit=pose;a.moving=false;}else{a.y=0;a.exit=null;moveActor(a,-1.30,-2.1,dt,1.35);}}
    if(exited&&c.id==='flashlight'){escorts.clarence.y=0;escorts.clarence.exit=null;moveActor(escorts.clarence,-1.30,-2.1,dt,1.35);}
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
        const s=escorts.stanley,cl=escorts.clarence;
        for(const [id,a]of Object.entries(escorts)){
          const corner=approachWaypoint(id),lane=WEST_APPROACH.centerZ-approachLateral(id);
          if(!a.westReady&&a.z>lane+.02){moveActor(a,corner[0],lane,dt,.8);continue;}
          a.westReady=true;
          const target=id==='stanley'?Math.max(-49.3,a.x-.65*dt):Math.min(a.x,s.x+1.4);
          moveActor(a,target,lane,dt,.8);
        }
      }
    }else{held=false;if(!vision.has(c.id))separationTime=0;}
    if(follow&&elapsed>=follow.end){follow=null;held=distance>8;}
    for(const [id,a]of Object.entries(escorts)){blendEscortPose(a,dt,!!(id==='stanley'&&roadside)||!exited||exit<1);a.gait=Math.max(0,Math.min(1,(a.gait||0)+(a.moving?1:-1)*dt/.28));a.runBlend=Math.max(0,Math.min(1,(a.runBlend||0)+(id==='stanley'&&roadside?.mode==='run'?1:-1)*dt/.28));}
    elapsed+=dt;
    const waiting=!exited&&time>=cabinEnd-1e-8;
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
      time=0;elapsed=0;skipped=false;exited=false;outdoor=null;inRoom=false;held=false;follow=null;separationTime=0;lastCall=-Infinity;callCount=0;chapterId='car';reset();fired.clear();dropped.clear();phase='playing';return true;
    },
    tick(dt,controls={},stopAt=script.duration){
      if(disposed||phase!=='playing'||!Number.isFinite(dt)||dt<=0)return 0;
      let used=0;
      while(used<dt-1e-8&&phase==='playing'&&time<stopAt-1e-8){
        const step=Math.min(.05,dt-used,Math.max(1e-6,chapter().end-time),Math.max(0,stopAt-time));
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
      frame.player={...player};frame.elapsed=elapsed;frame.exitProgress=exited?(frame.chapter==='exit'?clamp(frame.chapterTime/EXIT_SECONDS):1):0;
      frame.waitingForExit=!exited&&time>=cabinEnd-1e-8;
      if(frame.waitingForExit){frame.chapter='cabin';frame.chapterTime=script.chapters.find(c=>c.id==='cabin').end-script.chapters.find(c=>c.id==='cabin').start;frame.chapterProgress=1;frame.spoken='';frame.line=null;}
      if(follow){Object.assign(frame,{time:elapsed,line:follow,nextLine:null,spoken:follow.text,speaker:follow.speaker});}
      frame.exitPose=exited?samplePrologueExit(frame.exitProgress*EXIT_SECONDS):null;frame.storyTime=time;frame.followHeld=held;frame.canMove=exited&&frame.exitProgress>=1&&!frame.sequence.freeze&&(frame.chapter!=='redroom'||frame.transfer.cover===0&&frame.transfer.room);
      frame.sequence=sampleRealismSequence(frame);
      frame.motion=sampleInteractivePrologueMotion(frame,escorts);
      if(frame.chapter==='redroom')frame.motion.blocking.menVisible=!frame.transfer.room;
      if(phase==='paused'){frame.spoken='';frame.speaker='';}
      return frame;
    },
    snapshot(){return {phase,time,elapsed,delaySeconds:Math.max(0,elapsed-time),duration:script.duration,skipped,chapter:chapterId,player:{...player},escorts:structuredClone(escorts),waitingForExit:!exited&&time>=cabinEnd-1e-8,followHeld:held,followCalls:callCount,fired:[...fired],dropped:[...dropped]};},
    dispose(){disposed=true;phase='finished';fired.clear();dropped.clear();},
  };
}
