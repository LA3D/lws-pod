# Wiki-memory dual projection: container + graph, from one source

Design sketch (2026-06-20). One authoring source — Semantic-Markdown concept cards —
projected on write into **two derived views** for two audiences:

- `index.md` — the **navigation** view (OKF progressive disclosure; for humans + browsing agents)
- `.graph` — the **query** view (one RDF resource per container; for Comunica/SPARQL + the SHACL floor)

Containers stay vanilla structure. The graph div is the query surface. Neither derived view is
hand-authored; both rebuild from the cards. Source of truth = the cards.

```
/concepts/                      # LDP/LWS container — structure only (items / ldp:contains)
├── index.md                    # DERIVED navigation view (OKF format, no frontmatter)
├── .graph                      # DERIVED query view (aggregate Turtle; the single Comunica source)
├── progressive-disclosure.md   # concept card (Semantic Markdown) — SOURCE OF TRUTH
├── hierarchical-retrieval.md   # concept card
└── dual-layer-linking.md       # concept card
```

---

## 1. Source — Semantic-Markdown concept cards

`/concepts/progressive-disclosure.md` (properly wired):

```markdown
---
type: Concept
title: Progressive Disclosure
description: Layered retrieval — orientation first, drill into detail on demand.
tags: [retrieval, memory]
timestamp: 2026-06-20T15:00:00Z
---
{=<#it> .skos:Concept}

# Progressive Disclosure

[Progressive Disclosure]{skos:prefLabel} exposes a knowledge base in layers — index, then
concept, then full detail — instead of flat search. It is a kind of
[Hierarchical Retrieval](hierarchical-retrieval.md){skos:broader}, and is realized by the
[wiki-memory index views](/implementations/index-view.md){wm:implementedBy}.
```

`/concepts/dual-layer-linking.md` (wired to a **not-yet-written** implementation — allowed):

```markdown
---
type: Concept
title: Dual-Layer Linking
description: Markdown wikilinks at the token layer plus RDF predicates at the data layer.
---
{=<#it> .skos:Concept}

# Dual-Layer Linking

[Dual-Layer Linking]{skos:prefLabel} keeps prose-level links human-cheap while a projected RDF
graph stays machine-queryable. Realized by the
[markdown projection listener](/implementations/markdown-projection.md){wm:implementedBy}.
```

`/concepts/hierarchical-retrieval.md` (**no** implementation edge — the floor will flag this):

```markdown
---
type: Concept
title: Hierarchical Retrieval
description: Routing through a typed hierarchy instead of flat similarity search.
---
{=<#it> .skos:Concept}

# Hierarchical Retrieval

[Hierarchical Retrieval]{skos:prefLabel} routes a query through typed structure rather than one
flat embedding distance.
```

Semantic-Markdown annotations (illustrative): `{=<#it> .skos:Concept}` sets the subject + type;
`[span]{skos:prefLabel}` asserts a literal property; `[text](url){skos:broader}` /
`{wm:implementedBy}` assert a typed link whose object is the target IRI.

---

## 2. Derived `index.md` — OKF progressive-disclosure navigation (no frontmatter)

Auto-generated from each card's `description`:

```markdown
# Concepts

* [Progressive Disclosure](progressive-disclosure.md) - Layered retrieval — orientation first, drill into detail on demand.
* [Hierarchical Retrieval](hierarchical-retrieval.md) - Routing through a typed hierarchy instead of flat similarity search.
* [Dual-Layer Linking](dual-layer-linking.md) - Markdown wikilinks at the token layer plus RDF predicates at the data layer.
```

This is the container's "what's here, drill down" surface. An agent reads it first, then opens
only the relevant card. Cheap orientation; expensive content on demand.

---

## 3. Derived `.graph` — the queryable RDF div (one resource = one Comunica source)

The aggregate of every card's extracted triples for this container, materialized on write:

```turtle
@prefix skos: <http://www.w3.org/2004/02/skos/core#> .
@prefix wm:   <https://w3id.org/cogitarelink/wm#> .          # placeholder authority

</concepts/progressive-disclosure#it>
    a skos:Concept ;
    skos:prefLabel "Progressive Disclosure" ;
    skos:broader </concepts/hierarchical-retrieval#it> ;
    wm:implementedBy </implementations/index-view#it> .       # resolves

</concepts/dual-layer-linking#it>
    a skos:Concept ;
    skos:prefLabel "Dual-Layer Linking" ;
    wm:implementedBy </implementations/markdown-projection#it> .   # target not-yet-written — OK

</concepts/hierarchical-retrieval#it>
    a skos:Concept ;
    skos:prefLabel "Hierarchical Retrieval" .                  # no implementedBy edge
```

This is the LWS metadata-resource slot (currently `TBD`) / our "graph div." It is what Comunica
queries — **one source per container, no per-resource `.meta` enumeration, no `describedby` chase.**

---

## 4. The query Comunica makes trivial — "concepts with no implementation wiring"

```sparql
PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
PREFIX wm:   <https://w3id.org/cogitarelink/wm#>

SELECT ?concept ?label WHERE {
  ?concept a skos:Concept ; skos:prefLabel ?label .
  FILTER NOT EXISTS { ?concept wm:implementedBy ?impl }
}
```

Invocation — **a single source**, the graph div:

```json
{ "sources": ["https://pod.example/concepts/.graph"] }
```

