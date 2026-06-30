# LWS L3 — SHACL admission as an LWS-native, per-resource constraint

**Status: decided (design of record for L3).** Captured 2026-06-30 from the design dialogue + this
session's spec research (four GitHub/spec deep-dives: Solid constraint discovery, the LWS working
group, Shape Trees + `ldp:constrainedBy` implementations, RO-Crate/ro-curate) and grounded against the
pinned LWS core, vocabulary, and Type-Search modules. Resolves *what L3 constrains, where the
constraint lives, and how it is enforced and reported*. Reframes the existing `constrained-container/`
proxy onto an LWS-native model and supersedes the ROADMAP's L3 line ("constrained-container SHACL
admission, fronting the fork") — L3 moves **in-process** and **per-resource**, not container-fronting.

### Claim status
- **[verified]** — checked against a primary source this session (spec text, repo, or fork code).
- **[decided]** — a choice we have made; flippable, this is the current call.
- **[deferred]** — explicitly out of scope here; named where it lives.

### Lineage
Builds on **L1** (`application/lws+json` `items[]` container) and **L2** (storage description +
RFC 9264 linkset), both merged into `la3d/lws`. L3 rides its own `la3d/*` branch, `git merge --no-ff`
into `la3d/lws` (solo-dev merge model). **Plan 2** (profile mechanism + `resolveStorageAuthority`)
slots after L3; **L4** (OKF projection rewritten to LWS shapes) after that.

---

## 1. The problem, reframed by the research

The committed framing was "L3 = the standalone `constrained-container/` SHACL proxy, fronting the
fork." Before porting it in-process we did the spec deep-dive the substrate thesis demands. It changed
the design materially. The settled facts:

- **`ldp:constrainedBy` is discovery-only and non-normative.** [verified] It originates in **LDP 1.0
  §4.2.1.6** — servers publish a `Link` header so clients can *find* the rules; LDP "neither defines
  nor constrains the representation of the link's target" (natural-language constraint docs are
  allowed). **Solid Protocol §5.6** carries it as *explicitly non-normative* ("Servers are
  *encouraged*…"), names no constraint language, and mandates no status code. The actual
  "validate-writes-against-a-shape" requirement is **solid/specification#86 — open, zero comments,
  never worked**, which defers to the Data Interoperability Panel's data-validation effort (now
  `archive/`d, an empty `hypothesis.md` — stalled).
- **No mainstream Solid server enforces shape-validation on write.** [verified] CSS's attempt
  (`CommunitySolidServer#1000`, "Shape support") was **closed unmerged** (2023-02). NSS/Inrupt ESS:
  nothing out of the box. The only worked-out admission model is **Shape Trees** — and its reference
  implementations ship as **client/proxy interceptors**, not server enforcement, and validate with
  **ShEx**, not SHACL.
- **You cannot shape-validate non-RDF bytes — and the ecosystem says so explicitly.** [verified] Shape
  Trees governs a `st:NonRDFResource` by **type + name + placement**, never reading the body
  (confirmed in `shapetrees-java`: the body is not loaded into a graph for non-RDF). RO-Crate
  validates the **metadata graph that describes** files, never the file bytes. The honest model the
  whole field converged on: *non-RDF resources are described, not shaped.*
