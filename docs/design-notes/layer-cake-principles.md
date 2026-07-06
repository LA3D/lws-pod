# The principled layer cake — guiding principles for the profile mechanism (Plan 2)

**Status: guiding-principles note.** Captured 2026-07-04 from the design dialogue (the deliberate
pre-spec walk Chuck asked for). This is the frame the **Plan 2 brainstorm and spec must operate
inside** — the invariants below are the spec's acceptance criteria, not suggestions. Design-notes are
deliberation, not canon; but this one is the agreed synthesis of the walk, so deviations from it in
the spec must be argued, not slipped.

Grounding: `.claude/skills/{json-ld, lws-protocol, profiles, okf, shacl-constraints, solid-protocol}`
(all claims below were verified against the vendored specs, not memory). Related notes:
`contextual-linked-memory.md` (the *why*), `iri-minting.md` (identity/authority),
`agent-operating-skills.md` (the eventual how-to layer this frame must not be retrofitted under).

---

## A. The world-model (settled)

**A1. One data model.** RDF is the only data model in the system. Everything above it is a
serialization (JSON-LD), a protocol (LWS/HTTP), or a description of constraints (SHACL, profiles).
Nothing above L0 can create meaning that isn't expressible as triples. JSON-LD does not extend the
RDF model — it is a serialization plus a term-mapping mechanism (`@context`); the thing it adds is
document-local naming.

**A2. Two tracks above RDF, joined at the dereference seam.** The *content-semantics track*
(subjects are things; identity is location-independent, minted `…#it`) and the *resource-description
track* (subjects are documents; identity is location). This is the classical information-resource
split (httpRange-14, "Cool URIs"). The pod stores documents; graphs are carried by them.
URI-of-term ≠ URI-of-document — the hash-fragment convention from Plan 1 is the classical device for
the split, and vocabularies/contexts face the same crosswalk equation the cards already solved:
term IRIs (w3id-shaped, ours) resolving to pod documents, with the graph view and document view in
agreement.

**A3. Three operative views.** The *interaction view* (HTTP/MCP mechanics — mostly not RDF,
ephemeral), the *storage graph* (LWS vocabulary; **the shelf**), and the *content graphs* (profile
vocabularies; **the books**). The LWS context describes the storage model only — a container
representation carries storage facts and zero domain facts. LWS already keeps the views physically
separate on the wire (content in bodies under their own `@context`; storage facts in headers,
linksets, container representations — the container representation is the only storage-model *body*
an agent reads). Our job is to not destroy that separation, especially at aggregation points.

**A4. Contexts are plural, layered, and syntactic.** There is no single context in the system; each
response's `@context` declares which model is speaking. A context provides *names, not semantics* —
hop 1 (`@context` → IRIs, consumed by the parser) and hop 2 (IRI → vocabulary, consumed by the
interpreter) are different operations on different artifacts. schema.org keeps the three artifacts
physically separate (context document, vocabulary snapshot, per-term pages); so do we.

## B. Guiding principles (the invariants the spec must satisfy)

**P1 — One question, one mechanism.** Every question an agent asks is answered by exactly one
mechanism at one layer. A question answered by two mechanisms is a conflation bug; a mechanism
answering two questions is an overload (the pre-fix `describedby` carrying both storage-description
and shape-pointer duty was exactly this). The question table (below) is the spec's acceptance
checklist.

**P2 — Subjects never blur.** Storage subjects are URLs; content subjects are minted `#it` IRIs; no
triple mixes them accidentally. The same file carries two subjects — the storage URL (linkset,
mediaType, WAC) and the thing described (typed edges, conformance-of-content) — and collapsing them
is the single most likely agentic failure mode. Vocabulary publication is a crosswalk contract
under the same rule (A2).

**P3 — The dataset rule.** An agent's (and the projection's) working model is a **dataset of named
graphs keyed by source document**, never a merged graph. Any derived surface — the type index today,
Comunica/SPARQL later — must declare which graphs it aggregates. JSON-LD enforces interpretation
discipline per document; **aggregation discipline is enforced by nobody** — no spec in the cake
states this rule, so ours must.

**P4 — Metadata-first handoff.** The storage layer advertises the governing content model
(`conformsTo` in the client-writable metadata tier) *without understanding it*: the shelf tells you
which language the book is in without reading the book. Agents cross the storage→content seam via
metadata **before** parsing bodies. This handoff edge is the one genuinely new mechanism Plan 2
adds; everything else exists.

