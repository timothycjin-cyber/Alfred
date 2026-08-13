# CLAUDE.md

*Last updated: 2026-08-13 (third pass) — **The FAB long-press accelerator is REMOVED (§3.3,
§3.8).** Owner call, on the only evidence that counts: **it was never once reliable on the
device.** Three attempts — the build (104/104), a device-fix pass (141/141, merged as #66) and an
arm-on-hold / launch-on-release pass (180/180, pushed and **never merged**) — and a real phone
disagreed with the suite every time. The
FAB is a **plain tap** again, with its inline `onclick="openCaptureModal()"` restored, and
`wireFabGestures`, `openCameraDirect`, `FAB_LONG_PRESS` and `_fabCameraShortcut` are all deleted.
**The camera is exactly where it always was: the camera button inside the capture sheet.** The
diagnosis that stands is not "we picked the wrong number" but **the class of feature was wrong
for this harness**: a press-and-hold on the app's primary control is decided by main-thread
timing, an off-main-thread platform gesture, a file-chooser activation rule and a camera intent's
own latency — **not one of which a desktop Playwright run can model**, so a green suite carried
no information about the thing that kept failing. The unmerged third attempt is the clearest
illustration: it *disproved its own leading hypothesis* with trusted-touch instrumentation, then
shipped a fix built on the surviving one — guessing, with a passing test attached. ⚠️ **The cost was never one tap; it was the
FAB.** A hold that silently does nothing sits on the control the whole app funnels through, and
"press it again" is the user's correct response to it. An accelerator is not worth making the
primary action feel unreliable. ⚠️ **`repaintNavCluster()` STAYS** — it is a different fix for a
different bug, **confirmed working on the device**, and the stale nav-pill blur still happens
returning from the in-sheet camera. Do not garbage-collect it along with the gesture.
⚠️ **`materializeRecurring()` stays in `requestIdleCallback`** — its long-press justification is
gone, but not blocking the main thread right after first paint is good on its own terms.
Render-loop verified **84/84** across three configs, **with three negative controls run first**.
Front-end only — no Apps Script change, no redeploy. **§6, §7 and §8 keep the prior entries**:
the feature is removed from the app, not from the record, and the platform learnings it produced
are the most transferable thing it left behind.
Prior banners are deleted (2026-08-13). Eighteen of them had stacked up, each a
paragraph-length retelling of a change that §7 already narrates at equal or greater
length — 31KB of the file, or 13%, spent saying things twice. **The convention from here
is one banner: the current change only.** When it is superseded, it moves to §7 rather
than being pushed down into a queue. Two facts the old stack carried that live nowhere
else: earlier roadmap files were consolidated into §6 (2026-07-19), and code comments in
`index.html` still reference roadmap phase names — §6 and §7 keep those names
resolvable.*

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
semantic red. **Amended 2026-08-08:** the rule is *length* = money, not *horizontal*
specifically — the Logs day chart (§3.6) encodes a day's spend in a **vertical column's
height**, because there the horizontal axis is time (Mon→Sun) and the column doubles as
the tap target, so width has to stay fixed. Still a bar, still semantic-expense; a
zero-spend day drops to `--outline-variant` gray rather than a very short red bar, because
a rail isn't an expense.

**Type (amended 2026-08-10, second pass).** Roboto Flex is a **variable font**, so
`font-variation-settings` on `body` **overrides `font-weight` on every descendant**. `body`
therefore sets **`'wdth' 100` only** — never `'wght'`. ⚠️ **Never reintroduce a `wght` pin
there**: it silently flattens the whole type ramp to regular while every stylesheet still
*says* 700/800/900, and `getComputedStyle().fontWeight` keeps reporting the declared value, so
nothing in the DOM reveals it. The only classes that legitimately set the axis are
`.hero-amount` and `.archive-net`, which do it deliberately and locally. (This list read
`.header-title, .hero-amount, .archive-net` until 2026-08-13 — `.header-title` went with the
header on 2026-08-11 and the note was not updated.) The
ramp after the rebalancing sits at **500–800**, with 650/750 used where a half-step reads
better; the rule of thumb for anything new is one step below what a flattened rendering would
have tempted you into (900 → 750/800, 800 → 700, 700 → 600).

**A second face, for one job (2026-08-11).** `--font-display` (**Newsreader**, falling back to
the platform serif) is the app's only non-Roboto face, and it sets exactly one thing: the month
as a pane's masthead (§3.4). It is variable (400..700), so the condensed state's heavier cut is
a real weight rather than a synthesised one. **Don't spread it** — the editorial serif reads as
a masthead precisely because nothing else on the page uses it. ⚠️ Verifying it needs *rendered
pixels*, not advance width: "August" at 31px measures 93.6px in Newsreader and 93.0px in Roboto
Flex, so a width probe passes with the serif never loading.

**Colour, amended 2026-08-10 (second pass).** Three rules the pass added:

- **Light and dark semantic tokens are tuned separately.** `--semantic-income` /
  `--semantic-expense` were one pair tuned against dark surfaces and reused on white, where
  they cleared 2.9:1 and 4.1:1. Light is now **#007A52 / #C62828** (5.4:1 / 5.7:1); dark keeps
  **#2ECC71 / #FF4D4D**. A token that has to read on both grounds needs two values, not one.
- **Good news is stated, not coloured.** Semantic green is no longer spent on the ordinary
  case: `.tile-chip.good`, `.today-good` and the on-track pace strip are **neutral ink**. Only
  the *bad* states (`.tile-chip.bad`, `.income-bar-status.over`) keep semantic colour and the
  solid fill. Five components were delivering the same green reassurance at once, which is
  exactly what leaves nothing in reserve for the one component with something wrong to say.
  Same reasoning as the "only overspending gets a solid fill" rule already in §3.5.
- **Sienna is the only primary.** `--sienna` fills the FAB, `.btn-primary` and
  `.capture-send`; `--primary` (near-black / near-white ink) is no longer a button fill, so
  two things never both claim primary. Red is also **not a selection state** — the
  `.type-toggle` active segment is `--on-surface`, because the slider already marks it and
  red means money going out everywhere else in the app.

**Icons.** Category icons are **inline SVG line icons inheriting `currentColor`**, not emoji
(2026-08-10). An emoji glyph is coloured by the OS font, so a `CAT_COLORS`-tinted chip carried
a differently-coloured glyph — a cyan Transport chip with a red car. Both call sites
(`categoryBreakdownHtml`, `txnRowHtml`) pass **`color:` as well as the background tint**, so a
chip is exactly one hue. ⚠️ **The `CAT_ICONS` map now also holds an `"Income"` key** — it is
not an expense category, and income rows look it up by name rather than falling through to
`"Other"`. This retires the app's last **rendered** emoji apart from the ⚠️ in the failed-load
state (§6, not in scope). ⚠️ A `grep` for emoji is not clean even so: a `💰` survives in the
comment above the `CAT_ICONS` `"Income"` key, explaining what it replaced, and `⚠️` appears in
nineteen code comments. Nothing reaches the DOM but the failed-load glyph.

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

Three text tabs in a 280×**56**px glass pill (4px padding, 4px gaps), Today is the default
landing tab. `VIEW_ORDER = ['today','logs','trends']`; panes `#today-view` /
`#logs-view` / `#trends-view`. The pill was 48px until 2026-08-10, which rendered tabs
38–42px tall — under the 44px minimum; at 56px they measure 46–51px.

- **Slider math:** width `calc((100% - 16px) / 3)` (padding box minus 2×4 padding +
  2×4 gaps, over 3); slot n = `translateX(calc(n·100% + n·4px))`, set in `switchView()`.
  It is `top: 4px; bottom: 4px`, i.e. **vertically elastic**, so the pill's height change
  needed nothing here — but assert that rather than assume it.
- **FAB:** 56px sienna circle floating 12px above the pill, centered; `.bottom-bar` is a
  column stack anchored `bottom: calc(24px + env(safe-area-inset-bottom))`. Neutral
  elevation shadow (`0 6px 16px rgba(0,0,0,0.18)`); white icon; `body.modal-open-state`
  rotate. **Tap opens the capture sheet — that is the FAB's whole behaviour** (§3.8). The
  inline `onclick="openCaptureModal()"` is back on the markup, and there is **no gesture
  handling on this button at all**: the long-press → camera accelerator was removed 2026-08-13
  after three passes never made it reliable on a device (§6). ⚠️ **Do not re-add a press-and-hold
  here without a way to verify it on hardware** — the render loop cannot see any of what decides
  it, and the FAB is the control the entire app funnels through. The `user-select`,
  `-webkit-touch-callout` and `touch-action` overrides went with the gesture; the button is back
  to UA defaults.
- **The nav pill repaints itself on resume** (`repaintNavCluster()`, 2026-08-13). ⚠️ This works
  around a **Chromium/Android compositing bug, not anything the app does wrong**: returning from
  a camera intent in a standalone PWA, `.floating-nav`'s `backdrop-filter` layer comes back
  holding a **stale snapshot** — blurring whatever was behind it before the app went away, with
  its own labels and slider unpainted. Nothing invalidates the layer on the way back, because a
  **cancelled camera fires no event at all**. `.floating-nav.repainting` drops the filter, a
  forced style flush applies it, and two `requestAnimationFrame`s put it back. Wired to
  `visibilitychange` (visible only) and `pageshow`, plus a call from `openCameraDirect()` so the
  snapshot taken on the way *out* is fresh too. ⚠️ **Deliberately not `will-change`** —
  permanently promoting the layer is as likely to entrench the stale snapshot as to fix it.
  ⚠️ **Not reproducible in the render loop**; the suite asserts the wiring and the class's
  effect, and the real symptom needs a device.
- **⚠️ Derived numbers (re-derive ALL if the cluster moves — and the PILL'S HEIGHT is part
  of the cluster, which is what the 2026-08-10 target pass had to re-derive):** FAB center
  = **120px** + safe-area above the viewport bottom (24 bar + **56** pill + 12 gap + 28
  half-FAB). Capture-sheet overlay
  `padding-bottom: calc(158px + env(safe-area-inset-bottom))`; bloom
  `transform-origin: 50% calc(100% + 38px)` (158 − 120 — **unchanged**, because both terms
  moved by the same 8px). `body` `padding-bottom: calc(172px + inset)` clears the cluster;
  toast sits at `bottom: calc(160px + inset)`.
- **Touch targets (2026-08-10):** `.icon-btn` and `.capture-send` are **44px** square (were
  36px — and they share the `.capture-card` row, so they resize together or that row's
  alignment breaks); `.btn` carries `min-height: 48px`, `.type-toggle button` `min-height:
  44px`, `.logs-tail` 14px padding (13px rendered 43px — one pixel short, only findable by
  measuring). ⚠️ **Day columns are the documented exception**: they are a seventh of the
  track and never grown (§3.6, a locked decision), so at 390px they are ~42px *wide*. The
  rule they meet is the one §3.6 states — **≥44px tall, with the whole cell (track +
  label) as the hit area**. ⚠️ **Measure targets with the sheet OPEN**: a closed overlay is
  `scale(0.08)` and reports a 44px control as 3.5px.
- **There is no header** (deleted 2026-08-11). `.header`, `.header-title`,
  `.header-actions` and `#header-monthnav` are all gone, along with `renderHeaderMonthNav()`
  and the `.monthnav*` CSS. It was 77px of sticky chrome on every tab — 1.25rem of padding
  either side of a `min-height: 36px` row plus a border — holding one word of branding and
  a `display:none` div; the 36px floor had been sized for the export and bell buttons that
  Phase B moved to Logs and hid. On Trends and Logs the month is now the pane's masthead
  (§3.4); **since 2026-08-11b every tab has one**, and the pill above it is the only thing
  that stays. ⚠️ **Two things the header was silently doing had
  to be picked up elsewhere:** the **status-bar inset** in standalone PWA mode (now on
  `.container`, with `body.has-masthead` dropping it to 12px where the masthead carries it
  instead — never both), and the **sticky offset** `logsScrollToYm()` subtracted. That second
  one is **gone entirely** — `stickyTopOffset()` was deleted 2026-08-11b, because nothing at
  the top of the page is sticky any more; a jump parks a header at `LOGS_PARK` instead (§3.6).
  There was never a bell after Phase F, and never a refresh icon
  (pull-to-refresh covers it; `@keyframes refreshSpin` survives for the capture-send
  spinner).
- ⚠️ **`env(safe-area-inset-*)` is inert app-wide, and always has been** (found 2026-08-11b).
  The viewport meta is `width=device-width, initial-scale=1.0` with **no `viewport-fit=cover`**,
  so the UA insets the layout viewport itself and every `env(safe-area-inset-*)` in the
  stylesheet resolves to **`0px`** — on a phone, in an installed PWA, everywhere. That covers
  the FAB cluster's derived geometry above as well as the masthead and pill offsets. Nothing is
  broken by this (the UA is doing the insetting), and the expressions are kept because they
  become correct the day the meta changes — but **a "does it clear the status bar?" check
  passes vacuously today**, and adding `viewport-fit=cover` would shift every one of the
  derived numbers at once. Not a change to make casually.

### 3.4 Month state — the masthead and the lift-off pill

Still **one contextual selector** (roadmap v3 decision 1). Rebuilt 2026-08-11b: the period is on
**all three tabs**, and it has two representations of the same thing — a **masthead** at the top
of the pane, and a **pill** that flies into the top-right corner as you scroll.

**Governing principle: the masthead names the period, it never measures it.** No figure goes up
there, on either representation. This is what settles the hairline, the sub-line, and every
future request to put "budget left" in the corner — such a request is out of scope by
definition, not by argument.

- `activeMonth`/`activeYear` are **pinned to the real current month at load** and never change.
  `viewMonth`/`viewYear` are shared by Trends and Logs and **never persisted** — every launch
  opens on the real current month, so a stale month can't be misread as now.
- **Per tab:** Today reads the **date** — `Monday` large, `11 August` in a quieter `.sm` span,
  pill `11 Aug` — and is **inert**: no caret, `tabindex="-1"`, `aria-haspopup="false"`, and
  `openMonthPicker()` refuses it. Today's period is a **day**, so the unit itself distinguishes
  a readout from a control and no caret is needed to say so. Trends and Logs read
  `MONTHS_FULL[viewMonth]` + a quiet year, pill `Aug 2026`, and open the picker.
- **Visibility is one rule for all three tabs:** show once `earliestDataMonth() !== null`.
  `body.has-masthead` is what stops `.container` applying the status-bar inset a second time, so
  the two must stay in step.

**The lift-off.** `--p` is a registered `@property` number, 0 at the top of a pane and 1 once the
hand-off is complete, driven by a **scroll-driven animation on `body`** (`animation-range: 0
86px`) with a `CSS.supports`-gated rAF fallback that attaches only where `animation-timeline` is
unsupported. It replaced a binary `.condensed` class toggled by a scroll listener with 48/36
hysteresis: a threshold can only snap, and a hand-off has to be watchable.

- ⚠️ **It is NOT off the main thread.** Only `transform`/`opacity`/`filter`/`backdrop-filter` get
  the compositor; a scroll-driven animation of a *custom property* recalcs style every frame and
  re-resolves every `var(--p)` consumer. It is still far cheaper than the listener it replaced —
  the win is "no JS", not "no work" — so **keep the consumer list to the two elements it has**.
- ⚠️ **Never animate `font-size`, `height`, `top` or `left` on this timeline.** They reflow, and
  a reflow per frame stutters. The masthead **fades** (opacity + transform) rather than shrinking,
  which is exactly why the condensed state's padding and font-size transitions had to go.
- ⚠️ **`animation` before `animation-timeline`.** The shorthand resets the timeline to `auto`;
  reordering those two lines silently unhooks it and pins `--p` at 1.
- `#masthead` is **`position: static`** — the pill took over the job of staying. It still lives
  **outside `.container`**, and nothing up here is ever `position: fixed` (§3.2's overflow trap).

**The pill** (`#month-pill` in `#month-rail`) is the masthead's destination.

- The **rail is a zero-height `position: sticky` strip** with `pointer-events: none`. That is what
  lets the pill stay put with nothing being fixed, at no layout cost, without the invisible band
  across the top of every page becoming a dead zone.
- **Travel, not a cross-fade:** `--pill-travel` is measured at runtime by `syncPillTravel()`,
  which walks **both `offsetParent` chains** (`absLeft()`) and subtracts `offsetWidth * 0.14` to
  compensate the `scale(0.86)` about `transform-origin: 100% 50%`. ⚠️ `offsetLeft`, never
  `getBoundingClientRect()` — both elements are mid-transform on every frame, so a rect would
  measure the animation and feed it back into itself. Re-measured from `renderMasthead()`, on
  `resize`, and on **`document.fonts.ready`** (the pill inherits the UI face, so a late webfont
  changes its width).
- **38px tall, under the 44px floor**, and acceptable *only* because the pill is never the sole
  route to anything: the masthead button above it is 44px+ and opens the same picker. **Do not
  make the pill the only tappable representation.**
- ⚠️ **`pointer-events` is gated by discrete keyframes on the pill's own scroll timeline**
  (`mh-pill-hit`, flipping at 40%). At `--p: 0` the pill is transparent but still in the hit path,
  so a tap in the corner would land on a button nobody can see. It **must** live on the pill — the
  element that receives the events — not in `body`'s animation list. `#masthead` carries the
  mirror (`mh-fade-out` at 74%, where `calc(1 - --p * 1.35)` reaches zero) because a `static`
  element that has faded to nothing is still hit-testable where it overlaps the viewport.
- **`tabindex="-1"` permanently.** The pill is a pointer-only duplicate of a control that is
  always in the DOM; without this, Tab lands on a fully transparent button at the top of a pane.
- **Reduced motion** drops `transform` on both, keeping opacity linked to `--p` — the hand-off
  still reads, nothing flies.

**Gestures** (`wirePillGestures()`, `#month-pill` only, skipped when `.inert`): **swipe left for
the next month, right for the previous, long-press (500ms) to return to now.**

- ⚠️ **The pill is a button and a swipe target on the same element.** `DRAG_SLOP` (6px) is what
  keeps them apart, and ⚠️ **the click after a committed swipe is EATEN in the click handler,
  never out-raced.** The obvious `setTimeout(() => dragged = false, 0)` in `pointerup` is a real
  bug: `click` is dispatched as its own task and a 0ms timer can win it. For the same reason the
  picker opens **from that handler, not an inline `onclick`** — an inline handler is registered at
  parse time and fires before anything added later could suppress it.
- ⚠️ **`DRAG_CAP` is 12px and must stay below the pill's 16px right gutter.** The rail is outside
  `.container`'s `overflow-x: clip`, so a wider deflection pushes the pill past the viewport's
  right edge and widens the document — the mobile zoom trap. The idle `scrollWidth` check cannot
  catch this; it only exists mid-drag.
- **No separate bounce animation.** At a bound the rubber band is already deflected, and letting
  it settle back through `.settling` *is* the bounce — which also keeps the pill's `animation`
  shorthand free for the `pointer-events` gate riding on it. `--drag` is registered so it can be
  transitioned, but ⚠️ **the transition is scoped to `.settling`, never the base rule**, or every
  `pointermove` is smoothed and the pill lags the finger.

**`stepViewMonth(delta)`** is the swipe's only caller and returns whether the month moved.
⚠️ **It steps through `pickerMonths()` — months holding data plus the current one — not through
the calendar.** The picker already refuses to offer a gap month, and with the chevrons and the
shelf gone these are the only two doors left, so they have to agree about what a month is. With
data in June and August but none in July, a swipe back from August lands on **June**.

**`applyViewMonth(y, m)` is still THE month-change handler** (§3.4's long-standing rule): the
picker, the swipe and the long-press all route through it. **Behavior fork:** on Trends →
`calculateAndRender()`; on Logs → `logsScrollToMonth()`, no filtering, no re-render.

**Month picker** (`#month-overlay`, `openMonthPicker(trigger)`) is unchanged apart from having
**two triggers** — a module-level `_pickerTrigger` records which one opened it so `aria-expanded`
lands there; focus return needed no change, since `trapModalFocus()` already captures
`document.activeElement`. It stays the **ledger-list form** (each row carries the month's spend
and a proportional bar), reusing `.modal-overlay.align-bottom.sheet-rise`. ⚠️ `.sheet-rise` is
required — `.align-bottom`'s `transform-origin` is FAB-anchored and this sheet opens from the
*top*. **`pickerMonths()`** (memoised on `dataStamp`) returns months **HOLDING DATA plus the
current month**, newest first, grouped under a year header; future-dated rows are excluded.
⚠️ The name is `pickerMonths()`, not `monthTotals()` — that one is taken.

**Per-tab scroll memory** lives in `switchView()` (`scrollMemory`), replacing its unconditional
`window.scrollTo(0, 0)`. Returning to a scrolled tab keeps the pill lifted, which is the only way
it reads as the app's fixed point during the shared-axis slide rather than something that fades
out and back on every switch. ⚠️ **Restore after `calculateAndRender()`** — before it the
incoming pane is empty and the browser clamps the scroll to a short document.

### 3.5 Today tab

Composition (scroll-peek order): **hero → two tiles (+ detail panel) → glance line →
budget-pace card.**

- **Hero** (`.hero-card`, `#today-hero`): label **`Budget left`** (income − expense);
  ink-black gradient in dark mode, monochrome off-white in light. **1.5px `--outline`
  border** (light) / `rgba(255,255,255,.22)` (dark) — deliberately heavier than the
  `--outline-variant` border every other card uses (2026-07-21), so the hero reads as
  the page's focal point. Embedded 6-month net-trend mini bar chart (`heroChart`, current month sienna, others
  green/red by sign; `minBarLength: 4` + `heroBaselinePlugin` faint zero line, gated on
  `canvas.id === 'hero-trend'`). Sub-copy "In the green" / "Watching the leak".
  **The running month is drawn as provisional** (2026-08-10): a `heroLiveMonth` flag
  (`activeMonth`/`activeYear` vs now) washes the last bar to `hexToRgba('#C2542D', 0.38)`
  and appends a `.hero-chart-note` reading `August is 10 days in` under the chart. On the
  10th, nine days were otherwise being read against thirty-one-day bars on the same axis.
  (`activeMonth` is pinned to now at load per §3.4, so the flag is true in practice —
  it is still written as a derived flag, and the note must be built from it, not
  unconditionally.) ⚠️ **There is no privacy blur toggle** — this bullet described one
  (`toggleHeroPrivacy()` → `.value-hidden`) until 2026-08-13, and neither identifier has
  existed in the file for as long as the history goes back. The only trace is `.hero-top`
  still being `justify-content: space-between` with a single child, where the button sat.
  Recorded rather than silently deleted, because the entry had been sending readers to
  look for a control that isn't there.
- **Tiles** (`#today-tiles`, a 2-col grid → **two headline tiles**): **`Income`** (month
  income) / **`Expenses`** — tinted surfaces (`--wash-income`/`--wash-expense`), `▲/▼ X%
  vs last month` chips with `.good`/`.bad` valence. ⚠️ **The income tile says `Income`, not
  `Budget`** (2026-08-10): the hero 200px above says `Budget left`, and the same word for
  two different quantities was the collision. The **hero keeps `Budget left`**; the data
  model, the stored `'Income'` value, the element ids and `INCOME_CATEGORIES` are all
  unchanged — this is label text only, and it narrows the Phase D budget rename for
  transaction *type* labels specifically. **`.good` chips are neutral, `.bad` chips keep
  semantic red** (§3.2 — good news is stated, not coloured).
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
  `drillState` does for the drill-in sheet (§3.14).
- **Glance line** (`computeTodayGlance` — the digest math as client-side JS): today's
  spend vs the 30-day spend-day average; zero-state "Nothing logged today yet."
  `.today-good` is **neutral ink** since 2026-08-10 (§3.2); `.today-bad` keeps the red.
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
  an alert because it isn't always on, so on-track stays quiet. **Quieter still since
  2026-08-10** — the on-track strip dropped its `--wash-income` background and
  `--semantic-income` text for a **transparent ground and `--on-surface-variant` ink**,
  keeping only the hairline top border, so the verdict raises its voice solely when it has
  something to say (§3.2). `--strip-over` is
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

`renderLogsLedger()` → `#logs-ledger`: **static week rows** under month headers. Each row
is a label, an entry count, a week spend total and a **day-column chart**. Bars for money;
no cell grids here. It reads **all** the user's rows and scopes them itself — **the current
month on open, older months appended on demand** from the tail at the bottom (see "Month
scope" below). The header month chip never filters here; it jumps.

- **NO ACCORDION — locked, and recorded so it isn't reintroduced by accident**
  (2026-08-08, second pass). Logs has no expand/collapse anywhere: no chevron, no
  `aria-expanded`, no press state, no `cursor: pointer` on the week header, and **no
  inline week transaction list**. `toggleWeek()`, `expandedWeeks`, `logsSeeded`,
  `weekBodyHtml()` and `bindTxnRowClicks()` are **deleted**. **Seeing a whole week's
  transactions at once is accepted as removed** — a day column is the only drill-in. A
  future "tap the week total for a week-scoped sheet" is possible but was explicitly out
  of scope; `txnRowHtml()` is kept as its own function so that build reuses it.
- **Bucketing — weeks CLIP TO THE MONTH they render under** (2026-08-08; supersedes the
  "a week lives under the month containing its Monday" rule). `weekSpanFor(iso)` returns
  `{y, m, startIso, endIso}` — the row's Mon–Sun week intersected with the row's own
  month — and **`startIso` is the bucket key**, unique per week per month where a bare
  Monday no longer is. A calendar week straddling two months therefore renders **once
  under each**, carrying only that month's days: `Jul 27 – 31` under July and `Aug 1 – 2`
  under August, never one row holding both. **Short weeks at a month boundary (fewer than
  7 columns) are correct, not a bug** — this is the locked decision; don't re-litigate
  it. Every row still lands in exactly one bucket, because a row has exactly one month
  and exactly one Monday-week. `weekRangeLabel(span)` is month-local by construction, and
  prints a bare `Aug 31` when a clipped week is a single day. Month headers carry
  `data-ym="Y-M"` (scroll targets). Newest first. Only weeks holding rows render
  (unchanged). `weekMondayIso()` is **gone** — nothing needed a bare Monday once the span
  carried both ends.
- **An empty week is one line** (2026-08-10). A week can hold rows and still have spent
  nothing — income only, or a future-dated entry — and it used to render a full card with
  a blank chart under `RM 0.00` in expense red, which states it badly twice over. `zero =
  spend <= 0.005` now adds `.empty-week` to the row, swaps the figure for the words
  **`Nothing spent`** in neutral ink (`.week-total.zero`), and **skips `weekDaysHtml(wk)`
  entirely** — no chart to plot, and no dead tap targets. `_weekSpend()` already excludes
  income, so an income-only week is exactly this case.
- **Day columns** (`.week-days` → `.day-col` → `.day-col-track` → `.day-col-bar`,
  `weekDaysHtml()` / `weekDaySlots()`): one column per day in the clipped span.
  **Width is fixed and encodes nothing; HEIGHT carries the money** — the bar fills a
  share of the 48px track equal to that day's share of the week's busiest day. Width has
  to stay fixed because **the cell is the only route to a day's transactions**, so it
  must not shrink with spend (this is what the horizontal-segment predecessor got wrong:
  a quiet day became an 14px sliver). Columns are `flex: 0 0 calc((100% - 6*4px) / 7)`
  and **never grown**, so a 2-day week's columns line up with a 7-day week's; short weeks
  simply render fewer, left-aligned, with no padding or stretching. `max-width: 64px`
  keeps a wide viewport from turning a 48px-tall column into a slab — past the cap the
  row just left-aligns. Zero-spend days keep a **4px stub** (`min-height`) and go
  `--outline-variant` gray (`.day-col.zero`) — a rail isn't an expense, so semantic red
  stays on money. Income never enters a column. **The track is a visible slot**
  (2026-08-10): `.day-col-track` carries a `--wash-neutral` background and `--shape-xs`
  radius, with a `--wash-hero` hover. Seven bars floating on a card read as a chart; seven
  bars sitting in seven slots read as buttons — which matters because the column is the
  only route into a day's transactions, and it also gives a zero-spend day a shape rather
  than a 4px stub adrift on the card. **Heights are per-week scaled, so columns
  are NOT comparable across weeks** — cross-week magnitude lives in the week-total figure
  beside the label. Mount-then-spring via `_dayHeightMemory` (dayIso → last height %) +
  `paintDayColumns()`, the `paceBarMemory` idiom; reduced motion paints immediately.
- **Weekday labels:** single letters `M T W T F S S` under each column
  (`.day-col-lbl`), Mon-first. **`aria-hidden`** — the cell's own `aria-label` already
  names the day, and reading both would say it twice. Single letters, not two, so they
  can never wrap at 390px (the brief's fallback, taken up front).
- **Tap targets:** each `.day-col` is a real `<button>` and **the whole cell is the hit
  area** — full allotted width, the 48px track *and* the label, ≥44px tall. Never shrink
  it to the filled portion: a zero day's visual is 4px, and its tap target is the full
  cell. `aria-label` carries day + figure (`Tue 4 Aug, RM 42.00`). `.week-days` is a
  labelled `role="group"`.
- **Day drill-in** — tapping a column opens the **shared drill-in sheet** (§3.14) with
  `openDaySheet(iso)`. Header = weekday + date, entry count, and the day's **expense**
  total (matching the column; income rows still list, badged `Budget`). Empty day reads
  `No transactions this day`, never a dead tap.
- **Month scope — current month by default, appended on demand** (2026-08-09; **supersedes
  roadmap v3 decision 2 and Phase B step 3**, and retired the scroll-sentinel auto-append
  that shipped with them — don't reinstate either from the roadmap). Logs is **not** a
  full-history scroll and **not** a month filter:
  - `logsMonthsShown` (module state, init **1**) is the scope. Older months are
    **appended, never swapped in**, so the ledger stays one continuous scroll, and it
    **only grows within a session** — a `dataStamp` bump or a tab round-trip must not
    collapse it. Only a page reload resets it. It's clamped to `_logsTotalMonths` inside
    `renderLogsLedger()` (one place — the row set can shrink under an optimistic delete).
  - ⚠️ It counts **months HOLDING DATA**, newest first — *not* calendar months back from
    now, which is what the brief's wording implied. With a gap month (data in Aug and
    June, nothing in July) a calendar count would make the tail name July and tapping it
    would reveal nothing: a dead tap. Counting data months means the tail always names the
    month it will actually show.
  - **Tail** (`logsTailHtml()`): either a `.logs-tail` button reading
    `Earlier months — show June` (the next month back **that holds data**), or, at the
    earliest such month, a `.logs-end` note reading `Nothing logged before March.` It is a
    dashed transparent boundary, not a filled button — this is a footer, not a primary
    action competing with the FAB. `--tail-dash` is its own token because
    `--outline-variant` is pixel-identical to `--surface-container` in dark mode, exactly
    where the dashes have to read as an edge. `logsMonthLabel()` year-suffixes outside the
    current year, matching the header chip, so "show December" isn't ambiguous across a
    year boundary.
  - **`loadOlderMonths()`** raises the scope by one, re-renders, and scrolls the revealed
    month's header under the sticky header. Only the new block animates: the renderer
    tags it from `_logsAppendedYm` with `.logs-new` (→ `logsAppendIn`, staggered per week
    via `--d`) and **clears the flag after that one render**, so a later re-render doesn't
    replay it. Neither `.settled` nor `.no-entrance` targets `.month-header`/`.week-row`,
    so neither suppresses the append — verified, not assumed.
- **Scroll-to-month** (`logsScrollToMonth` → shared `logsScrollToYm`): the picker and the
  pill's swipe are jump shortcuts — they grow the scope until the target
  `.month-header[data-ym]` exists, then park it at **`LOGS_PARK` (56px)** (smooth unless
  `REDUCED_MOTION`). Stepping **forward never shrinks the scope**; it only scrolls. It
  bypasses `calculateAndRender()` entirely, so the `renderedKey` early-return can't swallow
  the jump. A month with no logged weeks has no header → quiet no-op.
- **The pill is a SCROLL READOUT on Logs** (2026-08-11b), completing roadmap v3 decision 2's
  "scroll-to-month, not filter": there is no selected month here, only a position. `spyResolve()`
  writes `viewMonth`/`viewYear` and calls `renderMasthead()` — **label and state only.**
  ⚠️ **It must never call `calculateAndRender()`**; re-rendering from a scroll handler is an
  infinite loop waiting to happen, and the suite asserts `#logs-ledger.innerHTML` is
  byte-identical across a relabel.
  - ⚠️ **Resolved GEOMETRICALLY against `SPY_LINE` (64px) — the last header above it** — with
    the `IntersectionObserver` used only as a trigger (`rootMargin: '-64px 0px 0px 0px'`, one
    edge, so every crossing fires). The obvious "topmost intersecting entry" rule is
    **directionally asymmetric**: scrolling *up* out of July, July's header leaves the band and
    nothing intersects, so the readout latches on the month you just left. Resolving against a
    line is symmetric, and makes the band's *size* irrelevant — which is why this is not the
    percentage-based band the spec proposed, one that inverts on a short viewport.
  - ⚠️ **`LOGS_PARK` (56) and `SPY_LINE` (64) are a pair.** A jump must park its header at or
    above the line or the readout names the month *before* the one you asked for. Change one,
    re-check the other. 56 also clears the pill (top 12px + 38px tall).
  - **A jump the document cannot deliver is AUTHORITATIVE.** The oldest months can never reach
    the line — the page bottoms out first (the clamp §8 already records) — so `logsScrollToYm()`
    sets `_jumpClamped` and `releaseSpy()` leaves the readout on the month that was asked for.
    It resumes following the line on the next scroll.
  - **Future months are skipped.** A future-dated row makes its own ledger block, but
    `pickerMonths()` refuses to offer that month and the swipe clamps at the current one — a
    readout naming it would be the one surface claiming a month the other two deny. (The model
    for future-dated entries is still open, §6 #3; this only keeps the doors agreeing.)
  - `_spySuppressed` wraps every programmatic scroll, released on `scrollend` with a timeout
    backstop. ⚠️ **Not `{ once: true }`** — if the timeout wins the race a stale listener
    survives and releases the *next* suppression early. `wireLogsSpy()` is called from the end of
    `renderLogsLedger()` (one site covers the tail, the growth loop and optimistic re-renders)
    and from `switchView()`, where it disconnects off-tab: `#logs-view` is `display: none` there,
    so every header rect is 0 and a live observer would rewrite `viewMonth` while you scroll
    Trends.
- **Export FOLLOWS the readout** (changed 2026-08-11b). It still reads `viewMonth`/`viewYear`
  and `#export-month-label` still names that month in the modal — but on Logs that month is now
  wherever you have scrolled to, so scrolling into July and exporting exports **July**. This is
  intended and asserted; it is the same rule as before applied to a `viewMonth` that now moves.
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
Composition (resequenced 2026-07-23, donut/patterns swapped 2026-08-10, shelf deleted
2026-08-11b): insight strip → tiles (closed months only) → archive card slot →
**donut → spending patterns** → cumulative line.
The donut card (`#category-card`) and the cumulative card (`#cumulative-card`) are now
**separate full-width blocks**, not a two-up grid — `.charts-row` was deleted 2026-08-04,
because the donut card carries a breakdown list under it and pairing them left the shorter
card a large dead area. Every Trends block is spaced **12px** from the next one
(`#trends-metrics`, `#income-bar-card`, `#category-card`, `#spending-patterns`), with
`#cumulative-card` closing on the 1.5rem section break — `#spending-patterns` had no
bottom margin until the 2026-08-10 swap, which only went unnoticed because the block
below it carried its own.

- **Insight strip** (`#trends-insight`, `.insight-card`, "What I noticed"):
  - **Deterministic engine** (`computeInsightNarrative()` → rendered by
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
  - **A single category is a full circle, so it has no ends** — both `spacing` *and*
    `borderRadius` are guarded to `0` there (`vCatData.length > 1 ? … : 0`). `spacing` would
    cut a seam into a closed ring, and rounding two caps that meet at 12 o'clock pinches them
    into a visible beak; with both off it closes cleanly. `borderWidth:0` also retires a
    latent bug: the old
    `borderColor: 'var(--surface-container-low)'` never worked, since canvas 2D can't
    resolve a CSS custom property.
  - **Centre total is an HTML overlay** (`.donut-center`), not canvas text — so it gets the
    UI font, the theme tokens and `.counter-val` inertia (`data-key="an-cat-total"`, swept
    by the `animateCounters()` call that already ends `calculateAndRender()`). ⚠️ The render
    **wipes `#donut-container.innerHTML`** each pass, so the overlay is re-injected in that
    same statement or it vanishes on re-render.
  - **List** (`categoryBreakdownHtml()` → `#category-breakdown`): icon chip (reusing
    `.txn-icon-chip` + `hexToRgba(hex, 0.12)` **and `color: hex`** — the icon is an SVG
    inheriting `currentColor` since 2026-08-10, §3.2), name, `X% of total`, amount, and a share bar
    in the category's own hue (`.cat-bar`, its own 6px metrics since `.week-bar` was retired
    by the Logs day chart). Bars scale to **share of total**,
    matching the percentage printed on the same row — not share of max, which would always
    fill the top row. Shares print one decimal below 10% so small categories don't all
    round to the same integer. Bars mount at `width:0` and get their real width one frame
    later (the pace-bar mount-then-spring idiom). Rows are hairline-separated, not a nested
    `.txn-list` box, since they sit inside a `.card` that already has a border.
  - **Tap a category → the shared drill-in sheet** (§3.14, `openCategorySheet(cat)` →
    `txnsForCategory(cat, year, month)`, highest amount first), added 2026-08-09. It is the
    **same sheet the Logs day column opens** — not a new modal, not an inline expand — and
    its rows hand off to `openTxnModal(uid)` exactly the same way, so edit/delete stay in
    one place. Scope is `viewMonth`/`viewYear`, matching the ring: opening a category from
    an archived month drills into **that** month. `txnsForCategory` reuses
    `_expenseRowsFor()`, so the sheet and the donut can't disagree about what's in a month.
  - **The tap lives on the list row, not (only) the arc.** Each `.cat-row` is a real
    `<button>` — full card width, ≥44px tall, a quiet `.cat-chev` affordance — because the
    list is where the labels are (the ring carries no text of its own) and because a 0.1%
    category is a few degrees of arc but a full-width row. A direct hit on an arc opens the
    same sheet as a secondary path: the donut's `onClick` runs
    `getElementsAtEventForMode(evt, 'nearest', {intersect:true}, true)`, gated on
    `canvas.id === 'donut'` like every other chart hook here, so a miss (the ring's hole)
    stays a miss instead of snapping to the closest arc. **Nothing about the ring's paint
    changed** — verified pixel-identical against the pre-change file.
  - **Empty month** (no expense rows): `#donut-container` is `display:none`, no centre
    overlay, and the list reads `No expenses logged this month.` — no rows, no arc, so
    nothing to tap.
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
  N days • ↗/↘ RM total`, with the daily average on **its own line beneath**
  (`.sp-avg`, `Avg RM 32.50 a day`) since 2026-08-10 — as a fourth clause it wrapped at
  390px and stranded the bullet separators above it, so it is split deliberately rather
  than left to wrap. **N = `elapsedDays` (non-future days)** and
  **avg = total ÷ elapsedDays** — so for the live month it divides by days-so-far and for
  a closed month by the full month, **matching the Today `Average Daily` tile exactly**
  (fixed 2026-07-23; previously divided by full `daysInMonth`, which read lower than the
  Average Daily card). Trend arrow vs the prior month, omitted with no prior data — arrow
  valence follows spend delta: up = expense-red, down = income-green. A `Less → More`
  **legend** (`.sp-legend`) surfaces the ramp swatches. Spend is summed from expense rows
  only (`isExpense`), active-user-filtered.
  - **Day numbers use `--on-surface` on every step** (2026-08-10). They used to flip to
    `#F5F5F2` on `hm-l3`/`hm-l4`, which measured **2.01:1**; the deleted rule is not to
    come back. Because the token flips with the theme, one value clears AA on the deepest
    tint in light and the lightest in dark.
  - **The live month CLIPS THE FUTURE** (2026-08-10): on the 10th, 22 of 31 cells were
    dashed placeholders and the card ran over half a phone viewport tall. Closed months
    render in full — they have no future days. ⚠️ **The clip is applied to the RENDER, not
    to `days`**: `const cellDays = isCur ? days.filter(d => !d.future) : days;`, and the
    cell loop iterates `cellDays`. Every figure above it stays computed over the whole
    month. Mutating `days` in place (as the brief literally specified) breaks two things —
    `total` sums *all* days, so a future-dated expense would vanish from the chip's RM
    figure while Today's Expenses tile still counted it and the average's to-the-cent
    parity with `Average Daily` would break; **and on a closed month `clipped` IS `days`,
    so `days.length = 0` empties both and the grid renders ZERO cells.** `.hm-future` is
    now dead for the live month but harmless, and still used by closed-month code paths.
- **The archive shelf is DELETED** (2026-08-11b). `#month-shelf`, `renderArchiveShelf()` and
  the `.shelf-*` CSS are gone; the picker supersedes it (it reaches every month, shows each
  month's total, and is one tap from anywhere). This is **roadmap v3 decision 7 deliberately
  reversed** — see §6. ⚠️ **Two different things are called "archive": the closed-month
  `archiveCardHtml()` in the `#income-bar-card` slot STAYS**, untouched, and so does the Logs
  `.logs-tail` (which is the lazy-load control, not a month selector). If you are unsure which
  one you are looking at, stop.

### 3.8 Capture flow (FAB → sheet → parse → confirm)

- **Capture sheet** (`#capture-overlay`, `.modal-overlay.align-bottom`) floats just
  above the nav pill. **Container-transform entrance:** closed state `scale(0.08)` +
  full radius, `transform-origin` at the FAB center (see §3.3 derived numbers) — the FAB
  blooms into the sheet via `--motion-wobble`.
- **There is no FAB long-press** (removed 2026-08-13). A ~350ms hold on the FAB opened the
  camera directly between 2026-08-12 and 2026-08-13; it is gone, along with `wireFabGestures()`,
  `openCameraDirect()`, `FAB_LONG_PRESS` and `_fabCameraShortcut`. **The camera is the camera
  button in this sheet, and always was** — the accelerator only ever saved the middle tap of a
  three-tap sequence. ⚠️ **It was removed for reliability, not for taste**, and the reasoning is
  in §6 because it generalizes: the gesture's outcome is decided by main-thread timing, an
  off-main-thread platform long-press, file-chooser activation rules and the camera intent's own
  latency, and **the render loop can model none of them** — so three green suites (104/104,
  141/141, 180/180) said nothing about the only environment where it was broken. A hold that
  silently does nothing is bad anywhere; on the app's primary control it teaches the user to
  press twice.
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
- **`Enter manually instead` is styled as a fallback** (`.capture-manual`, 2026-08-10): an
  underlined text button, not a `.btn`. As a `.btn` it was the largest, most button-like
  element in the sheet, outranking the capture field the sheet exists for. It is still a
  44px target. ⚠️ It **replaced** its `.modal-actions` wrapper rather than sitting inside
  it — the rule carries its own `margin-top`, which the wrapper's flex row and 1.5rem top
  margin would have stacked on top of. `.capture-send` is **sienna** (§3.2).
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
- **Txn modal:** title reads **`Log a transaction`** / **`Edit a transaction`** (sentence
  case, one voice for one job — 2026-08-10; `openTxnModalPrefilled`'s `Confirm entry` is
  unchanged). Type toggle reads **`Expense / Income`** — **not `Budget`** since 2026-08-10
  (§3.5; the `#type-income-btn` id and the stored `'Income'` value are unchanged, as is
  the recurring form's matching `#recur-type-income-btn`). ⚠️ **The active segment is
  `--on-surface`, not semantic red** — the slider marks the selection, and red means money
  going out everywhere else (§3.2). `.btn-primary` is **sienna with white text**.
  **In-modal delete confirm:** outline-red Delete
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
  paint, in `requestIdleCallback` (3s timeout, `setTimeout` fallback), and never awaited**
  — ⚠️ the idle scheduling is load-bearing beyond politeness: it fetches a second sheet and
  can post up to `RECURRING_MAX_PER_RUN` rows sequentially, which occupied exactly the window
  where a first FAB long press needs its timer to fire on schedule (§3.8) — a slow or absent `Recurring` tab can't delay or break load.
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

### 3.14 Drill-in sheet — ONE component, two callers

`#drill-overlay` is the single sheet that any figure drills into: a **Logs day column**
(§3.6) and a **Trends category** (§3.7). One interaction language — tapping a figure
always opens the same thing, never a second modal shape or an inline expand. It was the
day sheet first (2026-08-08, then `#day-overlay`); the category drill-down generalized it
rather than building a second one, and renamed the DOM to match (`.drill-head` /
`.drill-sub` / `.drill-total` / `.drill-body` / `.drill-empty`).

- **State, not DOM:** `drillState` is `{kind:'day', iso}` or
  `{kind:'category', cat, year, month}`. Module state, so an open sheet survives an
  optimistic write; `calculateAndRender()` ends with `if (drillState)
  renderDrillSheetBody()` — one call site, because **either view can be the one behind
  the sheet** (it used to live in `renderLogsLedger()`, which only covers Logs).
- **`drillContent(state)`** resolves each kind to the same four things — title, sub,
  total, rows — and `renderDrillSheetBody()` renders them identically from there. Day:
  weekday + date, entry count, the day's expense total. Category: the category name,
  `August 2026 · N entries`, the category's month total. Body always uses
  **`txnRowHtml()`**; an empty result reads as copy, never a dead sheet.
- **A category sheet hides the row badges** (2026-08-10): `renderDrillSheetBody()` toggles
  **`.hide-cat-badge`** on `#drill-body` when `drillState.kind === 'category'`, because the
  sheet is already titled with the category and every badge just repeated it (four
  red-outlined `BILLS` chips inside a sheet headed *Bills & Utilities*). **The day sheet
  keeps its badges** — there the category is genuinely new information. Note the badge text
  for income rows is **`Income`**, not `Budget` (§3.5).
- ⚠️ **The sheet CLOSES before `openTxnModal(uid)`** (`bindDrillRowClicks`) — the
  `openManualFromCapture()` precedent. `trapModalFocus` holds exactly one trap at a time;
  stacking overlays clobbers the return-focus chain. Closing hands focus back to the
  column/row, which the txn modal then remembers as *its* return target. **No new
  edit/delete logic exists anywhere** — every mutation still goes through the txn modal.
- ⚠️ It is `.align-bottom` **plus `.sheet-rise`**: `.align-bottom` alone has a
  FAB-anchored `transform-origin` (§3.3 derived numbers), and this sheet is triggered by a
  column or a list row mid-page, so the bloom would spring from a spot nothing was tapped
  at. `.sheet-rise` overrides the origin to `50% 100%` and rises `translateY(18px)
  scale(0.96) → 0/1`. The bottom anchoring itself is kept deliberately (thumb zone,
  clearance above the nav cluster).
- Escape is in the **hardcoded global chain** (after capture, before recurring) and had to
  be extended by hand, same as Phase G's.

---

## 4. Status

**Everything in §3 is DONE, LIVE, and Playwright-verified.** §3 is the current state; §6
holds the decisions each change locked, §7 the narrative and the findings.

**This section used to restate every shipped phase a third time** — a paragraph per change
duplicating §6's roadmap entry and §7's history entry, down to the same verification
counts. It is a pointer now. To ask "is X done?", read §3: if it is described there as
current behaviour, it shipped and it was verified.

**The only live items are owner steps, and they are Apps Script side:**

- **Phase F** — two boxes still unticked in §6's checklist: delete the
  `sendDailyDigestPush` time-driven trigger, and drop the `FIREBASE_SA_JSON` /
  `FCM_PROJECT_ID` Script Properties. Both are harmless if left (the function they name no
  longer exists), but the trigger fails silently in the execution log every night.
- **Everything else is deployed.** Apps Script was last redeployed for Phase G, so the
  `recurring` action and `handleAdd`'s duplicate guard are live. Every change since
  2026-08-08 has been front-end only — **no Apps Script change, no redeploy.**

**Pending work:** the unscheduled candidate features and the open questions, both in §6.

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

### Logs day columns + day drill-in ✅ DONE (2026-08-08)

Built from two owner-supplied briefs on the same day (the second superseding the first),
so it never sat in the candidate queue. Shipped behaviour is in §3.6; the rationale for
each fork is in the §7 entries. **No owner checklist — front-end only, no Apps Script
change, no redeploy.**

Three decisions future phases must not re-open:

1. **Weeks clip to the month they render under** — a boundary week appears once under each
   month with only that month's days, and a short week (fewer than 7 columns) is correct.
2. **Logs has no accordion.** The week header is informational only.
3. **The week-level transaction list is gone**, deliberately. Seeing a whole week at once
   was accepted as removed; the day sheet is the sole drill-in. A week-scoped sheet hung
   off the week total is a *possible* future — it was explicitly out of scope, not
   forgotten.

### Trends category drill-down ✅ DONE (2026-08-09)

Owner-supplied brief, written against the pre-donut pie (it names `pieLabelsPlugin` and
`variableRadiusPlugin`, both deleted 2026-08-04). Its *intent* survived the redesign
intact and is what shipped; only the mechanism moved. Shipped behaviour is in §3.7 and
§3.14. **No owner checklist — front-end only, no Apps Script change, no redeploy.**

Decisions future phases must not re-open:

1. **One sheet, not a second pattern.** A category drills into the *same* `#drill-overlay`
   the Logs day column opens. Any future drill-in (a week total, a Today tile) generalizes
   `drillContent()`; it does not build a third sheet.
2. **The list row is the primary tap target, the arc is secondary.** The brief asked for
   the pie *callout* precisely because a small slice needs a forgiving target. The callouts
   are gone, but the DOM breakdown list is their successor and is a strictly better target
   — full width, ≥44px. Arc taps also work and must keep working.
3. **Scope is the month chip**, matching the ring. No all-time toggle (explicitly out of
   scope for this phase).
4. **The ring's paint is untouched.** Verified pixel-identical against the pre-change
   file, at 390px light and 900px dark.

One other brief detail that had moved on: it asked for the total in a `.txn-footer` /
`.txn-footer-amt` line "matching the day sheet's footer". The day sheet has no footer — its
total sits in the header beside the title (`.drill-total`), which is the markup the
category sheet reuses, so the two are identical as intended.

### Logs month scope — option C ✅ DONE (2026-08-09)

Owner brief, `ALFRED_LOGS_MONTH_SCOPE_PATCH.md`. Shipped behaviour is in §3.6. **No owner
checklist — front-end only, no Apps Script change, no redeploy.**

**It supersedes roadmap v3 decision 2 ("Logs = scroll-to-month, not filter") and Phase B
step 3**, and retires the scroll-sentinel auto-append those shipped with. Recorded here so
a future session reading the old roadmap doesn't reinstate either.

Decisions future phases must not re-open:

1. **Not a filter.** Older months are appended, never swapped in; once loaded, a month
   stays loaded for the session. The ledger is one continuous scroll.
2. **Default scope is one month**, and **loaded months survive re-renders** — a data
   refresh or a tab switch must not collapse the ledger. Only a page reload resets it.
3. **The tail is a plain statement, not a call to action** — a dashed boundary, sentence
   case, no emoji. At the earliest month with data it becomes the end note.
4. **Export scope is unchanged** (the chip's month, named in `#export-month-label`).
5. **Weeks still clip to their month** — untouched by this change, and asserted so.

One deviation from the brief, on correctness: it defines the scope as calendar months back
from now, but the ledger indexes **months holding data**. With a gap month those differ,
and the calendar reading makes the tail name an empty month — a tap that reveals nothing.
Counting data months keeps the tail's promise honest. `monthsAvailable()` therefore wasn't
added: `_logsTotalMonths` already is that quantity, and the brief's own instruction was not
to write a second helper.

### Header removal — month becomes the masthead ✅ DONE (2026-08-11)

Owner-supplied spec (`SPEC_HEADER_MASTHEAD_20260811.md`), shipped as the five commits it
set out. Shipped behaviour is in §3.2, §3.3 and §3.4. **No owner checklist — front-end
only, no Apps Script change, no redeploy.**

**It supersedes roadmap v3 Phase B's header chip** — but *not* Phase B's decision that there
is exactly **one contextual month selector**. That decision said one selector, not one
selector *in a header*; the masthead is still the only one.

Decisions future phases must not re-open:

1. **There is no app header, and Today has no top chrome.** Not collapsed, not slimmed.
   Anything that wants to live at the top of Today has to justify 9% of the viewport.
2. **The masthead is sticky and lives outside `.container`.** Nothing up there becomes
   `position: fixed` (§3.2's overflow trap).
3. **The caret stays.** A 31px serif title has no affordance; this is the Logs day-column
   failure repeated on primary navigation, which is worse.
4. **The steppers hide when condensed** — the alternative is a condensed bar that saves
   nothing, or sub-44px targets.
5. **The picker is the ledger-list form**, and its amounts are neutral ink.

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

### Lift-off pill ✅ DONE (2026-08-11, second pass)

Owner-supplied follow-on spec (`SPEC_LIFTOFF_PILL_20260811b.md`), shipped as seven commits.
Shipped behaviour is in §3.3, §3.4, §3.6 and §3.7. **No owner checklist — front-end only, no
Apps Script change, no redeploy.**

**It supersedes the previous spec's condense mechanism and its chevrons**, but not roadmap v3
decision 1 ("one contextual selector") — there is still one selector, now with two
representations of the same state.

**Roadmap v3 decision 7 ("Archive card stays") is deliberately REVERSED for the shelf.** The
picker supersedes it: it reaches every month, shows each month's total, and is one tap from
anywhere. Recorded here so the roadmap does not look like it drifted. ⚠️ **The closed-month
archive CARD is a different thing and stays** — as does the Logs "Earlier months" tail, which
is the lazy-load control, not a month selector. The spec's own text conflated the two and said
to stop and ask; the owner confirmed the Trends shelf only.

Decisions future phases must not re-open:

1. **The masthead names the period; it never measures it.** No figure goes into the masthead or
   the pill. This is the line that settles the hairline, the sub-line, and every future request.
2. **There are exactly two doors onto a month**, the picker and the pill's swipe, and they step
   through the same list. The caret on both representations is **load-bearing** — with the
   chevrons and the shelf gone it is the only thing saying the month can be changed at all.
3. **Today reads the date and is inert.** The unit is the tell.
4. **The pill is never the sole route to anything** — that is the only reason 38px is acceptable
   under the 44px floor.
5. **On Logs the readout follows; it never drives.** No re-render from a scroll handler.

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

### FAB long-press — REMOVED ✅ DONE (2026-08-13, third pass)

Owner call: **the accelerator never worked reliably on the device**, across three passes. It is
deleted. Shipped behaviour is in §3.3 and §3.8. **No owner checklist — front-end only, no Apps
Script change, no redeploy.**

**This supersedes the build (2026-08-12) and device-fix (2026-08-13) sections that used to sit
below it; both are deleted, since this section states the outcome and §8 carries every finding
they produced.** The feature is gone from the app, not from the record — §7 keeps the
narrative.

Decisions future phases must not re-open:

1. **The FAB is a tap. It has no gesture handling.** The inline `onclick` is back on the markup,
   and no listener on that button decides whether a press "counts". If a future phase wants a
   gesture there, that is a new design pass with a hardware verification plan, not a revival.
2. **The camera lives in the capture sheet.** The accelerator saved the middle tap of three; it
   is not worth the primary control being unreliable.
3. **`repaintNavCluster()` stays.** It fixes a different bug — the stale `backdrop-filter` layer
   on the nav pill after returning from a camera intent — it is **confirmed working on the
   device**, and the in-sheet camera still triggers the condition. It looks like dead code
   precisely because no local test can reproduce what it fixes.
4. **`materializeRecurring()` stays in `requestIdleCallback`.** Its original justification was
   the long-press timer, which is gone, but keeping the main thread free immediately after first
   paint stands on its own.

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

### Design fix spec ✅ DONE (2026-08-10, second pass)

Owner-supplied review of `main` @ 86054de (`ALFRED_FIX_SPEC.md`), shipped as three code
commits in the order the spec set — mechanical, weight rebalancing, judgement — plus a
documentation commit and a one-pixel `.logs-tail` follow-up. Shipped behaviour is in §3.2,
§3.3, §3.5–§3.9 and §3.14. **No owner checklist — front-end only, no Apps Script change,
no redeploy.**

Decisions future phases must not re-open:

1. **`body` never pins the `wght` axis.** It is a variable font; the axis beats
   `font-weight` and nothing in the DOM reveals the override. §3.2.
2. **Light and dark semantic tokens are separate values**, tuned against their own ground.
3. **Good news is stated, not coloured**, and **sienna is the only primary**. Semantic
   colour and solid fills are reserved for the states that need attention.
4. **The donut is untouched** — cap radius, spacing and small-slice folding are exactly as
   they shipped 2026-08-04, asserted pixel-identical against `e08da4f`.

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

### Recorded but undecided (from the design review — do NOT implement)

Open questions, kept so they are not lost. Each needs a decision before it is a task.

1. **The hero mini-chart.** Honest now, but still six unlabelled bars with no axis and
   little dynamic range. Options: a within-month burn-down against an even-pace line, or
   delete it (the Archive strip already carries the six-month view).
2. **Logs: shape or list.** The no-transactions-until-you-tap decision stands; only the
   affordance was fixed. If the drill-in goes unfound, auto-expanding the current week is
   the next smallest step.
3. **Future-dated entries.** Income dated ahead counts toward a week's entry total but
   appears in no chart and no spend figure. Decide the model: exclude from the month,
   surface a "scheduled" strip, or reject future dates at capture. (This pass made the
   symptom quieter — §3.6's empty week — without deciding the model.)
4. **Category taxonomy.** `Shopping & Groceries` merges two different behaviours and
   `Subscriptions` overlaps `Bills & Utilities`. Every chart inherits it; splitting is
   cheap now and expensive after a year of history.
5. **Today's name versus its content** — the tab still leads with a month figure while the
   day line is the smallest thing on it.
6. **Multi-user.** Reviewed as a single user throughout.
7. **The category palette.** Seven saturated hues, identical hex in both themes, no
   dark-mode chroma adjustment, and sienna doing double duty as the accent and Food &
   Dining.
8. **Drill sheet sort order** — rows sort by amount while displaying dates, and nothing
   says so. Either label the order or sort by date.
9. **Desktop.** At 1280 the app is a centred phone column with very wide, short cards and a
   left-aligned header that doesn't line up with the centred content.
10. **Archive shelf chips are 28px tall** — under the 44px minimum, out of scope for this
    pass because raising them visibly changes the Trends footer.
11. **First run for a real user** — a valid `?user=` link with zero rows shows *"Open your
    personal link (?user=…)"*, which is the wrong message for someone who just did that.
12. **Failed load** — bare centred red text with a ⚠️ (the app's last emoji), no card, no
    retry, and the FAB stays live over an empty in-memory ledger.
13. **Date input locale** — the manual modal's `type="date"` rendered `MM/DD/YYYY` in
    Chromium; that follows browser locale, so verify on a real phone first.
14. ~~**Three doors onto the same month change, on Trends**~~ — **RESOLVED 2026-08-11b.**
    The chevrons and the archive shelf are both deleted; the picker and a swipe on the pill
    are the two that remain, and they now agree about what a month is (both step through
    `pickerMonths()`). Recorded rather than removed because the *reasoning* was reversed:
    the plan was to ship all three and watch which got used, and the owner's follow-on spec
    decided it up front instead. Deleting them was the markup change the note predicted,
    because all three already routed through `applyViewMonth`.

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

- **FAB long-press accelerator.** ⛔ **TRIED AND REMOVED** — shipped 2026-08-12, fixed twice,
  deleted 2026-08-13 because it was never reliable on a real device (§6). **Not parked, not
  pending**: it is a closed question unless someone brings a way to verify a hold on hardware.

**Parked:** nothing.

**Dropped (2026-07-19):** capture-bar correction handling ("actually make that RM20") —
no longer wanted; capture-parse validation suite — considered resolved.

### Explicitly out of scope (do not build unless asked)

- Streak counters, badges, confetti, celebratory motion beyond existing pop-ins
- Milestone marks on the hero; personal-records insight templates
- Search or filters on Logs
- Restoring the Logs accordion or any week-level transaction list (§3.6 — removed
  deliberately 2026-08-08; the day sheet is the drill-in)
- Re-pinning the `wght` axis on `body`, or reinstating the white heatmap ink, the green
  good-news states, or `Budget` as a transaction-type label (§3.2, §3.5 — all removed
  deliberately 2026-08-10)
- Restoring the app header, or moving any *figure* into the masthead or the pill (§3.3, §3.4 —
  the governing principle: the masthead names the period, it never measures it. "Budget left"
  up there would be a sixth surface saying what the hero already says once.) **Today DOES have
  a masthead since 2026-08-11b** — it states the date, and is inert
- Reinstating the masthead chevrons or any month stepper, the Trends archive shelf, or the
  binary `.condensed` condense-on-scroll (§3.4, §3.7 — all removed deliberately 2026-08-11b)
- Adding `viewport-fit=cover` casually: every `env(safe-area-inset-*)` in the app is currently
  inert, so turning it on shifts the FAB cluster's derived geometry and both top offsets at
  once (§3.3)
- Spreading `--font-display` beyond the masthead month (§3.2)
- Any change to the category donut's chart config — cap radius, spacing, small-slice
  folding (explicitly excluded by the 2026-08-10 design review, and asserted
  pixel-identical in the render loop)
- Reinstating the FAB long-press → camera accelerator, or adding any other press-and-hold to the
  FAB, without a hardware verification plan (§3.3, §3.8, §6 — removed 2026-08-13 after three
  passes never made it reliable on a device)
- Deleting `repaintNavCluster()` as dead code — it is a Chromium/Android workaround, confirmed
  fixed on the device, and unreproducible in any local test (§3.3)
- `defer` on the Chart.js tag — `Chart.register()` is top-level in the inline script, which runs
  first, so it throws on load (§6)
- Any new backend endpoints, LLM calls, or paid services

---

## 7. History (compact)

For code comments that reference roadmap phases: **v2** = the restructure roadmap
(Today · Logs · Trends, numbered Phases 0–7), **v3 / lettered phases** = the refinement
roadmap (Phases A–F). All shipped phases below are DONE & verified; what each built is
woven into §3.

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

---

## 8. Key Learnings & Principles

- **When the verification loop is structurally blind to a feature's failure mode, stop fixing and
  start removing.** The FAB long-press was verified 104/104, then 141/141, then 180/180 (that
  last pass never merged), and failed on a real phone every time — because its outcome is decided
  by main-thread load, an off-main-thread platform gesture, file-chooser activation rules and a
  camera intent's latency, and a desktop Playwright run models none of them. The suites were not
  lying; they were mute. **Three green runs against a defect that never moves is itself a
  result** — it says the loop cannot see the bug, so every further fix is a guess with a passing
  test attached. Before building anything gesture-shaped, ask what would have to be true for the
  harness to watch it fail; if there is no answer, that is the finding.
- **An accelerator is never worth making the primary control feel unreliable.** The long press
  saved the middle tap of three. It sat on the FAB — the single control the whole app funnels
  through — and when it silently did nothing, the user's correct response was to press again.
  Weigh a shortcut against the confidence cost on the thing it is attached to, not against the
  taps it saves.
- **Remove the feature, keep the findings.** The superseded passes stay in §6 and §7, and their
  platform learnings stay here, because they are the most transferable thing the attempt
  produced. Deleting the record along with the code is how the next session re-derives the same
  bugs.
- **A gesture committed by a single timer callback has a single point of failure — and on a
  phone it has two ways to fail at once.** The callback slips under main-thread load, *and* the
  platform's own long-press (500ms, detected off the main thread) steals the pointer and cancels
  it. Worse, **a cancelled touch sequence dispatches no `click`**, so the tap fallback does not
  run either and the gesture produces *nothing at all* — the one outcome that gives the user no
  information. Commit on **elapsed time** checked at every end-of-gesture path, and make the
  commit idempotent, because more than one path can be live in the same gesture.
- **A threshold that races the platform needs margin measured against the platform, not against
  your other component.** `FAB_LONG_PRESS` was chosen as "shorter than the pill's 500ms" — a
  reasonable-sounding rule that happened to leave 50ms against Android's 500ms long-press. The
  binding constraint was never the app's own other gesture. When a number has to beat something,
  write down *what* it has to beat, or the next person tunes it against the wrong thing.
- **An app's own startup work is the load that breaks its startup-time interactions.** The
  first-press bug reproduced only on entry, because that is when the first render, three charts
  and the recurring materializer are all on the main thread. Anything explicitly documented as
  "never awaited, must not delay first paint" should be in `requestIdleCallback`, not merely
  un-awaited — un-awaited still runs *now*.
- **A compositing layer that nothing invalidates never repaints.** Coming back from a camera
  intent, the nav pill's `backdrop-filter` held a stale snapshot of what had been behind it —
  and nothing on the page changed on the way back, because **a cancelled file picker fires no
  event at all**. The same fact had already been recorded for a different bug in the same
  feature; it bites wherever code assumes "returning from the picker" is observable. When the
  browser will not invalidate a layer, ask it to: drop the filter for one frame and put it back.
- **Some fixes are only falsifiable on the device.** The render loop can prove a repaint is
  wired and that the class does what it claims, and it cannot reproduce an Android surface
  restore at all. Say which of the two a green suite bought, and keep the device check in the
  verification list — a probe that *cannot* fail is worth exactly as much as a control that
  fires nothing.
- **`let` at the top level of a classic script is a global lexical binding, not a property of
  `window`.** `window.someLet` is `undefined` forever, so any probe reading module state that
  way silently asserts nothing. Evaluate the bare identifier instead.
- **Re-`observe()` without `disconnect()` multiplies every future record.** A watcher helper
  called once per phase left N observers attached, so a two-step sequence read as
  `[true,true,false,false]` against correct code. Any "reset the recorder" helper has to tear
  down the previous one first.
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
- **In a variable font, `font-variation-settings` beats `font-weight` — and hides it.**
  A `'wght' 400` pin on `body` flattened ~35 classes to regular while every stylesheet
  still declared 700/800/900, for the app's entire life. What makes it a *trap* rather
  than a bug is that **`getComputedStyle().fontWeight` reports the declared value either
  way**, so the DOM agrees with the CSS and only the pixels disagree. Any assertion about
  weight has to measure rendered ink (advance width across 400/700/900), and it only means
  anything with the real variable font loaded — a fallback font hides the whole thing.
- **A token that has to read on two grounds needs two values.** `--semantic-income` and
  `--semantic-expense` were tuned against dark surfaces and reused unchanged on white,
  where they cleared 2.9:1 and 4.1:1. The theme-flip machinery was already there; one pair
  of values was just doing two jobs.
- **If everything is reassuring, nothing is an alert.** Today said "you're fine" in green
  five separate ways, which spends the only signal that could mark the one state worth
  noticing. Reserve semantic colour and solid fills for what has gone wrong; state the
  ordinary case in words. Same argument as "only overspending gets a solid fill" — it just
  had to be applied to four more components.
- **Emoji are a third colour system.** A `CAT_COLORS`-tinted chip with an emoji glyph in it
  has the app's ink, the category's hue and the OS font's palette all inside one 40px
  square — a cyan Transport chip with a red car. An inline SVG inheriting `currentColor`
  makes the chip exactly one hue, and the icon becomes themeable for free.
- **A control that must be tapped should look like a slot, not a mark.** Seven bars
  floating on a card read as a chart; seven bars sitting in seven tinted slots read as
  buttons. Nothing about the data changed — only whether the affordance was visible.
- **Measure targets with the sheet open.** A closed overlay is `scale(0.08)`, so every
  control inside it measures ~8% of its real size. The same trap in reverse: a "wait until
  the transform stops changing" helper returns immediately at the *initial* resting state,
  because two reads of the closed value look settled. Wait for the final state, not for
  stillness.
- **Pass the mutated source to EVERY page the suite opens.** Eleven of twelve negative
  controls silently did nothing because only one section threaded the mutation through —
  the suite reported a clean 168/168 while testing the unmutated file for almost every
  defect. The controls were the only reason this surfaced, which is the whole argument for
  running them: **a control that fires nothing is a finding about the harness, not a pass.**
  And two controls that then fired nothing pointed at genuinely missing probes (a chip
  asserted for contrast but never for being *neutral*; an icon that only renders inside an
  open sheet the scan never opened).
- **Compare canvas buffers, not element screenshots, to prove a chart is unchanged.** An
  element screenshot composites whatever HTML overlays sit on top — here the donut's centre
  total, whose font-weight legitimately changed — so the ring "differed" when only the text
  above it had. `getImageData` is the chart's own paint, and a stronger claim besides.
- **A chrome element is usually doing an invisible job as well as its visible one.** The
  header looked like it held a title and nothing else. It was also supplying the status-bar
  inset in standalone PWA mode and being the sticky offset the Logs scroll subtracted.
  Neither is visible in the markup, and neither fails loudly — one runs content under the
  status bar only in an installed PWA, the other lands every month jump 77px off. Before
  deleting a layout element, grep for what *measures* it, not just what styles it.
- **A control that fires nothing is a finding about the probe, not a pass.** The reset that
  keeps the masthead from returning condensed only matters on a round trip through the tab
  where the masthead is *hidden* — the hidden state is what makes the scroll handler bail.
  The suite only ever tested a hop between two visible mastheads, so the control found
  nothing and the real case was untested. The control is the only reason anyone looked.
- **Collect assertions as they run, not at the end of the section.** A trailing
  `push(ck)` means a section that throws discards every check it already ran correctly, so
  a negative control reports "CRASHED" and hides the fact that its actual probes fired.
  Two controls looked far narrower than they were until the results registered eagerly.
- **Advance width is not proof a font loaded.** "August" at 31px measures 93.6px in
  Newsreader and 93.0px in Roboto Flex — near enough that a width probe passes with the
  serif never arriving. Compare the pixels the element paints against the same element
  forced into the other face. (Same family as the `wght`-axis trap: the DOM agrees with the
  CSS, and only the rendering disagrees.)
- **A scroll-driven animation of a custom property is not off the main thread.** Only
  `transform`, `opacity`, `filter` and `backdrop-filter` get the compositor. Animating a
  registered custom property recalcs style every frame and re-resolves every `var()` consumer —
  still far cheaper than the scroll listener it replaces, because there is no script, but the
  win is "no JS", not "no work". The distinction matters because the cost scales with the number
  of consumers, and a comment claiming "free" is an invitation to add more.
- **A control that is also a gesture target needs the click EATEN, not out-raced.** `click` is
  dispatched as its own task after `pointerup`, so a `setTimeout(…, 0)` scheduled to clear the
  "was this a drag?" flag can and does run first. Clear the flag inside the click handler and
  `preventDefault()` there. Same family: an inline `onclick` is registered at parse time, so no
  listener added later can suppress it — if a handler needs to decide whether a click counts, it
  has to own the click outright.
- **Synthetic mouse input hides every pointerup-vs-click race.** Chromium's `mouse.up()`
  dispatches `pointerup`, `mouseup` and `click` in a single task, so a `setTimeout(…, 0)`
  scheduled in `pointerup` always beats the click in a harness and never does on a finger. A
  control that reintroduces that bug fires nothing until the probe drives the three events as
  separate evaluations with a real macrotask boundary between them. **If a defect is about
  task ordering, the probe has to create the tasks.**
- **A cancelled file picker fires nothing.** No `change`, no `cancel` worth relying on — so
  any flag set before opening one outlives the gesture and is still set at the user's next,
  unrelated pick. Read-and-clear the flag at the top of the handler, and guard whatever it
  triggers on the state it assumes. The bug only appears two interactions later, which is
  exactly why no probe had modelled it.
- **"The topmost thing currently intersecting" is not a position readout.** It is asymmetric:
  scroll forward and the next item enters the band; scroll back and the item you are returning
  to has already left it, so nothing intersects and the readout latches on where you were. Use
  the observer as a *trigger* and resolve geometrically against a single line — the last item
  above it. That is symmetric in both directions and makes the band's size irrelevant, which
  removes a whole class of "tune the rootMargin" bugs.
- **Two doors onto the same state must be built from the same list.** The picker had already
  been corrected to offer only months holding data; the new swipe was specced against calendar
  months. On a dataset with a gap the two disagree, and the disagreement is invisible until a
  user swipes into a month the picker refuses to show. Whenever a second affordance is added for
  an existing action, derive it from the first one's data, not from the underlying domain.
- **`env(safe-area-inset-*)` does nothing without `viewport-fit=cover`.** Without that meta the
  UA insets the layout viewport itself and every `env()` resolves to `0px` — so a stylesheet can
  be full of carefully reasoned inset arithmetic that has never once been evaluated, and a
  "does it clear the status bar?" check passes because both sides are zero. Check the meta tag
  before trusting, or writing, any of it.
- **A probe that swipes at a control the code has correctly disabled is testing nothing.** The
  pill only accepts pointer events past `--p: 0.4`, and a sparse month makes a document too
  short to scroll that far — so "scroll to 200, then swipe" silently swiped at the page. The
  fix in the harness is to assert the precondition (the pill is lifted), not to raise the number
  and hope. Same shape as measuring a control inside a closed sheet.
- **A click sets the browser's sequential-navigation start point, and `blur()` does not reset
  it.** Any "what does Tab reach first?" probe run after an earlier probe clicked something is
  measuring the tab order from that click, not from the top of the document. Use a fresh page,
  and drive view changes by calling the function rather than clicking the tab.
- **Scrolling to where you already are fires no event.** A probe that scrolls to the bottom when
  the page is already at the bottom asserts against whatever the last handler left behind. Move
  away first, then back.
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
- **`Math.max` is not a "biggest" assertion.** `x === Math.max(...xs)` passes when every
  value is equal — exactly the shape a dead animation produces. Comparisons meant to prove
  a ranking must be strict (`xs.every((v, i) => i === k || v < xs[k])`), or the probe
  certifies the bug it was written to catch.
- **Pad a tap target, don't shrink it to the visual.** A 4px bar gets a ≥44px-tall button
  with the whole cell — track and label — as the hit area.
- **When a mark is also the tap target, don't encode magnitude on the axis that sizes the
  target.** The Logs day chart first encoded spend in segment *width*, which made a quiet
  day a 14px sliver — and that segment was the only route to the day's transactions, so
  the encoding fought the affordance. Moving magnitude to *height* freed width to be
  constant, which fixed the tap target **and** made short boundary weeks line up with full
  ones. A `flex-basis` floor had been the compromise; not needing a compromise was better.
- **A fraction of the container is not a size.** `flex: 0 0 calc(100% / 7)` reads fine on a
  phone and turns a 48px-tall column into a 200px-wide slab on a desktop. Anything whose
  *proportions* carry meaning needs a `max-width` (or `max-height`) cap, and the leftover
  space is fine — left-aligning past the cap keeps every column identical at every width.
- **"N months back" is not the same question as "N months of data."** A scope counted in
  calendar months names empty months; a scope counted in months holding data names only
  months that will actually appear. Anything whose label promises what a tap will reveal
  has to be counted the second way — otherwise the affordance lies, and the lie only shows
  up on a dataset with a gap in it. Fixtures for this kind of work need a deliberate gap.
- **Playwright scrolls an element into view before clicking it.** Any assertion of the form
  "the page scrolled after I clicked X" is measuring the harness, not the app. Assert where
  the target *landed* instead.
- **A scroll target at the end of the document can't reach the top of the viewport.** The
  page bottoms out first, so "scrolled under the sticky header" is only a fair claim for an
  element with content below it. A probe that ignores the clamp reports a bug in correct
  code — check alignment on a middle element and "in view, scroll maxed" on the last one.
- **The second drill-in is a caller, not a component.** When a new surface needs "tap this
  figure, see its transactions", generalize the existing sheet (`drillState` +
  `drillContent()`) instead of writing a second one. Two sheets means two sets of chrome,
  two focus chains and two places for the row → `openTxnModal()` hand-off to drift; one
  means a figure always opens the same thing wherever it's tapped.
- **When a brief names a mechanism that no longer exists, port the intent, not the
  mechanism.** The category drill-down was specified as hit-boxes on the pie's on-canvas
  callouts — deleted a week earlier. The *reason* the callouts were the target (a small
  slice needs a forgiving one) pointed straight at the DOM list that replaced them, which
  is a better target than either. Re-deriving the requirement was cheaper than re-reading
  the spec literally, and it kept the brief's own priority order (list first, arc second).
- **A stale overlay still reads correctly.** Asserting a sheet's title after a tap proves
  nothing if the sheet is closed — the text from the last open sits there. Assert the
  overlay is *open* first, then what it says. Same family as `Math.max` not being a
  "biggest" assertion.
- **`mouse.click` takes viewport coordinates and does not scroll.** Geometry read from a
  chart is in page space; on a phone viewport the ring is below the fold and the click
  lands on whatever is at those coordinates instead. `scrollIntoViewIfNeeded()` first, and
  assert the computed point is on screen — otherwise the probe silently tests something
  else. (`page.click(selector)` auto-scrolls, which is why only the hand-computed hits
  broke.)
- **A fixture in sorted order can't test a sort.** The "highest first" check passed against
  data that was already ordered in the sheet. Fixtures for an ordering claim have to be
  shuffled deliberately, or the assertion is about the input.
- **An optimistic row the app didn't write is supposed to disappear.** Simulating "another
  device wrote a row" with `allRows.push()` gets it dropped by the next reconcile —
  correctly, since it's in no pending-write set. Drive the real path: add the row to the
  GViz mock and let `reconcileFromServer()` fold it in.
- **Two overlays never stack — the second one closes the first.** `trapModalFocus` holds
  exactly one trap, so a sheet that hands off to another modal must close first
  (`openManualFromCapture()`, the day sheet → txn modal). Closing restores focus to the
  trigger, which the next modal then adopts as its own return target, and the chain stays
  intact for free.
- **Run a new pixel probe as a negative control before trusting it.** The single-category
  ring-continuity check walked the ring's *mid-band* and passed against the very defect it
  was written for: rounded caps bite a notch out of the **inner** edge while still touching
  at mid-radius. One radius is not a ring — sample inner, mid and outer. A probe that has
  never been seen to fail is not evidence of anything.
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
