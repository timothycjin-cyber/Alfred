# CLAUDE.md

*Last updated: 2026-08-04 — **Trends: segmented donut + category breakdown (§3.7).** The
"Expenses by Category" pie is now a **segmented donut** (`cutout:'70%'`, `spacing:6`,
`borderRadius:12`) with the month's expense total in the hole as an **HTML overlay**
(`.donut-center`, a `.counter-val`), and a **ranked category list** below it — icon, name,
`X% of total`, amount, and a share bar in the category's own colour, scaled to share of
total. **Expenses only** (no remaining-budget segment) and **no `vs last month` chip** per
row. `pieLabelsPlugin` and `variableRadiusPlugin` are **deleted** — nothing is drawn on that
canvas but arcs, and `Chart.register()` now takes `heroBaselinePlugin` alone. ⚠️
`variableRadius` scaled `outerRadius` only, so keeping it would have varied **ring thickness**
per segment. ⚠️ The render **wipes `#donut-container.innerHTML`**, so the centre overlay is
re-injected in that same statement. `.charts-row` is **gone** — the donut and cumulative
cards are separate full-width blocks (`#category-card` / `#cumulative-card`). Render-loop
verified 363/363. Two harness lessons that first shipped a false pass: a frozen `Date.now()`
freezes **Chart.js's animator** (arcs stay at circumference 0 — blank ring, green
assertions), and a chart's config being right is no evidence it **painted** — read pixels
back, sampling a segment's mid-angle, since 12 o'clock is a seam once `spacing` is on.
Prior banner (2026-08-03) — **Pace card: status strip (§3.5).** The budget-pace card's
inline verdict line (`Overspending — off track by RM X`) is now a **status strip banding the
card's bottom edge** (`.income-bar-status`): an info glyph and one plain-language sentence —
`Your spending is outpacing the budget` / `Your spending is on track and within budget` —
**with no ringgit figure** (the strip states the verdict; the bars carry the magnitude). The
`over` boolean is unchanged (`forecast > income` ≡ `usedPct > monthPct`), so strip and Spent
bar can't disagree. **Only overspending takes a solid fill** — on-track stays a quiet
`--wash-income` tint, because an alert reads as an alert only if it isn't always on. New
`--strip-over` token is **deeper than `--semantic-expense`** so white text clears 4.5:1
(the semantic token clears ~4.0:1 and keeps its own job on figures/bars). Full-bleed via
negative margins to `.card`'s padding edge — `.card` itself is untouched. **No strip in the
no-budget state.** Render-loop verified 121/121. Prior banner (2026-08-02) — **Today: two
tiles + a tap-to-open detail panel (§3.5).** The
2×2 quadrant collapsed to **two headline tiles** (Budget · Expenses); `Average Daily` and
`Forecast` moved into `#today-detail`, disclosed by tapping the **Expenses tile** (now a
real `<button>`) — they're follow-up detail, and holding two of four tile slots overstated
them. Their **`vs last mo.` chips are gone** (a percentage against a projection is noise),
which retires the 2026-07-24 chip work and its `lastAvgDaily`/`avgChangePct`/`fcChangePct`
math. The panel is the **last child of the tile grid** spanning both columns, so it inherits
the grid gap; `:empty` collapses it when closed. ⚠️ **`animateCounters()` only sweeps at the
end of `calculateAndRender()`** — markup injected from the click handler must be swept
explicitly or the figures stay at `RM 0.00`. Overspend red now reads *inside* the panel, so
**the at-a-glance warning is the pace bar's verdict line** (same `forecast > income`
boolean — now the status strip above). Render-loop verified 78/78. Prior banner (same day) —
**Phase G shipped (§3.13).**
Recurring series are live in code:
define rent, a subscription or a salary once and Alfred writes the entries itself. A series
is a definition in a new **`Recurring` tab**; its occurrences are ordinary `Sheet1` rows
written through the ordinary `add` action, so there is still exactly one row-writing path.
Materialization runs **client-side, after first paint, never awaited**, so a slow or absent
tab can't delay or break load. Idempotency is a **derived UID** per occurrence
(`rc-<seriesId>-<YYYYMMDD>`) plus a duplicate guard in `handleAdd` — two devices can't
double-write. **Nothing is ever written ahead of today** (every live figure divides by
*elapsed* days); "what's coming" is an unwritten `Next …` preview. Monthly **clamps to the
month's last day**. ⚠️ Two limits that look alike must stay separate — `RECURRENCE_MAX_ITER`
(loop bound, must reach today) vs `RECURRING_MAX_PER_RUN` (write cap); conflating them was a
real bug caught in build. **Apps Script is redeployed — the feature is live end to end.**
Render-loop verified 50/50 (44 from the build, plus a 6-check run added in #53 covering the
save-failure path). Prior banner (same day) — **Phase G
designed (§6).** The "Recurring expenses" candidate
was taken through its design pass and became a fully specified phase — **spec only, no code
yet.** All three open questions are answered: generation runs **client-side on app open**
(reusing `saveReviewAll()`'s batch writer and the optimistic-write stack — no time trigger,
no new endpoint for row writes), rows are materialized **up to today and never ahead**, and
series are **edited forward-only** with pause/delete from a sheet on the Logs page. Series
definitions live in a new **`Recurring` tab** in the same Sheet; the feature covers **income
as well as expenses** (a recurring salary populates the month's budget, since budget =
logged income). Idempotency is a **derived UID** per occurrence (`rc-<seriesId>-<YYYYMMDD>`)
plus a duplicate guard in `handleAdd`, so two devices can't double-write. The
no-future-rows rule is load-bearing, not taste: every live figure divides by *elapsed* days
(`avgDaily`, `forecast`, the pace bar, the patterns chip) and the grid dashes future cells,
so a pre-written future row corrupts all of them. Prior banner (2026-07-24) — **Today
quadrant chips (§3.5).** The `Average Daily` /
`Forecast` tiles gained the same `▲/▼ X% vs last mo.` chip as `Budget`/`Expenses`, so all
four quadrant tiles now carry the same three-line layout (label, value, trend chip).
Last month's comparison figure treats last month as closed: `lastAvgDaily = lastMonth.exp
÷ daysInLastMonth` (full month, matching the Trends closed-month tile), `lastForecast =
lastMonth.exp` (a closed month's forecast and actual are identical). Lower reads as good
news (`.good`/`.bad`) for both, same as the Expenses chip. Chip valence is independent of
the value's own `.overspend` color flip — verified an overspend scenario shows a red value
*and* a red "worse" chip simultaneously without conflict. Hand-computed the percentages
against a mocked dataset (▼73%/▼72%) to confirm exact parity with the on-screen chips.
Render-loop verified (390/900 × light/dark + reduced-motion, mocked GViz, stubbed
Chart.js): chip math, overspend + chip coexistence, no horizontal overflow, Trends
closed-month tiles untouched. Prior banner (same day) — **Today quadrant tile alignment
(§3.5).** The `Average Daily`/`Forecast` tiles now share the same `--outline-variant`
border and translucent-wash background treatment as `Budget`/`Expenses` (new
`--wash-neutral` token, same opacity pattern as `--wash-income`/`--wash-expense`, just
gray) — the 2026-07-21 `--outline` border bump was a workaround for `--outline-variant`
being pixel-identical to the old flat `--surface-container` fill in dark mode; the wash
tint sidesteps that collision instead of papering over it with a heavier border, so all
four Today tiles read as one family. Same class (`.tile-block.neutral-block`) also covers
Trends' closed-month tiles — verified those still show a visible border standalone
(light+dark). Render-loop verified (390/900 × light/dark + reduced-motion, mocked GViz,
stubbed Chart.js): quadrant border/background parity, overspend red still reads, Trends
closed-month tiles unaffected, no horizontal overflow. Prior banner (2026-07-23) —
**Today quadrant + Trends resequence (§3.5, §3.7).** Three
UI refinements: (1) the `Average Daily` + `Forecast` tiles **moved from Trends to Today**,
completing a **2×2 tile quadrant** below the hero (Budget · Expenses · Average Daily ·
Forecast); Today owns them for the live month (overspend turns both semantic-red), while
Trends keeps `Average Daily` + `Total Spent` **only for closed months** (hidden on the
live month). (2) the "Spending patterns" card **dropped its Weekly/Monthly toggle
(monthly-only)** and its chip **`Avg RM/day` now divides by elapsed (non-future) days** —
matching the Today `Average Daily` tile exactly (was dividing by full days-in-month; the
mismatch the owner flagged). (3) Trends **resequenced** to insight → spending patterns →
pie (Expenses by Category) → cumulative spend → archive shelf. Render-loop verified
(390/900 × light/dark + reduced-motion, mocked GViz, stubbed Chart.js): quadrant geometry,
avg parity to the cent, monthly-only patterns, closed-month tiles reappear, DOM order, no
horizontal overflow. Earlier same-day banner (2026-07-21) — **"Spending patterns" card:**
the Trends capture heatmap was rebuilt tinting by **spend per day** (owner-confirmed
reframe away from capture-count), keeping the sienna intensity ramp so semantic red stays
reserved for expense figures (§3.2 rule amended), switched to **Monday-first**. Prior
banner — **Today/Trends UI polish pass (PR #47):**
the Today budget-pace card became a **two-bar, state-colour chart** (Spent vs Month rows,
dotted "Today" line, Spent flips sienna→red on crossing — §3.5); hero + Trends
`Average Daily`/`Forecast` tiles gained a heavier `--outline` border; the Trends overspend
treatment dropped its glow; "Average Daily Spend" → "Average Daily"; `.header-actions`
`min-height: 36px` evened the header height. Prior banner (2026-07-19): push
digest retired (Phase F) — `firebase-messaging-sw.js`, the bell, the Firebase/FCM client
+ Apps Script code, and the `push-subscribe`/`push-unsubscribe`/`run-digest-push`
actions all deleted; `manifest.json` stays (the PWA install shell); the digest *math*
lives on as the Today glance line (`computeTodayGlance`). Alfred is a two-pillar app:
effortless capture + pull-based visual analytics. Earlier roadmap files were
consolidated into §6 (2026-07-19); the phase narrative is compacted into §7 (history).
Code comments in `index.html` still reference roadmap phase names; §6–§7 keep those
names resolvable.*

---

## 0. Overview & product model

**Project Alfred** is a personal **budget tracker** web app — this repo. It captures
expenses in natural language or from receipt photos, tracks them against the month's
budget, and visualises spend. It is an installable PWA on GitHub Pages, with the shared
Google Sheet's own Apps Script as its entire backend — **fully serverless, no paid
hosting anywhere** (~$0/month; see §5).

**Product model (two pillars):** capture must be effortless (log an expense in seconds,
confirm-before-save), and analytics are pull-based and visual (trends, breakdowns,
insights). The nightly push digest — once the third pillar — was **retired by
real-usage evidence (Phase F, 2026-07-19)**; its *math* lives on as the Today glance
line (`computeTodayGlance`), so the "digest as one source of truth" idea survives on a
pull surface.

**Budget reframe (rename only):** the surfaces speak *budget*, but the data model is
untouched — rows keep `Type: Income`, `INCOME_CATEGORIES` keeps its names, and **a
month's budget = that month's logged income**. There is no stored budget number.
**No month carry-over, ever** — each month is a sealed page; net/budget-left never rolls
forward (an invariant, already true in code). Multiple *named* budgets are a recorded
future direction (§6 "Trips"); the rename keeps that path open.

**The former Telegram bot is decommissioned (2026-07-16).** This app replaced it
outright; its repo (`timothycjin-cyber/project-alfred`) is a historical record. Rows it
wrote (Source `telegram`/`telegram-image`) remain in the Sheet as valid data. Railway
project deleted, webhook removed — nothing of the old stack runs anywhere.
`apps-script/Code.gs` is the **single** extraction/validation implementation.

---

## 1. Shared Data Layer — Google Sheet

- **Sheet name:** Project_Alfred
- **Tab:** Sheet1
- **Sheet ID:** 19_C3gFlY7hDjGm87k3Uke63_Tgg6TQPl6xLiGZvuEis
- **Columns (in order, zero-indexed for GViz):**

| Index | Column | Notes |
|---|---|---|
| 0 | Date | Plain date in the cell; GViz reads it back as Date(YYYY,M,D) with **month 0-indexed** — dashboard JS adds +1 when formatting to YYYY-MM-DD. Known off-by-one bug source. |
| 1 | Amount (MYR) | Numeric |
| 2 | Category | String |
| 3 | Description | String |
| 4 | Source | `web` / `web-image` (capture sheet), `dashboard` (plain FAB add), `recurring` (written by a recurring series, §3.13), `telegram` / `telegram-image` (historical rows from the retired bot) |
| 5 | Type | Expense or Income |
| 6 | UID | Short unique id, e.g. mqx393vfm58v. Apps Script generates `Date.now().toString(36)` + random; rows from the retired bot are 12-char hex. Never assume a format — treat as opaque. |
| 7 | User | User id (integer stored as string; historically the Telegram chat_id — kept as the identity key). Written on every add/edit. Legacy rows backfilled via Find & Replace in col H. |

**Income Categories:** Salary, Freelance, Bonus, Investment, Side Income, Reimbursement, Other Income
**Expense Categories:** Food & Dining, Transport, Bills & Utilities, Shopping & Groceries, Subscriptions, Entertainment, Other

The **`Recurring` tab** holds recurring-series *definitions* (Phase G, §3.13) — never
ledger rows. Columns: `SeriesID` · `User` · `Type` · `Amount` · `Category` · `Description` ·
`Cadence` · `StartDate` · `EndDate` (reserved, no UI) · `Active` · `Created`. Created
automatically by `getRecurringSheet()` on first save, so there is no manual setup step;
read client-side via a second GViz query (`&sheet=Recurring`), which 404s until the tab
exists — `fetchRecurringSeries()` treats that as "no series", never an error.

The **`PushSubs` tab** (FCM push subscriptions) is retired with Phase F — Apps Script no
longer reads or creates it. The owner may delete the leftover tab manually (§6 Phase F
checklist); nothing in the code references it.

- Empty-User rows are legacy owner rows — the strict dashboard filter renders only exact
  matches, but keep backfilling col H until they're all done (some client-side math
  still tolerated the empty-string fallback historically).

---

## 2. Backend — Google Apps Script (`apps-script/Code.gs`)

The Sheet's own Apps Script, published as a Web App, is the entire backend. The in-repo
`apps-script/Code.gs` is the source of truth for its code.

- **Web App URL:** `https://script.google.com/macros/s/AKfycbzxRLfHCAbCspXIWSRt1xVAbLnNPlhiHHaWpTHGB23N1wkoMU74nHifMT9prU3rM4m6/exec`
- **Deployment:** Execute as: Me, Access: Anyone. Attached to the Sheet via Extensions → Apps Script.
- **Auth:** shared secret `key: "8891"` in every POST body (public in page source — fine; the allow-list guards the metered spend).
- **All requests POSTed as `text/plain`** so they stay CORS-"simple" (no preflight); Apps Script sends `Access-Control-Allow-Origin` automatically.
- ⚠️ **To update: Deploy → Manage deployments → Edit → new version. NEVER create a new deployment (different URL).** Don't redeploy unless changes were made.

