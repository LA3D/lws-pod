# LWS storage layer — sourcing + architecture design

**Status: decided (design of record for the storage layer).** Captured 2026-06-29 from the design
dialogue + this session's research (three server deep-dives, the LWS landscape/spec-stability scan)
and grounded against the committed identity/contextual-memory notes. Resolves *how we obtain the LWS
storage layer* the committed work assumes, and *how the storage backend is abstracted*. Supersedes
the ROADMAP's "Phase 2 — LWS storage enrichment (deferred)" sequencing **for the storage layer
only** (see §11).

### Claim status
- **[verified]** — checked against a primary source this session.
- **[decided]** — a choice we have made; flippable, this is the current call.
- **[deferred]** — explicitly out of scope here; named where it lives.

---

## 1. What this resolves

The IRI-minting and contextual-linked-memory notes committed 2026-06-29 assume an LWS storage layer
— storage description, linkset metadata, Type Index/Search — that JSS does not provide (JSS ships LWS
*authentication*, not LWS *storage*; storage stays Solid/LDP). This doc decides two coupled
questions: **(a) build the storage layer ourselves vs adopt a native LWS server**, and **(b) how the
physical storage backend (git vs S3) is abstracted** so one framework serves both a git-on-a-
container deploy and an S3-backed cloud service.

## 2. Target and the two stacked experiments

Target **A** (from the dialogue): a *conformant LWS storage pod, used in layers* — not "an
agent-memory substrate that merely runs on Solid." The repo is a testbed for two hypotheses, and
both drive the decisions below:

- **Substrate thesis** — contextual linked memory on LWS (typed, progressively-disclosed memory over
  flat retrieval) helps agents. [hypothesis, the testbed tests it]
- **Meta thesis** [decided framing] — what gets *published* in future is **lightweight toolkits +
  specifications**, and agents (Claude Code) do the implementation. So this repo also tests
  spec→agent rapid prototyping. This is why we build from the pinned spec rather than adopt code.

## 3. The inverted-dependency finding (why the storage layer moves first)

The ROADMAP sequenced LWS storage as Phase 2, *after* the app/identity work, framed as "standards
enrichment second." The committed design shows the dependency runs the other way:

- Identity **minting** (stable subject IRIs) works on Solid/JSS today — resolve authority from the
  WebID `pim:storage`. **Not blocked.** [verified, iri-minting.md + identity.mjs]
- Identity/contextual **discovery** is blocked and needs LWS storage primitives:
  1. authority *upgrade* path → the **Storage Description** `id` (`rel="…lws#storageDescription"`);
  2. plane mapping (minted IRI → stored card) → **linkset** (`rel="up"`, `describedBy`) + type index;
  3. `contextual-linked-memory.md`'s level-3 self-description ("what the system can DO") → the
     **Storage Description** `service` set + **TypeSearch**. No Solid equivalent.

So the storage layer is the **foundation** the committed upper layers already assume — built first,
not last.

## 4. Decision — build the slice ourselves on JSS; do not adopt a native LWS server

**[decided]** Keep JSS as the base. Build the LWS discovery + metadata + search slice as our own
lightweight toolkits, fed by the existing projection write-path. Do **not** fork or depend on
tudor / lwsd / lws-server.