Returns `hierarchical-retrieval`. The old per-`.meta` model needed `discover_meta_sources()` to
enumerate every member and union N sidecars (RQ-Pod-4 pain); the graph div makes it one GET.

---

## 5. The relational floor — enforce the wiring *intent*, tolerate the dangling target

```turtle
@prefix sh:   <http://www.w3.org/ns/shacl#> .
@prefix skos: <http://www.w3.org/2004/02/skos/core#> .
@prefix wm:   <https://w3id.org/cogitarelink/wm#> .

wm:ConceptWiringShape
    a sh:NodeShape ;
    sh:targetClass skos:Concept ;
    sh:property [
        sh:path wm:implementedBy ;
        sh:minCount 1 ;            # the edge MUST exist
        sh:nodeKind sh:IRI ;       # and be a link
        # NO sh:class / no existence check on the target:
        # a not-yet-written implementation (dangling link) is allowed (OKF: "not-yet-written knowledge").
        sh:message "Declare how this concept is implemented: add a wm:implementedBy link to an implementation card. The target need not exist yet — not-yet-written implementations are fine."
    ] .
```

- Validates over `.graph` (the aggregate) — where the relationships live — not over isolated cards.
- `minCount 1` + `nodeKind IRI` = the wiring intent; **no** target-resolution check = don't
  over-constrain, tolerate future knowledge.
- Verdicts: `progressive-disclosure` PASS (edge → resolving target); `dual-layer-linking` PASS
  (edge → not-yet-written target); `hierarchical-retrieval` **422** with the laden message above
  (no edge = no intent declared). The 422 message is the teaching channel our evals showed agents
  actually respond to.

---

## The pipeline (one on-write projection, two outputs + the floor)

When a concept card is written:
1. Extract its triples from the Semantic-Markdown body (RDFa-Lite → quads).
2. **Floor:** validate the resulting container graph against `wm:ConceptWiringShape`; on violation,
   422 with the laden `sh:message` (the only enforcement, minimum-viable, relational).
3. On pass, update `/concepts/.graph` (query view) and regenerate `/concepts/index.md` (navigation
   view) from the cards' descriptions.

Both views are derived + rebuildable from the cards; nothing is hand-authored downstream.

## Layer map

| Concern | Mechanism | Layer |
|---|---|---|
| What's here / drill down | `index.md` (OKF progressive disclosure) | container / navigation |
| Membership / addressing | container `items` / `ldp:contains` | container / structure |
| Typed relationships | Semantic-Markdown inline annotations in the card body | content (source of truth) |
| Query | `.graph` div + Comunica (one source) | data / query |
| Enforcement | `wm:ConceptWiringShape` over `.graph` (intent, not resolution) | governance floor |

## Rendering — we build our own (decided 2026-06-20)

JSS gives generic RDF browsing for free via `--mashlib-cdn --conneg` (the SolidOS Mashlib data
browser — property/outline panes, client-rendered from the unpkg CDN, resource embedded as a
JSON-LD data island). That covers "browse/edit the pod's data," and we keep it on. But mashlib
renders **RDF as a data browser, not documents** — for a wiki card it shows the *triples*, not the
prose as a readable page. So the **wiki-memory reading experience is our own render**, built as
derived static artifacts (generated on write, served by JSS as plain HTML resources — no
server-side renderer needed, which sidesteps JSS having no markdown renderer):

- **`<card>.html`** — clean document render of the card (marked/rehype): frontmatter → a header
  info-card, body → rendered prose, wikilinks → clickable `<a>`, and the typed relationships →
  a "Related / Implements" panel drawn from `.graph`.
- **`viz.html`** — per-container graph visualization in the OKF-viewer shape (cytoscape graph +
  marked body panel), but **powered by our typed `.graph`** instead of regex-scraped links —
  typed/colored/labeled edges, SPARQL-backed, not just a picture.

Decisions:
- **Semantics in served HTML = a JSON-LD data island, not RDFa** — matches JSS's own mashlib
  pattern; RDFa is rejected (even OKF's own viewer embeds nothing, and JSS uses islands).
- **mashlib-cdn = the data-browser surface; our render = the document/wiki surface.** Both coexist.
  (`--solidos-ui` would give a modern file-browser shell but needs a local mashlib dist build the
  npm package doesn't ship — deferred.)

### Four derived views, one source

Every concept card projects on write into:

| View | Audience | Surface |
|---|---|---|
| `index.md` | human (browse) | navigation / progressive disclosure |
| `<card>.html` | human (read) | the rendered document page — **our render** |
| `viz.html` | human (explore) | typed graph visualization — **our render** |
| `.graph` | machine | query (Comunica) + the SHACL floor |

Conneg on a card: `text/html` → our `<card>.html`; `text/markdown` → raw source (Obsidian/git);
`text/turtle`/`.graph` → triples.

## On JSS

`/concepts/` = an LDP container; `index.md`, `<card>.html`, `viz.html`, `.graph` = DataResources
(`.graph` fills LWS's `TBD` metadata-resource slot). The projection rides JSS `resourceEvents`
(CDC); the floor is the `storage.write()` wrapper running shacl-engine over `.graph`; Comunica
queries `.graph` directly; our render artifacts are served as static HTML; `--mashlib-cdn` stays on
for generic data-browsing.
