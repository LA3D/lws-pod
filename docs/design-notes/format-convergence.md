# Format convergence — architectural design notes

**Status: exploratory. Not a decision, not a plan.** Captured 2026-06-25, reviewed and tightened
2026-06-28 to preserve a long design discussion (OKF / DataBook / openclaw / LWS) and sanity-check
its claims. Nothing here changes the build; the ROADMAP and FOLLOWUP still hold. When/if any of
this is adopted it gets promoted to a numbered canon doc or a `superpowers/specs/` design doc.

### Claim status (read this first)

This doc mixes three registers that earlier drafts blurred. Each load-bearing claim is tagged:

- **[verified]** — checked against a primary source (date noted); upstream facts re-confirmed on GitHub / vendor docs 2026-06-28.
- **[hypothesis]** — our thesis, and a thing the testbed is meant to *test*. Not a result.
- **[exploratory]** — a framing or candidate design we are chewing on, not decided or built.

The earlier version asserted several hypotheses and one undocumented cost claim as fact. Those are now tagged.

## Decisions taken (2026-06-25)

The one thing the discussion settled — the *authoring surface for semantics*:

- **Semantics live in frontmatter typed edges mapped through a JSON-LD context**, not in inline body
  annotation. Body markdown links stay standard (OKF §5) and project as untyped `mentions`
  auto-edges; span-level annotation is reserved for the rare data-catalog case (a `# Schema` table,
  separately parseable). The curly-brace Semantic-Markdown surface used by the early concept cards is
  dropped.
- **Why (agentic):** annotation serves the graph *builder* and the *navigating/curating* agent, not
  the *reading* agent — an LLM already extracts "X is a kind of Y" from prose. So the semantics can
  leave the prose for frontmatter, which is also more checkable: deterministic context mapping
  instead of regex over prose, SHACL-validatable at admission, countable/lintable by the curator.

---

## Why this exists

Google's **OKF v0.1** (markdown + YAML frontmatter, one concept per file, `type:` required) landed,
and Kurt Cagle's *Format Convergence* essay proposed **DataBook** (W3C Holon CG) as a formal OKF
semantic-web profile. That prompted a survey of how three systems implement portable agent knowledge
and where our wiki-memory sits. The discussion sharpened — and corrected — several of our own design
assumptions. This doc records the design space, the forks, the findings (including against our own
design), a candidate synthesis, and the open problems.

## Upstream state [verified 2026-06-28]

The embed-vs-inline fork is **already live and unresolved in the OKF tracker** — not ours to
introduce. Re-pulled from GitHub 2026-06-28:

- **#141 (Cagle / DataBook)** — OPEN, 0 comments. Typed fenced blocks
  (`turtle`/`shacl`/`sparql`/`json-ld`/`n-triples`) + frontmatter `id`/`version`/`graph.named_graph`
  + GSP as canonical ingest + optional SHACL gate. Filed explicitly *against* #98.
