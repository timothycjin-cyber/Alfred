/* Project Alfred — pure core.
 *
 * Everything in here is deterministic: no DOM, no fetch, no clock read, no
 * module state. "Today" is always passed in. That is what makes it loadable by
 * `node --test` (see test/alfred-core.test.js) while index.html still consumes
 * it as an ordinary classic script.
 *
 * Loaded from index.html by a plain <script src> BEFORE the inline block, so
 * every name below is a global by the time the app's own script runs. Do not
 * add `defer` — same reason the Chart.js tag can't have it (CLAUDE.md §6).
 *
 * The rule for this file: if a function needs the DOM, a network call or the
 * wall clock, it belongs in index.html, not here.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;   // node --test
  else Object.assign(root, api);                                            // browser globals
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // Shared with index.html, which no longer declares its own copy.
  var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  // ── Dates ──────────────────────────────────────────────────────────────────

  // THE canonical way to turn a row's stored date into a Date object.
  //
  // `new Date("2026-08-01")` parses as UTC midnight, but every getter the app
  // reads it with (getMonth, getDate, getFullYear) is local — so west of UTC
  // that row lands on July 31 and gets counted in the wrong month, while
  // rendering as "Aug 1" via the local-midnight parse used for display. The two
  // idioms only agree east of UTC, which is why this went unnoticed.
  //
  // Appending T00:00:00 forces a LOCAL-midnight parse, so bucketing and display
  // agree in every timezone. Never call `new Date(row.Date)` directly.
  function parseRowDate(iso) {
    if (iso instanceof Date) return iso;
    var s = String(iso == null ? '' : iso).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return new Date(s + 'T00:00:00');
    return new Date(s);   // defensive: anything not plain-ISO falls back
  }

  function isoDateOf(d) {
    var pad = function (n) { return String(n).padStart(2, '0'); };
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  // GViz hands dates back as Date(YYYY,M,D) with the month 0-INDEXED, hence the
  // +1. Known off-by-one bug source; shared by both tabs' mappers.
  function gvizDateToIso(rawDate) {
    if (typeof rawDate === 'string' && rawDate.includes('Date')) {
      var dateParts = rawDate.replace("Date(", "").replace(")", "").split(",");
      return dateParts[0] + '-' +
        String(Number(dateParts[1]) + 1).padStart(2, "0") + '-' +
        String(dateParts[2]).padStart(2, "0");
    }
    return String(rawDate).replace(/^'/, "");
  }

  function daysInMonthOf(year, month) { return new Date(year, month + 1, 0).getDate(); }

  // ── Logs weeks ─────────────────────────────────────────────────────────────

  // The month-clipped week a date belongs to. Keyed on startIso by callers —
  // it identifies the week AND the month, which a bare Monday no longer can.
  function weekSpanFor(iso) {
    var d = parseRowDate(iso);
    var y = d.getFullYear(), m = d.getMonth();
    // Mon=0 … Sun=6; a negative/overflowing day-of-month normalizes into the
    // adjacent month on its own.
    var monday = new Date(y, m, d.getDate() - ((d.getDay() + 6) % 7));
    var sunday = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 6);
    var first = new Date(y, m, 1);
    var last = new Date(y, m + 1, 0);
    return {
      y: y, m: m,
      startIso: isoDateOf(monday < first ? first : monday),
      endIso: isoDateOf(sunday > last ? last : sunday)
    };
  }

  function weekRangeLabel(w) {
    var a = parseRowDate(w.startIso);
    var b = parseRowDate(w.endIso);
    return w.startIso === w.endIso
      ? MONTHS[a.getMonth()] + ' ' + a.getDate()
      : MONTHS[a.getMonth()] + ' ' + a.getDate() + ' – ' + b.getDate();
  }

  // One slot per day in the clipped span, carrying that day's expense total.
  // Income never enters a column — the chart is a spend chart, same as the week
  // total printed beside it.
  function weekDaySlots(w, rows) {
    var spend = {};
    rows.forEach(function (r) {
      if (r.Type !== 'Income') spend[r.Date] = (spend[r.Date] || 0) + r.Amount;
    });
    var out = [];
    var cur = parseRowDate(w.startIso);
    var endMs = parseRowDate(w.endIso).getTime();
    while (cur.getTime() <= endMs) {
      var iso = isoDateOf(cur);
      out.push({ iso: iso, dow: (cur.getDay() + 6) % 7, date: cur.getDate(), spend: spend[iso] || 0 });
      cur.setDate(cur.getDate() + 1);
    }
    return out;
  }

  // ── Recurring series (Phase G) ─────────────────────────────────────────────

  // Occurrence UIDs are DERIVED, not random: the same occurrence computes to the
  // same UID on every device, which is what makes generation idempotent.
  function recurringUID(seriesId, iso) {
    return 'rc-' + seriesId + '-' + iso.replace(/-/g, '');
  }

  // The guard here is a runaway-loop bound, NOT the write cap: enumeration has
  // to be able to walk all the way to today, or a daily series older than the
  // write cap would only ever re-propose its oldest occurrences (all already
  // written) and never reach the present. Writes are capped separately, in
  // materializeRecurring().
  var RECURRENCE_MAX_ITER = 4000;   // ~11 years of daily, cheap to walk

  // Enumerate every occurrence from StartDate up to and including todayIso (or
  // EndDate, whichever lands first). Pure — no I/O, no clock read — so the
  // verification pass can drive it at any simulated "today".
  function recurrenceDates(series, todayIso) {
    var out = [];
    var start = series.startDate;
    if (!start || start > todayIso) return out;
    var stop = (series.endDate && series.endDate < todayIso) ? series.endDate : todayIso;

    var sd = parseRowDate(start);
    if (isNaN(sd.getTime())) return out;

    if (series.cadence === 'daily' || series.cadence === 'weekly') {
      var step = series.cadence === 'daily' ? 1 : 7;
      var d = new Date(sd.getTime());
      for (var i = 0; i < RECURRENCE_MAX_ITER; i++) {
        var iso = isoDateOf(d);
        if (iso > stop) break;
        out.push(iso);
        d.setDate(d.getDate() + step);
      }
      return out;
    }

    // Monthly: hold the anchor day-of-month, clamped to each month's last day so
    // a series anchored on the 31st still fires in November and February rather
    // than skipping those months entirely.
    var anchorDay = sd.getDate();
    var y = sd.getFullYear();
    var m = sd.getMonth();
    for (var j = 0; j < RECURRENCE_MAX_ITER; j++) {
      var day = Math.min(anchorDay, daysInMonthOf(y, m));
      var miso = isoDateOf(new Date(y, m, day));
      if (miso > stop) break;
      if (miso >= start) out.push(miso);
      m++;
      if (m > 11) { m = 0; y++; }
    }
    return out;
  }

  function cadenceLabel(series) {
    if (series.cadence === 'daily') return 'Every day';
    if (series.cadence === 'weekly') {
      var d = parseRowDate(series.startDate);
      var wd = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][d.getDay()];
      return 'Weekly on ' + wd;
    }
    var day = parseRowDate(series.startDate).getDate();
    var suffix = (day % 10 === 1 && day !== 11) ? 'st'
      : (day % 10 === 2 && day !== 12) ? 'nd'
        : (day % 10 === 3 && day !== 13) ? 'rd' : 'th';
    return 'Monthly on the ' + day + suffix;
  }

  // The unwritten preview — what's coming, without polluting the ledger's math.
  // Computed analytically rather than by enumerating from the start date, so it
  // stays O(1) no matter how old the series is.
  //
  // INVARIANT (asserted as a property test): this must always equal the first
  // date after todayIso that recurrenceDates() would enumerate. Two independent
  // implementations of one schedule — keep them in step.
  function nextOccurrence(series, todayIso) {
    if (!series.active || !series.startDate) return null;

    var withinEnd = function (iso) { return !(series.endDate && iso > series.endDate) ? iso : null; };
    if (series.startDate > todayIso) return withinEnd(series.startDate);

    var sd = parseRowDate(series.startDate);
    var today = parseRowDate(todayIso);
    if (isNaN(sd.getTime()) || isNaN(today.getTime())) return null;
    var next;

    if (series.cadence === 'daily') {
      next = new Date(today.getTime());
      next.setDate(next.getDate() + 1);
    } else if (series.cadence === 'weekly') {
      // round, not floor — absorbs any DST hour drift in the day count
      var elapsed = Math.round((today - sd) / 86400000);
      next = new Date(sd.getTime());
      next.setDate(next.getDate() + (Math.floor(elapsed / 7) + 1) * 7);
    } else {
      var anchorDay = sd.getDate();
      var y = today.getFullYear(), m = today.getMonth();
      var thisMonth = new Date(y, m, Math.min(anchorDay, daysInMonthOf(y, m)));
      if (isoDateOf(thisMonth) > todayIso) {
        next = thisMonth;
      } else {
        m++;
        if (m > 11) { m = 0; y++; }
        next = new Date(y, m, Math.min(anchorDay, daysInMonthOf(y, m)));
      }
    }
    return withinEnd(isoDateOf(next));
  }

  // ── Optimistic-write reconcile ─────────────────────────────────────────────

  // Content signature for reconcile — the render-visible fields an edit can move.
  // Source is deliberately NOT part of it: it isn't a field an edit can change.
  function rowSig(r) {
    return [
      r.Date,
      Math.round(Number(r.Amount) * 100),
      (r.Category || '').trim().toLowerCase(),
      (r.Description || '').trim().toLowerCase(),
      (r.Type || '').trim(),
      (r.User || '').trim()
    ].join('|');
  }

  // The merge half of reconcileFromServer, lifted out so it can be table-tested
  // without a browser. PURE: reads the two pending maps, never mutates them —
  // it reports which entries the caller should clear instead.
  //
  // De-dup is UID first, content-signature second, which is correct whether or
  // not the backend echoes the client's UID.
  function mergeRows(serverRows, pendingWrites, pendingDeletes) {
    var merged = [];
    var handledUIDs = new Set();
    var resolvedWrites = [];
    var resolvedDeletes = [];

    serverRows.forEach(function (sr) {
      if (pendingDeletes.has(sr.UID)) { handledUIDs.add(sr.UID); return; }  // deleted locally
      var pw = pendingWrites.get(sr.UID);
      if (pw) {
        handledUIDs.add(sr.UID);
        if (rowSig(sr) === rowSig(pw.row)) {   // server caught up to our write
          merged.push(sr);
          resolvedWrites.push(sr.UID);
        } else {                               // server still stale — show ours, hide its stale copy
          merged.push(pw.row);
        }
      } else {
        merged.push(sr);
      }
    });

    // Clear delete-pending the server has already dropped.
    pendingDeletes.forEach(function (uid) {
      if (!serverRows.some(function (r) { return r.UID === uid; })) resolvedDeletes.push(uid);
    });

    // Optimistic rows with no matching server UID: either the server saved them
    // under its own UID (backend not echoing ours) — detect by signature and drop
    // the dup — or GViz simply hasn't surfaced them yet — keep showing them.
    var sigCount = new Map();
    merged.forEach(function (m) {
      var s = rowSig(m);
      sigCount.set(s, (sigCount.get(s) || 0) + 1);
    });
    pendingWrites.forEach(function (pw, uid) {
      if (handledUIDs.has(uid)) return;
      var s = rowSig(pw.row);
      if ((sigCount.get(s) || 0) > 0) {        // already represented under another UID
        sigCount.set(s, sigCount.get(s) - 1);
        resolvedWrites.push(uid);
      } else {
        merged.push(pw.row);                   // GViz lag — retain optimistic row
      }
    });

    return { rows: merged, resolvedWrites: resolvedWrites, resolvedDeletes: resolvedDeletes };
  }

  // ── Spend shape: median daily, big-day buffer, calibrated forecast ─────────
  //
  // Spend is right-skewed: most days cluster low, two or three big days a month
  // sit far out. A mean over that tail is not a typical day, and projecting it
  // across the month overstates month-end. So NORMAL SPEND AND BIG SPEND ARE
  // MODELLED SEPARATELY — one median for the ordinary days, one buffer for the
  // outliers, never one blended average.
  //
  // Source of truth for the constants and the fallbacks below:
  // SPEC_MEDIAN_FORECAST_20260831, decisions D1–D9 (recorded in CLAUDE.md §6).

  var BIG_DAY_PERCENTILE = 0.9;      // D4 — self-adjusting, no user-set threshold
  var BUFFER_HISTORY_MONTHS = 3;     // D5
  var MEDIAN_MIN_DAY = 8;            // D7 — a median over <8 samples is unstable
  var MEDIAN_MIN_SPEND_DAYS = 3;
  var DISTRIBUTION_BUCKETS = 14;     // spec §6 — 12–16 across the observed range

  // Linear-interpolated percentile over an ASCENDING-SORTED array.
  //
  // ⚠️ Interpolation, not nearest-rank. On the small samples this runs over — a
  // month of spending days is often 10–20 values — nearest-rank makes P90 jump
  // visibly from one day to the next, which moves the median (D3 cuts at P90)
  // and therefore the forecast, for no reason the user can see.
  function percentileOf(sortedAsc, p) {
    var n = sortedAsc.length;
    if (!n) return 0;
    if (n === 1) return sortedAsc[0];
    var rank = (n - 1) * p;
    var lo = Math.floor(rank), hi = Math.ceil(rank);
    if (lo === hi) return sortedAsc[lo];
    return sortedAsc[lo] + (sortedAsc[hi] - sortedAsc[lo]) * (rank - lo);
  }

  function medianOf(values) {
    return percentileOf(values.slice().sort(function (a, b) { return a - b; }), 0.5);
  }

  // Expense rows → a DENSE per-day array for one month, index 0 = day 1.
  //
  // Dense is the point: the ZERO days are what spendDayRate counts against, so a
  // sparse map keyed by date would silently drop the denominator. `upToDay`
  // clips to the elapsed part of a live month — never past it, since a
  // future-dated row would otherwise add a day the month has not reached.
  //
  // Rows are pre-filtered by the caller (user + expense); this only buckets.
  function dailyTotals(rows, year, month, upToDay) {
    var len = daysInMonthOf(year, month);
    if (upToDay != null) len = Math.max(0, Math.min(len, upToDay));
    var out = [];
    for (var i = 0; i < len; i++) out.push(0);
    (rows || []).forEach(function (r) {
      if (!r || !r.Date || !r.Amount) return;
      var d = parseRowDate(r.Date);   // never new Date(r.Date) — CLAUDE.md §1
      if (d.getFullYear() !== year || d.getMonth() !== month) return;
      var idx = d.getDate() - 1;
      if (idx < 0 || idx >= len) return;
      out[idx] += r.Amount;
    });
    return out;
  }

  // The shape of one window of daily totals.
  //
  // D2: zero-spend days are excluded from spendDays — the metric means "a
  // typical SPENDING day", and the zeros would drag a median toward 0.
  // D3: the median is taken over days at or below P90 only. Without that cut,
  // the big days are inside the median AND inside the buffer, and the forecast
  // counts them twice.
  function spendProfile(elapsed) {
    var days = elapsed || [];
    var total = days.reduce(function (s, v) { return s + v; }, 0);
    var spendDays = days.filter(function (v) { return v > 0; })
      .sort(function (a, b) { return a - b; });
    var p90 = percentileOf(spendDays, BIG_DAY_PERCENTILE);
    var normalDays = spendDays.filter(function (v) { return v <= p90; });
    var bigDays = spendDays.filter(function (v) { return v > p90; });
    return {
      total: total,
      spendDays: spendDays,
      spendDayRate: days.length ? spendDays.length / days.length : 0,
      p90: p90,
      normalDays: normalDays,
      bigDays: bigDays,
      medianDaily: medianOf(normalDays),
      meanDaily: days.length ? total / days.length : 0,
      // ⚠️ Two different averages, and they are not interchangeable.
      // meanDaily divides by CALENDAR days (what the Today tile calls "Average
      // Daily" in mean mode); spendDayMean divides by SPENDING days, which is
      // the like-for-like partner to the median and the one the distribution
      // card draws. Multiplying spendDayMean by calendar days is the D8 trap.
      spendDayMean: spendDays.length
        ? spendDays.reduce(function (s, v) { return s + v; }, 0) / spendDays.length
        : 0
    };
  }

  // What a month's big days have historically cost, per month.
  //
  // Derived from the trailing history POOLED, not the current month (D5) — the
  // live month's own big days may not have happened yet, and the ones that have
  // are already inside spentSoFar. Under three months of history there is no
  // buffer at all: 0, no error, no warning banner (spec §5).
  function monthlyBigDayBuffer(historyDays, monthCount) {
    if (!historyDays || !historyDays.length) return 0;
    if (!(monthCount >= BUFFER_HISTORY_MONTHS)) return 0;
    var prof = spendProfile(historyDays);
    var sum = prof.bigDays.reduce(function (s, v) { return s + v; }, 0);
    return sum / monthCount;
  }

  // THE forecast. One function, so the Today detail tile and the pace bar's
  // overspend flip can never disagree about whether the month is overspending.
  //
  // input: { elapsed, history, historyMonths, daysInMonth, dayOfMonth }
  //   elapsed  — dense daily totals, day 1 → today (dailyTotals with upToDay)
  //   history  — dense daily totals for the trailing complete months, pooled
  //
  // ⚠️ D8, the unit trap: D2 makes the median a per-SPENDING-day figure, so it
  // cannot be multiplied by calendar days. The spend-day rate converts it back.
  // ⚠️ Trap #3: only the UNELAPSED fraction of the monthly buffer is added —
  // big days already logged this month are inside spentSoFar already.
  function computeSpendForecast(input) {
    var cfg = input || {};
    var elapsed = cfg.elapsed || [];
    var daysInMonth = cfg.daysInMonth || 0;
    var dayOfMonth = Math.max(0, Math.min(daysInMonth, cfg.dayOfMonth || 0));
    var remainingDays = Math.max(0, daysInMonth - dayOfMonth);
    var prof = spendProfile(elapsed);
    var buffer = monthlyBigDayBuffer(cfg.history, cfg.historyMonths || 0);
    var bufferRemaining = daysInMonth > 0 ? buffer * (remainingDays / daysInMonth) : 0;

    var out = {
      spentSoFar: prof.total,
      median: prof.medianDaily,
      mean: prof.meanDaily,
      p90: prof.p90,
      spendDayCount: prof.spendDays.length,
      buffer: buffer,
      bufferRemaining: bufferRemaining,
      daysInMonth: daysInMonth,
      dayOfMonth: dayOfMonth,
      remainingDays: remainingDays
    };

    // Nothing logged: the caller renders its zero state. Do not hand back
    // RM 0.00/day as though it were a measurement (spec §5).
    if (!(prof.total > 0)) {
      out.mode = 'empty';
      out.label = 'Average Daily';
      out.daily = 0;
      out.spendDayRate = 0;
      out.forecast = 0;
      return out;
    }

    var useMean = dayOfMonth < MEDIAN_MIN_DAY || prof.spendDays.length < MEDIAN_MIN_SPEND_DAYS;
    // Mean mode reproduces the pre-spec figures exactly when there is no buffer:
    // total + (total/d)*(D-d) === (total/d)*D. That equality is a committed test.
    out.mode = useMean ? 'mean' : 'median';
    out.label = useMean ? 'Average Daily' : 'Median Daily';
    out.daily = useMean ? prof.meanDaily : prof.medianDaily;
    // The mean already averages across ALL days, so it needs no rate. A rate of
    // 0 (possible only via a caller passing an odd window) clamps to 1, or the
    // forecast would collapse to exactly spentSoFar (spec §5).
    out.spendDayRate = useMean ? 1 : (prof.spendDayRate || 1);
    out.forecast = prof.total + out.daily * remainingDays * out.spendDayRate + bufferRemaining;
    return out;
  }

  // Histogram of spending-day amounts, for the Trends distribution curve.
  //
  // `median` here is the SAME D3 quantity the Today tile shows (median of days
  // at or below P90), so the dashed line on the curve lands on the figure the
  // tile prints. Taking a plain median of every spending day here would draw a
  // line the rest of the app disagrees with.
  function distributionBuckets(spendDayValues, bucketCount) {
    var vals = (spendDayValues || []).filter(function (v) { return v > 0; })
      .sort(function (a, b) { return a - b; });
    var out = { buckets: [], median: 0, spendDayMean: 0, p90: 0, min: 0, max: 0, count: vals.length };
    if (!vals.length) return out;

    out.min = vals[0];
    out.max = vals[vals.length - 1];
    // p90 is still returned — the forecast needs it — but the card no longer
    // DRAWS it: "P90" says nothing to a reader who does not already know what a
    // percentile is, where typical-day vs average-day is the finding itself.
    out.p90 = percentileOf(vals, BIG_DAY_PERCENTILE);
    out.spendDayMean = vals.reduce(function (s, v) { return s + v; }, 0) / vals.length;
    out.median = medianOf(vals.filter(function (v) { return v <= out.p90; }));

    // Every day the same amount: there is no range to spread across, and one
    // bucket holding everything is the honest answer, not a divide by zero.
    var span = out.max - out.min;
    var n = span > 0 ? (bucketCount || DISTRIBUTION_BUCKETS) : 1;
    var width = span > 0 ? span / n : 0;
    for (var i = 0; i < n; i++) {
      out.buckets.push({
        x0: out.min + width * i,
        x1: span > 0 ? out.min + width * (i + 1) : out.max,
        count: 0
      });
    }
    vals.forEach(function (v) {
      var idx = span > 0 ? Math.min(n - 1, Math.floor((v - out.min) / width)) : 0;
      out.buckets[idx].count++;
    });
    return out;
  }

  // ── Formatting / escaping ──────────────────────────────────────────────────

  function formatCurrency(num) {
    return num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function hexToRgba(hex, alpha) {
    var h = hex.replace('#', '');
    var full = h.length === 3 ? h.split('').map(function (c) { return c + c; }).join('') : h;
    var n = parseInt(full, 16);
    return 'rgba(' + ((n >> 16) & 255) + ', ' + ((n >> 8) & 255) + ', ' + (n & 255) + ', ' + alpha + ')';
  }

  // Escapes the four characters that matter inside an HTML text node or a
  // DOUBLE-quoted attribute. Every renderer that interpolates sheet data into
  // innerHTML must run it through here — the sheet's own text reaches us from
  // the capture parser, i.e. from an LLM reading a photo.
  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // A leading =, +, - or @ makes Sheets and Excel treat the cell as a FORMULA on
  // open, and this export exists to be reopened in a spreadsheet. Prefix those
  // with an apostrophe so they import as literal text.
  //
  // Plain numbers are exempt, or a negative amount would export as text and stop
  // summing — which is the whole point of the file.
  var CSV_FORMULA_LEAD = /^[=+\-@\t\r]/;
  var CSV_PLAIN_NUMBER = /^-?\d+(\.\d+)?$/;

  function csvEscape(val) {
    var s = String(val == null ? '' : val);
    if (CSV_FORMULA_LEAD.test(s) && !CSV_PLAIN_NUMBER.test(s)) s = "'" + s;
    return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  return {
    MONTHS: MONTHS,
    RECURRENCE_MAX_ITER: RECURRENCE_MAX_ITER,
    parseRowDate: parseRowDate,
    isoDateOf: isoDateOf,
    gvizDateToIso: gvizDateToIso,
    daysInMonthOf: daysInMonthOf,
    weekSpanFor: weekSpanFor,
    weekRangeLabel: weekRangeLabel,
    weekDaySlots: weekDaySlots,
    recurringUID: recurringUID,
    recurrenceDates: recurrenceDates,
    cadenceLabel: cadenceLabel,
    nextOccurrence: nextOccurrence,
    rowSig: rowSig,
    mergeRows: mergeRows,
    percentileOf: percentileOf,
    medianOf: medianOf,
    dailyTotals: dailyTotals,
    spendProfile: spendProfile,
    monthlyBigDayBuffer: monthlyBigDayBuffer,
    computeSpendForecast: computeSpendForecast,
    distributionBuckets: distributionBuckets,
    formatCurrency: formatCurrency,
    hexToRgba: hexToRgba,
    escapeHtml: escapeHtml,
    csvEscape: csvEscape
  };
});
