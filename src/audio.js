import {actorPosition} from './hiding.js';
// Local CC0 vocal recordings plus original synthesized environmental effects.
export class FieldAudio {
  constructor({weatherEnabled=true}={}){this.ctx=null;this.volume=.55;this.muted=false;this.lastStep=0;this.lastEnemyStep=0;this.pulse=0;this.breath=0;this.sources=[];this.transients=new Set();this.samples={};this.voice=null;this.lastVoiceAt=-10;this.eventRun=null;this.eventId=0;this.weatherEnabled=weatherEnabled;this.weatherSamples={};this.weatherVoices=new Set();this.rainTarget=0;this.weatherQuiet=false;}
  async prepare(){
    if(!this.ctx){
      const C=window.AudioContext||window.webkitAudioContext;if(!C)return;
      this.ctx=new C();this.master=this.ctx.createGain();this.master.gain.value=this.volume*.48;this.master.connect(this.ctx.destination);
      this.gameGain=this.ctx.createGain();this.gameGain.gain.value=0;this.gameGain.connect(this.master);
      this.noise=this.ctx.createBuffer(1,this.ctx.sampleRate*3,this.ctx.sampleRate);const d=this.noise.getChannelData(0);let last=0;for(let i=0;i<d.length;i++){last=(last+(Math.random()*2-1)*.045)/1.025;d[i]=last*3;}
    }
    await this.ctx.resume();this.applyVolume();
    this.samplesReady ||= Promise.all(['distress','scream'].map(async name=>{
      const abort=new AbortController(),timer=setTimeout(()=>abort.abort(),8000);
      try{const response=await fetch(new URL(`../assets/audio/${name}.wav`,import.meta.url),{signal:abort.signal});if(!response.ok)throw new Error('Optional vocal unavailable');this.samples[name]=await this.ctx.decodeAudioData(await response.arrayBuffer());}
      catch{/* The game remains playable with synthesized fallback. */}finally{clearTimeout(timer);}
    }));
  }
  async unlock(){
    await this.prepare();
    this.startGameplay();
  }
  startGameplay(){
    if(!this.ctx)return;
    this.stopIntro();
    this.gameGain?.gain.setValueAtTime(1,this.ctx.currentTime);
    if(!this.gameAudioStarted){
      this.gameAudioStarted=true;
      const source=this.ctx.createBufferSource();source.buffer=this.noise;source.loop=true;
      const filter=this.ctx.createBiquadFilter();filter.type='lowpass';filter.frequency.value=680;
      const gain=this.ctx.createGain();gain.gain.value=.35;source.connect(filter).connect(gain).connect(this.gameGain);source.start();this.sources.push(source);
      const hum=this.ctx.createOscillator(),hg=this.ctx.createGain();hum.type='sine';hum.frequency.value=43;hg.gain.value=.055;hum.connect(hg).connect(this.gameGain);hum.start();this.sources.push(hum);
      this.threatGain=this.ctx.createGain();this.threatGain.gain.value=0;this.threatGain.connect(this.gameGain);
      for(const freq of [58,61,116]){const tone=this.ctx.createOscillator(),level=this.ctx.createGain();tone.type='sine';tone.frequency.value=freq;level.gain.value=freq===116?.25:.5;tone.connect(level).connect(this.threatGain);tone.start();this.sources.push(tone);}
    }
    if(this.weatherEnabled)this.weatherReady ||= this.loadWeather();
  }
  startIntro({quiet=false}={}){
    this.stopIntro();
    if(!this.ctx||this.ctx.state!=='running')return;
    // Replay silences the game bus without taking ownership of its sources.
    this.gameGain?.gain.setValueAtTime(0,this.ctx.currentTime);
    this.introGain=this.ctx.createGain();this.introGain.gain.value=quiet?.13:.38;this.introGain.connect(this.master);
    this.introSources=new Set();
    this.introSound({noise:true,loop:true,gain:.2,filter:420});
    this.introSound({freq:44,loop:true,gain:.075});
  }
  introSound({noise=false,buffer=null,loop=false,freq=90,end=45,duration=.35,gain=.1,filter=700}={}){
    if(!this.ctx||this.ctx.state!=='running'||!this.introGain||this.muted||this.introSources.size>=8)return;
    const t=this.ctx.currentTime,source=noise||buffer?this.ctx.createBufferSource():this.ctx.createOscillator();
    if(noise||buffer){source.buffer=buffer||this.noise;source.loop=loop;}
    else{source.frequency.setValueAtTime(freq,t);if(!loop)source.frequency.exponentialRampToValueAtTime(Math.max(10,end),t+duration);}
    const level=this.ctx.createGain(),low=this.ctx.createBiquadFilter();low.type='lowpass';low.frequency.value=filter;
    level.gain.setValueAtTime(0,t);level.gain.linearRampToValueAtTime(gain,t+Math.min(.1,duration/3));
    if(!loop){level.gain.setValueAtTime(gain,t+duration*.6);level.gain.linearRampToValueAtTime(0,t+duration);}
    const owner=this.introSources;source.connect(low).connect(level).connect(this.introGain);owner.add(source);
    source.onended=()=>{owner.delete(source);source.disconnect();low.disconnect();level.disconnect();};
    source.start();if(!loop)source.stop(t+duration+.01);return source;
  }
  introCue(id){
    if(!this.introGain||!this.ctx||this.muted)return;
    const t=this.ctx.currentTime;
    if(id==='title_dip'){this.introGain.gain.setTargetAtTime(.07,t,.04);return;}
    if(id==='title_sting'){
      this.introGain.gain.setTargetAtTime(.38,t,.02);
      this.introSound({freq:96,end:28,duration:.65,gain:.22});
      this.introSound({noise:true,duration:.5,gain:.18,filter:680});return;
    }
    if(id==='cry'){if(this.samples.distress)this.introSound({buffer:this.samples.distress,duration:1.1,gain:.18,filter:1800});return;}
    if(id==='creator_pulse'){this.introSound({freq:61,end:38,duration:.65,gain:.09});return;}
    this.introSound({noise:true,duration:id==='title_rise'?1.5:id==='studio_swell'?.6:.19,gain:.14,filter:900});
  }
  stopIntro(){
    for(const source of this.introSources||[]){try{source.stop();}catch{}}
    this.introSources?.clear();
    if(this.introGain){this.introGain.gain.cancelScheduledValues(this.ctx.currentTime);this.introGain.disconnect();this.introGain=null;}
  }
  async loadWeather(){
    this.rainGain=this.ctx.createGain();this.rainGain.gain.value=0;this.rainGain.connect(this.gameGain||this.master);
    const files={rain:'rain.mp3',thunder:'thunder.mp3',splash0:'splash-1.mp3',splash1:'splash-2.mp3'};
    await Promise.all(Object.entries(files).map(async([name,file])=>{
      const abort=new AbortController(),timer=setTimeout(()=>abort.abort(),8000);
      try{
        const response=await fetch(new URL(`../assets/audio/${file}`,import.meta.url),{signal:abort.signal});
        if(!response.ok)throw new Error('Optional weather sound unavailable');
        const buffer=await this.ctx.decodeAudioData(await response.arrayBuffer());
        this.weatherSamples[name]=buffer;
        if(name==='rain'){
          const source=this.ctx.createBufferSource();source.buffer=buffer;source.loop=true;
          source.connect(this.rainGain);source.start();this.sources.push(source);
          this.rainGain.gain.setTargetAtTime(this.rainTarget,this.ctx.currentTime,.6);
        }
      }catch{/* Weather remains visual; the existing ambience is the audio fallback. */}
      finally{clearTimeout(timer);}
    }));
  }
  stopWeatherVoices(){
    for(const source of this.weatherVoices){try{source.stop();}catch{}}
    this.weatherVoices.clear();
  }
  weatherState(game,state){
    if(!this.ctx)return;
    this.weatherQuiet=!!state?.quiet||game.mode!=='playing';
    if(this.weatherQuiet)this.stopWeatherVoices();
    const target=this.weatherEnabled&&state?.enabled&&game.mode==='playing'?(this.weatherQuiet?.08:.23):0;
    if(target!==this.rainTarget){this.rainTarget=target;this.rainGain?.gain.setTargetAtTime(target,this.ctx.currentTime,.2);}
  }
  weatherEvent(event,game){
    if(!this.ctx||this.ctx.state!=='running'||this.muted||game.mode!=='playing')return;
    if(event.type==='footstep'&&!event.wet){this.sound({noise:true,duration:.16,gain:.32,filter:1100});this.sound({freq:75,end:35,duration:.13,gain:.11});return;}
    const thunder=event.type==='thunder';
    if(thunder&&(this.weatherQuiet||this.weatherVoices.size))return;
    // Reserve room for threat/QTE audio even during a busy splash sequence.
    if(this.transients.size>=10)return;
    const buffer=this.weatherSamples[thunder?'thunder':`splash${event.variant||0}`];
    if(!buffer){
      const source=this.sound(thunder?{noise:true,duration:2.4,gain:.24,filter:190}:{noise:true,duration:.20,gain:.24,filter:1600});
      if(thunder&&source)this.weatherVoices.add(source);
      return;
    }
    const source=this.ctx.createBufferSource(),gain=this.ctx.createGain();
    source.buffer=buffer;
    const now=this.ctx.currentTime,duration=thunder?Math.min(buffer.duration,8):Math.min(buffer.duration,.55);
    const level=thunder?.42:event.type==='splash'?.45:.3;
    gain.gain.setValueAtTime(.001,now);gain.gain.linearRampToValueAtTime(level,now+.015);
    gain.gain.setValueAtTime(level,now+Math.max(.02,duration-.08));gain.gain.linearRampToValueAtTime(0,now+duration);
    source.connect(gain).connect(this.gameGain||this.master);this.transients.add(source);
    if(thunder)this.weatherVoices.add(source);
    source.start();source.stop(now+duration+.01);
    source.onended=()=>{this.transients.delete(source);this.weatherVoices.delete(source);source.disconnect();gain.disconnect();};
  }
  applyVolume(){if(this.ctx)this.master.gain.setTargetAtTime(this.muted?0:this.volume*.48,this.ctx.currentTime,.05);}
  setVolume(v){this.volume=v;this.applyVolume();}
  toggleMute(){this.muted=!this.muted;if(this.muted){this.stopCues();this.stopIntro();}this.applyVolume();return this.muted;}
  pause(){this.stopIntro();if(this.ctx?.state==='running')void this.ctx.suspend();}
  sound({noise=false,freq=100,end=45,duration=.3,gain=.3,pan=0,filter=900,type='sine',delay=0}={}){
    if(!this.ctx||this.ctx.state!=='running'||this.muted||this.transients.size>=16)return;
    const t=this.ctx.currentTime+delay,source=noise?this.ctx.createBufferSource():this.ctx.createOscillator();
    if(noise)source.buffer=this.noise;else{source.type=type;source.frequency.setValueAtTime(freq,t);source.frequency.exponentialRampToValueAtTime(Math.max(10,end),t+duration);}
    const f=this.ctx.createBiquadFilter();f.type='lowpass';f.frequency.value=filter;
    const g=this.ctx.createGain();g.gain.setValueAtTime(.001,t);g.gain.exponentialRampToValueAtTime(Math.max(.002,gain),t+.018);g.gain.exponentialRampToValueAtTime(.001,t+duration);
    const p=this.ctx.createStereoPanner();p.pan.value=Math.max(-1,Math.min(1,pan));source.connect(f).connect(g).connect(p).connect(this.gameGain||this.master);source.start(t);source.stop(t+duration+.05);
    this.transients.add(source);
    source.onended=()=>{this.transients.delete(source);this.weatherVoices.delete(source);source.disconnect();f.disconnect();g.disconnect();p.disconnect();};
    return source;
  }
  stopCues(){for(const source of this.transients){try{source.stop();}catch{}}this.transients.clear();this.weatherVoices.clear();this.voice=null;}
  vocal(kind,g,position,priority=1,duration=1.4){
    if(!this.ctx||this.ctx.state!=='running'||this.muted||this.transients.size>=16)return;
    if(this.voice&&this.voice.priority>priority)return;
    if(this.lastVoiceAt===g.elapsed&&priority<3)return;
    if(this.voice){try{this.voice.source.stop();}catch{}}
    const player={...actorPosition(g,'player'),yaw:g.player.yaw},where=position||actorPosition(g,'enemy');
    const d=Math.hypot(where.x-player.x,where.z-player.z),gain=(kind==='scream'?.62:.30)*Math.max(.06,1/(1+d*.12));
    const buffer=this.samples[kind];this.lastVoiceAt=g.elapsed;
    if(!buffer){this.sound({freq:kind==='scream'?175:135,end:55,duration,gain,type:'sawtooth',filter:650,pan:this.pan(where,player)});return;}
    const source=this.ctx.createBufferSource(),volume=this.ctx.createGain(),pan=this.ctx.createStereoPanner();
    source.buffer=buffer;source.playbackRate.value=kind==='scream'?.86:.9;
    const time=this.ctx.currentTime,length=Math.min(duration,buffer.duration/source.playbackRate.value);
    volume.gain.setValueAtTime(.001,time);volume.gain.linearRampToValueAtTime(gain,time+.04);volume.gain.setValueAtTime(gain,time+Math.max(.04,length-.12));volume.gain.linearRampToValueAtTime(.001,time+length);
    pan.pan.value=this.pan(where,player);source.connect(volume).connect(pan).connect(this.gameGain||this.master);
    this.voice={source,priority};this.transients.add(source);source.start();source.stop(time+length);
    source.onended=()=>{this.transients.delete(source);if(this.voice?.source===source)this.voice=null;source.disconnect();volume.disconnect();pan.disconnect();};
  }
  event(event,g){
    if(event.runId!==undefined){if(this.eventRun!==event.runId){this.stopCues();this.eventRun=event.runId;this.eventId=0;}if(event.id<=this.eventId)return;this.eventId=event.id;}
    const e=event.type,pan=this.pan(event.position||actorPosition(g,'enemy'),{...actorPosition(g,'player'),yaw:g.player.yaw});
    if(['death','win'].includes(e))this.stopCues();
    if(e==='detection'){this.stopCues();return;}
    if(['retreat','recoil'].includes(e)){this.vocal('distress',g,event.position,1,e==='recoil'?.6:1.1);return;}
    if(['rage','corn_rush','chase','stagger','eye_stab','hunt_resume'].includes(e)){
      if(e==='hunt_resume')this.stopCues();
      this.vocal('scream',g,event.position,e==='hunt_resume'?3:2,e==='eye_stab'?.7:1.4);return;
    }
    if(e==='tackle'||e==='landing'){this.sound({noise:true,duration:.22,gain:.45,filter:550});return;}
    if(e==='stab_press'){this.sound({noise:true,duration:.07,gain:.1,filter:950});return;}
    if(e==='door'){this.sound({noise:true,duration:1.1,gain:.5,filter:380});this.sound({freq:130,end:50,duration:.7,gain:.15,type:'sawtooth'});}
    if(['sound','false','near'].includes(e))this.sound({noise:true,duration:1.5,gain:.8,filter:1800,pan});
    if(e==='glimpse'){this.sound({noise:true,duration:.8,gain:.45,pan});this.sound({freq:190,end:65,duration:1.4,gain:.12});}
    if(e==='chase'){this.sound({freq:78,end:39,duration:1.4,gain:.45,type:'sawtooth',filter:400});this.sound({noise:true,duration:1.1,gain:.6,filter:800,pan});}
    if(e==='final'||e==='death'){this.sound({freq:160,end:24,duration:1.6,gain:.6,type:'sawtooth',filter:1500});this.sound({noise:true,duration:1.1,gain:.65,filter:1800});}
    if(e==='win'){this.sound({freq:220,end:110,duration:2,gain:.15});this.sound({freq:330,end:165,duration:2,gain:.07});}
    if(e==='shot'){this.sound({noise:true,duration:.23,gain:.9,filter:3200});this.sound({freq:95,end:28,duration:.28,gain:.5});}
    if(e==='empty'||e==='flashlight')this.sound({noise:true,duration:.06,gain:.13,filter:1900});
    if(e==='stagger'||e==='hit'){this.sound({noise:true,duration:.48,gain:.58,filter:480,pan});this.sound({freq:87,end:30,duration:.65,gain:.3,pan});}
    if(e==='recoil')this.sound({freq:140,end:59,duration:.6,gain:.3,type:'sawtooth',filter:700,pan});
    if(e==='rage'||e==='corn_rush'){this.sound({noise:true,duration:1,gain:.7,filter:1700,pan});this.sound({freq:83,end:33,duration:1.2,gain:.4,type:'sawtooth',filter:650,pan});}
    if(e==='damage'){this.sound({freq:60,end:22,duration:.38,gain:.6});this.sound({noise:true,duration:.3,gain:.45,filter:550});}
    if(e==='hide'||e==='leave'||e==='rustle')this.sound({noise:true,duration:e==='rustle'?.6:.25,gain:.35,filter:2200,pan});
    if(e==='recover')this.sound({freq:80,end:51,duration:1,gain:.2,type:'sawtooth',filter:340,pan});
    if(e==='checkpoint'){this.sound({freq:260,end:260,duration:.5,gain:.12});this.sound({freq:390,end:390,duration:.7,gain:.08,delay:.15});}
    if((e==='win'||e==='death')&&this.ctx)this.master.gain.setTargetAtTime(0,this.ctx.currentTime+1,.8);
  }
  pan(source,player){const dx=source.x-player.x,dz=source.z-player.z;return (dx*Math.cos(player.yaw)-dz*Math.sin(player.yaw))/Math.max(3,Math.hypot(dx,dz));}
  update(g,dt,{footsteps=true}={}){
    if(!this.ctx||g.mode!=='playing')return;
    if(footsteps&&g.player.moving&&!g.player.hidden&&g.steps-this.lastStep>1.55){this.lastStep=g.steps;this.sound({noise:true,duration:.16,gain:.32,filter:1100});this.sound({freq:75,end:35,duration:.13,gain:.11});}
    const player={...actorPosition(g,'player'),yaw:g.player.yaw},enemy=actorPosition(g,'enemy'),d=Math.hypot(player.x-enemy.x,player.z-enemy.z);
    if(g.enemy.visible&&d<18&&g.enemy.step-this.lastEnemyStep>1.4){this.lastEnemyStep=g.enemy.step;this.sound({freq:65,end:25,duration:.23,gain:Math.max(.04,.55*(1-d/18)),pan:this.pan(enemy,player)});}
    const intensity=g.threat?.intensity||0;this.threatGain?.gain.setTargetAtTime(intensity*.18,this.ctx.currentTime,.35);
    this.pulse-=dt;if(['chase','rage_chase','corn_rush'].includes(g.enemy.state)&&this.pulse<=0){this.pulse=g.enemy.state==='chase'?.55:.4;this.sound({freq:53,end:31,duration:.22,gain:.20});this.sound({freq:48,end:26,duration:.16,gain:.13,delay:.2});}
    this.breath-=dt;if(g.enemy.visible&&d<14&&this.breath<=0&&!g.interaction&&['concealed_stalk','observe','investigate','predictive_search'].includes(g.enemy.state)){this.breath=4.2;this.vocal('distress',g,enemy,0,1.3);}
  }
  reset(){this.stopCues();this.lastVoiceAt=-10;this.eventRun=null;this.eventId=0;this.lastStep=0;this.lastEnemyStep=0;this.pulse=0;this.breath=0;this.weatherQuiet=false;this.rainTarget=0;if(this.ctx){this.rainGain?.gain.setTargetAtTime(0,this.ctx.currentTime,.03);this.master.gain.cancelScheduledValues(this.ctx.currentTime);this.applyVolume();}}
}
