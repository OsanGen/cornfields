import {prologueRadioOffTime,PROLOGUE_OPENING} from '../src/prologue-performance.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {createPrologueAudio} from '../src/prologue-audio.js';
import {PROLOGUE_LINES,PROLOGUE_FOLLOW_LINES,PROLOGUE_END_LINE} from '../src/prologue-script.js';

function fixture(fetcher=async()=>({ok:true,arrayBuffer:async()=>new ArrayBuffer(10)})){
  const sources=[],requests=[],param=()=>({value:0,setValueAtTime(v){this.value=v;},setTargetAtTime(v){this.value=v;},linearRampToValueAtTime(){},exponentialRampToValueAtTime(){}});
  const node=()=>({gain:param(),frequency:param(),Q:param(),connect(){return this;},disconnect(){this.disconnected=true;}});
  const source=()=>{const s={...node(),start(...args){this.started=args;},stop(){this.stopped=true;}};sources.push(s);return s;};
  const audio={muted:false,master:node(),gameGain:node(),noise:{},ctx:{state:'running',currentTime:0,createGain:node,createBiquadFilter:node,createBufferSource:source,createOscillator:source,decodeAudioData:async()=>({duration:30})}};
  const opening=createPrologueAudio(audio,{fetcher:(url,options)=>{requests.push(url.pathname);return fetcher(url,options);}});
  return {audio,opening,requests,sources,flush:()=>new Promise(resolve=>setImmediate(resolve))};
}
function frame(time=1,line=PROLOGUE_LINES.find(line=>line.audioMode==='recorded'),extra={}){
  return {time:line.start+time,line,chapter:line.chapter,chapterProgress:.1,...extra};
}
function motion(time,index,moving=true){
  return {time,listener:{position:[0,1.65,0],yaw:0},actors:Object.fromEntries(['mike','clarence','stanley'].map((id,i)=>[id,{position:[i,0,-i],contactIndex:index,segment:'approach',grounded:true,moving,surface:'soft',mode:'walk'}]))};
}

test('dialogue seeks to clock offset, resumes without restarting and uses bounded lookahead',async()=>{
  const h=fixture(),f=frame();h.opening.sync(f);await h.flush();h.opening.sync(f);
  assert.equal(h.opening.diagnostics().playing,true);assert.equal(h.requests.length,3);
  const speech=h.sources.at(-1);assert.equal(speech.started[1],1);
  h.audio.ctx.currentTime=.05;h.opening.sync(frame(1.05));assert.equal(h.sources.at(-1),speech);
  h.opening.pause();assert.equal(speech.stopped,true);assert.equal(h.opening.diagnostics().playing,false);
  h.opening.sync(frame(2));assert.equal(h.sources.at(-1).started[1],2);
  assert.equal(h.audio.gameGain.gain.value,0);h.opening.dispose();assert.equal(h.opening.diagnostics().buffers,0);
});

test('failed voices do not stall presentation and are not fetched every frame',async()=>{
  const h=fixture(async()=>({ok:false}));h.opening.sync(frame());await h.flush();h.opening.sync(frame(2));await h.flush();
  assert.equal(h.requests.length,3);assert.equal(h.opening.diagnostics().playing,false);assert.equal(h.opening.diagnostics().failed.length,3);h.opening.dispose();
});

test('late fetch after release cannot restore decoded voices or start sound',async()=>{
  let resolve;const h=fixture(()=>new Promise(r=>resolve=r));h.opening.sync(frame());h.opening.release();
  resolve({ok:true,arrayBuffer:async()=>new ArrayBuffer(10)});await h.flush();assert.equal(h.opening.diagnostics().buffers,0);assert.equal(h.opening.diagnostics().playing,false);h.opening.dispose();
});

test('mute and pause cancel owned voices and crash effects without gameplay sources',async()=>{
  const h=fixture();h.opening.sync(frame());await h.flush();h.opening.sync(frame());h.opening.cue('crash');
  h.audio.muted=true;h.opening.sync(frame(2));assert.ok(h.sources.every(source=>source.stopped));assert.equal(h.opening.diagnostics().playing,false);h.opening.dispose();
});

