# Read-side content negotiation by profile + profile instantiation — design of record

**Date:** 2026-07-06
**Status:** design of record. Governed by `docs/design-notes/layer-cake-principles.md` (P5/P9/**P13**),
`docs/design-notes/iri-minting.md` (the three-plane identity + the deferred read-side plane-mapping),
and `docs/design-notes/contextual-linked-memory.md` (card = context, the referent is elsewhere).
**Supersedes the read-side scope of `2026-07-06-l4b-graph-semantics-design.md`** (its §5 read-side
semantics and §7 wiki re-derivation are absorbed and reframed here); L4b Phase A (graph semantics +
the derived-view materializer) is DONE and stands as this spec's materialization engine. **Next step:**
a new session runs `superpowers:writing-plans` against this spec, then subagent-driven implementation.
Do NOT start implementation from this doc without a plan.

---

## 0. Why this exists

Three findings from the 2026-07-06 design dialogue force a read-side round that L4b's one-line
"wiki re-derived" framing did not cover:

1. **Markdown and RDF are not two serializations of one payload — they are different layers.**
   Markdown is the memory **content** an LLM agent consumes; RDF is the **links** that connect memories.
   The conversion is lossy *both* ways (prose is not in the graph; the typed edges are not fully in the
   prose). So the SHACL admission floor governs the **links**, not the content — "how is the markdown
   governed?" resolves to *it isn't, by SHACL; the RDF that links it is.* The container layer must
   **distinguish** content resources from link resources.

2. **Media-type content negotiation cannot express a lossy relationship — profile negotiation can.**
   RFC 9110 representations must be *equivalent*, and LWS makes this explicit: for container
   representations "the response payload MUST be identical regardless of the requested media type"
   (`lws-media-type.md`). Serving content-vs-links over media conneg would violate that rule. The honest
   mechanism is **content negotiation by profile** (W3C DX-PROF-CONNEG, the read/write-side companion to
   PROF — `.claude/skills/prof-conneg`): the profile names *which lossy lens* the client wants. This
   completes PROF's read side (PROF resource descriptors carry `role` + `dct:format` *precisely to allow
   content negotiation*); the pod already implements PROF governance (`isProfileOf` walk, SHACL floor)
   but skipped the read half.

3. **A profile must be instantiated when an agentic application is created.** The PROF descriptor is a
   *class*; creating an application *instantiates* it. Conneg-by-profile cannot answer "list profiles"
   or "get by profile" for a memory unless that memory's **alternate representations have been
   materialized and advertised**. L4a's onboarding recipe instantiated only the *governance* face
   (bind `conformsTo` + ACLs → SHACL). This round extends instantiation to the **read face**:
   materialize the profile's declared representations + advertise the alternate-representation facts, so
   conneg-by-profile is live for every memory in the app's containers.

**Chuck's governing statements (2026-07-06, verbatim intent):** *"Markdown is a memory content the LLM
agents consume, the RDF is meant to 'link' memory content. The LWS container layer needs to
distinguish."* — *"When the agentic application is created, the profile needs to be instantiated."*

---

## 1. Scope, phases, and the hard constraints

**One spec, three parts, phased for implementation:**

- **Phase 1 — the substrate pillar (fork):** content negotiation by profile — `Accept-Profile` /
  `Content-Profile`, linkset alternate-representation advertisement, a `capability[]` entry,
  `conformsTo` as an indexed relation, most-specific selection via the existing `isProfileOf` walk,
  and 303-by-profile (the read-side plane-mapping). Proven with a **neutral** consumer (a non-wiki,
  non-DCAT profile that declares two representations). Cold-agent probe gates it.
- **Phase 2 — instantiation + the wiki consumer:** profile-declared **representation roles**, the
  instantiation step (materialize + advertise, reusing L4b Phase A's derived-view materializer), the
  `projection/` engine demotion, and the RED+fenced wiki-memory suite re-derived as a content-rep +
  links-rep memory. Cold-agent probe #5 gates it.

**Hard constraint 1 — P13 boundary (the line that keeps conneg-by-profile neutral).** The server
*selects and serves* pre-materialized profile representations and *emits* the conneg headers — a generic
Bucket-1 affordance dispatching on profile/`altr:` data, zero application vocabulary. The **application**
(the projection engine / the onboarding agent) *materializes* the representations. **The server never
transforms markdown → RDF.** Any fork code added is Bucket 1 and application-neutral.

**Hard constraint 2 — this IS a substrate (fork) round.** Unlike L4a/L4b (fork-empty), Phase 1 adds a
fork feature. It rides its own `la3d/*` branch, additive + `--lws`-gated + proven-unchanged on the
default path (negative controls), merged `--no-ff` into `la3d/lws`, with a live gate — the L1–L3
discipline. The edit is bounded to conneg + the linkset builder + the storage description.

**Hard constraint 3 — honor what the LWS specs already fix (sanity-checked 2026-07-06, §9):**
no-oracle + authz-filtering on every discovery surface; media conneg stays lossless; `type` is
System-Managed (`.lwstypes`) while `describedby`/`conformsTo` are client-managed (`.meta`); do not
worsen the `describedby` overloading.

---

## 2. The memory shape — content-primary, links via the linkset

A **memory** is one logical thing (a concept, a dataset row, an observation) with a stable subject IRI
(`{authority}{profile-path}/{slug}#it`, iri-minting Plane 1).

**Decision: content-primary.** The memory's **canonical LWS resource is its content** — the markdown
card (`Content-Type: text/markdown`), what agents consume and what Obsidian/git clients read. Its
`items[]` listing entry therefore carries one honest `mediaType: text/markdown` (LWS requires one
mediaType per member). This keeps *one memory = one URL*.

**Links ride the linkset + a materialized links representation.** The memory's typed edges (the RDF
links) are:
- **advertised** on the canonical resource's RFC 9264 linkset as an alternate representation
  (`rel="alternate"; type="application/ld+json"; formats="<links-profile>"`, DX-PROF-CONNEG §8.2), and
- **served** by `GET <memory> Accept-Profile: <links-profile>` — which returns the links representation
  (or 303-redirects to its materialized resource; §4).

This is the "1 and 2 together" resolution: **one URL** (option 1, conneg access) whose **link
representation is a materialized, independently governed artifact** (option 2). The content face and
the link face are distinct *representations by profile*, never equivalent media types.

**Why not two independent resources:** a companion links-resource is still available where a profile
wants it (the aggregate/derived views already are separate resources), but the *default* memory is
content-primary so the listing stays honest and the agent's default GET yields consumable content.

---

## 3. Content vs links — jurisdiction

- **Content (markdown)** — consumed, not SHACL-governed. Quality is an application/agent concern
  (the vault's draft→validated maturity model), not the admission floor's. The substrate stores it as
  opaque `text/markdown` bytes and never parses it (P13).
- **Links (RDF, the links profile representation)** — this is the floor's jurisdiction. On write it is
  SHACL-validated against the profile's shape; well-formed typed edges, required links present, targets
  resolvable — the graph-navigability the whole thesis rests on.
- **The links representation is authored/materialized in flat node form** (subject = the memory's doc
  IRI `#it`, no top-level `@graph` wrapper), so the fork's admission path validates it unchanged. The
  `@graph`-descend admission hardening (L4b §1) stays a fork-queue item — needed only if a governed
  write ever arrives in graph-object form; the content-primary shape means it does not here.
- **Write-side conformance declaration:** an agent PUTting a links representation declares its profile
  with `Link: rel="profile"` on the request (DX-PROF-CONNEG §8.2 / the IETF draft's write side),
  composing with the container's `.meta conformsTo` binding and the floor.

---

## 4. Conneg-by-profile — the fork pillar (Phase 1)

Implements the DX-PROF-CONNEG **HTTP Headers Functional Profile** (`cnpr:http`) over the pod's existing
surfaces. All `--lws`-gated + additive.

- **`Accept-Profile: <uri|token>`** on GET/HEAD selects the representation conforming to a profile.
  Tokens map to URIs per PROF `prof:hasToken`; the mapping is surfaced per
  DX-PROF-CONNEG §8.2.1.2 (`Link: <…prof/Profile>; rel="type"; token="…"; anchor=<uri>`).
  **Retraction (2026-07-19 closeout, R16):** the token half of this never shipped — `prof:hasToken`
  is declaration-side metadata only; server-side selection is exact-profile-URI, no token, no
  hierarchy (`Accept-Profile` takes a URI).
- **Selection is exact-match in the fork.** The fork treats `conformsTo` as opaque (it resolves no
  profile hierarchy — verified 2026-07-06; consistent with `constraint.js`'s "inheritance is
  client-resolver semantics"), so it matches a requested profile URI exactly against a resource's
  declared representations. **Hierarchy-aware most-specific selection (`isProfileOf`) is a client
  concern** (the projection/agent layer that knows the profile chain) — keeping the fork P13-neutral.
  Independent (non-hierarchical) profiles → indicate each.
- **Response indicates the chosen profile:** `Link: rel="profile"` (+ `Content-Profile: <uri>` per the
  IETF draft). `HEAD` behaves as `GET` sans body.
- **List profiles** = `GET`/`HEAD` returns the linkset alternate-representation set: `rel="canonical"`
  (the default = content) + `rel="alternate"` (each other representation) with `type=` (media) +
  `formats=` (profile). This is the `altr:` Alternate Representations Data Model surfaced through the
  linkset the pod already generates — **not a new store**.
- **303-by-profile = the read-side plane-mapping.** When the requested profile's representation is a
  distinct materialized resource (or when the memory's `#it` name ≠ a stored resource), the server MAY
  303-redirect to it with `Link: rel="profile"` — realizing the name→resource mapping iri-minting
  deferred (§11 #4), in-band.
- **Advertised as a capability:** the storage description gains a `capability[]` entry
  `type: "…/ContentNegotiation"` (LWS Discovery's own example), naming DX-PROF-CONNEG support so a cold
  agent (and the MCP surface) can discover that the pod negotiates by profile.
- **`conformsTo` becomes an indexed relation** (the typeindex spec's named "profile-layer seam"; the
  deferred second indexed relation), so **TypeSearch answers cross-resource "which resources conform to
  profile P."** This resolves the `describedby` overloading cleanly: **`describedby` → shape (L3),
  `conformsTo` → profile (this round)**.
- **No-oracle + authz-filtered (mandatory).** "List profiles" and the alternate-representation
  advertisement reveal only representations the authenticated client may read — the same discipline the
  Type Index enforces (unauthorized entries omitted; an unindexed/unreadable profile is indistinguishable
  from one matching nothing, never an error).

Division of labor, so nothing duplicates: **linkset = per-resource affordances (incl. alternate
representations); Type Index/Search = cross-resource discovery by type/`conformsTo`; conneg-by-profile =
per-resource representation *selection*.**

---

## 5. Instantiation — profile as class, application as instance (Phase 2)

**The lifecycle, made explicit:**

```
author profile (PROF: shapes, context, REPRESENTATION ROLES)         ── data
  → publish (PUT descriptor artifacts)                                ── resolvable
  → INSTANTIATE for an app: bind container (.meta conformsTo) + ACLs
       + materialize each declared representation + advertise altr:    ── conneg live  ← the new step
  → operate: write (Link rel=profile → floor) / read (Accept-Profile → select)
```

- **Representation roles (Bucket 2, data).** Generalize L4b's derived-view declaration into
  profile-declared **representation roles**: a profile declares the representations it offers (e.g.
  `content` → `text/markdown`; `links` → `application/ld+json`; a crosswalk → another profile/format),
  each with its `dct:format` and materialization declaration (`named_graph`/`push_mode`/`mode` reused).
  A minted `lwspr` role (reuse-first, iri-minting Plane 2) with the operation contract
  *role → a profile-conformant representation the server may serve by conneg*.
- **The materializer is L4b Phase A's, generalized.** `materializeDerivedView` already reads members and
  PUTs an aggregate representation; instantiation reuses it per representation role and additionally
  **writes the `altr:` alternate-representation facts** (into `.meta`, alongside `conformsTo`) so the
  linkset/conneg surface can advertise them. **Materialization is the application's job** (P13); the
  server only serves + selects.
- **Onboarding learns instantiation.** `publish.mjs` / the onboarding recipe gains an instantiate step:
  after bind + ACLs, materialize declared representations + advertise. Manifest-driven (L4a): a new
  application declares representation roles as data; no code edit. DCAT (single representation) is the
  YAGNI baseline; wiki (content + links) exercises the plural case.

---

## 6. Engine demotion + wiki-memory re-derived (the consumer, Phase 2)

Executes L4b §6 (recorded, not done) and re-derives the fenced suite as the conneg consumer:

- **Split `projection/`** into the neutral PROF+graph mechanism (`projection/prof/`) and the wiki
  projector as application-#1 tooling (`apps/wiki-projector/`); the `okf/`-directory misnomer dies. The
  `06-code-placement-audit.md` L4b rows are executed and re-dispositioned. Naming fixed here; the plan
  may refine paths, not the neutral-vs-app boundary.
- **Re-derive wiki-memory on the decoupled floor** (not patched to the old 3-arg `cardToQuads`): thread
  the identity policy through `extract` (closes the `TODO(plan-2)` ripple); the wiki profile declares a
  **`content` representation** (the markdown card, canonical) and a **`links` representation**
  (per-memory JSON-LD named graph in flat `#it` form, SHACL-floor-governed); the aggregate graph view is
  a derived representation (`mode: dataset` for provenance-per-card). The `red-fence.test.mjs` breadcrumb
  is removed only as the suite goes green.
- **B7 identity-config vocabulary** (document-shaped → graph-shaped) is taken here, with the read-side
  leanings from L4b §5 now concrete: keep the `up`-walk contract + optional earned-at-admission member
  `conformsTo`; container `conformsTo` beats pod-wide `defaultProfile`; plural-binding = AND-compose
  validation, most-specific for conneg/context.

---

## 7. `iri-minting.md` read-side plane-mapping update (deliverable)

Amend iri-minting to close "identity decided, dereference deferred" for the read path: the subject-IRI
→ stored-resource mapping (§11 #4) is realized by **conneg-by-profile + 303-by-profile** — a client
resolves a memory by GETting its canonical URL and negotiating the profile it needs; a name that is not
itself a stored resource 303-redirects to the representation. The membership steering (linkset-only
agents enumerate members via `items[]`/TypeSearch) rides here.

---

## 8. Cold-agent affordance probes (Chuck's directive)

Same unprimed protocol (fresh sub-agent, pod URL + CA only, read-only, zero project context).

- **Probe (Phase 1, generic):** a cold agent discovers the ContentNegotiation `capability`, issues a
  *list profiles* request on a neutral memory, reads the alternate representations, and *gets by
  profile* (selects the links profile and reads the graph; selects content and reads the prose) — for a
  non-wiki, non-DCAT profile declaring two representations. Validates the pillar independent of any app.
- **Probe #5 (Phase 2, wiki):** the same walk over the re-derived wiki-memory family — consume the
  markdown content, then negotiate the links profile to traverse the typed edges; confirm the floor
  governs the links, not the content.

Frictions → surface fixes (probe → fix → re-probe), recorded as fork-queue or plan items.

---

## 9. LWS composition & the constraints honored (the sanity check, 2026-07-06)

Where each piece lands, verified against LWS core, searchindex, and the repo typeindex spec:

| Piece | LWS-sanctioned home |
|---|---|
| conneg-by-profile support | storage description `capability[]`, `type: …/ContentNegotiation` (Discovery's own example) |
| per-resource alternate representations (`altr:`) | the RFC 9264 linkset (`rel="canonical"`/`"alternate"`; `type=`+`formats=`) |
| cross-resource "conforms to profile P" | TypeSearch with `conformsTo` as an indexed relation (the "profile-layer seam") |
| content vs links at listing level | `items[]` per-member `type` + `mediaType` (MUST) |
| type derivation | System-Managed `.lwstypes`, from metadata not content |

Constraints honored: (a) media conneg stays lossless — content-vs-links is the *profile* dimension only;
(b) no-oracle + authz-filtering on list-profiles and alt-rep advertisement (searchindex discipline);
(c) `.lwstypes` (type, system-managed) vs `.meta` (`describedby`/`conformsTo`, client-managed) stay
separate; (d) `describedby` overloading resolved (shape vs profile split), not worsened.

---

## 10. Acceptance

1. **Phase 1 fork gate** — new live suite `tests/lws-conneg.test.mjs` + `make test-conneg`, against the
   fork `--lws` TLS pod, using a **neutral** profile declaring two representations: `Accept-Profile`
   selects each representation with `Link: rel="profile"`/`Content-Profile`; a *list profiles* GET
   returns the linkset alternate-representation set (canonical + alternates, `formats=`); the
   ContentNegotiation `capability` is advertised; `conformsTo` TypeSearch returns the conformant members;
   an unauthorized client's list-profiles omits unreadable representations (no-oracle); the default LDP
   path is provably unchanged (negative controls).
2. **Phase 2 wiki green** — the wiki-memory suite is re-derived (content rep + links rep) and passes on
   the decoupled floor; the red-fence test retired only as it goes green; the floor rejects a
   malformed **links** write and admits a valid one; a markdown write is stored ungoverned-by-SHACL (by
   design).
3. **Instantiation** — a profile declares representation roles as data; instantiation materializes them
   + advertises `altr:`; `publish.mjs` onboards them manifest-driven (no code edit for a new profile's
   representations).
4. **`projection/` split** executed; `06-code-placement-audit.md` L4b rows re-dispositioned; no
   application vocabulary in `projection/prof/`.
5. **`iri-minting.md`** updated per §7.
6. **Probes (Phase 1 generic + Phase 2 wiki #5)** reconstruct the memory state cold — list-profiles then
   get-by-profile.
7. **Fork stance** — the Phase-1 edit is minimal/additive/`--lws`-gated, whole-branch-reviewed, merged
   `--no-ff`, live-gated; default path unchanged.
8. **Zero regression** across all existing gates (`test-profiles`, `test-dcat`, `test-graph`, `test-l3`,
   `test-lws`, `test-typeindex`, `test-indexed-relation`, `test-mcp-v2`, projection unit suites).

---

## 11. Out of scope / deferred

- **QSA + Alternate-Keywords functional profiles** (DX-PROF-CONNEG §8.3) — the `cnpr:http` profile is
  enough for agents; QSA (human-browser) is deferrable.
- **The `@graph`-descend admission hardening** — stays a fork-queue item; the content-primary + flat-form
  links shape means it is not on this round's path.
- **Door-B typed-block body extraction** (OKF #141/#98) — the parser-role seam stays open; extraction not
  built. The `content` representation stays prose + frontmatter-derived links.
- **Write-side full profile negotiation** beyond `Link: rel="profile"` declaration — the IETF draft's
  richer write model is deferred.
- **Federation hardening, real w3id registration, operating skills** — prior deferrals stand; the probe
  trajectories seed the `linked-web-memory` skill later.

---

## 12. Grounding

- `.claude/skills/prof-conneg` — DX-PROF-CONNEG (abstract model: list-profiles / get-by-profile; the
  HTTP Headers functional profile; `altr:` Alternate Representations Data Model; token mappings) + the
  IETF `Accept-Profile`/`Content-Profile` + write-side draft.
- `.claude/skills/profiles` — PROF (`isProfileOf`, roles + `dct:format` for conneg, `prof:hasToken`).
- `.claude/skills/lws-protocol` — `lws-media-type.md` (profile-qualified media type; lossless media
  conneg), `Discovery.html` (`capability[]` + ContentNegotiation example, storage services),
  `lws10-searchindex` (Type Index/Search, indexed relations, no-oracle authz-filtering),
  `container-representation.md` (`items[]` type + mediaType), `Operations/read-resource.md`.
- `docs/superpowers/specs/2026-07-06-l4b-graph-semantics-design.md` (Phase A materializer + graph
  semantics reused), `2026-07-01-lws-typeindex-search-design.md` + `2026-07-01-lws-indexed-relation-design.md`
  (the indexed-relation seam), `2026-07-04-profile-mechanism-design.md` (PROF governance already shipped).
- `docs/design-notes/{iri-minting,contextual-linked-memory,layer-cake-principles}.md` — identity planes,
  card-vs-referent, P13.

---

## 13. Phase-1 implementation notes (2026-07-07 — shipped, fork merge `d75a4dd`)

- **Selection is exact-match in the fork** (§4's amendment held): `conformsTo` opaque, hierarchy
  client-side.
- **list-profiles as Link headers** (`rel="canonical"/"alternate"`, `type=`media, `formats=`profile)
  ride every response where the negotiation block ran (`Accept-Profile` present — the DX Example-19
  discovery pattern) and the 406 (authz-filtered). Bare GETs stay zero-I/O; cold discovery = the
  linkset + the `capability[]` hint. This is the §8.2.1.1 published-mapping stance that keeps the
  `cnpr:http` claim honest without a hot-path `.meta` read.
- **Grounding remarks (do not "fix"):** the `formats=` attribute follows every worked example in both
  pinned specs; DX-PROF-CONNEG Figure-3 *prose* saying `profile` contradicts the spec's own examples.
  `Content-Profile` comes from a post-pin IETF draft — emitted alongside the required
  `Link: rel="profile"`.
- **The JSON-LD substrate fix landed with Phase 1** (not originally in scope, Chuck-directed): the
  fork's governance-input parsing (`toDataset`: admission bodies/shapes + `.meta` reads) now uses
  `@rdfjs/parser-jsonld` with a no-network documentLoader (LWS v1 preloaded). This also closed the
  `@graph`-blind-admission decision this spec had deferred to Phase B. The serving-path hand-rolled
  serializer/parser pair (`toJsonLd`/`jsonLdToQuads`) is fork-queued for its own retirement round.
