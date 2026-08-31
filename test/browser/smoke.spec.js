// The committed browser-level regression floor. Reuses openApp() (helpers/app.js)
// for all the plumbing — mocking the sheet, stubbing Chart.js, pinning the
// clock — so a new check here is just the assertion, not a rebuilt harness.
//
// This is NOT a replacement for the throwaway render loop (alfred-verification
// skill): that one is written per-change, with assertions specific to what
// changed, and is expected to be more thorough for anything non-trivial. This
// file is the floor underneath it — "does the app still boot, still switch
// tabs, still let you open the things you should be able to open" — the same
// relationship test/alfred-core.test.js has to per-change logic checks
// (CLAUDE.md §3.12).
'use strict';

const { test, expect } = require('@playwright/test');
const { openApp } = require('./helpers/app');

test.describe('boot', () => {
  for (const view of ['today', 'logs', 'trends']) {
    test(`${view} renders with no console errors`, async ({ page }) => {
      const errors = [];
      page.on('pageerror', (e) => errors.push(e.message));
      await openApp(page, { view });
      await expect(page.locator(`#${view}-view`)).toBeVisible();
      expect(errors).toEqual([]);
    });
  }
});

test.describe('layout', () => {
  for (const view of ['today', 'logs', 'trends']) {
    // The mobile zoom trap (CLAUDE.md §3.2): a horizontal transform escaping
    // .container's overflow-x: clip widens the document and mobile browsers
    // zoom to fit. scrollWidth > innerWidth is the tell.
    test(`${view}: no horizontal overflow`, async ({ page }) => {
      await openApp(page, { view });
      const { sw, iw } = await page.evaluate(() => ({
        sw: document.documentElement.scrollWidth,
        iw: window.innerWidth,
      }));
      expect(sw).toBeLessThanOrEqual(iw);
    });
  }
});

test.describe('masthead corner', () => {
  // Regression test for the 2026-08-19 bug (CLAUDE.md §3.4, §8): a scroll-
  // driven animation's keyframes do not apply at all on a document too short
  // to scroll, so the pill's pointer-events has to fail CLOSED at rest, not
  // rely on the keyframes to turn it off. This is exactly the class of bug
  // Playwright's own "element intercepts pointer events" refusal caught —
  // keep this test so the same trap can't reopen silently on some other
  // control that ends up sharing the corner.
  test('Logs: masthead-actions buttons receive their own clicks on a short page', async ({ page }) => {
    await openApp(page, { view: 'logs' });
    const scrollable = await page.evaluate(() => document.documentElement.scrollHeight > window.innerHeight);
    expect(scrollable).toBe(false); // precondition — the fixture is short at rest by design

    for (const label of ['Recurring entries', 'Export transactions']) {
      const btn = page.locator(`#masthead-actions button[aria-label="${label}"]`);
      await expect(btn).toBeVisible();
      const hit = await btn.evaluate((el) => {
        const r = el.getBoundingClientRect();
        const at = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
        return at?.closest('button')?.getAttribute('aria-label') ?? null;
      });
      expect(hit).toBe(label);
    }
  });

  test('lifted pill takes back pointer events once the page scrolls', async ({ page }) => {
    await openApp(page, { view: 'logs' });
    await page.evaluate(() => loadOlderMonths());
    await page.waitForTimeout(300);
    await page.mouse.wheel(0, 400);
    await page.waitForTimeout(500);
    await expect(page.locator('#month-pill')).toHaveCSS('pointer-events', 'auto');
  });
});

