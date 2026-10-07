import {Vector3,Quaternion,Euler} from 'three';
import {samplePrologueDriving} from './prologue-driving.js';
import {samplePrologueBodyReach} from './viewmodel-pose.js';
import {samplePrologueWake,prologueRadioOffTime,PROLOGUE_OPENING} from './prologue-performance.js';
import {roadsideDogPose,ROADSIDE_DOG,ROADSIDE_DOG_SOUND} from './roadside-dog.js';
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
  let musicBuffer=null,musicRequest=null,musicLoading=false,musicGeneration=0;
  let barkBuffer=null,barkRequest=null,barkLoading=false,barkGeneration=0,barkVoice=null;
  const bark={status:'not requested',bytes:0,decodedBytes:0,error:null,playing:false,phase:null,cycle:null,pan:0,gain:0};
  const music={status:'not requested',bytes:0,decodedBytes:0,error:null,playing:false,startedAtStorySeconds:null,missedOpening:false};
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
  function preload(frame,only=false){
    // At most the current utterance and two successors, never the entire soundtrack.
    const next=frame.line||frame.nextLine;
    if(!next)return;
    const index=lines.findIndex(line=>line.id===next.id);
    // Explicit subtitle-only cues retain their captions and preload the next
    // recorded line. They never become failed or repeatedly requested assets.
    const upcoming=only||frame.gameplay?(recordedIds.has(next.id)?[next]:[]):index<0?(recordedIds.has(next.id)?[next]:[]):lines.slice(index).filter(line=>recordedIds.has(line.id)).slice(0,3);
    pending.clear();
    for(const line of upcoming)if(!buffers.has(line.id)&&!failed.has(line.id))pending.add(line.id);
    void pump();
  }
  function stopEntertainment(){
    if(entertainment){const item=entertainment;entertainment=null;try{item.level.gain.setTargetAtTime(0,audio.ctx.currentTime,.006);item.source.stop(audio.ctx.currentTime+.015);}catch{}for(const node of item.nodes)node.disconnect();}
    music.playing=false;
  }
  function prepareMusic(requiredSeconds=prologueRadioOffTime()){
    if(directory!=='prologue'||musicLoading||musicBuffer||music.status==='failed'||!audio.ctx)return;
    musicLoading=true;music.status='loading';const generation=musicGeneration,controller=new AbortController();musicRequest=controller;
    const timer=setTimeout(()=>controller.abort(),8000);
    Promise.resolve().then(()=>fetcher(new URL('../assets/audio/prologue/entertainment-music.mp3',import.meta.url),{signal:controller.signal})).then(async response=>{
      if(!response.ok)throw new Error('Entertainment music unavailable');const bytes=await response.arrayBuffer();
      if(bytes.byteLength>PROLOGUE_OPENING.musicByteCap)throw new Error('Entertainment music exceeds the approved 0.5 MiB budget');
      const buffer=await audio.ctx.decodeAudioData(bytes);
      if(buffer.duration<requiredSeconds)throw new Error('Entertainment excerpt ends before the off detent');
      if(disposed||controller.signal.aborted||generation!==musicGeneration)return;
      musicBuffer=buffer;Object.assign(music,{status:'ready',bytes:bytes.byteLength,decodedBytes:(buffer.length||0)*(buffer.numberOfChannels||1)*4,error:null});
    }).catch(error=>{if(!disposed&&generation===musicGeneration)Object.assign(music,{status:'failed',error:error.message});}).finally(()=>{clearTimeout(timer);if(generation===musicGeneration){musicLoading=false;musicRequest=null;}});
  }
  function syncEntertainment(frame){
    const offset=Number.isFinite(frame.chapterTime)?frame.chapterTime:Number(frame.time)||0;
    const off=prologueRadioOffTime(frame),on=directory==='prologue'&&frame.chapter==='car'&&offset<off;
    if(!on){if(frame.chapter==='car'&&offset>=off&&music.startedAtStorySeconds===null)music.missedOpening=true;stopEntertainment();return;}
    prepareMusic(off);if(!musicBuffer)return;
    const ctx=audio.ctx;
    if(entertainment&&Math.abs(ctx.currentTime-entertainment.started+entertainment.offset-offset)>.12)stopEntertainment();
    if(!entertainment){
      const source=ctx.createBufferSource(),filter=ctx.createBiquadFilter(),level=ctx.createGain();source.buffer=musicBuffer;filter.type='bandpass';filter.frequency.value=1700;filter.Q.value=.3;level.gain.value=frame.line?.id==='CAR-00'?.34:.65;
      source.connect(filter).connect(level).connect(bus);const item={source,level,nodes:[source,filter,level],started:ctx.currentTime,offset};entertainment=item;
      source.onended=()=>{if(entertainment===item){entertainment=null;music.playing=false;}for(const node of item.nodes)node.disconnect();};source.start(0,Math.min(offset,musicBuffer.duration-.001));music.playing=true;if(music.startedAtStorySeconds===null)music.startedAtStorySeconds=offset;if(offset>.8)music.missedOpening=true;
    }
  }
  function stopBark(){stop(barkVoice);barkVoice=null;bark.playing=false;}
  function prepareBark(){
    if(directory!=='prologue'||barkLoading||barkBuffer||bark.status==='failed'||!audio.ctx)return;
    barkLoading=true;bark.status='loading';const generation=barkGeneration,controller=new AbortController();barkRequest=controller;
    const timer=setTimeout(()=>controller.abort(),8000);
    Promise.resolve().then(()=>fetcher(new URL('../assets/audio/prologue/roadside-dog-bark.wav',import.meta.url),{signal:controller.signal})).then(async response=>{
      if(!response.ok)throw new Error('Roadside bark unavailable');const bytes=await response.arrayBuffer();
      if(bytes.byteLength>ROADSIDE_DOG_SOUND.byteCap)throw new Error('Roadside bark exceeds approved 256 KiB budget');
      const buffer=await audio.ctx.decodeAudioData(bytes);
      if(buffer.numberOfChannels!==1||Math.abs(buffer.duration-ROADSIDE_DOG_SOUND.durationSeconds)>.05)throw new Error('Roadside bark format or duration does not match approved recording');
      if(disposed||controller.signal.aborted||generation!==barkGeneration)return;
      barkBuffer=buffer;Object.assign(bark,{status:'ready',bytes:bytes.byteLength,decodedBytes:(buffer.length||0)*4,error:null});
    }).catch(error=>{if(!disposed&&generation===barkGeneration)Object.assign(bark,{status:'failed',error:error.message});}).finally(()=>{clearTimeout(timer);if(generation===barkGeneration){barkLoading=false;barkRequest=null;}});
  }
  function syncBark(frame,motion){
    const pose=roadsideDogPose(frame);if(directory!=='prologue'||!pose.active){stopBark();return;}
    prepareBark();if(!pose.soundWindow||!barkBuffer){stopBark();return;}
    const ctx=audio.ctx,inCar=motion.blocking?.inCar??false,listener={position:[...motion.listener.position],yaw:Number.isFinite(frame.player?.yaw)?frame.player.yaw:motion.listener.yaw};
    if(inCar){
      // The seated camera is cabin-local while the dog is stage-local. Match
      // the visible camera's complete cruiser transform before attenuation.
      const drive=frame.driving||samplePrologueDriving(frame),rotation=new Quaternion().setFromEuler(new Euler(drive.bodyPitch,drive.yaw,drive.bodyRoll,'YXZ'));
      listener.position=new Vector3().fromArray(motion.blocking?.camera||listener.position).add(new Vector3().fromArray(samplePrologueBodyReach(samplePrologueWake(frame).reach).eyeOffset)).applyQuaternion(rotation).add(new Vector3().fromArray(drive.position)).toArray();
      const orientation=new Quaternion().setFromEuler(new Euler(Number(frame.player?.pitch)||0,listener.yaw,0,'YXZ')).premultiply(rotation),forward=new Vector3(0,0,-1).applyQuaternion(orientation);listener.yaw=Math.atan2(-forward.x,-forward.z);
    }
    const dx=ROADSIDE_DOG.position[0]-listener.position[0],dz=ROADSIDE_DOG.position[2]-listener.position[2],distance=Math.hypot(dx,dz);
    const pan=Math.max(-.85,Math.min(.85,(dx*Math.cos(listener.yaw)-dz*Math.sin(listener.yaw))/Math.max(2,distance))),gain=.16/(1+(distance/6)**2)*(inCar?.32:1)*(frame.line?.id?.45:1);
    if(barkVoice&&(barkVoice.cycle!==pose.cycle||Math.abs(ctx.currentTime-barkVoice.started+barkVoice.offset-pose.phase)>.12))stopBark();
    if(!barkVoice){
      const source=ctx.createBufferSource(),filter=ctx.createBiquadFilter(),level=ctx.createGain(),panner=ctx.createStereoPanner?ctx.createStereoPanner():null,remaining=Math.min(barkBuffer.duration,ROADSIDE_DOG_SOUND.durationSeconds)-pose.phase;
      if(remaining<=.01)return;level.gain.value=gain;if(panner)panner.pan.value=pan;source.buffer=barkBuffer;filter.type='lowpass';filter.frequency.value=inCar?1800:6500;
      const envelope=ctx.createGain();envelope.gain.setValueAtTime(0,ctx.currentTime);envelope.gain.linearRampToValueAtTime(1,ctx.currentTime+Math.min(.008,remaining/3));envelope.gain.setValueAtTime(1,ctx.currentTime+Math.max(.008,remaining-.02));envelope.gain.linearRampToValueAtTime(0,ctx.currentTime+remaining);
      source.connect(filter).connect(envelope).connect(level);if(panner)level.connect(panner).connect(bus);else level.connect(bus);
      const item={source,filter,level,panner,nodes:[source,filter,envelope,level,...(panner?[panner]:[])],started:ctx.currentTime,offset:pose.phase,cycle:pose.cycle};barkVoice=item;
      source.onended=()=>{if(barkVoice===item){barkVoice=null;bark.playing=false;}for(const node of item.nodes)node.disconnect();};source.start(0,pose.phase);source.stop(ctx.currentTime+remaining);
    }
    barkVoice.level.gain.setTargetAtTime(gain,ctx.currentTime,.06);barkVoice.filter.frequency.setTargetAtTime(inCar?1800:6500,ctx.currentTime,.10);barkVoice.panner?.pan.setTargetAtTime(pan,ctx.currentTime,.06);
    Object.assign(bark,{playing:true,phase:pose.phase,cycle:pose.cycle,pan,gain});
  }
  function atmosphere(frame){
    if(entertainment)entertainment.level.gain.setTargetAtTime(frame.line?.id==='CAR-00'?.34:.65,audio.ctx.currentTime,.16);
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
    syncEntertainment(frame);
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
    if(frame.gameplay){stop(ambience);ambience=null;stop(engine);engine=null;stopEntertainment();stop(projector);projector=null;}else atmosphere(frame);
    // Process contact before the dialogue fast path: speaking must not silence walking.
    const motion=frame.motion||samplePrologueMotion(frame),listener=motion.listener;
    syncBark(frame,motion);
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
    if(id==='entertainment_off')stopEntertainment();
    if(!ensureBus(!!lastFrame?.gameplay)||effects.size>=4)return;
    const ctx=audio.ctx,t=ctx.currentTime;
    if(id==='car_honk'){
      // Original two-tone vehicle horn, once on the approved reaction cue.
      for(const frequency of [370,466]){const source=ctx.createOscillator(),level=ctx.createGain();source.type='sawtooth';source.frequency.value=frequency;level.gain.setValueAtTime(0,t);level.gain.linearRampToValueAtTime(.026,t+.025);level.gain.setValueAtTime(.026,t+.275);level.gain.linearRampToValueAtTime(0,t+.32);source.connect(level).connect(bus);const item={source,nodes:[source,level]};effects.add(item);source.onended=()=>{effects.delete(item);source.disconnect();level.disconnect();};source.start();source.stop(t+.325);}return;
    }
    const source=ctx.createBufferSource(),filter=ctx.createBiquadFilter(),level=ctx.createGain();
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
  function pause(){stopBark();contacts.reset();audio.footsteps?.stop('prologue');stopVoice();stop(ambience);ambience=null;stop(engine);engine=null;stopEntertainment();stop(projector);projector=null;for(const item of effects)stop(item);effects.clear();bus?.disconnect();bus=null;}
  function release(){pause();barkGeneration++;barkRequest?.abort();barkRequest=null;barkLoading=false;barkBuffer=null;Object.assign(bark,{status:'not requested',bytes:0,decodedBytes:0,error:null,playing:false,phase:null,cycle:null,pan:0,gain:0});pending.clear();request?.abort();buffers.clear();lastFrame=null;musicGeneration++;musicRequest?.abort();musicRequest=null;musicLoading=false;musicBuffer=null;Object.assign(music,{status:'not requested',bytes:0,decodedBytes:0,error:null,playing:false,startedAtStorySeconds:null,missedOpening:false});}
  return {sync,cue,pause,release,prepareLine(line){if(!disposed)preload({line},true);},dispose(){disposed=true;release();failed.clear();},diagnostics(){return {voice:current,playing:!!voice,buffers:buffers.size,loading,failed:[...failed],played,missed,footfalls,chapter:lastFrame?.chapter||null,synthetic:true,music:{...music},bark:{...bark}};}};
}
