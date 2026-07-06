---
name: prof-conneg
description: Content Negotiation by Profile — the read/write-side companion to W3C PROF. How a client asks for, and a server indicates, a representation conforming to a specific PROFILE (not just a media type) via the `Accept-Profile` request header and `Content-Profile` response header, HTTP `Link` headers, and query-string bindings. The honest mechanism when representations are NOT equivalent (e.g. a prose view vs a typed-link view of the same resource). Verbatim W3C + IETF source, pinned.
when_to_use: When designing or checking a read/write path where one resource has several profile-specific representations and the client must select among them by profile. The abstract functional-profile operations (list profiles offered for a resource; get a resource by profile; get the default), their HTTP bindings (`Accept-Profile`/`Content-Profile` headers, `rel="profile"`/`rel="type"` Link relations, `?_profile=`/`?_mediatype=` query-string alternate), token-vs-URI profile identifiers, and the fallback/most-specific selection rules. The IETF draft additionally covers indicating, discovering, negotiating, AND writing profiled representations (PUT/POST with a profile). Ground truth only.
upstream: see UPSTREAM.md
license: W3C Software and Document License (W3C doc); IETF Trust / BSD (I-D)
---

# Content Negotiation by Profile (DX-PROF-CONNEG + IETF) — grounded reference

Verbatim upstream source, pinned in `UPSTREAM.md`. Ground truth, not project guidance.

## When to read which

| Question | Read |
|---|---|
| The abstract model — functional profiles (list profiles / get-resource-by-profile / get-default), profile tokens vs URIs, alternate-representation listing, most-specific + fallback selection, worked examples | `references/dx-prof-conneg.html` |
| The three concrete bindings — HTTP headers (`Accept-Profile`, `Content-Profile`), HTTP `Link` headers (`rel="profile"`, `rel="type"`, `rel="alternate"`), and Query String Arguments (`?_profile=`, `?_mediatype=`) | `references/dx-prof-conneg.html` |
| The concrete HTTP header spec — `Accept-Profile`/`Content-Profile` grammar, discovery, negotiation, and **writing** profiled representations (PUT/POST with a profile) | `references/profile-negotiation-http.html` |

## Layer note

This is the read/write-side complement to **PROF** (`profiles` skill). PROF's `prof:ResourceDescriptor`
carries `prof:hasRole` + `dct:format` on each artifact *precisely to allow content negotiation*:
conneg-by-profile is how a client selects among the role/format-typed artifacts a profile bundles.
It is the honest tool when a resource's representations are **not equivalent** (RFC 9110 media-type
conneg assumes they are) — different profiles expose different, lossy views of one resource. Profile
identifiers may be full URIs or short registered **tokens**; a server MAY offer several profiles and
indicates the chosen one with `Content-Profile`.

## Related skills

`profiles` (PROF — the profiles/roles vocabulary this negotiates over), `json-ld` (the
`rel="…json-ld#context"`/`alternate` relations), `lws-protocol`, `solid-protocol` (media-type conneg),
`shacl-constraints`.

---
*lws-pod's application (conneg-by-profile as the read/write selector over profile-typed content-vs-links
representations; the P13 boundary — server selects pre-materialized representations, never projects): see
`docs/design-notes/contextual-linked-memory.md`, `docs/design-notes/iri-minting.md`, and FOLLOWUP L4b.
Not in this skill.*
