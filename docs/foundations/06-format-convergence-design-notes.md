# Format convergence — architectural design notes

**Status: exploratory. Not a decision, not a plan.** Captured 2026-06-25 to preserve the nuance
of a long design discussion (OKF / DataBook / openclaw / LWS) so it can be chewed on later. Nothing
here changes the build; the ROADMAP and FOLLOWUP still hold. When/if any of this is adopted it gets
promoted to a numbered canon doc or a `superpowers/specs/` design doc.

## Decisions taken (2026-06-25)

The architecture below stays exploratory, but the design discussion did settle one thing — the
*authoring surface for semantics*:

- **Semantics live in frontmatter typed edges mapped through a JSON-LD context**, not in inline body
  annotation. Body markdown links stay standard (OKF §5) and project as untyped `mentions`
  auto-edges; span-level annotation is reserved for the rare data-catalog case (a `# Schema` table,
  separately parseable). The curly-brace Semantic-Markdown surface used by the early concept cards is
  dropped.
- **Why (agentic):** annotation serves the graph *builder* and the *navigating/curating* agent, not
  the *reading* agent — an LLM already extracts "X is a kind of Y" from the prose. So the semantics
  can leave the prose for frontmatter, which is also more accurate: deterministic context mapping
  instead of regex over prose, SHACL-validatable at admission, countable/lintable by the curator.

---

## Why this exists

Google's **OKF v0.1** (markdown + YAML frontmatter, one concept per file, `type:` required) landed,
and Kurt Cagle's *Format Convergence* essay proposed **DataBook** (W3C Holon CG) as a formal OKF
*semantic-web profile*. That prompted a survey of how three systems implement portable agent
knowledge, plus where our wiki-memory sits. The discussion materially sharpened — and corrected —
our own design assumptions. This doc records the design space, the forks, the critical findings
(including against our own design), a candidate synthesis, and the open problems.

## The upstream context (don't re-derive)

The embed-vs-inline fork is **already live and unresolved in the OKF tracker** — not ours to
introduce:

- **#141 (Cagle / DataBook):** typed fenced blocks (`turtle`/`shacl`/`sparql`/`json-ld`/`n-triples`)
  + frontmatter `id`/`version`/`graph.named_graph`/`graph.push_mode` + **GSP as "canonical ingest"**
  + optional SHACL gate. Filed explicitly *against* #98.
- **#98 (nonodename):** inline RDFa in markdown + a `prefixes:`/`base:` map + an `okf:` ontology,
  extracted to Turtle. This is the **Semantic-Markdown / RDFa-Lite lineage — our camp.**
