#!/usr/bin/env bash
# Report-only capability check. NEVER exits non-zero (guardrails spec, decision 1):
# a deploy is never blocked; the agent reads the verdict. The red lives in
# tests/capabilities.test.mjs instead.
#
# CRITICAL (found 2026-07-21 while establishing the baseline — see Task 4's
# probeCapabilities fix for the sibling bug): never conflate "probe failed" with
# "capability absent". The anon rate limit is 60 req/min; a 429 mid-run must not
# read as a genuine mismatch. hurl's own status-assert failure text embeds the
# actual code ("actual value is <429>" / "actual: integer <429>", verified against
# a local fixture server — see the HURL_VERIFIED_VERSION check below), so we grep
# for that literal and report it as UNDETERMINED, never MISMATCH. A connection
# failure (pod genuinely unreachable — e.g. Step 5's stopped-container proxy for a
# degraded deploy) is a real "does not expose this" signal and still falls through
# to MISMATCH — UNLESS it happens because the pod simply hasn't finished starting
# yet, which the readiness poll below rules out before the probe ever runs.
set -u
RIG="${RIG:-fork-tls}"
MANIFEST="rig/capabilities.${RIG}.json"
[ -f "$MANIFEST" ] || { echo "[lws-pod] capcheck: no manifest $MANIFEST — skipping"; exit 0; }

if ! command -v python3 >/dev/null 2>&1; then
  echo "[lws-pod] capcheck: python3 not installed — cannot parse $MANIFEST, skipping"; exit 0
fi

# Minor 5 fix: pass MANIFEST through the environment, never spliced into the Python
# source string — a string-literal splice is an injection smell even though RIG
# (and therefore MANIFEST) is developer-set today, never attacker-controlled input.
BASE=$(MANIFEST_PATH="$MANIFEST" python3 -c "import json,os;print(json.load(open(os.environ['MANIFEST_PATH']))['base'])")
CACERT=$(MANIFEST_PATH="$MANIFEST" python3 -c "import json,os;print(json.load(open(os.environ['MANIFEST_PATH'])).get('cacert') or '')")
ARGS=(--variable "base=$BASE" --test --no-color)
[ -n "$CACERT" ] && ARGS+=(--cacert "$CACERT")

echo "[lws-pod] ${RIG} capability check  (base=$BASE)"
if ! command -v hurl >/dev/null 2>&1; then
  echo "  hurl not installed — skipping (brew install hurl)"; exit 0
fi

# Minor 3: the <429>/<404> detection below is coupled to hurl 8.0.1's exact
# diagnostic wording ("actual value is <429>" for an implicit `HTTP 200` status-line
# assert, "actual: integer <429>" for an explicit `[Asserts] status != 429`). A hurl
# version bump could reformat either string and silently regress the fix back to a
# generic MISMATCH. Cheap self-check: warn loudly (not fatal — this script always
# exits 0) if the installed hurl isn't the version this wording was verified against,
# so a silent regression at least becomes a visible one.
HURL_VERIFIED_VERSION="8.0.1"
HURL_ACTUAL_VERSION=$(hurl --version 2>/dev/null | head -1 | awk '{print $2}')
if [ "$HURL_ACTUAL_VERSION" != "$HURL_VERIFIED_VERSION" ]; then
  echo "  WARNING: hurl is ${HURL_ACTUAL_VERSION:-unknown}, but the 429/404 wording match below"
  echo "  was verified only against hurl $HURL_VERIFIED_VERSION — a reformatted diagnostic string"
  echo "  could silently turn UNDETERMINED back into a plain MISMATCH. Re-verify capcheck.sh's"
  echo "  <429>/<404> grep against a local fixture (429/404 responder) before trusting this run."
fi

# Important 1 fix: `docker compose up -d --build` returns once containers are
# STARTED, not HEALTHY (start_period 10s, interval 10s, retries 5 => up to ~60s
# before Docker itself calls jss healthy; the fork-tls caddy service has a bare
# `depends_on: - jss` with no `condition: service_healthy`). Without this poll,
# a fresh `make up`/`make up-fork-tls` can race JSS startup: the probe hits a
# connection failure that is purely "not up yet" and gets misreported as a
# capability MISMATCH. Poll docker's own health verdict when the rig's container
# is known and running under a healthcheck; otherwise fall back to polling the
# pod's root URL — any HTTP response (even an error status) proves the network
# path is live, so only a connection failure counts as "not ready".
READY_TIMEOUT=60
READY_INTERVAL=2
case "$RIG" in
  fork-tls) CONTAINER="lws-pod-fork" ;;
  local)    CONTAINER="lws-pod-local" ;;
  *)        CONTAINER="" ;;
esac

wait_ready() {
  local waited=0
  if [ -n "$CONTAINER" ] && command -v docker >/dev/null 2>&1 \
     && docker inspect -f '{{.State.Health.Status}}' "$CONTAINER" >/dev/null 2>&1; then
    while [ "$waited" -lt "$READY_TIMEOUT" ]; do
      [ "$(docker inspect -f '{{.State.Health.Status}}' "$CONTAINER" 2>/dev/null)" = "healthy" ] && return 0
      sleep "$READY_INTERVAL"
      waited=$((waited + READY_INTERVAL))
    done
    return 1
  fi
  # No known container name / docker unavailable / container has no healthcheck.
  local CURL_ARGS=(-s -o /dev/null -w '%{http_code}' --max-time 3)
  [ -n "$CACERT" ] && CURL_ARGS+=(--cacert "$CACERT")
  while [ "$waited" -lt "$READY_TIMEOUT" ]; do
    code=$(curl "${CURL_ARGS[@]}" "$BASE/" 2>/dev/null)
    [ -n "$code" ] && [ "$code" != "000" ] && return 0
    sleep "$READY_INTERVAL"
    waited=$((waited + READY_INTERVAL))
  done
  return 1
}

echo "  waiting for pod to become ready (up to ${READY_TIMEOUT}s)..."
if ! wait_ready; then
  echo "  ← UNDETERMINED: pod did not become ready within ${READY_TIMEOUT}s — cannot verify capabilities"
  echo "  ← this is not a mismatch report; startup may still be in progress (check: make logs)"
  exit 0
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