**Actions routed by `doPost(e)`:**
- `add` / `edit` / `delete` — row writes; `handleAdd`/`handleEdit` write User col H; `handleAdd` honors a client-supplied `uid` (backward-compatible — older clients get a server UID). **Since Phase G `handleAdd` also refuses a `uid` it already holds** (`findRowByUID(uid) !== -1` → `{success:true, uid, duplicate:true}`, no append) — the sheet arbitrates recurring idempotency, because the client's own check can't see a row the GViz cache hasn't surfaced. Helpers: `findRowByUID()`, `generateUID()`, `backfillUIDs()`.
- `recurring` — **series definitions only, never ledger rows** (Phase G). One action, three ops via `data.op` (`add`/`edit`/`delete`) against the `Recurring` tab, mirroring the ledger trio. Helpers: `getRecurringSheet()` (creates the tab + header row if absent), `findRecurringRowById()`. Occurrences are written by the *client* through the ordinary `add` action, so there stays exactly one row-writing path in the system.
- `parse` — `{user, text | image_b64[, mime][, caption]}` → `{transactions:[…], dropped, note?}`. The extraction prompt (`EXTRACT_PROMPT`, array-return schema) + `validate_transactions()` port (fix-quietly/drop-loudly; 36 Node tests). **Extract only — never writes**; saving goes through the normal confirmed add path. Guarded by the `ALLOWED_USERS` Script Property + input size caps. A query object comes back as `note` for the capture UI.
- `insights` — LLM phrasing of client-computed facts (gpt-4o-mini, max_tokens 160, temp 0.6).

**Push digest — retired (Phase F, 2026-07-19).** The `push-subscribe` /
`push-unsubscribe` / `run-digest-push` actions, `sendDailyDigestPush()`, the FCM HTTP v1
code (SA JWT signing), and the `PushSubs`/digest helpers are all deleted from `Code.gs`.
Only `add`/`edit`/`delete`/`parse`/`insights` remain. Owner steps still pending: delete
the `sendDailyDigestPush` time trigger and the Firebase Script Properties (§6 Phase F).

**Script Properties:** `OPENAI_API_KEY`, `ALLOWED_USERS` (the `FIREBASE_SA_JSON` +
`FCM_PROJECT_ID` properties are unused after Phase F — owner can drop them).

---

## 3. Dashboard (`index.html`) — current state

**Live URL:** https://timothycjin-cyber.github.io/alfred-dashboard/

| Layer | Tool |
|---|---|
| Hosting | GitHub Pages (static, single-file app) |
| Charts | Chart.js 4.4.1 (CDN) |
| Data read | GViz JSON endpoint (public, no auth) |
| Data write | Apps Script Web App POST (§2) |

