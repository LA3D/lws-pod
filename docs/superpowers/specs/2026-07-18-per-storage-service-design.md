# Per-storage service correctness — design

**Status:** design of record (2026-07-18, brainstorm-approved). Standards-closeout item 2
(FOLLOWUP.md order-of-work). Round: brainstorm → **spec** → plan → implement. Sequenced after the
resource-server conformance round (R1–R6, fork `48cd8ae`) and before the PROF/conneg closeout
(item 3).

**Trigger.** The 2026-07-18 standards audit: the multi-tenant round made the *description* layer
per-storage but deliberately added no per-storage service *routes* (A4), so every per-storage
description advertises origin-scoped services — and one of them (`NotificationService →
/notification/api`) is a dead endpoint pinned by a test. `VoidService` was interim-suppressed
per-storage for exactly this misdirection risk. This round makes the advertised service set honest.

**Standing assumption (unchanged from the multi-tenant round):** no one uses this system yet but
our experiments — zero backward-compatibility obligation; `make reset` is the migration.

---

## 0. Grounding — the LWS service model (verified against `.claude/skills/lws-protocol`, 2026-07-18)

- **The `service` array is REQUIRED and per-storage.** Each storage description MUST carry a
  `service` set; each entry MUST have `type` + `serviceEndpoint` (`lws10-core/Discovery.html`).
  `lws:service` has `domain: lws:Storage` (`lws10-vocab/vocabulary.yml`). **There is no
  server-wide advertisement mechanism anywhere in the spec** — no storage catalog, no server
  capability document; multi-storage deployments surface only as per-storage descriptions plus
  realm scoping (`realm="…/storage_1"`, `Authorization.html`). "Uniform server-wide advertisement"
  is therefore not a conformant alternative; the JSS `ServerIndex` is and remains an extension.
- **Type Index / Type Search are per-storage services** (`lws10-searchindex/index.html`): a storage
  that supports them MUST advertise them in *its* storage description; the TypeIndex "lists the
  unique types of resources that currently exist **within the storage**"; search returns resources
  "**within a storage** … as visible to the requesting client." Results MUST be
  authorization-filtered per requesting client, unauthorized entries omitted entirely,
  `totalItems` computed over the filtered view, evaluated against *current* access — the fork's
  per-request WAC loop (`src/handlers/type-index.js`) already satisfies all of this; **the gap is
  scope, not authz.** GET and POST search MUST be filter-equivalent.
- **NotificationService advertisement carries MUSTs we don't meet** (`lws10-notifications`): the
  service object MUST include `subscriptionType` (array of supported types), and the endpoint is a
  subscription API (GET-listable subscription container, webhook delivery, signing keys). The
  fork's entry has no `subscriptionType` and its endpoint has **no route at all**; the real
  mechanism is the legacy Solid WebSocket at `/.notifications` (`Updates-Via`), which is not the
  LWS notifications API.
- **VoID is absent from LWS** (confirmed: the only literal hit is the substring in "devoid").
  `VoidService` and `/.well-known/void` are project extensions; their scoping is our design
  choice, not a conformance question.
- Spec gaps we must not invent against: `DataSharingService` is example-only (undefined);
  `TypeIndexService`/`TypeSearchService`/`TypeIndex` are defined in the searchindex module's local
  vocabulary table, not (yet) the central `vocabulary.yml`.

## 1. Current state (fork `la3d/lws` @ `48cd8ae`)

