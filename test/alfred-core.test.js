/* Regression tests for lib/alfred-core.js.
 *
 *   node --test test/
 *
 * No dependencies, no package.json, no build step.
 *
 * Run it under at least two timezones — one east of UTC, one west — or the
 * whole date-parsing class of bug is invisible:
 *
 *   TZ=Asia/Kuala_Lumpur node --test test/
 *   TZ=America/New_York  node --test test/
 *
 * (test/run.sh does both.) Alfred's owner is at UTC+8, which is exactly why the
 * bare `new Date("2026-08-01")` parse survived in 19 places: east of UTC it
 * agrees with the local-midnight parse used for display, and west of UTC it
 * silently files the row under the previous month.
 */

const test = require('node:test');
const assert = require('node:assert');
const core = require('../lib/alfred-core.js');

const {
  parseRowDate, isoDateOf, gvizDateToIso, daysInMonthOf,
  weekSpanFor, weekRangeLabel, weekDaySlots,
  recurringUID, recurrenceDates, cadenceLabel, nextOccurrence,
  rowSig, mergeRows, csvEscape, escapeHtml, formatCurrency, hexToRgba,
  percentileOf, medianOf, dailyTotals, spendProfile, monthlyBigDayBuffer,
  computeSpendForecast, distributionBuckets
} = core;

const TZ = process.env.TZ || '(system default)';

const row = (over = {}) => Object.assign({
  Date: '2026-08-03', Amount: 10, Category: 'Food & Dining',
  Description: 'lunch', Type: 'Expense', UID: 'u1', User: '42', Source: 'web'
}, over);

// ── Dates ────────────────────────────────────────────────────────────────────

test(`parseRowDate is timezone-stable [TZ=${TZ}]`, () => {
  // The whole point: these must hold in EVERY timezone, which `new Date(iso)`
  // does not — it parses UTC midnight and then gets read with local getters.
  const d = parseRowDate('2026-08-01');
  assert.strictEqual(d.getFullYear(), 2026);
  assert.strictEqual(d.getMonth(), 7, 'August is month index 7, in every timezone');
  assert.strictEqual(d.getDate(), 1);

  // New Year's Day is the case that also crosses a year boundary when it slips.
  const ny = parseRowDate('2026-01-01');
  assert.strictEqual(ny.getFullYear(), 2026);
  assert.strictEqual(ny.getMonth(), 0);
  assert.strictEqual(ny.getDate(), 1);
});

test('parseRowDate round-trips through isoDateOf for a full year', () => {
  const d = new Date(2026, 0, 1);
  for (let i = 0; i < 365; i++) {
    const iso = isoDateOf(d);
    assert.strictEqual(isoDateOf(parseRowDate(iso)), iso, `round-trip failed at ${iso}`);
    d.setDate(d.getDate() + 1);
  }
});

test('parseRowDate passes a Date through and tolerates junk', () => {
  const d = new Date(2026, 7, 1);
  assert.strictEqual(parseRowDate(d), d);
  assert.ok(isNaN(parseRowDate('').getTime()));
  assert.ok(isNaN(parseRowDate(null).getTime()));
});

test('gvizDateToIso corrects the 0-indexed month', () => {
  // GViz hands back Date(YYYY,M,D) with M zero-indexed — the documented
  // off-by-one source the entire data layer rests on.
  assert.strictEqual(gvizDateToIso('Date(2026,7,3)'), '2026-08-03');
  assert.strictEqual(gvizDateToIso('Date(2026,0,1)'), '2026-01-01');
  assert.strictEqual(gvizDateToIso('Date(2026,11,31)'), '2026-12-31');
  assert.strictEqual(gvizDateToIso("'2026-08-03"), '2026-08-03', 'leading quote stripped');
  assert.strictEqual(gvizDateToIso('2026-08-03'), '2026-08-03');
});

test('daysInMonthOf handles February and leap years', () => {
  assert.strictEqual(daysInMonthOf(2026, 1), 28);
  assert.strictEqual(daysInMonthOf(2024, 1), 29, '2024 is a leap year');
  assert.strictEqual(daysInMonthOf(2000, 1), 29, 'divisible by 400');
  assert.strictEqual(daysInMonthOf(1900, 1), 28, 'divisible by 100 but not 400');
  assert.strictEqual(daysInMonthOf(2026, 10), 30);
});

// ── Week clipping ────────────────────────────────────────────────────────────

