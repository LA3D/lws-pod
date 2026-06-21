#!/usr/bin/env bash
# First-pass evaluation of the JSS container. Diagnostic, not a pass/fail gate —
# it prints what each surface actually returns so we learn the real API while
# deciding whether JSS is a good memory-pod substrate.
#
# Steps 1-6 exercise the core surfaces; steps 7-11 answer the live tests the
# spec-vs-JSS conformance map left open (docs/foundations/05-jss-spec-conformance.md).
#
#   ./smoke.sh                 # uses http://localhost:3838
#   BASE=http://host:port ./smoke.sh
set -uo pipefail
BASE="${BASE:-http://localhost:3838}"
PW="alicepassword123"
EMAIL="alice@example.com"

say() { printf '\n=== %s ===\n' "$*"; }
code() { curl -s -o /dev/null -w '%{http_code}' "$@"; }

say "1. server up?  GET $BASE/"
echo "HTTP $(code "$BASE/")  (any non-000 = reachable)"

say "2. create pod 'alice'  POST $BASE/.pods"
curl -s -X POST "$BASE/.pods" -H 'Content-Type: application/json' \
  -d "{\"name\":\"alice\",\"email\":\"$EMAIL\",\"password\":\"$PW\"}" ; echo

say "3. headless agent token  POST $BASE/idp/credentials"
TOKRES=$(curl -s -X POST "$BASE/idp/credentials" -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PW\"}")
echo "$TOKRES"
TOKEN=$(printf '%s' "$TOKRES" | sed -n 's/.*"access_token":"\([^"]*\)".*/\1/p')
WEBID=$(printf '%s' "$TOKRES" | sed -n 's/.*"webid":"\([^"]*\)".*/\1/p')
echo "token: ${TOKEN:+<got it>}${TOKEN:-<none>}   webid: ${WEBID:-<none>}"

say "4. write + read a resource as the agent"
RES="$BASE/alice/notes/hello.ttl"
echo "PUT $RES -> HTTP $(code -X PUT "$RES" \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: text/turtle' \
  --data-binary '<#it> <http://www.w3.org/2000/01/rdf-schema#label> "hello from an agent" .')"
echo "GET (json-ld):"; curl -s "$RES" -H "Authorization: Bearer $TOKEN" -H 'Accept: application/ld+json'; echo
echo "GET (turtle, conneg):"; curl -s "$RES" -H "Authorization: Bearer $TOKEN" -H 'Accept: text/turtle'; echo

say "5. agent surface  POST $BASE/mcp  (initialize + tools/list)"
curl -s -X POST "$BASE/mcp" -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}'; echo
curl -s -X POST "$BASE/mcp" -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}'; echo

say "6. git versioning angle  GET $BASE/alice/notes/info/refs?service=git-upload-pack"
echo "HTTP $(code "$BASE/alice/notes/info/refs?service=git-upload-pack")  (200/401/403 = backend live; 404 = no repo there yet)"

say "7. headless token shape  (axis 2 — DPoP-bound or replayable bearer?)"
if [ -z "${TOKEN:-}" ]; then
  echo "no token from step 3 — can't characterize; verify the /idp/credentials request shape"
elif command -v python3 >/dev/null 2>&1; then
  python3 - "$TOKEN" <<'PY'
import sys, base64, json
t = sys.argv[1]; parts = t.split('.')
def d(s): s += '=' * (-len(s) % 4); return base64.urlsafe_b64decode(s).decode('utf-8', 'replace')
if len(parts) < 2:
    print(f"opaque token (no JWT structure): {t[:12]}… -> bearer secret, replayable if captured")
else:
    try:
        h = json.loads(d(parts[0])); p = json.loads(d(parts[1]))
        print("JWT header :", json.dumps(h))
        print("JWT payload keys:", list(p.keys()))
        print("-> sender-constrained:",
              "YES (cnf present — DPoP/PoP-bound)" if 'cnf' in p
              else "NO cnf claim -> replayable bearer (capture = replay)")
    except Exception:
        print(f"token has dots but not parseable as JWT: {t[:12]}… -> treat as opaque bearer")
PY
else
  echo "token prefix: ${TOKEN:0:12}…  (install python3 to decode; bearer is replayable unless cnf/DPoP-bound)"
fi

