import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from '../scripts/browser-runtime.mjs';

const base=process.env.CORNFIELD_TEST_URL||'http://127.0.0.1:4180/cornfields/';
const output='output/control-mode';await mkdir(output,{recursive:true});
const browser=await chromium.launch({headless:true});
const report={base,cases:[],errors:[]};
try{
  for(const [name,phone,width,query] of [
    ['desktop',false,1280,''],
    ['desktop-old-mobile-link',false,1280,'controls=touch'],
    ['narrow-desktop',false,667,''],
    ['phone',true,844,''],
    ['phone-old-desktop-link',true,844,'controls=mouse'],
  ]){
    const page=await browser.newPage({viewport:{width,height:phone||width<700?390:720},deviceScaleFactor:1,isMobile:phone,hasTouch:phone});
    try{
      page.on('pageerror',e=>report.errors.push(String(e)));
      page.on('response',r=>{if(r.status()>=400)report.errors.push(`${r.status()} ${r.url()}`);});
      const url=new URL(base);url.searchParams.delete('test');url.searchParams.delete('controls');
      url.searchParams.set('intro','off');
      for(const [key,value] of new URLSearchParams(query))url.searchParams.set(key,value);
      await page.goto(url.href,{waitUntil:'networkidle'});
      await page.waitForFunction(()=>!document.getElementById('start-btn').disabled);
      assert.equal(await page.locator('body').evaluate(el=>el.classList.contains('touch')),phone);
      assert.match(await page.locator('#device-label').innerText(),phone?/PHONE/:/DESKTOP/);
      if(phone)await page.locator('#start-btn').tap();else await page.locator('#start-btn').click();
      await page.waitForFunction(()=>JSON.parse(window.render_game_to_text()).mode==='playing');
      assert.equal(await page.locator('#touch-controls').isVisible(),phone);
      assert.equal(await page.evaluate(()=>document.pointerLockElement===document.getElementById('scene')),!phone);
      if(!phone){
        const before=await page.evaluate(()=>JSON.parse(window.render_game_to_text()).player.z);
        await page.keyboard.down('w');await page.evaluate(()=>window.advanceTime(150));await page.keyboard.up('w');
        assert.ok(await page.evaluate(()=>JSON.parse(window.render_game_to_text()).player.z)<before-.2);
      }
      await page.screenshot({path:`${output}/${name}.png`});
      report.cases.push({name,url:url.href,controls:phone?'touch':'mouse',passed:true});
    }finally{await page.close();}
  }
  assert.deepEqual(report.errors,[]);report.status='passed';
}catch(error){report.status='failed';report.failure=String(error);throw error;}
finally{await browser.close();await writeFile(`${output}/browser-report.json`,JSON.stringify(report,null,2));console.log(JSON.stringify(report));}
