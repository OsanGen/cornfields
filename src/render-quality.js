import {PRESENTATION} from './presentation-config.js';

const tiers = ['low', 'balanced', 'high'];
/** Sustained frame cadence controls resolution/detail, never gameplay density. */
export function createRenderQuality({initial='balanced', mode='auto', onChange=()=>{}}={}) {
  let index=Math.max(0,tiers.indexOf(initial)), slow=0, fast=0, warmup=2;
  let choice='auto', reason='initial', samples=0, total=0;
  function apply(next, why) {
    index=next;reason=why;slow=fast=0;warmup=2;
    onChange(PRESENTATION.quality[tiers[index]],tiers[index]);
  }
  function set(value) {
    choice=tiers.includes(value)?value:'auto';
    apply(choice==='auto'?index:tiers.indexOf(choice),choice==='auto'?'automatic':'player choice');
  }
  set(mode);
  return {
    set,
    reset(){slow=fast=0;warmup=2;},
    sample(seconds, eligible=true){
      if(!eligible||!Number.isFinite(seconds)||seconds<=0||seconds>.25){slow=fast=0;return;}
      samples++;total+=seconds;
      if(choice!=='auto')return;
      if(warmup>0){warmup-=seconds;return;}
      slow=seconds>1/28?slow+seconds:Math.max(0,slow-seconds*2);
      fast=seconds<1/55?fast+seconds:0;
      if(slow>=3&&index>0)apply(index-1,'sustained slow frames');
      else if(fast>=25&&index<tiers.length-1)apply(index+1,'sustained headroom');
    },
    snapshot(){return {mode:choice,tier:tiers[index],reason,samples,meanFrameMs:samples?total/samples*1000:0};},
  };
}
