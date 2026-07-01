# LWS Search & Type Index — design (L2.5)

**Status: design of record.** Captured 2026-07-01; **revised same day to align with the W3C specs**
(the earlier `.meta`-store framing was not spec-conformant — see §4). Grounds the next fork
increment: the LWS **Search and Type Index Services** module, added in-process to
`LA3D/JavaScriptSolidServer` (`la3d/lws`), `--lws`-gated and additive — the same pattern as L1–L3.

Sits as **L2.5**, between L2 (storage discovery) and L3 (SHACL admission). It is the **content-neutral
discovery ground** the substrate resolves through: an agent learns which *types* live in a storage and
finds the resources of a given type without crawling the containment hierarchy, and without the server
understanding any content model.

**Authoritative grounding (verbatim skills, pinned):**
- `.claude/skills/lws-protocol/references/lws10-searchindex/index.html` — the module we implement
  (specStatus `ED`, "unofficial proposal"; editors Wright/Bremer).
- `.claude/skills/lws-protocol/references/lws10-core/Operations/metadata.md` — **the metadata model**:
  `type` is *System-Managed* metadata; the **Linkset Resource** (RFC 9264, `rel="linkset"`) is its
  server-managed home.
- `.claude/skills/lws-protocol/references/lws10-core/container-representation.md` — `items[].type`
  carries intrinsic ∪ user-defined types; `totalItems` *SHOULD be accurate but MAY be approximate*.
- `.claude/skills/solid-protocol/references/protocol.html` §Auxiliary Resources — `.meta` is the
  **client-managed Description Resource** (`rel="describedby"`, POWDER-DR), a *different* auxiliary
  from server-managed `type`.

**Read alongside:** L3 design `docs/superpowers/specs/2026-06-30-lws-L3-shacl-admission-design.md`;
state `FOLLOWUP.md` (this supersedes the "Type Index deferred / align-when-stable" stance).

---

## 1. Scope

**In.** `TypeIndexService` (enumerate the distinct resource types present) and `TypeSearchService`
(return the resources matching a **conjunctive-normal-form `type` filter**), both advertised in the L2
storage description, both **authorization-filtered to the requesting client's current read access**.
Underneath them, the **system-managed `type` metadata** they read: intrinsic LWS classes ∪ user-defined
type URIs captured from `Link: rel="type"` on write, surfaced consistently via the resource **linkset**
and the Type Index/Search.

**Out — deferred to named follow-ups, not dropped:**
- The **general indexed-relation** filter (its own spec — the profile-layer seam). This design keeps
  the type-metadata store shaped so relations slot in additively. **Note the `describedby` overloading
  to resolve there:** Solid uses `describedby` for the *Description Resource* auxiliary, while L3 and
  the searchindex example use it to point at a *SHACL shape* — the follow-up must disambiguate.
- **Container `items[].type` enrichment** (surfacing user-defined types in L1 container listings — the
  spec MAYs it; a coherence fast-follow that touches L1 container generation).
- **Full linkset mutability** (PATCH `merge-patch+json`, atomic updates) — the broader L2 carryover.
- An **in-memory derivation cache** (built at boot, updated on write, refreshed via notifications CDC).
- Body **pagination** (`ContainerPage` `first/next/last`) — deferred as in L1.
- **Content-based** type enrichment (parsing resource bodies).

**Non-goal.** Type discovery never parses resource content — it reads declared `Link` headers +
server-intrinsic state only (spec §Type-Derivation). This is what keeps the service **independent of
any content** put into the pod (the design constraint of record).

**Spec status caveat.** The searchindex module is an Editor's Draft ("unofficial proposal"). This is an
experimental system built agentically; we track the ED and evolve with it, deliberately front-running
stabilization rather than waiting on it.

---

## 2. Layering

| Layer | Provides | State |
|---|---|---|
| L1/L2 (LWS core) | container `items[]`, conneg, storage description + `service[]`, **read-only linkset** (intrinsic type only) | shipped |
| **L2.5 (this)** | **system-managed `type` metadata (intrinsic ∪ user-defined) + CNF `type` search, authz-filtered** | design |
| L3 | per-resource SHACL admission; `describedby` in the client Description Resource | shipped |

L2.5 **completes work L2 deferred**: L2 shipped the linkset read-only with intrinsic type only; L2.5
adds the *user-defined* half of the system-managed `type` metadata and the services that read it. It
depends only on L1/L2 surfaces; the deferred indexed-relation follow-up consumes L3's `describedby`.

