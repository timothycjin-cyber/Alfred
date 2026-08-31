# SPEC — Median Daily, Calibrated Forecast, Spend Distribution Curve

**Date:** 2026-08-31
**Status:** Approved for implementation
**Target:** Claude Code
**Scope:** Today tab (two tiles) + Trends tab (one new card)

> Design language, tokens, spacing, motion and component structure are **not** specified here.
> Follow existing project standards in `CLAUDE.md` and shipped dashboard conventions.
> This document defines **logic and behaviour only**.

---

## 1. Problem

The Today tab currently shows a simple mean of daily spend, and projects month-end by
multiplying that mean across the full month.

Observed data is **right-skewed**: most days cluster low, with 2–3 high-value days per
month. The mean is dragged upward by those days. Result: the "average daily" figure does
not represent a typical day, and the forecast systematically overstates month-end spend.

## 2. Approach

Split the two behaviours that were previously conflated:

- **Normal days** — represented by a median, not a mean.
- **Big days** — represented separately as a buffer, derived from history.

Forecast becomes the sum of both, rather than one inflated average applied uniformly.

---

## 3. Locked decisions

| # | Decision | Rationale |
|---|---|---|
| D1 | Metric is **median**, not mean | Resistant to the high-value tail |
| D2 | **Exclude zero-spend days** from the median | Zero days would drag the median toward 0; metric means "a typical spending day" |
| D3 | Median is computed from days **at or below P90 only** | Prevents double-counting: median covers normal days, buffer covers big days |
| D4 | "Big day" threshold is **P90**, self-adjusting | No user-set threshold to maintain; scales per user |
| D5 | Buffer derived from **trailing 3 months** | Enough history for stability without staleness |
| D6 | Forecast shows **one number**; buffer is not surfaced | Preserves tile simplicity and the minimal ledger voice |
| D7 | Days 1–7 fall back to the **mean**, labelled "Average Daily" | A median over <8 samples is unstable |
| D8 | Forecast must apply a **spend-day rate**, not raw remaining-day count | D2 makes the median a per-*spending*-day figure; multiplying by all days overcounts |
| D9 | Trends chart is a **smoothed distribution curve**, not a histogram of bars | Locked grammar rule: bars encode money, and here the Y axis encodes day count |

---

## 4. Calculation reference

### 4.1 Inputs

Source: `Project_Alfred` sheet, expense rows only (`Type` = expense), scoped to the
signed-in `User`.

- `elapsed[]` — daily spend totals for day 1 through today, current month
- `history[]` — daily spend totals for the trailing 3 complete months

### 4.2 Derived values

```
spendDays      = elapsed.filter(v > 0)
spendDayRate   = spendDays.length / elapsed.length

P90            = 90th percentile of spendDays        (linear interpolation)
normalDays     = spendDays.filter(v <= P90)
bigDays        = spendDays.filter(v >  P90)

medianDaily    = median(normalDays)
meanDaily      = sum(elapsed) / elapsed.length
```

### 4.3 Buffer

Computed from `history`, not the current month, per D5.

```
historyP90     = 90th percentile of history spend days
historyBigDays = history days > historyP90

bufferPerMonth = sum(historyBigDays) / 3
bufferRemaining = bufferPerMonth * (remainingDays / daysInMonth)
```

Only the unelapsed portion of the buffer is added — big days already logged this month
are already counted in `spentSoFar`.

### 4.4 Tile 1 — Median Daily

```
if (dayOfMonth < 8)  ->  label "Average Daily", value = meanDaily
else                 ->  label "Median Daily",  value = medianDaily
```

### 4.5 Tile 2 — Forecast

```
forecast = spentSoFar
         + (medianDaily * remainingDays * spendDayRate)
         + bufferRemaining
```

During days 1–7, substitute `meanDaily` for `medianDaily` and set
`spendDayRate = 1` (the mean already averages across all days).

---

## 5. Fallbacks

