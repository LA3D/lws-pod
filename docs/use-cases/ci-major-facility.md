# Use case — a trusted, agent-ready memory layer for an NSF Major Facility

**Status: illustrative use case.** Captured 2026-06-29 to anchor the general-substrate design in a
concrete scientific-CI scenario from the CI-Compass mission space. Not a commitment to a specific
facility; the facility here is a representative archetype. It motivates the substrate end-to-end and
marks honestly which parts are near-term (content identity + a data-catalog/facility profile) vs the
deferred trust seam (`did:webvh` + ODRL + verifiable history — see
`../design-notes/trust-seam-agent-identity.md`).

---

## Actors

- **The Facility** — an NSF Major Facility producing data products (an instrument archive, a
  distributed sensor observatory, a research vessel/network). Owns its pod; it is the *authority*.
- **Data managers / FAIR stewards** — curate data products and their descriptions; accountable for
  reproducibility and the facility's data-management plan.
- **Science users** — researchers consuming facility data, increasingly *through* LLM-based assistants.
- **Agents** — pipeline agents (QA, calibration, derivation) that *write* products and claims, and
  assistant agents that *read* them on a scientist's behalf.
- **CI-Compass** — the cyberinfrastructure center of excellence helping facilities make data FAIR;
  the substrate is a reusable pattern it could carry across facilities.

---

## The problem

A Major Facility emits many data products — raw and derived datasets, calibration records, QA flags,
provenance logs — described in heterogeneous metadata. Two pressures now collide:

1. **FAIR is mandated** but unevenly realized: variables lack consistent units/semantics, provenance
   is implicit, and "which calibration version produced this number" often lives in a wiki or a
   person's head.
2. **Agents have arrived.** Scientists increasingly reach facility data through AI assistants that
   retrieve via flat search / RAG — **provenance-blind**. An assistant will happily hand a scientist
   a value without knowing its units, calibration epoch, QA status, or whether it is licensed for the
   use at hand. For a facility accountable for reproducibility, that is the elephant in the room
   (Tykhonov's framing, generalized): *agents find data, but cannot tell whether to trust it.*

The facility needs its data to be **navigable and trustworthy by agents**, not just downloadable by
humans.

## The scenario

The facility stands up a **memory pod** as a trusted layer over its data products (not a replacement
for the archive — a knowledge/provenance layer beside it).

1. **Each data product becomes a typed card** with a *stable, location-independent subject IRI*
   minted under the facility's own authority (`{facility-pod}/products/{slug}#it`). Moving the bytes
   in storage does not re-identify the product. [Plan 1 — done]
2. **A facility/data-catalog profile** supplies the vocabulary: variables, units, properties,
   hierarchies (CDIF/DCAT/SOSA candidates — §11 #3), so a card says *what every column means* and an
   agent reads units and semantics, not bare numbers. [Plan 2 — the profile mechanism + Profile #2]
3. **Provenance is explicit**: typed edges link a product to the instrument, the pipeline, the
   calibration version, and the QA decision that produced it (`prov:wasAttributedTo`,
   `wasDerivedFrom`). An agent can trace *this number → this pipeline vN → this calibration epoch*.
   [Plan 2 content edges; richer PROV granularity — §11 #5]
4. **A pipeline agent that writes a product is identified** (a `did:webvh` under the facility domain),
   so every claim carries a verifiable "who asserted this." The `did.jsonl`-style log is the audit
   trail data managers need for reproducibility. [deferred trust seam]
5. **Usage is governed**: WAC controls access; **ODRL** expresses *usage* policy — embargo windows,
   attribution obligations, "QA-flagged data not for publication," redistribution terms — so an
   assistant knows not just whether it can read a product but what it may *do* with it. [deferred
   trust seam]
6. **A science assistant navigates the typed graph** by progressive disclosure (facility index →
   product family → product → provenance), instead of flat retrieval — and answers *"what produced
   this value, in what units, under what calibration, and may I use it for a publication?"* with a
   traceable, policy-aware answer. [kept machinery: projection + the curation app]

## What it demonstrates

- **Structure-helps-agents, on real CI.** [hypothesis — this is the testbed claim] A provenance-blind
  flat-RAG assistant (the Porter control) and a typed-substrate assistant answer the same
  facility-data questions; the typed one can ground units, calibration, QA, and licensing and the
  flat one cannot. The Major-Facility setting is a high-stakes instance of the eval thesis.
- **The facility as its own identity authority** — content IRIs under the facility origin, agents as
  facility-scoped DIDs. Scalable (no central registry), dereferenceable (resolves at the facility
  pod), portable per-namespace if the facility moves infrastructure. The whole four-plane identity
  model on one concrete actor.
- **A reusable CI-Compass pattern** — FAIR-by-design + agent-ready + trust, as a profile + pod
  recipe a facility adopts, not bespoke engineering. This is the substrate's "trusted agentic
  engineering for science" thesis made concrete in the CI-COE mission.

## In-scope-now vs deferred (be honest)

| Capability | Status |
|---|---|
| Stable subject IRI per product card | **done** (Plan 1) |
| Facility/data-catalog profile (variables, units, semantics) | **Plan 2** — the profile mechanism + Profile #2; vocabulary choice is §11 #3 (CDIF/DCAT/SOSA/CSVW) |
| Provenance edges (instrument/pipeline/calibration) | **Plan 2** content edges; per-quad/temporal granularity is §11 #5 |
| Progressive-disclosure navigation + the eval control | **kept machinery** (projection, app) — usable now |
| Agent DID identity + verifiable log | **deferred trust seam** (`did:webvh`) |
| ODRL usage policy (embargo, attribution, QA, redistribution) | **deferred trust seam**; complements SHACL admission + WAC access |

So the **FAIR + navigation + structure** half of this use case is reachable on the Plan-2 horizon; the
**identity + policy + audit** half is the later trust-seam layer. The use case is the north star that
keeps the two halves coherent.

## Alignment

This is the same architecture CODATA/CDIF4EOSC are building for EOSC (DIDs for contributors, CDIF for
variables, ODRL for policy, full provenance) — landed on an NSF Major Facility instead of EOSC. For a
CI-Compass Co-PI on the FAIR working group, it is the substrate's positioning surface: the FAIR-data
and trusted-agentic-AI lanes are the same lane, and the Major Facility is where they meet.

## Open questions

- **Facility profile vocabulary** (§11 #3): CDIF (EOSC-aligned, variable semantics) vs DCAT
  (dataset-level) vs SOSA (observations/sensors) vs CSVW (tabular) — likely a layered combination,
  profile-governed.
- **Provenance granularity** (§11 #5): per-product card vs per-observation vs per-quad; how it
  pre-positions the verifiable log / signing.
- **Plane mapping** (§11 #4): how a facility's product/container layout maps to the bundle↔container
  model without leaking storage structure into subject IRIs.
- **Whose DID** signs a derived product — the pipeline agent, the data manager, or the facility — and
  how that composes with VC-issued authority.

---

**Related:** `../design-notes/trust-seam-agent-identity.md` (the identity/policy/provenance stack this
use case leans on), `../superpowers/specs/2026-06-28-general-memory-substrate-design.md` (§11 open
questions), `../design-notes/format-convergence.md` (the format groundwork).
