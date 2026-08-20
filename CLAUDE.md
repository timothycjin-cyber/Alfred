# CLAUDE.md

*Last updated: 2026-08-20 — **Browser-level checks now have a committed harness
(`test/browser/`, §3.12), not just the throwaway render loop.** Mocks the sheet, stubs
Chart.js, pins the clock — the plumbing that used to get rebuilt from scratch each
session — plus a 26-check smoke suite covering boot, layout overflow, and the pill
hit-testing bug from the 2026-08-19 change (kept as a permanent regression test). Runs
in CI on every push/PR via a new `browser-tests.yml`, separate from the zero-install
`tests.yml`. ⚠️ **`page.emulateMedia()`, not the `reducedMotion` context option** — the
option didn't reliably reach `matchMedia()` before the app's script ran on this Chromium
build; `helpers/app.js` calls `emulateMedia()` explicitly before `goto()` instead (§8).
`@playwright/test` is pinned to an exact version, not a range, so CI always fetches the
browser this suite was verified against. Reasoning in §6 "Committed browser smoke suite";
the 2026-08-19 banner moved to the `alfred-history` skill. **The convention is one
banner: the current change only.** When it is superseded, it moves to the history skill rather
than being pushed down into a queue. Two facts that live nowhere else: earlier roadmap files
were consolidated into §6 (2026-07-19), and code comments in `index.html` still reference
roadmap phase names — §6 and the history skill keep those names resolvable.*
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
| 0 | Date | Plain date in the cell; GViz reads it back as Date(YYYY,M,D) with **month 0-indexed** — `gvizDateToIso()` adds +1 when formatting to YYYY-MM-DD. Known off-by-one bug source, at two levels: ⚠️ reading the ISO string back with `new Date(iso)` parses **UTC** midnight and every getter the app uses is **local**, so use **`parseRowDate()`** (§3.12) and never `new Date(row.Date)`. |
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

The stack, the GViz URL and the Apps Script endpoint are all read straight out of
`index.html` — see the `<script>` block's constants.

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

**The right slot** (`#masthead-actions`, 2026-08-19) holds the **Logs** actions — the recurring
glyph and the export icon, moved out of the deleted `.logs-toolbar` (§3.6). `#masthead` was
already `justify-content: space-between` with a single child, so the slot cost nothing to open.

- **Logs-only, via `hidden`.** `renderMasthead()` sets `mhActions.hidden = currentView !== 'logs'`.
  ⚠️ `.masthead-actions[hidden] { display: none }` is **load-bearing** — the base rule's
  `display: flex` beats the UA sheet's `[hidden]`, the same trap `.pill[hidden]` already carries.
  `hidden` rather than `opacity`/`visibility` because it is also what keeps them out of the tab
  order on Today and Trends.
- ⚠️ **`align-self: center`, against the flex container's `align-items: baseline`.** An icon
  button has no baseline of its own, so baseline alignment drops a 44px circle below the serif
  and **changes the masthead's height** — which moves the title and re-derives `--pill-travel`.
  Both are asserted against the pre-change build; both fire if the line is removed.
- **Tools, not figures.** This does not touch the governing principle above: the masthead still
  names the period and never measures it. A repeat glyph and a download glyph state nothing about
  the month; a *figure* up here is still out of scope (§6).
- ⚠️ **They share the corner with the pill**, which is what forced the pill's hit-testing to be
  made to fail closed — see its `pointer-events` note below.

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
  (`mh-pill-hit`, flipping at 40%), **over a resting `none` in `.pill`** (fixed 2026-08-19). At
  `--p: 0` the pill is transparent, so a tap in the corner has to land on whatever is underneath.
  The gate **must** live on the pill — the element that receives the events — not in `body`'s
  animation list. ⚠️ **The resting value is the load-bearing half.** An animation beats a normal
  declaration, so the keyframes still win whenever the timeline is *running* — but a scroll
  timeline on a document too short to scroll is **inactive**, and an inactive timeline's keyframes
  do not apply at all. With `pointer-events: auto` in `.pill` (as it was), a month with a couple
  of entries left a fully transparent 114px button parked across the top-right corner, eating
  every tap that landed on it. Latent while nothing else was up there; live the moment the right
  slot arrived. **Never put that base value back to `auto`.** `#masthead` carries the
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
- **Toolbar — GONE; the two icons are in the masthead** (2026-08-19). `.logs-toolbar` was a
  slim right-aligned `.icon-btn` row atop `#logs-view`; it is deleted, markup and CSS, and the
  recurring glyph (§3.13) and the export icon now sit in `#masthead-actions` (§3.4). Nothing
  about the buttons themselves changed — same 44px `.icon-btn`, same `.icon-btn:active` press
  scale, same handlers, same order — so export still follows the scroll readout exactly as the
  bullet above says. `#logs-view` now starts with `#logs-ledger`. It was 44px of chrome sitting
  directly beneath a 31px serif title, holding two controls the masthead had an empty right slot
  for.
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

