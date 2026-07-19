/**
 * Project Alfred — Apps Script backend (attached to the Project_Alfred Sheet).
 *
 * THIS FILE IS THE IN-REPO SOURCE OF TRUTH for the Web App deployed at the
 * URL in index.html's APPS_SCRIPT_URL. To ship changes: paste into the Sheet's
 * script editor (Extensions → Apps Script), then Deploy → Manage deployments →
 * Edit → new version. NEVER create a new deployment — that changes the URL.
 *
 * ⚠️ FIRST SYNC: the add/edit/delete/backfill handlers below were
 * reconstructed from documented behavior — diff them against your live script
 * before replacing it, and keep the live version where they differ.
 *
 * Script Properties required (File → Project Settings → Script Properties):
 *   OPENAI_API_KEY   — for the parse + insights actions
 *   ALLOWED_USERS    — comma-separated chat_ids; empty/absent disables the
 *                      allow-list; empty/absent disables it
 *
 * Actions routed by doPost (all POSTed as text/plain JSON with key "8891"):
 *   add / edit / delete            — sheet writes (existing dashboard paths)
 *   parse                          — {user, text | image_b64[, mime][, caption]}
 *                                    → {transactions:[...], dropped, note?}
 *                                    LLM-extract only; NEVER writes the sheet.
 *   insights                       — {facts:[...], month} → {narrative}
 *                                    (LLM phrasing of computed facts)
 */

// ── Config ───────────────────────────────────────────────────────────────────

var SECRET_KEY = '8891';
var SHEET_NAME = 'Sheet1';

var OPENAI_URL = 'https://api.openai.com/v1/chat/completions';
var OPENAI_MODEL = 'gpt-4o-mini';

var EXPENSE_CATEGORIES = ['Food & Dining', 'Transport', 'Bills & Utilities', 'Shopping & Groceries',
                          'Subscriptions', 'Entertainment', 'Other'];
var INCOME_CATEGORIES = ['Salary', 'Freelance', 'Bonus', 'Investment',
                         'Side Income', 'Reimbursement', 'Other Income'];

// Validation knobs (shared semantics with the companion Telegram bot in the
// project-alfred repo - keep the two implementations behaviourally aligned)
var MAX_TRANSACTIONS = 31;      // covers "every day this month"
var MAX_AMOUNT = 1000000;       // RM: above this is almost certainly a parse error
var MAX_TEXT_CHARS = 1000;      // parse input caps — the key is public in the
var MAX_IMAGE_B64_CHARS = 5000000; // page source; don't let anyone feed novels

var TIMEZONE = 'Asia/Kuala_Lumpur';

// ── Prompts (ported verbatim from project_alfred_bot.py) ─────────────────────

