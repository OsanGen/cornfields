import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from '../scripts/browser-runtime.mjs';
import {startPreview} from '../scripts/preview-dist.mjs';
import {captureGame} from './helpers/capture.mjs';

const output='output/remaining-upgrade-2026-10-01/browser';await mkdir(output,{recursive:true});
const preview=await startPreview({port:0,basePath:'/cornfields/',seconds:270});
const browser=await chromium.launch({headless:true,args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const deadline=setTimeout(()=>browser.close(),240000),report={errors:[],devices:[],startup:[],requestFailures:[]};
async function observeStartup(page,device){
  page.on('console',message=>{if(message.type()==='log'&&message.text().startsWith('[cornfields-startup]')&&report.startup.length<64){const item={device,event:message.text()};report.startup.push(item);console.log(JSON.stringify({playerStartup:item}));}});
  page.on('requestfailed',request=>{if(report.requestFailures.length>=16)return;const item={device,path:new URL(request.url()).pathname,error:request.failure()?.errorText};report.requestFailures.push(item);console.log(JSON.stringify({playerRequestFailure:item}));});
  // Observation only: no forced input, extra frame, readiness wait or timeout change.
  await page.addInitScript(()=>{
    let count=0;
    const record=phase=>{if(count++>=16)return;try{const intro=window.__test?.intro?.(),d=window.__test?.diagnostics?.();console.log('[cornfields-startup]',JSON.stringify({phase,ms:performance.now(),visibility:document.visibilityState,pointerLock:document.pointerLockElement?.id??null,mode:window.__test?.state?.()?.mode??null,coreReady:intro?.coreReady??null,phaseState:intro?.phase??null,hands:d?.visuals?.hands?.status??null,zombie:d?.visuals?.zombie?.status??null,drawCalls:d?.drawCalls??null}));}catch(error){console.log('[cornfields-startup]',JSON.stringify({phase,observerError:String(error)}));}};
    for(const type of ['pointerdown','mousedown','pointerup','mouseup','click'])document.addEventListener(type,event=>{if(event.target instanceof Element&&event.target.closest('#start-btn')){record(type);if(type==='click')queueMicrotask(()=>record('click-after-handlers'));}},true);
    document.addEventListener('pointerlockchange',()=>record('pointerlockchange'),true);
  });
}
async function recordReadiness(page,device,phase){
  const value=await page.evaluate(()=>{const intro=window.__test?.intro?.(),d=window.__test?.diagnostics?.(),button=document.querySelector('#start-btn');return{ms:performance.now(),visibility:document.visibilityState,pointerLock:document.pointerLockElement?.id??null,mode:window.__test?.state?.()?.mode??null,coreReady:intro?.coreReady??null,phaseState:intro?.phase??null,hands:d?.visuals?.hands?.status??null,zombie:d?.visuals?.zombie?.status??null,field:d?.visuals?.status??null,quality:d?.quality??null,drawCalls:d?.drawCalls??null,triangles:d?.triangles??null,viewport:[innerWidth,innerHeight],startButton:{disabled:button?.disabled??null,hidden:button?.hidden??null,rect:button?.getBoundingClientRect().toJSON()??null},loadedResources:performance.getEntriesByType('resource').length};});
  const item={device,phase,...value};if(report.startup.length<64)report.startup.push(item);console.log(JSON.stringify({playerStartup:item}));
}
try{
  for(const touch of [false,true]){
    const name=touch?'phone':'desktop',page=await browser.newPage({viewport:touch?{width:844,height:390}:{width:1280,height:720},isMobile:touch,hasTouch:touch,deviceScaleFactor:1});
    page.setDefaultTimeout(15000);page.on('pageerror',error=>report.errors.push(String(error)));
    page.on('console',message=>{if(message.type()==='error')report.errors.push(message.text());});
    await observeStartup(page,name);
    await page.goto(preview.url+'?test=1&intro=off&horror=off&quality=high',{waitUntil:'networkidle'});
    await page.bringToFront();
    await page.waitForFunction(()=>window.__test?.intro().coreReady);
    await recordReadiness(page,name,'before-begin');
    await page.locator('#start-btn')[touch?'tap':'click']();
    await recordReadiness(page,name,'after-begin');
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
  await observeStartup(fallback,'fallback');
  await fallback.route('**/player-arms.glb',route=>route.fulfill({status:200,contentType:'model/gltf-binary',body:'invalid optional model fixture'}));
  await fallback.goto(preview.url+'?test=1&intro=off',{waitUntil:'networkidle'});await fallback.bringToFront();await fallback.waitForFunction(()=>window.__test?.intro().coreReady);
  assert.equal((await fallback.evaluate(()=>window.__test.diagnostics())).visuals.hands.status,'fallback');
  await recordReadiness(fallback,'fallback','before-begin');
  await fallback.locator('#start-btn').tap();await fallback.evaluate(()=>window.__test.step(.1,{forward:1}));
  await recordReadiness(fallback,'fallback','after-begin');
  assert.equal((await fallback.evaluate(()=>window.__test.state())).mode,'playing');
  report.optionalAssetFailure='passed';await fallback.close();
  assert.deepEqual(report.errors,[]);report.status='passed';
}catch(error){report.status='failed';report.failure=String(error);process.exitCode=1;console.error(error);}
finally{clearTimeout(deadline);await browser.close();preview.server.close();await writeFile(output+'/report.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));}
