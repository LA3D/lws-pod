# General agent-memory substrate — design

**Status: design (brainstormed, approved section-by-section; pending implementation plan).**
Date: 2026-06-28.

Supersedes the vault-port framing of the wiki-memory layer. This is the first-principles
re-foundation: a general, standards-based memory substrate where *structure* is imposed by a
profile, not baked in. The exploratory groundwork is in `../../design-notes/format-convergence.md`;
this spec turns its open forks into decisions.

Terminology kept strict throughout: a **profile** is a *structure-definition* (schema); a **bundle**
is a *published collection of cards* (content) that conforms to a profile.

---

## 1. Purpose and scope

Build a **general controlled linked-data memory substrate**: a pod any agent connects to, where the
pod is the canonical home (Obsidian/git become clients), structure is profile-imposed, and
identity/trust/MCP are designed-for. The substrate **bakes in mechanisms, not structure** — identity,
the optional governance floor, projection, discovery, self-description — and leaves *vocabulary,
partitioning, typing, hierarchy, shapes* to profiles.

**In scope (this spec / the working system):** the reconciliation of LWS + OKF + DataBook into one
foundation; the profile mechanism; the card + identity model; projection to derived views; the
optional governance floor; and a working memory system proven on the kept machinery (projection,
Constrained Container, the curation app, JSS's current bearer MCP).

**Deferred (designed-for, not built here):** the LWS Type Search Tier-1 sidecar and full `lws+json`
storage layer; the trust/identity substrate (DID/CID, verifiable credentials, DPoP); MCP-native
read/write/query replacing git-sync; the science-data profile family; the curator's full logic.

### Target use-case families (the profiles the substrate must serve)

| use case | profile | vocabulary family | status |
|---|---|---|---|
| Generic OKF bundles | the **base profile** | OKF `type:` + identity contract; no class vocab | floor — any OKF bundle ingests here |
| CRC **llm-wiki** | **profile #1** (primary) | published `llm-wiki-colab` SKOS/RDFS (16 Edge-Types) | MVP |
| Chuck's Knowledge Vault | a profile **extending** #1 | + maturity / Fano / curator rules | bundle under #1; extension fast-follow |
| **Data catalog** | **profile #2** | DCAT / CSVW / schema.org | MVP (GA4 bundle) |
| Science data acquisition | future | DCAT / SOSA-SSN / PROV / ODPs | designed-for, deferred |

---

## 2. The reconciliation: LWS + OKF + DataBook

The synthesis is **composition over orthogonal concerns**, not class-mapping. Grounded in LWS §Terminology: LWS "does not limit the nature of a [LWS] resource; it merely defines an interface."

| layer | owned by | owns | does not touch |
|---|---|---|---|
| Substrate | **LWS** | resource identity, containment (lifecycle), conneg, authz, notifications, typed discovery, storage description | the meaning/structure of content |
| Card format | **OKF** | the canonical card (markdown + frontmatter), the knowledge bundle, `index.md` | transport, identity, query |
| RDF / crosswalk | **DataBook** | the *derived* graph view (named graphs, IRI identity, PROV); kept round-trippable | being the source of truth |
| Structure | **the profile** | vocabulary, context, shapes, identity policy, plane mapping | transport, identity |

**Governing rule:** LWS owns interaction (silent on content); OKF owns the card; DataBook owns the
RDF crosswalk; the profile owns all structure. Nothing structural is baked into the substrate;
nothing about transport leaks into the card.

### Two planes, related by mapping — never identified

- **Knowledge plane (OKF):** `Bundle`, `Concept` (card), `index.md`, typed edges. Boundaries are
  knowledge decisions.
- **Storage plane (LWS):** `Container`, `DataResource`, `ldp:contains`, conneg, WAC, discovery.
  Boundaries are storage decisions (containment = *lifecycle* management).

`okf:Bundle` and `lws:Container` are **distinct concepts** related by a profile/deployment-governed
mapping (a bundle is *realized over* container(s); n:m). We do **not** assert `owl:disjointWith`:
because LWS is conneg-driven and content-agnostic, one resource may serve both an `lws+json`
container listing and a `text/markdown` `index.md` as two representations of one URI. So `index.md`
(knowledge-authored navigation) and the container `items` listing (storage-generated) are two
"what's here" answers on two planes — distinct, co-locatable, not equivalent.

### Self-description is built in

LWS's **storage description resource** "enumerates and describes the storage root along with services
and capabilities," is discoverable via a `rel="…#storageDescription"` Link header on every response,
and lists service endpoints (`TypeIndexService`, `TypeSearchService`, `NotificationService`,
`DataSharingService`). The **profile is published as pod resources and advertised through the storage
description** — the generality/self-description mechanism rides the spec; we don't invent it.

---

## 3. The canonical card and identity

The card is the canonical OKF artifact: markdown + frontmatter, prose-canonical, semantics in
frontmatter typed edges resolved through the profile's JSON-LD context. It is the markdown-canonical
content of an LWS data resource (conneg also yields turtle/json-ld of the *projected* graph).

### Three identities (one per plane) + one reference

| notion | plane | answers | source | stable? |
|---|---|---|---|---|
| storage address (LWS URI) | storage | where bytes resolve now | LWS (minting unspecified) | no — a locator |
| knowledge slot (OKF concept-id/path) | knowledge | where it sits in the bundle | OKF §2 | no — moves on reorg |
| **subject IRI** | graph | **what the card is** | **profile-minted** | **yes — load-bearing** |
| `resource:` | — | what external asset it is *about* | OKF | reference, not identity |

**Rule:** the subject IRI is canonical and decoupled from address and slot; edges reference subject
IRIs, so the graph survives resources moving and bundles reorganizing. This fixes the built bug where
`projection/okf/card.mjs:subjectIri()` derives the subject from the file URL + `#it` (collapsing
semantic identity into storage address — the vault-legacy shortcut).

**Minting policy:** declared, stable, location-independent, profile-owned (namespace + versioning).
Recommendation (iii defaulting to ii from the design): a card carries a stable subject IRI in
frontmatter; the storage URI is merely its current address. Grounded by LWS leaving Resource
Identification "intentionally blank" (no conflict) and FAIR F1 (a persistent identifier).

### Agent identity is a separate plane

LWS's DID/CID material is exclusively **agent authentication identity**: the self-signed suites put
the *agent's* identifier in the JWT `sub`/`iss`/`client_id` (`https://id.example/agent` for CID;
`did:key:z…` for did:key). A DID identifies an *agent/controller*, never a card. **Never use a DID as
a card subject IRI** (category error). Content identity (subject IRI) and agent identity (DID/CID)
**compose via verifiable provenance** — `card prov:wasAttributedTo <agent>`, with optional signing —
which is the clean seam to the deferred trust layer. Subject IRIs are minted to be *DID-anchorable*
(provenance + signing seam left open) without building trust now.

