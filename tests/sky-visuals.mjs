import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {chromium} from '../scripts/browser-runtime.mjs';

const output=new URL('../output/sky-visuals/',import.meta.url);await mkdir(output,{recursive:true});
const report={viewport:{width:1280,height:720},views:{},errors:[]};
const browser=await chromium.launch({headless:false});
async function frames(page){
  return page.evaluate(async()=>{
    const samples=[];let previous=performance.now();
    for(let i=0;i<150;i++)await new Promise(resolve=>requestAnimationFrame(now=>{
      if(i>=30)samples.push(now-previous);previous=now;resolve();
    }));
    samples.sort((a,b)=>a-b);
    return {medianMs:samples[60],p95Ms:samples[114],...window.__test.diagnostics()};
  });
}
try{
  for(const mode of ['off','on']){
    const page=await browser.newPage({viewport:report.viewport,deviceScaleFactor:1});
    // This is a static renderer comparison. Isolate it from OS focus changes
    // and pointer recentering, which otherwise pause or turn one sample only.
    // Normal pause/input behavior remains covered by the separate gameplay test.
    await page.addInitScript(()=>{
      window.addEventListener('blur',event=>event.stopImmediatePropagation(),true);
      for(const type of ['mousemove','pointerlockchange','visibilitychange'])
        document.addEventListener(type,event=>event.stopImmediatePropagation(),true);
    });
    page.on('pageerror',error=>report.errors.push(String(error)));
    page.on('console',message=>{if(message.type()==='error')report.errors.push(message.text());});
    await page.goto(`http://127.0.0.1:4173/?test=1&visuals=field&sky=${mode}`,{waitUntil:'networkidle'});
    await page.bringToFront();await page.waitForFunction(()=>window.__test);
    const diagnostics=await page.evaluate(()=>window.__test.diagnostics());
    assert.equal(diagnostics.visuals.status,'ready');
    assert.equal(diagnostics.visuals.sky.status,mode==='off'?'off':'ready');
    if(mode==='on'){
      assert.equal(diagnostics.visuals.sky.stats.width,2048);
      assert.equal(diagnostics.visuals.sky.stats.height,1024);
      assert.equal(diagnostics.visuals.sky.stats.drawCalls,1);
      assert.equal(diagnostics.visuals.sky.stats.triangles,960);
    }
    await page.screenshot({path:fileURLToPath(new URL(`${mode}-entrance.png`,output))});
    await page.click('#start-btn');
    await page.waitForFunction(()=>document.pointerLockElement!==null);
    // Freeze gameplay and change only the actual look input at the same position.
    await page.evaluate(()=>{window.advanceTime(0);window.__test.step(1/60,{yaw:0,pitch:.95});});
    report.views[mode]=await frames(page);
    assert.equal(await page.evaluate(()=>window.__test.state().mode),'playing');
    await page.screenshot({path:fileURLToPath(new URL(`${mode}-north.png`,output))});
    await page.evaluate(()=>window.__test.step(1/60,{yaw:Math.PI,pitch:.95}));
    await page.screenshot({path:fileURLToPath(new URL(`${mode}-south.png`,output))});
    await page.close();
  }
  report.addedDrawCalls=report.views.on.drawCalls-report.views.off.drawCalls;
  report.addedTriangles=report.views.on.triangles-report.views.off.triangles;
  report.p95Ratio=report.views.on.p95Ms/report.views.off.p95Ms;
  report.withinTenPercent=report.p95Ratio<=1.1;
  assert.equal(report.addedDrawCalls,1);assert.equal(report.addedTriangles,960);
  assert.deepEqual(report.errors,[]);

  const fallback=await browser.newPage({viewport:report.viewport});
  await fallback.route('**/night-sky.jpg',route=>route.fulfill({status:404,body:'Missing test sky'}));
  await fallback.goto('http://127.0.0.1:4173/?test=1&visuals=field',{waitUntil:'networkidle'});
  await fallback.waitForFunction(()=>window.__test);
  const diagnostics=await fallback.evaluate(()=>window.__test.diagnostics());
  assert.equal(diagnostics.visuals.status,'ready');assert.equal(diagnostics.visuals.sky.status,'fallback');
  assert.equal(await fallback.locator('#start-btn').isEnabled(),true);
  assert.equal(await fallback.locator('#error').isVisible(),false);
  report.missingAssetFallback='passed';await fallback.close();
  report.status='passed';
}catch(error){report.status='failed';report.failure=String(error);throw error;}
finally{await writeFile(new URL('report.json',output),JSON.stringify(report,null,2));await browser.close();console.log(JSON.stringify(report,null,2));}
