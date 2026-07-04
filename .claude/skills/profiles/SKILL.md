---
name: profiles
description: W3C "The Profiles Vocabulary" (PROF) + the profile-roles vocabulary — the RDF vocabulary for describing profiles of standards — what a profile IS, what it profiles (`prof:isProfileOf`), and the typed resources it bundles (validation shapes, vocabularies, contexts) via `prof:hasResource` / `prof:ResourceDescriptor` / `prof:hasRole`. Verbatim W3C source, pinned.
when_to_use: When designing or checking the profile-authority / bundle layer — how a resolver finds the shape + vocabulary + context set for a profile. `prof:Profile ⊑ dct:Standard`; `prof:isProfileOf` (base-floor → profile inheritance); `prof:hasResource` → `prof:ResourceDescriptor` (`prof:hasArtifact`, `prof:hasRole`, `prof:conformsTo`, `prof:format`); the role vocabulary (`role:validation`/`vocabulary`/`schema`/`constraints`/`context`/…); and the `dct:conformsTo` + PROF direction for the profile mechanism. Ground truth only.
upstream: see UPSTREAM.md
license: W3C Software and Document License
---

# The Profiles Vocabulary (PROF, W3C) — grounded reference

Verbatim W3C source, pinned in `UPSTREAM.md`. Ground truth, not project guidance.

## When to read which

| Question | Read |
|---|---|
| PROF classes/properties + narrative — `prof:Profile`, `prof:isProfileOf`/`prof:isTransitiveProfileOf`, `prof:hasResource`, `prof:ResourceDescriptor` (`prof:hasArtifact`/`prof:hasRole`/`prof:conformsTo`/`prof:format`), worked examples | `references/profiles-vocabulary.html` |
| The machine-readable `prof:` vocabulary (ns `http://www.w3.org/ns/dx/prof/`) | `references/prof.ttl` |
| The profile-roles vocabulary (ns `http://www.w3.org/ns/dx/prof/role/`: validation, vocabulary, schema, constraints, guidance, mapping, example, specification, …) | `references/prof-role.ttl` |

## Layer note

PROF is the **authority / bundle** layer over a base floor: a profile declares what it inherits
(`prof:isProfileOf`) and the typed artifacts it bundles — a SHACL shape (`role:validation`), a
vocabulary (`role:vocabulary`), a JSON-LD context (`role:context`). `dct:conformsTo` (DCMI Terms) is the
`resource → profile` edge; `prof:Profile ⊑ dct:Standard`.

## Related skills

`json-ld` (the `role:context` artifacts), `shacl-constraints` (the `role:validation` shapes),
`lws-protocol`, `okf`, `databook`.

---
*lws-pod's application (PROF as the profile-authority layer for `resolveStorageAuthority`; the
`describedby`-vs-`conformsTo` decision): see `docs/design-notes/iri-minting.md`,
`docs/design-notes/contextual-linked-memory.md`, and FOLLOWUP Plan 2. Not in this skill.*