---

## 4. The profile mechanism

A **profile** is a small bundle of standard, dereferenceable resources published on the pod:

| artifact | format | declares |
|---|---|---|
| vocabulary | RDFS/SKOS/OWL Turtle | classes (`type:` → class IRI) + typed-edge predicates |
| context | JSON-LD | how frontmatter keys/edges project to triples |
| shapes | SHACL Turtle | what a valid card is (the optional governance rules) |
| identity policy | small JSON-LD config | subject-IRI namespace, versioning, DID-anchoring |
| plane mapping | small JSON-LD config | how bundles map onto containers (knowledge→storage) |

**The profile is data; the substrate is profile-parameterized code.** The projection engine, SHACL
validator, conneg, and discovery emission read the loaded profile and behave accordingly. A new
structure is a new profile (declarative), never new code.

**Decisions:**
- **Base profile (the floor):** OKF §9 conformance + the stable-subject-IRI contract. Any OKF bundle
  works under it; richer profiles *extend* it. It is a conformance *contract*, optionally enforced
  (not a mandatory gate).
- **Binding: per-bundle/container**, with a pod default — one pod can host a memory bundle and a
  catalog bundle under different profiles (the knowledge-fabric target); lines up with per-container
  `ldp:constrainedBy`.
- **Published on the pod** (repo holds source; deploy materializes pod resources), advertised via the
  storage description — so the pod self-describes and the trust layer can later sign/attribute a
  profile to an agent DID.
- **Extension/composition:** base → llm-wiki → vault; base → data-catalog → science.

---

## 5. The MVP profiles

### Base profile
OKF conformance + stable-subject-IRI contract. Serves generic OKF bundles. Graceful degradation
(unknown `type:` → a generic class; missing → untyped), mirroring llm-wiki's own behavior.

### Profile #1 — llm-wiki (primary)
**Reuse the published CRC/LA3D artifacts** as vocabulary/context/shapes:
`https://la3d.github.io/llm-wiki-colab/{ontology.ttl, context.jsonld, shapes.ttl}` — SKOS/RDFS
ontology (16 forward Edge-Types: `up, source, extends, supports, criticizes, concept, partOf,
dependsOn, defines, resolvedBy, incorporatedInto, outOfScopeFor, precedes, feedsInto, related,
mentions`; inverses materialized by pipeline; type taxonomy via `skos:notation`), a JSON-LD context,
and full SHACL shapes. The substrate **adds the missing fourth part — the identity policy** —
replacing the hard-coded `…/llm-wiki-colab/page/` base with a per-pod subject-IRI authority and
elevating the informal git `by:` line to `prov:wasAttributedTo`. The vault shares this ontology, so
**the vault is a bundle under profile #1** (a thin extension adds maturity/Fano/curator rules).