test('weeks clip to the month they render under', () => {
  // Sat 1 Aug 2026 sits in the Mon 27 Jul – Sun 2 Aug week. That calendar week
  // renders TWICE, once under each month, carrying only that month's days.
  const aug = weekSpanFor('2026-08-01');
  assert.deepStrictEqual(
    { y: aug.y, m: aug.m, startIso: aug.startIso, endIso: aug.endIso },
    { y: 2026, m: 7, startIso: '2026-08-01', endIso: '2026-08-02' }
  );

  const jul = weekSpanFor('2026-07-28');
  assert.deepStrictEqual(
    { y: jul.y, m: jul.m, startIso: jul.startIso, endIso: jul.endIso },
    { y: 2026, m: 6, startIso: '2026-07-27', endIso: '2026-07-31' }
  );

  // startIso is the bucket key precisely because it identifies week AND month,
  // which a bare Monday cannot.
  assert.notStrictEqual(aug.startIso, jul.startIso);
});

test('a single-day clipped week is correct, not a bug', () => {
  // Mon 31 Aug 2026 is a Monday: its week runs into September, so August's
  // clipped copy is one day long.
  const w = weekSpanFor('2026-08-31');
  assert.strictEqual(w.startIso, '2026-08-31');
  assert.strictEqual(w.endIso, '2026-08-31');
  assert.strictEqual(weekRangeLabel(w), 'Aug 31', 'a one-day week prints a bare date');
});

test('weekSpanFor is Monday-first and never leaves its own month', () => {
  const d = new Date(2026, 0, 1);
  for (let i = 0; i < 730; i++) {
    const iso = isoDateOf(d);
    const w = weekSpanFor(iso);
    const s = parseRowDate(w.startIso), e = parseRowDate(w.endIso);

    assert.strictEqual(s.getMonth(), w.m, `${iso}: start left the month`);
    assert.strictEqual(e.getMonth(), w.m, `${iso}: end left the month`);
    assert.ok(w.startIso <= iso && iso <= w.endIso, `${iso}: not inside its own span`);
    // Either a real Monday, or clipped to the 1st.
    assert.ok(s.getDay() === 1 || s.getDate() === 1, `${iso}: start is neither Monday nor the 1st`);
    // Either a real Sunday, or clipped to the month's last day.
    assert.ok(e.getDay() === 0 || e.getDate() === daysInMonthOf(e.getFullYear(), e.getMonth()),
      `${iso}: end is neither Sunday nor month-end`);
    d.setDate(d.getDate() + 1);
  }
});

test('weekRangeLabel prints a month-local range', () => {
  assert.strictEqual(weekRangeLabel(weekSpanFor('2026-08-05')), 'Aug 3 – 9');
  assert.strictEqual(weekRangeLabel(weekSpanFor('2026-07-28')), 'Jul 27 – 31');
});

test('weekDaySlots covers the span and excludes income', () => {
  const w = weekSpanFor('2026-08-05');           // Mon 3 – Sun 9
  const slots = weekDaySlots(w, [
    row({ Date: '2026-08-03', Amount: 12 }),
    row({ Date: '2026-08-03', Amount: 8 }),      // same day, summed
    row({ Date: '2026-08-05', Amount: 40, Type: 'Income' }),  // never enters a column
    row({ Date: '2026-08-07', Amount: 5 })
  ]);

  assert.strictEqual(slots.length, 7);
  assert.strictEqual(slots[0].iso, '2026-08-03');
  assert.strictEqual(slots[0].dow, 0, 'Monday is dow 0');
  assert.strictEqual(slots[6].dow, 6, 'Sunday is dow 6');
  assert.strictEqual(slots[0].spend, 20, 'same-day rows sum');
  assert.strictEqual(slots[2].spend, 0, 'income contributes nothing');
  assert.strictEqual(slots[4].spend, 5);
});

// ── Recurring series ─────────────────────────────────────────────────────────

test('recurringUID is derived and stable', () => {
  assert.strictEqual(recurringUID('s1', '2026-08-03'), 'rc-s1-20260803');
  assert.strictEqual(recurringUID('s1', '2026-08-03'), recurringUID('s1', '2026-08-03'));
});