var EXTRACT_PROMPT = 'You are a personal finance assistant for a Malaysian user.\n' +
'The user will send a text message or photo describing one or more purchases,\n' +
'expenses, or income received.\n' +
'\n' +
'Your job is to classify each transaction as either Expense or Income, then\n' +
'extract fields for EACH transaction, and return a JSON ARRAY — even if there\n' +
'is only one transaction. Never return a bare object.\n' +
'\n' +
'INCOME signals — classify as Income if the message contains words like:\n' +
'  income, salary, gaji, received, terima, bonus, commission, freelance,\n' +
'  side income, payment received, topup own, angpau, refund, reimbursement,\n' +
'  claim, dividend, rental, sold, payout, transfer in\n' +
'  OR if the amount is clearly money coming IN to the user.\n' +
'\n' +
'EXPENSE signals — classify as Expense for everything else (purchases, bills, food, transport, etc.)\n' +
'\n' +
'For EXPENSE, pick category from: ' + JSON.stringify(EXPENSE_CATEGORIES) + '\n' +
'For INCOME, pick category from: ' + JSON.stringify(INCOME_CATEGORIES) + '\n' +
'\n' +
'Recurring bills/memberships (e.g. "netflix RM17", "spotify RM15", "gym RM120") ->\n' +
'category "Subscriptions" — prefer this over Entertainment or Bills & Utilities.\n' +
'\n' +
'Extract these fields for each transaction:\n' +
'- type: "Expense" or "Income"\n' +
'- amount: numeric only, in MYR (e.g. 45.00)\n' +
'- category: one category from the appropriate list above\n' +
'- description: short 2-5 word label (e.g. "Salary June 2026" or "Lunch Village Park")\n' +
'- date: YYYY-MM-DD format\n' +
'\n' +
'HANDLING MULTIPLE TRANSACTIONS:\n' +
'- If the message lists several distinct purchases (e.g. "lunch RM15, grab RM9, coffee RM6"),\n' +
'  return one array element per purchase, each with its own amount/category/description.\n' +
'- If the message describes a REPEATED transaction across several days\n' +
'  (e.g. "coffee RM3 for the last 3 days", "parking RM5 every day this week so far"),\n' +
'  return one array element PER DAY, same amount/category/description, with the\n' +
'  correct date for each day. Count backwards from today inclusive of today\n' +
'  unless the user implies otherwise.\n' +
'- If the message gives a quantity multiplier (e.g. "3 coffees at RM6 each",\n' +
'  "bought 2 tickets RM25 each"), return a SINGLE array element with amount =\n' +
'  quantity × unit price (e.g. 18.00, 50.00) — do not split into multiple rows.\n' +
'\n' +
'HANDLING DATES:\n' +
'- Resolve relative dates using the "Today is <date>" context given below.\n' +
'- "today" -> today\'s date. "yesterday" -> today minus 1 day.\n' +
'- "last Monday", "last Friday" etc -> the most recent past occurrence of that weekday.\n' +
'- "N days ago" -> today minus N days.\n' +
'- If no date/time reference is given at all, use today\'s date.\n' +
'\n' +
'HANDLING BILL-SPLITS:\n' +
'- If the user indicates only part of a total is theirs (e.g. "dinner RM60,\n' +
'  my portion is 50%", "split 3 ways, my share", "RM90 split with my brother"),\n' +
'  calculate the user\'s actual share and set `amount` to that share only\n' +
'  (e.g. RM60 at 50% -> 30.00; RM90 split 2 ways -> 45.00).\n' +
'- Mention the split in the description briefly if natural (e.g. "Dinner (split 50%)").\n' +
'- If a split is implied but the ratio is unclear, assume an even split among\n' +
'  the stated number of people.\n' +
'\n' +
'HANDLING CURRENCY PHRASING:\n' +
'- Normalize "15 bucks", "rm15", "RM 15", "MYR15", "15rm" all to amount: 15.00.\n' +
'  Always output amount as a plain number, never with currency symbols.\n' +
'\n' +
'Reply ONLY with a valid JSON array, no markdown, no explanation. Examples:\n' +
'\n' +
'Single: [{"type": "Expense", "amount": 45.00, "category": "Food & Dining", "description": "Lunch Village Park", "date": "2026-06-13"}]\n' +
'\n' +
'Multi-entry: [{"type": "Expense", "amount": 15.00, "category": "Food & Dining", "description": "Lunch", "date": "2026-06-13"}, {"type": "Expense", "amount": 9.00, "category": "Transport", "description": "Grab ride", "date": "2026-06-13"}]\n' +
'\n' +
'Multi-day: [{"type": "Expense", "amount": 3.00, "category": "Food & Dining", "description": "Coffee", "date": "2026-06-11"}, {"type": "Expense", "amount": 3.00, "category": "Food & Dining", "description": "Coffee", "date": "2026-06-12"}, {"type": "Expense", "amount": 3.00, "category": "Food & Dining", "description": "Coffee", "date": "2026-06-13"}]\n' +
'\n' +
'Split: [{"type": "Expense", "amount": 30.00, "category": "Food & Dining", "description": "Dinner (split 50%)", "date": "2026-06-13"}]\n' +
'\n' +
'If the message is a question or summary request (not a new transaction), reply with a\n' +
'single-element array containing a query object:\n' +
'[{"query": true, "message": "your helpful reply here"}]\n';

