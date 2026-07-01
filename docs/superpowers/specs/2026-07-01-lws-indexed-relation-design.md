# LWS Indexed-Relation Filter — design (L2.5 follow-up)

**Status: design of record.** Captured 2026-07-01. Grounds the next fork increment on `la3d/lws`:
generalize the shipped Type Search from a `type`-only filter to `type` + a **server-chosen set of
indexed relations**, per the LWS Search & Type Index Editor's Draft. `--lws`-gated and additive — the
same pattern as L1–L2.5.

This is the **profile-layer seam** named in the L2.5 deferred carryover
(`docs/superpowers/specs/2026-07-01-lws-typeindex-search-design.md` §10 #1). v1 indexes exactly one
relation — **`describedby` → SHACL shape** — read additively from the store L3 already maintains. Adding
a second relation later is additive, not structural.

**Authoritative grounding (verbatim skills, pinned):**
- `.claude/skills/lws-protocol/references/lws10-searchindex/index.html` — defines **indexed relation**
  ("a descriptive link relation that a server has chosen to index, making it available as a filter …
  in addition to `type`"), the CNF filter grammar, the no-oracle rule, the descriptive-only
  eligibility rule, and the worked `?type=…&describedby=<shape>` example.
- `.claude/skills/lws-protocol/references/lws10-core/Operations/update-resource.md` — the LWS **linkset
  example carries `describedby` → a schema** (`"describedby":[{"href":"/schemas/personal-info.json"}]`,
  lines 65/80): the descriptive/shape sense of the relation, in the linkset, is upstream-sanctioned.
- `.claude/skills/lws-protocol/references/lws10-core/Operations/metadata.md` — `type` is System-Managed
  metadata; the **storage description has its own relation `rel="storageDescription"`** (line 21),
  distinct from `describedby`; `.meta` **is** the linkset resource (read-resource.md:26,55).
- **RFC 9264** (linkset media types) — a linkset is relation-keyed arrays of `{href}` objects (§4.2.2/3)
  and places **no restriction on what a `describedby` target may be**; a SHACL shape is a legal target.
- `.claude/skills/shacl-constraints` — the shape language L3 validates against.

**Read alongside:** L2.5 design (above); L3 design
`docs/superpowers/specs/2026-06-30-lws-L3-shacl-admission-design.md`; state `FOLLOWUP.md`.

---

## 1. Motivation — one relation, three uses, one bug

`describedby` appears three ways in the fork today. Grounding them against the specs (above) shows the
sprawl is mostly a single self-inflicted bug, not a genuine three-way semantic conflict:

| Use | Where | Verdict |
|---|---|---|
| `Link: rel="describedby"` → `.meta` | Solid/LWS core auxiliary (Description Resource) | **upstream, correct** — the `.meta`/linkset resource |
| linkset `describedby` → `/.well-known/lws-storage` | `src/lws/linkset.js` (both call sites pass `describedByUrl: storageDescriptionUrl(...)`) | **our bug** — that href belongs under `rel="storageDescription"` (which L2 already emits); the storage description is not a `describedby` target |
| `.meta` triple `<r> powder-s:describedby <shape>` | L3 admission (`src/lws/constraint.js`) | **upstream sense, correct home** — matches the LWS linkset example (describedby → schema); `.meta` *is* the linkset resource |

`describedby` is deliberately generic upstream (IANA/POWDER: "a resource providing information about the
link's context"), so `.meta`, a shape, and a storage description are all technically legal targets —
the relation is simply too coarse to distinguish them. But the LWS **linkset** example fixes the
in-linkset meaning to the **schema/shape** sense, and the searchindex filter example uses that same
sense. So the coherent design is: **the linkset `describedby` carries the shape** (fixing the bug), and
**the indexed-relation filter filters on that same shape** — one source, two surfaces, spec-aligned on
both. The storage-description sprawl is removed, not disambiguated.

We lead the seam with the spec-literal key **`describedby`**. A more precise key (`conformsTo`) and the
profile-authority vocabulary (W3C PROF) are a **Plan 2** concern layered above this — see §7.

---

## 2. Scope

**In.**
1. **Fix the read surface.** `generateLinkset` emits `describedby` = the resource's L3 shape target(s),
   or **omits `describedby` when the resource is unconstrained**. The storage description stays under
   the separate `rel="storageDescription"` header (unchanged, L2).
2. **Add the search surface.** Generalize `/types/search` to accept a **`describedby`** filter with the
   same CNF grammar as `type`, combined with `type` groups by logical AND. `describedby` is the sole
   member of the server's indexed-relation set in v1.

Both read the shape target(s) from `.meta` through the existing `src/lws/constraint.js` path.

**Out — deferred to named follow-ups (§7), not dropped:** the `conformsTo`/PROF profile-authority
layer; a general *capture* path for arbitrary descriptive `rel` links on write; container
`items[].type`-style enrichment of `describedby` in L1 listings; in-memory derivation cache; body
pagination.

**Non-goal.** No content parsing. Shape targets come from the `.meta` graph (already server-read during
L3 admission) and declared `Link` headers only — never from parsing resource bodies (the L2.5 constraint
of record).

**Spec status caveat.** The searchindex module is an Editor's Draft ("unofficial proposal"). We track it
and front-run stabilization, as with L2.5.

---

## 3. Why "omit when unconstrained"

An agent traverses by following the links that are present. An **absent `describedby` is itself the
signal** — "this resource declares no shape" — and a present one leads the agent straight to the shape
to fetch. Emitting a placeholder (or the old storage-description href) would hand the agent a dead or
misleading hop. Omission is the correct linked-data semantics and the correct agent-affordance. The only
behavior change is that clients relying on `describedby` *always* being present in the linkset break —
acceptable, because it currently points at a wrong/useless target.

---

## 4. Architecture

The Type Search machinery is already structurally generic — `matchesTypeFilter` is CNF-over-string-
membership; the walk produces a per-resource authorized value list. Generalizing to relations means (a)
parameterizing the filter by relation key, and (b) letting the walk collect a second per-resource value
set (`describedby` targets) beside `type`.

### 4.1 Reading shape targets (`src/lws/constraint.js`)

L3 already defines `DESCRIBEDBY = 'http://www.w3.org/2007/05/powder-s#describedby'` and `describedbyFrom`
(returns the **first** shape target). Add a sibling that returns **all** targets, for indexing and for
the linkset:

- `describedbyTargets(storage, metaPath, baseIri) → URI[]` — scan the parsed `.meta` dataset, collect
  every object of a `powder-s:describedby` quad. `describedbyFrom` becomes `describedbyTargets(...)[0]`
  (behavior preserved for admission's single-shape resolve).

This is the sole indexed-relation resolver in v1. It reads only `.meta` (the linkset resource) — no new
store, no write-path change.

### 4.2 Generalized filter (`src/lws/type-index.js`)

Refactor the `type`-specific parser into a relation-keyed one:

- `parseFilter({ query, body }) → { type: cnf, relations: { <relKey>: cnf } }` — GET reads each query
  key's `getAll`, comma-splitting into OR-groups; POST reads each body key (`type` + relation keys),
  array-of-arrays. `type` is special-cased (always supported). Every **other** non-reserved key is a
  candidate relation filter. Reserved keys (pagination) are excluded.
- **Indexed-relation allowlist** = `{ describedby }` (module constant; the extensibility seam). A key not
  in the allowlist is an **unindexed relation**: its constraint **matches nothing** → the whole CNF is
  unsatisfiable → **empty result set, not an error** (searchindex no-oracle rule). `?foo=bar` returns
  `[]`; it does not `400` and is indistinguishable from a target that matched nothing.
- `matchesFilter(resource, filter) → bool` — `matchesTypeFilter(resource.types, filter.type)` AND, for
  each `relKey` in `filter.relations`: if unindexed → `false`; else `matchesTypeFilter(resource[relKey],
  filter.relations[relKey])`. Reuses the existing CNF truth-table logic verbatim per value set.

**Descriptive-only rule holds by construction:** only `describedby`-as-shape is in the allowlist;
structural/protocol relations (`up`, `anchor`, `linkset`, `storageDescription`, and `type`-as-metadata)
are never indexable, so filtering on them yields empty — never an oracle, never an error. `type` keeps
its dedicated, always-on path.

### 4.3 Complexity caps

Keep L2.5's caps (`MAX_GROUPS=32`, `MAX_VALUES_PER_GROUP=64`, `MAX_TOTAL_TERMS=256`) but apply them
**globally across the combined filter** (type groups + all relation groups), not per relation — a filter
exceeding the global bound → `400`, never silently narrowed (searchindex §Request-Equivalence-Errors).

### 4.4 Handlers (`src/handlers/type-index.js`)

`authorizedResources(request)` gains a second per-resource resolve: alongside `readDeclaredTypes` →
`resourceTypes`, read `describedbyTargets(storage, metaPathFor(r), baseIri)`. `handleTypeSearch` calls
`parseFilter` then filters with `matchesFilter`. Response shape unchanged (`ContainerPage`, items carry
`id` + `type`); a server MAY add relation metadata to items but v1 does not. `/types/index` is
unchanged (it enumerates types only; relation enumeration is deliberately never exposed — no oracle).

### 4.5 Linkset generator (`src/lws/linkset.js`)

`generateLinkset(resourceUrl, { parentUrl, isContainer, declaredTypes, describedByShapes })`:
- Drop `describedByUrl: storageDescriptionUrl(...)` at both call sites (`resource.js` container-GET
  ~379–387, file-GET ~573–581, HEAD parity ~973–974).
- Pass `describedByShapes = describedbyTargets(storage, metaPath, baseIri)`; emit
  `describedby: shapes.map(href => ({ href }))` **only when non-empty**, else omit the member.
- `storageDescription` stays where L2 puts it (the separate `rel="storageDescription"` Link header) —
  unaffected.

### 4.6 Wiring / config

No new flag. Reuse `request.lwsEnabled` and the `lwsTypeIndex` gate; `/types/search` already exists.
Rate limiting unchanged (`/types/*` already in `needsTrustAwareRateLimit`). The linkset change is on the
`--lws` read path only; default LDP path provably unchanged (negative controls, §6).

---

## 5. Endpoints & filter (delta from L2.5)

`GET /types/search?type=https://schema.org/Person&describedby=https://shapes.example/PersonShape`
→ resources that are `schema:Person` **AND** declare a `describedby` link to `PersonShape`.

`POST /types/search`:
```json
{ "@context":"https://www.w3.org/ns/lws/v1",
  "type": ["https://schema.org/Person"],
  "describedby": ["https://shapes.example/PersonShape"] }
```
GET and POST MUST yield the same result set for an equivalent filter. `type` and `describedby` are the
only keys v1 acts on; any other relation key → empty (no-oracle); pagination keys reserved.

**Errors (unchanged from L2.5):** non-absolute-URI target (in `type` or a relation) → `400`; over global
cap → `400`; POST body not well-formed `lws+json` / wrong-typed → `400`; POST media type ≠
`application/lws+json` → `415`; unindexed relation or no-match → empty, not an error.

---

## 6. Authorization

**No change.** Same on-demand `walkResources` (`src/storage/filesystem.js`) + per-candidate
`checkAccess` drop (`src/wac/checker.js`) + per-query ACL memo. Shape targets are read server-side from
`.meta` during the walk. No new authz path; the filter remains a sub-predicate of GET-ability, so no
resource surfaces here that the caller could not GET directly — including no leak of *which* shape a
resource the caller can't read declares. `totalItems` is over the client-specific authorized view.

---

## 7. Deferred (named)

1. **`conformsTo` / W3C PROF profile-authority layer** — Plan 2. This layer stays at the spec-literal
   `describedby`; the PROF bundle (`dct:conformsTo` + `prof:isProfileOf` + `role:validation`/
   `role:vocabulary`/`role:context`) that resolves a profile's shape+vocab+context set is layered above
   and threads through `resolveStorageAuthority`. See FOLLOWUP "Open design question for the Plan 2
   brainstorm."
2. **General relation *capture* path** — a `.lwstypes`-style server-managed sidecar capturing arbitrary
   descriptive `Link: rel="<x>"` targets on write, for relations L3 does not already store. Add only
   when a second indexed relation needs it.
3. **Container `items[].type`-style enrichment of `describedby`** in L1 listings — the L1 enrichment
   fast-follow.
4. **In-memory derivation cache** + notifications-CDC refresh; **body pagination** — as in L2.5.

---

## 8. Testing

**Fork unit:**
- `describedbyTargets` — all targets (multi-`describedby` `.meta`), empty on none, `describedbyFrom`
  still returns the first (admission unchanged).
- `parseFilter` — `type`+`describedby` CNF, GET/POST equivalence; unindexed key → empty (not error);
  reserved pagination key not treated as a relation; global cap → `400`; non-absolute-URI → `400`.
- `matchesFilter` — CNF truth table across `type` AND `describedby`; single-shape resource matches a
  one-value `describedby` group; unindexed relation forces empty.
- Linkset — `describedby` now = shape target(s), omitted when unconstrained; **negative control**: the
  storage description is still emitted under `rel="storageDescription"` and is **absent** from the
  linkset `describedby`.
- Negative controls — default LDP path unchanged; non-`--lws` pod exposes nothing new.

**Live-pod gate** (extends `tests/lws-typeindex.test.mjs` or a sibling `tests/lws-indexed-relation.
test.mjs`; against the fork `--lws` TLS pod `https://pod.vardeman.me`; self-skips on a non-`--lws` pod):
provision a resource with an L3 shape declared in its `.meta`; assert `?describedby=<shape>` returns it,
`?describedby=<other-shape>` does not, `?type=<T>&describedby=<shape>` AND-composes, an unindexed
relation key returns empty (not error); assert the resource's **linkset** `describedby` is the shape and
an unconstrained resource's linkset omits `describedby`; assert authz-filtered `totalItems` divergence
(anon vs bearer) still holds.

**Branch** `la3d/lws-indexed-relation`; per-task spec+quality reviews + opus whole-branch review as the
gate; `git merge --no-ff` into `la3d/lws` (solo-dev merge model, no GitHub PR).

---

## 9. Key source references (la3d/lws @ dc770ca / 6cd5d9b)

- Filter logic + caps: `src/lws/type-index.js` (`parseTypeFilter`, `matchesTypeFilter`,
  `MAX_GROUPS/VALUES/TERMS`, `resourceTypes`, `buildTypeIndex`, `containerItemTypes`).
- Search/index handlers + authz walk: `src/handlers/type-index.js` (`authorizedResources`,
  `authorizedTypeLists`, per-query `aclCache`, `handleTypeSearch`, `handleTypeIndex`).
- Shape resolver (L3): `src/lws/constraint.js` (`DESCRIBEDBY` POWDER IRI, `describedbyFrom`,
  `resolveShapeUrl`) — add `describedbyTargets`.
- Linkset generator + call sites: `src/lws/linkset.js` (emits `describedby:[{href}]`); container-GET
  `src/handlers/resource.js` ~379–387, file-GET ~573–581, HEAD parity ~973–974 (all pass
  `describedByUrl: storageDescriptionUrl(...)` — the bug to fix); `src/lws/storage-description.js`
  (`storageDescriptionUrl`).
- Resource walk: `src/storage/filesystem.js` (`walkResources`, skips dotfiles + aux suffixes).
- Authorization: `src/wac/checker.js` (`checkAccess`, `findApplicableAcl` + ACL memo);
  `src/auth/middleware.js` (`buildResourceUrl`); identity on `request.webId`.
- Config gates: `src/config.js` (`lws`, `lwsTypeIndex`); `src/server.js` (`request.lwsEnabled`,
  `trustAwareRateLimit`, `needsTrustAwareRateLimit` incl. `/types/*`, route registration in
  `fastify.after()`).
