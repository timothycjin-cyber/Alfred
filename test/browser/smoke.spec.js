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

test.describe('loader mark', () => {
  test('is drawn in filled paths, never stroked lines', async ({ page }) => {
    // The whole point of the marker style is that a mark's width varies along
    // its length, which a stroked line cannot do. A `stroke` attribute
    // creeping back in is the regression this guards — it would look like a
    // uniform monoline again and nothing else in the suite would notice.
    await openApp(page);
    const mark = page.locator('#main-loader .loader-mark');
    await expect(mark).toHaveCount(1);
    const shape = await page.evaluate(() => {
      const svg = document.querySelector('#main-loader .loader-mark');
      return {
        paths: svg.querySelectorAll('path').length,
        // ⚠️ Count the ROOT as well as its descendants. querySelectorAll only
        // searches descendants, so a stroke set on the <svg> itself — which
        // every child would inherit, the worst version of this regression —
        // walked straight past the first draft of this check.
        stroked: svg.querySelectorAll('[stroke], [stroke-width]').length
          + (svg.hasAttribute('stroke') || svg.hasAttribute('stroke-width') ? 1 : 0),
        bars: svg.querySelectorAll('.lb').length,
        accent: [...svg.querySelectorAll('path')]
          .filter((p) => p.getAttribute('fill') === 'var(--sienna)').length,
      };
    });
    expect(shape.stroked).toBe(0);
    expect(shape.paths).toBeGreaterThan(5);
    expect(shape.bars).toBe(4);
    expect(shape.accent).toBe(1); // sienna marks exactly one bar, never two
  });

  test('the bounce is seamless — first and last keyframe hold the same value', async ({ page }) => {
    // ⚠️ The regression this guards is invisible to every other check: the
    // previous keyframes grew to scaleY(1), sat there, then JUMPED back to
    // 0.08 at the wrap. The DOM is identical either way; it just stutters
    // once per loop. Read the rule out of the stylesheet and compare the two
    // ends of the cycle.
    await openApp(page);
    const kf = await page.evaluate(() => {
      for (const sheet of document.styleSheets) {
        // ⚠️ Reading .cssRules on a cross-origin sheet throws SecurityError,
        // and one bad sheet kills the whole evaluate. The app links Google
        // Fonts, so this is not hypothetical — it is what made the first
        // draft of this check fail against correct CSS.
        let rules;
        try { rules = sheet.cssRules; } catch { continue; }
        for (const rule of rules) {
          if (rule.type === CSSRule.KEYFRAMES_RULE && rule.name === 'loaderBounce') {
            const at = (k) => [...rule.cssRules].find((r) => r.keyText.split(',')
              .map((s) => s.trim()).includes(k));
            return {
              start: at('0%')?.style.transform,
              mid: at('50%')?.style.transform,
              end: at('100%')?.style.transform,
            };
          }
        }
      }
      return null;
    });
    expect(kf).not.toBeNull();
    expect(kf.start).toBeTruthy();
    expect(kf.start).toBe(kf.end);
    // ⚠️ The bars LIFT, they never squash. scaleY thins the mark's own drawn
    // outline and, because every bar scales by the same factor while their
    // heights differ, flattens the ascending silhouette into four equal stubs
    // halfway through the cycle. Both are invisible to a DOM assertion and
    // both are what "the bounce looks wrong" meant.
    for (const t of [kf.start, kf.mid]) expect(t).not.toMatch(/scale/i);
    expect(kf.mid).toMatch(/translate/i);
  });

  test('reduced motion parks the bars instead of hiding them', async ({ page }) => {
    // Clearing .lb's animation is what drops its translate, so the bars must
    // sit back down on the baseline — a reduced-motion loader with its bars
    // stranded in mid-air would read as broken, not as calm.
    await openApp(page);
    const reduced = await page.evaluate(() =>
      matchMedia('(prefers-reduced-motion: reduce)').matches);
    test.skip(!reduced, 'only meaningful in the reduced-motion project');
    const anim = await page.evaluate(() =>
      getComputedStyle(document.querySelector('#main-loader .lb')).animationName);
    expect(anim).toBe('none');
  });
});