test.describe('core interactions', () => {
  test('FAB opens the capture sheet', async ({ page }) => {
    await openApp(page, { view: 'today' });
    await page.click('#global-action-fab');
    await expect(page.locator('#capture-overlay')).toHaveClass(/open/);
  });

  test('Logs: recurring icon opens the recurring modal', async ({ page }) => {
    await openApp(page, { view: 'logs' });
    await page.click('#masthead-actions button[aria-label="Recurring entries"]');
    await expect(page.locator('#recurring-overlay')).toHaveClass(/open/);
  });

  test('Logs: export icon opens the export modal, naming the current month', async ({ page }) => {
    await openApp(page, { view: 'logs' });
    await page.click('#masthead-actions button[aria-label="Export transactions"]');
    await expect(page.locator('#export-overlay')).toHaveClass(/open/);
    await expect(page.locator('#export-month-label')).toHaveText('Aug 2026');
  });

  test('month picker opens from the masthead on Logs', async ({ page }) => {
    await openApp(page, { view: 'logs' });
    await page.click('#masthead-month');
    await expect(page.locator('#month-overlay')).toHaveClass(/open/);
  });

  test('Today masthead is inert — no picker', async ({ page }) => {
    await openApp(page, { view: 'today' });
    await page.click('#masthead-month');
    await expect(page.locator('#month-overlay')).not.toHaveClass(/open/);
  });
});

// ── Median daily · calibrated forecast · distribution curve ─────────────────
// SPEC_MEDIAN_FORECAST_20260831. The `skewed` fixture is built for these; see
// its header for why the default sheet cannot exercise them.
//
// ⚠️ Figures are read from data-val, never from the rendered text.
// animateCounters() counts up over 1200ms, so a text read lands mid-animation
// (CLAUDE.md §3.12) — and only one of the two projects has reduced motion.

test.describe('median daily', () => {
  test('the detail figures are open on load, with no disclosure to tap', async ({ page }) => {
    await openApp(page, { view: 'today', fixture: 'skewed' });
    await expect(page.locator('#today-detail .detail-panel')).toBeVisible();
    await expect(page.locator('#today-detail-trigger')).toHaveCount(0);
    await expect(page.locator('.tile-chev')).toHaveCount(0);
    // The Expenses tile is a plain block again, not a button.
    await expect(page.locator('#today-tiles button')).toHaveCount(0);
  });

  test('the glance line is gone', async ({ page }) => {
    await openApp(page, { view: 'today', fixture: 'skewed' });
    await expect(page.locator('#today-glance')).toHaveCount(0);
    await expect(page.locator('#today-view')).not.toContainText('across');
  });

  test('the tile reports a median once the month has enough spending days', async ({ page }) => {
    await openApp(page, { view: 'today', fixture: 'skewed' });

    const panel = page.locator('#today-detail');
    await expect(panel.locator('.detail-item').first().locator('.tile-label')).toHaveText('Median Daily');
    // Median of the ten normal days (the two big days are above P90 and are
    // carried by the buffer instead) — 18 and 20 straddle the middle.
    expect(await panel.locator('[data-key="today-avg"]').getAttribute('data-val')).toBe('19');

    // The correction is downward: the old mean projection was 890/19 * 31.
    const forecast = Number(await panel.locator('[data-key="today-fc"]').getAttribute('data-val'));
    expect(forecast).toBeLessThan((890 / 19) * 31);
    expect(forecast).toBeGreaterThan(890); // still projects forward, not just spent-so-far
  });

  test('days 1-7 fall back to the mean', async ({ page }) => {
    await openApp(page, { view: 'today', fixture: 'skewed', date: '2026-08-05T09:00:00+08:00' });
    await expect(page.locator('#today-detail .detail-item').first().locator('.tile-label'))
      .toHaveText('Average Daily');
  });

  test('the pace strip follows the calibrated forecast, not the mean', async ({ page }) => {
    // The skewed fixture's RM 1200 income sits between the two forecasts: the
    // old mean projection (~1452) overshoots it, the calibrated one (~1111)
    // does not. Trap #5 — the strip firing LESS often is the correction.
    await openApp(page, { view: 'today', fixture: 'skewed' });
    const strip = page.locator('.income-bar-status');
    await expect(strip).toHaveClass(/under/);
    await expect(strip).toContainText('on track');
  });
});

