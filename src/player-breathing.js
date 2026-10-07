/** Audio-only effort. Inputs are accepted traversal, never held keys or camera motion. */
export function createPlayerBreathing({walkSpeed=3.95}={}) {
  let effort=0, moving=false, state='calm';
  const snapshot=()=>({state,effort,moving,period:4.8-2.35*effort});
  return {
    snapshot,
    reset(){effort=0;moving=false;state='calm';return snapshot();},
    update(distance,dt){
      // Discard resets/teleports and long stalls, rather than turning them into exertion.
      if(!Number.isFinite(dt)||dt<=0||dt>.25||!Number.isFinite(distance)||distance<0||distance>walkSpeed*dt*1.05+.00001)return this.reset();
      const pace=Math.min(1,distance/(walkSpeed*dt));
      moving=pace>(moving?.025:.05);
      const target=moving?pace:0,tau=moving?8:12;
      effort=target+(effort-target)*Math.exp(-dt/tau);
      if(!moving&&effort<.012)effort=0;
      state=moving?(effort>=(state==='exerted'?.45:.62)?'exerted':'walking'):effort?'recovery':'calm';
      return snapshot();
    },
  };
}

export function playerBreathingAllowed(game) {
  return game.mode==='playing'&&game.entered&&game.player.health>0&&!game.player.hidden&&!game.interaction&&
    (!game.survivalEnding||game.survivalEnding.phase==='active')&&
    (!game.player.zone||['corridor','field'].includes(game.player.zone));
}

/** One owner, one finite source at a time. No timer, promise, asset load or future start. */
export function createPlayerBreathingAudio(context,output,{seed=0x4d494b45}={}) {
  const model=createPlayerBreathing();
  let voice=null,buffer=null,bus=null,nextAt=0,enabled=false,ducked=false;
  let cycles=0,maxSources=0,stops=0;
  function random(){seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return(seed>>>0)/4294967296;}
  function release(current){
    if(!current)return;
    for(const node of current.nodes)node.disconnect();
    if(voice===current)voice=null;
  }
  function cancel(fade=0){
    if(!voice)return;
    const current=voice,t=context.currentTime;
    if(fade&&context.state==='running'&&current.end>t&&!current.stopping){
      // The independent bus can ramp without cancelling the shaped breath envelope.
      bus.gain.cancelScheduledValues(t);bus.gain.setTargetAtTime(0,t,.005);
      current.stopping=true;current.end=t+fade;current.source.stop(current.end);
    }else if(!fade||context.state!=='running'||current.end<=t){
      try{current.source.stop();}catch{/* Already ended. */}
      release(current);
    }
  }
  function stop({fade=0}={}){
    enabled=false;nextAt=0;ducked=false;model.reset();stops+=voice&&!voice.stopping?1:0;
    cancel(fade);
  }
  function duck(speech){
    if(ducked===speech)return;
    ducked=speech;
    if(bus&&!voice?.stopping)bus.gain.setTargetAtTime(speech?.16:1,context.currentTime,speech?.025:.45);
  }
  function startCycle(effort,period){
    const t=context.currentTime;
    // End callbacks may be queued behind the frame. Reap by audio time as well.
    if(voice&&voice.end<=t)release(voice);
    if(voice)return;
    if(!buffer){
      buffer=context.createBuffer(1,Math.ceil(context.sampleRate*8),context.sampleRate);
      const samples=buffer.getChannelData(0);
      for(let i=0;i<samples.length;i++)samples[i]=(random()*2-1)*.7;
    }
    if(!bus){bus=context.createGain();bus.connect(output);}
    bus.gain.cancelScheduledValues(t);bus.gain.setValueAtTime(ducked?.16:1,t);
    const source=context.createBufferSource(),high=context.createBiquadFilter(),low=context.createBiquadFilter(),level=context.createGain();
    source.buffer=buffer;source.loop=false;source.playbackRate.value=.94+random()*.12;
    high.type='highpass';high.frequency.value=210+random()*50;high.Q.value=.45;
    low.type='lowpass';low.frequency.value=1250+effort*650+random()*140;low.Q.value=.55;
    const duration=period*(.86+random()*.06),inhale=duration*(.38+random()*.04),exhaleAt=inhale+duration*.10;
    const gain=(.022+.055*effort)*(.94+random()*.12);
    // Smooth, asymmetric inhale/exhale. Silent edges and a varying pause avoid seams.
    const envelope=[[0,0],[inhale*.18,gain*.22],[inhale*.55,gain*.78],[inhale*.78,gain*.55],[inhale,0],
      [exhaleAt,0],[exhaleAt+(duration-exhaleAt)*.16,gain*.58],[exhaleAt+(duration-exhaleAt)*.42,gain],
      [exhaleAt+(duration-exhaleAt)*.72,gain*.42],[duration,0]];
    level.gain.setValueAtTime(0,t);
    for(const [at,value] of envelope.slice(1))level.gain.linearRampToValueAtTime(value,t+at);
    source.connect(high).connect(low).connect(level).connect(bus);
    const current={source,nodes:[source,high,low,level],end:t+duration,stopping:false};voice=current;
    source.onended=()=>release(current);
    const offset=random()*Math.max(0,buffer.duration-duration*source.playbackRate.value-.02);
    source.start(t,offset);source.stop(current.end);
    nextAt=t+period*(.97+random()*.06);cycles++;maxSources=Math.max(maxSources,1);
  }
  return {
    stop,
    duck,
    update({distance=0,dt,allowed=false,speech=false}={}){
      if(!allowed||context.state!=='running'){stop({fade:context.state==='running'?.025:0});return model.snapshot();}
      if(!enabled){cancel();enabled=true;nextAt=context.currentTime+.25;}
      const state=model.update(distance,dt);duck(!!speech);
      if(voice?.end<=context.currentTime)release(voice);
      if(state.state==='calm'){cancel(.025);nextAt=context.currentTime+.25;}
      else if(state.effort>.018&&context.currentTime>=nextAt)startCycle(state.effort,state.period);
      return state;
    },
    diagnostics(){return {...model.snapshot(),enabled,ducked,sources:voice?1:0,cycles,maxSources,stops,bufferBytes:buffer?buffer.length*4:0};},
    dispose(){stop();bus?.disconnect();bus=null;buffer=null;},
  };
}