- **LWS itself defines no constraint/shape/validation mechanism.** [verified] Zero hits for
  `constrainedBy`/`shacl`/shape/validation in `w3c/lws-protocol` or `w3c/lws-ucs` spec text. The one
  spec-side thread that brushed admission (`lws-protocol#110`) was ruled out of scope. The exact analog
  is one untriaged use case, **`lws-ucs#93` "Custom validation of requests that mutate data"** ("only
  triples of specific shape can be added or removed") — open, no requirement, no champion. LWS also
  *weakens* the RDF guarantee: a data resource "only needs to preserve the resource's bytes — there is
  no requirement to extract an abstract RDF graph."

**Conclusion.** L3 is **not a conformance layer** — there is no spec to conform to. It is a deliberate
extension that *front-runs* `lws-ucs#93` and `solid/specification#86`, and the genuinely novel
contribution (nobody ships it) is **write-time admission with structured feedback**. We are free —
and obliged — to wire it the way that fits the LWS resource model, not to copy a guess. (Cite
`lws-ucs#93` / `solid#86` as the upstream hooks; this work is candidate input to them.)

---

## 2. The LWS-native model (the core decision)

**[decided]** A constraint is **per-resource, addressed by URI, declared in that resource's linkset,
and enforced on write.** Stated as one rule:

> A `describedby` web link in a resource's **linkset** (the LWS metadata resource, from L2), with a
> shape resource as its target, declares that **the RDF graph of the resource the linkset belongs to
> MUST conform to that shape.** On a write to that resource, the server validates the incoming graph
> against the shape: conform → admit; violate → reject. The validation report is returned to the
> client as structured feedback regardless of outcome.

This is uniform across every LWS resource that has an RDF graph — there is no special "container
descriptor" or per-resource `.meta` concept, and no conflation of a container with the things it
contains. You attach the constraint to **the URI whose graph you mean**:

| To constrain… | Put `describedby → <shape>` in the linkset of… | L3 validates, on write to that URI |
|---|---|---|
| an **RDF data resource's** representation | that data resource | its incoming representation graph |
| a **container's** own graph (its `items`, metadata) | that container | the container graph |
| a resource's **metadata** graph itself | that metadata (linkset) resource | the (client-managed) metadata graph |

**Why this and not the alternatives we considered:**
- **Not per-resource `.meta`-as-separate-sidecar.** [verified] Solid description resources are a second
  resource written in a *second, non-atomic* request, and JSS does not implement them as first-class
  writable description resources today (`.meta` is only an allowed dotfile). The two-write window makes
  admission semantics murky. **LWS dissolves this**: the metadata resource *is* the linkset (L2), and
  `Prefer: set-linkset` (LWS core §9, update-resource) lets a client write content **and** linkset
  links in **one atomic operation**.
- **Not RO-Crate's container-level descriptor or its `must/should/may` requirement tiers.** RO-Crate
  was an informing use case only (§7); its profile-requirement tiers live "further down the application
  stack." We keep L3 in the realm of the **LWS core + vocabulary + SHACL**, with SHACL's own severities
  carrying the levels (§4).
- **Not container-governs-contained as the primitive.** The container's own constraint governs the
  container's *own* graph; constraining *members* is a separate, explicit declaration (§5
  bootstrapping), never an implicit side effect of constraining the container.

**Non-RDF resources** are handled by construction: their bytes are never validated. A non-RDF data
resource carries no representation-shape; if you want to govern it, you constrain its **metadata
resource** (a different URI, always RDF) — "describe, don't shape," exactly the field consensus.

**Discovery relation = `describedby` (RFC 8288), LWS-native.** [verified] LWS expresses all metadata
as typed web links from a resource, and the Type-Search module's own example queries on
`describedby=<shape>` to select "resources schema-validated by" a shape (§6). We lead with
`describedby`; `ldp:constrainedBy` is the Solid analog and **MAY** additionally be emitted on the
rejection response for Solid-client interop, but `describedby` is canonical here.

---

## 3. Architecture (in-process, profile-neutral)

**[decided]** In-process in the fork, consistent with L1/L2, retiring the standalone proxy.

```
handlePut / handlePost / handlePatch  (src/handlers/resource.js, --lws)
   └─ admit(resourceUrl, incomingGraph)          // src/lws/admission.js
        ├─ shapeUrl = describedbyShape(resourceUrl)   // read from the resource's linkset (L2)
        │     └─ null  → pass through (opt-in: no constraint declared)
        ├─ report = validate(incomingGraph, shapeFor(shapeUrl))   // src/lws/shacl.js seam
        ├─ violations(report)?  → 422 + Link rel="describedby" + structured report  (do NOT write)
        └─ else                 → storage.write(...) ; attach warnings/infos to the response
```