### 3.12 Verification loop + the committed test layers

**Three layers, and they answer different questions.**

- **The render loop** (the `alfred-verification` skill) is per-change verification: how to
  drive it, and the harness lessons that each cost a false pass. Read it before writing or
  trusting a suite. It is still written per pass and still thrown away — that is fine, it is
  asking "did this change do what I meant?"
- **`test/` is the pure-logic regression layer** (added 2026-08-15), and it is committed. It
  asks "is the logic still true?" — dates, week clipping, recurrence, the reconcile merge.
- **`test/browser/` is the browser-level regression layer** (added 2026-08-20), also
  committed. It asks "does the app still boot, render, and let you open the things you should
  be able to open?" — the DOM/interaction floor `test/` can't cover because it never touches a
  browser. The render loop is still where change-specific assertions get written; this is
  what a new pass can build ON rather than rebuilding the harness underneath them.

```
lib/alfred-core.js         pure core — no DOM, no fetch, no clock read
test/alfred-core.test.js   36 tests, node --test, zero dependencies
test/run.sh                the same suite in four timezones

test/browser/helpers/app.js       openApp() — mocks the sheet, stubs Chart.js, pins the
                                   clock, waits for boot. The reusable half.
test/browser/fixtures/            the GViz mock (deliberate month gap) and the Chart.js stub
test/browser/smoke.spec.js        26 checks, 2 projects (390 light-reduced / 900 dark-motion)
```

