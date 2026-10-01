import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from '../scripts/browser-runtime.mjs';
import {startPreview} from '../scripts/preview-dist.mjs';

const output=process.env.CORNFIELD_UPGRADE_OUTPUT||'output/upgrade-execution-2026-10-01/browser';
await mkdir(output,{recursive:true});
const browser=await chromium.launch({headless:true,args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const deadline=setTimeout(()=>browser.close(),240000);
const report={method:'Sequential built packages, same seed/camera/viewport. Every measured RAF renders the actual frozen game through step(0). Cadence includes browser scheduling, not GPU-only timing. Touch viewport is emulation, not physical-phone acceptance.',errors:[],runs:[]};
let preview;
try{
  for(const label of ['baseline','upgrade']){
    preview=await startPreview({root:label==='baseline'?'output/upgrade-execution-2026-10-01/baseline-dist':'dist',port:0,basePath:'/cornfields/',seconds:240});
    for(const touch of [false,true]){
      const kind=touch?'touch':'desktop',page=await browser.newPage({viewport:{width:960,height:540},deviceScaleFactor:1,isMobile:touch,hasTouch:touch});
      page.setDefaultTimeout(20000);
      page.on('pageerror',error=>report.errors.push({label,kind,error:String(error)}));
      page.on('console',message=>{if(message.type()==='error')report.errors.push({label,kind,error:message.text()});});
      const started=Date.now();await page.goto(preview.url+'?test=1&intro=off&quality=high',{waitUntil:'domcontentloaded'});
      await page.waitForFunction(()=>window.__test?.intro().coreReady&&window.__test.diagnostics().visuals.zombie.status!=='loading');
      const readyMs=Date.now()-started;
      await page.evaluate(()=>window.__test.step(0));await page.locator('#start-btn')[touch?'tap':'click']();
      const step=(seconds,controls={})=>page.evaluate(({seconds,controls})=>window.__test.step(seconds,controls),{seconds,controls});
      const diagnostic=()=>page.evaluate(()=>window.__test.diagnostics());
      assert.equal((await diagnostic()).mode,'playing');assert.equal((await diagnostic()).controlMode,touch?'touch':'mouse');
      const run={label,kind,readyMs,scenes:[]};
      for(const scenario of ['corridor','field']){
        await page.evaluate(()=>window.__test.fixture('corridor'));await step(.02,{yaw:Math.PI});
        if(scenario==='field'){
          await page.evaluate(()=>window.__test.fixture('gate'));await step(1/60,{interact:true});await step(.5);await step(.8,{forward:1});await step(1.5,{forward:1,yaw:Math.PI});
          assert.equal((await diagnostic()).zone,'field');
        }
        const frames=await page.evaluate(()=>new Promise(resolve=>{
          const values=[];let warm=20,last=performance.now();
          function frame(now){window.__test.step(0);if(warm--<=0)values.push(now-last);last=now;if(values.length>=80)resolve(values);else requestAnimationFrame(frame);}
          requestAnimationFrame(frame);
        }));
        frames.sort((a,b)=>a-b);const d=await diagnostic();
        run.scenes.push({scenario,p50ms:frames[40],p95ms:frames[76],drawCalls:d.drawCalls,triangles:d.triangles,quality:d.quality,corn:d.visuals.corridors});
        await page.screenshot({path:`${output}/${label}-${kind}-${scenario}.png`});
      }
      if(label==='upgrade'){
        const high=await diagnostic();
        await page.evaluate(()=>{window.dispatchEvent(new PageTransitionEvent('pagehide'));});
        assert.equal((await diagnostic()).mode,'paused');
        await page.selectOption('#graphics-quality','low');await step(0);
        const low=await diagnostic();assert.equal(low.quality.tier,'low');
        await page.screenshot({path:`${output}/upgrade-${kind}-pause.png`});
        assert.equal(low.visuals.corridors.near+low.visuals.corridors.far,high.visuals.corridors.near+high.visuals.corridors.far);
        await page.evaluate(()=>window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true})));assert.equal((await diagnostic()).mode,'paused');
        await page.locator('#resume-btn')[touch?'tap':'click']();await step(0);assert.equal((await diagnostic()).mode,'playing');
        await page.evaluate(()=>window.__test.fixture('animation'));
        for(const clip of ['Original breathing idle','Zombie Lurch','Pixelhouse Fury','Pixelhouse Collapse']){
          await page.evaluate(name=>window.__test.animation(name),clip);
          for(const time of [.2,1,2,3.9]){await page.evaluate(time=>window.__test.render(time),time);const d=await diagnostic();assert(d.creature.eyeWorldLeft.every(Number.isFinite));}
          await page.screenshot({path:`${output}/upgrade-${kind}-${clip.replaceAll(' ','-')}.png`});
        }
        await page.evaluate(()=>window.__test.animation(null));
        await page.evaluate(()=>window.__test.fixture('encounter'));await step(.56);assert.equal((await diagnostic()).interaction.phase,'qte');
        for(let i=0;i<8;i++)await step(1/60,{stab:true});await step(1);assert.equal((await diagnostic()).interaction.phase,'recovery');
        await step(10.2);assert.equal((await diagnostic()).interaction,null);
        run.lifecycleAndQte='passed';
      }
      run.bytes=await page.evaluate(()=>performance.getEntriesByType('resource').reduce((sum,e)=>sum+e.encodedBodySize,0));
      report.runs.push(run);console.log(label,kind,JSON.stringify(run.scenes));await page.close();
    }
    if(label==='upgrade'){
      const page=await browser.newPage({viewport:{width:844,height:390},isMobile:true,hasTouch:true});
      page.on('pageerror',error=>report.errors.push({label:'intro/fallback',error:String(error)}));
      await page.route('**/zombie-clips.json',route=>route.fulfill({status:503,body:'Optional asset fixture'}));
      await page.goto(preview.url+'?test=1');await page.waitForFunction(()=>window.__test?.intro().coreReady&&window.__test.diagnostics().visuals.zombie.status==='ready');
      assert.equal((await page.evaluate(()=>window.__test.diagnostics())).creature.externalClipsIntegrated,false);
      await page.locator('#start-btn').tap();await page.evaluate(()=>window.advanceTime(4000));
      await page.evaluate(()=>window.dispatchEvent(new PageTransitionEvent('pagehide')));
      const paused=await page.evaluate(()=>window.__test.intro());assert.equal(paused.phase,'paused');
      await page.evaluate(()=>{window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true}));window.advanceTime(1000);});
      assert.equal((await page.evaluate(()=>window.__test.intro())).time,paused.time);
      await page.locator('#intro-continue').tap();await page.evaluate(()=>window.advanceTime(22000));assert.equal((await page.evaluate(()=>window.__test.intro())).phase,'ready');
      await page.locator('#intro-enter').tap();await page.waitForFunction(()=>window.__test.state().mode==='playing');
      await page.evaluate(()=>document.querySelector('canvas').getContext('webgl2').getExtension('WEBGL_lose_context').loseContext());
      await page.waitForFunction(()=>window.__test.state().mode==='paused');assert(await page.locator('#error').isVisible());
      report.introAndOptionalFailure='passed: actual intro, touch entry, missing clip bank, synthetic history signals and real WebGL context loss';await page.close();
    }
    await new Promise(resolve=>preview.server.close(resolve));preview=null;
  }
  assert.deepEqual(report.errors,[]);report.status='passed';
}catch(error){report.status='failed';report.failure=String(error);process.exitCode=1;console.error(error);}
finally{clearTimeout(deadline);await writeFile(output+'/report.json',JSON.stringify(report,null,2));await browser.close();if(preview)preview.server.close();}
