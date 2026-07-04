# Profile mechanism (Plan 2) — design

Design spec, 2026-07-04. Implements §4–§5 of the design of record
(`2026-06-28-general-memory-substrate-design.md`) as reshaped by the LWS fork work (L1–L3, L2.5,
indexed-relation) and **governed by `docs/design-notes/layer-cake-principles.md`** — the twelve
principles there are acceptance criteria for this spec; deviations must be argued. Supersedes the
profile-mechanism portions of the pre-pivot `2026-06-21-okf-profile-mechanism-design.md` (its
engine/profile split and additive-over-OKF invariant carry forward).

---

## 1. Goal, scope, non-goals

**Goal.** Profiles become first-class, discoverable, resolvable pod resources, and identity minting
stops using the `urn:okf:base/` placeholder: `makeIdentityPolicy` takes a URI resolved from the
pod's real storage description via a new `resolveStorageAuthority` seam.

**In scope.**
1. The PROF-based profile **descriptor** format (compact JSON-LD) + the minted role/config
   vocabulary (`lwsp:`, name illustrative).
2. The **substrate-floor** and **okf-base** profiles (app-neutral) and the **llm-wiki adoption
   descriptor** with pinned pod-mirrored artifacts.
3. The client-side **resolver** in `projection/okf`: `resolveStorageAuthority`, profile loading,
   `isProfileOf` inheritance, `conformsTo → describedby` materialization for shipped L3 enforcement.
4. One minimal additive **fork rung**: storage description advertises the profile index; linksets
   surface `conformsTo`.
5. Profile-declared **unknown-name policy** (`@vocab` → proto namespace) per layer-cake P6.

**Non-goals (recorded, not lost).** The wiki-memory suite stays RED — L4 re-derives it. Profile #2
(data-catalog) → L4/later. Fork-native `conformsTo` admission + `/types/search` indexing → post-L4.
w3id registration → public rung. MCP affordance-spec correction → after Plan 2 (FOLLOWUP). Trust
seam beyond `prov:wasAttributedTo` recording. Edge-target cross-card `id:` resolution → L4 (§7).

---

## 2. The conformance model

**Multi-parent conformance, not a tree.** PROF supports `prof:isProfileOf` to multiple
specifications; the hierarchy is a DAG of conformance assertions, and **external standards keep
their canonical IRIs and their own lineage, untouched** — we never re-mint or re-parent a standard
we don't own (RO-Crate's `w3id.org/ro/crate/1.x` lineage is RO-Crate's; OKF is Google's).

- **`substrate-floor`** (ours): the only contract the mechanism code knows, and an **orthogonal
  conformance dimension**, not an ancestor in anyone's lineage. Content-format-neutral: (a) the
  stable-subject-IRI rule — declared `id:` wins; minted IRIs location-independent, `#it`
  convention; (b) the `conformsTo` handoff semantics (layer-cake P4).
- **`okf-base`** — `isProfileOf substrate-floor` + references OKF-the-spec: the markdown+frontmatter
  family floor (OKF §9 conformance, graceful degradation). One family root among possible others.
