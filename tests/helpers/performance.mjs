import {readFile} from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';

async function measure(page) {
  return page.evaluate(async () => {
    async function frames(count) {
      const times = [];
      let previous = performance.now();
      for (let i = 0; i < count; i++) {
        await new Promise(resolve => requestAnimationFrame(now => {
          times.push(now - previous);
          previous = now;
          resolve();
        }));
      }
      return times;
    }
    await frames(45);
    const times = (await frames(180)).sort((a, b) => a - b);
    const diagnostics = window.__test.diagnostics();
    return {
      medianMs: times[90], p95Ms: times[171],
      drawCalls: diagnostics.drawCalls, triangles: diagnostics.triangles,
    };
  });
}

/** Compare the actual saved source against this refactor, using identical assets. */
export async function comparePerformance(browser, baselineRoot) {
  const report = {viewport: {width: 1280, height: 720}, samples: {}, comparisons: {}};
  for (const version of ['baseline', 'current']) {
    const page = await browser.newPage({viewport: report.viewport, deviceScaleFactor: 1});
    try {
      if (version === 'baseline') {
        await page.route('**/src/**', async route => {
          const pathname = new URL(route.request().url()).pathname;
          assert.match(pathname, /^\/src\/[\w-]+\.(js|css)$/);
          const body = await readFile(path.join(baselineRoot, pathname.slice(1)));
          await route.fulfill({
            status: 200, body,
            contentType: pathname.endsWith('.css') ? 'text/css' : 'text/javascript',
          });
        });
      }
      await page.goto('http://127.0.0.1:4173/?test=1', {waitUntil: 'networkidle'});
      await page.bringToFront();
      await page.waitForFunction(() => window.__test && !document.getElementById('start-btn').disabled);
      report.samples[version] = {menu: await measure(page)};
      await page.click('#start-btn');
      await page.waitForFunction(() => document.pointerLockElement !== null);
      await page.evaluate(() => {
        window.advanceTime(0);
        window.__test.step(0.9, {forward: 1, yaw: 0, pitch: 0});
        window.__test.step(1 / 60, {interact: true});
        window.__test.step(1.8, {forward: 1, yaw: 0, pitch: 0});
      });
      report.samples[version].corridor = await measure(page);
      await page.evaluate(() => window.__test.step(1 / 60, {yaw: 0.88, pitch: -0.12}));
      report.samples[version].closeup = await measure(page);
    } finally {
      await page.close();
    }
  }
  for (const view of ['menu', 'corridor', 'closeup']) {
    const before = report.samples.baseline[view].p95Ms;
    const after = report.samples.current[view].p95Ms;
    report.comparisons[view] = {
      beforeMs: before, afterMs: after, ratio: after / before,
      withinBudget: after <= before * 1.1,
    };
  }
  return report;
}
