const clamp=x=>Math.max(0,Math.min(1,x));
const smooth=x=>{x=clamp(x);return x*x*(3-2*x);};
export const CHECKPOINT_VISION_SECONDS=1.25;

// Presentation has a clock separate from the immediate reward. It can wait for
// recovery or a higher-priority interaction without silently losing its cue.
export function advanceCheckpointVision(game,dt=0){
  const count=game.progress?.activatedCheckpoints?.length||0;
  const state=game.checkpointPresentation||(game.checkpointPresentation={seen:0,queue:[],active:null});
  if(!['playing','paused'].includes(game.mode)||(game.survivalEnding&&game.survivalEnding.phase!=='active')){state.queue.length=0;state.active=null;state.seen=count;return;}
  while(state.seen<count)state.queue.push(++state.seen);
  if(game.mode==='paused'||game.interaction)return;
  if(state.active){state.active.age+=dt;if(state.active.age>=CHECKPOINT_VISION_SECONDS)state.active=null;}
  if(!state.active&&state.queue.length)state.active={count:state.queue.shift(),age:0};
}

// Sample the existing checkpoint clock. Pausing, restart and event consumption
// require no timers, callbacks, new gameplay mode or mutable presentation state.
export function checkpointVisionState(game,reduced=false){
  const presentation=game.checkpointPresentation;
  const count=presentation?.active?.count??(game.progress?.activatedCheckpoints?.length||0);
  const at=game.metrics?.checkpointTimes?.[count-1],age=presentation?(presentation.active?.age??Infinity):game.elapsed-at;
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