test('actual motion drives contacts, with no footsteps for idle actors or after a seek',async()=>{
  const h=fixture(),steps=[];h.audio.footstep=contact=>{steps.push(contact);return true;};
  for(let index=0;index<4;index++)h.opening.sync(frame(index*.2,PROLOGUE_LINES[0],{motion:motion(index*.2,index)}));
  for(const actor of ['mike','clarence','stanley'])assert.ok(steps.some(step=>step.actor===actor),actor);
  assert.ok(steps.every(step=>step.owner==='prologue'&&step.bus!==h.audio.gameGain));
  assert.ok(steps.some(step=>step.pan!==0));assert.ok(steps.every(step=>step.gain<.35));
  const count=steps.length;h.opening.sync(frame(1,PROLOGUE_LINES[0],{motion:motion(.8,3,false)}));assert.equal(steps.length,count);
  h.opening.pause();h.opening.sync(frame(2,PROLOGUE_LINES[0],{motion:motion(2,12)}));assert.equal(steps.length,count);
  h.opening.dispose();
});

test('follow callouts load independently and final line preserves the live game audio bus',async()=>{
  const h=fixture(),follow=PROLOGUE_FOLLOW_LINES[1];h.opening.sync(frame(.1,follow));await h.flush();h.opening.sync(frame(.1,follow));
  assert.equal(h.opening.diagnostics().voice,'FOL-02');assert.equal(h.requests.length,1);
  h.opening.pause();h.audio.gameGain.gain.value=.8;
  h.opening.sync(frame(.1,PROLOGUE_END_LINE,{gameplay:true}));await h.flush();h.opening.sync(frame(.1,PROLOGUE_END_LINE,{gameplay:true}));
  assert.equal(h.opening.diagnostics().voice,'END-01');assert.equal(h.audio.gameGain.gain.value,.8);
  assert.equal(h.requests.length,2);h.opening.dispose();
});


test('quiet final-line preparation fetches without speech, ambience or game-bus mutation',async()=>{
  const h=fixture();h.audio.gameGain.gain.value=.7;
  h.opening.prepareLine(PROLOGUE_END_LINE);await h.flush();
  assert.equal(h.requests.length,1);assert.equal(h.sources.length,0);assert.equal(h.audio.gameGain.gain.value,.7);
  assert.equal(h.opening.diagnostics().buffers,1);assert.equal(h.opening.diagnostics().playing,false);h.opening.dispose();
});

test('approved subtitle-only cues skip audio requests while preloading the next recorded line',async()=>{
 const h=fixture();const first=PROLOGUE_LINES.find(l=>l.id==='CAR-00');
 h.opening.sync(frame(.2,first));await h.flush();h.opening.sync(frame(.5,first));
 assert.equal(h.opening.diagnostics().playing,false);assert.equal(h.opening.diagnostics().missed,0);
 assert(h.requests.some(p=>p.endsWith('/CAR-01.mp3')));assert(h.requests.every(p=>!p.endsWith('/CAR-00.mp3')&&!p.endsWith('/UND-01.mp3')));
 const hallucination=PROLOGUE_LINES.find(l=>l.id==='UND-01');h.opening.sync(frame(.2,hallucination));await h.flush();
 assert(h.requests.some(p=>p.endsWith('/WAL-06.mp3')));assert(h.requests.every(p=>!p.endsWith('/UND-01.mp3')));assert.equal(h.opening.diagnostics().failed.length,0);h.opening.dispose();
});


