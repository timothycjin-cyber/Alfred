#!/bin/sh
# Run the core suite in a timezone east of UTC and one west of it.
#
# One TZ is not a test run. Alfred's owner is at UTC+8, where a UTC-midnight
# date parse and a local-midnight one agree — which is precisely why the bug
# they disagree about survived in 19 places. Anything that buckets a row by
# month or day has to be proved in both directions.
set -e

for TZ_NAME in Asia/Kuala_Lumpur America/New_York Pacific/Auckland UTC; do
  echo "── TZ=$TZ_NAME ──────────────────────────────────────────────"
  # Glob, not the directory: `node --test test` resolves the bare name against
  # the module loader and dies with MODULE_NOT_FOUND before running anything.
  TZ="$TZ_NAME" node --test "$(dirname "$0")"/*.test.js
done

echo
echo "All timezones passed."