| Condition | Behaviour |
|---|---|
| Fewer than 3 complete months of history | Omit buffer entirely. Forecast = spent + median projection. No error, no zero, no warning banner. |
| Fewer than 3 spending days this month | Tile shows mean per D7. Trends curve shows its empty state. |
| Zero transactions this month | Tiles show the existing zero/empty state. Do not render `RM 0/day` as if it were a measurement. |
| `spendDayRate` resolves to 0 | Clamp to 1. Prevents a forecast of exactly `spentSoFar`. |

New users (brothers) will hit the first two rows. These paths must be verified, not assumed.

---

## 6. Trends — spend distribution card

**Placement:** directly below the existing spending patterns table.

**Content:**
- X axis: daily spend amount, bucketed. 12–16 buckets across the observed range.
- Y axis: count of days falling in each bucket. Axis itself need not be labelled.
- Rendered as a smoothed filled area curve.
- Two dashed vertical reference lines: **Median** and **P90**, each labelled with its value.
- Scope: current month, matching the Logs month-scoping convention already shipped.

**Purpose:** make the skew legible. This card is the visual explanation for why the
Today tile changed. It is not a standalone analytic.

**Empty state:** fewer than 3 spending days in scope — show a short line of copy, no axes,
no partial curve.

---

## 7. Acceptance criteria

- [ ] Today tile 1 reads "Median Daily" from day 8; "Average Daily" on days 1–7
- [ ] Zero-spend days are excluded from the median calculation
- [ ] Days above P90 are excluded from the median calculation
- [ ] Forecast applies `spendDayRate`; it does not multiply the median by every remaining day
- [ ] Buffer derives from trailing 3 months, and only the unelapsed portion is added
- [ ] Forecast renders as a single figure; the buffer is not shown or labelled
- [ ] Overspend state (forecast > budget) still triggers correctly against the new figure
- [ ] Accounts with <3 months of history render a forecast with no buffer and no error
- [ ] Trends curve renders below the spending patterns table with median and P90 marked
- [ ] Trends curve empty state renders at <3 spending days
- [ ] Playwright: 390px and 900px, light and dark, both tabs
- [ ] `REDUCED_MOTION` respected on any curve entrance animation
- [ ] `overflow-x: clip` holds; tap targets remain ≥44px

---

## 8. Known traps

1. **Double-counting big days.** If the median is taken across all spending days and a
   buffer is then added, big days are counted twice. D3 resolves this — do not skip it.
2. **Unit mismatch in the forecast.** D2 makes the median a per-spending-day figure. It
   cannot be multiplied by calendar days. D8 resolves this — do not skip it.
3. **Buffer double-count within the month.** Big days already logged sit inside
   `spentSoFar`. Only the remaining fraction of the monthly buffer may be added.
4. **Percentile method.** Use linear interpolation consistently. Nearest-rank on small
   samples produces visibly jumpy P90 values day to day.
5. **The overspend glow will fire less often.** The new forecast is lower than the old
   one. This is the intended correction, not a regression. Do not recalibrate the
   threshold to compensate.
6. **The curve is not a bell curve.** The data is right-skewed. Do not fit or force a
   symmetric normal distribution — the asymmetry is the finding.

---

## 9. Sequencing

1. Calculation layer — percentile helper, median, buffer, spend-day rate
2. Today tiles — labels, values, fallbacks
3. Trends distribution card
4. Playwright matrix
5. `CLAUDE.md` update

Step 3 depends on step 1. Shipping the curve before the tiles would display numbers that
contradict the Today tab.

---

## 10. `CLAUDE.md` update requirement

On completion, record in `CLAUDE.md`:

- Decisions **D1–D9** as locked, with this spec cited as the source
- The calculation reference from section 4, as the canonical definition of "Median Daily"
  and "Forecast"
- The new principle: **normal spend and big spend are modelled separately** — one median,
  one buffer, never one blended average
- Confirmation that the Trends distribution card is a distribution view (Y = day count)
  and is a stated exception to the *bars = money* rule, resolved by not using bars
