---
name: solid-protocol
description: Solid Protocol — LDP resources/containers, Web Access Control (WAC), and Solid-OIDC. The base spec JSS and the constrained-container proxy build on. Verbatim spec, pinned.
when_to_use: When implementing or checking conneg, container/LDP semantics, ACL/WAC authorization, Solid-OIDC token flow, or the ldp:constrainedBy mechanism (Protocol §5.6). Ground truth only.
upstream: see UPSTREAM.md
license: W3C Software and Document License
---

# Solid Protocol — grounded reference

Verbatim Solid CG source, pinned in `UPSTREAM.md`. Ground truth, not project guidance.

## When to read which

| Question | Read |
|---|---|
| Resources, containers, LDP, conneg, ldp:constrainedBy (§5.6) | `references/protocol.html` |
| Access control modes, ACL resources, authorization | `references/wac.html` |
| Solid-OIDC token flow / DPoP | `references/oidc.html` |
| OIDC flow walkthrough | `references/oidc-primer.html` |

## Related skills

`lws-protocol` (the W3C standardization), `shacl-constraints` (the SHACL spec), `comunica-sparql`.

---
*lws-pod's application: see project memory and `docs/foundations/`; the SHACL admission proxy is `constrained-container/`. Not in this skill.*