// 2026-10-05: the approved ordinary radio track is a local decoded excerpt,
// never the old triangle tone. These are clock/lifecycle checks, not audition.
const wakeFrame=t=>({chapter:'car',chapterTime:t,time:t,line:null,nextLine:null});
test('music is requested only on active wake, seeks after pause and never restarts after the off detent',async()=>{
 const h=fixture();assert.equal(h.requests.length,0);assert.equal(h.sources.length,0);
 h.opening.sync(wakeFrame(0));await h.flush();h.opening.sync(wakeFrame(.05));
 assert.equal(h.requests.filter(p=>p.endsWith('/entertainment-music.mp3')).length,1);
 assert.equal(h.opening.diagnostics().music.playing,true);assert.equal(h.opening.diagnostics().music.startedAtStorySeconds,.05);
 const music=h.sources.find(s=>s.started?.[1]===.05);assert(music.buffer);
 h.opening.pause();assert(music.stopped);h.opening.sync(wakeFrame(2));assert(h.sources.some(s=>s.started?.[1]===2));
 h.opening.cue('entertainment_off');assert.equal(h.opening.diagnostics().music.playing,false);
 h.opening.sync(wakeFrame(prologueRadioOffTime()));assert.equal(h.opening.diagnostics().music.playing,false);
 const count=h.sources.filter(s=>s.buffer?.duration===30).length;h.opening.pause();h.opening.sync(wakeFrame(prologueRadioOffTime()+1));assert.equal(h.sources.filter(s=>s.buffer?.duration===30).length,count);
 h.opening.release();assert.equal(h.opening.diagnostics().music.status,'not requested');h.opening.sync(wakeFrame(0));await h.flush();h.opening.sync(wakeFrame(.1));assert.equal(h.requests.filter(p=>p.endsWith('/entertainment-music.mp3')).length,2);h.opening.dispose();
});
test('missing, oversized and late music stay silent and report their exact status',async()=>{
 for(const fetcher of [async()=>({ok:false}),async()=>({ok:true,arrayBuffer:async()=>new ArrayBuffer(PROLOGUE_OPENING.musicByteCap+1)})]){
  const h=fixture(fetcher);h.opening.sync(wakeFrame(0));await h.flush();h.opening.sync(wakeFrame(.1));assert.equal(h.opening.diagnostics().music.status,'failed');assert.equal(h.opening.diagnostics().music.playing,false);assert.equal(h.requests.length,1);h.opening.dispose();
 }
 let resolve;const h=fixture(()=>new Promise(r=>resolve=r));h.opening.sync(wakeFrame(0));await Promise.resolve();h.opening.release();resolve({ok:true,arrayBuffer:async()=>new ArrayBuffer(10)});await h.flush();assert.equal(h.opening.diagnostics().music.status,'not requested');assert.equal(h.opening.diagnostics().music.playing,false);h.opening.dispose();
});
test('mute does not request music and a late decoded excerpt flags the missed closed-eyes opening',async()=>{
 const h=fixture();h.audio.muted=true;h.opening.sync(wakeFrame(0));await h.flush();assert.equal(h.requests.length,0);
 h.audio.muted=false;h.opening.sync(wakeFrame(1));await h.flush();h.opening.sync(wakeFrame(1.1));assert.equal(h.opening.diagnostics().music.missedOpening,true);
 h.audio.muted=true;h.opening.sync(wakeFrame(2));assert.equal(h.opening.diagnostics().music.playing,false);assert(h.sources.every(s=>s.stopped));h.opening.dispose();
});