Reconciliation notes: honor (read) llm-wiki's inline "Variant 1" body edge syntax for content
fidelity, but frontmatter edges stay canonical. Flag upstream: `extendedBy` is documented but not in
the pipeline's `INVERSE_PAIRS`; the KG/RDF layer is opt-in and absent from default instances (so most
llm-wiki bundles are base-profile content until enriched).

### Profile #2 — data catalog
Net-new vocabulary/context/shapes over DCAT / CSVW / schema.org (a `BigQuery Table` is a real class,
not `skos:Reference`; a table card requires a `# Schema` block + `resource:`). The existing
`data/alice/ga4/` content is the **bundle** that exercises it. GA4 does double duty: shown raw under
the base profile vs typed under the data-catalog profile, demonstrating profile-driven enrichment.

---

## 6. Projection, derived views, and two-tier discovery

One canonical card in; the profile-parameterized engine derives the rest.

```
agent writes a card (OKF markdown + frontmatter edges)
   │
   ▼  is the target container constrained?  (declares ldp:constrainedBy → profile shapes)
   │     ├─ no  → accept any well-formed card        (loose bundle; curate later)
   │     └─ yes → validate via the Constrained Container interface
   │                fail → 422 + sh:message            pass ↓
   ▼  stored as an LWS data resource
   ▼  projection (proxy-synchronous, or notifications-CDC for bypass writes)
   │     reads the loaded profile; subject = the declared stable IRI
   ▼  derives the views below; records prov:wasAttributedTo
```

| derived view | plane | purpose | tier |
|---|---|---|---|
| `.graph` (RDF, DataBook-crosswalk-compatible) | graph | expressive query / federation | Tier-2 |
| `index.md` (OKF navigation) | knowledge | progressive-disclosure orientation | — |
| type + indexed-relation metadata (LWS Link headers) | storage/discovery | cheap authz-filtered candidates | Tier-1 *(deferred)* |

Discovery progressive: `index.md` (orient) → Type Search (narrow) → Comunica/SPARQL (expressive).

**MVP line.** Working now: card → optional floor → projection (`.graph` + `index.md`, subject-IRI
fixed, profile-parameterized) → Comunica/SPARQL (Tier-2) + the curation app, over JSS's bearer MCP;
Tier-1 is the Comunica-over-`.graph` stopgap. Deferred: real LWS Type Search Tier-1, `lws+json`,
trust/MCP-native.

---

## 7. Governance and the trust seam

**Governance is optional**, supplied by the profile, applied via the LDP/Solid `ldp:constrainedBy`
Constrained Container interface:
- **Admission floor (synchronous, opt-in):** a container may enforce its profile's shapes at write;
  `422 + sh:message` teaches on violation. Strict vs loose bundles is a per-container choice.
- **Curation (asynchronous, optional):** maturity / Fano-bound / contradiction checks become
  *profile-declared rules*, not substrate features. Thin in the MVP; the vault's specific logic ships
  as its profile's rules.

Projection/derivation runs regardless; only the admission gate is optional. This matches the project
governance lesson ("enforce thin; the lever is agent-side disposition") and serves generality.

