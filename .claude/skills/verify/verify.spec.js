// UI verification pass for the `verify` skill. run.sh copies this into
// test/browser/ as zz-verify.spec.js, runs it, and deletes it again — it is
// NOT part of the committed smoke suite and never runs in CI.
//
// It produces the proof the skill asks for:
//   1. screenshots of every tab and of the capture sheet, both projects;
//   2. a performance trace (Chrome tracing — opens in DevTools → Performance
//      → Load profile) and a score out of 100 against fixed budgets.
'use strict';
const fs = require('fs');
const { test, expect } = require('@playwright/test');
const { openApp, USER } = require('./helpers/app');
const { GVIZ_BODY } = require('./fixtures/gviz-fixture');

const OUT = process.env.VERIFY_OUT;
const CHART_JS = process.env.CHART_JS; // real Chart.js; the smoke suite stubs it

// Budgets the score is counted against. Loose on purpose: this is a headless
// desktop CPU with a mocked sheet, so a miss here is a real regression, not a
// slow phone.
const BUDGETS = {
  fcpMs: 1000,        // first contentful paint
  bootMs: 1500,       // loader hidden
  longestTaskMs: 200, // worst main-thread task during load
  loadCls: 0.1,       // layout shift during load only (before any tab switch)
  switchMs: 150,      // worst tab switch, two frames after switchView()
};

test('screenshots: every tab + capture sheet', async ({ page }) => {
  test.skip(!OUT, 'VERIFY_OUT not set');
  const name = test.info().project.name;
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await openApp(page);
  for (const v of ['today', 'logs', 'trends']) {
    await page.evaluate((v) => switchView(v), v);
    await page.waitForTimeout(700);
    await page.screenshot({ path: `${OUT}/${name}-${v}.png`, fullPage: true });
  }
  await page.evaluate(() => switchView('today'));
  await page.click('#global-action-fab');
  await page.waitForTimeout(500);
  await expect(page.locator('#capture-overlay')).toHaveClass(/open/);
  await page.screenshot({ path: `${OUT}/${name}-capture.png` });
  expect(errors, 'uncaught page errors').toEqual([]);
});

test('perf trace + score', async ({ page, browser }) => {
  test.skip(!OUT || !CHART_JS, 'VERIFY_OUT and CHART_JS required');
  const name = test.info().project.name;
  const chart = fs.readFileSync(CHART_JS, 'utf8');
  const use = test.info().project.use;
  await page.emulateMedia({ reducedMotion: use.reducedMotion, colorScheme: use.colorScheme });
  await page.addInitScript(() => {
    const target = new Date('2026-08-19T09:00:00+08:00').getTime();
    const off = target - Date.now(); const R = Date;
    const D = function (...a) { if (!(this instanceof D)) return new R(R.now() + off).toString(); return a.length ? new R(...a) : new R(R.now() + off); };
    D.prototype = R.prototype; D.now = () => R.now() + off; D.parse = R.parse; D.UTC = R.UTC; globalThis.Date = D;
    window.__lt = []; window.__cls = 0;
    new PerformanceObserver((l) => l.getEntries().forEach((e) => __lt.push(Math.round(e.duration)))).observe({ type: 'longtask', buffered: true });
    new PerformanceObserver((l) => l.getEntries().forEach((e) => { if (!e.hadRecentInput) __cls += e.value; })).observe({ type: 'layout-shift', buffered: true });
  });
  await page.route('**/*', (route) => {
    const u = route.request().url();
    if (u.includes('cdnjs.cloudflare.com')) return route.fulfill({ contentType: 'application/javascript', body: chart });
    if (u.includes('fonts.googleapis.com') || u.includes('fonts.gstatic.com')) return route.fulfill({ contentType: 'text/css', body: '' });
    if (u.includes('gviz/tq') && u.includes('sheet=Sheet1')) return route.fulfill({ contentType: 'text/plain', body: GVIZ_BODY });
    if (u.includes('gviz/tq')) return route.fulfill({ status: 404, body: '' });
    if (u.includes('script.google.com')) return route.fulfill({ contentType: 'application/json', body: '{"success":true}' });
    return route.continue();
  });

  await browser.startTracing(page, {
    path: `${OUT}/${name}-trace.json`, screenshots: true,
    categories: ['devtools.timeline', 'disabled-by-default-devtools.timeline', 'disabled-by-default-devtools.timeline.frame',
      'v8.execute', 'blink.user_timing', 'loading', 'disabled-by-default-devtools.screenshot'],
  });
  const t0 = Date.now();
  await page.goto(`/index.html?user=${USER}`);
  await page.waitForFunction(() => document.getElementById('main-loader').style.display === 'none', { timeout: 10000 });
  const bootMs = Date.now() - t0;
  await page.waitForTimeout(800); // let entrances finish before reading load CLS
  const load = await page.evaluate(() => {
    const p = performance.getEntriesByType('paint').find((x) => x.name === 'first-contentful-paint');
    return { fcpMs: Math.round(p ? p.startTime : -1), longestTaskMs: Math.max(0, ...__lt), loadCls: +__cls.toFixed(4) };
  });
  const switches = {};
  for (const v of ['logs', 'trends', 'today']) {
    switches[v] = await page.evaluate(async (v) => {
      const s = performance.now(); switchView(v);
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      return Math.round(performance.now() - s);
    }, v);
    await page.waitForTimeout(600);
  }
  await browser.stopTracing();

  const m = { bootMs, ...load, switchMs: Math.max(...Object.values(switches)) };
  const checks = Object.entries(BUDGETS).map(([k, budget]) => ({ metric: k, value: m[k], budget, pass: m[k] >= 0 && m[k] <= budget }));
  const score = Math.round((100 * checks.filter((c) => c.pass).length) / checks.length);
  const report = { project: name, score, checks, switches };
  fs.writeFileSync(`${OUT}/${name}-perf.json`, JSON.stringify(report, null, 2));
  console.log(`PERF_SCORE ${name} ${score}/100 ` + checks.map((c) => `${c.pass ? 'ok' : 'MISS'}:${c.metric}=${c.value}(<=${c.budget})`).join(' '));
  expect(score, 'performance score').toBe(100);
});
