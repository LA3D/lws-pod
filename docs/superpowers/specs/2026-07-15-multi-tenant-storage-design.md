# Multi-tenant storage — design

**Status:** design of record (2026-07-15, brainstorm-approved). Successor to the scoping note
`docs/design-notes/multi-tenant-storage.md` (pre-brainstorm grounding). Round: brainstorm → **spec**
→ plan → implement. Sequenced before the curator round (Chuck, 2026-07-15).

**Trigger.** Chuck, post-navigator-round: *"I'm a bit worried our design has broken the multi-user
nature of the pod."* The session assessment: the **mechanics are multi-user-clean; the
discovery/identity layer is single-tenant-shaped**, and the navigator round made that framing
human-visible. This spec makes the identity layer per-storage.

**Standing assumption (Chuck, 2026-07-15): no one uses this system yet but our experiments.** So the
round carries **zero backward-compatibility obligation** — reseed freely, no dual-serve, no
grandfathering, no legacy aliases retained for old clients. `make reset` is the migration.

---

## 0. Grounding — the LWS user model (verified against `.claude/skills/lws-protocol`)

LWS has **no "user" and no "account."** It models two orthogonal axes:

- **Agents** (identity). An access token's `sub` claim MUST be *"a URI identifying the agent"*
  (`lws10-core/Authorization.html` §token-exchange-response). Agent IDs are minted by the four
  authn suites (OpenID / SAML / CID / did:key). An agent is a URI-named actor — human, bot, or app.
- **Storages** (authorization / organization). A storage is an OAuth **protection realm** / token
  `aud` and a self-describing organizational unit — not a person. `type: Storage` with an `id` that
  identifies the storage (`lws10-core/Discovery.html`).

**Ownership is not a storage-layer relationship.** Nothing in the core vocab
(`lws10-vocab/vocabulary.yml`) links a storage to an agent; `sec:controller` scopes a
verification-method, not a storage. Who owns a storage is a WAC `acl:Control` fact plus deployment
convention. The `createAccount → createPodStructure` 1:1 (user→pod) is a **JSS convention, not a
spec constraint** — the storage↔agent relation is many-to-many by design.

**Path-scoped storages under one origin is spec-canonical.** The core 401 example is
`realm="https://storage.example/storage_1"` with its description at `/storage_1/metadata`
(`lws10-core/Authorization.html`). Multiple storages under one origin, each with its own
description / realm / aud, is the intended model. Audience validation requires the token `aud` to
identify *"the storage server which logically contains the target resource"* — so the server already
must resolve **which storage owns a resource**.

**The storage root can be parentless cleanly.** `rel=up` is a MUST only on **non-root** resources
(`lws10-core/logicalresourceorganization.md`). A pod root emits no `rel=up`, making it a true LWS
storage root even though `/` sits above it in the URL tree. Containment is metadata-expressed
(`rel=up` + `items`), **not** path-expressed — *"clients SHOULD NOT assume that URI structure
reflects containment."*

**Spec-internal tension, and its resolution.** Core Authorization wants per-storage realms
(`realm=…/storage_1`); the LWS-CID suite requires `aud` = the **server origin** (`lws10-authn-ssi-cid`,
FPWD §4). These pull opposite ways. Resolution: **keep the auth realm/audience origin-scoped
(CID-conformant, WAC does per-resource access); make only the description/discovery/identity layer
per-storage.** The token layer is out of scope.

---

## 1. Decisions

