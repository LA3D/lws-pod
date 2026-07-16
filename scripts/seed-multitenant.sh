#!/usr/bin/env bash
# (Re)seed the multi-tenant TLS rig — alice (public) + bob (private) — so a
# `make down-fork-tls && make up-fork-tls` reseed is one command, not a
# session of ad-hoc curl. Idempotent: pod creation tolerates "already
# exists" (409), publish.mjs's PUTs/binds overwrite in place, its ACL
# provisioning skips a target that already has an .acl, and the card PUTs
# overwrite. Needs `make up-fork-tls` running + `make cert` (mkcert CA).
#
# Usage: scripts/seed-multitenant.sh [alice|bob|all]   (default: all)
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

BASE=https://pod.vardeman.me
CACERT="$ROOT/certs/rootCA.pem"
[ -f "$CACERT" ] || { echo "certs/rootCA.pem missing — run 'make cert && make up-fork-tls' first" >&2; exit 1; }
export NODE_EXTRA_CA_CERTS="$CACERT"
WHO="${1:-all}"

[ -d "$ROOT/projection/node_modules" ] || ( cd "$ROOT/projection" && npm ci )
[ -d "$ROOT/apps/wiki-projector/node_modules" ] || ( cd "$ROOT/apps/wiki-projector" && npm ci )

curl_() { curl -sS --cacert "$CACERT" "$@"; }

# $1=email $2=password -> access_token on stdout, "" (exit 1) if the account
# doesn't exist/credentials are wrong. Rides the normal auth-endpoint rate
# budget (NOT the strict pod-creation one below) — safe to call as a probe.
get_token() {
  local resp
  resp=$(curl_ -X POST "$BASE/idp/credentials" -H 'Content-Type: application/json' \
    -d "{\"email\":\"$1\",\"password\":\"$2\"}")
  node -e '
      let j; try { j = JSON.parse(process.argv[1]) } catch { process.exit(1) }
      if (!j.access_token) process.exit(1)
      process.stdout.write(j.access_token)
    ' "$resp"
}

# $1=name $2=email $3=password $4=visibility(public|private) -> ensures the pod exists.
# POST /.pods carries a SEPARATE, much stricter rate limit than the general
# anon budget (observed live: x-ratelimit-limit=1, retry-after on the order
# of a day) — it is NOT safe to call on every reseed just to check 409.
# Probe first via get_token (cheap, normal budget); only POST /.pods when
# the account genuinely doesn't exist yet.
ensure_pod() {
  if get_token "$2" "$3" >/dev/null 2>&1; then
    echo "  pod $1: credentials already work — reusing (no POST /.pods, avoids its strict rate limit)"
    return 0
  fi
  local code
  code=$(curl_ -o /dev/null -w '%{http_code}' -X POST "$BASE/.pods" -H 'Content-Type: application/json' \
    -d "{\"name\":\"$1\",\"email\":\"$2\",\"password\":\"$3\",\"visibility\":\"$4\"}")
  case "$code" in
    201) echo "  pod $1: created (201)" ;;
    409) echo "  pod $1: already exists (409) — reusing" ;;
    429) echo "  pod $1: POST /.pods rate-limited (429) — if this pod already exists, rerun once the window clears; see retry-after" >&2; exit 1 ;;
    *) echo "  pod $1: POST /.pods -> $code (unexpected)" >&2; exit 1 ;;
  esac
}

seed_alice() {
  echo "== alice (public) =="
  ensure_pod alice alice@example.com alicepassword123 public
  local tok; tok=$(get_token alice@example.com alicepassword123)
  echo "-- publish-profiles (public: default ACLs = public-read + owner-control) --"
  ( cd "$ROOT/projection" && node publish/publish.mjs --base "$BASE" --container /alice/profiles/ \
      --bind /alice/wiki/=llm-wiki \
      --bind /alice/datasets/=dcat-catalog --instantiate /alice/datasets/=dcat-catalog --token "$tok" )
  echo "-- seed cards --"
  node "$ROOT/scripts/lib/seed-wiki-cards.mjs" "$BASE" /alice/wiki/ "$tok"
}

seed_bob() {
  echo "== bob (private) =="
  ensure_pod bob bob@example.com bobpassword123 private
  local tok; tok=$(get_token bob@example.com bobpassword123)

  echo "-- stamping a bob-pathed defs tree (index.jsonld + pod-config.jsonld, /alice/ -> /bob/) --"
  local tmp; tmp=$(mktemp -d)
  trap 'rm -rf "$tmp"' RETURN
  cp -R "$ROOT/projection/profiles/defs" "$tmp/defs"
  sed -i.bak 's#/alice/#/bob/#g; s#alice/id/#bob/id/#g' "$tmp/defs/index.jsonld" "$tmp/defs/pod-config.jsonld"
  rm -f "$tmp/defs/index.jsonld.bak" "$tmp/defs/pod-config.jsonld.bak"

  echo "-- publish profiles (--no-acl: bob is private — publish.mjs's default ACL step always"
  echo "   grants public-read, which would defeat the private root; the inherited private root"
  echo "   ACL (owner-only, isDefault) already governs /bob/profiles/ and /bob/wiki/) --"
  ( cd "$ROOT/projection" && node publish/publish.mjs --base "$BASE" --container /bob/profiles/ \
      --defs "$tmp/defs" --bind /bob/wiki/=llm-wiki --no-acl --token "$tok" )

  echo "-- seed cards --"
  node "$ROOT/scripts/lib/seed-wiki-cards.mjs" "$BASE" /bob/wiki/ "$tok"
}

case "$WHO" in
  alice) seed_alice ;;
  bob) seed_bob ;;
  all) seed_alice; seed_bob ;;
  *) echo "usage: $0 [alice|bob|all]" >&2; exit 1 ;;
esac
echo "== seed-multitenant ($WHO) done =="
