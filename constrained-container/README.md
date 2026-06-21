# constrained-container

A standalone **SHACL admission proxy** that adds *constrained containers* to any LDP/Solid
server (JSS by default), per the Solid Protocol's `ldp:constrainedBy` mechanism (§5.6).

**Opt-in by construction:** a container is "constrained" only if its metadata declares
`<container> ldp:constrainedBy <shape>`. Unconstrained containers — and all non-write
requests — pass through untouched, with zero validation overhead.

JSS has no external plugin API, so this ships as a proxy rather than an in-process plugin —
which also makes it server-agnostic. The validation logic ports straight into a server
(wrapping `storage.write()`) if/when an in-process hook is available.

## Behaviour

For `PUT`/`POST`/`PATCH` into a constrained container:
1. Read `<container>/.meta`, find `ldp:constrainedBy <shape>`.
2. SHACL-validate the request body against the shape (`shacl-engine`).
3. **Conform →** forward to the upstream server unchanged.
   **Violate →** `422` + `Link: <shape>; rel="http://www.w3.org/ns/ldp#constrainedBy"` +
   a laden teaching message listing the failed constraints.

For `GET`/`HEAD`/`OPTIONS` on a constrained container, it adds the `constrainedBy` Link
header so clients can discover the shape before writing (Solid §5.6 allows the header on
any response).

Spec-silent choices we make: constraint language = **SHACL**; rejection status = **422**
(consistent with the spec's N3-Patch use); discovery on container reads.

## Run

```bash
npm install
UPSTREAM=http://localhost:3838 PORT=3839 node proxy.js
# then write through :3839 instead of the pod's :3838
```

## Make a container constrained

```turtle
# PUT <container>/.meta  (as the owner)
@prefix ldp: <http://www.w3.org/ns/ldp#>.
<https://pod.example/alice/concepts/> ldp:constrainedBy <https://pod.example/alice/shapes/concept.ttl> .
```

Verified end-to-end against a live JSS pod: good writes admitted (201), bad writes rejected
(422 + Link + message), unconstrained containers passed through (201), and the shape
advertised on container GET.

## Note on JSS (2026-06-21, resolved P2)

The proxy now reads `.meta` and the shape under the **requester's `Authorization`** (auth-keyed
caches), so it governs **protected owner-only constrained containers** — not just public ones.
Shapes are made **public-read** via `set-acl.mjs`, an HTTP-native helper that `PUT`s
`<resource>.acl` as **`application/ld+json`** (the earlier 415 was `text/turtle`; JSS stores
dotfiles as JSON-LD on disk). No MCP dependency — works from any HTTP client (Claude Code CLI,
curl, the app). Accepted ACL form: WAC in JSON-LD with `acl:agent`/`acl:agentClass foaf:Agent`,
`acl:mode acl:Read|Write|Control`, `acl:accessTo`/`acl:default`; the `.acl` URL is discovered via
`Link: rel="acl"` (falls back to `<resource>.acl`).

**`acl:mode` gotcha:** JSS requires `acl:mode` as a JSON **array** even for a single mode —
`"acl:mode": ["acl:Read"]` is accepted; `"acl:mode": "acl:Read"` (bare string) is rejected.

**Edge case:** an agent with write-but-not-read on a container's `.meta` cannot have the constraint
discovered under its own auth (the `.meta` stays owner-only by design). Acceptable for the
owner-centric memory-pod model. Concretely: a requester who cannot read `<container>/.meta`
still receives unvalidated pass-through — the proxy is **opt-in admission, not deny-by-default**.
