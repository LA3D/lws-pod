# LWS Search & Type Index — design (L2.5)

**Status: design of record.** Captured 2026-07-01. Grounds the next fork increment: the LWS
**Search and Type Index Services** module, added in-process to `LA3D/JavaScriptSolidServer`
(`la3d/lws`), `--lws`-gated and additive — the same pattern as L1–L3.

Sits as **L2.5**, between L2 (storage discovery) and L3 (SHACL admission). It is the **content-neutral
discovery ground** the substrate resolves through: an agent learns which *types* live in a storage and
finds the resources of a given type without crawling the containment hierarchy, and without the server
understanding any content model.

**Read alongside:**
- Spec (ground truth, pinned): `.claude/skills/lws-protocol/references/lws10-searchindex/index.html`
  (specStatus `ED`, "unofficial proposal"; editors Wright/Bremer).
- L3 design: `docs/superpowers/specs/2026-06-30-lws-L3-shacl-admission-design.md`.
- State: `FOLLOWUP.md` (this supersedes the "Type Index deferred / align-when-stable" stance —
  pulled forward as foundational).

---

## 1. Scope

**In.** `TypeIndexService` (enumerate the distinct resource types present) and `TypeSearchService`
(return the resources matching a **conjunctive-normal-form `type` filter**), both advertised in the
L2 storage description, both **authorization-filtered to the requesting client's current read
access**. Server-side type **derivation** from `Link: rel="type"` headers on write, plus intrinsic
LWS classes.

**Out — deferred to named follow-ups, not dropped:**
- The **`describedby` / general indexed-relation** filter (its own spec — it is the profile-layer
  seam; L3 already stores `describedby` in `.meta`, so this is a small extension of the same
  machinery). This design leaves the derivation store shaped so relations slot in without rework.
- An **in-memory derivation cache** (built at boot, updated on write, refreshed via the notifications
  CDC channel).
- Body **pagination** (`ContainerPage` `first/next/last`) — deferred exactly as in L1.
- **Content-based** type enrichment (parsing resource bodies).

**Non-goal.** Type discovery never parses resource content — it reads declared `Link` headers +
server-intrinsic state only. This is what keeps the service **independent of any content** put into
the pod (the design constraint of record).

**Spec status caveat.** The upstream module is an Editor's Draft ("unofficial proposal"). This is an
experimental system built agentically; we track the ED and evolve with it, deliberately front-running
the stabilization rather than waiting on it.

---

## 2. Layering

| Layer | Provides | State |
|---|---|---|
| L1/L2 (LWS core) | container `items[]`, conneg, storage description + `service[]`, Link headers | shipped |
| **L2.5 (this)** | **server-derived type registry + CNF `type` search, authz-filtered** | design |
| L3 | per-resource SHACL admission; `describedby` in `.meta` | shipped |

Each layer is additive and `--lws`-gated; the default LDP path is provably unchanged (negative
controls). L2.5 depends only on L1/L2 surfaces; it does not depend on L3, but its deferred
indexed-relation follow-up consumes L3's `.meta` `describedby`.

---

## 3. Architecture

Two new files, mirroring the existing `src/lws/*` + `src/handlers/*` split.

- **`src/lws/type-index.js`** — pure functions, no I/O of their own:
  - `deriveTypes(resource) → Set<URI>` — intrinsic class ∪ `rel="type"` URIs from `.meta`.
  - `buildTypeIndex(resources) → TypeIndex` — distinct types over an already-authz-filtered set.
  - `matchesTypeFilter(types, cnf) → bool` — CNF evaluation `(A OR B) AND C`.
  - `parseTypeFilter(query|body) → cnf` — GET query + POST body forms → one internal CNF shape.
- **`src/handlers/type-index.js`** — orchestration: walk storage → derive → filter → authz-gate →
  serialize `application/lws+json`. Mirrors the LWS container branch in `resource.js:355–376`.

**Wiring points (existing `--lws` pattern):**
- Routes: register `GET /types/index` and `GET|POST /types/search` inside the `if (lwsEnabled) {…}`
  block at `server.js:877`, with method-not-allowed for other verbs (as the storage-description route
  does).
- Advertise: push two entries into the `service[]` array built at `server.js:883`:
  `{type:"TypeIndexService", serviceEndpoint:".../types/index"}` and
  `{type:"TypeSearchService", serviceEndpoint:".../types/search"}`.
- Config gate: reuse `request.lwsEnabled` (`server.js:332`) — no new flag.

Endpoint paths `/types/index` and `/types/search` are server-managed service endpoints, not LDP
resources; writes to them are `405`.

---

## 4. Type derivation (the ground truth)

Types are **derived by the server, never authored into an index by clients** (spec §Type-Derivation).

