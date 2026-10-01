import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from '../scripts/browser-runtime.mjs';
import {startPreview} from '../scripts/preview-dist.mjs';
import {captureGame} from './helpers/capture.mjs';

const output=process.env.CORNFIELD_POLISH_OUTPUT||'output/polish-2026-10-01/browser';await mkdir(output,{recursive:true});
const preview=await startPreview({port:0,basePath:'/cornfields/',seconds:180});
const browser=await chromium.launch({headless:true,args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const report={errors:[],devices:[],method:'Real desktop/touch startup, fixture positioning, accepted stab input and rendered blade contact. Touch is emulated.'};
const deadline=setTimeout(()=>browser.close(),150000);
try{
  for(const touch of [false,true]){
    const name=touch?'touch':'desktop',page=await browser.newPage({viewport:touch?{width:844,height:390}:{width:1280,height:720},hasTouch:touch,isMobile:touch,deviceScaleFactor:1});
    page.setDefaultTimeout(15000);page.on('pageerror',e=>report.errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text());});
    await page.goto(preview.url+'?test=1&intro=off&quality=balanced',{waitUntil:'networkidle'});await page.bringToFront();await page.waitForFunction(()=>window.__test?.intro().coreReady);
    const step=(seconds,input={})=>page.evaluate(({seconds,input})=>window.__test.step(seconds,input),{seconds,input});
    await step(0);await page.locator('#start-btn')[touch?'tap':'click']();
    await page.waitForFunction(()=>['growl','roar','roarAlt'].every(k=>window.__test.diagnostics().audioSamples.includes(k)));
    await page.evaluate(()=>window.__test.fixture('viewmodel'));await step(.02,{yaw:Math.PI});
    assert.equal((await page.evaluate(()=>window.__test.diagnostics())).visuals.hands.status,'ready');
    await captureGame(page,{path:`${output}/${name}-grip.png`});
    await step(.02,{pitch:-.55,flashlight:true});await captureGame(page,{path:`${output}/${name}-corridor-ground.png`});
    await page.evaluate(()=>window.__test.fixture('field'));await step(.02,{pitch:-.55});
    let d=await page.evaluate(()=>window.__test.diagnostics());assert(d.visuals.ground.grass>10);assert(d.visuals.ground.rocks>10);
    await captureGame(page,{path:`${output}/${name}-field-ground.png`});
    await step(.02,{pitch:0});await captureGame(page,{path:`${output}/${name}-wind-a.png`});await step(2);await captureGame(page,{path:`${output}/${name}-wind-b.png`});
    // Drive the real HUD renderer with simultaneous captions and danger messages.
    await page.evaluate(async touch=>{
      const main=document.querySelector('script[type=module][src]').src,load=name=>import(new URL('./'+name,main));
      const [{createUI},{createGame},{createMaze}]=await Promise.all([load('ui.js'),load('game.js'),load('maze.js')]);
      const game=createGame(createMaze({corridors:true}));Object.assign(game,{mode:'playing',elapsed:4,caption:'IT IS COMING INTO THE CORN.'});Object.assign(game.player,{hidden:true,cornZoneId:'open-field',cornEnteredAt:0});Object.assign(game.threat,{activeMessage:'It found you. Move.',lastMessageAt:4});
      createUI(document,{touch}).render(game);
    },touch);
    const warning=await page.evaluate(()=>['caption','threat-card','hide-status','corn-taunt'].filter(id=>!document.getElementById(id).hidden));assert.deepEqual(warning,['threat-card']);
    const box=await page.locator('#threat-card').boundingBox();assert(box.width>0&&box.y>=0&&box.x>=0);
    await captureGame(page,{path:`${output}/${name}-warning.png`});
    await page.evaluate(()=>window.__test.fixture('encounter'));await step(.56);assert.equal((await page.evaluate(()=>window.__test.state())).interaction.phase,'qte');
    await captureGame(page,{path:`${output}/${name}-knife-grip.png`});
    for(let i=0;i<8;i++){if(touch)await page.locator('#touch-stab').tap();else await page.keyboard.press('Space');await page.evaluate(()=>window.advanceTime(3));}
    const s=await page.evaluate(()=>window.__test.state());assert.equal(s.interaction.phase,'stab');
    await step(Math.max(0,s.interaction.contactAt+.012-s.elapsed));d=await page.evaluate(()=>window.__test.diagnostics());
    assert(d.visuals.knife.contact);assert(d.visuals.knife.contactGap<.012,JSON.stringify(d.visuals.knife));
    await captureGame(page,{path:`${output}/${name}-knife-contact.png`});
    await step(.8);assert.equal((await page.evaluate(()=>window.__test.state())).interaction.phase,'recovery');
    report.devices.push({name,warningOwner:warning[0],contactGap:d.visuals.knife.contactGap,ground:d.visuals.ground,audioSamples:d.audioSamples});await page.close();
  }
  assert.deepEqual(report.errors,[]);report.status='passed';
}catch(error){report.status='failed';report.failure=String(error);console.error(error);process.exitCode=1;}
finally{clearTimeout(deadline);await browser.close();preview.server.close();await writeFile(output+'/report.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));}