var INSIGHTS_PROMPT = 'You are a calm, precise personal-finance analyst writing a short "what I noticed" note for a Malaysian user\'s spending dashboard.\n' +
'\n' +
'You are given a JSON list of already-computed factual observations about their spending. Rewrite them into one flowing note.\n' +
'\n' +
'STRICT RULES:\n' +
'- Use ONLY the numbers and facts provided. Never invent, estimate, infer, or do any arithmetic on them. Every amount must appear exactly as given (e.g. "RM 445.00").\n' +
'- Understated, numbers-first, private-butler tone. No exclamation marks, no hype, no emoji, no advice, no greeting.\n' +
'- 2-3 sentences, roughly 45 words or fewer. Lead with the most significant observation.\n' +
'- Reply with ONLY the note text — no markdown, no preamble, no quotes.\n';

// ── Entry points ─────────────────────────────────────────────────────────────

function doGet() {
  return ContentService.createTextOutput('Project Alfred Apps Script is running.')
    .setMimeType(ContentService.MimeType.TEXT);
}

function doPost(e) {
  var data;
  try {
    data = JSON.parse(e.postData.contents);
  } catch (err) {
    return jsonOut({ error: 'bad request' });
  }
  if (data.key !== SECRET_KEY) return jsonOut({ error: 'unauthorized' });

  try {
    switch (data.action) {
      case 'add':              return jsonOut(handleAdd(data));
      case 'edit':             return jsonOut(handleEdit(data));
      case 'delete':           return jsonOut(handleDelete(data));
      case 'parse':            return jsonOut(handleParse(data));
      case 'insights':         return jsonOut(handleInsights(data));
      default:                 return jsonOut({ error: 'unknown action' });
    }
  } catch (err) {
    return jsonOut({ error: String(err).slice(0, 200) });
  }
}

