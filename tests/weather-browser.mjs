import assert from 'node:assert/strict';
import {mkdir, writeFile} from 'node:fs/promises';
import {chromium} from '../scripts/browser-runtime.mjs';

const output=process.env.CORNFIELD_WEATHER_OUTPUT||'output/weather-update/browser';
const base=process.env.CORNFIELD_TEST_URL||'http://127.0.0.1:4180/cornfields/';
await mkdir(output,{recursive:true});
const browser=await chromium.launch({headless:true});
const report={checks:[],errors:[],devices:[]};
try{
  for(const touch of [true,false]){
    const kind=touch?'phone':'desktop';
    const page=await browser.newPage({viewport:touch?{width:844,height:390}:{width:1280,height:720},deviceScaleFactor:1,isMobile:touch,hasTouch:touch});
    page.setDefaultTimeout(12000);
    page.on('pageerror',e=>report.errors.push(String(e)));
    page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text());});
    page.on('response',r=>{if(r.status()>=400)report.errors.push(`${r.status()} ${r.url()}`);});
    const state=()=>page.evaluate(()=>window.__test.state());
    const diagnostics=()=>page.evaluate(()=>window.__test.diagnostics());
    const step=(seconds,input={})=>page.evaluate(({seconds,input})=>window.__test.step(seconds,input),{seconds,input});
    const click=async selector=>touch?await page.locator(selector).tap():await page.locator(selector).click();
    const shot=async name=>{
      await page.screenshot({path:`${output}/${kind}-${name}.png`});
      await writeFile(`${output}/${kind}-${name}.json`,JSON.stringify(await diagnostics(),null,2));
    };
    await page.goto(base+'?test=1&intro=off',{waitUntil:'networkidle'});
    await page.waitForFunction(()=>window.__test?.diagnostics().visuals.zombie.status==='ready');
    assert.equal((await diagnostics()).controlMode,touch?'touch':'mouse');
    await click('#start-btn');await step(0);
    if(!touch)await page.waitForFunction(()=>document.pointerLockElement===document.getElementById('scene'));
    await page.waitForFunction(()=>window.__test.diagnostics().weatherAudioSamples.length===4);
    await step(.44,{forward:1,yaw:0,pitch:-.9});await step(.22);
    let s=await state();assert.ok(s.weather.wetSteps>=1);assert.ok(s.weather.activeRipples>0);
    assert.ok((await diagnostics()).visuals.weather.activeRipples>0);
    await shot('01-wet-footsteps');
    await step(.26,{forward:-1,yaw:0,pitch:-.9});await shot('01b-visible-ripple');
    const steps=s.weather.wetSteps+s.weather.drySteps;
    await step(.2);assert.equal((await state()).weather.wetSteps+(await state()).weather.drySteps,steps);
    await step(12.27-(await state()).elapsed,{pitch:-.45});
    s=await state();assert.ok(s.weather.lightning>.5);await shot('02-lightning');
    if(touch)await click('#touch-pause');else await page.keyboard.press('Escape');
    await step(0);s=await state();assert.equal(s.mode,'paused');
    const paused=s.weather;await step(5);assert.deepEqual((await state()).weather,paused);
    await click('#resume-btn');await step(0);
    await step(paused.thunderAt-(await state()).elapsed+.04);
    assert.equal((await state()).weather.thunders,1);await shot('03-storm');
    if(!touch){await page.keyboard.press('KeyM');await step(.02);assert.equal((await diagnostics()).muted,true);
      await page.keyboard.press('KeyM');await step(.02);assert.equal((await diagnostics()).muted,false);}
    if(touch)await click('#touch-pause');else await page.keyboard.press('Escape');
    await page.locator('#motion').check();await click('#resume-btn');await step(.02);
    assert.equal((await state()).weather.lightning,0);
    if(touch)await click('#touch-pause');else await page.keyboard.press('Escape');
    await click('#restart-btn');await step(0);
    s=await state();assert.equal(s.weather.wetSteps,0);assert.equal(s.weather.thunders,0);
    assert.equal(s.weather.activeRipples,0);assert.equal(s.weather.thunderAt,null);
    report.checks.push(`${kind}: automatic controls, decoded audio, wet footsteps/ripples, stationary stop, lightning then thunder, pause/resume, reduced effects, restart`);
    report.devices.push({kind,diagnostics:await diagnostics()});await page.close();
  }
  const page=await browser.newPage({viewport:{width:844,height:390},isMobile:true,hasTouch:true});
  page.on('pageerror',e=>report.errors.push(String(e)));
  await page.route('**/assets/audio/*.mp3',route=>route.abort());
  await page.goto(base+'?test=1&intro=off',{waitUntil:'networkidle'});
  await page.locator('#start-btn').tap();
  await page.evaluate(()=>{window.advanceTime(0);window.__test.step(.44,{forward:1});});
  assert.equal(await page.evaluate(()=>window.__test.state().mode),'playing');
  assert.ok(await page.evaluate(()=>window.__test.state().weather.wetSteps>0));
  await page.goto(base+'?test=1&intro=off&weather=off',{waitUntil:'networkidle'});
  await page.locator('#start-btn').tap();await page.evaluate(()=>window.advanceTime(0));
  assert.equal(await page.evaluate(()=>window.__test.diagnostics().weather.enabled),false);
  assert.equal(await page.evaluate(()=>window.__test.diagnostics().weatherAudioSamples.length),0);
  report.checks.push('Missing weather audio keeps play/ripples working; weather=off restores dry comparison without weather loads');
  await page.close();assert.deepEqual(report.errors,[]);report.status='passed';
}catch(error){report.status='failed';report.failure=String(error);throw error;}
finally{await browser.close();await writeFile(`${output}/report.json`,JSON.stringify(report,null,2));console.log(JSON.stringify(report));}
