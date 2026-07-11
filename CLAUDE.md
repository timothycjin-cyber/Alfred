# CLAUDE.md

*Last updated: 2026-07-11 (Dashboard UX refresh vibe session — Home hero card + tiles + txn icon chips, Analytics pie/spend-pace redesign. Prior same-day work: Pipeline 2 Phase 1–3.)*

---

## 0. Overview

**Project Alfred** is a personal finance system with two components sharing one Google Sheet as the single source of truth:

| Component | What it does | Repo |
|---|---|---|
| **Telegram Bot** | Accepts natural language text or receipt photos, uses OpenAI to classify/extract transactions, writes rows to the Sheet. **Now positioned as CAPTURE + GLANCE + PUSH — not analytics.** | main.py (Railway) |
| **Dashboard** | Single-file HTML app on GitHub Pages, reads the Sheet via GViz, visualises spend/income, and can add/edit/delete rows via Apps Script. **Owns all analytics/visualisation.** | alfred-dashboard (GitHub Pages) |

**Product model (decided 2026-07-11):** The bot does two things a chat app is uniquely good at — fast capture (log an expense in 2 seconds) and push (the nightly digest). Everything pull-based/visual (trends, breakdowns, top expenses, charts) lives on the dashboard. Analytics commands were cut from the bot accordingly.

---

## 1. Shared Data Layer — Google Sheet

- **Sheet name:** Project_Alfred
- **Tab:** Sheet1
- **Sheet ID:** 19_C3gFlY7hDjGm87k3Uke63_Tgg6TQPl6xLiGZvuEis
- **Columns (in order, zero-indexed for GViz):**

| Index | Column | Notes |
|---|---|---|
| 0 | Date | Bot writes plain date; GViz reads it back as Date(YYYY,M,D) with **month 0-indexed** — dashboard JS adds +1 when formatting to YYYY-MM-DD. Known off-by-one bug source. |
| 1 | Amount (MYR) | Numeric |
| 2 | Category | String |
| 3 | Description | String |
| 4 | Source | telegram or telegram-image |
| 5 | Type | Expense or Income |
| 6 | UID | 12-char hex, e.g. mqx393vfm58v. Bot generates via Python uuid.uuid4().hex[:12]; Apps Script generates its own short alphanumeric via Date.now().toString(36) + random for rows it creates. |
| 7 | User | Telegram chat_id (integer stored as string). Written by bot on every new row, and now also by dashboard-side adds/edits via Apps Script. Legacy rows backfilled via Find & Replace in col H. |

**Income Categories:** Salary, Freelance, Bonus, Investment, Side Income, Reimbursement, Other Income
**Expense Categories:** Food & Dining, Transport, Shopping, Groceries, Entertainment, Bills & Utilities, Other

**Two write paths into the same sheet:**

- Telegram Bot → gspread writes directly to Sheet1
- Dashboard → fetch() POST → Google Apps Script Web App → appends/edits/deletes row in Sheet1

---

## 2. Telegram Bot (main.py)

| Layer | Tool |
|---|---|
| Bot framework | Python + Flask (webhook) |
| LLM | OpenAI gpt-4o-mini |
| Sheet storage | Google Sheets via gspread + service account |
| Hosting | Railway (single main.py service) |
| HTTP client | httpx (not requests) |
| Scheduler | **APScheduler BackgroundScheduler (in-process), anchored to Asia/Kuala_Lumpur** |

**Environment Variables (Railway Dashboard):**

- TELEGRAM_TOKEN — Telegram bot token
- OPENAI_API_KEY — OpenAI key
- GOOGLE_CREDS_JSON — Full service account JSON (stringified)
- PORT — Set by Railway automatically
- ALLOWED_USERS — Comma-separated list of permitted Telegram chat_ids (no spaces, no quotes). e.g. `123456789,987654321`. If empty, allow-list is disabled. **Also drives the digest recipient loop — an empty list means no digests are sent.**

**requirements.txt** — flask, gspread, google-auth, httpx, **apscheduler, tzdata**.
⚠️ `tzdata` is required: Railway's slim Linux image often lacks system timezone data, and `ZoneInfo("Asia/Kuala_Lumpur")` throws at startup without it.

### 2a. NLP Extraction — Array Schema (Pipeline 2 Phase 1 & 2 — DONE 2026-07-11)

