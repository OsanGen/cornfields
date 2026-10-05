import {samplePrologueWake} from './prologue-performance.js';
import {sampleRoomTransition} from './prologue-liquid-transition.js';
import {PROLOGUE_AUDIO_LINES,PROLOGUE_LINES} from './prologue-script.js';
import {samplePrologueMotion,createPrologueContactTracker} from './prologue-motion.js';

/** Small, isolated opening bus. Dialogue follows the presentation clock. */
export function createPrologueAudio(audio,{fetcher=(...args)=>fetch(...args),lines=PROLOGUE_LINES,audioLines=PROLOGUE_AUDIO_LINES,directory='prologue'}={}){
  const recordedIds=new Set(audioLines.map(line=>line.id));
  const buffers=new Map(),failed=new Set(),pending=new Set(),effects=new Set();
  const contacts=createPrologueContactTracker();let footfalls=0;
  let bus=null,ambience=null,engine=null,entertainment=null,projector=null,voice=null,current=null,disposed=false,loading=false,lastFrame=null;
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
    if(!next)return;
    const index=lines.findIndex(line=>line.id===next.id);
    // Explicit subtitle-only cues retain their captions and preload the next
    // recorded line. They never become failed or repeatedly requested assets.
    const upcoming=index<0?(recordedIds.has(next.id)?[next]:[]):lines.slice(index).filter(line=>recordedIds.has(line.id)).slice(0,3);
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
    const door=frame.exitPose?.door??(inCar?0:1),speed=frame.driving?.speed||0;
    ambience.filter.frequency.setTargetAtTime(220+500*door,ctx.currentTime,.16);
    const road=.045+.13*Math.min(1,speed/6),field=.14;
    ambience.level.gain.setTargetAtTime(quiet?0:(road*(1-door)+field*door)*(frame.line?.id?.70:1),ctx.currentTime,.12);
    if(!engine){
      const source=ctx.createOscillator(),level=ctx.createGain(),filter=ctx.createBiquadFilter();source.type='triangle';filter.type='lowpass';filter.frequency.value=170;level.gain.value=0;source.connect(filter).connect(level).connect(bus);source.start();engine={source,level,filter,nodes:[source,level,filter]};
    }
    if(!entertainment){const source=ctx.createOscillator(),level=ctx.createGain(),filter=ctx.createBiquadFilter();source.type='triangle';filter.type='bandpass';filter.frequency.value=1150;filter.Q.value=.7;source.connect(filter).connect(level).connect(bus);level.gain.value=0;source.start();entertainment={source,level,nodes:[source,filter,level]};}
    entertainment.source.frequency.setTargetAtTime(220+Math.sin((frame.time||0)*2.1)*35,ctx.currentTime,.08);
    entertainment.level.gain.setTargetAtTime(samplePrologueWake(frame).radioOn?.045:0,ctx.currentTime,.02);
    if(!projector){const source=ctx.createBufferSource(),filter=ctx.createBiquadFilter(),level=ctx.createGain();source.buffer=audio.noise;source.loop=true;filter.type='bandpass';filter.frequency.value=680;filter.Q.value=.55;source.connect(filter).connect(level).connect(bus);level.gain.value=0;source.start();projector={source,level,nodes:[source,filter,level]};}
    const inRoom=sampleRoomTransition(frame).room,mechanism=.80+.20*Math.sin((frame.time||0)*24)**2;
    projector.level.gain.setTargetAtTime(inRoom?mechanism*(frame.line?.voice==='face'?.022:.055):0,ctx.currentTime,.10);
    engine.source.frequency.setTargetAtTime(31+speed*5,ctx.currentTime,.25);
    const nearCar=['car','dispatch','emergence','bang','cabin','exit','flashlight'].includes(frame.chapter);
    engine.level.gain.setTargetAtTime(nearCar?(.022+.018*Math.min(1,speed/6))*(1-door*.68):0,ctx.currentTime,.25);

  }
  function sync(frame){
    lastFrame=frame;
    if(!ensureBus(!!frame.gameplay)){pause();return;}
    preload(frame);
    if(frame.gameplay){stop(ambience);ambience=null;stop(engine);engine=null;stop(entertainment);entertainment=null;stop(projector);projector=null;}else atmosphere(frame);
    // Process contact before the dialogue fast path: speaking must not silence walking.
    const motion=frame.motion||samplePrologueMotion(frame),listener=motion.listener;
    for(const contact of frame.gameplay?[]:contacts.update(motion)){
      const dx=contact.position[0]-listener.position[0],dz=contact.position[2]-listener.position[2],distance=Math.hypot(dx,dz);
      const self=contact.actor==='mike',pan=self?0:(dx*Math.cos(listener.yaw)-dz*Math.sin(listener.yaw))/Math.max(3,distance);
      const gain=(self?.34:.29)/(1+distance*.18)*(frame.line?.id?.65:1);
      if(audio.footstep?.({actor:contact.actor,surface:contact.surface,owner:'prologue',bus,gain,pan}))footfalls++;
    }
    const line=frame.line,buffer=line&&buffers.get(line.id),offset=line?Math.max(0,frame.time-line.start):0;
    const outside=line?.voice==='stanley'&&(frame.motion?.blocking?.inCar||frame.exitPose?.door<1),door=frame.exitPose?.door??(outside?0:1);
    if(voice?.filter&&line?.voice==='stanley')voice.filter.frequency.setTargetAtTime(2600+6900*door,audio.ctx.currentTime,.10);
    if(voice?.pan){const position=motion.actors?.[line?.voice]?.position;if(position){const dx=position[0]-listener.position[0],dz=position[2]-listener.position[2],distance=Math.hypot(dx,dz);voice.pan.pan.setTargetAtTime(Math.max(-.75,Math.min(.75,(dx*Math.cos(listener.yaw)-dz*Math.sin(listener.yaw))/Math.max(2,distance))),audio.ctx.currentTime,.08);}}
    if(current===line?.id&&voice){
      const actual=audio.ctx.currentTime-voice.started+voice.offset;
      if(Math.abs(actual-offset)<.20)return;
    }
    stopVoice();
    if(!line||!buffer||offset>=buffer.duration-.03)return;
    const ctx=audio.ctx,source=ctx.createBufferSource(),level=ctx.createGain(),filter=ctx.createBiquadFilter();

    source.buffer=buffer;filter.type=line.voice==='dispatch'||line.voice==='face'?'bandpass':'lowpass';filter.frequency.value=line.voice==='dispatch'?1700:line.voice==='face'?2100:line.voice==='unknown'?1100:outside?2600:9500;filter.Q.value=line.voice==='dispatch'?.65:line.voice==='face'?.8:.7;
    level.gain.value=line.voice==='dispatch'?1.25:line.id==='FLA-03'?.74:line.id==='CAB-01'?1.15:line.id.startsWith('FOL-')?1.12:outside?.9:1;
    const pan=(line.voice==='stanley'||line.voice==='clarence')&&ctx.createStereoPanner?ctx.createStereoPanner():null;
    source.connect(filter).connect(level);if(pan)level.connect(pan).connect(bus);else level.connect(bus);
    const item={source,filter,pan,nodes:[source,filter,level,...(pan?[pan]:[])],offset,started:ctx.currentTime};voice=item;current=line.id;played++;
    source.onended=()=>{if(voice===item)voice=null;for(const node of item.nodes)node.disconnect();};source.start(0,offset);
  }
  function cue(id){
    if(!ensureBus(!!lastFrame?.gameplay)||effects.size>=4)return;
    const ctx=audio.ctx,t=ctx.currentTime,source=ctx.createBufferSource(),filter=ctx.createBiquadFilter(),level=ctx.createGain();
    const scream=id.startsWith('zombie_scream_');
    const crash=id==='crash',bang=id.startsWith('car_bang_'),door=id==='door_open',duration=scream?1.75:crash?3.4:id==='corn_burst'?.85:door?.48:bang?(id.endsWith('1')?.14:.18):.28;
    source.buffer=scream?(audio.samples?.scream||audio.noise):audio.noise;source.loop=crash;filter.type='lowpass';filter.frequency.value=scream?2700:crash?450:id==='radio'?2100:door?1250:bang?(id.endsWith('1')?740:920):1400;
    level.gain.setValueAtTime(0,t);level.gain.linearRampToValueAtTime(scream?.40:crash?1.3:bang?.48:id==='entertainment_off'?.10:.28,t+.01);level.gain.exponentialRampToValueAtTime(.001,t+duration);
    const pan=scream&&ctx.createStereoPanner?ctx.createStereoPanner():null;source.connect(filter).connect(level);if(pan){pan.pan.value=id.endsWith('1')?-.36:.36;level.connect(pan).connect(bus);}else level.connect(bus);
    const item={source,nodes:[source,filter,level,...(pan?[pan]:[])]};effects.add(item);source.onended=()=>{effects.delete(item);for(const node of item.nodes)node.disconnect();};source.start();source.stop(t+duration+.02);
    if(door||bang){
      const body=ctx.createOscillator(),gain=ctx.createGain();body.type='sine';body.frequency.setValueAtTime(door?130:178,t);body.frequency.exponentialRampToValueAtTime(door?68:85,t+.11);gain.gain.setValueAtTime(door?.045:.08,t);gain.gain.exponentialRampToValueAtTime(.001,t+.18);body.connect(gain).connect(bus);const item={source:body,nodes:[body,gain]};effects.add(item);body.onended=()=>{effects.delete(item);body.disconnect();gain.disconnect();};body.start();body.stop(t+.20);
    }
    if(crash){
      const sub=ctx.createOscillator(),gain=ctx.createGain();sub.frequency.setValueAtTime(91,t);sub.frequency.exponentialRampToValueAtTime(27,t+1.6);
      gain.gain.setValueAtTime(.6,t);gain.gain.exponentialRampToValueAtTime(.001,t+2.8);sub.connect(gain).connect(bus);
      const item={source:sub,nodes:[sub,gain]};effects.add(item);sub.onended=()=>{effects.delete(item);sub.disconnect();gain.disconnect();};sub.start();sub.stop(t+2.9);
    }
  }
  function pause(){contacts.reset();audio.footsteps?.stop('prologue');stopVoice();stop(ambience);ambience=null;stop(engine);engine=null;stop(entertainment);entertainment=null;stop(projector);projector=null;for(const item of effects)stop(item);effects.clear();bus?.disconnect();bus=null;}
  function release(){pause();pending.clear();request?.abort();buffers.clear();lastFrame=null;}
  return {sync,cue,pause,release,prepareLine(line){if(!disposed)preload({line});},dispose(){disposed=true;release();failed.clear();},diagnostics(){return {voice:current,playing:!!voice,buffers:buffers.size,loading,failed:[...failed],played,missed,footfalls,chapter:lastFrame?.chapter||null,synthetic:true};}};
}
