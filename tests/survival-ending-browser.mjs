import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from '../scripts/browser-runtime.mjs';
import {SURVIVAL_LINES,ROOM_DURATION} from '../src/survival-script.js';
const output=process.env.CORNFIELD_SURVIVAL_OUTPUT||'output/blood-room-trial-2026-10-02/browser';
const base=process.env.CORNFIELD_TEST_URL||'http://127.0.0.1:4180/cornfields/';
await mkdir(output,{recursive:true});
const report={status:'running',checks:[],errors:[],roomSeconds:ROOM_DURATION+3.5,shots:[],method:'Sequential desktop Chromium and touch emulation, real GPU, pointer/audio unlock, manual simulation clock. Expiry fixture shortens only the deadline and gives existing test grace; no human fear/fairness/device FPS claim.'};
const browser=await chromium.launch({headless:true});let page;const deadline=setTimeout(()=>browser.close(),150000);
const state=()=>page.evaluate(()=>window.__test.state());
const step=(seconds,controls={})=>page.evaluate(([seconds,controls])=>window.__test.step(seconds,controls),[seconds,controls]);
async function walkToRim(){const s=await state(),c=s.survivalEnding.center;await step(.7,{forward:1,yaw:Math.atan2(s.player.x-c.x,s.player.z-c.z)});}
async function shot(name){await page.screenshot({path:`${output}/${name}.png`});report.shots.push(name);}
async function load(touch=false,missing=false){
  await page?.close();page=await browser.newPage({viewport:touch?{width:844,height:390}:{width:1280,height:720},isMobile:touch,hasTouch:touch,deviceScaleFactor:1});
  if(touch)await page.emulateMedia({reducedMotion:'reduce'});
  page.setDefaultTimeout(15000);page.on('pageerror',e=>report.errors.push(String(e)));page.on('console',m=>{if(m.type()==='error'&&!missing)report.errors.push(m.text());});
  if(missing)await page.route('**/assets/audio/survival/*.mp3',route=>route.fulfill({status:404,body:'Optional voice absent'}));
  await page.goto(`${base}?test=1&intro=off&ending=on${touch?'&touch=1':''}`,{waitUntil:'networkidle'});await page.bringToFront();
  await page.waitForFunction(()=>window.__test?.diagnostics().intro.coreReady);await page.locator('#start-btn').click();await page.evaluate(()=>window.advanceTime(0));
}
try{
  await load();let s=await state();assert.equal(s.survivalEnding.phase,'arrival');const origin={...s.player};
  await page.keyboard.down('KeyW');await page.evaluate(()=>window.advanceTime(400));await page.keyboard.up('KeyW');s=await state();assert.notEqual(s.player.z,origin.z);assert.equal(s.survivalEnding.remaining,180);
  await step(2.4);assert.equal((await state()).survivalEnding.phase,'entry');await step(2.1);assert.equal((await state()).survivalEnding.phase,'room');
  await step(.3,{forward:1,yaw:.1});assert.notEqual((await state()).survivalEnding.roomPlayer.z,3);await shot('01-blood-room');
  for(const line of SURVIVAL_LINES.filter(l=>l.chapter==='room')){
    const at=(await state()).survivalEnding.time;
    if(at<line.start+.03)await step(line.start+.03-at);
    assert.equal(await page.locator('#ending-caption').textContent(),line.text);await page.waitForTimeout(100);await step(0);
    assert.equal((await page.evaluate(()=>window.__test.diagnostics())).survivalAudio.voice,line.id);
  }
  const roomPosition=(await state()).survivalEnding.roomPlayer;
  await page.evaluate(()=>window.dispatchEvent(new Event('blur')));const stopped=await state();await step(20);assert.deepEqual((await state()).survivalEnding,stopped.survivalEnding);
  await page.locator('#resume-btn').click();await step(ROOM_DURATION-(await state()).survivalEnding.time+.02);await step(1.52);s=await state();assert.equal(s.survivalEnding.phase,'active');assert.ok(s.survivalEnding.remaining>179.95);assert.notEqual(s.player.z,roomPosition.z);
  assert.equal(await page.locator('#trial-timer').isVisible(),true);await shot('02-normal-game-with-timer');report.checks.push('Free arrival movement, free bounded blood room, all eight subtitles, focus pause, direct same-game return');
  await page.evaluate(()=>window.__test.fixture('survival-death'));await step(10);assert.equal((await state()).mode,'dead');await page.locator('#retry-btn').click();await page.evaluate(()=>window.advanceTime(0));s=await state();assert.equal(s.survivalEnding.phase,'active');assert.equal(s.survivalEnding.remaining,180);assert.equal(s.player.health,100);assert.equal(s.player.ammo,2);report.checks.push('Existing resident deals fatal damage in a close-contact fixture; direct fresh retry without briefing');
  await page.evaluate(()=>window.__test.fixture('survival-expire'));await step(.02);s=await state();assert.equal(s.survivalEnding.phase,'transform');assert.equal(s.survivalEnding.remaining,0);await step(1.5);await shot('03-corridors-sinking');await step(2.6);assert.equal((await state()).survivalEnding.phase,'pit');await shot('04-bottomless-pit');
  await step(35);assert.equal((await state()).survivalEnding.phase,'pit');
  await walkToRim();assert.equal((await state()).interactionPrompt,'E - JUMP');await page.keyboard.press('KeyE');await page.evaluate(()=>window.advanceTime(30));assert.equal((await state()).survivalEnding.phase,'fall');await step(3.3);assert.equal((await state()).mode,'playtest-ended');assert.match(await page.locator('#result-title').textContent(),/END OF CURRENT PLAYTEST/);await shot('05-playtest-end');report.checks.push('Zero damage cutoff, four-second removal, safe pit, no forced fall, actual E jump, separate playtest result');
  await load(true,true);await step(4.9);await step(.4,{forward:1});assert.equal((await state()).survivalEnding.phase,'room');assert.equal((await page.evaluate(()=>window.__test.diagnostics())).reducedMotion,true);await shot('06-touch-room-missing-audio');await step(ROOM_DURATION+2);assert.equal((await state()).survivalEnding.phase,'active');
  await page.evaluate(()=>window.__test.fixture('survival-expire'));await step(4.2);await walkToRim();assert.equal(await page.locator('#touch-interact').textContent(),'JUMP');assert.equal(await page.locator('#touch-interact').isVisible(),true);assert.equal(await page.locator('#touch-fire').isVisible(),false);await shot('07-touch-pit-jump');await page.locator('#touch-interact').tap();await page.evaluate(()=>window.advanceTime(30));assert.equal((await state()).survivalEnding.phase,'fall');await step(3.3);assert.equal((await state()).mode,'playtest-ended');report.checks.push('Touch contextual jump, hidden combat buttons, reduced room, absent voice fallback');
  assert.deepEqual(report.errors,[]);report.status='passed';
}catch(error){report.status='failed';report.failure=String(error);throw error;}
finally{clearTimeout(deadline);await browser.close();await writeFile(`${output}/report.json`,JSON.stringify(report,null,2));console.log(JSON.stringify(report));}