test.describe('capture parse busy state', () => {
  // Hold the parse POST open so the busy state can be looked at. Registered
  // AFTER openApp(), so it wins over the harness's catch-all route.
  async function stallParse(page) {
    await page.route('**/script.google.com/**', () => { /* never fulfilled */ });
  }

  test('the receipt prints while the model reads the entry', async ({ page }) => {
    await openApp(page);
    await stallParse(page);
    await page.evaluate(() => openCaptureModal());
    await page.fill('#capture-input', 'Coffee RM8');
    await page.click('#capture-send-btn');

    const panel = page.locator('#capture-parse');
    await expect(panel).toBeVisible();
    await expect(page.locator('#capture-card')).toHaveClass(/busy/);

    const shape = await page.evaluate(() => {
      const svg = document.querySelector('#capture-parse .capture-receipt');
      return {
        // Same rule as the loader mark: filled tapered paths, no strokes, and
        // the ROOT counts (querySelectorAll searches descendants only).
        stroked: svg.querySelectorAll('[stroke], [stroke-width]').length
          + (svg.hasAttribute('stroke') || svg.hasAttribute('stroke-width') ? 1 : 0),
        rules: svg.querySelectorAll('.cr-rule').length,
        accent: [...svg.querySelectorAll('path')]
          .filter((p) => p.getAttribute('fill') === 'var(--sienna)').length,
      };
    });
    expect(shape.stroked).toBe(0);
    expect(shape.rules).toBe(3);
    expect(shape.accent).toBe(1);
  });

  test('exactly one busy indicator, whichever one the motion setting calls for', async ({ page }) => {
    // The receipt REPLACES the send-arrow spinner — two of them a centimetre
    // apart is noise. Under reduced motion the receipt goes still, so the
    // spinner comes back instead. Never both, never neither.
    await openApp(page);
    await stallParse(page);
    await page.evaluate(() => openCaptureModal());
    await page.fill('#capture-input', 'Coffee RM8');
    await page.click('#capture-send-btn');
    await expect(page.locator('#capture-parse')).toBeVisible();

    const state = await page.evaluate(() => ({
      reduced: matchMedia('(prefers-reduced-motion: reduce)').matches,
      spinner: getComputedStyle(document.querySelector('.capture-send'), '::after').content !== 'none',
      printing: getComputedStyle(document.querySelector('.capture-receipt .cr-rule')).animationName !== 'none',
    }));
    expect(state.spinner).toBe(state.reduced);
    expect(state.printing).toBe(!state.reduced);
  });

  test('the receipt is cleared when the parse finishes', async ({ page }) => {
    // parseCapture()'s finally block is the only thing standing between a
    // failed parse and a receipt that prints forever behind an error message.
    await openApp(page);
    await page.route('**/script.google.com/**', (route) =>
      route.fulfill({ contentType: 'application/json', body: '{"error":"nope"}' }));
    await page.evaluate(() => openCaptureModal());
    await page.fill('#capture-input', 'Coffee RM8');
    await page.click('#capture-send-btn');
    await expect(page.locator('#capture-note')).toContainText('Could not read that');
    await expect(page.locator('#capture-parse')).toBeHidden();
    await expect(page.locator('#capture-card')).not.toHaveClass(/busy/);
  });
});