**P5 — Layer-owned vocabulary.** `lws:` terms are storage; `prof:` terms describe standards; `wm:`
terms belong to one profile; "memory", "card", "curation" are application words that must never
appear in substrate code. The profile mechanism dispatches on role IRIs as opaque tokens and knows
no domain vocabulary. This is also the principled home of the `asTypeCurie` fix (Plan-1 carryover
#4): bare `type:` resolution moves into the profile context; the engine stops knowing any
vocabulary.

**P6 — Unknown-name policy is a profile parameter, and silent drop is memory loss.** Curated terms
are always explicit; `@vocab` never points at the curated namespace (typos would mint impostor IRIs
inside the authoritative namespace); open capture means `@vocab` aimed at a **designated proto
namespace** — governed staging that is queryable, dereferences honestly ("un-curated, minted by
usage"), and feeds the curator promotion loop. Relative/empty `@vocab` is **banned outright**
(JSON-LD 1.1 §4.1.4 resolves it against the document base → location-coupled predicates, the exact
disease Plan 1 cured for subjects). Admission severity is the per-profile loudness knob:
`sh:Warning` = admit-with-advisory (the shipped L3 teaching channel), `sh:Violation` + `sh:closed` =
strict. For a memory substrate, capture-then-curate beats drop-or-reject: an agent that writes an
edge which silently vanishes at parse has suffered the cardinal sin.

**P7 — Artifact kinds dispatch to different subsystems.** Context → parser; vocabulary →
interpreter; shape → validator. Bundling them in one profile never licenses handing one where
another is needed. If `role:context` is minted (see D2), its operation contract must state it is a
syntactic binding, not documentation of meaning.

**P8 — Declaration-time integrity, because the parse seam fails open.** A mis-parsed shape doesn't
error; it evaporates, and validation passes vacuously (empirically proven: a JSON-LD shape whose
`sh:property` blank node lacks `@id` parses to an orphaned restriction — everything admits). Shapes
are therefore validated at install: parse → non-empty shapes graph with real targets/constraints →
SHACL-SHACL → reject `@vocab`-reliant shape documents. Context documents are JSON, not RDF — they
get a declaration-time **lint**, a different validator. One cake, several validators, named
honestly.

**P9 — The law is not the courthouse.** Constraint artifacts are storage-independent profile
content; enforcement points (pod admission, Obsidian client, CI batch) are hooks. The constrained
container constrains *which content graphs enter through it*, never the container itself. The same
shape file must run unmodified at every hook — so shapes never absorb storage-layer assumptions
(no storage-URL subjects in targets; P2 protects this).

**P10 — Views may be pinned at the wire, never inside.** LWS pins compact lexical forms in
container representations (the L2.5 live-gate finding); we emit the pinned view for interop and
bind all internal logic to quads — never string-match lexical forms. Likewise the linkset layer is
Web Linking, not RDF: relation tokens and predicate IRIs (`describedby` the RFC 8288 token vs. the
POWDER IRI) are joined by an explicit crosswalk table, never assumed identical.

**P11 — PROF is a candidate, not a decision.** The spec must justify the bundle indirection
(`conformsTo → profile → hasResource → role → artifact`) against the minimal alternative (bare
`dct:conformsTo` plus two or three typed links; RFC 6906 `profile` link relation). Criterion:
minimum machinery that satisfies P1. PROF earns its keep only if we need multi-artifact bundles
with `prof:isProfileOf` inheritance. (An earlier FOLLOWUP framing presented PROF as near-decided;
it is not.)

**P12 — Drift guard.** LWS is not yet a standard. Pin it, build behind adapter seams, and add this
layer-conflict audit as a standing axis in `docs/foundations/05-jss-spec-conformance.md`, re-run
per LWS revision (watch for: adoption of `@vocab`, more pinned lexical forms, the linkset-mutation
story).

**P13 — Code only guards; applications are data.** Code belongs server-side exactly where
(a) enforcement must be independent of the agent being guarded — admission/SHACL, WAC/no-oracle,
sanitization, rate limits — or (b) affordances must exist before any agent arrives — discovery
surfaces, the MCP tool surface, teaching errors. The profile-mechanism tier may be code only if
it dispatches on profile data and contains no application vocabulary (P5). Everything
application-semantic — content models/parsers, derived-view renderers, domain vocabularies — is
profile data plus agent behavior. Onboarding a new application requires zero code anywhere.
(P9 generalized: same courthouse, any law. Added 2026-07-06 by the L4a spec, from the coupling
review.)

### The acceptance checklist (P1's table)

| Agent's question | The one answering mechanism |
|---|---|
| What do these bytes parse as? | `mediaType` (storage metadata) |
| What graph do the bytes carry? | JSON-LD + `@context` (hop 1, parser) |
| What do the terms mean? | vocabulary via term dereference (hop 2, interpreter) |
| What happens to a name the context doesn't know? | profile `@vocab` policy → proto namespace + admission severity |
| What *is* this resource? | `type` metadata (storage) |
| What must its content conform to? | `conformsTo` (authority) / `describedby` (enforcement materialization) |
| How do I validate? | the profile's validation artifact |
| What thing does this document describe? | the `#it` convention |
| Which graphs am I aggregating? | the dataset rule (P3); derived surfaces declare scope |

### The behavioral contract (the layer-aware agent walk)

1. **Orient** in the interaction view: storage description, well-known endpoints, conneg.
2. **Navigate** the storage graph: containers, linksets — what exists and where, interpreting nothing.
3. **Cross the seam via metadata before parsing bodies**: the linkset's `conformsTo`/`describedby`
   names the governing content model (P4).
4. **Interpret** the body under the profile's context, into its own named graph (P3).
5. **Write by the reverse walk**: container metadata → profile → shape → validate → PUT, with the
   L3 teaching channel as corrector.

### The implementation boundary

Three separately-shippable things: the profile **mechanism** (fork code; generic; knows
PROF-or-equivalent, never `wm:`), profile **definitions** (pod content; data, versioned like data),
and **applications** (consumers, parameterized by profile — the memory system is one of them). The
substrate must not know the memory system exists.

## C. Established facts (carry into the spec; do not re-derive)

1. **`role:context` does not exist.** The W3C roles vocabulary defines exactly eight roles:
   constraints, example, guidance, mapping, schema, specification, validation, vocabulary
   (`.claude/skills/profiles/references/prof-role.ttl`). The scheme is explicitly extensible
   ("not exhaustive or disjoint, and may be extended"). Earlier FOLLOWUP references to
   `role:context` were an error — corrected 2026-07-04.
2. **`conformsTo`/`describedby` resolve as index vs. cache**: `resolveStorageAuthority` walks the
   authority edge (`conformsTo → profile → role:validation → artifact`) and may materialize the
   result as `describedby` — which shipped L3 already consumes. Not competing edges; one is the
   index, the other the enforcement cache.
3. **LWS contains zero `@vocab`** (verified across all eight modules, the JSS docs, the Solid
   protocol references, and the fork's served context). Its normative context is closed, explicit,
   `@protected`, `@version: 1.1`. Extension is layered contexts (array pattern) + IRI-valued
   extension relations (RFC 8288 requires absolute URIs). LWS is silent on content vocabularies —
   correct layering; the profile layer fills the hole. Caveat: `@protected` guards term
   *redefinition*, not the later addition of a `@vocab` by a stacked context.
4. **JSON-LD has no error mode for unknown names**: silent drop without `@vocab` (spec: "properties
   that are not mapped to an IRI or a keyword are ignored") or silent mint with it. Dropped keys
   never become quads and are **invisible to SHACL** — `sh:closed` works only in the mint regime.
   Processor "safe modes" are non-normative; don't build governance on them.
5. **Precedents for mint-to-proto**: VCDM 2.0's `@vocab: …/credentials/issuer-dependent#`
   (separate-namespace pattern, adopted after the interop debate); schema.org's `pending.` staging
   tier. Our version is stronger: governed staging + curation loop + honest dereference.
6. **SHACL runs without entailment by default**, so proto-namespace terms cannot accidentally
   satisfy `sh:class`/`sh:datatype` constraints — closed reasoning favors the proto scheme.
7. **LWS pins compact lexical forms** in container representations (`items[].type` as
   `"Container"`/`"DataResource"` strings — the L2.5 live-gate conformance finding). The
   view-as-spec pattern (as in VC); handled by P10.
8. **Two typing channels already exist and can disagree**: `rel="type"` captured into the
   server-managed `.lwstypes` sidecar (storage metadata) vs. `@type` asserted in content graphs.
   Reconciliation is an open Plan 2 question (D3).

## D. Open questions for the Plan 2 brainstorm (deliberately not prejudged)

1. **PROF vs. minimal typed links** (P11) — how much bundle machinery Plan 2 actually needs now.
2. **Contexts in the bundle**: mint `role:context` with a syntactic operation contract (P7), or
   represent context artifacts outside the role scheme entirely.
3. **The two typing channels** (C8): which one admission trusts, which one the type index serves,
   how divergence is reconciled.
4. **Proto-namespace mechanics**: IRI base (w3id-shaped), dereference response shape, the promotion
   procedure (rewrite quads vs. map terms), per-profile severity defaults.
5. **Where the handoff edge physically lives**: the linkset is the spec-correct home but linkset
   mutation is a deferred L2 carryover; L3's `.meta` store is the working precedent — same token,
   staged migration.
6. **Declaration-time checks per artifact kind** (P8): shapes get SHACL-SHACL; contexts get the
   lint (its rule list needs writing — at minimum: no `@vocab` at the curated namespace, no
   relative `@vocab`); what, if anything, vocabularies get.
7. **Vocabulary publication details**: hash vs. slash term IRIs, the w3id redirect rung, and
   CBD-vs-document agreement for the future query surface (a term queried in a store returns its
   bounded description; dereferenced on the web it returns a document defining many terms — both
   views of one graph must agree).