- **On write** (`handlePut` in `resource.js`, `handlePost` in `container.js`): parse the incoming
  `Link` header for `rel="type"` targets and persist those URIs into the resource's **`.meta`**
  (JSON-LD), reusing the L3 `.meta` read/write path (`src/lws/constraint.js`). Today the write path
  only sniffs the Link header for `Container` (`container.js:69,84`); this adds `rel="type"` capture.
- **At walk time**, a resource's derived types =
  - intrinsic LWS class — `lws:Container` if `isDirectory`, else `lws:DataResource`
    (as assigned in `linkset.js:13`); ∪
  - the `rel="type"` URIs stored in its `.meta`.
- **Retrofit behavior:** resources written before this ships have no `rel="type"` in `.meta`, so they
  are discoverable by **intrinsic class immediately** and by **declared type once (re)written**. This
  matches the spec's explicit note that a type present only in a resource's internal graph, without a
  `Link` header, may not be discoverable.

The `.meta` store is shaped as a general relation map (`type` is the first relation key) so the
deferred `describedby`/indexed-relation follow-up is an additive read, not a reshape.

---

## 5. Index build — on-demand, authorization-aware walk

**No persistent index in v1.** The filesystem (`.meta` + intrinsic class) is the source of truth; any
index is a rebuildable cache. This matters because JSS is **git-backed** — resources can change via
`git push`, out of band from the HTTP handlers — so a write-path-only maintained index would silently
drift. On-demand reading of the filesystem cannot drift.

Per request:
1. Recursively walk from the storage root — a new `walkContainer(path)` built over the existing
   single-level `listContainer()` (`storage/filesystem.js:172`), skipping hidden entries per
   `isHiddenEntry()` (`ldp/container.js:33`).
2. For each resource: `deriveTypes` → `matchesTypeFilter` (for search; index takes all).
3. Gate each candidate through the read-access filter (§6) and drop denials.

**Efficiency lever — request-scoped ACL memo.** `checkAccess` re-reads and re-parses `.acl` from disk
on every call (no cache). Across a walk of N resources sharing M containers that is N redundant
resolutions where M suffice (M ≪ N). We thread a **per-query** cache of parsed `.acl` files into the
effective-ACL resolution (`wac/checker.js` `findApplicableAcl`), so each `.acl` is read once per
request and reused for every resource it governs. This is authorization-safe: the cache lives only
within a single request, against current on-disk state — it is not a cross-request authz cache
(§6 forbids that).

**No subtree pruning.** "Container unreadable ⇒ skip its subtree" is **incorrect** under WAC: a
child's own `.acl` can grant read even when the parent's `acl:default` denies (resource-specific ACL
overrides inherited default). So every resource is considered individually; correctness comes from
`checkAccess`'s per-resource inheritance, speed from the ACL memo.

**Deferred optimization (designed-for, not built):** an in-memory `Map<typeURI, Set<resourceURI>>`
built by the same walk at boot, updated on the write path, and refreshed via the existing
notifications CDC channel to catch out-of-band (git) writes — with the walk retained as the rebuild
primitive. Query semantics are identical, so it is a transparent drop-in. It caches derived types
only; the live authz filter still runs on every query.

---

## 6. Authorization filtering

**Reuse `src/wac/checker.js` `checkAccess()` unchanged** as a per-candidate read predicate — do not
reimplement authz.

```
checkAccess({ resourceUrl, resourcePath, isContainer, agentWebId, requiredMode: READ })
  → { allowed: boolean, ... }
```

- It is **request-decoupled** — callable for any resource URI, not only the request's own target.
- It reads ACL from disk **per call** (with our per-query memo) and resolves inheritance, public-read
  (`foaf:Agent`), and `acl:AuthenticatedAgent`; it **fails closed** (no ACL ⇒ deny). This directly
  satisfies the spec's hardest requirement: evaluate against the client's **current** access, never a
  cached/precomputed view.
- The authenticated identity is already on `request.webId` (set by the global preHandler auth hook,
  `server.js:698`, covering DPoP / LWS-CID / bearer). Unauthenticated ⇒ `agentWebId: null`.
- URL normalization for ACL matching uses `buildResourceUrl` (`auth/middleware.js:26`). The handler
  runs in request context and the target deploy is **path-mode** (`pod.vardeman.me/…`); the type-index
  module takes a resolved pod origin so subdomain mode is not a latent landmine.

**Guarantees required by spec §Security-Authorization, and how they are met:**
- *Unauthorized entries omitted entirely* — the filter drops them before serialization.
- *`totalItems` computed over the client-specific filtered view* — counted over survivors (§7).
- *Current authorization, not cached* — `checkAccess` reads live ACL state each request.
- *No discovery oracle* — because the filter **is** the same predicate the normal GET path uses, a
  resource can never surface here that the caller could not GET directly.

---

## 7. Endpoints, filter, responses

