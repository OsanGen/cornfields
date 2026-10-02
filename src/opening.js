import {createIntro,INTRO} from './intro.js';
import {createPrologue,PROLOGUE} from './prologue.js';
import {PROLOGUE_VOICE_TIMING} from './prologue-voice-timing.js';

/** Isolated story actors and credits never advance the live hunt or weather. */
export function createOpening({onCue=()=>{},onIntroCue=()=>{},durations=PROLOGUE_VOICE_TIMING}={}){
  const story=createPrologue({onCue,durations}),titles=createIntro({onCue:onIntroCue});
  let phase='preflight',stage='prologue',replay=false,disposed=false,skipped=false;
  return {
    get phase(){return phase;},get stage(){return stage;},get active(){return phase!=='finished';},get replaying(){return replay;},get player(){return story.player;},
    begin({replay:isReplay=false}={}){
      if(disposed||phase==='playing'||(!isReplay&&phase!=='preflight'))return false;
      replay=isReplay;stage='prologue';skipped=false;story.begin();phase='playing';return true;
    },
    tick(dt,controls={}){
      if(disposed||phase!=='playing'||!Number.isFinite(dt)||dt<=0)return;
      // Carry only consumed story time across the credits boundary.
      if(stage==='prologue'){
        dt-=story.tick(dt,controls);
        if(story.phase==='finished'){stage='credits';titles.begin({replay:true});}
      }
      if(stage==='credits'&&dt>0){
        const used=Math.min(dt,INTRO.duration-titles.snapshot().time);
        titles.tick(used);dt-=used;
        if(titles.phase==='ready')phase='ready';
      }
    },
    pause(){if(phase==='playing'){phase='paused';story.pause();titles.pause();}},
    resume(){if(phase==='paused'){phase='playing';story.resume();titles.resume();}},
    skipStory(){if(!['playing','paused'].includes(phase)||stage!=='prologue')return;story.finish();stage='credits';titles.begin({replay:true});if(phase==='paused')titles.pause();},
    skip(){if(disposed||phase==='finished'||phase==='preflight')return;skipped=true;story.finish();titles.finish();phase='ready';},
    finish(){story.finish();titles.finish();phase='finished';},
    frame(reduced=false){
      if(stage==='credits')return {...titles.frame(reduced),stage,returning:false};
      const frame=story.frame(reduced);
      return {...frame,stage,shot:'prologue',label:'',name:'',opacity:0,accent:0};
    },
    snapshot(){return {phase,stage,replay,skipped,time:story.snapshot().time,story:story.snapshot(),credits:titles.snapshot(),duration:(story.snapshot().duration||PROLOGUE.duration)+INTRO.duration};},
    dispose(){disposed=true;story.dispose?.();titles.dispose();phase='finished';},
  };
}
