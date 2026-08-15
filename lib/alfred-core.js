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
    formatCurrency: formatCurrency,
    hexToRgba: hexToRgba,
    escapeHtml: escapeHtml,
    csvEscape: csvEscape
  };
});
