# A generic OKF agentic-memory application + the profile mechanism (W1)

Design spec, 2026-06-21. The content-model synthesis. The **primary deliverable is a generic,
backward-compatible OKF application** — a profile-agnostic agentic-memory substrate that *formalizes
into many memory types* through pluggable **profiles** (each adding typed, governed, projected
semantics for a bundle type). "Agentic memory" is the genus; a profile is a species. No profile is
architecturally primary: **wiki-memory is the first formalization we build** (it drives the eval),
and the **vault is a candidate second** — both are profiles over the same generic engine. The
structure-vs-flat eval (W2) is a downstream follow-on this design makes nearly free.

Supersedes the prototype sketch in `docs/wiki-memory-dual-projection.md` (kept as the worked
example). Builds on the shipped `projection/` engine (P3) and the `constrained-container/` floor (P2).

---

## 1. Goal and the one invariant

An agentic-memory pod stores typed, queryable agent/human memory as portable knowledge. The "new
semantics" that make memory navigable — a `type:`→IRI registry, typed edges, per-type admission,
two-tier retrieval — must not be specific to any one memory shape. They are a **profile mechanism**
over a generic OKF application: OKF stays the generic, portable floor; the engine is profile-agnostic;
a *profile* formalizes the content layer for a bundle type (a wiki-memory, a research vault, a blog,
a catalog, …). The generic application is the reusable artifact; profiles are how it is specialized.

**Invariant (non-negotiable): everything above OKF is additive.** Extra frontmatter keys, extra
`Link` headers, derived sidecar resources — never an overload of OKF's own structure (`type:`,
`index.md`, `log.md`). Strip the profile and a bundle degrades to a spec-conformant OKF bundle that
any plain consumer reads correctly, just flat. OKF §9 guarantees the consumer side (tolerate unknown
keys/types/links); this design guarantees the producer side.

This invariant is what makes the eval cheap (§9) and what keeps bundles portable across tools.

---

## 2. Architecture: the layer stack

```
OKF floor              portable bundle: dir of md + frontmatter, open `type:`        [engine]
 → mapping context     bundled JSON-LD @context: type:→@type, edge:→IRI              [profile]
 → core vocab          SKOS · DCTERMS · schema.org · PROV-O · AS2 (pretraining-legible) [engine: declared core]
 → edge predicate set  shared wm:/llm-wiki Edge-Types (federation-identity)          [shared]
 → punned type scheme  each type = rdfs:Class + skos:Concept (notation = the string) [profile]
 → graded SHACL        base NoteShape floor + per-type shapes; also materializes     [profile]
 → projection          Link headers (Tier-1) + .graph (Tier-2) + index.md (nav)      [engine, profile-parameterized]
```

**Engine owns:** OKF parsing; the declared standard-vocab core; the projection runtime (the existing
`projection/` package); the *mechanism* of typed edges (how an edge declares predicate + inverse +
projection + whether it is an indexed relation). **Profile owns:** which types exist, which edges,
the shapes, the channel config.

The split lands cleanly on the LWS boundary (§7): **LWS = structure/addressing substrate + the Type
Index/Search services; the profile = content semantics; they meet at write-time `rel="type"` /
relation Link-header derivation.**

---

## 3. What a profile is

A profile is a **declarative bundle** — data, not code — that parameterizes the engine. Each artifact
has a working precedent in the vault KG (`~/Obsidian/obsidian/scripts/kg/`), which is a wiki-memory
profile in all but name.

| Artifact | Role | Vault precedent |
|---|---|---|
| `context.jsonld` | `type:`/field → IRI mapping (the OKF→RDF bridge) | `vault-context.jsonld` |
| `types.ttl` | punned SKOS+RDFS type scheme — the declared, self-describing type set | `vault-ontology.ttl` (type classes) |
| `edges.ttl` | the typed-edge vocabulary (domain/range/inverse/indexed?) | `vault-ontology.ttl` (edge properties) |
| `shapes.ttl` | graded per-type SHACL: validation + `sh:SPARQLRule` materialization | `vault-shapes.ttl` |
| `channels` | which projection channels run (`index.md`, `.graph`, Link-header set) | `projection/profiles/wiki-memory/` |

