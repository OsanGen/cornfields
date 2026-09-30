import {mkdir,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {chromium} from '../scripts/browser-runtime.mjs';

const output=process.env.CORNFIELD_PERFORMANCE_OUTPUT||'output/horror-update/performance';await mkdir(output,{recursive:true});
const baseline=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
const files=new Map();
for(const file of ['index.html',...execFileSync('git',['ls-tree','-r','--name-only',baseline,'src'],{encoding:'utf8'}).trim().split('\n')]){
  if(file!=='index.html'&&!/^src\/[\w-]+\.(js|css)$/.test(file))continue;
  const source=execFileSync('git',['show',`${baseline}:${file}`]);
  files.set(file,file==='index.html'?Buffer.from(source.toString().replaceAll('./node_modules/three/','./vendor/three/')):source);
}
const browser=await chromium.launch({headless:true});
const report={baseline,viewport:{width:844,height:390},method:'Same assets, DPR 1, 45 warm frames then 180 samples per fixed view; local browser only',samples:{},comparisons:{}};
async function measure(page){return page.evaluate(async()=>{
  async function frames(n){const times=[];let last=performance.now();for(let i=0;i<n;i++)await new Promise(resolve=>requestAnimationFrame(now=>{times.push(now-last);last=now;resolve();}));return times;}
  await frames(45);const times=(await frames(180)).sort((a,b)=>a-b),d=window.__test.diagnostics();
  return {medianMs:times[90],p95Ms:times[171],drawCalls:d.drawCalls,triangles:d.triangles};
});}
try{
  for(const version of ['baseline','current']){
    const page=await browser.newPage({viewport:report.viewport,deviceScaleFactor:1,isMobile:true,hasTouch:true});
    try{
      if(version==='baseline')await page.route('**/*',async route=>{
        const pathname=new URL(route.request().url()).pathname;
        const key=pathname==='/cornfields/'?'index.html':pathname.replace(/^\/cornfields\//,'');
        if(files.has(key))await route.fulfill({status:200,body:files.get(key),contentType:key.endsWith('.js')?'text/javascript':key.endsWith('.css')?'text/css':'text/html'});
        else await route.continue();
      });
      await page.goto('http://127.0.0.1:4180/cornfields/?controls=touch&test=1&intro=off',{waitUntil:'networkidle'});
      await page.waitForFunction(()=>window.__test?.diagnostics().visuals.zombie.status==='ready');
      await page.evaluate(()=>window.advanceTime(0));report.samples[version]={menu:await measure(page)};
      await page.locator('#start-btn').tap();await page.evaluate(()=>{
        window.advanceTime(0);window.__test.step(.9,{forward:1,yaw:0,pitch:0});window.__test.step(1/60,{interact:true});window.__test.step(1.8,{forward:1,yaw:0,pitch:0});
      });report.samples[version].corridor=await measure(page);
      await page.evaluate(()=>window.__test.step(1/60,{yaw:.88,pitch:-.12}));report.samples[version].closeup=await measure(page);
    }finally{await page.close();}
  }
  for(const view of ['menu','corridor','closeup']){
    const before=report.samples.baseline[view].p95Ms,after=report.samples.current[view].p95Ms;
    report.comparisons[view]={beforeMs:before,afterMs:after,ratio:after/before,withinBudget:after<=before*1.1};
  }
  report.withinBudget=Object.values(report.comparisons).every(x=>x.withinBudget);
}finally{await browser.close();await writeFile(`${output}/report.json`,JSON.stringify(report,null,2));console.log(JSON.stringify(report));}
if(!report.withinBudget)process.exitCode=1;
