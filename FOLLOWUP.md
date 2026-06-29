# Follow-ups

Between-session state for lws-pod. Open items only; closed work lives in commit history and
`docs/foundations/05-jss-spec-conformance.md`. **Read this first when resuming.**

For the forward plan and order of operations, see **`docs/ROADMAP.md`**.

---

## ▶▶ DIRECTION CHANGE — general substrate (2026-06-28)

The project re-founded from "the wiki-memory L2 layer (Chuck's vault ported to a pod)" to a
**general, standards-based memory substrate**: a pod any agent connects to, where *structure* is
imposed by a **profile**, not baked in, and the pod is the canonical home (Obsidian/git become
clients). The current **design of record** is
`docs/superpowers/specs/2026-06-28-general-memory-substrate-design.md`; the path to it is three
sequential reconciliation plans (`docs/superpowers/plans/2026-06-28-substrate-reconciliation-*`),
**executed in a later round** — not yet implemented. See the project memory
`general-substrate-design` for the full decision set.

**▶ NEXT SESSION — start here:** the design is done (the spec is the design of record — do **not**
re-brainstorm it). **Plan 1 is DONE** (see the DONE block immediately below). **Write and execute
Plan 2** = the profile mechanism (loadable/discoverable profiles) + profiles #1 (llm-wiki) / #2
(data-catalog), threading the identity policy through `profiles/wiki-memory/extract.mjs` to turn its
suite green again. **§11 #1 (IRI + vocabulary minting) is now RESOLVED** —
`docs/design-notes/iri-minting.md` (content authority *resolved from the pod's storage description*,
never hardcoded, URI-typed/DID-ready; vocab reuse-first under a w3id-shaped base we control; agent
identity = CID-1.0, `did:webvh` preferred). **Plan 2 MUST add a `resolveStorageAuthority(webid|resource)`
seam** so `makeIdentityPolicy` takes a *resolved* URI, not a config literal (the `urn:okf:base/`
placeholder); slug strategy + profile-path + vocab context become profile parameters. Trust seam
(`did:webvh`/VC/ODRL/verifiable-history) is recorded in `docs/design-notes/trust-seam-agent-identity.md`
and stays deferred. The substrate's **"why"** — context cards over data objects, closing the loop to
storage via JSON-LD `@context` (inline or advertised) — is `docs/design-notes/contextual-linked-memory.md`
(Profile #2 is the describe-the-object layer; §11 #3 leans CDIF-aligned). Still open before Plan 2:
§11 #3 (data-catalog vocab — DCAT/CSVW/schema.org/**CDIF**, leaning CDIF-aligned reuse-first layering),
§11 #2 (vault SHACL-vs-curator); plus the Plan-1 carryover list below. (Design-of-record continuity
lives in this repo — FOLLOWUP + spec §12 design-note pointers; the `~/.claude` auto-memory is a
per-machine convenience and is NOT needed to resume on another machine.)

---

## ▶▶ DONE — Substrate Reconciliation Plan 1: stable subject identity + base profile (2026-06-28)

Executed Plan 1 (`docs/superpowers/plans/2026-06-28-substrate-reconciliation-1-identity.md`) via
subagent-driven-development. Branch `reconcile/plan1-identity`, 6 commits (`49a9048`, `f1c141a`,
`35347ff`, `3a8fe86`, `4c36763`, `33a9526`). Confined to `projection/okf/`. Per-task spec+quality
reviews all Approved; final whole-branch review (opus): ready-to-merge-with-fixes, fixes applied.

What changed:
- **`okf/identity.mjs`** (new): `slugFromUrl` / `makeIdentityPolicy` / `subjectIri`. A card's RDF
  subject is now a **stable, location-independent IRI** — a declared frontmatter `id:` if present,
  else minted `{profile-namespace}{slug}#it` — never derived from the storage URL. Proven by a test
  minting an identical subject from two different storage URLs (pod-A / pod-B).
- **`okf/card.mjs`**: `cardToQuads(markdown, cardUrl, ns, policy)` (4th arg). Subject AND `@id`-typed
  edge targets mint through the same `policy.mint(slugFromUrl(...))` path (symmetric by construction).
  `id` is identity, not a property (`continue`). The inline curly-brace Semantic-Markdown `bodyQuads`
  extractor is **removed**; a non-vacuous guard test locks in that body annotation is not extracted.
