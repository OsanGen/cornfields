import assert from 'node:assert/strict';
import {mkdir, writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {chromium} from '../scripts/browser-runtime.mjs';

const smallPhone = process.env.CORNFIELD_SMALL_PHONE === '1';
const output = new URL(smallPhone ? '../output/mobile-small-browser/' : '../output/mobile-browser/', import.meta.url);
await mkdir(output, {recursive: true});
const browser = await chromium.launch({headless: true});
const page = await browser.newPage({viewport: smallPhone ? {width: 667, height: 375} : {width: 844, height: 390}, deviceScaleFactor: 2, isMobile: true, hasTouch: true});
page.setDefaultTimeout(15000);
const errors = [], warnings = [], failedRequests = [], checks = [];
const report = {status: 'running', kind: 'Chromium touch emulation, not physical phone acceptance', checks, errors, warnings, failedRequests};
page.on('pageerror', error => errors.push(String(error)));
page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); if (msg.type() === 'warning') warnings.push(msg.text()); });
page.on('requestfailed', req => failedRequests.push({url: req.url(), error: req.failure()}));
page.on('response', response => { if (response.status() >= 400) failedRequests.push(response.url() + ' ' + response.status()); });
const cdp = await page.context().newCDPSession(page);
const state = () => page.evaluate(() => window.__test.state());
const step = (seconds, controls = {}) => page.evaluate(({seconds, controls}) => window.__test.step(seconds, controls), {seconds, controls});
const advance = ms => page.evaluate(ms => window.advanceTime(ms), ms);
const center = async selector => { const r = await page.locator(selector).boundingBox(); assert.ok(r, selector); return {x: r.x + r.width / 2, y: r.y + r.height / 2}; };
const touch = (type, touchPoints = []) => cdp.send('Input.dispatchTouchEvent', {type, touchPoints});
const tap = async selector => { await page.locator(selector).tap(); await advance(1000 / 60); };
const shot = async name => {
  await page.screenshot({path: fileURLToPath(new URL(name + '.png', output))});
  await writeFile(new URL(name + '.json', output), JSON.stringify(await state(), null, 2));
};
async function restart() {
  if ((await state()).mode === 'playing') await tap('#touch-pause');
  await tap((await state()).mode === 'paused' ? '#restart-btn' : '#retry-btn');
}
async function drive(stop) {
  return page.evaluate(stop => {
    for (let i = 0; i < 2400; i++) {
      const s = window.__test.state(), a = window.__test.anchors()[0];
      if (s.mode !== 'playing') return s;
      if (stop === 'hide' && Math.hypot(s.player.x - a.x, s.player.z - a.z) < .6) return s;
      if (s.enemy.distance < 3 && s.enemy.lineOfSight && s.player.ammo > 0 && s.player.shotCooldown <= 0 && s.enemy.state !== 'staggered') {
        const e = s.enemy.presentationPosition, p = s.player.presentationPosition, dx = e.x - p.x, dz = e.z - p.z;
        window.__test.step(1 / 60, {fire: true, yaw: Math.atan2(-dx, -dz), pitch: Math.atan2(-.33, Math.hypot(dx, dz))});
      }
      const path = window.__test.route(), next = path[1] || s.daughter;
      assertRoute(next);
      const dx = next.x - s.player.x, dz = next.z - s.player.z;
      window.__test.step(Math.min(.1, Math.hypot(dx, dz) / 3.8), {forward: 1, yaw: Math.atan2(-dx, -dz), pitch: 0});
    }
    throw new Error('Route did not finish');
    function assertRoute(next) { if (!next) throw new Error('No route'); }
  }, stop);
}
try {
  await page.goto(process.env.CORNFIELD_TEST_URL || 'http://127.0.0.1:4180/cornfields/?test=1&intro=off', {waitUntil: 'networkidle'});
  await page.waitForFunction(() => window.__test && !document.getElementById('start-btn').disabled);
  report.initialVisuals = await page.evaluate(() => window.__test.diagnostics().visuals);
  assert.equal(report.initialVisuals.status, 'ready', JSON.stringify(report.initialVisuals));
  assert.equal((await page.evaluate(() => window.__test.diagnostics())).controlMode, 'touch');
  assert.equal(await page.locator('#error').isVisible(), false);
  await shot('01-menu'); await tap('#start-btn');
  await page.waitForFunction(() => window.__test.diagnostics().audioState === 'running');
  assert.equal((await state()).mode, 'playing');
  assert.equal(await page.evaluate(() => document.pointerLockElement), null);
  const draw = await page.locator('#scene').evaluate(el => ({width: el.width, css: el.clientWidth}));
  assert.equal(draw.width, draw.css);
  checks.push('Coarse pointer selects touch; Start unlocks audio without mouse lock; mobile DPR cap is 1');

  const stick = await center('#move-stick'), fire = await center('#touch-fire');
  const before = (await state()).player;
  await touch('touchStart', [{id: 1, ...stick}]);
  await touch('touchMove', [{id: 1, x: stick.x, y: stick.y - 40}]);
  await advance(200);
  await touch('touchStart', [{id: 1, x: stick.x, y: stick.y - 40}, {id: 2, x: 500, y: 170}]);
  await touch('touchMove', [{id: 1, x: stick.x, y: stick.y - 40}, {id: 2, x: 525, y: 180}]);
  await touch('touchStart', [{id: 1, x: stick.x, y: stick.y - 40}, {id: 2, x: 525, y: 180}, {id: 3, ...fire}]);
  await advance(200);
  const combined = await state();
  assert.ok(before.z - combined.player.z > .5);
  assert.ok(Math.abs(combined.player.yaw - before.yaw) > .09);
  assert.equal(combined.metrics.shotsFired, 1);
  await touch('touchEnd'); await advance(100);
  assert.equal((await state()).player.moving, false);
  await shot('02-controls'); checks.push('Real browser multi-touch moves, looks and fires once; releasing stops movement');

  const lit = (await state()).player.flashlightOn;
  await tap('#touch-light'); assert.equal((await state()).player.flashlightOn, !lit);
  await touch('touchStart', [{id: 1, x: stick.x, y: stick.y - 40}]);
  await touch('touchCancel'); await advance(100);
  assert.equal((await state()).player.moving, false);
  await tap('#touch-pause'); const paused = await state(); await advance(1000);
  assert.equal((await state()).elapsed, paused.elapsed);
  await shot('03-pause'); await tap('#resume-btn');
  assert.equal((await state()).mode, 'playing');
  checks.push('Flashlight, cancellation, pause and explicit resume work');

  await page.setViewportSize({width: 390, height: 844});
  await page.waitForFunction(() => window.__test.state().mode === 'paused');
  await page.locator('#rotate').waitFor({state: 'visible'});
  await page.waitForFunction(() => document.getElementById('rotate').clientWidth === 390 && document.getElementById('rotate').clientHeight === 844);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), 390);
  await shot('04-portrait');
  await page.setViewportSize({width: 844, height: 390});
  await page.waitForFunction(() => document.getElementById('rotate').hidden);
  assert.equal((await state()).mode, 'paused'); await tap('#resume-btn');
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  assert.equal((await state()).mode, 'paused'); await tap('#resume-btn');
  checks.push('Portrait and background pause; landscape return requires Continue');

  await restart(); await step(.9, {forward: 1, yaw: 0, pitch: 0});
  await tap('#touch-interact'); assert.equal((await state()).doorOpen, true);
  if ((await state()).player.flashlightOn) await tap('#touch-light');
  const near = await drive('hide'); assert.equal(near.mode, 'playing');
  await tap('#touch-interact'); assert.equal((await state()).player.hidden, true);
  await step(.5); assert.equal((await state()).player.hidden, true);
  assert.notEqual((await state()).enemy.state, 'corn_rush'); await shot('05-hidden');
  await touch('touchStart', [{id: 1, x: 500, y: 170}]);
  await touch('touchMove', [{id: 1, x: 515, y: 170}]);
  await advance(1000 / 60); await touch('touchEnd');
  assert.equal((await state()).enemy.state, 'corn_rush');
  await step(30); assert.equal((await state()).mode, 'dead');
  await shot('06-death'); await tap('#retry-btn'); assert.equal((await state()).player.ammo, 2);
  checks.push('Context button opens door and hides safely; look reveals hide; death and retry work');

  await step(.9, {forward: 1, yaw: 0, pitch: 0}); await tap('#touch-interact');
  if ((await state()).player.flashlightOn) await tap('#touch-light');
  const ending = await drive('won'); assert.equal(ending.mode, 'won');
  assert.deepEqual(ending.progress.activatedCheckpoints, ['cross', 'barrels']);
  await shot('07-win'); await tap('#retry-btn');
  assert.equal((await state()).metrics.shotsFired, 0);
  checks.push('Deterministic route reaches both checkpoints and victory; touch restart resets the run');
  assert.deepEqual(errors, []); assert.deepEqual(failedRequests, []);
  report.diagnostics = await page.evaluate(() => window.__test.diagnostics());
  report.status = 'passed';
} catch (error) {
  report.status = 'failed'; report.failure = String(error); report.state = await state().catch(() => null);
  await page.screenshot({path: fileURLToPath(new URL('failure.png', output))}).catch(() => {});
  throw error;
} finally {
  await writeFile(new URL('report.json', output), JSON.stringify(report, null, 2));
  await browser.close(); console.log(JSON.stringify(report));
}
