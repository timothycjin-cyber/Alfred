# Alfred Restructure Roadmap v2 — Today · Logs · Trends

*Drafted 2026-07-18. **Supersedes ALFRED_UX_ROADMAP.md** — where the two disagree, this file wins.
Import into Claude Code alongside CLAUDE.md. Each phase is one focused session. Do not start a later phase before the earlier one is merged, verified, and CLAUDE.md updated.*

---

## Confirmed decisions (do not relitigate; flag if code contradicts them)

1. **Three tabs: Today · Logs · Trends.** Today is the default landing tab.
2. **FAB is detached** — its own circle floating above the nav bar, not docked inside the pill. Nav pill holds the three tabs only.
3. **Hero card + income/expense tiles move from Home to Today.** Home no longer exists as a concept; Logs is the pure ledger.
4. **Daily summary line lives on Today** (reuses digest math — "Today · RM 34.50 across 3 entries · under your RM 41 daily average").
5. **Insight strip ("What I noticed") moves to Trends**, at the top, as the narrative opener.
6. **Visual grammar rule: bars for money, cells for habit.** Spend intensity is always a horizontal bar; capture activity is always sienna-tinted cells. Never mix.
7. **Logs is a week index, not an infinite scroll.** Accordion behavior: tap a week row to expand in place; multiple weeks may be open; current week is expanded by default.
8. **Scroll-peek principle:** pages may scroll, but order content so the next card's top edge peeks above the fold on a ~390×700 viewport. Most self-sufficient content first.
9. Sienna `#C2542D` remains the accent; red/green stay semantically reserved for expense/income. Ledger voice throughout: no emoji, no exclamation marks, quiet verdicts.
10. Everything below is client-side sheet math over `allRows`. No new backend endpoints, no LLM calls beyond the existing cached insight call, $0/month holds.

**Target composition per tab:**

- **Today** (habit + right-now): hero card (with mini chart) → income/expense tiles → daily summary line → pace bar → 14-day capture strip (cells, "full grid in Trends" link)
- **Logs** (the ledger): month header with net figure → week rows (date range, entry count, spend total, spend bar vs weekly-average marker) → expanded week shows transaction rows (existing row idiom, tap to edit)
- **Trends** (history + depth): month navigation chip (`‹ July 2026 ›`) → insight strip → avg-daily-spend tile + forecast tile → cumulative line vs last month → pie → full capture heatmap grid → month archive shelf

---

## Working rules for every phase

- Read CLAUDE.md first. Update it at the end of every merged phase (geometry numbers, new idioms, gotchas discovered).
- Prefer targeted `str_replace` edits; propose before/after screenshots for visual changes before committing.
- Verify with the established loop: local `python3 -m http.server` + Playwright, mocked GViz, local Chart.js; screenshot at 390px and 900px, light **and** dark.
- Known traps (respect them): GViz dates are month-0-indexed; Chart.js custom plugins gated by `canvas.id`; horizontal transforms need `overflow-x: clip` ancestor; strict `activeUser` filter is deliberate — never add a view-all; animations suppressed under `.settled` and reduced-motion.

---

## Phase 0 — Cheap polish (unchanged from v1; do first, zero risk)

1. Apply the asymmetric signature corner (`--shape-xl --shape-xs` alternating) to all `.card` surfaces, not just hero/insight.
2. Month-initial labels under the hero mini chart bars (9–10px, `--on-surface-variant`).
3. Calm empty state when `activeUser` missing or rows = 0: "No data for this view. Open your personal link (?user=...) to see your ledger."

**Acceptance:** consistent silhouettes at both widths/themes; empty state replaces blank page.

## Phase 1 — Optimistic post-save (unchanged from v1; the foundation)

Confirmed capture / manual add / edit / delete must never end on a full-page loader.

1. On successful POST, construct the row locally (check whether Apps Script `add` returns the UID; if not, generate client-side with the `Date.now().toString(36)` scheme and send it — smallest change wins), push into `allRows`, `calculateAndRender()` immediately.
2. New row animates in via existing `rowIn` + `chipPop`; add a `.fresh` exception so it animates even in `.settled` views; respect reduced motion.
3. Silent reconcile fetch after ~2s; diff by UID; re-render only on disagreement; never surface an error for a save that already succeeded.
4. Date construction must match the GViz month-correction so optimistic and reconciled rows format identically.

**Acceptance (Playwright):** no `#main-loader` after save; row visible <200ms; totals/tiles/pace update; no flicker on reconcile.

## Phase 2 — Nav restructure: three tabs + detached FAB

**This phase intentionally touches the fragile part. Do it alone, in one session.**

1. Pill becomes three equal tabs: Today · Logs · Trends. Re-derive pill width, tab hit areas, and slider geometry from scratch (old math was two-tab: 280px pill, `calc(50% - 28px)` slider — it does not survive). Document the new numbers in CLAUDE.md with the same rigor as the old ⚠️ note.
2. FAB: 56px circle floating above the bar (centered horizontally by default), with its own drop shadow, `--sienna` fill. Spacing: visually clears the pill without colliding with page content; account for safe-area insets.
3. Capture sheet bloom origin currently assumes the docked FAB (`50% calc(100% + 44px)`). Re-derive from the new FAB center so the sheet still blooms from the button.
4. Tab content routing extends from 2 panes to 3 (Today pane can temporarily hold current Home content; real composition is Phase 3). Preserve the shared-axis slide transition; confirm direction logic with three positions (1→3 slides same direction as 1→2).
5. Sticky: slider position correct on load for each tab, after rotation, and after theme flip.

