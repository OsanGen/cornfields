import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {chromium} from '../scripts/browser-runtime.mjs';
import {comparePerformance} from './helpers/performance.mjs';
const output=new URL('../output/survival-browser/',import.meta.url);await mkdir(output,{recursive:true});
const browser=await chromium.launch({headless:false});
const page=await browser.newPage({viewport:{width:1280,height:720},deviceScaleFactor:1});
page.setDefaultTimeout(20000);
const errors=[],failedRequests=[],checks=[],report={status:'running',checks,errors,failedRequests};
page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
page.on('requestfailed',r=>failedRequests.push({url:r.url(),error:r.failure()}));
const state=()=>page.evaluate(()=>window.__test.state());
const step=(seconds,controls={})=>page.evaluate(({seconds,controls})=>window.__test.step(seconds,controls),{seconds,controls});
const shot=async name=>{await page.screenshot({path:fileURLToPath(new URL(name+'.png',output))});await writeFile(new URL(name+'.json',output),JSON.stringify(await state(),null,2));};
async function key(code){await page.keyboard.press(code);await page.evaluate(()=>window.advanceTime(1000/60));}
async function start(selector){await page.bringToFront();if(!await page.evaluate(()=>document.pointerLockElement!==null))await page.click(selector);await page.waitForFunction(()=>document.pointerLockElement!==null);await page.waitForFunction(()=>window.__test.diagnostics().audioState==='running');await page.evaluate(()=>window.advanceTime(0));}
async function restart(){if((await state()).mode==='playing')await key('Escape');await start((await state()).mode==='paused'?'#restart-btn':'#retry-btn');}
async function enterMaze(){await step(.9,{forward:1,yaw:0,pitch:0});await key('e');assert.equal((await state()).doorOpen,true);if((await state()).player.flashlightOn)await key('f');}
async function driveUntil(stop){return page.evaluate(stop=>{
  for(let i=0;i<2400;i++){
    const s=window.__test.state(),a=window.__test.anchors()[0];
    if(s.mode!=='playing')return s;
    if(stop==='hide'&&Math.hypot(s.player.x-a.x,s.player.z-a.z)<.6)return s;
    if(stop==='threat'&&s.enemy.visible&&s.enemy.distance<8&&s.enemy.lineOfSight&&!['staggered','disengage'].includes(s.enemy.state))return s;
    if(s.enemy.distance<3&&s.enemy.lineOfSight&&s.player.ammo>0&&s.player.shotCooldown<=0&&s.enemy.state!=='staggered'){
      const e=s.enemy.presentationPosition,p=s.player.presentationPosition,dx=e.x-p.x,dz=e.z-p.z;
      window.__test.step(1/60,{fire:true,yaw:Math.atan2(-dx,-dz),pitch:Math.atan2(1.25-1.58,Math.hypot(dx,dz))});
    }
    const path=window.__test.route(),next=path[1]||s.daughter;
    if(!next)throw new Error('No route');const dx=next.x-s.player.x,dz=next.z-s.player.z;
    window.__test.step(Math.min(.1,Math.hypot(dx,dz)/3.8),{forward:1,yaw:Math.atan2(-dx,-dz),pitch:0});
  }throw new Error('Route did not finish');
},stop);}
try{
  await page.goto(process.env.CORNFIELD_TEST_URL||'http://127.0.0.1:4173/?test=1&intro=off',{waitUntil:'networkidle'});
  await page.waitForFunction(()=>window.__test&&!document.getElementById('start-btn').disabled);
  assert.equal(await page.locator('#error').isVisible(),false);await shot('01-menu');checks.push('Menu, required art and HUD load');
  // On macOS a genuinely foreground click may be required once. This never
  // bypasses pointer lock or labels synthetic input as native input.
  if(process.env.CORNFIELD_NATIVE_START==='1'){
    console.log('READY_FOR_NATIVE_START: click ENTER THE FIELD in the verification Chrome window');
    await page.waitForFunction(()=>document.pointerLockElement!==null,{},{timeout:60000});
  }
  await start('#start-btn');await shot('02-entrance');checks.push('Pointer lock and audio unlock');
  const before=(await state()).player;await page.keyboard.down('w');await page.evaluate(()=>window.advanceTime(500));await page.keyboard.up('w');
  assert.ok(before.z-(await state()).player.z>1.8);checks.push('Fast movement works without Shift');
  await key('f');assert.equal((await state()).player.flashlightOn,false);await key('f');assert.equal((await state()).player.flashlightOn,true);checks.push('F toggles flashlight');
  await page.mouse.down();await page.mouse.up();await page.evaluate(()=>window.advanceTime(500));
  assert.equal((await state()).player.ammo,1);assert.equal((await state()).metrics.shotsHit,0);assert.equal(await page.locator('#ammo').textContent(),'1');checks.push('Left click consumes one round on a miss and updates HUD');
  await key('Escape');const paused=await state();await page.evaluate(()=>window.advanceTime(1000));assert.equal((await state()).elapsed,paused.elapsed);
  await page.waitForFunction(()=>window.__test.diagnostics().audioState==='suspended');await page.locator('#motion').check();await page.locator('#volume').fill('25');
  await start('#resume-btn');assert.equal((await page.evaluate(()=>window.__test.diagnostics())).reducedMotion,true);checks.push('Pause/resume, volume and reduced motion');
  await restart();assert.equal((await state()).player.ammo,2);assert.equal((await state()).player.health,100);await enterMaze();
  let near=await driveUntil('hide');assert.equal(near.mode,'playing');assert.ok(near.interactionPrompt.includes('CORN'));await shot('03-hide-entry');
  await key('e');assert.equal((await state()).player.hidden,true);assert.equal((await state()).player.flashlightOn,false);await shot('04-hidden');checks.push('Context tutorial, corn entry and flashlight auto-off');
  const hiding=await state();await step(1);assert.ok((await state()).elapsed>hiding.elapsed);assert.equal((await state()).player.hidden,true);
  report.unseenHide={entrySeen:hiding.enemy.memory.anchorId!==null,stillState:(await state()).enemy.state};
  if(!hiding.enemy.memory.anchorId){assert.equal((await state()).enemy.memory.anchorId,null);checks.push('Still unseen hide keeps exact anchor private while AI advances');}
  await page.mouse.move(660,365);await page.mouse.move(690,385);await page.evaluate(()=>window.advanceTime(1000/60));
  assert.equal((await state()).enemy.state,'corn_rush');await shot('05-detected-hide');checks.push('Real mouse movement reveals the hide and starts corn rush');
  await key('e');assert.equal((await state()).player.hidden,false);checks.push('Corn exit returns to corridor');
  await restart();await enterMaze();near=await driveUntil('threat');assert.equal(near.mode,'playing');
  const dx=near.enemy.presentationPosition.x-near.player.presentationPosition.x,dz=near.enemy.presentationPosition.z-near.player.presentationPosition.z;
  await step(.016,{yaw:Math.atan2(-dx,-dz),pitch:0});await key('f');await step(.24);
  assert.equal((await state()).enemy.state,'flashlight_recoil');await shot('06-recoil');await step(.7);assert.equal((await state()).enemy.state,'rage_chase');checks.push('Flashlight visibly recoils before rage');
  near=await state();const hitDx=near.enemy.presentationPosition.x-near.player.presentationPosition.x,hitDz=near.enemy.presentationPosition.z-near.player.presentationPosition.z;
  await step(.016,{yaw:Math.atan2(-hitDx,-hitDz),pitch:Math.atan2(-.33,Math.hypot(hitDx,hitDz))});
  await page.mouse.down();await page.mouse.up();await page.evaluate(()=>window.advanceTime(1000/60));
  assert.equal((await state()).enemy.state,'staggered');assert.equal((await state()).metrics.shotsHit,1);await shot('07-stagger');checks.push('Actual gun input hits, staggers and ends rage');
  await restart();await enterMaze();const ending=await driveUntil('won');assert.equal(ending.mode,'won');
  assert.deepEqual(ending.progress.activatedCheckpoints,['cross','barrels']);assert.equal(ending.metrics.checkpointTimes.length,2);assert.equal(ending.player.maxHealth,100);
  assert.equal(await page.locator('#result-title').textContent(),'You found Sadie.');await shot('08-daughter');checks.push('Full real-movement route activates both one-time checkpoints and daughter success');
  await restart();const fresh=await state();assert.equal(fresh.player.ammo,2);assert.equal(fresh.player.health,100);assert.equal(fresh.player.hidden,false);assert.deepEqual(fresh.progress.activatedCheckpoints,[]);assert.equal(fresh.metrics.shotsFired,0);checks.push('Restart clears all run state');
  await key('Escape');assert.deepEqual(errors,[]);assert.deepEqual(failedRequests,[]);
  report.ending=ending;report.diagnostics=await page.evaluate(()=>window.__test.diagnostics());
  await page.close();
  for(const mode of ['missing','delayed']){
    const fallback=await browser.newPage({viewport:{width:960,height:640}});let release;
    await fallback.route('**/zombie.glb',async route=>{if(mode==='missing')await route.fulfill({status:404,body:'Missing optional model'});else{await new Promise(resolve=>{release=resolve;});await route.continue().catch(()=>{});}});
    await fallback.goto('http://127.0.0.1:4173/?test=1&intro=off',{waitUntil:'domcontentloaded'});
    await fallback.waitForFunction(()=>window.__test&&!document.getElementById('start-btn').disabled);
    if(mode==='delayed')await fallback.waitForFunction(()=>window.__test.diagnostics().visuals.zombie.status==='fallback',{},{timeout:12000});
    assert.equal(await fallback.locator('#error').isVisible(),false);release?.();await fallback.close();checks.push('Start remains available with '+mode+' optional zombie');
  }
  if(process.env.CORNFIELD_BASELINE_SOURCE){
    report.performance=await comparePerformance(browser,process.env.CORNFIELD_BASELINE_SOURCE);
    await writeFile(new URL('performance.json',output),JSON.stringify(report.performance,null,2));
    for(const [name,comparison]of Object.entries(report.performance.comparisons)){
      assert.ok(comparison.withinBudget,name+' p95 exceeds the 10% refactor budget');
    }
    checks.push('Current source stays within 10% of the saved pre-refactor frame-time baseline');
  }
  report.status='passed';
}catch(error){report.status='failed';report.failure=String(error);report.state=await state().catch(()=>null);report.diagnostics=await page.evaluate(()=>window.__test?.diagnostics()).catch(()=>null);await page.screenshot({path:fileURLToPath(new URL('failure.png',output))}).catch(()=>{});throw error;}
finally{await writeFile(new URL('report.json',output),JSON.stringify(report,null,2));await browser.close();console.log(JSON.stringify({status:report.status,checks,failure:report.failure,errors,failedRequests}));}