- **`okf/base-profile.mjs`**: the OKF floor gains an `identityPolicy` (`base: 'urn:okf:base/'`,
  placeholder until Plan 3 wires per-pod storage IRI authority) + a minimal context
  (`type`→`@type`, `title`/`description`→`dcterms`).

Spec grounding (read in full this session): OKF + DataBook confirm the declared-`id`-wins / mint-
from-slug rule (DataBook §3.3/§5.1; `id`→`@id`, location-independent). DataBook findings pinned into
spec §11 (commit `203b1e0` on main).

**Known-red, by design:** `projection/profiles/wiki-memory/` suite (~5 test files) is RED — its
`extract.mjs:12` still calls `cardToQuads` with 3 args. This is the Plan-1→Plan-2 ripple
(breadcrumbed with a `TODO(plan-2)` at the call site). The `okf/` floor itself is fully green.

**▶ Carryover into Plan 2 (final-review findings):**
1. **Edge-target identity resolution** (Important): subject minting honors a declared `id:`, but
   edge-target minting only slug-mints — it can't resolve a *referenced* card's declared `id:`, so an
   edge to a card that opted into a stable IRI dangles. Needs the bundle/import resolution Plan 2/3
   brings. One coherent piece of work with the two `targetIri` minors below.
2. `targetIri` passthrough requires `://` — `urn:`/`did:` edge values get mis-minted (and the base
   profile itself mints `urn:okf:base/` subjects, so a urn world is plausible).