**Selection.** The bundle's **root `index.md` frontmatter** declares `okf_profile: wiki-memory` —
the one place OKF permits frontmatter (§11, alongside `okf_version`). A plain OKF reader ignores the
unknown key (backward-compat holds). The engine reads it to load the profile. Absent or unknown
profile → **base OKF mode**: no typing, no floor beyond "type present" (§5 tier 1). Base mode is also
the flat-control configuration for the eval (§9).

---

## 4. Vocabulary: the pretraining-legible core, the shared edge set, federation

### 4.1 The core (six standard vocabs, three axes)

A vocab is in the core iff it is (1) a published standard, (2) domain-neutral, and (3) heavily
represented in pretraining. The rationale is the thesis itself: an agent reasons over `skos:broader`,
`schema:Article`, `prov:wasAttributedTo` zero-shot; a bespoke predicate must be taught. Standard
vocabs are agent proto-knowledge — the FAIR-as-agent-infrastructure thread.

| Axis | Vocab | Answers |
|---|---|---|
| Addressing / structure | RDF/RDFS + `wm:` engine + `lws:` | *where it lives* (type, container, type index) |
| Content / navigation | SKOS · schema.org · DCTERMS | *what it is, what it relates to* |
| Provenance / activity | PROV-O · AS2 | *who authored it, when, as what event* |

AS2 and the `sec:` (CID) terms are in the LWS vocabulary itself, so the core composes with
`https://www.w3.org/ns/lws/v1` rather than competing with it.

### 4.2 The shared edge predicate set

Bespoke edges (`wm:implementedBy`, `broader`-as-typed, `supports`, the eight structural/provenance
edges) live in **one shared predicate set**, not a deployment-local namespace. The vault edges were
already converged with the llm-wiki `Edge-Types` vocabulary (vault decision 2026-06-18) "so the
federation crosswalk is identity." This design carries that through: use `w3id.org/cogitarelink/wm#`
(the placeholder already in the dual-projection doc) as the authority for now.

**Requirement — the authority is abstracted, not embedded.** The namespace may change; the design
must let it. Content never carries an absolute authority IRI: cards use friendly frontmatter keys
and Semantic-Markdown CURIEs (`wm:implementedBy`) that resolve to IRIs **through the profile's
JSON-LD context**. The authority is declared in exactly one place per profile (the `@context`
prefix / `@vocab`, mirrored in the `*.ttl` prefix headers). Changing the authority is then a
one-line prefix edit that re-grounds every card at once — no content rewrite, and federation
crosswalks stay identity. Inverses are materialized by the projection (§6), never authored.

### 4.3 Federation — vault as a second profile

`vault:` is a deployment-local base IRI, not a vocabulary boundary. The vault is **another profile**
over the same engine: its `context.jsonld` maps vault frontmatter to the shared edge IRIs. Because
the crosswalk is identity, a vault bundle and a wiki-memory bundle federate without translation. This
is a deliberate claim (see open decision §11) with real payoff: one engine, two profiles, free
federation.

---

## 5. Admission floor (three tiers)

Evaluated on the container graph at write time (the `constrained-container/` proxy + the projection
floor). **Severity → HTTP: only `sh:Violation` maps to 422; everything else is 2xx-with-observability.**

1. **Base gate (unconditional).** `NoteShape` (`sh:targetSubjectsOf rdf:type`) requires a non-empty
   `type:` + a `dcterms:title`. Missing either → **422**, even in base OKF mode. This is the one hard
   rejection; it enforces OKF §9.2 (`type:` required) as the floor.
2. **Per-type graded shapes.** For a `type:` whose class has a registered shape, run it. `Violation`
   → 422; `Warning`/`Info` → admit, record the finding in a derived report channel, return the
   teaching `sh:message`. The concept-card shape is today's `wm:implementedBy` floor, generalized.
