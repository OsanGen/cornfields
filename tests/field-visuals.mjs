import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {chromium} from '../scripts/browser-runtime.mjs';

const output=new URL('../output/field-visuals/',import.meta.url);await mkdir(output,{recursive:true});
const modes=(process.env.CORNFIELD_VISUAL_MODES||'legacy,field').split(',');
const browser=await chromium.launch({headless:false});
const report={viewport:{width:1280,height:720},modes:{},errors:[],requests:[]};
async function measure(page){
  return page.evaluate(async()=>{
    // Warm shaders and texture uploads before sampling actual browser frame intervals.
    const frames=async n=>{const values=[];let last=performance.now();for(let i=0;i<n;i++)await new Promise(resolve=>requestAnimationFrame(now=>{values.push(now-last);last=now;resolve();}));return values;};
    await frames(45);
    const values=(await frames(180)).sort((a,b)=>a-b),d=window.__test.diagnostics();
    return {medianMs:values[90],p95Ms:values[171],maxMs:values.at(-1),drawCalls:d.drawCalls,triangles:d.triangles,visuals:d.visuals};
  });
}
try{
  for(const mode of modes){
    const page=await browser.newPage({viewport:report.viewport,deviceScaleFactor:1});
    page.on('pageerror',e=>report.errors.push({mode,error:String(e)}));
    page.on('requestfailed',r=>report.requests.push({mode,url:r.url(),error:r.failure()}));
    await page.goto(`http://127.0.0.1:4173/?test=1&visuals=${mode}`,{waitUntil:'networkidle'});
    await page.bringToFront();await page.waitForFunction(()=>window.__test&&!document.getElementById('start-btn').disabled);
    const diagnostics=await page.evaluate(()=>window.__test.diagnostics());
    assert.equal(diagnostics.visuals.status,mode==='legacy'?'legacy':'ready');
    const shots={},results={};
    const shot=async name=>{const path=fileURLToPath(new URL(`${mode}-${name}.png`,output));await page.screenshot({path});shots[name]=path;};
    results.menu=await measure(page);await shot('entrance');
    await page.click('#start-btn');await page.waitForFunction(()=>document.pointerLockElement!==null);
    await page.evaluate(()=>{window.advanceTime(0);window.__test.step(1,{forward:1,yaw:0,pitch:0});});
    await page.keyboard.press('e');
    await page.evaluate(()=>window.advanceTime(1000/60));
    await page.evaluate(()=>window.__test.step(.95,{forward:1,yaw:0,pitch:0}));
    assert.equal(await page.evaluate(()=>window.__test.state().doorOpen),true);
    await shot('door-open');
    await page.evaluate(()=>window.__test.step(.9,{forward:1,yaw:0,pitch:0}));
    results.corridor=await measure(page);await shot('corridor');
    await page.evaluate(()=>window.__test.step(1/60,{yaw:.88,pitch:-.12}));
    results.closeup=await measure(page);await shot('leaf-closeup');
    // Real sprinting around the first corner, through unchanged collision and input logic.
    for(let step=0;step<8;step++)await page.evaluate(()=>{
      const s=window.__test.state(),p=window.__test.route()[1];if(!p)return;
      const dx=p.x-s.player.x,dz=p.z-s.player.z;
      window.__test.step(Math.min(.35,Math.hypot(dx,dz)/3.8),{forward:1,sprint:true,yaw:Math.atan2(-dx,-dz),pitch:0});
    });
    await shot('sprint-corner');
    assert.equal(await page.evaluate(()=>window.__test.state().mode),'playing');
    report.modes[mode]={results,shots,state:await page.evaluate(()=>window.__test.state())};
    await page.close();
  }
  if(report.modes.legacy&&report.modes.field){
    report.performance=Object.fromEntries(['menu','corridor','closeup'].map(view=>{
      const before=report.modes.legacy.results[view].p95Ms,after=report.modes.field.results[view].p95Ms;
      return [view,{beforeMs:before,afterMs:after,ratio:after/before,withinTenPercent:after<=before*1.10}];
    }));
  }
  if(report.performance)for(const [view,result]of Object.entries(report.performance))assert.ok(result.withinTenPercent,`${view} exceeds the 10% p95 budget`);
  assert.deepEqual(report.errors,[]);assert.deepEqual(report.requests,[]);
  // A missing optional visual bundle must preserve the playable original scene.
  const fallback=await browser.newPage({viewport:report.viewport});
  await fallback.route('**/cornfield-kit.glb',route=>route.fulfill({status:404,body:'Missing test asset'}));
  await fallback.goto('http://127.0.0.1:4173/?test=1&visuals=field',{waitUntil:'networkidle'});
  await fallback.waitForFunction(()=>window.__test&&!document.getElementById('start-btn').disabled);
  assert.equal(await fallback.evaluate(()=>window.__test.diagnostics().visuals.status),'fallback');
  assert.equal(await fallback.locator('#error').isVisible(),false);
  report.assetFailureFallback='passed';await fallback.close();
  report.status='passed';
}catch(error){report.status='failed';report.failure=String(error);throw error;}
finally{await writeFile(new URL('report.json',output),JSON.stringify(report,null,2));await browser.close();console.log(JSON.stringify(report,null,2));}