- **`src/lws/admission.js`** — the engine. Resolves the shape from the resource's linkset, extracts the
  incoming RDF graph (per content-type / conneg — the same parsing L1/L2 already do), runs validation
  through the seam, maps severities to admission + feedback (§4), formats the response. Knows nothing
  about OKF, RO-Crate, cards, or any profile. `--lws`-gated; the default LDP path is provably unchanged
  (negative-control tests, as in L1/L2).
- **`src/lws/shacl.js`** — the **only** importer of the SHACL engine. Exposes
  `validate(dataGraph, shapeGraph) -> report` and nothing else. **[decided]** Engine =
  `rdf-ext/shacl-engine` pinned to the **1.2-refactor commit `ce39d07`** via an exact git SHA in the
  fork's `package.json` (`github:rdf-ext/shacl-engine#ce39d07…`), *not* a moving branch ref —
  reproducible like `Dockerfile.fork`'s `JSS_GIT_REF`. The 1.2 work is an unpublished breaking `feat!`
  (434 files; reworked `Validator.js`/`Engine.js`/`Factory.js`), so the seam is **load-bearing**: if
  the 1.2 API churns, we adapt one file. (Risk accepted deliberately; 1.1.1 stable is the fallback the
  seam also affords.) The engine pulls a heavier dep footprint (the 1.x line added `@comunica/*` for
  SPARQL constraints) — acceptable.

The constraint is **opt-in by construction**: a resource with no `describedby→shape` in its linkset,
and every non-RDF/non-write request, passes through with zero validation overhead.

---

## 4. Severity = SHACL `sh:severity`, surfaced as agentic feedback

**[decided]** The **shape-defining agent** sets severity, using SHACL's native `sh:severity`. L3 does
not impose its own tiering. The three SHACL levels map to admission behavior **and** to feedback the
agentic harness can act on:

| `sh:severity` | Admission | In the response | Intended agent action |
|---|---|---|---|
| `sh:Violation` | **reject** (`422`) | the failing results (`sh:message`, `sh:resultPath`, `sh:focusNode`, `sh:value`) | fix the cited fields and retry — these MUST be present |
| `sh:Warning` | **admit** | reported alongside success | something concerning but non-blocking; agent may choose to correct |
| `sh:Info` | **admit** | reported as advisory | optional-but-useful enrichment the agent **may** add via a follow-up PUT/PATCH |

The point the design turns on: **the full SHACL validation report is structured feedback to the
agentic harness, not just pass/fail.** A write that succeeds but is missing useful-optional metadata
comes back with `Info` results telling the agent exactly what an enriching follow-up write would add —
the same teaching channel the constrained-container `sh:message` already pioneered, now graded and
returned on *success* as well as rejection.

**Response shape (sketch, finalize in the plan).** On `422`, body carries the violation results +
`Link: <shape>; rel="describedby"`. On admission with warnings/infos, the results ride a response
header/body the harness can parse (candidate: an RFC 9457 `application/problem+json`-shaped advisory,
or a `Warning` header per the current proxy — **[deferred]** exact serialization to the plan; it MUST
be machine-parseable and carry severity + `sh:message` + path + focus node).

---

## 5. Declaration, attachment, and the bootstrapping case

**The application-building agent declares the constraints when it provisions the container.** [decided]
Building a research-storage application in LWS means the provisioning agent writes the
`describedby→shape` links into the relevant resources' linksets as part of *designing* its storage.
Mechanics, all LWS-native:

- **Attach a constraint:** write `describedby → <shape>` into a resource's linkset — via `PATCH`
  (`application/merge-patch+json`) on the linkset URI, or atomically with content via
  `Prefer: set-linkset` (LWS core §9). Both already exist in the spec; no new wire format.