// Approved v3 recording: one bounded source follows the same cycle as the jaw.
function dogFixture(fetcher){
 const h=fixture(fetcher);h.audio.ctx.decodeAudioData=async()=>({duration:89902/44100,numberOfChannels:1,length:89902});
 h.audio.ctx.createStereoPanner=()=>({pan:{value:0,setTargetAtTime(v){this.value=v;}},connect(){return this;},disconnect(){this.disconnected=true;}});return h;
}
function dogFrame(time=94.1,extra={}){return {chapter:'walk',time,line:null,nextLine:null,motion:{...motion(time,0,false),blocking:{inCar:false}},...extra};}
test('recorded dog bark follows one bounded phase, seeks after pause and stops outside its window',async()=>{
 const h=dogFixture();h.opening.sync(dogFrame());await h.flush();h.opening.sync(dogFrame());
 assert.equal(h.requests.filter(p=>p.endsWith('/roadside-dog-bark.wav')).length,1);assert.equal(h.opening.diagnostics().bark.status,'ready');assert(h.opening.diagnostics().bark.playing);
 const first=h.sources.find(s=>s.buffer?.numberOfChannels===1);assert(Math.abs(first.started[1]-.1)<1e-12);
 for(let i=0;i<5;i++){h.audio.ctx.currentTime=i*.01;h.opening.sync(dogFrame(94.1+i*.01));}assert.equal(h.sources.filter(s=>s.buffer?.numberOfChannels===1).length,1,'repeated frames never overlap sources');
 h.opening.pause();assert(first.disconnected);assert(!h.opening.diagnostics().bark.playing);h.opening.sync(dogFrame(94.7));assert.equal(h.sources.filter(s=>s.buffer?.numberOfChannels===1).length,2);assert(Math.abs(h.sources.at(-1).started[1]-.7)<1e-12);
 h.opening.sync(dogFrame(97));assert(!h.opening.diagnostics().bark.playing);h.opening.sync(dogFrame(103.5));assert(h.opening.diagnostics().bark.playing);assert.equal(h.requests.filter(p=>p.endsWith('/roadside-dog-bark.wav')).length,1);h.opening.dispose();assert(h.sources.every(s=>s.disconnected));
});
test('dog direction, distance, car muffling and dialogue ducking follow local listener coordinates',async()=>{
 const h=dogFixture();h.opening.sync(dogFrame());await h.flush();h.opening.sync(dogFrame());const near={...h.opening.diagnostics().bark};assert(near.pan>0&&near.gain>0&&near.gain<=.16);
 const far=dogFrame(94.1);far.motion.listener.position=[-80,1.65,0];h.opening.sync(far);assert(h.opening.diagnostics().bark.gain<near.gain/20);
 const turned=dogFrame(94.1);turned.motion.listener.yaw=Math.PI;h.opening.sync(turned);assert(h.opening.diagnostics().bark.pan<0);
 const closed=dogFrame(94.1);closed.motion.blocking.inCar=true;h.opening.sync(closed);assert(h.opening.diagnostics().bark.gain<near.gain*.33);
 const speaking=dogFrame(94.1,{line:{id:'LOCAL-SUBTITLE',start:94,text:'test',voice:'mike'}});h.opening.sync(speaking);assert(h.opening.diagnostics().bark.gain<near.gain*.46);h.opening.dispose();
});
test('dog bark never runs during visions, gameplay, mute or another audio directory',async()=>{
 const h=dogFixture();h.audio.muted=true;h.opening.sync(dogFrame());await h.flush();assert.equal(h.requests.length,0);h.audio.muted=false;
 h.opening.sync(dogFrame());await h.flush();h.opening.sync(dogFrame());assert(h.opening.diagnostics().bark.playing);
 for(const extra of [{chapter:'redroom'},{chapter:'undead'},{chapter:'liquid'},{gameplay:true}]){h.opening.sync(dogFrame(94.1,extra));assert(!h.opening.diagnostics().bark.playing);}
 h.audio.muted=true;h.opening.sync(dogFrame());assert(!h.opening.diagnostics().bark.playing);h.opening.dispose();
 const requests=[],other=createPrologueAudio(h.audio,{directory:'survival',fetcher:async u=>{requests.push(u);return {ok:false};}});h.audio.muted=false;other.sync(dogFrame());await h.flush();assert.equal(requests.length,0);other.dispose();
});
test('missing, oversized, wrong-format and late bark cannot replay or restore released audio',async()=>{
 for(const fetcher of [async()=>({ok:false}),async()=>({ok:true,arrayBuffer:async()=>new ArrayBuffer(262145)})]){const h=dogFixture(fetcher);h.opening.sync(dogFrame());await h.flush();h.opening.sync(dogFrame());await h.flush();assert.equal(h.opening.diagnostics().bark.status,'failed');assert(!h.opening.diagnostics().bark.playing);assert.equal(h.requests.length,1);h.opening.dispose();}
 const wrong=dogFixture();wrong.audio.ctx.decodeAudioData=async()=>({duration:30,numberOfChannels:2});wrong.opening.sync(dogFrame());await wrong.flush();assert.equal(wrong.opening.diagnostics().bark.status,'failed');wrong.opening.dispose();
 let resolve;const h=dogFixture(()=>new Promise(r=>resolve=r));h.opening.sync(dogFrame());await Promise.resolve();h.opening.release();resolve({ok:true,arrayBuffer:async()=>new ArrayBuffer(10)});await h.flush();assert.equal(h.opening.diagnostics().bark.status,'not requested');assert(!h.opening.diagnostics().bark.playing);h.opening.dispose();
});