| # | Decision | Rationale |
|---|---|---|
| D1 | **Description/identity layer becomes per-storage; auth realm/audience stays origin-scoped.** | Keeps the token/validation subsystem (CID `aud=origin`, token exchange) entirely out of the blast radius; WAC already does per-resource access. |
| D2 | **Each JSS named pod (`/alice/`, `/bob/`) is an LWS storage root. `/` is a server index** (non-storage) listing WAC-visible storages. A single-user *root-pod* deployment keeps `/` as its one storage. | Reuses `createPodStructure`'s existing boundary; matches Solid multi-pod servers; mechanics already per-pod-clean. |
| D3 | **`createPodStructure` stamps `lws:Storage` on the pod root's `.meta`** = the self-describing, agent-readable marker (source of truth). Resolution: **first path segment → verify marker (cached)**, pure walk-up as fallback. Pod root emits **no `rel=up`**. | Self-description thesis (P13) — tenancy is data, not a hardcoded path rule; cheap per-request; spec-faithful root. |
| D4 | **Each storage's description is a dedicated pod-scoped resource** (`/alice/lws-storage`, `application/lws+json`), advertised by `Link rel="…lws#storageDescription"` on every GET/HEAD under `/alice/`. It **doubles as the per-storage config surface** (services + uriSpaces). | Spec: description URI is free-form, Link-discovered. `.well-known` is RFC 8615 origin-only, so a per-pod well-known is illegitimate. |
| D5 | **`/.well-known/lws-storage` becomes a server-index resource** whose `id` is the server (not a `Storage`); **`/.well-known/void`** becomes a server-level aggregate. | `.well-known` is origin-scoped; the server still needs an entry point + roster. |
| D6 | **Per-storage uriSpace prefixes.** alice's `/id/` re-mints to `/alice/id/` (declared in her description); the 303 referent resolver reads the **owning storage's** config via D3. Bob independently gets `/bob/id/`. **Reseed** regenerates cards. | Removes the server-root namespace grab; bob can mint his own names. |
| D7 | **`createPod` takes a visibility flag.** Rig demo: **alice = public-read root, bob = owner-only private.** The server index is **always WAC-filtered**. | Proves the filtering (§acceptance); a real multi-user deployment must be able to not leak the roster. |
| D8 | **Navigator stays profile-blind (P13).** Breadcrumb root = the resource's **owning storage root**; `/?view=nav` renders the **server index**. Data-source + chrome changes only. | The navigator reads self-description; re-scoping it is not a rebuild (`docs/design-notes/lws-navigator.md`). |

---

## 2. Resource shapes

**Pod-root `.meta` (marker).** `createPodStructure` adds `lws:Storage` to the pod root's type set
in `<root>.meta`. A container is a storage root iff its `.meta` carries this type. (Additive — the
container stays an `lws:Container`.)

**Per-storage description `/alice/lws-storage`** (`application/lws+json`):
```json
{
  "@context": "https://www.w3.org/ns/lws/v1",
  "id": "https://pod.vardeman.me/alice/",
  "type": "Storage",
  "capability": [ /* ReferentResolution w/ uriSpace ["…/alice/id/"], profile-conneg — per-storage */ ],
  "service": [
    { "type": "StorageDescription", "serviceEndpoint": ".../alice/lws-storage" },
    { "type": "TypeIndexService",   "serviceEndpoint": ".../alice/types/index" },
    { "type": "TypeSearchService",  "serviceEndpoint": ".../alice/types/search" },
    { "type": "VoidService",        "serviceEndpoint": ".../alice/void" },
    { "type": "McpService",         "serviceEndpoint": ".../mcp" }
  ]
}
```
Service endpoints scope to the storage's tree. MCP stays a server endpoint (origin-scoped auth) but
its resource/tool surface filters to the addressed storage.

**Server index `/` (and its `/.well-known/lws-storage` alias)** — NOT a `Storage`. A server-index
document (own media type or `lws+json` with a distinct `type`, e.g. `ServerIndex`) whose body is the
WAC-filtered list of storage roots, each pointing at its own description.

---

## 3. Blast radius (both repos)

### Fork (`la3d/lws`) — heavy

