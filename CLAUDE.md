# CLAUDE.md

*Last updated: 2026-07-18 (**restructure Phase 5 — Trends month navigation**: Trends now runs on its own `viewMonth` state — ‹ month › nav chip, live-month forecast tile vs closed-month actuals + archive card, archive shelf moved to the bottom; see §3a. Earlier same day: **Phase 4 — Logs week index**: the ledger is now Mon–Sun week rows under month headers, accordion expansion, spend bars + trailing-8-week average marker, lazy month windowing; see §3a. Earlier same day: **Phase 3 — Today tab composition**: hero → tiles → glance line → live pace bar → 14-day capture strip; pace bar now shared Today+Trends; see §3a. Earlier same day: **Phase 2 three-tab nav** — **Today · Logs · Trends** with a detached 56px sienna FAB above the pill; see §3a "Nav restructure". Roadmap: `ALFRED_RESTRUCTURE_ROADMAP_v2.md` in-repo. Earlier same day: optimistic writes. Prior 2026-07-16: **one-handed ergonomics pass** — capture bar moved into a FAB-opened bottom sheet, FAB docked center of the nav pill, camera input also offers gallery, refresh icon removed; see §3a. Earlier: **Telegram bot DECOMMISSIONED** — the web app is now the whole product; `apps-script/Code.gs` is the single extraction/validation implementation. Earlier same day: repo decoupled from the bot; Phase 0 done — Firebase `project-alfred-f7575` configured [PRs #22/#23], capture bar, insights and the FCM push digest all VERIFIED LIVE on Android; nightly 10–11pm trigger set. Prior: independent-web-app build 2026-07-15.)*

---

## 0. Overview

**Project Alfred** is a personal finance web app — this repo. It captures expenses in natural language or from receipt photos, visualises spend/income, and pushes a nightly digest notification. It is an installable PWA on GitHub Pages, with the shared Google Sheet's own Apps Script as its entire backend (see §3b) — **fully serverless, no paid hosting anywhere.**

**Product model:** capture must be effortless (log an expense in seconds, confirm-before-save), analytics are pull-based and visual (trends, breakdowns, insights), and the digest is push (10pm notification). All three now live in this one app.

**The former Telegram bot is decommissioned (2026-07-16).** This app replaced it outright — capture, glance, and push all proved out here, so the bot and its Railway hosting were retired rather than ported (the old "Phase D" plan). Its repo (`timothycjin-cyber/project-alfred`) is a historical record; rows it wrote (Source `telegram`/`telegram-image`) remain in the Sheet as valid data.

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
| 4 | Source | `web` / `web-image` (capture bar), `dashboard` (plain FAB add), `telegram` / `telegram-image` (historical rows from the retired bot) |
| 5 | Type | Expense or Income |
| 6 | UID | Short unique id, e.g. mqx393vfm58v. Apps Script generates `Date.now().toString(36)` + random; rows from the retired bot are 12-char hex. Never assume a format — treat as opaque. |
| 7 | User | User id (integer stored as string; historically the Telegram chat_id — kept as the identity key). Written on every add/edit. Legacy rows backfilled via Find & Replace in col H. |

**Income Categories:** Salary, Freelance, Bonus, Investment, Side Income, Reimbursement, Other Income
**Expense Categories:** Food & Dining, Transport, Shopping, Groceries, Entertainment, Bills & Utilities, Other

**Write path (the only one since the bot's retirement):** this app → fetch() POST → Google Apps Script Web App → appends/edits/deletes rows in Sheet1.

There is also a **`PushSubs` tab** (User | Token | Created), auto-created by Apps Script — FCM push subscriptions, one row per device token.

---

## 2. Former Telegram Bot — DECOMMISSIONED 2026-07-16

Retired the same day the web app's capture/insights/push were verified live; the app made it redundant, so it was shut down instead of ported (superseding the old Phase D plan and the Railway stress test). Its repo (`timothycjin-cyber/project-alfred`, Python/Flask, formerly on Railway) remains as a historical record. The extraction prompt + validation rules it pioneered now live **solely** in `apps-script/Code.gs` — there is no second implementation to keep aligned anymore.

---

## 3. Dashboard (index.html)

**Live URL:** https://timothycjin-cyber.github.io/alfred-dashboard/

| Layer | Tool |
|---|---|
| Hosting | GitHub Pages (static) |
| Charts | Chart.js 4.4.1 (CDN) |
| Data read | GViz JSON endpoint (public, no auth) |
| Data write | Google Apps Script Web App (POST) |
| Auth for writes | Shared secret — key: "8891" in POST body |

**GViz URL pattern:**
`https://docs.google.com/spreadsheets/d/19_C3gFlY7hDjGm87k3Uke63_Tgg6TQPl6xLiGZvuEis/gviz/tq?tqx=out:json&sheet=Sheet1`

**Write path:** index.html → fetch() POST → Google Apps Script Web App → appends/edits/deletes row in Sheet1.

- **Apps Script:** attached to the Sheet via Extensions → Apps Script
- **Deployment:** Published as Web App (Execute as: Me, Access: Anyone)
- **Web App URL:** `https://script.google.com/macros/s/AKfycbzxRLfHCAbCspXIWSRt1xVAbLnNPlhiHHaWpTHGB23N1wkoMU74nHifMT9prU3rM4m6/exec`
- **Secret key:** 8891 (passed as key field in POST body)

**Apps Script key functions (deployed — do NOT redeploy unless changes made):**
doPost(e) routes add/edit/delete · handleAdd() (writes User col H) · handleEdit() (writes User col H) · handleDelete() · backfillUIDs() · findRowByUID() · generateUID().
⚠️ To update Apps Script: **Deploy → Manage deployments → Edit** → new version. Do NOT create a new deployment (different URL).

**User filtering logic (Pipeline 1 Phase 3 — DONE):**
- `activeUser` parsed from `?user=` query param on load
- `calculateAndRender()` applies a **strict** filter: a row renders only if `activeUser` is non-empty AND matches the row's User column exactly
- Opening without `?user=` → zero rows render (intentional strict privacy). Always test with `?user=YOUR_CHAT_ID`.
- No household/"view all" toggle — deliberate strict per-user isolation

**Design system:** Material 3 Expressive foundation — Roboto Flex UI, ink monochrome tokens, semantic red/green preserved, burnt-sienna (`#C2542D`) accent. Bouncy motion is core: `--motion-wobble` (overshoot cubic-bezier) drives the nav pill slider, hero/tile/chip pop-in animations, and bar transitions; `--motion-snap` for taps. FAB + modal + nav pill share a liquid-glass aesthetic. Theme-aware via `prefers-color-scheme`.

### 3a. Dashboard UX refresh (2026-07-11 vibe session — DONE)

Both tabs reworked from bordered `.metric` cards to a shared **`tile-block`** system + purpose-built cards. Drew inspiration from finance-app dribbble refs (hero balance card w/ embedded mini-chart, on-slice pie %s, income/expense pills), translated into Alfred's own tokens (not the refs' purple-on-white).

**Home:**
- **Net Balance hero card** (`.hero-card`, `#home-hero`) — full-width; **ink-black gradient in dark mode, monochrome off-white surface in light mode** (no shadow). Holds: privacy **blur toggle** (`toggleHeroPrivacy()` → `.value-hidden` CSS blur), and an embedded **6-month net-trend mini bar chart** (`heroChart`, current month in burnt-sienna, others tinted green/red by sign). Balance figure colored green/red by sign via semantic tokens.
- **Income / Expense tiles** (`#home-tiles`) — tinted-surface (`--wash-income`/`--wash-expense`), number colored by type, each with a `▲/▼ X% vs last month` outlined chip.
- **Transaction rows** — per-category **icon chip** (`.txn-icon-chip`, `CAT_ICONS` map) tinted from the existing `CAT_COLORS` map.

**Analytics:**
- **Average Daily Spend / Forecasted Spend** — same `tile-block` system (expense-tint / neutral-tint); emoji subtitles removed.
- **Spend card** (`#income-bar-block`) — no headline; a two-segment **"% of income spent · % left"** bar (`.income-bar-seg used/rem`) plus a **"Today" month-pace marker** (`.income-bar-marker` at month-elapsed %) and a `Day D of N · spending ahead/under/on pace` line (red/green/neutral). Marker + pace only render for the **current** month; needs `totalIncome > 0`.
- **Expenses by Category** — **solid pie** (was donut). `pieLabelsPlugin` draws bold on-slice %s (≥8%) + name+amount callouts with elbow leader lines; `variableRadiusPlugin` scales each slice's outer radius **subtly** by share (`0.92 + 0.08 × share`) so a dominant Food category doesn't lopside the circle. Center-total (old donut hole) and the separate Category Breakdown card were both removed — callouts carry name + amount now. **Every slice gets a callout** (tooltips are disabled, so callouts are the only ID for small categories): callouts route to a left/right column by slice angle, then de-collide vertically (32px min gap, clamped to canvas) — the old `pct < 8` skip now only gates the on-slice %.
- **Mobile centering:** every direct child of `#analytics-view` shares one `max-width:440px` + auto-center at ≤768px, so tiles/cards/charts all line up (previously tiles went full-width while charts stayed capped).

⚠️ Chart plugins (`pieLabelsPlugin`, `variableRadiusPlugin`) are gated on `chart.canvas.id === 'donut'` so they only touch the category pie, not the cumulative line. Custom callouts are drawn in Chart.js `layout.padding` — the pie renders at `radius:'90%'` inside a 380px-tall container with L/R padding for label room.

**Motion polish (2026-07-11, post-refresh — DONE):**
- **Staggered entrances:** hero lands first, tiles follow via `nth-child` `animation-delay` (70/140ms), txn rows cascade top-to-bottom (35ms apart, index capped at 10) through a per-row `--d` CSS var shared with each row's icon chip. All entrance keyframes use `backwards` fill so delayed elements stay hidden until their turn.
- **No-replay re-renders:** `renderedKey` (per view: `year-month-dataStamp`) makes `calculateAndRender()` a no-op when switching back to a tab whose content is already current — charts/DOM persist, nothing re-animates. `dataStamp` bumps on every `init()` fetch. On a genuine re-render (month switch, post-save), `hasEntranced` adds `.no-entrance` to the view, which kills hero/tile pop-ins (rows still cascade — they're new content).
- **Value-inertia counters:** `counterMemory` (keyed by `data-key` on each `.counter-val`) makes numbers animate **from their previous value** to the new one instead of re-counting from RM 0.00. First paint still counts up from zero.

**Quick-wins pass (2026-07-11, same session — DONE):**
- **`prefers-reduced-motion`:** zeroes the three motion tokens (collapsing every transition/animation built on them) + stagger delays; JS `REDUCED_MOTION` flag makes counters instant and sets `Chart.defaults.animation = false`. Loading spinner + refresh spin kept (status, not flourish).
- **Chip valence:** tile chips are now `.good`/`.bad` (green/red) by whether the change is good news — expenses dropping reads green. Average Daily Spend tile went expense-tint → neutral (it's information, not a warning).
- **Refresh feedback:** `.refresh-btn.spinning` spins the icon while `init()`'s fetch is in flight (also covers initial load); replaced the old `:active` rotate.
- **Category palette** (validated with the dataviz six-checks script, light+dark): Food & Dining `#C2542D` (own burnt-sienna hue — semantic expense red is reserved for amounts/deltas), Transport `#0891B2` (chroma fix), Entertainment `#DB2777` (contrast fix); Other stays deliberate-neutral `#495057`. "Last month" cumulative line + legend dot are now outline gray per theme (`#6C757D`/`#ADB5BD`) — reference, not warning.
- **Hero mini-chart negatives:** `minBarLength: 4` + `heroBaselinePlugin` (faint zero line, gated on `canvas.id === 'hero-trend'`) so negative-net months stay visible.

**Physics pass (2026-07-11, same session — DONE):**
- **Real spring easing:** `@supports (transition-timing-function: linear(0,0.5,1))` overrides the motion tokens with sampled damped-spring `linear()` curves — wobble = stiffness 320 / ζ 0.62 (~8% overshoot, 632ms), snap = stiffness 700 / ζ 0.85 (near-critical, 370ms). Old cubic-beziers remain as the fallback for pre-`linear()` browsers; the reduced-motion zeroing (later in the sheet) still wins.
- **Shared-axis tab transition:** incoming view springs in along X via `.axis-in-left/right` (direction = tab order), applied in `switchView()` only on an actual tab change. Companion fix: `display:none → block` restarts child CSS animations, so revisited tabs were replaying pop-ins despite the no-replay render skip — `.settled` (added on the skip path, removed on real renders) pins hero/tile/row/chip animations on revisit. ⚠️ **`.container` must keep `overflow-x: clip`** — the slide's transient `translateX` briefly widens the document, and on mobile that makes `position:fixed; right:0` bars (nav, modals) size to the widened layout viewport and *sustain* the overflow, which the browser then zooms to fit ("Analytics zooms in slightly after a few toggles"). `clip` (not `hidden`) contains it while leaving `overflow-y` visible so vertical scroll + the sticky header are unaffected.
- **Spend bar actually springs now:** segments + Today marker mount at their previous state (`barMemory`, or nearly-empty on first render) and get their real `flex-grow`/`left` one frame later, so the wobble transitions fire (elements born at final state never animate). Verified overshoot: 10.1 → 19.25 → settles 18.14.
- **Loader:** spinner replaced with a 4-bar bouncing mini bar-chart (staggered 120ms, last bar burnt-sienna); under reduced motion it becomes an opacity pulse (`loaderPulse`).
- **Micro:** txn rows get a `scale(0.985)` press squish matching the tiles.

**Modal polish (2026-07-12 — DONE):** both overlays (`#modal-overlay`, `#export-overlay`) are now `role="dialog" aria-modal="true" aria-labelledby=…`.
- **Focus management:** `trapModalFocus(overlay, initial)` remembers the trigger, moves focus into the sheet on open (`preventScroll` so the entrance isn't yanked), and confines Tab/Shift+Tab within it; `releaseModalFocus()` restores focus to the trigger on close.
- **Escape-to-close:** one global `keydown` — Escape backs out of the delete confirm first (if shown), otherwise closes whichever overlay is open.
- **In-modal delete confirm:** native `confirm()` is gone. The outline-red Delete button (`askDeleteConfirm()`) escalates to a solid-red confirm row (`.btn-danger-solid`, "Delete this entry? This can't be undone."); `cancelDeleteConfirm()`/`resetDeleteConfirm()` restore the main actions (also reset on open/close). `deleteTxn()` now assumes intent is already confirmed and drives the confirm button's `Deleting…` state.

**No auto-pop keyboard on open (2026-07-12 — DONE, PR #20):** user feedback said the txn modal's keyboard auto-popping on open (from focusing `#modal-amount`) got in the way — people wanted to see the modal before typing. `openTxnModal()` now calls `trapModalFocus(overlay, overlay.querySelector('.modal-sheet'))` instead of focusing the amount field; the sheet got `tabindex="-1"` + `outline:none` so it's a valid, invisible focus target that doesn't trigger a mobile keyboard. The export modal is untouched (it already focuses a button, not a field). `trapModalFocus`'s Shift+Tab wrap now also matches `document.activeElement === sheet` (not just `first`), since initial focus can sit on the sheet itself, outside the normal focusable list.

**Insights strip — Phase 1 (2026-07-12 — DONE):** a short-narrative "What I noticed" card at the top of `#analytics-view` (`#analytics-insight`, `.insight-card`). Grew out of the daily-summary idea into a broader pattern-spotter.
- **Deterministic engine (all in JS, free & instant):** `buildAnalyticsInsight()` collects candidate facts from six builders across the four families the user picked — `_insightPace` (MTD vs same-point-last-month for the current month; whole-month vs prior for past months), `_insightCategory` (3-month monotonic climb, or a ≥40% jump/drop vs recent average; guarded at ≥RM30), `_insightRecurring` (descriptions repeating ~once/month across ≥3 months at a stable amount — CV ≤ 0.2, occurrences ≤ 1.5×months — reported as annualized load), `_insightWeekend` (weekend-vs-weekday intensity over trailing 8 weeks), `_insightStreak` (longest no-spend run in the month), `_insightComposition` (dominant category share). Each returns `{family, score, text}`; the top 3 **distinct families** by score compose the narrative. Guards: `<5` expense rows → "log a few more days" fallback; no strong candidate → "steady month" line.
- **Numbers are computed, never guessed** — every figure comes from the row scan, so the narrative can't misstate them. `<b>` bolds figures; `.up`/`.down` spans carry red/green valence.
- Rendered in the analytics branch of `calculateAndRender()`, so it respects the month selector and the no-replay/`.settled` skip.
- **Novelty rotation:** `computeInsightNarrative()` de-prioritizes families shown on recent generations (`localStorage` per user, last 5 gens; penalty `28·0.55^age` subtracted from score before the top-3 pick). Modest + decaying, so a dominant story (big pace/category swing) persists while the mid-tier rotates across days. Verified: pace stayed pinned while slots 2–3 cycled timing → recurring → timing. Only genuine renders record history (the `.settled` skip doesn't), and fallbacks record nothing.
- **Typewriter reveal:** `typewriteInto()` sets the real innerHTML (so `<b>`/valence spans exist), then types it out over the DOM's text nodes via `requestAnimationFrame` (duration `clamp(chars·14ms, 500, 1900)`), with a blinking burnt-sienna caret (`.insight-body.typing::after`). Sells the "live analyst" feel. Reduced motion shows the full text instantly with no caret; a new render cancels the prior `_twRAF`.

**One-handed ergonomics pass (2026-07-16 — DONE, refined same day):** mobile-reach tweaks from user feedback (left-handed, one-handed use):
- **Capture bar moved off the top of Home into a FAB-opened capture sheet** (`#capture-overlay`, `.modal-overlay.align-bottom`). The sheet floats just above the nav pill (`padding-bottom: 96px` on the overlay) — right where the thumb already is after tapping the FAB. The classic add/edit form is one tap away via its "Enter manually" button (`openManualFromCapture()` → `openTxnModal(null)`, so `pendingSource` still resets and plain adds still send `source:'dashboard'`). `handleParsedResult` closes the sheet before opening the confirm modal/review list; capture notes render inside the sheet and persist to the next open (cleared on each new parse). Same no-keyboard-auto-pop pattern as the txn modal (initial focus on the sheet). Escape-to-close covers the new overlay.
- **Container-transform entrance:** the sheet's closed state is `scale(0.08)` + full border-radius with `transform-origin: 50% calc(100% + 44px)` (the FAB's spot below it); opening springs it to full size via `--motion-wobble` — the FAB visually blooms into the sheet. ⚠️ The 44px origin offset assumes overlay `padding-bottom: 96px`, nav bottom 24px, pill 48px — re-derive if any of those move.
- **FAB docked in the center of the nav pill** — Home · (+) · Analytics in one glass pill (280px), a 40px FAB flush inside the 48px bar (no poking), dead center so either thumb reaches it. Slider math: width `calc(50% - 28px)`, Analytics position `translateX(calc(100% + 48px))` (hops over FAB + gaps) — set in `switchView()`. ⚠️ Keep slider geometry in sync if pill width/FAB size/gap change.
- **WhatsApp-style photo entry:** two hidden file inputs — clip button (left of input) → `#capture-gallery-file` (bare `accept="image/*"`, OS offers gallery/files, screenshots work); camera button (right, next to send) → `#capture-camera-file` (`capture="environment"`, straight to camera). Both feed `handleCaptureFile`.
- **Photo + comment:** a chosen photo no longer sends immediately — it parks as `pendingImageB64` with a thumbnail chip (`.capture-attach`, removable ×) above the input, so a note ("2 pax, only count my half") can be typed; send submits both, note as the photo `caption`. Attachment survives sheet close/reopen until sent or removed; cleared on successful parse.
- **Refresh icon removed** (pull-to-refresh reloads the page anyway); `init()` no longer touches `.refresh-btn`; bell + export remain right-aligned in the header. `@keyframes refreshSpin` kept — the capture-send busy spinner uses it.

**Nav restructure — Phase 2 of `ALFRED_RESTRUCTURE_ROADMAP_v2.md` (2026-07-18 — DONE).** Three tabs **Today · Logs · Trends** (Today is the default landing tab) + a **detached FAB**. ⚠️ This supersedes every docked-FAB geometry number in the ergonomics-pass notes above.
- **Pill:** still 280×48px glass, 4px padding, 4px gaps — but three equal text tabs, no FAB inside. Slider width `calc((100% - 16px) / 3)` (100% is the padding box: subtract 2×4 padding + 2×4 gaps, over 3); slot n = `translateX(calc(n·100% + n·4px))`, set in `switchView()` from `VIEW_ORDER = ['today','logs','trends']`. Shared-axis slide direction generalized: moving right in tab order → `axis-in-left`, so 1→3 slides the same way as 1→2.
- **FAB:** 56px sienna (`--sienna: #C2542D`, new token) circle floating 12px above the pill, centered — `.bottom-bar` is now a column stack anchored `bottom: calc(24px + env(safe-area-inset-bottom))`. Sienna-tinted drop shadow; white icon; `body.modal-open-state` rotate kept.
- **⚠️ Derived numbers (re-derive all if the cluster moves):** FAB center = **112px** + safe-area above the viewport bottom (24 bar + 48 pill + 12 gap + 28 half-FAB). Capture-sheet overlay `padding-bottom: calc(150px + env(safe-area-inset-bottom))`; bloom `transform-origin: 50% calc(100% + 38px)` (150 − 112). `body` `padding-bottom: calc(164px + inset)` clears the cluster; toast sits at `bottom: calc(152px + inset)`.
- **Temporary tab composition** (real Today/Logs builds are roadmap Phases 3–4): **Today** = hero + income/expense tiles + today-glance line; **Logs** = the flat month timeline (`#logs-timeline`, moved off Home — cascade base delay now 0, no hero above it); **Trends** = everything Analytics had (shelf, insight, tiles, pace/archive card, charts, heatmap). Renames: panes `#today-view/#logs-view/#trends-view`, `#today-hero/#today-tiles/#today-glance`, `#trends-insight/#trends-metrics`, `renderAnalyticsInsight()` → `renderTrendsInsight()`; `renderedKey`/`hasEntranced` keyed by the three new names. "Home"/"Analytics" no longer exist in code.
- Verified with the Playwright loop (36 checks, 390/900 × light/dark: pixel-exact slider alignment on all three tabs incl. after a live theme flip, FAB geometry, bloom origin landing on the FAB center, 1→3 slide direction, no overflow-x creep over repeated toggles, Logs row → edit modal, Escape closes the sheet).

**Today tab composition — Phase 3 of `ALFRED_RESTRUCTURE_ROADMAP_v2.md` (2026-07-18 — DONE).** Today = habit + right-now: **hero → income/expense tiles → glance line → live pace bar → 14-day capture strip**, ordered for scroll-peek (pace card top lands ~y490 on a 390×700 viewport, strip peeks below).
- **Glance line** was already the digest-math port (`computeTodayGlance`, 30-day spend-day average, zero-state "Nothing logged today yet.") — unchanged.
- **Pace bar extracted into `renderLivePaceBar(blockId, totalIncome, totalExpense)`**, shared by Today (`#today-pace-block`) and Trends (`#income-bar-block`). `barMemory` is now **keyed by block id** so each instance springs from its own last state. Caller guarantees current month; the no-income caption lives inside the function. Trends' closed-month archive-card branch is untouched (Phase 5 will rework Trends' framing).
- **14-day capture strip** (`renderCaptureStrip` → `#today-capture`): trailing window ending today (rightmost), bare cells (no day numbers at 14-up), `title` tooltips, start-date/"Today" labels underneath. **Reuses the heatmap's exact `hm-l0..l4` sienna ramp classes** (cells-for-habit rule; ramp lives in one place in CSS), inheriting `chipPop` + `.settled`/reduced-motion suppression for free. Quiet `full grid in Trends` link (`.strip-link`) calls `switchView('trends')`.
- **Current-month-only rule:** glance + pace + strip render only when the viewed month is the real current month (`barMemory` for the Today block resets when hidden); a past month on Today is just hero + tiles.
- Verified with the Playwright loop (23 checks): glance matches hand-computed values for 0/1/many entries (RM 50.75 avg case), pace caption/marker/verdict match hand math, strip cell counts + ramp levels + end labels, link switches tabs, **optimistic add repaints glance/strip/pace in ~60ms with no loader**, past-month hides the live blocks, dark + 900px clean.

**Logs week index — Phase 4 of `ALFRED_RESTRUCTURE_ROADMAP_v2.md` (2026-07-18 — DONE).** The flat month timeline is gone; Logs (`#logs-ledger`, was `#logs-timeline`) is now `renderLogsLedger()` — a week accordion over **all** the user's rows, independent of the header month selector. Bars for money on this tab; no cell grids.
- **Bucketing:** weeks run Mon–Sun, keyed by the Monday's ISO date (`weekMondayIso`); a week lives under the month containing its Monday, so a cross-month week appears exactly once (e.g. `Jun 29 – Jul 5` under June). Month headers: `July 2026 · net +RM 3,940.00` (`MONTHS_FULL`, `monthTotals`). Newest month/week first.
- **Closed row:** range label, optional `this week` sienna chip, entry count, spend total (semantic red), and a 6px spend bar on a **scale shared across every rendered week** (max of week spends and the average), with a 2px sienna marker at the **trailing-8-week average** (`weeklyAverageSpend`: completed weeks only, averaged over spend-weeks, needs ≥2 spend-weeks else the marker hides — same philosophy as the glance line's daily average).
- **Accordion:** `toggleWeek()` swaps only the tapped week's body in place (other open weeks keep their DOM, no entrance replay); multiple weeks open; current week seeded open once (`logsSeeded`). Expanded rows are the classic txn idiom **plus a `.txn-date`** (`badge · Jul 12`); tap opens the untouched edit modal. `expandedWeeks` (Set of Monday keys) is module state, so **expansion survives optimistic-edit re-renders and lazy appends**.
- **Lazy windowing:** `logsMonthsShown` starts at 2 (current + previous); an IntersectionObserver on `#logs-sentinel` (160px rootMargin) appends one older month per firing — it naturally chain-fires until the sentinel leaves the margin, so short ledgers just fill the screen. No virtual-scroll library.
- `CAT_COLORS` hoisted to module scope (next to `CAT_ICONS`) so the logs renderer is self-contained; the pie uses the same object.
- Verified with the Playwright loop (27 checks): cross-month bucketing, hand-computed nets/totals/fills/marker (73.88 avg over 6 spend-weeks → 59.1% marker), accordion open/close with multiple weeks, optimistic edit updating totals + marker while expansion survives, marker hidden below 2 spend-weeks, lazy May→April appends, no drift at 390px, dark + 900px clean.

**Trends month navigation — Phase 5 of `ALFRED_RESTRUCTURE_ROADMAP_v2.md` (2026-07-18 — DONE).** Trends reads its **own `viewMonth`/`viewYear` state** — never the header month selector (which now drives Today only; Logs ignores months entirely). `renderedKey`'s viewKey is per-tab accordingly.
- **‹ month › nav chip** (`#trends-monthnav`, `renderTrendsMonthNav`/`trendsNavMonth`): steps within [earliest data month … current month] (`earliestDataMonth()`, keyed year×12+month); ends disable at the bounds.
- **Trends branch computes its own `vRows`/`vIncome`/`vExpense`/`vCatData`** from viewMonth; pie + cumulative line ("last month" = viewMonth−1) read them. The **insight engine builders and the heatmap were swapped from `activeMonth` to `viewMonth`** wholesale; `renderLivePaceBar` now uses the real current date internally (both callers only invoke it for the live month).
- **Tiles:** live month → `Forecast` tile `~RM x` (avg daily × days in month) with an `on track`/`over income` chip colored against income; closed month → `Total Spent` actuals (no forecast). Avg-daily tile unchanged (MTD ÷ elapsed days; whole month for closed months).
- **Closed months** keep the archive card in the pace-bar slot (net, top category, days logged X of N, quiet pace verdict) — now fed from viewMonth data.
- **Archive shelf** (`renderArchiveShelf`, `#month-shelf` moved to the **bottom** of the tab, "Archive" title): chip row of **past** months holding data; tapping sets viewMonth. Current month is reachable via the ›. Chip row still scrolls inside itself (overflow-x auto within the clipped container).
- **Insights:** past months type the deterministic retrospective narrative — no LLM POST, and **novelty history only records on live-month generations**; the current-month cache key semantics are unchanged (`user|viewYear|viewMonth|dataStamp|families`).
- Verified with the Playwright loop (25 checks): forecast/avg-daily match hand math (`~RM 447.78`, on-track chip), every element (tiles, archive card, pie, cumulative shape, heatmap header, insight) follows month navigation, back stops at earliest / forward restores the live view, exactly 1 insights POST across July→June→July (cache + retrospective path), shelf tap + active state, Today unaffected by Trends navigation, no overflow at 390/900, dark clean.

**Phase 2 — LLM phrasing (2026-07-12 — LIVE; backend moved to Apps Script 2026-07-15):** `renderAnalyticsInsight()` POSTs the computed plain-text facts as `{key, action:'insights', facts, month}` → `{narrative}` (gpt-4o-mini, *use-only-these-numbers* prompt — `handleInsights` in `apps-script/Code.gs`) and types the returned narrative. `styleInsightText()` escapes the model's text then re-bolds `RM x.xx` / `%` / `×` so figures still pop (styling only — the numbers are the ones we sent). Fully guarded: on timeout (10s), non-200, or any error → falls back to the deterministic `body`; `insightCache` (per user+month+`dataStamp`+families) avoids re-hitting the endpoint; an `insightToken` drops stale responses; a `.insight-thinking` dots indicator shows while phrasing. Numbers are still computed locally, so the LLM can never misstate a figure and the feature degrades to the free/offline templates. `INSIGHTS_ENDPOINT` = `APPS_SCRIPT_URL`; blank it to force Phase-1-only. (History: originally served by a `/insights` endpoint on the since-retired bot — PR #18 here + `project-alfred` PR #11 — re-pointed to Apps Script when the app went serverless.)

**Potential next tie-in:** surface the shared daily-summary block ("today so far vs average") at the top of the dashboard, reusing the digest logic.

### 3b. Independent web app — Railway-free (2026-07-15 built; 2026-07-16 Phase 0 done, push digest VERIFIED LIVE)

**Decision:** the dashboard grows into a standalone web app (capture + push, not just pull/visual), with **zero Railway dependency** — Google Apps Script is its entire backend. (At the time the Telegram bot stayed on Railway untouched, with migration deferred as "Phase D" — a day later the app's success made the bot redundant and it was decommissioned instead; see the end of this section.)

**Apps Script backend (`apps-script/Code.gs` — NEW, in-repo source of truth):**
- The existing Web App (same URL, same `key: "8891"`) gains actions: `parse`, `insights`, `push-subscribe`, `push-unsubscribe`, `run-digest-push`. All POSTed `text/plain` like the writes. ⚠️ The add/edit/delete handlers in the file were **reconstructed from documented behavior — diff against the live script before the first paste.**
- `parse` — `{user, text | image_b64[, mime][, caption]}` → `{transactions:[…], dropped, note?}`. Ports the bot's `EXTRACT_PROMPT` (array schema) + `validate_transactions()` (fix-quietly/drop-loudly; 36 Node tests pass). **Extract only — never writes**; saving goes through the normal confirmed add path. Guarded by the `ALLOWED_USERS` Script Property (protects OpenAI spend; the 8891 key is public in page source) + input size caps. A query object comes back as `note` for the capture UI.
- `insights` — port of the bot's `/insights` (same prompt, max_tokens 160, temp 0.6). `INSIGHTS_ENDPOINT` in index.html now points at Apps Script (`action:'insights'`, timeout 7s→10s for script latency). The Railway `/insights` endpoint still exists but is no longer called.
- Push digest — `PushSubs` tab (User | Token | Created, auto-created), `sendDailyDigestPush()` as the **time-driven trigger target** (daily 10–11pm; Apps Script triggers fire within the hour, not exact-minute). JS port of `build_daily_digest`/`_daily_average` produces a compact `{title, body}`; sent per token via **FCM HTTP v1** (SA JWT signed with `Utilities.computeRsaSha256Signature`, access token cached in `CacheService` 55 min; dead tokens pruned on UNREGISTERED). (Ran alongside the Telegram 10pm digest during the trial; sole digest channel since the bot's retirement.)
- Script Properties needed: `OPENAI_API_KEY`, `ALLOWED_USERS`, `FIREBASE_SA_JSON`, `FCM_PROJECT_ID`.

**Dashboard — PWA shell:** `manifest.json` (standalone, theme colors per scheme, maskable icons in `icons/`) + `firebase-messaging-sw.js` (SW at repo root: raw `push` → `showNotification`, `notificationclick` → focus/open; **deliberately no fetch handler** so GViz stays live; no Firebase SDK import in the worker). `start_url` can't carry `?user=`, so `activeUser` now falls back to `localStorage('alfred_user')` (written whenever the param is present) — the installed app keeps working; strict privacy filter unchanged.

**Dashboard — capture bar** (since the 2026-07-16 ergonomics pass it lives in a FAB-opened bottom sheet, `#capture-overlay` — see §3a; originally a static bar at the top of Home): clip button (gallery/files) + text input + camera button (straight to camera) + send; a chosen photo parks as an attachment chip so a note can be typed, then send submits both (canvas-downscale to ≤1280px JPEG q0.82 before base64). POSTs `action:'parse'`; busy spinner replaces the send arrow; 25s timeout; notes/errors in `#capture-note`. Text in the input rides along as the **photo caption** (split instructions, mirroring Telegram). Confirm flow: **1 txn → the normal txn modal pre-filled** ("Confirm entry", saves via untouched `saveTxn()`); **N txns → `#review-overlay`** (editable amounts, removable rows, "Save all" saves sequentially; on failure the already-saved rows are gone from the list so retry can't duplicate). Capture-confirmed adds carry `source: 'web'` / `'web-image'` (plain FAB adds now send `'dashboard'`; `pendingSource` resets on every plain modal open).

**Dashboard — push bell** (header, hidden until configured): `FIREBASE_CONFIG` + `FCM_VAPID_KEY` consts in index.html (public values; `null`/`""` hides the feature). Toggle lazily imports the Firebase SDK (gstatic, only when tapped), requests permission, `getToken({vapidKey, serviceWorkerRegistration})` — ⚠️ **must pass our SW registration** or the SDK tries to register `/firebase-messaging-sw.js` at the domain root, which 404s on a project-pages path — then `push-subscribe`. Token mirrored in `localStorage('alfred_push_token')` for state; toggle-off deletes token + unsubscribes.

**Phase 0 — one-time user setup — ✅ DONE 2026-07-16.** Firebase project `project-alfred-f7575`; `FIREBASE_CONFIG` + `FCM_VAPID_KEY` wired into index.html (PRs #22/#23); Code.gs merged into the live script + Script Properties set + redeployed. **Verified live:** bell subscribed on the user's Android phone, `sendDailyDigestPush` run from the script editor, notification received. For a fresh setup the steps were:
1. Firebase: free project → add Web app (config object → `FIREBASE_CONFIG`) → Cloud Messaging → Web Push certificates → key pair (public key → `FCM_VAPID_KEY`) → Project settings → Service accounts → generate key (JSON → `FIREBASE_SA_JSON` Script Property).
2. Apps Script: merge `apps-script/Code.gs` into the live script (diff first!), set the four Script Properties, **Deploy → Manage deployments → Edit → new version** (never a new deployment).
3. Add the daily trigger: `sendDailyDigestPush`, time-driven, 10pm–11pm.
4. Test: dashboard → bell on (Android Chrome) → run `sendDailyDigestPush` from the script editor (or POST `{key, action:'run-digest-push'}`) → notification arrives.

**Phase D — resolved 2026-07-16:** instead of porting the bot to Apps Script, the bot was decommissioned outright once this app's capture + push were verified live. See §2.

---

## 4. Status

### What's Done ✅

**Core app:** Full Home + Analytics tabs; GViz date fix; month selector; dark mode; animated counters; Apps Script add/edit/delete; FAB + modal (liquid glass); M3 Expressive layer; strict per-user filtering; multi-user complete (per-user `?user=` links, all writes attribute to col H).
- **UX refresh (2026-07-11) — DONE.** Home Net Balance hero card (privacy toggle + 6-mo mini trend) + income/expense tiles + txn category icon chips; Analytics spend card with month-pace "Today" marker, solid variable-radius pie w/ on-slice %s + callouts (replaced donut + Category Breakdown), unified mobile centering. Shared `tile-block` system across both tabs; dead `.metric`/`.crystal-ball` CSS removed. See §3a. Shipped via PRs #6 + #7.
- **Motion + physics pass (2026-07-11→12) — DONE & TESTED IN PROD.** From a UX review: staggered entrances, no-replay re-renders + value-inertia counters, callouts for every pie slice, dark-mode legend-dot fix; then quick-wins (prefers-reduced-motion, chip valence, refresh spin, validated category palette, visible negative months); then a physics pass (real damped-spring `linear()` easing, shared-axis tab transition, live-springing spend bar, bouncing bar-chart loader). Follow-ups: straightened pie leader lines, "Loading data…" copy, and a **mobile overflow/zoom bugfix** (`.container` `overflow-x: clip`). All detail in §3a. Shipped via PRs #11–#13.
- **Analytics insights strip — DONE & LIVE (2026-07-12).** "What I noticed" narrative card: Phase 1 deterministic engine (six pattern builders across pace/category/recurring/timing, top-3 distinct families) + novelty rotation (localStorage, decaying penalty) + typewriter reveal; Phase 2 LLM phrasing (facts computed locally, gpt-4o-mini rewords only, graceful fallback to templates — served by Apps Script since 2026-07-15). See §3a. Shipped via PRs #14, #16, #17, #18 + `project-alfred` #11.
- **Modal no longer auto-pops the keyboard on open (2026-07-12) — DONE.** Initial focus moves to the modal sheet (not the amount field) on open, per user feedback. See §3a. Shipped via PR #20.
- **Independent web app (2026-07-15) — BUILT & VERIFIED (Playwright: 23 checks, 36 logic tests), pending Phase 0 setup.** PWA shell + capture bar (chat/camera → parse → confirm) + FCM push-digest bell + Apps Script backend (`apps-script/Code.gs`); insights re-pointed off Railway. See §3b.

- **Phase 0 setup + push digest verified live (2026-07-16) — DONE.** Firebase configured, Code.gs live, bell subscribed, test notification received on Android. Shipped via PRs #22 + #23. See §3b.

- **Everything verified live (2026-07-16):** capture bar (text + photo), insights via Apps Script, push digest notification received, nightly 10–11pm trigger set. Repo decoupled from the bot the same day (README + CLAUDE.md rewritten web-app-first).
- **Telegram bot decommissioned (2026-07-16):** the app replaced it outright; bot repo archived as history, Railway + Telegram teardown on the owner's checklist. `Code.gs` is now the single extraction/validation implementation.

- **Teardown of retired services complete (2026-07-16):** Railway project deleted (billing ended), Telegram webhook/bot removed, co-users pointed at their `?user=` dashboard links. Nothing of the old stack runs anywhere.

- **One-handed ergonomics pass (2026-07-16) — DONE, refined same day.** Capture bar → FAB-opened capture sheet floating just above the nav pill, with a container-transform entrance (FAB blooms into the sheet); 40px FAB docked flush in the center of the nav pill (left-thumb reachable); WhatsApp-style clip (gallery) + camera buttons with a photo-attach-then-comment flow (note rides as the caption); refresh icon removed (pull-to-refresh covers it). Verified with the Playwright loop (66 checks across 390px light/dark + 900px, incl. end-to-end attach → note → send → confirm). See §3a.

- **Optimistic writes (2026-07-18) — DONE & VERIFIED.** Add / edit / delete / review-save now mutate `allRows` locally and re-render instantly (no full-screen loader, no blocking GViz round-trip), then POST in the background and fold in server truth via a **debounced reconcile** (`reconcileFromServer`, 1.5s after the POST). Reconcile keeps optimistic rows the GViz cache hasn't surfaced yet, honors optimistic deletes the cache still echoes, and de-dups on **UID first, content-signature second** — so it's correct whether or not the backend echoes the client UID. Failures roll the change back out of `allRows` and surface a neutral **toast** (`#toast`, inverse-surface, above the nav pill — not semantic red). Client sends a `clientUID()` with every add; `handleAdd` in `Code.gs` now honors a supplied `uid` (backward-compatible — older clients still get a server UID). ⚠️ The UID-exact reconcile path only kicks in after the Apps Script is **redeployed** (Manage deployments → Edit → new version); until then the signature fallback covers it, so no redeploy is *required*, only a precision upgrade. Verified with the render loop (72 checks, 390/900 × light/dark: instant paint, reconcile confirm/dedup/lag, edit, delete, delete-under-lag, failure rollback + toast). See §3a.

- **Restructure Phase 2 — three-tab nav + detached FAB (2026-07-18) — DONE & VERIFIED.** Tabs are now Today · Logs · Trends (Today lands first), FAB is its own 56px sienna circle above the pill, flat timeline moved to Logs. Full geometry + rename detail in §3a "Nav restructure". Roadmap file `ALFRED_RESTRUCTURE_ROADMAP_v2.md` added to the repo (supersedes the old UX roadmap; Phases 0–1 were already live before this session). Merged via PR #33.

- **Restructure Phase 3 — Today tab composition (2026-07-18) — DONE & VERIFIED.** Hero → tiles → glance line → shared live pace bar (`renderLivePaceBar`, per-block spring memory) → 14-day capture strip (heatmap's sienna ramp, `full grid in Trends` link); current-month-only rule for the live blocks; scroll-peek order verified at 390×700. Playwright: 23 checks incl. hand-computed glance values and ~60ms optimistic-add repaint. See §3a. Merged via PR #34.

- **Restructure Phase 4 — Logs week index (2026-07-18) — DONE & VERIFIED.** Flat timeline replaced by a Mon–Sun week accordion under month headers with nets; spend bars on a shared scale + sienna trailing-8-week-average marker (hidden below 2 spend-weeks); current week open on load, multiple weeks open, expansion survives optimistic edits; lazy month windowing via sentinel observer. Playwright: 27 checks incl. cross-month bucketing and hand-computed math. See §3a.

- **Restructure Phase 5 — Trends month navigation (2026-07-18) — DONE & VERIFIED.** Trends runs on its own `viewMonth` state: ‹ month › nav chip bounded by [earliest data month … now], live-month Forecast tile (`~RM x` + on-track/over-income chip) vs closed-month Total Spent actuals + archive card, insight engine + heatmap + pie + cumulative line all follow viewMonth, archive shelf of past months at the bottom of the tab. Past months keep the deterministic retrospective insight (no LLM POST); current-month cache semantics unchanged. Playwright: 25 checks incl. hand-computed forecast and a 1-POST cache assertion across navigation. See §3a.

### What's Pending ❌
- **`ALFRED_RESTRUCTURE_ROADMAP_v2.md` Phases 6–7** (one per session, in order): full capture heatmap grid polish (Phase 6 — the heatmap already exists and reads `viewMonth`; remaining is the acceptance sweep against the spec), optional FAB long-press (Phase 7)
- Correction handling in the capture bar ("actually make that RM20" → edit last entry, not new row) — fits the "natural human input" goal; needs last-UID-per-user memory
- Capture-parse validation suite (multi-day backdate, split-bill photo) — prompt-driven logic needs real-world eyeballing

---

## 5. Cost & Sustainability

**The web app runs at ~$0/month.** GitHub Pages, Apps Script, and FCM are free; the only metered cost is OpenAI (gpt-4o-mini): ~$0.0002 per text parse, ~$0.002–0.004 per photo, ~a few hundred tokens per insights phrasing (cached client-side per month+data). Realistic total **well under $0.50/mo** against the $5 budget. Guards on the spend: `ALLOWED_USERS` allow-list on `parse`, input size caps, insights cache. Apps Script free quotas (20k UrlFetch/day, 90 min trigger runtime/day) are orders of magnitude above usage. With the bot and Railway retired, there are no other running costs anywhere in the project.

---

## 6. Roadmap

**The active roadmap is `ALFRED_RESTRUCTURE_ROADMAP_v2.md`** (Today · Logs · Trends restructure; Phases 3–7 remain, one per session, in order — it supersedes the old UX roadmap where they disagree).

**Other candidate features (this repo):**
- Correction handling in the capture bar ("actually make that RM20")
- Capture-parse validation suite (Phase 4 of the old NLP pipeline, now applies to the Apps Script port)
- Per-user digest-time preference (PushSubs could grow a column)

(The old cross-repo item — Phase D, porting the bot to Apps Script — was resolved 2026-07-16 by retiring the bot instead.)

---

## 7. Key Learnings & Principles

- **Array-return schema** is the unlock: one prompt change (always return a list) handles single/multi-entry/multi-day/split with one append loop — no separate code paths.
- **Validation philosophy: fix quietly, drop loudly.** Silent coercion for anything fixable (currency noise, off-list category, bad date), visible drops only for genuinely unwritable rows. Keeps natural input frictionless without writing garbage.
- Prompt-driven logic (dates, splits) needs **real-world eyeballing** — unit tests can't cover the LLM's reasoning, only the deterministic guardrails around it.
- **Digest as pure sheet math** (no LLM) keeps it free and instant — one source of truth reusable across push (notification) + pull (future daily-summary block).
- **Extraction/validation logic now has a single implementation** (`Code.gs`) — it was briefly duplicated across this repo and the Telegram bot, which is exactly the kind of drift risk that made retiring the bot attractive once the app covered its jobs.
- Empty-User rows are legacy owner rows — the digest's user filter keeps the empty-string fallback until they're all backfilled.

**Dashboard UX (2026-07-11 vibe session):**
- **Steal patterns, not palettes.** Finance-app refs gave the *structure* (hero card w/ mini-chart, on-slice pie %s, income/expense pills); reskinning them into Alfred's existing tokens kept one coherent system instead of a purple-on-white transplant.
- **One shared component beats per-tab cards.** Migrating Home + Analytics onto `tile-block` let dead `.metric`/`.crystal-ball` CSS be deleted outright — consistency + less code in one move.
- **A metric is more useful paired with its baseline.** The spend bar only became meaningful once the "Today" month-pace marker gave it something to be read *against* (spent-vs-time), not just a raw %.
- **Variable-radius pie needs restraint.** Scaling slice radius by share (`0.92 + 0.08×share`) hints hierarchy; the first pass (`0.72 + 0.28`) made one dominant category visibly lopside the circle.
- **Chart.js custom canvas draws (on-slice labels, callouts, variable radius, center text) must be gated by `canvas.id`** — an ungated plugin bleeds onto every chart on the page.
- **Always eyeball mobile widths, not just desktop.** The "right-drift" was tiles going full-width while charts stayed `max-width`-capped between 480–768px — invisible on desktop, obvious on a phone. Screenshotted at 390 / 600 / 900 to confirm.
- **Render-to-verify loop:** local `python3 -m http.server` + Playwright (mock the GViz response, serve Chart.js locally since the CDN is proxy-blocked) → screenshot at multiple widths & both themes before committing.
- **A horizontal transform + `position:fixed; right:0` = a mobile zoom trap.** The shared-axis slide's `translateX` briefly widened the document; the fixed nav/modal bars then sized to that widened layout viewport and *held* the overflow open, so the browser kept zooming to fit — creeping worse each toggle. Physics/slide animations that move things along X need an ancestor with `overflow-x: clip` (not `hidden`, which would kill vertical scroll). Caught by measuring `documentElement.scrollWidth` across repeated toggles in Playwright, not by eye.
- **Compute the numbers, let the LLM only phrase them.** The insights strip (§3a) computes every figure in JS and would hand *those facts* to an LLM purely for wording — so the model can never misstate an amount. It also means Phase 1 (deterministic templates) is a complete, free, offline-capable feature on its own, and the LLM is a phrasing upgrade, not a dependency. Ship the deterministic half first.
- **A static site can't hold a secret.** The dashboard is public GitHub Pages, so any call that needs the OpenAI key must go through a server that holds it (Apps Script Script Properties) — never inline in `index.html`. Public-by-design values (Firebase config, VAPID key, the 8891 write key) are fine in page source; the allow-list is what guards the metered spend.
- **Apps Script can be the whole backend — with two crypto-shaped edges.** It holds secrets (Script Properties), calls OpenAI (UrlFetchApp), reads the Sheet natively, and schedules (time triggers) — all free. But it can't do raw Web Push (no ES256/ECDH), so push goes through FCM, whose RS256 service-account JWT it CAN sign (`computeRsaSha256Signature`). And FCM's page SDK must be handed our SW registration explicitly on a project-pages path.
- **A manifest can't carry per-user state.** `start_url` is static, so anything identity-like (`?user=`) needs a client-side fallback (localStorage) for the installed-app launch path.
- **Cross-origin from GitHub Pages to any backend: two things or it silently fails.** (1) The response needs `Access-Control-Allow-Origin` or the browser blocks *reading* it even on a 200 (Apps Script web apps send it automatically); (2) send the request as `text/plain` so it stays a "simple" request and skips the CORS preflight. And make optional calls **non-blocking** — computed-fact fallback + timeout + a "thinking" state — so a slow backend degrades to the free templates instead of leaving the UI blank. An upgrade must never become a hard dependency.
