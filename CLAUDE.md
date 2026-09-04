# CLAUDE.md

*Last updated: 2026-08-31 — **This file was condensed** (~19.5k → ~8k words). Nothing was
decided or undecided by the trim: every ⚠️ trap, binding decision, constant and identifier is
still here, in fewer words. What was cut is narrative — the "why we chose this over that" for
past passes, which lives in the `alfred-history` skill. **Style rule going forward: state the
rule and the consequence, not the story.** A trap gets one sentence saying what breaks; a
decision gets one line. If an entry needs three paragraphs of reasoning, the reasoning belongs
in the history skill and the rule belongs here.*

*Shipped 2026-09-04: **the marker loader and a new app icon** (§3.15, §3.11). The four CSS
bouncing bars and the sienna "A" tile are gone; both are now one drawn mark — three bars on a
baseline, tallest one sienna. **Every mark is a filled tapered path and nothing in it is
stroked**, which is the entire style: a constant-width stroke is what makes a hand-drawn mark
read as clip art, and the browser suite fails if a `stroke` appears on the mark OR on its root.
Two things that differ between the two homes: the **loader has no ground shadow** (ink-coloured,
so it inverts into a pale puddle on dark) and the **maskable icon is a separate file** at 76%
scale (one file cannot serve both purposes — the full-bleed art clips under Android's circular
mask). `--loader-ink` is a new light/dark pair, deliberately not `--on-surface`. The serif did
NOT come along: Newsreader is still the masthead's alone. **Same day, further passes:** the app icon is now the **piggy bank taking a
coin** — `$` on the coin, a spring tail, and a pink wash inside the body (one `userSpaceOnUse`
gradient across body and snout, or the overlap seams) — not the bars — the tile's job is to say *money* to someone who has never opened the app,
and the loader keeps the bars (§3.15 has the table; do not unify them back). The capture
sheet's parse wait prints a **receipt** from the same nib (§3.8) — a different subject on
purpose, since it names what is being waited on. It **replaces** the send-arrow spinner;
reduced motion stills the receipt and brings the spinner back, so there is always exactly one
busy indicator and never two. **Corrected on device evidence:** the icon is **one circle-safe file per size**, `purpose:
"any maskable"` — a launcher masks a `purpose: "any"` icon too, so the earlier full-bleed/maskable
split shipped a clipped home-screen icon with a correctly-sized file sitting unused beside it.
The scale comes from the furthest **ink pixel** (192.1), never the bbox corner (226.7).
**Also 2026-09-04:** the loader's bars now **lift (`translateY`) instead of squashing
(`scaleY`)**, a quarter-cycle apart rather than 120ms — a shared scale factor over four different
bar heights flattened the ascending silhouette mid-cycle, and the clustered phases made the four
move as one lump (§3.15). The pig now appears **in-app**, in the Today masthead's right slot (§3.4,
§3.15) — `d: 1`, no ground shadow, no pink wash, two themed inks. It is decoration and is
labelled as such: not a button, `aria-hidden`, no tab stop.
Previous banner (median daily,
calibrated forecast and the distribution curve, §3.5a) is in the history skill. **One banner: the
current change only**; superseded ones move to the history skill, not into a queue. Two facts
that live nowhere else: earlier roadmap files were folded into §6 (2026-07-19), and `index.html`
comments still reference roadmap phase names — §6 and the history skill keep those resolvable.*

---

## 0. Overview & product model

**Project Alfred** — a personal budget-tracker PWA on GitHub Pages. Captures expenses from
natural language or receipt photos, tracks them against the month's budget, visualises spend.
The shared Google Sheet's own Apps Script is the entire backend. Fully serverless, ~$0/month (§5).

**Two pillars:** capture must be effortless (seconds, confirm-before-save); analytics are
pull-based and visual. A nightly push digest was the third pillar until Phase F (2026-07-19)
retired it on real-usage evidence; its *math* outlived it as the Today glance line until
2026-08-31, when that line was removed too. **Nothing of the digest remains** —
`computeTodayGlance`/`todayGlanceHtml` are deleted.

**Budget reframe is a rename only.** Surfaces say *budget*; the data model is untouched — rows
keep `Type: Income`, and **a month's budget = that month's logged income**. No stored budget
number. **No month carry-over, ever** — each month is a sealed page (an invariant, already true
in code). Multiple *named* budgets are a future direction (§6 "Trips").

**The Telegram bot is decommissioned (2026-07-16).** Its repo (`timothycjin-cyber/project-alfred`)
is a historical record; nothing of that stack runs. Rows it wrote (Source `telegram`/`telegram-image`)
remain valid data. `apps-script/Code.gs` is the **single** extraction/validation implementation.

---

## 1. Shared Data Layer — Google Sheet

- **Sheet:** Project_Alfred · **Tab:** Sheet1 · **ID:** `19_C3gFlY7hDjGm87k3Uke63_Tgg6TQPl6xLiGZvuEis`

| Idx | Column | Notes |
|---|---|---|
| 0 | Date | GViz returns `Date(YYYY,M,D)` with **month 0-indexed**; `gvizDateToIso()` (extracted from `mapGvizRows`, shared by both tabs) adds +1. ⚠️ Reading the ISO back with `new Date(iso)` parses **UTC** midnight while every getter is **local** — use **`parseRowDate()`**, never `new Date(row.Date)` (§3.12). |
| 1 | Amount (MYR) | Numeric |
| 2 | Category | String |
| 3 | Description | String |
| 4 | Source | `web`/`web-image` (capture), `dashboard` (plain FAB add), `recurring` (§3.13), `telegram`/`telegram-image` (historical) |
| 5 | Type | Expense or Income |
| 6 | UID | Opaque short id. Apps Script uses `Date.now().toString(36)`+random; bot rows are 12-char hex. **Never assume a format.** |
| 7 | User | User id (integer as string; historically the Telegram chat_id). Written on every add/edit. |

**Income Categories:** Salary, Freelance, Bonus, Investment, Side Income, Reimbursement, Other Income
**Expense Categories:** Food & Dining, Transport, Bills & Utilities, Shopping & Groceries, Subscriptions, Entertainment, Other

**`Recurring` tab** — series *definitions* only, never ledger rows (§3.13). Columns: `SeriesID`
· `User` · `Type` · `Amount` · `Category` · `Description` · `Cadence` · `StartDate` · `EndDate`
(reserved, no UI) · `Active` · `Created`. Created automatically by `getRecurringSheet()` on
first save. Read client-side via a second GViz query (`&sheet=Recurring`), which 404s until the
tab exists — `fetchRecurringSeries()` treats that as "no series", never an error.

**`PushSubs` tab** is retired (Phase F); nothing references it. Owner may delete it.

Empty-User rows are legacy owner rows. The strict filter renders only exact matches — keep
backfilling col H.

---

## 2. Backend — Google Apps Script (`apps-script/Code.gs`)

In-repo `apps-script/Code.gs` is the source of truth.

- **Web App URL:** `https://script.google.com/macros/s/AKfycbzxRLfHCAbCspXIWSRt1xVAbLnNPlhiHHaWpTHGB23N1wkoMU74nHifMT9prU3rM4m6/exec`
- **Deployment:** Execute as Me, Access Anyone.
- **Auth:** shared secret `key: "8891"` in every POST body (public in page source — fine; the allow-list guards metered spend).
- **All requests POST as `text/plain`** to stay CORS-simple (no preflight).
- ⚠️ **To update: Deploy → Manage deployments → Edit → new version. NEVER create a new deployment** (different URL). Don't redeploy unless code changed.

**Actions (`doPost`):**
- `add`/`edit`/`delete` — row writes; both write User col H. `handleAdd` honors a client `uid`, and **refuses a `uid` it already holds** (`{success:true, uid, duplicate:true}`, no append) — the sheet arbitrates recurring idempotency, since the client can't see a row the GViz cache hasn't surfaced. Helpers: `findRowByUID()`, `generateUID()`, `backfillUIDs()`.
- `recurring` — series definitions only. Three ops via `data.op` (`add`/`edit`/`delete`). Helpers: `getRecurringSheet()`, `findRecurringRowById()`. Occurrences are written by the *client* via the ordinary `add`, so there is exactly one row-writing path.
- `parse` — `{user, text | image_b64[, mime][, caption]}` → `{transactions:[…], dropped, note?}`. `EXTRACT_PROMPT` (array-return schema) + `validate_transactions()`. **Extract only — never writes.** Guarded by `ALLOWED_USERS` + input size caps.
- `insights` — LLM phrasing of client-computed facts (`max_completion_tokens` 160).

**Model: `gpt-5.6-luna`** (upgraded from `gpt-4o-mini`, 2026-08-31), on the same
`/v1/chat/completions` endpoint. It is a **reasoning** model, so three request-shape rules bind
`callOpenAI()`:
- ⚠️ **`max_tokens` is rejected — the parameter is `max_completion_tokens`.** A 400, not a
  degraded answer.
- ⚠️ **No `temperature`** (nor `top_p`/penalties): the gpt-5.x schema dropped the sampling knobs,
  and sending one is a 400. Extraction's old 0.1 is carried by the prompt's hard schema plus
  `validateTransactions()`; the insights call's 0.6 is simply gone.
- ⚠️ **`reasoning_effort: 'none'`, pinned.** The default is `medium`, and reasoning tokens are
  billed against the output budget — at any other effort the 160-token insights call spends its
  whole allowance thinking and **returns empty content**, which the client reads as a failure and
  falls back to the deterministic narrative. Raising effort means raising every
  `max_completion_tokens` with it, and paying capture-flow latency against the 25s client timeout.
- Vision (`image_url` parts) is unchanged, so the receipt-photo path needs no edit.

**Script Properties:** `OPENAI_API_KEY`, `ALLOWED_USERS`. (`FIREBASE_SA_JSON` / `FCM_PROJECT_ID`
are dead after Phase F.)

---

## 3. Dashboard (`index.html`) — current state

**Live:** https://timothycjin-cyber.github.io/Alfred/ — constants are in the inline `<script>`. **⚠️ This URL tracks the repo name.** Renaming the GitHub repo changes the GitHub Pages path (`github.io/<repo-name>/`), and Pages does **not** redirect the old path (unlike `github.com/<owner>/<repo>`, which does) — every previously bookmarked/shared `?user=` link and home-screen PWA install 404s the moment the repo is renamed. Repo was renamed `alfred-dashboard` → `Alfred` 2026-08-29; re-share links and reinstall the PWA from the new URL.

### 3.1 User filtering (strict, deliberate)

- `activeUser` from `?user=`, falling back to `localStorage('alfred_user')` (written whenever the param is present) — `start_url` can't carry per-user state.
- **Strict filter:** a row renders only if `activeUser` is non-empty AND matches exactly. No `?user=` → zero rows (intentional privacy). Always test with `?user=YOUR_CHAT_ID`.
- **No household / "view all" toggle — never add one.**

### 3.2 Design system & motion

M3 Expressive · Roboto Flex · ink monochrome tokens · burnt-sienna accent (`--sienna: #C2542D`).
FAB/modals/nav pill share a liquid-glass aesthetic. Theme-aware via `prefers-color-scheme`.
**Ledger voice: no emoji, no exclamation marks, quiet verdicts.**

**Visual grammar:** *length* = money (horizontal bar, or a vertical column's **height** where
the x-axis is time, as in the Logs day chart). The Trends calendar grid is the only cell grid,
tinted on the **sienna ramp** = spend-per-day; sienna reads as *heat*, so **semantic red stays
reserved for expense/overspend figures and deltas** — a whole grid never goes red/green. The
donut ring is a **shape** carrying no text; the list beneath labels it, with per-row bars in the
**category palette**, never semantic red. A zero-spend day is `--outline-variant` gray, not a
short red bar — a rail isn't an expense.

**Type.** Roboto Flex is variable, so `font-variation-settings` on `body` **overrides
`font-weight` on every descendant**. `body` sets **`'wdth' 100` only** — ⚠️ **never pin `'wght'`
there**: it silently flattens the whole ramp while stylesheets still say 700/800/900, and
`getComputedStyle().fontWeight` still reports the declared value, so nothing in the DOM reveals
it. Only `.hero-amount` and `.archive-net` set the axis, deliberately and locally. Ramp is
**500–800** (650/750 for half-steps); for anything new, go one step below what a flattened
rendering would tempt you into.

**`--font-display` (Newsreader)** is the only non-Roboto face and sets exactly one thing: the
masthead month (§3.4). **Don't spread it.** ⚠️ Verifying it needs *rendered pixels*, not advance
width — "August" at 31px is 93.6px in Newsreader vs 93.0px in Roboto Flex, so a width probe
passes with the serif never loading.

**Colour:**
- **Light and dark semantic tokens are separate values.** Light `--semantic-income`/`--semantic-expense` = **#007A52 / #C62828**; dark = **#2ECC71 / #FF4D4D**. One pair tuned on dark cleared only 2.9:1 / 4.1:1 on white. **`--loader-ink` is a third such pair** (#12100E / #F2EDE7): warm-black on paper, warm-white on near-black. It is deliberately not `--on-surface` — that token is a cool grey tuned for text, and a marker stroke in cool grey reads as a widget instead of a drawn line.
- **Good news is stated, not coloured.** `.tile-chip.good`, `.today-good` and the on-track pace strip are **neutral ink**. Only bad states (`.tile-chip.bad`, `.income-bar-status.over`) keep semantic colour and solid fill.
- **Sienna is the only primary** (FAB, `.btn-primary`, `.capture-send`); `--primary` (near-black/near-white ink) is **not** a button fill, so two things never both claim primary. Red is **not a selection state** — `.type-toggle` active segment is `--on-surface`.

**Icons** are inline SVG inheriting `currentColor`, never emoji — an emoji glyph is coloured by
the OS font, so a `CAT_COLORS`-tinted chip carried a clashing glyph. Both call sites
(`categoryBreakdownHtml`, `txnRowHtml`) pass **`color:` as well as the background tint**.
⚠️ `CAT_ICONS` holds an **`"Income"`** key — income rows look it up by name rather than falling
through to `"Other"`. The only emoji reaching the DOM is the ⚠️ in the failed-load state.
⚠️ **The loader mark is the one inline SVG that does NOT inherit `currentColor`** — it names
`var(--loader-ink)` and `var(--sienna)` directly, because it is two-colour by design and
`currentColor` would flatten the sienna bar into the ink (§3.15).

