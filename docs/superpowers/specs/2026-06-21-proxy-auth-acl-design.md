# Proxy auth on constraint reads + HTTP ACL provisioning (P2) — design

Date: 2026-06-21
Status: approved
Roadmap: Phase 0 / P2 (`docs/ROADMAP.md`); FOLLOWUP open item 2.

## Goal

Make the `constrained-container/` SHACL admission proxy work on a **default (owner-only) JSS pod**,
so the admission floor actually governs protected containers instead of silently no-opping. Two
complementary fixes, by the correct trust level of each resource:

- **(b)** The proxy reads `<container>/.meta` (container metadata — stays owner-only) under the
  **requester's `Authorization`**, so it can discover the constraint on protected containers.
- **(a)** The **shape** (public config — a SHACL shape is not secret) is provisioned **public-read**
  via an **HTTP-native** `.acl` write, so the proxy / Type Index / any HTTP validator can read it
  without auth.

This also sets up the Type Index's per-request authz-filtering (same principle: operate under the
requester's identity).

## Background (grounded)

- Today `proxy.js` fetches `.meta` and the shape **unauthenticated**. On a default JSS pod those are
  owner-only → 401 → the proxy treats the container as *unconstrained* → bad writes pass through
  unvalidated (`constrained-container/README.md` "Note on JSS").
- The earlier `.acl` PUT returned **415** because JSS treats `.acl`/`.meta` as **JSON-LD-on-disk**
  (`core-concepts/content-negotiation.md`): a `text/turtle` write is the wrong media type. The
  on-disk write form is **`application/ld+json`**.
- JSS also exposes an MCP `write_acl` tool, but our agents (Claude Code CLI, curl/fetch, git) are
  **HTTP-native** and must not depend on MCP. So the primary ACL mechanism is the HTTP `ld+json`
  PUT; `write_acl` is an optional convenience only.

## Principle (recorded)

**The memory pod's agent surface stays HTTP-native** — bearer auth + curl/fetch/git. MCP is a bonus
surface, never a requirement. (a) and the Keycloak gateway both follow this.

## Design

### (b) Requester-auth on the proxy's internal reads

Thread the incoming request's `Authorization` header into `proxy.js`'s two internal `fetch`es:
the `<container>/.meta` read (`constrainedBy()`) and the shape read (`validatorFor()`). When the
owner writes to their own constrained container, their bearer reads their own `.meta` and shape →
the constraint is discovered → admission runs. On an unconstrained or unreadable container the
proxy still passes through (unchanged fail-open-to-passthrough behavior is retained for
non-constrained containers; see Error handling).

- **Cache caveat:** the existing `shapeCache`/`shapeDsCache` are keyed by container/shape path only.
  Reads are now auth-dependent, so a value cached under one requester's access could leak a hit to
  another. For P2, key the `.meta`/shape caches by `(path, authorization)` — or, simpler and
  sufficient given shapes are about to be public-read, cache only **public** (auth-less) shape
  reads and do not cache requester-scoped reads. The plan picks the minimal correct option.
- **Edge case (noted, not solved):** an agent with write-but-not-read on `.meta` cannot have the
  constraint discovered under its own auth. With (a) making shapes public, the residual gap is only
  `.meta` readability; acceptable for the owner-centric memory-pod model. Flag in the README.

### (a) HTTP ACL provisioning (public-read shapes)

A small, dependency-free helper that writes a WAC ACL via **`PUT <resource>.acl`** with
`Content-Type: application/ld+json`, granting public read:

- WAC content (JSON-LD serialization of):
  - owner: `acl:agent <owner-webid>`; `acl:mode acl:Read, acl:Write, acl:Control`; `acl:accessTo`
    + `acl:default` the target.
  - public: `acl:agentClass foaf:Agent`; `acl:mode acl:Read`; `acl:accessTo` the shape.
- The helper is HTTP-only (works from Claude Code CLI, curl, the app). It needs the owner bearer
  (Control) to write the `.acl`.
- **Spike unknown it resolves:** the exact `application/ld+json` ACL body JSS accepts (framing,
  `@context`, whether `accessTo` must be absolute/relative). The implementation tries the WAC
  JSON-LD and confirms acceptance (2xx) and effect (public GET → 200). If `ld+json` PUT is itself
  rejected, the documented fallback is to discover the `.acl` URL via the `Link: rel="acl"` header
  and retry there; record what JSS accepts.

### Components

| Component | Responsibility | File |
|---|---|---|
| proxy auth-forwarding | thread `Authorization` into `.meta`+shape reads; auth-aware caching | `constrained-container/proxy.js` (modify) |
| ACL provisioning helper | `PUT .acl` as `application/ld+json` → public-read on a resource | `constrained-container/set-acl.mjs` (new, HTTP-only) |
| README note | record the (a)/(b) split, the HTTP-native principle, the edge case | `constrained-container/README.md` (update) |

## Testing

Against a **default (owner-only)** JSS pod (the case that previously failed):

1. **Setup:** owner creates a container, makes it constrained (`PUT <container>/.meta` declaring
   `ldp:constrainedBy <shape>`), and PUTs the shape — all owner-authenticated (so all are owner-only
   by default).
2. **(b) governs protected container:** an owner-authenticated write of a **non-conforming** body
   through the proxy → **422** (proxy read `.meta`+shape under the requester's auth and validated);
   a **conforming** write → admitted (201/205). (Before the fix this would pass through unvalidated.)
3. **(a) public-read shape:** run the ACL helper to grant public-read on the shape; then `GET
   <shape>` with **no Authorization** → **200** (proves the HTTP `ld+json` ACL write worked and the
   shape is now world-readable without MCP).

Vitest, consistent with the repo harness; the test ensures the pod (`make up`) and proxy are up.

## Error handling

- `.meta` unreadable even with the requester's auth → treat container as unconstrained → pass
  through (retains today's behavior; the proxy is opt-in admission, not a deny-by-default gate).
- `.acl` write rejected → surface JSS's status/body; try the `Link: rel="acl"` discovery fallback;
  do not silently swallow.
- Shape read fails after public-read provisioning → admission cannot run → pass through, log a
  warning (same fail-open-to-passthrough posture, logged).

## Acceptance criteria

1. On a default owner-only JSS pod, a non-conforming write to a constrained container through the
   proxy is **rejected (422)** and a conforming write is **admitted** — i.e. (b) governs protected
   containers.
2. The ACL helper writes a public-read `.acl` via HTTP `application/ld+json` (no MCP), and the shape
   is then **GET-able unauthenticated (200)** — i.e. (a) works HTTP-natively.
3. The exact accepted JSON-LD ACL form is recorded (in the README / helper comments).
4. Shape-read caching does not leak one requester's authorized read to another (auth-aware or
   public-only caching).

## Out of scope

- Type Index / Search itself (P2 only unblocks its authz model).
- Account/app pod auto-provisioning; general ACL management UI.
- MCP `write_acl` (noted as optional; not built against).
- Merging the constrained-container proxy and the Keycloak gateway into one sidecar (later).
- did:key / NIP-98 ACL agents; only `acl:agent` (owner) + `acl:agentClass foaf:Agent` (public).

## Exit

Proxy governs protected containers under requester auth; HTTP ACL provisioning makes shapes
public-read; accepted JSON-LD ACL form recorded. Updates FOLLOWUP open item 2.