Options considered (this session's deep-dives):

| Option | Verdict | Why |
|---|---|---|
| **Extend JSS (toolkit)** | **chosen** | Mature; our skills + projection + SHACL proxy + app target it; clean license; projection's `.graph` already does the RDF→queryable-graph ingest a Type Index needs. We build the LWS surface. |
| tudor (Rust) | reference only | Real `lws+json`/linkset/token-exchange, but storage API **unauthenticated** (auth+WAC wired to nothing), storage description **dangling**, RDF stored as **opaque blobs** (no queryable graph), 2 commits/dormant, MIT, **zero JS reuse**. [verified @ d8a02f9] |
| lwsd + lws-server (JS) | borrow design, not dependency | Shipped core = minimal LDP CRUD; storage description sits in an orphaned, unshipped tree; lwsd adds buggy auth only; **AGPL-3.0** copyleft hazard for proprietary L2 IP (dual-license obtainable from the single author). [verified @ c7ddc38 / 6131553] |
| ebremer (Java) | watch + outreach | The only near-complete impl (all 8 modules incl. searchindex), but the **code repo is unpublished**. [verified — landscape scan] |

Two decisive facts:

1. **The Type Index is build-from-scratch on every path.** No public reusable implementation of the
   LWS `searchindex` module exists; the one complete impl (Bremer's, the module co-editor) is
   unpublished. Best leverage = `ebremer/lws-server-docs/search-type-index.md` as a porting spec
   (it resolves the spec's ambiguities into concrete endpoint shapes). [verified]
2. **The RDF→queryable-graph ingest a Type Index requires, we already have** (projection `.graph`).
   Even tudor lacks it (opaque blobs). On JSS we are *closer* to a working Type Index than a "native"
   LWS server is.

Thesis alignment: adopting an immature single-author server inherits design debt that is *not*
regenerable from spec — the anti-thesis. Building from the pinned `lws-protocol` skill with Claude
Code *is* the meta-experiment.

## 5. Architecture (layers, bottom to top)

- **JSS** — LDP CRUD, WAC, Solid-OIDC + LWS-CID, conneg, notifications, git, MCP. Protocol/auth/agent base.
- **Storage-backend seam** [decided] — resource bytes flow through a backend *interface*; the RDF /
  metadata index is **backend-independent** (it indexes by URI, leaning on LWS Resource-Identification:
  URI ⊥ containment). Two deployment profiles: **git-on-container** (JSS's git/fs, the default) and
  **S3-cloud**. Borrow tudor's `BlobStore` ↔ metadata-store split as the pattern. See §7 for the tension.
- **LWS storage toolkit** — the discovery + metadata + search slice, as small modules fed by the
  projection write-path, built in two tranches by spec maturity:
  - **Tranche 1 (FPWD-stable):** Storage Description resource (+ `service` set + `rel=storageDescription`
    header) and linkset metadata (`rel="up"`, `describedBy`). Unblocks the committed identity/self-
    description work.
  - **Tranche 2 (ED-volatile, isolated):** Type Index / Type Search — the CNF `?type=` core only;
    optional extensions (negation/ordering/text) behind a capability flag; endpoint shapes behind an
    adapter so a spec rev regenerates **one** module. Port from the Bremer design doc.
- **Identity / discoverability** — `resolveStorageAuthority(webid|resource)` reads the storage
  description (today: WebID `pim:storage`; upgrade: LWS storage description `id`); plane mapping via linkset.
- **Contextual memory** — cards-over-data-objects; three-level self-description; Tier-2 Comunica
  link-traversal closes the loop to live data.

## 6. The spec→agent-regeneration loop (meta-experiment)

**[decided framing]** The grounded `lws-protocol` skill (pinned to an upstream SHA) is the source of
truth. The implementation is **regenerable**: on a spec rev, bump the skill's SHA and regenerate the
affected module. The Tranche-2 adapter boundary is engineering hygiene that *scopes* regeneration —
not a hedge against churn. Spec churn is the **test condition**, not a risk to design around. Build
to the current `searchindex` ED; the FPWD modules (core, the four auth suites) are stable to build
against now. [verified — landscape scan: core+auth FPWD Mar/Apr 2026; notifications + searchindex ED-only]

## 7. Storage backend — the JSS-vs-S3 tension

- **git-on-container profile:** JSS as-is (git-backed). Provided by the base, no new work.
- **S3-cloud profile:** JSS cannot host resource bytes in S3 — its storage is a filesystem tree +
  git, not pluggable, no S3 config (would require forking). [verified — conformance map; jss-server docs]
  Two sub-options, **[deferred decision, recorded]**:
  - **(i) blob-broker beside JSS** — cards/RDF + a metadata/pointer resource live on JSS; large
    `DataResource` bytes live in S3; the toolkit brokers read/write. Keeps JSS intact.
  - **(ii) own the resource store** — the toolkit owns the resource read/write path behind the
    backend interface (git/fs vs S3), using JSS for protocol/auth/MCP only. Larger intervention,
    closer to a from-scratch server for the cloud profile.
- **Principle [decided]:** keep the backend behind an interface so git-container and S3-cloud are
  *deployment profiles, not an architectural fork*, and keep the RDF/metadata index backend-
  independent. Which sub-option (i vs ii) the S3 profile takes is deferred until an S3 use case is concrete.

This also keeps the "server-agnostic L2" claim honest **by construction** (design to the LWS
contract) rather than by assertion — the mistake the earlier framing made.

## 8. How it sits on the existing IP

- **`projection/` `.graph`** — the RDF-ingest a Type Index needs. Extend it to also feed the type
  index and capture metadata links at write.
- **`constrained-container/`** — the proven sidecar / write-funnel. Admission already intercepts every
  write — the natural place to capture linkset metadata and index types. The storage toolkit extends it.
- **Plan 2 reframe** — thread `resolveStorageAuthority` onto a *real* storage-description resource
  instead of the `urn:okf:base/` placeholder in `base-profile.mjs`.
- **Write-funnel stays mandatory** — the "one write-path, three consumers" coupling: a write that
  bypasses the proxy is missed by the index / linkset / `.graph`.

## 9. Components (each: purpose · interface · deps)

- **storage-description** — emit the Storage Description resource + `service` set + `Link` header.
  In: pod/profile config + advertised services. Out: `lws+json` storage description. Deps: JSS conneg.
- **linkset** — emit per-resource linkset (`rel="up"`, `type`, `describedBy`). In: resource +
  container membership. Out: `application/linkset+json`. Deps: admission proxy (capture at write).
- **type-index / type-search** (adapter-isolated) — CNF `?type=` over the projection graph,
  authz-filtered per request. In: `.graph` + requester auth. Out: `lws+json` TypeIndex / ContainerPage.
  Deps: `.graph`, WAC.
- **storage-backend interface** — read/write resource bytes. Impls: git/fs (JSS), S3. Deps: deploy config.
- **identity policy** (Plan 2) — `resolveStorageAuthority` + `makeIdentityPolicy`. Deps: storage description.

## 10. Open questions / deferred

- **[open — verify in Tranche 1]** Confirm from the `lws-protocol` skill: (a) the storage backend is
  out-of-scope / location-independent (strong prior; citation unconfirmed — the spec-mining agent was
  stopped); (b) whether the storage description offers a blessed external-storage / delegation hook
  that would make S3-delegation spec-grounded rather than improvised.
- **[deferred]** S3 profile sub-option (i blob-broker vs ii own-the-store) — until the S3 use case is concrete.
- **[deferred]** `lws+json` `items[]` container representation — not needed by the identity/discovery
  work; the contextual-memory query path rides Solid containers + `.graph`. Separate conformance piece.
- **[deferred]** Agent-identity trust seam (`did:webvh` / VC / ODRL) — recorded in `trust-seam-agent-identity.md`.
- **[deferred]** Notifications mechanism (LWS Webhook vs JSS WebSocket) — CDC rides JSS WebSocket today; LWS-conformant webhook is a later port.
- **[action]** Reach out to Erich Bremer about releasing / collaborating on the `searchindex` impl.

## 11. Sequencing (re-sequences the ROADMAP)

The storage layer moves to first, stable-modules-first:

1. **Tranche 1** — storage description + linkset. Unblocks the committed identity/self-description work.
2. **Plan 2** — profile mechanism + identity policy threaded onto the storage description.
3. **Tranche 2** — Type Index / Type Search (CNF core, adapter-isolated; port from Bremer's doc).
4. **S3 backend profile** — when the cloud use case is concrete.

ROADMAP "Phase 2 — LWS storage enrichment (deferred)" is superseded by this ordering for the storage layer.

## 12. Sources [this session, 2026-06-29]

- Server deep-dives: tudor @ `d8a02f9` (Rust, MIT; unauthenticated, opaque-blob RDF); lwsd @ `c7ddc38`
  + lws-server @ `6131553` (JS, **AGPL-3.0**; minimal shipped core, orphaned discovery tree).
- Landscape: W3C **LWS Working Group** (chartered to Sept 2026); FPWD core + 4 auth suites (Mar/Apr
  2026); notifications + searchindex **ED-only**; **no reusable Type Index** (`ebremer/lws-server-docs/
  search-type-index.md` is the porting spec; Bremer's code unpublished).
- Grounded skills: `lws-protocol` (pinned), `jss-server`, `shacl-constraints`, `comunica-sparql`, `okf`.
- Committed notes: `iri-minting.md`, `contextual-linked-memory.md`, `trust-seam-agent-identity.md`;
  `docs/foundations/05-jss-spec-conformance.md`; `docs/ROADMAP.md`.