Extraction now **always returns a JSON ARRAY** of transactions, even for a single one. One schema change covers four input styles:
- single: "lunch RM15" → array of 1
- multi-entry: "lunch RM15, grab RM9, coffee RM6" → array of N
- multi-day/repeated: "coffee RM3 last 3 days" → one element per day, dates resolved backward from today
- quantity math: "3 coffees at RM6" → single element, amount = 18
- bill-split: "dinner RM60, my portion 50%" → single element, amount pre-divided to 30

Also handled in-prompt: relative dates ("yesterday", "last Monday", "N days ago"), currency phrasing normalization ("15 bucks", "rm15", "MYR 15" → 15.00). All date/split reasoning is **prompt-driven** (no Python validation of the logic itself), so real-world testing of edge cases (does "last 3 days" include today?) is worth eyeballing.

`extract_from_image()` now also reads the **photo caption** so split instructions in a caption ("my portion is 50%") get applied — this is the Phase 2 photo-split path.

`_parse_array_response()` tolerates a bare object (wraps it in a list) in case the model ever slips.

### 2b. Validation / Sanitization Layer (DONE 2026-07-11)

`validate_transactions()` runs **between extraction and the append loop**. Philosophy: **fix quietly, drop loudly** — so natural human input never causes friction, but genuinely unusable output never writes garbage.
- Silent fixes: currency-noise stripped from amounts, off-list categories snapped to "Other"/"Other Income" (case-insensitive), malformed/future/missing dates default to today, missing descriptions → "Unlabeled", amounts rounded to 2dp
- Loud drops (reported to user): non-positive/unparseable/absurd amounts, array length over cap
- Tunable knobs at top of section: `MAX_TRANSACTIONS = 31` (covers "every day this month"), `MAX_AMOUNT = 1_000_000`
- Query objects pass through untouched for the caller to handle
- Returns `(clean_list, dropped_count)`; a dropped note is appended to the reply
- Unit-tested across 15 edge cases — all pass

### 2c. Ledger Tone (DONE 2026-07-11)

All bot replies refined to a consistent **"ledger" voice** — like a private butler's statement:
- Monospace via Telegram HTML `<pre>` blocks (send_message gained a `parse_mode` param; `send_ledger()` helper handles escaping)
- Right-aligned amounts (`_fmt_amount`, `_ledger_row` helpers; `RULE = "─" * 26`)
- Rule lines bracket totals; `·` as quiet separator
- One quiet status word carries any judgment ("In surplus." / "under average") — no exclamation marks, no cheerful filler, minimal/no emoji
- Empty-day digest deliberately **breaks** the ledger format into a soft plain-text one-liner ("Nothing logged today.") — the tonal shift is itself the signal

### 2d. Commands (post-cut)

**KEPT (capture + glance + correct + link):**
- `/start` — onboarding (trimmed to reflect new model; not usually in BotFather menu)
- `/balance` — month income vs expenses, ledger tone
- `/last` — last 3 entries, ledger tone (income shown +, expense −)
- `/undo` — remove last entry (walks raw rows for correct sheet index), ledger-tone confirmation
- `/dashboard` — personalized `?user={chat_id}` link

**CUT (dashboard owns analytics now):** `/top`, `/burn`, `/summary`. Also removed the OpenAI-powered freeform-summary fallback — analytics-flavoured questions now **redirect to the dashboard** instead of hitting OpenAI (also trims API spend). Removed now-unused `get_summary()` and `get_month_expense_rows()`.

**BotFather `/setcommands` list (paste this):**
```
balance - Income vs expenses this month
last - Your last 3 entries
undo - Remove the last entry
dashboard - Charts, trends & breakdowns
```

### 2e. Daily Digest (Pipeline 2 Phase 3 — DONE 2026-07-11)

- `build_daily_digest(chat_id)` — assembles the ledger block from **sheet data only (no OpenAI call → zero cost)**. Category totals for today + trailing-average comparison.
- `_daily_average()` — averages daily expense over trailing `DIGEST_AVG_WINDOW_DAYS = 30`, using only days that had spend (fairer "typical spending day" baseline).
- `run_daily_digest()` — loops `ALLOWED_USERS`, sends each their digest (or empty-day nudge). Skips entirely if `ALLOWED_USERS` is empty.
- Scheduler: `BackgroundScheduler(timezone=KL_TZ)`, cron `hour=22 minute=0`, started once at import.
- **Shared daily-summary logic** is intended to be reused by the dashboard (show the same "today so far vs average" block at the top) — one source of truth, surfaced via push (Telegram 10pm) and pull (dashboard).
- Manual trigger endpoint: **`/run-digest?key=8891`** (GET or POST, same shared secret as dashboard) — fire on demand for testing without waiting for 10pm; also a fallback if ever moving to an external cron pinger.

