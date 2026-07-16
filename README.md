# Alfred 📊

**Project Alfred** — a personal finance web app. Log expenses in natural language or by snapping a receipt, see where the money goes, and get a nightly spending digest pushed to your phone.

🔗 **Live:** https://timothycjin-cyber.github.io/alfred-dashboard/

---

## What It Does

**Capture** — type "lunch RM15" (or "coffee RM3 last 3 days", "dinner RM60 my share 50%") or snap a receipt photo; the entry is parsed with AI and pre-filled for you to confirm before it's saved. Nothing is written without confirmation.

**Home tab** — net balance hero with a 6-month trend, income/expense tiles, and a transaction timeline grouped by date.

**Analytics tab** — an AI-phrased "What I noticed" insights note, spend-pace bar with a month-progress marker, cumulative spend vs last month, and a category breakdown pie.

**Push digest** — an installable PWA with a nightly (10pm) spending-summary notification via Firebase Cloud Messaging.

---

## Architecture

Fully serverless and free to run:

- **Frontend** — plain HTML/CSS/JS (single file), Chart.js, hosted on GitHub Pages
- **Data** — one Google Sheet, read via the public GViz JSON endpoint
- **Backend** — the Sheet's own Google Apps Script Web App (`apps-script/Code.gs`): transaction writes, AI parsing (OpenAI), insights phrasing, push subscriptions, and the scheduled digest
- **Push** — Firebase Cloud Messaging (free tier), sent by an Apps Script daily trigger

(Historical note: capture originally happened through a Telegram bot — [Project-Alfred](https://github.com/timothycjin-cyber/Project-Alfred), decommissioned 2026-07-16 once this app covered everything it did. Rows it wrote remain in the Sheet.)

---

## Status

| Feature | Status |
|---|---|
| Home + Analytics dashboards | ✅ Done |
| Multi-user support (per-user filtering) | ✅ Done |
| Add / edit / delete entries | ✅ Done |
| CSV export | ✅ Done |
| AI insights strip | ✅ Done |
| Chat + camera capture with confirm flow | ✅ Done |
| Installable PWA | ✅ Done |
| Nightly push digest | ✅ Done |
| Correction handling ("make that RM20") | ❌ Pending |
| Daily-summary block on Home | ❌ Pending |
