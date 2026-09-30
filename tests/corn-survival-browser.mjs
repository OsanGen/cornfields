import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from '../scripts/browser-runtime.mjs';

const output='output/corn-survival/browser';
const base=process.env.CORNFIELD_TEST_URL||'http://127.0.0.1:4180/cornfields/';
await mkdir(output,{recursive:true});
const browser=await chromium.launch({headless:process.env.CORNFIELD_HEADED!=='1'});
const report={status:'running',errors:[],devices:[],method:'Sequential desktop and touch emulation. Real entry/exit controls; an explicit eligibility fixture avoids repeating the four full-duration deterministic simulations. QTE fixture is setup, not normal encounter-frequency proof.'};
const deadline=setTimeout(()=>browser.close(),180000);
try{
  for(const touch of [false,true]){
    const kind=touch?'touch':'desktop';
    const page=await browser.newPage({viewport:touch?{width:844,height:390}:{width:1280,height:720},deviceScaleFactor:1,isMobile:touch,hasTouch:touch});
    page.setDefaultTimeout(12000);
    page.on('pageerror',e=>report.errors.push(String(e)));
    page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text());});
    const state=()=>page.evaluate(()=>window.__test.state());
    const step=(seconds,input={})=>page.evaluate(({seconds,input})=>window.__test.step(seconds,input),{seconds,input});
    const click=selector=>touch?page.locator(selector).tap():page.locator(selector).click();
    const action=async(type)=>{if(touch)await click(type==='interact'?'#touch-interact':'#touch-stab');else await page.keyboard.press(type==='interact'?'KeyE':'Space');await page.evaluate(()=>window.advanceTime(17));};
    const shot=name=>page.screenshot({path:`${output}/${kind}-${name}.png`});
    async function walk(target){
      await page.evaluate(target=>{
        const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
        for(let ticks=0;ticks<1200;ticks++){
          const s=window.__test.state();
          if(s.mode!=='playing')throw new Error('Walking interrupted by '+s.mode);
          if(s.interaction&&s.interaction.phase!=='recovery'){window.__test.step(.017,{stab:true});continue;}
          if(distance(s.player,target)<.07)return;
          const route=window.__test.route(target);
          if(!route.length)throw new Error('No committed route to '+JSON.stringify(target));
          const next=route.find(p=>distance(p,s.player)>.07)||target;
          window.__test.step(Math.min(.07,distance(s.player,next)/3.8),{forward:1,yaw:Math.atan2(s.player.x-next.x,s.player.z-next.z)});
        }
        throw new Error('Walking exceeded its bounded route budget');
      },target);
    }
    await page.goto(`${base}?test=1&intro=off`,{waitUntil:'networkidle'});await page.bringToFront();
    await page.waitForFunction(()=>window.__test?.intro().coreReady);
    assert.equal((await page.evaluate(()=>window.__test.diagnostics())).controlMode,touch?'touch':'mouse');
    await click('#start-btn');await step(0);
    if(!touch)await page.waitForFunction(()=>document.pointerLockElement===document.getElementById('scene'));
    const layout=await page.evaluate(()=>window.__test.survival()),doors=await page.evaluate(()=>window.__test.doors());
    const outer=doors[layout.outer],inner=doors[layout.inner];
    await walk({x:outer.x,z:outer.z-1});await step(.02,{yaw:Math.PI});await shot('01-entry');
    await action('interact');await step(.5);await walk(layout.sections[1].anchor);await step(.5);
    assert.equal((await state()).cornSurvival.state,'active_survival');
    assert.equal((await state()).doorOpen,false);await shot('02-field');
    assert.equal(await page.evaluate(()=>JSON.parse(window.render_game_to_text()).cornSurvival),undefined);
    await page.evaluate(()=>window.__test.fixture('encounter'));await step(.56);
    assert.equal((await state()).interaction.phase,'qte');await shot('03-qte');
    await page.evaluate(()=>window.__test.fixture('eligible'));await step(.02);
    assert.equal((await state()).cornSurvival.state,'exit_armed');
    for(let i=0;i<8;i++)await action('stab');
    await step(1);let s=await state();assert.equal(s.interaction.phase,'recovery');
    assert.equal(s.interaction.recoveryDeadline-s.interaction.phaseStartedAt,10);await shot('04-landing');
    await step(s.interaction.recoveryDeadline-s.elapsed+.02);assert.equal((await state()).interaction,null);
    for(const slot of [7,6,3,0,3,6,7,8,5,2,5,8]){
      if((await state()).cornSurvival.state==='return_route')break;
      await walk((await page.evaluate(()=>window.__test.survival())).sections[slot].anchor);
    }
    assert.equal((await state()).cornSurvival.state,'return_route');
    await walk({x:inner.x,z:inner.z+1});await step(.02,{yaw:0});await action('interact');await step(.5);
    await walk({x:inner.x,z:inner.z-1});assert.equal((await state()).cornSurvival.state,'exiting');
    await walk({x:outer.x,z:outer.z+1});await step(.02,{yaw:0});await action('interact');await step(.5);
    await walk({x:outer.x,z:outer.z-1});await step(.02);
    s=await state();assert.equal(s.cornSurvival.state,'complete');assert.equal(s.progress.checkpointIndex,0);assert.equal(s.mode,'playing');
    await shot('05-original-exit');
    if(touch)await click('#touch-pause');else await page.keyboard.press('Escape');
    await step(0);const paused=await state();await step(1);assert.equal((await state()).cornSurvival.elapsed,paused.cornSurvival.elapsed);
    await click('#restart-btn');await step(0);s=await state();assert.equal(s.cornSurvival.state,'inactive');assert.equal(s.cornSurvival.distance,0);
    report.devices.push({kind,status:'passed',diagnostics:await page.evaluate(()=>window.__test.diagnostics())});
    await page.close();
  }
  assert.deepEqual(report.errors,[]);report.status='passed';
}catch(error){report.status='failed';report.failure=String(error);throw error;}
finally{clearTimeout(deadline);await browser.close();await writeFile(`${output}/report.json`,JSON.stringify(report,null,2));console.log(JSON.stringify({status:report.status,devices:report.devices.map(d=>d.kind),errors:report.errors,failure:report.failure}));}
