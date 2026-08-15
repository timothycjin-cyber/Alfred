#!/bin/sh
# Run the core suite in every timezone that matters, and report the FULL matrix.
#
# One TZ is not a test run. Alfred's owner is at UTC+8, where a UTC-midnight
# date parse and a local-midnight one agree — which is precisely why the bug
# they disagree about survived in 24 places. Anything that buckets a row by
# month or day has to be proved in both directions.
#
# Deliberately NOT fail-fast: which timezones fail is the diagnosis, not just
# that one did. All four red is ordinary broken logic; green at
# Asia/Kuala_Lumpur and red west of UTC is the signature of a date-parsing bug,
# and stopping at the first failure throws that signal away.
set -u

DIR=$(dirname "$0")
FAILED=""
PASSED=""

for TZ_NAME in Asia/Kuala_Lumpur America/New_York Pacific/Auckland UTC; do
  echo "── TZ=$TZ_NAME ──────────────────────────────────────────────"
  if TZ="$TZ_NAME" node --test "$DIR"/*.test.js; then
    PASSED="$PASSED $TZ_NAME"
  else
    FAILED="$FAILED $TZ_NAME"
  fi
done

echo
if [ -n "$FAILED" ]; then
  echo "FAILED in:$FAILED"
  if [ -n "$PASSED" ]; then
    echo "passed in:$PASSED"
    echo
    echo "A SPLIT result — some timezones green, some red — is the signature of a date"
    echo "parse, not of broken arithmetic. See parseRowDate() in lib/alfred-core.js"
    echo "and CLAUDE.md §3.12. (All four red is ordinary logic, look at the assertion.)"
  fi
  exit 1
fi

echo "All timezones passed."
