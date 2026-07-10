# IRI and vocabulary minting — resolution

**Status: decided.** Resolves spec §11 #1 (subject-IRI minting scheme). Captured 2026-06-29 from the
design discussion + grounding against LWS core, the Solid/JSS storage model, the W3C vocab-pub
recipes, and the LWS self-signed identity suites. This is a decision record; it supersedes the
"bare pod origin vs PURL" framing the discussion started with. The spec §11 #1 points here.

### Claim status

- **[verified]** — checked against a primary source this session (date/loc noted).
- **[decided]** — a choice we have made; flippable, but this is the current call.
- **[deferred]** — explicitly out of scope for this resolution; named where it lives.

---

## What this resolves, and the one principle

The task was "pick the base/slug/version for a minted subject IRI." Grounding turned it from *pick
literals* into *define a mechanism + a few profile parameters*. The unifying principle [decided]:

> **The authority is discovered, never hardcoded; it is URI-typed (https now, DID/CID later); identity
> is independent of storage location; reuse resolvable vocabularies before minting.**

Three planes, three different authorities — keep them distinct.

---

## Plane 1 — content subject IRIs (the cards)

```
{authority}{profile-path}/{slug}{-version?}#it
```

**`{authority}` — resolved, not hardcoded.** [decided] The base is the pod's **storage authority,
discovered at deploy from the pod's own self-description**, never a config literal and never parsed
from a storage path. Two discovery layers:

- **Today (Solid/JSS):** the WebID profile carries a `storage` property (`pim:storage`; JSS emits
  `"storage": "./"` — [verified, jss pod-structure.md]). The login flow already returns the WebID.
  Dereference WebID → read `storage` → resolve → storage root. The W2 app already does this
  (`storageBase(webid)`); the projection's identity policy must adopt the same.
- **Standards-track (LWS):** the **Storage Description Resource** has a REQUIRED `id` — "a URI that
  identifies the storage" — discoverable via `Link: …; rel="https://www.w3.org/ns/lws#storageDescription"`
  on any storage GET/HEAD. [verified, LWS Discovery.html] JSS does not emit this link header yet (its
  LWS work is on the CID auth suite), so the WebID `storage` hook is today's path; the storage
  description `id` is the upgrade.

**Why discovery, not a literal:** LWS core §Resource-Identification is normative —
*"the URI of a resource is independent of its position in the containment hierarchy… clients SHOULD
NOT assume that URI structure reflects containment."* [verified, lws logicalresourceorganization.md]
Hardcoding or path-parsing a base is spec-noncompliant. The institution mints the DNS host + TLS
cert, so the discovered authority **is** the institutional authority by construction.

**URI-typed → DID-ready.** [verified, LWS Discovery.html] The storage `id` is "a URI," and a DID is a
URI; the spec lets the storage `id`, storage-description URI, and storage root be distinct. So an
institution may declare its authority as a bare https host, a stable PID, or a DID — and the minting
policy reads whichever. https is the default (fast, LDP-native dereference); `did:webvh`/CID is an
opt-in upgrade requiring no change to the mechanism. This is the payoff of resolving rather than
hardcoding.

**`{slug}` — content-derived, profile-governed.** [decided] The slug is derived from the card's
content/declared identity, **never** the storage path (per Resource-Identification above). The
*strategy* is a profile parameter: **filename-stem** for flat concept spaces (llm-wiki), **bundle
path** for hierarchical ones (data-catalog/facility). Profile-governed is the on-thesis choice
("profile = schema") and confines collisions to where a profile actually nests. (Adopted as the
recommended default; flippable to a single global path rule if the per-profile mechanism proves not
worth it.)

**`{profile-path}`** — a profile-declared namespace segment grouping content subjects (e.g. `/kb/`),
so the subject-IRI plane does not collide with arbitrary storage resources.

**`-version?`** — optional version segment, **off by default**, declarable per-profile/card (DataBook
`-v{version}` precedent). [decided]

**declared `id:`** — a card declaring a frontmatter `id:` overrides minting entirely (global PID
escape hatch — DOI/ORCID/w3id). Already shipped in Plan 1. [verified, projection/okf/identity.mjs]

**Namespace style:** **slash**, per the W3C vocab-pub recipe — instance data is large and growing.
[verified, W3C swbp-vocab-pub] `#it` fragment keeps the concept distinct from its document
(httpRange-14).

