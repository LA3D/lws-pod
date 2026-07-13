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
| `apps/wiki-projector/engine.mjs` (was `projection/engine.mjs`, markdown-shaped core — B2) | 3 | app-tooling — moved to `apps/wiki-projector/` (application #1's client projector); RESERVED list now derives from declared representations | done (conneg-P2) |
| `apps/wiki-projector/engine-profile.mjs` (was `projection/okf/engine-profile.mjs` — B1) | 3 | app-tooling — channel wiring moved with the engine; B1 fixed (no more index-channel force-fit, opt-in via profile roles) | done (conneg-P2) |
| `apps/wiki-projector/{card,identity,frontmatter,index-channel}.mjs` + gray-matter (was `projection/okf/{...,base-profile}.mjs`) | 3 | app-tooling — OKF family engine, moved; `base-profile.mjs`/backcompat retired (`instantiate()` replaces the channel engine) | done (conneg-P2) |
| llm-wiki family channels/shapes (was `projection/profiles/wiki-memory/*`, RED suite) | 3 | app profile + tooling, re-derived on the decoupled floor: links = flat `#it` JSON-LD (SHACL-governed), index = OKF nav channel, graph = dataset aggregate | done — re-derived (renderers as app tooling, representations as data) |
| `constrained-container/` proxy (legacy L2 floor) | 3 | app-tooling, superseded by L3 — retired (Chuck-approved; `test-app-e2e` removed with it) | done — retired |
| `projection/okf/base-shape.ttl` "universal" comment vs dcterms:title gate | 3 | comment fix rides re-derivation — file deleted with the legacy `projection/okf/` floor | done — deleted with the legacy floor |
| Identity-policy config vocabulary is document-shaped (one referent/doc — B7) | 2 | design input, resolved: `lwsp.ttl` identity-policy role reworded graph-shaped | done — vocabulary reworded graph-shaped |
| Derived-view declaration vocabulary (fixes RESERVED as data) | 2 | minted — `lwspr:representation` PROF role (self/suffix/target/named_graph kinds) + 5 rep artifacts (llm-wiki content/links/index/graph, dcat content) | done — lwspr:representation minted |
| `projection/prof/instantiate.mjs` (neutral instantiate: bind + ACLs + materialize declared representations + advertise `altr:`) | 2 | keep — data-driven, renderer seam (renderers are caller-supplied, no application vocabulary in the mechanism) | keep |
| `apps/wiki-projector/renderers.mjs` (the wiki family's content/links/index/graph renderer functions) | 3 | keep — application tooling, correctly outside the substrate mechanism | keep |
| `app/` curation console | 3 | app client, correctly outside the machinery | keep |
| `experiments/agent-eval/` | 3 | eval harness (R&D for operating skills) | keep |
| Fork `src/lws/subject-types.js` (referent-type enrichment: `.lwstypes` unions the body's primary-referent `rdf:type` alongside `lws#DataResource`) | 1 | keep — Bucket 1, application-neutral (indexes whatever `rdf:type` a subject declares; no app vocabulary named) | keep |
| Fork `src/lws/referent-resolver.js` + the `handleGet`/`handleHead` `!stats` seam + the auth-gate exemption (algorithmic `pathPrefix→container` 303 resolver, OPUS-reviewed fail-closed) | 1 | keep — Bucket 1, application-neutral (serves whatever uriSpaces pod-config declares; no literal `/id/` constant in the server) | keep |
| Fork `ReferentResolution` capability (`src/lws/storage-description.js`, URI-typed, parallel to DX-PROF-CONNEG) | 1 | keep — Bucket 1, application-neutral | keep |
| Fork System-Managed-sidecar listing filter (container renderers hide `.lwstypes`/`.lwsprov` only, narrowed from all-suffix-sidecars to preserve DT7's `.meta`/`.acl` in `items[]`) | 1 | keep — Bucket 1, application-neutral (regression fix, referent identity & discovery round) | keep |

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
   `/alice/concepts/.acl` already does for llm-wiki. This confirms the Plan-2 OPS finding recorded in
   `FOLLOWUP.md` ("bound containers need public-read ACLs before binding") — `/alice/profiles/**`
   alone is not enough. **Recipe preconditions:** a pod where the floor artifacts
   (`substrate-floor.jsonld`, `profiles-compact.context.jsonld`, `floor-identity.jsonld`) are
   already published under `/alice/profiles/` with public-read (Plan-2 state, or one prior
   `make publish-profiles`); on a truly fresh pod, publish the floor files by the same PUT
   pattern first or the `isProfileOf` walk fails.
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