**GViz URL pattern:**
`https://docs.google.com/spreadsheets/d/19_C3gFlY7hDjGm87k3Uke63_Tgg6TQPl6xLiGZvuEis/gviz/tq?tqx=out:json&sheet=Sheet1`

### 3.1 User filtering (strict, deliberate)

- `activeUser` parsed from `?user=` query param on load, falling back to
  `localStorage('alfred_user')` (written whenever the param is present) so the installed
  PWA keeps working — `start_url` can't carry per-user state.
- `calculateAndRender()` applies a **strict** filter: a row renders only if `activeUser`
  is non-empty AND matches the row's User column exactly. No `?user=` → zero rows render
  (intentional privacy). Always test with `?user=YOUR_CHAT_ID`.
- **No household/"view all" toggle — deliberate; never add one.**

### 3.2 Design system & motion

Material 3 Expressive foundation — Roboto Flex UI, ink monochrome tokens, semantic
red/green reserved for expense/overspend vs income/good-news, burnt-sienna accent
(`--sienna: #C2542D`). FAB + modals + nav pill share a liquid-glass aesthetic.
Theme-aware via `prefers-color-scheme`. **Ledger voice throughout: no emoji, no
exclamation marks, quiet verdicts.** Visual grammar rule: **money magnitude = horizontal
bar; the Trends cell grid = sienna intensity ramp** (the only cell grid). The grid was
retinted from capture-count to **spend-per-day** (2026-07-21, §3.7) — sienna reads as
*heat*, not money valence, so **semantic red stays reserved for expense/overspend
figures and deltas**; a whole grid never goes red/green. (Earlier framing was "cells for
habit" when the grid counted logging activity; that habit metric is retired.) The Trends
donut follows the same grammar (2026-08-04): the ring is a **shape**, carrying no text of
its own, and the category list beneath it does the labelling — with the per-row share bar
being the same horizontal-bar-for-magnitude idiom, tinted by the **category palette**, never
semantic red.

**Motion tokens:** `--motion-wobble` (overshoot spring; hero/tile/chip pop-ins, FAB
bloom, bar transitions), `--motion-snap` (taps), `--motion-wobble-nav` (nav-only, ≈20%
shorter — drives `.nav-slider` transform and the active-tab `scale(1.1)` text pop).
Under `@supports (transition-timing-function: linear(...))` the tokens become sampled
damped-spring `linear()` curves (wobble = stiffness 320/ζ 0.62, ~632ms; snap = 700/0.85,
~370ms; nav ~505ms); cubic-bezier fallbacks for older browsers.

- **Entrances:** hero first, tiles staggered via `nth-child` delays, txn rows cascade
  through a per-row `--d` var; all entrance keyframes use `backwards` fill.
- **No-replay:** `renderedKey` (per view: `year-month-dataStamp`) makes
  `calculateAndRender()` a no-op on tab revisit; `dataStamp` bumps on every fetch. On
  genuine re-renders `hasEntranced` adds `.no-entrance`. Revisited tabs get `.settled`
  (pins child animations — `display:none → block` would otherwise restart them).
- **Value inertia:** `counterMemory` (keyed by `data-key` on `.counter-val`) animates
  numbers from their previous value, not from zero.
- **Mount-then-spring:** elements born at final state never animate — the pace bar
  mounts at its previous state (`paceBarMemory`) and gets real `flex-grow`/`left` one
  frame later so the wobble fires.
- **Shared-axis tab slide:** `.axis-in-left/right` in `switchView()`, direction from
  tab order. ⚠️ **`.container` must keep `overflow-x: clip`** — the slide's transient
  `translateX` briefly widens the document; `position:fixed; right:0` bars then size to
  the widened viewport and *sustain* the overflow, which mobile browsers zoom to fit.
  `clip` (not `hidden` — that would kill vertical scroll/sticky header). Caught by
  measuring `documentElement.scrollWidth` over repeated toggles, not by eye.
- **`prefers-reduced-motion`:** zeroes all motion tokens + stagger delays; JS
  `REDUCED_MOTION` flag makes counters instant, sets `Chart.defaults.animation = false`,
  shows insight text without the typewriter, scrolls without smooth. Loader becomes an
  opacity pulse.
- **Loader:** 4-bar bouncing mini bar-chart (staggered, last bar sienna).

### 3.3 Navigation — Today · Logs · Trends + detached FAB

Three text tabs in a 280×48px glass pill (4px padding, 4px gaps), Today is the default
landing tab. `VIEW_ORDER = ['today','logs','trends']`; panes `#today-view` /
`#logs-view` / `#trends-view`.

- **Slider math:** width `calc((100% - 16px) / 3)` (padding box minus 2×4 padding +
  2×4 gaps, over 3); slot n = `translateX(calc(n·100% + n·4px))`, set in `switchView()`.
- **FAB:** 56px sienna circle floating 12px above the pill, centered; `.bottom-bar` is a
  column stack anchored `bottom: calc(24px + env(safe-area-inset-bottom))`. Neutral
  elevation shadow (`0 6px 16px rgba(0,0,0,0.18)`); white icon; `body.modal-open-state`
  rotate.
- **⚠️ Derived numbers (re-derive ALL if the cluster moves):** FAB center = **112px** +
  safe-area above the viewport bottom (24 bar + 48 pill + 12 gap + 28 half-FAB).
  Capture-sheet overlay `padding-bottom: calc(150px + env(safe-area-inset-bottom))`;
  bloom `transform-origin: 50% calc(100% + 38px)` (150 − 112). `body`
  `padding-bottom: calc(164px + inset)` clears the cluster; toast sits at
  `bottom: calc(152px + inset)`.
- **Header:** just "Project Alfred" on Today; on Trends/Logs a contextual month chip
  appears (§3.4). `.header-actions` carries a `min-height: 36px` (2026-07-21) matching
  the monthnav chip's rendered height, so the header row is the same total height on
  Today (chip absent) as on Logs/Trends (chip shown) — without it the row shrank to the
  title's ~24px line-height whenever the chip was hidden. No bell (the push digest is
  retired — Phase F removed the button, `togglePush()`, and the Firebase client
  entirely). No refresh icon (pull-to-refresh
  covers it; `@keyframes refreshSpin` survives for the capture-send spinner).

### 3.4 Month state — single contextual selector

- `activeMonth`/`activeYear` are **pinned to the real current month at load** and never
  change — Today always shows now. (Consequence: Today/Logs `renderedKey` viewKeys are
  constant within a session, busted only by `dataStamp`.)
