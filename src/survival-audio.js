import {createPrologueAudio} from './prologue-audio.js';
import {SURVIVAL_LINES} from './survival-script.js';

export function createSurvivalAudio(audio){
  const dialogue=createPrologueAudio(audio,{lines:SURVIVAL_LINES,audioLines:SURVIVAL_LINES,directory:'survival'});
  let bed=null;
  function pause(){dialogue.pause();if(bed){for(const node of bed){try{node.stop?.();}catch{}node.disconnect();}bed=null;}if(audio.ctx?.state==='running')audio.gameGain?.gain.setTargetAtTime(1,audio.ctx.currentTime,.1);}
  return {...dialogue,sync(frame){
    if(audio.ctx?.state!=='running'||audio.muted){pause();return;}
    const ctx=audio.ctx;
    audio.gameGain?.gain.setTargetAtTime(.16,ctx.currentTime,.1);
    if(!bed){
      const motor=ctx.createBufferSource(),filter=ctx.createBiquadFilter(),gain=ctx.createGain(),hum=ctx.createOscillator(),humGain=ctx.createGain();
      motor.buffer=audio.noise;motor.loop=true;filter.type='bandpass';filter.frequency.value=330;filter.Q.value=2;gain.gain.value=.17;
      motor.connect(filter).connect(gain).connect(audio.master);motor.start();hum.frequency.value=frame.chapter==='pit'?31:54;humGain.gain.value=.055;hum.connect(humGain).connect(audio.master);hum.start();bed=[motor,filter,gain,hum,humGain];
    }
    bed[3].frequency.setTargetAtTime(['transform','pit','fall'].includes(frame.chapter)?31:54,ctx.currentTime,.3);
    dialogue.sync(frame);
  },pause,release(){pause();dialogue.release();},dispose(){pause();dialogue.dispose();}};
}
