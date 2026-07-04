---
name: json-ld
description: JSON-LD 1.1 — W3C Recommendation for expressing Linked Data in JSON via `@context`. The base serialization the whole LWS / self-description stack rests on — `@context` maps plain JSON terms to URIs so a machine reads JSON as RDF. Verbatim spec, date-pinned.
when_to_use: When checking how JSON-LD 1.1 actually works — the `@context` mechanism (term→URI, `@id`/`@type`, `@protected`, `@version`, array/layered contexts), interpreting plain JSON as JSON-LD, advertising a context out-of-band (the `http://www.w3.org/ns/json-ld#context` Link relation), framing for a predictable JSON shape, and the expansion/compaction/RDF algorithms. The base layer under LWS (`lws-protocol`), the storage `@context`, and the profile / `okf` vocab layering. Ground truth only.
upstream: see UPSTREAM.md
license: W3C Software and Document License
---

# JSON-LD 1.1 (W3C) — grounded reference

Verbatim W3C source, date-pinned in `UPSTREAM.md`. Ground truth, not project guidance.

## When to read which

| Question | Read |
|---|---|
| The `@context` mechanism; term→URI; `@id`/`@type`/`@protected`/`@version`; keyword syntax; **interpreting plain JSON as JSON-LD** | `references/json-ld11-syntax.html` |
| Expansion / compaction / flattening / RDF serialization + deserialization algorithms; context processing/loading | `references/json-ld11-api.html` |
| **Framing** — shaping JSON-LD into a predictable, regular JSON tree (what makes it agent-friendly) | `references/json-ld11-framing.html` |
| Publishing JSON-LD well — **advertising a context via the `…/ns/json-ld#context` Link header** for plain JSON, vocabulary reuse, caching | `references/json-ld-bp.html` |

## Layer note

JSON-LD is the base of the self-description stack: **LWS is an application of it** (`lws-protocol` — its
representations carry `@context: https://www.w3.org/ns/lws/v1`), and a profile layers its own context on
top of the LWS one (JSON-LD array-context; `@protected` keeps the base terms stable). The same `@context`
move recurses at every layer — system, profile, resource.

## Related skills

`lws-protocol` (the storage layer built on JSON-LD), `solid-protocol`, `shacl-constraints`, `okf`,
`databook`, `mcp-protocol`.

---
*lws-pod's application (the layered `@context` self-description model; the storage-description
mirror; DID/VC as the same `@context` pattern): see `docs/foundations/` +
`docs/design-notes/contextual-linked-memory.md`. Not in this skill.*