say "8. headless key provisioning  (axis 6 — verificationMethod populated without the browser doctor?)"
PROFILE="${WEBID%%#*}"; [ -z "$PROFILE" ] && PROFILE="$BASE/alice/profile/card"
echo "GET $PROFILE (ld+json):"
CARD=$(curl -s "$PROFILE" -H 'Accept: application/ld+json')
echo "$CARD"
# A populated key is a verificationMethod/authentication PROPERTY on a node — NOT the
# @context term definition (which always ships at pod creation). Parse properly.
if command -v python3 >/dev/null 2>&1; then
  CARDF=$(mktemp); printf '%s' "$CARD" > "$CARDF"   # pass via file: heredoc owns stdin
  python3 - "$CARDF" <<'PY'
import sys, json
try:
    doc = json.load(open(sys.argv[1]))
except Exception:
    print("-> profile not JSON-LD; verify the profile path / Accept handling"); raise SystemExit
nodes = doc.get('@graph', [doc]) if isinstance(doc, dict) else (doc if isinstance(doc, list) else [doc])
ne = lambda v: bool(v) and v not in ([], {}, "")
hit = [k for n in nodes if isinstance(n, dict)
         for k in ('verificationMethod', 'authentication', 'assertionMethod')
         if k in n and ne(n[k])]      # n excludes @context's term map, so a hit is a real property
if hit:
    print(f"-> {sorted(set(hit))} populated on the profile node -> headless self-issued identity viable ✓")
else:
    print("-> CID @context present but NO populated verificationMethod/authentication on the node")
    print("   -> headless pod has no key; the browser doctor is still required. This is the GAP.")
PY
  rm -f "$CARDF"
else
  echo "(install python3 for an accurate check — grep alone matches the @context term, a false positive)"
fi

say "9. git push materializes a resource?  (axis 5)"
if ! command -v git >/dev/null 2>&1; then
  echo "git not installed on this host — skipping the push probe"
elif [ -z "${TOKEN:-}" ]; then
  echo "no token — skipping (push is WAC-gated)"
else
  REPO="alice/gitprobe-$$"            # unique per run — avoids non-fast-forward on re-run
  TMP=$(mktemp -d)
  ( cd "$TMP" && git init -q && git config user.email a@b.c && git config user.name probe
    printf '<#g> <http://www.w3.org/2000/01/rdf-schema#label> "from git push" .\n' > pushed.ttl
    git add pushed.ttl && git commit -qm probe
    echo "push -> $BASE/$REPO :"
    git -c http.extraHeader="Authorization: Bearer $TOKEN" push "$BASE/$REPO" HEAD:refs/heads/main 2>&1 | head -6 )
  rm -rf "$TMP"
  echo "GET the pushed file, requesting ld+json (watch the returned media type):"
  OUT=$(mktemp)
  curl -s -D - "$BASE/$REPO/pushed.ttl" -H "Authorization: Bearer $TOKEN" \
    -H 'Accept: application/ld+json' -o "$OUT" 2>/dev/null | grep -i '^content-type:' || true
  cat "$OUT" 2>/dev/null; echo; rm -f "$OUT"
  echo "(non-empty body = push materialized a retrievable resource. If the body is Turtle"
  echo " despite the ld+json Accept, git-pushed files are served as-is and bypass conneg — a finding.)"
fi

say "10. persistence marker  (axis 1 — survives a restart with the volume?)"
MARK="$BASE/alice/notes/persist-marker.ttl"
EXIST=$(code "$MARK" -H "Authorization: Bearer $TOKEN")
if [ "$EXIST" = "200" ]; then
  echo "marker already present (HTTP 200) -> SURVIVED a prior restart ✓"
else
  echo "marker absent (HTTP $EXIST) -> writing it now."
  echo "  PUT marker -> HTTP $(code -X PUT "$MARK" -H "Authorization: Bearer $TOKEN" \
    -H 'Content-Type: text/turtle' \
    --data-binary '<#m> <http://www.w3.org/2000/01/rdf-schema#label> "persistence marker" .')"
  echo "  Now run:  make down && make up   (volume kept) then re-run ./smoke.sh — marker should return 200."
  echo "  Note: 'make reset' WIPES the volume by design, so the marker will NOT survive a reset."
fi

say "11. in-process L2 write hook  (axis 7 — not an HTTP probe)"
echo "JSS exposes no external plugin API (jss-server skill / constrained-container/README),"
echo "so SHACL admission runs as the constrained-container proxy; projection + git-commit-on-write"
echo "have no native JSS write hook. Confirmed by docs, not by this script."

say "done — read the output above; this is a learning probe, not a gate"
