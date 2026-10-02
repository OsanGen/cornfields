import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from '../scripts/browser-runtime.mjs';
import {createPrologueTimeline} from '../src/prologue-script.js';
import {PROLOGUE_VOICE_TIMING} from '../src/prologue-voice-timing.js';

const output=process.env.CORNFIELD_TEST_OUTPUT||'output/intro-gameplay-2026-10-02/browser';
const base=process.env.CORNFIELD_TEST_URL||'http://127.0.0.1:4173/';
const timeline=createPrologueTimeline({durations:PROLOGUE_VOICE_TIMING});
await mkdir(output,{recursive:true});
const report={status:'running',errors:[],devices:[],method:'Desktop Chrome and touch emulation, fixed clock and actual runtime assets. Physical phone performance remains a playtest item.'};
const browser=await chromium.launch({headless:true}),deadline=setTimeout(()=>browser.close(),150000);
try{
  for(const touch of [false,true]){
    const name=touch?'phone':'desktop',page=await browser.newPage({viewport:touch?{width:844,height:390}:{width:1280,height:720},isMobile:touch,hasTouch:touch,deviceScaleFactor:1});
    page.setDefaultTimeout(18000);page.on('pageerror',e=>report.errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text());});
    await page.goto(base+'?test=1&intro=on',{waitUntil:'networkidle'});await page.bringToFront();await page.waitForFunction(()=>window.__test?.intro().coreReady);
    await page.locator('#start-btn')[touch?'tap':'click']();
    await page.waitForFunction(()=>window.__test.intro().prologueVisuals?.assets?.cast==='ready');
    const step=(seconds,input={})=>page.evaluate(({seconds,input})=>window.__test.step(seconds,input),{seconds,input});
    const shot=async label=>{await step(0);await page.screenshot({path:`${output}/${name}-${label}.png`});};
    await step(2,{yaw:1.25,pitch:-.20});await shot('driver');
    const initial=await page.evaluate(()=>window.__test.intro());
    assert.equal(initial.prologueVisuals.assets.car,'ready');assert.equal(initial.prologueVisuals.actors[0].textured,true);
    await step(timeline.chapters.find(c=>c.id==='dispatch').start-initial.time+4,{yaw:0,pitch:0});await shot('pull-over');
    const now=await page.evaluate(()=>window.__test.intro());
    await step(timeline.chapters.find(c=>c.id==='exit').start-now.time+.1);
    await page.locator(touch?'#touch-interact':'#scene')[touch?'tap':'click']();
    if(!touch)await page.keyboard.press('KeyE');await page.evaluate(()=>window.advanceTime(1200));
    const exited=await page.evaluate(()=>window.__test.intro());
    await step(Math.max(.02,timeline.chapters.find(c=>c.id==='flashlight').start-exited.time+.2),{flashlight:true,yaw:.35,pitch:-.1});await shot('outside');
    const story=await page.evaluate(()=>window.__test.intro());assert.equal(story.story.player.flashlightOn,true);
    const equip=await page.evaluate(()=>window.__test.diagnostics().visuals.prologueEquipment);assert.equal(equip.flashlight,true);
    await page.keyboard.press('KeyK');if(touch){await page.locator('#intro-skip').click().catch(()=>{});}await step(0);
    await page.evaluate(()=>window.__test.fixture('viewmodel'));await step(0,{yaw:Math.PI});
    let state=await page.evaluate(()=>window.__test.state());if(!state.player.flashlightOn)await step(.01,{flashlight:true});
    await shot('gun-torch');
    const d=await page.evaluate(()=>window.__test.diagnostics());assert.equal(d.visuals.hands.flashlightStatus,'ready');
    await step(.01,{flashlight:true});await shot('gun-only');
    await page.evaluate(()=>window.__test.fixture('encounter'));await step(.56);await shot('knife');
    report.devices.push({name,assets:initial.prologueVisuals.assets,hands:d.visuals.hands});await page.close();
  }
  const page=await browser.newPage({viewport:{width:844,height:390},hasTouch:true,isMobile:true});
  page.on('pageerror',e=>report.errors.push(String(e)));
  await page.route('**/assets/intro/*.glb',route=>route.fulfill({status:404,body:'Optional asset unavailable'}));
  await page.route('**/handheld-flashlight.glb',route=>route.fulfill({status:404,body:'Optional flashlight unavailable'}));
  await page.goto(base+'?test=1&intro=on',{waitUntil:'networkidle'});await page.bringToFront();await page.waitForFunction(()=>window.__test?.intro().coreReady);await page.locator('#start-btn').tap();
  await page.waitForFunction(()=>window.__test.intro().prologueVisuals.assets.cast==='fallback');
  const d=await page.evaluate(()=>window.__test.diagnostics());assert.equal(d.visuals.hands.status,'ready');assert.equal(d.visuals.hands.flashlightStatus,'fallback');
  await page.locator('#story-skip').tap();await page.locator('#intro-skip').tap();assert.equal((await page.evaluate(()=>window.__test.state())).mode,'playing');await page.close();
  report.fallback='passed';assert.deepEqual(report.errors,[]);report.status='passed';
}catch(error){report.status='failed';report.failure=String(error);console.error(error);process.exitCode=1;}
finally{clearTimeout(deadline);await browser.close();await writeFile(`${output}/report.json`,JSON.stringify(report,null,2));console.log(JSON.stringify(report));}
