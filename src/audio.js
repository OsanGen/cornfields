import {actorPosition} from './hiding.js';
// Original synthesized placeholders: no external samples or network requests.
export class FieldAudio {
  constructor(){this.ctx=null;this.volume=.55;this.muted=false;this.lastStep=0;this.lastEnemyStep=0;this.pulse=0;this.breath=0;this.sources=[];}
  async unlock(){
    if(!this.ctx){
      const C=window.AudioContext||window.webkitAudioContext;if(!C)return;
      this.ctx=new C();this.master=this.ctx.createGain();this.master.gain.value=this.volume*.48;this.master.connect(this.ctx.destination);
      this.noise=this.ctx.createBuffer(1,this.ctx.sampleRate*3,this.ctx.sampleRate);const d=this.noise.getChannelData(0);let last=0;for(let i=0;i<d.length;i++){last=(last+(Math.random()*2-1)*.045)/1.025;d[i]=last*3;}
      const source=this.ctx.createBufferSource();source.buffer=this.noise;source.loop=true;
      const filter=this.ctx.createBiquadFilter();filter.type='lowpass';filter.frequency.value=680;
      const gain=this.ctx.createGain();gain.gain.value=.35;source.connect(filter).connect(gain).connect(this.master);source.start();this.sources.push(source);
      const hum=this.ctx.createOscillator(),hg=this.ctx.createGain();hum.type='sine';hum.frequency.value=43;hg.gain.value=.055;hum.connect(hg).connect(this.master);hum.start();this.sources.push(hum);
      this.threatGain=this.ctx.createGain();this.threatGain.gain.value=0;this.threatGain.connect(this.master);
      for(const freq of [58,61,116]){const tone=this.ctx.createOscillator(),level=this.ctx.createGain();tone.type='sine';tone.frequency.value=freq;level.gain.value=freq===116?.25:.5;tone.connect(level).connect(this.threatGain);tone.start();this.sources.push(tone);}
    }
    await this.ctx.resume();this.applyVolume();
  }
  applyVolume(){if(this.ctx)this.master.gain.setTargetAtTime(this.muted?0:this.volume*.48,this.ctx.currentTime,.05);}
  setVolume(v){this.volume=v;this.applyVolume();}
  toggleMute(){this.muted=!this.muted;this.applyVolume();return this.muted;}
  pause(){if(this.ctx?.state==='running')void this.ctx.suspend();}
  sound({noise=false,freq=100,end=45,duration=.3,gain=.3,pan=0,filter=900,type='sine',delay=0}={}){
    if(!this.ctx||this.ctx.state!=='running'||this.muted)return;
    const t=this.ctx.currentTime+delay,source=noise?this.ctx.createBufferSource():this.ctx.createOscillator();
    if(noise)source.buffer=this.noise;else{source.type=type;source.frequency.setValueAtTime(freq,t);source.frequency.exponentialRampToValueAtTime(Math.max(10,end),t+duration);}
    const f=this.ctx.createBiquadFilter();f.type='lowpass';f.frequency.value=filter;
    const g=this.ctx.createGain();g.gain.setValueAtTime(.001,t);g.gain.exponentialRampToValueAtTime(Math.max(.002,gain),t+.018);g.gain.exponentialRampToValueAtTime(.001,t+duration);
    const p=this.ctx.createStereoPanner();p.pan.value=Math.max(-1,Math.min(1,pan));source.connect(f).connect(g).connect(p).connect(this.master);source.start(t);source.stop(t+duration+.05);
    source.onended=()=>{source.disconnect();f.disconnect();g.disconnect();p.disconnect();};
  }
  event(event,g){
    const e=event.type,pan=this.pan(event.position||actorPosition(g,'enemy'),{...actorPosition(g,'player'),yaw:g.player.yaw});
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
  update(g,dt){
    if(!this.ctx||g.mode!=='playing')return;
    if(g.player.moving&&!g.player.hidden&&g.steps-this.lastStep>1.55){this.lastStep=g.steps;this.sound({noise:true,duration:.16,gain:.32,filter:1100});this.sound({freq:75,end:35,duration:.13,gain:.11});}
    const player={...actorPosition(g,'player'),yaw:g.player.yaw},enemy=actorPosition(g,'enemy'),d=Math.hypot(player.x-enemy.x,player.z-enemy.z);
    if(g.enemy.visible&&d<18&&g.enemy.step-this.lastEnemyStep>1.4){this.lastEnemyStep=g.enemy.step;this.sound({freq:65,end:25,duration:.23,gain:Math.max(.04,.55*(1-d/18)),pan:this.pan(enemy,player)});}
    const intensity=g.threat?.intensity||0;this.threatGain?.gain.setTargetAtTime(intensity*.18,this.ctx.currentTime,.35);
    this.pulse-=dt;if(['chase','rage_chase','corn_rush'].includes(g.enemy.state)&&this.pulse<=0){this.pulse=g.enemy.state==='chase'?.55:.4;this.sound({freq:53,end:31,duration:.22,gain:.20});this.sound({freq:48,end:26,duration:.16,gain:.13,delay:.2});}
    this.breath-=dt;if(g.enemy.visible&&d<10&&this.breath<=0){this.breath=2.2-(g.progress?.escalationTier||0)*.35;this.sound({noise:true,duration:.85,gain:.2*(1-d/12),filter:550,pan:this.pan(enemy,player)});}
  }
  reset(){this.lastStep=0;this.lastEnemyStep=0;this.pulse=0;this.breath=0;if(this.ctx){this.master.gain.cancelScheduledValues(this.ctx.currentTime);this.applyVolume();}}
}