| Service | Route | Advertised (per-storage SD) | Verdict |
|---|---|---|---|
| StorageDescription | `/:pod/lws-storage`, `/lws-storage` (root-pod), well-known = ServerIndex roster | self-pointer ✓ | conformant (R1–R6) |
| TypeIndex/TypeSearch | `/types/index`, `/types/search` — `walkResources('/')`, whole server, WAC-filtered | origin endpoints in every SD | scope violation |
| NotificationService | **none** (`/notification/api` is dead; real = WS `/.notifications`) | advertised, no `subscriptionType` | dead + non-conformant; pinned by `test/lws-discovery-conformance.test.js` |
| VoidService | `/.well-known/void` 303, reads **legacy server-wide** podConfig | suppressed (`buildStorageDescriptionFor` discards the per-storage `voidPath` the route already resolves, `src/server.js:1195`) | plumbing exists, route missing |
| ProfileIndexService | pod data, absolute per-storage path | ✓ | honest extension |
| ReferentResolution cap | per-storage uriSpaces | ✓ | honest extension |
| McpService | `/mcp`, one gateway per pod | ✓ | honest extension, stays origin |

Dead code: `buildStorageDescription` (origin form, `src/lws/storage-description.js:213`) has zero
callers since R6.

## 2. Decisions (Chuck, 2026-07-18)

1. **Notifications: drop the advertisement.** Remove `NotificationService` from every storage
   description. The WS mechanism stays as-is (legacy rail, `Updates-Via` untouched). **A real LWS
   notifications implementation is recorded in FOLLOWUP as its own future round** — webhook
   subscriptions, `subscriptionType`, subscription containers, signing keys.
2. **Cross-storage surface: keep + advertise on the ServerIndex.** Origin `/types/index` +
   `/types/search` stay live (WAC-filtered whole-server walk, byte-identical behavior) and are
   advertised in an extension `service` array on the ServerIndex document, honestly hinted as
   cross-storage. Nothing dead, nothing misadvertised, cold agents keep discoverability.