**Honesty flag — minting ≠ dereference.** This decides how the *identity* is formed. Mapping that
subject IRI back to a dereferenceable stored card is a **separate** concern (the plane mapping, spec
§11 #4), handled by the discovery layer (`rel="up"`, `describedBy`, the type index) — **not** by
assuming URI = storage path. Kept distinct so identity does not silently re-couple to location.
[deferred → §11 #4]

### Plane 1 — graph semantics (added L4b Phase A)

The name/dereference separation above is now realized **in-band** via JSON-LD 1.1:

- A resource's RDF is a JSON-LD **graph object** `{ "@id": <graph name>, "@graph": [ <nodes> ] }`.
  The **graph name is the document IRI** (`{authority}{profile-path}/{slug}`); the **subject** is the
  `#it` fragment within it. Two distinct `@id`s at two levels (httpRange-14).
- **Serialization is JSON-LD 1.1 only** on the agent path. TriG is an optional conneg export; Turtle is
  an *unnamed union* export only (it cannot carry a graph name; the fork's Turtle conneg drops `@graph`).
- **Containment:** a resource = one named graph; a **container = the dataset** (members are its named
  graphs, name = the member's in-band `@id` (doc IRI), else its URL); an **aggregate derived view** may
  be a resource-as-dataset (multi-`@graph`) when its declaration asks (`mode: dataset`).
- **Read-side minimum:** a derived view's `named_graph` is its own pod resource URL, so the graph name is
  directly dereferenceable. For a card whose graph name is the authority doc IRI (≠ storage URL), the
  resolution is the plane mapping (`rel="up"`/`describedby`/type index) — the read half of §11 #4.

### Plane 1 — read-side plane mapping (RESOLVED, conneg-by-profile)

§11 #4 (subject-IRI → dereferenceable stored representation) is now **[resolved]**, closed by
conneg-by-profile Phase 1+2 (`docs/superpowers/specs/2026-07-06-profile-conneg-instantiation-design.md`,
shipped through 2026-07-10). Three findings:

- **(a) Realized in-band.** A client resolves a memory by **GETting its canonical URL and negotiating
  the profile**: `Accept-Profile` on the canonical URL returns **200 self** when the canonical
  representation already matches (llm-wiki: `content`, markdown, `self: true`/`default: true`), or
  **303** to the materialized representation that does (e.g. `.links.jsonld` for the RDF-consuming
  case). No separate plane-mapping header walk is needed for this hop — the conneg *is* the
  dereference. `rel="up"`/`describedby`/type index remain the walk for discovering the profile and
  its shapes in the first place; conneg is the walk for landing on the right *representation* of a
  given resource once the profile is known.
- **(b) Membership steering.** A linkset-only agent must **never** read container membership off the
  linkset (a container's linkset carries governance edges — `describedby`/`conformsTo` — not a member
  list). Members are enumerated via **`items[]`** (the L1 `lws+json` container representation) or
  **TypeSearch** (`/types/search`, authz-filtered). This is steering, not new machinery — recorded
  here because §11 #4 used to conflate "how do I find the container's profile" with "how do I find
  the container's members," and conneg-by-profile forced the two apart.
- **(c) Read-side leanings — now design of record**, not a leaning under debate:
  - The **`up`-walk contract stands**: governance edges (`describedby`, `conformsTo`) live on the
    **container's** linkset, not the member's; a member reaches its profile via `rel="up"`.
  - **Container `conformsTo` beats the pod-wide `defaultProfile`** — a bound container's own
    declaration always wins over any pod-level default.
  - **Plural bindings AND-compose for validation** (a member must satisfy every bound shape); **which
    binding is most-specific for *content negotiation*** (which representation/context to prefer) is
    a **client/conneg concern**, not something the substrate arbitrates server-side.
  - **Earned-at-admission member `conformsTo`** (stamping a validated member with its own
    `conformsTo` as a provenance fact, rather than only inferring it via the `up`-walk) **stays an
    open option, not asserted** — recorded as a live design input, not shipped.

---

## Plane 2 — vocabulary minting (reuse-first)

**Style:** **hash** namespace (`…/ns#Term`) — vocabularies are small and stable.
[verified, W3C swbp-vocab-pub] The authority is the *vocabulary owner's* PID — a different authority
from the content/storage one.

**Reuse before minting [decided] — prefer resolvable vocabularies, in this order:**

1. **W3C-hosted core** — `dcterms`, SKOS, DCAT, PROV, **CID-1.0**, `acl`. Reuse as terms; never
   re-mint. (We reuse `w3.org/ns/…` — we control it no more than anyone, but it is the right
   authority for these.)
2. **DataBook `db:`** (`https://w3id.org/databook/ns#`) — already a resolvable w3id; reuse for
   provenance / process-stamp / graph-metadata terms where they fit. [verified, databook skill]
3. **OKF field conventions** — `type`/`title`/`description`/`resource`/`tags`/`timestamp`. OKF is a
   *content-shape* layer, not an RDF namespace, so "reuse OKF" means adopt its frontmatter
   vocabulary and map it to standard RDF (dcterms, etc.) — which the wiki-memory context already does.
   [verified, okf skill]
4. **llm-wiki published ontology** (`la3d.github.io/llm-wiki-colab/…`) — Profile #1's Edge-Types /
   SKOS/RDFS / SHACL. Reuse as-is.
5. **Mint our own terms only for the gap** — under a **w3id-*shaped* base we control** (an
   la3d/own-domain or `la3d.github.io` base), **no real w3id.org registration yet**. [decided] We do
   not register w3id until federation is real and it is clear what would be registered; the shaped
   base upgrades to a real w3id with one redirect change when that day comes.

---

## Plane 3 — agent / owner identity (separate plane)

Not a content IRI. A **Controlled Identifier (CID-1.0)** — the abstraction LWS standardized on; its
two self-signed suites are `did:key` (self-contained, hosting-free) and CID-generic (dereference the
identifier → a controlled-identifier document → verification method). [verified, lws
authn-ssi-{did-key,cid}] An https-WebID, `did:web`, or `did:webvh` are interchangeable controlled
identifiers. **Bind to CID, not to one DID method**; `did:webvh` is our *preferred concrete*
identifier for institutional agents (web-hosted, rotation, verifiable history — we have the
hosting), `did:key` for hosting-free bots. Content → identity via `prov:wasAttributedTo`. Full detail
in [`trust-seam-agent-identity.md`](trust-seam-agent-identity.md).

---

## Decided sub-forks (the two that were open)

| Fork | Decision |
|---|---|
| Slug strategy | **profile-governed** (filename flat / path hierarchical) — adopted recommendation; flippable |
| Vocab PID concreteness | **w3id-shaped base we control, no registration yet**; reuse W3C-hosted + DataBook + OKF first |

---

## Plan-2 interface requirements (so a hardcoded base cannot sneak in)

The profile mechanism Plan 2 builds must carry the minting scheme as profile-declared, with the
authority resolved at runtime:

- **`resolveStorageAuthority(webid | resource) → URI`** — a new step; `makeIdentityPolicy` takes the
  *resolved authority*, not a config literal. The `urn:okf:base/` placeholder in `base-profile.mjs`
  becomes "resolve from the pod at deploy."
- The policy stays **URI-typed** (https now, `did:`/CID later) — no scheme assumptions in engine code.
- **Slug strategy** and **`{profile-path}`** are **profile parameters**; the **vocabulary context**
  is profile config (already is). So a profile *declares* its minting: authority resolver + slug
  strategy + namespace + context.
- Full per-deploy wiring of the resolved authority is the Plan-3 "storage IRI authority" step; the
  *seam* must exist in Plan 2.

---

## Deferred (named)

- ~~Subject-IRI → storage-location dereference (plane mapping) — **§11 #4**.~~ **RESOLVED** —
  see "Plane 1 — read-side plane mapping (RESOLVED, conneg-by-profile)" above +
  `docs/superpowers/specs/2026-07-06-profile-conneg-instantiation-design.md`.
- Provenance granularity (per-card vs per-quad), pre-positioning signing — **§11 #5**.
- Real w3id registration — when federation is real.

---

## Sources [verified 2026-06-29]

- LWS core — `Discovery.html` (storage description `id`, `rel=…lws#storageDescription`),
  `logicalresourceorganization.md` (Resource-Identification: URI ⊥ containment)
- LWS self-signed identity — `lws10-authn-ssi-did-key`, `lws10-authn-ssi-cid` (CID-1.0 abstraction)
- JSS — `reference/pod-structure.md` (WebID `storage`), `features/lws.md` (CID-shaped profiles)
- W3C *Best Practice Recipes for Publishing RDF Vocabularies* (hash vs slash) — TR/swbp-vocab-pub
- DataBook `db:` namespace, OKF field conventions — the `databook` / `okf` grounded skills