- **The harness is the reusable part; the assertions aren't.** `openApp()` is what used to get
  rewritten from scratch each session (mocking the sheet, stubbing the CDN-blocked Chart.js,
  pinning the clock without freezing Chart.js's own animator). A future change only has to add
  the specific check, not rebuild the plumbing under it — same relationship `lib/alfred-core.js`
  has to `index.html`.
- **CI runs it on every push/PR** (`.github/workflows/browser-tests.yml`), separately from the
  zero-install `tests.yml` — this one genuinely needs `npm ci` and a downloaded browser, and
  keeping the jobs apart means a browser-tooling failure can't be mistaken for a core-logic one.
  `@playwright/test` is pinned to an **exact** version in `test/browser/package.json`, not a
  range, so CI always fetches the same browser this suite was last verified against.
- ⚠️ **`page.emulateMedia()`, not the `reducedMotion` context/project option.** The option didn't
  reliably reach `matchMedia()` before the app's own script ran, on the Chromium build this was
  built against — `openApp()` reads the active project's intended `reducedMotion`/`colorScheme`
  and applies both via `emulateMedia()` before `goto()`, which does work reliably. Matters because
  the app reads `matchMedia('(prefers-reduced-motion: reduce)')` **once**, into a `REDUCED_MOTION`
  const, at script-parse time (§3.2) — a call made after navigation is too late for that flag even
  though the CSS media query itself updates live. See §8.
- **`smoke.spec.js`'s masthead-corner checks are a permanent regression test for the
  2026-08-19 pointer-events bug** (§3.4, §6) — proved to actually fail against the pre-fix CSS
  before being trusted, per the alfred-verification skill's own rule for a new probe.

- **Run it with `./test/run.sh`.** ⚠️ **One timezone is not a run.** The suite exists partly
  because a UTC-midnight parse and a local-midnight one agree at UTC+8 and disagree west of it;
  reverting that fix fails **13 tests at `America/New_York` and zero at `Asia/Kuala_Lumpur`**.
  Anything that buckets a row by month or day has to be proved in both directions.
- **CI runs it on every push to `main` and every PR** (`.github/workflows/tests.yml`, added
  2026-08-15). Nothing to install — no `package.json`, no lockfile, no cache, no secrets — so the
  job is checkout, `setup-node@22`, `./test/run.sh`. ⚠️ **The timezone list lives in `run.sh`
  only.** A CI job matrix would print prettier per-TZ check names and would be a second copy of
  that list; two doors built from different lists is the §8 trap. The log names the failing zone.
- ⚠️ **`run.sh` is deliberately NOT fail-fast** — it runs all four and prints the full matrix,
  because *which* zones fail is the diagnosis. **A split result (green at `Asia/Kuala_Lumpur`,
  red west of UTC) is the signature of a date parse**; all four red is ordinary broken logic. The
  script says so on a split, and stays quiet about it when everything failed.
- ⚠️ **`node --test test` does not work** — the bare directory name resolves against the module
  loader and dies with `MODULE_NOT_FOUND` before running anything. `run.sh` globs `*.test.js`.
- **`lib/alfred-core.js` loads twice, two ways.** A `<script src>` in `index.html` **before** the
  inline block (⚠️ **no `defer`** — same reason the Chart.js tag can't have it), where a
  UMD-lite wrapper `Object.assign`es the API onto `globalThis`; and `module.exports` under Node.
  A side effect worth knowing: the core's functions ARE on `window`, unlike the inline script's
  top-level `let`/`const`, so a probe can read them the obvious way.
- **`MONTHS` lives in core now** and is deleted from the inline script — `weekRangeLabel()` needs
  it, and one copy can't drift. `MONTHS_FULL`, `WEEKDAYS_MON` and `DAYS_FULL` stay inline.
- **The rule for what belongs in core:** if it needs the DOM, the network or the wall clock, it
  stays in `index.html`. "Today" is always passed in.
- ⚠️ **Figure assertions in the render loop need `reducedMotion: 'reduce'`.** `animateCounters()`
  counts up, so a read 600ms after load lands on an intermediate frame — the hero measured
  `RM 1,859.70` on its way to `1,887.00`. Reduced motion makes counters write final values
  immediately, via a real app path.

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

**Before committing, run `./test/run.sh`** (§3.12) — four timezones, ~1s, no install. It is the
one check that now outlives the session that wrote it, and **CI runs the same script on every PR**,
so skipping it locally only means finding out later.

**The only live items are owner steps, and they are Apps Script side:**

- **Phase F** — two boxes still unticked in §6's checklist: delete the
  `sendDailyDigestPush` time-driven trigger, and drop the `FIREBASE_SA_JSON` /
  `FCM_PROJECT_ID` Script Properties. Both are harmless if left (the function they name no
  longer exists), but the trigger fails silently in the execution log every night.
- **Everything else is deployed.** Apps Script was last redeployed for Phase G, so the
  `recurring` action and `handleAdd`'s duplicate guard are live. Every change since
  2026-08-08 has been front-end only — **no Apps Script change, no redeploy**, and that
  includes the 2026-08-19 masthead-actions move and the 2026-08-20 test harness addition.
- **CI is now two jobs.** `tests.yml` (zero-install, pure logic) and `browser-tests.yml`
  (`npm ci` + a downloaded Chromium, `test/browser/`) both run on every push and PR (§3.12).

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

**The shipped-phase records below are trimmed to their binding decisions and owner steps.**
The design rationale, the spec deltas and the verification narrative for each pass live in the
`alfred-history` skill — read it when you need to know why a fork was taken.

### Phase F — Push digest retirement ✅ DONE (2026-07-19)

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

**Owner checklist — complete.**

1. ✅ Apps Script **redeployed** via Manage deployments → Edit → new version, so the
   `recurring` action and the `handleAdd` duplicate guard are live.
2. ✅ Nothing to set up in the Sheet: the `Recurring` tab is created on first save.

**Owner step after merge:** ✅ done — Apps Script redeployed via Manage deployments →
**Edit** → new version. The `Recurring` tab is created automatically; no manual Sheet setup.

### Logs day columns + day drill-in ✅ DONE (2026-08-08)

Three decisions future phases must not re-open:

1. **Weeks clip to the month they render under** — a boundary week appears once under each
   month with only that month's days, and a short week (fewer than 7 columns) is correct.
2. **Logs has no accordion.** The week header is informational only.
3. **The week-level transaction list is gone**, deliberately. Seeing a whole week at once
   was accepted as removed; the day sheet is the sole drill-in. A week-scoped sheet hung
   off the week total is a *possible* future — it was explicitly out of scope, not
   forgotten.

### Trends category drill-down ✅ DONE (2026-08-09)

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

### Logs month scope — option C ✅ DONE (2026-08-09)

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

### Header removal — month becomes the masthead ✅ DONE (2026-08-11)

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

### Lift-off pill ✅ DONE (2026-08-11, second pass)

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

### FAB long-press — REMOVED ✅ DONE (2026-08-13, third pass)

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

### Pure core + committed tests ✅ DONE (2026-08-15)

The first tests ever committed to this repo. Prompted by a coverage audit that found the app had
excellent *verification* and zero *regression testing* — every suite ever written for it was run
once and discarded, so nothing guarded a change made three sessions later.

Shipped: `lib/alfred-core.js` (the pure core, extracted — no behaviour change), `test/` (36 tests,
`node --test`, no dependencies), `test/run.sh` (four timezones), and fixes for three defects the
audit found by reading. Verified with 36 tests × 4 timezones, 13 negative controls against
deliberately broken copies (12 fired; the 13th is the deliberate proof that the date bug is
invisible at UTC+8), and a 21-check browser pass at 390px.

Decisions future phases must not re-open:

1. **`parseRowDate()` is the only way to parse a row's date.** Not `new Date(iso)`, not
   `new Date(iso + 'T00:00:00')` — one idiom, so the invariant is greppable. There are **zero**
   `T00:00:00` literals left in `index.html`; keep it that way.
2. **The pure core is a separate file, and pure means pure.** No DOM, no fetch, no clock. "Today"
   is passed in. This is what makes the recurrence and reconcile logic testable at all, and it
   was already half-true by design — `recurrenceDates()` had carried an injectable `todayIso`
   since Phase G without anything ever driving it.
3. **The committed suite does not replace the render loop.** It is a floor, not a ceiling — ~15
   checks' worth of "does the app still boot and add up", plus the pure core. Per-change
   verification is still the skill's throwaway loop.
4. **Every renderer that interpolates sheet text into `innerHTML` escapes it.** `txnRowHtml()`
   was the one that didn't; `archiveCardHtml()`'s top-category line was fixed with it. The drill
   sheet's title and sub use `textContent` and are fine as they are.
5. **`csvEscape()` guards formulas but exempts plain numbers.** A negative amount must stay
   numeric or the export stops summing, which is the whole point of the file.

**Not done, and deliberately out of scope for this pass** (from the audit's tiers 3 and 4):
porting the Apps Script validation tests back from the retired bot's repo — `Code.gs`'s
`validateTransactions()` is still the app's only extraction/validation implementation and still
has no tests — and a committed render-loop smoke suite. The browser pass written for this change
lives in the scratchpad, not the repo.

### Committed browser smoke suite ✅ DONE (2026-08-20)

`test/browser/` — a committed Playwright suite, alongside the existing pure-logic `test/`. The
render loop (alfred-verification skill) was being rebuilt from scratch every session it was
needed: mocking the sheet, stubbing the CDN-blocked Chart.js, pinning the clock. That plumbing
is now `helpers/app.js`, reusable; a 26-check `smoke.spec.js` sits on top of it and runs in CI
(`browser-tests.yml`) on every push/PR. Shipped state is in §3.12.

Decisions future phases must not re-open:

1. **The render loop still exists and still gets written per change.** This is a floor under
   it, matching `test/`'s relationship to the render loop's logic checks — not a replacement.
2. **`openApp()` is the one place harness plumbing lives.** A new browser check adds an
   assertion, not a new mock/routing/date-pinning setup.
3. **`page.emulateMedia()`, called before `goto()`, not the `reducedMotion` context option** —
   found not to reliably reach the app's script-parse-time `REDUCED_MOTION` const otherwise
   (§3.12, §8).
4. **`@playwright/test` is pinned exact in `test/browser/package.json`.** A floating range
   would let CI fetch a different browser than the one this suite was verified against.

### Logs actions move into the masthead ✅ DONE (2026-08-19)

The `.logs-toolbar` row is deleted and its two icon buttons live in `#masthead-actions`, the
masthead's right slot (§3.4, §3.6). Front-end only — no Apps Script change, no redeploy.
Verified 45/45 at 390px and 900px, light and dark, in both motion modes, with six negative
controls; `./test/run.sh` unchanged at 36 × 4 timezones.

**It does not reopen "the masthead names the period, it never measures it."** That rule is about
*figures*. A repeat glyph and a download glyph state nothing about the month, so they are inside
it; "budget left" in the corner is still out of scope (§6, out-of-scope list).

Decisions future phases must not re-open:

1. **The Logs toolbar is not coming back.** Two controls do not earn a 44px band of chrome under
   a 31px title when the masthead has an empty right slot. Anything that wants a third Logs-level
   control goes in the slot or finds another home.
2. **The slot is Logs-only, and it is hidden with `hidden`.** Not `opacity`, not `visibility` —
   the tab order is the reason. Today and Trends have nothing in the corner.
3. **The pill's resting `pointer-events` is `none`.** `mh-pill-hit` turns it *on*; it does not
   turn it off. The gate has to fail closed, because a scroll timeline is inactive on an
   unscrollable document and the keyframes then do not apply at all (§3.4, §8).
4. **The masthead's height, the title's position and `--pill-travel` are unchanged**, asserted
   against the pre-change build. Anything added to the slot has to hold that — which in practice
   means `align-self: center` and a control no taller than the 44px `.month-btn` floor.

**A finding about the loop, not the change:** the bug in decision 3 was found because Playwright
*refused to click* the new icons — the harness reported an interception, which is a stronger
signal than any assertion the suite contained. A click that cannot be performed is a result; do
not route around it with `{ force: true }`.

### Design fix spec ✅ DONE (2026-08-10, second pass)

Decisions future phases must not re-open:

1. **`body` never pins the `wght` axis.** It is a variable font; the axis beats
   `font-weight` and nothing in the DOM reveals the override. §3.2.
2. **Light and dark semantic tokens are separate values**, tuned against their own ground.
3. **Good news is stated, not coloured**, and **sienna is the only primary**. Semantic
   colour and solid fills are reserved for the states that need attention.
4. **The donut is untouched** — cap radius, spacing and small-slice folding are exactly as
   they shipped 2026-08-04, asserted pixel-identical against `e08da4f`.

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
  first, so it throws on load (§6). ⚠️ **The same applies to the `lib/alfred-core.js` tag**, which
  the inline script calls into at module scope
- Parsing a row's date with `new Date(row.Date)` or `new Date(row.Date + 'T00:00:00')` — both are
  superseded by `parseRowDate()`, and the first one is a live bug west of UTC (§1, §3.12, §6)
- Interpolating sheet text into `innerHTML` without `escapeHtml()` (§3.6, §6 — `txnRowHtml()` was
  proved exploitable before the 2026-08-15 fix)
- Reinstating the Logs toolbar row, or putting a *figure* in the masthead's right slot (§3.4,
  §3.6 — the row was deleted 2026-08-19; the slot takes tools, and the masthead still never
  measures the period)
- Setting `.pill { pointer-events: auto }` — the resting value must stay `none` so the gate fails
  closed on an unscrollable document (§3.4, §8)
- Any new backend endpoints, LLM calls, or paid services

---

## 7. History

The full change history — what each pass built, why each fork was taken, where the shipped work
deviated from its brief, and the verification record — is the **`alfred-history` skill**. It is not
loaded by default; invoke it when you need the reasoning behind a past decision, or to resolve a
roadmap phase name referenced in an `index.html` comment.

---

## 8. Key Learnings & Principles

- **Verification and regression testing are different jobs, and doing the first one well hides
  that you are not doing the second.** Every suite this app ever had was rigorous, ran once, and
  was deleted — 23 to 72 checks a phase, none of which could fail on any later change, because
  none of them existed any more. The practice looked like testing from the inside. The question
  that separates them: *would this catch a break introduced three sessions from now?* If the
  answer is "the file is gone", the answer is no.

- **A bug that is invisible in the author's own timezone will live forever.** `new Date(iso)`
  parses UTC midnight; `getMonth()`/`getDate()` read local. East of UTC the two agree, so at
  UTC+8 the app was correct by geography while 24 call sites were wrong by construction. West of
  UTC the salary row dated the 1st files under the previous month and the budget reads zero —
  same code, same data. Anything environmental (timezone, locale, DST) needs the *matrix*, not a
  run; and a green suite in one environment is a statement about that environment.

- **Reach for a property test when two implementations must agree.** `recurrenceDates()`
  enumerates the schedule and `nextOccurrence()` computes it analytically in O(1), and nothing
  held them in step — the kind of pair where examples pass and the disagreement hides on the
  29th of a leap February. One property (*the analytic answer is the first enumerated date after
  today*) over 1,000+ generated cases covers what a page of examples would not.

- **Extracting for testability is a code move, not a rewrite — keep it that way.** The core came
  out in one commit that changed no behaviour, so the render loop's only job was proving the app
  still rendered identically. The moment an extraction also "improves" the logic, nothing can
  tell you which half broke it.

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

- **A chrome element is usually doing an invisible job as well as its visible one.** The
  header looked like it held a title and nothing else. It was also supplying the status-bar
  inset in standalone PWA mode and being the sticky offset the Logs scroll subtracted.
  Neither is visible in the markup, and neither fails loudly — one runs content under the
  status bar only in an installed PWA, the other lands every month jump 77px off. Before
  deleting a layout element, grep for what *measures* it, not just what styles it.

- **A scroll timeline on an unscrollable document is INACTIVE, and an inactive timeline's
  keyframes do not apply at all.** So any property an animation is gating falls back to whatever
  the base rule says — which makes the base rule, not the keyframes, the value that has to be
  safe. The pill gated `pointer-events` to `none` at rest via `mh-pill-hit` and declared `auto`
  in `.pill`; on a two-entry month there is nothing to scroll, the keyframes never ran, and an
  invisible 114px button sat across the top-right corner eating taps. Write the gate so the
  un-animated state is the *closed* one: an animation beats a normal declaration, so turning
  something **on** in keyframes still works, while turning it **off** in keyframes only works
  while the timeline happens to be live.

- **A context-level emulation option and the runtime call that does the same thing are not
  guaranteed interchangeable.** Playwright's `reducedMotion` context/project option and
  `page.emulateMedia({ reducedMotion })` are documented as equivalent; on the Chromium build
  `test/browser/` was built against, only the runtime call reliably reached `matchMedia()`
  before the page's own script ran. Harmless for a check that only reads *computed CSS* (media
  queries re-evaluate live regardless of when emulation lands), and silently wrong for one that
  reads a JS flag captured **once** from `matchMedia()` at script-parse time — which is exactly
  what this app's `REDUCED_MOTION` const is (§3.2). Found by building a regression test for a
  real bug and watching it pass against the still-broken code (§3.12) — the harness lesson under
  the harness lesson: a new probe has to be proven to fail before it's trusted to pass.

- **A tool that refuses to perform an action has told you something an assertion could not.**
  Playwright would not click the relocated icons — it reported another element intercepting
  pointer events, and that report *was* the bug. The suite had no probe for it, and would not
  have grown one, because "is this button clickable" is not a question you think to ask about a
  button you can see. Read a harness's refusal as a finding before reaching for `{ force: true }`
  or a coordinate click.

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

- **Two overlays never stack — the second one closes the first.** `trapModalFocus` holds
  exactly one trap, so a sheet that hands off to another modal must close first
  (`openManualFromCapture()`, the day sheet → txn modal). Closing restores focus to the
  trigger, which the next modal then adopts as its own return target, and the chain stays
  intact for free.

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

- **The harness lessons live in the `alfred-verification` skill** — negative controls, canvas pixel reads, clock pinning, synthetic-input traps, and the probes that shipped false passes. Read it before writing or extending a suite.
