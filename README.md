# lws-pod

The substrate for the **memory pods**, built on a containerized, pinned
[JavaScriptSolidServer](https://github.com/JavaScriptSolidServer/JavaScriptSolidServer) (JSS).

**Status:** JSS chosen over CSS; the L2 memory layer — OKF **projection engine** (`projection/`),
**SHACL admission floor** (`constrained-container/`), **curation console** (`app/`) — is built on
the local rung (`make up` / `make test`). Public dev/prod rungs (CRC/SAI VM) are deferred.

**Direction change (2026-06-28):** re-founded as a *general, standards-based memory substrate* —
structure is profile-imposed, the pod is the canonical home. Design of record:
[`docs/superpowers/specs/2026-06-28-general-memory-substrate-design.md`](docs/superpowers/specs/2026-06-28-general-memory-substrate-design.md).

**Substrate resolved (2026-06-29):** the LWS *storage* layer is built by **forking production JSS
0.0.210** ([`LA3D/JavaScriptSolidServer`](https://github.com/LA3D/JavaScriptSolidServer) @ `la3d/main`)
and adding LWS **in-process** — not a server-agnostic sidecar (the earlier framing), and not
`lwsd`/`tudor` (evaluated, rejected). Layering: **L1 container → L2 linkset + storage description →
L3 SHACL admission → L4 OKF projection (rewritten)**; **L1 + L2 are shipped** (the fork's PR #1 merged
into `la3d/lws`, PR #2 open) — L2 is container-validated, incl. the public-Caddy-rung scheme proof
(`make up-fork-tls`). Design of
record: [`docs/superpowers/specs/2026-06-29-lws-storage-layer-design.md`](docs/superpowers/specs/2026-06-29-lws-storage-layer-design.md).
**[`FOLLOWUP.md`](FOLLOWUP.md) is the single source of current state — read it first when resuming.**

JSS gives us what CSS does *not*: a self-issued agent-identity stack (LWS-CID / did:nostr),
headless agent auth, an MCP agent surface, and git-backed versioning. The L2/L3/L4 machinery in this
repo (governed projection, write contract, SHACL admission, curation) is the memory-layer IP that
rides on top of the LWS-mode JSS fork.

## Run

```bash
make setup     # first time only — creates .env.local + `npm ci` in every subproject
make doctor    # preflight: confirms Docker can actually start containers (see note below)
make up        # build + start  (http://localhost:3838)
make logs      # tail
make test      # Vitest e2e: pod create -> headless token -> write/read -> MCP -> git
make reset     # wipe ./data, rebuild, restart  (deletes the local pod by design)
make down      # stop, keep ./data (persistence check: down && up preserves the bind-mount)
```

### Host prerequisites (a fresh clone does NOT carry these)

The base `make up` / `make test` path needs only **Docker Desktop running** (`make doctor` checks
it). The **TLS rigs** below additionally need host-level setup that lives outside the repo — run
**`make doctor-tls`** first; it checks each and prints the exact fix. The three it can't auto-install:

1. **mkcert** (locally-trusted certs): `brew install mkcert nss` (then optionally `mkcert -install`
   to trust the CA system-wide; the rigs pass `--cacert certs/rootCA.pem` so it isn't required).
2. **`pod.vardeman.me` in `/etc/hosts`** → `echo '127.0.0.1 pod.vardeman.me' | sudo tee -a /etc/hosts`
   (host-specific, never committed; both TLS rigs use this hostname).
3. **Docker** + a free host port (`:443` for the fork rig, `:8443` for the LWS-CID pod).

### TLS rigs

```bash
make doctor-tls                                  # preflight the host setup above
make cert                                        # mkcert ./certs for pod.vardeman.me (gitignored)

# (a) Scheme-fix / public-Caddy-rung rehearsal — the FORK (L1+L2, --lws) behind a TLS-terminating
#     Caddy proxy. Proves request.protocol / X-Forwarded-Proto: a plain-http JSS behind TLS
#     emits https in the storage description id + Link rels (an in-JSS-TLS pod can't show this).
make up-fork-tls
curl --cacert certs/rootCA.pem https://pod.vardeman.me/.well-known/lws-storage   # id MUST be https://
make down-fork-tls                               # -v cleans the throwaway pod volume

# (b) LWS-CID auth experiment — in-JSS-TLS pod (TLS terminated inside JSS) on :8443.
make up-tls && make cid-tls
```

The fork rigs build the **fork** (`LA3D/JavaScriptSolidServer`, L1+L2) from a pinned **git ref** via
`Dockerfile.fork` (`npm install -g git+…#<SHA>`, default = L2 HEAD; override `JSS_GIT_REF`), with
`--lws` enabled — separate from the committed image, which still installs the published npm package
(below). The fork-TLS rig runs under its own compose project (`lws-pod-forktls`) so it never disturbs
`lws-pod-local`.

**Clean checkout / new machine:** `node_modules/` and `.env.local` are gitignored, so a fresh clone
has neither — `make setup` is the one-shot bootstrap that creates both (the compose and test targets
also self-heal the env file and root/projection deps, so `make up` / `make test` work without it).
If a build dies at the first `RUN` with `runc … can't get final child's PID from pipe: EOF`, a
freshly installed/updated Docker Desktop can't start containers yet — run `docker desktop restart`,
wait, and retry. `make doctor` checks for exactly this.

L2 component gates: `make test-projection` and `make test-app` (unit, no pod needed);
`make test-app-e2e` runs the curation-console e2e against a running, seeded pod + proxy.

**LWS storage-discovery gate** (`make test-lws`): the live-pod harness for the L2 surfaces — storage
description, `rel=storageDescription`/`rel=linkset` headers, per-resource linkset + `lws+json` conneg —
run against the **fork** `--lws` pod at `https://pod.vardeman.me` (needs `make up-fork-tls` + `make
cert`). `tests/lws-discovery.test.mjs` self-skips on a non-`--lws` pod, so plain `make test` against the
base pod stays green (it reports the L2 suite as skipped).

### Profiles

`/profiles/` on the pod is the **profile-authority layer** (Plan 2, `docs/superpowers/specs/2026-07-04-profile-mechanism-design.md`,
governed by `docs/design-notes/layer-cake-principles.md`): W3C PROF descriptors (`prof:Profile`,
`prof:isProfileOf`, `prof:hasRole`) for the substrate floor, the OKF base, and the llm-wiki adoption
profile, plus pinned byte-identical mirrors of upstream vocab/shapes and an `index.jsonld` the pod
advertises via `ProfileIndexService` in its storage description. Source tree: `projection/profiles/defs/`;
declaration-time checks + the publish/bind step: `projection/publish/`.

```bash
make publish-profiles   # needs POD_TOKEN (owner bearer) — PUTs descriptors/mirrors, then binds
                         # dct:conformsTo + powder:describedby onto the target containers
make test-profiles      # live gate — needs `make up-fork-tls` (the fork pod, --lws-profile-index)
```

**ACL caveat:** JSS auto-creates new containers **owner-only**. `/alice/profiles/**` and any container
you bind a profile to need an explicit public-read `.acl` *before* `make publish-profiles`/binding, or
unauthenticated profile resolution (and the live gate) will 401/403 — see the reproducible sequence in
`.superpowers/sdd/task-10-report.md`.

No official JSS image exists; the `Dockerfile` pins `javascript-solid-server@0.0.209`
from npm and adds `git` (required by the `--git` backend). Pinned deliberately — JSS is a
single-maintainer v0.0.x; we bump when we choose to.

Port `3838` (host) → `3000` (container), leaving `3000` free for a side-by-side CSS pod.

## Repo layout

- `.claude/skills/` — seven grounded, source-pinned reference skills (LWS, Solid, SHACL,
  Comunica, OKF, Semantic Markdown specs + JSS implementation docs). See `.claude/skills/README.md`.
- `docs/` — the doc map, by register: [`FOLLOWUP.md`](FOLLOWUP.md) = current state + open items
  (read first); [`docs/ROADMAP.md`](docs/ROADMAP.md) = forward plan; `docs/foundations/` = distilled
  canon + the **spec-vs-JSS conformance map** (`05-…`); `docs/design-notes/` = active design
  deliberation (**exploratory, not canon**); `docs/superpowers/` = build history (archive);
  `docs/archive/` = superseded docs.
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
