import {readFile,readdir,mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {chromium} from '../scripts/browser-runtime.mjs';

const output='output/hands-corn/performance';
const baseline=process.env.CORNFIELD_BASELINE_SOURCE;
if(!baseline)throw new Error('Set CORNFIELD_BASELINE_SOURCE to the preserved pre-update weather source');
await mkdir(output,{recursive:true});
const files=new Map();
for(const name of ['index.html',...(await readdir(path.join(baseline,'src'))).filter(n=>/^[\w-]+\.(js|css)$/.test(n)).map(n=>'src/'+n)]){
  const data=await readFile(path.join(baseline,name));
  files.set(name,name==='index.html'?Buffer.from(data.toString().replaceAll('./node_modules/three/','./vendor/three/')):data);
}
const browser=await chromium.launch({headless:false});
const report={baseline,viewport:{width:844,height:390},samples:{},comparisons:{},errors:[],method:'Sequential native Chrome, touch emulation, same retained assets/viewport/positions. 30 warm frames then 120 measured frames per view. A local comparison, not physical-phone FPS.'};
const deadline=setTimeout(()=>browser.close(),65000);
try{
  for(const version of ['baseline','current']){
    const page=await browser.newPage({viewport:report.viewport,deviceScaleFactor:1,isMobile:true,hasTouch:true});
    page.setDefaultTimeout(10000);page.on('pageerror',e=>report.errors.push(String(e)));
    if(version==='baseline')await page.route('**/*',async route=>{
      const key=new URL(route.request().url()).pathname.replace(/^\/cornfields\//,'')||'index.html';
      if(files.has(key))await route.fulfill({status:200,body:files.get(key),contentType:key.endsWith('.js')?'text/javascript':key.endsWith('.css')?'text/css':'text/html'});
      else await route.continue();
    });
    await page.goto('http://127.0.0.1:4180/cornfields/?test=1&intro=off',{waitUntil:'networkidle'});await page.bringToFront();
    await page.locator('#start-btn').tap();await page.evaluate(()=>window.advanceTime(0));report.samples[version]={};
    for(const view of ['entrance','corridor','closeup']){
      if(view==='corridor')await page.evaluate(()=>{window.__test.step(.8,{forward:1});window.__test.step(.4,{interact:true});window.__test.step(1.5,{forward:1});});
      if(view==='closeup')await page.evaluate(()=>window.__test.step(.02,{yaw:1.3,pitch:-.12}));
      report.samples[version][view]=await page.evaluate(async()=>{
        const times=[];let last=performance.now();
        for(let i=0;i<150;i++)await new Promise(resolve=>requestAnimationFrame(now=>{if(i>=30)times.push(now-last);last=now;resolve();}));
        times.sort((a,b)=>a-b);const d=window.__test.diagnostics();
        return {medianMs:times[60],p95Ms:times[114],drawCalls:d.drawCalls,triangles:d.triangles,player:{x:d.player.x,z:d.player.z,yaw:d.player.yaw},visuals:d.visuals};
      });
    }
    await page.close();
  }
  for(const view of ['entrance','corridor','closeup']){
    const a=report.samples.baseline[view],b=report.samples.current[view];
    report.comparisons[view]={beforeMs:a.p95Ms,afterMs:b.p95Ms,ratio:b.p95Ms/a.p95Ms,withinBudget:b.p95Ms<=a.p95Ms*1.1};
  }
  report.status=report.errors.length===0&&Object.values(report.comparisons).every(c=>c.withinBudget)?'passed':'failed';
}catch(error){report.status='failed';report.failure=String(error);throw error;}
finally{clearTimeout(deadline);await browser.close();await writeFile(output+'/report.json',JSON.stringify(report,null,2));console.log(JSON.stringify({status:report.status,comparisons:report.comparisons,errors:report.errors,failure:report.failure}));}
if(report.status!=='passed')process.exitCode=1;
