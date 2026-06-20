# Agentic governance & minimum-viable SHACL

What `cogitarelink-solid`'s eval program actually learned about constraining agent writes —
the lessons, not the CSS-pod probe reports. This is the evidence base for keeping enforcement
*thin*.

## The agentic write contract

An agentic app SHOULD describe and provenance **every** resource it writes — governed
metadata with the agent's rationale (why this write, what it concluded) + provenance (who
wrote it, human + agent). LDP/Solid only *MAY* attach such metadata; **adding the MUST is the
defining agentic-vs-Solid difference.** Construct (write the contract) and consume (audit it
before trusting a value) are two halves of one provenance layer.

## What the evals actually found (six independent cold-probes)

- **Agents read shapes as *guidance*, not gates.** Across every write probe they front-loaded
  discovery — fetched the shape / `sh:agentInstruction`, conformed first-try — so the 422
  backstop *almost never fired* (single-digit n, but consistent).
- **The format-shape catalog was inert.** A large catalog of structural shapes (prefLabel,
  types, etc.) never bit — LLMs emit that structure unprompted. It neither constrained nor
  taught; it was maintenance burden. (This is the over-build the project flagged in its own
  reports.)
- **One constraint shaped behavior: the un-guessable MUST.** The provenance/rationale
  requirement — the thing an LLM won't produce unprompted — is the only constraint that bent
  behavior, and it worked via a **laden teaching 422**: when it fired with a message saying
  *what to record and why*, agents read it and corrected.
- **The lever is agent-side disposition, not pod-side machinery.** View/conneg/profile/index
  machinery was repeatedly built and repeatedly found *unconsulted*. What moved over-trust
  behavior was a content-laden "audit before trusting" disposition delivered via the
  skill/tool channel — not the substrate.

## Minimum-viable SHACL (the design rule)

Enforce only what (a) the LLM won't satisfy unprompted and (b) you can teach via a laden
message. In practice that's two things:

1. **The relational/wiring invariant** — e.g. *a concept must declare an `implementedBy`
   edge*. This is a **graph-level** shape (you must see whether the edge exists) — which is
   exactly why the queryable `.graph` aggregate exists; per-resource sidecars can't express it.
2. **Provenance/rationale** — the write-contract MUST.

**Enforce the wiring *intent*, not target resolution** — a dangling `implementedBy` (a not-
yet-written implementation) is allowed (OKF "not-yet-written knowledge"). Use `sh:minCount` +
`sh:nodeKind sh:IRI`, *not* `sh:class` on the target. Keep shapes shallow: the threat model is
**cooperative-but-lazy**, not adversarial. Every shape carries a teaching `sh:message`.

## How it's enforced here

As a **standalone, opt-in capability** — see [`../../constrained-container/`](../../constrained-container/).
A container declares `ldp:constrainedBy <shape>` (Solid Protocol §5.6); writes are SHACL-
validated; violations return `422` + the `constrainedBy` Link header + the laden message;
unconstrained containers pass through untouched. Independent of wiki-memory — wiki-memory is
just one consumer that points a container's shape at the relational wiring + provenance shape.

## Reference
`cogitarelink-solid`: the write-contract probe, `e5b-write-twin`, and the salience arc
(decision-lookup D108 admission floor, D81 predicate governance, RQ-Salience-1).