---

## 3. Architecture

Type derivation is the **system-managed `type` metadata** of a resource (LWS `metadata.md`): server-
maintained, read-only to clients. It has one server-managed store and three consistent read surfaces —
the resource **linkset** `type` link, the new **Type Index/Search**, and (deferred) container
`items[].type`.

Two new files, mirroring the existing `src/lws/*` + `src/handlers/*` split, plus small edits to the
write path and the linkset generator.

- **`src/lws/type-metadata.js`** — the system-managed type store (server-managed; **not** the client
  Description Resource). Pure-ish helpers over `storage`:
  - `captureDeclaredTypes(storage, metaStorePath, resourceUrl, typeUris)` — persist user-defined types
    on write (atomic-with-write; §4).
  - `readDeclaredTypes(storage, metaStorePath) → URI[]` — read them back.
  - `resourceTypes({ isDirectory, declared }) → URI[]` — intrinsic class ∪ declared (the canonical
    `type` value).
- **`src/lws/type-index.js`** — pure functions, no I/O:
  - `buildTypeIndex(resourceTypeLists) → TypeIndex` — distinct types over an authz-filtered set.
  - `parseTypeFilter(query|body) → cnf` — GET query + POST body → one internal CNF shape.
  - `matchesTypeFilter(types, cnf) → bool` — `(A OR B) AND C`.
- **`src/handlers/type-index.js`** — orchestration: walk storage → resolve types → filter →
  authz-gate → serialize `application/lws+json`.

**Edits to existing files:**
- Write path (`handlers/resource.js` handlePut, `handlers/container.js` handlePost): parse
  `Link: rel="type"` and `captureDeclaredTypes` on the success path, adjacent to the L3 admission block.
- Linkset generator (`src/lws/linkset.js` `generateLinkset`): its `type` becomes intrinsic ∪ declared
  (canonical surface for the same metadata). Today it emits intrinsic only (`linkset.js:13`).

**Wiring (existing `--lws` pattern):**
- Routes: register `GET /types/index` and `GET|POST /types/search` inside `if (lwsEnabled) {…}`
  (`server.js:877`), method-not-allowed for other verbs (as the storage-description route does).
- Advertise: push `{type:"TypeIndexService", serviceEndpoint:".../types/index"}` and
  `{type:"TypeSearchService", serviceEndpoint:".../types/search"}` into `service[]` (`server.js:883`).
- Config gate: reuse `request.lwsEnabled` — no new flag.

Endpoint paths are server-managed service endpoints, not LDP resources; writes to them are `405`.

---

## 4. System-managed `type` metadata (the corrected store)

Per LWS `metadata.md`, **`type` is System-Managed metadata — "Maintained by the server; Read-Only."**
It therefore does **not** live in the client-managed Description Resource (`.meta` / `rel="describedby"`,
Solid auxiliary). This corrects the earlier draft, which wrongly persisted derived types into `.meta`.

- **Intrinsic types** need no persistence — `lws:Container` if `isDirectory`, else `lws:DataResource`
  (as `linkset.js:13` already assigns), derivable at any time from the filesystem.
