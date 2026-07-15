# CLAUDE.md — lws-pod

Containerized, version-pinned **JavaScriptSolidServer (JSS)** carrying an implementation of **W3C
Linked Web Storage (LWS)** with **W3C PROF profiles**. *That is the substrate's whole identity*: a
general linked-web-storage pod where structure is imposed by profiles, never baked in — nothing in
the substrate or the profile mechanism may presuppose any particular application. The **first
application** built on it is a memory pod (the wiki-memory profile family: OKF projection engine,
SHACL admission floor, curation console; the pod is the canonical home, Obsidian and git are
clients), under the thesis that typed, progressively-disclosed memory helps agents more than flat
retrieval. Other applications = other profiles (data catalogs, RO-Crate, sensor data, …) on the
same unmodified substrate — `docs/foundations/06-code-placement-audit.md` (P13) is the standing gate on this
separation.

**Substrate (RESOLVED 2026-06-29).** The target is **LWS** — the W3C standardization successor to
Solid (`.claude/skills/lws-protocol` grounds the spec). No server implements the LWS *storage* layer
yet (`lwsd`/`tudor` were evaluated and rejected — immature, AGPL, and themselves LDP-`contains` not
`items[]`). So we **fork production JSS** — [`LA3D/JavaScriptSolidServer`](https://github.com/LA3D/JavaScriptSolidServer),
branch `la3d/main` = pristine pin of upstream **0.0.210** — and add the LWS storage layer
**in-process** (small, additive edits to clean Fastify modules), **not** a server-agnostic sidecar
(the earlier framing). JSS already ships the **LWS-CID authentication** suite (identity is done),
plus MCP, headless auth, git versioning, and is JSON-LD-native; it replaced the Community Solid
Server (CSS), which lacked the agent-identity stack entirely. **L1 (the `lws+json` container) is
shipped;** the L2/L3/L4 toolkits in *this* repo (projection, SHACL admission, console — see below)
ride on top of that fork. Current state + the L1–L4 layering + the active branch: **`FOLLOWUP.md` (read first).**

## Read first (orientation)

Progressive disclosure — start at the top, descend on demand. Read these on demand; they are not
inlined here.

- **`FOLLOWUP.md`** — single source of current state + open items. **Read first when resuming.**
- **`docs/ROADMAP.md`** — forward sequencing (carries the 2026-06-28 direction-change banner).
- **`README.md`** — run instructions + repo layout.
- **`docs/foundations/`** — the four canon docs + `05-jss-spec-conformance.md` (spec-vs-JSS map).
- **`docs/design-notes/`** — active deliberation, **exploratory, NOT canon** (don't build from it as settled).
- **`.claude/skills/`** — twelve grounded, source-pinned spec/implementation reference skills (`.claude/skills/README.md`).

**Direction of record (2026-06-28):** re-founded as a general substrate. Design of record is
`docs/superpowers/specs/2026-06-28-general-memory-substrate-design.md`. The reconciliation (profile
mechanism + threading the identity policy through the projection) is a **later implementation
round** — do not re-brainstorm the design; FOLLOWUP holds the next-session entry point.

## Commands

First time on a machine:

```bash
make setup     # creates .env.local + `npm ci` in every subproject (both are gitignored)
make doctor    # preflight: confirms Docker can actually start containers
```

Run + verify (host port 3838 → container 3000):

```bash
make up                 # build + start  (http://localhost:3838)
make logs               # tail
make down               # stop, keep ./data
make reset              # wipe ./data, rebuild, restart (deletes the local pod by design)
make test               # substrate e2e (needs the pod up): create -> bearer -> write/read -> MCP -> git
make test-projection    # projection unit + e2e (see "known state" below)
make test-wiki          # live gate — re-derived wiki family (needs make up-fork-tls; see README)
```

`make up` and `make test*` self-heal a missing `.env.local` and `node_modules`, so they work even if
you skip `make setup`.

**TLS rigs (host-level setup the repo can't carry — run `make doctor-tls` first; it checks each and
prints the fix):** need `mkcert` (`brew install mkcert nss`), `pod.vardeman.me` in `/etc/hosts`
(`echo '127.0.0.1 pod.vardeman.me' | sudo tee -a /etc/hosts`), and a free host port. Then:
- **`make cert && make up-fork-tls`** — the **fork** (L1+L2, `--lws`) behind a TLS-terminating **Caddy**
  proxy at `https://pod.vardeman.me/` (verify: `curl --cacert certs/rootCA.pem https://pod.vardeman.me/.well-known/lws-storage`).
  Builds the fork from a pinned **git ref** (`Dockerfile.fork`, override `JSS_GIT_REF`); reproduces the public
  Caddy/`X-Forwarded-Proto` rung. Own compose project (`lws-pod-forktls`), so it never touches `lws-pod-local`.
- **`make cert && make up-tls && make cid-tls`** — in-JSS-TLS pod on `:8443` for the LWS-CID auth experiment.

The committed `Dockerfile`/`docker-compose*.yml` install the **published npm JSS** (no `--lws`); the
fork lives only in the `*.fork*` files + `caddy/`. Full rig notes: `README.md` "TLS rigs" + `FOLLOWUP.md`.

## Architecture (where things live)

- **`Dockerfile` / `docker-compose*.yml`** — JSS pinned to `0.0.209`; enabled flags `--idp --mcp
  --conneg --mashlib-cdn --git --notifications --provision-keys` (Dockerfile comments explain each).
  Base+override compose: `docker-compose.yml` (env-neutral) + `docker-compose.local.yml`.
- **`projection/`** — the NEUTRAL PROF mechanism (split executed, conneg-by-profile Phase 2,
  2026-07-10): `prof/{resolve,profile-loader,profile-doc,instantiate,derived-view,jsonld-graph,
  materialize,rdf,namespaces}.mjs` — PROF walk, authority resolution, `instantiate()` (bind + ACLs +
  materialize every declared representation + advertise `altr:`); `publish/` = declaration-time
  checks + the publish/bind/`--instantiate` step; `profiles/defs/` = profile definition sources (PROF
  descriptors, `lwspr:representation` roles, pinned upstream mirrors — `llm-wiki/` and
  `dcat-catalog/` each declare their own `*.rep.jsonld` artifacts).
- **`apps/wiki-projector/`** — application #1's tooling (demoted out of `projection/` per P13):
  `card.mjs`/`identity.mjs`/`frontmatter.mjs`/`index-channel.mjs`/`engine-profile.mjs` (markdown
  cards, OKF nav channel) + `renderers.mjs` (the wiki family's representation renderers: content =
  the card itself, `links` = flat `#it` JSON-LD, `index` = the OKF channel, `graph` = the dataset
  aggregate) + `triggers/` (CLI one-shot + WebSocket CDC watcher, now driven by `instantiate()`).
- **Human surface** — server-side now, not a client app: llm-wiki HTML faces materialized by
  `apps/wiki-projector` + the fork's navigator (Drive-shell browsing UI). Design of record
  `docs/superpowers/specs/2026-07-15-human-viewing-surface-design.md`; the curation console
  (`app/`) it superseded is retired (git history keeps it).
- **`experiments/`** — spikes (`headless-cid/` LWS-CID auth probe, `keycloak-jss/` authz spike).
- **`tests/`** — root Vitest integration suite (the `make test` gate).

## Conventions

- **JSS is pinned** (`0.0.209`, via `JSS_VERSION` in `.env.local`). Bump deliberately — it is a
  single-maintainer v0.0.x. No official image exists; the Dockerfile builds from the npm package.
- **Local state is gitignored** (`node_modules/`, `.env.local`, `data/`, `certs/`). A clean checkout
  has none — `make setup` bootstraps it. Never commit these.
- **Grounded-skills contract:** every file under `.claude/skills/<name>/` is verbatim from a pinned
  upstream (`UPSTREAM.md`). No project decisions or eval results live in a skill — those go in
  `docs/foundations/` + `FOLLOWUP.md`. Verify with `scripts/check-skill-grounding.sh`.
- **Substantial workstreams** go brainstorm → spec → plan → subagent implementation; specs and plans
  live in `docs/superpowers/`.
- **Code style:** fastai philosophy — brevity, clarity, abbreviations for common things, comments
  only to explain *why*. Match the surrounding code.

## Git

Small team (two agents); we work **directly on `main`** for now. Commit format:

```
[Agent: Claude] type(scope): subject

- specific change
- specific change

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
```

Never force-push to `main`, skip hooks, or `git add -A`. Stage specific files.

## Known state & gotchas

- **The L4 read-side round (referent identity & discovery) is DONE (2026-07-13)** — was "NEXT = the
  L4 read-side design round"; minted subject-IRI names now dereference (algorithmic 303 uriSpace
  resolver) and typed referents are now type-searchable (`.lwstypes` enriched by the body's
  `rdf:type`, not just the storage class). The single L4 read-side carryover the debt-drain round
  routed forward is drained. See the top block of `FOLLOWUP.md` for the round detail and NEXT.
- **`apps/wiki-projector/` suite is RE-DERIVED GREEN** (conneg-by-profile Phase 2, 2026-07-10) — the
  old RED fence (`okf/red-fence.test.mjs`) is deleted with the legacy `projection/okf/` floor it
  guarded; see `FOLLOWUP.md` for the round detail.
- **A fresh Docker Desktop often can't start any container** (`runc … can't get final child's PID
  from pipe: EOF`) — run `docker desktop restart`, wait, retry. `make doctor` checks for this.
- **The RS256 owner bearer is replayable** (not DPoP-bound) — fine for a trusted local agent; an
  untrusted/networked agent wants the self-signed LWS-CID path (needs a public-IP rung).
- **LWS-CID auth is proven locally only** (patched TLS pod). `PATCH_CID_PRIVATE_IPS` relaxes JSS's
  SSRF guard for that local proof — **it must stay `false` for any public build.**

<!-- Maintainer note: keep this under ~200 lines. Between-session state lives in FOLLOWUP.md, not
     here — update FOLLOWUP for current state; update CLAUDE.md only for durable conventions. -->
