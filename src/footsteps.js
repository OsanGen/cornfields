// A small shared recording bank. Audio variation never touches gameplay RNG.
export const FOOTSTEP_FILES = Object.fromEntries(['soft','hard'].flatMap(surface =>
  Array.from({length:6},(_,i)=>[`${surface}${i}`,`footsteps/${surface}-${i+1}.mp3`]))
  .concat([['wet0','splash-1.mp3'],['wet1','splash-2.mp3']]));

export function createFootstepBank(audio,{fetcher=(...args)=>fetch(...args)}={}) {
  const buffers=new Map(),voices=new Set(),serials=new Map();
  const stats={state:'idle',played:0,fallback:0,wet:0,actors:{},last:null,failed:[]};
  let ready=null,request=null,disposed=false;
  function load(){
    if(ready||disposed||!audio.ctx)return ready;
    stats.state='loading';request=new AbortController();
    const timer=setTimeout(()=>request.abort(),8000);
    ready=(async()=>{
      for(const [key,file] of Object.entries(FOOTSTEP_FILES)){
        try{
          const response=await fetcher(new URL(`../assets/audio/${file}`,import.meta.url),{signal:request.signal});
          if(!response.ok)throw new Error('Optional footstep unavailable');
          const bytes=await response.arrayBuffer();if(bytes.byteLength>100000)throw new Error('Footstep exceeds budget');
          const buffer=await audio.ctx.decodeAudioData(bytes);
          if(!disposed&&!request.signal.aborted)buffers.set(key,buffer);
        }catch{stats.failed.push(key);}
        if(disposed)break;
      }
      if(!disposed)stats.state=stats.failed.length?'fallback':'ready';
    })().finally(()=>clearTimeout(timer));
    return ready;
  }
  function stop(owner){
    for(const item of [...voices])if(!owner||item.owner===owner){try{item.source.stop();}catch{}item.cleanup();}
  }
  function layer(buffer,{bus,owner,gain,pan,rate,filter=4500}){
    const ctx=audio.ctx,source=ctx.createBufferSource(),level=ctx.createGain(),panner=ctx.createStereoPanner(),low=ctx.createBiquadFilter();
    source.buffer=buffer||audio.noise;source.playbackRate.value=rate;
    const t=ctx.currentTime,duration=buffer?Math.min(.65,buffer.duration/rate):.14;
    low.type='lowpass';low.frequency.value=filter;panner.pan.value=Math.max(-1,Math.min(1,pan));
    level.gain.setValueAtTime(gain,t);level.gain.setValueAtTime(gain,t+Math.max(0,duration-.04));level.gain.linearRampToValueAtTime(0,t+duration);
    source.connect(low).connect(level).connect(panner).connect(bus);
    const item={source,owner,cleanup(){voices.delete(item);for(const node of [source,low,level,panner])node.disconnect();}};
    voices.add(item);source.onended=item.cleanup;source.start(t);source.stop(t+duration+.01);
  }
  function play({surface='soft',wet=false,actor='player',owner='game',bus=audio.gameGain||audio.master,gain=.65,pan=0,heavy=false}={}){
    if(disposed||!audio.ctx||audio.ctx.state!=='running'||audio.muted||!bus||voices.size>=10)return false;
    const serial=serials.get(actor)||0;serials.set(actor,serial+1);
    const kind=surface==='hard'?'hard':'soft',key=`${kind}${serial%6}`;
    const buffer=buffers.get(key)||[...buffers].find(([name])=>name.startsWith(kind))?.[1];
    const rate=(heavy?.83:1)+(serial%3-1)*.025;
    layer(buffer,{bus,owner,gain,pan,rate,filter:surface==='mud'?2100:heavy?2500:5000});
    if(!buffer)stats.fallback++;
    if(wet||surface==='mud'){
      const splash=buffers.get(`wet${serial%2}`);
      if(splash)layer(splash,{bus,owner,gain:gain*(wet?.55:.12),pan,rate,filter:2800});
    }
    stats.played++;if(wet)stats.wet++;
    stats.actors[actor]=(stats.actors[actor]||0)+1;
    stats.last={actor,surface,wet,sample:buffer?key:'fallback',pan,gain,owner};
    return true;
  }
  return {load,play,stop,sample:key=>buffers.get(key),reset(){stop();serials.clear();},dispose(){disposed=true;request?.abort();stop();buffers.clear();},
    diagnostics:()=>({...stats,actors:{...stats.actors},last:stats.last&&{...stats.last},failed:[...stats.failed],buffers:buffers.size,voices:voices.size})};
}
