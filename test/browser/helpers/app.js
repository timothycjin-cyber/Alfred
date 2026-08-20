// The reusable half of browser verification: pin the clock, mock the network,
// wait for boot. Every spec calls openApp() instead of rebuilding this — this
// file is the thing that used to get rewritten from scratch each session.
'use strict';

const fs = require('fs');
const path = require('path');
const { test } = require('@playwright/test');
const { GVIZ_BODY, USER } = require('../fixtures/gviz-fixture');

const CHART_STUB = fs.readFileSync(path.join(__dirname, '../fixtures/chart-stub.js'), 'utf8');

/**
 * @param {import('@playwright/test').Page} page
 * @param {{ view?: 'today'|'logs'|'trends'|null, date?: string }} [opts]
 */
async function openApp(page, opts = {}) {
  const { view = null, date = '2026-08-19T09:00:00+08:00' } = opts;

  // Pin the DATE with a live offset, not a frozen Date.now() — Chart.js's
  // animator reads Date.now() too, and a constant stub leaves every arc at
  // circumference 0 (alfred-verification skill lesson).
  await page.addInitScript((iso) => {
    const target = new Date(iso).getTime();
    const offset = target - Date.now();
    const RealDate = Date;
    const D = function (...a) {
      if (!(this instanceof D)) return new RealDate(RealDate.now() + offset).toString();
      return a.length ? new RealDate(...a) : new RealDate(RealDate.now() + offset);
    };
    D.prototype = RealDate.prototype;
    D.now = () => RealDate.now() + offset;
    D.parse = RealDate.parse;
    D.UTC = RealDate.UTC;
    globalThis.Date = D;
  }, date);

  // ⚠️ The project's `use.reducedMotion` context option does not reliably
  // reach matchMedia() on this Chromium build — found while building this
  // harness, not something the app does wrong. page.emulateMedia() does, and
  // has to run BEFORE goto(): the app reads matchMedia('(prefers-reduced-
  // motion: reduce)') once into a REDUCED_MOTION const at script-parse time
  // (CLAUDE.md §3.2), so a call made after navigation is too late for that
  // flag even though the CSS media query itself would still update live.
  const projectUse = test.info().project.use;
  await page.emulateMedia({ reducedMotion: projectUse.reducedMotion, colorScheme: projectUse.colorScheme });

  await page.route('**/*', (route) => {
    const url = route.request().url();
    if (url.includes('cdnjs.cloudflare.com')) {
      return route.fulfill({ contentType: 'application/javascript', body: CHART_STUB });
    }
    if (url.includes('fonts.googleapis.com') || url.includes('fonts.gstatic.com')) {
      return route.fulfill({ contentType: 'text/css', body: '' });
    }
    if (url.includes('gviz/tq') && url.includes('sheet=Sheet1')) {
      return route.fulfill({ contentType: 'text/plain', body: GVIZ_BODY });
    }
    if (url.includes('gviz/tq') && url.includes('sheet=Recurring')) {
      return route.fulfill({ status: 404, body: 'not found' }); // "no series", not an error
    }
    if (url.includes('script.google.com')) {
      return route.fulfill({ contentType: 'application/json', body: '{"success":true}' });
    }
    return route.continue(); // everything else — index.html, lib/*, icons — is real, served by webServer
  });

  await page.goto(`/index.html?user=${USER}`);
  await page.waitForFunction(
    () => document.getElementById('main-loader').style.display === 'none',
    { timeout: 8000 }
  );
  if (view) await page.evaluate((v) => switchView(v), view);
  await page.waitForTimeout(150); // entrance animations / mount-then-spring settle
}

module.exports = { openApp, USER };
