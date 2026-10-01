import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {chromium} from '../scripts/browser-runtime.mjs';
import {startPreview} from '../scripts/preview-dist.mjs';
import {captureGame} from './helpers/capture.mjs';

const output='output/shot-beacon-2026-10-01/browser';await mkdir(output,{recursive:true});
const preview=await startPreview({port:0,basePath:'/cornfields/',seconds:240});
const browser=await chromium.launch({headless:true,args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const deadline=setTimeout(()=>browser.close(),180000),report={errors:[],devices:[],performance:[],method:'Real start/fire inputs; deterministic movement and test scene fixtures. Touch is emulated. Audio measured at the master bus.'};
async function meter(page){
  return page.evaluate(async()=>{
    const analyser=window.__audioMeter,values=new Float32Array(analyser.fftSize);let peak=0;
    for(let i=0;i<16;i++){analyser.getFloatTimeDomainData(values);for(const value of values)peak=Math.max(peak,Math.abs(value));await new Promise(r=>setTimeout(r,8));}
    return peak;
  });
}
async function measure(page){
  return page.evaluate(()=>{
    const gl=document.querySelector('#scene').getContext('webgl2'),times=[];
    for(let i=0;i<35;i++){const start=performance.now();window.__test.step(1/60);gl.finish();if(i>=5)times.push(performance.now()-start);}
    times.sort((a,b)=>a-b);const d=window.__test.diagnostics();return {medianMs:times[15],p95Ms:times[28],drawCalls:d.drawCalls,triangles:d.triangles};
  });
}
try{
  for(const touch of [false,true]){
    const name=touch?'touch':'desktop',page=await browser.newPage({viewport:touch?{width:844,height:390}:{width:1280,height:720},hasTouch:touch,isMobile:touch,deviceScaleFactor:1});
    page.setDefaultTimeout(20000);page.on('pageerror',e=>report.errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text());});
    await page.addInitScript(()=>{
      const Original=window.AudioContext||window.webkitAudioContext;
      window.AudioContext=class extends Original{createGain(){const gain=super.createGain();if(!this.testMeter){this.testMeter=this.createAnalyser();this.testMeter.fftSize=32768;gain.connect(this.testMeter);window.__audioMeter=this.testMeter;}return gain;}};
    });
    await page.goto(preview.url+'?test=1&intro=off&horror=off&quality=balanced',{waitUntil:'networkidle'});await page.bringToFront();
    await page.waitForFunction(()=>window.__test?.intro().coreReady);await page.evaluate(()=>window.__test.step(0));
    await page.locator('#start-btn')[touch?'tap':'click']();
    await page.waitForFunction(()=>window.__test.diagnostics().weaponAudio.sample==='ready');
    await page.evaluate(()=>{window.__test.fixture('viewmodel');window.__test.step(.02,{yaw:Math.PI});});
    const ambientPeak=await meter(page);const before=await page.evaluate(()=>window.__test.state().player.ammo);
    if(touch)await page.locator('#touch-fire').tap();else{await page.mouse.down();await page.mouse.up();}
    const firstShotMs=await page.evaluate(()=>{const start=performance.now();window.advanceTime(17);document.querySelector('#scene').getContext('webgl2').finish();return performance.now()-start;});
    const shotPeak=await meter(page);let d=await page.evaluate(()=>window.__test.diagnostics());
    assert.equal(d.player.ammo,before-1);assert(d.visuals.shot.active);assert(d.visuals.shot.lightIntensity>0);
    assert.equal(d.weaponAudio.played,1);assert.equal(d.weaponAudio.fallback,0);assert(shotPeak>ambientPeak*1.5&&shotPeak>.03,JSON.stringify({ambientPeak,shotPeak}));
    await captureGame(page,{path:`${output}/${name}-muzzle.png`});
    await page.evaluate(()=>{for(let i=0;i<4;i++)window.__test.step(.03);});assert.equal((await page.evaluate(()=>window.__test.diagnostics())).visuals.shot.active,false);
    await captureGame(page,{path:`${output}/${name}-rest.png`});
    await page.evaluate(()=>{window.__test.fixture('field');const s=window.__test.state();window.__test.step(.017,{yaw:Math.atan2(s.player.x,s.player.z),flashlight:true});});
    await page.waitForFunction(()=>window.__test.diagnostics().visuals.corridors.beacon.texture==='ready');
    const door=(await page.evaluate(()=>window.__test.diagnostics())).visuals.corridors.beacon.doorId;
    report.performance.push({version:'current',device:name,...await measure(page)});
    await captureGame(page,{path:`${output}/${name}-beacon-mid.png`});
    await page.evaluate(()=>{window.__test.step(2,{forward:1},false);window.__test.step(0);});
    await captureGame(page,{path:`${output}/${name}-beacon-near.png`});
    await page.evaluate(()=>{window.__test.step(45,{forward:1,yaw:Math.PI},false);const p=window.__test.state().player;window.__test.step(.017,{yaw:Math.atan2(p.x,p.z)});});
    d=await page.evaluate(()=>window.__test.diagnostics());assert.equal(d.zone,'field');assert(d.visuals.corridors.beacon.distance>90);assert(d.visuals.corridors.beacon.range<45);assert.equal(d.visuals.corridors.beacon.doorId,door);
    await captureGame(page,{path:`${output}/${name}-beacon-far.png`});
    if(touch)await page.locator('#touch-pause').tap();else await page.keyboard.press('Escape');
    await page.selectOption('#graphics-quality','low');await page.locator('#motion').check();await page.locator('#resume-btn')[touch?'tap':'click']();
    await page.waitForFunction(()=>window.__test.state().mode==='playing');await page.evaluate(()=>window.__test.step(0));
    assert.equal((await page.evaluate(()=>window.__test.diagnostics())).visuals.corridors.beacon.mistCount,3);
    await page.evaluate(()=>{for(let i=0;i<1400;i++){const s=window.__test.state();if(s.player.zone==='corridor'){window.__test.step(0);return;}window.__test.step(.05,{forward:1,yaw:Math.atan2(s.player.x,s.player.z+.9)},false);}throw Error('Return movement did not reach door');});
    d=await page.evaluate(()=>window.__test.diagnostics());assert.equal(d.zone,'corridor');assert.equal(d.visuals.corridors.beacon.active,false);assert.equal(d.fieldTrip.doorId,door);
    await page.evaluate(()=>{window.__test.fixture('viewmodel');window.__test.step(.017,{fire:true});});
    d=await page.evaluate(()=>window.__test.diagnostics());assert(d.reducedMotion);assert(d.visuals.shot.lightIntensity>0&&d.visuals.shot.lightIntensity<10);
    report.devices.push({name,ambientPeak,shotPeak,firstShotMs,doorId:door,return:'passed',beaconBeyondFarPlane:true,reducedEffects:'passed'});await page.close();
  }
  const fallback=await browser.newPage({viewport:{width:844,height:390},hasTouch:true,isMobile:true});
  fallback.on('pageerror',e=>report.errors.push(String(e)));
  await fallback.route('**/pistol-shot.wav',r=>r.fulfill({status:200,contentType:'audio/wav',body:'invalid audio fixture'}));
  await fallback.route('**/beacon-mist.png',r=>r.fulfill({status:200,contentType:'image/png',body:'invalid image fixture'}));
  await fallback.goto(preview.url+'?test=1&intro=off',{waitUntil:'networkidle'});await fallback.bringToFront();await fallback.waitForFunction(()=>window.__test?.intro().coreReady);await fallback.evaluate(()=>window.__test.step(0));await fallback.locator('#start-btn').tap();
  await fallback.waitForFunction(()=>window.__test.diagnostics().weaponAudio.sample==='fallback');await fallback.evaluate(()=>{window.__test.fixture('viewmodel');window.__test.step(.02,{fire:true});});
  assert.equal((await fallback.evaluate(()=>window.__test.diagnostics())).weaponAudio.fallback,1);
  await fallback.evaluate(()=>window.__test.fixture('field'));assert.equal((await fallback.evaluate(()=>window.__test.diagnostics())).visuals.corridors.beacon.texture,'fallback');
  report.assetFailure='passed';await fallback.close();
  if(process.env.CORNFIELD_BASELINE_DIST){
    const baseline=await startPreview({root:path.resolve(process.env.CORNFIELD_BASELINE_DIST),port:0,basePath:'/cornfields/',seconds:120});
    try{for(const touch of [false,true]){
      const page=await browser.newPage({viewport:touch?{width:844,height:390}:{width:1280,height:720},isMobile:touch,hasTouch:touch,deviceScaleFactor:1});
      await page.goto(baseline.url+'?test=1&intro=off&horror=off&quality=balanced',{waitUntil:'networkidle'});await page.bringToFront();await page.waitForFunction(()=>window.__test?.intro().coreReady);await page.evaluate(()=>window.__test.step(0));await page.locator('#start-btn')[touch?'tap':'click']();
      await page.evaluate(()=>{window.__test.fixture('field');window.__test.step(.017,{yaw:Math.PI/4,flashlight:true});});
      report.performance.push({version:'baseline',device:touch?'touch':'desktop',...await measure(page)});await page.close();
    }}finally{baseline.server.close();}
  }
  assert.deepEqual(report.errors,[]);report.status='passed';
}catch(e){report.status='failed';report.failure=String(e);console.error(e);process.exitCode=1;}
finally{clearTimeout(deadline);await browser.close();preview.server.close();await writeFile(output+'/report.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));}
