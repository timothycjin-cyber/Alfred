# CLAUDE.md

*Last updated: 2026-07-21 — **"Spending patterns" card (§6 candidate #3, §3.7).** The
Trends capture heatmap was rebuilt into the "Spending patterns" card: each cell now tints
by **spend per day** (owner-confirmed reframe away from capture-count), keeping the sienna
intensity ramp so semantic red stays reserved for expense figures (§3.2 rule amended).
Adds a card-local **Weekly/Monthly toggle**, a summary **chip** (`Month • N days • ↗ RM
total • Avg RM/day`), a `Less → More` **legend**, and switches to **Monday-first**.
Weekly = the current Mon–Sun week (single row, no date numbers); Monthly = the `viewMonth`
calendar. Render-loop verified (Monthly+Weekly × light/dark × 390/900, reduced-motion;
hand-checked totals/averages, ramp levels, Monday-first alignment, no horizontal overflow
across toggle flips). Earlier same-day banner — **Today/Trends UI polish pass (PR #47):**
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
| 4 | Source | `web` / `web-image` (capture sheet), `dashboard` (plain FAB add), `telegram` / `telegram-image` (historical rows from the retired bot) |
| 5 | Type | Expense or Income |
| 6 | UID | Short unique id, e.g. mqx393vfm58v. Apps Script generates `Date.now().toString(36)` + random; rows from the retired bot are 12-char hex. Never assume a format — treat as opaque. |
| 7 | User | User id (integer stored as string; historically the Telegram chat_id — kept as the identity key). Written on every add/edit. Legacy rows backfilled via Find & Replace in col H. |

**Income Categories:** Salary, Freelance, Bonus, Investment, Side Income, Reimbursement, Other Income
**Expense Categories:** Food & Dining, Transport, Bills & Utilities, Shopping & Groceries, Subscriptions, Entertainment, Other

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
- `add` / `edit` / `delete` — row writes; `handleAdd`/`handleEdit` write User col H; `handleAdd` honors a client-supplied `uid` (backward-compatible — older clients get a server UID). Helpers: `findRowByUID()`, `generateUID()`, `backfillUIDs()`.
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
habit" when the grid counted logging activity; that habit metric is retired.)

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

Composition (scroll-peek order): **hero → tiles → glance line → budget-pace card.**

- **Hero** (`.hero-card`, `#today-hero`): label **`Budget left`** (income − expense);
  ink-black gradient in dark mode, monochrome off-white in light. **1.5px `--outline`
  border** (light) / `rgba(255,255,255,.22)` (dark) — deliberately heavier than the
  `--outline-variant` border every other card uses (2026-07-21), so the hero reads as
  the page's focal point. Privacy blur toggle (`toggleHeroPrivacy()` → `.value-hidden`),
  embedded 6-month net-trend mini bar chart (`heroChart`, current month sienna, others
  green/red by sign; `minBarLength: 4` + `heroBaselinePlugin` faint zero line, gated on
  `canvas.id === 'hero-trend'`). Sub-copy "In the green" / "Watching the leak".
- **Tiles** (`#today-tiles`): **`Budget`** (month income) / **`Expenses`**,
  tinted surfaces (`--wash-income`/`--wash-expense`), `▲/▼ X% vs last month` chips with
  `.good`/`.bad` valence (expenses dropping reads green).
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
  72px/64px side margins already exceed the bubble's ~27px half-width. Quiet verdict
  line (`.income-bar-verdict`) reusing the same forecast-vs-income comparison as the
  Trends overspend glow — `Overspending — off track by RM X` (semantic-expense) or `On
  track — budget surplus of RM X` (semantic-income), where X = `|forecast − income|`
  (avg daily = MTD spend ÷ elapsed days, forecast = avg daily × days in month); the same
  `over` boolean drives both the verdict and the Spent bar's colour flip, since
  `forecast > income` is algebraically equivalent to `usedPct > monthPct`.
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
- **Export:** slim right-aligned `.logs-toolbar` icon row atop `#logs-view` (moved from
  the header). `openExportModal`/`exportCSV` scope + filename + error copy read
  **`viewMonth`/`viewYear`** — exporting exports the chip's month.
- `CAT_COLORS` + `CAT_ICONS` live at module scope (shared with the pie / txn rows).

### 3.7 Trends tab

Everything computes from `viewMonth` (`vRows`/`vIncome`/`vExpense`/`vCatData`).
Composition: insight strip → tiles → spend/archive card slot → cumulative line → pie →
capture heatmap → archive shelf (bottom).

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
- **Tiles:** live month → `Average Daily` + `Forecast ~RM x`; closed month → `Average
  Daily` + `Total Spent` actuals (label shortened from "Average Daily Spend"
  2026-07-21). **Overspend treatment:** `overspend = isCurrentMonth && vIncome > 0 &&
  forecast > vIncome` puts `.overspend` on **both** tile values — `color:
  var(--semantic-expense)`, color only, no glow (the `text-shadow` was removed
  2026-07-21 — plain color read as clearer than the soft-glow treatment). Never on
  closed months. This is a sanctioned semantic-red use (overspend warning).
  `.tile-block.neutral-block` (these two tiles only — they sit directly on the pane,
  unlike Today's income/expense tiles) also gets a heavier `--outline` border in place
  of the base tile's `--outline-variant` (2026-07-21), for the same reason as the hero
  card border above: `--outline-variant` read as almost invisible against
  `--surface-container`.
- **Spend-card slot** (`#income-bar-card`): **hidden on the live month** (Today owns the
  pace bar); closed months show the **archive card** (net, top category, days logged
  X of N, quiet pace verdict).
- **Cumulative line:** current cumulative vs "last month" (= viewMonth−1) reference line
  in outline gray per theme (`#6C757D`/`#ADB5BD`) — reference, not warning.
- **Pie:** solid, variable-radius (`0.92 + 0.08 × share` — restraint deliberate),
  `pieLabelsPlugin` on-slice bold %s (≥8%) + name+amount callouts with elbow leaders for
  **every** slice (tooltips disabled; callouts route left/right by angle, de-collide
  vertically, 32px min gap). Drawn in `layout.padding`; pie at `radius:'90%'` in a
  380px container. ⚠️ **Both plugins gated on `chart.canvas.id === 'donut'`** — ungated
  plugins bleed onto every chart.
- **Category palette** (validated with the dataviz six-checks, light+dark): Food &
  Dining `#C2542D`, Transport `#0891B2`, Bills & Utilities `#D97706`, Shopping &
  Groceries `#2684FF`, Subscriptions `#6554C0`, Entertainment `#DB2777`, Other `#495057`
  (deliberate neutral). Semantic expense red is reserved for amounts/deltas — never a
  category.
- **Spending patterns** (`renderSpendingPatterns`, `#spending-patterns`; was the
  capture heatmap, rebuilt 2026-07-21): a cell grid tinted by **spend per day** on the
  sienna `hm-l0..l4` ramp (the ramp lives once in CSS). **Monday-first.** A card-local
  **Weekly/Monthly toggle** (`.sp-toggle`, reusing the modal `.type-toggle` slider;
  handler `setPatternPeriod` re-renders **only this card**, so it neither replays the
  insight typewriter nor needs folding into the Trends `renderedKey`) scopes the grid:
  **Monthly** = the `viewMonth` calendar with date numbers; **Weekly** = the current
  Mon–Sun week as a single 7-cell row with **no date numbers** (day identity from the
  header + tooltip), independent of the month chip (the rest of Trends still follows it).
  The ramp is **self-scaling**: `level = ceil(spend / maxSpend × 4)` over the window's
  busiest non-future day (`hm-l0` = zero-spend, `hm-future` = dashed). A summary
  **chip** (`.sp-chip`) reads `Month Year • N days • ↗/↘ RM total • Avg RM/day` (N =
  `daysInMonth`/7; avg = total ÷ N; trend arrow vs the prior week/month, omitted with no
  prior data — arrow valence follows spend delta: up = expense-red, down = income-green)
  and a `Less → More` **legend** (`.sp-legend`) surfaces the ramp swatches. Spend is
  summed from expense rows only (`isExpense`), active-user-filtered.
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

**Pending:** the unscheduled candidate features (§6).

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
- **Recurring expenses.** An expense that **auto-generates on a daily / weekly / monthly
  schedule** (rent, subscriptions, standing bills), managed from a **pop-out sheet
  within the Logs page**. Supersedes the old "future-dated entries UX" note. Open
  questions for the design pass: where generation runs (an Apps Script time trigger
  writing rows, mirroring the digest trigger, vs. client-side materialization on load),
  how far ahead rows are created, and how to edit/stop a series.
- **"Spending patterns" — heatmap rebrand + controls. ✅ DONE (2026-07-21, §3.7).** The
  Trends heatmap was rebuilt as the "Spending patterns" card: retinted from capture-count
  to **spend-per-day** (owner-confirmed reframe; keeps the sienna ramp per §8 "steal
  patterns, not palettes"), Monday-first, with a Weekly/Monthly toggle, a summary chip,
  and the `Less → More` legend. One deliberate scope cut: **Weekly = the current week
  only** (not navigable) — a later pass could add week stepping. (Superseded the old v2
  Phase 6 heatmap acceptance sweep.)

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
  `0.72 + 0.28` lopsided the circle).
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
