// The reusable half of browser verification: pin the clock, mock the network,
// wait for boot. Every spec calls openApp() instead of rebuilding this — this
// file is the thing that used to get rewritten from scratch each session.
'use strict';

const fs = require('fs');
const path = require('path');
const { test } = require('@playwright/test');
const { GVIZ_BODY, USER } = require('../fixtures/gviz-fixture');

// Named sheets a spec can ask for. `default` is the one the original checks are
// written against — its deliberate July gap and its Aug 2026 export label are
// load-bearing there, so a spec that needs different data adds a fixture here
// instead of editing that one.
const FIXTURES = {
  default: GVIZ_BODY,
  skewed: require('../fixtures/gviz-fixture-skewed').GVIZ_BODY,
};

// The fixtures are written as GViz bodies (their history); since 2026-10-31
// the app reads through Apps Script's `read` action instead, which answers
// with plain arrays and ISO dates. Converted once, here, so the fixtures stay
// untouched and every spec keeps its data.
function gvizToReadRows(body) {
  const json = JSON.parse(body.substring(body.indexOf('{'), body.lastIndexOf('}') + 1));
  return json.table.rows.map((r) => r.c.map((cell) => {
    const v = cell && cell.v;
    const m = typeof v === 'string' && v.match(/^Date\((\d+),(\d+),(\d+)\)$/);
    if (!m) return v;
    return `${m[1]}-${String(+m[2] + 1).padStart(2, '0')}-${String(m[3]).padStart(2, '0')}`;
  }));
}
const READ_ROWS = Object.fromEntries(Object.entries(FIXTURES).map(([k, v]) => [k, gvizToReadRows(v)]));

// The test link's token. Any non-empty value — the mock does not check it.
const TOKEN = 'test-token';

// Answers an Apps Script POST: `read` gets the fixture's ledger rows (and no
// recurring series); anything else is a successful write.
function fulfillScript(route, fixture = 'default') {
  let body = {};
  try { body = JSON.parse(route.request().postData() || '{}'); } catch (e) { /* not JSON */ }
  if (body.action === 'read') {
    const rows = body.sheet === 'ledger' ? READ_ROWS[fixture] : [];
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ rows }) });
  }
  return route.fulfill({ contentType: 'application/json', body: '{"success":true}' });
}

const CHART_STUB = fs.readFileSync(path.join(__dirname, '../fixtures/chart-stub.js'), 'utf8');

/**
 * @param {import('@playwright/test').Page} page
 * @param {{ view?: 'today'|'logs'|'trends'|null, date?: string, fixture?: keyof FIXTURES }} [opts]
 */
async function openApp(page, opts = {}) {
  const { view = null, date = '2026-08-19T09:00:00+08:00', fixture = 'default' } = opts;
  const sheetBody = FIXTURES[fixture];
  if (!sheetBody) throw new Error(`unknown fixture "${fixture}" — add it to FIXTURES`);

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
    if (url.includes('script.google.com')) return fulfillScript(route, fixture);
    return route.continue(); // everything else — index.html, lib/*, icons — is real, served by webServer
  });

  await page.goto(`/index.html?user=${USER}&t=${TOKEN}`);
  await page.waitForFunction(
    () => document.getElementById('main-loader').style.display === 'none',
    { timeout: 8000 }
  );
  // The recurring read is the second Apps Script call, made at idle. Wait for
  // it, so a spec that re-routes script.google.com afterwards only sees the
  // POSTs it causes itself.
  await page.waitForFunction(() => _recurringLoaded === true, { timeout: 8000 });
  if (view) await page.evaluate((v) => switchView(v), view);
  await page.waitForTimeout(150); // entrance animations / mount-then-spring settle
}

module.exports = { openApp, USER, TOKEN, fulfillScript };
