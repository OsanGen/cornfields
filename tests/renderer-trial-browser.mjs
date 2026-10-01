import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {chromium} from '../scripts/browser-runtime.mjs';
import {startPreview} from '../scripts/preview-dist.mjs';
const output='output/remaining-upgrade-2026-10-01',preview=await startPreview({root:output+'/renderer-trial',port:0,basePath:'/cornfields/',seconds:120});
const browser=await chromium.launch({headless:true}),report={runs:[],errors:[],method:'Isolated owned scene plus actual player GLBs, with and without Meshopt. Not whole-game parity or physical-phone performance.'};
const timeout=setTimeout(()=>browser.close(),110000);
try{
  const {meshoptAvailable}=JSON.parse(await readFile(output+'/renderer-trial/trial-assets.json'));
  report.meshoptAvailable=meshoptAvailable;
  for(const query of ['backend=classic',...(meshoptAvailable?['backend=classic&meshopt=1']:[]),'backend=bridge','backend=webgpu&forcewebgl=1','backend=webgpu']){
    const page=await browser.newPage();page.on('pageerror',e=>report.errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text());});
    await page.goto(preview.url+'?'+query);await page.waitForFunction(()=>window.__rendererTrial&&window.__rendererTrial.status!=='initializing');
    let result=await page.evaluate(()=>JSON.parse(JSON.stringify(window.__rendererTrial)));
    if(result.status!=='ready'){report.runs.push(result);await page.close();continue;}
    assert.equal(result.assets.skinnedMeshes,1);assert(result.assets.pistolSlide);
    await page.evaluate(()=>{const trial=window.__rendererTrial;trial.step(1);trial.fog(.18);trial.step(2);trial.resize();});
    await page.screenshot({path:output+'/renderer-'+query.replaceAll(/[=&]/g,'-')+'.png'});
    result=await page.evaluate(()=>JSON.parse(JSON.stringify(window.__rendererTrial)));
    await page.evaluate(()=>window.__rendererTrial.dispose());assert.equal(await page.evaluate(()=>window.__rendererTrial.status),'disposed');report.runs.push(result);await page.close();
  }
  assert.deepEqual(report.errors,[]);report.status=report.runs.every(run=>run.status==='ready')?'passed':'partial';
  console.log(JSON.stringify(report.runs));
}catch(error){report.status='failed';report.failure=String(error);process.exitCode=1;console.error(error);}
finally{clearTimeout(timeout);await writeFile(output+'/renderer-report.json',JSON.stringify(report,null,2));await browser.close();preview.server.close();}
