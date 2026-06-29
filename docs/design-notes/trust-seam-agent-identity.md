# Trust seam — agent identity, policy, and verifiable provenance

**Status: exploratory. Not a decision, not a plan.** Captured 2026-06-29 from a design discussion on
IRI minting, DID methods, and the CODATA/CDIF4EOSC direction (incl. the Alexy↔Tykhonov interview).
This records the *deferred* trust seam — spec §9 ("rebuild/keep") lists provenance recording and the
DID/VC/MCP-native layer as deferred, and the general-substrate spec keeps agent identity on a
separate plane. **Nothing here changes the build.** Plan 2 stays scoped to content identity + the
profile mechanism; this is the layer that comes after. When/if adopted it gets promoted to a
numbered canon doc or a `superpowers/specs/` design doc.

### Claim status (read this first)

- **[verified]** — checked against a primary source this session (date noted).
- **[hypothesis]** — our thesis / a thing the testbed is meant to test. Not a result.
- **[exploratory]** — a candidate design we are chewing on, not decided or built.

---

## Why this exists

Plan 1 gave content a stable, location-independent subject IRI. That immediately raises the next
question the spec deliberately deferred: **who asserted a card, under what identity, with what
right to be trusted?** Two external signals sharpened the answer:

1. **DID methods consolidated on web-anchored, ledgerless minting** — `did:webvh` is the same
   "your web origin is the authority, no central registry" philosophy Plan 1 landed on for content
   IRIs. [verified, identity.foundation/didwebvh/v0.5, 2026-06-29]
2. **The FAIR-data community (CODATA / CDIF4EOSC / Dataverse) is building this exact layer** — DIDs
   for contributor/agent identity, verifiable credentials, ODRL policy, and full provenance, as the
   "distributed layer of trust" for responsible AI over research data. [verified, CODATA + KNAW,
   2026-06-29] This is the intersection the substrate's "trusted agentic engineering" thesis sits on.

The lesson: the trust seam is not bespoke. There is a standards-native stack to target, and it is
the one the scientific-data world is converging on.

---

## The identity model — one philosophy, four planes

The spec's "three identities + one reference" gains a concrete method per plane. The unifying
principle [exploratory]: **your web origin is the authority; no central registry; dereferenceable;
portability is opt-in, per-namespace, never per-item.** Content IRIs and agent DIDs are the *same
idea* at different layers.

| Plane | Identifier | Authority / method | Notes |
|---|---|---|---|
| **Storage address** | LWS/Solid URI (a locator) | the pod URL | the *where the bytes sit* plane; never the subject IRI |
| **Content subject IRI** | slash-namespace HTTP IRI `{pod}/kb/{slug}#it` | the pod's own origin | Plan 1; per the W3C vocab-pub recipes, **slash** for large/growing instance data |
| **Shared vocabulary** | **hash**-namespace `…/ns#Term` at a w3id/PURL | a PID you control (reuse W3C-hosted where possible — `solid/terms#`, `acl#`, SKOS, DCAT) | **hash** for small/stable vocabularies; one registration *because* it's shared |
| **Agent identity** | **`did:webvh`** at the controller's domain | same web-origin model, self-certifying + verifiable history | the trust seam proper; content↔agent linked by `prov:wasAttributedTo` |

Why this split holds [verified, W3C swbp-vocab-pub + Solid vocab guidance, 2026-06-29]: the W3C
hash-vs-slash recipe maps exactly onto shared-vocab-vs-local-content — hash = "small vocabularies,
the entire vocabulary in a single access" (the TBox); slash = "large vocabularies or those to which
additions are anticipated frequently" (the ABox of cards). We were not imposing the cut; the
standards prescribe it. And we **reuse** the W3C-hosted vocabularies as terms — we do not mint under
`w3.org/ns/`, which we control no more than anyone else.

### Why `did:webvh` for the agent plane [verified, didwebvh v0.5, 2026-06-29]

- **Web-anchored, ledgerless, scalable** — mint from a domain you already run; resolvers verify the
  chain locally; no consensus, no fees, no bottleneck. Same authority model as the pod.
- **Syntax** `did:webvh:{SCID}:domain:path` → deterministic transform to
  `https://domain/path/did.jsonl`. The DID dereferences *at the pod/controller*, like our content IRIs.
- **SCID** = `base58btc(multihash(JCS(inception log entry), SHA-256))` — a hash *in the identifier,
  not in the URL*. This resolves the content-addressing-vs-stability tension: the SCID hashes the
  *inception*, so the identifier is self-certifying and globally unique **while staying stable across
  revisions** (versions evolve in the log; the SCID never changes). Self-certifying *and* persistent
  — no trade.
