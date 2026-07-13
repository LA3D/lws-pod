# Referent identity & discovery — design of record

**Date:** 2026-07-13
**Status:** design of record (brainstormed, approved section-by-section; pending implementation plan).
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
   (`skos:Concept`) lives inside the RDF representation; the System-Managed type index sees only the
   storage resource, typed `lws#DataResource`. A search for the real type finds nothing.

Both are the *same missing artifact*: a **referent index** mapping the minted subject IRI → its
storage location and declared type. Build it once, server-side, and it powers both the resolver
(gap 1) and referent-type search (gap 2). This closes the last two undiscoverable hops on the path
*read `/.well-known/void` → learn the `void:uriSpace` → follow a subject IRI → land on the typed
memory.*

**The neutrality requirement (Chuck, 2026-07-13, verbatim intent):** *LWS and the server are meant to
be general-purpose for many kinds of linked applications — other applications must be able to use
this.* So the round is **not** "wiki `/id/` deref." It is a neutral **referent identity & discovery**
affordance any linked application rides. Building it general is the only P13-correct build; a
wiki-specific feature would smuggle application semantics into the substrate.

---

## 1. Scope, phases, and the hard constraints

**Spine.** Make any profile's minted subject IRIs **dereferenceable** (name → 303 → representation)
and **type-searchable** (found by the referent's real `rdf:type`, not `lws#DataResource`). One neutral
server-side artifact — the referent index (§2) — powers both.

**One spec, two implementation phases, each closed by a cold-agent probe:**

- **Phase 1 — the neutral substrate pillar (fork).** The referent index, referent-type search, the
  uriSpace 303 resolver, and the `capability[]` advertisement — all vocabulary-blind and
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
  pathPrefix come from the profile's declared identity policy (data). The resolver serves *whatever
  uriSpaces the pod's profiles declare*, not a literal `/id/`.

The Phase-1 gate asserts no `wiki`/`okf`/`dcat`/`card` term appears in the exercised mechanism — the
same neutrality proof L4a/L4b/conneg used.

**Hard constraint 2 — this IS a fork round** (like conneg-by-profile Phase 1, unlike L4a/L4b). The
Phase-1 edit rides its own `la3d/*` branch, additive + `--lws`-gated + proven-unchanged on the
default LDP path (negative controls), whole-branch-reviewed, merged `--no-ff` into `la3d/lws`, with a
live gate — the L1–L3 discipline. The edit is bounded to the type-index derivation + the
type-search/resolver read paths + the storage-description builder.

**Hard constraint 3 — honor what the LWS specs already fix** (the conneg round's §9 sanity check
stands): no-oracle + authz-filtering on every discovery surface; `.lwstypes` (type, System-Managed)
vs `.meta` (`describedby`/`conformsTo`, client-managed) stay separate; media conneg stays lossless;
do not worsen the `describedby` overloading (already resolved: `describedby` → shape, `conformsTo` →
profile).

**A clean split falls out of the generality (and proves it is real):**
- **Referent-type indexing is universal** — every profile benefits immediately (DCAT members become
  findable as `dcat:Dataset` with no `pathPrefix` declared).
- **Name-dereference (the resolver) is per-profile opt-in** — it applies only to profiles that declare
  a `pathPrefix` uriSpace; a profile with none has nothing to resolve and degrades cleanly.

---

## 2. The referent index — the unifying artifact (Bucket 1, System-Managed)

**What it is.** For each stored RDF representation carrying a typed subject, a record:

```
{ subjectIRI, referentType[], storageLocation (canonical member), earnedConformsTo? }
```

It yields two lookups from one derivation: **type → members** (referent-type search, §4) and
**subjectIRI → storage location** (the resolver, §3).

**Where it lives.** Extend the **System-Managed type-index substrate** (`.lwstypes`), which already
maps a storage resource → its types. Enrich it to additionally carry the referent subject IRI(s) +
their declared `rdf:type`(s), the reverse `subjectIRI → storageLocation` map, and (§6) the optional
earned `conformsTo` provenance. Exact on-disk shape is a plan decision; the design commitment is:
*System-Managed, derived at admission, in the type-index substrate, application-neutral.*

**How it's derived.** At admission of an RDF representation — the **same pass** that parses it into a
dataset for SHACL validation — extract the subject matching the profile's declared identity
convention (the primary referent = the declared `fragment`, default `#it`) and its `rdf:type`. No
second parse, no new content inspection. The type recorded is whatever the referent declares
(vocabulary-blind).

**The attribution wrinkle (content-primary memories).** For a wiki memory the referent lives in the
**links** representation while the canonical member is the **markdown content** (content-primary,
conneg-instantiation §2); the derivation fires when the links representation is admitted and
attributes the referent + its type(s) back to the canonical content member via the linkset
alternate-representation tie. For a single-RDF-representation profile (DCAT) the referent is in the
canonical resource itself and derivation fires directly. *Which representation carries the referent is
identified by the profile's declared representation roles (data), not baked in.*

**Phase-1 scope: the primary referent only.** Index the declared-`fragment` subject. The identity
policy already admits that a document's graph "may carry further subjects" — indexing those secondary
subjects is a noted, non-required extension (§10), not on this round's path.

---

## 3. The uriSpace resolver — 303 name → representation (Bucket 1, fork)

Realizes `iri-minting.md`'s deferred read-side plane-mapping for the **name-space** case and
conneg-instantiation §4's "303-by-profile."

- **Trigger.** A GET/HEAD to a path inside a declared uriSpace (`pathPrefix`) that is not itself a
  stored resource — a minted name.
- **Behavior.** Strip the fragment → look the document IRI up in the referent index → **303 See
  Other**, `Location: <storageURL>`, `Link: rel="canonical"` (+ `rel="profile"` when the referent's
  profile is known). httpRange-14-correct: the name is not the document, so 303 to where a
  representation of it lives. From there the client uses conneg-by-profile (already shipped) to select
  content vs links.
- **no-oracle + authz-filtered.** A referent the requester may not read is **indistinguishable from a
  nonexistent one** — a hiding 404, never a 303-then-401 that leaks existence. Same discipline as the
  type index and conneg list-profiles. Consequence: an anonymous agent follows through iff the target
  is public-read; otherwise 404.
- **Per-profile opt-in.** Only profiles declaring a `pathPrefix` uriSpace are resolvable; others have
  nothing to resolve.
- **Fork discipline.** `--lws`-gated, additive; the default LDP path (a real stored resource under any
  path) is byte-identical (negative control). The resolver only engages for a name with no backing
  stored resource inside a declared uriSpace.

---

## 4. Referent-type search (Bucket 1, fork)

`lws_type_search` and the HTTP `/types/search` service now match on the **referent's declared type**
from the referent index. A query for `skos:Concept` / `dcat:Dataset` / `ex:Thing` returns the members
whose referent is that type — instead of the blanket `lws#DataResource`.

- Same **no-oracle + authz-filter** the Type Index already enforces (unauthorized entries omitted; an
  unindexed/unreadable referent is indistinguishable from one matching nothing).
- The result closes the loop back to the resolver: an agent goes *type → member → the referent's
  dereferenceable subject IRI* (surfaced from the index / the member's linkset).
- Composes with the existing `conformsTo` indexed relation (conneg round): *type* answers "what is
  this," *`conformsTo`* answers "which profile governs it" — orthogonal, both cross-resource.

---

## 5. Discovery layer — capability advertisement + B7 identity-policy vocabulary

Make the identity/deref convention **readable by a cold agent**, not merely observable as server
behavior.

- **Capability advertisement.** The storage description gains a `capability[]` entry advertising
  referent resolution — the uriSpaces it serves, the fragment convention, the 303 behavior — parallel
  to conneg-by-profile's `ContentNegotiation` capability (LWS Discovery's own `capability[]` example).
  Its `type` is a **URI**, not a bare token (heeding the conformance-audit note that the vendor
  service types `ProfileIndexService`/`VoidService`/`McpService` are bare tokens where the convention
  is a URI — not repeated here).
- **B7 — first-class identity-policy vocabulary.** Mint `lwsp:` terms for the identity policy
  (`pathPrefix`, `fragment`, slug-strategy, versioning) in `projection/profiles/defs/lwsp.ttl` (Plane
  2 reuse-first, `iri-minting.md`); convert the `identity.jsonld` docs to reference them so the
  identity policy becomes **self-describing, graph-shaped RDF**. A cold agent reads a profile's
  identity policy as RDF and learns how names are minted and dereferenced — closing the "house
  convention, not a first-class term" gap. (The graph-shaped `skos:definition` reword already landed
  in L4a; this is the vocabulary term itself.)
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