test('monthly recurrence clamps to month end instead of skipping', () => {
  // A series anchored on the 31st must still fire in 30-day months and in
  // February — and must return to 31 afterwards, i.e. the anchor is held, not
  // overwritten by the clamped value.
  const s = { cadence: 'monthly', startDate: '2026-01-31', active: true };
  assert.deepStrictEqual(recurrenceDates(s, '2026-06-15'), [
    '2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30', '2026-05-31'
  ]);
});

test('monthly recurrence clamps to 29 February in a leap year', () => {
  // "Today" is 1 April so the March occurrence is in range — the point of the
  // test is that the anchor returns to the 30th after February clamped it.
  const s = { cadence: 'monthly', startDate: '2024-01-30', active: true };
  assert.deepStrictEqual(recurrenceDates(s, '2024-04-01'), ['2024-01-30', '2024-02-29', '2024-03-30']);
});

test('recurrence respects start, end and today bounds', () => {
  const s = { cadence: 'weekly', startDate: '2026-08-03', endDate: '2026-08-24', active: true };
  assert.deepStrictEqual(recurrenceDates(s, '2026-09-30'), [
    '2026-08-03', '2026-08-10', '2026-08-17', '2026-08-24'
  ], 'stops at endDate');
  assert.deepStrictEqual(recurrenceDates(s, '2026-08-11'), ['2026-08-03', '2026-08-10'], 'stops at today');
  assert.deepStrictEqual(recurrenceDates(s, '2026-08-02'), [], 'future series yields nothing');
});

test('recurrence never emits a future date', () => {
  // Future-dated rows would silently corrupt avgDaily, forecast, the pace bar
  // and the patterns grid — all of which divide by ELAPSED days.
  const today = '2026-08-15';
  for (const cadence of ['daily', 'weekly', 'monthly']) {
    const dates = recurrenceDates({ cadence, startDate: '2026-01-01', active: true }, today);
    assert.ok(dates.length > 0, `${cadence} produced nothing`);
    assert.ok(dates.every(d => d <= today), `${cadence} emitted a date after today`);
  }
});

test('daily recurrence walks past RECURRING_MAX_PER_RUN to reach today', () => {
  // The iteration guard is a runaway bound, NOT the write cap. If it were the
  // write cap, an old daily series would forever re-propose only its oldest
  // (already-written) occurrences and never reach the present.
  const dates = recurrenceDates({ cadence: 'daily', startDate: '2025-01-01', active: true }, '2026-08-15');
  assert.ok(dates.length > 500, `expected the full walk, got ${dates.length}`);
  assert.strictEqual(dates[dates.length - 1], '2026-08-15', 'enumeration must reach today');
});

test('cadenceLabel reads correctly', () => {
  assert.strictEqual(cadenceLabel({ cadence: 'daily', startDate: '2026-08-03' }), 'Every day');
  assert.strictEqual(cadenceLabel({ cadence: 'weekly', startDate: '2026-08-03' }), 'Weekly on Monday');
  assert.strictEqual(cadenceLabel({ cadence: 'monthly', startDate: '2026-08-01' }), 'Monthly on the 1st');
  assert.strictEqual(cadenceLabel({ cadence: 'monthly', startDate: '2026-08-02' }), 'Monthly on the 2nd');
  assert.strictEqual(cadenceLabel({ cadence: 'monthly', startDate: '2026-08-03' }), 'Monthly on the 3rd');
  assert.strictEqual(cadenceLabel({ cadence: 'monthly', startDate: '2026-08-11' }), 'Monthly on the 11th');
  assert.strictEqual(cadenceLabel({ cadence: 'monthly', startDate: '2026-08-12' }), 'Monthly on the 12th');
  assert.strictEqual(cadenceLabel({ cadence: 'monthly', startDate: '2026-08-13' }), 'Monthly on the 13th');
  assert.strictEqual(cadenceLabel({ cadence: 'monthly', startDate: '2026-08-21' }), 'Monthly on the 21st');
});

test('nextOccurrence is inert for paused or unstarted series', () => {
  assert.strictEqual(nextOccurrence({ cadence: 'daily', startDate: '2026-01-01', active: false }, '2026-08-15'), null);
  assert.strictEqual(nextOccurrence({ cadence: 'daily', startDate: '', active: true }, '2026-08-15'), null);
  assert.strictEqual(
    nextOccurrence({ cadence: 'daily', startDate: '2026-09-01', active: true }, '2026-08-15'),
    '2026-09-01', 'a future series previews its own start date'
  );
  assert.strictEqual(
    nextOccurrence({ cadence: 'weekly', startDate: '2026-08-03', endDate: '2026-08-10', active: true }, '2026-08-15'),
    null, 'nothing left after endDate'
  );
});

