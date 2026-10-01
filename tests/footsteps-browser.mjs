import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from '../scripts/browser-runtime.mjs';

const output='output/footsteps-2026-10-01/browser',base=process.env.CORNFIELD_TEST_URL||'http://127.0.0.1:4180/cornfields/';
await mkdir(output,{recursive:true});
const report={status:'running',checks:[],errors:[],devices:[]};
const browser=await chromium.launch({headless:true}),deadline=setTimeout(()=>browser.close(),150000);
let page;
async function load(touch=false,query='',missing=false){
  await page?.close();page=await browser.newPage({viewport:touch?{width:844,height:390}:{width:1280,height:720},deviceScaleFactor:1,isMobile:touch,hasTouch:touch});
  page.setDefaultTimeout(15000);page.on('pageerror',error=>report.errors.push(String(error)));
  page.on('console',message=>{if(message.type()==='error'&&!missing)report.errors.push(message.text());});
  if(missing)await page.route('**/assets/audio/footsteps/*.mp3',route=>route.fulfill({status:404,body:'Optional sample unavailable'}));
  await page.goto(`${base}?test=1${query}`,{waitUntil:'networkidle'});await page.bringToFront();
  await page.waitForFunction(()=>window.__test?.intro().coreReady);
  if(touch)await page.locator('#start-btn').tap();else await page.locator('#start-btn').click();
  await page.waitForFunction(()=>['ready','fallback'].includes(window.__test.diagnostics().footstepAudio?.state));
  await page.evaluate(()=>window.advanceTime(0));
}
const diag=()=>page.evaluate(()=>window.__test.diagnostics());
const intro=()=>page.evaluate(()=>window.__test.intro());
async function walk(seconds,input={forward:1}){
  for(let t=0;t<seconds;t+=.1){await page.evaluate(input=>window.__test.step(.1,input),input);await page.waitForTimeout(40);}
}
try{
  await load();assert.equal((await diag()).footstepAudio.buffers,14);
  assert.equal((await diag()).footstepAudio.played,0);
  await page.evaluate(()=>window.advanceTime(150000));
  const before=(await diag()).footstepAudio.played;
  for(let i=0;i<100;i++){await page.evaluate(()=>window.advanceTime(100));await page.waitForTimeout(20);}
  const after=(await diag()).footstepAudio;for(const actor of ['mike','clarence','stanley'])assert.ok(after.actors[actor]>0,actor);
  assert.ok(after.played>before);assert.equal(after.last.owner,'prologue');
  await page.screenshot({path:`output/footsteps-2026-10-01/browser/cinematic.png`});
  await page.keyboard.press('Escape');const paused=(await diag()).footstepAudio.played;
  await page.evaluate(()=>window.advanceTime(2000));assert.equal((await diag()).footstepAudio.played,paused);assert.equal((await diag()).footstepAudio.voices,0);
  await page.locator('#intro-continue').click();await page.evaluate(()=>window.advanceTime(0));
  assert.equal((await diag()).footstepAudio.played,paused);
  await page.keyboard.press('KeyK');await page.evaluate(()=>window.advanceTime(4000));
  assert.equal((await intro()).phase,'finished');assert.equal((await diag()).footstepAudio.voices,0);
  report.checks.push('Decoded all 14 shared samples; all three cinematic actors sound through opening bus; pause, resume and skip do not catch up');
  for(const touch of [false,true]){
    await load(touch,'&intro=off');
    await page.evaluate(()=>window.__test.fixture('corridor'));await walk(1.2);
    const moving=await diag();assert.ok(moving.footstepAudio.actors.player>0);assert.equal(moving.footstepAudio.fallback,0);
    const count=moving.footstepAudio.actors.player;await walk(.4,{});assert.equal((await diag()).footstepAudio.actors.player,count);
    await walk(.8,{forward:1,sprint:true});assert.ok((await diag()).footstepAudio.actors.player>count);
    await page.screenshot({path:`${output}/${touch?'phone':'desktop'}-gameplay.png`});
    // A fresh run keeps this field contact independent of the corridor fixture's cursor.
    await load(touch,'&intro=off');await page.evaluate(()=>window.__test.fixture('field'));await walk(.6);
    assert.ok((await diag()).footstepAudio.actors.player>0);assert.equal((await diag()).weather.lastFootstep.surface,'soft');
    report.devices.push({touch,audio:(await diag()).footstepAudio});
  }
  report.checks.push('Desktop and touch: actual movement, sprint, stopping, shared recordings and field surface');
  await load(true,'&intro=off&survival=off');await walk(.5);
  const wet=await diag();assert.ok(wet.weather.wetSteps>0);assert.equal(wet.footstepAudio.wet,wet.weather.wetSteps);
  assert.ok(wet.weather.splashes>0);report.checks.push('Wet impact and ripple share the same single contact');
  await load(true,'&intro=off&weather=off');await walk(.6);assert.ok((await diag()).footstepAudio.actors.player>0);assert.equal((await diag()).footstepAudio.last.surface,'soft');
  report.checks.push('Weather disabled still plays footsteps');
  await load(true,'&intro=off',true);await walk(.6);assert.ok((await diag()).footstepAudio.fallback>0);assert.equal((await diag()).mode,'playing');
  report.checks.push('Missing recordings preserve play and synthesize immediate footsteps');
  assert.deepEqual(report.errors,[]);report.status='passed';
}catch(error){report.status='failed';report.failure=String(error);throw error;}
finally{clearTimeout(deadline);await browser.close();await writeFile(`${output}/report.json`,JSON.stringify(report,null,2));console.log(JSON.stringify({status:report.status,checks:report.checks,errors:report.errors,failure:report.failure}));}
