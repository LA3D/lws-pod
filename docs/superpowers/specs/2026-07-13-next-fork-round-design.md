# Next-fork round — sidecar authz completion, PATCH at the choke point, federation guard, structured uriSpace

**Date:** 2026-07-13
**Status:** design of record (brainstormed against a four-agent code exploration of
`la3d/lws @ 16530a1`, approved section-by-section 2026-07-13; pending implementation plan).
Governed by `docs/design-notes/layer-cake-principles.md` (P5/P9/**P13**),
`docs/foundations/06-code-placement-audit.md` (the standing neutrality gate), and the
choke-point discipline established by the 2026-07-12 fork-review round (#2/#10: ONE write gate
in `applyLwsWrite`, all surfaces share it). This is **the next-fork round** the 2026-07-13
referent close-out queued as the recommended next step: batch the recorded fork seeds into one
branch, one merge, one repin, one live sweep. **Next step:** `superpowers:writing-plans` against
this spec, then subagent-driven implementation. Do NOT start implementation from this doc
without a plan.

All file:line anchors below are `la3d/lws @ 16530a1` in
`~/dev/git/LA3D/JavaScriptSolidServer` unless marked lws-pod.

---

## 0. Why this exists

The referent round left a recorded seed list (FOLLOWUP 2026-07-13 NEXT block). This round drains
the fork-side seeds. The pre-design exploration **upgraded two of them from "recorded smalls" to
real defects**, which reshapes the round's center of gravity toward security/integrity:

1. **The sidecar authz family is not a remainder of cosmetics — all three open surfaces are
   real.** Shared root cause: `checkAccess` → `findApplicableAcl` (`src/wac/checker.js:32,:65`)
   resolves a sidecar's ACL by walking up from the sidecar's OWN path, landing on the
   container-default ACL — never the member's tighter `<member>.acl`. The two direct-GET fixes
   (`db9cdaa`, `16530a1`) closed exactly one surface of this class. Still open:
   - a client with container-WRITE (but only member-READ) can overwrite/delete a private
     member's `.meta` — its governance metadata (`dct:conformsTo`, `powder:describedby`);
   - a private member's `.meta` NAME still leaks into anonymous `items[]` listings (the S1
     filter's `else` branch checks READ on the sidecar's own path; `name.acl` is already safe
     via its stripped-subject CONTROL branch);
   - `*.lwstypes`/`*.lwsprov` writes are authorized on **READ**-of-subject (the
     `src/auth/middleware.js:107` branch is method-agnostic and `authorizeSidecarAccess`
     hardcodes READ at `:596`) — a *downgrade* below the blanket WRITE the fall-through would
     demand, and nothing anywhere rejects client writes to these reserved names. A client with
     mere read access can corrupt the server-derived type/provenance record. The recorded
     "cosmetic method-scope asymmetry" was in fact an integrity hole.

2. **PATCH bypasses the ENTIRE write choke point, not just type enrichment.** All three
   `handlePatch` branches assemble final bytes and call `storage.write` directly
   (`src/handlers/resource.js:2321,:2515,:2616`) — no write-consistency gate, no SHACL
   admission, no `.lwstypes`/`.lwsprov` maintenance. The recorded seed (stale `.lwstypes` after
   an `rdf:type`-mutating PATCH) is the symptom; the disease is the same class as the MCP bypass
   the fork-review round closed: a governed resource can be pushed out of its container shape
   via PATCH with no re-validation. The admission floor currently holds on every write surface
   *except* PATCH.

The remaining seeds are confirmed cheap: the SSRF IPv6 gap is two literal-prefix regexes in the
one shared table; the DNS pre-check is a wiring gap (the resolve-and-check capability already
exists in `validateExternalUrl`, it just was never wired to the MCP federation arm); the 404
`Accept-Patch` fix is one parameter threaded through three call sites; the structured-`uriSpace`
capability field follows the sibling-key pattern the storage-description builder already uses
everywhere else.

**Chuck's approved decisions (2026-07-13, recorded so they are not re-litigated):**
- **Scope = full batch minus leaf-vs-edge-bearing types.** The leaf-vs-edge seed (cold-probe
  finding #1) is the only item requiring genuinely new machinery — there is NO relation/edge
  index anywhere (confirmed absence; only the two governance relations `describedby`/
  `conformsTo` exist, computed live from `.meta` at query time, `src/lws/type-index.js:40`,
  `src/lws/authorized-resources.js:15-18`). It gets its own design round (§8).
- **PATCH routes FULLY through `applyLwsWrite`** — gate + admission + enrichment, not
  enrichment-only and not advisory-mode admission. The deliberate behavior change (a
  shape-violating PATCH now 400s) IS the admission-floor promise.
- **Client writes to System-Managed sidecars are rejected outright** (405 + teaching body), not
  re-gated to container-WRITE.
- **N3-Patch conformance gaps get spec-correct behavior** even where that changes behavior
  (silent no-op deletes → 409; ignored `solid:where` → implemented or explicitly rejected,
  never silent).
- **The capability publishes recognition prefixes only** (the `void:uriSpace` values), not the
  internal `{pathPrefix, container, suffix}` mapping — the 303 stays the resolution mechanism.

---

## 1. Scope, shape, and hard constraints

**One branch** (working name `la3d/lws-nextfork`) off `la3d/lws @ 16530a1`, tasks ordered
security-first: Cluster 1 (sidecar authz) → Cluster 3 (federation guard) → Cluster 2 (PATCH) →
Cluster 4 (capability). If the round stalls, what is already on the branch is the
highest-value half; the sole behavior-changing cluster (PATCH) gets review attention late, on an
otherwise-stable branch. One merge `--no-ff`, one rig repin, one live sweep.

**Hard constraints (all standing project rules, restated as this round's invariants):**
- **P13 neutrality:** every change is substrate-neutral (authz, PATCH, SSRF, capability shape).
  Nothing wiki-specific enters the fork.
- **Legacy byte-identity:** non-`--lws` pods see zero behavior change. The legacy PATCH path
  (JSON-LD-document projection) must remain byte-identical when `lwsEnabled` is false — same
  discipline the fork-review round proved with `n3-patch.js` untouched.
- **No-oracle:** listing-filter denials HIDE (never 401); direct-GET denial responses stay
  unified with not-found where that is the existing convention.
- **Teaching surface:** every new rejection carries a problem+json body that tells the client
  what to do instead (the 406/400 house style); 405s carry `Allow`.
- **Choke-point discipline:** write-path rules live in `applyLwsWrite`/its gate, shared by ALL
  write surfaces (HTTP PUT `resource.js:2054-2061`, HTTP POST `container.js:160`, MCP
  `write_resource`/`create_resource`/`put_typed_resource` `src/mcp/tools.js:54-62,:89-97,
  :371-375`, and — after this round — PATCH). Middleware-only guards that MCP bypasses are the
  bug class this project keeps re-fixing; do not add another one.

---

## 2. Cluster 1 — sidecar authz completion (security)

### 2a. Member `.meta` writes require WRITE on the stripped subject

The `.meta` dispatch branch (`src/auth/middleware.js:134`) is GET/HEAD-scoped; writes fall
through to the blanket check (`:143-209`), which resolves WRITE against the `.meta`'s own path →
container-default ACL. Fix:

- Widen the branch to all methods. `authorizeSidecarAccess` (`:577-598`) gains a `mode`
  parameter (today hardcoded `AccessMode.READ` at `:596`): READ for GET/HEAD, WRITE for
  PUT/PATCH/DELETE — always checked on the **stripped subject**.
- The existing trailing-slash derivation (`:584-585`) maps `/foo/.meta` → `/foo/` (the
  container), so **container `.meta` governance stays writable by container controllers** — the
  recorded intent from `16530a1` survives with zero extra code. Only member `.meta`
  (`/foo/bar.meta` → subject `/foo/bar`) tightens.
- Exploration-verified safety: NO server or admission path writes a member `.meta` through
  `authorize()` — `admit()` only READS `.meta` (`src/lws/admission.js:32`; no `storage.write` in
  the file); all server sidecar maintenance calls `storage.write` directly
  (`src/lws/write.js:44,:58,:59,:76`) and bypasses HTTP authz entirely. The only affected party
  is a delegated container-writer without member-write — exactly the boundary being moved.
- `.acl` handling is untouched (`:94` — CONTROL on the protected resource, all methods, already
  correct).

### 2b. Listing filter resolves sidecar entries via the stripped subject

`filterReadableEntries` (`src/lws/authorized-listing.js:10-47`) has the asymmetry: `name.acl`
gets a stripped-subject CONTROL check (`:28-34`, correct), but `name.meta` — and everything else
— falls to the `else` branch (`:35-43`): READ on the entry's OWN path → container default → a
private member's `.meta` name leaks into anonymous listings. Fix:

- Add a stripped-subject branch for the remaining `AUX_SUFFIX` sidecars
  (`src/storage/filesystem.js:8`): `name.meta` → READ on the stripped subject, mirroring
  `authorizeSidecarAccess`. `name.lwstypes`/`name.lwsprov` get the same check for
  defense-in-depth (they are currently saved only by the render-hide `SYS_SIDECAR` filter,
  `src/ldp/container.js:16,:42-52,:114` — S1 itself passes them today).
- **DT7 preserved:** sidecars stay *listed* (with correct mediaTypes) whenever the viewer holds
  READ on the subject; the fix changes *which ACL* filters them, it does not hide them. Bare
  container `.meta`/`.acl` behavior unchanged.
- Filter-only = no oracle: a denied entry disappears from `items[]`; nothing 401s.
- All three S1 call sites inherit (`src/handlers/resource.js:580-582,:1682`,
  `src/mcp/resources.js:115`).

### 2c. System-Managed sidecars become server-only; dispatch unified

`*.lwstypes`/`*.lwsprov` are server-derived records (type index, earned-`conformsTo`
provenance). Clients must not write them — today they can, gated only on READ (§0). Fix, two
parts:

- **Reject client writes at the write choke point.** The reserved-suffix rejection lives in the
  write-consistency gate (`src/lws/write-consistency.js`, runs inside `applyLwsWrite` for every
  caller — HTTP PUT/POST, all three MCP write tools, and PATCH after Cluster 2·§3a). HTTP
  surfaces map it to **405 + `Allow: GET, HEAD`** + a teaching problem+json ("System-Managed
  sidecar; maintained by the server — read it, don't write it"); MCP tools surface the same text
  as a toolError. DELETE does not flow through `applyLwsWrite` (`handleDelete`; MCP
  `delete_resource` `src/mcp/tools.js:104`) — both get a small mirrored guard. *Note this is a
  strengthening of the section-presentation wording ("one check in the authorize-dispatch
  region"): a middleware-only guard would have left the MCP write tools able to overwrite
  sidecars — the exact bug class §1 forbids. Rejection semantics are unchanged; only the choke
  point is corrected.*
- **Unify the dispatch:** the `:107` branch becomes GET/HEAD-scoped like `.meta`
  (READ-on-stripped-subject for reads; writes proceed to the blanket check and are then refused
  at the choke point — the transient authz-before-405 ordering is acceptable, and the invariant
  is what matters: **no client write path can mutate a System-Managed sidecar**). This closes
  the original "cosmetic" asymmetry as a side effect.
- Server-side maintenance (`storage.write` direct) and git/filesystem-seeded sidecars are
  unaffected by construction.

---

## 3. Cluster 2 — PATCH at the choke point + patch-family conformance

### 3a. All PATCH branches route final bytes through `applyLwsWrite`

`handlePatch` (`src/handlers/resource.js:2342-2640`) keeps its three branches — Turtle-family
dataset patch (write at `:2321` inside `patchTurtleFamilyResource` `:2274-2336`), legacy
Turtle-in-JSON SPARQL fallback (`:2515`), JSON-LD document (`:2616`) — but each replaces its
direct `storage.write` with `applyLwsWrite` (`src/lws/write.js:15-83`, request-agnostic by
design: takes final `content` bytes + `contentType` + `storagePath`).

- **contentType = the resource's own effective type, never the patch media type.** Turtle-family
  branch passes the stored RDF type; merge-patch/JSON-LD branches pass the effective JSON-LD
  type. (Passing `text/n3`/`application/merge-patch+json` would misfire `subjectTypesFromBody`
  and the gate.)
- **Effects, in order (all from existing `applyLwsWrite` machinery):** write-consistency gate
  (`write.js:21-22` — trivially satisfied for an existing name/type-consistent resource, and now
  also carrying the §2c reserved-suffix rejection); SHACL admission (`:29-42`) — **the
  deliberate behavior change: a PATCH whose result violates the container shape → 400
  problem+json** (admission floor holds on every write surface); `.lwstypes` re-derivation
  (`:50-59` — the recorded staleness seed dies); `.lwsprov` earned-`conformsTo` refresh on
  re-admission (`:72-79`).
- **Legacy parity:** with `lwsEnabled` false, `applyLwsWrite` degrades to gate-noop + plain
  `storage.write` — the plan must pin legacy PATCH responses byte-identical (suite already
  covers the legacy path; grow it if a case is missing).
- **PATCH-on-nonexistent (creation) semantics are NOT changed by this round** — the plan pins
  current behavior with a test first, whatever it is, and preserves it through the refactor.
- Response codes preserved (200/204 on success); the new 400 surfaces only on admission-reject,
  with the gate's standard problem+json (`instance` = the resource URL).

### 3b. Dataset-patch helpers rehome to `src/patch/dataset-patch.js`

The term-level helpers in `resource.js` — `termFromId` (`:2212-2216`), `termFromPatchObject`
(`:2218-2245`), `applyPatchToDataset` (`:2247-2263`), plus the `N3DataFactory` destructure and
lead comment (`:2192-2210`) — move to `src/patch/dataset-patch.js` beside `merge-patch.js` /
`n3-patch.js` / `sparql-update.js`. The orchestration wrapper `patchTurtleFamilyResource` stays
in `resource.js` (it uses the module's `storage`/conneg singletons). Module-scope dependencies
(`toDataset`, `datasetToFormat`, `QUADS_OUTPUTS`, `RDF_TYPES`) thread as imports/params. Pure
move — behavior byte-identical, existing suite pins it.

### 3c. N3-Patch conformance (three gaps, all exploration-confirmed)

- **Wire `validatePatch`** (`src/patch/n3-patch.js:500-512`, imported at `resource.js:10`,
  called nowhere): a delete of a non-existent triple → **409** (Solid N3-Patch: deletions that
  do not match existing data MUST fail) instead of today's silent no-op filter
  (`deleteTriple` `:305-336`). The newer dataset path gets an equivalent existence check in
  `applyPatchToDataset` (independently a silent no-op by construction, `:2248-2250` comment) so
  both branches agree. Behavior change, spec-required.
- **Implement `solid:where`** (parsed into `result.where` at `n3-patch.js:50-53`, then never
  read): single-solution semantics — bind the where variables against the target graph; exactly
  one solution → substitute into deletes/inserts and apply; zero or multiple solutions → 409.
  Partial machinery exists (`resolveValue` already returns variable markers `:254-257`).
  **Floor if implementation reveals a swamp:** reject any patch carrying `solid:where` with a
  teaching 409 — a conditional patch applying *unconditionally* (today's behavior) is the one
  outcome that must not survive the round. Never silent.
- **Blank-node SUBJECTS in the JSON-LD path:** `applyN3Patch`'s `insertTriple` uses the subject
  directly as `@id` (`:351-354` — a `{blankNode}` object subject produces a malformed node) and
  `deleteTriple` string-compares (`:313` — never matches). Fix = handle blank-node subjects on
  insert (mint/reuse ids) and delete (structural match). The dataset path already handles `_:`
  subjects (`termFromId`) — this is alignment of the older path, not new semantics.

### 3d. 404 `Accept-Patch` parity

`getNotFoundHeaders` (`src/ldp/headers.js:177-199`) hardcodes the narrow
`'text/n3, application/sparql-update'` (`:188`) and takes no `lwsEnabled`. Add the param, reuse
the same lws-aware widening the 200 path gets (`getAcceptHeaders` via `getResponseHeaders`
`:54-89`), and thread it through all three 404 call sites (`resource.js:363,:1584,:2123`) — a
`--lws` pod advertises merge-patch consistently on 200 and 404.

---

## 4. Cluster 3 — federation guard completion

### 4a. IPv6 range widening in the ONE shared table

`src/utils/ssrf.js:60-67`: `fc00::/7` was correctly range-widened (`/^f[cd]/i`) but link-local
and multicast stayed literal-prefix. Fix in place:

- `/^fe80:/i` → `/^fe[89ab]/i` — the full `fe80::/10` (first hextet `fe80`–`febf`; today
  `fe81::`…`febf::` all pass the guard).
- `/^ff00:/i` → `/^ff/i` — the full `ff00::/8` (first hextet `ff00`–`ffff`; today every
  operationally-real multicast form — `ff02::1` all-nodes, `ff02::2` all-routers, `ff05::`,
  `ff0e::` — slips past; only the reserved `ff00::` literal is caught).

Both consumer families inherit from the one table: the `validateExternalUrl` callers
(`idp/provider.js:32`, `auth/solid-oidc.js:277`, `auth/did-nostr.js:97`,
`auth/cid-doc-fetch.js:126`, `handlers/cors-proxy.js:315`) and the MCP wrapper chain
(`src/mcp/ssrf.js:27` → `isBlockedHost` → `read-tools.js:139`). The mapped-IPv4 path
(`embeddedV4`, `:18-27`) is unaffected. Tests: `test/mcp-federation-hardening.test.js` gains the
uncovered spread — link-local `fe81`/`fe9f`/`feaf`/`febf` and multicast `ff02::1`/`ff05::`/
`ffff::` (today: one `fe80::1` case, zero multicast cases).

### 4b. DNS pre-check on the MCP federation arm

`readRemote`'s hop loop (`src/mcp/read-tools.js:138-166`) checks only the LITERAL hostname
(`isBlockedHost`, `:139`) before `fetch` (`:145`) — while `validateExternalUrl`
(`src/utils/ssrf.js:135-160`) already does `dns.resolve4`+`dns.resolve6`+`isPrivateIP` for the
five auth/proxy callers. This is a wiring gap, not new machinery. Fix:

- After the literal gate and before `fetch`, resolve the hostname and run **every** returned
  address through the shared `isPrivateIP`/`embeddedV4`; any private hit → the same
  "federation blocked" toolError. Placed inside the loop, every redirect hop gets it for free
  (`target = new URL(loc, target)` re-enters at `:162`).
- Skip resolution when the hostname is already an IP literal (the literal gate covered it).
- **Honors the same `allowPrivate`/`ctx.federationPrivate` opt-out** — the local rig
  (`pod.vardeman.me → 127.0.0.1` in `/etc/hosts`, `--lws-federation-private`) must keep working;
  a live-gate case pins this.
- Resolution failure = block with a distinct teaching message (fail-closed; a host that doesn't
  resolve can't be fetched anyway).
- **Recorded residual (unchanged scope contract):** connect-time TOCTOU rebinding remains
  out-of-scope (would need an undici dispatcher with a pinned-lookup `connect`; the global
  `fetch` here takes no dispatcher). The window shrinks from "never resolved" to "resolved per
  hop at request time"; the in-code scope comment (`src/mcp/ssrf.js:8-17`) is updated to say
  exactly that.

---

## 5. Cluster 4 — structured `uriSpace` on the ReferentResolution capability (+ riders)

### 5a. The capability gains a recognition field

`buildStorageDescription` (`src/lws/storage-description.js:62`; capability pushed `:141-148`) —
the ReferentResolution capability is `{type, hint}` today; the builder's own established
pattern for structured data is plain sibling keys (`linkset` `:112-126` carries
`mediaType`+`conformsTo`+`hint`; services carry `serviceEndpoint`). Fix:

- Add ONE sibling key: `uriSpace: [<absolute prefix>, …]` — exactly the `void:uriSpace` values,
  one per pod-config `uriSpaces` entry (read at `server.js:1077` / `mcp/index.js:247`;
  entry shape `{pathPrefix, container, suffix?}` per `referent-resolver.js:6-17`), in the same
  absolute-authority form the pod's VoID document publishes. **Prefixes only** — the internal
  `container`/`suffix` mapping is not advertised; the 303 stays the resolution mechanism
  (approved decision, §0).
- The hint sentence is updated to point at the sibling field ("the `uriSpace` values below…")
  so prose and data can't drift.
- Both surfaces inherit from the one builder (HTTP `server.js:1077-1079`, MCP
  `mcp/resources.js:72-76`); with the flag off, the document stays byte-identical (`:149`
  guard unchanged).
- Skip malformed entries with the same defensive rules `resolveReferent` applies (`:13-17`) so
  the capability never advertises a prefix the resolver would refuse.
- Closes cold-probe finding #2: an agent recognizes minted IRIs on its FIRST request to the
  storage description instead of confirming the prefix from VoID two hops later.

### 5b. Riders (lws-pod, after merge)

- **Rig repin:** `Dockerfile.fork` / `docker-compose.fork-tls.yml` → the merge SHA, image
  `lws-pod:fork-nextfork`; data volume preserved.
- **Makefile bind fix:** the publish `--bind /alice/concepts/` target updates to
  `/alice/wiki/` — the VoID-consistent plane the referent round pinned (the recorded
  pre-existing inconsistency; one line, rides with the repin).
- **Live gates grow** (existing suites, new cases): structured `uriSpace` present + equal to
  the VoID values (`tests/lws-referent.test.mjs`); anonymous listing of a public container does
  NOT contain a private member's `.meta` name, owner listing DOES (DT7); member `.meta` write
  without member-WRITE → denied, container `.meta` write by controller → allowed;
  `PUT <x>.lwstypes` → 405 with `Allow: GET, HEAD` (HTTP) and MCP write toolError;
  shape-violating PATCH on a governed resource → 400; `rdf:type`-mutating PATCH → `.lwstypes`
  fresh (type-search finds the new type); N3-Patch delete-of-nonexistent → 409; federation
  read on the rig still green under `--lws-federation-private`.

---

## 6. Error handling & teaching conventions

- Every new rejection is problem+json in the house teaching style: what was refused, why, and
  what to do instead. 405s carry `Allow: GET, HEAD`. Gate rejections keep `instance` = the
  resource URL.
- No-oracle invariants: S1 filtering hides, never 401s; the sidecar direct-GET denial shape
  established by `db9cdaa`/`16530a1` is not altered; the 303 resolver's 404-hide is untouched.
- Fail-closed defaults throughout: unresolvable federation hostname → blocked; malformed
  pod-config `uriSpaces` entry → skipped (capability and resolver agree on what "malformed"
  means); `solid:where` never silently ignored.

---

## 7. Verification & round mechanics

- **TDD per task**; each task lands red-green on the branch with the full relevant suite green.
- **Fork close:** full fork suite green (baseline 1587/0 at `16530a1`; the 1 recorded skip and
  the isolated `mcp-lws-read` open-handle file remain pre-existing) → merge `--no-ff` into
  `la3d/lws` → push.
- **Rig close:** repin (§5b) → rebuild `make up-fork-tls` → **full live sweep** (all existing
  gates: lws, l3, typeindex, indexed-relation, graph, conneg, void, preservation, mcp-v2,
  projection, app, wiki, referent, dcat, profiles) + the grown gates, spaced ~40s for the
  anonymous rate limiter (standing gotcha, not a defect).
- **No cold probe this round:** the two cold-relevant surfaces (capability shape; resolver
  behavior unchanged) are covered by targeted live-gate growth — the same stand-in precedent
  the debt-drain round recorded. The next cold probe rides a round that changes the cold
  discovery path itself.
- **Per-task review discipline** as established: spec+quality review per task; an adversarial
  review pass on Cluster 1 (authz) and 3a (the behavior change) at minimum; final whole-branch
  review before merge.

---

## 8. Out of scope (recorded, not silently dropped)

- **Leaf-vs-edge-bearing types** (cold-probe finding #1) — the one seed needing new indexing
  machinery (no relation/edge index exists; §0). Its own design round.
- **Connect-time DNS pinning** (TOCTOU rebinding residual) — recorded in the updated scope
  comment (§4b); needs an undici dispatcher thread-through nobody needs yet.
- **NAT64 / IPv4-compatible-address ranges** — the debt-drain WON'T-FIX stands unchanged.
- **Console-on-fork rewire** — next after this round per the recorded order (FOLLOWUP
  2026-07-13); independent of this branch.
- **Remaining lws-pod config items** (plural-binding AND-vs-OR fixture) — after the fork round,
  per the same order. (The Makefile bind fix rides now only because the repin already touches
  the rig files, §5b.)
- **`getNotFoundHeaders` beyond `Accept-Patch`** — no broader 404-header rework; only the
  recorded parity gap.