function jsonOut(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// ── Sheet write handlers (existing dashboard paths) ──────────────────────────

function getSheet() {
  return SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
}

function generateUID() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

// UID lives in column G (7). Returns the 1-based row index, or -1.
function findRowByUID(uid) {
  if (!uid) return -1;
  var values = getSheet().getRange(1, 7, getSheet().getLastRow(), 1).getValues();
  for (var i = 0; i < values.length; i++) {
    if (String(values[i][0]).trim() === String(uid).trim()) return i + 1;
  }
  return -1;
}

function handleAdd(data) {
  // Columns: Date | Amount (MYR) | Category | Description | Source | Type | UID | User
  // Honor a client-supplied UID when present (optimistic-save reconcile matches
  // on it); fall back to a server UID for older clients. Backward-compatible.
  var uid = (data.uid && String(data.uid).trim()) ? String(data.uid).trim() : generateUID();
  getSheet().appendRow([
    data.date,
    Number(data.amount),
    data.category,
    data.description,
    data.source || 'dashboard',
    data.type,
    uid,
    String(data.user || '')
  ]);
  return { success: true, uid: uid };
}

function handleEdit(data) {
  var row = findRowByUID(data.uid);
  if (row === -1) return { error: 'row not found' };
  var sheet = getSheet();
  sheet.getRange(row, 1).setValue(data.date);
  sheet.getRange(row, 2).setValue(Number(data.amount));
  sheet.getRange(row, 3).setValue(data.category);
  sheet.getRange(row, 4).setValue(data.description);
  sheet.getRange(row, 6).setValue(data.type);
  sheet.getRange(row, 8).setValue(String(data.user || ''));
  return { success: true };
}

function handleDelete(data) {
  var row = findRowByUID(data.uid);
  if (row === -1) return { error: 'row not found' };
  getSheet().deleteRow(row);
  return { success: true };
}

function backfillUIDs() {
  var sheet = getSheet();
  var last = sheet.getLastRow();
  for (var r = 2; r <= last; r++) {
    var cell = sheet.getRange(r, 7);
    if (!String(cell.getValue()).trim()) cell.setValue(generateUID());
  }
}

// One-off: run manually from the Apps Script editor after the Subscriptions
// category ships (roadmap Phase E). Relabels existing "Shopping" and
// "Groceries" rows to the merged "Shopping & Groceries" category so old
// entries stay consistent with the new picklist.
function migrateShoppingGroceriesCategory() {
  var sheet = getSheet();
  var last = sheet.getLastRow();
  var range = sheet.getRange(2, 3, last - 1, 1); // Category column
  var values = range.getValues();
  var changed = 0;
  for (var i = 0; i < values.length; i++) {
    var cat = String(values[i][0]).trim();
    if (cat === 'Shopping' || cat === 'Groceries') {
      values[i][0] = 'Shopping & Groceries';
      changed++;
    }
  }
  range.setValues(values);
  return changed;
}

// ── Allow-list ───────────────────────────────────────────────────────────────

function isAllowedUser(user) {
  var raw = PropertiesService.getScriptProperties().getProperty('ALLOWED_USERS') || '';
  var list = raw.split(',').map(function (s) { return s.trim(); }).filter(String);
  if (!list.length) return true; // empty = allow-list disabled (bot semantics)
  return list.indexOf(String(user).trim()) !== -1;
}

// ── OpenAI ───────────────────────────────────────────────────────────────────

function callOpenAI(messages, maxTokens, temperature) {
  var apiKey = PropertiesService.getScriptProperties().getProperty('OPENAI_API_KEY');
  if (!apiKey) throw new Error('OPENAI_API_KEY not set in Script Properties');
  var resp = UrlFetchApp.fetch(OPENAI_URL, {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + apiKey },
    payload: JSON.stringify({
      model: OPENAI_MODEL,
      messages: messages,
      max_tokens: maxTokens || 800,
      temperature: (temperature === undefined) ? 0.1 : temperature
    }),
    muteHttpExceptions: true
  });
  if (resp.getResponseCode() !== 200) {
    throw new Error('OpenAI ' + resp.getResponseCode());
  }
  return JSON.parse(resp.getContentText()).choices[0].message.content.trim();
}

// Tolerates a bare object (wraps it) in case the model slips — port of
// _parse_array_response().
function parseArrayResponse(raw) {
  var cleaned = raw.replace(/```json/g, '').replace(/```/g, '').trim();
  var parsed = JSON.parse(cleaned);
  if (!Array.isArray(parsed)) parsed = [parsed];
  return parsed;
}

// ── Validation / sanitization (port of validate_transactions) ────────────────
// Pure functions: today's date is passed in so they're unit-testable in Node.

function coerceAmount(raw) {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === 'number') return raw;
  var cleaned = String(raw).toLowerCase();
  ['rm', 'myr', '$', ',', ' '].forEach(function (junk) {
    cleaned = cleaned.split(junk).join('');
  });
  var n = parseFloat(cleaned);
  return (isNaN(n) || cleaned === '' || !/^-?\d*\.?\d+$/.test(cleaned)) ? null : n;
}

function validDate(raw, todayIso) {
  if (!raw) return todayIso;
  var s = String(raw).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return todayIso;
  var d = new Date(s + 'T00:00:00Z');
  if (isNaN(d.getTime())) return todayIso;
  // round-trip check catches nonsense like 2026-02-31
  if (d.toISOString().slice(0, 10) !== s) return todayIso;
  var today = new Date(todayIso + 'T00:00:00Z');
  if (d.getTime() > today.getTime() + 2 * 86400000) return todayIso; // future guard (+2d slop)
  if (d.getUTCFullYear() < 2000) return todayIso;                    // absurdly old
  return s;
}

