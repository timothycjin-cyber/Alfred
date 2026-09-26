#!/usr/bin/env bash
# Runs the verify skill's UI pass: screenshots + perf trace + score, in both
# Playwright projects. Extra spec files passed as arguments (the change-specific
# checks) run in the same pass.
#
#   .claude/skills/verify/run.sh [change-checks.spec.js ...]
#
# Output goes to $VERIFY_OUT (default /tmp/alfred-verify). Exit code is
# Playwright's: non-zero means a check or the performance score failed.
set -uo pipefail

ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
SKILL="$ROOT/.claude/skills/verify"
BROWSER="$ROOT/test/browser"
export VERIFY_OUT="${VERIFY_OUT:-/tmp/alfred-verify}"
rm -rf "$VERIFY_OUT" && mkdir -p "$VERIFY_OUT"

# Real Chart.js for the perf pass. The CDN is blocked in cloud sessions, so it
# comes from the npm registry instead; cached after the first run.
CACHE="${TMPDIR:-/tmp}/alfred-chartjs"
if [ ! -f "$CACHE/package/dist/chart.umd.js" ]; then
  mkdir -p "$CACHE"
  (cd "$CACHE" && npm pack chart.js@4.4.1 --silent >/dev/null && tar xzf chart.js-4.4.1.tgz) \
    || echo "warn: could not fetch Chart.js — perf test will be skipped" >&2
fi
[ -f "$CACHE/package/dist/chart.umd.js" ] && export CHART_JS="$CACHE/package/dist/chart.umd.js"

[ -d "$BROWSER/node_modules" ] || npm --prefix "$BROWSER" ci --silent

# Use the pre-installed browser in cloud sessions; never `playwright install`.
[ -x /opt/pw-browsers/chromium ] && export PLAYWRIGHT_CHROMIUM_PATH="${PLAYWRIGHT_CHROMIUM_PATH:-/opt/pw-browsers/chromium}"

COPIED=("$BROWSER/zz-verify.spec.js")
cp "$SKILL/verify.spec.js" "$BROWSER/zz-verify.spec.js"
i=0
for f in "$@"; do
  i=$((i + 1)); dst="$BROWSER/zz-change-$i.spec.js"
  cp "$f" "$dst"; COPIED+=("$dst")
done
trap 'rm -f "${COPIED[@]}"' EXIT

cd "$BROWSER"
npx playwright test zz- --workers=1 --reporter=list 2>&1 \
  | grep -v '\[WebServer\]' | tee "$VERIFY_OUT/run.log"
status=${PIPESTATUS[0]}

echo
echo "── summary ──"
grep -E '^ *[0-9]+ (passed|failed|skipped|flaky)' "$VERIFY_OUT/run.log" || true
grep -h 'PERF_SCORE' "$VERIFY_OUT/run.log" || true
echo "proof: $VERIFY_OUT"
ls "$VERIFY_OUT"
exit "$status"
