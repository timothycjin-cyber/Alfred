---
name: alfred-history
description: The full change history and per-change rationale for Project Alfred (this repo) — what every shipped phase built, why each design fork was taken, the deltas from each owner spec, and the verification record for each pass. Read this when you need to know WHY a past decision was made, whether something was tried before, or what a roadmap phase name in an index.html comment refers to. CLAUDE.md keeps the current state and the binding decisions; this file keeps the story behind them.
---

# Project Alfred — change history and rationale

This is the narrative record. **The binding rules live in `CLAUDE.md`** (§3 current state, §6's
"Decisions future phases must not re-open" lists, §6 "Explicitly out of scope", §8 principles) —
nothing here overrides them. Read this for the reasoning, the superseded attempts, and the
verification counts.

For code comments that reference roadmap phases: **v2** = the restructure roadmap
(Today · Logs · Trends, numbered Phases 0–7), **v3 / lettered phases** = the refinement
roadmap (Phases A–F).

---

## Shipped phases — design rationale and spec deltas

*(Moved out of CLAUDE.md §6, which keeps each phase's heading, owner checklist and binding
decisions. These are the bodies: why each fork was taken, and where the shipped work deviated
from the brief.)*

Code changes shipped and Playwright-verified (details in §7). What was done: removed the
bell + `togglePush()` + `initPushUI()` + Firebase SDK import + `FIREBASE_CONFIG` +
`FCM_VAPID_KEY` + `localStorage('alfred_push_token')` from `index.html`, deleted the
`firebase-messaging-sw.js` file and its `navigator.serviceWorker` registration, stripped
the `push-subscribe`/`push-unsubscribe`/`run-digest-push` actions and all digest/FCM code
from `Code.gs`, and rewrote the product model here (§0).

Built and render-loop verified (50/50 — 44 at build, plus 6 added in #53); the shipped
behaviour lives in §3.13. The design rationale below is kept because it records *why* each
fork was taken.

Rent, subscriptions and standing bills are the same figure every period, so logging them
by hand is pure friction — and forgetting to log them makes budget-left, forecast and pace
wrong in a way the surfaces can't reveal. A series is defined once; its entries
materialize into the ledger on their own.

**The three open questions, answered:**

| Question | Decision |
|---|---|
| Where generation runs | **Client-side on app open.** Reuses `saveReviewAll()`'s sequential batch writer and the whole optimistic-write stack; no time trigger, no new endpoint for row writes. |
| How far ahead rows are created | **Never ahead — up to today only.** |
| How to edit/stop a series | **Forward-only edits**, plus pause and delete, from a sheet on the Logs page. |

Plus two scope calls: definitions live in a new **`Recurring` tab** in the same Sheet
(synced across devices, survives a reinstall, hand-inspectable), and the feature covers
**income as well as expenses** — a recurring salary populates the month's budget, which
matters because a month's budget *is* its logged income (§0).

**Why never future-dated (load-bearing, not taste).** Every live-month figure divides by
*elapsed* days — `avgDaily = totalExpense ÷ days elapsed`, `forecast = avgDaily ×
daysInMonth`, the pace bar's `usedPct`/`monthPct`, the patterns chip's `elapsedDays`
divisor — and the patterns grid dashes future cells (`hm-future`). A pre-written future
row silently corrupts all of them. "What's coming" is an **unwritten `Next …` preview**
in the sheet instead. (`validDate()` in `Code.gs` already clamps anything >2 days out back
to today; `handleAdd` doesn't call it, but the intent is on the record.)

**`Recurring` tab** — `Sheet1` untouched; read client-side via a second GViz query
(`&sheet=Recurring`). Columns: `SeriesID` · `User` · `Type` · `Amount` · `Category` ·
`Description` · `Cadence` (`daily`/`weekly`/`monthly`) · `StartDate` (sets the weekday for
weekly, the day-of-month for monthly) · `EndDate` (blank = open-ended; **reserved, no UI
this phase** — included now to avoid a Sheet migration later) · `Active` (the pause flag) ·
`Created`. Generated rows carry a new Source value **`recurring`** in `Sheet1` col E.

**Idempotency — derived UIDs, arbitrated server-side.** Each occurrence gets
**`rc-<seriesId>-<YYYYMMDD>`**, which computes identically from any device on any day.
(§1's "UID format is opaque" rule governs *reading* UIDs; minting our own structured one is
fine.) Two guards, because the GViz read cache lags writes by seconds: the client skips any
UID already in `allRows`, and `handleAdd` gains a duplicate guard — if a supplied `uid`
already resolves via `findRowByUID`, return `{success:true, uid, duplicate:true}` without
appending. Cost: one extra O(rows) column scan per add, negligible at this data scale.

**Generation** (`materializeRecurring()`) runs **after first paint, never awaited**, so a
slow or missing `Recurring` tab can't delay or break load (§8: make optional calls
non-blocking). A missing tab makes GViz return an error — catch it and treat as "no
series". For each active series belonging to `activeUser`, enumerate occurrences from
`StartDate` by cadence, stopping at today (or `EndDate`), skipping UIDs already present.
**Monthly clamps to the month's last day** (a series on the 31st fires the 30th in
November, the 28th/29th in February). Backfill is bounded by the create form's date `min`
of today — a *new* series can never backfill — with a hard cap of 60 occurrences per run.
On success: `applyLocalRender()` (bumps `dataStamp`; never call `renderLogsLedger()`
directly) and a quiet toast, `Added 2 recurring entries`.

