# Multi-tenant storage model — scoping note

**Status:** SUPERSEDED by the design of record
`docs/superpowers/specs/2026-07-15-multi-tenant-storage-design.md` (brainstorm done 2026-07-15).
Kept as the grounding trail. NOT a spec — this is the spec-grounded problem
statement + touched-surfaces map + open questions a future "multi-tenant storage" round's
`brainstorming` skill should start from. Exploratory per `docs/design-notes/` convention.
**Trigger:** Chuck's 2026-07-15 concern (post-navigator-round): *"I'm a bit worried our design has
broken the multi-user nature of the pod."* Verdict from the session's assessment: the **mechanics
are multi-user-clean; the discovery/identity layer is single-tenant-shaped**, and the navigator
round made that framing human-visible. This is a real round (brainstorm → spec → plan), sequenced
before any multi-user deployment; it can come before or after the curator round.

---

## 1. The spec's model (LWS core, grounded via `.claude/skills/lws-protocol`)

- **A storage** is the unit. *"Every LWS storage has a **storage root** that serves as the
  top-level organizational unit. The storage root has no parent and acts as the entry point for
  the storage hierarchy."* (`lws10-core/logicalresourceorganization.md`.)
- **Discovery is per-resource and per-storage:** *"All responses to GET and HEAD requests
  targeting storage resources MUST include a Link header whose target is the URI of the storage
  description resource"* (`rel="https://www.w3.org/ns/lws#storageDescription"`), and the
  dereferenced description's `id` *"MUST … identify the storage"* (`lws10-core/Discovery.html`).
  The description URI, the storage URI, and the storage root MAY be distinct or identical.
- Nothing equates a **server** with a **storage**. On a multi-user JSS server the natural reading
  is: `/alice/` is one storage, `/bob/` is another — multiple storages, one server.

## 2. What we actually built (current state, 2026-07-15, fork @ merge `9b084e9`)

**Single-tenant-shaped (the problem):**
1. **One server-scoped storage description** — `/.well-known/lws-storage`
   (`src/server.js` route, inputs via `resolveStorageDescriptionInputs` in
   `src/lws/storage-description.js`) whose `id` is the **server origin**: the whole server is
   modeled as ONE storage whose root is `/`. (Shipped in the referent/gateway rounds.)
2. **One global `--lws-config`** (`src/lws/pod-config.js`, a single pod resource declaring
   `{profileIndex, void, uriSpaces}`) — alice's config presented as the server's identity.
3. **Server-root uriSpaces**: the `/id/` prefix maps into `/alice/wiki/` at server scope — a
   namespace grab; bob cannot have his own `id/` under `/bob/`. (Referent round.)
4. **The navigator chrome entrenches the framing** (this round): `/?view=nav` renders the SERVER
   root as "the pod" (storage description + all WAC-visible user spaces in one view); every
   breadcrumb's `pod ›` segment targets the server root (`src/navigator/views.js` `crumbHtml`,
   plus the projector-side `crumbHtml` in `apps/wiki-projector/html-face.mjs`); the "profiles"
   the root view lists are alice's.
5. **`--lws` + `--subdomains` is hard-refused** (`src/server.js` guard, earlier round) — the
   subdomain-per-user model is unavailable under LWS; path-based multi-user only.
6. **Per-resource `Link rel=storageDescription` headers** point (where emitted) at the ONE
   server-scoped description, not at the owning user-space's.

