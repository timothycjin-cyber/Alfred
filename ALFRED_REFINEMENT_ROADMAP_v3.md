# ALFRED REFINEMENT ROADMAP v3 — Mobile UI refinement + budget reframe

*Created 2026-07-18 from a product review session. Supersedes the remaining items of
`ALFRED_RESTRUCTURE_ROADMAP_v2.md` (its Phase 6 heatmap polish moves to the backlog here;
Phase 7 FAB long-press is parked). Execute **one phase per session, in order.**
Ground every change against `CLAUDE.md` — it documents trap zones (nav-cluster geometry,
slider math, `overflow-x: clip`, Apps Script redeploy rules) that apply throughout.*

---

## Decisions locked in this session (do not re-litigate)

1. **Single month selector, contextual header.** The header month dropdown and the Trends
   in-tab ‹ month › nav are both replaced by one compact month chip in the header that
   appears **only on Trends and Logs**. Today always shows the real current month.
2. **Logs = scroll-to-month, not filter.** Logs stays one continuous week-scroll; picking
   a month scrolls to that month's header. No month filtering of the ledger.
3. **Budget reframe is rename-only for now.** Data model untouched: rows keep
   `Type: Income`; the *surfaces* speak "budget". Budget for a month = that month's
   logged income. No stored budget number yet. (Multiple named budgets = future work,
   parked.)
4. **Hero leads with "Budget left"** — same math as the old Net Balance (income − expense).
5. **Txn modal toggle reads Expense / Budget** (stored Type values unchanged).
6. **Push digest will be fully retired** (bell UI + Apps Script trigger + PushSubs +
   Firebase). Not urgent — it is the final phase.
7. **Archive card stays** on Trends for closed months.
8. **No month carry-over, ever.** Each month is a sealed page: net/budget-left never
   rolls into the next month. This is already true in code — treat it as an invariant.

## Recorded assumptions (correct during implementation if wrong)

- Logs keeps the per-week **spend bar**; only the trailing-8-week **average marker** and
  `weeklyAverageSpend()` usage are removed ("total spent per week is still okay").
- "Widen the today pinpoint" = make the pace-bar Today marker thicker + give its label
  clear space from the caption line above.
- "Text magnify 20% more" on the nav pill = **add** an active-tab scale pop (~1.1×);
  there is currently no scale effect at all.
- Export modal internals unchanged; only its trigger moves to Logs and its "this month"
  scope follows the new shared month state.

---

## Phase A — Visual polish batch (pure CSS/copy, no behavior change)

All in `index.html`.

1. **FAB glow off.** `.fab` box-shadow is sienna-tinted
   (`0 10px 28px rgba(194,84,45,0.38), 0 4px 12px rgba(0,0,0,0.16)`). Replace with a
   neutral elevation shadow (e.g. `0 6px 16px rgba(0,0,0,0.18)`). Keep size, color, rotate.
2. **Capture placeholder.** `“lunch RM15” or add a receipt` → `“Coffee RM8”`.
   ⚠️ Two places: the `#capture-input` markup AND the reset string in
   `clearCaptureAttachment()`. The attach-mode placeholder ("Add a note, or send as is")
   stays.
3. **Pill border visibility.** `.floating-nav` border: light `rgba(0,0,0,0.08)` → ~`0.16`;
   dark `rgba(255,255,255,0.05)` → ~`0.12`. Goal: the slider's overshoot reads clearly
   against the pill edge. Tune by eye at 390px, both themes.
4. **Nav slide 20% snappier + text pop.** Do NOT edit `--motion-wobble` (shared by hero,
   tiles, FAB bloom, bars…). Add a nav-only token `--motion-wobble-nav` ≈ 20% shorter
   (632ms → ~505ms, same spring curve; also scale the pre-`linear()` fallback 420ms →
   ~335ms). Apply to `.nav-slider` transition AND a new active-tab text transform:
   `.nav-btn` gets `transition: transform var(--motion-wobble-nav), color …` and
   `.nav-btn.active { transform: scale(1.1); }`. Verify no layout shift / overflow
   (`overflow-x: clip` trap — measure `scrollWidth` over repeated toggles).
5. **Logs simplification.** In `renderLogsLedger()`: remove the `this week` chip
   (`.week-now`), remove the month-net span from `.month-header` (keep the month name),
   remove the average marker (`.week-bar-avg`) and its `weeklyAverageSpend()` call.
   Keep: entry count, week spend total, spend bar (scale = max rendered week spend).
   Delete now-dead CSS + the function if unused.
6. **Remove the 14-day capture strip from Today.** Delete `renderCaptureStrip()` call +
   function, `#today-capture` container, `.capture-strip-card`/`.strip-*` CSS.
   ⚠️ The `hm-l0..l4` sienna ramp classes belong to the Trends heatmap — do not delete.