⚠️ In-process scheduler caveat: if Railway ever runs >1 replica, digests would duplicate. Fine on Free tier (single instance) — don't scale replicas without adding a lock.

**Webhook URL Pattern:** https://\<railway-domain\>/webhook/\<TELEGRAM_TOKEN\> — registered via setWebhook.

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
- **Expenses by Category** — **solid pie** (was donut). `pieLabelsPlugin` draws bold on-slice %s (≥8%) + name+amount callouts with elbow leader lines; `variableRadiusPlugin` scales each slice's outer radius **subtly** by share (`0.92 + 0.08 × share`) so a dominant Food category doesn't lopside the circle. Center-total (old donut hole) and the separate Category Breakdown card were both removed — callouts carry name + amount now.
- **Mobile centering:** every direct child of `#analytics-view` shares one `max-width:440px` + auto-center at ≤768px, so tiles/cards/charts all line up (previously tiles went full-width while charts stayed capped).

⚠️ Chart plugins (`pieLabelsPlugin`, `variableRadiusPlugin`) are gated on `chart.canvas.id === 'donut'` so they only touch the category pie, not the cumulative line. Custom callouts are drawn in Chart.js `layout.padding` — the pie renders at `radius:'90%'` inside a 380px-tall container with L/R padding for label room.

**Potential next tie-in:** surface the shared daily-summary block ("today so far vs average") at the top of the dashboard, reusing the digest logic.

---

## 4. Status

### What's Done ✅

**Bot:**
- Webhook receiving text/photos/documents; OpenAI extraction (text + vision); Income vs Expense classification
- Deployed on Railway; UID auto-generated per entry
- **Pipeline 1 (Multi-user) — FULLY COMPLETE.** Phases 1–4 all done and validated end-to-end (link generation, per-user dashboard filtering, dashboard-side writes attribute to col H). Allow-list via ALLOWED_USERS.
- **Pipeline 2 Phase 1 & 2 — DONE.** Array-return schema (multi-entry, multi-day, quantity math, bill-split, relative dates, currency normalization) + validation/sanitization layer (fix-quietly/drop-loudly), unit-tested.
- **Pipeline 2 Phase 3 — DONE.** Analytics commands cut; bot repositioned capture+glance+push; all replies in ledger tone; 10pm KL daily digest (Python-only, zero OpenAI cost); `/run-digest` test endpoint.

**Dashboard:** Full Home + Analytics tabs; GViz date fix; month selector; dark mode; animated counters; Apps Script add/edit/delete; FAB + modal (liquid glass); M3 Expressive layer; strict per-user filtering.
- **UX refresh (2026-07-11) — DONE.** Home Net Balance hero card (privacy toggle + 6-mo mini trend) + income/expense tiles + txn category icon chips; Analytics spend card with month-pace "Today" marker, solid variable-radius pie w/ on-slice %s + callouts (replaced donut + Category Breakdown), unified mobile centering. Shared `tile-block` system across both tabs; dead `.metric`/`.crystal-ball` CSS removed. See §3a. Shipped via PRs #6 + #7.

### What's Pending ❌
- **Stress test (in progress):** run the bot 1 month on Railway Free tier with 3 users to see if it fits within the $1/mo credit + 0.5 GB RAM ceiling. Deferred until after this: (a) RAM logging on boot/post-digest, (b) Railway billing alert at ~$0.80. Decision after test: stay Free / upgrade Hobby ($5/mo) / migrate.
- Pipeline 2 Phase 4: validation test suite (multi-day backdate, split-bill photo)
- Correction handling ("actually make that RM20" → edit last entry, not new row) — not yet built; fits the "natural human input" goal
- Dashboard: export function; surface shared daily-summary block
- Decide: Railway vs Render/Fly/other hosting (tied to stress-test result)

---

## 5. Cost & Sustainability (assessed 2026-07-11)