// The property test. recurrenceDates (enumerated, writes the ledger) and
// nextOccurrence (analytic O(1), draws the "Next …" line) are two independent
// implementations of one schedule, and nothing held them in step before this.
test('PROPERTY: nextOccurrence === the first enumerated date after today', () => {
  const cadences = ['daily', 'weekly', 'monthly'];
  const anchors = ['2026-01-31', '2026-01-30', '2026-01-29', '2026-01-15', '2026-02-28',
                   '2024-01-31', '2024-02-29', '2025-12-31', '2026-03-08', '2026-11-01'];
  let checked = 0;

  for (const cadence of cadences) {
    for (const startDate of anchors) {
      const series = { cadence, startDate, active: true };
      const probe = parseRowDate(startDate);

      for (let step = 0; step < 40; step++) {
        const todayIso = isoDateOf(probe);
        if (todayIso >= startDate) {
          // Enumerate well past today, then take the first entry after it.
          const all = recurrenceDates(series, '2029-12-31');
          const expected = all.find(d => d > todayIso) || null;
          const actual = nextOccurrence(series, todayIso);
          assert.strictEqual(
            actual, expected,
            `${cadence} from ${startDate} at ${todayIso}: analytic said ${actual}, enumeration said ${expected}`
          );
          checked++;
        }
        probe.setDate(probe.getDate() + 9);   // 9 days: drifts across weekdays and month ends
      }
    }
  }
  assert.ok(checked > 1000, `expected a broad sweep, only checked ${checked}`);
});

test('PROPERTY: the DST spring-forward boundary does not drop an occurrence', () => {
  // Only meaningful when TZ actually observes DST; harmless otherwise.
  const s = { cadence: 'daily', startDate: '2026-03-05', active: true };
  const dates = recurrenceDates(s, '2026-03-12');
  assert.deepStrictEqual(dates, [
    '2026-03-05', '2026-03-06', '2026-03-07', '2026-03-08',
    '2026-03-09', '2026-03-10', '2026-03-11', '2026-03-12'
  ], 'a daily series must emit exactly one row per calendar day across a DST shift');
});

// ── Reconcile merge ──────────────────────────────────────────────────────────

const pw = rows => new Map(rows.map(r => [r.UID, { row: r }]));

test('rowSig ignores Source and normalizes case and spacing', () => {
  assert.strictEqual(
    rowSig(row({ Source: 'web' })),
    rowSig(row({ Source: 'recurring' })),
    'Source is not a render-visible field an edit can move'
  );
  assert.strictEqual(rowSig(row({ Description: ' Lunch ' })), rowSig(row({ Description: 'lunch' })));
  assert.notStrictEqual(rowSig(row({ Amount: 10 })), rowSig(row({ Amount: 10.01 })));
  assert.strictEqual(rowSig(row({ Amount: 10 })), rowSig(row({ Amount: 10.001 })), 'rounded to cents');
});

test('merge: a clean server read passes straight through', () => {
  const server = [row({ UID: 'a' }), row({ UID: 'b' })];
  const out = mergeRows(server, new Map(), new Set());
  assert.deepStrictEqual(out.rows.map(r => r.UID), ['a', 'b']);
  assert.deepStrictEqual(out.resolvedWrites, []);
});

test('merge: an optimistic row GViz has not surfaced is retained', () => {
  const pending = pw([row({ UID: 'new', Description: 'coffee' })]);
  const out = mergeRows([row({ UID: 'a' })], pending, new Set());
  assert.deepStrictEqual(out.rows.map(r => r.UID), ['a', 'new']);
  assert.deepStrictEqual(out.resolvedWrites, [], 'still pending — must not be cleared');
});

test('merge: the server echoing our UID resolves the write', () => {
  const mine = row({ UID: 'x', Description: 'coffee' });
  const out = mergeRows([mine], pw([mine]), new Set());
  assert.deepStrictEqual(out.rows.map(r => r.UID), ['x']);
  assert.deepStrictEqual(out.resolvedWrites, ['x']);
});