test.describe('masthead brand mark', () => {
  test('rides in the right slot on Today only', async ({ page }) => {
    await openApp(page, { view: 'today' });
    await expect(page.locator('#masthead-brand')).toBeVisible();
    await expect(page.locator('#masthead-actions')).toBeHidden();

    for (const view of ['logs', 'trends']) {
      await page.evaluate((v) => switchView(v), view);
      await expect(page.locator('#masthead-brand')).toBeHidden();
    }
    // ...and the Logs actions still get the slot to themselves.
    await page.evaluate(() => switchView('logs'));
    await expect(page.locator('#masthead-actions')).toBeVisible();
  });

  test('does not change the masthead height or --pill-travel on any tab', async ({ page }) => {
    // CLAUDE.md §3.4: anything added to the right slot must leave the
    // masthead's height and the pill's measured travel alone. The mark is
    // 38px against .month-btn's 44px floor and align-self: center, so the
    // month-button is still what sets the height — this is what proves it.
    await openApp(page, { view: 'today' });
    const seen = [];
    for (const view of ['today', 'logs', 'trends']) {
      await page.evaluate((v) => switchView(v), view);
      await page.waitForTimeout(120);
      seen.push(await page.evaluate(() =>
        document.getElementById('masthead').getBoundingClientRect().height));
    }
    expect(new Set(seen).size).toBe(1); // identical on all three tabs
  });

  test('states nothing and takes no tab stop', async ({ page }) => {
    // It is decoration: not a button, hidden from the accessibility tree, and
    // never a focus target. A brand mark that announces itself is noise.
    await openApp(page, { view: 'today' });
    const info = await page.evaluate(() => {
      const el = document.getElementById('masthead-brand');
      const svg = el.querySelector('.masthead-pig');
      return {
        buttons: el.querySelectorAll('button, a, [tabindex]').length,
        ariaHidden: svg.getAttribute('aria-hidden'),
        // Same style rule as every other mark from this nib.
        stroked: svg.querySelectorAll('[stroke], [stroke-width]').length
          + (svg.hasAttribute('stroke') || svg.hasAttribute('stroke-width') ? 1 : 0),
        // The coin is the accent, and it is GOLD rather than sienna — a gold
        // coin is what makes the drawing read as money at a glance.
        accent: [...svg.querySelectorAll('path')]
          .filter((p) => p.getAttribute('fill') === 'var(--coin)').length,
        // ⚠️ The coin's own ink must NOT be the page's ink. --loader-ink
        // inverts to warm-white on dark; on a light gold coin that is ~1.8:1
        // and the `$` disappears. This spec runs in a light project AND a
        // dark one, so asserting the resolved value here catches a dark
        // override being added later — the light theme would still look
        // perfect and only the dark run would fail.
        coinInk: getComputedStyle(document.documentElement)
          .getPropertyValue('--coin-ink').trim().toLowerCase(),
        coinInkPaths: [...svg.querySelectorAll('path')]
          .filter((p) => p.getAttribute('fill') === 'var(--coin-ink)').length,
        // The mark IS the icon's drawing now — full detail plus the wash.
        washed: svg.innerHTML.includes('pigWash'),
        // ⚠️ ...but the wash stops must be TOKENS, not the icon's literal
        // pinks: warm-white ink on pale pink has almost no contrast, so on
        // dark the outline stops reading. Hard-coding #FBE9E3 here is the
        // regression, and it is invisible in the light theme.
        washLiteral: /stop-color="#/.test(svg.innerHTML),
        // The ground shadow still does not come across: it is ink-coloured,
        // and on dark the ink is warm-white, so it renders as a pale smear.
        // The shadow is the widest thing in the drawing, so its absence is
        // measurable as the art's width against its height.
        detail: {
          tail: svg.querySelectorAll('path').length,
        },
      };
    });
    expect(info.buttons).toBe(0);
    expect(info.ariaHidden).toBe('true');
    expect(info.stroked).toBe(0);
    expect(info.accent).toBe(1);
    // Fixed in both projects — the coin's ground travels with it.
    expect(info.coinInk).toBe('#12100e');
    // The coin's outline plus the two strokes of the `$`.
    expect(info.coinInkPaths).toBe(3);
    expect(info.washed).toBe(true);
    expect(info.washLiteral).toBe(false);
    // Full detail: the stripped variant draws 7 paths, the icon's drawing 13+
    // (tail, eye, two nostrils, the $ as two strokes, two ticks).
    expect(info.detail.tail).toBeGreaterThan(11);
  });
});