- **Verifiable history** (`did.jsonl`, each entry chaining the prior's hash) = a built-in provenance
  / audit log — the "logbook" the trust layer needs ("which agent got wrong data").
- **Portability opt-in** (`portable` param + `alsoKnownAs`, SCID constant) — move domains without
  losing identity. Our "portability per-namespace, not per-card" rule, cryptographically anchored.

Adjacent, for the record: `did:peer` (pairwise, private), the `did:scid` proposal (generalizes the
SCID idea), `did:self` (registry-less). `did:webvh` is the one matching the substrate. [verified]

---

## The policy plane — ODRL (the axis we don't yet model)

The substrate has two governance axes today and is missing a third [exploratory]:

| Axis | Mechanism | Question it answers |
|---|---|---|
| **Shape** | SHACL via `ldp:constrainedBy` | is this card well-formed? (admission) |
| **Access** | WAC / ACP | can you GET/PUT this resource? |
| **Usage / obligation** | **ODRL** (W3C Rec) — *new* | having got it, what may you *do* with it, under what conditions and obligations? |

ODRL is the layer between "valid and readable" and "this agent is permitted to use it this way" —
decrypt, execute, act on, with obligations. For a memory substrate holding prompts, skills, and
sensitive content fed to agents, that gap is real. Tykhonov pairs ODRL with DIDs + verifiable
credentials precisely here. [verified, interview transcript, 2026-06-29] **ODRL complements, does
not replace, SHACL/WAC.**

### The trust-seam triad

A coherent, all-W3C target for the deferred seam [exploratory]:

- **`did:webvh`** → agent (and resource-owner) identity
- **Verifiable Credentials** → what an agent is credentialed to do
- **ODRL** → the usage policy governing it
- **verifiable history** (`did.jsonl`-style log, or DataBook's PROV process stamp) → the audit trail

---

## Data-catalog profile — CDIF joins the §11 #3 shortlist

The open §11 #3 question (Profile #2 vocabulary: DCAT vs CSVW vs schema.org) gains a fourth
candidate: **CDIF** (Cross-Domain Interoperability Framework), the variable-level semantics layer
CODATA is standardizing — units, properties, hierarchies — and the basis of **CDIF4EOSC**.
[verified, CODATA, 2026-06-29] Choosing CDIF aligns Profile #2 with the EOSC interoperability lane.
**Croissant / Semantic Croissant** (Google/MLCommons) is the ML-dataset-metadata analog, relevant
if the substrate ever describes training datasets. Flag both for the §11 #3 decision; neither is
decided.

---

## Alignment (why this lane matters)

CODATA's stack — Croissant (ML navigation) → CDIF (semantics) → ODRL (policy) → DIDs + VCs
(identity/trust) — is the same architecture as lws-pod, from the FAIR-data side. Tykhonov's framing
("put an identifier on every claim; trace source, creator, context; the knowledge graph sits next to
the LLM") *is* the substrate's structure-helps-agents thesis. [verified, transcript] CDIF4EOSC
(CODATA-coordinated, started 2026-06-01; ocean/climate/materials use cases; contributors identified
by DIDs) is the concrete venue. For a research-faculty author working CI-Compass / EOSC-adjacent FAIR
+ trusted-AI, targeting this stack positions the substrate in the right standards lane.

---

## Where we part ways — the "signed tensor → determinism" claim

Recorded so we don't import it uncritically. Tykhonov's signed/frozen-tensor mechanism — sign a
question-answer pair, reuse it when a new question is "95% similar" — is **semantic caching of
human-signed answers with a similarity threshold**. Valuable for provenance, reproducibility, and
CPU/GPU compute savings. But [hypothesis, skeptical]:

- it does **not** "convert a non-deterministic answering machine into a deterministic one" — it
  *bypasses* the model on cache hits; the model and everything off the cached set are unchanged;
- the "95% similar → reuse" step is a retrieval-precision problem wearing a determinism costume —
  near-duplicate questions can need genuinely different answers.

Take the philosophy (sign answers, stamp provenance, make science reproducible); leave the
determinism claim. For lws-pod it is a *different memory tier* — a compute-reuse cache, not our
durable, inspectable, typed card layer. They could coexist; they are not the same thing.

---

## Scope boundary

This is the **deferred trust seam**, not Plan 2. Plan 2 = the profile mechanism + content identity
(and threading the identity policy through `extract.mjs`). The seam above is later phase work; it is
recorded now so the direction — `did:webvh` + VC + ODRL + verifiable history, CDIF for Profile #2,
the CODATA/EOSC alignment — is on the record and not re-derived. See spec §9 (deferred) and §11
(open questions #1 IRI minting, #3 data-catalog vocabulary, #5 provenance granularity).

---

## Sources [verified 2026-06-29]

- `did:webvh` v0.5 — identity.foundation/didwebvh/v0.5 ; `did:scid` proposal, `did:peer`, `did:self`
- W3C *Best Practice Recipes for Publishing RDF Vocabularies* — w3.org/TR/swbp-vocab-pub
- Solid vocabularies — github.com/solid/vocab , solid.github.io/vocab ; "Publish your vocabulary on
  your Pod" (Solid SPS tutorial)
- LWS WG charter (Sept 2024–Sept 2026) ; LWS Use Cases — w3.org/TR/lws-ucs
- CDIF4EOSC — codata.org/initiatives/making-data-work/cdif4eosc ; Tykhonov, *DIDs for sustainable AI
  in the Dataverse data network* (KNAW, 2025) ; Alexy↔Tykhonov interview transcript (querygraph.ai)