test('merge: a server row saved under ITS OWN uid de-dups by signature', () => {
  // The backend did not echo our UID. Same content, different UID — one row.
  const mine = row({ UID: 'client-uid', Description: 'coffee' });
  const theirs = row({ UID: 'server-uid', Description: 'coffee' });
  const out = mergeRows([theirs], pw([mine]), new Set());
  assert.strictEqual(out.rows.length, 1, 'a duplicated transaction is the worst outcome here');
  assert.strictEqual(out.rows[0].UID, 'server-uid');
  assert.deepStrictEqual(out.resolvedWrites, ['client-uid']);
});

test('merge: a stale server copy of our edit loses to the optimistic row', () => {
  const stale = row({ UID: 'x', Amount: 10 });
  const edited = row({ UID: 'x', Amount: 99 });
  const out = mergeRows([stale], pw([edited]), new Set());
  assert.strictEqual(out.rows.length, 1);
  assert.strictEqual(out.rows[0].Amount, 99, 'ours wins until the server catches up');
  assert.deepStrictEqual(out.resolvedWrites, [], 'still pending');
});

test('merge: an optimistic delete the cache still echoes stays hidden', () => {
  const out = mergeRows([row({ UID: 'a' }), row({ UID: 'gone' })], new Map(), new Set(['gone']));
  assert.deepStrictEqual(out.rows.map(r => r.UID), ['a']);
  assert.deepStrictEqual(out.resolvedDeletes, [], 'server still has it — keep suppressing');
});

test('merge: a delete the server has dropped is resolved', () => {
  const out = mergeRows([row({ UID: 'a' })], new Map(), new Set(['gone']));
  assert.deepStrictEqual(out.rows.map(r => r.UID), ['a']);
  assert.deepStrictEqual(out.resolvedDeletes, ['gone']);
});

test('merge: a row ANOTHER DEVICE wrote is kept', () => {
  // It is in no pending set, so it must arrive purely as a server row — this is
  // the case the harness notes warn about faking with allRows.push().
  const out = mergeRows([row({ UID: 'a' }), row({ UID: 'other-device' })], new Map(), new Set());
  assert.deepStrictEqual(out.rows.map(r => r.UID), ['a', 'other-device']);
});

test('merge: does not mutate the pending collections', () => {
  const mine = row({ UID: 'x' });
  const writes = pw([mine]);
  const deletes = new Set(['gone']);
  mergeRows([mine], writes, deletes);
  assert.strictEqual(writes.size, 1, 'merge must be pure — the caller clears');
  assert.strictEqual(deletes.size, 1);
});

// ── Escaping ─────────────────────────────────────────────────────────────────

test('escapeHtml neutralizes markup in text and double-quoted attributes', () => {
  assert.strictEqual(escapeHtml('<img src=x onerror=alert(1)>'), '&lt;img src=x onerror=alert(1)&gt;');
  assert.strictEqual(escapeHtml('a "quoted" value'), 'a &quot;quoted&quot; value');
  assert.strictEqual(escapeHtml('Ben & Jerry'), 'Ben &amp; Jerry');
  assert.strictEqual(escapeHtml('&lt;'), '&amp;lt;', 'ampersand escaped first, so no double-decode');
  assert.strictEqual(escapeHtml(null), 'null');
});

test('csvEscape follows RFC 4180', () => {
  assert.strictEqual(csvEscape('plain'), 'plain');
  assert.strictEqual(csvEscape('a,b'), '"a,b"');
  assert.strictEqual(csvEscape('say "hi"'), '"say ""hi"""');
  assert.strictEqual(csvEscape('line1\r\nline2'), '"line1\r\nline2"');
  assert.strictEqual(csvEscape(''), '');
  assert.strictEqual(csvEscape(null), '');
  assert.strictEqual(csvEscape(undefined), '');
});

test('csvEscape defuses spreadsheet formulas', () => {
  // The export exists to be reopened in Sheets or Excel, where a leading
  // =, +, - or @ is executed.
  assert.strictEqual(csvEscape('=HYPERLINK("http://x","click")'), '"\'=HYPERLINK(""http://x"",""click"")"');
  assert.strictEqual(csvEscape('=1+1'), "'=1+1");
  assert.strictEqual(csvEscape('@SUM(A1)'), "'@SUM(A1)");
  assert.strictEqual(csvEscape('+1234'), "'+1234");
});