**Motion tokens:** `--motion-wobble` (overshoot spring), `--motion-snap` (taps),
`--motion-wobble-nav` (nav only, ≈20% shorter). Under `@supports (transition-timing-function:
linear(...))` these become sampled damped-spring curves (wobble 320/ζ0.62 ~632ms; snap 700/0.85
~370ms; nav ~505ms), with cubic-bezier fallbacks.

- **Entrances:** hero first, tiles staggered by `nth-child`, txn rows via a per-row `--d`; all use `backwards` fill.
- **No-replay:** `renderedKey` (`year-month-dataStamp`) makes `calculateAndRender()` a no-op on revisit; `dataStamp` bumps per fetch. Genuine re-renders get `.no-entrance`; revisited tabs get `.settled` (pins child animations — `display:none → block` would restart them).
- **Value inertia:** `counterMemory` (keyed by `data-key` on `.counter-val`) animates from the previous value, not zero.
- **Mount-then-spring:** elements born at final state never animate — mount at the previous state, apply the real value one frame later.
- **Shared-axis tab slide:** `.axis-in-left/right` in `switchView()`. ⚠️ **`.container` must keep `overflow-x: clip`** — the transient `translateX` widens the document, then `position:fixed; right:0` bars size to the widened viewport and *sustain* it, which mobile zooms to fit. `clip`, not `hidden` (that kills vertical scroll/sticky).
- **`prefers-reduced-motion`:** zeroes motion tokens + stagger; the JS `REDUCED_MOTION` flag makes counters instant, sets `Chart.defaults.animation = false`, skips the typewriter, disables smooth scroll.
- **Loader:** the marker mark — **four** drawn bars on a baseline, tallest one sienna, bouncing in sequence on the same 1s / 120ms rhythm as the CSS bars it replaced (§3.15). Reduced motion pulses the whole mark and clears `.lb`'s animation, which is what drops its `scaleY` so the bars sit at full height.

### 3.3 Navigation — Today · Logs · Trends + detached FAB

Three text tabs in a 280×**56**px glass pill (4px padding, 4px gaps). Today is the landing tab.
`VIEW_ORDER = ['today','logs','trends']`; panes `#today-view`/`#logs-view`/`#trends-view`.

