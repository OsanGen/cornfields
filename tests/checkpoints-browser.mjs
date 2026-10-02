import assert from 'node:assert/strict';
import path from 'node:path';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from '../scripts/browser-runtime.mjs';
import {startPreview} from '../scripts/preview-dist.mjs';
import {captureGame} from './helpers/capture.mjs';
import {SURVIVAL_LINES} from '../src/survival-script.js';

const output=process.env.CORNFIELD_CHECKPOINT_OUTPUT||'output/scarecrow-checkpoints-2026-10-02/browser';
await mkdir(output,{recursive:true});
const preview=await startPreview({port:0,basePath:'/cornfields/',seconds:240});
const browser=await chromium.launch({headless:true,args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const report={errors:[],devices:[],performance:[],method:'Packaged desktop and emulated touch. Fixtures position players; checkpoint activation uses real movement and collision. Matched GPU-completed render samples are local headless measurements, not phone FPS.'};
const deadline=setTimeout(()=>browser.close(),210000);
const state=page=>page.evaluate(()=>window.__test.state());
const diagnostics=page=>page.evaluate(()=>window.__test.diagnostics());
const fixture=(page,name)=>page.evaluate(name=>window.__test.fixture(name),name);
const step=(page,seconds,input={})=>page.evaluate(({seconds,input})=>window.__test.step(seconds,input),{seconds,input});
const pause=(page,touch)=>touch?page.locator('#touch-pause').tap():page.keyboard.press('Escape');
async function open(touch,url=preview.url,extra=''){
  const page=await browser.newPage({viewport:touch?{width:844,height:390}:{width:1280,height:720},hasTouch:touch,isMobile:touch,deviceScaleFactor:1});
  page.setDefaultTimeout(15000);page.on('pageerror',e=>report.errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text());});
  await page.goto(url+'?test=1&intro=off&quality=balanced'+extra,{waitUntil:'networkidle'});await page.bringToFront();
  await page.waitForFunction(()=>window.__test?.intro().coreReady);await step(page,0);await page.locator('#start-btn')[touch?'tap':'click']();
  return page;
}
async function measure(page,label,touch){
  const result=await page.evaluate(async()=>{
    const gl=document.querySelector('#scene').getContext('webgl2'),samples=[];
    for(let i=0;i<36;i++){
      await new Promise(resolve=>requestAnimationFrame(resolve));const at=performance.now();
      window.__test.render(10+i/60);gl.finish();if(i>=6)samples.push(performance.now()-at);
    }
    samples.sort((a,b)=>a-b);const d=window.__test.diagnostics();
    return {p50Ms:samples[15],p95Ms:samples[28],drawCalls:d.drawCalls,triangles:d.triangles};
  });report.performance.push({label,device:touch?'touch':'desktop',...result});
}
try{
  const briefing=await open(false,preview.url,'&ending=on');
  for(let i=0;i<80&&(await state(briefing)).survivalEnding.phase!=='room';i++)await step(briefing,.1);
  assert.equal((await state(briefing)).survivalEnding.phase,'room');
  const cue=SURVIVAL_LINES.find(line=>line.id==='GATE-HEAL');await step(briefing,cue.start+.04-(await state(briefing)).survivalEnding.time);
  assert.equal(await briefing.locator('#ending-caption').textContent(),cue.text);
  await briefing.waitForFunction(()=>!window.__test.diagnostics().survivalAudio.loading);await step(briefing,0);
  assert.equal((await diagnostics(briefing)).survivalAudio.voice,'GATE-HEAL');
  await captureGame(briefing,{path:`${output}/healing-briefing.png`});await briefing.close();report.healingBriefing='Voiced and subtitled GATE-HEAL';
  for(const touch of [false,true]){
    const name=touch?'touch':'desktop',page=await open(touch);
    await page.waitForFunction(()=>window.__test.diagnostics().visuals.scarecrows.status==='ready'&&window.__test.diagnostics().creature&&window.__test.diagnostics().audioSamples.includes('unity'));
    await fixture(page,'checkpoint-1');await captureGame(page,{path:`${output}/${name}-scarecrow.png`});
    const before=await state(page);await step(page,.58,{forward:1});await step(page,.2);
    const first=await state(page);assert.equal(first.player.health,100);assert.equal(first.progress.activatedCheckpoints.length,1);assert(first.checkpointVision.active);
    assert.equal(await page.locator('#caption').textContent(),'WE ARE ONE');
    const owners=await page.evaluate(()=>['caption','threat-card','hide-status','corn-taunt'].filter(id=>!document.getElementById(id).hidden));assert.deepEqual(owners,['caption']);
    assert(first.survivalEnding.remaining<before.survivalEnding.remaining);await captureGame(page,{path:`${output}/${name}-vision-first.png`});
    const at=first.player.z;await step(page,.12,{forward:1});assert.notEqual((await state(page)).player.z,at);
    await pause(page,touch);const paused=await state(page);assert.equal(paused.mode,'paused');await step(page,2);assert.deepEqual((await state(page)).checkpointVision,paused.checkpointVision);
    await page.locator('#resume-btn')[touch?'tap':'click']();await step(page,1.5);assert.equal((await state(page)).checkpointVision.active,false);
    await fixture(page,'checkpoint-2');await step(page,.58,{forward:1});await step(page,.2);const second=await state(page);
    assert(second.checkpointVision.red>first.checkpointVision.red);assert(second.checkpointVision.amount>first.checkpointVision.amount);
    assert.equal(second.progress.activatedCheckpoints.length,2);await captureGame(page,{path:`${output}/${name}-vision-second.png`});
    await step(page,1.5);const count=(await state(page)).metrics.checkpointTimes.length;await step(page,.1,{forward:-1});assert.equal((await state(page)).metrics.checkpointTimes.length,count);
    await fixture(page,'beam-chase');await page.evaluate(()=>window.__test.render(10));const chase=(await diagnostics(page)).creature.beams;
    assert(chase.active);assert(chase.lengths.every(n=>n>.2&&n<=5.8));await captureGame(page,{path:`${output}/${name}-beam-chase.png`});
    await fixture(page,'beam-rage');await page.evaluate(()=>window.__test.render(10.4));const rage=(await diagnostics(page)).creature.beams;
    assert(rage.active);assert(rage.lightIntensity>chase.lightIntensity);await captureGame(page,{path:`${output}/${name}-beam-rage.png`});
    await measure(page,'updated-rage',touch);
    await fixture(page,'beam-stagger');assert.equal((await diagnostics(page)).creature.beams.active,false);
    await fixture(page,'encounter');await step(page,.56);assert.equal((await diagnostics(page)).creature.beams.active,false);
    await pause(page,touch);await page.locator('#motion').check();await page.locator('#resume-btn')[touch?'tap':'click']();
    await fixture(page,'beam-rage');await page.evaluate(()=>window.__test.render(10.4));const reduced=(await diagnostics(page)).creature.beams;
    assert(reduced.reduced);assert(reduced.lightIntensity<rage.lightIntensity);
    await fixture(page,'checkpoint-1');await step(page,.58,{forward:1});await step(page,.2);assert((await state(page)).checkpointVision.amount<first.checkpointVision.amount/4);
    await captureGame(page,{path:`${output}/${name}-reduced.png`});
    report.devices.push({name,scarecrows:(await diagnostics(page)).visuals.scarecrows,first:first.checkpointVision,second:second.checkpointVision,chase,rage,reduced,warningOwners:owners});await page.close();
  }
  const fallback=await browser.newPage({viewport:{width:1280,height:720}});fallback.setDefaultTimeout(15000);
  await fallback.route('**/assets/field/scarecrow.glb',route=>route.abort());
  await fallback.goto(preview.url+'?test=1&intro=off',{waitUntil:'networkidle'});await fallback.bringToFront();await fallback.waitForFunction(()=>window.__test?.diagnostics().visuals.scarecrows.status==='fallback');
  await fixture(fallback,'checkpoint-1');await captureGame(fallback,{path:`${output}/fallback.png`});await step(fallback,.58,{forward:1});assert.equal((await state(fallback)).player.health,100);await fallback.close();
  if(process.env.CORNFIELD_BASELINE_DIST){
    const baseline=await startPreview({root:path.resolve(process.env.CORNFIELD_BASELINE_DIST),port:0,basePath:'/cornfields/',seconds:90});
    try{for(const touch of [false,true]){const page=await open(touch,baseline.url);await fixture(page,'corridor');await measure(page,'baseline-idle',touch);await page.close();}}
    finally{baseline.server.close();}
    for(const touch of [false,true]){const page=await open(touch);await fixture(page,'corridor');await measure(page,'updated-idle',touch);await page.close();}
  }
  assert.deepEqual(report.errors,[]);report.status='passed';
}catch(error){report.status='failed';report.failure=String(error);console.error(error);process.exitCode=1;}
finally{clearTimeout(deadline);await browser.close();preview.server.close();await writeFile(output+'/report.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));}
