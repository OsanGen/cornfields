// 60 Hz simulation, at most 250 ms catch-up per frame. Longer stalls discard
// excess time; pause/resume clears the remainder instead of fast-forwarding.
export function createStepper(tick,{step=1/60,maxFrame=.25}={}){
  let accumulated=0,droppedSeconds=0;
  return {
    get pendingSeconds(){return accumulated;},
    get droppedSeconds(){return droppedSeconds;},
    reset(){accumulated=0;},
    frame(seconds,readInput){
      seconds=Number.isFinite(seconds)?Math.max(0,seconds):0;
      droppedSeconds+=Math.max(0,seconds-maxFrame);accumulated+=Math.min(seconds,maxFrame);
      while(accumulated+1e-10>=step){
        const presentNow=tick(step,readInput(step));accumulated-=step;
        if(presentNow===true){droppedSeconds+=Math.max(0,accumulated);accumulated=0;break;}
      }
    },
    advance(seconds,readInput){
      let left=Number.isFinite(seconds)?Math.min(60,Math.max(0,seconds)):0;
      while(left>1e-10){const dt=Math.min(step,left);tick(dt,readInput(dt));left-=dt;}
    },
  };
}