- Grounding: OKF `type:` is a *free string*, no class vocabulary (a semantic profile must *add* one);
  wikilinks are out of scope (#44, canonicalize to standard links); provenance/trust is a live
  cluster (#140 Ed25519-signed manifest, #52, #47, #92/#94/#95); stable-ID cluster (#85/#115/#120).

Google has not picked a camp. Both #141 and #98 are pitched as optional additive extensions.

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
- **The connective tissue.** In an agentic application the context graph is the bridge between the
  agent's memory/reasoning and structured data storage — "ontology design patterns connecting data to
  computational models," now with an LLM on the consuming end. A pod hosting multiple context graphs
  *plus* memory, federated, is the knowledge-fabric target, not a separate idea.

This partitions the embed-vs-project question by use case rather than forcing a winner: when the
payload **is** formal RDF (an ontology, SHACL shapes, a catalog's typed structure), embedding it in
fenced blocks (DataBook) is honest — there is no prose to annotate. When the payload is prose the
agent reasons with (a memory card), projecting from frontmatter (ours) is right. DataBook is not
wrong; it is centered on a different artifact. Our two on-disk projection paths — frontmatter-driven
catalog cards, prose memory cards — are that same partition, unified onto one frontmatter projection.

**Caveat for the experiment:** these are two evaluations sharing one substrate, with different metrics
and controls. The four-arm testbed (Porter control; retrieval + curation quality) is a *memory*
experiment. A context-graph experiment measures grounding accuracy on structured-data tasks — SQL
correctness, hallucinated-column rate, entity-linking against the catalog. The shared claim is about
the substrate; the per-use-case wins are measured separately.

## The three layers and who consumes them

The recurring concerns — markdown, knowledge graphs, semantic web — are not redundant overlaps. They
are three layers, each serving a different agentic consumer, with one **canonical** and two
**derived**:

| layer | technology | consumer | job |
|---|---|---|---|
| **prose** (canonical) | markdown | the *reading* agent (LLM) | comprehension — fuzzy, lossy, sufficient; what the agent reasons with |
| **graph** (derived) | typed edges **+ RDF vocabulary semantics** (SKOS / RDFS) | *every cross-artifact operation* — reasoning, writing, grounding, routing, explanation, navigation, curation | **constitutes the memory architecture**: imposes hierarchy (the no-escape escape), typing, identity, disjointness; supplies retrieval, entailment, and the curator's integrity checks |
| **web** (derived) | IRIs / `owl:sameAs` / named graphs | connection *across* sources + grounding to external data | the *federation* slice — global identity, cross-source merge, the link out to the real asset (deferrable for pure memory) |

Four points the table compresses:

- **Constitutive, not instrumental — the semantics *are* the architecture.** The graph layer is not a
  substrate agents merely query; its RDF vocabulary *is* the memory architecture. The hierarchy the
  memory research says is load-bearing is `skos:broader` and its semantics — flat retrieval has a
  mathematical ceiling (the no-escape theorem; Barman's price-of-meaning) and the hierarchy is the
  escape (Janowicz the precursor). Generalize it: an RDF vocabulary is a *library of formal semantics,
  each realizing a memory property* — hierarchy (SKOS → progressive disclosure + bounded branching),
  identity (`owl:sameAs` → dedup + federation), provenance (PROV → episodic + trust), disjointness
  (`owl:disjointWith` → contradiction integrity), partonomy (`partOf` → composite). These map onto the
  CoALA memory types: semantic memory just *is* the SKOS/RDFS concept graph. And the vocabulary
  computes for itself — entailment, transitive closure, integrity — work no agent performs. The one
  thing the graph does *not* improve is single-card in-context comprehension; everything cross-artifact
  draws on it.
- **Canonical vs derived.** The prose card is the source of truth; the graph and web views are
  *projections* of it. Optimize the card's authorability and the projection's fidelity; never
  hand-maintain the graph — derive it. That is the whole content of the frontmatter-edges decision:
  one artifact, three obligations — readable, navigable, connectable — discharged by projecting the
  latter two from the first.
- **Complementary, not redundant — each fails where the next picks up.** Markdown alone: the LLM
  comprehends but cannot traverse / curate / connect at scale (the Porter / openclaw ceiling). Graph
  alone, no prose: machine-navigable but the reasoning context is gone and authoring is miserable. Web
  alone, RDF in a triplestore: identity and interop, but re-centralized with the readable layer pushed
  to the margin (DataBook's drift risk). The graph does not supply *understanding* — it supplies the
  LLM a disambiguated relational scaffold (which note this one *criticizes* vs *extends*) that prose
  alone cannot reliably convey.
- **Center of mass differs by use case.** Memory needs prose + the graph layer's *vocabulary
  semantics* — `skos:broader` is non-optional, it *is* the architecture; only the *federation* slice
  of RDF (`sameAs` across pods, named-graph composition) is deferrable. Context graphs over structured
  data need that federation slice load-bearing too (you cannot connect to BigQuery or sensors without
  global identity + interop). This is why DataBook is web-heavy and we are prose/graph-heavy with the
  federation layer only at the seam.

**Where it gets hard — and where the governance floor lives.** The prose/LLM layer is fuzzy and
tolerant (that is *why* LLMs work); the web/RDF layer is precise and brittle (that is *why* RDF is
useful). Projecting fuzzy prose into precise triples is lossy — the `type: Reference → skos:Reference`
invalid-IRI failure (Reconciliation, below) is this seam tearing. The synchronous SHACL floor and the
curator are not add-ons beside the layers; they are the **impedance-matcher** between the LLM layer
and the semantic-web layer — what catches the projection when it lies. Same lever as the demo's query
sanity-checking and DataBook's SHACL-on-push: validate the crossing from fuzzy to precise. **And the
stakes scale with architectural load:** a *wrong* `skos:broader` is worse than a missing one — it
misroutes hierarchical retrieval, and the agent trusts the taxonomy. Note too that SKOS/RDFS supply
the *vocabulary* for hierarchy, not a *good* hierarchy — nothing in them stops a 200-narrower hub or a
cycle. Bounded branching (Fano), acyclicity, and balance — the properties that keep retrieval in the
*escapable* regime — are architectural invariants the curator and SHACL impose *on top of* the
vocabulary, not gifts of it.

## The design space (four named points)

| | storage | structure (where it lives) | query | curation / quality |
|---|---|---|---|---|
| **DataBook** (Holon) | triplestore (GSP push) | **embedded** RDF in fenced blocks | server SPARQL, named graphs | proposed SHACL gate (not CLI-wired); no maturity / link-curation model |
| **openclaw** memory-wiki | local files + compiled caches | **typed claims + evidence + confidence** (rich) | bespoke 5-mode search, no RDF | lint-as-tool + contradiction dashboards, but O(n²) recompute, single-host |
| **ours** (wiki-memory) | **LWS pod** (authz/identity/decentralized) | **projected** RDF (frontmatter edges + JSON-LD context → `graph`) | CNF Type Search + client Comunica | synchronous SHACL admission floor + owner-scoped curator over derived index; maturity / Fano-branching / contradiction ported from vault |
| **Porter** (control) | LWS pod | flat shared graph | SPARQL-the-pile | none — flat pile, uncuratable (part of why it's the control) |

This table *is* the experiment (see Testbed below). Each system fills a different layer well and a
different layer badly.

## The forks (axes of decision)

1. **Where structure lives:** embed (DataBook) vs project/inline (ours, #98) vs managed-blocks
   (openclaw keeps human prose + system-generated blocks in one file, ownership-segregated).
2. **Canonical store vs query index:** is the graph store the source of truth (DataBook) or a
   *derived* index over a canonical store (the synthesis below)?
3. **Query placement:** server SPARQL endpoint (DataBook) vs client-side (ours, Comunica) vs CNF
   server-managed type search (LWS) vs bespoke engine (openclaw).
4. **The storage/authz/identity leg:** the commons substrate for *multi-agent, permissioned,
   decentralized* memory. **Unbuilt in DataBook and openclaw alike. It is our differentiator.**
5. **Quality placement:** admission-time gate (synchronous SHACL) vs periodic curation sweep vs
   continuous; and human-in-loop vs headless. This axis surfaces a *second* agentic consumer — the
   **curator** — distinct from the retrieving navigator the four axes above implicitly serve.

## Critical findings (including against ourselves)

**openclaw — rich content model, wrong architecture for our target.**
- Single-host. "Shared" = local backend shared among one agent's tools; "bridge" = in-process
  plugin seams. No networked multi-writer, no inter-agent authz, no concurrency control. Identity
  is *local* alias-resolution keys, not global dereferenceable IRIs. A personal brain, not a commons.
- Scalability ceiling: bespoke unindexed search over compiled caches (`agent-digest.json`,
  `claims.jsonl`); 5 fixed modes can't express/optimize multi-hop relational queries; inline
  `claims[]`/`evidence[]` bloats the source files (hot index inside cold docs); contradiction
  dashboards are ~O(n²) recompute-the-world.
- Worth adapting — specifically as **curation substrate**, not content niceties: the
  **claim / evidence / confidence** sub-card model (what a curator reasons over for contradiction and
  quality) and the **block-ownership write contract** (`wiki_apply` does narrow mutations, never
  freeform page surgery — the multi-writer curation discipline the pod needs more than the vault).

**DataBook — the scale/interop/federation answer (we under-credited it).**
- Indexed graph query (triplestore), **named graphs** (multi-source composition), **global IRI
  identity**, standard **SPARQL** interface, RDF equivalence/merge (sameAs/OWL/SHACL). These are
  exactly the properties a large *shared* memory needs and that openclaw cannot provide.
- But: embed-as-canonical-card pushes prose to the margin and duplicates structure (drift);
  triplestore-as-source-of-truth re-centralizes and drops authz/decentralization; the flagship
  SHACL-gating is not actually wired in the CLI (separate `--shapes`, not a push prerequisite);
  single-editor draft maturity (Holon CG launched 2026-06-19, Cagle chairs + sole-edits).

**Ours — the unexamined assumption.** We sold "no server SPARQL, client Comunica over `graph.ttl`"
as a clean LWS-aligned win. At scale it is the **same weakness as openclaw**: Comunica over a flat
per-container aggregate (or link-traversal across containers) will not match an indexed triplestore
on large, complex, multi-hop queries. Validated on a handful of cards; no evidence it holds at
thousands across many containers, and reason to doubt it. The DataBook comparison correctly exposed
this. **What we keep that nobody else has:** pod-native authz, LWS identity, decentralization, and
the synchronous SHACL admission floor (the 422 teaching channel). *Corrected motivation (see
Curation, below):* the derived index's strongest justification is not search-scale at all — it is
**curation** (global-topology queries, owner-scoped and authz-clean). Search-scale stays a thing to
*measure*, not assume.

## Curation — the second consumer (added 2026-06-25)

The doc above (and the table's original three columns) is built around one consumer: the retrieving
agent. A second consumer changes the calculus — the **curator** that runs quality checks, sanity
checks, and link curation, as in the vault (`/audit`, `/review-note`, `/curator`).

- **Curation is a global-topology workload; search is mostly local.** Maturity (≥3 incoming typed
  edges), Fano-bound hub detection (>12 children), orphan / dead-end / dangling-ref integrity, and
  contradiction-cluster detection (notes sharing a `concept:` edge whose claims silently disagree)
  are all aggregation / degree-count / reachability queries over the *whole* corpus. That is the
  indexed-graph workload — **where the derived index earns its rent**, more than search does.
- **It is the discriminating experiment.** On retrieval, openclaw (structure without RDF) may tie.
  On curation, the doc's own evidence predicts it breaks (O(n²) recompute, no relational query). So
  curation — not retrieval — is where "linked-data *specifically*" separates from "typed structure
  *generally*", the real open question inside the thesis.
- **Curation authz is the easy case.** The hard open problem below is multi-tenant *search* over a
  flat derived store. Owner-scoped *curation* legitimately runs over the full within-scope graph (a
  maintenance op, not a cross-tenant query) — authz-clean by construction. The derived index thus has
  two customers: public-commons search (hard authz) and owner-scoped curation (easy authz), and the
  latter justifies building it regardless of the former.
- **The curator is also a writer**, so its edge / maturity / type suggestions go back through the
  SHACL admission floor: the constrained-container and the curator are two halves of one quality loop
  (the 422 is the curator's write-feedback channel; the curator is plausibly who authors the shapes).
- **The vault model ports, but harder.** Multi-writer memory has no shared mental model and no human
  in the loop, so silent contradiction and link rot are *more* likely than in the single-writer
  vault — curation becomes load-bearing infrastructure, not a nicety, and must adjudicate headless.

## Reconciliation with the built state + upstream (2026-06-25)

Checked against what is on disk and against the OKF / DataBook upstream:

- **Two projection paths, not one.** Hand-authored concept cards use inline annotation; the imported
  GA4 OKF bundle is **frontmatter-driven** and uses no inline annotation. The "ours" row's old
  "inline annotation → graph.ttl" gloss described only the first path. (Decisions-taken resolves this
  forward: frontmatter edges for both.)
- **`type:` is dropped in the GA4 projection** — the bundle's `graph.ttl` carries no `rdf:type` (a
  bare `type: Reference` → invalid `skos:Reference`, so it was omitted). The one *required* OKF field
  survives in frontmatter but is absent from the projected graph for imports.
- **`graph.ttl` is JSON-LD on disk** though the graph channel declares `text/turtle`. Harmless for
  Comunica, but the name and serialization disagree — flag for the conneg story.
- **#98 is HTML-RDFa, not curly-brace Semantic-Markdown.** They share the RDFa-Lite *semantic model*
  but are different syntaxes; our early cards used the Sparna curly-brace form, which #98 does not
  propose. With semantics moving to frontmatter, "back #98 / our camp" is retired in favour of
  frontmatter edges + context (the #141 frontmatter lineage minus the fenced RDF blocks).
- **Upstream claims verified (gh, 2026-06-25):** the #141 / #98 fork, GSP-as-canonical-ingest and the
  typed-block details, the provenance cluster (#140 Ed25519-signed manifest, #52 / #47 / #92 / #94 /
  #95), the stable-ID cluster (#85 / #115 / #120), and #44 (wikilinks out of scope) all confirmed and
  OPEN. DataBook's SHACL gate is **not wired as a push prerequisite** in the CLI (`--shapes` is a
  separate single-op). Holon CG is effectively Cagle-sole-edited (87 vs 5 commits). No Google
  maintainer has picked a camp (#141 zero comments; #98 one non-maintainer comment).

## Candidate architecture (to chew on)

Separate **canonical store** from **query index** — which dissolves the earlier objection to GSP:

- **Pod = canonical** (LWS: authz, identity, decentralization, SHACL admission floor). The leg
  neither DataBook nor openclaw has; we keep it.
- **Cards stay prose-primary**, RDF **projected** on write from **frontmatter typed edges + a
  JSON-LD context** (the #141 frontmatter lineage minus the fenced RDF blocks; see Decisions-taken) —
  not embedded fenced blocks, and not inline body annotation, as canonical.
- **A triplestore is a derived, materialized query index**, GSP-fed *from the projection* — a view,
  not the source of truth. This buys DataBook's indexed-SPARQL scale + standard interop without the
  store being authoritative and without sacrificing authz/decentralization. GSP becomes "how the
  index is fed," not "the centralizing mistake."
- **Tiers:** Tier-1 = LWS CNF Type Search (cheap, server-managed, authz-filtered per request);
  Tier-2 = indexed SPARQL over the derived index for scale; client Comunica retained for
  small / private / offline cases. A **third consumer**, the curator, runs full within-scope topology
  queries over the derived index under owner authz (the easy-authz case, not multi-tenant).
- **Content enrichments to weigh:** claim/evidence/confidence (openclaw) · block-ownership write
  contract (openclaw) · `id:` IRI + PROV-O `process:` provenance (DataBook) · optional Ed25519
  signing seam (#140).

## The hard open problem (do not gloss)

**Authz over a derived query index.** The pod gives per-resource WAC; a materialized triplestore
flattens it — SPARQL over a flat store sees everything. This is *precisely why* LWS offers only CNF
Type Search and no SPARQL endpoint: authz-filtered arbitrary SPARQL is hard. So "Tier-2 = SPARQL
over a derived index" reintroduces the problem LWS designed around — but only for *multi-tenant
search*. Owner-scoped **curation** over the same index is authz-clean by construction (a maintenance
operation over what the owner may already see), so what follows is search's problem, not the index's
per se. Candidate resolutions for the search case, none free:

1. **Public-only index (leading candidate).** The derived triplestore holds *only* public-read
   content — the shared-memory commons (scale + SPARQL + interop for everyone). Private/permissioned
   content stays pod-only, queried client-side with the requester's bearer (authz "free"). Authz
   preserved *by construction*; maps onto our public/private split and openclaw's privacy tiers.
   *Limit:* queries spanning public + private need federation (client Comunica federating the public
   index + authorized pod reads) — can't run in one place.
2. **Per-authz-scope index partitioning** — materialize a separate index per access scope. Clean,
   expensive, scope-explosion risk.
3. **Query rewriting with authz filters** — inject WAC-derived filters into SPARQL. Couples the
   index to live ACL state; brittle.

Option 1 is the one to think hardest about: the derived index = public commons, the pod = the
permissioned/private layer. It also reframes "privacy tiers in frontmatter" as the signal that
decides *what gets projected into the public index*.

## What to adapt from each (layered attribution)

- **From OKF:** the format floor (markdown + frontmatter + `type:`), as the portable interchange.
  Likely OKF-as-import (openclaw's pattern) more than OKF-as-rigid-native; we already import GA4
  bundles.
- **From #98 / Semantic-Markdown:** inline annotation as the canonical RDF-bearing convention; an
  explicit `okf:`/local edge vocabulary (OKF carries none).
- **From DataBook:** indexed graph query, named graphs, IRI identity, SPARQL interop, PROV-O
  provenance — adopted as a *derived index*, not the store.
- **From openclaw:** claim/evidence/confidence model; block-ownership write contract; privacy tiers;
  lint-as-a-tool.
- **Ours/LWS (the leg nobody else builds):** pod-canonical authz + identity + decentralization +
  synchronous admission floor.

## Open questions to chew on

1. Authz-over-derived-index — which resolution for the *search* case (esp. public-commons-index +
   private-pod-federation)?
2. Tier-2-at-scale — **measure** client Comunica vs derived triplestore rather than assume.
3. Claim-level model — worth the authoring/maintenance burden as curation substrate, or do typed
   edges suffice?
4. Wikilink canonicalization (#44) for OKF-conformant cards.
5. Upstream engagement — contribute the LWS leg, align with the #141 frontmatter lineage, or just
   track Holon CG? (Backing #98's inline RDFa is retired — semantics live in frontmatter now.)
6. **Curation cadence** — who curates a multi-writer commons, and when: admission-time gate vs
   periodic sweep vs continuous?
7. **Headless curation** — can contradiction resolution run without a human adjudicator (the vault
   leaves it to Chuck), and is claim / evidence / confidence the right substrate for that?
8. **Curation-authz at scale** — does owner-scoped curation authz stay clean as scopes and writers
   multiply?

(Retired as decided 2026-06-25: "embed vs project vs inline — where structure lives" → frontmatter
edges; "native-OKF vs OKF-as-import" → both, by path. See Decisions-taken.)

## Testbed framing (the design space is the experiment)

The four arms above are real comparators for the "structure helps agents" thesis, not a vague
control: **DataBook** (embed + central triplestore) · **openclaw** (rich claims, no graph, local) ·
**ours** (pod + projection + derived index) · **Porter** (flat shared graph). openclaw is the
strongest challenger — structure *without* the RDF machinery — so it's the arm to beat. The
consistent empirical finding across all three external systems: the storage/authz/identity leg for
multi-agent permissioned memory is unbuilt. That is the gap we are positioned to fill.

**Three measured axes, not one.** (1) **Task quality** is the thesis-bearing axis — does the
typed-semantic graph improve the *reasoning / grounding / explanation* agent's actual output (answer
correctness, hallucinated-join rate, justification traceability)? "Structure helps agents" lives or
dies here, not in retrieval. (2) **Retrieval quality** is the obvious one. (3) **Curation quality**
(corpus health) is where the *linked-data-specifically* claim separates from *typed structure
generally*: the arm to beat, openclaw, is predicted to fail it (O(n²) recompute, no relational query)
where it might *tie* on retrieval. And Porter is not a vague flat control — Porter is flat retrieval at
the **no-escape ceiling**, ours is SKOS-hierarchical, the escape. The hierarchy semantics are the
*independent variable* the rig varies; Porter-vs-ours is a direct test of the no-escape theorem on
agent tasks, not a hand-wave. Report all three axes explicitly.

## Pointers

- Convergence essay + DataBook: `ontologist.substack.com/p/the-format-convergence`;
  spec `github.com/w3c-cg/holon`; CLI `github.com/kurtcagle/databook`.
- OKF: `github.com/GoogleCloudPlatform/knowledge-catalog` (issues #141, #98, #63, #140, #44, #85).
- openclaw memory-wiki: `docs.openclaw.ai/plugins/memory-wiki`.
- Ours: `../ROADMAP.md`, `../wiki-memory-dual-projection.md`, `04-comunica-patterns.md`,
  `03-governance-lessons.md`, `../../constrained-container/` (the governance-floor half of the
  curation loop), `../../projection/`.
- Curation model (ported from the vault): the `/audit`, `/review-note`, and `/curator` skills —
  maturity progression, bounded branching (Fano bound), contradiction detection, curator observations.
- Grounded skills: `okf`, `semantic-markdown`, `lws-protocol` (search/type-index), `comunica-sparql`,
  `shacl-constraints`, `solid-protocol`.
