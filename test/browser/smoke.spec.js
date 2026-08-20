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