test('csvEscape leaves real numbers alone', () => {
  // A negative amount must stay numeric or the export stops summing, which is
  // the whole point of the file.
  assert.strictEqual(csvEscape('-12.50'), '-12.50');
  assert.strictEqual(csvEscape((-12.5).toFixed(2)), '-12.50');
  assert.strictEqual(csvEscape('12.50'), '12.50');
  assert.strictEqual(csvEscape('-5'), '-5');
  assert.strictEqual(csvEscape('-not a number'), "'-not a number");
});

// ── Formatting ───────────────────────────────────────────────────────────────

test('formatCurrency always shows two decimals', () => {
  assert.strictEqual(formatCurrency(0), '0.00');
  assert.strictEqual(formatCurrency(8), '8.00');
  assert.strictEqual(formatCurrency(1234.5), '1,234.50');
  assert.strictEqual(formatCurrency(1234.567), '1,234.57');
});

test('hexToRgba expands shorthand and applies alpha', () => {
  assert.strictEqual(hexToRgba('#C2542D', 0.12), 'rgba(194, 84, 45, 0.12)');
  assert.strictEqual(hexToRgba('#fff', 1), 'rgba(255, 255, 255, 1)');
  assert.strictEqual(hexToRgba('C2542D', 0.5), 'rgba(194, 84, 45, 0.5)');
});

// ── Spend shape: median daily, big-day buffer, calibrated forecast ───────────
//
// SPEC_MEDIAN_FORECAST_20260831, decisions D1–D9. The shared fixture below is a
// deliberately right-skewed month: ten ordinary days and two big ones, over a
// 20-day elapsed window with eight zero-spend days.
//
//   spend days  10 12 14 16 18 20 22 24 26 28  300 400   (12 of 20 days → rate 0.6)
//   P90         28 + (300-28)*0.9              = 272.80
//   normal      the ten low days               → median  = 19
//   mean        890 / 20                       = 44.50
//
// The gap between 19 and 44.50 IS the problem this spec exists to fix: keep the
// two far apart in any replacement fixture, or these tests stop proving anything.
const SKEW_LOW = [10, 12, 14, 16, 18, 20, 22, 24, 26, 28];
const SKEW_BIG = [300, 400];
const skewElapsed = () => {
  const days = SKEW_LOW.concat(SKEW_BIG);       // 12 spending days
  while (days.length < 20) days.push(0);        // 8 zero days
  return days;
};

test('percentileOf interpolates linearly, never nearest-rank', () => {
  // Nearest-rank on a small sample makes P90 jump day to day, which moves the
  // median (D3 cuts at P90) and therefore the forecast. Trap #4.
  assert.strictEqual(percentileOf([10, 20, 30, 40], 0.5), 25);
  assert.strictEqual(percentileOf([10, 20, 30, 40], 0), 10);
  assert.strictEqual(percentileOf([10, 20, 30, 40], 1), 40);
  // rank = 3 * 0.9 = 2.7  →  30 + (40-30)*0.7
  assert.strictEqual(percentileOf([10, 20, 30, 40], 0.9), 37);
  assert.strictEqual(percentileOf([42], 0.9), 42, 'single sample');
  assert.strictEqual(percentileOf([], 0.9), 0, 'empty is 0, not NaN');
});

test('medianOf sorts before measuring', () => {
  assert.strictEqual(medianOf([30, 10, 20]), 20);
  assert.strictEqual(medianOf([40, 10, 30, 20]), 25);
  const input = [3, 1, 2];
  medianOf(input);
  assert.deepStrictEqual(input, [3, 1, 2], 'must not mutate the caller array');
});

test(`dailyTotals buckets densely and by LOCAL date [TZ=${TZ}]`, () => {
  const rows = [
    row({ Date: '2026-08-01', Amount: 10 }),
    row({ Date: '2026-08-01', Amount: 5 }),
    row({ Date: '2026-08-31', Amount: 20 }),
    row({ Date: '2026-07-31', Amount: 99 }),   // adjacent month, must not leak
  ];
  const d = dailyTotals(rows, 2026, 7);
  assert.strictEqual(d.length, 31);
  assert.strictEqual(d[0], 15, 'day 1 sums both rows — in every timezone');
  assert.strictEqual(d[30], 20, 'day 31');
  assert.strictEqual(d.reduce((s, v) => s + v, 0), 35, 'July row excluded');
  assert.strictEqual(d.filter(v => v === 0).length, 29, 'zero days are PRESENT');
});