- **`llm-wiki`** — `isProfileOf okf-base` (+ upstream's own identity when upstream mints one). Named
  nowhere in mechanism code; arrives only as a descriptor discovered from the storage description.
- **A future `ro-crate` profile** — `isProfileOf: [w3id.org/ro/crate/1.x, substrate-floor]`: a
  *sibling* family. Its stub is this spec's substitutability fixture (§10.7).

**Adoption descriptors.** What we author for an external standard is always an *adoption
descriptor*: our assertion, in our namespace, bundling resolution details (mirrored artifacts,
roles, formats) and declaring dual conformance — never a claim of authority over the external
standard's structure. Upstream may adopt the descriptor later.

---

## 3. Descriptor format and namespaces

**Three namespaces, three owners** (do not conflate — layer-cake P5):

| namespace | owner | contains |
|---|---|---|
| `lwsp:` mechanism vocab | substrate project (LA3D/lws-pod) | minted roles + floor terms; generic across every profile and app |
| profile descriptors we author | this repo (authoring) / the pod (serving) | floor, okf-base, adoption descriptors |
| application vocabularies | the app's upstream project | e.g. llm-wiki's ontology/context/shapes at `la3d.github.io/llm-wiki-colab/` |

IRIs for the first two are minted under a w3id-shaped base we control and **served from the pod
meanwhile** (like `/.well-known/lws/context`); dereference is not on the resolver's critical path
because the storage description maps profile IRI → local resource (`iri-minting.md`: authority is
*resolved*, never hardcoded). w3id registration is a later public-rung checkbox.

**Minted roles** — exactly what PROF lacks, each a `prof:ResourceRole` + `skos:Concept` with the
operation contract in `skos:definition` (layer-cake P7; the W3C roles vocabulary defines no
`role:context` — established fact C1):

- `lwsp:role/context` — *syntactic binding; hand to JSON-LD processing; never a source of meaning.*
- `lwsp:role/identity-policy` — *config consumed by the identity minter (slug strategy, versioning,
  DID-anchoring); combined with the pod's resolved storage authority.*
- `lwsp:role/plane-mapping` — *config consumed by the projection: how bundles map onto containers.*

Standard W3C roles (`role:validation`, `role:vocabulary`, `role:specification`, …) are used as-is.

**Descriptor shape** — compact JSON-LD under a published `profiles-compact` context (array-stacked
on `lws/v1`; `@protected` respected). All IRIs below are illustrative; the concrete bases (a
w3id-shaped path for `lwsp:` + descriptors, pod-served meanwhile) are fixed in the plan:

```json
{
  "@context": ["https://www.w3.org/ns/lws/v1", "…/profiles-compact"],
  "@id": "…/profiles/llm-wiki",
  "@type": "Profile",
  "hasToken": "llm-wiki",
  "isProfileOf": "…/profiles/okf-base",
  "hasResource": [
    {"hasRole": "role:validation",        "hasArtifact": "…/llm-wiki/shapes.ttl",    "format": "text/turtle",
     "dct:source": "https://la3d.github.io/llm-wiki-colab/shapes.ttl",  "version": "<pin>"},
    {"hasRole": "role:vocabulary",        "hasArtifact": "…/llm-wiki/ontology.ttl",  "format": "text/turtle",
     "dct:source": "https://la3d.github.io/llm-wiki-colab/ontology.ttl","version": "<pin>"},
    {"hasRole": "lwsp:role/context",      "hasArtifact": "…/llm-wiki/context.jsonld","format": "application/ld+json",
     "dct:source": "https://la3d.github.io/llm-wiki-colab/context.jsonld","version": "<pin>"},
    {"hasRole": "lwsp:role/identity-policy", "hasArtifact": "…/llm-wiki/identity.jsonld", "format": "application/ld+json"}
  ]
}
```

Provenance (`dct:source` + pinned version/commit) lives **in the descriptor, one place** — the
grounded-skills discipline applied to profile artifacts. `prof:hasToken` carried on every
descriptor (costs nothing; feeds conneg-by-profile if ever wanted). Descriptors are data: each
`dct:conformsTo`s the **descriptor shape** (§9) for its own document.

---

## 4. Pod layout, publication, binding

```
/profiles/
  index.jsonld              profile index: list of descriptors + the pod default
  vocab/lwsp.ttl            mechanism vocabulary (minted roles, floor terms)
  substrate-floor.jsonld    floor descriptor
  okf-base.jsonld           descriptor (+ base context, base shape artifacts)
  llm-wiki/
    profile.jsonld          adoption descriptor
    ontology.ttl            pinned mirror of upstream
    context.jsonld          pinned mirror of upstream
    shapes.ttl              pinned mirror of upstream
    identity.jsonld         the artifact upstream lacks (the "missing fourth part")
```

**Repo holds source; deploy materializes.** Sources live in this repo (`projection/profiles/`
reshaped); a publish step (make target, part of pod seeding) runs the declaration-time checks (§9)
and PUTs to the pod. Pod = resolution surface; repo = authoring surface (same pattern as the app).

**Binding: per-container, inherited.** A container's `.meta` carries `dct:conformsTo →
<descriptor IRI>` (the full DCMI predicate, per the L3 `.meta` JSON-LD convention); members inherit
via the resolver's `rel="up"` walk; an **optional** pod default may be named in `index.jsonld`.
Defaults and inheritance are **resolver semantics, never metadata assertions** — only declared
bindings exist in `.meta`/linksets. Lands on the L3 `.meta` precedent (layer-cake D5) — same store
as `describedby`, migrating to linkset mutation when that deferred L2 carryover lands.

---

## 5. The fork rung (one branch, additive, `--lws`-gated)

Two read-only changes, shipped together:

1. **Storage description advertises the profile index** — a `service` entry alongside the existing
   ones. This is the P4 root: cold agent → `/.well-known/lws-storage` → profile index → descriptors
   → artifacts.
2. **`generateLinkset` surfaces the target's own declared `conformsTo`** from its `.meta`, exactly
   as the indexed-relation layer surfaces `describedby` — a resource's linkset answers "what
   governs this?" without the agent knowing the `.meta` convention. The linkset relation key is the
   **full `dct:conformsTo` URI** — `conformsTo` is not an IANA-registered relation, and RFC 8288
   requires extension relations to be absolute URIs (our own layer-cake discipline). Omitted when
   nothing is declared (matching `describedby`); container inheritance and pod defaults are
   client-resolver semantics and never appear here.

Deferred from the rung (recorded): `conformsTo` as a second indexed relation in `/types/search`;
fork-native admission resolution — both post-L4. **Enforcement is unchanged**: the resolver
materializes the profile's `role:validation` artifact as the container's `describedby` declaration
and shipped L3 does the rest — `conformsTo` is the index, `describedby` the enforcement cache
(layer-cake C2).

---

## 6. The resolver (`projection/okf`)

**`resolveStorageAuthority(webidOrResourceUrl) → {authority, profileIndex, defaultProfile}`.**
From a resource URL (or a WebID's pod root): follow `rel="…storageDescription"` → parse the storage
description → extract the storage `id` (the **authority**) + the profile index location. The
authority is what `makeIdentityPolicy` receives.

**Profile loader.** `conformsTo` (own `.meta` → inherited via `rel="up"` → pod default) → fetch
descriptor → **parse to quads and read `prof:` terms at the graph level** — never string-match the
compact JSON (P10 applies to us too; compact form is authoring ergonomics). Dispatch artifacts by
role IRI into `{validation, vocabulary, context, identityPolicy, planeMapping}`; unknown roles
preserved untouched (tolerant reader).

**Inheritance with the multi-parent rule.** A **resolvable PROF parent** contributes artifacts:
validation **union** (per `role:validation`'s inherited-constraints scope note), contexts
**array-stack base-first** (JSON-LD layering; `@protected` holds), vocabularies union, configs
(identity-policy, plane-mapping) **nearest-wins**. A **non-resolvable or non-PROF parent** (e.g.
`w3id.org/ro/crate/1.x`) is recorded as an opaque conformance assertion and **not walked** — how
external lineage stays untouched in practice.

**Failure asymmetry (P8-consistent).** Declaration-time operations (publish, `describedby`
materialization) fail **loud**. Read/projection-time resolution failures degrade **graceful**:
on unresolvable `conformsTo` the resolver warns and returns no profile; the **OKF projection**
(family code, not the generic mechanism) then falls back to okf-base (mirrors L3's missing-shape
pass-through). The generic resolver itself never assumes a family.

**Caching.** Per-process memo (CLI one-shot refetches per run; the CDC watcher invalidates on
notification). Nothing fancier this round.

---

## 7. Identity threading and Plan-1 carryover

`policy.mint` base = **resolved authority** (§6); minting *policy* (slug strategy, versioning,
DID-anchoring) = the profile's `identity-policy` artifact; declared `id:` **still wins** (Plan 1
invariant, untouched; the two-pod same-subject test reruns through the resolver).

Carryover disposition (from Plan 1's final review):
- **#2 `targetIri` scheme guard**: accept any absolute IRI — `urn:`/`did:` pass through (fix).
- **#4 `asTypeCurie` engine-vocab debt**: the hardcoded `'skos:' + bareType` dies; `type:` resolves
  through the profile context (base context maps the generic class; llm-wiki maps its taxonomy).
  The pinned `skos:Reference` test is updated as its comment demands.
- **#1 edge-target declared-`id` resolution**: now *resolvable* (profiles load bundles) but full
  cross-card resolution stays **L4** (recorded in §1 non-goals).
- **#3 `slugFromUrl` filename collision**: documented as a stated profile-namespace invariant
  ("filename unique within a profile namespace"), not solved.
- **#5 minors** (T2 negative assertion, T1 coverage, stale `extract.mjs` header): folded into the
  files touched; the `extract.mjs` header edit waits for L4 (that file is L4's).

---

## 8. Profile policy content

**Unknown-name policy (layer-cake P6).** `okf-base`'s context sets `@vocab` → a **proto namespace
under the pod's resolved authority** (`{authority}/proto#`). Staging is honestly *local* —
un-curated terms haven't earned location-independent IRIs; curator promotion globalizes them into a
curated vocabulary. The pod serves the proto namespace document (honest dereference: "minted by
usage, curation pending"). `llm-wiki` stacks its curated context on top (explicit terms; `@vocab`
inherited, so unknown keys still mint-to-proto rather than silently drop — for a memory substrate,
drop is memory loss). Loudness: default `sh:Warning` advisory on proto-namespace predicates (the
shipped L3 teaching channel); the proto-predicate Warning rule **ships in the okf-base shape**; a
container may opt into strict (`sh:closed` + `sh:Violation`). Curated namespaces never appear in
any `@vocab` (typo-impostor rule).

**Typing channels (layer-cake D3), scoped rule.** For cards, content (`type:` frontmatter) is the
source of truth; the writer/projection **materializes** `rel="type"` storage metadata from it —
storage typing is derived, never independently authored. Full divergence reconciliation across
arbitrary writers stays open (L4+).

---

## 9. Declaration-time integrity checks

Live in the publish step; **fail loud** (the parse seam fails open at enforcement time — never
discover a weak artifact there; layer-cake P8):

| artifact | checks |
|---|---|
| descriptor | parses to non-empty graph; passes the **descriptor SHACL shape** (ships with `lwsp:`) |
| shapes | non-empty shapes graph, ≥1 target + constraint; SHACL-SHACL; **SHOULD be Turtle** (the orphan-bnode fail-open is a JSON-LD-shapes disease); JSON-LD shapes get the explicit-`@id` lint |
| context | the lint: no `@vocab` at a curated namespace; no relative/empty `@vocab`; no term collisions vs `lws/v1` + parent contexts (`@protected` stacking test) |
| vocabulary | parses; completeness cross-check — terms used by shapes/context are defined in the vocabulary (catches mirror-pin drift) |

---

## 10. Acceptance

New gate + extensions of existing ones (`make test-projection` + a live-pod profile gate):

1. Publish step materializes `/profiles/` on the live pod; storage description advertises the
   index (fork live gate).
2. `resolveStorageAuthority` returns the pod authority from the *real* storage description —
   `urn:okf:base/` gone from the running path.
3. A card in an llm-wiki-bound container mints `{authority}…#it`; declared `id:` wins (Plan 1
   two-pod test through the resolver).
4. A container with a declared binding surfaces `dct:conformsTo` in its linkset; a resource with
   no declaration omits it — even inside a bound container (fork gate + negative).
5. `describedby` materialization → L3 rejects a non-conformant write with the teaching message,
   shape sourced from the profile (test-l3 pattern).
6. Unknown frontmatter key → proto quad, not dropped; advisory where admission is on.
7. **RO-Crate stub fixture resolves with zero mechanism changes**; external parent recorded opaque,
   floor parent contributes (substitutability proof).
8. `okf/` suite green; wiki-memory suite **still RED and asserted as such** (L4's job — the
   assertion prevents an accidental "fix").
9. Negative control: an unbound container and the default LDP path behave exactly as today.
10. Publishing a broken descriptor/shape/context/vocabulary fails loud (unit-tested per §9 row).

---

## 11. Decision log (brainstorm, 2026-07-04)

| decision | choice | over |
|---|---|---|
| Plan 2 scope | mechanism + floor/okf-base + llm-wiki; suite stays RED | full 06-28 scope incl. data-catalog; authority-only slice |
| bundle representation | PROF, compact JSON-LD; mint only missing roles | bespoke minimal vocab; describedby-only deferral |
| conformance model | multi-parent DAG; floor orthogonal; external lineage untouched | tree rooted at our floor (rejected: RO-Crate owns its lineage) |
| app artifacts | pinned pod mirror w/ `dct:source` + version pin | direct upstream refs; w3id-now |
| architecture | client mechanism + minimal fork rung (advert + linkset) | zero fork changes; fork-native |
| namespaces | three owners: `lwsp:` / our descriptors / upstream app vocab | single blended namespace |
| unknown names | mint-to-proto under `{authority}/proto#`, Warning default | silent drop; `@vocab` at curated ns |
| enforcement | `conformsTo` index → `describedby` cache; L3 unchanged | fork-native `conformsTo` admission now |