**UI** — a second `.icon-btn` in `.logs-toolbar` (repeat glyph) opens `#recurring-overlay`.
Use a **plain centered `.modal-overlay`, not `.align-bottom`** — that variant's
`transform-origin` is FAB-anchored (§3.3 derived numbers), so a toolbar-triggered sheet
would spring from the wrong place. **One overlay, two panes** (`#recurring-list-pane` ⇄
`#recurring-form-pane`) swapped in place, because `trapModalFocus` supports exactly one
trap at a time and stacking would clobber the return-focus chain — the same idiom the txn
modal uses for `#modal-confirm`. Escape backs form → list, then closes. List rows reuse
`.export-choice`; the form reuses `.type-toggle` (Expense/**Budget**), `.form-input`,
`.form-select`; delete reuses the `.btn-danger` → `.btn-danger-solid` escalation, with copy
stating plainly that **already-generated rows stay** (they're ordinary ledger rows from the
moment they exist — edited or deleted individually through the txn modal).

**Backend** — one new action: `case 'recurring':` → `handleRecurring(data)`, switching on
`data.op` (`add`/`edit`/`delete`) internally against the new tab. One action rather than
three keeps the surface as close to the "no new backend endpoints" rule as the feature
allows. `getRecurringSheet()` follows `getSheet()`'s shape and **creates the tab with its
header row if missing**, so there's no manual setup.

**Also in scope:** `mapGvizRows` reads col E into `Source` (safe — `rowSig` uses explicit
fields, `exportCSV` builds columns explicitly); the month-0-index correction is extracted
into a shared `gvizDateToIso()` used by both tabs; `populateCategoryOptions()` takes a
select id; and **`_insightRecurring()` excludes `Source === 'recurring'` rows** — it infers
recurring charges from amounts stable across ≥3 months, and generated rows are *perfectly*
stable, so without this the insight strip would report the user's own series back to them
as a discovery.

Built from two owner-supplied briefs on the same day (the second superseding the first),
so it never sat in the candidate queue. Shipped behaviour is in §3.6; the rationale for
each fork is in the §7 entries. **No owner checklist — front-end only, no Apps Script
change, no redeploy.**

Owner-supplied brief, written against the pre-donut pie (it names `pieLabelsPlugin` and
`variableRadiusPlugin`, both deleted 2026-08-04). Its *intent* survived the redesign
intact and is what shipped; only the mechanism moved. Shipped behaviour is in §3.7 and
§3.14. **No owner checklist — front-end only, no Apps Script change, no redeploy.**

One other brief detail that had moved on: it asked for the total in a `.txn-footer` /
`.txn-footer-amt` line "matching the day sheet's footer". The day sheet has no footer — its
total sits in the header beside the title (`.drill-total`), which is the markup the
category sheet reuses, so the two are identical as intended.

Owner brief, `ALFRED_LOGS_MONTH_SCOPE_PATCH.md`. Shipped behaviour is in §3.6. **No owner
checklist — front-end only, no Apps Script change, no redeploy.**

One deviation from the brief, on correctness: it defines the scope as calendar months back
from now, but the ledger indexes **months holding data**. With a gap month those differ,
and the calendar reading makes the tail name an empty month — a tap that reveals nothing.
Counting data months keeps the tail's promise honest. `monthsAvailable()` therefore wasn't
added: `_logsTotalMonths` already is that quantity, and the brief's own instruction was not
to write a second helper.

Owner-supplied spec (`SPEC_HEADER_MASTHEAD_20260811.md`), shipped as the five commits it
set out. Shipped behaviour is in §3.2, §3.3 and §3.4. **No owner checklist — front-end
only, no Apps Script change, no redeploy.**

Three deltas from the spec as written, all deliberate:

- **`pickerMonths()`, not `monthTotals()`** — the latter name is already taken by the
  per-month totals helper Today reads, and shadowing it would have broken the hero trend.
- **Months holding data, not calendar months** (§3.4). The literal reading puts a row in
  the picker for a gap month, and tapping it scrolls nowhere on Logs.
- **Condensed padding is 3px, not 8px** (§3.4). `.month-btn` keeps its 44px floor, so the
  spec's 8px would have produced a 60px bar — barely smaller than the 74px expanded one,
  which defeats the point of condensing. 3px lands it at ~50px, the size the spec intended.

The spec's `.rise` modifier already existed as **`.sheet-rise`**, shipped with the drill-in
sheet on 2026-08-08 for exactly the same reason; it was reused rather than duplicated.

Owner-supplied follow-on spec (`SPEC_LIFTOFF_PILL_20260811b.md`), shipped as seven commits.
Shipped behaviour is in §3.3, §3.4, §3.6 and §3.7. **No owner checklist — front-end only, no
Apps Script change, no redeploy.**

Five deltas from the spec as written, all deliberate:

- **The rubber band caps at 12px, not 24** — the pill sits at `right: 16px` outside
  `.container`'s clip, so 24 pushes it past the viewport edge and widens the document (§3.2).
- **The click after a swipe is eaten, not out-raced.** The spec's `setTimeout(…, 0)` loses to
  the click task, so every committed swipe would also open the picker.
- **The readout resolves geometrically, not from the observer's entry list**, which is
  directionally asymmetric (§3.6).
- **The swipe steps through `pickerMonths()`, not the calendar** — otherwise it lands on gap
  months the picker refuses to offer.
- **`stepMonth` / `goToMonth` / `nowYear` / `nowMonth` / `readMonthFromHeader` were not written.**
  `stepViewMonth()` / `applyViewMonth()` already exist and §3.4 forbids a second month-change
  path; `data-ym` already encodes what `readMonthFromHeader` would have re-encoded.

Two things the spec asked to delete that did not exist: `.mh-sub`, and a year stepper in the
picker (its year affordance is a non-interactive divider). And **Commit 7 was verification only**
— nothing has ever persisted `viewMonth`/`viewYear`, so the negative control that *adds*
persistence is the only thing that makes that check mean anything.

Owner call: **the accelerator never worked reliably on the device**, across three passes. It is
deleted. Shipped behaviour is in §3.3 and §3.8. **No owner checklist — front-end only, no Apps
Script change, no redeploy.**

**This supersedes the build (2026-08-12) and device-fix (2026-08-13) sections that used to sit
below it; both are deleted, since this section states the outcome and §8 carries every finding
they produced.** The feature is gone from the app, not from the record — §7 keeps the
narrative.

**Why this is a removal and not a fourth attempt** — the part worth carrying forward. A
press-and-hold that ends in a camera is decided by four things at once: main-thread load at the
moment of the press, the platform's own long-press detector running off the main thread, the
file-chooser's user-activation rules, and the camera intent's own launch latency. **A desktop
Playwright run models none of them.** So the suites were not wrong — 104/104, 141/141 and 180/180
each verified exactly what they could reach — they simply carried no information about the only
environment where the feature was broken. When the verification loop is structurally blind to a
feature's failure mode, each fix is a guess dressed as a result, and the honest move is to stop
rather than iterate. ⚠️ **Generalize this before adding any other gesture**: ask what would have
to be true for the render loop to see it fail.

Owner-supplied review of `main` @ 86054de (`ALFRED_FIX_SPEC.md`), shipped as three code
commits in the order the spec set — mechanical, weight rebalancing, judgement — plus a
documentation commit and a one-pixel `.logs-tail` follow-up. Shipped behaviour is in §3.2,
§3.3, §3.5–§3.9 and §3.14. **No owner checklist — front-end only, no Apps Script change,
no redeploy.**

Three deltas from the spec as written, all deliberate:

- **The heatmap clip is applied to the render, not to `days`** (§3.7). The literal patch
  drops future-dated expenses from the chip total *and* renders zero cells on a closed
  month, because there `clipped` and `days` are the same array reference.
- **`.capture-manual` replaces its `.modal-actions` wrapper** rather than sitting inside
  it (§3.8), which would have doubled the spacing.
- **A fourth `Budget` → `Income` site** (`#recur-type-income-btn`) was included, so no
  surface still names a transaction type `Budget`.

Two things the spec's verification section claims that do **not** hold as stated, recorded
so nobody re-derives them: `.day-col` is ~42px *wide* at 390px and `.shelf-chip` is 28px
tall. Day columns are a locked seventh-of-the-track design (§3.6) and meet the ≥44px-tall
rule they were written to; the archive shelf chips were **not** part of this pass and are
listed below as an open item.

### Empty-state marks (2026-09-05)

The brief was open: "jazz up the design", with a reference sheet of ~50 hand-drawn doodle icons
and a request to plan where more of the marker style could go. Two things settled the scope
before any drawing started.

**Where art earns its place.** The three existing marks each hold a job — the loader says
"wait", the receipt says "reading your photo", the pig says "this is Alfred". A fourth home had
to have a job too, and the one left was the app's blank moments: eight places where the app
showed a single line of grey text. Everywhere else was ruled out on existing rules rather than
taste — beside a figure the mark competes with the number, on a repeating row (a week row, a day
column) it multiplies into noise, and the masthead is governed by "names the period, never
measures it" plus a height invariant.

**What was NOT drawn.** Roughly a third of the reference sheet is celebration art: trophies,
medals, rosettes, flags on mountains, confetti hands. None of it was drawn, and the out-of-scope
list grew a line saying so. Alfred's ledger voice ("no emoji, no exclamation marks, quiet
verdicts") and the standing ban on streak counters, badges and confetti are not reopened by the
app acquiring a house illustration style — a drawn trophy is still a trophy.

**The wallet that became a bag.** The first draft of the "no expenses this month" mark was a
wallet: a rectangle, a fold band, a clasp dot. Rendered next to the envelope it was the same
drawing with the flap flattened — and the source called one `envelope` and the other `wallet`,
so nothing in the code disagreed. Only a side-by-side render showed it. The shopping bag's arch
handle is a silhouette nothing else in the set has, and it is the better noun anyway: a wallet
is about holding money, a bag about having spent it, and the state means "nothing spent".

**The box that was a cereal bowl.** The open box was first built from a four-point `stroke()`.
`stroke()` chaikin-smooths its polyline twice, so all four corners rounded off and the tub came
out as a U. `box()` exists for exactly this and the fix was to use it. The path data was correct
throughout; only the render disagreed.

**Two roadmap items closed on the way past.** Items 10 and 11 in "Recorded but undecided" were
both about states this pass was already rewriting. The first-run card had one message for two
situations, so a person who had just opened a valid `?user=` link was told to open their
`?user=` link — `activeUser` already distinguished them and now does. The failed load was bare
centred red text carrying a ⚠️, with no card and no way out; it became a card with the cloud
mark, neutral ink (red is reserved for money states, not connection failures) and a **Try again**
button. That retired the last emoji in the app. Item 11 is only half closed: the FAB still sits
live over the failed state, which is a separate decision and stays on the list.

`init()` was split into `init()` + `loadAndRender()` so the retry re-runs the load alone —
calling `init()` again would have bound a second set of pointer listeners to the pill.

**Verification.** 8 new browser checks (71 total, from 63), and three negative controls run
before the checks were trusted: a `stroke` on an SVG **root** (the form that beat the first
draft of the loader's probe — `querySelectorAll` searches descendants only), the pre-split
single-message empty state, and an `animation` on `.ink-mark`. All three failed as intended,
then the tree was restored. The stillness check earns its place: an animated empty-state mark is
invisible to every DOM assertion, since the markup is identical either way.

---

---

## 7. History (compact)

For code comments that reference roadmap phases: **v2** = the restructure roadmap
(Today · Logs · Trends, numbered Phases 0–7), **v3 / lettered phases** = the refinement
roadmap (Phases A–F). All shipped phases below are DONE & verified; what each built is
woven into §3.

- **2026-09-05 — Empty-state marks (§3.15, §6).** Seven more subjects from the nib, for the app's
  blank moments. Also closed roadmap item 10 (the first-run card told a person who had opened
  their `?user=` link to open their `?user=` link) and half of item 11 (the failed load became a
  card with a retry, retiring the app's last emoji). The two design lessons: two nouns that share
  a silhouette are one drawing however you name them in the source, and `stroke()` is not
  `box()` — chaikin rounds a four-point rectangle into a lozenge.

- **2026-08-20 — Committed browser smoke suite (§3.12, §6).** Prompted by a user asking why a
  small change (the icons-into-masthead move, above) took as long and cost as much as it did.
  The honest answer: most of the cost wasn't the code change, it was rebuilding a disposable
  Playwright harness from zero to verify it — mocking the sheet, stubbing Chart.js, pinning the
  clock — the exact plumbing `test/`'s pure-logic layer had already stopped needing to rebuild
  for logic checks two months earlier. `test/browser/` applies the same fix one layer up:
  `helpers/app.js` is that plumbing, committed and reusable; `smoke.spec.js` is a 26-check
  baseline (boot, layout overflow, core interactions, and a permanent regression test for the
  2026-08-19 pill pointer-events bug) on top of it, running in CI via a new `browser-tests.yml`
  kept separate from the zero-install `tests.yml`.

  One harness bug surfaced while proving the regression test would actually catch what it was
  named for: written straight, it **passed against the still-broken pointer-events CSS** — the
  Playwright project's `reducedMotion` context option wasn't reliably reaching `matchMedia()`
  before the app's own script ran, so the app's `REDUCED_MOTION` const (read once, at
  script-parse time) never flipped, and the pill's `transform: none` rule — the thing that
  actually puts it in the corner at rest — never applied either. Switching to an explicit
  `page.emulateMedia()` call before `goto()` fixed it; the regression test then failed
  correctly against the reverted CSS and passed against the fix, both confirmed before trusting
  either result. Filed in §8 as its own lesson: a documented-equivalent runtime API is not
  automatically interchangeable with a context option on every browser build, and a new probe
  earns trust by being caught failing first, not by passing on the first try.

- **2026-08-19 — The Logs toolbar moves into the masthead (§3.4, §3.6, §6).** A layout change
  that turned into a hit-testing one. `.logs-toolbar` was a 44px right-aligned `.icon-btn` row
  sitting directly under the 31px serif masthead — two controls' worth of chrome pushing the
  ledger down, when `#masthead` had been `justify-content: space-between` with a single child
  since the header was deleted. The buttons moved into `#masthead-actions` unchanged (same size,
  same handlers, same order), Logs-only via `hidden` so they stay out of the tab order elsewhere,
  and `align-self: center` because the flex container aligns on `baseline` and an icon has no
  baseline — without it the masthead's height changes, which moves the title and re-derives
  `--pill-travel`. Both are asserted against the pre-change build.

  **The finding is the pill.** The top-right corner already had an occupant: the lift-off pill,
  transparent at `--p: 0` and kept out of the hit path by `mh-pill-hit`'s discrete keyframes. That
  gate turned out to be **conditional on the document being scrollable** — a scroll timeline with
  no scrollport is *inactive*, its keyframes do not apply, and `pointer-events` falls back to
  `.pill`'s own `auto`. On a month with a couple of entries an invisible 114px button had been
  parked across the corner for as long as the pill has existed, eating every tap on it; harmless
  only because nothing was up there. The fix is one word — the base rule is `none` and the
  keyframes turn it **on** — and the general form is in §8: write a gate so the un-animated state
  is the closed one.

  **How it surfaced is worth more than the fix.** No assertion caught it. Playwright *refused to
  click* the relocated icons and named the intercepting element, and that refusal was the bug
  report. "Is this visible button clickable" is not a question anyone writes a probe for. Verified
  45/45 at 390/900, light and dark, both motion modes, six negative controls — all six fired, and
  two of them (`align-self`, and putting `pointer-events: auto` back) fired on checks other than
  the ones predicted, which is the usual sign that a probe is weaker than its name suggests. One
  harness note for the next pass: the export-scope check has to run at a viewport short enough for
  the target month's header to reach `SPY_LINE`; at 390×844 this fixture bottoms out first and
  tests the documented clamp instead — identical on the pre-change build, so not a regression.

- **2026-08-15 — Pure core + the first committed tests (§3.12, §6).** Superseded banner, kept
  because it is where the repo's regression layer starts. `lib/alfred-core.js` holds the pure core
  (dates, week clipping, recurrence, the reconcile merge, escaping) as a plain `<script src>` that
  `node --test` also loads; `test/` holds 36 tests and `test/run.sh` runs them in four timezones,
  with CI running the same script on every push and PR. ⚠️ **`parseRowDate()` is THE way to turn a
  row's date into a `Date`** — the bare `new Date(iso)` it replaced in 24 places parses UTC
  midnight and is read by local getters, so west of UTC rows filed under the previous month while
  rendering under the right one. Invisible at UTC+8, which is why it survived so long. Two more
  defects found by reading: `txnRowHtml()` interpolated `Description` unescaped (proved
  exploitable, then proved fixed), and `csvEscape()` now defuses spreadsheet formulas while
  exempting plain numbers. **The throwaway render loop stays** — this is a floor under it, not a
  replacement.

- **2026-08-12 → 2026-08-13 — The FAB long-press accelerator: built, fixed twice, removed
  (§3.3, §3.8).** Three passes over two days, consolidated into one entry because the arc is
  the point and the feature no longer exists. **The build (2026-08-12, 104/104, six negative
  controls)** made a ~450ms hold on the FAB open the camera directly, with the photo returning
  through the ordinary capture path so the confirm stayed — it saved a tap, not a step. Four
  findings: the FAB's **inline `onclick` had to come off the markup**, because an attribute
  handler is registered at parse time and fires before any listener added later could suppress
  it; the **`setTimeout(…, 0)` race is invisible to synthetic mouse input**, since Chromium
  dispatches `pointerup` and `click` in one task and only three separate evaluations with a real
  macrotask boundary reproduce what a finger does; **cancelling the camera fires no event at
  all**, so the shortcut flag survived into the user's next unrelated pick; and
  **`setPointerCapture` throws on an inactive pointer**, one line before the timer was set.
  **The device-fix pass (2026-08-13, 141/141, seven negative controls)** answered two defects a
  real phone found in a minute, neither reachable by the harness. *The first long press after
  entering the app did nothing at all* — a lone `setTimeout` has two independent ways to die on
  a cold start (it slips under main-thread load, and Android's own 500ms long-press, detected
  off the main thread, steals the pointer), and **a cancelled touch dispatches no `click`
  either**, so the tap fallback never ran and the press produced nothing. 450ms had left 50ms of
  margin under that platform timeout and the app's own startup work ate it, so the press moved
  to **elapsed time checked at every end-of-gesture path**, `fire()` became idempotent, the
  threshold dropped to 350ms, `.fab` took `touch-action: none`, and `materializeRecurring()`
  moved to `requestIdleCallback`. *Cancelling the camera left the nav pill a blurred blob* —
  Chromium restores `.floating-nav`'s `backdrop-filter` from a **stale snapshot** and nothing
  invalidates it, because a cancelled camera fires no event; `repaintNavCluster()` drops the
  filter for one frame. Two probe bugs surfaced: a **`let` at the top level of a classic script
  is a global lexical binding, not a property of `window`**, so a flag assertion was vacuous;
  and a watcher that re-`observe()`d without disconnecting recorded every mutation once per
  call. `defer` on the Chart.js tag was specced and **deliberately not shipped** —
  `Chart.register()` is top-level in the inline script, so it would throw on load.
  **The removal (2026-08-13, 84/84, three negative controls)** is the owner's call, and the
  finding worth keeping is about the loop rather than the gesture. An unmerged fourth attempt
  (180/180) had *disproved its own leading hypothesis* with trusted-touch instrumentation and
  then shipped on the surviving one. A press-and-hold ending in a camera is decided by
  main-thread load at the instant of the press, an off-main-thread platform detector, the file
  chooser's user-activation rules and the camera intent's own latency — **a desktop Playwright
  run models none of them**, so three green suites against a defect that never moved carried no
  information at all. And **the cost was never the one tap it saved: it was the FAB**, the
  control the whole app funnels through, where a hold that silently does nothing teaches the
  user to press twice. Two things were deliberately kept out of the removal —
  `repaintNavCluster()`, which fixes a different bug and is **confirmed working on the device**,
  and `materializeRecurring()`'s idle scheduling, which stands on its own merits. Front-end
  only throughout — no Apps Script change, no redeploy.
- **2026-08-11 (second pass) — Lift-off pill: the period on every tab, chevrons out (§3.3,
  §3.4, §3.6, §3.7):** the follow-on to the masthead PR shipped the same day. The month appears
  on **all three tabs**; the binary `.condensed` class becomes a **continuous scroll-linked
  `--p`**; and instead of the bar shrinking in place, a **glass pill flies into the top-right
  corner** as the masthead fades. Today reads the **date** and is inert. The **chevrons and the
  Trends archive shelf are deleted**, which closes §6's "three doors" question at two — the
  picker and a **swipe on the pill** — and reverses roadmap v3 decision 7 for the shelf. On Logs
  the pill becomes a **scroll readout**: no selected month, only a position, and **export follows
  it**. Six findings worth keeping. **(1) `--p` is not off the main thread** — the first commit
  message said it was, and it is wrong: only transform/opacity/filter get the compositor, so a
  scroll-driven animation of a *custom property* recalcs style every frame and re-resolves every
  consumer. It is still far cheaper than the scroll listener it replaced; the win is "no JS", not
  "no work". Left uncorrected, the next person adds twenty consumers on the strength of the
  claim. **(2) The click after a swipe has to be EATEN, not out-raced.** The spec's
  `setTimeout(() => dragged = false, 0)` in `pointerup` loses to the click task often enough to
  matter, so every committed swipe would also open the picker — a bug that only shows up on a
  real finger. **(3) "Topmost intersecting entry" is directionally asymmetric.** Scrolling *up*
  out of July, July's header leaves the observer's band, nothing intersects, and the readout
  latches on the month you just left. Resolving geometrically against a line — the last header
  above it — is symmetric, and makes the band's size irrelevant, which also removed a percentage
  margin that inverts on a short viewport. **(4) The swipe and the picker have to agree about
  what a month is.** The spec clamps the swipe to calendar months; the picker has refused gap
  months since the previous PR. With a May gap in the fixture, calendar stepping walks from June
  into an empty May that scrolls nowhere on Logs and renders a blank Trends. Stepping through
  `pickerMonths()` is the same correction, applied to the second door. **(5) A jump the document
  cannot deliver is authoritative.** The oldest months can never reach the line — the page
  bottoms out first, the clamp §8 already records — so the readout keeps naming the month that
  was asked for rather than being "corrected" to whatever the line points at. **(6)
  `env(safe-area-inset-*)` has been inert app-wide all along**: there is no `viewport-fit=cover`
  on the viewport meta, so every one of them resolves to `0px`, including the FAB cluster's
  documented geometry. Nothing is broken (the UA insets the layout viewport itself) but the
  spec's "does it clear the status bar in a PWA?" check passes vacuously, and that is now on the
  record rather than being re-discovered. Render-loop verified (§3.12; 390/900 × light/dark +
  reduced motion, mocked GViz, local Chart.js, stubbed Apps Script, **real Roboto Flex and
  Newsreader served from npm** — fonts.googleapis.com and cdnjs are now both proxy-blocked to
  curl as well as to Chromium — clock pinned to 2026-08-11 on an advancing offset): **202/202**,
  on a fixture carrying a deliberate **May gap**, a prior-year December, a future-dated September
  row and another user's row. **Nineteen negative controls run first**, and three of them are the
  point. The one restoring `scrollTo(0, 0)` to `switchView()` is the direct analogue of the
  control that fired nothing last pass. The one *adding* `localStorage` persistence of
  `viewMonth` is the only reason "every launch starts at the current month" means anything —
  there is no persistence to remove, so without it that check is a guaranteed false pass, and
  the **first version of that control was itself inert**: it read keys nothing ever wrote, so it
  persisted nothing and fired nothing. And the harness self-tests itself twice over — a
  synthetic section that throws mid-way must still report the checks it already ran, and a
  deliberate `throw` inside the app must surface as failed checks rather than silence.
  **Three controls initially found nothing**, each a finding about a probe: the spy-re-renders
  control was invisible because `calculateAndRender()`'s own `renderedKey` skip means the defect
  produces no ledger re-render on Logs — the probe now wraps `calculateAndRender` itself and
  asserts the scroll handler never enters the render path at all. **Six probes were wrong rather
  than the code**, each caught by a failure against correct behaviour: the fixture's future-dated
  September row makes its own Logs block, so probes assuming August is the newest month were
  reading September (which also surfaced finding 5 above); a `page.click()` sets Chromium's
  sequential-navigation start point and `blur()` does not reset it, so the keyboard-order probe
  was tabbing from inside the pane and never reached the masthead; scrolling to a position the
  page is already at fires no event, so the bottom-of-document probe was measuring a no-op; the
  gesture probes needed the pill *actually lifted* — a sparse month makes a short document, `--p`
  never passes 0.4, and the pill correctly refuses pointer events, so the probe was swiping at
  nothing, which is now an explicit precondition assertion rather than an assumption; Today's
  page can legitimately be too short to lift the pill at all, so its inert-pill probe dispatches
  the pointer sequence directly instead of depending on hit-testing; and a `--drag` read taken
  one frame after the move caught the value mid-transition, because a `.settling` class left by
  the previous check makes it interpolate rather than jump — polled now, the same fix #53 made
  for the counters. Front-end only — no Apps
  Script change, no redeploy.
- **2026-08-11 — Header removed, the month becomes the masthead (§3.3, §3.4):** the app
  header is deleted outright — 77px of sticky chrome on every tab, holding one word of
  branding and a `display:none` div, on a 390×844 viewport that is 9% of the screen spent on
  branding in a PWA the user opens from their own home screen. On Trends and Logs the month
  is now the pane's **masthead** (editorial serif at 31px, chevrons beside it, condensing to
  ~50px on scroll); tapping it opens a **ledger-list month picker** whose rows carry each
  month's spend and a proportional bar, so picking a month doubles as a small overview.
  Today gets no masthead — the hero already states the month. **Supersedes roadmap v3 Phase
  B's header chip, but not Phase B's "one contextual selector" decision** (§6). Four
  decisions worth keeping. **(1) The header was doing two invisible jobs** — providing the
  status-bar inset in standalone PWA mode, and being the sticky offset `logsScrollToYm()`
  subtracts. Deleting it without picking both up runs Today's content under the status bar
  and lands every Logs jump 77px off. The inset now lives on `.container`, with
  `body.has-masthead` dropping it where the masthead carries it instead — *never both*, and
  the suite asserts the 47px inset isn't applied twice. **(2) The picker lists months
  HOLDING DATA, not calendar months** — the spec said the latter, and it is the same error
  the ledger tail made: with a May gap in the fixture, the calendar reading puts a May row
  in the picker that scrolls nowhere on Logs. **(3) One month-change handler, and the
  archive shelf now uses it** — the shelf had been assigning `viewMonth` itself and getting
  away with it because the Trends branch re-rendered the chip anyway; a control that
  restored that parallel path broke Logs' lazy-load, its scroll and its no-unload rule all
  at once. **(4) The condensed bar is 50px, not the spec's 60px** — `.month-btn` keeps its
  44px floor, so the spec's own 8px padding would have made condensing pointless. Also
  worth recording: `monthTotals()` was already taken (Today and the hero trend read it), so
  the new helper is `pickerMonths()`; and the spec's `.rise` modifier already existed as
  `.sheet-rise`, shipped with the drill-in sheet three days earlier for the identical
  reason — a sheet not opened from the FAB must not bloom out of it. Render-loop verified
  (§3.12; 390/900 × light/dark + reduced motion, mocked GViz, local Chart.js, stubbed Apps
  Script, **real variable fonts served locally**, clock pinned to 2026-08-11 on an advancing
  offset): **231/231**, on a fixture carrying a deliberate May gap, a prior-year December, a
  future-dated September row and an income row. **Fourteen negative controls run first, and
  three of them are the point.** `stale_condensed` fired **nothing** — which was correct
  about the probe, not the code: the explicit `.condensed` reset in `switchView()` is only
  load-bearing on a round trip through **Today**, where `renderMasthead()` hides the bar
  before the scroll event lands and `syncMasthead()` then returns early on a hidden
  masthead; a Trends→Logs hop can never reach it, and that was the only case the suite
  tested. `calendar_months` and `parallel_path` reported "SECTION CRASHED" **and nothing
  else**, which exposed a harness bug: results were collected in a trailing `push(ck)`, so a
  section that threw discarded every check it had *already run correctly* — they now
  register the moment a bucket is created, and both controls report their real blast radius.
  `fab_origin` initially fired only a class-name check, so it now asserts the sheet's
  computed `transform-origin` sits on its own bottom edge rather than 38px below it. Two
  probes were wrong rather than the code: an advance-width comparison "proving" the display
  face was in use passes with the serif never loading (93.6px vs 93.0px for "August"), so it
  compares rendered pixels now; and the "equal gap" check was measuring box-to-box when the
  masthead's own 8px bottom padding is inside its background. Front-end only — no Apps
  Script change, no redeploy.
- **2026-08-10 (second pass) — Design fix spec: type, contrast, targets, quieter Today
  (§3.2–§3.14):** an owner-supplied design review, shipped as three code commits in the
  spec's own order plus a docs commit. **The find that matters is a real bug:** `body`
  pinned `font-variation-settings: 'wght' 400`, and in a variable font that axis beats
  `font-weight` — so ~35 classes had been rendering at regular whatever their CSS said,
  for the app's whole life. Unpinning it made everything render heavy, so 39 classes came
  down a step. ⚠️ **The bug is undetectable by computed style** — `getComputedStyle()
  .fontWeight` reports the declared value either way — which meant the obvious probe would
  have passed against the defect. Only *measured rendered advance width* catches it, and
  only with the real variable font loaded, which the render loop had to serve locally
  because Chromium can't reach fonts.googleapis.com through the proxy (curl can; the woff2
  is downloaded and routed). Also fixed: light-mode semantic colours reused from dark
  (2.9:1 / 4.1:1 → 5.4:1 / 5.7:1), heatmap day numbers at **2.01:1**, and five sub-44px
  targets. ⚠️ **The nav pill is part of the FAB cluster's derived geometry**, so 48→56px
  forced all four dependent numbers to be re-derived (§3.3) — the kind of coupling
  CLAUDE.md flags precisely because the spec that asked for the height change didn't
  mention it. Judgement changes in §3.2/§3.5–§3.9. Three decisions worth keeping.
  **(1) Good news is stated, not coloured** — five components were delivering the same
  green reassurance, which is what leaves nothing in reserve for the one that has
  something wrong to say; the alert states keep their colour and their solid fill, exactly
  the argument the pace strip already made in 2026-08-03. **(2) The heatmap clip is
  applied to the render, not to `days`** — the brief's literal patch mutates the array
  before the figures are computed, which drops future-dated expenses from the chip total
  while Today's tile still counts them, breaking the to-the-cent parity §3.7 requires; and
  a negative control turned up a second, worse consequence the review had missed — on a
  **closed** month `clipped` and `days` are the same reference, so `days.length = 0`
  empties both and the grid renders **zero cells**. **(3) A fourth `Budget` → `Income`
  site** (`#recur-type-income-btn`) was swept in, because renaming three of four surfaces
  is worse than renaming none. Render-loop verified (§3.12; 390/1280 × light/dark +
  reduced motion, mocked GViz, local Chart.js, stubbed Apps Script, real Roboto Flex, clock
  pinned to 2026-08-10 on an advancing offset): **178/178**, on a fixture carrying a
  deliberate future-dated expense, a week holding only future-dated income, and a
  zero-spend day inside a normal week. **Twelve negative controls run first — and this is
  the part worth reading.** Five of them fired *nothing at all*, which exposed a harness
  bug that had made every control a no-op: sections A–E called `openApp(b)` without passing
  the mutated source, so only the donut section ever saw a mutation. A suite that reported
  168/168 was, for eleven of twelve defects, testing the unmutated file. After the fix each
  control fired on its own probes and nothing else — and two of them then exposed **real
  gaps in the probes themselves**: nothing asserted the good-news chip was *neutral* (only
  that it cleared contrast, which a green chip also does), and the emoji scan never saw
  `txnRowHtml`'s icons because those rows only exist inside an open drill sheet. Both are
  now asserted. Three further harness findings: the donut identity check compared element
  *screenshots*, which composite the `.donut-center` overlay whose weight legitimately
  changed — it now compares the **canvas buffer**, which is the ring's own paint and a
  stronger claim; `settleTransform` returned at the *initial* resting state because two
  reads of `scale(0.08)` look settled, so sheet measurements were taken on a closed
  overlay and reported 44px controls as 3.5px; and the `.week-total` contrast probe was
  reading the *first* week row, which the new empty-week state renders in neutral ink, so
  it never tested the expense red at all. Two expectations were wrong rather than the code:
  the forecast carries the app's own `~` approximate prefix, and dark mode's week total
  lands at 5.1:1 against a spec spot-value measured in light. **The donut is asserted
  pixel-identical to `e08da4f`.** Front-end only — no Apps Script change, no redeploy.
- **2026-08-10 — Trends: donut and spending patterns swapped (§3.7):** owner request, one
  markup move — `#category-card` and `#spending-patterns` changed places inside
  `#trends-view`, so the month's category breakdown now sits directly under the archive
  card slot and the calendar grid follows it. No render function, chart config, scale or
  figure was touched; both blocks are rendered by their own functions into their own
  containers, so neither cares about its position. **The swap surfaced a latent spacing
  bug:** `#spending-patterns` carried no `margin-bottom`, which had been invisible only
  because `#category-card`'s own 12px sat immediately beneath it — after the swap the
  patterns card would have butted flush into the cumulative card, so it takes the same
  12px every other Trends block uses (asserted at both widths, live month and closed
  month). Render-loop verified (§3.12; 390/900 × light/dark + reduced-motion, mocked GViz,
  local Chart.js, stubbed Apps Script, clock pinned to 2026-08-18 on an advancing offset):
  **135/135** — DOM order, *painted* order by page offset (a DOM check alone wouldn't
  catch a CSS reorder), donut pixels read back to prove the ring still paints in its new
  slot, centre total and the six breakdown rows intact, the patterns chip still reading
  `Aug 2026 • 18 days • RM 805.00 • Avg RM 44.72` (the elapsed-days divisor that must match
  Today's Average Daily), 13 future days still dashed, the category drill-in still opening
  from the moved card, order and gaps holding on a closed month, and
  `scrollWidth == clientWidth` after repeated tab flips. **Two negative controls run
  first:** serving the old order fired the two order probes, both paint-position probes
  and both gap probes — and nothing else, which is the correct blast radius for a pure
  reorder; deleting the new margin rule fired the patterns → cumulative gap probe alone.
  Two harness fixes along the way, both wrong expectations rather than code bugs: the chip
  prints `Aug 2026`, not `August 2026`, and the drill overlay's open class is `open`, not
  `active` — the latter had been "passing" against a *closed* sheet whose title still read
  correctly from its last open, the same stale-overlay trap §8 already records.
- **2026-08-09 — Logs: current month by default, older months on demand (§3.6):** Logs
  opened on the whole history two months at a time, auto-appending as a sentinel scrolled
  into view. It now opens on **one month** and grows only when the reader asks, from an
  `Earlier months — show June` tail at the foot of the ledger; at the end that tail becomes
  `Nothing logged before March.` The IntersectionObserver and `#logs-sentinel` are deleted.
  **This supersedes roadmap v3 decision 2 and Phase B step 3** — recorded in §6 as well, so
  the old roadmap can't quietly reinstate the previous behaviour. Three decisions worth
  keeping. **(1) The scope counts months HOLDING DATA, not calendar months back** — the
  brief specified the latter, and it is wrong in the presence of a gap: with data in August
  and June but nothing in July, a calendar count makes the tail read `show July` and
  tapping it reveals nothing. Counting data months means the tail can only ever name a
  month it will actually show. **(2) Append, never swap, and never shrink** — the scope is
  module state clamped once inside the renderer, so a `dataStamp` bump, an optimistic
  write or a tab round-trip can't collapse the ledger, and stepping the chip *forward*
  only scrolls. **(3) The entrance is scoped to the revealed block and lasts exactly one
  render** — `_logsAppendedYm` tags the new month, and the renderer clears it immediately,
  so an append reads as growth while a later re-render replays nothing. `--tail-dash` is
  its own token because `--outline-variant` is pixel-identical to `--surface-container` in
  dark mode, exactly where the dashes must read as an edge. Render-loop verified (§3.12;
  390/900 × light/dark + reduced-motion, mocked GViz, local Chart.js, clock pinned to
  2026-08-18 on an advancing offset): **131/131**, on a fixture with a deliberate **April
  gap** — the tail walks Aug → Jul → Jun → May → **March**, skipping April, and the
  boundary week still renders as `Jul 27 – 31` under July and `Aug 1 – 2` under August. Also
  asserted: the entrance plays on the new block and not on the ones already up, `.settled`
  doesn't suppress a later append, a day column inside an *appended* month still opens the
  day sheet, the chip loads an unloaded month and scrolls to it while stepping forward
  unloads nothing, export still names the chip's month, and `scrollWidth == clientWidth`
  after every month is loaded. **Six negative controls run first** (default of two months,
  scope reset per render, entrance not scoped, a calendar-months tail, no end note, no
  scroll on append) — each fired on its own probes and nothing else. **Two harness
  findings:** the "scrolled under the sticky header" assertion failed against correct code
  because the *last* month can never reach the top — the document bottoms out first, so the
  probe now accepts a maxed scroll and only demands exact alignment for a month with
  content below it; and a scrollY-delta check for "the append scrolled" proved nothing,
  because **Playwright scrolls an element into view before clicking it** — the delta was
  the harness's own. It was removed rather than left as decoration.
- **2026-08-09 — Trends: tap a category to drill into its transactions (§3.7, §3.14):**
  the donut's breakdown rows became real `<button>`s that open a category's month
  transactions, highest first, and the day sheet was generalized into **one drill-in sheet
  with two callers** (`#day-overlay` → `#drill-overlay`, `drillState` + `drillContent()`;
  `openDaySheet(iso)` and `openCategorySheet(cat)` are the wrappers). Arc taps open the
  same sheet via the donut's `onClick`. **The brief was written against the pre-donut pie**
  — it specified hit-boxes hung off `pieLabelsPlugin`'s per-callout bookkeeping, and that
  plugin was deleted five days earlier when the pie became a segmented donut with a DOM
  legend. The intent transferred exactly: the callouts were the tap target *because* a
  small slice needs a forgiving one, and the breakdown list is their successor and a
  better target still (full card width, ≥44px, versus a few degrees of arc for a 0.1%
  category). So the list carries the primary tap and the arc keeps the secondary one, which
  is what the brief asked for with the two paths swapped in priority. Three decisions worth
  keeping: **generalize rather than add a second sheet** — the brief's step 1 called this
  out before the code was read, and it's the difference between one interaction language
  and two; **the open-sheet re-render moved to the end of `calculateAndRender()`** from
  inside `renderLogsLedger()`, because either view can now be the one behind the sheet; and
  **`txnsForCategory()` reuses `_expenseRowsFor()`** rather than re-deriving a month
  filter, so the ring and its drill-in can't disagree about membership. Render-loop
  verified (§3.12; 390/900 × light/dark + reduced-motion, mocked GViz, local Chart.js,
  stubbed Apps Script, clock pinned to 2026-08-18 on an advancing offset): **228/228**,
  including a dataset whose shares print exactly (40/25/20/11/3.0/0.9/0.1% of RM 1,000.00),
  every row measured ≥44px and full-width, arc taps driven from **Chart.js's own arc
  geometry** at each segment's mid-angle, a tap in the ring's hole opening nothing, the
  month chip scoping the sheet to July while August sat behind it, an edit and a delete
  round-tripping through the txn modal, a **real `reconcileFromServer()`** updating an open
  sheet, the Logs day sheet still working after the generalization, and
  `scrollWidth == clientWidth` with the sheet open and across repeated tab flips. The ring
  itself is asserted **pixel-identical to the pre-change file** (screenshot compare against
  `git show HEAD:index.html`, served side by side). **Six negative controls run first:**
  changing `spacing` 6 → 14 fired the pixel-identity probe (and nothing else, correctly);
  turning the rows back into `<div>`s fired the keyboard checks while the mouse path kept
  working — which is exactly the case a real `<button>` buys; shrinking the row to its
  content fired the width probe; scoping to the live month fired the July checks; dropping
  the sort fired the ordering checks; removing the re-render call fired the stale-sheet
  checks. **Three harness bugs the controls exposed, all of which had shipped a false
  pass:** the arc-tap probe asserted only the sheet's *title*, which a closed sheet still
  shows from its last render — it now asserts the overlay is open first; the arc click was
  computed from hand-derived angles and, at 390px, clicked a point below the fold that
  landed on a different element (`mouse.click` takes viewport coordinates and does not
  scroll); and the "sorted highest first" check passed against a dataset that was already
  in amount order in the sheet, so the sort assertion proved nothing until the fixture was
  deliberately shuffled. A fourth non-bug worth recording: the first attempt at "an open
  sheet follows a background write" pushed a row straight into `allRows`, which the
  reconcile then dropped — **correctly**, since an untracked row isn't a pending write. The
  check now drives a real `reconcileFromServer()` against a mock that gained a row, which
  is the actual scenario.

- **2026-08-08 (second pass) — Logs: day columns, accordion removed (§3.6):** the same-day
  day-segments pass below was superseded by an owner brief that took the idea further.
  Two changes. **(1) The accordion is gone.** The week header is informational only —
  no chevron, no press state, no `cursor: pointer`, no `aria-expanded`, no inline
  transaction list; `toggleWeek`, `expandedWeeks`, `logsSeeded`, `weekBodyHtml` and
  `bindTxnRowClicks` all deleted. **Losing the week-level list is a deliberate,
  owner-accepted trade** and is recorded in §3.6 so a later phase doesn't quietly restore
  it; `txnRowHtml()` survives as its own function so the possible future week-scoped sheet
  reuses it. **(2) Horizontal segments became fixed-width vertical columns.** This is the
  correction the first pass needed: encoding spend in segment *width* meant a quiet day
  shrank to a 14px sliver — and the segment is the **only route to that day's
  transactions**, so the encoding was actively fighting the tap target. Moving the
  magnitude to *height* frees width to be constant, which also makes a 2-day boundary week
  line up with a 7-day week down the page (columns are `flex: 0 0` a seventh of the track
  and never grown; short weeks render fewer, left-aligned, unstretched). One thing the
  brief didn't call and the render loop did: at 900px a seventh of the track is ~200px, so
  a 48px-tall column read as a **slab** — `max-width: 64px` keeps it column-shaped and just
  left-aligns the row past the cap. Weekday letters are single characters and
  `aria-hidden`, since the cell's `aria-label` already names the day. Everything about the
  day sheet is unchanged from the first pass. Render-loop verified (§3.12; same harness,
  clock pinned to 2026-08-18 on an advancing offset): **185/185**, including hand-computed
  height shares (12/84 → 14.29%, 42/84 → 50%, 84/84 → 100%) checked against *painted*
  pixel heights, an edit rescaling the week so the previously-tallest column drops to
  33.6px, one column width asserted across the entire page, clicks at the top of an empty
  column and on the weekday label both opening the sheet, and a tap on the week header
  provably changing nothing. **Five negative controls run first:** letting columns
  flex-grow fired 5 checks, shrinking the cell to the bar fired 12, making the header
  merely *look* interactive fired the cursor probe, re-adding `aria-expanded` fired 2, and
  removing the zero-day stub floor fired 3.
- **2026-08-08 — Logs: day segments + day drill-in (§3.6) — superseded the same day by the
  entry above, kept for the clipping rationale:** the week row's one aggregate
  spend bar became **seven** (Mon–Sun, clipped) tappable day segments, and a **day
  drill-in sheet** now lists a tapped day's transactions. Three decisions worth keeping.
  **(1) Clipping splits a boundary week across both months, it doesn't move it.** The
  brief locks "the week holding the 1st starts at the 1st" *and* "the week holding the
  last day ends there"; both can only be true at once if a straddling week renders under
  each month, clipped each time — keeping it single-homed under its Monday's month would
  make days 1–3 of the next month appear nowhere. That in turn forced the bucket key off
  the bare Monday (which no longer identifies a row) onto the **clipped start date**,
  which is unique per week per month and self-describing; `weekMondayIso()` fell out as
  dead code. **(2) The segments had to leave the `.week-head` button** — a button can't
  nest in a button, and the segments need their own click target; the head's
  `padding-bottom` dropped to 4px to pay for the 44px-tall segment row. **(3) The day
  sheet closes before the txn modal opens**, following `openManualFromCapture()`:
  `trapModalFocus` holds exactly one trap, so stacking would clobber the return-focus
  chain — the same constraint that made the recurring sheet two panes rather than two
  overlays. Two smaller calls: a new **`.sheet-rise`** modifier overrides `.align-bottom`'s
  FAB-anchored `transform-origin` (the trigger is a segment mid-page, not the FAB), and
  `txnRowHtml()` was extracted from `weekBodyHtml()` so the ledger and the sheet can't
  drift. **Known trade-off, accepted:** segment widths scale to the week's own busiest
  day, so bars no longer compare across weeks the way the old shared-`scaleMax` bar did —
  a shared scale would have crushed a quiet week's segments below a tappable size, and the
  week-total figure still carries cross-week magnitude. Render-loop verified (§3.12;
  390/900 × light/dark + reduced-motion, mocked GViz for both tabs, local Chart.js,
  stubbed Apps Script, clock pinned to 2026-08-18 on an advancing offset): **157/157**,
  including hand-computed grow shares to four decimals (12/84, 42/84, 84/84, 21/84),
  measured widths proving the encoding is strictly monotone in spend, the boundary week
  appearing as `Jul 27 – 31` (RM 73.00, Aug 1 *not* pulled in) and `Aug 1 – 2` (RM 40.00),
  an assertion that no segment belongs to another month, an edit rescaling a whole week
  (max day moving 84 → 120) and a delete flipping a day to `.zero`, and an open sheet
  following a background re-render. **The methodological point is the controls, not the
  count:** six mutations were served through a `MUTATE` hook and each new probe was
  *watched to fail* before being trusted — un-clipping the weeks fired 25 checks, removing
  the 44px height fired 5, removing the 14px floor fired 8 (and made zero days
  unclickable), killing the paint step fired 3. That last one also exposed a **weak probe
  written in the same session**: "widest segment is the max-spend day" used `Math.max`,
  which a row of *equal* widths passes happily; it now asserts strict inequality.
- **2026-08-04 — Single-category donut closes into a clean ring (§3.7):** with one category
  the ring is a single full-circle arc, so `borderRadius:12` rounded two caps that meet at
  12 o'clock and pinched them into a visible beak (owner-reported, RM 289.10 / Food & Dining
  month). `borderRadius` is now guarded to `0` alongside the `spacing` guard that was already
  there — a full circle has no ends to round. **The lesson is in the test, not the fix:** the
  ring-continuity probe written for exactly this case walked the ring's *mid-band* and
  **passed against the unfixed code**, because the notch bites in from the inner edge while
  the caps still touch at mid-radius. Sampling three radii (inner/mid/outer) the whole way
  round reports 14 transparent pixels clustered at 0–358°, precisely at 12 o'clock. Verified
  as a negative control before the fix went back in. 393/393 (up from 363; six new
  single-category checks).
- **2026-08-04 — Trends: segmented donut + category breakdown (§3.7):** the "Expenses by
  Category" pie became a **segmented donut** (gapped, round-capped arcs via `spacing` +
  `borderRadius`) with the month's expense total in the hole and a **ranked category list**
  below — icon, name, `X% of total`, amount, and a share bar in the category's own colour.
  Built from a reference the owner supplied. Scope calls: **expenses only** (no striped
  remaining-budget segment — the ring stays 100% of what was spent), **no `vs last month`
  chip** per row (noise on sparse months, and the quiet ledger voice doesn't want a second
  delta next to every figure), and the on-canvas labels **dropped outright** rather than
  half-kept. Net −120 lines: `pieLabelsPlugin` and `variableRadiusPlugin` are both gone.
  Three decisions worth keeping: **labels belong in DOM once DOM can hold them** — the
  callouts needed hand-rolled angle routing, vertical de-collision and on-canvas clamping to
  say what a list says for free, and the list has room for share-of-total besides;
  **`variableRadius` was a correctness fix, not taste** — it scaled `outerRadius` only, so
  with a `cutout` it would have varied *ring thickness* per segment; and the **centre total
  is an HTML overlay**, not canvas text, so it inherits the UI font, the theme tokens and
  `.counter-val` inertia (its trap: the render wipes `#donut-container.innerHTML`, so the
  overlay must be re-injected in that same statement). Also retired a latent bug —
  `borderColor: 'var(--surface-container-low)'` never painted anything, because canvas 2D
  can't resolve a CSS custom property. `.charts-row` was deleted and the two chart cards are
  now full-width blocks, since a tall donut card paired against the short cumulative card
  left the latter a large dead area. Render-loop verified (§3.12; 390/900 × light/dark +
  reduced-motion, mocked GViz, local Chart.js, stubbed Apps Script, clock pinned to
  2026-08-18): **363/363**, including hand-computed shares to the printed digit
  (36/24/18/12/6.0/3.0/1.5% of RM 3,350.00), bar widths measured against those shares, the
  empty-month and single-category paths, and DOM order. **Two harness lessons, both of which
  first shipped a false pass:** a *frozen* `Date.now()` also freezes Chart.js's animator, so
  every arc sat at circumference 0 and the ring rendered blank while all the config-level
  assertions passed — the clock stub now advances from the pinned date; and the suite now
  reads **canvas pixels back** (`getImageData`) to prove the ring painted, sampling each
  segment's *mid-angle*, since 12 o'clock is a seam once `spacing` is on.
- **2026-08-03 — Pace card status strip (§3.5):** the budget-pace card's inline verdict
  line became a full-bleed band at the card's bottom edge, styled after a reference the
  owner supplied (a card closing on a solid alert strip). Copy is owner-specified and
  carries **no ringgit figure** — the verdict is qualitative, the bars are where magnitude
  lives; that drops the `paceDiff` math the old line used. **The math underneath did not
  change**: the same `over = forecast > totalIncome` boolean that flips the Spent bar
  sienna→red drives the strip, so the two surfaces are incapable of disagreeing — worth
  reusing rather than re-deriving "overspending relative to days elapsed" a second time.
  Two decisions worth keeping: **only overspending gets a solid fill** (on-track is a
  quiet `--wash-income` tint with green text), since a permanently-coloured band would
  make the alert state unreadable *as* an alert and would put semantic colour to
  decorative use against §3.2; and the new **`--strip-over` token is deeper than
  `--semantic-expense`** (#D93A31 / #C0392F) because the semantic token is tuned for text
  *on* a surface and only clears ~4.0:1 under white — reusing it would have quietly
  shipped sub-4.5:1 body text. Full-bleed is negative margins reaching `.card`'s padding
  edge inside its 1px border, with the bottom corners mirroring the card's asymmetric
  radius, so `.card` needed no `overflow` change or restructuring. **No strip when no
  budget is set** — "within budget" with no budget is a false statement, and the card
  already returns early with its own caption there. Render-loop verified (§3.12; 390/900 ×
  light/dark + reduced-motion, mocked GViz, stubbed Chart.js, clock pinned to 2026-08-18):
  **121/121**, including strip geometry measured against the card box (full-bleed to the
  pixel, flush bottom), computed white-on-fill contrast ≥ 4.5:1 asserted directly rather
  than eyeballed, both copy strings exact, the Spent bar agreeing with the strip in both
  states, the glance line above verified *unchanged*, the strip flipping to overspending
  through an optimistic local add, and `scrollWidth == clientWidth` across tab flips.
- **2026-08-02 — Today: two tiles + a detail panel (§3.5):** the 2×2 quadrant collapsed to
  **two headline tiles**; `Average Daily` + `Forecast` moved into `#today-detail`, one tap
  under the **Expenses tile**, which became a real `<button>` (`aria-expanded`,
  `aria-controls`, rotating chevron). Their `vs last mo.` chips were **removed** — a
  percentage against a projection is noise — retiring the 2026-07-24 chip work along with
  `daysInLastMonth`/`lastAvgDaily`/`avgChangePct`/`fcChangePct` and the `nth-child(3)/(4)`
  entrance delays. Two decisions worth keeping: an **inline panel over a modal** (dimming
  the screen for two read-only figures is disproportionate, and a modal would hide the pace
  bar that gives them meaning), and **the pace bar carries the overspend warning** — it
  already prints `Overspending — off track by RM X` from the same `forecast > income`
  boolean, so the `.overspend` red moving inside the panel costs nothing at a glance. The
  panel is the **last child of the `.tile-row` grid** spanning `1 / -1` (inherits the 12px
  gap and the row's bottom margin; `:empty` collapses it closed) rather than a sibling
  needing its own spacing rules. `todayDetailHtml()` computes from `monthTotals` so the
  click handler needn't re-enter `calculateAndRender()`; `todayDetailOpen` is module state
  so the panel survives optimistic re-renders. **The one real trap:** `animateCounters()`
  is a DOM sweep that runs only at the end of `calculateAndRender()`, so handler-injected
  markup must call it or the figures sit at `RM 0.00` forever — asserted directly rather
  than left to a screenshot. Render-loop verified (§3.12; 390/900 × light/dark +
  reduced-motion): **78/78**, with 34 checks added covering panel open/close, keyboard
  Enter/Space (it must be a real button), state surviving a re-render, no chips inside the
  panel, overspend red plus the pace-bar verdict together, the shared `.neutral-block` CSS
  leaving Trends' closed-month tiles intact, and no horizontal overflow with the panel open.
- **2026-08-02 — Recurring save errors report their real cause (PR #53):** saving a series
  routed every failure — network, HTTP, and Apps Script `{success:false, error}` alike —
  through one generic `Couldn't reach the sheet. Try again.` toast. That copy is a lie for
  the most likely failure of all: a deployment that hasn't been updated returns
  `unknown action`, and the toast named the network instead. `saveRecurringSeries()` now
  surfaces the server's own reason (`Couldn't save: <reason>`), keeping the offline copy
  only for genuine transport failures. Two-line change; the value is diagnostic, since this
  is the error a user hits *before* anything else works. Verified with a 6-check run
  (§3.12) driving all three failure paths plus success. **Also a harness finding:** three
  Today-figure assertions were quietly timing-dependent — they read the counters mid-
  animation and reported false failures under load. `verify.mjs` now polls until the value
  settles rather than sampling once, taking the suite from 44 to 50 checks with no flakes.
- **2026-08-02 — Phase G built (§3.13):** recurring series shipped. `Code.gs` gained one
  `recurring` action (three ops against a self-creating `Recurring` tab) and a duplicate
  guard in `handleAdd`; `index.html` gained the materializer, the pure `recurrenceDates()`
  enumerator, the Logs-toolbar sheet, and the `Source` read that drives the "Auto" marker
  and the `_insightRecurring` exclusion. Two bugs were caught and fixed **during** the
  build, both from conflating two different limits: the enumeration guard had been set to
  the 60-row write cap, so a daily series older than 60 days would forever re-propose only
  its oldest (already-written) occurrences and never reach today — split into
  `RECURRENCE_MAX_ITER` (loop bound) vs `RECURRING_MAX_PER_RUN` (write cap); and
  `nextOccurrence()` inherited the same flaw by enumerating from the start date, so it was
  rewritten to compute analytically in O(1). Render-loop verified (§3.12; 390/900 ×
  light/dark + reduced-motion, mocked GViz for **both** tabs, stubbed Chart.js, stubbed
  Apps Script, clock pinned to 2026-08-02): 44/44 — 9 occurrences generated with derived
  UIDs, month-end clamp exact (`Jan 31 → Feb 28 → Mar 31 → Apr 30 → May 31 → Jun 30 → Jul
  31`), zero future-dated rows, paused/future-start/other-user series generating nothing,
  a second run writing nothing at all, hand-computed Today figures unchanged
  (budget left RM 5,552.10, avg daily 623.95, forecast 19,342.45), Escape stepping back one
  level at a time, focus returning to the toolbar trigger, a missing `Recurring` tab
  loading cleanly, and `scrollWidth == clientWidth` across repeated tab flips.
- **2026-08-02 — Phase G design pass (§6), no code:** the "Recurring expenses" candidate
  became a specified phase. Decisions: client-side materialization on app open (over an
  Apps Script time trigger — Phase F deleted every line of trigger code, and `Code.gs` has
  no row-reading primitive to answer "did I already write this month's rent?", whereas
  `saveReviewAll()` is already a working N-row optimistic batch writer); a `Recurring` tab
  for definitions (over localStorage, which would be device-local and lose series on a
  reinstall); silent auto-add with a toast (the amount was pre-approved when the series was
  created); income included alongside expenses. Derived per-occurrence UIDs
  (`rc-<seriesId>-<YYYYMMDD>`) plus a `handleAdd` duplicate guard make generation
  idempotent across devices. **The only entry in this list that shipped no code** — recorded
  because the decisions are load-bearing for the build that follows.
- **2026-07-23 → 2026-07-24 — The Today quadrant, and its chips (§3.5) — LARGELY REVERTED
  2026-08-02.** Three entries compressed into one, because the work they describe is gone.
  `Average Daily` + `Forecast` moved from Trends to Today to complete a 2×2 tile quadrant
  (Trends keeping `Average Daily` + `Total Spent` for closed months only); the two new tiles
  were then given `▲/▼ X% vs last mo.` chips to match the other two, and a `--wash-neutral`
  token aligned their borders with the rest of the quadrant. **2026-08-02 collapsed the
  quadrant to two headline tiles and deleted the chips** — a percentage against a projection is
  noise — retiring `lastAvgDaily`/`avgChangePct`/`fcChangePct` with them. What survived is in
  §3.5 and §3.7: the tiles live in Today's tap-to-open detail panel, Trends hides
  `#trends-metrics` on the live month, and `--wash-neutral` is still the shared tile wash. One
  fix from the same pass is load-bearing and did survive — the **spending-patterns chip divides
  by elapsed days**, not `daysInMonth`, so it matches Today's `Average Daily` to the cent; the
  Weekly/Monthly toggle was removed at the same time.
- **2026-07-11 — UX refresh + motion/physics passes** (PRs #6, #7, #11–#13): hero card,
  tile system, pie rework, staggered entrances, no-replay renders, spring easing,
  shared-axis slide, mobile overflow/zoom bugfix.
- **2026-07-12 — Insights strip** (deterministic engine + LLM phrasing, PRs #14,
  #16–#18), modal a11y polish, no-keyboard-on-open (PR #20).
- **2026-07-15 — Independent web app built:** PWA shell, capture bar, push bell,
  `apps-script/Code.gs` backend; insights re-pointed off Railway.
- **2026-07-16 — Phase 0 setup verified live** (PRs #22/#23): Firebase
  `project-alfred-f7575`, push digest received on Android, nightly trigger set.
  **Telegram bot decommissioned** + Railway/webhook teardown; repo decoupled.
  **One-handed ergonomics pass:** capture bar → FAB-opened sheet with container
  transform, docked-FAB era, photo-attach-then-comment flow, refresh icon removed.
- **2026-07-18 — Restructure (v2) Phases 2–5:** three-tab nav + detached FAB (PR #33),
  Today composition (PR #34), Logs week index, Trends month navigation. **Optimistic
  writes.** ⚠️ The v2-era docked-FAB geometry and two-tab slider math are superseded by
  §3.3.
- **2026-07-18 — Refinement (v3) Phases A–D:** A visual polish batch (neutral FAB
  shadow, nav spring + text pop, Logs simplification — week chip / month nets /
  8-week-average marker removed, 14-day Today capture strip removed); B single
  contextual month selector (header dropdown deleted, export → Logs toolbar, bell
  hidden); C Today budget-pace card merge + Trends overspend glow (Day-verdict line
  removed, Trends live pace bar removed); D budget rename sweep (labels only).
- **2026-07-19 — Backlog refresh + this consolidation:** candidate features refined
  (§6); roadmap files deleted, CLAUDE.md rewritten as the single reference.
- **2026-07-19 — Phase E (Subscriptions + category merge):** added `"Subscriptions"`
  (`#6554C0`) to `EXPENSE_CATEGORIES`/`CAT_COLORS`/`CAT_ICONS` in **both** `index.html` and
  `Code.gs`, and merged `"Shopping"` + `"Groceries"` into `"Shopping & Groceries"` (`#2684FF`).
  Both hexes are the freed-up colours of the two retired categories, so the six-checks-validated
  seven-colour palette is unchanged. One `EXTRACT_PROMPT` example steers recurring bills
  ("netflix RM17") to Subscriptions. A one-off `migrateShoppingGroceriesCategory()` helper
  (still in `Code.gs`, same pattern as `backfillUIDs()`) relabelled existing rows; **the owner
  ran it and redeployed**, so parser and dropdown agree.
- **2026-07-19 — Phase F (push digest retirement):** the third pillar is gone — bell, service
  worker, Firebase/FCM client, `PushSubs` helpers, the three push actions and all digest code,
  deleted from both files. `manifest.json` stays and now carries the whole PWA shell. The
  digest *math* survives as the Today glance line (`computeTodayGlance`), so "one source of
  truth, reusable across surfaces" outlived the surface it was built for. Current state in
  §3.11; the two unticked owner steps are in §6's checklist. **The retirement was driven by
  real-usage evidence, not cost** — that is the part worth keeping.
- **2026-07-21 — Today/Trends polish (PR #47) and the "Spending patterns" card (§6 candidate
  #3):** two entries from the same day, compressed. The **pace card** moved from a single
  continuous pill to the **two-bar, state-colour design** that is still current (§3.5): a Spent
  row and a Month row, a shared dotted "Today" reference line, and the Spent fill flipping
  sienna → red only once it crosses that line — driven by the same `over` boolean as the
  verdict, so bar and text can never disagree. The hero took its heavier 1.5px border to read
  as the page's focal point. (The fourth item, a `min-height` evening out the header, died with
  the header on 2026-08-11.) The **capture heatmap became "Spending patterns"**: retinted from
  capture-count to **spend-per-day**, which is why §3.2's visual-grammar rule was amended —
  **the sienna ramp was kept rather than the references' red**, so semantic red stays reserved
  for expense figures (§8, "steal patterns, not palettes"). Ramp became self-scaling over the
  window's busiest non-future day, and the grid went Monday-first. The Weekly/Monthly toggle
  shipped here and was removed two days later; everything else is current in §3.7.
