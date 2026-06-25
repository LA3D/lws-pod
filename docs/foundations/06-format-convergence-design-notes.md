# Format convergence — architectural design notes

**Status: exploratory. Not a decision, not a plan.** Captured 2026-06-25 to preserve the nuance
of a long design discussion (OKF / DataBook / openclaw / LWS) so it can be chewed on later. Nothing
here changes the build; the ROADMAP and FOLLOWUP still hold. When/if any of this is adopted it gets
promoted to a numbered canon doc or a `superpowers/specs/` design doc.

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

## The design space (four named points)

| | storage | structure (where it lives) | query |
|---|---|---|---|
| **DataBook** (Holon) | triplestore (GSP push) | **embedded** RDF in fenced blocks | server SPARQL, named graphs |
| **openclaw** memory-wiki | local files + compiled caches | **typed claims + evidence + confidence** (rich) | bespoke 5-mode search, no RDF |
| **ours** (wiki-memory) | **LWS pod** (authz/identity/decentralized) | **projected** RDF (inline annotation → `graph.ttl`) | CNF Type Search + client Comunica |
| **Porter** (control) | LWS pod | flat shared graph | SPARQL-the-pile |

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

## Critical findings (including against ourselves)

**openclaw — rich content model, wrong architecture for our target.**
- Single-host. "Shared" = local backend shared among one agent's tools; "bridge" = in-process
  plugin seams. No networked multi-writer, no inter-agent authz, no concurrency control. Identity
  is *local* alias-resolution keys, not global dereferenceable IRIs. A personal brain, not a commons.
- Scalability ceiling: bespoke unindexed search over compiled caches (`agent-digest.json`,
  `claims.jsonl`); 5 fixed modes can't express/optimize multi-hop relational queries; inline
  `claims[]`/`evidence[]` bloats the source files (hot index inside cold docs); contradiction
  dashboards are ~O(n²) recompute-the-world.
- Worth adapting: the **claim / evidence / confidence** sub-card model and the **block-ownership
  write contract** (`wiki_apply` does narrow mutations, never freeform page surgery).

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
the synchronous SHACL admission floor (the 422 teaching channel).

## Candidate architecture (to chew on)

Separate **canonical store** from **query index** — which dissolves the earlier objection to GSP:

- **Pod = canonical** (LWS: authz, identity, decentralization, SHACL admission floor). The leg
  neither DataBook nor openclaw has; we keep it.
- **Cards stay prose-primary**, RDF **projected** on write (inline Semantic-Markdown / RDFa-Lite,
  the #98 lineage) — not embedded fenced blocks as canonical.
- **A triplestore is a derived, materialized query index**, GSP-fed *from the projection* — a view,
  not the source of truth. This buys DataBook's indexed-SPARQL scale + standard interop without the
  store being authoritative and without sacrificing authz/decentralization. GSP becomes "how the
  index is fed," not "the centralizing mistake."
- **Tiers:** Tier-1 = LWS CNF Type Search (cheap, server-managed, authz-filtered per request);
  Tier-2 = indexed SPARQL over the derived index for scale; client Comunica retained for
  small / private / offline cases.
- **Content enrichments to weigh:** claim/evidence/confidence (openclaw) · block-ownership write
  contract (openclaw) · `id:` IRI + PROV-O `process:` provenance (DataBook) · optional Ed25519
  signing seam (#140).

## The hard open problem (do not gloss)

**Authz over a derived query index.** The pod gives per-resource WAC; a materialized triplestore
flattens it — SPARQL over a flat store sees everything. This is *precisely why* LWS offers only CNF
Type Search and no SPARQL endpoint: authz-filtered arbitrary SPARQL is hard. So "Tier-2 = SPARQL
over a derived index" reintroduces the problem LWS designed around. Candidate resolutions, none free:

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

1. Authz-over-derived-index — which resolution (esp. public-commons-index + private-pod-federation)?
2. Tier-2-at-scale — **measure** client Comunica vs derived triplestore rather than assume.
3. Embed vs project vs managed-blocks — final call on where structure lives in a card.
4. Claim-level model — worth the authoring/maintenance burden, or do typed edges suffice?
5. Native-OKF vs OKF-as-import — is our card OKF, or do we import OKF into a richer native model?
6. Wikilink canonicalization (#44) for OKF-conformant cards.
7. Upstream engagement — back #98, contribute the LWS leg, or just track Holon CG?

## Testbed framing (the design space is the experiment)

The four arms above are real comparators for the "structure helps agents" thesis, not a vague
control: **DataBook** (embed + central triplestore) · **openclaw** (rich claims, no graph, local) ·
**ours** (pod + projection + derived index) · **Porter** (flat shared graph). openclaw is the
strongest challenger — structure *without* the RDF machinery — so it's the arm to beat. The
consistent empirical finding across all three external systems: the storage/authz/identity leg for
multi-agent permissioned memory is unbuilt. That is the gap we are positioned to fill.

## Pointers

- Convergence essay + DataBook: `ontologist.substack.com/p/the-format-convergence`;
  spec `github.com/w3c-cg/holon`; CLI `github.com/kurtcagle/databook`.
- OKF: `github.com/GoogleCloudPlatform/knowledge-catalog` (issues #141, #98, #63, #140, #44, #85).
- openclaw memory-wiki: `docs.openclaw.ai/plugins/memory-wiki`.
- Ours: `../ROADMAP.md`, `../wiki-memory-dual-projection.md`, `04-comunica-patterns.md`,
  `03-governance-lessons.md`, `../../constrained-container/`, `../../projection/`.
- Grounded skills: `okf`, `semantic-markdown`, `lws-protocol` (search/type-index), `comunica-sparql`,
  `shacl-constraints`, `solid-protocol`.