test('dailyTotals clips a live month at upToDay', () => {
  const rows = [row({ Date: '2026-08-05', Amount: 10 }), row({ Date: '2026-08-25', Amount: 90 })];
  const d = dailyTotals(rows, 2026, 7, 10);
  assert.strictEqual(d.length, 10, 'day 1 … day 10 only');
  assert.strictEqual(d.reduce((s, v) => s + v, 0), 10, 'the future-dated row is not counted');
});

test('spendProfile excludes zero days (D2) and cuts the median at P90 (D3)', () => {
  const p = spendProfile(skewElapsed());
  assert.strictEqual(p.spendDays.length, 12, 'the 8 zero days are not spending days');
  assert.strictEqual(p.spendDayRate, 0.6);
  assert.ok(Math.abs(p.p90 - 272.8) < 1e-9, `P90 was ${p.p90}`);
  assert.deepStrictEqual(p.bigDays, SKEW_BIG, 'both outliers are above P90');
  assert.deepStrictEqual(p.normalDays, SKEW_LOW);
  assert.strictEqual(p.medianDaily, 19, 'median of the NORMAL days only');
  assert.strictEqual(p.meanDaily, 44.5);

  // Skipping either exclusion gives a visibly different number — which is the
  // whole reason both are locked decisions.
  assert.strictEqual(medianOf(skewElapsed()), 13, 'with zeros in, the median collapses');
  assert.strictEqual(medianOf(p.spendDays), 21, 'with big days in, the median drifts up');
});

test('computeSpendForecast applies the spend-day rate, not raw remaining days (D8)', () => {
  const f = computeSpendForecast({
    elapsed: skewElapsed(), history: [], historyMonths: 0,
    daysInMonth: 31, dayOfMonth: 20
  });
  assert.strictEqual(f.mode, 'median');
  assert.strictEqual(f.label, 'Median Daily');
  assert.strictEqual(f.daily, 19);
  assert.strictEqual(f.spentSoFar, 890);
  assert.strictEqual(f.spendDayRate, 0.6);
  // 890 + 19 * 11 * 0.6
  assert.ok(Math.abs(f.forecast - 1015.4) < 1e-9, `forecast was ${f.forecast}`);
  // The unit trap: median × every remaining day overcounts by the zero days.
  assert.notStrictEqual(f.forecast, 890 + 19 * 11);
  // And the correction is downward from what the old mean projection said.
  assert.ok(f.forecast < 44.5 * 31, 'the calibrated forecast is below the mean projection');
});

test('mean mode reproduces the pre-spec figures exactly', () => {
  // Days 1–7 fall back to the mean (D7). With no buffer that path must be a
  // provable no-op against the shipped `exp/daysElapsed × daysInMonth`, or the
  // extraction changed behaviour it was only meant to move.
  const elapsed = [40, 0, 12, 300, 8, 0, 25];
  const spent = elapsed.reduce((s, v) => s + v, 0);
  const f = computeSpendForecast({
    elapsed, history: [], historyMonths: 0, daysInMonth: 31, dayOfMonth: 7
  });
  assert.strictEqual(f.mode, 'mean');
  assert.strictEqual(f.label, 'Average Daily');
  assert.strictEqual(f.spendDayRate, 1, 'the mean already averages across ALL days');
  assert.ok(Math.abs(f.forecast - (spent / 7) * 31) < 1e-9, `forecast was ${f.forecast}`);
});

test('the median takes over on day 8', () => {
  const base = { elapsed: skewElapsed(), history: [], historyMonths: 0, daysInMonth: 31 };
  assert.strictEqual(computeSpendForecast({ ...base, dayOfMonth: 7 }).mode, 'mean');
  assert.strictEqual(computeSpendForecast({ ...base, dayOfMonth: 8 }).mode, 'median');
});

test('fewer than 3 spending days stays on the mean whatever the date', () => {
  const elapsed = new Array(20).fill(0);
  elapsed[2] = 50; elapsed[9] = 70;             // two spending days on the 20th
  const f = computeSpendForecast({
    elapsed, history: [], historyMonths: 0, daysInMonth: 31, dayOfMonth: 20
  });
  assert.strictEqual(f.mode, 'mean', 'a median over two samples is not a measurement');
  assert.strictEqual(f.spendDayCount, 2);
});

test('a month with nothing logged reports the empty mode, not RM 0 a day', () => {
  const f = computeSpendForecast({
    elapsed: new Array(12).fill(0), history: [], historyMonths: 0,
    daysInMonth: 31, dayOfMonth: 12
  });
  assert.strictEqual(f.mode, 'empty');
  assert.strictEqual(f.daily, 0);
  assert.strictEqual(f.forecast, 0);
});

