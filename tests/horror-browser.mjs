import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from '../scripts/browser-runtime.mjs';

const desktop=process.env.CORNFIELD_DESKTOP==='1';
const output=process.env.CORNFIELD_HORROR_OUTPUT||(desktop?'output/horror-update/desktop':'output/horror-update/browser');
await mkdir(output,{recursive:true});
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:844,height:390},deviceScaleFactor:1,isMobile:!desktop,hasTouch:!desktop});
page.setDefaultTimeout(15000);
const errors=[],checks=[],report={kind:desktop?'Chromium real mouse capture and keyboard edges':'Chromium touch emulation; natural movement into an encounter',checks,errors};
page.on('pageerror',error=>errors.push(String(error)));
page.on('console',msg=>{if(msg.type()==='error')errors.push(msg.text());});
page.on('response',r=>{if(r.status()>=400)errors.push(`${r.status()} ${r.url()}`);});
const state=()=>page.evaluate(()=>window.__test.state());
const step=(seconds,input={})=>page.evaluate(({seconds,input})=>window.__test.step(seconds,input),{seconds,input});
const tap=async selector=>{
  const key=desktop&&({'#touch-interact':'KeyE','#touch-light':'KeyF','#touch-stab':'Space','#touch-pause':'Escape'}[selector]);
  if(key)await page.keyboard.press(key);
  else if(desktop)await page.locator(selector).click();
  else await page.locator(selector).tap();
  await page.evaluate(()=>window.advanceTime(1000/60));
};
async function shot(name){await page.screenshot({path:`${output}/${name}.png`});await writeFile(`${output}/${name}.json`,JSON.stringify(await page.evaluate(()=>window.__test.diagnostics()),null,2));}
async function encounter(){
  await step(.9,{forward:1,yaw:0,pitch:0});await tap('#touch-interact');
  if((await state()).player.flashlightOn)await tap('#touch-light');
  await page.evaluate(()=>{
    const a=window.__test.anchors()[0];
    for(let i=0;i<2400;i++){
      const s=window.__test.state();
      if(s.mode!=='playing')throw new Error('Run ended before the hide');
      if(Math.hypot(s.player.x-a.x,s.player.z-a.z)<.6)return;
      const p=window.__test.route()[1];if(!p)throw new Error('No corridor route');
      const dx=p.x-s.player.x,dz=p.z-s.player.z;
      window.__test.step(Math.min(.1,Math.hypot(dx,dz)/3.8),{forward:1,yaw:Math.atan2(-dx,-dz),pitch:0});
    }
    throw new Error('Hide was not reached');
  });
  await tap('#touch-interact');assert.equal((await state()).player.hidden,true);
  await step(1/60,{lookDelta:3});
  await page.evaluate(()=>{
    for(let i=0;i<600;i++){
      const s=window.__test.state();if(s.interaction?.phase==='qte')return;
      if(s.mode!=='playing')throw new Error('No playable QTE');
      window.__test.step(1/60);
    }
    throw new Error('No QTE after detected hiding');
  });
}
try{
  await page.goto(process.env.CORNFIELD_TEST_URL||`http://127.0.0.1:4180/cornfields/?test=1&intro=off&controls=${desktop?'mouse':'touch'}`,{waitUntil:'networkidle'});
  await page.waitForFunction(()=>window.__test?.diagnostics().visuals.zombie.status==='ready');
  await tap('#start-btn');
  if(desktop)await page.waitForFunction(()=>document.pointerLockElement===document.getElementById('scene'));
  await page.waitForFunction(()=>window.__test.diagnostics().audioSamples.length===2);
  await encounter();
  assert.equal(await page.locator('#qte-prompt').isVisible(),true);
  assert.equal(await page.locator('#touch-stab').isVisible(),!desktop);
  assert.equal(await page.locator('#touch-fire').isVisible(),false);
  assert.equal((await state()).weather.lightning,0);
  assert.equal((await state()).weather.quiet,true);
  await shot('01-qte');
  const before=await state();await tap('#touch-pause');await step(20);
  assert.equal((await state()).player.health,before.player.health);
  await tap('#resume-btn');
  for(let i=0;i<7;i++){await tap('#touch-stab');await step(.09);}
  assert.equal((await state()).interaction.presses,7);await shot('02-knife-progress');
  await tap('#touch-stab');assert.equal((await state()).interaction.phase,'stab');await step(.16);await shot('03-eye-stab');
  await step(.14);assert.equal((await state()).interaction.phase,'throw');await shot('04-throw');
  await step(.5);let s=await state();assert.equal(s.interaction.phase,'recovery');
  assert.ok(s.player.cornZoneId);assert.ok(s.player.health>0&&s.player.health<100);await shot('05-recovery');
  const deadline=s.interaction.recoveryDeadline,enemy={x:s.enemy.x,z:s.enemy.z};
  await step(.1,{forward:1,fire:true,flashlight:true});s=await state();
  assert.equal(s.interaction.recoveryDeadline,deadline);assert.equal(s.enemy.x,enemy.x);assert.equal(s.enemy.z,enemy.z);
  checks.push(`${desktop?'Actual Space key presses':'Actual STAB taps'} advance the knife; pause freezes damage; real throw lands in corn with free movement and an immutable recovery deadline`);
  await page.setViewportSize({width:667,height:375});
  if((await state()).mode==='paused')await tap('#resume-btn');
  await step(Math.max(0,deadline-(await state()).elapsed-2),{pitch:.8});await shot('06-small-phone-countdown');
  const timer=await page.locator('#recovery-timer').boundingBox();assert.ok(timer.x>=0&&timer.x+timer.width<=667&&timer.y>=0&&timer.y+timer.height<=375);
  await step(2.35,{pitch:.8});s=await state();assert.equal(s.interaction,null);assert.ok(s.skyRedUntil>s.elapsed);assert.equal(s.weather.lightning,0);await shot('07-red-sky');
  await step(3,{pitch:.8});s=await state();assert.ok(s.skyRedUntil<=s.elapsed);await shot('08-sky-restored');
  checks.push('Small landscape countdown stays within the viewport; recovery ends and the three-second red sky restores');
  if(s.mode==='playing')await tap('#touch-pause');
  await tap(s.mode==='dead'?'#retry-btn':'#restart-btn');await encounter();
  await step(3.6);assert.equal((await state()).mode,'dead');assert.equal(await page.locator('#touch-stab').isVisible(),false);
  await tap('#retry-btn');s=await state();assert.equal(s.player.health,100);assert.equal(s.interaction,null);assert.equal(s.skyRedUntil,0);
  checks.push('Unanswered QTE kills; retry clears the encounter, sky state and queued actions');
  assert.deepEqual(errors,[]);report.status='passed';report.finalDiagnostics=await page.evaluate(()=>window.__test.diagnostics());
}catch(error){report.status='failed';report.failure=String(error);report.state=await state().catch(()=>null);await shot('failure').catch(()=>{});throw error;}
finally{await writeFile(`${output}/report.json`,JSON.stringify(report,null,2));await browser.close();console.log(JSON.stringify({status:report.status,checks,errors,failure:report.failure}));}