- **#98 (nonodename)** — OPEN, one non-maintainer comment. Inline **HTML-RDFa** in markdown + a
  `prefixes:`/`base:` map + an `okf:` ontology, extracted to Turtle. The RDFa-Lite lineage. (Was
  "our camp"; retired — see Decisions-taken. It shares the *semantic model* with the Sparna
  curly-brace form our early cards used, but is a different syntax #98 does not propose.)
- **#148 (typed relationships)** — OPEN, 0 comments. Optional `rel` on cross-links
  (`depends_on`/`implements`/`part_of`/…) via a frontmatter `links:` block or inline link title.
  Notes that **Google Cloud's own managed Knowledge Catalog already ships `synonym`/`related`/
  `definition`/`schema-join` link types with directionality** — argues OKF should mirror it. This is
  the upstream proposal closest to our `edges.ttl` model; bears on edge-vocabulary alignment.
- **#83 (CLOSED / COMPLETED)** — a shipped tool (`okc`, PyPI) that introspects SQLite/Postgres and
  emits OKF v0.1 using the native `resource:` field, turning FK relationships into navigable markdown
  links + an auto `index.md`. The closest *working* prior art for the database-context use case (§
  below) — for the *binding mechanism*, not a full system (no prose-context card, no SHACL floor, no
  pod). **#56** is the OpenAPI-spec → OKF analogue (OPEN).
- Grounding facts, all confirmed OPEN: OKF `type:` is a *free string*, no class vocabulary (a
  semantic profile must *add* one); wikilinks out of scope (#44, canonicalize to standard links);
  provenance cluster (#140 Ed25519-signed manifest, #52/#47/#92/#94/#95); stable-ID cluster
  (#85/#115/#120).
- **No Google maintainer has picked a camp.** Both #141 and #98 are pitched as optional additive
  extensions; the only maintainer comment in the cluster is a directory-placement nit. Treat every
  semantic-linking convention as unratified ground.

## What this substrate is for (the use-case axis)

OKF and DataBook are, in their native habitat, formats for **knowledge *over* structured data** —
semantic catalogs / context graphs — not primarily agent memory. The GA4 bundle is the proof: tables,
metrics defined as SQL, joins, `resource:` URIs pointing at live BigQuery objects, consumed by an
agent for entity-text-annotation and SQL sanity-checking. DataBook's pump-station and sensor examples
are the same genre. Memory is the use case *we* bring; the context graph is the one the format was
built for. The pod has to serve both, and an agentic application is what connects them:

- **Agentic memory** (wiki-memory) — the agent's accumulated knowledge. The card *is* the truth; its
  only consistency obligation is internal (no silent contradictions). Prose-primary.
- **Context graph over structured data** (a BigQuery catalog, a sensor network, a FAIR data catalog,
  the Earth-616 supply-chain graph) — knowledge *about* an external backend, used to ground and
  validate agent operations against it. The card claims something outside itself, so it carries a
  *drift* problem memory never has (the column was dropped; the catalog now lies). `resource:` is the
  hook for the freshness/faithfulness check.
- **The connective tissue.** In an agentic application the context graph bridges the agent's
  memory/reasoning and structured-data storage — "ontology design patterns connecting data to
  computational models," now with an LLM on the consuming end. A pod hosting multiple context graphs
  *plus* memory, federated, is the knowledge-fabric target, not a separate idea.

This partitions the embed-vs-project question by use case rather than forcing a winner: when the
payload **is** formal RDF (an ontology, SHACL shapes, a catalog's typed structure), embedding it in
fenced blocks (DataBook) is honest — there is no prose to annotate. When the payload is prose the
agent reasons with (a memory card), projecting from frontmatter (ours) fits. DataBook is not wrong;
it is centered on a different artifact. Our two on-disk projection paths — frontmatter-driven catalog
cards, prose memory cards — are that same partition, unified onto one frontmatter projection.

### The database-context case [exploratory]

The database-context use case has a cleaner framing worth recording, drawn from the OBDA tradition
(Ontop / R2RML) and the Fluree JSON-LD pattern. It is framing, not designed or built:

- **A general family.** A *context-free native store* + a *mapping layer* that lifts it into a shared
  RDF graph. Three substrates, three mappers: relational tables → **R2RML/Ontop (OBDA)**; plain JSON
  / API payloads → **JSON-LD `@context`** (Fluree is the JSON-LD-native graph DB — the operational
  proof that "JSON + context = graph"); markdown knowledge → **OKF context (ours)**.
- **JSON-LD is the data-equivalent of OKF.** Both are the same enrichment move on different carriers:
  ride a format people already author/exchange in (JSON; markdown+frontmatter) and add semantics as a
  *separable, optional* context a consumer can ignore without loss. OKF frontmatter is JSON-LD-shaped
  YAML — a `{type, resource, edges}` object a context turns into triples.
- **Card as context layer over OBDA.** R2RML/Ontop is the *syntactic* bridge (rows→triples;
  structurally complete, semantically thin — it can't say a column is deprecated or which joins are
  safe). The wiki-memory card is the *semantic/pragmatic* context (meaning, usage, drift status;
  selective). Both bind the same `resource:` IRI and shared vocabulary, so an agent gets both halves.
- **Where DataBook sits here.** DataBook has full RDF expressivity — any vocabulary (CSVW, DCAT,
  R2RML, schema.org) rides in a `turtle`/`json-ld` block, and push/pull (GSP) makes it round-trip-
  oriented. What it lacks is *native tabular affordance* (zero CSVW/DCAT/table convention; you
  bring your own vocabulary and hand-author the block) and a *`resource:`-style frontmatter binding*
  to the described asset (`id:` is the document's own IRI; `domain:` the ontology namespace;
  `process.inputs` generation provenance). So for this use case the difference from OKF is
  **ergonomic + canonicality, not capability** — see the design space below.

**Caveat for the experiment.** These are two evaluations sharing one substrate, with different
metrics and controls. The four-arm testbed (Porter control; retrieval + curation quality) is a
*memory* experiment. A context-graph experiment measures grounding accuracy on structured-data tasks
— SQL correctness, hallucinated-column rate, entity-linking against the catalog. The shared claim is
about the substrate; the per-use-case wins are measured separately.

## The three layers and who consumes them

The recurring concerns — markdown, knowledge graphs, semantic web — are three layers, each serving a
different agentic consumer, with one **canonical** and two **derived**:

| layer | technology | consumer | job |
|---|---|---|---|
| prose (canonical) | markdown | the *reading* agent (LLM) | comprehension — fuzzy, lossy, sufficient; what the agent reasons with |
| graph (derived) | typed edges + RDF vocabulary semantics (SKOS / RDFS) | every cross-artifact operation — reasoning, grounding, routing, navigation, curation | typing, hierarchy, identity, disjointness; retrieval, entailment, the curator's integrity checks |
| web (derived) | IRIs / `owl:sameAs` / named graphs | connection *across* sources + grounding to external data | the federation slice — global identity, cross-source merge, the link to the real asset (deferrable for pure memory) |

Four points the table compresses:

- **The constitutive claim is a hypothesis, not a result.** Our thesis [hypothesis] is that the graph
  layer's vocabulary semantics don't just *help* retrieval but *constitute* the memory architecture:
  `skos:broader` and its hierarchy are load-bearing because flat retrieval has a correctness ceiling
  (the no-escape theorem; Barman's price-of-meaning) that typed hierarchy escapes (Janowicz the
  precursor). Generalized: an RDF vocabulary is a library of formal semantics, each realizing a
  memory property — hierarchy (SKOS → progressive disclosure + bounded branching), identity
  (`owl:sameAs` → dedup + federation), provenance (PROV → episodic + trust), disjointness
  (`owl:disjointWith` → contradiction integrity), partonomy (`partOf` → composite) — which map onto
  the CoALA memory types. **This is exactly what the testbed is built to test** (Porter-vs-ours below);
  it is not yet demonstrated on agent tasks. The one thing the graph plainly does *not* improve is
  single-card in-context comprehension.
- **Canonical vs derived.** The prose card is the source of truth; the graph and web views are
  *projections*. Optimize the card's authorability and the projection's fidelity; never hand-maintain
  the graph — derive it. That is the content of the frontmatter-edges decision: one artifact, three
  obligations (readable, navigable, connectable), the latter two projected from the first.
- **Complementary, not redundant.** Markdown alone: the LLM comprehends but cannot traverse / curate
  / connect at scale (the Porter / openclaw ceiling). Graph alone, no prose: machine-navigable but the
  reasoning context is gone and authoring is miserable. Web alone, RDF in a triplestore: identity and
  interop, but re-centralized with the readable layer at the margin (DataBook's drift risk). The graph
  supplies a disambiguated relational scaffold (which note *criticizes* vs *extends* which), not
  understanding.
- **Center of mass differs by use case.** Memory needs prose + the graph layer's vocabulary
  semantics; only the federation slice (`sameAs` across pods, named-graph composition) is deferrable.
  Context graphs over structured data need that federation slice load-bearing too (you cannot connect
  to BigQuery or sensors without global identity + interop). This is why DataBook is web-heavy and we
  are prose/graph-heavy with federation only at the seam.

**The governance floor as impedance-matcher.** The prose/LLM layer is fuzzy and tolerant (that is
*why* LLMs work); the web/RDF layer is precise and brittle (that is *why* RDF is useful). Projecting
fuzzy prose into precise triples is lossy — the `type: Reference → skos:Reference` invalid-IRI
failure (Reconciliation, below) is this seam tearing. The synchronous SHACL floor and the curator
match impedance between the two layers — they catch the projection when it lies, the same lever as
DataBook's SHACL-on-push. The stakes scale with architectural load: a *wrong* `skos:broader`
misroutes hierarchical retrieval and the agent trusts the taxonomy, so it is worse than a missing
one. And SKOS/RDFS supply the *vocabulary* for hierarchy, not a *good* hierarchy — nothing in them
stops a 200-narrower hub or a cycle. Bounded branching (Fano), acyclicity, and balance are invariants
the curator and SHACL impose *on top of* the vocabulary.

## The four-system design space

The comparison that runs through the rest of the doc. Per system: what it does well, what it does
badly, what we keep from it.

| | storage | structure | query | curation |
|---|---|---|---|---|
| **DataBook** (Holon) | triplestore (GSP push/pull) | embedded RDF in fenced blocks (full RDF expressivity) | server SPARQL, named graphs | `shapes:` SHACL is informational; `--shapes` is a separate op, not a push prerequisite; no maturity / link-curation model |
| **openclaw** memory-wiki | local files + compiled caches | typed claims + evidence + confidence (non-RDF typed structure) | 5 fixed modes over compiled digests, no RDF | `wiki lint` + contradiction reports, single-host |
| **ours** (wiki-memory) | LWS pod (authz / identity / decentralized) | projected RDF (frontmatter edges + JSON-LD context → `graph`) | CNF Type Search + client Comunica | synchronous SHACL admission floor + owner-scoped curator over derived index; maturity / Fano-branching / contradiction ported from vault |
| **Porter** (control) | LWS pod | flat shared graph | SPARQL-the-pile | none — flat pile, uncuratable (part of why it's the control) |

### DataBook — the scale/interop/federation answer (we under-credited it) [verified 2026-06-28]

Indexed graph query (triplestore), named graphs (multi-source composition), global IRI identity,
standard SPARQL, RDF equivalence/merge (sameAs/OWL/SHACL) — exactly the properties a large *shared*
memory needs and that openclaw cannot provide. Pushable block types `turtle`/`turtle12`/`trig`/
`json-ld`/`shacl`/`sparql-update`; push (GSP→store) and pull (SPARQL→DataBook) make it round-trip-
oriented (no explicit *lossless* guarantee in the docs).

The critique is about *canonicality*, not capability: embed-as-canonical-card pushes prose to the
margin and duplicates structure (drift); triplestore-as-source-of-truth re-centralizes and drops
authz/decentralization. The flagship SHACL gate is informational, not enforced on push. Holon CG is
effectively single-editor (Cagle chairs and is the primary editor). And, per the use-case section, no
`resource:`-style binding and no native tabular affordance — present as embedded RDF if you author it.

### openclaw — rich content model, wrong architecture for our target [verified 2026-06-28]

- Single-host, local-only. `search.backend: 'shared'` is a local backend shared among one agent's
  tools, not networked multi-writer; no inter-agent authz or concurrency control. Identity is local
  alias-resolution keys (`canonicalId` + `aliases`), not global dereferenceable IRIs. A personal
  brain, not a commons.
- Bespoke search over compiled caches: 5 fixed modes (`auto`, `find-person`, `route-question`,
  `source-evidence`, `raw-claim`) over `.openclaw-wiki/cache/agent-digest.json` + `claims.jsonl`. The
  modes can't express multi-hop relational queries; inline `claims[]`/`evidence[]` arrays live in the
  source files (hot index inside cold docs). Contradiction detection exists (`reports/contradictions.md`,
  `wiki lint`, cluster dashboards); its *cost* is **[inference, not documented]** — the
  compile-then-cache, recompute-on-`wiki compile` architecture is *consistent with* non-incremental
  recompute, but no complexity claim is in the docs. Earlier drafts asserted "O(n²)" as fact; that was
  an unsupported extrapolation.
- **Worth adapting as curation substrate:** the claim / evidence / confidence sub-card model (what a
  curator reasons over) and the block-ownership write contract (`wiki_apply` does narrow mutations,
  never freeform page surgery — the multi-writer discipline the pod needs more than the single-writer
  vault). Relationships are non-RDF typed structure (`targetId`/`kind`/`weight`/`confidence`; OKF
  imports become `kind: okf-link`).

### Ours — the unexamined assumption

We sold "no server SPARQL, client Comunica over `graph.ttl`" as a clean LWS-aligned win. At scale it
is the **same weakness as openclaw**: Comunica over a flat per-container aggregate (or link-traversal
across containers) will not match an indexed triplestore on large, complex, multi-hop queries.
Validated on a handful of cards; no evidence it holds at thousands across many containers. The
DataBook comparison exposed this. *Corrected motivation (see Curation):* the derived index's
strongest justification is not search-scale — it is **curation** (global-topology queries,
owner-scoped, authz-clean). Search-scale stays a thing to **measure**, not assume.

### The forks (axes of decision)

1. **Where structure lives:** embed (DataBook) vs project from frontmatter (ours) vs managed-blocks
   (openclaw: human prose + system-generated blocks in one file, ownership-segregated).
2. **Canonical store vs query index:** is the graph store the source of truth (DataBook) or a
   *derived* index over a canonical store (the synthesis below)?
3. **Query placement:** server SPARQL (DataBook) vs client-side Comunica (ours) vs CNF server-managed
   Type Search (LWS) vs bespoke engine (openclaw).
4. **The storage/authz/identity leg:** the commons substrate for *multi-agent, permissioned,
   decentralized* memory. Unbuilt in DataBook and openclaw alike — our differentiator. (Both research
   passes and the broader ecosystem check independently confirm this leg is unbuilt across systems.)
5. **Quality placement:** admission-time gate (synchronous SHACL) vs periodic sweep vs continuous;
   human-in-loop vs headless. This surfaces a *second* consumer — the curator.

## LWS as the substrate layer (added 2026-06-28) [verified against the LWS 1.0 spec]

OKF and DataBook are *content* formats; LWS is the *envelope* — identity, containment, conneg,
authz, notifications, type discovery. They are different layers of one stack, and LWS turns out to
be the storage/identity/discovery substrate OKF and DataBook both assume but neither provides. The
four-system comparison above sits *on* this layer.

| LWS concept | maps to | OKF | DataBook |
|---|---|---|---|
| `DataResource` (opaque body + `mediaType`) | = | a concept card (`text/markdown`) | a `.databook.md` doc |
| `Container` (`items`, `rel="up"`, paginated `lws+json`) | = | a bundle dir + `index.md` | a dir of docs |
| container representation (machine listing) | overlaps | `index.md` (navigation view) | — |
| `rel="type"` Link header → **Type Index** | needs a bridge | `type:` (free string) | `rdf:type` in a block |
| **indexed relations** (descriptive `rel` filters) | converges | #148 typed `rel`; our frontmatter edges | named-graph edges |
| Type Search (CNF, authz-filtered) = Tier-1 | composes with | — | DataBook SPARQL = Tier-2 |
| LWS-CID / did:key / OIDC + WAC | supplies | *(OKF has none)* | *(DataBook has none)* |
| Notifications (CDC) | feeds | the projection trigger | GSP push |

**Three convergences:**

- **The candidate architecture below is literally LWS + DataBook.** LWS Type Search has a deliberate
  ceiling — CNF over `type` + indexed relations (`?type=A,B&type=C` = `(A OR B) AND C`); the spec
  forbids *requiring* nesting/negation/ordering/text-match, and it is authz-filtered per request.
  That is Tier-1. DataBook's SPARQL-over-GSP is Tier-2 (expressive, unauthz'd). **The spec states the
  reason this doc inferred for the hard problem:** it offers only CNF and no SPARQL endpoint precisely
  because authz-filtered arbitrary SPARQL is hard. LWS independently confirms the authz-over-index
  analysis — it is the standard's own design constraint, not our idiosyncrasy.
- **LWS "indexed relations" ≈ OKF #148 typed `rel` ≈ Google's managed-catalog link types.** Three
  groups arriving at the same primitive — typed descriptive edges as a filterable discovery dimension,
  filtered with the *same CNF semantics* as `type`. Strong support for aligning `edges.ttl` names
  across all three.
- **LWS *is* "the leg nobody else builds."** The differentiator (authz/identity/decentralization) is
  not ours to invent — it is the LWS substrate, standardized. "Ours" = an OKF/DataBook content model
  *on* LWS. The differentiator is being the one stack that puts a portable knowledge format on a
  permissioned, identified, decentralized store.

**Four seams the integration must bridge (this is the unbuilt sidecar):**

1. **LWS derives types from Link headers, not from the body** — body-parsing is explicitly optional.
   A naive OKF-card-on-LWS gets *zero* type discovery; the admission/projection sidecar must emit
   `rel="type"` + typed-edge Link headers at write time (the ROADMAP's "linkset capture at
   admission"). JSS implements none of the LWS storage/search layer — this is the net-new work.
2. **OKF `type:` is a free string; LWS Type Index items are type URIs.** The bridge is the
   string→URI map — the JSON-LD context / class vocabulary OKF omits (the `type: Reference →
   invalid skos:Reference` failure is this seam).
3. **No-discovery-oracle vs publish-the-schema.** LWS deliberately does *not* enumerate which
   relations it indexes (security). Publish the *schema* out-of-band (storage description / a context
   doc); you cannot probe the search service to learn the edge set. Two separate mechanisms.
4. **GSP/SPARQL has no authz; LWS is authz-first.** Composing DataBook's Tier-2 onto an LWS pod is
   exactly the "public-only derived index" resolution (Option 1 below).

**One overlap worth a decision** [exploratory]: LWS's container representation (paginated,
authz-filtered `lws+json` listing) and OKF's `index.md` answer the same "what's here" question. The
LWS listing could *be* the machine navigation surface with `index.md` as the prose view — instead of
projecting a machine-readable index by hand. Weigh against keeping `index.md` portable off-LWS.

## Curation — the second consumer (added 2026-06-25)

The doc above is built around one consumer: the retrieving agent. A second changes the calculus — the
**curator** that runs quality and link-curation checks, as in the vault (`/audit`, `/review-note`,
`/curator`).

- **Curation is a global-topology workload; search is mostly local.** Maturity (≥3 incoming typed
  edges), Fano-bound hub detection (>12 children), orphan / dead-end / dangling-ref integrity, and
  contradiction-cluster detection (notes sharing a `concept:` edge whose claims silently disagree) are
  aggregation / degree-count / reachability queries over the *whole* corpus. That is the indexed-graph
  workload — where the derived index earns its keep, more than search does.
- **It may be the discriminating experiment** [hypothesis]. On retrieval, openclaw (structure without
  RDF) might tie. On curation we *expect* it to struggle — contradiction detection exists but is
  batch-recompiled and has no relational query; cost is an inference, not a measured fact. So curation
  — not retrieval — is the likeliest place where "linked-data *specifically*" separates from "typed
  structure *generally*". Stated as a prediction to test, not a known outcome.
- **Curation authz is the easy case.** The hard open problem below is multi-tenant *search* over a
  flat derived store. Owner-scoped *curation* legitimately runs over the full within-scope graph (a
  maintenance op, not a cross-tenant query) — authz-clean by construction. The derived index thus has
  two customers: public-commons search (hard authz) and owner-scoped curation (easy authz), and the
  latter justifies building it regardless of the former.
- **The curator is also a writer**, so its edge / maturity / type suggestions go back through the
  SHACL admission floor: the constrained-container and the curator are two halves of one quality loop
  (the 422 is the curator's write-feedback channel).
- **The vault model ports, but harder.** Multi-writer memory has no shared mental model and no human
  in the loop, so silent contradiction and link rot are *more* likely than in the single-writer vault
  — curation becomes load-bearing infrastructure, and must adjudicate headless.

## Reconciliation with the built state [verified on disk]

Checked against what is on disk (the upstream half now lives in "Upstream state" above):

- **Two projection paths, not one.** Hand-authored concept cards used inline annotation; the imported
  GA4 OKF bundle is frontmatter-driven and uses no inline annotation. Decisions-taken resolves this
  forward: frontmatter edges for both.
- **`type:` is dropped in the GA4 projection** — the bundle's `graph.ttl` carries no `rdf:type` (a
  bare `type: Reference` → invalid `skos:Reference`, so it was omitted). The one *required* OKF field
  survives in frontmatter but is absent from the projected graph for imports. (Proper notation→class
  resolution is deferred in `projection/okf/card.mjs`.)
- **`graph.ttl` is JSON-LD on disk** though the graph channel declares `text/turtle`. Harmless for
  Comunica, but the name and serialization disagree — flag for the conneg story.

## Candidate architecture (to chew on) [exploratory]

Separate **canonical store** from **query index** — which dissolves the earlier objection to GSP:

- **Pod = canonical** (LWS: authz, identity, decentralization, SHACL admission floor). The leg neither
  DataBook nor openclaw has; we keep it.
- **Cards stay prose-primary**, RDF projected on write from frontmatter typed edges + a JSON-LD
  context (the #141 frontmatter lineage minus the fenced RDF blocks; see Decisions-taken) — not
  embedded blocks, not inline body annotation, as canonical.
- **A triplestore is a derived, materialized query index**, GSP-fed *from the projection* — a view,
  not the source of truth. This buys DataBook's indexed-SPARQL scale + standard interop without the
  store being authoritative and without sacrificing authz/decentralization. GSP becomes "how the index
  is fed," not "the centralizing mistake."
- **Tiers:** Tier-1 = LWS CNF Type Search (cheap, server-managed, authz-filtered per request); Tier-2
  = indexed SPARQL over the derived index for scale; client Comunica retained for small / private /
  offline cases. A third consumer, the curator, runs full within-scope topology queries over the
  derived index under owner authz.
- **Content enrichments to weigh:** claim/evidence/confidence (openclaw) · block-ownership write
  contract (openclaw) · `id:` IRI + PROV-O `process:` provenance (DataBook) · optional Ed25519 signing
  seam (#140).

## The hard open problem (do not gloss)

**Authz over a derived query index.** The pod gives per-resource WAC; a materialized triplestore
flattens it — SPARQL over a flat store sees everything. This is *precisely why* LWS offers only CNF
Type Search and no SPARQL endpoint: authz-filtered arbitrary SPARQL is hard. So "Tier-2 = SPARQL over
a derived index" reintroduces the problem LWS designed around — but only for *multi-tenant search*.
Owner-scoped curation over the same index is authz-clean by construction. Candidate resolutions for
the search case, none free:

1. **Public-only index (leading candidate).** The derived triplestore holds *only* public-read
   content — the shared-memory commons (scale + SPARQL + interop for everyone). Private/permissioned
   content stays pod-only, queried client-side with the requester's bearer (authz "free"). Authz
   preserved by construction; maps onto our public/private split and openclaw's privacy tiers. *Limit:*
   queries spanning public + private need federation (client Comunica federating the public index +
   authorized pod reads).
2. **Per-authz-scope index partitioning** — a separate index per access scope. Clean, expensive,
   scope-explosion risk.
3. **Query rewriting with authz filters** — inject WAC-derived filters into SPARQL. Couples the index
   to live ACL state; brittle.

Option 1 is the one to think hardest about: derived index = public commons, pod = permissioned/private
layer. It reframes "privacy tiers in frontmatter" as the signal that decides *what gets projected into
the public index*.

## What we keep from each

- **From OKF:** the format floor (markdown + frontmatter + `type:`), as portable interchange; the
  `resource:` binding to external assets. Likely OKF-as-import more than OKF-as-rigid-native (we
  already import GA4 bundles).
- **From #98 / #148:** an explicit `okf:`/local edge vocabulary (OKF carries none), expressed as
  **frontmatter edges + a published JSON-LD context** — not inline annotation (retired). Align the
  edge names loosely with Google's managed-catalog link types (#148) for a cheaper future crosswalk.
- **From DataBook:** indexed graph query, named graphs, IRI identity, SPARQL interop, PROV-O
  provenance — adopted as a *derived index*, not the store.
- **From openclaw:** claim/evidence/confidence model; block-ownership write contract; privacy tiers;
  lint-as-a-tool.
- **Ours / LWS (the leg nobody else builds):** pod-canonical authz + identity + decentralization +
  synchronous admission floor.

## Open questions to chew on

1. Authz-over-derived-index — which resolution for the *search* case (esp. public-commons-index +
   private-pod-federation)?
2. Tier-2-at-scale — **measure** client Comunica vs derived triplestore rather than assume.
3. Claim-level model — worth the authoring/maintenance burden as curation substrate, or do typed edges
   suffice?
4. Wikilink canonicalization (#44) for OKF-conformant cards.
5. Upstream engagement — contribute the LWS leg, align with the #141 frontmatter lineage + #148 edge
   types, or just track Holon CG?
6. **A `db-catalog` profile** — is the OBDA-context use case a second projection profile (DCAT/CSVW/
   schema.org + `resource:`) on the existing engine, and does mining #83's `okc` accelerate it?
7. **Curation cadence** — who curates a multi-writer commons, and when: admission-time gate vs periodic
   sweep vs continuous?
8. **Headless curation** — can contradiction resolution run without a human adjudicator, and is
   claim / evidence / confidence the right substrate?
9. **Curation-authz at scale** — does owner-scoped curation authz stay clean as scopes and writers
   multiply?

(Retired as decided 2026-06-25: "embed vs project vs inline" → frontmatter edges; "native-OKF vs
OKF-as-import" → both, by path. See Decisions-taken.)

## Testbed framing (the design space is the experiment)

The four arms are real comparators for the "structure helps agents" thesis: **DataBook** (embed +
central triplestore) · **openclaw** (rich claims, no graph, local) · **ours** (pod + projection +
derived index) · **Porter** (flat shared graph). openclaw is the strongest challenger — structure
*without* the RDF machinery — so it is the arm to beat. The consistent finding across all three
external systems [verified]: the storage/authz/identity leg for multi-agent permissioned memory is
unbuilt. That is the gap we are positioned to fill.

**Three measured axes, not one.**

1. **Task quality** — does the typed-semantic graph improve the reasoning/grounding/explanation
   agent's actual output (answer correctness, hallucinated-join rate, justification traceability)?
   "Structure helps agents" lives or dies here [hypothesis], not in retrieval.
2. **Retrieval quality** — the obvious one; openclaw may tie here.
3. **Curation quality** (corpus health) — where the *linked-data-specifically* claim is most likely to
   separate from *typed structure generally* [hypothesis]; openclaw is *predicted* to struggle (batch
   recompute, no relational query), not known to.

Porter is not a vague flat control: Porter is flat retrieval, ours is SKOS-hierarchical. The
hierarchy semantics are the *independent variable* the rig varies; Porter-vs-ours is the test of the
no-escape-theorem hypothesis on agent tasks. Report all three axes explicitly.

## Pointers

- Convergence essay + DataBook: `ontologist.substack.com/p/the-format-convergence`; spec
  `github.com/w3c-cg/holon`; CLI `github.com/kurtcagle/databook`.
- OKF: `github.com/GoogleCloudPlatform/knowledge-catalog` (issues #141, #98, #148, #83, #56, #63,
  #140, #44, #85).
- openclaw memory-wiki: `docs.openclaw.ai/plugins/memory-wiki`, `docs.openclaw.ai/cli/wiki`.
- OBDA / RDB→KG (vault): Heimsbakk "Data Engineering → Knowledge Engineering" series, `maplib`,
  Knowledge Fabrics MOC; Ontop / R2RML. Fluree JSON-LD (`JSON-LD.md`). GSM "Dialogue-Driven Database
  Memory" is the live database-context project.
- LWS / Solid specs (grounded skills): `lws-protocol` (core, vocabulary, search/type-index, the four
  auth suites), `solid-protocol`, `shacl-constraints`.
- Ours: `../ROADMAP.md`, `../foundations/02-content-model.md`,
  `../foundations/04-comunica-patterns.md`, `../foundations/03-governance-lessons.md`,
  `../../constrained-container/`, `../../projection/`. The dual-projection sketch is archived at
  `../archive/wiki-memory-dual-projection.md`.
- Curation model (ported from the vault): the `/audit`, `/review-note`, `/curator` skills.
- Grounded skills: `okf`, `semantic-markdown`, `lws-protocol`, `comunica-sparql`, `shacl-constraints`,
  `solid-protocol`.
