# Grounded spec skills

Pure-spec, progressively-disclosed reference skills for lws-pod. **Grounding contract:** every
file in a skill is verbatim from a pinned authoritative source (`UPSTREAM.md`). No project
decisions, eval results, or open research threads live in a skill — those stay in `memory/` and
`docs/foundations/`. Each `SKILL.md` only *points* to where lws-pod applies the spec.

| Skill | Grounds | Repo surface |
|---|---|---|
| `lws-protocol` | W3C LWS 1.0 — all 8 modules (core, vocab, 4 authn suites, notifications, search/type index) + use cases | `--idp` headless auth, `--provision-keys` LWS-CID identity, `--notifications` |
| `solid-protocol` | Solid Protocol (LDP, WAC, Solid-OIDC) | `--conneg`, ACL/WAC, OIDC, `ldp:constrainedBy` |
| `shacl-constraints` | W3C SHACL | `constrained-container/` admission proxy |
| `comunica-sparql` | Comunica client-side SPARQL | `.graph`-aggregate traversal |
| `okf` | Open Knowledge Format v0.1 | wiki-memory content model |
| `semantic-markdown` | Semantic Markdown (RDFa-Lite-for-md) | inline RDF in concept cards |
| `jss-server` | JavaScriptSolidServer published docs site (implementation) | the actual server under eval — getting-started, features, guides, API/CLI/config reference |
| `databook` | W3C Holon CG DataBook — Markdown carrier for typed RDF/SPARQL/SHACL (the semantic-web profile over OKF) | OKF↔DataBook crosswalk; parameterized queries |
| `json-ld` | W3C JSON-LD 1.1 — syntax / API / framing RECs + Best Practices | the `@context` base of the self-description stack (LWS = an application of it) |
| `profiles` | W3C "The Profiles Vocabulary" (PROF) + the profile-roles vocabulary | the profile-authority / bundle layer (Plan 2 — `isProfileOf`, `hasResource`, `role:validation`/`vocabulary`/`context`) |
| `mcp-protocol` | MCP 2025-03-26 spec + schema + the experimental Skills-over-MCP extension (SEP-2640); arXiv 2606.30317 cited-not-vendored | the pod's `/mcp` agent surface — the Tools (model-controlled) vs Resources (application-driven) control model |

Provenance for each is in its `UPSTREAM.md`. Verify the contract with
`scripts/check-skill-grounding.sh`.
