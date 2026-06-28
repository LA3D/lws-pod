---
name: databook
description: W3C Holon CG DataBook — a Markdown carrier for typed RDF/SPARQL/SHACL payloads with self-describing YAML frontmatter; the semantic-web profile proposed over OKF. Verbatim spec, date-pinned snapshot.
when_to_use: When checking how DataBook represents typed RDF blocks, frontmatter identity/graph fields (id/domain/imports/shapes/graph/process), GSP push-pull ingest, and SHACL gating — for the OKF↔DataBook crosswalk the wiki-memory substrate keeps. Ground truth only; a living CG draft (date-pinned snapshot, not a stable Recommendation).
upstream: see UPSTREAM.md
license: see UPSTREAM.md (W3C Holon Community Group)
---

# DataBook — grounded reference

Verbatim DataBook source from the W3C Holon Community Group, pinned in `UPSTREAM.md`. Ground truth,
not project guidance. DataBook is an actively-edited CG draft — treat it as a dated snapshot, and
note minor in-repo version drift (the format spec is v1.1, the property reference is v1.2).

## When to read which

| Question | Read |
|---|---|
| The normative format — fenced RDF block types, frontmatter fields, the data model | `references/SPEC.md` |
| Every frontmatter + block property (`id`/`domain`/`imports`/`shapes`/`graph`/`process`) | `references/property-reference.md` |
| Overview, the CLI, the push/pull (SPARQL Graph Store Protocol) workflow | `references/README.md` |
| Rationale, scope, the relationship to OKF, open points | `references/faq.md` |

## Related skills

`okf` (the base content format a DataBook profiles), `shacl-constraints` (the validation gate),
`comunica-sparql` and `lws-protocol` (the query path and substrate the crosswalk targets).

---
*lws-pod's application: see the design spec `docs/superpowers/specs/2026-06-28-general-memory-substrate-design.md` (§12, the OKF↔DataBook crosswalk) and project memory `[[format-convergence-design]]`. Not in this skill.*