- **Shared `viewMonth`/`viewYear`** drive Trends and Logs, stepped by the compact
  `‹ Jul ›` header chip (`#header-monthnav`, `renderHeaderMonthNav()`; `’YY` appended
  when not the current year). Rendered **only when `currentView` is `trends` or `logs`**
  and data exists; re-rendered on every `switchView`, in the Trends/Logs render
  branches, and inside `headerNavMonth` (it lives outside the panes, so the key-skip
  can't cover it).
- `headerNavMonth(delta)` clamps to [`earliestDataMonth()` … current month], ends
  disable. **Behavior fork:** on Trends → `calculateAndRender()` (viewKey busts); on
  Logs → `logsScrollToMonth()` — **no filtering, no re-render**.
- The Trends archive shelf also sets `viewMonth`; the chip label follows.

### 3.5 Today tab

Composition (scroll-peek order): **hero → two tiles (+ detail panel) → glance line →
budget-pace card.**

- **Hero** (`.hero-card`, `#today-hero`): label **`Budget left`** (income − expense);
  ink-black gradient in dark mode, monochrome off-white in light. **1.5px `--outline`
  border** (light) / `rgba(255,255,255,.22)` (dark) — deliberately heavier than the
  `--outline-variant` border every other card uses (2026-07-21), so the hero reads as
  the page's focal point. Privacy blur toggle (`toggleHeroPrivacy()` → `.value-hidden`),
  embedded 6-month net-trend mini bar chart (`heroChart`, current month sienna, others
  green/red by sign; `minBarLength: 4` + `heroBaselinePlugin` faint zero line, gated on
  `canvas.id === 'hero-trend'`). Sub-copy "In the green" / "Watching the leak".
- **Tiles** (`#today-tiles`, a 2-col grid → **two headline tiles**): **`Budget`** (month
  income) / **`Expenses`** — tinted surfaces (`--wash-income`/`--wash-expense`), `▲/▼ X%
  vs last month` chips with `.good`/`.bad` valence (expenses dropping reads green).
  Entrance cascade is nth-child(1)/(2) only. **The 2×2 quadrant was collapsed 2026-08-02**
  — `Average Daily`/`Forecast` are follow-up detail, not headline figures, and holding two
  of four tile slots overstated them.
- **Detail panel** (`#today-detail`, `todayDetailHtml()` / `toggleTodayDetail()`):
  **`Average Daily`** + **`Forecast`**, disclosed by tapping the **Expenses tile** — which
  is therefore a real `<button>` (`#today-detail-trigger`, `aria-expanded` +
  `aria-controls`, chevron rotating via the `.week-chev` idiom), not a `<div>`. The panel
  is the **last child of the `.tile-row` grid** spanning `1 / -1`, so it inherits the 12px
  gap and the row's bottom margin for free; `#today-detail:empty { display: none }`
  collapses it when closed, so a closed panel costs no vertical space. Same math as the
  pace bar (`avgDaily = totalExpense ÷ days elapsed`, `forecast = avgDaily × days in
  month`), keeping `data-key`s `today-avg`/`today-fc` — reusing the keys preserves
  `counterMemory` inertia and stays distinct from the Trends `an-avg`/`an-fc` tiles.
  When `forecast > totalIncome` both figures go **`.overspend`** semantic-red; that red now
  reads *inside* the panel, so **the at-a-glance overspend warning is the pace card's
  status strip**, driven by the same `forecast > income` comparison. **No `vs last mo.`
  chips here** — a percentage against a projection is noise (the 2026-07-24 chips are
  reverted, and `lastAvgDaily`/`avgChangePct`/`fcChangePct` are gone with them).
  `todayDetailHtml()` is self-contained (computes from `monthTotals`, like
  `computeTodayGlance`) so the click handler can rebuild the panel without re-entering
  `calculateAndRender()`. ⚠️ **`animateCounters()` is a DOM sweep that only runs at the end
  of `calculateAndRender()`** — markup injected from the click handler must be swept
  explicitly or the figures sit at their literal `RM 0.00` placeholder forever.
  `todayDetailOpen` is module state, so the panel survives optimistic re-renders the way
  `expandedWeeks` does for the Logs accordion.
- **Glance line** (`computeTodayGlance` — the digest math as client-side JS): today's
  spend vs the 30-day spend-day average; zero-state "Nothing logged today yet."
- **Budget-pace card** (`#today-pace-block`, `renderLivePaceBar(totalIncome,
  totalExpense)` — single caller), **two-bar, state-colour design** (redesigned
  2026-07-21, superseding the single-continuous-pill "pace bar hybrid" of 2026-07-19):
  caption `Day X of N` (no-budget state: `No budget set this month`); a **Spent** row and
  a **Month** row, each `label | track | value%` (`.income-bar-row`, a
  `60px 1fr 52px` grid) — Spent fills **sienna**, flipping to **semantic-expense red**
  only once it crosses the Month line (`.income-bar-fill.spent.over`); Month fills a
  neutral `--outline` gray, always. A shared **dotted 2px "Today" reference line**
  (`.income-bar-marker`, `repeating-linear-gradient`) crosses both bars at the
  month-elapsed position, with a speech-bubble legend (`.income-bar-bubble` +
  `.income-bar-bubble-tail`) anchored above (`.income-bar-wrap` reserves the space via
  `padding-top: 36px`, bubble sits at `top:0`). Both the marker and bubble are
  absolutely positioned against the whole wrap but must render aligned to the track
  column, not the full width — `paceMarkerLeft(pct)` offsets by the grid's fixed
  `label + gap` (`calc(72px + (100% - 136px) * pct)`); no clamping needed, since the
  72px/64px side margins already exceed the bubble's ~27px half-width. The card closes on
  a **status strip** (`.income-bar-status`, 2026-08-03 — replaced the inline
  `.income-bar-verdict` text line), a band **flush with the card's bottom edge**: an
  info glyph plus one plain-language sentence, `Your spending is outpacing the budget` or
  `Your spending is on track and within budget`. **No ringgit figure** — the strip states
  the verdict, the bars carry the magnitude. Same `over` boolean as before
  (`forecast > income`, algebraically `usedPct > monthPct`, avg daily = MTD spend ÷
  elapsed days), so the strip and the Spent bar's colour flip can never disagree.
  **Only overspending gets a solid fill** (`--strip-over`, white text): an alert reads as
  an alert because it isn't always on, so on-track stays quiet — `--wash-income`
  background, `--semantic-income` text, hairline top border. `--strip-over` is
  deliberately **deeper than `--semantic-expense`** (#D93A31 / #C0392F dark): the semantic
  token is tuned for text *on* the surface and clears only ~4.0:1 under white, where the
  strip token clears 4.5:1. Full-bleed comes from negative margins
  (`20px -1.25rem -1.25rem`) reaching `.card`'s padding edge inside its 1px border — no
  restructuring of `.card` — and the bottom corners mirror its asymmetric radius
  (`0 0 var(--shape-lg) var(--shape-xs)`). No strip in the no-budget state: "within
  budget" with no budget would be a false statement.
  `paceBarMemory` (single, nulled when hidden) feeds the mount-then-spring for both bars'
  widths and the marker/bubble position.
- **Current-month-only rule:** glance + pace render only for the real current month.

### 3.6 Logs tab

`renderLogsLedger()` → `#logs-ledger`: a Mon–Sun **week accordion** under month headers,
over **all** the user's rows. Bars for money; no cell grids here.

- **Bucketing:** weeks keyed by the Monday's ISO date (`weekMondayIso`); a week lives
  under the month containing its Monday (cross-month weeks appear exactly once).
  Month headers carry `data-ym="Y-M"` (scroll targets). Newest first.
- **Closed row:** range label, entry count, spend total (semantic red), 6px spend bar
  scaled to the max rendered week spend.
- **Accordion:** `toggleWeek()` swaps only the tapped week's body (no entrance replay);
  multiple weeks open; current week seeded open once (`logsSeeded`, `curWeekKey`).
  Expanded rows = classic txn idiom + `.txn-date`; income rows badge as `Budget`
  (`.inc-badge` class name unchanged); tap opens the edit modal. `expandedWeeks` (Set of
  Monday keys) is module state — expansion survives optimistic re-renders and appends.
- **Lazy windowing:** `logsMonthsShown` starts at 2; an IntersectionObserver on
  `#logs-sentinel` (160px rootMargin) appends one older month per firing (chain-fires to
  fill short screens). `_logsTotalMonths` bounds it (set each render).
- **Scroll-to-month** (`logsScrollToMonth`): grows the lazy window until the target
  `.month-header[data-ym]` exists, then `window.scrollTo` it under the sticky header
  (smooth unless `REDUCED_MOTION`). A month with no logged weeks → quiet no-op.
- **Toolbar:** slim right-aligned `.logs-toolbar` icon row atop `#logs-view`, now **two
  `.icon-btn`s** (`gap: 8px`): a repeat glyph opening the recurring sheet (§3.13) and the
  export icon. The press-scale rule lives on `.icon-btn:active` (was `.export-btn:active`)
  so both get feedback.
- **Export:** `openExportModal`/`exportCSV` scope + filename + error copy read
  **`viewMonth`/`viewYear`** — exporting exports the chip's month.
- Rows written by a recurring series carry a quiet `.txn-auto` **"Auto"** marker beside the
  date (driven by `Source === 'recurring'`).
- `CAT_COLORS` + `CAT_ICONS` live at module scope (shared with the pie / txn rows).

### 3.7 Trends tab

Everything computes from `viewMonth` (`vRows`/`vIncome`/`vExpense`/`vCatData`).
Composition (resequenced 2026-07-23): insight strip → tiles (closed months only) →
archive card slot → spending patterns → donut → cumulative line → archive shelf (bottom).
The donut card (`#category-card`) and the cumulative card (`#cumulative-card`) are now
**separate full-width blocks**, not a two-up grid — `.charts-row` was deleted 2026-08-04,
because the donut card carries a breakdown list under it and pairing them left the shorter
card a large dead area.

- **Insight strip** (`#trends-insight`, `.insight-card`, "What I noticed"):
  - **Deterministic engine** (`buildAnalyticsInsight()` → rendered by
    `renderTrendsInsight()`): six fact builders — `_insightPace` (MTD vs same-point last
    month; whole-month vs prior for past months), `_insightCategory` (3-month monotonic
    climb or ≥40% jump/drop vs recent average, ≥RM30 guard), `_insightRecurring`
    (~monthly repeating descriptions across ≥3 months, CV ≤ 0.2, reported annualized),
    `_insightWeekend`, `_insightStreak`, `_insightComposition`. Each returns
    `{family, score, text}`; top 3 **distinct families** compose the narrative. Guards:
    <5 expense rows → "log a few more days" fallback; no strong candidate → "steady
    month" line. **Numbers are computed, never guessed.**
  - **Novelty rotation:** recent families penalized (`localStorage` per user, last 5
    gens, decaying penalty) so the mid-tier rotates. Only genuine live-month renders
    record history; fallbacks and past months record nothing.
  - **LLM phrasing:** POSTs the computed facts as
    `{key, action:'insights', facts, month}` → `{narrative}`; `styleInsightText()`
    escapes then re-bolds figures. Fully guarded: 10s timeout / non-200 / error → falls
    back to the deterministic text; `insightCache` keyed
    `user|viewYear|viewMonth|dataStamp|families`; `insightToken` drops stale responses;
    `.insight-thinking` dots while phrasing. `INSIGHTS_ENDPOINT` = `APPS_SCRIPT_URL`;
    blank it to force deterministic-only. Past months always use the deterministic
    retrospective — no LLM POST.
  - **Typewriter reveal:** `typewriteInto()` sets real innerHTML then types over the
    text nodes (rAF, `clamp(chars·14ms, 500, 1900)`), blinking sienna caret. Reduced
    motion → instant.
- **Tiles** (`#trends-metrics`): **closed months only** (2026-07-23) — the live-month
  `Average Daily` + `Forecast` moved to Today (2026-07-23), and now live in Today's
  tap-to-open detail panel (§3.5). A past month shows
  `Average Daily` + `Total Spent` actuals; on the live month `#trends-metrics` is emptied
  and `display:none` (mirroring the `#income-bar-card` show/hide) so no stray margin gap
  shows. Overspend never applies on closed months, so the `.overspend` semantic-red
  treatment (color only, no glow) is effectively Today-only now, but the class survives on
  both surfaces. `.tile-block.neutral-block` uses the standard `--outline-variant` border
  and a translucent `--wash-neutral` background (2026-07-24; was a flat `--surface-container`
  fill + heavier `--outline` border, needed because `--outline-variant` was pixel-identical
  to that flat fill in dark mode) — shared with Today's bottom-row tiles, and still reads as
  a distinct card standalone here since the wash is translucent, not a fixed hex.
- **Spend-card slot** (`#income-bar-card`): **hidden on the live month** (Today owns the
  pace bar); closed months show the **archive card** (net, top category, days logged
  X of N, quiet pace verdict).
- **Cumulative line:** current cumulative vs "last month" (= viewMonth−1) reference line
  in outline gray per theme (`#6C757D`/`#ADB5BD`) — reference, not warning.
- **Donut + category breakdown** (`#category-card`, redesigned 2026-08-04 — replaced the
  solid variable-radius pie): a **segmented donut** (`type:'doughnut'`, `cutout:'70%'`,
  `radius:'92%'`, `spacing:6`, `borderRadius:12`, `borderWidth:0`) in a 260px container,
  the month's expense total in the hole, and a **ranked category list** below.
  - **Nothing is drawn on the canvas but arcs.** `pieLabelsPlugin` (on-slice %s + elbow
    callouts) and `variableRadiusPlugin` are **deleted**; `Chart.register()` now takes
    `heroBaselinePlugin` alone. The old `layout.padding` of 52/36 existed only to hold the
    callouts and is down to `4`. `variableRadius` had to go on correctness as well as
    taste — it scaled `outerRadius` per arc but never `innerRadius`, so with a `cutout` set
    it would make **ring thickness vary per segment**.
  - `spacing` is guarded to `0` for a single category — on a lone full-circle arc it cuts a
    visible seam. `borderWidth:0` also retires a latent bug: the old
    `borderColor: 'var(--surface-container-low)'` never worked, since canvas 2D can't
    resolve a CSS custom property.
  - **Centre total is an HTML overlay** (`.donut-center`), not canvas text — so it gets the
    UI font, the theme tokens and `.counter-val` inertia (`data-key="an-cat-total"`, swept
    by the `animateCounters()` call that already ends `calculateAndRender()`). ⚠️ The render
    **wipes `#donut-container.innerHTML`** each pass, so the overlay is re-injected in that
    same statement or it vanishes on re-render.
  - **List** (`categoryBreakdownHtml()` → `#category-breakdown`): icon chip (reusing
    `.txn-icon-chip` + `hexToRgba(hex, 0.14)`), name, `X% of total`, amount, and a share bar
    in the category's own hue on `.week-bar`'s metrics. Bars scale to **share of total**,
    matching the percentage printed on the same row — not share of max, which would always
    fill the top row. Shares print one decimal below 10% so small categories don't all
    round to the same integer. Bars mount at `width:0` and get their real width one frame
    later (the pace-bar mount-then-spring idiom). Rows are hairline-separated, not a nested
    `.txn-list` box, since they sit inside a `.card` that already has a border.
  - **Empty month** (no expense rows): `#donut-container` is `display:none`, no centre
    overlay, and the list reads `No expenses logged this month.`
  - Layout: `.cat-card-body` is one column on a phone, `minmax(0,300px) minmax(0,1fr)`
    (donut left, list right) from 769px up.
- **Category palette** (validated with the dataviz six-checks, light+dark): Food &
  Dining `#C2542D`, Transport `#0891B2`, Bills & Utilities `#D97706`, Shopping &
  Groceries `#2684FF`, Subscriptions `#6554C0`, Entertainment `#DB2777`, Other `#495057`
  (deliberate neutral). Semantic expense red is reserved for amounts/deltas — never a
  category.
- **Spending patterns** (`renderSpendingPatterns`, `#spending-patterns`; was the
  capture heatmap, rebuilt 2026-07-21): the **`viewMonth` calendar** as a cell grid tinted
  by **spend per day** on the sienna `hm-l0..l4` ramp (the ramp lives once in CSS).
  **Monday-first**, date numbers on each cell. **Monthly-only** — the Weekly/Monthly
  toggle (`.sp-toggle`, `setPatternPeriod`, `patternPeriod`) was **removed 2026-07-23**;
  the card follows the month chip like the rest of Trends. The ramp is **self-scaling**:
  `level = ceil(spend / maxSpend × 4)` over the month's busiest non-future day (`hm-l0` =
  zero-spend, `hm-future` = dashed). A summary **chip** (`.sp-chip`) reads `Month Year •
  N days • ↗/↘ RM total • Avg RM/day` where **N = `elapsedDays` (non-future days)** and
  **avg = total ÷ elapsedDays** — so for the live month it divides by days-so-far and for
  a closed month by the full month, **matching the Today `Average Daily` tile exactly**
  (fixed 2026-07-23; previously divided by full `daysInMonth`, which read lower than the
  Average Daily card). Trend arrow vs the prior month, omitted with no prior data — arrow
  valence follows spend delta: up = expense-red, down = income-green. A `Less → More`
  **legend** (`.sp-legend`) surfaces the ramp swatches. Spend is summed from expense rows
  only (`isExpense`), active-user-filtered.
- **Archive shelf** (`renderArchiveShelf`, `#month-shelf`, "Archive"): chip row of past
  months holding data; tap sets `viewMonth`. Scrolls inside itself (overflow-x auto
  within the clipped container).

### 3.8 Capture flow (FAB → sheet → parse → confirm)

- **Capture sheet** (`#capture-overlay`, `.modal-overlay.align-bottom`) floats just
  above the nav pill. **Container-transform entrance:** closed state `scale(0.08)` +
  full radius, `transform-origin` at the FAB center (see §3.3 derived numbers) — the FAB
  blooms into the sheet via `--motion-wobble`.
- Clip button → `#capture-gallery-file` (bare `accept="image/*"`: gallery/files,
  screenshots work); camera button → `#capture-camera-file` (`capture="environment"`).
  Both feed `handleCaptureFile`; photos canvas-downscale to ≤1280px JPEG q0.82 before
  base64.
- **Photo + comment:** a chosen photo parks as `pendingImageB64` with a removable
  thumbnail chip (`.capture-attach`) so a note can be typed; send submits both, note as
  the photo `caption`. Attachment survives sheet close/reopen until sent/removed.
  Placeholder `“Coffee RM8”` (set in markup AND the `clearCaptureAttachment()` reset;
  attach-mode placeholder "Add a note, or send as is").
- POSTs `action:'parse'`; busy spinner replaces the send arrow; 25s timeout;
  notes/errors in `#capture-note` (persist to next open, cleared on new parse).
- **Confirm flow:** 1 txn → the normal txn modal pre-filled ("Confirm entry", saves via
  untouched `saveTxn()`); N txns → `#review-overlay` (editable amounts, removable rows,
  "Save all" sequential; saved rows leave the list so retry can't duplicate). Income
  rows tag as `Budget` (`.income-tag` class unchanged).
- **Sources:** capture-confirmed adds carry `source: 'web'` / `'web-image'`; plain FAB
  adds send `'dashboard'` (`pendingSource` resets on every plain modal open —
  "Enter manually" via `openManualFromCapture()` preserves this).

### 3.9 Modals (txn, review, export)

All overlays are `role="dialog" aria-modal="true" aria-labelledby=…`.

- **Focus:** `trapModalFocus(overlay, initial)` remembers the trigger, moves focus in
  (`preventScroll`), confines Tab/Shift+Tab; `releaseModalFocus()` restores. **No
  auto-pop keyboard:** txn modal + capture sheet focus the sheet element itself
  (`tabindex="-1"`, `outline:none`), not a field; Shift+Tab wrap also matches
  `document.activeElement === sheet`. Export modal focuses a button (fine).
- **Escape:** one global keydown — backs out of the delete confirm first, else closes
  whichever overlay is open.
- **Txn modal:** type toggle reads **`Expense / Budget`** (`#type-income-btn` id and
  stored `'Income'` value unchanged). **In-modal delete confirm:** outline-red Delete
  (`askDeleteConfirm()`) escalates to a solid-red confirm row ("Delete this entry? This
  can't be undone."); `cancelDeleteConfirm()`/`resetDeleteConfirm()` restore (also reset
  on open/close); `deleteTxn()` assumes intent confirmed.

### 3.10 Optimistic writes

Add / edit / delete / review-save mutate `allRows` locally and re-render instantly (no
loader), then POST in the background and fold in server truth via a **debounced
reconcile** (`reconcileFromServer`, 1.5s after the POST). Reconcile keeps optimistic
rows the GViz cache hasn't surfaced, honors optimistic deletes the cache still echoes,
and de-dups **UID first, content-signature second** — correct whether or not the backend
echoes the client UID. Failures roll back out of `allRows` and surface a neutral
**toast** (`#toast`, inverse-surface — not semantic red). Client sends `clientUID()`
with every add. Date construction matches the GViz month-correction so optimistic and
reconciled rows format identically.

### 3.11 PWA shell (push retired — Phase F)

- `manifest.json` (standalone, theme colors per scheme, maskable icons in `icons/`) is
  now the **entire** PWA shell — it stays, and carries installability on its own.
- **No service worker.** `firebase-messaging-sw.js` and its `navigator.serviceWorker`
  registration in `index.html` are deleted (Phase F). The worker only ever did push
  display + PWA presence and had no fetch handler, so removing it doesn't touch the live
  GViz reads. An already-installed client keeps its old orphaned SW until the browser
  drops it; harmless (no pushes are ever sent now).
- **No push client.** The bell, `togglePush()`, `initPushUI()`, the lazy Firebase SDK
  import, `FIREBASE_CONFIG`, `FCM_VAPID_KEY`, and `localStorage('alfred_push_token')`
  are all gone. (The Firebase project `project-alfred-f7575` can be deleted by the owner
  — §6 Phase F checklist.) How push used to work — FCM HTTP v1, SA-JWT signing, handing
  the SDK our SW registration on a project-pages path — is preserved as a learning in §8.

### 3.12 Verification loop

Local `python3 -m http.server` + Playwright (mock the GViz response, serve Chart.js
locally — the CDN is proxy-blocked): screenshot at 390px & 900px, light **and** dark,
reduced-motion spot check; hand-compute expected figures and assert them; measure
`documentElement.scrollWidth` over repeated toggles whenever anything moves along X.
Every shipped phase was verified this way (23–72 checks each) before merging.

### 3.13 Recurring series (Phase G)

A series is a **definition** in the `Recurring` tab (§1); its **occurrences** are ordinary
`Sheet1` rows written through the ordinary `add` action. Generation is client-side.

- **Materialization** (`materializeRecurring()`) is called from `init()` **after first
  paint and never awaited** — a slow or absent `Recurring` tab can't delay or break load.
  It enumerates each active series for `activeUser` from `StartDate` up to **today**,
  skips UIDs already in `allRows`, pushes optimistic rows, then POSTs them sequentially
  (the `saveReviewAll()` shape), rolling failures back per row. Quiet toast on success:
  `Added N recurring entries`.
- **Never future-dated.** `avgDaily`, `forecast`, the pace bar and the patterns chip all
  divide by *elapsed* days, and the patterns grid dashes future cells — a pre-written
  future row corrupts all of them silently. "What's coming" is the **unwritten**
  `Next …` line in the sheet (`nextOccurrence()`, computed analytically so it stays O(1)).
- **Idempotency: derived UIDs.** `recurringUID(seriesId, iso)` → `rc-<seriesId>-<YYYYMMDD>`,
  identical on every device. Client skips UIDs present in `allRows`; `handleAdd` refuses
  duplicates server-side (§2) for the window where the GViz cache lags a write.
- **`recurrenceDates(series, todayIso)` is pure** (no clock read, no I/O) so verification
  can drive it at any simulated "today". Monthly **clamps to the month's last day** (a
  series on the 31st fires the 30th in November, the 28th/29th in February — never skips).
  ⚠️ Its `RECURRENCE_MAX_ITER` guard is a runaway-loop bound, **not** the write cap:
  enumeration must reach today, or a daily series older than the cap would forever
  re-propose only its oldest (already-written) occurrences. Writes cap separately at
  `RECURRING_MAX_PER_RUN` (60).
- **Backfill bound:** the create form sets the start date's `min` to today, so a *new*
  series can never backfill a closed month. An existing series keeps its original anchor
  (no `min`), which is what lets a catch-up run cover days the app wasn't opened.
- **UI** — `#recurring-overlay`, opened from the Logs toolbar. A **plain centered
  `.modal-overlay`, deliberately not `.align-bottom`**: that variant's `transform-origin`
  is FAB-anchored (§3.3), so a toolbar-triggered sheet would bloom from the wrong place.
  **One overlay, two panes** (`#recurring-list-pane` ⇄ `#recurring-form-pane`) swapped in
  place — `trapModalFocus` holds exactly one trap at a time, so stacking a second overlay
  would clobber the return-focus chain. Escape steps back one level at a time (confirm →
  form → list → closed), mirroring the txn modal's delete confirm; **the global Escape
  chain is hardcoded and had to be extended by hand.**
- List rows reuse `.export-choice`; paused series stay listed at 0.5 opacity (pausing is
  reversible — hiding would read as deletion). The form reuses `.type-toggle`
  (Expense/**Budget**), `.form-input`/`.form-select`, and `populateCategoryOptions()`
  (which now takes a select id). Actions are a balanced 2+2: Back/Save, then edit-only
  Pause/Stop, with Stop escalating `.btn-danger` → `.btn-danger-solid` and naming how many
  written entries survive.
- **Series edits are forward-only** — changing an amount never rewrites occurrences
  already written; those are ordinary rows, edited or deleted in the txn modal.
- `_insightRecurring()` **excludes `Source === 'recurring'`** — generated rows are
  perfectly stable by construction, so they'd always qualify, and reporting a series the
  user created back to them is noise, not insight.
- `gvizDateToIso()` was extracted from `mapGvizRows` so the month-0-index correction is
  shared by both tabs; `mapGvizRows` now also reads col E into `Source` (safe — `rowSig`
  uses explicit fields, `exportCSV` builds columns explicitly).

---

## 4. Status

**Everything in §3 is DONE, LIVE, and Playwright-verified.** Highlights with PRs:
UX refresh + tile system (#6/#7), motion/physics passes (#11–#13), insights strip
(#14–#18), no-keyboard-on-open (#20), PWA + capture + push Phase 0 (#22/#23), three-tab
restructure (#33), Today composition (#34), the Today/Trends UI polish pass (#47), plus
the Logs week index, Trends month navigation, optimistic writes, refinement Phases A–D,
and Phase E (2026-07-18/19). Full history: §7.

**Phase F (push digest retirement) is DONE**, both in code (2026-07-19, Playwright-verified
— no bell, no service worker registered, no Firebase requests, all core flows intact) and
live: Apps Script redeployed, Firebase project deleted. Owner should still double-check the
`sendDailyDigestPush` time trigger and the `FIREBASE_SA_JSON`/`FCM_PROJECT_ID` Script
Properties are cleared — §6 checklist.

**Phase G (recurring expenses) is DONE and LIVE** (2026-08-02) — render-loop verified
50/50, and **Apps Script is redeployed**, so the `recurring` action and the `handleAdd`
duplicate guard are both live. See §3.13. Follow-up #53 fixed the save-failure path: an
Apps Script error (including the `unknown action` a stale deployment returns) had been
reported as the generic offline copy, so the one failure mode that redeploy *was* the fix
for gave no hint that redeploying was the fix. Errors now surface the server's own reason.

**Pending:** the remaining unscheduled candidate features (§6).

---

## 5. Cost & Sustainability

**The web app runs at ~$0/month.** GitHub Pages and Apps Script are free (FCM is no
longer used after Phase F); the only metered cost is OpenAI (gpt-4o-mini): ~$0.0002 per text parse, ~$0.002–0.004 per photo,
~a few hundred tokens per insights phrasing (cached client-side per month+data).
Realistic total **well under $0.50/mo** against the $5 budget. Guards: `ALLOWED_USERS`
allow-list on `parse`, input size caps, insights cache. Apps Script free quotas (20k
UrlFetch/day, 90 min trigger runtime/day) are orders of magnitude above usage. No other
running costs anywhere in the project.

---

## 6. Roadmap

*This section IS the roadmap — the separate roadmap files were folded in and deleted
2026-07-19. Execute **one phase per session, in order.***

### Standing rules for every phase

- Verify with the render loop (§3.12) before committing.
- Update this file in the same PR as the change it documents.
- Respect the design language: M3 Expressive, sienna accent, semantic red =
  expenses/overspend only, minimal ledger voice (no emoji, no exclamation marks).
- Known traps (respect them): GViz dates month-0-indexed; Chart plugins gated by
  `canvas.id`; horizontal transforms need the `overflow-x: clip` ancestor; strict
  `activeUser` filter is deliberate — never add a view-all; animations suppressed under
  `.settled`/reduced-motion; Apps Script redeploys via Manage deployments → **Edit**.

### Phase F — Push digest retirement ✅ DONE (2026-07-19)

Code changes shipped and Playwright-verified (details in §7). What was done: removed the
bell + `togglePush()` + `initPushUI()` + Firebase SDK import + `FIREBASE_CONFIG` +
`FCM_VAPID_KEY` + `localStorage('alfred_push_token')` from `index.html`, deleted the
`firebase-messaging-sw.js` file and its `navigator.serviceWorker` registration, stripped
the `push-subscribe`/`push-unsubscribe`/`run-digest-push` actions and all digest/FCM code
from `Code.gs`, and rewrote the product model here (§0).

**Owner checklist:**

1. ✅ Apps Script: **redeployed** the updated `Code.gs` via Manage deployments → Edit →
   new version.
2. Apps Script: delete the `sendDailyDigestPush` time-driven trigger (Triggers panel) —
   harmless if left (the function it called no longer exists, so it just fails silently
   in the execution log), but worth clearing.
3. Script Properties: drop `FIREBASE_SA_JSON` + `FCM_PROJECT_ID` (keep `OPENAI_API_KEY`
   + `ALLOWED_USERS`).
4. ✅ Firebase project `project-alfred-f7575` **deleted**. Optionally also delete the
   now-inert `PushSubs` tab in the Sheet.

### Phase G — Recurring expenses ✅ DONE (2026-08-02)

Built and render-loop verified (50/50 — 44 at build, plus 6 added in #53); the shipped
behaviour lives in §3.13. The design rationale below is kept because it records *why* each
fork was taken.

**Owner checklist — complete.**

1. ✅ Apps Script **redeployed** via Manage deployments → Edit → new version, so the
   `recurring` action and the `handleAdd` duplicate guard are live.
2. ✅ Nothing to set up in the Sheet: the `Recurring` tab is created on first save.

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

**Owner step after merge:** ✅ done — Apps Script redeployed via Manage deployments →
**Edit** → new version. The `Recurring` tab is created automatically; no manual Sheet setup.

### Candidate features (refined 2026-07-19 — not yet phased)

Each needs its own design/roadmap pass before building.

- **Trips — temporary named budgets.** The concrete first cut of the parked "multiple
  named budgets" idea (which the budget rename kept the path open for): a **temporary,
  named mini-budget** with its own set amount, tracking trip spend separately from (and
  not polluting) the month's budget math. Leaning toward its **own page with its own
  FAB** ("Trips"). This is a **stored budget number scoped to a trip** — the first place
  the data model grows past "budget = the month's logged income" (§0) — needs a design
  pass on where trip rows live (tag/flag on rows vs. a separate sheet tab) before any
  build.
- **Recurring expenses.** ✅ **DONE 2026-08-02 — Phase G above; shipped behaviour in
  §3.13.**
- **"Spending patterns" — heatmap rebrand + controls. ✅ DONE (2026-07-21, §3.7).** The
  Trends heatmap was rebuilt as the "Spending patterns" card: retinted from capture-count
  to **spend-per-day** (owner-confirmed reframe; keeps the sienna ramp per §8 "steal
  patterns, not palettes"), Monday-first, with a Weekly/Monthly toggle, a summary chip,
  and the `Less → More` legend. (Superseded the old v2 Phase 6 heatmap acceptance sweep.)
  **Update 2026-07-23:** the Weekly/Monthly toggle was **removed** (monthly-only) and the
  chip average switched to divide by elapsed days — see §3.7 and the §7 history entry.

**Parked:** FAB long-press accelerator (long-press ~450ms opens the camera flow
directly, skipping the capture sheet; tap unchanged — old v2 Phase 7, no full spec).

**Dropped (2026-07-19):** capture-bar correction handling ("actually make that RM20") —
no longer wanted; capture-parse validation suite — considered resolved.

### Explicitly out of scope (do not build unless asked)

- Streak counters, badges, confetti, celebratory motion beyond existing pop-ins
- Milestone marks on the hero; personal-records insight templates
- Drill-in navigation for Logs weeks (accordion decided), search, or filters
- Any new backend endpoints, LLM calls, or paid services

---

## 7. History (compact)

For code comments that reference roadmap phases: **v2** = the restructure roadmap
(Today · Logs · Trends, numbered Phases 0–7), **v3 / lettered phases** = the refinement
roadmap (Phases A–F). All shipped phases below are DONE & verified; what each built is
woven into §3.

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
- **2026-07-24 — Today quadrant chips (§3.5):** `Average Daily` / `Forecast` gained a
  `▲/▼ X% vs last mo.` chip, matching `Budget`/`Expenses` so all four quadrant tiles share
  the same label/value/chip layout. Last month is treated as closed for the comparison:
  `lastAvgDaily = lastMonth.exp ÷ daysInLastMonth` (full month, same formula as the Trends
  closed-month `Average Daily` tile) and `lastForecast = lastMonth.exp` (a closed month's
  forecast and actual spend are identical, so no separate formula was needed). Chip
  valence (`.good`/`.bad`) follows the Expenses convention — lower reads as good news —
  and is independent of the value's own `.overspend` red flip. Render-loop verified
  (§3.12; 390/900 × light/dark + reduced-motion, mocked GViz, stubbed Chart.js):
  hand-computed chip percentages matched on-screen exactly (▼73%/▼72% on a test dataset),
  an overspend scenario showed a red value and a red chip together with no visual clash,
  no horizontal overflow.
- **2026-07-24 — Today quadrant tile alignment (§3.5):** the `Average Daily`/`Forecast`
  tiles' styling now matches `Budget`/`Expenses` — added `--wash-neutral` (gray, same
  0.04/0.06-opacity pattern as `--wash-income`/`--wash-expense`) and switched
  `.tile-block.neutral-block` from a flat `--surface-container` fill + heavier `--outline`
  border to that translucent wash + the standard `--outline-variant` border everyone else
  uses. The heavier border (2026-07-21) was a fix for `--outline-variant` being
  pixel-identical to the old flat fill in dark mode (`#2D2D2D` on `#2D2D2D` — invisible);
  the translucent wash sidesteps the collision at its root instead, so the border can go
  back to matching the rest of the quadrant. Render-loop verified (§3.12; 390/900 ×
  light/dark + reduced-motion, mocked GViz, stubbed Chart.js): all four Today tiles share
  one border weight in both themes, overspend red unaffected, Trends' closed-month tiles
  (same class, standalone context) still read as distinct cards, no horizontal overflow.
- **2026-07-23 — Today quadrant + Trends resequence (PR #49):** three UI refinements, all
  render-loop verified (§3.12; 390/900 × light/dark + reduced-motion, mocked GViz, stubbed
  Chart.js). (1) **Moved `Average Daily` + `Forecast` from Trends to Today** — Today's
  `#today-tiles` now renders a **2×2 quadrant** (Budget · Expenses · Average Daily ·
  Forecast) with distinct `today-avg`/`today-fc` data-keys and an `.overspend` colour flip
  when `forecast > totalIncome`; CSS gained nth-child(3)/(4) entrance delays. Trends keeps
  the tiles (`Average Daily` + `Total Spent`) **only for closed months**, hiding
  `#trends-metrics` (empty + `display:none`) on the live month. (2) **Spending patterns**
  (`renderSpendingPatterns`) — removed the Weekly/Monthly toggle (`patternPeriod`,
  `setPatternPeriod`, `.sp-toggle` markup + CSS all deleted; `weekMondayIso` kept for
  Logs), monthly-only; the chip average now divides by **elapsed (non-future) days**
  (`elapsedDays = days.filter(d => !d.future).length`) instead of full `daysInMonth`, so
  it **matches the Today `Average Daily` tile to the cent** — the mismatch the owner
  flagged. (3) **Resequenced Trends** DOM to insight → metrics → archive → spending
  patterns → charts-row (pie now before cumulative) → shelf. Verified: quadrant geometry
  at both widths, avg parity (450/23 = RM 19.57 on both surfaces), closed-month tiles
  reappear (June: RM 14.00 avg / RM 420 total), DOM order, `scrollWidth == clientWidth`
  across tab flips.
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
- **2026-07-19 — Phase E, expanded scope (Subscriptions + category merge):** added
  `"Subscriptions"` (color `#6554C0`, icon 🔁) to `EXPENSE_CATEGORIES`/`CAT_COLORS`/
  `CAT_ICONS` in both `index.html` and `apps-script/Code.gs`; merged `"Shopping"` and
  `"Groceries"` into a single `"Shopping & Groceries"` category (color `#2684FF`, icon
  🛍️) — both new colors are the freed-up hexes from the two retired categories, so the
  seven-color palette stays exactly as six-checks-validated, no new hues introduced.
  Added one `EXTRACT_PROMPT` example line steering recurring bills ("netflix RM17") to
  Subscriptions over Entertainment/Bills & Utilities. Added a one-off
  `migrateShoppingGroceriesCategory()` helper in `Code.gs` (same pattern as
  `backfillUIDs()`) to relabel existing Sheet rows from `Shopping`/`Groceries` to
  `Shopping & Groceries`. **Owner ran the migration and redeployed Apps Script
  (Manage deployments → Edit → new version)** — live on both the parser and the
  dropdown.
- **2026-07-19 — Phase F (push digest retirement):** the third pillar is gone. Deleted
  from `index.html`: the notification bell, `togglePush()`/`initPushUI()`/`setPushUIState`/
  `loadMessaging`/`postPushAction`, the lazy Firebase SDK import, `FIREBASE_CONFIG`,
  `FCM_VAPID_KEY`, the `localStorage('alfred_push_token')` handling, the `.push-btn` CSS,
  and the `navigator.serviceWorker.register(...)` call. Deleted the
  `firebase-messaging-sw.js` file (kept `manifest.json` — it now carries the whole PWA
  install shell). Stripped `Code.gs` back to `add`/`edit`/`delete`/`parse`/`insights`:
  removed the `push-subscribe`/`push-unsubscribe`/`run-digest-push` actions, the
  `PushSubs` helpers, `sendDailyDigestPush`, `computeDigest`/`dailyAverage`/`readAllRows`/
  `fmtMoney`, the FCM HTTP v1 code (`getFcmAccessToken`/`sendFcm`), and the digest-only
  config consts (`PUSHSUBS_SHEET_NAME`, `DASHBOARD_URL`, `DIGEST_AVG_WINDOW_DAYS`). The
  digest *math* survives as the Today glance line (`computeTodayGlance`). Verified with
  the render loop (§3.12): 390/900px × light/dark, mocked GViz, local Chart.js — no bell,
  zero service-worker registrations, no Firebase/FCM requests, hero/tiles/glance/pace all
  render, budget-left math correct. Owner still to redeploy Apps Script + delete the
  trigger/properties (§6 checklist).
- **2026-07-21 — Today/Trends UI polish pass (PR #47):** four small visual refinements,
  each render-loop verified (§3.12; 390/900px × light/dark, mocked GViz, local Chart.js).
  (1) **Pace-bar redesign** — the Today budget-pace card moved from the single
  continuous-pill "hybrid" (used+remaining segments) to a **two-bar, state-colour chart**:
  a `Spent` row and a `Month` row (each `label | track | value%`), a shared dotted 2px
  "Today" reference line crossing both, and the Spent fill **sienna until it crosses the
  Month line, then semantic-expense red** (`over` = `forecast > income`, algebraically
  `usedPct > monthPct`, so bar colour and verdict never disagree). `paceMarkerLeft(pct)`
  offsets the shared marker/bubble to the track column (`calc(72px + (100% - 136px) *
  pct)`). `paceBarMemory` now keys `{spent, month, marker}` (§3.5). (2) **Hero border** —
  the "Budget left" card takes a heavier `1.5px --outline` border (light) /
  `rgba(255,255,255,.22)` (dark) vs the standard `--outline-variant`, so it reads as the
  page's focal point (§3.5). (3) **Trends tiles** — `Average Daily Spend` relabelled
  `Average Daily`; `.tile-block.neutral-block` gained an `--outline` border (the base
  `--outline-variant` was invisible against `--surface-container`); the overspend
  treatment kept `color: var(--semantic-expense)` but **lost the `text-shadow` glow** —
  plainer read (§3.7). (4) **Header height** — `.header-actions` `min-height: 36px`
  matches the monthnav chip so the header is the same height on Today (chip absent) as on
  Logs/Trends (§3.3). Squash-merged to `main` as `52527e1`.
- **2026-07-21 — "Spending patterns" card (§6 candidate #3):** rebuilt the Trends capture
  heatmap (`renderCaptureHeatmap` → `renderSpendingPatterns`, `#capture-heatmap` →
  `#spending-patterns`). The cell metric changed from **capture-count to spend-per-day**
  (owner-confirmed via up-front questions — the reframe departs from the old "cells for
  habit" rule, so §3.2's visual-grammar rule was amended; **kept the sienna ramp**, not
  the references' red, per §8 "steal patterns, not palettes", which keeps semantic red
  free for expense figures). Ramp is now **self-scaling** (`ceil(spend/maxSpend×4)` over
  the window's busiest non-future day). Added a card-local **Weekly/Monthly toggle**
  (`setPatternPeriod`, reusing the modal `.type-toggle` slider; re-renders only this card
  so it dodges the insight typewriter replay and the `renderedKey` skip), a summary
  **chip** (`.sp-chip`: `Month Year • N days • ↗/↘ RM total • Avg RM/day`, trend vs the
  prior week/month), and a `Less → More` **legend** (`.sp-legend`). Switched the grid to
  **Monday-first** (was Sunday-first). Weekly = the current Mon–Sun week (single 7-cell
  row, no date numbers, independent of the month chip); Monthly = the `viewMonth`
  calendar. Reused existing helpers (`isoDateOf`/`weekMondayIso`, `_expenseRowsFor`/`_sum`/
  `_shiftMonth`, `formatCurrency`). Verified with the render loop (§3.12): Monthly+Weekly
  × light/dark × 390/900px + reduced-motion, zero page errors; hand-checked chip
  totals/averages, ramp levels (max-spend day = `hm-l4`), Monday-first alignment
  (`leadBlanks`), dashed future days, weekly 7-cell/no-number layout, and
  `scrollWidth == clientWidth` across repeated toggle flips.

---

## 8. Key Learnings & Principles

- **Array-return schema** is the unlock: one prompt change (always return a list)
  handles single/multi-entry/multi-day/split with one append loop — no separate code
  paths.
- **Validation philosophy: fix quietly, drop loudly.** Silent coercion for anything
  fixable (currency noise, off-list category, bad date), visible drops only for
  genuinely unwritable rows.
- Prompt-driven logic (dates, splits) needs **real-world eyeballing** — unit tests can't
  cover the LLM's reasoning, only the deterministic guardrails around it.
- **Digest as pure sheet math** (no LLM) keeps it free and instant — one source of truth
  reusable across push and pull surfaces.
- **Single implementation beats duplication:** extraction/validation briefly lived in
  two repos — exactly the drift risk that made retiring the bot attractive.
- **Steal patterns, not palettes.** Finance-app refs gave the *structure*; reskinning
  into Alfred's tokens kept one coherent system.
- **One shared component beats per-tab cards** (`tile-block` let dead CSS be deleted).
- **A metric is more useful paired with its baseline** (the pace bar only became
  meaningful with the "Today" marker to read it against).
- **Variable-radius pie needs restraint** (`0.92 + 0.08×share`; the first pass at
  `0.72 + 0.28` lopsided the circle). **Retired 2026-08-04** when the chart became a
  donut — the effect scaled `outerRadius` only, which reads as varying *ring thickness*
  once there's a hole. An encoding that was merely subtle on a pie became wrong on a ring.
- **Move labels off the canvas the moment there's DOM that can hold them.** The pie's
  name+amount callouts needed ~100 lines of hand-rolled canvas layout — angle routing,
  vertical de-collision, on-canvas clamping — to say what a plain list says for free, with
  real text, theme tokens and the existing counter/bar animations. The list also had room
  for share-of-total, which the callouts never could.
- **Assert that a chart *painted*, not just that it's configured.** The donut's config,
  arc radii and colours can all be correct while the canvas is blank. Reading pixels back
  (`getImageData`) is the only check that catches it — and sample a segment's *mid-angle*,
  since 12 o'clock is a seam once `spacing` is on.
- **Pinning a clock in the render loop freezes Chart.js too.** Its animator reads
  `Date.now()`, so a constant stub leaves every arc at circumference 0 — a blank chart that
  config-level assertions pass happily. Pin the *date* with an offset that still advances.
- **Chart.js custom canvas draws must be gated by `canvas.id`** — ungated plugins bleed
  onto every chart on the page.
- **Always eyeball mobile widths, not just desktop** — tiles going full-width while
  charts stayed capped was invisible on desktop, obvious on a phone.
- **A horizontal transform + `position:fixed; right:0` = a mobile zoom trap** — see
  §3.2; caught by measuring `scrollWidth` in Playwright, not by eye.
- **Compute the numbers, let the LLM only phrase them** — the model can never misstate a
  figure, and the deterministic half ships as a complete free/offline feature; the LLM
  is a phrasing upgrade, not a dependency.
- **A static site can't hold a secret.** Anything needing the OpenAI key goes through
  Apps Script Script Properties; public-by-design values (Firebase config, VAPID key,
  the 8891 write key) are fine in page source; the allow-list guards the metered spend.
- **Apps Script can be the whole backend — with two crypto-shaped edges:** no raw Web
  Push (no ES256/ECDH) so push goes through FCM, whose RS256 SA JWT it CAN sign; and
  FCM's page SDK must be handed our SW registration explicitly on a project-pages path.
- **A manifest can't carry per-user state** — `start_url` is static, so identity needs a
  localStorage fallback for the installed-app launch path.
- **Cross-origin from GitHub Pages: two things or it silently fails** — the response
  needs `Access-Control-Allow-Origin` (Apps Script sends it), and requests go as
  `text/plain` to skip the CORS preflight. Make optional calls non-blocking (fallback +
  timeout + thinking state) so an upgrade never becomes a hard dependency.
