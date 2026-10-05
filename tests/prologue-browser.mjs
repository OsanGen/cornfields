import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from '../scripts/browser-runtime.mjs';
import {createPrologueTimeline} from '../src/prologue-script.js';
import {PROLOGUE_VOICE_TIMING} from '../src/prologue-voice-timing.js';
import {captureGame} from './helpers/capture.mjs';

const output=process.env.CORNFIELD_PROLOGUE_OUTPUT||'output/interactive-prologue-2026-10-02/browser';
const base=process.env.CORNFIELD_TEST_URL||'http://127.0.0.1:4180/cornfields/';
const timeline=createPrologueTimeline({durations:PROLOGUE_VOICE_TIMING});
const at=(id,offset=0)=>timeline.chapters.find(c=>c.id===id).start+offset;
await mkdir(output,{recursive:true});
const report={status:'running',checks:[],errors:[],shots:[],method:'Sequential desktop Chromium and touch emulation. Ordinary movement inputs drive the complete story on a manual clock; real pointer capture, audio decoding and GPU rendering. Human acting quality, physical phone performance and attentive human timing remain separate.'};
const browser=await chromium.launch({headless:true});const deadline=setTimeout(()=>browser.close(),180000);let page;
const intro=()=>page.evaluate(()=>window.__test.intro());
const state=()=>page.evaluate(()=>window.__test.state());
const advance=ms=>page.evaluate(ms=>window.advanceTime(ms),ms);
const gameOnly=state=>{const {opening,...game}=state;return game;};
async function shot(name){await captureGame(page,{path:`${output}/${name}.png`});report.shots.push(name);}
async function runTo(time){
  return page.evaluate(async target=>{
    const {followApproachTarget}=await import('./src/prologue-layout.js');
    for(let n=0;n<12000;n++){
      const s=window.__test.intro(),p=s.story.player;
      if(s.time>=target-1e-7||s.phase!=='playing')break;
      const controls={};
      if(s.story.waitingForExit)throw new Error('Unexpected exit gate');
      if(p.y>1.5&&!['redroom','rupture'].includes(s.story.chapter)){
        const target=followApproachTarget(p,s.story.escorts),dx=target.x-p.x,dz=target.z-p.z;
        if(Math.hypot(dx,dz)>.28){controls.forward=1;controls.yaw=Math.atan2(-dx,-dz);}
      }
      window.__test.step(Math.min(.05,target-s.time),controls,false);
    }
    window.advanceTime(0);return window.__test.intro();
  },time);
}
async function load({touch=false,missing=false,query=''}={}){
  await page?.close();page=await browser.newPage({viewport:touch?{width:844,height:390}:{width:1280,height:720},deviceScaleFactor:1,isMobile:touch,hasTouch:touch});
  page.setDefaultTimeout(18000);page.on('pageerror',error=>report.errors.push(String(error)));
  page.on('console',message=>{if(message.type()==='error'&&!missing)report.errors.push(message.text());});
  if(missing)await page.route('**/assets/audio/prologue/*.mp3',route=>route.fulfill({status:404,body:'Missing optional voice'}));
  await page.goto(`${base}?test=1&intro=on${query}`,{waitUntil:'networkidle'});await page.bringToFront();
  await page.waitForFunction(()=>window.__test?.intro().coreReady);
}
try{
  await load();const before=gameOnly(await state());await shot('00-preflight');
  await page.locator('#start-btn').click();await page.waitForFunction(()=>window.__test.intro().prologueAudio?.playing,{},{timeout:12000});
  await advance(0);assert.equal(await page.evaluate(()=>document.pointerLockElement?.id),'scene');
  const yaw=(await intro()).story.player.yaw;await page.mouse.move(340,270);await advance(20);
  assert.notEqual((await intro()).story.player.yaw,yaw);await page.evaluate(()=>window.__test.step(.05,{yaw:0,pitch:0}));
  await runTo(5);
  await page.waitForFunction(()=>Object.values(window.__test.intro().prologueVisuals.assets.castRoles).every(status=>status==='ready'));
  await advance(0);
  const candidate=(await intro()).prologueVisuals;
  assert.deepEqual(candidate.actors.map(actor=>actor.identity).sort(),['clarence','stanley']);
  assert.deepEqual(candidate.actors.map(actor=>actor.assetId).sort(),['cast-clarence.glb','cast-stanley.glb']);
  assert.equal(candidate.rain.glassSource,'BodyWindshield');assert.equal(candidate.rain.active,true);assert(candidate.rain.exteriorCount>0);assert(candidate.rain.maxDrawCalls<=2);
  report.checks.push('Actual role GLBs independently loaded; rain anchored to imported windshield with bounded draw batches');
  await shot('01-free-look-cruiser');await runTo(at('dispatch',1));
  await page.waitForFunction(()=>window.__test.diagnostics().visuals.prologueEquipment.radio?.status==='ready');
  const radio=(await page.evaluate(()=>window.__test.diagnostics())).visuals.prologueEquipment.radio;
  assert(radio.triangles<=2000);assert(radio.draws<=3);assert.equal(radio.error,null);
  report.checks.push('Modeled local dispatch radio loaded within approved geometry/draw caps');
  await shot('02-handheld-radio');
  await runTo(at('emergence')+(at('bang')-at('emergence'))*.52);await shot('02a-father-in-headlights');
  await page.keyboard.press('KeyE');await advance(20);assert.equal((await intro()).story.waitingForExit,false);assert.equal((await intro()).story.player.x,.5);
  await runTo(at('bang',.60));await page.evaluate(()=>window.__test.step(.001,{yaw:-1.52,pitch:.30}));await advance(0);await shot('02b-window-bang');
  const bang=(await intro()).prologueVisuals;assert.equal(bang.error,null);
  const father=bang.actors.find(actor=>actor.name==='Stanley Yates');assert.equal(father.pose,'bang');assert.equal(father.windowContacts.length,2);
  for(let i=0;i<2;i++)assert(Math.hypot(...father.windowContacts[i].map((v,j)=>v-father.windowTargets[i][j]))<.035,'hands contact the car window');
  const privateLine=timeline.lines.find(l=>l.id==='FLA-03');await runTo(privateLine.start+.1);await advance(0);
  assert.equal(await page.locator('#story-speaker').textContent(),'MIKE');assert.equal((await intro()).story.escorts.clarence.x,-.45);assert.equal((await intro()).story.player.x,.5);assert.equal((await intro()).story.fired.includes('door_open'),false);
  await page.evaluate(()=>window.__test.step(.001,{yaw:1.22,pitch:0}));await advance(0);await shot('02c-private-mike-line');
  assert.deepEqual((await intro()).story.fired.filter(id=>id.startsWith('car_bang_')),['car_bang_1','car_bang_2']);
  report.checks.push('Stopped-car father interruption, early exit blocked, two window contacts/knocks, private Mike line, Clarence remains seated and door sound waits for action');
  await runTo(at('exit'));assert.equal((await intro()).story.waitingForExit,true);await shot('03-exit-prompt');
  await page.keyboard.press('KeyE');await advance(1000);assert.equal((await intro()).story.waitingForExit,false);
  await page.keyboard.press('KeyF');await advance(50);assert.equal((await intro()).story.player.flashlightOn,true);
  for(const [id,offset,name] of [['walk',2,'04-walk'],['undead',.5,'05-corpse-vision'],['redroom',1,'06-red-room']]){await runTo(at(id,offset));await shot(name);}
  const room=(await intro()).story.player;await page.evaluate(()=>window.__test.step(.4,{strafe:1,yaw:0,pitch:.2}));assert.notEqual((await intro()).story.player.x,room.x);
  await page.keyboard.press('Escape');const paused=await intro();await advance(30000);assert.equal((await intro()).time,paused.time);
  await page.locator('#intro-continue').click();await advance(0);
  for(const [id,offset,name] of [['liquid',2,'07-liquid-gun-hands'],['rupture',2,'08-limp'],['rupture',5,'09-rise'],['rupture',7,'10-binary'],['rupture',11,'11-mist']]){await runTo(at(id,offset));await shot(name);}
  assert.deepEqual(gameOnly(await state()),before);assert.equal((await intro()).prologueVisuals.error,null);
  await runTo(timeline.duration);assert.equal((await intro()).stage,'credits');await shot('12-credits');
  await advance(20000);assert.equal((await state()).mode,'playing');assert.equal((await state()).elapsed,0);assert.equal((await state()).player.ammo,2);
  assert.equal(await page.locator('#ending-caption').isVisible(),true);await page.keyboard.down('KeyW');await advance(150);await page.keyboard.up('KeyW');assert.equal((await state()).player.moving,true);
  await shot('13-immediate-gameplay');await advance(4000);assert.equal((await intro()).prologueAudio.buffers,0);assert.equal((await intro()).prologueVisuals.live,false);assert.equal((await intro()).prologueVisuals.rain,null);
  assert.equal(await page.evaluate(()=>window.__test.diagnostics().visuals.prologueEquipment.meshes),0);
  report.checks.push('Complete interactive story, real look/exit/light, fixed visions, GPU shaders, frozen hunt, 20-second credits, immediate gameplay, ending narration and cleanup');
  await page.evaluate(()=>{window.__test.fixture('encounter');window.__test.step(.56);});assert.equal((await state()).interaction.phase,'qte');
  for(let i=0;i<8;i++){await page.keyboard.press('Space');await advance(3);}await advance(1000);assert.equal((await state()).interaction.phase,'recovery');
  await page.keyboard.press('Escape');const prior=gameOnly(await state());await page.locator('#replay-intro').click();await page.waitForFunction(()=>window.__test.intro().phase==='playing');
  await advance(0);await page.keyboard.press('KeyK');assert.deepEqual(gameOnly(await state()),prior);
  report.checks.push('Existing QTE and replay preserve gameplay');
  await load({touch:true});await page.locator('#intro-motion').check();await page.locator('#start-btn').tap();await advance(0);
  assert.equal(await page.locator('#touch-controls').isVisible(),true);assert.equal(await page.locator('#touch-fire').isVisible(),false);
  const touchSession=await page.context().newCDPSession(page);
  await touchSession.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:500,y:160}]});
  await touchSession.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:560,y:150}]});await advance(50);
  await touchSession.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await touchSession.detach();assert.notEqual((await intro()).story.player.yaw,0);
  await runTo(at('bang',.60));await page.evaluate(()=>window.__test.step(.001,{yaw:-1.52,pitch:.30}));await advance(0);await shot('14a-touch-window-bang');
  assert.equal((await intro()).prologueVisuals.confrontation.cameraImpact,0);
  const reducedRain=(await intro()).prologueVisuals.rain;assert.equal(reducedRain.reduced,true);assert(reducedRain.exteriorCount<reducedRain.poolSize);
  assert.equal(await page.locator('#touch-interact').isVisible(),false);assert.equal((await intro()).story.player.x,.5);
  await runTo(privateLine.start+.1);await advance(0);assert.equal(await page.locator('#story-speaker').textContent(),'MIKE');assert.equal((await intro()).story.escorts.clarence.x,-.45);await shot('14b-touch-private-exchange');
  await runTo(at('exit'));await page.locator('#touch-interact').tap();await advance(1000);assert.equal((await intro()).story.waitingForExit,false);
  await page.locator('#touch-light').tap();await advance(50);assert.equal((await intro()).story.player.flashlightOn,true);
  await runTo(at('walk',2));await shot('14-phone-controls-captions');assert.ok(await page.locator('#story-subtitle').evaluate(el=>el.scrollWidth<=el.clientWidth+1));
  await page.locator('#opening-pause').tap();const stopped=await intro();await advance(30000);assert.equal((await intro()).time,stopped.time);
  await page.setViewportSize({width:390,height:844});await page.waitForFunction(()=>document.getElementById('intro-continue').disabled);
  await page.setViewportSize({width:844,height:390});await page.locator('#intro-continue').tap();await advance(0);
  await page.locator('#story-skip').tap();assert.equal((await intro()).stage,'credits');await page.locator('#intro-skip').tap();assert.equal((await state()).mode,'playing');
  assert.equal(await page.locator('#touch-fire').isVisible(),true);report.checks.push('Touch look/exit/flashlight, readable captions, reduced mode, orientation pause, resume, both skips');
  await load({missing:true});await page.locator('#start-btn').click();await advance(0);await runTo(5);assert.ok((await state()).opening.subtitle);
  await page.keyboard.press('KeyK');assert.equal((await state()).mode,'playing');assert.equal((await intro()).prologueAudio.buffers,0);report.checks.push('Missing voice keeps subtitles and immediate skip');
  assert.deepEqual(report.errors,[]);report.status='passed';
}catch(error){report.status='failed';report.failure=String(error);throw error;}
finally{clearTimeout(deadline);await browser.close();await writeFile(`${output}/report.json`,JSON.stringify(report,null,2));console.log(JSON.stringify({status:report.status,failure:report.failure,checks:report.checks,errors:report.errors}));}
