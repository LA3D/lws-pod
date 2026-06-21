# Follow-ups

Between-session state for lws-pod. Open items only; closed work lives in commit history and
`docs/foundations/05-jss-spec-conformance.md`. **Read this first when resuming.**

For the forward plan and order of operations (the build sequence: sidecar + wiki-memory Solid
app), see **`docs/ROADMAP.md`**.

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
3. **In-process projection / auto-commit** (axis 7) = **P3, the next build** (deferred to a fresh
   session by decision, 2026-06-21 — to think through the aspects below). No native JSS write hook
   (no plugin API, docs-confirmed). Projection-on-write runs as the sidecar, not in-process. Full
   scoping + open decisions are in **"Next session"** at the bottom of this file.
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

## Next session — P3: projection-on-write

Phase 0 status: **P1 ✅** (Keycloak auth-plane, `experiments/keycloak-jss/`), **P2 ✅** (proxy auth
+ HTTP ACL provisioning, `constrained-container/`). **P3 is next** and was deliberately deferred to
a fresh session to think the design through. Remaining Phase-0: P4 (public-dev rung on a CRC VM),
P5 (write-funnel — folds into P3's trigger decision below).

**What P3 is** (full design: `docs/wiki-memory-dual-projection.md`): on each concept-card write,
the sidecar (1) **extracts** the card's triples from its Semantic-Markdown body, (2) **aggregates**
all member cards → the container's **`.graph`** (the single Comunica source), (3) **regenerates
`index.md`** (OKF navigation). The SHACL floor (already in the P2 proxy) validates.

**What it needs to build:**
- **Semantic-Markdown → RDF extractor** — the load-bearing piece. Parse frontmatter + the
  curly-brace RDFa-Lite annotations (`{=<#it> .skos:Concept}`, `[span]{skos:prefLabel}`,
  `[text](url){predicate}`) → quads. No parser in the repo yet; build a focused one or find a
  Sparna JS lib. Pure + unit-testable against the **three example cards** in the design doc.
- **Aggregator** → union members' quads → PUT `.graph` (authenticated; reuses P2 auth).
- **`index.md` renderer** (frontmatter `description` → OKF list). Small.
- **Projection trigger** (the decision below).

**Open decisions to think through (the reason this is a fresh session):**
1. **Trigger: sync-in-proxy vs notifications-driven.** Regenerate synchronously after the
   constrained-container proxy admits a write (simple, deterministic, only catches writes *through*
   the proxy), OR subscribe to JSS `--notifications` (CDC; catches *all* writes incl. bypass; but
   eventual-consistency + more moving parts). **This is P5's write-funnel question — P3 forces it.**
2. **Scope: which derived views.** The doc lists four (`.graph`, `index.md`, `<card>.html`,
   `viz.html`). Recommend building **`.graph` + `index.md`** for P3 (unblocks Comunica + the
   derived index + the floor); defer the HTML/`viz` *reading-experience* renders to Phase-1 app work.
3. **Floor location:** keep the P2 proxy's per-write-body SHACL validation, or move it to validate
   over the aggregate **`.graph`** (the doc's intent — needed for cross-card constraints).
4. **git-commit-on-write:** rely on JSS `--git` auto-checkout (don't build a separate commit step).

**Recommended approach:** **decompose** — first spec/build/test the **Semantic-Markdown→RDF
extractor** alone (the load-bearing unknown, pure, unit-testable against the doc's example cards),
THEN projection-on-write on top, settling the trigger decision with the extractor already proven.

Start the new session with `/brainstorming` on the extractor slice (or the combined slice if you
prefer). Read `docs/wiki-memory-dual-projection.md` + the `semantic-markdown` skill first.

**Alternative threads if you'd rather not do P3 next:** P4 public-dev rung (`pod-dev.crc.nd.edu`
on a CRC/SAI VM — also unblocks the open-item-1 LWS-CID public auth test); or the P1/P2 follow-ups
(sidecar jwtVerify audience/expiry + bearer refresh; `validatorFor` `r.ok` guard).
