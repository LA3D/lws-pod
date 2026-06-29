# CLAUDE.md — lws-pod

Containerized, version-pinned **JavaScriptSolidServer (JSS)** serving as the substrate for
**memory pods**: a general, standards-based (Solid / Linked Web Storage) memory store where
*structure is imposed by a profile, not baked in*, and the pod is the canonical home (Obsidian and
git are clients). On top of JSS we build the **L2 memory layer** — an OKF projection engine, a SHACL
admission floor, and a curation console. Thesis under test: typed, progressively-disclosed memory
helps agents more than flat retrieval.

JSS replaces the Community Solid Server (CSS). It adds what CSS lacked — self-issued agent identity
(LWS-CID / `did:key`), headless agent auth, an MCP agent surface, and git-backed versioning.

## Read first (orientation)

Progressive disclosure — start at the top, descend on demand. Read these on demand; they are not
inlined here.

- **`FOLLOWUP.md`** — single source of current state + open items. **Read first when resuming.**
- **`docs/ROADMAP.md`** — forward sequencing (carries the 2026-06-28 direction-change banner).
- **`README.md`** — run instructions + repo layout.
- **`docs/foundations/`** — the four canon docs + `05-jss-spec-conformance.md` (spec-vs-JSS map).
- **`docs/design-notes/`** — active deliberation, **exploratory, NOT canon** (don't build from it as settled).
- **`.claude/skills/`** — seven grounded, source-pinned spec/implementation reference skills (`.claude/skills/README.md`).

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
make test-app           # curation-console unit tests (no pod needed)
make test-app-e2e       # console e2e — needs pod :3838 + proxy :8080, seeded
```

`make up` and `make test*` self-heal a missing `.env.local` and `node_modules`, so they work even if
you skip `make setup`. TLS variant (LWS-CID auth experiment): `make cert && make up-tls && make cid-tls`.

## Architecture (where things live)

- **`Dockerfile` / `docker-compose*.yml`** — JSS pinned to `0.0.209`; enabled flags `--idp --mcp
  --conneg --mashlib-cdn --git --notifications --provision-keys` (Dockerfile comments explain each).
  Base+override compose: `docker-compose.yml` (env-neutral) + `docker-compose.local.yml`.
- **`projection/`** — OKF projection engine. `okf/` = generic floor (identity, card→quads, channels);
  `profiles/wiki-memory/` = the typed-edge profile; `triggers/` = CLI one-shot + WebSocket CDC watcher.
- **`constrained-container/`** — standalone SHACL admission proxy (the L2 governance floor): a write
  is validated against a base shape + per-container `ldp:constrainedBy`; a violation returns `422`
  plus the teaching `sh:message`. (`constrained-container/README.md`)
- **`app/`** — wiki-memory curation console: static Solid/LWS app, vanilla custom elements, no build
  step, vendored deps. (`app/README.md`)
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

- **`projection/profiles/wiki-memory/` test suite is RED by design.** Its `extract.mjs` still calls
  `cardToQuads` with three args (no identity policy), so `policy.mint` is undefined — the documented
  Plan-1→Plan-2 ripple (see FOLLOWUP). The `okf/` floor is fully green. **Do not "fix" it by reverting
  Plan 1**; it is resolved when Plan 2 threads the policy through the profile.
- **A fresh Docker Desktop often can't start any container** (`runc … can't get final child's PID
  from pipe: EOF`) — run `docker desktop restart`, wait, retry. `make doctor` checks for this.
- **The RS256 owner bearer is replayable** (not DPoP-bound) — fine for a trusted local agent; an
  untrusted/networked agent wants the self-signed LWS-CID path (needs a public-IP rung).
- **LWS-CID auth is proven locally only** (patched TLS pod). `PATCH_CID_PRIVATE_IPS` relaxes JSS's
  SSRF guard for that local proof — **it must stay `false` for any public build.**

<!-- Maintainer note: keep this under ~200 lines. Between-session state lives in FOLLOWUP.md, not
     here — update FOLLOWUP for current state; update CLAUDE.md only for durable conventions. -->