**Acceptance:** slider aligns pixel-perfect on all three tabs at 390/900, light/dark; capture sheet blooms from the new FAB; no `overflow-x` scroll creep; nav geometry documented in CLAUDE.md.

## Phase 3 — Today tab composition

1. Assemble per the target composition above. Hero + tiles move here; daily summary line added between tiles and pace bar (port `build_daily_digest` / `_daily_average` math from `Code.gs` as client-side JS over `allRows` — pure sheet math, no backend call).
2. 14-day capture strip: one row of cells, tint = entries logged that day, sienna ramp only (e.g. transparent → rgba(194,84,45, .16/.38/.68)); future days not shown (it's a trailing window); header "Capture · last 14 days" with a quiet "full grid in Trends" link that switches tabs.
3. Zero-today state: "Nothing logged today yet." — neutral, not nagging.
4. Order enforces scroll-peek: hero → tiles → today line → pace → strip; pace bar's top edge should sit near the fold on 390×700.

**Acceptance:** today-line matches hand-computed mock values (0, 1, many entries); strip counts correct; optimistic add (Phase 1) updates line and strip instantly; peek verified by screenshot.

## Phase 4 — Logs week index

1. Replace the flat timeline with week rows grouped under month headers (`July 2026 · net +RM 1,284.20`). Weeks run Mon–Sun; label as `Jul 13 – 19`.
2. Closed row: date range, entry count, spend total (semantic red), spend bar with sienna marker at the user's weekly average (average = mean weekly spend over trailing 8 completed weeks, minimum 2 weeks of data; hide marker below that).
3. Accordion: tap toggles expansion in place, multiple weeks can be open, current week expanded on load. Expanded week renders the existing transaction-row idiom (icon chip, description, category · date, amount) — tap row opens the existing edit modal untouched.
4. Older months lazy-render as the user scrolls (simple windowing — render current + previous month, append older month blocks on demand; no virtual-scroll library).
5. Bars-for-money rule applies: no cell grids anywhere on this tab.

**Acceptance:** week bucketing correct across month boundaries (a week spanning Jun/Jul appears once, under the month containing its Monday); expansion state survives re-render after an optimistic edit; entry counts and totals match mocks; no layout drift at 390px.

## Phase 5 — Trends: month navigation, forecast, archive

1. Introduce `viewMonth` state (default current). All Trends computations read from it. Month chip `‹ July 2026 ›` at top; back disabled before earliest data month, forward disabled at current.
2. Insight strip renders here (moved from Analytics top). For past months, use a deterministic retrospective template — no new LLM calls for history.
3. New tiles: **avg daily spend** (month-to-date spend ÷ elapsed days) and **forecast** (avg daily × days in month, shown as "on track for ~RM 2,940" with the verdict word colored semantically vs income). Forecast only for current month; past months show actuals.
4. Cumulative line and pie read `viewMonth`. For past months, replace the pace-style framing with closed-month figures.
5. **Month archive shelf** at the bottom: horizontal chip row of past months; tapping sets `viewMonth`. When viewing a past month, show the archive card (net, top category, days logged X of N, quiet pace verdict "under pace · RM 120 kept") in place of forecast.
6. Watch the chip row for the overflow-x trap (clip, not hidden).

**Acceptance:** navigating months updates every element; forecast matches hand math; current month restores live forecast; cached-insight behavior unchanged for current month; both widths/themes verified.

## Phase 6 — Full capture heatmap grid (Trends)

1. Calendar grid for `viewMonth` below the pie: one cell per day, sienna ramp by entry count, future days hairline-dashed, header `July capture · 14 of 17 days logged`.
2. Cells-for-habit rule: this and the Today strip are the only cell grids in the app; they share the exact ramp values.
3. `chipPop` stagger on first render; suppressed under `.settled`/reduced motion.
4. Skip day-tap filtering unless it falls out nearly free — do not build a filter system for this.

**Acceptance:** counts match mocks; ramp legible light/dark; past months render via `viewMonth`; no drift at 390px.

## Phase 7 (optional, last) — FAB long-press accelerator

Long-press (~450ms) on the FAB opens the camera/receipt flow directly, skipping the capture sheet. Tap behavior unchanged. No visual affordance required — it's a shortcut, not the primary path. Haptic/scale feedback on trigger if cheap.

**Acceptance:** tap still opens the sheet instantly; long-press opens camera; no accidental triggers during scroll-past-FAB.

---

## Explicitly out of scope (do not build unless asked)

- Streak counters, badges, confetti, celebratory motion beyond existing pop-ins
- Milestone marks on the hero; personal-records insight templates (both parked)
- Drill-in navigation for Logs weeks (accordion decided), search, or filters
- Any new backend endpoints, LLM calls, or paid services
- Telegram bot changes — this roadmap is dashboard-only

## End-of-roadmap ritual

After Phase 6 (or 7), consolidate: update CLAUDE.md's layout description, nav geometry numbers, and pending list; retire references to "Home" and "Analytics" as tab names; note the bars/cells grammar rule and the scroll-peek principle as design-system entries.