test.describe('empty-state marks', () => {
  // The seven drawn stand-ins for the app's blank moments. They are held to
  // the same nib rules as the loader, the capture receipt and the masthead
  // pig (CLAUDE.md §3.15) — and to one more that only applies to them: they
  // never animate, because an empty state is the absence of anything
  // happening and a moving mark would claim otherwise.
  test('every mark is filled paths with one sienna accent, and none is stroked', async ({ page }) => {
    await openApp(page);
    const marks = await page.evaluate(() => {
      // Read them out of the source table rather than hunting the eight call
      // sites: a mark that is drawn but never wired in is still a mark that
      // must not carry a stroke, and this way a new subject is covered the
      // moment it is added to INK_MARKS.
      const host = document.createElement('div');
      return Object.entries(INK_MARKS).map(([name, html]) => {
        host.innerHTML = html;
        const svg = host.querySelector('svg');
        return {
          name,
          // ⚠️ The ROOT counts too. querySelectorAll searches descendants
          // only, so a stroke on the <svg> itself — inherited by every child,
          // the worst form of this regression — sails past a descendant-only
          // probe. That mistake shipped a false pass once already.
          stroked: svg.querySelectorAll('[stroke], [stroke-width]').length
            + (svg.hasAttribute('stroke') || svg.hasAttribute('stroke-width') ? 1 : 0),
          paths: svg.querySelectorAll('path').length,
          accent: [...svg.querySelectorAll('path')]
            .filter((p) => p.getAttribute('fill') === 'var(--sienna)').length,
          ariaHidden: svg.getAttribute('aria-hidden'),
          hasViewBox: svg.hasAttribute('viewBox'),
          // The pink wash is the icon's and the masthead pig's alone. A
          // literal hex here would also be a theme bug: these sit on both
          // grounds and must be drawn only in tokens.
          literalInk: /(fill|stop-color)="#/.test(svg.innerHTML),
        };
      });
    });
    expect(marks.length).toBe(7);
    for (const m of marks) {
      expect(m.stroked, `${m.name} must not be stroked`).toBe(0);
      expect(m.paths, `${m.name} should be drawn`).toBeGreaterThan(1);
      expect(m.accent, `${m.name} carries exactly one sienna path`).toBe(1);
      expect(m.ariaHidden, `${m.name} is decoration`).toBe('true');
      expect(m.hasViewBox, `${m.name} must scale`).toBe(true);
      expect(m.literalInk, `${m.name} must use tokens, not literal hex`).toBe(false);
    }
  });

  test('a link with no rows says so, instead of asking for the link again', async ({ page }) => {
    // ⚠️ This is the regression the split fixes. Both branches of the empty
    // state used to print "Open your personal link (?user=…)", so a person
    // who HAD opened their link was told to go and open it — the one thing
    // they had already done. activeUser is what separates the two.
    await openApp(page);
    const copy = await page.evaluate(() => {
      activeUser = '99999';           // a valid link whose ledger is empty
      dataStamp++;
      calculateAndRender();
      const el = document.getElementById('empty-state');
      return { text: el.innerText, marks: el.querySelectorAll('.ink-mark').length };
    });
    expect(copy.text).toMatch(/Nothing logged yet/i);
    expect(copy.text).not.toMatch(/\?user=/);
    expect(copy.marks).toBe(1);
  });

  test('a failed load offers a way out and drops the last emoji', async ({ page }) => {
    await openApp(page);
    const state = await page.evaluate(() => {
      showLoadError();
      const el = document.getElementById('main-loader');
      return {
        marks: el.querySelectorAll('.ink-mark').length,
        retry: el.querySelectorAll('button.load-retry').length,
        // The ⚠️ this replaced was the last emoji reaching the DOM. An emoji
        // is painted by the OS font, so it was also the one glyph the app's
        // theme could not colour (CLAUDE.md §3.2).
        emoji: /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/u.test(el.innerText),
        // Red is reserved for expense and overspend figures. A connection
        // failure is not a money state.
        red: el.innerHTML.includes('--semantic-expense'),
      };
    });
    expect(state.marks).toBe(1);
    expect(state.retry).toBe(1);
    expect(state.emoji).toBe(false);
    expect(state.red).toBe(false);
  });

  test('the marks are still — no animation on any of them', async ({ page }) => {
    // The loader and the receipt animate because something is in flight.
    // These say "there is nothing here", and a bouncing mark over that
    // sentence reads as a spinner that never resolves.
    await openApp(page);
    const moving = await page.evaluate(() => {
      const host = document.getElementById('drill-body') || document.body;
      host.innerHTML = `<div class="drill-empty">${inkMark('box')}Nothing</div>`;
      const svg = host.querySelector('.ink-mark');
      return [svg, ...svg.querySelectorAll('*')]
        .map((el) => getComputedStyle(el).animationName)
        .filter((n) => n && n !== 'none');
    });
    expect(moving).toEqual([]);
  });
});
