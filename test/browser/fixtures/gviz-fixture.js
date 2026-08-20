// A GViz Sheet1 response, mocked. Spans August (current month) and June, with
// no rows in July — a deliberate gap. CLAUDE.md §8: "fixtures for this kind of
// work need a deliberate gap," because a scope or scroll target counted in
// calendar months instead of months-holding-data only breaks on data like
// this. June is several weeks deep on purpose too, so a jump into it has
// somewhere real to land instead of bottoming the page out immediately.
'use strict';

const USER = '12345';
const cell = (v) => ({ v });
const d = (y, m, day) => `Date(${y},${m - 1},${day})`; // GViz months are 0-indexed

const ROWS = [
  [d(2026, 8, 18), 42.50, 'Food & Dining', 'Lunch', 'web', 'Expense', 'a1', USER],
  [d(2026, 8, 17), 18.00, 'Transport', 'Grab', 'dashboard', 'Expense', 'a2', USER],
  [d(2026, 8, 12), 96.20, 'Shopping & Groceries', 'Weekly shop', 'web', 'Expense', 'a3', USER],
  [d(2026, 8, 10), 55.00, 'Bills & Utilities', 'Internet', 'recurring', 'Expense', 'a4', USER],
  [d(2026, 8, 3), 12.00, 'Subscriptions', 'Music', 'recurring', 'Expense', 'a5', USER],
  [d(2026, 8, 1), 5000, 'Salary', 'August salary', 'web', 'Income', 'a6', USER],
  [d(2026, 6, 26), 61.00, 'Food & Dining', 'Dinner', 'web', 'Expense', 'b1', USER],
  [d(2026, 6, 20), 30.00, 'Entertainment', 'Cinema', 'web', 'Expense', 'b2', USER],
  [d(2026, 6, 17), 24.00, 'Transport', 'Taxi', 'web', 'Expense', 'b3', USER],
  [d(2026, 6, 11), 88.00, 'Shopping & Groceries', 'Groceries', 'web', 'Expense', 'b4', USER],
  [d(2026, 6, 9), 15.00, 'Subscriptions', 'Cloud', 'recurring', 'Expense', 'b5', USER],
  [d(2026, 6, 4), 33.00, 'Bills & Utilities', 'Water', 'web', 'Expense', 'b6', USER],
  [d(2026, 6, 2), 4800, 'Salary', 'June salary', 'web', 'Income', 'b7', USER],
];

const GVIZ = {
  table: {
    cols: ['Date', 'Amount', 'Category', 'Description', 'Source', 'Type', 'UID', 'User'].map((label) => ({ label })),
    rows: ROWS.map((r) => ({ c: r.map(cell) })),
  },
};

// The real endpoint wraps its JSON in a JS-callback comment; mapGvizRows()
// strips to the first '{' / last '}', so the wrapper just has to be present.
const GVIZ_BODY = `/*O_o*/\ngoogle.visualization.Query.setResponse(${JSON.stringify(GVIZ)});`;

module.exports = { USER, GVIZ_BODY };
