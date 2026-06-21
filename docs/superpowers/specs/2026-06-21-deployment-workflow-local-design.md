# Deployment workflow — local rung (design)

Date: 2026-06-21
Status: approved (local rung only; public rungs deferred)

## Context

The JSS substrate evaluation is done (verdict: proceed — see `FOLLOWUP.md`,
`docs/foundations/05-jss-spec-conformance.md`). We are leaving experiment phase and building
the memory pods on JSS. The eval scaffolding (`docker-compose.yml`, `docker-compose.tls.yml`,
the `make` targets) was single-purpose and labeled "eval spike"; it needs to become a real,
multi-environment deployment workflow.

The target ladder is **local → public-dev (staging) → public-prod**. This spec builds **only the
local rung**. The public rungs are designed-for (the structure must accept them with no rework)
but explicitly out of scope here.

### Decisions already made (brainstorm, 2026-06-21)

- **Public hosting:** CRC/SAI **provisioned VM(s)**, Docker Compose + Caddy reverse proxy.
- **Public hostnames:** institutional `*.crc.nd.edu` (e.g. `pod-dev.crc.nd.edu`,
  `pod.crc.nd.edu`). TLS cert source is a per-env knob (mounted institutional wildcard *or*
  Caddy/Let's Encrypt).
- **Deploy trigger:** manual `make` targets now; designed so GitHub Actions CI/CD wraps the same
  targets later without rework.
- **Config layout:** approach A — a base compose file + per-env override files + per-env `.env`.
- **LWS-CID constraint (load-bearing):** JSS hardcodes `blockPrivateIPs: true` in
  `src/auth/cid-doc-fetch.js` (no config knob). The self-signed LWS-CID auth round-trip therefore
  cannot be verified on a loopback/private-IP deployment. It is **not a local concern** — it
  graduates to the first public rung, which has real public DNS + TLS. The practical local/headless
  credential remains the replayable RS256 bearer.

## Scope (this rung)

Build the local development environment as the base + local override of an approach-A layout,
plus the make targets to drive it and verify it.

### Out of scope (deferred, but not blocked)

- `docker-compose.dev.yml` / `docker-compose.prod.yml`, Caddy, institutional cert mounting,
  per-env secrets management, CI/CD.
- The L2 layer itself (`constrained-container` admission proxy, projection-on-write /
  git-commit-on-write sidecar). The base compose only leaves a seam for these as future services.
- Any change to the LWS-CID / TLS eval artifacts beyond leaving them in place.

## Architecture

```
docker-compose.yml            base: the `jss` service (build, image, /data volume,
                              healthcheck, restart). No ports, no env-specific bits.
  + docker-compose.local.yml  local override: host port mapping + bind-mount ./data
  + .env.local                local values (gitignored)

.env.example                  committed template
Makefile                      local targets wrap the `-f base -f local` stack
Dockerfile                    unchanged (JSS 0.0.209, git+tini, flags in CMD)
```

### Files

| File | Role | Action |
|---|---|---|
| `Dockerfile` | JSS 0.0.209 pinned; git+tini; common flags (`--idp --mcp --conneg --mashlib-cdn --git --notifications --provision-keys`) in `CMD` | keep as-is |
| `docker-compose.yml` | **base** — `jss` service definition only: `build` (with `JSS_VERSION` arg from env), `image`, `/data` volume, `healthcheck`, `restart`. Carries nothing env-specific (no `ports`, no host paths). | refactor from current eval file |
| `docker-compose.local.yml` | **local override** — publishes the host port; replaces the named volume with a bind-mount `./data:/data` for on-disk inspection of the git-backed pod | new |
| `.env.example` | committed template documenting the knobs: `JSS_VERSION`, `JSS_HOST_PORT` | new |
| `.env.local` | real local values; gitignored | new |
| `Makefile` | local targets pinned to the local stack | refactor |
| `tests/` + `package.json` + `vitest.config.mjs` | **Vitest integration suite** — black-box HTTP/e2e checks against a running local pod, ported from `smoke.sh` | new |
| `smoke.sh` | bash eval probe; superseded by the test suite | **archive** to `experiments/` (eval evidence, no longer the verification path) |

### Deliberate local choices

1. **Bind-mount `./data:/data`** (not a named volume). The memory-pod work needs to inspect the
   LDP containers and git repos JSS writes; a bind-mount makes them visible on the host at
   `./data`. (`data/` is already gitignored.) Named volume is the right call for public rungs —
   that is a `.prod.yml` concern, not here.
2. **http on a fixed host port.** Fast iteration, no cert friction. Default host port `3838`
   (kept to avoid churn with `smoke.sh` / existing docs; configurable via `JSS_HOST_PORT`).
3. **No Caddy locally.** Caddy is a public-rung concern (TLS termination). Local talks to JSS
   directly.

### Make targets (local)

All pin the stack `-f docker-compose.yml -f docker-compose.local.yml` so the override soup is
never typed by hand:

| Target | Behavior |
|---|---|
| `make up` | build (if needed) + `up -d`; print the local URL |
| `make down` | stop the stack |
| `make logs` | follow logs |
| `make reset` | down + wipe `./data` + rebuild + up (fresh pod) |
| `make test` | run the Vitest suite against the local `BASE` — the "check the local development" step |
| `make shell` | shell into the running container |

### Verification ("check the local development") — Vitest integration suite

The eval-era `smoke.sh` proved the substrate works; that job is done and its evidence is captured
in `docs/foundations/05-jss-spec-conformance.md`. It is **archived** (moved to `experiments/`),
not deleted, and replaced by a formal **Vitest** integration suite as the ongoing verification gate.

- **Shape:** black-box e2e tests against a *running* local pod. The suite reads `BASE`
  (`http://localhost:<JSS_HOST_PORT>`) and asserts over real HTTP — no JSS internals, no
  testcontainers. `make test` assumes `make up` has run (and can depend on it).
- **Tooling:** Vitest + `fetch` (Node 22). A top-level `package.json` (the project's first) holds
  the dev-dependency and the `test` script; `vitest.config.mjs` sets a generous per-test timeout
  (pod boot / git ops are slow) and points at `tests/`. ESM `.mjs`, consistent with
  `experiments/headless-cid/`.
- **Coverage (ported from `smoke.sh`):** pod lifecycle (create pod → headless RS256 bearer →
  authenticated write/read), MCP = WAC (CRUD + ACL via `/mcp`), Solid conneg (Turtle ↔ JSON-LD),
  git push → `ldp:contains` membership, CID-shaped profile, and the surviving conformance live
  checks (the `smoke.sh` steps 7–11 that are still meaningful as regression guards).
- **Out of scope for the suite:** the LWS-CID self-signed auth round-trip (blocked locally by
  `blockPrivateIPs`; it is a public-rung test). The headless RS256 bearer path *is* covered.

### Seam for the L2 sidecar (no work now)

The base `docker-compose.yml` defines `jss` as one service among a (future) set. Adding the
`constrained-container` proxy and a projection/commit sidecar later means adding services +
wiring, not reshaping the base. No placeholder services are created now (YAGNI).

### Untouched eval artifacts

`docker-compose.tls.yml`, the `cert` / `up-tls` / `down-tls` / `cid-tls` make targets, and
`experiments/headless-cid/` stay in place as working eval evidence and the seed for public-dev
LWS-CID verification. They are not folded into the base+override structure and not deleted.

## Acceptance criteria

1. `make up` boots JSS from the base+local stack; `make test` (Vitest) passes against the local pod.
2. `./data` on the host shows the JSS pod files (LDP containers + git repos) after a write.
3. `make reset` yields a clean pod.
4. `.env.local` is gitignored; `.env.example` is committed and documents every knob.
5. The base compose contains no env-specific values (a reviewer can see that `.dev.yml` /
   `.prod.yml` would only add, never edit, the base).
6. The TLS/LWS-CID eval artifacts still work unchanged.
7. `smoke.sh` is archived (moved under `experiments/`), not referenced by any `make` target.

## Open items (carried, not addressed here)

These belong to the public rungs / L2 build and are tracked in `FOLLOWUP.md`:

- LWS-CID auth verification on a public deployment (the `blockPrivateIPs` blocker).
- L2 admission floor harness (constraint-read auth on `constrained-container`).
- In-process vs sidecar projection / auto-commit.
