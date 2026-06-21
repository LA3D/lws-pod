# JavaScriptSolidServer (JSS) — evaluation spike for the memory-pod substrate migration.
# JSS ships no image; this pins the published npm package and adds git (the --git
# HTTP backend spawns `git http-backend`, so the binary must be present).

FROM node:22-bookworm-slim

# git: required by --git. tini: clean PID 1 / signal handling for the node process.
RUN apt-get update \
 && apt-get install -y --no-install-recommends git ca-certificates tini \
 && rm -rf /var/lib/apt/lists/*

# Pin the exact version — JSS is a single-maintainer v0.0.x; we move when we choose to.
ARG JSS_VERSION=0.0.209
RUN npm install -g "javascript-solid-server@${JSS_VERSION}"

# LOCAL-DEV-ONLY override (default OFF). The LWS-CID verifier hardcodes blockPrivateIPs:true in
# its WebID-document fetcher (src/auth/cid-doc-fetch.js), so it refuses to dereference a WebID that
# resolves to a loopback/private IP — which makes the self-signed LWS-CID auth round-trip impossible
# to exercise on any local/private pod. Set PATCH_CID_PRIVATE_IPS=true to relax ONLY that one fetch
# for a local proof. PRODUCTION/PUBLIC builds MUST leave this false — blockPrivateIPs is JSS's SSRF
# control, and the eventual public deployment proves the auth path with the guard intact.
ARG PATCH_CID_PRIVATE_IPS=false
RUN if [ "$PATCH_CID_PRIVATE_IPS" = "true" ]; then \
      F=/usr/local/lib/node_modules/javascript-solid-server/src/auth/cid-doc-fetch.js ; \
      sed -i 's/blockPrivateIPs: true/blockPrivateIPs: false/' "$F" ; \
      echo "[lws-pod] LOCAL-DEV patch applied to cid-doc-fetch.js (SSRF private-IP guard relaxed):" ; \
      grep -n 'blockPrivateIPs' "$F" ; \
    fi

ENV DATA_ROOT=/data
RUN mkdir -p /data
VOLUME ["/data"]

EXPOSE 3000

# Flags exercise exactly what we're evaluating, nothing more:
#   --idp            built-in Solid-OIDC IdP + headless POST /idp/credentials (agent auth)
#   --mcp            MCP server at /mcp (the agent consumption surface)
#   --conneg         Turtle <-> JSON-LD content negotiation (mashlib needs this for Turtle)
#   --mashlib-cdn    SolidOS Mashlib data browser, loaded from unpkg CDN (browser HTML render).
#                    CDN mode needs no local files; --mashlib (local) would require an unshipped
#                    src/mashlib-local/dist/ build, and --solidos-ui needs a local dist too.
#   --git            git clone/push backend (the versioning angle)
#   --notifications  WebSocket change notifications
#   --provision-keys auto-generate a CID v1 owner key per pod (LWS-CID identity)
# Kitchen-sink surfaces (nostr relay / webrtc / tunnel / activitypub / terminal) stay OFF.
ENTRYPOINT ["tini", "--"]
CMD ["jss", "start", "-p", "3000", "-h", "0.0.0.0", "-r", "/data", \
     "--idp", "--mcp", "--conneg", "--mashlib-cdn", "--git", "--notifications", "--provision-keys"]
