import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from '../scripts/browser-runtime.mjs';
import {startPreview} from '../scripts/preview-dist.mjs';
import {captureGame} from './helpers/capture.mjs';
const output=process.env.CORNFIELD_BROWSER_OUTPUT||'output/corridor-field/browser';await mkdir(output,{recursive:true});
const preview=await startPreview({port:0,basePath:'/cornfields/',seconds:240});
const browser=await chromium.launch({headless:process.env.CORNFIELD_HEADED!=='1',args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const report={errors:[],devices:[],method:'Real desktop/touch startup and gate actions, deterministic movement. Fixtures only position gate/QTE scenarios and arm exit eligibility.'};
const deadline=setTimeout(()=>browser.close(),300000);
try{
 for(const touch of [false,true]){
  const kind=touch?'touch':'desktop',page=await browser.newPage({viewport:touch?{width:844,height:390}:{width:960,height:540},isMobile:touch,hasTouch:touch,deviceScaleFactor:1});
  page.setDefaultTimeout(15000);page.on('pageerror',e=>report.errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text());});
  const state=()=>page.evaluate(()=>window.__test.state());
  const step=(seconds,input={})=>page.evaluate(({seconds,input})=>window.__test.step(seconds,input),{seconds,input});
  const shot=async name=>{const d=await page.evaluate(()=>window.__test.diagnostics());console.log(kind,name,JSON.stringify({drawCalls:d.drawCalls,triangles:d.triangles,mode:d.mode,zone:d.zone}));await captureGame(page,{path:`${output}/${kind}-${name}.png`,timeout:30000,animations:'disabled'});};
  const action=async type=>{if(touch)await page.locator(type==='interact'?'#touch-interact':'#touch-stab').tap();else await page.keyboard.press(type==='interact'?'KeyE':'Space');await page.evaluate(()=>window.advanceTime(17));};
  await page.goto(preview.url+'?test=1&intro=off',{waitUntil:'networkidle'});await page.waitForFunction(()=>window.__test?.intro().coreReady);
  await page.bringToFront();await step(0);
  await page.waitForFunction(()=>window.__test.diagnostics().visuals.zombie.status!=='loading');
  assert.equal((await page.evaluate(()=>window.__test.diagnostics())).visuals.zombie.status,'ready');
  await page.locator('#start-btn')[touch?'tap':'click']();await step(0);
  assert.equal((await state()).mode,'playing');assert.equal((await page.evaluate(()=>window.__test.diagnostics())).controlMode,touch?'touch':'mouse');
  if(!touch)assert.equal(await page.evaluate(()=>document.pointerLockElement?.id),'scene');
  await shot('01-start');
  await page.evaluate(()=>window.__test.fixture('corridor'));await step(.02,{yaw:Math.PI});await shot('01b-wide-corridors');
  await page.evaluate(()=>window.__test.fixture('gate'));await shot('02-corridor-door');
  await action('interact');await step(.5);await step(.8,{forward:1});
  assert.equal((await state()).zone,'field');await shot('03-open-field');
  const before=(await state()).corridorRun.elapsed;await step(1);assert.equal((await state()).corridorRun.elapsed,before);
  await step(11,{forward:1,yaw:Math.PI});await step(17);const deep=await state();
  assert.equal(deep.zone,'field');assert.equal(deep.enemies.filter(e=>e.id!=='pursuer').length,3);await shot('04-deep-field');
  // Walk back using ordinary movement; the return plane must map to the original door.
  await page.evaluate(()=>{for(let i=0;i<1000;i++){const s=window.__test.state();if(s.zone==='corridor'){window.__test.step(0);return;}if(s.interaction&&s.interaction.phase!=='recovery'){window.__test.step(.017,{stab:true},false);continue;}const p=s.player;window.__test.step(.05,{forward:1,yaw:Math.atan2(p.x,p.z+1)},false);}throw Error('Could not return to corridor');});
  assert.equal((await state()).fieldTrip.doorId,deep.fieldTrip.doorId);await shot('05-return');
  await page.evaluate(()=>window.__test.fixture('encounter'));await step(.56);assert.equal((await state()).interaction?.phase,'qte');await shot('06-qte');
  for(let i=0;i<8;i++)await action('stab');await step(1);let s=await state();assert.equal(s.interaction?.phase,'recovery');
  assert.equal(s.interaction.recoveryDeadline-s.interaction.phaseStartedAt,10);
  await step(s.interaction.recoveryDeadline-s.elapsed+.03);assert.equal((await state()).interaction,null);
  await page.evaluate(()=>window.__test.fixture('eligible'));await step(.6);assert.equal((await state()).corridorRun.ready,true);await shot('07-ready');
  assert.equal(await page.evaluate(()=>JSON.parse(window.render_game_to_text()).corridorRun),undefined);
  report.devices.push({kind,status:'passed',corridorWidth:(await page.evaluate(()=>window.__test.corridors())).clearWidth,deepEnemies:deep.enemies.length});await page.close();
 }
 assert.deepEqual(report.errors,[]);report.status='passed';
}catch(e){report.status='failed';report.failure=String(e);throw e;}
finally{clearTimeout(deadline);await writeFile(output+'/report.json',JSON.stringify(report,null,2));await browser.close();preview.server.close();}