**Earned-at-admission `conformsTo` (the one open item — DECIDED this round: record it).** Since the
referent index is derived at admission anyway, also stamp each validated member with the profile that
actually validated it, as **optional System-Managed provenance** in `.lwstypes`. This:
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

- **wiki** proves the resolver end-to-end: its links representation carries `#it a skos:Concept`, so
  `/id/{slug}` 303s to the card and referent-type search returns `skos:Concept`. Its `identity.jsonld`
  adopts the B7 vocabulary.
- **DCAT** proves the universal half + clean degradation: its canonical representation carries
  `#it a dcat:Dataset`, so referent-type search returns `dcat:Dataset`; with **no `pathPrefix`
  declared**, it has no name-space to resolve and simply doesn't. (The resolver is thus proven on two
  profiles — the neutral `ex:` one in Phase 1 and wiki in Phase 2 — without forcing a contrived
  pathPrefix onto DCAT.)
- **`iri-minting.md` read-side update (deliverable).** Amend Plane-1 read-side to state the
  **name-space** deref path: dereferencing a minted name 303s to the canonical URL via the referent
  index. Today's text (a) only covers GETting the *canonical URL* and negotiating a profile; it does
  not cover following the *minted name itself*, which is the hop this round wires.
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

Frictions become surface fixes (probe → fix → re-probe), recorded as fork-queue or plan items.