- **Slider math:** width `calc((100% - 16px) / 3)`; slot n = `translateX(calc(n·100% + n·4px))`, set in `switchView()`. It is `top:4px; bottom:4px` (vertically elastic).
- **FAB:** 56px sienna circle, 12px above the pill; `.bottom-bar` is a column stack anchored `bottom: calc(24px + env(safe-area-inset-bottom))`. **Tap opens the capture sheet — that is its whole behaviour** (§3.8), via inline `onclick`. ⚠️ **No gesture handling at all**, and **do not add a press-and-hold without a way to verify it on hardware** — the long-press→camera accelerator was removed 2026-08-13 after three passes never made it reliable on a device (§6, §8).
- **`repaintNavCluster()` (2026-08-13)** works around a **Chromium/Android compositing bug**: returning from a camera intent, `.floating-nav`'s `backdrop-filter` holds a **stale snapshot**, and nothing invalidates it because **a cancelled camera fires no event**. `.floating-nav.repainting` drops the filter, a forced style flush applies it, two rAFs restore it. Wired to `visibilitychange` (visible only) and `pageshow`. ⚠️ **Deliberately not `will-change`** — permanently promoting the layer may entrench the stale snapshot. ⚠️ **Not reproducible locally**; the real symptom needs a device.
- ⚠️ **Derived numbers — re-derive ALL if the cluster moves (the pill's height is part of the cluster):** FAB center = **120px** + safe-area (24 bar + 56 pill + 12 gap + 28 half-FAB). Capture overlay `padding-bottom: calc(158px + inset)`; bloom `transform-origin: 50% calc(100% + 38px)` (158−120). `body` `padding-bottom: calc(172px + inset)`; toast `bottom: calc(160px + inset)`.
- **Touch targets:** `.icon-btn` and `.capture-send` are **44px** square (they share the `.capture-card` row — resize together or alignment breaks); `.btn` `min-height:48px`; `.type-toggle button` 44px; `.logs-tail` 14px padding (13px rendered 43px). ⚠️ **Day columns are the documented exception** — a seventh of the track, never grown, so ~42px *wide* at 390px; they meet the ≥44px-**tall**, whole-cell-hit-area rule instead (§3.6). ⚠️ **Measure targets with the sheet OPEN** — a closed overlay is `scale(0.08)` and reports 44px as 3.5px.
- **There is no header** (deleted 2026-08-11). `.header*`, `#header-monthnav`, `renderHeaderMonthNav()` and `.monthnav*` are gone. ⚠️ **It was silently doing two other jobs:** the **status-bar inset** in standalone PWA mode (now on `.container`, with `body.has-masthead` dropping it to 12px so it's never applied twice), and the **sticky offset** `logsScrollToYm()` subtracted — that one is gone entirely (`stickyTopOffset()` deleted), since nothing at the top is sticky; jumps park at `LOGS_PARK` (§3.6).
- ⚠️ **`env(safe-area-inset-*)` is inert app-wide, and always has been.** The viewport meta has **no `viewport-fit=cover`**, so the UA insets the layout viewport itself and every `env()` resolves to **`0px`** — everywhere, including all the derived geometry above. Nothing is broken (the UA does the insetting), and the expressions are kept because they become correct the day the meta changes — but **"does it clear the status bar?" passes vacuously today**, and adding `viewport-fit=cover` shifts every derived number at once.

### 3.4 Month state — the masthead and the lift-off pill

**One contextual selector**, two representations: a **masthead** at the top of the pane, and a
**pill** that flies into the top-right corner as you scroll.

> **Governing principle: the masthead names the period, it never measures it.** No figure goes
> up there, on either representation. This settles every future request to put "budget left" in
> the corner — out of scope by definition, not by argument.

- `activeMonth`/`activeYear` are **pinned to the real current month at load** and never change. `viewMonth`/`viewYear` are shared by Trends and Logs and **never persisted** — every launch opens on now.
- **Per tab:** Today reads the **date** (`Monday` + `11 August` in `.sm`; pill `11 Aug`) and is **inert** — no caret, `tabindex="-1"`, `aria-haspopup="false"`, and `openMonthPicker()` refuses it. Today's period is a **day**, so the unit itself distinguishes readout from control. Trends and Logs read `MONTHS_FULL[viewMonth]` + year (pill `Aug 2026`) and open the picker.
- **Visibility, all three tabs:** show once `earliestDataMonth() !== null`. `body.has-masthead` must stay in step (it's what stops the double status-bar inset).

**The right slot** holds two mutually exclusive things: `#masthead-actions`, the **Logs** actions
(recurring glyph + export icon, moved out of the deleted `.logs-toolbar`, §3.6), and
`#masthead-brand`, the **Today** brand mark (§3.15). Trends leaves it empty. They are never both
up, so `space-between` still pins whichever one is visible to the right edge.

- **Logs-only via `hidden`:** `renderMasthead()` sets `mhActions.hidden = currentView !== 'logs'`. ⚠️ `.masthead-actions[hidden] { display: none }` is **load-bearing** — the base `display: flex` beats the UA sheet's `[hidden]` (same trap as `.pill[hidden]`). `hidden`, not opacity/visibility, because it also controls tab order.
- ⚠️ **`align-self: center`**, against the container's `align-items: baseline`. An icon button has no baseline, so baseline alignment drops it below the serif and **changes the masthead's height**, moving the title and re-deriving `--pill-travel`.
- **The brand mark is Today-only**, toggled the same way (`mhBrand.hidden = !isToday`), and `.masthead-brand[hidden] { display: none }` is load-bearing for the same reason.
- ⚠️ **No figures, still — but "tools only" no longer describes this slot.** The governing principle is about *measuring the period*, and a pig states nothing about it, so it is intact. But the mark is decoration, and it is the first decorative element in the app; it is here because it was asked for, not because the slot wanted filling. **A figure is still barred.**
- ⚠️ **38px and `align-self: center`**, under `.month-btn`'s 44px floor — so the month button still sets the masthead's height, and the height and `--pill-travel` are byte-identical on all three tabs. Asserted, with a negative control at 60px (§3.12).
- ⚠️ **The optical nudge is `transform: translateY(-5px)`, never a margin.** Centring on the flex row leaves the mark ~5px below the day text's optical centre, because the row is taller than the text. A margin would correct that by changing layout, and layout is precisely what must not move here; a transform is painted rather than laid out, so the height invariant holds by construction instead of by luck. −5px lands the pig's feet on the serif's baseline; −7px rides high.

**The lift-off.** `--p` is a registered `@property` number, 0 at the top of a pane → 1 at
hand-off, driven by a **scroll-driven animation on `body`** (`animation-range: 0 86px`), with a
`CSS.supports`-gated rAF fallback that attaches only where `animation-timeline` is unsupported.

- ⚠️ **NOT off the main thread.** Only transform/opacity/filter/backdrop-filter get the compositor; animating a *custom property* recalcs style every frame and re-resolves every `var(--p)` consumer. The win is "no JS", not "no work" — **keep the consumer list to the two elements it has**.
- ⚠️ **Never animate `font-size`, `height`, `top` or `left` on this timeline** — they reflow, and a reflow per frame stutters. The masthead **fades**; it does not shrink.
- ⚠️ **`animation` before `animation-timeline`** — the shorthand resets the timeline to `auto`, silently unhooking it and pinning `--p` at 1.
- `#masthead` is **`position: static`**, lives **outside `.container`**, and nothing up here is ever `position: fixed` (§3.2's overflow trap).

**The pill** (`#month-pill` in `#month-rail`):

- The **rail is a zero-height `position: sticky` strip** with `pointer-events: none` — the pill stays put with nothing fixed, at no layout cost, without the invisible band becoming a dead zone.
- **Travel, not cross-fade:** `--pill-travel` is measured at runtime by `syncPillTravel()`, walking **both `offsetParent` chains** (`absLeft()`) and subtracting `offsetWidth * 0.14` for the `scale(0.86)` about `transform-origin: 100% 50%`. ⚠️ **`offsetLeft`, never `getBoundingClientRect()`** — both elements are mid-transform every frame, so a rect measures the animation and feeds it back. Re-measured from `renderMasthead()`, on `resize`, and on **`document.fonts.ready`**.
- **38px tall, under the 44px floor** — acceptable *only* because the pill is never the sole route to anything. **Do not make the pill the only tappable representation.**
- ⚠️ **`pointer-events` is gated by discrete keyframes (`mh-pill-hit`, flipping at 40%) over a resting `none` in `.pill`.** The gate **must** live on the pill (the element receiving events), not in `body`'s animation list. ⚠️ **The resting value is the load-bearing half:** an animation beats a normal declaration, so keyframes win while the timeline *runs* — but a scroll timeline on a document too short to scroll is **inactive**, and an inactive timeline's keyframes don't apply at all. With `auto` at rest, a two-entry month parked a transparent 114px button across the corner eating every tap. **Never put that base value back to `auto`** (§8). `#masthead` carries the mirror (`mh-fade-out` at 74%, where `calc(1 - --p * 1.35)` hits zero) because a faded `static` element is still hit-testable.
- **`tabindex="-1"` permanently** — a pointer-only duplicate; without it Tab lands on a transparent button.
- **Reduced motion** drops `transform` on both, keeping opacity linked to `--p`.

**Gestures** (`wirePillGestures()`, `#month-pill` only, skipped when `.inert`): **swipe left =
next month, right = previous, long-press (500ms) = back to now.**

- ⚠️ **Button and swipe target on one element.** `DRAG_SLOP` (6px) separates them, and ⚠️ **the click after a committed swipe is EATEN in the click handler, never out-raced** — `click` is its own task and a `setTimeout(…, 0)` can lose to it. Same reason the picker opens **from that handler, not an inline `onclick`**.
- ⚠️ **`DRAG_CAP` is 12px and must stay below the pill's 16px right gutter** — the rail is outside `.container`'s `overflow-x: clip`, so a wider deflection widens the document (the mobile zoom trap). An idle `scrollWidth` check cannot catch this.
- **No separate bounce animation** — letting `.settling` settle back *is* the bounce, which also keeps the `animation` shorthand free for the `pointer-events` gate. ⚠️ **The `--drag` transition is scoped to `.settling`, never the base rule**, or every `pointermove` is smoothed and the pill lags the finger.

**`stepViewMonth(delta)`** — the swipe's only caller; returns whether the month moved.
⚠️ **It steps through `pickerMonths()` — months holding data plus the current one — not the
calendar.** With data in June and August but none in July, a swipe back from August lands on
**June**. The picker and the swipe are the only two doors and must agree (§8).

**`applyViewMonth(y, m)` is THE month-change handler** — picker, swipe and long-press all route
through it. **Fork:** on Trends → `calculateAndRender()`; on Logs → `logsScrollToMonth()`, no
filtering, no re-render.

**Month picker** (`#month-overlay`, `openMonthPicker(trigger)`): the **ledger-list form** (each
row carries the month's spend and a proportional bar), reusing
`.modal-overlay.align-bottom.sheet-rise`. ⚠️ `.sheet-rise` is required — `.align-bottom`'s
`transform-origin` is FAB-anchored and this sheet opens from the *top*. `_pickerTrigger` records
which trigger opened it so `aria-expanded` lands there. **`pickerMonths()`** (memoised on
`dataStamp`) returns months **holding data plus the current month**, newest first, grouped by
year; future-dated rows excluded. ⚠️ The name is `pickerMonths()` — `monthTotals()` is taken.

**Per-tab scroll memory** in `switchView()` (`scrollMemory`). ⚠️ **Restore after
`calculateAndRender()`** — before it the pane is empty and the browser clamps to a short document.

### 3.5 Today tab

Order: **hero → two tiles → detail panel → budget-pace card.** **There is no glance line** —
`computeTodayGlance`, `todayGlanceHtml`, `#today-glance` and `.today-*` are deleted (§0).

- **Hero** (`.hero-card`, `#today-hero`): label **`Budget left`** (income − expense). **1.5px `--outline` border** (light) / `rgba(255,255,255,.22)` (dark) — deliberately heavier than every other card, so the hero reads as the focal point. Embedded 6-month net-trend mini bar chart (`heroChart`; current month sienna, others green/red by sign; `minBarLength: 4` + `heroBaselinePlugin`, gated on `canvas.id === 'hero-trend'`). Sub-copy "In the green" / "Watching the leak". **The running month is drawn as provisional:** a `heroLiveMonth` flag washes the last bar to `hexToRgba('#C2542D', 0.38)` and appends `.hero-chart-note` ("August is 10 days in") — otherwise nine days read against thirty-one-day bars on one axis. Build the note from the flag, not unconditionally. ⚠️ **There is no privacy blur toggle** — `toggleHeroPrivacy()`/`.value-hidden` do not exist; the only trace is `.hero-top` still being `space-between` with one child.
- **Tiles** (`#today-tiles`, 2-col grid): **`Income`** / **`Expenses`** on `--wash-income`/`--wash-expense`, with `▲/▼ X% vs last month` chips. ⚠️ **The income tile says `Income`, not `Budget`** — the hero 200px above says `Budget left`, and one word for two quantities was the collision. Element ids, the stored `'Income'` value and `INCOME_CATEGORIES` are unchanged. `.good` chips neutral, `.bad` red (§3.2).
- **Detail panel** (`#today-detail`, `todayDetailHtml()`): **`Median Daily`** (or `Average Daily`, see below) + **`Forecast`**, **always open** — the two figures are the point of the tile row, not a disclosure behind it. **No `#today-detail-trigger`, no `toggleTodayDetail()`, no `todayDetailOpen`, no `.tile-chev`** (removed 2026-08-31); the Expenses tile is a plain `.tile-block` again. It's the last child of the `.tile-row` grid spanning `1 / -1`; `#today-detail:empty { display: none }` still collapses it when `todayDetailHtml()` returns nothing. `data-key`s `today-avg`/`today-fc` (reused to preserve `counterMemory`, distinct from Trends `an-avg`/`an-fc`). `forecast > totalIncome` → both go `.overspend` red. **Nothing logged this month → an em dash in both slots**, deliberately not `.counter-val` — `RM 0.00` reads as a measurement of zero rather than the absence of one.
- **`todayForecast()` is THE forecast, and the only one the app computes** (§3.5a). The detail panel and the pace bar both read it, so they can never disagree. Memoised on `dataStamp` (like `pickerMonths()`) because it rescans four months and the panel is rebuilt from a click handler, not only from a render. **No `vs last mo.` chips** — a percentage against a projection is noise. Built inside `calculateAndRender()`, so the single `animateCounters()` sweep at its end covers it — the panel no longer needs its own.
### 3.5a Median Daily and Forecast — the canonical definition

Source: `docs/SPEC_MEDIAN_FORECAST_20260831.md`, decisions **D1–D9, locked**. Math lives in
`lib/alfred-core.js` (pure, TZ-proved in all four zones); `index.html` only adapts rows into it.

```
elapsed[]      per-day expense totals, day 1 → TODAY  (dailyTotals, upToDay)
history[]      the same for the trailing 3 complete months, POOLED

spendDays      = elapsed.filter(v > 0)            D2 — zeros excluded; the metric
spendDayRate   = spendDays.length / elapsed.length     means "a typical SPENDING day"
P90            = 90th pct of spendDays, LINEAR interpolation   D4
medianDaily    = median(spendDays.filter(v <= P90))            D3
bufferPerMonth = sum(history days > historyP90) / 3            D5

mean mode  ⇐  dayOfMonth < 8  OR  spendDays.length < 3         D7
             daily = mean(elapsed), rate = 1, label "Average Daily"
median mode  daily = medianDaily, rate = spendDayRate || 1, label "Median Daily"

forecast = spentSoFar + daily × remainingDays × rate + bufferPerMonth × (remainingDays / daysInMonth)
```

⚠️ **D3 is not optional.** Without the P90 cut the big days sit inside the median *and* inside
the buffer, and the forecast counts them twice.
⚠️ **D8 is not optional.** D2 makes the median a per-*spending*-day figure; multiplying it by
calendar days overcounts by exactly the zero days.
⚠️ **Only the unelapsed fraction of the buffer is added** — big days already logged this month
are inside `spentSoFar`.
⚠️ **Percentiles interpolate, never nearest-rank** — on a 10–20 value sample nearest-rank makes
P90 jump day to day, which moves the median and therefore the forecast for no visible reason.
- **Under 3 months of history the buffer is omitted entirely** — 0, no error, no warning banner.
  A month is "history" only if it holds rows, so a gap month means too little history.
- **The overspend strip fires LESS often than it used to. That is the correction, not a
  regression** — do not retune the threshold to restore the old rate.

- **Budget-pace card** (`#today-pace-block`, `renderLivePaceBar(totalIncome, totalExpense)`): caption `Day X of N` (or `No budget set this month`); a **Spent** row and a **Month** row, each `label | track | value%` (`.income-bar-row`, a `60px 1fr 52px` grid). Spent fills **sienna**, flipping to **red** once it crosses the Month line (`.income-bar-fill.spent.over`); Month is always `--outline` gray. A shared **dotted 2px "Today" line** (`.income-bar-marker`) crosses both bars at month-elapsed, with a bubble legend above (`.income-bar-wrap` reserves space via `padding-top: 36px`). Marker and bubble are positioned against the whole wrap but must align to the *track column* — `paceMarkerLeft(pct)` = `calc(72px + (100% - 136px) * pct)`. Closes on a **status strip** (`.income-bar-status`) flush with the card's bottom edge: an info glyph plus one sentence (`Your spending is outpacing the budget` / `…is on track and within budget`). **No ringgit figure** — the strip states the verdict, the bars carry magnitude. Same `over` boolean as the bar's colour flip, read from **`todayForecast()`** — the same call the detail panel prints, so the strip, the bar's red and the two figures can never disagree. **Only overspending gets a solid fill** (`--strip-over`, white text); on-track is transparent ground + `--on-surface-variant` ink with only a hairline top border. `--strip-over` is deliberately **deeper than `--semantic-expense`** (#D93A31 / #C0392F dark) — the semantic token is tuned for text *on* the surface and clears only ~4.0:1 under white. Full-bleed via negative margins (`20px -1.25rem -1.25rem`); bottom corners mirror `.card`'s asymmetric radius. **No strip in the no-budget state** — "within budget" with no budget is a false statement. `paceBarMemory` feeds the mount-then-spring.
- **Current-month-only:** the pace bar renders only for the real current month.

### 3.6 Logs tab

`renderLogsLedger()` → `#logs-ledger`: **static week rows** under month headers — label, entry
count, week spend total, day-column chart. It reads **all** the user's rows and scopes them
itself. The month chip never filters here; it jumps.

- **NO ACCORDION — locked.** No chevron, no `aria-expanded`, no press state, no `cursor:pointer` on the week header, **no inline week transaction list**. `toggleWeek()`, `expandedWeeks`, `logsSeeded`, `weekBodyHtml()`, `bindTxnRowClicks()` are **deleted**. A day column is the only drill-in. `txnRowHtml()` is kept as its own function so a future week-scoped sheet can reuse it.
- **Bucketing — weeks CLIP TO THE MONTH they render under.** `weekSpanFor(iso)` → `{y, m, startIso, endIso}` (the row's Mon–Sun week intersected with its own month); **`startIso` is the bucket key**. A week straddling two months renders **once under each** with only that month's days (`Jul 27 – 31`, then `Aug 1 – 2`). **Short weeks (<7 columns) at a boundary are correct, not a bug** — locked; don't re-litigate. `weekRangeLabel(span)` prints a bare `Aug 31` for a single-day clip. Month headers carry `data-ym="Y-M"`. Newest first; only weeks holding rows render. `weekMondayIso()` is gone.
- **An empty week is one line.** `zero = spend <= 0.005` adds `.empty-week`, swaps the figure for **`Nothing spent`** in neutral ink (`.week-total.zero`), and **skips `weekDaysHtml(wk)` entirely** — no chart, no dead tap targets. (`_weekSpend()` already excludes income, so an income-only week is exactly this case.)
- **Day columns** (`.week-days` → `.day-col` → `.day-col-track` → `.day-col-bar`): one per day in the clipped span. **Width is fixed and encodes nothing; HEIGHT carries the money** — share of the 48px track equal to that day's share of the week's busiest day. Width must stay fixed because **the cell is the only route to a day's transactions** (the horizontal-segment predecessor made a quiet day a 14px sliver). `flex: 0 0 calc((100% - 6*4px) / 7)`, **never grown**, so a 2-day week's columns align with a 7-day week's. `max-width: 64px` stops a wide viewport turning a 48px-tall column into a slab. Zero-spend days keep a **4px stub** and go `--outline-variant` gray. Income never enters a column. **The track is a visible slot** (`--wash-neutral` bg, `--shape-xs`, `--wash-hero` hover) — seven bars on a card read as a chart; seven bars in seven slots read as buttons. **Heights are per-week scaled, so columns are NOT comparable across weeks** — cross-week magnitude is the week-total figure. Mount-then-spring via `_dayHeightMemory` + `paintDayColumns()`.
- **Weekday labels:** single letters `M T W T F S S`, Mon-first, **`aria-hidden`** (the cell's own `aria-label` already names the day). Single letters so they can never wrap at 390px.
- **Tap targets:** each `.day-col` is a real `<button>`; **the whole cell is the hit area** — full width, the 48px track *and* the label, ≥44px tall. Never shrink to the filled portion. `aria-label` = day + figure (`Tue 4 Aug, RM 42.00`). `.week-days` is a labelled `role="group"`.
- **Day drill-in:** `openDaySheet(iso)` → the shared sheet (§3.14). Header = weekday + date, entry count, the day's **expense** total. Empty day reads `No transactions this day`.
- **Month scope — current month by default, appended on demand:**
  - `logsMonthsShown` (module state, init **1**). Older months are **appended, never swapped in**, and the scope **only grows within a session** — a `dataStamp` bump or tab round-trip must not collapse it; only a reload resets it. Clamped to `_logsTotalMonths` inside `renderLogsLedger()` (one place — the row set can shrink under an optimistic delete).
  - ⚠️ **It counts months HOLDING DATA, not calendar months back.** With a gap (data in Aug and June, none in July) a calendar count would make the tail name July and reveal nothing — a dead tap.
  - **Tail** (`logsTailHtml()`): a `.logs-tail` button reading `Earlier months — show June` (the next month back **holding data**), or at the earliest, a `.logs-end` note (`Nothing logged before March.`). A dashed transparent boundary, not a filled button — a footer, not a rival to the FAB. `--tail-dash` is its own token because `--outline-variant` is pixel-identical to `--surface-container` in dark mode. `logsMonthLabel()` year-suffixes outside the current year.
  - **`loadOlderMonths()`** raises the scope by one, re-renders, scrolls the revealed header into place. Only the new block animates: tagged from `_logsAppendedYm` with `.logs-new`, and **the flag is cleared after that one render**. Neither `.settled` nor `.no-entrance` targets `.month-header`/`.week-row`, so neither suppresses the append.
- **Scroll-to-month** (`logsScrollToMonth` → `logsScrollToYm`): grows the scope until the target `.month-header[data-ym]` exists, then parks it at **`LOGS_PARK` (56px)**. Stepping **forward never shrinks the scope**. Bypasses `calculateAndRender()` entirely so the `renderedKey` early-return can't swallow the jump. A month with no logged weeks → quiet no-op.
- **The pill is a SCROLL READOUT on Logs** — there is no selected month here, only a position. `spyResolve()` writes `viewMonth`/`viewYear` and calls `renderMasthead()` — **label and state only.** ⚠️ **It must never call `calculateAndRender()`** (an infinite loop waiting to happen; the suite asserts `#logs-ledger.innerHTML` is byte-identical across a relabel).
  - ⚠️ **Resolved GEOMETRICALLY against `SPY_LINE` (64px) — the last header above it** — with the `IntersectionObserver` used only as a trigger (`rootMargin: '-64px 0px 0px 0px'`). "Topmost intersecting entry" is **directionally asymmetric** and latches on the month you just left (§8).
  - ⚠️ **`LOGS_PARK` (56) and `SPY_LINE` (64) are a pair.** A jump must park at or above the line or the readout names the month *before* the one asked for. Change one, re-check the other. 56 also clears the pill (12px top + 38px tall).
  - **A jump the document cannot deliver is AUTHORITATIVE** — the oldest months can never reach the line (the page bottoms out), so `logsScrollToYm()` sets `_jumpClamped` and `releaseSpy()` leaves the readout on the month asked for.
  - **Future months are skipped** — `pickerMonths()` won't offer them and the swipe clamps at the current month, so a readout naming one would be the only surface claiming it.
  - `_spySuppressed` wraps every programmatic scroll, released on `scrollend` with a timeout backstop. ⚠️ **Not `{ once: true }`** — if the timeout wins the race, a stale listener survives and releases the *next* suppression early. `wireLogsSpy()` is called from the end of `renderLogsLedger()` and from `switchView()`, where it disconnects off-tab (`#logs-view` is `display:none`, so every header rect is 0 and a live observer would rewrite `viewMonth` while you scroll Trends).
- **Export FOLLOWS the readout.** `openExportModal`/`exportCSV` scope, filename, error copy and `#export-month-label` read **`viewMonth`/`viewYear`** — on Logs that's wherever you've scrolled, so scrolling into July exports July. Intended and asserted.
- **Toolbar — GONE**; the recurring and export icons are in `#masthead-actions` (§3.4). `#logs-view` starts with `#logs-ledger`.
- Recurring-written rows carry a quiet `.txn-auto` **"Auto"** marker (from `Source === 'recurring'`).
- `CAT_COLORS` + `CAT_ICONS` live at module scope.

### 3.7 Trends tab

Everything computes from `viewMonth` (`vRows`/`vIncome`/`vExpense`/`vCatData`). Order: insight
strip → tiles (closed months only) → archive card slot → **donut → spending patterns** →
cumulative line. The donut (`#category-card`) and cumulative (`#cumulative-card`) cards are
**separate full-width blocks**, not a two-up grid. Blocks are spaced **12px**; `#cumulative-card`
closes on the 1.5rem section break.

- **Insight strip** (`#trends-insight`, `.insight-card`, "What I noticed"):
  - **Deterministic engine** (`computeInsightNarrative()` → `renderTrendsInsight()`): fact builders — `_insightPace` (MTD vs same point last month; whole-month vs prior for past months), `_insightCategory` (3-month monotonic climb, or ≥40% jump/drop vs recent average, ≥RM30 guard), `_insightRecurring` (~monthly repeating descriptions across ≥3 months, CV ≤ 0.2, annualized), `_insightWeekend`, `_insightStreak`, `_insightComposition`, `_insightDistribution`. Each returns `{family, score, text}`. Guards: <5 expense rows → "log a few more days"; no strong candidate → "steady month". **Numbers are computed, never guessed.**
  - ⚠️ **COVERAGE, NOT RANKING (2026-08-31).** The strip sits above four charts and reads as a note about them, so **each chart contributes at most one line, in the order the charts appear below**: `category` (donut) · `timing` (calendar) · `distribution` (curve) · `pace` (cumulative), via the `CHART_BUILDERS` table. A builder still returns `null` when it has nothing true to say — coverage never manufactures a line. `_insightRecurring` is **not** a chart, so it is a bonus line taken only when fewer than 3 charts spoke; four sentences is the ceiling.
  - ⚠️ **Novelty rotation is now ORDERING-ONLY.** `familyPenalty` breaks ties between two builders competing for the same chart's slot; it can no longer drop a chart's line, which is what it used to do and would now leave a chart unexplained. Deliberate narrowing — don't "restore" it.
  - **`_insightDistribution`** reads the same clipped window as the curve, and returns `null` under 3 spending days or when the average is within 15% of the median.
  - **Novelty rotation:** recent families penalized (`localStorage` per user, last 5 gens, decaying) so the mid-tier rotates. Only genuine live-month renders record history.
  - **LLM phrasing:** POSTs `{key, action:'insights', facts, month}` → `{narrative}`; `styleInsightText()` escapes then re-bolds figures. Fully guarded: 10s timeout / non-200 / error → deterministic text. `insightCache` keyed `user|viewYear|viewMonth|dataStamp|families`; `insightToken` drops stale responses. `INSIGHTS_ENDPOINT` = `APPS_SCRIPT_URL`; blank it to force deterministic-only. Past months never POST.
  - **Typewriter reveal:** `typewriteInto()` sets real innerHTML then types over the text nodes (rAF, `clamp(chars·14ms, 500, 1900)`). Reduced motion → instant.
- **Tiles** (`#trends-metrics`): **closed months only** — a past month shows `Average Daily` + `Total Spent` actuals; on the live month it's emptied and `display:none`. `.tile-block.neutral-block` uses `--outline-variant` border + translucent `--wash-neutral` (a flat `--surface-container` fill was pixel-identical to that border in dark mode).
- **Spend-card slot** (`#income-bar-card`): **hidden on the live month** (Today owns the pace bar); closed months show the **archive card** (net, top category, days logged X of N, quiet pace verdict).
- **Cumulative line:** current cumulative vs viewMonth−1 reference in outline gray (`#6C757D`/`#ADB5BD`) — reference, not warning.
- **Donut + category breakdown** (`#category-card`): a **segmented donut** (`doughnut`, `cutout:'70%'`, `radius:'92%'`, `spacing:6`, `borderRadius:12`, `borderWidth:0`) in a 260px container, month expense total in the hole, ranked list below.
  - **Nothing is drawn on the canvas but arcs.** `pieLabelsPlugin` and `variableRadiusPlugin` are **deleted**; `Chart.register()` takes `heroBaselinePlugin` alone. `layout.padding` is `4` (52/36 existed only for callouts). `variableRadius` was also wrong on a ring — it scaled `outerRadius` but not `innerRadius`, making thickness vary per segment.
  - **A single category is a full circle, so it has no ends** — both `spacing` *and* `borderRadius` guard to `0` (`vCatData.length > 1 ? … : 0`). `borderWidth:0` also retires a latent bug: `borderColor: 'var(--surface-container-low)'` never worked, since canvas 2D can't resolve a CSS custom property.
  - **Centre total is an HTML overlay** (`.donut-center`), not canvas text — so it gets the UI font, theme tokens and `.counter-val` inertia (`data-key="an-cat-total"`). ⚠️ The render **wipes `#donut-container.innerHTML`** each pass, so the overlay must be re-injected in that same statement.
  - **List** (`categoryBreakdownHtml()` → `#category-breakdown`): icon chip (`.txn-icon-chip` + `hexToRgba(hex, 0.12)` **and `color: hex`**), name, `X% of total`, amount, share bar in the category's hue (`.cat-bar`). Bars scale to **share of total**, matching the printed percentage — not share of max, which would always fill the top row. Shares print one decimal below 10%. Bars mount at `width:0` and get real width one frame later.
  - **Tap a category → the shared drill-in sheet** (§3.14, `openCategorySheet(cat)` → `txnsForCategory(cat, year, month)`, highest amount first). Scope is `viewMonth`/`viewYear`, matching the ring. `txnsForCategory` reuses `_expenseRowsFor()` so the sheet and the donut can't disagree.
  - **The tap lives on the list row, not (only) the arc.** Each `.cat-row` is a real `<button>` — full width, ≥44px, with a `.cat-chev` affordance — because the list holds the labels and a 0.1% category is a few degrees of arc but a full-width row. Arc taps work as a secondary path: `getElementsAtEventForMode(evt, 'nearest', {intersect:true}, true)`, gated on `canvas.id === 'donut'`, so a miss (the hole) stays a miss.
  - **Empty month:** `#donut-container` `display:none`, no overlay, list reads `No expenses logged this month.`
  - Layout: `.cat-card-body` is one column on a phone, `minmax(0,300px) minmax(0,1fr)` from 769px.
- **Category palette** (dataviz six-checks validated, light+dark): Food & Dining `#C2542D`, Transport `#0891B2`, Bills & Utilities `#D97706`, Shopping & Groceries `#2684FF`, Subscriptions `#6554C0`, Entertainment `#DB2777`, Other `#495057`. Semantic expense red is never a category.
- **Spending patterns** (`renderSpendingPatterns`, `#spending-patterns`): the `viewMonth` calendar as a cell grid tinted by **spend per day** on the sienna `hm-l0..l4` ramp. **Monday-first**, date numbers on each cell, **monthly-only** (the Weekly/Monthly toggle was removed). Self-scaling: `level = ceil(spend / maxSpend × 4)` over the busiest non-future day (`hm-l0` = zero, `hm-future` = dashed). A `.sp-chip` reads `Month Year • N days • ↗/↘ RM total`, with the average on **its own line** (`.sp-avg`) — as a fourth clause it wrapped at 390px. **N = `elapsedDays`** and **avg = total ÷ elapsedDays**, so the live month divides by days-so-far and a closed month by the full month. ⚠️ **This stays a MEAN and no longer matches the Today tile** (which reports a median, §3.5a) — it is the month's total spread over its days, printed beside that total, and the old to-the-cent parity claim is retired. Arrow valence follows spend delta (up = red, down = green), omitted with no prior data. `.sp-legend` shows the ramp. Expense rows only, active-user-filtered.
  - **Day numbers use `--on-surface` on every step.** They used to flip to `#F5F5F2` on `hm-l3`/`hm-l4` at **2.01:1**; the deleted rule is not to come back.
  - **The live month CLIPS THE FUTURE** (on the 10th, 22 of 31 cells were dashed placeholders). ⚠️ **The clip applies to the RENDER, not to `days`**: `const cellDays = isCur ? days.filter(d => !d.future) : days;`. Mutating `days` in place breaks two things — a future-dated expense vanishes from the chip's total while Today's tile still counts it, **and on a closed month `clipped` IS `days`, so `days.length = 0` renders ZERO cells.**
- **Spend distribution** (`renderSpendDistribution`, `#spend-distribution`, between the patterns grid and `#cumulative-card`): the month's spending-day amounts as a **smoothed filled area curve**, with dashed **Median** and **Mean** reference lines, each carrying its figure. It exists to make the skew legible — it is the visual explanation for why the Today tile reports a median (§3.5a), **not a standalone analytic**.
  - ⚠️ **A distribution, so the Y axis is a DAY COUNT, not money.** That is exactly why there are no bars: the *length = money* rule (§3.2) is honoured by not using the mark it governs (D9). The Y axis is unlabelled; sienna reads as intensity, and nothing on this card is ever semantic red.
  - ⚠️ **NOT a bell curve.** The asymmetry IS the finding — never fit or force a symmetric distribution.
  - ⚠️ **The second line is the AVERAGE, not P90** (changed 2026-08-31, superseding the source spec's §6). A percentile explains nothing to a reader who doesn't already know what one is; *typical day vs average day* **is** the skew, in words. **P90 still does its real work** inside `spendProfile`/`computeSpendForecast` (D3/D4 untouched) — it is simply not drawn, and the word appears nowhere on the card.
  - ⚠️ **`spendDayMean`, not `meanDaily`.** The card's average divides by **spending** days, matching the median beside it; the Today tile's `Average Daily` divides by calendar days. Two different figures — `DIST_NOTE`'s "across those days" is what says which one this is, and is load-bearing for that reason. Multiplying `spendDayMean` by calendar days is the D8 trap.
  - **The lines carry their real names; `DIST_NOTE` teaches them.** ⚠️ It is a **static string** — do not interpolate `dist` back into it. The labels already carry the figures, and re-quoting them turned the sentence into a caption instead of an explanation. Being static is also why there is no "the two are close" branch any more: *"usually higher"* is already hedged correctly for a flat month.
  - **`P90` and `percentile` stay off the card** (2026-08-31, second pass). Those are not interchangeable with `Median`/`Mean`: a percentile is the one term the sentence cannot explain in passing, whereas median and mean each take half a clause.
  - ⚠️ **The live month is CLIPPED at today**, same as `todayForecast()`. The card explains that tile's median, so it must be drawn from the same days or it marks a median the tile does not print. `distributionBuckets()` also takes the median **over days at or below P90** (D3) for the same reason.
  - **Inline SVG, no Chart.js** — 14 bucket points is a trivial path, the labels stay real DOM (§8), and it needs no fourth chart and no new id-gated canvas plugin.
  - ⚠️ **The curve RISES (`distRise`); it is never drawn with `stroke-dasharray`.** Under `preserveAspectRatio="none"` with `vector-effect: non-scaling-stroke`, Chrome lays the dash pattern along the **device-space** path while `stroke-dasharray` stays in user units — the two disagree by the viewBox scale and a "solid" line renders as chunks with gaps. `pathLength` does **not** reconcile them.
  - **Reference labels are anchored to their own lines** (`.anchor-start`/`-mid`/`-end` flip which end is pinned near the card edges) — a label nudged away from its line labels the wrong value, and one pushed past the edge is the mobile-zoom trap. Colliding labels (<18% apart) stack onto a second row instead.
  - `--dist-wash` has **separate light and dark values** — sienna at 0.18 all but vanishes on `#121212`.
  - **Empty state: fewer than 3 spending days** → one line of copy, no axes, no partial curve. Half a curve would read as a finding.
- **The archive shelf is DELETED.** `#month-shelf`, `renderArchiveShelf()`, `.shelf-*` are gone; the picker supersedes it. ⚠️ **Two different things are called "archive":** the closed-month `archiveCardHtml()` in the `#income-bar-card` slot **stays**, as does the Logs `.logs-tail` (a lazy-load control, not a month selector). If unsure which you're looking at, stop.

### 3.8 Capture flow (FAB → sheet → parse → confirm)

- **Capture sheet** (`#capture-overlay`, `.modal-overlay.align-bottom`) floats above the nav pill. Closed state is `scale(0.08)` + full radius with `transform-origin` at the FAB center (§3.3), so the FAB blooms into it.
- **There is no FAB long-press.** `wireFabGestures()`, `openCameraDirect()`, `FAB_LONG_PRESS`, `_fabCameraShortcut` are gone. **The camera is the camera button in this sheet.** ⚠️ **Removed for reliability, not taste** — see §6/§8: the gesture's outcome is decided by main-thread timing, an off-main-thread platform long-press, file-chooser activation rules and camera-intent latency, and the render loop models none of them, so three green suites said nothing about the only environment where it broke.
- Clip button → `#capture-gallery-file` (bare `accept="image/*"`); camera button → `#capture-camera-file` (`capture="environment"`). Both feed `handleCaptureFile`; photos downscale to ≤1280px JPEG q0.82 before base64.
- **Photo + comment:** a photo parks as `pendingImageB64` with a removable `.capture-attach` chip so a note can be typed; send submits both, note as `caption`. Survives close/reopen until sent or removed. Placeholder `"Coffee RM8"` is set in markup **and** in `clearCaptureAttachment()`.
- POSTs `action:'parse'`; **the receipt prints in `#capture-parse` while the request is in flight** (§3.15); 25s timeout; notes/errors in `#capture-note` (persist to next open, cleared on new parse).
- ⚠️ **Exactly one busy indicator, and which one depends on the motion setting.** The receipt **replaces** the send-arrow spinner — two of them a centimetre apart is noise. Under `prefers-reduced-motion` the receipt goes still, so the spinner comes back; **that branch is now the only place the spinner's CSS lives**. Never both, never neither — asserted both ways (§3.12).
- **`setCaptureBusy()` is the single hook** for both halves, and `parseCapture()`'s `finally` already covers success, error and the 25s abort — so the receipt cannot be left printing behind an error message.
- **`Enter manually instead` is styled as a fallback** (`.capture-manual`) — an underlined text button, not a `.btn`, which outranked the capture field the sheet exists for. Still a 44px target. ⚠️ It **replaced** its `.modal-actions` wrapper rather than sitting inside it (the rule carries its own `margin-top`).
- **Confirm flow:** 1 txn → the normal txn modal pre-filled ("Confirm entry", saves via untouched `saveTxn()`); N txns → `#review-overlay` (editable amounts, removable rows, sequential "Save all"; saved rows leave the list so retry can't duplicate).
- **Sources:** capture-confirmed adds carry `'web'`/`'web-image'`; plain FAB adds send `'dashboard'` (`pendingSource` resets on every plain modal open — `openManualFromCapture()` preserves it).

### 3.9 Modals (txn, review, export)

All overlays are `role="dialog" aria-modal="true" aria-labelledby=…`, and open with class `.open`.

- **Focus:** `trapModalFocus(overlay, initial)` remembers the trigger, moves focus in (`preventScroll`), confines Tab/Shift+Tab; `releaseModalFocus()` restores. **No auto-pop keyboard** — txn modal and capture sheet focus the sheet element itself (`tabindex="-1"`, `outline:none`), not a field.
- **Escape:** one global keydown, a **hardcoded chain** — backs out of the delete confirm first, else closes whichever overlay is open. ⚠️ Every new overlay has to be added to it by hand.
- **Txn modal:** title `Log a transaction` / `Edit a transaction` (`openTxnModalPrefilled` uses `Confirm entry`). Type toggle reads **`Expense / Income`** — **not `Budget`** (the `#type-income-btn` id, the stored `'Income'` value and `#recur-type-income-btn` are unchanged). ⚠️ **The active segment is `--on-surface`, not red** (§3.2). `.btn-primary` is sienna with white text. **In-modal delete confirm:** outline-red Delete (`askDeleteConfirm()`) escalates to a solid-red confirm row; `cancelDeleteConfirm()`/`resetDeleteConfirm()` restore (also on open/close); `deleteTxn()` assumes intent confirmed.

### 3.10 Optimistic writes

Add/edit/delete/review-save mutate `allRows` locally and re-render instantly (no loader), then
POST in the background and fold in server truth via a **debounced reconcile**
(`reconcileFromServer`, 1.5s after the POST). Reconcile keeps optimistic rows the GViz cache
hasn't surfaced, honors optimistic deletes the cache still echoes, and de-dups **UID first,
content-signature second**. Failures roll back and surface a neutral **toast** (`#toast`,
inverse-surface — not red). Client sends `clientUID()` with every add. Date construction matches
the GViz month-correction so optimistic and reconciled rows format identically.

### 3.11 PWA shell (push retired — Phase F)

`manifest.json` is now the **entire** PWA shell and carries installability on its own.
**Three icon entries, ONE framing.** `icon-192.png` and `icon-512.png` are
`purpose: "any maskable"`; `icon-64.png` is the tab favicon (stripped variant, `any`).
⚠️ **A launcher masks whatever icon it picks, INCLUDING a `purpose: "any"` one.** This was found
on a real device: a full-bleed `any` icon at 1.22 came back from an Android home screen with the
coin, legs and tail cropped off, while the correctly-sized maskable file sat unused beside it.
There is therefore **no full-bleed framing to be had** — the art is scaled once to sit inside the
mask and both purposes are declared on the one file. Separate `icon-maskable-*.png` files are
**deleted**; do not reintroduce them for this drawing. The scale and how to re-derive it are in
§3.15. `background_color` is the paper `#FFFCF8`.
**No service worker** (`firebase-messaging-sw.js` and its registration are deleted; it only did
push display + PWA presence, no fetch handler). **No push client** — bell, `togglePush()`,
`initPushUI()`, the Firebase SDK import, `FIREBASE_CONFIG`, `FCM_VAPID_KEY` and
`localStorage('alfred_push_token')` are all gone. How push worked is preserved in §8.

### 3.12 Verification loop + the committed test layers

**Three layers, three questions.**

| Layer | Question | Committed? |
|---|---|---|
| Render loop (`alfred-verification` skill) | "Did this change do what I meant?" | No — written per pass, thrown away |
| `test/` | "Is the logic still true?" | Yes |
| `test/browser/` | "Does the app still boot, render, and open what it should?" | Yes |

```
lib/alfred-core.js         pure core — no DOM, no fetch, no clock read
test/alfred-core.test.js   36 tests, node --test, zero dependencies
test/run.sh                the same suite in four timezones

test/browser/helpers/app.js   openApp() — mocks the sheet, stubs Chart.js, pins the clock
test/browser/fixtures/        GViz mock (deliberate month gap) + Chart.js stub
test/browser/smoke.spec.js    63 checks, 2 projects (390 light-reduced / 900 dark-motion)
```

**`test/` (pure logic):**
- **Run `./test/run.sh`.** ⚠️ **One timezone is not a run** — reverting the date fix fails **13 tests at `America/New_York` and zero at `Asia/Kuala_Lumpur`**. Anything that buckets a row by month or day must be proved in both directions.
- ⚠️ **The timezone list lives in `run.sh` only** — a CI matrix would be a second copy of that list (§8's "two doors" trap). The log names the failing zone.
- ⚠️ **`run.sh` is deliberately NOT fail-fast** — *which* zones fail is the diagnosis. **Green at `Asia/Kuala_Lumpur` + red west of UTC = a date parse**; all four red = ordinary broken logic.
- ⚠️ **`node --test test` does not work** — the bare directory resolves against the module loader and dies with `MODULE_NOT_FOUND`. `run.sh` globs `*.test.js`.
- **`lib/alfred-core.js` loads twice:** a `<script src>` in `index.html` **before** the inline block (⚠️ **no `defer`**), with a UMD-lite wrapper assigning onto `globalThis`; and `module.exports` under Node. Side effect: core functions ARE on `window`, unlike the inline script's top-level `let`/`const`.
- **`MONTHS` lives in core**; `MONTHS_FULL`, `WEEKDAYS_MON`, `DAYS_FULL` stay inline.
- **What belongs in core:** if it needs the DOM, the network or the wall clock, it stays in `index.html`. "Today" is always passed in.

**`test/browser/` (browser level):**
- **`openApp({ fixture })` picks the sheet.** `default` is the original one — its deliberate July gap and its `Aug 2026` export label are load-bearing for the first 26 checks, so a spec needing different data **adds a fixture to `FIXTURES`, never edits that one**. `skewed` (`gviz-fixture-skewed.js`) exists for §3.5a: 12 August spending days with two outliers, three complete prior months so the buffer applies, and an income that sits **between** the mean projection and the calibrated forecast — so the pace strip reads "on track" only if it is using the new figure. Keep that gap, or those checks stop proving anything.
- **The harness is the reusable part; the assertions aren't.** `openApp()` is what used to be rewritten each session. A new check adds an assertion, not new plumbing.
- **CI:** `.github/workflows/browser-tests.yml`, separate from the zero-install `tests.yml` so a browser-tooling failure can't be mistaken for a core-logic one. **`@playwright/test` is pinned exact**, not a range, so CI fetches the browser this suite was verified against.
- ⚠️ **`page.emulateMedia()` before `goto()`, not the `reducedMotion` context/project option** — the option didn't reliably reach `matchMedia()` before the app's script ran. Matters because the app reads `matchMedia('(prefers-reduced-motion: reduce)')` **once**, into `REDUCED_MOTION`, at script-parse time (§3.2, §8).
- The masthead-corner checks are a **permanent regression test** for the pill `pointer-events` bug (§3.4) — proved to fail against the pre-fix CSS before being trusted.
- The **loader-mark checks** are the same kind of floor for §3.15, and cost one round of the same lesson: the first draft read `svg.querySelectorAll('[stroke]')`, which searches DESCENDANTS ONLY, so a `stroke` on the `<svg>` root — the worst version of the regression, since every child inherits it — passed the negative control. ⚠️ **Test the root as well as its descendants.** Both controls (root, and one path) now fail; the shipped markup passes.

⚠️ **Figure assertions need reduced motion.** `animateCounters()` counts up, so a read 600ms
after load lands mid-animation (the hero measured `RM 1,859.70` en route to `1,887.00`).

### 3.13 Recurring series (Phase G)

A series is a **definition** in the `Recurring` tab (§1); its **occurrences** are ordinary
`Sheet1` rows written through the ordinary `add` action. Generation is client-side.

- **Materialization** (`materializeRecurring()`) runs from `init()` **after first paint, in `requestIdleCallback` (3s timeout, `setTimeout` fallback), never awaited** — ⚠️ the idle scheduling is load-bearing: it fetches a second sheet and can post up to `RECURRING_MAX_PER_RUN` rows sequentially, so a slow or absent `Recurring` tab can't delay load. It enumerates each active series for `activeUser` from `StartDate` to **today**, skips UIDs already in `allRows`, pushes optimistic rows, POSTs sequentially, rolls failures back per row. Toast: `Added N recurring entries`.
- **Never future-dated.** `avgDaily`, `forecast`, the pace bar and the patterns chip all divide by *elapsed* days — a pre-written future row corrupts all of them silently. "What's coming" is the **unwritten** `Next …` line (`nextOccurrence()`, analytic so it stays O(1)).
- **Idempotency via derived UIDs:** `recurringUID(seriesId, iso)` → `rc-<seriesId>-<YYYYMMDD>`, identical on every device. Client skips UIDs in `allRows`; `handleAdd` refuses duplicates server-side (§2) for the window where the GViz cache lags.
- **`recurrenceDates(series, todayIso)` is pure** so verification can drive it at any simulated today. Monthly **clamps to the month's last day** (31st → 30 Nov, 28/29 Feb — never skips). ⚠️ `RECURRENCE_MAX_ITER` is a runaway-loop bound, **not** the write cap: enumeration must reach today, or a daily series older than the cap would forever re-propose only its oldest occurrences. Writes cap at `RECURRING_MAX_PER_RUN` (60).
- **Backfill bound:** the create form sets the start date's `min` to today, so a *new* series can't backfill a closed month. An existing series keeps its anchor (no `min`), which is what lets a catch-up run cover days the app wasn't opened.
- **UI** — `#recurring-overlay`, opened from the masthead's right slot. A **plain centered `.modal-overlay`, deliberately not `.align-bottom`** (that variant's `transform-origin` is FAB-anchored, §3.3). **One overlay, two panes** (`#recurring-list-pane` ⇄ `#recurring-form-pane`) swapped in place — `trapModalFocus` holds exactly one trap, so stacking would clobber the return-focus chain. Escape steps back one level at a time (confirm → form → list → closed).
- List rows reuse `.export-choice`; paused series stay listed at 0.5 opacity (pausing is reversible; hiding would read as deletion). The form reuses `.type-toggle`, `.form-input`/`.form-select` and `populateCategoryOptions()` (takes a select id). Actions are a balanced 2+2: Back/Save, then edit-only Pause/Stop, with Stop escalating `.btn-danger` → `.btn-danger-solid` and naming how many written entries survive.
- **Series edits are forward-only** — changing an amount never rewrites occurrences already written; those are ordinary rows.
- `_insightRecurring()` **excludes `Source === 'recurring'`** — generated rows are stable by construction, so they'd always qualify, and reporting a user's own series back to them is noise.

### 3.14 Drill-in sheet — ONE component, two callers

`#drill-overlay` is the single sheet any figure drills into: a **Logs day column** (§3.6) or a
**Trends category** (§3.7). One interaction language — a figure always opens the same thing. DOM: `.drill-head` / `.drill-sub` / `.drill-total` / `.drill-body` / `.drill-empty`.

- **State, not DOM:** `drillState` is `{kind:'day', iso}` or `{kind:'category', cat, year, month}`. Module state, so an open sheet survives an optimistic write; `calculateAndRender()` ends with `if (drillState) renderDrillSheetBody()` — one call site, because **either view can be behind the sheet**.
- **`drillContent(state)`** resolves each kind to the same four things — title, sub, total, rows — and `renderDrillSheetBody()` renders them identically. Body always uses **`txnRowHtml()`**; an empty result reads as copy, never a dead sheet.
- **A category sheet hides the row badges** — `renderDrillSheetBody()` toggles **`.hide-cat-badge`** on `#drill-body` when `kind === 'category'`, because the sheet is already titled with the category. **The day sheet keeps its badges** (there the category is new information). Income rows badge as **`Income`**, not `Budget`.
- ⚠️ **The sheet CLOSES before `openTxnModal(uid)`** (`bindDrillRowClicks`) — `trapModalFocus` holds one trap, so stacking clobbers the return-focus chain. Closing hands focus back to the column/row, which the txn modal adopts as *its* return target. **No new edit/delete logic exists anywhere.**
- ⚠️ It is `.align-bottom` **plus `.sheet-rise`** — `.align-bottom` alone is FAB-anchored (§3.3), and this sheet is triggered mid-page. `.sheet-rise` overrides the origin to `50% 100%`.

### 3.15 The marker mark — loader and app icon

One nib, **three subjects, one per job** — a small cast, not one logo stretched across the app:

| Where | Subject | Why that one |
|---|---|---|
| App icon (`icons/*.png`) | **Piggy bank taking a coin** | The tile has to say *money* to someone who has never opened the app. Bars do not. |
| Loader (`#main-loader .loader-mark`) | **Four bars on a baseline** | It is the app's own data grammar (§3.2, length = money), and four is what the loader always had. |
| Capture parse (`#capture-parse .capture-receipt`, §3.8) | **A receipt printing** | It names *what* is being waited on, which a generic busy mark cannot. |
| Today masthead (`#masthead-brand .masthead-pig`, §3.4) | **The icon's pig, in-app, at full detail** | The one place the tile's mark appears inside the app. Decoration, and the only decoration. |

⚠️ **The icon and the loader are deliberately NOT the same drawing.** They were for one commit;
the icon's job is recognition in a grid of other apps, the loader's is continuity with the
charts underneath it, and one mark served the second better than the first. Do not "unify" them
back — that argument has been had and this table is the answer.

- ⚠️ **Every mark is a FILLED, tapered path. Nothing in it is stroked.** A felt-tip changes width
  as it moves; a `stroke` of constant width is exactly what makes a hand-drawn mark read as clip
  art. There is no `stroke`, `stroke-width` or `stroke-linecap` anywhere in the mark, and the
  browser suite fails if one appears — **on the root as well as on a child** (§3.12).
- **Nothing scales by stroke**, so the same path data serves 40px and 512px unchanged.
- **The geometry is generated, not hand-written.** A nib model (tapered + bellied + wobbled
  centreline) emits the outlines; the committed artefact is the resulting path data. Regenerating
  is a design task, not a code one — do not hand-edit the `d` attributes.
- **Ink is `--loader-ink`, not `--on-surface`** (§3.2), and the sienna bar is `var(--sienna)`.
  Exactly **one** element is sienna; a second would make the accent decorative.
- ⚠️ **The loader has NO ground shadow; the icon does.** The shadow is ink-coloured, so on the
  dark theme it inverts into a pale puddle under the mark. The icon always sits on paper and
  keeps it. Do not "restore" the shadow to the loader for consistency — the two grounds differ.
- **Animation:** `.lb` groups **LIFT** in sequence (`loaderBounce`, **1s, `translateY(-26px)`,
  `ease-in-out`, a 250ms stagger**); `.lt` ticks pulse. Reduced motion moves the pulse to the
  whole mark and sets `.lb`/`.lt` to `animation: none` — which is also what sets the bars back
  down on the baseline.
- ⚠️ **The bars TRANSLATE; they are never scaled.** Two separate breakages, both invisible to a
  DOM assertion: `scaleY` thins the mark's own 13-unit outline (the shortest bar closes into a
  blob), **and** because every bar scales by the same *factor* while their heights differ
  (110/150/190/230), the tall bar travels twice as far as the short one and the ascending
  silhouette flattens into four equal stubs halfway through each cycle. A translate moves all
  four the same distance and leaves the drawing untouched at every frame. The offset is in user
  units, so it scales with the mark. Asserted (§3.12); check the frames, not the numbers.
- ⚠️ **The stagger is a QUARTER-CYCLE (250ms), not 120ms.** At 120ms all four phases sat in the
  first third of the loop, so the bars rose together and fell together with a dead stretch
  after — the lump that reads as "not seamless". A quarter apart, one bar is always rising and
  one always falling.
- ⚠️ **The keyframes must be SYMMETRIC: `0%` and `100%` hold the same value.** A loop that grows
  and then jumps back at the wrap stutters once per cycle, and no DOM assertion can see it
  because the markup is identical either way. Asserted by reading the rule out of the
  stylesheet (§3.12).
- ⚠️ **The capture receipt has NO paper fill** — a white fill is a bright block on the dark
  theme, and a token fill would fight the sheet it sits on. It is an outline drawing, so it
  needs neither. It has no ground shadow either, for the same reason the loader has none.
- **Receipt animation:** `.cr-rule` lines scale in from the left (180ms stagger), `.cr-total`
  pops last (`crRule` / `crTotal`, 2.2s). Reduced motion sets both to `animation: none`, which
  leaves the receipt complete and still.
- **Copy is `Adding it up`** (loader) and **`Reading it`** (capture), both in the body face. ⚠️ **Not Newsreader** — the serif is the
  masthead's alone (§3.2), and the design draft that used it there was not carried over.
- **Icon framing — one `FRAME` (0.97) and one `ART_CENTRE`, both MEASURED.**
  ⚠️ **Measure the furthest INK PIXEL from the art's centre. Never the bbox corner.** Rasterise
  the art and read the alpha channel; `getBBox()` answers a different question. The pig is a
  rounded silhouette that reaches nowhere near its own corners — bbox corner **226.7** units out,
  furthest drawn pixel only **192.1**. Sizing against the corner shrank the maskable file for
  nothing *and* said nothing at all about the file that was actually being clipped.
  **0.97** puts the furthest pixel at ~186, inside the spec's 205-unit safe radius (a circle of
  80% diameter) with margin for launchers that crop harder than the guarantee. Verified against
  crops at 100%, 80% and 72%.
  ⚠️ **Re-derive it after any change to the drawing** — the tail alone has moved the art's
  bounds twice.
- **The coin never simplifies away.** It carries a drawn **`$`** (S plus bar, same nib) and is
  the only saturated colour — the only reason the tile reads as money rather than as an animal.
  ⚠️ The `$` is **ink on sienna** (~4.3:1), not a knockout in the paper colour (~3.9:1), which
  also keeps the drawing to two inks. It is `d: 2` only; at 64px the coin is ~20px and a glyph
  inside it is mush.
- **The in-app pig IS the icon's drawing** — `d: 2` at **44px**, so the tail, eye, nostrils and
  the `$` all come across, over the pink wash. It is `aria-hidden`, not a button, and takes no
  tab stop; it states nothing and does nothing. Two things differ from the tile, both forced:
  - ⚠️ **No ground shadow, and this one cannot be fixed by re-tinting.** The shadow is drawn in
    the ink colour, and on dark the ink is warm-**white** — so it renders as a pale smear under
    the feet. A shadow has to be darker than its ground, and nothing is darker than `#121212`
    here. `ground: false`, permanently.
  - ⚠️ **The wash stops are TOKENS (`--pig-wash-1..3`), never the icon's literal pinks.**
    Warm-white ink on pale pink has almost no contrast: on dark the outline stops doing its job
    and the pig reads as a blob. Dark swaps in a warm near-black ramp (`#3A2E28` → `#241C19`),
    so the body still separates from the surface and the ink still draws it. **The regression
    is invisible in the light theme**, which is why the suite asserts no `stop-color="#"` is
    present at all. The icon PNGs keep the literal pinks — a PNG has no tokens and always sits
    on paper, so `pig()` takes them as a `washStops` parameter.
  - **44px is the ceiling**, equal to `.month-btn`'s floor: the month button still sets the
    masthead's height, and the height and `--pill-travel` stay byte-identical on all three tabs.
- **The pink wash is a tint of the sienna, not a new hue** — a true pink
  would be the drawing's third colour. ⚠️ **One `linearGradient` in `userSpaceOnUse` spans BOTH
  the body and the snout.** Two `objectBoundingBox` gradients each restart inside their own
  shape, so the overlap shows a seam. ⚠️ The fill shapes are inset 6 units at jitter **0.02**,
  not `blob()`'s default 0.05 — at 5% the fill's own wobble pushes past the outline's inner edge
  and fringes pink outside the drawing. **The loader and the capture receipt stay two-colour** —
  the wash reaches the icon and the masthead mark only.
- ⚠️ **The body arc STOPS either side of the snout** (`GAP = 0.36` rad in `pig()`), it does not
  run behind it. Drawn as a full ring, the body's right edge cuts a chord straight across the
  snout; the snout has no fill to hide it, and giving it one would tie the drawing to a single
  background colour. The gap is where the body ellipse meets the snout circle, so the two ends
  land ON it and read as a join. **Re-derive it if either shape moves** — it is not a constant.
- ⚠️ **The legs are filled wedges, and their width is a SHAPE, not a stroke.** Two consequences:
  they take their own small-size bump (`lw`, 1.15), never the nib's 1.45 — at 1.45 the two legs
  merged into one black mass at 40px; and their tops sit at the body's **outline** (y ≈ 358 at
  those x), not inside it, because the body has no fill and a leg starting in the belly shows
  through as a black skirt.
- **The tail is a spring of TWO turns** — a prolate cycloid, which is what a coil looks like
  from the side. Three turns read as a corkscrew rather than a pig's tail; two is the ceiling.
  ⚠️ **The loops only close while `PITCH × 2π < 2 × RAD`** (3.4 and 12: 21 < 24).
  Raise the pitch and the curve silently relaxes into a wave with no error and no visual warning
  beyond "the tail looks wrong". Its first point sits inside the body so it reads as attached.
- **`icon-64.png` is the tab favicon**, drawn at `d: 1` (no tail, eye or nostrils; heavier nib).
  ⚠️ **Downscaling the 192 for a 16–32px tab renders grey mush** — the detail that reads at 192
  is exactly what cannot survive there.
- **Icons:** five manifest entries plus the favicon link (§3.11). The tile ground is the paper
  `#FFFCF8`; ink is the literal `#12100E` (a PNG has no tokens).

---

## 4. Status

**Everything in §3 is DONE, LIVE and verified.** §3 is the current state; §6 holds the decisions
each change locked. To ask "is X done?", read §3 — if it's described there as current behaviour,
it shipped.

**Before committing, run `./test/run.sh`** (§3.12). CI runs both suites on every push and PR:
`tests.yml` (zero-install, pure logic) and `browser-tests.yml` (`npm ci` + Chromium).

**The only live items are owner steps, Apps Script side:**

- **Phase F** — delete the `sendDailyDigestPush` time-driven trigger, and drop the `FIREBASE_SA_JSON` / `FCM_PROJECT_ID` Script Properties. Harmless if left, but the trigger fails silently in the execution log nightly.
- ⚠️ **REDEPLOY REQUIRED (2026-08-31, model upgrade).** `OPENAI_MODEL` is now `gpt-5.6-luna` with the request-shape changes in §2. **Until the owner redeploys, the live script is still calling `gpt-4o-mini` and nothing changes** — the two halves are inseparable, so a redeploy carrying the new model without the new parameters would 400 every `parse` (capture dies, falling back to manual entry) and every `insights` (silent, deterministic text ships). Verify after redeploying by capturing one text expense and one receipt photo.
- ⚠️ **REDEPLOY REQUIRED (2026-08-31).** `INSIGHTS_PROMPT` was widened to 3–4 sentences / ~60 words with a "keep every observation" rule, so the LLM phrasing layer stops compressing four chart observations back into two. **This ends the front-end-only run that held from 2026-08-08.** Until the owner redeploys, the deterministic narrative (which is already correct and covers all four charts) is what ships — the live one will read short. **Deploy → Manage deployments → Edit → new version. NEVER a new deployment** — that issues a different URL and `APPS_SCRIPT_URL` would silently fall through to the deterministic path forever.

**Pending work:** the candidate features and open questions in §6.

---

## 5. Cost & Sustainability

**~$0/month.** GitHub Pages and Apps Script are free. The only metered cost is OpenAI
(`gpt-5.6-luna`, $0.20/M in · $1.20/M out): ~$0.0004 per text parse, ~$0.004–0.008 per photo, a
few hundred tokens per insights phrasing (cached client-side per month+data). Roughly **2× the
gpt-4o-mini figures** it replaces ($0.15/$0.60), which lands a realistic total **under $1/mo**
against a $5 budget. ⚠️ That multiple holds **only while `reasoning_effort` stays `'none'`** (§2)
— billed reasoning tokens are output tokens. Guards: `ALLOWED_USERS` on `parse`, input size caps, insight cache. Apps
Script free quotas (20k UrlFetch/day, 90 min trigger runtime/day) are orders of magnitude above
usage.

---

## 6. Roadmap

*This section IS the roadmap — separate roadmap files were folded in and deleted 2026-07-19.
Execute **one phase per session, in order.***

### Standing rules for every phase

- Verify with the render loop (§3.12) before committing; run `./test/run.sh`.
- Update this file in the same PR as the change it documents — **rule and consequence, not story.** Reasoning goes in the `alfred-history` skill.
- Respect the design language: M3 Expressive, sienna accent, semantic red = expenses/overspend only, ledger voice.
- Known traps: GViz dates month-0-indexed; Chart plugins gated by `canvas.id`; horizontal transforms need the `overflow-x: clip` ancestor; the strict `activeUser` filter is deliberate; animations suppressed under `.settled`/reduced-motion; Apps Script redeploys via Manage deployments → **Edit**.

**Shipped-phase records below are their binding decisions only.** Rationale, spec deltas and
verification narrative live in the `alfred-history` skill.

### Phase F — Push digest retirement ✅ (2026-07-19)

Owner checklist: ✅ redeployed · ⬜ delete the `sendDailyDigestPush` trigger · ⬜ drop
`FIREBASE_SA_JSON` + `FCM_PROJECT_ID` · ✅ Firebase project deleted (the inert `PushSubs` tab can
also go).

### Phase G — Recurring expenses ✅ (2026-08-02)

Owner checklist complete — redeployed; the `Recurring` tab is created on first save, no manual setup.

### Logs day columns + day drill-in ✅ (2026-08-08)

1. **Weeks clip to the month they render under** — a boundary week appears once under each month, and a short week (<7 columns) is correct.
2. **Logs has no accordion.** The week header is informational only.
3. **The week-level transaction list is gone**, deliberately. A week-scoped sheet off the week total is a *possible* future — explicitly out of scope, not forgotten.

### Trends category drill-down ✅ (2026-08-09)

1. **One sheet, not a second pattern.** Any future drill-in generalizes `drillContent()`; it does not build a third sheet.
2. **The list row is the primary tap target, the arc is secondary.** Arc taps must keep working.
3. **Scope is the month chip**, matching the ring. No all-time toggle.
4. **The ring's paint is untouched** (verified pixel-identical).

### Logs month scope — option C ✅ (2026-08-09)

Supersedes roadmap v3 decision 2 and Phase B step 3, and retires the scroll-sentinel auto-append
they shipped with — don't reinstate either from the old roadmap.

1. **Not a filter.** Older months are appended, never swapped in; once loaded, a month stays loaded for the session.
2. **Default scope is one month**, and **loaded months survive re-renders**. Only a reload resets it.
3. **The tail is a plain statement, not a call to action.**
4. **Export scope is the chip's month.**
5. **Weeks still clip to their month.**

### Header removal — month becomes the masthead ✅ (2026-08-11)

Supersedes roadmap v3 Phase B's header chip, but **not** its "exactly one contextual month
selector" decision — that said one selector, not one selector *in a header*.

1. **There is no app header, and Today has no top chrome.** Not collapsed, not slimmed.
2. **The masthead lives outside `.container`**, and nothing up there becomes `position: fixed`.
3. **The caret stays.** A 31px serif title has no affordance of its own.
4. **The picker is the ledger-list form**, amounts in neutral ink.

### Lift-off pill ✅ (2026-08-11, second pass)

Supersedes the previous condense mechanism and its chevrons. **Roadmap v3 decision 7 ("Archive
card stays") is deliberately REVERSED for the shelf** — the picker supersedes it. ⚠️ **The
closed-month archive CARD stays**, as does the Logs `.logs-tail`.

1. **The masthead names the period; it never measures it.** No figure in the masthead or the pill.
2. **Exactly two doors onto a month** — the picker and the pill's swipe — stepping through the same list. The caret is **load-bearing**: it's the only thing saying the month can be changed.
3. **Today reads the date and is inert.** The unit is the tell.
4. **The pill is never the sole route to anything** — the only reason 38px is acceptable.
5. **On Logs the readout follows; it never drives.** No re-render from a scroll handler.

### FAB long-press — REMOVED ✅ (2026-08-13, third pass)

1. **The FAB is a tap. It has no gesture handling.** A future gesture there is a new design pass *with a hardware verification plan*, not a revival.
2. **The camera lives in the capture sheet.**
3. **`repaintNavCluster()` stays** — it fixes a different bug, is confirmed working on the device, and looks like dead code precisely because no local test can reproduce it.
4. **`materializeRecurring()` stays in `requestIdleCallback`** — keeping the main thread free after first paint stands on its own.

### Pure core + committed tests ✅ (2026-08-15)

The first tests committed to this repo, prompted by an audit finding excellent *verification* and
zero *regression testing*.

1. **`parseRowDate()` is the only way to parse a row's date.** Not `new Date(iso)`, not `new Date(iso + 'T00:00:00')` — one greppable idiom. There are **zero** `T00:00:00` literals in `index.html`; keep it that way.
2. **The pure core is a separate file, and pure means pure.** No DOM, no fetch, no clock; "today" is passed in.
3. **The committed suite does not replace the render loop.** A floor, not a ceiling.
4. **Every renderer that interpolates sheet text into `innerHTML` escapes it.** (The drill sheet's title and sub use `textContent` and are fine.)
5. **`csvEscape()` guards formulas but exempts plain numbers** — a negative amount must stay numeric or the export stops summing.

**Still not done** (audit tiers 3–4): porting the Apps Script validation tests from the retired
bot's repo — `validateTransactions()` remains untested.

### Logs actions move into the masthead ✅ (2026-08-19)

**Does not reopen "the masthead never measures the period"** — that rule is about *figures*.

1. **The Logs toolbar is not coming back.** A third Logs-level control goes in the slot or finds another home.
2. **The slot is Logs-only, hidden with `hidden`** — not opacity, not visibility; tab order is the reason.
3. **The pill's resting `pointer-events` is `none`.** `mh-pill-hit` turns it *on*. The gate must fail closed (§3.4, §8).
4. **The masthead's height, the title's position and `--pill-travel` are unchanged** — anything added to the slot must hold that (`align-self: center`, no taller than 44px).

### Committed browser smoke suite ✅ (2026-08-20)

1. **The render loop still exists and is still written per change.** This is a floor under it.
2. **`openApp()` is the one place harness plumbing lives.** A new check adds an assertion, not a new mock/routing/date-pinning setup.
3. **`page.emulateMedia()` before `goto()`, not the `reducedMotion` context option** (§3.12, §8).
4. **`@playwright/test` is pinned exact** — a range would let CI fetch a different browser than the one verified against.

### Median daily · calibrated forecast · distribution curve ✅ (2026-08-31)

Source: `docs/SPEC_MEDIAN_FORECAST_20260831.md` (committed with this change). **D1–D9 are LOCKED**; the calculation reference is
§3.5a, which is the canonical definition of "Median Daily" and "Forecast".

| # | Locked decision |
|---|---|
| D1 | The metric is a **median**, not a mean — resistant to the high-value tail |
| D2 | **Zero-spend days are excluded** from it; it means "a typical spending day" |
| D3 | The median is taken over days **at or below P90 only** — or big days are counted twice |
| D4 | The big-day threshold is **P90, self-adjusting** — no user-set threshold to maintain |
| D5 | The buffer derives from the **trailing 3 complete months** |
| D6 | The forecast is **one number**; the buffer is never surfaced or labelled |
| D7 | Days 1–7 fall back to the **mean**, labelled `Average Daily` |
| D8 | The forecast applies a **spend-day rate**, never a raw remaining-day count |
| D9 | The Trends chart is a **smoothed distribution curve**, never a histogram of bars |

1. **One forecast, two consumers.** The detail tile and the pace bar's overspend flip read the same `todayForecast()`. A third consumer calls it too — it does not recompute.
2. **The overspend strip fires less often now, and that is the correction.** Do not retune it.
3. **Trends' closed-month `an-avg`/`an-fc` tiles stay a mean** — they state a closed month's actuals, where there is no forecast to calibrate.
4. **The Spending-patterns chip stays a mean**, and its to-the-cent parity with Today is formally retired (§3.7).
5. **The distribution card is a distribution view (Y = day count)** and is a stated exception to *bars = money* — resolved by **not using bars**, not by excusing one.

**Follow-up pass, same day** — the Trends tab must explain itself to someone who does not read
statistics, and Today must stop hiding its own figures:

6. **The detail figures are always open.** No disclosure on the Expenses tile, and the tile is not a button.
7. **The Today glance line is gone**, and with it the last of the Phase F digest math (§0).
8. **The card marks MEDIAN vs MEAN, not median vs P90** — superseding the source spec's §6. D3/D4 are untouched; P90 is still the forecast's threshold, just never drawn or named. *(Corrected the same day: the first attempt renamed the lines to "Typical day"/"Average" to keep statistics vocabulary off the card entirely. **Name the lines properly and explain them underneath** — a euphemism teaches the reader nothing, and the sentence has room to teach two words. `P90` stays off.)*
9. **The card's average is `spendDayMean`** (÷ spending days), not `meanDaily` (÷ calendar days). Two different figures; the copy says which.
10. **The insight strip covers one chart per line, in chart order** — coverage, not top-3 ranking. Novelty rotation is narrowed to tie-breaking only, deliberately.

### Marker loader + app icon ✅ (2026-09-04)

Replaces the four CSS bouncing bars and the sienna "A" tile. Direction picked from a
three-way exploration (marker bars / piggy bank / receipt slip); the two unchosen ones are
recorded here so they are not re-proposed as new.

1. **Filled tapered paths, never strokes.** This is the whole style, and it is asserted (§3.12).
2. **One sienna element per mark**, never two.
3. **The loader carries no ground shadow, the icon does** — the shadow inverts on dark.
4. **`--loader-ink` is its own light/dark pair**, not `--on-surface`.
5. ~~Maskable icons are a separate file~~ — **REVERSED on device evidence (2026-09-04, sixth
   pass).** A launcher masks a `purpose: "any"` icon too, so a full-bleed framing does not
   survive a home screen. One file, one scale, `purpose: "any maskable"` (§3.11).
6. **The serif did not come with the mark.** Newsreader stays the masthead's alone.
7. **The path data is generated by a nib model and committed as data** — regenerate, never
   hand-edit.
8. **The icon is the pig, and the loader stays the bars** (2026-09-04, third pass). Three
   subjects, one per job — see the table in §3.15. The two scales (`any` 1.22, `maskable` 0.86)
   are derived from the pig's own bounds and are not reusable constants.
9. **`icon-64.png` exists because the tab favicon is 16–32px**, where the 192 downscales into
   mush.
9a. **The pig's anatomy is fixed by rules, not by taste** (2026-09-04, fourth and fifth passes):
   the body arc stops either side of the snout rather than cutting through it; the legs are
   filled wedges starting at the outline; the tail is a **spring** whose loops close only while
   `PITCH × 2π < 2 × RAD`; the coin carries a drawn `$` in ink; and a **pink wash** — one
   `userSpaceOnUse` gradient across body and snout — fills the body. All in §3.15, because each
   one looks arbitrary until it is broken.
9b. **`FRAME` and `ART_CENTRE` are measured every time the drawing changes** — and measured
   from the **furthest ink pixel**, not from `getBBox()`. The bbox corner overstated this
   drawing's reach by 18% (226.7 vs 192.1), which made every maskable scale derived from it
   both too small and, worse, irrelevant to the file that was actually clipping.
9c. **The device is the only authority on icon framing.** Four rounds of arithmetic produced a
   correctly-sized maskable file sitting unused beside a clipped `any` file. No local check
   would have caught it: the maths was right about the wrong file.
10. **The capture sheet's parse wait got the receipt** (2026-09-04, same day). A different
   subject from the loader's bars, deliberately: it names what is being waited on. It
   **replaces** the send-arrow spinner rather than joining it, and reduced motion swaps them
   back the other way — one indicator either way.

### Loader bounce restored ✅ (2026-09-04, eighth pass)

1. **Four bars, not three.** The CSS loader had four; the redraw quietly dropped one.
2. **The keyframes are symmetric** (`0%`/`100%` equal) on the original 1s / 120ms / `ease-in-out`
   rhythm. An asymmetric loop stutters once per cycle and nothing but the eye reports it.
3. **The squash floor is 0.5 and the shortest bar is 110 tall** — a drawn outline cannot squash
   like a filled rect. *(Superseded the same day, ninth pass: **the bars are not squashed at
   all.** See below.)*

### Loader bounce — lift, not squash ✅ (2026-09-04, ninth pass)

1. **The bounce is a `translateY`, never a `scaleY`.** A shared scale factor over four different
   bar heights flattens the ascending silhouette mid-cycle, on top of thinning the drawn
   outline. Both are why the motion read as "loafing" rather than bouncing.
2. **The stagger is a quarter-cycle (250ms).** Evenly spread phases, no clump and no dead
   stretch. This supersedes the "original 1s / 120ms rhythm" decision above.
3. **The keyframe check now also asserts the transform is a translate**, with a negative control
   proved against the old `scaleY` rule.

### Brand mark in the Today masthead ✅ (2026-09-04, seventh pass)

1. **The right slot now holds two mutually exclusive things** — Logs actions, Today brand mark.
   Trends leaves it empty. A third thing needs a reason, not just space.
2. **The mark is decoration, and says so.** Not a button, `aria-hidden`, no tab stop. The
   governing principle (the masthead never *measures* the period) is intact; "tools, not
   figures" no longer describes the slot on its own, and the file says that rather than
   pretending otherwise.
3. **The in-app pig drops the ground shadow and the pink wash** — both are icon-only, and the
   in-app marks are two inks that flip with the theme.
4. **44px, equal to the 44px floor.** The masthead's height and `--pill-travel` are unchanged on
   all three tabs, asserted with a 60px negative control.
5. **The mark is the icon's full drawing** (2026-09-04, tenth pass) — the stripped `d: 1`
   variant was not what was wanted. It keeps the wash but as **themed tokens**, and still drops
   the ground shadow, which cannot survive a dark ground at any tint.

### Design fix spec ✅ (2026-08-10, second pass)

1. **`body` never pins the `wght` axis** (§3.2).
2. **Light and dark semantic tokens are separate values.**
3. **Good news is stated, not coloured**, and **sienna is the only primary.**
4. **The donut is untouched** — asserted pixel-identical against `e08da4f`.

### Recorded but undecided — do NOT implement

Each needs a decision before it is a task.

1. **The hero mini-chart** — six unlabelled bars, no axis, little dynamic range. Options: a within-month burn-down against an even-pace line, or delete it.
2. **Logs: shape or list.** If the drill-in goes unfound, auto-expanding the current week is the next smallest step.
3. **Future-dated entries.** Income dated ahead counts toward a week's entry total but appears in no chart or spend figure. Decide: exclude from the month, surface a "scheduled" strip, or reject at capture.
4. **Category taxonomy.** `Shopping & Groceries` merges two behaviours; `Subscriptions` overlaps `Bills & Utilities`. Splitting is cheap now, expensive after a year of history.
5. **Today's name versus its content** — the tab leads with a month figure while the day line is the smallest thing on it.
6. **Multi-user.** Reviewed as a single user throughout.
7. **The category palette** — seven saturated hues, identical hex in both themes, no dark-mode chroma adjustment, sienna doing double duty.
8. **Drill sheet sort order** — rows sort by amount while displaying dates, and nothing says so.
9. **Desktop.** At 1280 the app is a centred phone column with very wide, short cards.
10. **First run for a real user** — a valid `?user=` link with zero rows shows *"Open your personal link (?user=…)"*, the wrong message for someone who just did that.
11. **Failed load** — bare centred red text with a ⚠️ (the app's last rendered emoji), no card, no retry, and the FAB stays live over an empty ledger.
12. **Date input locale** — the manual modal's `type="date"` rendered `MM/DD/YYYY` in Chromium; that follows browser locale, so verify on a real phone.

*(Resolved: "three doors onto the same month change" — the chevrons and archive shelf are deleted;
the picker and the pill's swipe remain and now agree about what a month is.)*

### Candidate features — not yet phased

- **Trips — temporary named budgets.** A named mini-budget with its own set amount, tracking trip spend separately from the month's math. Leaning toward its **own page with its own FAB**. This is a **stored budget number scoped to a trip** — the first place the data model grows past "budget = the month's logged income" (§0). Needs a design pass on where trip rows live (tag/flag vs. a separate tab).
- **FAB long-press accelerator.** ⛔ **TRIED AND REMOVED** — a closed question unless someone brings a way to verify a hold on hardware.

**Parked:** nothing. **Dropped (2026-07-19):** capture-bar correction handling; capture-parse
validation suite.

### Explicitly out of scope (do not build unless asked)

- Streak counters, badges, confetti, celebratory motion beyond existing pop-ins
- Milestone marks on the hero; personal-records insight templates
- Search or filters on Logs
- Restoring the Logs accordion or any week-level transaction list (§3.6)
- Re-pinning the `wght` axis on `body`; reinstating the white heatmap ink, the green good-news states, or `Budget` as a transaction-type label (§3.2, §3.5)
- Restoring the app header, or moving any *figure* into the masthead or the pill (§3.3, §3.4). **Today DOES have a masthead** — it states the date and is inert
- Reinstating the masthead chevrons, any month stepper, the Trends archive shelf, or the binary `.condensed` condense-on-scroll (§3.4, §3.7)
- Reinstating the Logs toolbar row, or putting a *figure* in the masthead's right slot (§3.4, §3.6) — the Today brand mark is not a figure and does not reopen this
- Giving the in-app pig the icon's ground shadow, hard-coding its wash stops as literal pinks, or making it a button (§3.15)
- Setting `.pill { pointer-events: auto }` — the resting value must stay `none` (§3.4, §8)
- Adding `viewport-fit=cover` casually — every `env(safe-area-inset-*)` is currently inert, so turning it on shifts the FAB cluster's geometry and both top offsets at once (§3.3)
- Spreading `--font-display` beyond the masthead month (§3.2)
- Any change to the category donut's chart config (§3.7)
- Recalibrating the overspend threshold to restore the old trigger rate, or blending the median and the big-day buffer back into one average (§3.5a)
- Surfacing the buffer as its own figure — the forecast is one number (D6)
- Drawing the distribution curve with `stroke-dasharray`, or turning it into bars (§3.7)
- Putting "P90" or "percentile" back on the distribution card or in its insight line — `Median` and `Mean` are the labels and are correct (§3.7)
- Putting figures back into `DIST_NOTE`, or making it data-driven again (§3.7)
- Restoring the Today glance line, the Expenses-tile disclosure, or `todayDetailOpen` (§3.5)
- Letting the insight strip's novelty rotation drop a chart's line again — it orders, it does not filter (§3.7)
- Reinstating the FAB long-press → camera accelerator, or any press-and-hold on the FAB, without a hardware verification plan (§3.3, §3.8)
- Deleting `repaintNavCluster()` as dead code — a Chromium/Android workaround, unreproducible locally (§3.3)
- `defer` on the Chart.js tag or the `lib/alfred-core.js` tag — both are called into at module scope by the inline script, which runs first
- Parsing a row's date with `new Date(row.Date)` or `new Date(row.Date + 'T00:00:00')` (§1, §3.12)
- Interpolating sheet text into `innerHTML` without `escapeHtml()` (§3.6)
- Stroking any part of the marker mark, hand-editing its path data, or adding the ground shadow back to the loader or the capture receipt (§3.15)
- Scaling the loader's bars instead of translating them, or clustering their phases back into the first third of the cycle (§3.15)
- Giving the loader or the capture receipt a second colour, or spreading the icon's pink wash to either of them — the wash is icon-only and is a tint of the sienna, not a third hue (§3.15)
- Reusing `FRAME`'s numbers after changing the drawing without re-measuring `getBBox()` (§3.15)
- Running the send-arrow spinner and the capture receipt at the same time, or giving the receipt a paper fill (§3.8, §3.15)
- Reintroducing separate `icon-maskable-*.png` files, or giving the `any` icon a full-bleed framing — a launcher masks whatever it picks, so both purposes ride one circle-safe file (§3.11)
- Deriving an icon scale from `getBBox()` — measure the furthest ink pixel (§3.15)
- Any new backend endpoints, LLM calls, or paid services

---

## 7. History

The full change history — what each pass built, why each fork was taken, where shipped work
deviated from its brief, and the verification record — is the **`alfred-history` skill**. Not
loaded by default; invoke it for the reasoning behind a past decision, or to resolve a roadmap
phase name referenced in an `index.html` comment.

---

## 8. Key Learnings & Principles

**Testing & verification**

- **Verification and regression testing are different jobs, and doing the first well hides that you aren't doing the second.** Every suite this app had was rigorous, ran once, and was deleted. The question that separates them: *would this catch a break introduced three sessions from now?*
- **A bug invisible in the author's own timezone will live forever.** `new Date(iso)` parses UTC midnight; `getMonth()`/`getDate()` read local. At UTC+8 the app was correct by geography while 24 call sites were wrong by construction. Anything environmental (timezone, locale, DST) needs the *matrix*, not a run.
- **Reach for a property test when two implementations must agree.** `recurrenceDates()` enumerates and `nextOccurrence()` computes analytically; nothing held them in step, and examples hide the disagreement on the 29th of a leap February.
- **Extracting for testability is a code move, not a rewrite.** The moment an extraction also "improves" the logic, nothing can tell you which half broke it.
- **When the verification loop is structurally blind to a failure mode, stop fixing and start removing.** The FAB long-press passed 104/104, then 141/141, then 180/180, and failed on a real phone every time. **Three green runs against a defect that never moves is itself a result** — the loop can't see the bug, so every further fix is a guess with a passing test attached.
- **`| tail -n` on a test summary can hide the failure line.** Playwright prints `N failed` ABOVE `N passed`, so `tail -2` showed a green-looking "1 skipped / 61 passed" while two checks were failing — and the negative control run against that same broken probe reported "1 failed", which read as the control working. **Grep the summary for failed/passed/skipped rather than tailing it**, and treat a control that fails for an unknown reason as unproven.
- **A tool that refuses to perform an action has told you something an assertion could not.** Playwright wouldn't click the relocated icons and named the intercepting element — that report *was* the bug. "Is this visible button clickable" is not a question you write a probe for. Read a refusal as a finding before reaching for `{ force: true }`.
- **A context-level emulation option and the runtime call that does the same thing are not guaranteed interchangeable.** Playwright's `reducedMotion` project option and `page.emulateMedia()` are documented as equivalent; only the runtime call reliably reached `matchMedia()` before the page's script ran. Harmless for a check reading *computed CSS*, silently wrong for one reading a JS flag captured once at parse time. **A new probe has to be proven to fail before it's trusted to pass.**
- **Remove the feature, keep the findings** — the platform learnings are the most transferable thing a failed attempt produces.

**CSS & platform**

- **`stroke-dasharray` and a non-uniform `viewBox` do not compose.** Under `preserveAspectRatio="none"` with `vector-effect: non-scaling-stroke`, Chrome lays the dash pattern out along the **device-space** path while the dash values stay in user units. A dasharray meant to cover the whole path covers a fraction of it, and the "solid" line renders as chunks — with no error and a passing DOM assertion, since the `d` attribute is perfectly correct. `pathLength` does not reconcile the two. Animate scale or opacity instead, and **look at the pixels** — this one is invisible to every probe that reads markup.
- **A scroll timeline on an unscrollable document is INACTIVE, and an inactive timeline's keyframes do not apply at all.** Any property an animation gates falls back to the base rule — which makes the *base rule* the value that has to be safe. Write the gate so the un-animated state is the **closed** one: turning something **on** in keyframes works; turning it **off** only works while the timeline happens to be live.
- **A scroll-driven animation of a custom property is not off the main thread.** Only transform/opacity/filter/backdrop-filter get the compositor. The win is "no JS", not "no work" — and the cost scales with the number of `var()` consumers.
- **In a variable font, `font-variation-settings` beats `font-weight` — and hides it.** `getComputedStyle().fontWeight` reports the declared value either way, so the DOM agrees with the CSS and only the pixels disagree. Assertions about weight must measure rendered ink, with the real variable font loaded.
- **A token that has to read on two grounds needs two values.** Its sharpest form: a *fill* and the *ink drawn on top of it* are one such pair. Porting the icon's pale-pink body into the app kept the light theme perfect and, on dark, put warm-white ink on pale pink — the outline vanished into its own fill and the drawing became a blob. **A shadow is the case with no solution:** it must be darker than its ground, and on a near-black surface no value is, so it is dropped rather than re-tinted.
- **`env(safe-area-inset-*)` does nothing without `viewport-fit=cover`.** Without that meta every `env()` resolves to `0px`, so a stylesheet can be full of inset arithmetic that has never once been evaluated — and the check passes because both sides are zero.
- **A compositing layer that nothing invalidates never repaints.** When the browser won't invalidate a layer, ask it to: drop the filter for one frame and put it back.
- **A cancelled file picker fires nothing.** No `change`, no reliable `cancel` — so a flag set before opening one outlives the gesture and is still set at the user's next, unrelated pick. Read-and-clear at the top of the handler.
- **A control that is also a gesture target needs the click EATEN, not out-raced.** `click` is its own task after `pointerup`, so a `setTimeout(…, 0)` clearing the "was this a drag?" flag can lose. Clear it inside the click handler. Same family: an inline `onclick` is registered at parse time, so no later listener can suppress it.
- **A gesture committed by a single timer callback has a single point of failure — two on a phone.** The callback slips under main-thread load, *and* the platform's own long-press steals the pointer. **A cancelled touch dispatches no `click`**, so the tap fallback doesn't run either and the gesture produces *nothing at all*. Commit on **elapsed time** checked at every end-of-gesture path, idempotently.
- **A threshold that races the platform needs margin measured against the platform, not your other component.** Write down *what* the number has to beat, or the next person tunes it against the wrong thing.
- **An app's own startup work is the load that breaks its startup-time interactions.** Anything documented as "never awaited, must not delay first paint" belongs in `requestIdleCallback` — un-awaited still runs *now*.
- **A horizontal transform + `position:fixed; right:0` = a mobile zoom trap** (§3.2). Caught by measuring `scrollWidth`, not by eye.
- **Chart.js custom canvas draws must be gated by `canvas.id`** — ungated plugins bleed onto every chart on the page.
- **A looping animation whose first and last keyframe differ stutters once per cycle, and nothing reports it.** The markup is identical, the computed styles are identical, every DOM assertion passes; the defect exists only between the last frame and the first. Write loops symmetric, and assert it by reading the keyframe rule itself — that is the one place the discontinuity is visible to a test.
- **A drawn mark cannot be transformed as freely as a solid one.** `scaleY(0.25)` on a filled rounded rect is a squash; on a 13-unit outline it closes the interior and reads as a blob. Any transform on generated line art has to be judged on rendered frames, not on the transform's numbers. **The fix is usually a different transform, not a gentler one** — the loader's bars translate, which distorts nothing at any amplitude and left the squash-floor tuning with nothing to tune.
- **A shared scale factor over elements of different sizes is not a shared motion.** Scaling four bars of 110/150/190/230 by the same 0.5→1 moves the tall one twice as far as the short one, so the shape the mark exists to show — an ascending chart — flattens to four equal stubs halfway through every cycle and springs back. Every keyframe is correct; the silhouette *between* them is the defect. Equal-distance motion (a translate) is the shape-preserving choice.
- **A stagger shorter than a cycle divided by the number of elements makes a lump, not a wave.** Four bars 120ms apart in a 1000ms loop all move in the first third and then nothing moves — read as a stutter even though the timing function is perfectly smooth. Spread phases evenly across the cycle.
- **Reading `.cssRules` on a cross-origin stylesheet throws, and one bad sheet kills the whole `page.evaluate`.** The app links Google Fonts, so any probe that walks `document.styleSheets` must `try/catch` per sheet — otherwise it fails against perfectly correct CSS and looks like a real finding.

**Design & interaction**

- **A term the reader can look up, paired with a sentence that explains it, beats a euphemism that teaches nothing.** Renaming the distribution card's lines to "Typical day" and "Average" dodged the jargon and left the reader with two vague words and no way to learn the real ones. `Median`/`Mean` plus one sentence saying how to read them is both more precise and more teachable. The judgement call is per-term, not blanket: `P90` still goes, because a percentile can't be explained in half a clause.
- **A label nudged off its own reference line labels the wrong value.** Clamping a label's position to keep it on the card silently moves it away from the mark it names. Change which END of the label is pinned instead — the anchor moves, the position doesn't.
- **If everything is reassuring, nothing is an alert.** Reserve semantic colour and solid fills for what has gone wrong; state the ordinary case in words.
- **Emoji are a third colour system** — an emoji glyph in a tinted chip carries the OS font's palette alongside the app's ink and the category's hue. Inline SVG inheriting `currentColor` makes the chip one hue and themeable for free.
- **A control that must be tapped should look like a slot, not a mark.** Seven bars on a card read as a chart; seven bars in seven tinted slots read as buttons.
- **Pad a tap target, don't shrink it to the visual.**
- **When a mark is also the tap target, don't encode magnitude on the axis that sizes the target.** Encoding spend in segment *width* made a quiet day a 14px sliver — and that segment was the only route into the day.
- **A fraction of the container is not a size.** `flex: 0 0 calc(100% / 7)` turns a 48px-tall column into a 200px-wide slab on desktop. Anything whose *proportions* carry meaning needs a cap.
- **A chrome element is usually doing an invisible job as well as its visible one.** The header was also supplying the status-bar inset and the sticky offset the Logs scroll subtracted. Before deleting a layout element, grep for what *measures* it, not just what styles it.
- **Move labels off the canvas the moment there's DOM that can hold them.** ~100 lines of hand-rolled canvas layout said what a plain list says for free, with real text, theme tokens and existing animations.
- **A metric is more useful paired with its baseline** (the pace bar needed the "Today" marker).
- **An accelerator is never worth making the primary control feel unreliable.** Weigh a shortcut against the confidence cost on the thing it's attached to, not the taps it saves.
- **Steal patterns, not palettes.** Refs gave the *structure*; reskinning into Alfred's tokens kept one coherent system.
- **One shared component beats per-tab cards.**
- **Always eyeball mobile widths, not just desktop.**
- **Variable-radius pie needs restraint** — and it was retired entirely on a donut, where scaling `outerRadius` alone reads as varying *ring thickness*.

**Data & architecture**

- **Normal spend and big spend are two behaviours, and one average describes neither.** A mean sat between a cluster of ordinary days and a handful of large ones and reported a day the user never has. Model them separately — one median for the normal days, one buffer for the outliers — and never blend them back together. The corollary is a units trap: once a metric is per-*spending*-day, it can no longer be multiplied by calendar days.
- **Two figures the user will compare must come from ONE call, not two matching formulas.** The forecast was computed twice, identically, in two functions; the moment one changed they would have disagreed on screen about whether the month was overspending. A shared, memoised function is the fix — a comment promising they agree is not.
- **Two doors onto the same state must be built from the same list.** The picker offered only months holding data; the swipe was specced against calendar months. The disagreement is invisible until a user swipes into a month the picker refuses to show. Derive a second affordance from the first one's data, not from the underlying domain.
- **"The topmost thing currently intersecting" is not a position readout.** It's asymmetric — scroll back and the item you're returning to has already left the band, so the readout latches on where you were. Use the observer as a *trigger* and resolve geometrically against a single line.
- **"N months back" is not the same question as "N months of data."** Anything whose label promises what a tap will reveal must be counted the second way. **Fixtures for this need a deliberate gap.**
- **The second drill-in is a caller, not a component.** Two sheets means two sets of chrome, two focus chains, and two places for the hand-off to drift.
- **Two overlays never stack — the second closes the first.** `trapModalFocus` holds exactly one trap, so a sheet handing off to another modal must close first; closing restores focus to the trigger, which the next modal adopts as its own return target.
- **When a brief names a mechanism that no longer exists, port the intent, not the mechanism.** Re-deriving the requirement is cheaper than re-reading the spec literally.
- **Array-return schema** is the unlock: one prompt change (always return a list) handles single/multi-entry/multi-day/split with one append loop.
- **Validation philosophy: fix quietly, drop loudly.** Silent coercion for anything fixable; visible drops only for genuinely unwritable rows.
- **Prompt-driven logic needs real-world eyeballing** — unit tests cover only the deterministic guardrails, never the LLM's reasoning.
- **Compute the numbers, let the LLM only phrase them** — the model can never misstate a figure, and the deterministic half ships as a complete offline feature.
- **Single implementation beats duplication** — extraction/validation briefly lived in two repos, exactly the drift risk that made retiring the bot attractive.
- **Digest as pure sheet math** (no LLM) keeps it free and instant, and reusable across surfaces.

**Platform & hosting**

- **A static site can't hold a secret.** Anything needing the OpenAI key goes through Script Properties; public-by-design values are fine in page source; the allow-list guards metered spend.
- **Apps Script can be the whole backend — with two crypto-shaped edges:** no raw Web Push (no ES256/ECDH), so push went through FCM, whose RS256 SA JWT it *can* sign; and FCM's page SDK must be handed our SW registration explicitly on a project-pages path.
- **A manifest can't carry per-user state** — `start_url` is static, so identity needs a localStorage fallback for the installed-app launch path.
- **Cross-origin from GitHub Pages needs two things or it silently fails** — `Access-Control-Allow-Origin` on the response (Apps Script sends it), and `text/plain` requests to skip the preflight. Make optional calls non-blocking so an upgrade never becomes a hard dependency.

**The harness lessons live in the `alfred-verification` skill** — negative controls, canvas pixel
reads, clock pinning, synthetic-input traps, and the probes that shipped false passes. Read it
before writing or extending a suite.
