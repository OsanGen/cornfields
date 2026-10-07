import {ease} from './prologue-performance.js';
import {createIntro,INTRO} from './intro.js';
import {createPrologue,PROLOGUE} from './prologue.js';
import {createPrologueTimeline} from './prologue-script.js';
import {PROLOGUE_VOICE_TIMING} from './prologue-voice-timing.js';

/** Isolated story actors and credits never advance the live hunt or weather. */
export function createOpening({onCue=()=>{},onIntroCue=()=>{},durations=PROLOGUE_VOICE_TIMING}={}){
  const timeline=createPrologueTimeline({durations}),titlesAt=timeline.chapters.find(c=>c.id==='solid_return').start;
  const story=createPrologue({onCue,durations,timeline}),titles=createIntro({onCue:onIntroCue});
  let phase='preflight',stage='prologue',replay=false,disposed=false,skipped=false,titlesPlayed=false,storySkipped=false;
  return {
    get phase(){return phase;},get stage(){return stage;},get active(){return phase!=='finished';},get replaying(){return replay;},get player(){return story.player;},
    begin({replay:isReplay=false}={}){
      if(disposed||phase==='playing'||(!isReplay&&phase!=='preflight'))return false;
      replay=isReplay;stage='prologue';skipped=false;titlesPlayed=false;storySkipped=false;story.begin();phase='playing';return true;
    },
    tick(dt,controls={}){
      if(disposed||phase!=='playing'||!Number.isFinite(dt)||dt<=0)return;
      // One story cursor stops exactly at full liquid coverage. Titles have
      // their existing 20-second clock, then the same story continues.
      while(dt>1e-8&&phase==='playing'){
        if(stage==='prologue'){
          const stop=titlesPlayed?timeline.duration:titlesAt;
          const used=story.tick(dt,controls,stop);dt-=used;
          if(!titlesPlayed&&story.snapshot().time>=titlesAt-1e-8){stage='credits';titles.begin({replay:true});}
          else if(story.phase==='finished')phase='ready';
          else if(used<=0)break;
        }else{
          const used=Math.min(dt,INTRO.duration-titles.snapshot().time);titles.tick(used);dt-=used;
          if(titles.phase==='ready'){
            titlesPlayed=true;
            if(storySkipped)phase='ready';else stage='prologue';
          }else if(used<=0)break;
        }
      }
    },
    pause(){if(phase==='playing'){phase='paused';story.pause();titles.pause();}},
    resume(){if(phase==='paused'){phase='playing';story.resume();titles.resume();}},
    skipStory(){if(!['playing','paused'].includes(phase)||stage!=='prologue')return;storySkipped=true;story.finish();if(titlesPlayed){phase='ready';return;}stage='credits';titles.begin({replay:true});if(phase==='paused')titles.pause();},
    skip(){if(disposed||phase==='finished'||phase==='preflight')return;skipped=true;story.finish();titles.finish();phase='ready';},
    finish(){story.finish();titles.finish();phase='finished';},
    frame(reduced=false){
      if(stage==='credits'){const frame=titles.frame(reduced),handoffFade=ease(frame.time,19.65,20);return {...frame,opacity:frame.opacity*(1-handoffFade),handoffFade,stage,returning:false};}
      const frame=story.frame(reduced);
      return {...frame,stage,shot:'prologue',label:'',name:'',opacity:0,accent:0};
    },
    snapshot(){return {phase,stage,replay,skipped,storySkipped,titlesPlayed,titlesAt,time:story.snapshot().time,story:story.snapshot(),credits:titles.snapshot(),duration:(story.snapshot().duration||PROLOGUE.duration)+INTRO.duration};},
    dispose(){disposed=true;story.dispose?.();titles.dispose();phase='finished';},
  };
}
