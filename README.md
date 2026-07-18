# lws-pod

An implementation of **W3C Linked Web Storage (LWS)** with **W3C PROF profiles**, built on a
containerized, version-pinned fork of
[JavaScriptSolidServer](https://github.com/o-development/JavaScriptSolidServer) (JSS).
Structure is imposed by profiles, never baked in — the substrate presupposes no application.
The **memory pod** (wiki-memory profile family) is the first application built on it; a DCAT
data catalog is the second, onboarded as pure data on the same unmodified substrate.

**Experimental rig, not production.** The committed image pins `javascript-solid-server@0.0.209`
from npm (a single-maintainer v0.0.x — we bump deliberately); the fork rigs build
[`LA3D/JavaScriptSolidServer`](https://github.com/LA3D/JavaScriptSolidServer) from a pinned git ref.

## Why this is useful for agents

The working thesis: **typed, progressively-disclosed memory helps agents more than flat
retrieval.** The pod is the rig that tests it.

- **A memory is one URL with two negotiable faces.** The canonical resource is markdown
  **content** — what an agent (or Obsidian, or git) reads. Its typed edges live in a separate
  **links** representation (flat JSON-LD, `…/id/{slug}#it` subjects) that connects memories into
  a navigable graph. Conversion between prose and graph is lossy both ways, so the two are
  representations *by profile*, selected with `Accept-Profile` — never conflated by media type.
- **The floor governs the links, not the prose.** Writes into a bound container are
  SHACL-validated against the profile's shapes; a violation returns a teaching `400` whose
  `sh:message` tells the agent how to fix its write. Content quality stays an agent/application
  concern; graph navigability is enforced.
- **Everything is self-describing over HTTP.** The pod advertises its own services,
  capabilities, profiles, and per-resource affordances. Five cold-agent probes (fresh agent,
  pod URL + CA cert only, zero project context) reconstructed the whole model — profile
  inheritance, write rules, identity policy, content-vs-links — from the pod's affordances alone.
- **Applications are data.** A new application = a PROF descriptor + shapes + context +
  representation declarations, published and bound with no substrate code change. The wiki
  family and the DCAT family prove the point in both directions.

## What the pod speaks

LWS storage (`items[]` containers, storage description with `capability[]`), RFC 9264 linksets,
**content negotiation by profile** (W3C DX-PROF-CONNEG `cnpr:http`), Type Index/Search
(`?type=`, `?conformsTo=`), SHACL admission, Solid-OIDC with **headless** agent credentials, an
MCP agent surface (`/mcp`, model-driven `read_resource`/`list_resources`), git-backed
versioning, and WebSocket change notifications.

The probe-proven cold read recipe:

1. `GET /.well-known/lws-storage` — services + capabilities.
2. Follow `ProfileIndexService` — the profile families and the default.
3. `GET <resource>` with `Accept: application/linkset+json` — a member's linkset carries
   `up`/`type`; the **container's** carries `describedby` (shapes) + `conformsTo` (profile); a
   multi-representation resource lists `canonical`/`alternate` with `type=` (media) and
   `formats=` (profile).
4. Select with `Accept-Profile: <profile-uri>` — `200` the canonical representation, or
   `303 See Other` to the alternate.
5. Find members across containers with `/types/search?type=…` or `?conformsTo=…`.

## Quick start

```bash
make setup     # first time only — creates .env.local + `npm ci` in every subproject
make doctor    # preflight: confirms Docker can actually start containers
make up        # build + start the base npm pod  (http://localhost:3838)
make logs      # tail
make test      # e2e: pod create -> headless bearer -> write/read -> MCP -> git
make down      # stop, keep ./data
make reset     # wipe ./data, rebuild, restart (deletes the local pod by design)
```

Host port `3838` → container `3000`. If a build dies with `runc … can't get final child's PID
from pipe: EOF`, a freshly installed/updated Docker Desktop can't start containers yet — run
`docker desktop restart`, wait, retry (`make doctor` checks for exactly this).

## TLS rigs (the fork)

The LWS features live in the fork, which runs behind TLS. Host prerequisites (outside the repo —
`make doctor-tls` checks each and prints the fix): `mkcert` (`brew install mkcert nss`),
`pod.vardeman.me` in `/etc/hosts` (`echo '127.0.0.1 pod.vardeman.me' | sudo tee -a /etc/hosts`),
and a free host port (`:443` fork rig, `:8443` CID pod).

```bash
make cert            # mkcert ./certs for pod.vardeman.me (gitignored)
make up-fork-tls     # the fork (--lws) behind a TLS-terminating Caddy at https://pod.vardeman.me
make down-fork-tls   # -v cleans the throwaway pod volume

make up-tls && make cid-tls   # LWS-CID auth experiment — in-JSS-TLS pod on :8443
```

`Dockerfile.fork` builds the fork from a pinned git ref (override `JSS_GIT_REF`) with `--lws`
`--lws-config /alice/profiles/pod-config.jsonld` enabled — one pod resource (published by `make
publish-profiles`) declares the LWS service pointers as data, replacing the old
`--lws-profile-index`/`--lws-void` path flags outright (no deprecation aliases). The rig runs
under its own compose project (`lws-pod-forktls`), so it never disturbs the base `lws-pod-local`
pod.

## Verification (the gates)

Unit gates need no pod; live gates run against the fork TLS rig (`make cert && make up-fork-tls`).

| Target | Proves | Needs |
|---|---|---|
| `make test-projection` | neutral PROF mechanism + publish checks; wiki renderers/triggers | — |
| `make test` | base-pod e2e: lifecycle, headless auth, MCP, git | `make up` |
| `make test-lws` | storage description + per-resource linksets | fork rig |
| `make test-l3` | SHACL admission floor (teaching 400s) | fork rig |
| `make test-typeindex`, `make test-indexed-relation` | Type Index/Search, indexed relations | fork rig |
| `make test-graph` | named-graph JSON-LD storage + derived views | fork rig |
| `make test-conneg` | content negotiation by profile (`cnpr:http`); 304-never-beats-406; `--lws-config`-driven service presence | fork rig |
| `make test-preservation` | Turtle stored/served as its own bytes (no JSON-LD envelope); write-time name/type teaching 400 | fork rig |
| `make test-profiles` | the PROF walk + profile-index advertisement | fork rig + `make publish-profiles` |
| `make test-dcat` | zero-code application onboarding (its setup IS the recipe) | fork rig |
| `make test-wiki` | the wiki family end-to-end: bind → instantiate → negotiate | fork rig + `make publish-profiles` |
| `make test-mcp-v2` | the 10-tool MCP agent surface (wait ~70s between runs — anon rate limit) | fork rig |
| `make test-void` | `/.well-known/void` gateway + pod-dereferenceable-vocabulary rail | fork rig + `make publish-profiles` |
| `make test-services` | per-storage services (R7-R11): scoped SD advertisement, scope isolation, direct VoID deref, ServerIndex extension array, conditional/reserved/no-oracle posture, private-pod parity | fork rig + `make seed-multitenant` |

## Profiles

`projection/profiles/defs/` holds the profile data — PROF descriptors (`isProfileOf`, roles,
representation declarations), shapes, contexts, and pinned byte-identical upstream mirrors —
for four families: the substrate floor, okf-base, llm-wiki (application #1), and dcat-catalog
(application #2). `make publish-profiles` runs declaration-time checks (fail-loud, nothing
written on failure), PUTs the tree, binds containers (`dct:conformsTo` +
`powder:describedby`), and instantiates renderer-free representations (`--instantiate`).

**ACLs are automatic — and probe-first.** JSS creates containers owner-only; `make
publish-profiles` provisions public-read + owner-control ACLs by default (`isDefault: true`
both) on the profiles container and every `--bind`/`--instantiate` target, via the pod's own MCP
`write_acl` (`--no-acl` opts out). Provisioning only fires where no `.acl` exists yet (review #1,
2026-07-12): an ACL you hand-tightened is left untouched by `publish-profiles`/`reinstantiate`,
never silently re-opened. The owner WebID comes from the bearer's own `webid` claim (`--owner`
overrides; nothing is written if neither resolves — review #11), so the CLI is pod-agnostic. The
old manual `write_acl` recipe (recorded as an open OPS gap three times since 2026-07-04) is gone
— a fresh reseed is one command: `POD_TOKEN=… make publish-profiles`.

### Derived-view freshness

`instantiate()` materializes aggregate/derived representations (e.g. a container's
`graph.jsonld`, the wiki family's `index.md` nav channel) from a container's *current* members
at the moment it runs. Those materialized resources are **build products, not live views** —
writing, editing, or deleting a member does **not** auto-refresh them. A deleted member's data
can linger in `graph.jsonld` until the next instantiate.

`make reinstantiate` is the refresh: it re-runs bind+instantiate for every manifest family
(alias of `make publish-profiles` — re-PUTting the defs tree is idempotent, ACL provisioning
skips targets that already have an `.acl`, and bind+instantiate is the part that actually needs
re-running). Run it after any batch of member writes/deletes where an aggregate view needs to
reflect current state.

There is no CDC/watcher runtime keeping aggregates live-synced on every write — the wiki family
ships a WebSocket trigger (`apps/wiki-projector/triggers/`) as an *application-level* option, but
running a background watcher for every profile family is a deliberate **non-goal** of the
substrate itself until an application actually needs push-freshness. Pull-refresh
(`make reinstantiate`, or the app's own CLI trigger) is the supported story today.

## Repo layout

- `projection/` — the neutral **PROF mechanism**: `prof/` (PROF walk, authority resolution,
  `instantiate()` — materialize declared representations + advertise `altr:`), `publish/`
  (onboarding), `profiles/defs/` (profile data). Substrate-neutral — P13's standing gate is
  [`docs/foundations/06-code-placement-audit.md`](docs/foundations/06-code-placement-audit.md).
- `apps/wiki-projector/` — application #1's tooling: markdown cards, identity, the OKF nav
  channel, `renderers.mjs` (content/links/index/graph representations), `triggers/` (CLI
  one-shot + WebSocket CDC watcher, driven by `instantiate()`).
- **Human surface** — server-side: llm-wiki HTML faces (`card.md.html`, `index.html`, `viz.html`)
  materialized by `apps/wiki-projector`, plus the fork's navigator views (`?view=nav`). Design:
  `docs/superpowers/specs/2026-07-15-human-viewing-surface-design.md`.
- `tests/` — the live gates (table above) + the base-pod e2e suite.
- `experiments/` — spikes: `headless-cid/` (LWS-CID auth probe), `agent-eval/` (cold-agent
  battery over the pod's own MCP tools), `keycloak-jss/` (authz spike).
- `.claude/skills/` — grounded, source-pinned spec/implementation reference skills
  (see `.claude/skills/README.md`).
- `docs/` — by register: [`FOLLOWUP.md`](FOLLOWUP.md) = current state (**read first**);
  [`docs/ROADMAP.md`](docs/ROADMAP.md) = forward plan; `docs/foundations/` = distilled canon
  incl. the spec-vs-JSS conformance map (`05-…`); `docs/design-notes/` = active deliberation
  (**not canon**); `docs/superpowers/` = build history.

## History & status

Re-founded as a general substrate 2026-06-28
([spec](docs/superpowers/specs/2026-06-28-general-memory-substrate-design.md)); the storage
layer is built by forking JSS and adding LWS **in-process** — not a sidecar, not `lwsd`/`tudor`
(2026-06-29 [spec](docs/superpowers/specs/2026-06-29-lws-storage-layer-design.md)). The full
layering — L1 containers → L2 discovery → L3 admission → L4 profile-defined projection with
content negotiation by profile — is shipped and live-gated; round-by-round record in
[`FOLLOWUP.md`](FOLLOWUP.md). The 2026-06-21 JSS-over-CSS evaluation verdict and its evidence
live in [`docs/foundations/05-jss-spec-conformance.md`](docs/foundations/05-jss-spec-conformance.md).

Known caveats: the headless RS256 bearer is replayable (not DPoP-bound) — fine for a trusted
local agent only; LWS-CID auth is proven locally only.
