import {createIntro,INTRO} from './intro.js';
import {createPrologue,PROLOGUE} from './prologue.js';
import {PROLOGUE_VOICE_TIMING} from './prologue-voice-timing.js';

/** One presentation clock. It never mutates the hunt, weather or player. */
export function createOpening({onCue=()=>{},onIntroCue=()=>{},durations=PROLOGUE_VOICE_TIMING}={}){
  const story=createPrologue({onCue,durations}),titles=createIntro({onCue:onIntroCue});
  let phase='preflight',stage='prologue',returnTime=0,replay=false,disposed=false;
  const returnDuration=4;
  return {
    get phase(){return phase;},get stage(){return stage;},get active(){return phase!=='finished';},get replaying(){return replay;},
    begin({replay:isReplay=false}={}){
      if(disposed||phase==='playing'||(!isReplay&&phase!=='preflight'))return false;
      replay=isReplay;stage='prologue';returnTime=0;story.begin();phase='playing';return true;
    },
    tick(dt){
      if(disposed||phase!=='playing'||!Number.isFinite(dt)||dt<=0)return;
      // Carry the remainder across at most three stages, including manual QA seeks.
      if(stage==='prologue'){
        const state=story.snapshot(),used=Math.min(dt,state.duration-state.time);
        story.tick(used);dt-=used;
        if(story.phase==='finished'){stage='credits';titles.begin({replay:true});}
      }
      if(stage==='credits'&&dt>0){
        const used=Math.min(dt,INTRO.duration-titles.snapshot().time);
        titles.tick(used);dt-=used;
        if(titles.phase==='ready'){stage='return';returnTime=0;}
      }
      if(stage==='return'&&dt>0){returnTime=Math.min(returnDuration,returnTime+dt);if(returnTime===returnDuration)phase='ready';}
    },
    pause(){if(phase==='playing'){phase='paused';story.pause();titles.pause();}},
    resume(){if(phase==='paused'){phase='playing';story.resume();titles.resume();}},
    skipStory(){if(!['playing','paused'].includes(phase)||stage!=='prologue')return;story.finish();stage='credits';titles.begin({replay:true});if(phase==='paused')titles.pause();},
    skip(){if(disposed||phase==='finished'||phase==='preflight'||stage==='return')return;story.finish();titles.finish();stage='return';returnTime=0;},
    finish(){story.finish();titles.finish();phase='finished';},
    frame(reduced=false){
      if(stage==='credits')return {...titles.frame(reduced),stage,returning:false};
      const frame=story.frame(reduced);
      return {...frame,stage,shot:stage==='return'?'return':'prologue',label:'',name:'',opacity:0,accent:0,
        returning:stage==='return',returnTime,red:stage==='return'?Math.max(0,1-returnTime/3):frame.red,
        mist:stage==='return'?Math.max(0,1-returnTime/2.8):frame.mist};
    },
    snapshot(){return {phase,stage,replay,returnTime,time:story.snapshot().time,story:story.snapshot(),credits:titles.snapshot(),duration:(story.snapshot().duration||PROLOGUE.duration)+INTRO.duration+returnDuration};},
    dispose(){disposed=true;story.dispose?.();titles.dispose();phase='finished';},
  };
}
