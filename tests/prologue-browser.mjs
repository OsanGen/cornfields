import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from '../scripts/browser-runtime.mjs';

const output=process.env.CORNFIELD_PROLOGUE_OUTPUT||'output/prologue-2026-10-01/browser',base=process.env.CORNFIELD_TEST_URL||'http://127.0.0.1:4180/cornfields/';
await mkdir(output,{recursive:true});
const report={status:'running',checks:[],errors:[],shots:[],performance:{},method:'Sequential headless desktop Chromium and touch emulation; deterministic story seeks, real pointer capture and Web Audio decode. Performance uses 30 warm plus 120 measured rAF callbacks, each explicitly rendering with advanceTime. Physical phone and first-time viewer acceptance remain separate.'};
const browser=await chromium.launch({headless:process.env.CORNFIELD_HEADED!=='1'});
const deadline=setTimeout(()=>browser.close(),180000);let page;
const intro=()=>page.evaluate(()=>window.__test.intro());
const state=()=>page.evaluate(()=>window.__test.state());
const advance=ms=>page.evaluate(ms=>window.advanceTime(ms),ms);
const gameOnly=state=>{const {opening,...game}=state;return game;};
async function shot(name){await page.screenshot({path:`${output}/${name}.png`});report.shots.push(name);}
async function seek(time){const now=await intro();await advance(Math.max(0,time-now.time)*1000);}
async function measure(stepMs=0){
  return page.evaluate(async stepMs=>{
    const intervals=[],cpu=[];let last=performance.now();
    for(let i=0;i<150;i++)await new Promise(resolve=>requestAnimationFrame(time=>{
      const start=performance.now();window.advanceTime(stepMs);const cost=performance.now()-start;
      if(i>=30){intervals.push(time-last);cpu.push(cost);}last=time;resolve();
    }));
    intervals.sort((a,b)=>a-b);cpu.sort((a,b)=>a-b);
    return {samples:120,p95FrameMs:intervals[114],p95CpuRenderMs:cpu[114],drawCalls:window.__test.diagnostics().drawCalls};
  },stepMs);
}
async function load({touch=false,query='',missing=false}={}){
  await page?.close();page=await browser.newPage({viewport:touch?{width:844,height:390}:{width:1280,height:720},deviceScaleFactor:1,isMobile:touch,hasTouch:touch});
  page.setDefaultTimeout(18000);
  page.on('pageerror',error=>report.errors.push(String(error)));
  page.on('console',message=>{if(message.type()==='error'&&!missing)report.errors.push(message.text());});
  if(missing)await page.route('**/assets/audio/prologue/*.mp3',route=>route.fulfill({status:404,body:'Missing optional voice'}));
  await page.goto(`${base}?test=1${query}`,{waitUntil:'networkidle'});await page.bringToFront();
  await page.waitForFunction(()=>window.__test?.intro().coreReady);
}
try{
  await load();await shot('00-preflight');const before=gameOnly(await state());
  await page.locator('#start-btn').click();await page.waitForFunction(()=>window.__test.intro().phase==='playing');
  // Allow one real-time spoken utterance to decode and begin before manual scenes.
  await page.waitForFunction(()=>window.__test.intro().prologueAudio?.playing,{},{timeout:12000});
  report.audio=await intro();await advance(0);
  assert.equal(await page.evaluate(()=>document.pointerLockElement?.id),'scene');
  for(const [time,name] of [[5,'01-cruiser'],[65,'02-dispatch'],[95,'03-stanley'],[157,'04-walk'],[215,'05-history'],[278,'06-vanished'],[299,'07-threshold'],[310,'08-rupture'],[324,'09-red-mist']]){
    await seek(time);await shot(name);assert.deepEqual(gameOnly(await state()),before);
    const info=await intro();assert.ok(info.prologueVisuals.live);assert.equal(info.prologueVisuals.error,null);
    report.lastScene=info.prologueVisuals;
    if(time===5)report.performance.cruiser=await measure(1000/60);
  }
  await seek(330);assert.equal((await intro()).stage,'credits');await shot('10-titles');
  await advance(16000);assert.equal((await intro()).stage,'return');await shot('11-return');
  await advance(4000);assert.equal((await state()).mode,'playing');assert.equal((await state()).elapsed,0);
  assert.equal((await state()).player.ammo,2);assert.equal((await intro()).prologueVisuals.live,false);assert.equal((await intro()).prologueAudio.buffers,0);await shot('12-gameplay');
  report.performance.afterOpening=await measure();
  await page.evaluate(()=>{window.__test.fixture('encounter');window.__test.step(.56);});
  assert.equal((await state()).interaction.phase,'qte');for(let i=0;i<8;i++){await page.keyboard.press('Space');await advance(3);}await advance(1000);
  assert.equal((await state()).interaction.phase,'recovery');
  await page.keyboard.press('Escape');const paused=gameOnly(await state());
  await page.locator('#replay-intro').click();await page.waitForFunction(()=>window.__test.intro().phase==='playing');await advance(0);
  await page.keyboard.press('KeyK');await advance(4000);assert.deepEqual(gameOnly(await state()),paused);assert.equal((await intro()).phase,'finished');
  report.checks.push('All story chapters, real voice decoding/playback, exact gameplay freeze, titles and direct handoff, resource release, QTE, replay preservation');
  await load({touch:true});await page.locator('#intro-motion').check();await page.locator('#start-btn').tap();await advance(0);await seek(155);
  await shot('13-phone-subtitle');
  assert.ok(await page.locator('#story-subtitle').evaluate(el=>el.scrollWidth<=el.clientWidth+1));
  assert.equal(await page.locator('#touch-controls').isVisible(),false);
  await page.locator('#opening-pause').tap();const stopped=await intro();await advance(30000);assert.equal((await intro()).time,stopped.time);
  await page.setViewportSize({width:390,height:844});await page.waitForFunction(()=>document.getElementById('intro-continue').disabled);await shot('14-portrait-pause');
  await page.setViewportSize({width:844,height:390});await page.locator('#intro-continue').tap();await advance(0);
  await page.locator('#story-skip').tap();assert.equal((await intro()).stage,'credits');await shot('15-phone-titles');
  await page.locator('#intro-skip').tap();await advance(4000);assert.equal((await state()).mode,'playing');assert.equal(await page.locator('#touch-controls').isVisible(),true);
  report.checks.push('Touch/reduced captions, portrait pause, landscape resume, separate story/full skips, immediate mobile controls');
  await load({missing:true});await page.locator('#start-btn').click();await advance(0);await seek(5);
  assert.ok((await state()).opening.subtitle);await page.keyboard.press('KeyK');await advance(4000);assert.equal((await state()).mode,'playing');
  report.checks.push('Missing optional voice files preserve readable subtitles and gameplay entry');
  await load({query:'&intro=off'});await page.locator('#start-btn').click();await page.waitForFunction(()=>window.__test.state().mode==='playing');assert.equal((await intro()).phase,'finished');
  await advance(0);report.performance.directEntry=await measure();
  report.checks.push('Existing intro=off direct-entry contract');assert.deepEqual(report.errors,[]);report.status='passed';
}catch(error){report.status='failed';report.failure=String(error);throw error;}
finally{clearTimeout(deadline);await browser.close();await writeFile(`${output}/report.json`,JSON.stringify(report,null,2));console.log(JSON.stringify({status:report.status,failure:report.failure,checks:report.checks,errors:report.errors}));}
