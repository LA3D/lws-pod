# Comunica / graph-query patterns

How to SPARQL-query the pod. Verified live against JSS (see below). Distilled from
`cogitarelink-solid`'s `comunica-sources` skill.

## SPARQL is a client concern

The pod hosts **no** SPARQL endpoint. Queries run **client-side** in Comunica
(`@comunica/query-sparql` / `…-link-traversal`). This matches LWS too — search is a separate
service, not a storage endpoint. The substrate serves RDF resources; the client assembles the
query.

## Query the `.graph` aggregate as one source (the default)

The architecture materializes a **per-container `.graph` aggregate** (the union of the
members' typed edges). Query it as a *single explicit source* — no per-resource `.meta`
enumeration, no link-traversal needed:

```js
import { QueryEngine } from '@comunica/query-sparql-link-traversal';
const engine = new QueryEngine();
const rows = await (await engine.queryBindings(query, {
  sources: ['http://pod/alice/concepts/.graph'],   // one source
  lenient: true,
})).toArray();
```

This is what makes the relational queries cheap, e.g. *concepts with no implementation*:

```sparql
PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
PREFIX wm:   <https://w3id.org/cogitarelink/wm#>
SELECT ?c ?l WHERE { ?c a skos:Concept ; skos:prefLabel ?l .
                     FILTER NOT EXISTS { ?c wm:implementedBy ?i } }
```

## Two gotchas (both real, both cheap)

1. **The traqula override is required.** `@comunica/query-sparql-link-traversal@0.8.0` ships a
   broken `@traqula/parser-sparql-1-2` dep — every query throws *"Parse error … found PREFIX"*
   until you add npm `overrides`:
   ```json
   "overrides": {
     "@traqula/parser-sparql-1-2": "^1.0.0",
     "@traqula/algebra-sparql-1-2": "^1.0.0",
     "@traqula/rules-sparql-1-1": "^1.0.0",
     "@traqula/core": "^1.0.0"
   }
   ```
2. **Link-traversal needs the `ldp:contains` actor.** The *vanilla* engine config does **not**
   follow `ldp:contains` to enumerate container members (returns 0 results). The reference repo
   adds the `predicates-ldp` extract actor via a custom config. **But our architecture doesn't
   rely on traversal** — we query the `.graph` aggregate as a single source, so this only
   matters if you want auto-discovery traversal later.

Use `lenient: true` so the engine logs parse errors on non-RDF responses instead of failing.

## Verified on JSS (2026-06-20)

Against a live JSS pod: single-source query ✅, multi-source (explicit list) ✅, and the
`.graph`-aggregate relational query ("concepts with no `implementedBy`") ✅ returned the right
answer. The graph-query layer survives the CSS→JSS move intact.

## Reference
`cogitarelink-solid` `comunica-sources` skill (explicit-source pattern, `--lenient`,
`default-graph-uri`, the describedby/`.meta` gap RQ-Pod-4).