All responses are `application/lws+json` (`rdf/conneg.js:19`; `selectContentType` already negotiates
it), `@context: https://www.w3.org/ns/lws/v1`.

**`GET /types/index`** (no query parameters) → the distinct types over the authorized, derived set:
```json
{ "@context":"https://www.w3.org/ns/lws/v1", "type":"TypeIndex",
  "totalItems":3, "items":[ {"id":"https://schema.org/Person"}, {"id":"https://www.w3.org/ns/lws#Container"} ] }
```

**`GET /types/search`** — CNF over `type`: comma = OR within a group, repeated parameter = AND across
groups. `?type=A,B&type=C` selects `(A OR B) AND C`. No `type` ⇒ all authorized resources.
**`POST /types/search`** — equivalent, array-of-arrays body:
```json
{ "@context":"https://www.w3.org/ns/lws/v1",
  "type": [ ["https://schema.org/Person","http://xmlns.com/foaf/0.1/Person"], "https://www.w3.org/ns/lws#DataResource" ] }
```
Both return a `ContainerPage` whose items carry at least `id` and `type`. GET and POST MUST yield the
same result set for an equivalent filter. `type` is the **only** parameter v1 accepts (relations
deferred).

**Errors (spec §Request-Equivalence-Errors):**
- POST body not well-formed `lws+json`, or `type` not an array / element not string-or-array → `400`.
- POST entity media type ≠ `application/lws+json` → `415`.
- A `type` value that is not a syntactically valid absolute URI → `400`.
- A well-formed type URI matching nothing → **empty result, not an error**.
- Filter exceeding the server complexity bound → `400` (never silently narrowed).

CNF `(A OR B) AND C` is the **entire** query ceiling; v1 does not support nesting, negation,
comparison, ordering, or text matching, and is not required to.

---

## 8. Pagination & `totalItems`

Single page in v1 (degenerate: `Link: rel="first"` only), matching L1's deferred-pagination stance
(`ldp/container.js:102` TODO), structured to add `first/next/last` later. `totalItems` is the honest
authorization-filtered count. Because an accurate count requires the authz pass over the **whole**
match set (not just a page), a server-chosen **filter-complexity / page bound** rejects over-limit
filters with `400` as the guard against count-cost blowup on large pods. Tuning that bound is a named
deferred item.

---

## 9. Testing

- **Fork unit tests:** `deriveTypes` (intrinsic ∪ `.meta`); `matchesTypeFilter` CNF truth table;
  `parseTypeFilter` GET/POST equivalence; `TypeIndex`/`ContainerPage` shape; **authz filter**
  (public vs. bearer visibility diverge; unauthorized type absent from `totalItems`); error cases
  (`400`/`415`); **negative controls** (default LDP path unchanged; non-`--lws` pod exposes nothing;
  no `service[]` entries without `--lws`).
- **Live-pod gate:** `tests/lws-typeindex.test.mjs` + `make test-typeindex` against the fork `--lws`
  TLS pod (`https://pod.vardeman.me`), **self-skipping on a non-`--lws` pod** — same shape as
  `make test-l3` / `make test-lws`. Provisions typed resources (via `rel="type"` on write) under
  differing ACLs, asserts index/search content + scheme parity + the authz-filtered `totalItems`
  divergence between anonymous and bearer callers.
- **Branch** `la3d/lws-typeindex`; per-task spec+quality reviews + opus whole-branch review as the
  gate; `git merge --no-ff` into `la3d/lws` (solo-dev merge model, no GitHub PR).

---

## 10. Deferred (named)

1. **`describedby` / general indexed-relation filter** — the profile-layer seam; own spec+plan next.
2. **In-memory derivation cache** + notifications-CDC refresh (§5).
3. **Body pagination** (`ContainerPage` `first/next/last`).
4. **Content-based type enrichment** (parse bodies for types).
5. **`totalItems` complexity-bound tuning** (§8).

---

## 11. Key source references (la3d/lws @ 1772ed8)

- Config gate / route registration / storage-description `service[]`: `src/server.js:72,314,332,877,883`.
- Storage description generator: `src/lws/storage-description.js`.
- Resource enumeration: `src/storage/filesystem.js:172` (`listContainer`); hidden-entry filter
  `src/ldp/container.js:33`.
- Type-header parse site + `.meta` pattern: `src/handlers/container.js:69,84`;
  `src/lws/constraint.js` (`.meta` read/write, `describedby`).
- Intrinsic class assignment: `src/lws/linkset.js:13`.
- lws+json listing + deferred pagination: `src/ldp/container.js:90–104`.
- Conneg / media type: `src/rdf/conneg.js:19,35`.
- **Authorization:** `src/wac/checker.js:21` (`checkAccess`), `:59` (`findApplicableAcl`);
  `src/auth/middleware.js:26` (`buildResourceUrl`), `:74` (`authorize`); identity on `request.webId`
  (`src/server.js:698`).
