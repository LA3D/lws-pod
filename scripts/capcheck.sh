#!/usr/bin/env bash
# Report-only capability check. NEVER exits non-zero (guardrails spec, decision 1):
# a deploy is never blocked; the agent reads the verdict. The red lives in
# tests/capabilities.test.mjs instead.
#
# CRITICAL (found 2026-07-21 while establishing the baseline — see Task 4's
# probeCapabilities fix for the sibling bug): never conflate "probe failed" with
# "capability absent". The anon rate limit is 60 req/min; a 429 mid-run must not
# read as a genuine mismatch. hurl's own status-assert failure text embeds the
# actual code ("actual value is <429>", verified against a local fixture server),
# so we grep for that literal and report it as UNDETERMINED, never MISMATCH. A
# connection failure (pod genuinely unreachable — e.g. Step 5's stopped-container
# proxy for a degraded deploy) is a real "does not expose this" signal and still
# falls through to MISMATCH.
set -u
RIG="${RIG:-fork-tls}"
MANIFEST="rig/capabilities.${RIG}.json"
[ -f "$MANIFEST" ] || { echo "[lws-pod] capcheck: no manifest $MANIFEST — skipping"; exit 0; }

BASE=$(python3 -c "import json;print(json.load(open('$MANIFEST'))['base'])")
CACERT=$(python3 -c "import json;print(json.load(open('$MANIFEST')).get('cacert') or '')")
ARGS=(--variable "base=$BASE" --test --no-color)
[ -n "$CACERT" ] && ARGS+=(--cacert "$CACERT")

echo "[lws-pod] ${RIG} capability check  (base=$BASE)"
if ! command -v hurl >/dev/null 2>&1; then
  echo "  hurl not installed — skipping (brew install hurl)"; exit 0
fi
OUT=$(hurl "${ARGS[@]}" rig/capabilities.hurl 2>&1) || true
echo "$OUT" | sed 's/^/  /'
if echo "$OUT" | grep -qE '<429>'; then
  echo "  ← UNDETERMINED: rate limited (429, anon budget 60/min) — cannot verify capabilities, retry later"
  echo "  ← this is not a mismatch report; the probe itself is inconclusive"
elif echo "$OUT" | grep -qE 'error|Failure|failed'; then
  echo "  ← MISMATCH: deployed pod does not match $MANIFEST"
  echo "  ← the deploy SUCCEEDED; this is a report. Run 'make test-capabilities' for the failing gate."
else
  echo "  all expected capabilities present"
fi
exit 0
