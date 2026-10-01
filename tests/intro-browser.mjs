import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from '../scripts/browser-runtime.mjs';

const output='output/intro/browser',base=process.env.CORNFIELD_TEST_URL||'http://127.0.0.1:4180/cornfields/';
await mkdir(output,{recursive:true});
const report={status:'running',checks:[],errors:[],performance:{},method:'One sequential browser. Desktop 1280x720 and touch emulation, DPR 1. Fixed state, 30 warm frames and 120 measured rAF intervals. No physical-device claim.'};
const browser=await chromium.launch({headless:process.env.CORNFIELD_HEADED!=='1'});
const deadline=setTimeout(()=>browser.close(),210000);
let page;
const state=()=>page.evaluate(()=>window.__test.state());
const intro=()=>page.evaluate(()=>window.__test.intro());
const advance=ms=>page.evaluate(ms=>window.advanceTime(ms),ms);
const sample=async t=>{const s=await intro();await advance(Math.max(0,t*1000-s.time*1000));};
const shot=name=>page.screenshot({path:`${output}/${name}.png`});
async function load({touch=false,query='',width=1280,height=720}={}){
  await page?.close();
  page=await browser.newPage({viewport:{width,height},deviceScaleFactor:1,isMobile:touch,hasTouch:touch});
  page.setDefaultTimeout(16000);
  page.on('pageerror',error=>report.errors.push(String(error)));
  page.on('console',message=>{if(message.type()==='error')report.errors.push(message.text());});
  await page.goto(`${base}?test=1&prologue=off${query}`,{waitUntil:'networkidle'});await page.bringToFront();
  await page.waitForFunction(()=>window.__test?.intro().coreReady);
}
async function measure(){
  return page.evaluate(async()=>{
    const intervals=[];let last=performance.now();
    for(let i=0;i<150;i++)await new Promise(resolve=>requestAnimationFrame(now=>{if(i>=30)intervals.push(now-last);last=now;resolve();}));
    intervals.sort((a,b)=>a-b);const d=window.__test.diagnostics();
    return {samples:intervals.length,p95Ms:intervals[114],medianMs:intervals[60],drawCalls:d.intro?.phase!=='finished'?d.intro.visuals?.draws:d.drawCalls,intro:d.intro};
  });
}
try{
  await load();await shot('00-preflight');
  const frozen=await state();await page.locator('#player-alias').fill('ROWAN');await page.locator('#start-btn').click();await advance(0);
  assert.equal(await page.evaluate(()=>document.pointerLockElement),null);
  for(const [t,name] of [[4,'studio'],[7,'eyes'],[10,'story'],[14,'creator'],[17,'tunnel'],[19,'title']]){
    await sample(t);await shot(`01-${name}`);assert.deepEqual(await state(),frozen);
    assert.ok((await intro()).visuals.draws<=25);assert.ok((await intro()).visuals.postprocessDraws<=3);
  }
  await page.evaluate(()=>window.dispatchEvent(new Event('blur')));const stopped=await intro();await advance(10000);
  assert.equal((await intro()).time,stopped.time);assert.equal((await intro()).phase,'paused');
  await page.locator('#intro-continue').click();await advance(0);await sample(20);
  assert.equal((await intro()).phase,'ready');assert.deepEqual(await state(),frozen);
  await page.locator('#intro-enter').click();await page.waitForFunction(()=>window.__test.state().mode==='playing');await advance(0);
  assert.equal((await state()).player.ammo,2);assert.equal((await intro()).visuals.live,false);
  const introFrames=(await intro()).visuals.frames;
  await shot('02-entered');report.performance.afterIntro=await measure();
  assert.equal((await intro()).visuals.frames,introFrames);
  // Exercise actual QTE action edges after the new entry path.
  await page.evaluate(()=>{window.__test.fixture('encounter');window.__test.step(.56);});
  assert.equal((await state()).interaction.phase,'qte');
  for(let i=0;i<8;i++){await page.keyboard.press('Space');await advance(3);}
  assert.equal((await state()).interaction.phase,'stab');await advance(1000);
  assert.equal((await state()).interaction.phase,'recovery');
  await page.keyboard.press('Escape');const paused=await state();
  for(let i=0;i<5;i++){
    await page.locator('#replay-intro').click();await advance(0);await sample(4);await page.locator('#intro-skip').click();
    assert.deepEqual(await state(),paused);assert.equal((await intro()).visuals.live,false);
  }
  report.checks.push('Desktop cards/eyes/tunnel/title, frozen simulation, pause/continue, fresh pointer lock, no entry shot, QTE/recovery, five replay cleanups');
  await load({query:'&intro=off'});await page.locator('#start-btn').click();await page.waitForFunction(()=>window.__test.state().mode==='playing');await advance(0);
  report.performance.withoutIntro=await measure();
  report.performance.gameplayRatio=report.performance.afterIntro.p95Ms/report.performance.withoutIntro.p95Ms;
  await load();await page.locator('#start-btn').click();await advance(0);await sample(17);
  report.performance.intro=await measure();
  for(const [width,height] of [[1920,1080],[800,600],[320,640]]){
    await page.setViewportSize({width,height});await sample(19);
    assert.ok(await page.locator('#intro-name').evaluate(el=>el.scrollWidth<=el.clientWidth+1));await shot(`03-title-${width}`);
  }
  await load({touch:true,width:844,height:390});
  await page.locator('#start-btn').tap();await advance(0);await sample(14);
  for(const [width,height] of [[844,390],[667,375],[320,640]]){
    await page.setViewportSize({width,height});
    // Resize/orientation may pause the intro. Resume deliberately for a readable card.
    if((await intro()).phase==='paused'){await page.locator('#intro-continue').tap();await advance(0);}
    assert.ok(await page.locator('#intro-label').evaluate(el=>el.scrollWidth<=el.clientWidth+1));await shot(`04-phone-${width}`);
  }
  await page.setViewportSize({width:844,height:390});await page.locator('#intro-skip').tap();await page.locator('#intro-enter').tap();
  await page.waitForFunction(()=>window.__test.state().mode==='playing');await advance(0);
  assert.equal(await page.locator('#touch-controls').isVisible(),true);assert.equal((await state()).player.ammo,2);
  report.checks.push('Touch intro and native entry, responsive credits at 844/667/320 CSS widths');
  await load({query:'&introfx=off'});await page.locator('#intro-motion').check();await page.locator('#start-btn').click();await advance(0);await sample(14);
  assert.equal((await intro()).visuals.mode,'fallback');await shot('05-reduced-fallback');await page.locator('#intro-skip').click();
  report.checks.push('Reduced effects, composer fallback, skip to quiet ready');
  assert.deepEqual(report.errors,[]);
  assert.ok(report.performance.intro.p95Ms<=33.3,`Intro p95 ${report.performance.intro.p95Ms} exceeds 33.3 ms`);
  assert.ok(report.performance.gameplayRatio<=1.1,`Post-intro gameplay ratio ${report.performance.gameplayRatio} exceeds 1.1`);
  report.status='passed';
}catch(error){report.status='failed';report.failure=String(error);throw error;}
finally{clearTimeout(deadline);await browser.close();await writeFile(`${output}/report.json`,JSON.stringify(report,null,2));console.log(JSON.stringify(report));}
