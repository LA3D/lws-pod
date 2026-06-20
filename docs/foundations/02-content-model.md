# Content model & edge vocabulary

How a wiki-memory L3 concept is shaped, and the typed edges that make the graph navigable.
Distilled from `cogitarelink-solid` + the vault's `typed-relationships` conventions.

## A concept is one markdown file

YAML frontmatter (structure, machine-read) + a markdown body (prose + plain wikilinks, human-
read). Structure lives in **frontmatter**, not inline annotation — so the source stays clean
in Obsidian, git, and the browser. Inline [Semantic Markdown](https://hackmd.io/@sparna/semantic-markdown-draft)
`{…}` annotation is a *sparing* escape hatch for phrase-level semantics, not the default.

```markdown
---
type: Concept
title: Progressive Disclosure
description: Layered retrieval — orientation first, drill into detail on demand.
broader: "[[Hierarchical Retrieval]]"
implementedBy: "[[Index View]]"
---
# Progressive Disclosure
… prose with plain [[wikilinks]] …
```

Both the frontmatter edges *and* the body wikilinks project into the container's `.graph`.

## Typed edges are interface operations, not labels

A typed edge tells an agent *what to do* when it traverses: `supports:` licenses evidence
aggregation; `criticizes:` triggers contradiction handling; `source:` a grounding check;
`extends:` inherited context. Aggressive typing produces a navigable graph; loose typing
(`related:` everywhere) collapses to flat similarity. Prefer the most specific edge; treat
`related:` as the fallback.

**Core edges** (map to RDF predicates via the context):

| Frontmatter | Meaning | RDF (typical) |
|---|---|---|
| `broader` / `narrower` | navigation hierarchy | `skos:broader` / `skos:narrower` |
| `concept` | aboutness (non-hierarchical) | project predicate |
| `implementedBy` / `implements` | concept ↔ its implementation | `wm:implementedBy` |
| `extends` | builds upon | project predicate |
| `supports` / `criticizes` | takes a position on a claim | project predicate |
| `source` | literature/citation | `dct:source` / `cito:` |
| `related` | lateral fallback | `rdfs:seeAlso` |

(Inverses like `narrower`/`implements` are materialized by the projection, not hand-authored.)

## Two-axis addressing (never conflate)

- **Structure / addressing axis** — `rdfs:subClassOf` + Type Index → which container/shape a
  resource belongs to. This is *where it lives*.
- **Navigation / content axis** — `skos:broader` and the typed edges → *how you move between
  ideas*. This is *what it relates to*.

These are orthogonal and must never substitute for each other. A wikilink's typed role maps to
a *predicate* (navigation); the target's *container* is decided by its class via the Type Index
(addressing) — not by the role.

## Concept → implementation

The wiki-memory structure pairs a **concept card** with its **implementation** via
`implementedBy`. This is the relationship the governance floor (doc 03) enforces — "a concept
must declare how it's implemented" — and it's content (an edge), never containment.

## Reference
`cogitarelink-solid` decision-lookup: D105/D106 (two-axis), D58/D81 (dual-layer + predicate
governance), D36 (wikilink role → predicate). Vault `typed-relationships` rule for the full
edge taxonomy.