3. **Per-storage route shape: Approach A** — `/:pod/types/index`, `/:pod/types/search`, mirroring
   origin naming and the `/:pod/lws-storage` reserved-name precedent (two more reserved exact
   leaves per storage; writes 405). Rejected: nesting under `/:pod/lws-storage/…` (turns a
   reserved leaf into a reserved subtree) and query-scoped origin endpoints (`?storage=` composes
   badly with the spec's `?type=` filter and GET/POST equivalence).
4. **VoID: direct pointer, no new route.** The per-storage SD advertises `serviceEndpoint =
   origin + voidPath` from that tenant's own pod-config — the document is pod data, so no
   indirection is needed (the SD is generated from the same config at request time; a 303 buys
   nothing). Hint reworded to drop the 303 language. `/.well-known/void` stays untouched as the
   legacy/root rail.

## 3. Fork design

**`src/lws/storage-description.js`**
- `assembleDescription` gains a storage-scoped mode: when building per-storage, Type Index/Search
  endpoints are `{storageRoot}types/index` / `{storageRoot}types/search`; the (kept) hint text on
  TypeSearchService is unchanged apart from scope-neutral wording.
- `NotificationService` block deleted; `notificationsEnabled` plumbing removed from the builders
  (the option itself and the WS plugin stay — they serve `Updates-Via` and `/.notifications`).
- `VoidService` restored in `buildStorageDescriptionFor`: `serviceEndpoint = origin + voidPath`
  (per-storage pod-config value already resolved by callers), hint reworded (direct document, no
  303). The interim-suppression comment and `voidPath: null` override are removed.
- `buildServerIndex` gains an extension `service` array: `TypeIndexService` + `TypeSearchService`
  at origin `/types/*` with a hint naming the cross-storage, WAC-filtered scope, plus `McpService`.
- `buildStorageDescription` (origin form) deleted.

**`src/handlers/type-index.js`**
- `authorizedTypeLists` / `authorizedResources` (and `collectAuthorizedResources`) take a scope
  root. The scope test is **owning-storage** — `storageRootFor(resource) === root` — not
  path-prefix, so a root-storage walk excludes named-storage subtrees.
- New routes: `GET /:pod/types/index`, `GET+POST /:pod/types/search` (POST for the GET/POST
  equivalence MUST). `:pod` validated via `storageRootFor`; unknown pod → plain 404,
  indistinguishable from any missing path (no-oracle). Same WAC-preHandler exemption +
  per-resource self-authz pattern as the origin routes; `sendJsonWithEtag` on GET; PUT/PATCH/DELETE
  405 (reserved-name precedent).
- Origin routes: behavior byte-identical (scope root `'/'` in the owning-storage sense is NOT
  applied to them — they keep the whole-server walk; see §5).

**Sweeps + parity**
- Repo sweep for `NotificationService` / `notification/api` stragglers: `src/navigator/views.js`,
  `src/mcp/resources.js`, `test/lws-discovery-conformance.test.js` (dead-endpoint pin replaced by
  its inverse: assert NotificationService is absent).
- MCP parity is by construction (`src/mcp/resources.js` reads the same builders), but the test
  suite asserts HTTP↔MCP service-set equality anyway — the twin-bug class has recurred four
  rounds running.

## 4. lws-pod design

- **Matrix addendum**: a new "Round 2 — services" section appended to
  `docs/superpowers/specs/2026-07-18-lws-core-requirement-matrix.md`, continuing the R-numbering
  (R7+): rows for the searchindex discovery MUSTs (advertise-in-own-SD, endpoint
  scope, GET/POST equivalence), the notification advertisement MUST (verdict: resolved by
  removal; implementation recorded as a future round), and the service-array scope model.
- **Rig repin** after fork merge: `Dockerfile.fork` **and** `docker-compose.fork-tls.yml` (the
  compose build-arg fallback shadows the Dockerfile ARG — both must move; R-round gotcha).
- **New live gate `make test-services`** on the two-tenant rig (alice public + bob private):
  - alice's `/alice/types/index` **excludes bob's public resources** — the key new invariant;
    WAC alone would admit them, only storage scoping excludes them;
  - bob-private invisible to anon on every surface (index, search, descriptions);
  - per-storage VoidService pointer dereferences to alice's own VoID document;
  - ServerIndex carries the extension `service` array; origin `/types/*` still serves the
    cross-storage view;
  - `NotificationService` absent from every description (HTTP + MCP);
  - ETag + If-None-Match→304 on the new GET routes; 405 writes; unknown-pod 404.
- **FOLLOWUP**: close the per-storage VoID residual (2026-07-16 block), record the **LWS
  notifications round** as an explicit future item, new top block pointing at item 3
  (PROF/conneg closeout) as next.

## 5. Recorded limitation (mixed root+named deployment)

If `/` is marked as a storage **and** named pods exist, the root storage's description advertises
the origin `/types/*` endpoints, whose walk is server-wide — so the root storage's index can
include named-storage resources (WAC-filtered, but out of the root storage's scope). Fixing this
would fork the origin routes' semantics by deployment mode. Mixed mode is not a deployed
configuration (the rig is named-pod; root-pod-only is the other supported mode, where origin ==
storage scope trivially), so this is **recorded, not fixed** — same treatment as the
aggregate-leak class. The limitation note lands in FOLLOWUP alongside the round record.

## 6. Acceptance

- Fork suite green including new unit/route tests (scope isolation, no-oracle 404, ETag/304, 405
  writes, GET/POST search equivalence, HTTP↔MCP parity, absence assertions).
- Full live sweep green including the new `make test-services`.
- Negative controls: `--lws`-off byte-identical; origin `/types/*` responses byte-identical for
  identical requests; `/.well-known/void` legacy rail untouched; WAC/no-oracle posture unchanged;
  per-storage description ETag behavior (R3/R4) unchanged apart from the intended body change.

## 7. Non-goals

- No LWS notifications implementation (recorded future round).
- No authorization-server work (item 4), no conformance-ledger rewrite (item 5).
- No pagination on Type Index/Search (spec allows it; the fork serves single pages today —
  unchanged).
- No per-storage MCP gateway (one gateway per pod stays).
- No change to admission, projection, profiles, or any application-layer (P13) surface.
