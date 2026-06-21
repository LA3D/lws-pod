---
name: comunica-sparql
description: Comunica — client-side SPARQL over Solid/Linked Data sources, including link traversal over ldp:contains aggregates. Verbatim docs, pinned.
when_to_use: When querying pod data client-side with Comunica — configuring sources, query-from-app vs browser, link traversal across containers, common usage and FAQ. Ground truth only.
upstream: see UPSTREAM.md
license: MIT
---

# Comunica (client-side SPARQL) — grounded reference

Verbatim Comunica docs, pinned in `UPSTREAM.md`. Ground truth, not project guidance.

## When to read which

| Question | Read |
|---|---|
| What Comunica is / query overview | `references/1_query.md` |
| Usage patterns, configuring sources | `references/2_usage.md` |
| Querying from a JS app / in the browser | `references/3_query_app.md`, `references/4_query_browser_app.md` |
| Advanced (link traversal, etc.) | `references/advanced.md` |
| Common problems | `references/3_faq.md` |

## Related skills

`solid-protocol` (the data it queries), `lws-protocol`.

---
*lws-pod's application: verified `.graph`-aggregate patterns and the traqula override live in `docs/foundations/04-comunica-patterns.md`. Not in this skill.*
