import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from '../scripts/browser-runtime.mjs';

const output='output/hands-corn/browser';
const base=process.env.CORNFIELD_TEST_URL||'http://127.0.0.1:4180/cornfields/';
await mkdir(output,{recursive:true});
const browser=await chromium.launch({headless:process.env.CORNFIELD_HEADED!=='1'});
const report={checks:[],errors:[],devices:[]};
const deadline=setTimeout(()=>browser.close(),150000);
try{
  for(const touch of process.env.CORNFIELD_DEVICE==='phone'?[true]:[false,true]){
    const kind=touch?'phone':'desktop';
    const page=await browser.newPage({viewport:touch?{width:844,height:390}:{width:1280,height:720},deviceScaleFactor:1,isMobile:touch,hasTouch:touch});
    page.setDefaultTimeout(10000);
    page.on('pageerror',e=>report.errors.push(String(e)));
    page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text());});
    const state=()=>page.evaluate(()=>window.__test.state());
    const diagnostics=()=>page.evaluate(()=>window.__test.diagnostics());
    const step=(seconds,input={})=>page.evaluate(({seconds,input})=>window.__test.step(seconds,input),{seconds,input});
    const advance=seconds=>page.evaluate(seconds=>window.advanceTime(seconds*1000),seconds);
    const click=selector=>touch?page.locator(selector).tap():page.locator(selector).click();
    const screenshot=name=>page.screenshot({path:`${output}/${kind}-${name}.png`,timeout:10000});
    const pause=()=>touch?click('#touch-pause'):page.keyboard.press('Escape');
    const press=()=>touch?click('#touch-stab'):page.keyboard.press('Space');
    for(const clean of [true,false]){
      await page.goto(base+`?test=1&intro=off&survival=off${clean?'&horror=off':''}`,{waitUntil:'networkidle'});await page.bringToFront();
      await page.waitForFunction(()=>window.__test?.diagnostics().visuals.hands.status==='ready');
      assert.equal((await diagnostics()).controlMode,touch?'touch':'mouse');
      if(clean)await screenshot('00-title');
      await page.locator('#player-alias').fill('ROWAN <3');
      await click('#start-btn');await advance(0);
      if(!touch)await page.waitForFunction(()=>document.pointerLockElement===document.getElementById('scene'));
      assert.ok(!JSON.stringify(await diagnostics()).includes('ROWAN'));
      if(clean){
        await screenshot('01-gun');
        await page.evaluate(()=>window.__test.fixture('gate'));
        if(touch)await click('#touch-interact');else await page.keyboard.press('KeyE');
        await advance(.4);
        assert.equal((await state()).cornDoors.filter(d=>d.amount>0).length,1);
        if(touch)await step(.3,{forward:1});
        else{await page.keyboard.down('KeyW');await advance(.3);await page.keyboard.up('KeyW');}
        await step(.2);assert.ok((await state()).player.cornZoneId);await screenshot('02-corn');
        await pause();await advance(0);const paused=await state();await advance(5);
        assert.equal((await state()).elapsed,paused.elapsed);
        await click('#restart-btn');await advance(0);
        assert.ok(!JSON.stringify(await diagnostics()).includes('ROWAN'));
      }
      await page.evaluate(()=>window.__test.fixture('encounter'));
      await step(.56);assert.equal((await state()).interaction.phase,'qte');
      for(let i=0;i<3;i++){await press();await advance(.025);}
      assert.equal((await state()).interaction.presses,3);
      if(clean)assert.equal(await page.locator('.die-fragment:visible').count(),0);
      else assert.ok(await page.locator('.die-fragment:visible').count()<= (touch?2:4));
      await screenshot(clean?'03-clean-grip':'06-nightmare');
      for(let i=3;i<8;i++){await press();await advance(.002);}
      assert.equal((await state()).interaction.phase,'stab');
      const health=(await state()).player.health;
      await step(.1);if(clean)await screenshot('04-eye-contact');
      await step(.08);if(clean)await screenshot('05-recoil');
      await step(.7);const s=await state();assert.equal(s.interaction.phase,'recovery');
      assert.equal(s.player.health,health);assert.ok(s.player.cornZoneId);
      assert.equal(s.interaction.recoveryDeadline-s.interaction.phaseStartedAt,10);
      const deadline=s.interaction.recoveryDeadline;
      await step(deadline-s.elapsed+.02);
      assert.equal((await state()).interaction,null);
      assert.ok((await state()).skyRedUntil>(await state()).elapsed);
      if(!clean)await screenshot('07-recovery-expiry');
    }
    if(touch){await pause();await advance(0);await click('#title-btn');
      await page.setViewportSize({width:667,height:375});await screenshot('08-small-title');
      for(const id of ['player-alias','start-btn']){const r=await page.locator('#'+id).boundingBox();assert.ok(r&&r.x>=0&&r.y>=0&&r.x+r.width<=667&&r.y+r.height<=375);}
      await page.locator('#player-alias').fill('');await click('#start-btn');await advance(0);
      assert.equal(await page.locator('#player-alias').inputValue(),'STRANGER');
      await page.setViewportSize({width:390,height:844});assert.equal((await state()).mode,'paused');assert.ok(await page.locator('#rotate').isVisible());
    }
    report.devices.push({kind,diagnostics:await diagnostics()});
    report.checks.push(`${kind}: title and alias privacy, automatic controls, actual action edges, physical corn entry, pause/restart, anatomical hand asset ready, eight-press QTE, contact/recoil, landing, ten-second recovery, independent sky`);
    await page.close();
  }
  assert.deepEqual(report.errors,[]);report.status='passed';
}catch(error){report.status='failed';report.failure=String(error);throw error;}
finally{clearTimeout(deadline);await browser.close();await writeFile(`${output}/report.json`,JSON.stringify(report,null,2));console.log(JSON.stringify({status:report.status,checks:report.checks,errors:report.errors,failure:report.failure}));}