- **OpenAI ($5 budget):** ~$0.00018/text entry (gpt-4o-mini). 3 users × 3 entries/day ≈ 270 calls/mo ≈ **$0.05/mo**. Photos ~$0.002–0.004 each. Digest is Python-only (no cost). Redirecting analytics questions removed another OpenAI path. **Realistic total < $0.50/mo → $5 lasts ~10+ months. Non-issue.**
- **Railway (the real constraint):** Free tier is now a 30-day $5 trial, then a **$1/mo Free plan** (1 vCPU, 0.5 GB RAM, 1 project). An always-on webhook + in-process scheduler lives right at that $1 ceiling with no margin; credits running out = container stops mid-cycle with no warning. Hobby is $5/mo. **This is what the month-long stress test is measuring.**
- Cost-free scheduling fallback if Railway is too tight: external cron pinger (cron-job.org) → `/run-digest?key=8891`, letting the bot stay a plain webhook with no background thread.

---

## 6. Roadmap — Future Pipelines

**Pipeline 1: Multi-user (Option B — one bot, one sheet, User column) — ✅ FULLY COMPLETE.**

**Pipeline 2: Smarter NLP**
- Phase 1 (multi-day/repeated) ✅ DONE
- Phase 2 (bill-splitting from photos) ✅ DONE
- Phase 3 (response tone + daily digest) ✅ DONE
- Phase 4 (validation suite) — pending

**Candidate next features:**
- Correction handling (edit last entry from "actually make that RM20") — needs last-UID-per-chat_id memory
- Dashboard export function
- Dashboard: shared daily-summary block reusing digest logic

---

## 7. Key Learnings & Principles

- **Array-return schema** is the unlock: one prompt change (always return a list) handles single/multi-entry/multi-day/split with one Python append loop — no separate code paths.
- **Validation philosophy: fix quietly, drop loudly.** Silent coercion for anything fixable (currency noise, off-list category, bad date), visible drops only for genuinely unwritable rows. Keeps natural input frictionless without writing garbage.
- Prompt-driven logic (dates, splits) needs **real-world eyeballing** — unit tests can't cover the LLM's reasoning, only the Python guardrails around it.
- **Ledger tone**: numbers lead, one status word carries judgment, deliberate format-break for empty states. Monospace alignment in Telegram needs HTML `<pre>` + `parse_mode`, and `&<>` escaping inside the block.
- **Bot = capture + push; dashboard = pull/visual.** Cutting redundant analytics commands sharpened the mental model and cut OpenAI paths.
- **Digest as Python-only** (sheet math, no LLM) keeps it free and instant — reusable as one source of truth across push + pull surfaces.
- `tzdata` must be in requirements for `zoneinfo` on slim Railway images.
- In-process scheduler + multiple replicas = duplicate jobs; safe only while single-instance.
- filter_by_user() empty-string fallback still critical during legacy transition.
- ALLOWED_USERS parsed at module level (not per-message); Railway env formatting has no spaces/quotes.
- /undo walks raw sheet rows (not filtered) for correct deletion index.

**Dashboard UX (2026-07-11 vibe session):**
- **Steal patterns, not palettes.** Finance-app refs gave the *structure* (hero card w/ mini-chart, on-slice pie %s, income/expense pills); reskinning them into Alfred's existing tokens kept one coherent system instead of a purple-on-white transplant.
- **One shared component beats per-tab cards.** Migrating Home + Analytics onto `tile-block` let dead `.metric`/`.crystal-ball` CSS be deleted outright — consistency + less code in one move.
- **A metric is more useful paired with its baseline.** The spend bar only became meaningful once the "Today" month-pace marker gave it something to be read *against* (spent-vs-time), not just a raw %.
- **Variable-radius pie needs restraint.** Scaling slice radius by share (`0.92 + 0.08×share`) hints hierarchy; the first pass (`0.72 + 0.28`) made one dominant category visibly lopside the circle.
- **Chart.js custom canvas draws (on-slice labels, callouts, variable radius, center text) must be gated by `canvas.id`** — an ungated plugin bleeds onto every chart on the page.
- **Always eyeball mobile widths, not just desktop.** The "right-drift" was tiles going full-width while charts stayed `max-width`-capped between 480–768px — invisible on desktop, obvious on a phone. Screenshotted at 390 / 600 / 900 to confirm.
- **Render-to-verify loop:** local `python3 -m http.server` + Playwright (mock the GViz response, serve Chart.js locally since the CDN is proxy-blocked) → screenshot at multiple widths & both themes before committing.