7. **Pace-bar Today marker.** `.income-bar-marker`: width 2px → 4px; ensure the
   "Today" label above it doesn't crowd the caption — increase the caption's
   bottom margin (currently 22px) so label and sentence have clear separation.
8. **Trends avg-daily tile:** drop the `/ day` suffix from the value.

**Verify:** Playwright loop, 390 + 900 px, light + dark: FAB shadow neutral, pill
overshoot visible, tab text pops without overflow creep, Logs shows no chip/net/marker,
Today has no strip, marker reads clearly. Update `CLAUDE.md` §3a. One PR.

---

## Phase B — One month selector + header cleanup + export to Logs

1. **Remove the header month dropdown** (`#month-select-element`,
   `renderDropdownOptions()`, `handleMonthDropdown()`). `activeMonth`/`activeYear` are
   set to the real current month at load and no longer user-changeable — Today is always
   now. (Keep the variables; Today's render path still reads them.)
2. **Contextual header month chip.** Compact `‹ Jul ›` chip in `.header-actions`,
   rendered only when `currentView` is `trends` or `logs` (re-render on `switchView`).
   It drives the existing `viewMonth`/`viewYear` state with the same clamp
   `[earliestDataMonth() … current month]` and disabled ends. Remove `#trends-monthnav`
   from the Trends pane (delete `renderTrendsMonthNav()`; keep `trendsNavMonth()` logic,
   repointed to the header chip). The archive shelf stays and still sets `viewMonth`.
3. **Logs scroll-to-month.** On month change while on Logs: if the target month isn't
   rendered yet, raise `logsMonthsShown` until it is, then `scrollIntoView` its
   `.month-header` (smooth, respect `REDUCED_MOTION`). No filtering.
4. **Export moves to Logs.** Remove the export button from the header. Add a slim
   right-aligned export icon-btn row at the top of `#logs-view`. Export modal unchanged;
   its month scope reads `viewMonth`/`viewYear` (was `activeMonth`).
5. **Hide the bell button** (one line — full teardown is Phase F). Header on Today is
   now just "Project Alfred".

⚠️ `renderedKey` viewKeys: Today keys on `activeYear-activeMonth` (now constant within a
session), Trends on `viewYear-viewMonth` — after removing the dropdown, make sure a
month change via the header chip still busts the right key, and that Logs (whose content
doesn't key on month) doesn't skip its scroll behavior.

**Verify:** chip appears only on Trends/Logs; bounds disable correctly; Logs scrolls to
older months (lazy-load path); export from Logs exports the chip's month; Today
unaffected by chip changes; no overflow at 390. Update `CLAUDE.md` (Phase 5 notes are
superseded — say so). One PR.

---

## Phase C — Today pace card merge + Trends tile treatment

1. **Today pace card becomes the single "budget pace" card:**
   - Row 1 (caption): `X% of budget spent · Y% left` — existing.
   - Row 2: the bar + widened Today marker — existing.
   - Row 3 (new stats line, quiet ledger voice): `Avg daily RM A · Forecast ~RM B`.
     Reuse the exact Trends definitions: avg daily = MTD spend ÷ elapsed days;
     forecast = avg daily × days in month. Forecast figure turns red (see below) when
     forecast > month budget (= month income for now).
2. **Trends: remove the live pace bar.** The `#income-bar-card` live-month branch goes;
   the **closed-month archive card in that slot stays** (fed from viewMonth as today).
   `renderLivePaceBar` now has one caller (Today) — simplify (`barMemory` can drop its
   per-block keying if only one block remains).
3. **Trends tiles red-glow treatment.** Remove the `on track / over income` chip from
   the Forecast tile. Instead, when forecast > budget, the **numbers** on both the
   Avg-daily and Forecast tiles render in `var(--semantic-expense)` with a soft glow
   (e.g. `text-shadow: 0 0 12px` at ~35% alpha of the semantic red). Same condition
   drives both tiles. This is a legitimate semantic-red use (overspend warning), per the
   design language.

**Verify:** Today card shows all three rows with hand-checked numbers; red state
triggers exactly when forecast > budget and never on closed months (closed months show
actuals, no forecast); Trends live month has no pace bar, closed month keeps archive
card; spring on the bar still fires. Update `CLAUDE.md`. One PR.

---

## Phase D — Budget rename sweep (labels only, data model untouched)

Rows keep `Type: Income`; `INCOME_CATEGORIES` unchanged; parser prompt untouched.

1. **Hero:** label `Net Balance` → `Budget left`; same math. Keep the mini 6-month
   chart (bars = each month's leftover). Review the sub-copy ("In the green" /
   "Watching the leak") — keep unless it reads wrong under the new label.
2. **Today tiles:** `Income` tile → `Budget` (value unchanged: month income).
3. **Pace card captions:** `% of income spent` → `% of budget spent`;
   `No income logged this month` → `No budget set this month`.
4. **Txn modal:** toggle `Income` → `Budget`; check modal title/labels still read
   naturally ("adding RM2,000 to this month's budget"). IDs and stored values unchanged.
5. **Sweep every remaining user-facing "income" string** (archive card verdict, insight
   narratives, export modal copy, review sheet meta tags) — grep `income` in index.html,
   rename display strings only, never `Type` comparisons or `INCOME_CATEGORIES` keys.
   The LLM-phrasing facts sent to Apps Script may say "income" — fine to reword the fact
   strings client-side; do not touch `Code.gs` in this phase.
6. **CLAUDE.md:** update the product-model line — Alfred is a *budget tracker*; budget =
   logged income for now; multiple named budgets recorded as a future direction.

**Verify:** grep shows no user-visible "income" strings outside category names; add/edit
of a Budget-type entry round-trips correctly (stored as Income); insights still render.
One PR.

---

## Phase E — Subscriptions category

Touches both implementations + a redeploy.

1. `index.html`: add `"Subscriptions"` to `EXPENSE_CATEGORIES`; add entries to
   `CAT_COLORS` and `CAT_ICONS`. Pick the color with the dataviz six-checks validation
   against the existing palette, light + dark (see CLAUDE.md learnings — palette is
   contrast-validated; sienna family is taken by Food & Dining, red is semantic).
2. `apps-script/Code.gs`: add to `EXPENSE_CATEGORIES` (feeds both the extraction prompt
   and `validate_transactions` port). Consider one prompt example mapping
   ("netflix RM17" → Subscriptions) so the parser prefers it over Entertainment/Bills.
3. **Redeploy Apps Script the safe way:** Deploy → Manage deployments → **Edit** →
   new version. NEVER a new deployment (URL would change).
4. Note: existing rows are untouched; recurring-subscription rows logged under other
   categories stay where they are.

**Verify:** manual add shows Subscriptions in the dropdown; capture-parse "netflix RM17"
returns Subscriptions; pie renders the new color legibly in both themes. One PR +
redeploy.

---

## Phase F — Push digest retirement (when ready, no urgency)

1. `index.html`: remove the bell button + `togglePush()` + Firebase SDK lazy-import path,
   `FIREBASE_CONFIG`, `FCM_VAPID_KEY`, `localStorage('alfred_push_token')` handling.
2. Repo: delete `firebase-messaging-sw.js` (⚠️ keep `manifest.json` — the PWA install
   shell stays; the SW had no fetch handler so its removal doesn't affect data flow).
3. Apps Script: delete the `sendDailyDigestPush` time trigger; remove `push-subscribe`,
   `push-unsubscribe`, `run-digest-push` actions and digest/FCM code; drop the
   `FIREBASE_SA_JSON` + `FCM_PROJECT_ID` Script Properties. Keep `OPENAI_API_KEY` +
   `ALLOWED_USERS` (parse + insights live on). Redeploy via Manage deployments → Edit.
4. Optionally delete the `PushSubs` tab and the Firebase project (owner checklist).
5. **CLAUDE.md: rewrite the product model** — the third pillar ("digest is push") is
   retired by real-usage evidence; Alfred is capture + pull-based visual analytics.
   The digest *math* (`computeTodayGlance`) lives on in the Today glance line.

**Verify:** no console errors on load; capture, insights, add/edit/delete all still work
(they share the Apps Script deployment — regression-test after redeploy). One PR.

---

## Backlog / parked (not scheduled)

- **Multiple named budgets** — the real budget model (stored budget numbers, per-budget
  tracking). Design session needed before any build; today's rename keeps the path open.
- **Future-dated entries UX** — a capture note when an entry is dated next month
  ("appears in Today/Trends when August starts"); they already show in Logs.
- **Heatmap grid acceptance sweep** (v2 Phase 6) and **FAB long-press** (v2 Phase 7).
- **Correction handling** in capture ("actually make that RM20") — pre-existing item.
- **Capture-parse validation suite** — pre-existing item.

## Standing rules for every phase

- Verify with the local render loop before committing: `python3 -m http.server` +
  Playwright, mocked GViz, screenshots at 390 & 900, light & dark, reduced-motion spot
  check. Measure `documentElement.scrollWidth` when anything moves along X.
- Update `CLAUDE.md` in the same PR as the change it documents.
- Respect the design language: M3 Expressive, sienna accent, semantic red = expenses/
  overspend only, minimal ledger voice (no emoji, no exclamation marks).
