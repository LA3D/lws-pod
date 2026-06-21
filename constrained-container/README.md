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

## Note on JSS (2026-06-21)

JSS serves the `.meta` sidecar and stores `ldp:constrainedBy` — so the discovery mechanism
works on JSS v0.0.209. **Caveat:** the proxy fetches `.meta` and the shape *unauthenticated*,
but JSS resources are owner-only by default and its `.acl` PUT rejected `text/turtle` with
**415** in testing. So on JSS the constraint resources must be made public-readable (settle the
accepted `.acl` write form), **or** the proxy should forward the requester's `Authorization`
header on its `.meta`/shape reads (the cleaner fix — also lets it govern protected containers).
Until then, on a default JSS pod the proxy reads 401 → treats the container as unconstrained →
writes pass through unvalidated. See `FOLLOWUP.md` open item 2.
