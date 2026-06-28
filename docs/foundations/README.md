# Foundations

The essential, portable knowledge carried into this repo from `cogitarelink-solid` — the
reference archive — deliberately distilled and stripped of CSS-specific implementation. These
four docs are the canon; for anything deeper, reference `cogitarelink-solid` on demand rather
than copying it here.

1. [**Memory substrate**](01-memory-substrate.md) — L1/L2/L3 stratification, the seven
   invariants, dual-layer linking, and why structure helps agents.
2. [**Content model**](02-content-model.md) — concept cards, the typed-edge vocabulary as
   interface operations, two-axis addressing, concept→implementation.
3. [**Governance lessons**](03-governance-lessons.md) — the agentic write contract,
   minimum-viable relational SHACL, and what the cold-probe evals actually found (enforce
   thin; the lever is agent-side disposition).
4. [**Comunica patterns**](04-comunica-patterns.md) — client-side SPARQL over the `.graph`
   aggregate, the traqula override, verified live on JSS.

Companion docs (in this repo, by register):
- [**Spec-vs-JSS conformance map**](05-jss-spec-conformance.md) — the seven eval axes scored
  CONFORMS / EXTENDS / DIVERGES / GAP against the Solid/LWS spec, with the live tests still
  needed. Canon.
- [`../../constrained-container/`](../../constrained-container/) — the standalone SHACL
  admission proxy (the governance floor, shippable on its own).

For **active design deliberation** (exploratory, not canon — do not build from it as settled), see
[`../design-notes/`](../design-notes/): the OKF / DataBook / openclaw / LWS format-convergence
design space, the LWS substrate alignment, the canonical-pod / derived-index synthesis, and the
open authz-over-derived-index problem. The pre-build content-model sketch is archived at
[`../archive/wiki-memory-dual-projection.md`](../archive/wiki-memory-dual-projection.md) (superseded
by `projection/` + [02-content-model](02-content-model.md)).

## What was deliberately left behind
CSS extensions / Components.js config, the 136-shape catalog, CSS-specific decisions and
skills, the upstream `solid-*` spec digests, the eval harnesses, and the pre-JSS multi-user/
w3id realignment direction. Copying those would mislead development in a JSS repo — which is
the contamination this distillation avoids.