test.describe('spend distribution', () => {
  test('the curve renders below the patterns grid, marking median and mean', async ({ page }) => {
    await openApp(page, { view: 'trends', fixture: 'skewed' });
    const card = page.locator('#spend-distribution');
    await expect(card.locator('.dist-svg')).toBeVisible();
    await expect(card.locator('.dist-line')).toHaveAttribute('d', /^M.+C/);
    await expect(card.locator('.dist-ref')).toHaveCount(2);

    const labels = card.locator('.dist-ref-lbl');
    await expect(labels).toHaveCount(2);
    await expect(labels.first()).toContainText('Median');
    await expect(labels.first()).toContainText('RM 19.00');
    await expect(labels.nth(1)).toContainText('Mean');
    await expect(labels.nth(1)).toContainText('RM 74.17');   // 890 / 12 spending days

    // The lines carry their real names, and the sentence below teaches them.
    // "P90" stays banned: a percentile is the one term the copy cannot explain
    // in passing, and it is the term this pair replaced.
    await expect(card).not.toContainText('P90');
    await expect(card).not.toContainText('percentile');

    // The note EXPLAINS the lines; it does not re-quote them. The labels
    // already carry the figures, and repeating them made it a caption.
    const note = card.locator('.dist-note');
    await expect(note).toContainText('median line');
    await expect(note).toContainText('mean line');
    expect(await note.textContent()).not.toMatch(/RM|\d/);

    // On this fixture the two lines land 14.2% apart, inside the 18% collision
    // rule, so the stacking path is exercised here rather than left untested.
    await expect(labels.first()).toHaveClass(/row1/);
    await expect(labels.nth(1)).toHaveClass(/row2/);

    // It sits between the patterns grid and the cumulative card.
    const order = await page.evaluate(() => Array.from(
      document.querySelectorAll('#trends-view > div')).map((n) => n.id));
    expect(order.indexOf('spend-distribution')).toBe(order.indexOf('spending-patterns') + 1);
    expect(order.indexOf('spend-distribution')).toBeLessThan(order.indexOf('cumulative-card'));
  });

  test('fewer than three spending days shows copy, not a partial curve', async ({ page }) => {
    // Default fixture on the 5th: only one August spending day has elapsed.
    await openApp(page, { view: 'trends', date: '2026-08-05T09:00:00+08:00' });
    const card = page.locator('#spend-distribution');
    await expect(card.locator('.dist-empty')).toBeVisible();
    await expect(card.locator('.dist-svg')).toHaveCount(0);
    await expect(card.locator('.dist-ref-lbl')).toHaveCount(0);
  });

  test('the curve does not widen the document', async ({ page }) => {
    // The reference labels are absolutely positioned off real data — a label
    // pushed past the card edge is exactly the mobile-zoom trap (CLAUDE.md §3.2).
    await openApp(page, { view: 'trends', fixture: 'skewed' });
    const overflow = await page.evaluate(() => ({
      doc: document.documentElement.scrollWidth, win: window.innerWidth,
    }));
    expect(overflow.doc).toBeLessThanOrEqual(overflow.win);
  });
});

test.describe('insight strip', () => {
  test('interprets every chart below it', async ({ page }) => {
    // One observation per chart, in chart order. The skewed fixture has
    // something true to say about all four, so all four must appear.
    await openApp(page, { view: 'trends', fixture: 'skewed' });
    const body = page.locator('#trends-insight .insight-body');
    await expect(body).toBeVisible();

    // ⚠️ The strip types itself in (typewriteInto), so wait for the text to
    // settle rather than reading it on the first tick.
    await expect
      .poll(async () => (await body.textContent()).trim().length, { timeout: 6000 })
      .toBeGreaterThan(80);

    const families = await page.evaluate(() => computeInsightNarrative().families);
    expect(families).toContain('category');      // the donut
    expect(families).toContain('timing');        // the calendar grid
    expect(families).toContain('distribution');  // the spend curve
    expect(families).toContain('pace');          // cumulative spend
    expect(families.length).toBeLessThanOrEqual(4);
    expect(new Set(families).size).toBe(families.length); // no chart twice
  });

  test('says nothing statistical about the curve', async ({ page }) => {
    await openApp(page, { view: 'trends', fixture: 'skewed' });
    const text = await page.evaluate(() =>
      computeInsightNarrative().facts.join(' '));
    expect(text).toContain('typical spending day');
    expect(text).not.toContain('P90');
    expect(text).not.toContain('median');
  });
});