---

## 9. Acceptance

1. **Phase 1 fork gate** — a new live suite (`tests/lws-referent.test.mjs` + `make test-referent`, or
   the equivalent grown onto `test-typeindex`), against the fork `--lws` TLS pod, using a **neutral
   `ex:` profile**: an agent PUTs typed named-graph JSON-LD with a minted subject IRI in a declared
   uriSpace (name ≠ storage path); referent-type search returns the member by its `ex:` type; a GET of
   the minted name 303s to the representation; the referent-resolution `capability` is advertised
   (URI-typed); an unauthorized client's search omits unreadable referents and its name-GET 404-hides
   (no-oracle); the default LDP path is provably unchanged (negative controls); **no
   wiki/okf/dcat/card term appears in the exercised mechanism** (asserted — the P13 proof).
2. **Phase 2 consumers green** — wiki suite stays green; `/id/{slug}` deref + `skos:Concept`
   referent-search live; DCAT `dcat:Dataset` referent-search + clean degradation (no resolvable
   name-space) live.
3. **Referent index** — derived at admission, System-Managed in `.lwstypes`, records subject IRI +
   type + storage location + optional earned `conformsTo`; primary referent only.
4. **Discovery layer** — the `capability[]` entry advertised (URI-typed); B7 `lwsp:` terms minted and
   `identity.jsonld` self-describing RDF.
5. **Read semantics** — the three leanings confirmed against fixtures (incl. a two-profile
   plural-binding fixture); earned `conformsTo` recorded as System-Managed provenance with the
   `up`-walk still the contract.
6. **`iri-minting.md`** updated per §7.
7. **Probes** (Phase 1 generic + Phase 2 wiki+DCAT) reconstruct the discovery chain cold.
8. **Fork stance** — the Phase-1 edit is minimal/additive/`--lws`-gated, whole-branch-reviewed, merged
   `--no-ff`, live-gated; default path unchanged. Rig repinned.
9. **Zero regression** across all existing gates (`test-conneg`, `test-void`, `test-preservation`,
   `test-mcp-v2`, `test-graph`, `test-profiles`, `test-lws`, `test-l3`, `test-typeindex`,
   `test-indexed-relation`, `test-dcat`, `test-wiki`, projection unit suites).

---

## 10. Out of scope / deferred

- **Secondary (non-primary-referent) subjects in a graph** — Phase 1 indexes the declared-`fragment`
  referent only; multi-subject-graph indexing is a noted extension, not this round's path.
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
  registration — the `void:uriSpace`/`void:rootResource` surface the resolver completes.
- `docs/design-notes/iri-minting.md` — the three-plane identity model + the read-side plane-mapping
  this realizes for the name-space; `docs/design-notes/{contextual-linked-memory,layer-cake-principles}.md`
  (card = context, P13).
- `docs/superpowers/specs/2026-07-06-profile-conneg-instantiation-design.md` (representation roles,
  conneg-by-profile, content-primary shape), `2026-07-06-l4b-graph-semantics-design.md` (named-graph
  JSON-LD, the derived-view materializer), `2026-07-01-lws-typeindex-search-design.md` +
  `2026-07-01-lws-indexed-relation-design.md` (the Type Index/Search + indexed-relation seam being
  extended).
- `docs/foundations/05-jss-spec-conformance.md` (§3 MCP, §4 conneg/VoID — the surfaces touched),
  `06-code-placement-audit.md` (P13 buckets — the audit gains rows for the referent index, resolver,
  and referent-type search, all Bucket 1).
- FOLLOWUP probes #7 A3 (referent-type invisibility) + #7 B2 (`/id/` deref 401) — the live evidence.