3. **Unknown-to-profile type.** `type:` present (passes tier 1) but no registered shape → **admit
   ungoverned** (open-world; OKF tolerance preserved), emit an agent-facing warning ("type X is new
   to the wiki-memory profile; admitted ungoverned — register a shape or pick an existing type"), and
   flag `curator_status: pending`. Never silent; never blocking. This is the vault's curator flow.

The graded model is the vault house style (`vault-shapes.ttl` already uses Violation/Warning/Info)
and matches geoff's per-type shapes. Shapes are advertised so they are also a discovery filter (§7).

---

## 6. Projection: two Tier feeds + nav, from one source

One on-write projection, profile-parameterized, riding the existing engine + notifications CDC. The
source of truth is the concept card (frontmatter-first; inline Semantic-Markdown is a sparing
phrase-level escape hatch per `02-content-model.md`). One write produces:

- **Tier-1 feed — `Link` headers.** `rel="type"` + descriptive typed-edge relations, derived from
  the card's frontmatter at write time. This is what the LWS Type Index/Search consumes (§7); LWS
  servers are **not required to parse bodies**, so a type/edge that exists only in the body but not
  in a Link header is not discoverable. The projection therefore *must* emit them.
- **Tier-2 feed — `.graph`.** The per-container aggregate of every card's quads (one Comunica
  source). Carries the full typed graph for expressive query.
- **Nav — `index.md`.** Regenerated OKF progressive-disclosure listing from each card's `description`.
- **Materialization (same pass).** The profile's `shapes.ttl` `sh:SPARQLRule`s materialize inverses
  (`supportedBy`, `conceptOf`, …), transitive `up` closure, and derived flags (`isHub`) into `.graph`
  — the vault's Layer-3 pattern, on-write instead of batch. The query view is enriched, not raw.

Both derived views rebuild from the cards; nothing downstream is hand-authored.

---

## 7. LWS alignment (sanity-checked against lws10-core, -vocab, -searchindex, CID 1.0)

The design is consistent with LWS; LWS in fact *is* the two-tier model:

- **Two-tier retrieval is the spec's own.** LWS Type Search is **CNF over types + indexed
  relations** — "the complete query expressiveness of the service"; richer queries go elsewhere.
  That is our Tier-1 (TypeIndex/Search, authz-filtered, server-managed) → Tier-2 (Comunica over
  `.graph`, expressive) split. Phase 1 uses a Comunica-over-`.graph` stopgap for Tier-1; Phase 2
  swaps in the real LWS services.
- **Standard vocabs are the type currency.** The Type Index publishes type URIs
  (`{ "id": "https://schema.org/Person" }`) and clients filter on them. So each type puns to a
  **standard class IRI** where one fits (`skos:Concept`, schema.org), with the OKF `type:` string as
  its `skos:notation`. The indexable identity is the class URI, not the notation.
