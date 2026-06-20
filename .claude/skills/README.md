# Grounded spec skills

Pure-spec, progressively-disclosed reference skills for lws-pod. **Grounding contract:** every
file in a skill is verbatim from a pinned authoritative source (`UPSTREAM.md`). No project
decisions, eval results, or research questions live in a skill — those stay in `memory/` and
`docs/foundations/`. Each `SKILL.md` only *points* to where lws-pod applies the spec.

| Skill | Grounds | Repo surface |
|---|---|---|
| `lws-protocol` | W3C LWS 1.0 — all 8 modules (core, vocab, 4 authn suites, notifications, search/type index) + use cases | `--idp` headless auth, `--provision-keys` LWS-CID identity, `--notifications` |
| `solid-protocol` | Solid Protocol (LDP, WAC, Solid-OIDC) | `--conneg`, ACL/WAC, OIDC, `ldp:constrainedBy` |
| `shacl-constraints` | W3C SHACL | `constrained-container/` admission proxy |
| `comunica-sparql` | Comunica client-side SPARQL | `.graph`-aggregate traversal |
| `okf` | Open Knowledge Format v0.1 | wiki-memory content model |
| `semantic-markdown` | Semantic Markdown (RDFa-Lite-for-md) | inline RDF in concept cards |

Provenance for each is in its `UPSTREAM.md`. Verify the contract with
`scripts/check-skill-grounding.sh`.
