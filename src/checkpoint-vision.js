const clamp=x=>Math.max(0,Math.min(1,x));
const smooth=x=>{x=clamp(x);return x*x*(3-2*x);};
export const CHECKPOINT_VISION_SECONDS=1.25;

// Sample the existing checkpoint clock. Pausing, restart and event consumption
// require no timers, callbacks, new gameplay mode or mutable presentation state.
export function checkpointVisionState(game,reduced=false){
  const count=game.progress?.activatedCheckpoints?.length||0;
  const at=game.metrics?.checkpointTimes?.[count-1],age=game.elapsed-at;
  const active=count>0&&Number.isFinite(age)&&age>=0&&age<CHECKPOINT_VISION_SECONDS
    &&['playing','paused'].includes(game.mode)&&!game.interaction
    &&(!game.survivalEnding||game.survivalEnding.phase==='active');
  const tier=Math.min(3,Math.max(1,count));
  const envelope=active?smooth(age/.16)*smooth((CHECKPOINT_VISION_SECONDS-age)/.28):0;
  return {active,count,age:active?age:0,duration:CHECKPOINT_VISION_SECONDS,
    amount:envelope*(tier===1?.55:tier===2?.90:1)*(reduced?.18:1),
    red:envelope*(tier===1?.38:tier===2?.86:1),
    mist:envelope*(tier===1?.035:.065),caption:active?'WE ARE ONE':''};
}
