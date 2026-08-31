// A deliberately RIGHT-SKEWED sheet: ten ordinary August days plus two big
// ones, over three complete months of prior history.
//
// The default fixture cannot exercise this spec. It has five August spending
// days (too few to separate a median from a mean by anything you could assert)
// and history in June only, so the big-day buffer is always omitted. This one
// is built so all four of the spec's paths actually fire:
//
//   median mode      12 spending days by the 19th, well past the day-8 switch
//   the skew itself  median RM 19.00 vs mean RM 46.84 — a real gap, not rounding
//   the buffer       May + June + July all hold rows, so historyMonths === 3
//   trap #5          income RM 1200 sits BETWEEN the two forecasts, so the pace
//                    strip reads "on track" only if it is using the calibrated
//                    figure. The old mean projection (~RM 1452) would say the
//                    month is overspending. That is the regression this fixture
//                    is here to hold down.
//
// Keep the median and the mean far apart in any replacement, or the assertions
// that depend on the gap stop proving anything.
'use strict';

const USER = '12345';
const cell = (v) => ({ v });
const d = (y, m, day) => `Date(${y},${m - 1},${day})`; // GViz months are 0-indexed

const CATS = ['Food & Dining', 'Transport', 'Shopping & Groceries', 'Bills & Utilities',
  'Subscriptions', 'Entertainment', 'Other'];

const ROWS = [];
let uid = 0;
const expense = (y, m, day, amount) =>
  ROWS.push([d(y, m, day), amount, CATS[uid % CATS.length], 'Item ' + (++uid),
    'web', 'Expense', 'x' + uid, USER]);

// ── August 2026, the live month (clock pins the 19th) ───────────────────────
// Ten ordinary days …
[[2, 10], [3, 12], [5, 14], [6, 16], [8, 18], [9, 20], [11, 22], [12, 24], [14, 26], [15, 28]]
  .forEach(([day, amt]) => expense(2026, 8, day, amt));
// … and two that are not.
expense(2026, 8, 17, 300);
expense(2026, 8, 18, 400);
// Sits between the mean projection and the calibrated one — see the note above.
ROWS.push([d(2026, 8, 1), 1200, 'Salary', 'August salary', 'web', 'Income', 'inc-aug', USER]);

// ── May, June, July 2026 — three COMPLETE months, so the buffer applies ─────
// Ten quiet days and one big day each: pooled that is thirty RM 5 days against
// three RM 200 days, which puts P90 at 5 and leaves the big days clearly out.
// bufferPerMonth = 600 / 3 = RM 200.
[5, 6, 7].forEach((month) => {
  for (let i = 0; i < 10; i++) expense(2026, month, 2 + i * 2, 5);
  expense(2026, month, 24, 200);
  ROWS.push([d(2026, month, 1), 3000, 'Salary', 'Salary', 'web', 'Income', 'inc-' + month, USER]);
});

const GVIZ = {
  table: {
    cols: ['Date', 'Amount (MYR)', 'Category', 'Description', 'Source', 'Type', 'UID', 'User']
      .map((label) => ({ label })),
    rows: ROWS.map((r) => ({ c: r.map(cell) })),
  },
};

const GVIZ_BODY = `/*O_o*/\ngoogle.visualization.Query.setResponse(${JSON.stringify(GVIZ)});`;

module.exports = { GVIZ_BODY, USER };
