---
name: verify
description: Run Alfred's UI verification pass — drive the real app in Chromium, take screenshots of every tab, record a performance trace and score it — then fix and re-run until it passes. Use after ANY change to index.html, lib/, icons, manifest.json or sw.js, before committing, and whenever asked to verify, check, or prove a UI change. A PostToolUse hook reminds you when index.html is edited.
---

# verify — Alfred UI pass

**When:** after any UI change (index.html, lib/, icons, manifest, sw.js), before you commit.
Not for docs-only or Apps-Script-only changes — those have no page to run.

**Proof is a screenshot and a score, never "tests pass".** Every run ends with the
screenshots and the performance score sent to the user.

Read the `alfred-verification` skill before writing change checks — it holds the
harness traps (negative controls, clock pinning, synthetic events that prove nothing).

## 1. Write the change checks

One small spec file in the scratchpad (not in the repo) that drives the change
through the real UI — click what a user clicks, then assert what they would see.
Reuse the harness; do not rebuild it:

```js
const { test, expect } = require('@playwright/test');
const { openApp } = require('./helpers/app');   // path is relative to test/browser
test('what changed', async ({ page }) => {
  await openApp(page, { view: 'trends' });       // mocked sheet, pinned date
  // drive it, then expect(...)
  await page.screenshot({ path: `${process.env.VERIFY_OUT}/change-${test.info().project.name}.png` });
});
```

Add at least one probe off the happy path (empty state, wrong input, the other theme).
Check that a new check can fail: break the code on purpose once, see red, then put it back.

## 2. Run

```bash
.claude/skills/verify/run.sh /path/to/change.spec.js
```

It runs, in both projects (390px light + reduced motion, 900px dark + motion):
- your change checks;
- screenshots of Today, Logs, Trends and the capture sheet, and a fail on any uncaught page error;
- a performance trace with real Chart.js, scored against budgets in `verify.spec.js`:
  FCP ≤ 1000ms, ready ≤ 1500ms, longest task ≤ 200ms, load CLS ≤ 0.1, tab switch ≤ 150ms.
  Score = % of budgets met. **Anything below 100 fails the run.**

Output: `/tmp/alfred-verify/` (set `VERIFY_OUT` to change it). `*-trace.json` opens in
Chrome DevTools → Performance → Load profile. The Chrome DevTools MCP is not available in
cloud sessions; this trace is the same format that tool records.

## 3. On failure: fix and re-run

1. Read the failure in `run.log`. Look at the screenshot before you theorise.
2. Decide: is the **app** wrong, or the **check**? Fix the app when the app is wrong.
   Fix the check only when it asserts the wrong thing — never loosen it just to go green.
3. Re-run step 2. Repeat.
4. **Stop after 3 failed rounds** on the same failure and report to the user: what fails,
   what you tried, the screenshot. Do not raise a perf budget to get green — a budget
   change is the user's call.

## 4. Report

Send the proof with `SendUserFile` (the user cannot open container paths):
the change screenshots, `mobile-light-reduced-today.png` (or the tab that changed),
and `mobile-light-reduced-trace.json`. Then report in the user's style:

```
Verdict: PASS | FAIL | BLOCKED
Score: mobile 100/100 · desktop 100/100
What I checked: <one line each, ✅ / ❌ / 🔍 probe>
Rounds: <n> (what was fixed between them)
Findings: <anything odd, even if it passed>
```

## Gotchas

- `run.sh` copies specs into `test/browser/` as `zz-*.spec.js` and deletes them on exit. Never commit them.
- The cdnjs CDN is blocked in cloud sessions; `run.sh` pulls Chart.js from npm instead.
- Figures read mid-animation are wrong — assert numbers in the reduced-motion project.
- The smoke suite (`test/browser/smoke.spec.js`) is CI's job. This pass is not a replacement for it.
- Numbers come from a fast machine with a mocked sheet and model. A pass here means no regression, not "fast on a phone".
