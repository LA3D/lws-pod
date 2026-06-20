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

ENV DATA_ROOT=/data
RUN mkdir -p /data
VOLUME ["/data"]

EXPOSE 3000

# Flags exercise exactly what we're evaluating, nothing more:
#   --idp            built-in Solid-OIDC IdP + headless POST /idp/credentials (agent auth)
#   --mcp            MCP server at /mcp (the agent consumption surface)
#   --conneg         Turtle <-> JSON-LD content negotiation
#   --git            git clone/push backend (the versioning angle)
#   --notifications  WebSocket change notifications
#   --provision-keys auto-generate a CID v1 owner key per pod (LWS-CID identity)
# Kitchen-sink surfaces (nostr relay / webrtc / tunnel / activitypub / terminal) stay OFF.
ENTRYPOINT ["tini", "--"]
CMD ["jss", "start", "-p", "3000", "-h", "0.0.0.0", "-r", "/data", \
     "--idp", "--mcp", "--conneg", "--git", "--notifications", "--provision-keys"]
