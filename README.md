# Alfred Dashboard 📊

A lightweight personal finance dashboard for **Project Alfred** — a Telegram-based expense and income tracker.

🔗 **Live:** https://timothycjin-cyber.github.io/alfred-dashboard/

---

## What It Does

Reads transaction data from a Google Sheet and visualises it in a clean mobile-first dashboard. No backend — fully static, runs in the browser.

**Home tab** — transaction timeline grouped by date, with daily spend totals and a net balance summary.

**Analytics tab** — cumulative spend chart (vs last month), category donut chart, burn rate, and end-of-month forecast.

---

## How Data Gets In

Transactions are logged via the **Alfred Telegram Bot** (separate repo) — send a text or receipt photo to the bot, and it writes a row to the Google Sheet automatically.

The dashboard reads from the sheet via Google's public GViz JSON endpoint (no authentication required).

---

## Stack

- Plain HTML / CSS / JS (single file)
- Chart.js 4.4.1
- Google Sheets (GViz endpoint for reads, Apps Script for writes — in progress)
- GitHub Pages (hosting)

---

## Related Repo

**Alfred Bot** — Telegram → OpenAI → Google Sheets pipeline
`https://github.com/timothycjin-cyber/Project-Alfred`

---

## Status

| Feature | Status |
|---|---|
| Read dashboard (Home + Analytics) | ✅ Done |
| Telegram bot logging | ✅ Done |
| Multi-user support (per-user filtering) | ✅ Done |
| Add entry from dashboard (FAB) | ✅ Done |
| Edit / Delete entries from dashboard | ✅ Done |
| NLP array schema (multi-entry, multi-day, bill-split) | ✅ Done |
| 10pm daily digest (bot) | ✅ Done |
| Dashboard export function | ❌ Pending |
| Correction handling ("make that RM20") | ❌ Pending |