- **User-defined types** are derived from the client's `Link: rel="type"` header on write
  (spec §Type-Derivation: "servers SHOULD derive resource types from HTTP Link headers … combined with
  the server's intrinsic knowledge") and persisted in a **server-managed metadata store**, distinct
  from the client Description Resource. Capture is **atomic with the resource write** (`metadata.md`:
  linkset updates MUST be atomic with associated resource operations). Physical file naming is an
  implementation detail chosen in the plan; it is server-only and never exposed as a writable LDP
  resource.
- A resource's canonical `type` = intrinsic ∪ user-defined. This value is surfaced by the linkset
  generator and read by the Type Index/Search from the same store — one source, consistent surfaces.

**Retrofit:** resources written before this ships have no captured user-defined types, so they are
discoverable by **intrinsic class immediately** and by **declared type once (re)written** — matching the
spec note that a type present only inside a resource's graph, without a `Link` header, may not be
discoverable.

**Client-tamper resistance** (spec §Type-Derivation: "strictly populated and managed by the server …
prevent … corruption by clients") is satisfied because the store is server-only; a client influences
its *own* resource's types solely through the `rel="type"` header on write, which is the intended path.

---

## 5. Index build — on-demand, authorization-aware walk

**No persistent index in v1.** The filesystem (server-managed type store + intrinsic class) is the
source of truth; any index is a rebuildable cache. This matters because JSS is **git-backed** —
resources can change via `git push`, out of band from the HTTP handlers — so a write-path-only
maintained index would silently drift. On-demand reading of the filesystem cannot drift.

Per request:
1. Recursively walk from the storage root — a new `walkContainer(path)` over the single-level
   `listContainer()` (`storage/filesystem.js:172`), skipping hidden entries per `isHiddenEntry()`
   (`ldp/container.js:33`) and the server-managed metadata-store files.
2. For each resource resolve `type` (intrinsic ∪ `readDeclaredTypes`); for search, `matchesTypeFilter`.
3. Gate each candidate through the read-access filter (§6); drop denials.

**Efficiency lever — request-scoped ACL memo.** `checkAccess` re-reads/re-parses `.acl` from disk on
every call (`wac/checker.js`, no cache). Across a walk of N resources sharing M containers that is N
redundant resolutions where M suffice. We thread a **per-query** parsed-`.acl` cache into the
effective-ACL resolution (`findApplicableAcl`), so each `.acl` is read once per request and reused for
every resource it governs. Authorization-safe: the cache lives only within a single request, against
current on-disk state — never a cross-request authz cache (§6 forbids that).

**No subtree pruning.** "Container unreadable ⇒ skip subtree" is **incorrect** under WAC: a child's own
`.acl` can grant read even when the parent's `acl:default` denies. Every resource is considered
individually; correctness from `checkAccess`'s per-resource inheritance, speed from the ACL memo.

**Deferred optimization (designed-for, not built):** an in-memory `Map<typeURI, Set<resourceURI>>`
built by the same walk at boot, updated on the write path, refreshed via the notifications CDC channel
to catch out-of-band (git) writes — walk retained as the rebuild primitive. Caches derived types only;
the live authz filter still runs on every query.

---

## 6. Authorization filtering

**Reuse `src/wac/checker.js` `checkAccess()` unchanged** as a per-candidate read predicate — do not
reimplement authz.

```
checkAccess({ resourceUrl, resourcePath, isContainer, agentWebId, requiredMode: READ })
  → { allowed: boolean, ... }
```

- **Request-decoupled** — callable for any resource URI, not only the request's own target.
- Reads ACL from disk **per call** (with our per-query memo), resolves inheritance, public-read
  (`foaf:Agent`), `acl:AuthenticatedAgent`; **fails closed** (no ACL ⇒ deny). This directly meets the
  spec's hardest requirement: evaluate against the client's **current** access, never a cached view.
- Authenticated identity is already on `request.webId` (global preHandler auth hook, `server.js:698`,
  covering DPoP / LWS-CID / bearer). Unauthenticated ⇒ `agentWebId: null`.
- URL normalization uses `buildResourceUrl` (`auth/middleware.js:26`); handler runs in request context,
  target deploy is **path-mode** (`pod.vardeman.me/…`); the module takes a resolved pod origin so
  subdomain mode is not a latent landmine.

**Spec §Security-Authorization guarantees, and how they hold:** unauthorized entries omitted before
serialization; `totalItems` over the client-specific view (§7); current-authz not cached (`checkAccess`
reads live ACL each request); **no discovery oracle** — because the filter *is* the same predicate the
normal GET path uses, a resource can never surface here that the caller could not GET directly.

---

## 7. Endpoints, filter, responses

All responses `application/lws+json` (`rdf/conneg.js:19`; `selectContentType` already negotiates it),
`@context: https://www.w3.org/ns/lws/v1`.

**`GET /types/index`** (no parameters) → distinct types over the authorized, derived set:
```json
{ "@context":"https://www.w3.org/ns/lws/v1", "type":"TypeIndex",
  "totalItems":3, "items":[ {"id":"https://schema.org/Person"}, {"id":"https://www.w3.org/ns/lws#Container"} ] }
```

**`GET /types/search`** — CNF over `type`: comma = OR within a group, repeated parameter = AND across
groups. `?type=A,B&type=C` → `(A OR B) AND C`. No `type` ⇒ all authorized resources.
**`POST /types/search`** — equivalent, array-of-arrays body:
```json
{ "@context":"https://www.w3.org/ns/lws/v1",
  "type": [ ["https://schema.org/Person","http://xmlns.com/foaf/0.1/Person"], "https://www.w3.org/ns/lws#DataResource" ] }
```
Both return a `ContainerPage` whose items carry at least `id` and `type` (`type` = `"DataResource"`/
`"Container"` or an array with user-defined URIs, per `container-representation.md`). GET and POST MUST
yield the same result set for an equivalent filter. `type` is the **only** parameter v1 accepts.

**Errors (spec §Request-Equivalence-Errors):** POST body not well-formed `lws+json`, or `type` not an
array / element not string-or-array → `400`; POST entity media type ≠ `application/lws+json` → `415`; a
`type` value that is not a syntactically valid absolute URI → `400`; a well-formed type URI matching
nothing → **empty, not an error**; a filter exceeding the server complexity bound → `400` (never
silently narrowed).

CNF `(A OR B) AND C` is the **entire** query ceiling; v1 does not support nesting, negation, comparison,
ordering, or text matching, and is not required to.

---

## 8. Pagination & `totalItems`

Single page in v1 (degenerate: `Link: rel="first"` only), matching L1's deferred-pagination stance
(`ldp/container.js:102` TODO), structured to add `first/next/last` later. `totalItems` is the
authorization-filtered count and, per `container-representation.md`, **SHOULD be accurate but MAY be
approximate** — so v1 may return the count of the authorized page/scan without forcing a whole-store
authz pass. A server-chosen filter-complexity / page bound rejects over-limit filters with `400`.

---

## 9. Testing

- **Fork unit tests:** `resourceTypes` (intrinsic ∪ declared); `parseTypeFilter` GET/POST equivalence;
  `matchesTypeFilter` CNF truth table; `TypeIndex`/`ContainerPage` shape; **authz filter** (public vs.
  bearer visibility diverge; unauthorized type absent from `totalItems`); linkset `type` now =
  intrinsic ∪ declared; error cases (`400`/`415`); **negative controls** (default LDP path unchanged;
  non-`--lws` pod exposes nothing; no `service[]` entries without `--lws`).
- **Live-pod gate:** `tests/lws-typeindex.test.mjs` + `make test-typeindex` against the fork `--lws`
  TLS pod (`https://pod.vardeman.me`), **self-skipping on a non-`--lws` pod** — same shape as
  `make test-l3` / `make test-lws`. Provisions typed resources (via `Link: rel="type"` on write) under
  differing ACLs; asserts index/search content, that the resource's linkset `type` reflects the
  declared type, scheme parity, and the authz-filtered `totalItems` divergence between anonymous and
  bearer callers.
- **Branch** `la3d/lws-typeindex`; per-task spec+quality reviews + opus whole-branch review as the gate;
  `git merge --no-ff` into `la3d/lws` (solo-dev merge model, no GitHub PR).

---

## 10. Deferred (named)

1. **General indexed-relation filter** — the profile-layer seam; own spec+plan next. Must resolve the
   `describedby` overloading (Solid Description-Resource vs. SHACL-shape pointer).
2. **Container `items[].type` enrichment** — surface user-defined types in L1 container listings.
3. **Full linkset mutability** — PATCH `merge-patch+json`, atomic updates (broader L2 carryover).
4. **In-memory derivation cache** + notifications-CDC refresh (§5).
5. **Body pagination** (`ContainerPage` `first/next/last`).
6. **Content-based type enrichment** (parse bodies for types).

---

## 11. Key source references (la3d/lws @ 1772ed8)

- Config gate / route registration / storage-description `service[]`: `src/server.js:72,314,332,877,883`.
- Storage description generator: `src/lws/storage-description.js`.
- Resource enumeration: `src/storage/filesystem.js:172` (`listContainer`), `:96` (`write`), `:44`
  (`read`), `:13` (`exists`); hidden-entry filter `src/ldp/container.js:33`.
- Write path (capture site) + L3 `.meta` block: `src/handlers/resource.js:1156–1216` (handlePut),
  `src/handlers/container.js:69,131–188` (handlePost; `Link` header at `:69`).
- Intrinsic class + linkset `type`: `src/lws/linkset.js:1,13`.
- lws+json container listing + deferred pagination: `src/ldp/container.js:90–104`;
  `src/handlers/resource.js:355–376` (LWS container GET branch).
- Conneg / media type: `src/rdf/conneg.js:19,35`.
- **Authorization:** `src/wac/checker.js:21` (`checkAccess`), `:59` (`findApplicableAcl`, private —
  add the per-query ACL memo here); `src/auth/middleware.js:26` (`buildResourceUrl`), `:74`
  (`authorize`); identity on `request.webId` (`src/server.js:698`).
- Metadata store pattern reference (client Description Resource, do **not** reuse for `type`):
  `src/lws/constraint.js` (`.meta` read).
