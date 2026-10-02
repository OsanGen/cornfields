import {PROLOGUE_AUDIO_LINES,PROLOGUE_LINES} from './prologue-script.js';
import {samplePrologueMotion,createPrologueContactTracker} from './prologue-motion.js';

/** Small, isolated opening bus. Dialogue follows the presentation clock. */
export function createPrologueAudio(audio,{fetcher=(...args)=>fetch(...args),lines=PROLOGUE_LINES,audioLines=PROLOGUE_AUDIO_LINES,directory='prologue'}={}){
  const buffers=new Map(),failed=new Set(),pending=new Set(),effects=new Set();
  const contacts=createPrologueContactTracker();let footfalls=0;
  let bus=null,ambience=null,voice=null,current=null,disposed=false,loading=false,lastFrame=null;
  let played=0,missed=0,request=null;
  function stop(item){if(!item)return;try{item.source.stop();}catch{}for(const node of item.nodes)node.disconnect();}
  function stopVoice(){stop(voice);voice=null;current=null;}
  function ensureBus(gameplay=false){
    if(disposed||!audio.ctx||audio.ctx.state!=='running'||audio.muted)return false;
    if(!bus){bus=audio.ctx.createGain();bus.gain.value=1.65;bus.connect(audio.master);}
    if(!gameplay)audio.gameGain?.gain.setValueAtTime(0,audio.ctx.currentTime);
    return true;
  }
  async function pump(){
    if(loading||disposed||!audio.ctx)return;
    loading=true;
    try{
      while(pending.size&&!disposed){
        const id=pending.values().next().value;pending.delete(id);
        if(buffers.has(id)||failed.has(id))continue;
        const controller=new AbortController();request=controller;const timer=setTimeout(()=>controller.abort(),8000);
        try{
          const response=await fetcher(new URL(`../assets/audio/${directory}/${id}.mp3`,import.meta.url),{signal:controller.signal});
          if(!response.ok)throw new Error('Voice unavailable');
          const bytes=await response.arrayBuffer();if(bytes.byteLength>1500000)throw new Error('Voice exceeds budget');
          const buffer=await audio.ctx.decodeAudioData(bytes);
          if(!disposed&&!controller.signal.aborted){buffers.set(id,buffer);while(buffers.size>4)buffers.delete(buffers.keys().next().value);}
        }catch{if(!disposed&&!controller.signal.aborted){failed.add(id);missed++;}}
        finally{clearTimeout(timer);request=null;}
      }
    }finally{loading=false;}
  }
  function preload(frame){
    // At most the current utterance and two successors, never the entire soundtrack.
    const next=frame.line||frame.nextLine;
    if(!next||!audioLines.some(line=>line.id===next.id))return;
    const index=lines.findIndex(line=>line.id===next.id);
    const upcoming=index<0?[next]:lines.slice(index,index+3);
    pending.clear();
    for(const line of upcoming)if(!buffers.has(line.id)&&!failed.has(line.id))pending.add(line.id);
    void pump();
  }
  function atmosphere(frame){
    const ctx=audio.ctx,inCar=frame.motion?.blocking?.inCar??['car','dispatch','emergence','bang','cabin'].includes(frame.chapter),quiet=frame.chapter==='rupture';
    if(!ambience){
      const source=ctx.createBufferSource(),filter=ctx.createBiquadFilter(),level=ctx.createGain();
      source.buffer=audio.noise;source.loop=true;filter.type='lowpass';level.gain.value=0;
      source.connect(filter).connect(level).connect(bus);source.start();ambience={source,filter,level,nodes:[source,filter,level]};
    }
    ambience.filter.frequency.setTargetAtTime(inCar?220:720,ctx.currentTime,.3);
    ambience.level.gain.setTargetAtTime(quiet?0:frame.line?.id ? .10 : inCar ? .17 : .14,ctx.currentTime,.15);
  }
  function sync(frame){
    lastFrame=frame;
    if(!ensureBus(!!frame.gameplay)){pause();return;}
    preload(frame);
    if(frame.gameplay){stop(ambience);ambience=null;}else atmosphere(frame);
    // Process contact before the dialogue fast path: speaking must not silence walking.
    const motion=frame.motion||samplePrologueMotion(frame),listener=motion.listener;
    for(const contact of frame.gameplay?[]:contacts.update(motion)){
      const dx=contact.position[0]-listener.position[0],dz=contact.position[2]-listener.position[2],distance=Math.hypot(dx,dz);
      const self=contact.actor==='mike',pan=self?0:(dx*Math.cos(listener.yaw)-dz*Math.sin(listener.yaw))/Math.max(3,distance);
      const gain=(self?.34:.29)/(1+distance*.18)*(frame.line?.id?.65:1);
      if(audio.footstep?.({actor:contact.actor,surface:contact.surface,owner:'prologue',bus,gain,pan}))footfalls++;
    }
    const line=frame.line,buffer=line&&buffers.get(line.id),offset=line?Math.max(0,frame.time-line.start):0;
    if(current===line?.id&&voice){
      const actual=audio.ctx.currentTime-voice.started+voice.offset;
      if(Math.abs(actual-offset)<.20)return;
    }
    stopVoice();
    if(!line||!buffer||offset>=buffer.duration-.03)return;
    const ctx=audio.ctx,source=ctx.createBufferSource(),level=ctx.createGain(),filter=ctx.createBiquadFilter();
    const outside=line.voice==='stanley'&&frame.motion?.blocking?.inCar;
    source.buffer=buffer;filter.type=line.voice==='dispatch'||line.voice==='face'?'bandpass':'lowpass';filter.frequency.value=line.voice==='dispatch'?1700:line.voice==='face'?2100:line.voice==='unknown'?1100:outside?2600:9500;filter.Q.value=line.voice==='dispatch'?.65:line.voice==='face'?.8:.7;
    level.gain.value=line.voice==='dispatch'?1.25:line.id==='FLA-03'?.74:line.id==='CAB-01'?1.15:line.id.startsWith('FOL-')?1.12:outside?.9:1;
    source.connect(filter).connect(level).connect(bus);
    const item={source,nodes:[source,filter,level],offset,started:ctx.currentTime};voice=item;current=line.id;played++;
    source.onended=()=>{if(voice===item)voice=null;for(const node of item.nodes)node.disconnect();};source.start(0,offset);
  }
  function cue(id){
    if(!ensureBus(!!lastFrame?.gameplay)||effects.size>=4)return;
    const ctx=audio.ctx,t=ctx.currentTime,source=ctx.createBufferSource(),filter=ctx.createBiquadFilter(),level=ctx.createGain();
    const crash=id==='crash',bang=id.startsWith('car_bang_'),duration=crash?3.4:id==='corn_burst'?.85:bang?.16:.28;
    source.buffer=audio.noise;source.loop=crash;filter.type='lowpass';filter.frequency.value=crash?450:id==='radio'?2100:bang?620:1400;
    level.gain.setValueAtTime(0,t);level.gain.linearRampToValueAtTime(crash?1.3:bang?.48:.28,t+.01);level.gain.exponentialRampToValueAtTime(.001,t+duration);
    source.connect(filter).connect(level).connect(bus);
    const item={source,nodes:[source,filter,level]};effects.add(item);source.onended=()=>{effects.delete(item);for(const node of item.nodes)node.disconnect();};source.start();source.stop(t+duration+.02);
    if(crash){
      const sub=ctx.createOscillator(),gain=ctx.createGain();sub.frequency.setValueAtTime(91,t);sub.frequency.exponentialRampToValueAtTime(27,t+1.6);
      gain.gain.setValueAtTime(.6,t);gain.gain.exponentialRampToValueAtTime(.001,t+2.8);sub.connect(gain).connect(bus);
      const item={source:sub,nodes:[sub,gain]};effects.add(item);sub.onended=()=>{effects.delete(item);sub.disconnect();gain.disconnect();};sub.start();sub.stop(t+2.9);
    }
  }
  function pause(){contacts.reset();audio.footsteps?.stop('prologue');stopVoice();stop(ambience);ambience=null;for(const item of effects)stop(item);effects.clear();bus?.disconnect();bus=null;}
  function release(){pause();pending.clear();request?.abort();buffers.clear();lastFrame=null;}
  return {sync,cue,pause,release,prepareLine(line){if(!disposed)preload({line});},dispose(){disposed=true;release();failed.clear();},diagnostics(){return {voice:current,playing:!!voice,buffers:buffers.size,loading,failed:[...failed],played,missed,footfalls,chapter:lastFrame?.chapter||null,synthetic:true};}};
}
