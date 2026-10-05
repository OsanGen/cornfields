import {installVisualCheck,abortable} from './visual-check.js';
import {VISUAL_CHECK_RELEASE} from './visual-check-build.js';
import {createPrologue,prologueFrame} from './prologue.js';
import {createPrologueTimeline} from './prologue-script.js';
import {PROLOGUE_VOICE_TIMING} from './prologue-voice-timing.js';
import {followApproachTarget} from './prologue-layout.js';
import {createGame} from './game.js';
import {enterOpenField} from './corridor-run.js';

/** Reuses the production scene, texture assets, cast rig and camera pipeline. */
export function installCornfieldsVisualCheck({app,view,maze,prologueView,canvas}){
 return installVisualCheck({game:'cornfields',release:VISUAL_CHECK_RELEASE,canvas,
 available:()=>app.snapshot().mode==='menu'&&app.introSnapshot().phase==='preflight'&&!!prologueView,
 async begin({signal,status}){
  const resume=app.suspendVisualCheck();let restored=false;const restore=()=>{if(restored)return;restored=true;prologueView.release();view.reset?.();resume();};
  try{
   status('Loading the production car, cast and field assets…');await abortable(view.ready,signal);if(signal.aborted)throw signal.reason;
   const timeline=createPrologueTimeline({durations:PROLOGUE_VOICE_TIMING}),story=createPrologue({timeline});story.begin();
   prologueView.start();prologueView.render(story.frame(false));
   await new Promise((resolve,reject)=>{const started=performance.now();const tick=()=>{if(signal.aborted){reject(signal.reason);return;}const a=prologueView.diagnostics().assets;if(a&&['car','cast','road','mist'].every(k=>a[k]!=='loading')){resolve();return;}if(performance.now()-started>15000){reject(new Error('Some scene assets are still loading. Reload and try again.'));return;}setTimeout(tick,80);};tick();});
   const at=(id,offset=0)=>timeline.chapters.find(c=>c.id===id).start+offset;
   let turning=at('dispatch'),max=0;const dispatch=timeline.chapters.find(c=>c.id==='dispatch');for(let t=dispatch.start;t<dispatch.end;t+=.05){const steer=Math.abs(prologueFrame(t,{timeline}).driving.steer);if(steer>max){max=steer;turning=t;}}
   const privateLine=timeline.lines.find(l=>l.id==='FLA-03');
   // Chronological progression plus two seconds of rendered pre-roll before
   // every checkpoint retain planted-foot history. These are normal controls.
   const presets=[
    {id:'driving-steering-grips',label:'Driving hands and wheel',time:at('car',8),yaw:.82,pitch:-.20},
    {id:'turning-steering-grips',label:'Steering through the turn',time:turning,yaw:.82,pitch:-.20},
    {id:'passenger-free-look',label:'Passenger free look',time:Math.min(dispatch.end-.05,turning+.05),yaw:-1.18,pitch:.05},
    {id:'window-knock',label:'Stanley at the passenger window',time:at('bang',.60),yaw:-1.52,pitch:.30},
    {id:'parked-corn',label:'Parked car and corn',time:privateLine.start+.1,yaw:0,pitch:0},
    {id:'passenger-exit',label:'Passenger leaving the car',time:at('exit',.8),yaw:0,pitch:-.10},
    {id:'driver-exit',label:'Driver leaving the car',time:at('exit',1.7),yaw:1.30,pitch:-.12},
    {id:'westward-walk',label:'Westward walk into the corn',time:at('walk',14)},
    {id:'westward-history',label:'Escorts and the approach',time:at('history',2)},
    {id:'red-room-treatment',label:'Production red-room materials',time:at('redroom',2),yaw:0,pitch:-.16},
   ];
   function controls(){const s=story.snapshot(),p=s.player;const c={};if(s.waitingForExit)c.interact=true;if(p.y>1.5&&!['redroom','rupture'].includes(s.chapter)){const target=followApproachTarget(p,s.escorts),dx=target.x-p.x,dz=target.z-p.z;if(Math.hypot(dx,dz)>.08){c.forward=1;c.yaw=Math.atan2(-dx,-dz);}}return c;}
   function advanceTo(target,step=.05){for(let n=0;story.snapshot().time<target-1e-8;n++){if(n>16000)throw new Error('The diagnostic story could not reach its checkpoint.');const s=story.snapshot();story.tick(Math.min(step,Math.max(.0001,target-s.time)),controls());}}
   let current=null,currentType='prologue';
   const scenes=presets.map(p=>({id:p.id,label:p.label,preRollFrames:120,
    prepare(){current=p;currentType='prologue';advanceTo(Math.max(story.snapshot().time,p.time-2));},
    render(dt){if(dt>0&&story.snapshot().time<p.time-1e-8)advanceTo(Math.min(p.time,story.snapshot().time+dt),dt);const frame=story.frame(false);if(p.yaw!==undefined){frame.player.yaw=p.yaw;frame.player.pitch=p.pitch;}prologueView.render(frame);},
   }));
   for(const kind of ['timber-checkpoint','field-return-beacon']){let game;
    scenes.push({id:kind,label:kind==='timber-checkpoint'?'Production timber, ground and checkpoint':'Production open corn and return beacon',preRollFrames:120,
     prepare(){currentType='gameplay';prologueView.release();game=createGame(maze);Object.assign(game,{mode:'playing',entered:true,grace:100,elapsed:10});game.corridorRun.started=true;game.enemies.forEach(e=>{e.active=false;e.visible=false;});
      if(kind==='timber-checkpoint'){const point=game.maze.checkpoints[0];Object.assign(game.player,{x:point.x,z:point.z+4,yaw:0,pitch:-.10,flashlightOn:true});}
      else{const door=game.maze.cornDoors.find(d=>d.fieldEntrance);game.cornDoors[door.index].amount=1;Object.assign(game.player,{x:door.x,z:door.z+1});if(!enterOpenField(game,door))throw new Error('The production field entry fixture could not start.');Object.assign(game.player,{x:8,z:8,yaw:Math.PI/4,pitch:-.06,flashlightOn:true});}
     },render(dt){game.elapsed+=dt;view.render(game,game.elapsed,false);}});
   }
   const assets=()=>{const a=prologueView.diagnostics().assets||{};const items=(currentType==='prologue'?['car','cast','road','mist']:[]).map(name=>({name,status:a[name]==='ready'?'ready':'fallback'}));items.push({name:'field',status:view.visuals.status==='ready'?'ready':'fallback'},{name:'player-arms',status:view.visuals.hands?.status==='ready'?'ready':'fallback'});return {status:items.every(i=>i.status==='ready')?'ready':'fallback',items};};
   const quality=view.quality.snapshot().tier;
   return {quality,seed:7321,scenes,assets,renderInfo:()=>({calls:view.renderer.info.render.calls,triangles:view.renderer.info.render.triangles,quality}),restore};
  }catch(e){restore();throw e;}
 }
 });
}
