# Contextual linked memory — context cards over data objects

**Status: architecture / framing note (the "why").** Captured 2026-06-29 from the design dialogue.
Not new build scope — it is the coherent account of how the kept and planned pieces (OKF/DataBook
cards, the data-catalog Profile #2, the projection engine, the MCP surface, the Tier-2 query layer)
compose into a *contextual linked memory layer for agents*. It is the purpose the data-catalog
profile and the OKF↔DataBook crosswalk serve. Grounded against OKF, DataBook, LWS core, JSON-LD 1.1,
and the CDIF/DCAT/schema.org/Croissant stack.

### Claim status

- **[verified]** — checked against a primary source this session.
- **[hypothesis]** — our thesis; the testbed is meant to test it. Not a result.
- **[exploratory]** — a framing/candidate, not built.

---

## The frame: the card is *context*, the data object is the *referent*

Flat retrieval conflates two things this architecture separates [hypothesis]:

- **The data object** — a BigQuery table, a CSV, a sensor stream, an API. Large, lives somewhere (an
  LWS resource, or external), identified by its own URI. The agent does **not** load it into context.
- **The context card** — an OKF/DataBook card *about* that object, in wiki-memory (an LWS pod). Small,
  navigable, typed. It tells the agent *what the object is, what its columns/variables mean, how to
  query it, and where it came from.*

The agent reads the **card** to construct and interpret queries against the **object** — without
ingesting the object. That is the Google OKF BigQuery example exactly (`type: BigQuery Table`, a
`# Schema` table, `# Joins`, `resource: <bigquery URL>`): the card is not the data, it is the *memory
about the data* that lets an agent write correct SQL and interpret the result. This is
structure-helps-agents applied to **data**, and it is the RLM/progressive-disclosure thread — the
card is the handle; the object is fetched on demand, never dumped.

## The three-URI crosswalk to LWS

A data-context card carries **three distinct identifiers**; naming them resolves the crosswalk:

| URI | identifies | plane |
|---|---|---|
| **subject IRI** (§11 #1 minting) | the *card's* own identity | knowledge |
| **storage URI** (LWS resource) | where the *card* physically lives | storage |
| **`resource:`** (OKF field) | the *data object* the card describes | the referent |

**OKF already supplies the crosswalk hook** [verified, OKF §4.1] — `resource:` is "a URI that
uniquely identifies the underlying asset the concept describes," and its value may be an LWS URI
(object in a pod) or external (BigQuery, S3, a sensor API). The spec's §10 tension table already took
"both `resource:` (aboutness) and a stable subject IRI (identity)." So the card→object mapping is the
`resource:` edge — "two planes related by mapping, never identity," now between *context* and *data*.

## Format roles — the layered stack

- **OKF** — the **context-card shape**: discovery/navigation surface (what is this, the schema, how
  to use it). The progressive-disclosure handle.
- **DataBook** — the **actionable upgrade**: fenced blocks carry the **parameterized queries**, SHACL
  shapes, the typed graph, and the **PROV process stamp**. DataBook §8 — *named query APIs: resolve a
  block by fragment IRI, substitute `VALUES`, execute* — **is the "agent constructs a query with
  context" mechanism.** A DataBook table-card ships schema (CDIF/CSVW) *and* runnable queries.
- **Proto-knowledge vocabularies** (CDIF/DCAT/schema.org/Croissant/CSVW) — **how the card describes
  the object**. This is **Profile #2** (data-catalog), resolved as **CDIF-aligned, reuse-first
  layering**: schema.org/DCAT (dataset-level) + CSVW (tabular/columns) + SKOS/I-ADOPT (variable/unit
  semantics) + ODRL (usage policy), with Croissant for the ML-dataset variant. CDIF is the
  convergence *profile* that orchestrates these — which is our own "profile = schema, reuse-first"
  thesis, published. [verified, CODATA CDIF; see §11 #3]
- **LWS** — where cards live (identity via §11 #1, governance via SHACL/WAC/ODRL, conneg). The
  object↔card mapping rides the storage substrate.
- **JSON-LD** — the serialization glue threading all of it (OKF frontmatter→context→RDF, DataBook
  frontmatter, CDIF Discovery, the LWS storage description).
- **MCP** — the agent's surface (already in JSS) to attach, navigate cards, pull context, construct/run.

## Closing the loop via JSON-LD `@context`

`@context` is the **universal adapter**: it lifts a system's native JSON (column names, API fields)
into shared-vocabulary RDF. The moment the data object speaks JSON-LD, the card-graph and the
object-graph are *one graph* — same IRIs, same vocabulary, no impedance mismatch. **This is the same
mechanism our projection already runs** (frontmatter → `@context` → RDF), applied symmetrically to
memory *and* data. The projection engine is the loop-closer; it just needs to point at the object.

**Inline vs advertised context are equals, not a hierarchy** [verified, JSON-LD 1.1 §6.1 + W3C
JSON-LD Best Practices]. A plain JSON API served as `application/json` advertises its context
out-of-band via an HTTP Link header:

```
Link: <https://example.org/context.jsonld>; rel="http://www.w3.org/ns/json-ld#context"; type="application/ld+json"
```

The agent reads the header, fetches the (cacheable — BP note: SHOULD set `cache-control`, clients
SHOULD cache) context, and interprets the **unmodified** JSON body as RDF — "zero edits to existing
JSON infrastructure," system-owned. So the barrier to closing the loop is *advertise a context* (a
header), not *rebuild as JSON-LD*. **NGSI-LD** (ETSI IoT/context-information) is the deployed proof,
on exactly the sensor/observatory data our facility use case centers on. [verified]

**Three levels of self-description the agent can read** — each via its own `@context`:

1. **The data** — the object's `@context` → *what the fields mean* (units, types, classes).
2. **The resource** — its links (`rel="up"`, `describedBy`, `resource:`) → *how it sits in the graph*.
3. **The system** — the **LWS storage description** is itself JSON-LD (`@context:
   https://www.w3.org/ns/lws/v1`) listing `service` endpoints (TypeSearch, notifications, GSP,
   conneg) → *what the system can DO*. [verified, LWS Discovery.html] The agent learns *how to query*
   a never-seen system from the system's own self-description.

```
card (wiki-memory) --resource:--> data object (JSON-LD) --storageDescription--> system (lws+json)
      ↑  context, provenance,          @context →                @context →
      |  parameterized queries        what it means            what it can DO
      └──────────── agent constructs query grounded in all three ──────────┘
                       ↓ execute (MCP / SPARQL / GSP)
             response (JSON-LD) → lifted into the SAME graph → interpret
                       ↓
             write findings BACK as new cards → memory self-extends from the data
```

The final hop matters: response, card, and object share vocabulary and IRIs, so the agent can **write
what it found back as new context cards** pointing at the same `resource:`. The memory *grows from the
data it describes*. DataBook's `push`/`pull` over GSP is this loop for triplestores; JSON-LD objects
generalize it to any context-advertising resource.

## The card-weight spectrum

The card and the data's self-description are **complementary** — the card fills exactly the gap the
data does not self-supply:

| Data object | Who supplies `@context` | Card's job |
|---|---|---|
| Inline JSON-LD | the data (inline) | thin (curation, provenance, links) |
| JSON API + Link-header context | the data (advertised, system-owned) | thin |
| JSON API, no advertised context | agent/card supplies a known one | medium |
| Opaque (CSV dump, SQL warehouse) | the card **is** the semantic layer (CSVW/CDIF/Croissant) | thick |

The card's weight scales *inversely* with the data's self-description; `@context` is the shared
currency either way. This is why CDIF/CSVW/Croissant matter — they describe a non-RDF object in shared
vocabulary *when it can't describe itself*. FAIR's **I** (Interoperable) = shared vocabulary via
`@context` = agent interoperability: a FAIR object closes the loop for free; a non-FAIR object closes
it through the card.

## Why LWS is the right substrate for this

LWS is **JSON-LD-first** [verified, JSS core-concepts/json-ld-first.md], and its storage description
is JSON-LD with an `@context`. LWS is, at bottom, built on **JSON-LD and JSON-LD APIs** — so the
substrate's *native serialization is the loop's connective tissue.* The contextual memory layer and
the storage layer share one model; there is no boundary to bridge. That is why this substrate (not a
generic doc store) is the right home for a contextual linked memory layer.

## Realization path (pieces exist or are scoped)

- **`@context` projection** for card *and* object — *have it* (the projection engine; same machinery).
- **`resource:` as a traversable edge** — follow it, fetch the object's JSON-LD, merge.
- **Comunica link-traversal** (our deferred **Tier-2** query surface) **IS this loop** — follow links
  across resources into a federated graph. "Close the loop to storage" = Tier-2 traversing `resource:`.
- **LWS storage description** — the *system* capabilities, so the agent knows how to query, not just
  what.

## The deep point (the intellectual thread)

- **Semantic web realized by LLMs** — `@context` was always meant to let a machine understand unseen
  data; it failed because no human-built app read it. An LLM agent *does* read the `@context` and the
  vocabulary, so the vision works with a cognitive agent as the consumer.
- **FAIR as agent infrastructure** — Interoperable = shared vocabulary via `@context` = the substrate
  that lets agents close the loop to live data.
- **Knowledge fabric** — card-graph + object-graph + system-graph are one federated graph, stitched by
  `@context` and stable IRIs, no central schema. Decentralized, federated, self-describing.

## Alignment to the substrate design (closing the original thread)

This note adds no scope; it is the **why** that ties the threads together:

- **§11 #3 (data-catalog vocabulary)** → the *describe-the-object* layer; resolved as CDIF-aligned,
  reuse-first. The contextual-memory frame is what that profile is *for*.
- **§12 (OKF↔DataBook crosswalk)** → card shape (OKF) ↔ actionable typed payloads + provenance
  (DataBook).
- **§11 #1 (identity)** → the three-URI crosswalk (subject IRI / storage URI / `resource:`).
- **§6 (projection + two-tier discovery)** → the `@context` projection is symmetric over memory and
  data; Tier-2 Comunica traversal *is* the loop-closer.
- **MCP surface (kept machinery)** → the agent's read/navigate/construct/write interface.

In one line: the substrate is **a contextual linked memory layer that lets agents query and interpret
data they cannot hold — by giving them navigable, typed, self-describing context, stitched to live
data and to the storage system itself through JSON-LD `@context`.**

## Sources [verified 2026-06-29]

- OKF §4.1 (`resource:`), DataBook §8 (parameterized named queries) — the `okf`/`databook` skills
- JSON-LD 1.1 §6.1 "Interpreting JSON as JSON-LD"; W3C JSON-LD Best Practices (Link-header context);
  NGSI-LD (advertised-context precedent)
- LWS core Discovery.html (storage description `@context` + services); JSS core-concepts
  (JSON-LD-first)
- CDIF (CODATA) + DCAT/schema.org/Croissant/CSVW — see [`iri-minting.md`](iri-minting.md) §Plane-2
  and the §11 #3 research
