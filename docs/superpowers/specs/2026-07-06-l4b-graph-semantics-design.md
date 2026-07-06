# L4b — LWS-native graph semantics + wiki-memory re-derived on the decoupled floor — design of record

**Date:** 2026-07-06
**Status:** design of record. Governed by `docs/design-notes/layer-cake-principles.md` (P5/P7/P9/**P13**),
the L4a spec (`2026-07-06-l4a-substrate-neutrality-design.md` §6, which *recorded* this round), and the
2026-07-06 brainstorm (OKF semantic-web anchor + named-graph reconciliation). **Next step:** a new
session runs `superpowers:writing-plans` against this spec, then subagent-driven implementation. Do
NOT start implementation from this doc without a plan.

Supersedes the one-line L4b framing carried in FOLLOWUP ("wiki-memory re-derived on the decoupled
floor"): that scope is intact (§6–§7 here) but now rides a **generic, application-neutral graph-semantics
layer** (§3–§5) that the brainstorm surfaced as the real foundation.

---

## 0. Why this exists

L4a proved the substrate onboards a second application (DCAT) as pure data, and *recorded* the engine
demotion + the carried read-side questions for L4b. The 2026-07-06 brainstorm then found that
"re-derive wiki-memory" cannot be done honestly without first settling **what a named graph is in
Linked Web Storage**, because:

- LWS has **no named-graph or dataset primitive** (verified: zero hits across core/vocab/searchindex).
  Its unit is the *resource* — one RDF graph — plus a bound linkset. The W3C LDP WG itself catalogued
  the LDP-vs-GSP mismatch and **left it unresolved**.
- The pod's current derived view is `graph.ttl` — a **Turtle union graph**, which cannot name a graph
  or preserve provenance (Turtle serializes exactly one unnamed graph).
- This is an **agentic memory system**: an agent must be able to store RDF and read it back with its
  graph identity intact, through **JSON-LD** (not TriG/quads), following its nose from the profile.

So L4b's foundation is a generic graph-semantics layer — store any RDF, get it back as named-graph
JSON-LD — and wiki-memory is re-derived as its first consumer.

**Chuck's governing requirement (2026-07-06, verbatim intent):**

> The L4b-graph layer must be generic and not tied to the wiki application. An agent should be able to
> store any sort of RDF data following these principles into Linked Web Storage and have it re-serialized
> back to agents.

---

## 1. Scope, the two phases, and the hard constraints

**One spec, two implementation phases, each closed by a cold-agent probe:**

- **Phase A — L4b-graph (generic).** The application-neutral graph-semantics layer: JSON-LD 1.1
  named-graph serialization discipline, in-band graph naming, the derived-view declaration vocabulary,
  the read-side minimum of the plane-mapping, and the `iri-minting.md` update. Proven with **arbitrary
  RDF from an agent, no wiki involved**. Probe #4 (generic) gates it.
- **Phase B — L4b-wiki (consumer).** The engine demotion (the `projection/` split) and the RED+fenced
  wiki-memory suite re-derived to ride Phase A. Probe #5 (wiki) gates it.

**Hard constraint 1 — Phase A is generic (P13).** Every mechanism in §3–§5 is Bucket 1 (guardrail/
affordance) or Bucket 2 (profile mechanism, data-driven, zero application vocabulary). Nothing in Phase
A may name `wiki`, `card`, `okf`, or any application term. The generic gate (§12) proves it with a
non-wiki, non-DCAT raw-RDF store.

**Hard constraint 2 — fork-light by construction.** In-band graph naming (§3) means the *agent* writes
the graph name into the JSON-LD `@id`; the substrate stores and serves the bytes faithfully and does
**not** compute graph names.

*Confirmed by source investigation of the fork (`la3d/lws` @ `8b86a87`, 2026-07-06):*
- **Store + read-back is fork-empty.** JSON-LD bodies are stored as opaque bytes
  (`src/storage/filesystem.js`) and served verbatim (extensionless / `octet-stream`) or via a pure
  `JSON.parse`→`JSON.stringify` on the `application/ld+json` conneg path — `@id`+`@graph` survives.
  **Steering constraint:** the agent path stays on `application/ld+json`; `Accept: text/turtle` for a
  named-graph doc drops the `@graph` contents (`src/rdf/turtle.js:339` skips `@`-keys) — Turtle is an
  *unnamed-union* export only, never the named-graph carrier.
- **L3 admission is graph-blind** — a multi-`@graph` document parses to zero quads (`src/lws/admission-rdf.js`
  `toDataset` → `jsonLdToTurtle` → `jsonLdToQuads`, which skips `@graph`), so SHACL finds no targets and
  **silently admits**. This only affects *governed* named-graph writes.

**Consequence (decided in this plan round): Phase A is fork-empty** — the generic gate proves store +
read-back + derived-view materialization on an **ungoverned** container. The admission-inside-`@graph`
gap is a **Phase-B decision** (it bites only governed wiki cards under the floor), fix pre-located:
either teach `src/rdf/turtle.js` `jsonLdToQuads` to descend into `@graph`, or replace the JSON-LD→Turtle
hop in `src/lws/admission-rdf.js` `toDataset` with a dataset-aware parser. The fork-queue (FOLLOWUP)
stays otherwise untouched; Plan 1 asserts an empty fork diff.

---

## 2. The OKF semantic-web anchor (Option A) + the door-B seam

The OKF→RDF connection stays **frontmatter-declaration-based**: the projector maps frontmatter through
the profile's JSON-LD `@context` (today's `card.mjs` model, Plan-1/P6 mint-to-proto). We adopt #141's
OKF-semantic-web-profile **frontmatter** conventions as the extensible anchor — `id`, `version`,
`author[].iri`, and a `graph:` block (§4) — as the **minimum viable semantic connection**, leaving the
W3C Holon CG to standardize the rest. Card **bodies stay prose**.

**Door B stays cleanly addable, not built.** #141's typed fenced blocks (`turtle`/`shacl`/`sparql`
in-body) are a semantic upgrade of a slot OKF already uses (the reference agent already emits fenced
```sql``` blocks). To keep B open without reopening the no-body-extraction decision:

- the re-derived projector treats the body as **structured (prose + identifiable fenced blocks)**, never
  an opaque blob;
- a **parser-role seam** (a profile-declared body-block extractor role) is left in the mechanism — a
  profile may opt in later;
- the admission floor already validates whatever RDF is presented, so inline blocks would flow to the
  same L3 gate unchanged.

B is out of scope for L4b (§13). The seam is the only obligation.

---

## 3. Graph semantics — the generic pillar (Bucket 1/2, agent-first)

### 3.1 Serialization: JSON-LD 1.1, canonical

**JSON-LD 1.1 is the canonical agent-facing serialization**, because it expresses *all three* cases a
memory needs — a single named graph, a plain graph, and a whole **dataset** (top-level `@graph` array of
graph objects) — with an advertised `@context`. Consequences:

- **TriG** — at most an optional conneg export for RDF tooling; never on the agent path.
- **Turtle** — only ever an *unnamed union* export (lossy); disqualified as a named-graph carrier.

### 3.2 Naming: in-band, graph-name = authority-scoped document IRI

A named graph is expressed as a JSON-LD **graph object**, with two distinct `@id`s at two levels:

```jsonc
{
  "@context": ["https://www.w3.org/ns/lws/v1", "<profile-context>"],
  "@id":   "{authority}{profile-path}/{slug}",     // GRAPH NAME — the document IRI (iri-minting Plane 1)
  "@graph": [
    { "@id": "{authority}{profile-path}/{slug}#it", // SUBJECT — the thing the graph is about
      "@type": "…", "…": "…" }
  ]
}
```

- The **graph name** is the authority-scoped **document IRI** — declared *in-band* via the graph
  object's `@id`, **not** the storage filename. This is httpRange-14 (the document is the graph; the
  thing it describes is a `#it` fragment) and it is exactly `iri-minting.md` Plane 1.
- The storage location (`…/foo`, `…/foo.md`) is a **retrieval target**, decoupled from the name — the
  name/dereference separation `iri-minting.md` decided, now realized in-band.
- In-band naming is what keeps the substrate generic and fork-light: the agent supplies the name; the
  substrate round-trips it. The substrate never computes a graph name from a path.

### 3.3 Containment — three levels

| Level | Model | Graph name | WAC | Breadcrumb |
|---|---|---|---|---|
| **Resource** (a card, a raw RDF doc) | one named graph per resource | its `@id` (doc IRI) | independently governed | linkset `rel=up`/`describedby` + `items[]` |
| **Container** | *is* the RDF dataset; its members are the named graphs | — | per-member | `items[]` / type index |
| **Aggregate derived view** | union graph **or** dataset-of-member-graphs (multi-`@graph`) | the view's `@id` | one ACL | in-doc `@graph` array |

- **Default: one named graph per resource.** Plurality comes from **containment** (the container is the
  dataset, members are the named graphs), not from packing graphs into a resource.
- **The aggregate derived view is the one place a single resource may be a resource-as-dataset**
  (multi-`@graph`, nanopublication pattern) — and only when its declaration (§4) asks for it.

### 3.4 Breadcrumbs ride existing surfaces — no new primitive

Discovery/navigation of graphs reuses what LWS already serves: the **linkset** (RFC 9264, anchored at
the resource), the container **`items[]`** listing, the **type index**, and the **storage description**.
The derived-view capability is **advertised in the storage description** so the **MCP read tools**
surface it (the agent consumption path). Membership steering wording is corrected so a linkset-only
agent is told to enumerate members via `items[]`/TypeSearch (probe carryover).

---

## 4. Derived-view declaration vocabulary (Bucket 2, #141-aligned, generic)

Turn today's hardcoded RESERVED channels into **profile data**. A profile declares its derived targets
as data; the neutral mechanism materializes them. The vocabulary (minted under the w3id-shaped base per
`iri-minting.md` Plane 2, reuse-first) carries per derived view:

- **`named_graph`** → the pod resource IRI the view materializes to (its URL is the graph name);
- **`push_mode: replace | merge`** → materialization semantics (reuses #141's names; `merge` = the
  `.meta` read-merge-write pattern already used);
- **`mode: union | dataset`** → **`union`** (merged graph, provenance flattened; default, YAGNI) or
  **`dataset`** (a `@graph` array preserving one named graph per source resource). Declarable per
  profile. DCAT declares none; wiki-memory is expected to declare `dataset`.

The mechanism that reads these declarations and materializes JSON-LD 1.1 is **neutral** — driven by the
profile's declared roles, containing no application vocabulary (P13 Bucket 2). The derived-view channel
emits **JSON-LD 1.1**; `graph.ttl` Turtle is demoted to an optional lossy conneg export.

This is #141's `graph` block reinterpreted for LWS: the target is a **pod resource**, not a triplestore
GSP endpoint (that stays deferred, §13). `named_graph`/`push_mode` vocabulary is reused so the pod stays
aligned to the emerging OKF semantic-web profile.

---

## 5. Read-side semantics + the minimal plane-mapping

Take the carried read-side questions, now with a concrete serialization. Each carries a **starting
lean** (from FOLLOWUP #5b + the probe findings) to confirm in the plan — the spec states a position
rather than reopening these:

- **Earned-at-admission member `conformsTo` vs the `up`-walk.** *Lean: keep the `up`-walk as the
  contract* (member → `up` → container → `conformsTo` → profile, the #5b handoff), and add an
  earned-at-admission `conformsTo` on the member only as **optional validation provenance**, never
  replacing the walk. Declared facts on the linkset; derived/materialized views belong to a build.
- **`defaultProfile` precedence.** *Lean: a container's own `conformsTo` wins* over the pod-wide
  default — the probe's unprompted corollary ("do not assume the pod-wide defaultProfile; read the
  container's own conformsTo") is the safe local-authority reading.
- **Plural-binding governance** — which profile governs a read when several `conformsTo` are declared
  (L4a landed the plural API). *Lean: AND-compose validation (all declared shapes admit), most-specific
  profile for context/vocab resolution* — confirm against a two-profile fixture in the plan.
- **The read-side minimum of the plane-mapping (the substrate design's §11 #4):** how a client resolves
  an authority-scoped graph name → the LWS resource it GETs, via `rel="up"`/`describedby`/type index.
  **Write-side plane-mapping and provenance granularity stay deferred** (§12) — L4b takes only the read
  minimum, to keep it from ballooning.

---

## 6. The split — engine demotion (Phase B, from L4a §6 + audit)

`projection/` splits into two homes; the `okf/`-directory misnomer dies:

- **`projection/prof/`** — the neutral PROF mechanism (`resolve`, `profile-doc`, `profile-loader`,
  `rdf`, `namespaces`, `materialize`, `engine-profile`) **plus the generic graph-semantics mechanism**
  from §3–§4 (named-graph materialization, derived-view reader). Bucket 2. Zero application vocabulary.
- **`apps/wiki-projector/`** — application #1's client tooling: the engine, `card`/`identity`/
  `frontmatter`/`index-channel`/`base-profile`, gray-matter, the wiki-memory profile + channels.
  Bucket 3.

Naming (`projection/prof/`, `apps/wiki-projector/`) is fixed here; the plan may refine paths but not the
neutral-vs-app boundary. The `06-code-placement-audit.md` L4b rows are executed and re-dispositioned.

---

## 7. wiki-memory re-derived (RED → green) (Phase B)

Re-derive the fenced suite **on the decoupled floor**, not patched back to the old 3-arg `cardToQuads`:

- thread the identity policy through `extract` (closes the `TODO(plan-2)` ripple);
- project cards to **JSON-LD 1.1 named graphs** per §3 (graph-name = card doc IRI, subject = `#it`);
- declare the wiki channels (`index`, the graph aggregate) as **derived-view data** per §4, with the
  aggregate declaring `mode: dataset` if provenance-per-card is wanted;
- the `okf/red-fence.test.mjs` breadcrumb is removed only as the suite goes green.

The re-derivation is what *exercises* Phase A's generic layer end-to-end.

---

## 8. `iri-minting.md` graph-semantics update (deliverable)

Amend the decided `iri-minting.md` to state the graph semantics explicitly (it currently decides
identity and defers dereference):

- graph-name = the document IRI (JSON-LD graph object `@id`); subject = the `#it` fragment;
- the name/dereference separation is now realized **in-band** via JSON-LD (not a metadata round-trip);
- the **JSON-LD-1.1-only** serialization decision (TriG optional conneg; Turtle unnamed-union only);
- the container-as-dataset / resource-as-dataset distinction and when each applies;
- the read-side plane-mapping minimum (§5) that resolves a name to a resource.

This closes the "identity decided, dereference deferred" gap for the read path.

---

## 9. Cold-agent affordance probes — the two gates (Chuck's directive)

Probe-driven, as prior rounds (a fresh sub-agent, pod URL + CA cert only, zero project context,
read-only, unprimed). **Baseline is the existing probes #1–#3** (FOLLOWUP) — not re-run.

- **Probe #4 — generic, after Phase A.** An agent stores **arbitrary RDF** (a non-wiki, non-DCAT graph)
  as named-graph JSON-LD and reads it back; a second cold agent, given only the pod, must reconstruct
  the **graph state** — find a container's derived view, read it as JSON-LD, understand the
  graph-name/subject distinction, and (in `dataset` mode) navigate the contained graphs — by following
  its nose from the profile. Validates the generic layer independent of any application.
- **Probe #5 — wiki, after Phase B.** The same walk over the re-derived wiki-memory family, confirming
  the consumer rides the generic layer.

Frictions become surface fixes (the probe → fix → re-probe loop), recorded as fork-queue or plan items.

---

## 10. Retirements & wording

- **`constrained-container/`** — retirement decision (superseded by L3; its residual `links.mjs`
  consumer was de-vocabularied in L4a). Decide: delete vs archive-with-note.
- **`base-shape.ttl`** "universal" comment fix rides the re-derivation.
- **Membership steering** wording (§3.4) so a linkset-only agent enumerates members via `items[]`/
  TypeSearch.

---

## 11. Acceptance

1. **Phase A generic gate** — new live suite `tests/lws-graph.test.mjs` + `make test-graph`, using a
   **deliberately-neutral synthetic graph** (`ex:` terms — nothing to couple to; the mechanism is
   vocabulary-blind, so structural coverage is the proof, not vocabulary realism): an agent PUTs
   arbitrary named-graph JSON-LD (graph-name = an authority-scoped `@id` ≠ the storage path), reads it
   back with the named-graph form + graph name intact; a container of ≥2 such resources reads as the
   dataset; its declared derived view materializes as JSON-LD 1.1 in both `mode: union` and
   `mode: dataset`; **no wiki/okf/card term appears in the exercised mechanism** (asserted). Turtle
   conneg returns the unnamed union; TriG is not on the agent path. *(A SOSA/SSN sensor-observation
   graph is recorded as a future operating-skill illustration, not a gate — §12.)*
2. **Phase B wiki green** — the wiki-memory suite is re-derived and passes on the decoupled floor; the
   red-fence test is retired only as it goes green.
3. **The `projection/` split** is executed; `06-code-placement-audit.md` L4b rows re-dispositioned; no
   application vocabulary in `projection/prof/`.
4. **Derived-view vocabulary** landed as profile data; `publish.mjs` onboards it manifest-driven (no
   code edit for a new profile's derived views).
5. **`iri-minting.md`** updated per §8.
6. **Probe #4 (generic) and Probe #5 (wiki)** both reconstruct the graph state cold.
7. **Fork stance asserted** — the fork diff is empty, or any edit is minimal/additive/justified in the
   plan (§1 constraint 2).
8. **Zero regression** across all existing gates (`test-profiles`, `test-dcat`, `test-l3`, `test-lws`,
   `test-typeindex`, `test-indexed-relation`, `test-mcp-v2`, projection unit suites).

---

## 12. Out of scope / deferred

- **Door-B typed-block extraction** — the parser-role seam is built (§2); extraction is not.
- **Write-side plane-mapping + provenance granularity** (the substrate design's §11 #5) — L4b takes
  only the read minimum.
- **Triplestore / GSP push** — `named_graph` targets a pod resource, not a GSP endpoint.
- **Fork-queue** (container-listing WAC-filter, sidecar mediaTypes, hint wording, MCP-gateway
  advertisement, GET-405 Content-Type, admission-fixture diversity, npm `--test-force-exit`) — next fork
  round, unless a Phase-A gap forces a scoped touch (§1).
- **Real w3id registration** — when federation is real.
- **Operating skills** — distilled post-L4b from the probe trajectories. A **SOSA/SSN
  sensor-observation graph** is recorded here as a future operating-skill illustration of the generic
  layer (store an observation dataset, read it back as named-graph JSON-LD) — not an L4b gate.

---

## 13. Grounding

- `docs/design-notes/layer-cake-principles.md` (P5/P7/P9/P13) and `docs/foundations/06-code-placement-audit.md`
  — the neutral-vs-app placement rubric.
- `docs/design-notes/iri-minting.md` — the three-plane identity model this extends with graph semantics.
- `.claude/skills/json-ld` (§4.9 Named Graphs, §9.4 Graph Objects — the named-graph serialization),
  `.claude/skills/lws-protocol` (resource = one graph; no dataset primitive; linkset discovery),
  `.claude/skills/shacl-constraints`, `.claude/skills/profiles` (PROF), `.claude/skills/okf`.
- OKF issue #141 (OKF semantic-web profile / DataBook) + the OKF reference agent
  (`GoogleCloudPlatform/knowledge-catalog/okf/src/reference_agent`) — the frontmatter anchor + the
  write-validate-teach authoring model. Weighed as input, not conformed to (design not yet accepted).
- W3C LDP-vs-GSP wiki, httpRange-14, W3C HashVsSlash, SPARQL Graph Store Protocol, Nanopublication
  Guidelines — the named-graph/LDP seam the community left unresolved and the conventions this design
  adopts.
- Cold-agent probes #1–#3 (2026-07-06) — the baseline and the probe protocol §9 repeats.