**Multi-user-CLEAN already (don't re-litigate):**
- WAC everywhere, per requester: listings filtered (`filterReadableEntries`), faces mirror member
  ACLs (`mirrorAcl`), sidecars subject-scoped (L4/nextfork rounds).
- Profile binding is **per-container** (`dct:conformsTo` on each container's `.meta`) — any user
  can bind any container to any published profile; the PROF mechanism has no tenant assumption.
- The projector runs per-owner with an owner bearer; `resolveStorageAuthority` walks from the
  container, not the server root.
- One rendered consequence to note honestly: the navigator root view is now a human-legible
  directory of every user space whose root ACL is public-read — which is JSS's **default** for
  fresh pods (pre-existing `items[]` data; the navigator only renders it).

## 3. Touched surfaces (the round's blast radius — why this is a round, not a patch)

| Surface | Today | Multi-tenant shape |
|---|---|---|
| Storage description | one, `/.well-known/lws-storage`, id = origin | one **per storage** (e.g. `/alice/` described at a per-space URI); server root gets a *server index*, not a Storage |
| `Link rel=storageDescription` | server-scoped target | per-resource → the OWNING storage's description |
| pod-config (`--lws-config`) | one global resource | per-storage config resource, discovered from the storage root |
| uriSpaces / `/id/` resolver | server-root prefix → alice's container | per-storage prefixes (`/alice/id/…`); migration story for the live `/id/` mints |
| VoID / profile index / type index / search | server-scoped services | per-storage service endpoints (or parameterized) |
| MCP capability surface | server-scoped `ReferentResolution` etc. | per-storage capabilities |
| Navigator | root view = server-as-pod; breadcrumb root = `/` | breadcrumb root = the user's **storage root**; storage view per storage; server view lists WAC-visible storages |
| Face/projector chrome | `pod ›` → `/?view=nav` | `pod ›` → the storage root's view |
| Provisioning | fresh pod root ACL grants public Read on itself | decide: keep (discoverable storages) or tighten (private-by-default storages) |
| `--subdomains` refusal | hard-refused with `--lws` | re-examine: per-storage modeling may be the prerequisite that lets subdomains map cleanly to storages later |

## 4. Open design questions (for the brainstorm — do NOT pre-commit here)

1. **What marks a storage root?** Provisioning-time (every `createPod` space is a storage), a
   `.meta`/config marker, or a server config list? How does the serving path resolve "which
   storage owns this resource" cheaply on every request (first path segment is the JSS reality —
   is that good enough as the rule)?
2. **Where does a per-storage description live?** `<root>/.well-known/`-style path,
   `<root>.meta`-adjacent, or a dedicated resource advertised only by Link header? (Spec allows
   all three shapes.)
3. **What is `GET /` then?** A server-index resource (list of WAC-visible storages) with its own
   media type? The seeded landing? The navigator's server view? Does `/.well-known/lws-storage`
   remain as a server-level compatibility alias, and what does its `id` become?
4. **pod-config migration:** from the one `--lws-config` to per-storage configs — discovery
   order, defaulting, and what the flag means afterward.
5. **Referent/uriSpace migration:** the live rig has minted `/id/a` names in data (cards
   reference them). Grandfather the server-root prefix for the existing storage, dual-serve, or
   re-mint? (The no-oracle 404-hide and auth-gate exemption logic re-scopes per storage.)
6. **Service scoping:** type index / search / VoID / MCP — per-storage endpoints vs one endpoint
   taking a storage parameter; what does the LWS search/type-index module imply
   (`lws10-searchindex`)?
7. **Directory legibility:** is the anon-visible storage list a feature (federation/discovery) or
   a leak (user enumeration)? Interacts with JSS's public-read-by-default fresh-pod ACL.
8. **Subdomains:** does per-storage modeling reopen `--lws`+`--subdomains` later (subdomain ↔
   storage mapping), and is that wanted?

## 5. Acceptance shape (sketch)

Two pods (alice, bob) on one rig: each storage self-describes (`Link rel=storageDescription` on
any resource under `/bob/` resolves to bob's description with `id = …/bob/`); bob binds his own
wiki container to llm-wiki and mints his own referent prefix without touching alice's config;
breadcrumbs under `/bob/` never route through alice's identity; the navigator's server view lists
both storages to an agent with READ on both, one to anon if one is private; the full existing live
sweep stays green on the alice storage (no regression to single-tenant behavior).

## Pointers

- Spec grounding: `.claude/skills/lws-protocol/references/lws10-core/`
  (`logicalresourceorganization.md`, `Discovery.html`), `lws10-searchindex/`.
- Current implementation anchors: `src/lws/storage-description.js`, `src/lws/pod-config.js`,
  `src/server.js` (well-known route, `--subdomains` guard), `src/navigator/views.js`,
  `apps/wiki-projector/html-face.mjs` (chrome), the referent resolver (referent round,
  2026-07-13). Anchors are navigator-round-era — re-verify at brainstorm time.
- Related: `docs/design-notes/lws-navigator.md` (the navigator's design deliberately reads only
  self-description — re-scoping it is chrome + data-source changes, not a rebuild);
  `docs/foundations/06-code-placement-audit.md` (P13 — the navigator must stay profile-blind
  through this change too).
