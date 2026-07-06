# 06 — Code-placement audit (P13)

The standing gate on application-neutrality. Every extension point runs through the three-bucket
test (spec `2026-07-06-l4a-substrate-neutrality-design.md` §2). Re-run this audit whenever a round
adds machinery. Buckets: **1** guardrails/affordances (code, deliberately) — **2** profile
mechanism/onboarding (code iff data-driven, zero app vocabulary) — **3** application semantics
(data + agent behavior).

| Item | Bucket | Verdict | Status |
|---|---|---|---|
| Fork `src/lws/*` (admission, linkset, storage-description, type-index, constraint) | 1 | keep — P13(a)/(b), verified neutral (coupling review Tier A) | keep |
| Fork `src/mcp/*` (10 tools, Resources, sanitize, teaching errors, federation gate) | 1 | keep — the minimum viable agent surface | keep |
| Fork `src/mcp/skills.js` pod-layout convention (`/public/apps`, `/private/bots`) | 1 | keep — layout convention, not app semantics (review A3); revisit with SEP-2640 | keep |
| Fork admission fixtures use notes-with-titles only (review A2) | 1 | test-diversity nit — next fork round adds one non-document fixture | fork-queue |
| Fork `test/lws-profiles-linkset.test.js` names llm-wiki URLs (review A1) | 1 | cosmetic — rename fixtures on next touch | fork-queue |
| `projection/okf/{resolve,profile-doc,rdf,namespaces,materialize}.mjs` | 2 | keep — verified neutral (coupling review "explicitly clean") | keep |
| `projection/okf/profile-loader.mjs` `discoverBinding` collapses plural conformsTo (B6) | 2 | fix — return every declared target | done (L4a) |
| `projection/publish/publish.mjs` hardcoded family wiring (B4) | 2 | fix — manifest-driven off `defs/index.jsonld` + descriptor roles | done (L4a) |
| `projection/publish/checks.mjs` `defsLoader` flat-basename (B5) | 2 | fix — path-aware loader | done (L4a) |
| `KNOWN_VOCAB_GAPS` constant in publish code | 2 | fix — becomes manifest data | done (L4a) |
| `defs/lwsp.ttl` `plane-mapping` definition says "knowledge bundles" (B3) | 2 | fix — reword neutral + republish | done (L4a) |
| `projection/okf/profile-select.mjs` (B8) | 3 | delete — dead, superseded by `discoverBinding` | done (L4a) |
| `projection/okf/links.mjs` `skos:` fallback + `implementedBy`/`broader` defaults (B9) | 3→2 | fix — no engine vocabulary; rels become caller parameters | done (L4a) |
| `projection/engine.mjs` (markdown-shaped core, wiki RESERVED list — B2) | 3 | app-tooling — application #1's client projector; move at L4b | L4b |
| `projection/okf/engine-profile.mjs` (force-fits index channel — B1) | 3 | app-tooling — channel wiring moves with the engine at L4b | L4b |
| `projection/okf/{card,identity,frontmatter,index-channel,base-profile}.mjs` + gray-matter | 3 | app-tooling — OKF family engine; move at L4b | L4b |
| `projection/profiles/wiki-memory/*` (channels, shapes, RED suite) | 3 | app profile + tooling; re-derived at L4b | L4b |
| `constrained-container/` proxy (legacy L2 floor) | 3 | app-tooling, superseded by L3 — retire decision at L4b | L4b |
| `projection/okf/base-shape.ttl` "universal" comment vs dcterms:title gate | 3 | comment fix rides L4b re-derivation | L4b |
| Identity-policy config vocabulary is document-shaped (one referent/doc — B7) | 2 | design input — L4b read-side | L4b |
| Derived-view declaration vocabulary (fixes RESERVED as data) | 2 | mint at L4b when wiki needs it (YAGNI — DCAT needs none) | L4b |
| `app/` curation console | 3 | app client, correctly outside the machinery | keep |
| `experiments/agent-eval/` | 3 | eval harness (R&D for operating skills) | keep |

## Zero-code onboarding recipe

Task 6 — the exact agentic request sequence that onboards a profile family and binds a container to
it, using **plain authenticated HTTP + one MCP tool call**. No `publish.mjs`, no bespoke code — every
step is a request an agent (or a curl script) can issue directly against the pod. Executed verbatim
by `tests/lws-dcat.test.mjs` `beforeAll` — the gate IS the recipe.

1. **`PUT /alice/profiles/dcat-catalog/profile.jsonld`** (`content-type: application/ld+json`) —
   publish the PROF descriptor (`hasToken`, `isProfileOf: substrate-floor.jsonld`, `hasResource`
   roles for context + validation). Pure data.
2. **`PUT /alice/profiles/dcat-catalog/context.jsonld`** (`content-type: application/ld+json`) —
   publish the JSON-LD `@context` the profile's `lwspr:context` role points at.
3. **`PUT /alice/profiles/dcat-catalog/shapes.ttl`** (`content-type: text/turtle`) — publish the
   SHACL shape the profile's `role:validation` role points at (this is what the L3 admission floor
   enforces once the container below is bound to it).
4. **`POST /mcp` → `tools/call write_acl`** on `path: /alice/profiles/dcat-catalog/` — grant
   `foaf:Agent` `Read` (default, so children inherit) + the owner WebID `Read/Write/Control`
   (default). Needed so an **unauthenticated** caller can resolve the profile chain (`loadProfile`
   walks these three artifacts with no auth).
5. **`POST /mcp` → `tools/call write_acl`** on `path: /alice/datasets/` (the container being bound,
   not the profile dir) — same public-read + owner-control shape. **Adapt-on-contact finding:** the
   brief's step 4 alone was not sufficient — `discoverBinding`/`loadProfile` are exercised
   *unauthenticated* against the **bound container's** `.meta` (walking up from the member resource),
   so the bound container needs its own public-read ACL too, exactly like the live
   `/alice/concepts/.acl` already does for llm-wiki. This confirms the OPS finding recorded elsewhere
   in this file ("bound containers need public-read ACLs before binding") — `/alice/profiles/**`
   alone is not enough.
6. **`GET /alice/datasets/.meta`** (authenticated, `accept: application/ld+json`) — read the
   container's existing metadata graph (empty/404 on a fresh container) so the bind is a
   **read-merge-write**, not a clobber.
7. **`PUT /alice/datasets/.meta`** (`content-type: application/ld+json`) — merge in
   `dct:conformsTo: { @id: .../dcat-catalog/profile.jsonld }` and
   `powder:describedby: [{ @id: .../dcat-catalog/shapes.ttl }]`, write back. This is the bind: from
   here on, writes under `/alice/datasets/` are SHACL-checked against the DCAT shape, and the
   container's linkset surface advertises `describedby`/`conformsTo` to any client that asks.

Every step above is a fixed path, so re-running the recipe is idempotent (PUT returns 200/201 the
first time, 204 on an unchanged re-PUT — both accepted by the gate).