**Trust seam (deferred, but leave these hooks):**
1. **Record `prov:wasAttributedTo`** on every card/projection now (the one seam worth wiring in the
   MVP — cheap now, expensive to backfill; elevates llm-wiki's `by:` line).
2. **Publish the storage description** (minimal) so identity / sharing / notification services slot in.
3. **Keep agent identity = WAC subject** (already true in JSS) so the CID/did:key suites swap in.
4. **Bake in no trusted/untrusted assumption** — trust attaches at the substrate via provenance.

---

## 8. What "working" proves (acceptance)

A `make test` gate, demonstrating generality via **two structurally-different profiles + the OKF
floor**:

1. Base profile + profile #1 (llm-wiki) + profile #2 (data-catalog) exist as published pod resources.
2. For each: a card written → gets a **declared stable subject IRI** (not file-URL) → the **optional
   floor** behaves correctly (constrained container rejects a non-conformant card with `422 +
   sh:message`; an unconstrained one accepts it) → projection derives `.graph` + `index.md`
   (profile-parameterized, DataBook-crosswalk-compatible) → **read/query back** via Comunica + the app
   over JSS's bearer MCP.
3. `prov:wasAttributedTo` is on the projected graph; a minimal storage description advertises the
   profiles.
4. GA4 shown under base (minimal) vs data-catalog (typed) demonstrates profile-driven enrichment.

---

## 9. Remove / restructure / rebuild / keep

| | what | where |
|---|---|---|
| Remove | location-derived `subjectIri()`; the curly-brace `bodyQuads` extractor (inline SM, dropped); the always-on base-shape mandate; `wiki-memory` as *the* default | `projection/okf/card.mjs`, `constrained-container/` |
| Restructure | `profiles/wiki-memory/` → one profile among ≥2; profiles move repo-config → published pod resources; `ldp:constrainedBy` becomes opt-in with shapes sourced from the profile | `projection/profiles/`, `constrained-container/` |
| Rebuild (net-new) | the profile mechanism (loadable, discoverable); the base profile; declared subject-IRI minting; provenance recording; storage-description publication; profile #1 wiring to the published llm-wiki artifacts; profile #2 (data-catalog) | new `projection` + a profile-publish step |
| Keep | the channel/projection engine; the trigger model (CLI + notifications CDC); the Constrained Container proxy *mechanism*; the curation app; JSS + `make test`; Comunica (Tier-2 / Tier-1 stopgap) | as-is |

---

## 10. Cross-spec tension resolutions

| tension | resolution |
|---|---|
| OKF free-string `type:` vs LWS type-URI vs DataBook `rdf:type` | the profile's JSON-LD context maps `type:` → class IRI |
| OKF `resource:` vs DataBook `id:` vs LWS URI | three distinct notions kept on three planes; we take both `resource:` (aboutness) and a stable subject IRI (identity) |
| frontmatter edges vs DataBook fenced blocks vs inline annotation | frontmatter edges canonical; `# Schema` block is the data-catalog exception; inline annotation read-only (llm-wiki Variant 1), never canonical |
| LWS Type Search vs OKF `index.md` vs DataBook named graphs | different planes/tiers: `index.md` = knowledge nav; Type Search = Tier-1 discovery; `.graph` = Tier-2 query |
| SHACL in three specs | optional, per-container, via `ldp:constrainedBy`; shapes come from the profile |
| identity gap (LWS has it; OKF/DataBook don't) | subject IRI (content, now) + DID/CID (agent, deferred), linked by verifiable provenance |

---

## 11. Open questions (for the plan / later phases)

1. Subject-IRI minting scheme concretely — `w3id`/PID vs content-addressed vs per-pod-namespaced;
   how it composes with a per-pod LWS identity authority.
2. The vault extension profile — exactly which maturity/Fano/curator rules become SHACL vs curator
   logic.
3. Data-catalog profile vocabulary — DCAT vs CSVW vs schema.org coverage for the GA4 shapes.
4. Plane-mapping config format (profile-governed bundle↔container layout).
5. Provenance granularity — per-card vs per-quad; how it pre-positions Ed25519 signing.

---

## 12. Build from ground truth (primary specs)

**The implementing agent MUST build against the primary specs, not from memory.** For most, the
repo already pins them as verbatim grounded skills (auto-loaded at session start) — *invoke the
skill* rather than recalling the spec:

| spec | ground truth | invoke |
|---|---|---|
| **LWS** 1.0 (all 8 modules) | grounded skill (pinned, verbatim) | `lws-protocol` |
| **OKF** v0.1 | grounded skill | `okf` |
| **Solid** Protocol (LDP/WAC/`ldp:constrainedBy`) | grounded skill | `solid-protocol` |
| **SHACL** | grounded skill | `shacl-constraints` |
| **Comunica** | grounded skill | `comunica-sparql` |
| **DataBook** (W3C Holon CG) | **NO grounded skill yet — GAP** | see links below |

**DataBook is the one spec without pinned ground truth.** Until a `databook` grounded skill exists
(recommended — date-pinned snapshot, like `semantic-markdown`, since it is a Cagle-sole-edited
"living document"), build the crosswalk against these primary sources:
- W3C Holon CG DataBook: `https://github.com/w3c-cg/holon` (`architectures/databook/README.md`,
  `documentation/faq.databook.md`)
- CLI + property reference: `https://github.com/kurtcagle/databook` (`databook-property-reference.databook.md`)
- Namespace: `https://w3id.org/databook/ns#` · essay: `https://ontologist.substack.com/p/the-format-convergence`

DataBook is **not needed for Plan 1** (identity) — it is the crosswalk concern in Plans 2–3, so the
gap does not block the immediate next step, but **fill it (create the `databook` skill) before the
crosswalk work**.

Other pointers:
- Exploratory groundwork: `../../design-notes/format-convergence.md` (the four-system design space,
  the LWS substrate alignment — incl. the verified DataBook findings — and the candidate architecture).
- llm-wiki: `crcresearch/llm-wiki-memory-template`; published artifacts at
  `https://la3d.github.io/llm-wiki-colab/{ontology.ttl, context.jsonld, shapes.ttl}` (profile #1's
  vocabulary/context/shapes).
- Kept machinery: `../../projection/`, `../../constrained-container/`, `../../app/`.
- Roadmap/state: `../../ROADMAP.md`, `../../../FOLLOWUP.md`.
