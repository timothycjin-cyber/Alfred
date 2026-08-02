# Alfred 📊

**Project Alfred** — a personal budget tracker web app. Log expenses in natural language or by snapping a receipt, track them against the month's budget, and see where the money goes.

🔗 **Live:** https://timothycjin-cyber.github.io/alfred-dashboard/

---

## What It Does

**Capture** — type "lunch RM15" (or "coffee RM3 last 3 days", "dinner RM60 my share 50%") or snap a receipt photo; the entry is parsed with AI and pre-filled for you to confirm before it's saved. Nothing is written without confirmation.

**Today tab** — "Budget left" hero with a 6-month trend, budget/expense tiles, a today-at-a-glance line, and a live budget-pace bar with avg-daily and forecast figures.

**Logs tab** — the full ledger as a week-by-week accordion under month headers, with spend bars, tap-to-edit entries, CSV export, and recurring entries (rent, subscriptions, salary) that log themselves on schedule.

**Trends tab** — an AI-phrased "What I noticed" insights note, month navigation with an archive of past months, a "Spending patterns" calendar tinted by spend per day, a category breakdown pie, and cumulative spend vs last month.

**Installable** — a PWA you can add to your home screen.

---

## Architecture

Fully serverless and free to run:

- **Frontend** — plain HTML/CSS/JS (single file), Chart.js, hosted on GitHub Pages
- **Data** — one Google Sheet, read via the public GViz JSON endpoint
- **Backend** — the Sheet's own Google Apps Script Web App (`apps-script/Code.gs`): transaction writes, AI parsing (OpenAI), and insights phrasing

(Historical note: capture originally happened through a Telegram bot — [Project-Alfred](https://github.com/timothycjin-cyber/Project-Alfred), decommissioned 2026-07-16 once this app covered everything it did. Rows it wrote remain in the Sheet.)

---

## Status

| Feature | Status |
|---|---|
| Today · Logs · Trends dashboards | ✅ Done |
| Multi-user support (per-user filtering) | ✅ Done |
| Add / edit / delete entries (optimistic writes) | ✅ Done |
| CSV export | ✅ Done |
| AI insights strip | ✅ Done |
| Chat + camera capture with confirm flow | ✅ Done |
| Installable PWA | ✅ Done |
| Subscriptions category | ✅ Done |
| Nightly push digest | ⬜ Retired — the digest math lives on as the Today glance line |
| Recurring expenses | ✅ Done |