- **Typed edges = LWS "indexed relations."** Edges are expressed as descriptive link relations so
  they become Tier-1 filters (`?type=skos:Concept&implementedBy=…`, CNF). "Concepts with no
  implementation" is then a Tier-1 *or* Tier-2 query. Per-type shapes are advertised via
  `describedby` (the spec's own example), so "resources governed by ConceptWiringShape" is a
  discovery query — the floor and the discovery surface connect.
- **Per-request, current, never-cached authz** (a spec MUST) = the P2 proxy work.
- **`application/lws+json`** is the service envelope; the profile's JSON-LD context composes with
  `https://www.w3.org/ns/lws/v1`.

### 7.1 Provenance binds to CID

CID 1.0 supplies agent identity: `id` + `verificationMethod` + `assertionMethod`, with a controller
that delegates to agent keys while retaining document control (context `https://www.w3.org/ns/cid/v1`).
So a memory card's `prov:wasAttributedTo` / `as:actor` **targets the authoring agent's controlled
identifier** — the same identity that authenticated the LWS-CID write (the proven P4a path). Memory
writes are assertions, so the agent's `assertionMethod` key is the natural signer. The provenance
axis grounds in the write-time identity rather than floating free.

### 7.2 Known boundary — `.graph` aggregate vs per-resource authz

LWS Type Search filters **per resource**; the `.graph` is one aggregate resource, all-or-nothing
under WAC. Fine for the local owner+agents rung. For multi-user it over-shares: a client who can read
`.graph` reads every member's triples. Resolution (deferred): fine-grained authz lives at Tier-1
(Type Search) + per-card WAC; `.graph` is a Tier-2 convenience *within an already-readable container*.
Flagged, not fixed in W1.

---

## 8. Backward compatibility (the invariant, made concrete)

- A plain OKF consumer reads a wiki-memory bundle: it sees cards with a `type:`, an `index.md`, a
  `log.md`. It ignores the extra frontmatter edges, the `Link` headers, the `.graph`, the provenance
  — all additive. It gets a flat but correct reading.
- The engine in base mode (no profile / unknown profile) is itself such a consumer.
- We never overload OKF structure: `type:` stays an open string; `index.md`/`log.md` keep their OKF
  meaning; typed semantics ride frontmatter keys + Link headers + sidecar resources only.

---

## 9. Eval hook (W2 — kept thin)

The OKF-conformant-bundle property *is* the eval rig. **Treatment** = engine + wiki-memory profile
(typed `.graph`, tiered `index.md`, Tier-1 indexed relations, graded floor). **Control** = the same
bundle, engine in **base OKF mode** (untyped, dump-the-pile retrieval, type-present gate only). Same
bytes on disk, two reader configurations — the cleanest possible isolation of the independent
variable. Porter is the external-validity reference (its memory is a flat `porter:Observation` log),
not something we stand up. Full task/metric design is the **W2 spec**; W1 commits only to making the
control a config flag, not a separate build.

---

## 10. Scope

**W1 delivers, primary:** the generic OKF application — the profile-agnostic engine (loader, base
mode, profile selection via root `index.md`), the three-tier admission floor, and the two-Tier-feed
projection (Link headers + `.graph` + `index.md` + materialization) on the existing engine, with the
backward-compat invariant enforced and tested.

**W1 delivers, as the first formalization:** the wiki-memory profile artifacts (`context.jsonld`,
`types.ttl`, `edges.ttl`, `shapes.ttl`, channels) ported from the vault KG — proving the generic
application specializes correctly. The vault profile is a candidate second formalization (§4.3,
§11.2), deferred.

**Deferred (named, not dropped):** the real LWS Type Index/Search services (Phase 2 — W1 uses the
Comunica-over-`.graph` Tier-1 stopgap); `application/lws+json` / storage-description / linkset
enrichment (Phase 2); per-resource authz on aggregates (§7.2); the W2 eval task/metric design; a
second non-memory profile (blog/catalog) as a generality proof; CID `assertionMethod`-signed memory
writes beyond the existing LWS-CID auth.

---

## 11. Decisions (resolved 2026-06-21)

1. **Shared-vocab authority/namespace — decided: `w3id.org/cogitarelink/wm#` for now, abstracted.**
   May change; the namespace must be a single indirection point (the profile's JSON-LD context /
   `*.ttl` prefix), so a swap is a one-line edit, never a content rewrite (§4.2).
2. **Vault as a second profile (§4.3) — decided: defer.** Not a W1 deliverable. The engine stays
   profile-agnostic so a vault profile can be added later without engine changes; building it is out
   of scope for W1.

---

## References

- Specs (grounded skills, pinned): `okf`, `semantic-markdown`, `shacl-constraints`, `comunica-sparql`,
  `lws-protocol` (core, vocab, searchindex, ssi-cid), `solid-protocol`; CID 1.0 (`w3.org/TR/cid-1.0/`).
- Prototype to port: the vault KG — `~/Obsidian/obsidian/scripts/kg/{vault-context.jsonld,
  vault-ontology.ttl, vault-shapes.ttl}`.
- Prior art: geoff (`~/dev/git/chapeaux/geoff` — per-type shapes, `mappings.toml`, two-axis ontology
  split); Porter (`~/dev/git/chapeaux/porter` — per-class shapes, flat `Observation` memory, the
  eval control reference).
- Project canon: `docs/ROADMAP.md`, `docs/wiki-memory-dual-projection.md`,
  `docs/foundations/02-content-model.md`, `-03-governance-lessons.md`, `-04-comunica-patterns.md`,
  `-05-jss-spec-conformance.md`; the shipped `projection/` and `constrained-container/` packages.
