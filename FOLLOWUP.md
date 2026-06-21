# Follow-ups

Between-session state for lws-pod. Open items only; closed work lives in commit history and
`docs/foundations/05-jss-spec-conformance.md`. **Read this first when resuming.**

For the forward plan and order of operations (the build sequence: sidecar + wiki-memory Solid
app), see **`docs/ROADMAP.md`**.

---

## ▶▶ DONE — P3 projection-on-write (2026-06-21)

Shipped the OKF projection app: channel-driven, HTTP-native sidecar that reprojects a
wiki-memory container on every card write. Spec: `docs/superpowers/specs/2026-06-21-okf-projection-app-design.md`.
Plan: `docs/superpowers/plans/2026-06-21-okf-projection-app.md`.

What shipped:
- **Generic OKF libs** (`projection/okf/`): frontmatter parser + `index.md` channel.
- **Channel-driven engine** (`projection/engine.mjs`): membership-from-listing, conneg GET,
  authenticated PUT, reserved-name skip (incl. derived views), profile-parameterized.
- **Wiki-memory profile** (`projection/profiles/wiki-memory/`): `extractCard` (Semantic-Markdown
  → RDF quads), `graph.ttl` channel (Turtle aggregate), SHACL floor shape shared into the P2
  proxy (synchronous per-write validation).
- **Triggers** (`projection/triggers/`): CLI one-shot + notifications CDC (WebSocket `solid-0.1`
  subscribe/pub, debounced). Constrained-container tests run via their own vitest config
  (`constrained-container/vitest.config.js`).
- **Full suite green:** projection 25/25 (unit + e2e incl. notifications WebSocket), constrained-
  container floor 2/2 + P2 regression 5/5. Gate: `make test-projection`.

**DESIGN NOTE (discovered during build):** `solid-0.1` WebSocket `sub` to a PROTECTED container
requires the Bearer token in the WS upgrade headers — the design doc assumed anonymous subscribe
to a public container. The trigger passes the token in the headers when present; auth-less subscribe
returns `err … forbidden` from JSS.

**Filesystem prototype retired:** `render/` (`generate.js` — readdirSync cards → writeFileSync
HTML) removed; superseded by the projection engine.

Deferred to Phase-1 / production hardening (not silently dropped):
- `<card>.html` and `viz.html` reading-experience channels (spec §8; will be channels when built)
- Aggregate `graph.ttl` SHACL validation (current floor is per-card at write time)
- Incremental projection (full re-projection per container on each write now)
- Link-rel channel discovery + LWS-native container-type URIs
- `okf_application` root-index profile selector (engine takes profile as a parameter; single-
  profile now; reading selector from root `index.md` deferred)
- Proper app/agent identity via LWS-CID/did:key (current credential is the replayable RS256
  bearer; addressed in P4)
- WS auto-reconnect/backoff (close handler logs halt + clears the timer; manual restart now)
- A GA4-style second profile
- **Proxy cache keying (P4):** `shapeCache`/`shapeDsCache` in `constrained-container/proxy.js`
  are keyed by the full bearer token and never invalidated — under token churn they grow
  unbounded, and a container's `.meta`/constraint change is not picked up until proxy restart.
  Acceptable for the local rung; harden at P4 alongside the app/agent identity item.

Remaining Phase-0: **P4** (public-dev rung on a CRC/SAI VM — also closes the open LWS-CID
public auth test from open-item 1).

---

## ▶▶ DONE — local deployment rung (2026-06-21)

Left experiment phase; began building the memory pods. Migrated the eval scaffolding into a
base+override deployment workflow — **local rung only**; public dev/prod deferred. Spec + plan
in `docs/superpowers/specs/` and `docs/superpowers/plans/` (2026-06-21). Merged to `main`.

- **Base+override compose:** `docker-compose.yml` (env-neutral `jss` service — no ports/volumes/
  container_name) + `docker-compose.local.yml` (http :3838, `./data` bind-mount for on-disk
  inspection). `.env.local` (gitignored) copied from `.env.example`; make targets wrap
  `-f base -f local --env-file .env.local`.
- **Vitest gate:** `tests/` via `make test` replaces `smoke.sh` (archived to `experiments/`).
  9/9 e2e green — lifecycle (pod create, headless RS256 bearer, write/read, conneg) + agent
  surfaces (MCP, CID-shaped profile, git push → retrievable resource).
- **Deferred by decision:** public rungs target a **CRC/SAI provisioned VM** + Docker Compose +
  Caddy at `*.crc.nd.edu` (`pod-dev.crc.nd.edu`, `pod.crc.nd.edu`); TLS via institutional
  wildcard cert (mounted) or Caddy/LE; deploy manual-now → GitHub-Actions CI later. The base is
  env-neutral so `.dev.yml`/`.prod.yml` will only ADD, never edit it.

Follow-ups (none blocking): Makefile `BASE` should track `ENV` when dev/prod arrive; `make up`
could add `--remove-orphans`; `mcp()` test helper could check HTTP status before `.json()`;
profile test pinned to `card.jsonld` until JSS adds extension-free conneg.

---

## ▶▶ DONE — JSS substrate evaluation (2026-06-21)

**Verdict: JSS is a good replacement for CSS — proceed to build the L2 memory layer on it.**
Eval pinned to JSS **v0.0.209**. Full evidence: `README.md` checklist (all checked) +
`docs/foundations/05-jss-spec-conformance.md` (per-axis CONFORMS/EXTENDS/DIVERGES/GAP, every
claim cited). Live probes: `experiments/smoke.sh` (steps 7-11) and `experiments/headless-cid/`.

