#!/usr/bin/env bash
# First-pass evaluation of the JSS container. Diagnostic, not a pass/fail gate —
# it prints what each surface actually returns so we learn the real API while
# deciding whether JSS is a good memory-pod substrate.
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

say "done — read the output above; this is a learning probe, not a gate"
