---
name: lws-protocol
description: W3C Linked Web Storage (LWS) Protocol 1.0 — all eight modules: core, vocabulary, four authentication suites (OpenID Connect, SAML 2.0, self-signed CID, self-signed did:key), notifications, and search/type index. The Solid standardization JSS implements. Verbatim spec, pinned.
when_to_use: When checking JSS behavior against any part of the LWS 1.0 spec — core operations/resource ID/conneg, the LWS vocabulary, any of the four authentication suites (incl. the self-signed CID / did:key identity primitives), notifications, or search/type index services. Ground truth only; for how lws-pod applies it see the pointer below.
upstream: see UPSTREAM.md
license: W3C Software and Document License
---

# LWS Protocol 1.0 (W3C) — grounded reference

Verbatim W3C source for all eight modules, pinned in `UPSTREAM.md`. Ground truth, not project guidance.

## When to read which

| Question | Read |
|---|---|
| Core operations, resource identification, conneg, container representation | `references/lws10-core/` |
| The LWS RDF vocabulary | `references/lws10-vocab/vocabulary.yml` (source) + `…/SNAPSHOTS/DNOTE/Overview.html` (rendered first-publication preliminary spec) |
| Self-signed agent identity (the LWS-CID primitive) | `references/lws10-authn-ssi-cid/` |
| Self-signed did:key identity | `references/lws10-authn-ssi-did-key/` |
| OpenID Connect authentication | `references/lws10-authn-openid/` |
| SAML 2.0 authentication | `references/lws10-authn-saml/` |
| Change notifications | `references/lws10-notifications/` |
| Search and Type Index Services | `references/lws10-searchindex/` |
| Why LWS exists / target use cases | `references/lws-ucs/` |

## Related skills

`solid-protocol` (the Solid base LWS standardizes), `shacl-constraints`, `okf`.

---
*lws-pod's application: see project memory `[[lws-protocol]]` and `docs/foundations/`. Not in this skill.*
