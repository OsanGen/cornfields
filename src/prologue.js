import {PROLOGUE,createPrologueTimeline} from './prologue-script.js';
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
  return {
    time,chapter:chapter.id,chapterTime:time-chapter.start,chapterProgress:clamp((time-chapter.start)/(chapter.end-chapter.start)),
    speaker:current?.speaker||'',spoken:subtitle?.text||'',line:current,nextLine:current?null:script.lines.find(line=>line.start>time)||null,
    red:smooth((time-crash)/(reduced?1.5:.8)),mist:smooth((time-(crash+2))/Math.max(1,rupture.end-crash-4)),
    reduced,returning:false,returnTime:0,
  };
}

export function createPrologue({onCue=()=>{},durations={},timeline}={}){
  const script=timeline||createPrologueTimeline({durations});
  let phase='preflight',time=0,disposed=false,skipped=false;
  const fired=new Set(),dropped=new Set();
  return {
    get phase(){return phase;},get active(){return phase!=='finished';},
    begin(){
      if(disposed||!['preflight','finished'].includes(phase))return false;
      time=0;skipped=false;fired.clear();dropped.clear();phase='playing';return true;
    },
    tick(dt){
      if(disposed||phase!=='playing'||!Number.isFinite(dt)||dt<=0)return;
      const previous=time;time=Math.min(script.duration,time+dt);
      for(const [id,at] of script.cues)if(previous<at&&time>=at&&!fired.has(id)){
        fired.add(id);
        if(time-at>PROLOGUE.lateCueWindow+1e-9)dropped.add(id);else onCue(id);
      }
      if(time>=script.duration)phase='finished';
    },
    pause(){if(phase!=='playing')return false;phase='paused';return true;},
    resume(){if(disposed||phase!=='paused')return false;phase='playing';return true;},
    finish(){if(disposed)return false;time=script.duration;phase='finished';return true;},
    skip(){if(disposed||phase==='finished')return false;skipped=true;time=script.duration;phase='finished';return true;},
    frame(reduced=false){
      const frame=prologueFrame(time,{reduced,timeline:script});
      if(phase==='paused'){frame.spoken='';frame.speaker='';}
      return frame;
    },
    snapshot(){return {phase,time,duration:script.duration,skipped,fired:[...fired],dropped:[...dropped]};},
    dispose(){disposed=true;phase='finished';fired.clear();dropped.clear();},
  };
}
