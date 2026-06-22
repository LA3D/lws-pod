# lws-pod

The substrate for the **memory pods**, built on a containerized, pinned
[JavaScriptSolidServer](https://github.com/JavaScriptSolidServer/JavaScriptSolidServer) (JSS).

**Status:** the JSS-vs-CSS evaluation concluded — *JSS is a good replacement, build on it*
(verdict + evidence below). The **L2 memory layer is now built on the local rung**: the OKF
**projection engine** (`projection/`), the **SHACL admission floor** (`constrained-container/`),
and a **curation console** (`app/` — see its README). The deployment workflow has a **local rung**
today (`make up` / `make test`); public dev/prod rungs on a CRC/SAI VM are designed-for and
deferred (see `FOLLOWUP.md` and `docs/superpowers/specs/`).

JSS gives us what CSS does *not*: a self-issued agent-identity stack (LWS-CID / did:nostr),
headless agent auth, an MCP agent surface, and git-backed versioning. Our L2 memory layer
(governed projection, write contract, SHACL admission, curation) is portable IP that rides on
top of any Solid server.

## Run

```bash
cp .env.example .env.local   # first time only — the make targets read --env-file .env.local
make up        # build + start  (http://localhost:3838)
make logs      # tail
make test      # Vitest e2e: pod create -> headless token -> write/read -> MCP -> git
make reset     # wipe ./data, rebuild, restart  (deletes the local pod by design)
make down      # stop, keep ./data (persistence check: down && up preserves the bind-mount)

# TLS variant (for the LWS-CID auth experiment; mkcert, pod.vardeman.me:8443)
make cert && make up-tls && make cid-tls
```

L2 component gates: `make test-projection` and `make test-app` (unit, no pod needed);
`make test-app-e2e` runs the curation-console e2e against a running, seeded pod + proxy.

No official JSS image exists; the `Dockerfile` pins `javascript-solid-server@0.0.209`
from npm and adds `git` (required by the `--git` backend). Pinned deliberately — JSS is a
single-maintainer v0.0.x; we bump when we choose to.

Port `3838` (host) → `3000` (container), leaving `3000` free for a side-by-side CSS pod.

## Repo layout

- `.claude/skills/` — seven grounded, source-pinned reference skills (LWS, Solid, SHACL,
  Comunica, OKF, Semantic Markdown specs + JSS implementation docs). See `.claude/skills/README.md`.
- `docs/foundations/` — distilled canon + the **spec-vs-JSS conformance map** (`05-…`).
- `constrained-container/` — the standalone SHACL admission proxy (the L2 governance floor): writes
  through it are validated against an always-on base shape plus a per-container `ldp:constrainedBy`
  shape; a violation returns `422` + the teaching `sh:message`.
- `projection/` — the OKF **projection engine**: derives each container's `index.md` + `graph.ttl`
  from its cards (generic OKF base + a `wiki-memory` profile with typed edges and inverse
  materialization). `triggers/` runs it via a manual CLI or a WebSocket CDC watcher. The
  governed-projection / write-contract piece of L2.
- `app/` — the **wiki-memory curation console**: a static Solid/LWS app (vanilla custom elements, no
  build, vendored deps) to browse agent-written cards, traverse their typed graph across containers,
  and correct them through the floor. Also renders any OKF bundle. See `app/README.md`.
- `experiments/headless-cid/` — headless LWS-CID provisioning + auth round-trip probe.
- `tests/` — Vitest integration suite (the local verification gate; `make test`).
- `experiments/smoke.sh` — archived eval probe (superseded; evidence in the conformance map).
- **`FOLLOWUP.md`** — between-session state + open items. **Read this first when resuming.**

## What's enabled (and why)

| Flag | Evaluates |
|---|---|
| `--idp` | Built-in Solid-OIDC IdP + **headless** `POST /idp/credentials` — agents auth with no browser |
| `--mcp` | MCP server at `/mcp` — the agent consumption surface (CRUD, ACL, skills, subscribe, federation) |
| `--conneg` | Turtle ↔ JSON-LD content negotiation (Comunica compatibility) |
| `--git` | `git clone`/`push` backend — the versioning angle (a git working tree as storage) |
| `--notifications` | WebSocket change notifications |
| `--provision-keys` | Auto-generate a W3C CID v1 owner key per pod — the LWS-CID identity primitive |

Kitchen-sink surfaces (Nostr relay, WebRTC, tunnel, ActivityPub, terminal) stay **off** to
keep the evaluation focused on the substrate.

## Evaluation checklist (what "good" looks like)

**Verdict (2026-06-21): JSS is a good replacement for CSS — proceed to build the L2 memory layer
on it.** Evidence per axis below; full analysis in [`docs/foundations/05-jss-spec-conformance.md`](docs/foundations/05-jss-spec-conformance.md),
live probes in `experiments/smoke.sh` and `experiments/headless-cid/`.

- [x] Boots clean in a container; survives a restart with the volume (`make down && make up`;
      `make reset` wipes by design).
- [x] **Headless agent auth**: `POST /idp/credentials` returns a usable bearer (RS256 JWT; *not*
      DPoP-bound — replayable). The main draw works; the bearer-replay caveat is real.
- [x] **Agent surface**: `/mcp` lists tools; CRUD + ACL are WAC-gated (agent identity = WAC subject).
- [x] **Conneg**: resources round-trip `application/ld+json` ↔ `text/turtle`; containers expose
      `ldp:contains` with conneg-able RDF members (Comunica-traversable, per `docs/foundations/04`).
- [x] **Git**: a push materializes a first-class `ldp:contains` container member (queryable).
- [x] **LWS-CID identity**: profile is CID-shaped; key provisioning works **headless** (no browser
      doctor). Self-signed-JWT *auth* requires a public-IP WebID (JSS SSRF guard) — unverified locally.
- [x] **L2 port lands** (now built): JSS serves `.meta` + stores `ldp:constrainedBy`, so the
      `constrained-container/` SHACL-admission proxy ports; git push gives QuitStore-style
      versioning into the queryable graph. The build resolved the open details — ACL provisioning
      (seed grants per-container read), proxy auth on constraint reads (it fetches `.meta`/shape with
      the inbound bearer) — and projection runs out-of-process via `projection/triggers/` (manual CLI
      or CDC watcher), since JSS has no native in-process write hook.

## Context

Source clone read at `~/dev/git/JavaScriptSolidServer/JavaScriptSolidServer`. JSS is a
CTH-conformant, JSON-LD-native Solid server that already ships the LWS *authentication*
suite (not LWS storage — that stays Solid/LDP). The CSS-vs-JSS decision and the L2-port
analysis live in the `cogitarelink-solid` notes.