- **The shape resource** is an ordinary RDF resource in the pod (Turtle/JSON-LD), addressable by URI,
  server-protected and client-immutable per the spirit of LDP §5.6 (constraints are "protected and
  persistent"). Its URI is what `describedby` targets.
- **Bootstrapping a not-yet-existing resource** (create-time, no linkset yet) — **[decided]** support
  **both**, both optional:
  1. **Container member-rule** — the container declares that resources created in it are
     `describedby <shape>` (a container-scoped default, distinct from a constraint on the container's
     *own* graph). On `POST`, the new resource inherits it.
  2. **Request-carried** — the create request supplies the `describedby` `Link` (via `Prefer:
     set-linkset`), declaring the shape for the resource being created.

---

## 6. Type-Search synergy (sanity-checked, no conflict)

**[verified]** L3 does not affect the LWS Type-Search module — and the two reinforce each other:

- The Type-Search spec's own example queries `GET /types/search?type=…&describedby=<shape>` and
  describes it as selecting "resources schema-validated by" that shape. So **`describedby→shape` is
  already a recognized, queryable descriptive relation** — the relation Type-Search is designed to
  filter on. Our discovery hook *is* its query key.
- The index is **server-managed and derived from Link headers at create/modify, never by parsing
  bodies**; `describedby` is a *descriptive* (index-eligible), not structural, relation. One
  `describedby` declaration feeds both L3 (enforce) and the index (discover) — consistent by
  construction.
- **The synergy:** without L3, a `describedby=<shape>` index entry is an *unenforced claim*. With L3
  admission, it is a *warranty* — the resource was admitted only because it conforms. L3 turns the type
  index's `describedby` filter from "claims to be validated by X" into "is validated by X," which is
  exactly the verified-progressive-disclosure the substrate thesis wants. L3 changes nothing about how
  the index is built or queried.

---

## 7. Profile-neutrality — use cases are shapes, not engine code

**[decided]** L3 has no knowledge of any application profile. The use cases that pressure-tested the
design become **shapes attached to URIs**, swappable without touching the engine:

- **OKF / wiki-memory** (L4) — a concept card's RDF graph (its projection, or the card if authored as
  RDF) is constrained by a wiki-memory shape declared in the card's (or container's) linkset. "Proper
  metadata" is whatever that shape requires; the agent learns it from the graded report.