test('interactive dialogue holds keep one advancing bark source and jaw phase through callouts',async()=>{
 const {roadsideDogPose}=await import('../src/roadside-dog.js'),h=dogFixture(),f=dogFrame(123.338173,{elapsed:94.1,storyTime:123.338173});h.opening.sync(f);await h.flush();h.opening.sync(f);
 const start=roadsideDogPose(f);for(let i=1;i<=6;i++){h.audio.ctx.currentTime=i*.1;h.opening.sync({...f,elapsed:94.1+i*.1,time:i>3?94.1+i*.1:f.time});}
 assert.equal(h.sources.filter(s=>s.buffer?.numberOfChannels===1).length,1,'story holds and follow clock switches never restart the sample');assert(Math.abs(h.opening.diagnostics().bark.phase-.7)<1e-12);assert.notEqual(roadsideDogPose({...f,elapsed:94.7}).bark,start.bark);
 h.opening.pause();const frozen=roadsideDogPose({...f,elapsed:94.7});assert.deepEqual(roadsideDogPose({...f,elapsed:94.7}),frozen);h.opening.dispose();
});
test('moving-cruiser bark direction and distance use the same transformed camera as the visible scene',async()=>{
 const T=await import('three'),{samplePrologueBodyReach}=await import('../src/viewmodel-pose.js'),{samplePrologueWake}=await import('../src/prologue-performance.js'),{ROADSIDE_DOG}=await import('../src/roadside-dog.js');
 const h=dogFixture(),f=dogFrame(94.1,{chapter:'emergence',player:{yaw:.4,pitch:-.2},driving:{position:[-2.3,0,7.0892],yaw:-.45,bodyPitch:-.02,bodyRoll:.014}});f.motion.blocking={inCar:true,camera:[.5,1.13,.35]};f.motion.listener={position:[.5,1.13,.35],yaw:.4};
 h.opening.sync(f);await h.flush();h.opening.sync(f);const car=new T.Group(),camera=new T.PerspectiveCamera();car.position.fromArray(f.driving.position);car.rotation.set(f.driving.bodyPitch,f.driving.yaw,f.driving.bodyRoll,'YXZ');car.updateMatrix();camera.position.fromArray(f.motion.blocking.camera).add(new T.Vector3(...samplePrologueBodyReach(samplePrologueWake(f).reach).eyeOffset)).applyMatrix4(car.matrix);camera.rotation.set(f.player.pitch,f.player.yaw,0,'YXZ');camera.quaternion.premultiply(car.quaternion);
 const d=camera.getWorldDirection(new T.Vector3()),yaw=Math.atan2(-d.x,-d.z),dx=ROADSIDE_DOG.position[0]-camera.position.x,dz=ROADSIDE_DOG.position[2]-camera.position.z,distance=Math.hypot(dx,dz),expectedPan=Math.max(-.85,Math.min(.85,(dx*Math.cos(yaw)-dz*Math.sin(yaw))/Math.max(2,distance))),expectedGain=.16/(1+(distance/6)**2)*.32;
 assert(Math.abs(h.opening.diagnostics().bark.pan-expectedPan)<1e-12);assert(Math.abs(h.opening.diagnostics().bark.gain-expectedGain)<1e-12);h.opening.dispose();
});