| Surface | File (anchor, navigator-round) | Change |
|---|---|---|
| Storage-owner resolution | new `src/lws/storage-resolver.js` | `storageRootFor(resourceUrl)` → first-segment + `.meta` marker check (cached); walk-up fallback. The one function every surface below calls. |
| Description URL | `src/lws/storage-description.js:12` `storageDescriptionUrl()` | Return the **owning storage's** `/…/lws-storage`, not `${origin}/.well-known/lws-storage`. Drop the "Single-storage assumption (L2)" comment. |
| Description generator | `src/lws/storage-description.js:44,84` `generateStorageDescription` / `buildStorageDescription` | `id` = storage root URL (not `${origin}/`); services pod-scoped; per-storage uriSpaces/config. New `buildServerIndex(origin, storages)`. |
| Config inputs | `src/lws/storage-description.js:67` `resolveStorageDescriptionInputs` | Read the **owning storage's** pod-config, not the one global. |
| Link header | `src/ldp/headers.js:153` (single choke point) | Emits the owning storage's description URL — automatic once `storageDescriptionUrl` is per-storage. |
| MCP link + surface | `src/mcp/read-tools.js:59`; `src/mcp/resources.js:53` (`storageRoot`) | Per-resource description link; `storageRoot` resolved per addressed resource, not `${origin}/`. |
| Well-known route | `src/server.js:1071` | Serve the **server index** (roster) at `/.well-known/lws-storage`; add per-storage `/{pod}/lws-storage` route. |
| Referent resolver | `src/lws/referent-resolver.js` (`uriSpacePrefixesFor`, `resolveReferent`) | uriSpaces read from owning-storage config; prefixes pod-scoped. |
| Navigator chrome | `src/navigator/views.js:27` `crumbHtml`; root/server view | Breadcrumb root = owning storage root; `/?view=nav` = server index. |
| Provisioning | `src/handlers/container.js:241` `createPodStructure`; `--subdomains` guard `src/server.js:131` | Stamp `lws:Storage` marker; accept a visibility flag → root ACL public-read vs owner-only. `--subdomains`+`--lws` stays refused. |

### lws-pod

| Surface | Change |
|---|---|
| Per-storage pod-config | Each storage's description carries its config; `--lws-config` becomes the provisioning **template/default**. |
| Reseed | Two tenants: alice (public, existing wiki) + bob (private, his own wiki bind + `/bob/id/`). |
| uriSpace re-mint | alice `/id/` → `/alice/id/`; projector regenerates cards. |
| Rig | `Dockerfile.fork` / compose repin to the merge; `make reinstantiate` per storage. |
| Gate | `make test-multitenant` (new); full existing sweep stays green on alice. |
| Chrome | Projector-side `crumbHtml` in `apps/wiki-projector/html-face.mjs` → owning storage root. |

---

## 4. Acceptance (§5 of the scoping note)

Two pods (alice, bob) on one rig:

1. Any resource under `/bob/` emits `Link rel=storageDescription` → bob's description, whose
   `id = …/bob/`.
2. Bob binds his own wiki container to llm-wiki and mints `/bob/id/…` **without touching alice's
   config**; his referent names 303-resolve within his storage.
3. Breadcrumbs under `/bob/` never route through alice's identity; `pod ›` targets `/bob/`.
4. The navigator server view (`/?view=nav`) lists **both** storages to an agent with READ on both;
   **alice only** to anon (bob is private) — proving WAC-filtering.
5. `GET /alice/id/a` (anon) → 303 → `/alice/wiki/a.md` (re-minted prefix live).
6. The **full existing live sweep stays green on the alice storage** — no single-tenant regression
   (conneg, void, mcp-v2, referent, wiki, profiles, dcat, graph, preservation, lws, l3, typeindex,
   viewer).

---

## 5. Out of scope

- **Per-storage auth realm / audience** — realm/`aud` stay origin-scoped (CID-conformant). No token
  layer changes.
- **`--subdomains` under `--lws`** — stays refused (shape/alternate-URL resolution is path-mode-only);
  per-storage modeling is the prerequisite that *could* reopen it later, not this round.
- **Backward-compat / migration tooling** — experiments-only; `make reset` is the migration.
- **Multi-agent-per-storage sharing UX** — WAC already supports it; no new surface here.

## 6. Carried recommendations (approved unless flagged)

- Per-storage config folded **into** the description resource (D4), not a separate config resource.
- `/` dual-mode: server index in multi-user, storage in single-user root-pod (D2). The rig exercises
  only the multi-user server-index path; root-pod-as-storage is documented, lightly tested.

## Pointers

- Spec grounding: `.claude/skills/lws-protocol/references/lws10-core/`
  (`Authorization.html`, `Discovery.html`, `logicalresourceorganization.md`), `lws10-vocab/`,
  `lws10-authn-ssi-cid/`.
- Scoping note: `docs/design-notes/multi-tenant-storage.md`.
- Navigator design (reads self-description): `docs/design-notes/lws-navigator.md`.
- P13 substrate-neutrality gate: `docs/foundations/06-code-placement-audit.md`.
