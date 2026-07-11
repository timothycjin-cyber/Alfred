# CLAUDE.md

---

## What This Repo Does
A single-file HTML dashboard (`index.html`) hosted on GitHub Pages. It reads transaction data from the Project Alfred Google Sheet (published as a GViz JSON endpoint) and visualises spending and income. No backend — pure client-side HTML/CSS/JS.

---

## Live URL
`https://timothycjin-cyber.github.io/alfred-dashboard/`

---

## How Data Is Read (Read Path)
```
Google Sheet (Sheet1)
  → Published GViz endpoint (no auth required, public read)
  → fetch() in index.html
  → Parsed and rendered client-side
```

**GViz URL pattern:**
```
https://docs.google.com/spreadsheets/d/19_C3gFlY7hDjGm87k3Uke63_Tgg6TQPl6xLiGZvuEis/gviz/tq?tqx=out:json&sheet=Sheet1
```

**Sheet columns (Sheet1, zero-indexed):**
| Index | Column | Notes |
|---|---|---|
| 0 | Date | Format: `Date(YYYY,M,D)` from GViz (month is 0-indexed) — parsed in JS |
| 1 | Amount (MYR) | Numeric |
| 2 | Category | String |
| 3 | Description | String |
| 4 | Source | `telegram` or `telegram-image` |
| 5 | Type | `Expense` or `Income` |
| 6 | UID | Short unique ID — 12-char hex (e.g. `mqx393vfm58v`) |

> ⚠️ Date parsing quirk: GViz returns dates as `Date(2026,5,28)` — month is **0-indexed**. JS parser adds +1 when formatting to `YYYY-MM-DD`. This is a known source of off-by-one bugs.

---

## How Data Is Written (Write Path)
```
Dashboard (index.html)
  → fetch() POST to Google Apps Script Web App URL
  → Apps Script appends / edits / deletes row in Sheet1

Telegram Bot (main.py)
  → gspread writes directly to Sheet1
  → Generates its own UID via Python uuid library
```

**Apps Script:** attached to the Google Sheet via Extensions → Apps Script.
**Deployment:** Published as a Web App (Execute as: Me, Access: Anyone).
**Web App URL:** `https://script.google.com/macros/s/AKfycbzxRLfHCAbCspXIWSRt1xVAbLnNPlhiHHaWpTHGB23N1wkoMU74nHifMT9prU3rM4m6/exec`
**Secret key:** `8891` (passed as `key` field in POST body)

---

## Stack
| Layer | Tool |
|---|---|
| Hosting | GitHub Pages (static) |
| Charts | Chart.js 4.4.1 (CDN) |
| Data read | GViz JSON endpoint (public, no auth) |
| Data write | Google Apps Script Web App (POST) |
| Auth for writes | Shared secret — `key: "8891"` in POST body |

---

## Key JS Variables in `index.html`
| Variable | What it holds |
|---|---|
| `SHEET_ID` | Google Sheet ID |
| `SHEET_URL` | Full GViz fetch URL |
| `allRows` | All parsed rows from Sheet, each row now includes `UID` field |
| `activeMonth` / `activeYear` | Currently selected month filter |
| `currentView` | `'home'` or `'analytics'` |
| `donutChart` / `lineChart` | Chart.js instances (destroyed and recreated on tab switch) |
| `CAT_COLORS` | Colour map keyed by category name |

---

## UI Structure
```
Header (sticky)
  → Title: "Project Alfred"
  → Month dropdown (last 6 months)
  → Refresh button

Floating Nav Pill (fixed bottom)
  → Home tab | Analytics tab
  → Sliding indicator

Home View
  → 3 metric cards: Income | Expenses | Net Balance
  → Transaction timeline grouped by date
  → Each date group has a "Spent this day" footer row

Analytics View
  → 2 metric cards: Daily Burn Rate | Forecasted EOM Spend
  → Cumulative Spend line chart (this month vs last month)
  → Expenses by Category donut chart
  → Category Breakdown horizontal bar list
```

---

## What's Done ✅
- Full read-only dashboard working (Home + Analytics tabs)
- GViz date parsing bug fixed (`Date(Y,M,D)` → correct `YYYY-MM-DD`)
- Income vs Expense classification in timeline and metrics
- Month selector (last 6 months)
- Dark mode support
- Animated number counters
- Cumulative spend line chart (this month vs last month comparison)
- Donut chart + category breakdown bars
- UID column G added to Sheet1
- Apps Script deployed and tested — `add` action confirmed working
- `index.html` updated to read UID from GViz col index 6 into `allRows`
- Row identification problem solved via Option B (UID)
- - main.py updated with UUID generation — bot entries now write UID to col G automatically

---

## What's Pending ❌

### 1. Floating Action Button (FAB) — New Entry
- [ ] "+" button fixed to bottom-right corner
- [ ] Opens a modal with fields: Date, Amount, Category, Description, Type (Expense/Income)
- [ ] On submit → POST to Apps Script with `action: "add"` and `key: "8891"`
- [ ] On success → refresh data via `init()`

### 2. Edit / Delete per Transaction Row
- [ ] Tap a transaction row → opens edit modal pre-filled with that row's data
- [ ] Edit: POST to Apps Script with `action: "edit"`, `uid`, and updated fields
- [ ] Delete: POST to Apps Script with `action: "delete"` and `uid`

---

## Apps Script (Deployed — DO NOT REDEPLOY UNLESS CHANGES MADE)
Full script is live. Key functions:
- `doPost(e)` — routes `add`, `edit`, `delete` actions
- `handleAdd()` — appends row, auto-generates UID via `generateUID()`
- `handleEdit()` — finds row by UID, updates fields (leaves Source + UID unchanged)
- `handleDelete()` — finds row by UID, deletes entire row
- `backfillUIDs()` — one-time manual function to add UIDs to existing rows (run from editor only)
- `findRowByUID()` — scans col G for matching UID, returns row index
- `generateUID()` — `Date.now().toString(36) + random` — short alphanumeric

> ⚠️ If you ever need to update the Apps Script, click **Deploy → Manage deployments → Edit** and create a new version. Do NOT create a new deployment — it gives a different URL.