test('a month where every elapsed day has spend carries a rate of 1', () => {
  const elapsed = [20, 22, 24, 26, 28, 30, 32, 34, 36, 400];
  const f = computeSpendForecast({
    elapsed, history: [], historyMonths: 0, daysInMonth: 30, dayOfMonth: 10
  });
  assert.strictEqual(f.spendDayRate, 1, 'no zero days, so no discount');
});

// ── Big-day buffer (D5) ──────────────────────────────────────────────────────

// Three pooled months: 27 quiet days and 3 big days each.
//   90 spend days, 81 × 5 and 9 × 200
//   P90  = rank 89*0.9 = 80.1 → 5 + (200-5)*0.1 = 24.50
//   big  = the nine 200s = 1800  →  bufferPerMonth = 600
const historyDays = () => {
  const out = [];
  for (let m = 0; m < 3; m++) {
    for (let i = 0; i < 27; i++) out.push(5);
    out.push(200, 200, 200);
  }
  return out;
};

test('monthlyBigDayBuffer needs three months of history', () => {
  assert.strictEqual(monthlyBigDayBuffer(historyDays(), 3), 600);
  assert.strictEqual(monthlyBigDayBuffer(historyDays(), 2), 0, 'omit, no error, no zero-as-measurement');
  assert.strictEqual(monthlyBigDayBuffer([], 3), 0);
  assert.strictEqual(monthlyBigDayBuffer(null, 3), 0);
});

test('only the unelapsed fraction of the buffer is added (trap #3)', () => {
  // Big days already logged this month sit inside spentSoFar; adding a whole
  // month's buffer on top would count them twice.
  const base = {
    elapsed: skewElapsed(), history: historyDays(), historyMonths: 3,
    daysInMonth: 31, dayOfMonth: 20
  };
  const f = computeSpendForecast(base);
  assert.strictEqual(f.buffer, 600, 'per month');
  assert.ok(Math.abs(f.bufferRemaining - 600 * 11 / 31) < 1e-9, `was ${f.bufferRemaining}`);
  assert.ok(Math.abs(f.forecast - (1015.4 + 600 * 11 / 31)) < 1e-9);

  // On the last day of the month there is nothing left to buffer for.
  const last = computeSpendForecast({ ...base, dayOfMonth: 31 });
  assert.strictEqual(last.bufferRemaining, 0);
  assert.strictEqual(last.forecast, last.spentSoFar);

  // And with too little history the same call omits the buffer entirely.
  const thin = computeSpendForecast({ ...base, historyMonths: 2 });
  assert.strictEqual(thin.buffer, 0);
  assert.ok(Math.abs(thin.forecast - 1015.4) < 1e-9);
});

// ── Distribution curve ───────────────────────────────────────────────────────

test('distributionBuckets covers every spending day exactly once', () => {
  const d = distributionBuckets(spendProfile(skewElapsed()).spendDays, 14);
  assert.strictEqual(d.count, 12);
  assert.strictEqual(d.buckets.length, 14);
  assert.strictEqual(d.buckets.reduce((s, b) => s + b.count, 0), 12, 'no day falls outside');
  assert.strictEqual(d.min, 10);
  assert.strictEqual(d.max, 400);
  assert.strictEqual(d.buckets[0].x0, 10);
  assert.strictEqual(d.buckets[13].x1, 400);
  assert.strictEqual(d.buckets[13].count, 1, 'the top bucket holds the biggest day, inclusive');
});

test('the curve marks the same median the Today tile prints', () => {
  // A plain median over every spending day would draw a line the rest of the
  // app disagrees with — the tile cuts at P90 (D3), so the curve must too.
  const prof = spendProfile(skewElapsed());
  const d = distributionBuckets(prof.spendDays, 14);
  assert.strictEqual(d.median, prof.medianDaily);
  assert.strictEqual(d.p90, prof.p90);
});

test('distributionBuckets survives a single distinct amount', () => {
  const d = distributionBuckets([25, 25, 25], 14);
  assert.strictEqual(d.buckets.length, 1, 'no range to spread across');
  assert.strictEqual(d.buckets[0].count, 3);
  assert.strictEqual(d.median, 25);
  assert.deepStrictEqual(distributionBuckets([], 14).buckets, []);
});