What shipped this eval (all on `main`):
- **7 grounded skills** in `.claude/skills/` — verbatim, source-pinned, contamination-free
  (`scripts/check-skill-grounding.sh` enforces). Spec: lws-protocol, solid-protocol,
  shacl-constraints, comunica-sparql, okf, semantic-markdown. Implementation: jss-server.
- **Conformance map** `docs/foundations/05-jss-spec-conformance.md`.
- **`experiments/smoke.sh`** (archived) carried the 5 live tests; now ported to the Vitest suite (`make test`).
- **`experiments/headless-cid/`** — headless LWS-CID provisioning + auth probe (Node + jose).
- **TLS variant** — `make cert` / `up-tls` / `cid-tls`, `docker-compose.tls.yml` (mkcert,
  `pod.vardeman.me:8443`), reusing cogitarelink-solid's approach. `certs/` gitignored.

Live-verified: persistence (down/up), RS256-JWT headless bearer, MCP=WAC CRUD/ACL, Solid conneg,
git push → `ldp:contains` member, CID-shaped profile, **headless key provisioning works**,
JSS serves `.meta`+`ldp:constrainedBy` (admission proxy ports).

---

## ▶ OPEN — when building the L2 layer (none block the substrate decision)

1. **LWS-CID auth on a PUBLIC deployment** (axis 6, DEFERRED by decision). Self-signed-JWT auth
   is blocked locally: JSS hardcodes `blockPrivateIPs: true` in `src/auth/cid-doc-fetch.js`, so
   the verifier refuses a WebID on a loopback/private IP. To close axis-2's **bearer-replay**
   concern: deploy JSS to a public host + domain and re-run `experiments/headless-cid/` (Phase 1
   provisioning already works; only Phase 2 auth is unproven). Until then the practical headless
   credential is the **replayable RS256 bearer** — weigh that for any agent-trust design.
2. **L2 admission floor harness** (axis 7). The `constrained-container/` proxy reads `.meta`+shape
   **unauthenticated**; on JSS those are owner-only and `.acl` PUT returned **415** in testing.
   Settle either (a) public-read ACL provisioning (find JSS's accepted `.acl` write form), or
   (b) have the proxy forward the requester's `Authorization` on its constraint reads (the
   cleaner fix — lets it govern protected containers). Mechanism itself is confirmed working.
   **Resolved (P2, 2026-06-21):** proxy forwards the requester's Authorization on `.meta`/shape
   reads (governs protected containers); `constrained-container/set-acl.mjs` provisions public-read
   shapes via HTTP `application/ld+json` `.acl` PUT (no MCP). See `constrained-container/README.md`.
   *P2 follow-ups (non-blocking):* `set-acl.mjs` sets `acl:default` on file resources (no-op on
   files; correct once used on containers); its signature omits the unused `base` param; and
   `proxy.js`'s `validatorFor()` should add an `r.ok` guard (symmetry with `constrainedBy`) so a
   readable-`.meta`-but-protected-shape topology fails open instead of admitting all.
3. **In-process projection / auto-commit** (axis 7) = **P3 DONE (2026-06-21)**. Shipped as the
   `projection/` package: channel-driven engine + wiki-memory profile + CLI and notifications
   triggers. See `docs/superpowers/specs/2026-06-21-okf-projection-app-design.md` and the P3
   DONE block at the top of this file for what shipped and what is deferred.
4. **P1 spike done (2026-06-21):** Keycloak-in-front-of-JSS proven — `experiments/keycloak-jss/`.
   Approach A (token `webid` claim) confirmed; gateway-enforces pattern kept; token-exchange /
   native-JSS-acceptance deferred. See the experiment README's decision note.

---

## 📍 Navigation (resume order)

1. This file → the verdict + open items.
2. `docs/foundations/README.md` → the four canon docs + the conformance map.
3. `docs/foundations/05-jss-spec-conformance.md` → per-axis spec-vs-JSS, "Live test results".
4. `.claude/skills/` (auto-loaded) → ground truth on specs + JSS; `jss-server` = what the server
   does, `solid-protocol`/`lws-protocol` = what the standard says.
5. The L2 IP to port: `constrained-container/` (admission), `docs/wiki-memory-dual-projection.md`
   (content model), `docs/foundations/04-comunica-patterns.md` (query path).

## Local pod (deployment workflow)

Local stack: container `lws-pod-local`, http :3838, data bind-mounted to `./data` (inspect the
LDP containers + git repos directly on disk). `make up` / `make down` / `make logs` / `make shell`;
`make test` runs the Vitest gate; `make reset` wipes `./data` for a fresh pod. TLS eval pod
`lws-pod-tls` (https :8443) via `make up-tls` / `make down-tls` is unchanged. Test cruft on the
http pod (alice/notes, gitprobe-* repos) is harmless — `make reset` clears it.

## Phase-0 status

**P1 ✅** (Keycloak auth-plane, `experiments/keycloak-jss/`), **P2 ✅** (proxy auth + HTTP ACL
provisioning, `constrained-container/`), **P3 ✅** (OKF projection app, `projection/`). Remaining
Phase-0: **P4** (public-dev rung on a CRC/SAI VM).

**Next: P4** — public-dev rung on a CRC/SAI VM (`pod-dev.crc.nd.edu`). Deploys the stack to a
public host with a domain name and institutional TLS, which also closes the open-item-1 LWS-CID
public auth test (JSS's `blockPrivateIPs` guard blocks the loopback WebID fetch locally). See
`docs/ROADMAP.md` for the full forward plan.