- **RO-Crate** — *informing use case only.* It confirmed (a) constrain the metadata graph that
  describes non-RDF files, never the bytes, and (b) "structure imposed by a profile, discovered not
  baked in." We **adopt the principle**, realized through LWS `describedby`+SHACL — and we **reject**
  importing RO-Crate's `conformsTo`/PROF profile machinery and `must/should/may` requirement tiers
  (application-stack concerns, out of L3's LWS-core scope). An RO-Crate crate in a pod is simply its
  `ro-crate-metadata.json` data resource carrying a `describedby→<ro-crate-shape>`.

**Round-1 scope.** **[decided]** Build and test the generic LWS-native admission engine + severity
feedback against representative shapes, proving profile-neutrality by validating **two unrelated
shapes through the one engine** (e.g. the wiki-memory shape and a minimal generic shape) — *without*
adopting any profile-selection framework. Full profile resolution (which shape applies, from a
container's declared profile + storage authority) is **Plan 2**, not L3.

---

## 8. Explicitly deferred

- **[deferred]** Profile *resolution* (`resolveStorageAuthority`, profile→shape selection) → **Plan 2**.
- **[deferred]** OKF projection rewritten to LWS shapes (the RED wiki-memory suite) → **L4**.
- **[deferred]** Constraint **mutation** concurrency beyond what L2's linkset already specifies
  (If-Match/412/428 on the linkset is L2's; L3 reads the declared shape, does not add new mutation
  surface).
- **[deferred]** `ldp:constrainedBy` co-emission for Solid interop (MAY; not required for L3).
- **[deferred]** Exact machine-readable serialization of the warning/info advisory channel → the plan.
- **[deferred]** SHACL-SPARQL / advanced constraints beyond Core node/property shapes — the engine
  supports them; we neither require nor forbid them in round 1.
- **[deferred]** Validating a write against a constraint declared on a *different* resource's behalf
  (cross-resource shapes) — round 1 is "the resource's linkset names the resource's shape."

---

## 9. Spec grounding (citations)

- **LDP 1.0 §4.2.1.6** — `ldp:constrainedBy` is publish-on-failure discovery, format-neutral.
- **Solid Protocol §5.6** (pinned `solid-protocol` skill) — non-normative; `solid/specification#44`
  (PR #185 merged non-normative), **#86** (data validation, open), #28 (structured errors → RFC 9457).
- **Shape Trees** (`shapetrees/specification`, `janeirodigital/shapetrees-java`) — `st:expectsType`
  {Container, Resource, NonRDFResource}; non-RDF governed by type/name/placement; ShEx in practice.
- **RO-Crate** (`researchobject.org/ro-crate`, `crs4/rocrate-validator`, `ResearchObject/ro-curate`) —
  container-descriptor graph; `conformsTo`/PROF profile selection; batch validation, no write-time gate.
- **LWS core** (pinned `lws-protocol` skill, `lws10-core`) — auxiliary/primary resources; the
  **linkset** as the metadata resource; `Prefer: set-linkset` atomic content+metadata write;
  system/core/user metadata tiers; `describedby→schema` in the linkset example.
- **LWS Type-Search** (`lws10-searchindex`) — `describedby` as an indexed, queryable descriptive
  relation; server-managed, Link-header-derived, body-agnostic.
- **`lws-ucs#93`**, **`solid/specification#86`** — the upstream hooks this work front-runs.

---

## 10. Decisions log

| # | Decision | Status |
|---|---|---|
| 1 | L3 in-process in the fork (`src/lws/admission.js`), `--lws`-gated; retire the standalone proxy | [decided] |
| 2 | Constraint = `describedby→shape` in a resource's **linkset**; per-URI; validates that resource's RDF graph on write | [decided] |
| 3 | Non-RDF bytes never validated; govern a non-RDF resource via its metadata resource if at all | [decided] |
| 4 | Severity = SHACL `sh:severity`, set by the shape-defining agent; Violation→reject, Warning/Info→admit+report | [decided] |
| 5 | Full validation report returned as structured agentic feedback on **both** rejection and admission | [decided] |
| 6 | Engine = `shacl-engine` pinned to git SHA `ce39d07` (1.2 refactor), isolated behind `src/lws/shacl.js` | [decided] |
| 7 | Discovery relation = LWS-native `describedby`; `ldp:constrainedBy` optional Solid-interop co-emission | [decided] |
| 8 | Constraints declared by the application-building agent at provision time; attach via PATCH/`Prefer: set-linkset` | [decided] |
| 9 | Bootstrapping: support both container member-rule and request-carried `describedby` | [decided] |
| 10 | No RO-Crate requirement tiers / profile machinery; stay in LWS core + vocab + SHACL | [decided] |
| 11 | Round 1 proves profile-neutrality via two unrelated shapes through one engine; profile *resolution* is Plan 2 | [decided] |

---

## 11. Testing posture (to be detailed in the plan)

Following L1/L2: `--lws`-gated, additive, with **negative controls** proving the default LDP path is
unchanged. Cover: opt-in (no `describedby` → pass-through); Violation → 422 + `describedby` Link +
parseable report; Warning/Info → admit + report; the `Prefer: set-linkset` atomic declare+write path;
container member-rule vs request-carried bootstrapping; profile-neutrality (two unrelated shapes, one
engine); and a live-pod gate analogous to `make test-lws`. The engine seam gets unit tests against the
pinned `ce39d07` API so a future bump is caught in one place.
