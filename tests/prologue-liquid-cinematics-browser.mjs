// Candidate diagnostic capture only. Not a substitute for continuous human QA
// or same-device baseline/candidate performance measurements. Never publishes.
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {chromium} from '../scripts/browser-runtime.mjs';
import {createPrologueTimeline} from '../src/prologue-script.js';
import {PROLOGUE_VOICE_TIMING} from '../src/prologue-voice-timing.js';
const base=process.env.CORNFIELD_TEST_URL;
if(!base)throw Error('Set an already-authorized candidate preview URL; this runner does not create a destination.');
const output='verification/liquid-cinematics-v1/browser',timeline=createPrologueTimeline({durations:PROLOGUE_VOICE_TIMING}),at=(id,t)=>timeline.chapters.find(c=>c.id===id).start+t;
const report={timestamp:new Date().toISOString(),commit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),method:'Manual-clock runtime diagnostic captures, not human playtest or measured FPS',screenshots:[],errors:[],status:'running'};
await mkdir(output,{recursive:true});const browser=await chromium.launch({headless:true,chromiumSandbox:true});
try{
 for(const viewport of [{width:1280,height:720},{width:844,height:390}]){
  const page=await browser.newPage({viewport,deviceScaleFactor:1});page.on('pageerror',e=>report.errors.push(String(e)));
  await page.goto(`${base}${base.includes('?')?'&':'?'}test=1&intro=on`);await page.waitForFunction(()=>window.__test?.intro().coreReady);await page.locator('#start-btn').click();
  await page.waitForFunction(()=>window.__test?.intro().prologueVisuals?.assets?.cast==='ready');
  async function seek(t){await page.evaluate(async target=>{const {followApproachTarget}=await import('./src/prologue-layout.js');for(let n=0;n<16000;n++){
   const s=window.__test.intro();if(s.time>=target-1e-8||s.phase!=='playing')break;const p=s.story.player,c={};
   if(s.story.waitingForExit)c.interact=true;else if(p.y>1.5&&!['redroom','rupture'].includes(s.story.chapter)){const a=followApproachTarget(p,s.story.escorts),dx=a.x-p.x,dz=a.z-p.z;if(Math.hypot(dx,dz)>.28){c.forward=1;c.yaw=Math.atan2(-dx,-dz);}}
   window.__test.step(Math.min(.05,target-s.time),c,false);
  }window.advanceTime(0);},t);}
  for(const [name,t]of [['wake-closed',0],['radio-contact',4.15],['bridge',at('undead',1)],['zombie-peak',at('undead',2.3)],['blink-reset',at('undead',3.85)],['normal-restored',at('undead',4.5)],['room-cover',at('redroom',.6)],['projector',at('redroom',5)],['room-return',at('redroom',11.8)],['liquid-rise',at('rupture',5)],['liquid-ribbons',at('rupture',7.5)]]){
   await seek(t);const file=`${viewport.width}-${name}.png`;await page.screenshot({path:`${output}/${file}`});report.screenshots.push(file);
  }
  const state=await page.evaluate(()=>window.__test.intro());assert.equal(state.prologueVisuals.error,null);assert.equal(state.prologueVisuals.hallucination.status,'ready');
  await page.keyboard.press('KeyK');assert.equal(await page.locator('#story-eyelids').isVisible(),false);await page.close();
 }
 assert.deepEqual(report.errors,[]);report.status='passed';
}catch(error){report.status='failed';report.error=String(error);throw error;}
finally{await browser.close();await writeFile(`${output}/report.json`,JSON.stringify(report,null,2));}
