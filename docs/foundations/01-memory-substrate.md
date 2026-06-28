# Memory-substrate foundations

The portable theory behind this project, carried from `cogitarelink-solid` (the reference
archive) and stripped of CSS-specific implementation. This is *why* the pod is shaped the
way it is.

## Three layers (stratification matters)

- **L1 — Pod substrate** (universal): LDP containers, WAC, content negotiation, versioning,
  `.well-known/` discovery. Here it's **JSS** (was CSS in the reference repo). The substrate
  is interchangeable; the layers above it are not.
- **L2 — Memory substrate**: the seven invariants below. This is the project's contribution
  and it is substrate-agnostic.
- **L3 — Memory profile**: **wiki-memory** is the canonical reference profile (Karpathy's
  LLM-wiki pattern). A vault/PARA arrangement is one application of L3, not the substrate.

Keep these separate. Most past over-build came from coupling L2/L3 logic to an L1 (CSS)
implementation detail.

## The seven invariants (L2)

A memory substrate, independent of server or profile, provides:

1. **Bounded branching** — every index/hub keeps direct children ≤ ~12 (the Fano routing bound).
2. **Tiered retrieval** — progressive disclosure (index → concept → detail), not flat search.
3. **Lifecycle metadata** — provenance, staleness, supersession travel with the data.
4. **Explicit write + implicit signals** — the agent declares intent on write; the substrate
   also derives signals.
5. **Hybrid blob + graph storage** — human-readable body *and* a queryable graph.
6. **Separable procedural memory** — skills/procedures live apart from semantic content.
7. **OOD honesty** — when coverage is sparse, say so; don't pad.

## Dual-layer linking (the architectural commitment)

Two representations of the same knowledge, unified:

- **Token layer** — markdown body with wikilinks. Cheap for an LLM to read, low-ceremony to
  write, human-readable in Obsidian/git/browser.
- **Data layer** — RDF: typed predicates, queryable and validatable.

The agent authors the token layer; the substrate **projects** the data layer from it
(authoring stays markdown-native). In this repo the data layer is materialized as a **per-
container `.graph` aggregate** (one queryable source), not per-resource sidecars — see
[`../archive/wiki-memory-dual-projection.md`](../archive/wiki-memory-dual-projection.md).

## Why structure (the wager)

Explicit typed structure + hierarchical navigation beats flat embedding retrieval for agent
memory: flat similarity search has a mathematical correctness ceiling that typed hierarchical
navigation escapes. LLMs are *good at* the bookkeeping (cross-references, updating 15 files at
once) that makes humans abandon wikis — so the wiki pattern is a better fit for agents than
for people. This is the bet the whole stack rests on.

## Reference
Deep rationale, decision IDs, and the full history live in `cogitarelink-solid` (its
`decision-lookup` skill: D70 stratification, D58 dual-layer, D93/D94 + K4 invariants). Pull on
demand; don't bulk-copy.
