import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from '../scripts/browser-runtime.mjs';
import {startPreview} from '../scripts/preview-dist.mjs';
import {captureGame} from './helpers/capture.mjs';

const output='output/remaining-upgrade-2026-10-01/browser';await mkdir(output,{recursive:true});
const preview=await startPreview({port:0,basePath:'/cornfields/',seconds:180});
const browser=await chromium.launch({headless:true,args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const deadline=setTimeout(()=>browser.close(),150000),report={errors:[],devices:[]};
try{
  for(const touch of [false,true]){
    const name=touch?'phone':'desktop',page=await browser.newPage({viewport:touch?{width:844,height:390}:{width:1280,height:720},isMobile:touch,hasTouch:touch,deviceScaleFactor:1});
    page.setDefaultTimeout(15000);page.on('pageerror',error=>report.errors.push(String(error)));
    page.on('console',message=>{if(message.type()==='error')report.errors.push(message.text());});
    await page.goto(preview.url+'?test=1&intro=off&horror=off&quality=high',{waitUntil:'networkidle'});
    await page.bringToFront();
    await page.waitForFunction(()=>window.__test?.intro().coreReady);
    await page.locator('#start-btn')[touch?'tap':'click']();
    const step=(seconds,input={})=>page.evaluate(({seconds,input})=>window.__test.step(seconds,input),{seconds,input});
    await page.evaluate(()=>window.__test.fixture('viewmodel'));await step(.02,{yaw:Math.PI});
    let d=await page.evaluate(()=>window.__test.diagnostics());assert.equal(d.visuals.hands.status,'ready');
    await captureGame(page,{path:`${output}/${name}-gun.png`});
    await step(.02,{fire:true});await captureGame(page,{path:`${output}/${name}-recoil.png`});
    await page.evaluate(()=>window.__test.fixture('encounter'));await step(.56);
    assert.equal((await page.evaluate(()=>window.__test.state())).interaction.phase,'qte');
    await captureGame(page,{path:`${output}/${name}-qte.png`});
    for(let i=0;i<8;i++)await step(1/60,{stab:true});await step(.1);
    await captureGame(page,{path:`${output}/${name}-stab.png`});await step(.8);
    assert.equal((await page.evaluate(()=>window.__test.state())).interaction.phase,'recovery');
    await step(10.2);assert.equal((await page.evaluate(()=>window.__test.state())).interaction,null);
    await page.evaluate(()=>window.__test.fixture('field'));await step(0);
    assert.equal((await page.evaluate(()=>window.__test.diagnostics())).zone,'field');
    await captureGame(page,{path:`${output}/${name}-field.png`});
    report.devices.push({name,hands:d.visuals.hands,drawCalls:d.drawCalls,triangles:d.triangles});await page.close();
  }
  const fallback=await browser.newPage({viewport:{width:844,height:390},isMobile:true,hasTouch:true});
  fallback.on('pageerror',error=>report.errors.push(String(error)));
  await fallback.route('**/player-arms.glb',route=>route.fulfill({status:200,contentType:'model/gltf-binary',body:'invalid optional model fixture'}));
  await fallback.goto(preview.url+'?test=1&intro=off',{waitUntil:'networkidle'});await fallback.bringToFront();await fallback.waitForFunction(()=>window.__test?.intro().coreReady);
  assert.equal((await fallback.evaluate(()=>window.__test.diagnostics())).visuals.hands.status,'fallback');
  await fallback.locator('#start-btn').tap();await fallback.evaluate(()=>window.__test.step(.1,{forward:1}));
  assert.equal((await fallback.evaluate(()=>window.__test.state())).mode,'playing');
  report.optionalAssetFailure='passed';await fallback.close();
  assert.deepEqual(report.errors,[]);report.status='passed';
}catch(error){report.status='failed';report.failure=String(error);process.exitCode=1;console.error(error);}
finally{clearTimeout(deadline);await browser.close();preview.server.close();await writeFile(output+'/report.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));}
