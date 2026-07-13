# Referent identity & discovery — design of record

**Date:** 2026-07-13
**Status:** design of record (brainstormed, approved section-by-section, simplified after a
size/idiomaticity sanity-check, then checked against the pinned `lws10-searchindex` spec — all
2026-07-13; pending implementation plan).
Governed by `docs/design-notes/layer-cake-principles.md` (P5/P9/**P13**),
`docs/design-notes/iri-minting.md` (the three-plane identity + the read-side plane-mapping),
`docs/superpowers/specs/2026-07-06-profile-conneg-instantiation-design.md` (representation roles,
conneg-by-profile, 303-by-profile), and `docs/foundations/06-code-placement-audit.md` (P13, the
standing neutrality gate). This is **the L4 read-side round** the debt-drain close-out routed here as
the single remaining carryover. **Next step:** a new session runs `superpowers:writing-plans` against
this spec, then subagent-driven implementation. Do NOT start implementation from this doc without a
plan.

---

## 0. Why this exists

Representation preservation (debt-drain) and MCP alternates (model-driven-read) shipped, so a cold
agent can now read a memory it has already located. Two hops still break **before** it can locate
one:

1. **`/id/` dereference 401s to anonymous** (probe #7 B2). Subject IRIs are minted as
   `{authority}/id/{slug}#it` (llm-wiki `identity.jsonld`: `{pathPrefix: "id/", fragment: "#it"}`),
   and the pod publishes `void:uriSpace: {authority}/id/`. But `/id/{slug}` is a **minted name, not a
   storage location** — the content lives at its storage URL (e.g. `/alice/concepts/{slug}`). Nothing
   is wired behind the name, so an agent that follows an edge to `{authority}/id/{slug}#it`, strips
   the fragment, and GETs the name lands on 401. The identity/location decoupling `iri-minting.md`
   mandates is correct; the *dereference* of the minted name was never realized.

2. **Typed `#it` referents are invisible to `lws_type_search`** (probe #7 A3). The referent's type
   (`skos:Concept`) lives inside the RDF representation; the System-Managed type index records the
   storage resource's LDP class (`lws#DataResource`) instead. A search for the real type finds
   nothing.

**The shared insight (and the deliberate scope of this round): treat the RDF *subject* — the referent
— as the unit of identity and type, not the storage wrapper.** That is one idea realized by **two
lightweight fixes**, not one large index:

- **type it** — record the referent's `rdf:type` in the type index LWS *already keeps* (a value fix);
- **dereference it** — resolve a minted name to its representation by an *algorithmic* 303 (a rewrite
  rule), not a per-resource lookup table.

Both close the two hops on the path *read `/.well-known/void` → learn the `void:uriSpace` → follow a
subject IRI → land on the typed memory.*

**The neutrality requirement (Chuck, 2026-07-13, verbatim intent):** *LWS and the server are meant to
be general-purpose for many kinds of linked applications — other applications must be able to use
this.* So the round is **not** "wiki `/id/` deref." It is a neutral **referent identity & discovery**
affordance any linked application rides. Building it general is the only P13-correct build.

**Sanity-check outcome (2026-07-13 — recorded so it is not re-litigated).** An earlier draft proposed
a single stored "referent index" mapping subject IRI → {location, type}. That was over-built and its
size would grow per-memory. Re-examined against plain LWS/linked-data: (a) type search needs no *new*
index — LWS already maintains a per-resource type index; the fix is only *which type it records*; (b)
name dereference needs no index at all — canonical linked-data 303 (DBpedia's `/resource/X` →
`/data/X`) is a URI *rewrite*, and our profile's plane-mapping already declares the target container,
so the redirect is algorithmic. A reverse subject→location index earns its keep only for
*non-algorithmic* mapping (a resource moved to a container the mapping doesn't cover) and is deferred
(§4). Net: **no new bulk index; two fixes to machinery that already exists.**

---

## 1. Scope, phases, and the hard constraints

**Spine.** Make any profile's minted subject IRIs **dereferenceable** (name → algorithmic 303 →
representation) and **type-searchable** (found by the referent's real `rdf:type`, not the storage
class). Both are the general "index/dereference the RDF subject, not the wrapper" rule; neither adds a
per-memory index.

**One spec, two implementation phases, each closed by a cold-agent probe:**

- **Phase 1 — the neutral substrate pillar (fork).** The type-derivation fix, the uriSpace 303
  rewrite-rule resolver, and the `capability[]` advertisement — all vocabulary-blind and
  convention-parameterized. Proven on a **neutral `ex:` profile** (nothing to couple to). Generic
  cold-agent probe gates it.
- **Phase 2 — consumers + data (lws-pod).** B7 identity-policy vocabulary; wiki + DCAT ride the
  pillar; the already-leaned read semantics confirmed against fixtures + earned-`conformsTo`
  provenance recorded; the `iri-minting.md` read-side update; the console-rewire **rider**
  (droppable). Wiki+DCAT cold-agent probe gates it.

**Hard constraint 1 — P13 neutrality (proven, not asserted).** Every fork mechanism in §2–§5 is
Bucket 1 (guardrail/affordance). It is:
- **vocabulary-blind** — indexes/serves whatever `rdf:type` a subject declares (`skos:Concept`,
  `dcat:Dataset`, `sosa:Observation`, `ex:Thing`); no application type is named in the mechanism;
- **convention-parameterized** — `#it`/`id/` are never constants in the server; the fragment and
  pathPrefix→container mapping come from the profile's declared identity policy / plane-mapping (data).
  The resolver serves *whatever uriSpaces the pod's profiles declare*, not a literal `/id/`.

The Phase-1 gate asserts no `wiki`/`okf`/`dcat`/`card` term appears in the exercised mechanism — the
same neutrality proof L4a/L4b/conneg used.

**Hard constraint 2 — this IS a fork round** (like conneg-by-profile Phase 1, unlike L4a/L4b). The
Phase-1 edit rides its own `la3d/*` branch, additive + `--lws`-gated + proven-unchanged on the
default LDP path (negative controls), whole-branch-reviewed, merged `--no-ff` into `la3d/lws`, with a
live gate — the L1–L3 discipline. The edit is bounded to the type-derivation input + a resolver route
on declared uriSpaces + the storage-description builder. No new stored index.

**Hard constraint 3 — honor what the LWS specs already fix** (the conneg round's §9 sanity check
stands): no-oracle + authz-filtering on every discovery surface; `.lwstypes` (type, System-Managed)
vs `.meta` (`describedby`/`conformsTo`, client-managed) stay separate; media conneg stays lossless;
do not worsen the `describedby` overloading (already resolved: `describedby` → shape, `conformsTo` →
profile).

**A clean split falls out of the generality (and proves it is real):**
- **Referent-type indexing is universal** — every profile benefits immediately (a DCAT dataset
  resource is typed `dcat:Dataset` with no `pathPrefix` declared).
- **Name-dereference (the resolver) is per-profile opt-in** — it applies only to profiles that declare
  a `pathPrefix` uriSpace; a profile with none has nothing to resolve and degrades cleanly.
- **Nothing forces *every* resource to be specially indexed.** A plain resource is typed by its own
  subject (the type index LWS already keeps) and dereferenced by its own URL. Only a minted name in a
  declared uriSpace engages the resolver.

---

## 2. Referent-type search — a value fix to the type index LWS already keeps (Bucket 1)

**No new index.** LWS maintains a System-Managed per-resource type index (`.lwstypes`) for type search
regardless of this round; it scales with resource count the way any type search must. The only defect
is *which type it records*: the storage/LDP class (`lws#DataResource`) instead of the RDF **subject's**
`rdf:type`.

**The fix.** When deriving a stored **RDF** resource's indexed types, read the `rdf:type` of the
resource's primary subject (the referent — the declared `fragment`, default `#it`) and record it
**alongside** the native `lws#DataResource`, vocabulary-blind — a resource bears *both*. A non-RDF
resource (opaque markdown/blob) is unchanged — it has no subject to type, so it stays the storage
class (correct; it is not a semantic entity). **Enrich, never replace:** `?type=lws#DataResource`
keeps matching (a legitimate LWS filter — "resources that are data resources") and `?type=skos:Concept`
now also matches; replacing would break the native-class filter.

**LWS conformance (checked against `lws10-searchindex`, 2026-07-13 — recorded so it is not
re-litigated).** This is the spec's *encouraged* path, not a divergence:
- §Type-and-Relation-Derivation ¶2 sanctions it outright — "Servers MAY additionally derive types
  from the resource representation itself when they are able to parse it … richer type discovery
  improves the utility of the Type Index and Type Search services" — and the section's own note
  describes *this exact gap*: "a type exclusively within a resource's internal graph … may not be
  discoverable" without a `rel="type"` header.
- Content-derived types **MUST be treated identically** to Link-header-derived types (indexing,
  search, authz) — which the fix does.
- The examples type items `["DataResource", "schema:Person"]`; "a `type` filter always denotes the
  type the matched resource itself bears" — the multi-type model item ① relies on.
- **Two derivation paths, both spec-blessed — the plan decides:** *(a)* enrich from the
  **already-parsed admission dataset** (free for governed writes — the SHACL floor already parses the
  RDF), and/or *(b)* honor a **`rel="type"` Link header** the writer declares (the spec's SHOULD /
  primary path, covering ungoverned or cold agentic PUTs that carry no admission parse). Whichever,
  they are indexed identically per the spec.
- **Unchanged:** the CNF query model, pagination, no-oracle authorization, and indexed relations are
  defined independently of derivation — the fix only enriches *which* types populate an entry. The
  search mechanism is used as intended, not broken.

**Why this is general and dissolves the wiki "attribution" worry.** A stored RDF resource *is* its
subject's description, so indexing it by its subject's type needs no application logic:
- a plain RDF resource / a DCAT dataset resource → typed by its own subject;
- a wiki memory's **links representation** — itself a stored JSON-LD resource whose subject is
  `{authority}/id/{slug}#it a skos:Concept` — is typed `skos:Concept` **for free** by the same rule.
  No cross-representation attribution: the content member (markdown) stays `lws#DataResource` (it is
  not RDF), and the *semantic* entity is found via its links representation, then followed to content
  by the linkset/conneg the pod already serves. This is ordinary follow-your-nose.

`lws_type_search` and HTTP `/types/search` then answer real-type queries with the same **no-oracle +
authz-filter** they already enforce. The result closes the loop back to the resolver: *type → member →
the referent's dereferenceable subject IRI*. Composes with the existing `conformsTo` indexed relation
(conneg round): *type* answers "what is this," *`conformsTo`* answers "which profile governs it."

---

## 3. Name dereference — a plane-mapping rewrite rule → 303 (Bucket 1, fork)

Realizes `iri-minting.md`'s deferred read-side plane-mapping for the **name-space** case (and
conneg-instantiation §4's "303-by-profile") as canonical linked-data 303 — a **URI rewrite**, not a
lookup table.

- **Trigger.** A GET/HEAD to a path inside a declared uriSpace (`pathPrefix`) that is not itself a
  stored resource — a minted name.
- **Behavior.** Strip the fragment → apply the profile's declared **plane-mapping** (`pathPrefix` →
  content container) to compute the storage location **algorithmically** → **303 See Other**,
  `Location: <storageURL>`, `Link: rel="canonical"` (+ `rel="profile"` when the referent's profile is
  known). httpRange-14-correct: the name is not the document, so 303 to where a representation lives.
  From there the client uses conneg-by-profile (already shipped) to select content vs links. O(1), no
  stored per-resource state.
- **no-oracle + authz-filtered.** After computing the candidate target, check the requester's read
  access; a referent the requester may not read (or a name with no computable/stored target) is
  **indistinguishable from a nonexistent one** — a hiding 404, never a 303-then-401 that leaks
  existence. Consequence: an anonymous agent follows through iff the target is public-read; otherwise
  404.
- **Per-profile opt-in.** Only profiles declaring a `pathPrefix` uriSpace + a plane-mapping are
  resolvable; others have nothing to resolve.
- **Fork discipline.** `--lws`-gated, additive; the default LDP path (a real stored resource under any
  path) is byte-identical (negative control). The resolver only engages for a name with no backing
  stored resource inside a declared uriSpace.

---

## 4. What is deliberately NOT built (the size guard)

- **A reverse subject→location index.** Not built. The rewrite rule (§3) covers every resource whose
  location is algorithmic from its profile's plane-mapping — the whole memory model as designed. A
  stored index would only add value for **non-algorithmic** mapping (a resource relocated to a
  container the plane-mapping doesn't cover, or imported at an arbitrary path). That is a **YAGNI
  escalation**: add it (and knowingly pay the per-resource size cost) only when cross-container
  relocation becomes a real requirement — not speculatively. Recorded so the next round doesn't
  rediscover the choice.
- **Cross-representation type attribution.** Not built (§2 dissolves the need): each stored RDF
  representation is typed by its own subject; the memory is found via whichever representation carries
  the referent.
- **Secondary (non-primary-referent) subjects in a graph.** The type derivation reads the declared-
  `fragment` referent; indexing additional subjects a document's graph may carry is a noted extension,
  not this round's path.

---

## 5. Discovery layer — capability advertisement + B7 identity-policy vocabulary

Make the identity/deref convention **readable by a cold agent**, not merely observable as server
behavior.

- **Capability advertisement.** The storage description gains a `capability[]` entry advertising
  referent resolution — the uriSpaces it serves, the fragment convention, the algorithmic-303
  behavior — parallel to conneg-by-profile's `ContentNegotiation` capability (LWS Discovery's own
  `capability[]` example). Its `type` is a **URI**, not a bare token (heeding the conformance-audit
  note that the vendor service types `ProfileIndexService`/`VoidService`/`McpService` are bare tokens
  where the convention is a URI — not repeated here).
- **B7 — first-class identity-policy vocabulary.** Mint `lwsp:` terms for the identity policy
  (`pathPrefix`, `fragment`, slug-strategy, versioning, and the `pathPrefix`→container plane-mapping)
  in `projection/profiles/defs/lwsp.ttl` (Plane 2 reuse-first, `iri-minting.md`); convert the
  `identity.jsonld` docs to reference them so the identity policy becomes **self-describing,
  graph-shaped RDF**. A cold agent reads a profile's identity policy as RDF and learns how names are
  minted and dereferenced — closing the "house convention, not a first-class term" gap. (The
  graph-shaped `skos:definition` reword landed in L4a; this is the vocabulary term itself.)
- **Composition with VoID.** `void:uriSpace` (already published, `/.well-known/void`) says **what** the
  space is; the capability + identity policy say **how** it dereferences. Two halves of one discovery
  story — `iri-minting.md` + the W3C VoID Note (an IG Note, so the pod's `/.well-known/void` is a
  value-add EXTENDS, not a conformance obligation). Fixing `/id/` deref is what makes the
  already-published `void:uriSpace` actually followable to its last hop.

---

## 6. Read-side semantics — confirm the leanings + record earned `conformsTo`

Most read-side questions are already **design of record** in `iri-minting.md` "read-side plane mapping
(RESOLVED)" (c); the round **confirms them against live fixtures**, it does not reopen them:

- container's own `conformsTo` **beats** the pod-wide `defaultProfile`;
- the **`up`-walk contract** stands — governance edges (`describedby`/`conformsTo`) live on the
  container's linkset; a member reaches its profile via `rel="up"`;
- **plural bindings AND-compose** for validation; which binding is most-specific for *content
  negotiation* is a client concern, not server-arbitrated — confirmed against a two-profile fixture.

**Earned-at-admission `conformsTo` (the one open item — DECIDED this round: record it).** The type
derivation (§2) already runs at admission, so also stamp each validated member with the profile that
actually validated it, as **optional System-Managed provenance** in a sibling `.lwsprov` sidecar
(**correction, recorded at close-out:** implemented as its own sidecar, not folded into `.lwstypes`
— `.lwstypes` is a plain type-URI array, and overloading it would have broken that shape; a separate
sidecar keeps both simple). This:
- **keeps the `up`-walk as the discovery contract** — the earned fact is provenance ("this member was
  validated against profile P"), never the mechanism a client uses to find governance;
- **stays distinct from the client-managed `.meta conformsTo`** — that is the *declared binding
  intent* on the container; the earned fact is *derived provenance* on the member, so the
  System-Managed/client-managed separation (constraint 3) is preserved, not muddied;
- **pre-positions the deferred trust seam** — `prov:wasAttributedTo` + earned validation provenance
  compose later without a backfill.

Marginal cost is ~zero at the derivation point; it closes the last open read-semantics carryover.

---

## 7. Phase 2 — consumers, iri-minting update, console rider

- **wiki** proves the resolver end-to-end: its links representation carries `#it a skos:Concept` (so
  it is typed `skos:Concept` per §2), and its declared plane-mapping lets `/id/{slug}` 303 to the
  card. Its `identity.jsonld` adopts the B7 vocabulary.
- **DCAT** proves the universal half + clean degradation: its dataset resource carries
  `#it a dcat:Dataset`, so referent-type search returns `dcat:Dataset`; with **no `pathPrefix`
  declared**, it has no name-space to resolve and simply doesn't. (The resolver is thus proven on two
  profiles — the neutral `ex:` one in Phase 1 and wiki in Phase 2 — without forcing a contrived
  pathPrefix onto DCAT.)
- **`iri-minting.md` read-side update (deliverable).** Amend Plane-1 read-side to state the
  **name-space** deref path: dereferencing a minted name 303s to the canonical URL via the profile's
  plane-mapping **rewrite rule** (not a lookup index). Today's text (a) only covers GETting the
  *canonical URL* and negotiating a profile; it does not cover following the *minted name itself*,
  which is the hop this round wires.
- **Console-rewire rider (droppable if it bloats).** Fix `app/seed/seed.mjs`'s `putViaProxy` + the
  stale `projection/triggers` path so the curation console runs against the fork pod. It targets the
  fork the round changes underneath it, so it rides here rather than standing alone — but it is a
  rider, not a gate.

---

## 8. Cold-agent affordance probes (Chuck's directive)

Same unprimed protocol as prior rounds (a fresh sub-agent, pod URL + CA cert only, zero project
context, read-only). Baseline is probes #1–#7 (FOLLOWUP) — not re-run.

- **Probe (Phase 1, generic).** A cold agent, given only the pod, reconstructs the **discovery chain**
  for a neutral memory: read `/.well-known/void` → learn the `void:uriSpace` and the referent-
  resolution `capability` → *type-search* by the referent's `ex:` type → follow the returned subject
  IRI (a minted name) → land (via 303) on the representation → read it. For a non-wiki, non-DCAT
  profile declaring an `ex:` referent. Validates the pillar independent of any application.
- **Probe #(wiki+DCAT), Phase 2.** The same walk over the re-derived wiki family (resolve `/id/{slug}`,
  find `skos:Concept`) **and** DCAT (find `dcat:Dataset`, confirm no name-space to resolve) —
  **two structurally-different applications discovered by the same walk** = the affordance-level
  generality proof.

**Utility, not just mechanics (Chuck's directive, 2026-07-13).** Both probes judge whether the chain
serves an agent's **progressive disclosure into context**, not merely whether it returns 200s: does
type-search return the *right granularity* (the semantic entity, not a wall of `DataResource`s); does
the landed representation surface the **typed edges an agent needs to follow its nose onward** (a
type-search that lands on the links representation should hand the agent its navigation structure);
is the 303 legible as a redirect to *the same thing under a different name*. A mechanically-correct
chain that does not help an agent orient is itself a finding — recorded as a utility observation, not
a silent pass. This is the "does structure actually help agents" thesis measured on the read path.

Frictions become surface fixes (probe → fix → re-probe), recorded as fork-queue or plan items.

---

## 9. Acceptance

1. **Phase 1 fork gate** — a new live suite (`tests/lws-referent.test.mjs` + `make test-referent`, or
   the equivalent grown onto `test-typeindex`), against the fork `--lws` TLS pod, using a **neutral
   `ex:` profile**: an agent PUTs typed JSON-LD whose subject is a minted IRI in a declared uriSpace
   (name ≠ storage path); referent-type search returns it by its `ex:` type; a GET of the minted name
   303s to the representation via the plane-mapping rewrite rule; the referent-resolution `capability`
   is advertised (URI-typed); an unauthorized client's search omits unreadable referents and its
   name-GET 404-hides (no-oracle); the default LDP path is provably unchanged (negative controls);
   **no wiki/okf/dcat/card term appears in the exercised mechanism** (asserted — the P13 proof);
   **no new stored per-resource index is introduced** (asserted — the size guard).
2. **Phase 2 consumers green** — wiki suite stays green; `/id/{slug}` deref + `skos:Concept`
   referent-search live; DCAT `dcat:Dataset` referent-search + clean degradation (no resolvable
   name-space) live.
3. **Type derivation** — a stored RDF resource is indexed by its subject's `rdf:type` **alongside**
   the native `lws#DataResource` (both filters match; enrich-not-replace), vocabulary-blind; content-
   derived types treated identically to header-derived (`lws10-searchindex` §type-derivation); non-RDF
   resources unchanged; optional earned `conformsTo` recorded in a sibling `.lwsprov` sidecar (see the
   §6 correction — not folded into `.lwstypes`).
4. **Resolver** — an algorithmic 303 from the profile plane-mapping; no reverse index built.
5. **Discovery layer** — the `capability[]` entry advertised (URI-typed); B7 `lwsp:` terms minted and
   `identity.jsonld` self-describing RDF.
6. **Read semantics** — the three leanings confirmed against fixtures (incl. a two-profile
   plural-binding fixture); earned `conformsTo` recorded with the `up`-walk still the contract.
7. **`iri-minting.md`** updated per §7.
8. **Probes** (Phase 1 generic + Phase 2 wiki+DCAT) reconstruct the discovery chain cold.
9. **Fork stance** — the Phase-1 edit is minimal/additive/`--lws`-gated, whole-branch-reviewed, merged
   `--no-ff`, live-gated; default path unchanged. Rig repinned.
10. **Zero regression** across all existing gates (`test-conneg`, `test-void`, `test-preservation`,
    `test-mcp-v2`, `test-graph`, `test-profiles`, `test-lws`, `test-l3`, `test-typeindex`,
    `test-indexed-relation`, `test-dcat`, `test-wiki`, projection unit suites).

---

## 10. Out of scope / deferred

- **A reverse subject→location index** — deferred as a YAGNI escalation for non-algorithmic mapping
  only (§4).
- **Secondary (non-primary-referent) subjects in a graph** — Phase 1 indexes the declared-`fragment`
  referent only.
- **Write-side plane-mapping + provenance granularity** (substrate design §11 #4/#5) — the round takes
  only the read minimum; per-quad provenance and Ed25519 signing stay deferred (the earned
  `conformsTo` stamp is the only new provenance fact).
- **Giving DCAT a `pathPrefix`** — unneeded; the resolver is proven on `ex:` (Phase 1) + wiki (Phase 2)
  and DCAT's degradation is itself an assertion.
- **The recorded next-fork seeds** (SSRF IPv6-range widening, `getNotFoundHeaders` 404 `Accept-Patch`,
  `dns.lookup` SSRF pre-check, patch-helpers → `src/patch/`, N3-Patch blank-node subjects /
  `solid:where` / `validatePatch`) — a later fork round, unless a Phase-1 gap forces a scoped touch.
- **The pre-pivot hygiene rider** (`ldp:constrainedBy` co-emission, L3-M2 admission bypass,
  `resources/list` pagination, L1 per-variant 304/ETag) — recorded with the console rider; hygiene, not
  a gate.
- **Operating skills** — distilled post-round from the probe trajectories (the `linked-web-memory`
  skill), per `docs/design-notes/agent-operating-skills.md`.

---

## 11. Grounding

- `.claude/skills/lws-protocol` — `lws10-searchindex` (Type Index/Search, indexed relations, no-oracle
  authz-filtering, System-Managed `.lwstypes`), `Discovery.html` (`capability[]` + the
  ContentNegotiation example, storage services), `logicalresourceorganization.md`
  (Resource-Identification: URI ⊥ containment — why the name is not the storage path).
- `.claude/skills/prof-conneg` — DX-PROF-CONNEG (get-by-profile, `altr:`, 303-by-profile) the resolver
  hands off to; `.claude/skills/profiles` — PROF (`isProfileOf`, roles, `prof:hasToken`).
- `.claude/skills/json-ld` — named-graph serialization (graph object `@id` = doc IRI, `#it` referent).
- **W3C VoID Note** (`https://www.w3.org/TR/void/`, IG Note) + the IANA `/.well-known/void`
  registration — the `void:uriSpace`/`void:rootResource` surface the resolver completes. httpRange-14
  + the DBpedia `/resource/`→`/data/` 303 pattern — the rewrite-rule precedent (§3).
- `docs/design-notes/iri-minting.md` — the three-plane identity model + the read-side plane-mapping
  this realizes for the name-space; `docs/design-notes/{contextual-linked-memory,layer-cake-principles}.md`
  (card = context, P13).
- `docs/superpowers/specs/2026-07-06-profile-conneg-instantiation-design.md` (representation roles,
  conneg-by-profile, content-primary shape), `2026-07-06-l4b-graph-semantics-design.md` (named-graph
  JSON-LD), `2026-07-01-lws-typeindex-search-design.md` + `2026-07-01-lws-indexed-relation-design.md`
  (the Type Index/Search + indexed-relation seam whose *input* is corrected here).
- `docs/foundations/05-jss-spec-conformance.md` (§3 MCP, §4 conneg/VoID — the surfaces touched),
  `06-code-placement-audit.md` (P13 buckets — the audit gains rows for the type-derivation fix and the
  resolver, both Bucket 1).
- FOLLOWUP probes #7 A3 (referent-type invisibility) + #7 B2 (`/id/` deref 401) — the live evidence.