3. `slugFromUrl` is filename-only → `a/x.md` and `b/x.md` collide to one subject (by design,
   DataBook-aligned, but "filename unique within a profile namespace" is an unstated hard invariant —
   document it; this is also spec §11's IRI-minting question).
4. **`asTypeCurie` engine-vocab debt:** `card.mjs` hardcodes `'skos:' + bareType`, violating the
   "no vocab in engine code" constraint. The base profile newly depends on it and emits an
   *unresolved* `skos:Reference` for a bare `type:` (no `skos` in the base context). The base-profile
   comment + test now document this honestly (a test pins `skos:Reference` and MUST be updated when
   Plan 2 lands type-scheme resolution). Real fix = move type→class resolution into the profile.
5. Minors: T2 declared-`id` guard has no negative assertion; T1 thin coverage; `extract.mjs:1`
   stale "Semantic-Markdown → RDF" header (fold into the Plan-2 edit that touches the file).

---

Read the DONE blocks below as **what exists**: the built machinery (projection,
constrained-container, the app, JSS) is **kept and re-founded** onto the general model, not
discarded. The old "Next: Phase-2 agent layer" framing (and open items 5–8) is **superseded** —
those concerns (agent query/discovery surface, MCP hardening, authenticated/cross-container reads)
are subsumed into the substrate reconciliation and its deferred LWS Type Search / trust layer (spec
§9 remove/restructure/rebuild/keep).

---

## ▶▶ DONE — wiki-memory curation app (Phase 1, 2026-06-22..25)

Built and merged the wiki-memory **curation console** — the client half of the wiki-memory system.
A static Solid/LWS app (vanilla custom elements, no build, no runtime CDN) to browse agent-written
cards, traverse their typed graph across containers, and correct them through the SHACL floor (the
422 `sh:message` is the teaching channel). Spec: `docs/superpowers/specs/2026-06-22-wiki-memory-app-design.md`,
plan: `docs/superpowers/plans/2026-06-22-wiki-memory-app.md`, app README: `app/README.md`. All on `main`.

What shipped:
- **The app** (`app/`): `pod.js` (auth/CRUD + localStorage session), `parse.js`, `graph.js` (N3),
  six custom elements, plus the shell — **hash routing + browser Back**, **session persistence**,
  in-app link navigation, and **Relates + Backlinks** panels.
- **Generic typed-edge graph**: `graph.js` traverses ANY non-describing predicate, so the graph
  lights up for any profile (verified against a Google **OKF GA4 bundle** with synthesized lineage).
- **Implementation typing fix**: implementation cards are `wm:Implementation` (not `skos:Concept`);
  `index.md` groups a section per type; the projection projects both Concept + Implementation.
- **CORS on the admission proxy** for the browser write path.
- **Vendored deps** (`app/vendor/`: marked/js-yaml/n3/cytoscape) — removes the esm.sh runtime
  single-point-of-failure (a CDN flake had taken the whole app down). No bundler.
- **Verified live in a real browser** (Chrome): persistence across reload, Back, in-app links, the
  422→green correction loop, the GA4 lineage graph. Unit 43 + e2e 3.

Key deviations (recorded in the spec/plan deviation notes):
- **N3 over Comunica** — `@comunica/query-sparql-link-traversal@0.8.0` is broken in Node ESM (two
  incompatible `@traqula` parser pins). v1 uses N3 over explicitly-derived container sources;
  Comunica link-traversal deferred to the Phase-2 agent layer.
- **Content under the user's pod space** (`/alice/concepts/`, `/alice/implementations/`), derived
  from the login WebID — the pod root ACL forbids server-root writes (same blocker as `jss install`).

Agent attach + understand (demonstrated over MCP, 2026-06-25): an agent attaches via `/mcp`
(JSON-RPC, `--mcp`), authenticates with a Bearer header — WAC-gated per tool call (proven: anonymous
write **denied**, bearer write **allowed**) — orients via `index.md`, and answers structural questions
by traversing `graph.ttl` (conneg Turtle/JSON-LD), e.g. the worklist. See OPEN items 5–6 for the gaps.

---

## ▶▶ DONE — LWS-CID auth proven locally (P4a, 2026-06-21)

Closes the local half of open-item 1. The self-signed LWS-CID JWT auth round-trip now passes
end-to-end against a local pod — no public host needed to prove the auth *logic*.

- **Mechanism:** opt-in `PATCH_CID_PRIVATE_IPS` build arg (`Dockerfile`, default OFF). When true,
  the image `sed`-relaxes JSS's hardcoded `blockPrivateIPs:true` in `src/auth/cid-doc-fetch.js`.
  Wired ON for the TLS proof pod (`docker-compose.tls.yml`); opt-in for local via `.env.local`
  (`.env.example` default false to keep the committed image pristine).
- **Proof:** `experiments/headless-cid` against the patched TLS pod (`make up-tls && make cid-tls`,
  JSS 0.0.209): Phase 2 WORKS — `LWS-CID PUT → 201` as the WebID, GET-back, all negative controls
  reject (expired / `sub≠iss` / unknown `kid`). README findings updated.
- **Why TLS too:** two gates — the verifier requires an https `kid` (the TLS pod supplies it) AND
  the SSRF private-IP guard (the patch relaxes it). The http local pod can't reach the CID path.
- **Still open (not a blocker):** the SSRF guard *with the guard on* is unexercised — a one-time
  confirmation on a real public host (public DNS + TLS, no patch). Auth logic is proven; this is a
  network-policy checkbox. So both the RS256 owner bearer and the self-signed LWS-CID JWT are now
  validated headless credentials.

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
- Proper app/agent identity via LWS-CID/did:key — auth round-trip now **proven locally** (P4a
  above); the replayable RS256 bearer remains the default credential, and the guard-on confirmation
  is reserved for the public host (P4)
- WS auto-reconnect/backoff (close handler logs halt + clears the timer; manual restart now)
- A GA4-style second profile
- **Proxy cache keying (P4):** `shapeCache`/`shapeDsCache` in `constrained-container/proxy.js`
  are keyed by the full bearer token and never invalidated — under token churn they grow
  unbounded, and a container's `.meta`/constraint change is not picked up until proxy restart.
  Acceptable for the local rung; harden at P4 alongside the app/agent identity item.

Remaining Phase-0: **P4** (public-dev rung on a CRC/SAI VM) — now deferred to LAST and **no longer
gates "working"** (LWS-CID auth proven locally, P4a above). Gated on the local definition-of-done
in `docs/ROADMAP.md`; on the VM, P4 only needs the one-time SSRF-guard-on confirmation.

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

1. **LWS-CID auth — guard-on confirmation on a PUBLIC deployment** (axis 6). *Auth logic now
   proven locally* (see "DONE — LWS-CID auth proven locally (P4a)" above): the self-signed-JWT
   round-trip passes on the patched TLS pod (`PATCH_CID_PRIVATE_IPS=true` relaxes JSS's hardcoded
   `blockPrivateIPs` in `src/auth/cid-doc-fetch.js`). Phase 1 *and* Phase 2 of
   `experiments/headless-cid/` are green. **What remains:** re-run on a real public host with the
   guard ON (no patch) to confirm the SSRF path itself — a network-policy checkbox, not an auth
   gap. Re axis-2's **bearer-replay** concern: the RS256 bearer is still the default headless
   credential, but the self-signed LWS-CID JWT is now a validated alternative for agent-trust design.
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

5. **Phase-2 agent query + discovery surface** (the deferred agent layer). The pod is attach-able
   and traversable today (MCP CRUD + read `index.md`/`graph.ttl`), but there is **no "ask the
   memory" surface**: no SPARQL-over-MCP, no faceted search, and the vocabulary
   (`projection/profiles/wiki-memory/types.ttl`, `edges.ttl`, the SHACL shapes) is **not published
   on the pod** — a cold agent must be *told* that `wm:implementedBy` means "implementation." Highest
   leverage: (a) publish the vocabulary + a `.well-known`/manifest so an agent self-discovers the
   schema; then (b) a query tool (Comunica vs Oxigraph-WASM vs MCP manifest — `geoff` is the
   WASM-SPARQL candidate; see project memory `geoff-reference`).

6. **MCP auth hardening for untrusted/networked agents.** Auth is the HTTP `Authorization` header on
   `POST /mcp` (no MCP-native OAuth flow); JSS resolves a WebID and WAC-checks every tool call.
   Verified live (anonymous write denied, bearer write allowed). The default **RS256 bearer is
   replayable** (not DPoP-bound) — fine for a trusted local agent; an untrusted/networked agent
   wants DPoP or the self-signed CID/`did:nostr` signature-per-request path, which needs the
   public-IP rung (open item 1). Ties to the long-standing bearer-replay caveat (axis 2).

7. **`graph.js` authenticated reads.** `loadStore` uses an unauthenticated `fetch`, so the graph
   view/worklist require **public-read** content (the seed grants `/alice/` public-read via
   `acl:default`). Inject the session bearer (via `pod.js`) so private pods work — also retires the
   now-unused `pod.js` `getGraph`. App README "Known limitations".

8. **Cross-container backlinks.** Backlinks resolve from a card's own container `graph.ttl`, so a
   card pointed at from another container shows none unless an inverse edge is materialized next to
   it (concept→concept within `/alice/concepts/` works). Needs a global index or such
   materialization. *Related:* in-pod app install is BLOCKED at the root ACL (`jss install` →
   `/public/apps/` is unwritable; finding `docs/superpowers/findings/2026-06-22-jss-install-spike.md`) —
   dev-serve is the v1 path.

---

## 📍 Navigation (resume order)

1. This file → the verdict + open items.
2. `docs/foundations/README.md` → the four canon docs + the conformance map.
3. `docs/foundations/05-jss-spec-conformance.md` → per-axis spec-vs-JSS, "Live test results".
4. `.claude/skills/` (auto-loaded) → ground truth on specs + JSS; `jss-server` = what the server
   does, `solid-protocol`/`lws-protocol` = what the standard says.
5. The L2 IP to port: `constrained-container/` (admission), `docs/archive/wiki-memory-dual-projection.md`
   (content model), `docs/foundations/04-comunica-patterns.md` (query path).

## Local pod (deployment workflow)

Local stack: container `lws-pod-local`, http :3838, data bind-mounted to `./data` (inspect the
LDP containers + git repos directly on disk). `make up` / `make down` / `make logs` / `make shell`;
`make test` runs the Vitest gate; `make reset` wipes `./data` for a fresh pod. TLS eval pod
`lws-pod-tls` (https :8443) via `make up-tls` / `make down-tls` is unchanged. Test cruft on the
http pod (alice/notes, gitprobe-* repos) is harmless — `make reset` clears it.

## Phase-0 status

**P1 ✅** (Keycloak auth-plane, `experiments/keycloak-jss/`), **P2 ✅** (proxy auth + HTTP ACL
provisioning, `constrained-container/`), **P3 ✅** (OKF projection app, `projection/`), **P5 ✅**
(write-funnel = notifications CDC, resolved in P3), **P4a ✅** (LWS-CID auth proven locally). **P4
(CRC VM) is deferred to LAST and no longer gates "working."**

**The L2 layer + wiki-memory curation app are built on the local rung** (DONE block above):
governance floor (P2), projection (P3/P5), and the curation console — verified live in a browser,
and the pod is agent-attachable + traversable over MCP. **Next (per the 2026-06-28 direction change
above): the substrate reconciliation** — re-found this built machinery onto the general
profile-based model, per the design spec and the three `substrate-reconciliation-*` plans (a later
implementation round). The old open items 5–8 are folded into that work; **P4** (public-dev rung on
a CRC/SAI VM) stays deferred to LAST. The phase status below is the pre-pivot build record.