function normalizeCategory(cat, entryType) {
  var valid = entryType === 'Income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
  if (valid.indexOf(cat) !== -1) return cat;
  if (cat) {
    var lower = String(cat).trim().toLowerCase();
    for (var i = 0; i < valid.length; i++) {
      if (lower === valid[i].toLowerCase()) return valid[i];
    }
  }
  return entryType === 'Income' ? 'Other Income' : 'Other';
}

// Returns {clean: [...], dropped: n}. Query objects pass through untouched.
function validateTransactions(rawList, todayIso) {
  if (!Array.isArray(rawList)) rawList = [rawList];
  var clean = [];
  var dropped = 0;

  rawList.slice(0, MAX_TRANSACTIONS).forEach(function (txn) {
    if (!txn || typeof txn !== 'object' || Array.isArray(txn)) { dropped++; return; }
    if (txn.query) { clean.push(txn); return; }

    var amount = coerceAmount(txn.amount);
    if (amount === null || amount <= 0 || amount > MAX_AMOUNT) { dropped++; return; }

    var entryType = String(txn.type || 'Expense').trim().toLowerCase() === 'income' ? 'Income' : 'Expense';
    var description = String(txn.description || '').trim() || 'Unlabeled';

    clean.push({
      type: entryType,
      amount: Math.round(amount * 100) / 100,
      category: normalizeCategory(txn.category, entryType),
      description: description.slice(0, 80),
      date: validDate(txn.date, todayIso)
    });
  });

  if (rawList.length > MAX_TRANSACTIONS) dropped += rawList.length - MAX_TRANSACTIONS;
  return { clean: clean, dropped: dropped };
}

// ── Parse action (dashboard capture — extract only, never writes) ────────────

function handleParse(data) {
  if (!isAllowedUser(data.user)) return { error: 'user not allowed' };

  var todayIso = Utilities.formatDate(new Date(), TIMEZONE, 'yyyy-MM-dd');
  var messages;

  if (data.image_b64) {
    if (String(data.image_b64).length > MAX_IMAGE_B64_CHARS) return { error: 'image too large' };
    var captionNote = data.caption ? '\n\nPhoto caption from user: ' + String(data.caption).slice(0, 300) : '';
    messages = [{
      role: 'user',
      content: [
        { type: 'text', text: EXTRACT_PROMPT + '\n\nToday is ' + todayIso + '. Extract the transaction(s) from this receipt image.' + captionNote },
        { type: 'image_url', image_url: { url: 'data:' + (data.mime || 'image/jpeg') + ';base64,' + data.image_b64 } }
      ]
    }];
  } else if (data.text) {
    var text = String(data.text).slice(0, MAX_TEXT_CHARS);
    messages = [{ role: 'user', content: EXTRACT_PROMPT + '\n\nToday is ' + todayIso + '. User message: ' + text }];
  } else {
    return { error: 'nothing to parse' };
  }

  var raw = callOpenAI(messages);
  var result = validateTransactions(parseArrayResponse(raw), todayIso);

  // A query object means the model saw a question, not a transaction — surface
  // its reply as a note for the capture UI to show instead of a confirm sheet.
  var queries = result.clean.filter(function (t) { return t.query; });
  var txns = result.clean.filter(function (t) { return !t.query; });
  var out = { transactions: txns, dropped: result.dropped };
  if (!txns.length && queries.length) out.note = String(queries[0].message || 'That looks like a question — the charts below have the answers.');
  return out;
}

// ── Insights action (LLM phrasing of computed facts) ────────────────────────────

function handleInsights(data) {
  if (!data.facts || !Array.isArray(data.facts) || !data.facts.length) return { error: 'no facts' };
  var context = { month: data.month || '', observations: data.facts };
  var narrative = callOpenAI(
    [{ role: 'user', content: INSIGHTS_PROMPT + '\n\nFacts (JSON):\n' + JSON.stringify(context) }],
    160, 0.6
  );
  return { narrative: narrative };
}
