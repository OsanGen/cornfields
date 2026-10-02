import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {chromium} from '../scripts/browser-runtime.mjs';
import {startPreview} from '../scripts/preview-dist.mjs';
import {captureGame} from './helpers/capture.mjs';

const output=process.env.CORNFIELD_TEST_OUTPUT||'output/pursuit-portals-2026-10-01/browser';await mkdir(output,{recursive:true});
const preview=await startPreview({port:0,basePath:'/cornfields/',seconds:180});
const browser=await chromium.launch({headless:true,args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const report={status:'running',errors:[],devices:[],performance:[],method:'Actual start, movement, sprint and pause inputs; fixture positioning for entrance/chase. Desktop and touch emulation. GPU submission timing is not physical-phone FPS.'};
const deadline=setTimeout(()=>browser.close(),150000);
async function measure(page){return page.evaluate(()=>{const gl=document.querySelector('#scene').getContext('webgl2'),values=[];for(let i=0;i<40;i++){const start=performance.now();window.__test.step(0);gl.finish();if(i>=10)values.push(performance.now()-start);}values.sort((a,b)=>a-b);const d=window.__test.diagnostics();return {p95Ms:values[28],medianMs:values[15],draws:d.drawCalls,triangles:d.triangles};});}
try{
 for(const touch of [false,true]){
  const name=touch?'touch':'desktop',page=await browser.newPage({viewport:touch?{width:844,height:390}:{width:1280,height:720},isMobile:touch,hasTouch:touch,deviceScaleFactor:1});page.setDefaultTimeout(15000);
  page.on('pageerror',e=>report.errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text());});
  await page.goto(preview.url+'?test=1&intro=off&quality=balanced',{waitUntil:'networkidle'});await page.bringToFront();await page.waitForFunction(()=>window.__test?.intro().coreReady);
  const step=(seconds,input={})=>page.evaluate(({seconds,input})=>window.__test.step(seconds,input),{seconds,input});
  const state=()=>page.evaluate(()=>window.__test.state());const diagnostics=()=>page.evaluate(()=>window.__test.diagnostics());
  await step(0);await page.locator('#start-btn')[touch?'tap':'click']();await page.evaluate(()=>window.__test.fixture('gate'));await step(.55,{forward:-1});
  await page.waitForFunction(()=>window.__test.diagnostics().visuals.corridors.portals.texture==='ready');
  assert.equal((await state()).interactionPrompt,'');if(touch)assert.equal(await page.locator('#touch-interact').isVisible(),false);
  let d=await diagnostics();assert(d.visuals.corridors.portals.visible>0);assert(d.visuals.corridors.portals.draws<=8);
  await captureGame(page,{path:`${output}/${name}-entrance.png`});report.performance.push({device:name,version:'current',...await measure(page)});
  const beforeTime=d.visuals.corridors.portals.time;await step(1);assert((await diagnostics()).visuals.corridors.portals.time>beforeTime);await captureGame(page,{path:`${output}/${name}-liquid.png`});
  async function move(seconds,{sprint=true}={}){
   if(touch){const box=await page.locator('#move-stick').boundingBox(),x=box.x+box.width/2,y=box.y+box.height/2;await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x,y-box.width*(sprint?.34:.22));}
   else{if(sprint)await page.keyboard.down('ShiftLeft');await page.keyboard.down('KeyW');}
   await page.evaluate(ms=>window.advanceTime(ms),seconds*1000);
   if(touch)await page.mouse.up();else{await page.keyboard.up('KeyW');await page.keyboard.up('ShiftLeft');}
  }
  await move(1.2);assert.equal((await state()).zone,'field');assert.equal((await state()).player.sprinting,false);
  const trip=(await state()).fieldTrip,time=(await state()).corridorRun.elapsed;
  await step(.5);assert.equal((await state()).corridorRun.elapsed,time);assert.equal((await state()).player.sprinting,false);
  assert.equal((await state()).interactionPrompt,'');await step(.017,{yaw:0});await captureGame(page,{path:`${output}/${name}-field-return.png`});
  await move(.8);assert.equal((await state()).zone,'corridor');assert.equal((await state()).fieldTrip.doorId,trip.doorId);await step(.4);assert.equal((await state()).zone,'corridor');
  for(const offset of [-.515,.515]){
   await page.evaluate(()=>window.__test.fixture('gate'));
   await step(Math.abs(offset)/3.95,{strafe:Math.sign(offset)});
   await move(.55,{sprint:false});assert.equal((await state()).zone,'field');
   assert.equal((await diagnostics()).visuals.corridors.activeZone,'field');
   const edgeTrip=(await state()).fieldTrip,edgeTime=(await state()).corridorRun.elapsed;
   await step(.35,{yaw:0});assert.equal((await state()).corridorRun.elapsed,edgeTime);
   await captureGame(page,{path:`${output}/${name}-edge-${offset<0?'left':'right'}.png`});
   await move(.8,{sprint:false});assert.equal((await state()).zone,'corridor');
   assert.equal((await state()).fieldTrip.doorId,edgeTrip.doorId);
   assert.equal((await state()).fieldTrip.serial,edgeTrip.serial);await step(.35);
  }
  await page.evaluate(()=>window.__test.fixture('gate'));await step(.55,{forward:-1});
  if(touch)await page.locator('#touch-pause').tap();else await page.keyboard.press('Escape');
  await page.selectOption('#graphics-quality','low');await page.locator('#motion').check();await page.locator('#resume-btn')[touch?'tap':'click']();await step(.02);const reduced=(await diagnostics()).visuals.corridors.portals;
  await step(.5);assert.equal((await diagnostics()).visuals.corridors.portals.time,reduced.time);assert.equal(reduced.reduced,true);assert(reduced.draws<=2);
  await captureGame(page,{path:`${output}/${name}-reduced.png`});
  await page.evaluate(()=>window.__test.fixture('corridor'));await step(.017,{yaw:0});const first=await state(),e=first.enemies[0],gap=Math.hypot(e.x-first.player.x,e.z-first.player.z);
  await step(1.2);const later=await state(),enemy=later.enemies[0];assert.equal(enemy.state,'chase');assert(Math.hypot(enemy.x-later.player.x,enemy.z-later.player.z)<gap-3);
  await captureGame(page,{path:`${output}/${name}-pursuer.png`});
  report.devices.push({name,walkThrough:true,sprint:false,edgeEntries:[-.515,.515],edgeReturns:true,matchingReturn:trip.doorId,timerPaused:true,reducedEffects:true,chaseCloses:true,portalDrawCap:d.visuals.corridors.portals.maxVisible*4});await page.close();
 }
 const baselinePath=process.env.CORNFIELD_BASELINE_DIST;
 if(baselinePath){const baseline=await startPreview({root:path.resolve(baselinePath),port:0,basePath:'/cornfields/',seconds:120});
  try{for(const touch of [false,true]){const page=await browser.newPage({viewport:touch?{width:844,height:390}:{width:1280,height:720},isMobile:touch,hasTouch:touch});await page.goto(baseline.url+'?test=1&intro=off&quality=balanced',{waitUntil:'networkidle'});await page.bringToFront();await page.waitForFunction(()=>window.__test?.intro().coreReady);await page.evaluate(()=>window.__test.step(0));await page.locator('#start-btn')[touch?'tap':'click']();await page.evaluate(()=>{window.__test.fixture('gate');window.__test.step(.55,{forward:-1});});report.performance.push({device:touch?'touch':'desktop',version:'baseline',...await measure(page)});await page.close();}}finally{baseline.server.close();}
 }
 assert.deepEqual(report.errors,[]);report.status='passed';
}catch(error){report.status='failed';report.failure=String(error);console.error(error);process.exitCode=1;}
finally{clearTimeout(deadline);await browser.close();preview.server.close();await writeFile(`${output}/report.json`,JSON.stringify(report,null,2));console.log(JSON.stringify(report));}
