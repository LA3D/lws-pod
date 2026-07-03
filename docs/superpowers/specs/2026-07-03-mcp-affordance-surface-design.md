# MCP affordance surface — the self-describing agent gateway (v2.1 redesign) — design of record

**Date:** 2026-07-03
**Status:** design of record. Supersedes the URI-scheme + federation decisions of
`2026-07-02-mcp-v2-agent-surface-design.md` (the v2 Resource-Gateway spec); everything else in v2 —
the Resources primitive, tool-budget discipline, sanitization, the credential/rate-limit governance,
and the 12 review fixes merged as `la3d/lws@7e9c2c1` — is **carried forward**. **Next step:** a new
session runs `superpowers:writing-plans` against this spec, then subagent-driven implementation. Do NOT
start implementation from this doc without a plan.

---

## 0. Why this exists (the two defects, and how the vision reframes them)

A high-effort review of the shipped MCP v2 surface (merged, 12 fixes) left **two design-level defects**
that were deliberately deferred as too deep for a fix-round:

1. **The invented `lws://` URI scheme** — MCP Resources were addressed by a synthetic scheme
   (`lws://resource/{+path}`, `lws://linkset/{+path}`, `lws://meta/…`, …) that (a) encodes path-as-
   structure, and (b) freezes the document view into a per-kind taxonomy.
2. **`call_remote_pod`** — federation as a `{tool, arguments}` RPC proxy: an undifferentiated pass-
   through to another pod's MCP tools.

Grounding this against the LWS spec and the Solid/LWS vision (Verborgh 2013 + 2024) showed both defects
are the **same misalignment** with the substrate's founding principles, and that the fix is not a patch
but a reorientation of the whole agent surface around **affordances**. The evidence trail (§11) is the
reasoning; this section states the reframe.

**LWS core is explicit** that a resource's URI is *independent of its position in the containment
hierarchy* and that *"clients SHOULD NOT assume that URI structure reflects containment"* — structure
lives in `rel="up"` links and the container's `items`, not the path. `lws://resource/{+path}` does
exactly what the spec forbids.

**Verborgh's "pods = graph"** (2024) holds the document/container hierarchy is *one view*, *"no view is
more special than any other"*, and the LDP protocol is *"one view to a pod"*, not the pod itself. The
per-kind `lws://…` taxonomy privileges and hardcodes the document view.

**Verborgh's origin vision** (2013) is the sharpest lens. An affordance is Fielding's *"the simultaneous
presentation of information and controls such that the information becomes the affordance"*; *"hyperlinks
are the door handles of information."* An agent must be able to work with *"APIs they're not programmed
for"*, discovering capability at runtime from the representation — the opposite of the Siri model
(*"only interface with a limited set of Web APIs whose behavior is pre-programmed"*). Read against this:
- **`lws://` is the out-of-band-API anti-pattern** — it hides the pod's affordances behind a scheme the
  agent must be programmed for, and forks a *separate agent-Web* instead of exposing the one Web.
- **`call_remote_pod` is the Siri anti-pattern** — a pre-programmed proxy, not runtime discovery of a
  remote pod's own affordances.

The LLM is the general "machine client" Verborgh's 2013 essays wanted but that did not exist — the agent
that can read a door handle (a typed link) and a `@context` the way a human reads a physical affordance.
This redesign makes the pod present its affordances to that agent. *"The web as I envisaged it, we have
not seen it yet"* — the MCP surface is where we make it visible.

---

## 1. The guiding invariant (the acceptance test)

> **The cold-agent affordance test:** could an LLM agent, handed only the pod's root URL and **no
> out-of-band documentation**, discover and correctly use the whole surface — read *and* write, local
> *and* remote — purely from affordances carried in the representations?

Every decision below serves this test. A design element that requires the agent to already "know" the
pod's scheme, vocabulary, or capabilities has reintroduced the out-of-band API and fails the test.

It is also this round's **experiment.** Run against a core-JSON-LD-only pod — system + identity/credential
planes resolvable, no domain profile yet (§10) — the test measures how far *core* semantics alone carry
an agent. That measurement is the evidence that shapes Plan 2's domain layer.

---

## 2. Conceptual foundation (do not re-litigate)

**The PIQ triad** (Verborgh 2024) — Policy, Interface, Query — already maps onto machinery the pod has:
- **Policy** = WAC / the no-oracle property. Spec-mandated: a client reading a container sees only
  members it may access. Shipped (`collectAuthorizedResources`).
- **Interface** = the document / link-following read surface. This redesign makes it affordance-first.
- **Query** = the declarative data need. The pod already has the *constrained* form —
  `TypeSearchService` (type + indexed-relation CNF filter, authz-filtered, storage-description-
  advertised). The *expressive* form (SPARQL) is a **later, optional** aggregation layer (§8), not this
  round.

**The layered `@context` self-description stack** — the vocabulary-loading mechanism, native because
LWS is JSON-LD-first. The same `@context` move recurses at each layer; each answers a different question:

| Layer | `@context` | answers | status |
|---|---|---|---|
| JSON-LD | the mechanism | "read JSON as RDF" | substrate |
| **LWS (system)** | `…/lws/v1` (`@protected`, reuses `as:`/`schema:`) | **how is storage organized + what can it DO** (`items`, `service`, `storageDescription`, notifications) | JSS emits the reference; the target **404s** (§6) |
| **Profile (domain)** | array `[…/lws/v1, …/profile/ctx]` | **what does the content MEAN** (OKF `concept`/`resource:`; data-catalog DCAT/CSVW) | not yet — Plan 2 dependency (§6) |
| **Resource (instance)** | its own `@context` + `describedby` → SHACL | **what is THIS + its constraints** | L3 shapes exist, not surfaced as affordances |

**The behavior to reinforce is core JSON-LD `@context` resolution — it is universal, not per-layer.**
The **identity and trust plane rides the exact same mechanism**: a DID document, a Verifiable
Credential, and the LWS-CID / did:key verification material are all JSON-LD `@context` documents, and the
LWS vocabulary *reuses the security terms directly* (`sec:verificationMethod`, `sec:controller`,
`sec:publicKeyJwk`, `sec:authentication`). So storage, identity, credentials, and domain are not four
mechanisms — they are four instances of one: an agent that can resolve and consume `@context` at runtime
understands all of them. And most of it is **already resolvable** — `www.w3.org/ns/did/v1`,
`…/credentials/v1`, `…/credentials/v2`, `w3id.org/security/v2` all return `application/ld+json` (verified
2026-07-03). The single hole is `www.w3.org/ns/lws/v1` (§6). This is why the design reinforces the
*generic* core-JSON-LD behavior rather than any one vocabulary: patch the one hole, and the same agent
capability lights up storage navigation, identity, and credentials for free.

**Two complementary affordance kinds** (Verborgh 2013's three agent needs: machine-readable resources,
a uniform interface, and *semantics of change*):
- **Read / navigation affordance** = the typed edge (the wiki-link pattern, and its JSON-LD twin:
  `up`, `describedby`, `resource:`, domain edges). *What to follow.* Interpreted via the layered
  `@context`.
- **Write / action affordance = "semantics of change"** = the **SHACL `describedby` shape** (the door
  handle for writing: the precondition and, by constraint, the effect), the storage description's
  **`capability`** entries (which operations the storage affords), and **WAC** (who may act). The L3
  **teaching-error** (restored in the review fixes) is Fielding's principle applied to writes: *the
  rejection becomes the affordance* that teaches the precondition.

**The LLM dissolves the RESTdesc barrier.** Verborgh's 2013 answer to "semantics of change" was RESTdesc
(formal N3 action rules), which never scaled. An LLM does not need formal action rules — it can read a
SHACL shape, a `capability` entry, a `@context`, and a teaching-error and *infer* the semantics of
change. So the reason the vision stayed unrealized (formal action description was too costly to adopt)
is the reason it is realizable now. **We do not build RESTdesc; shape + capability + `@context` +
teaching-error is sufficient affordance for an LLM.**

---

## 3. Decisions of record (from the 2026-07-03 brainstorm — do not re-litigate)

1. **Issue 1 — real URIs.** MCP Resources are addressed by the pod's **real `https://` URIs**. The
   `lws://` scheme is retired. Representation *variants* (linkset, ACL, meta) are reached the LWS-native
   way — the resource's own `rel`-links (ACL, storage-description are distinct real URLs) and conneg —
   not a per-kind synthetic scheme.
2. **Issue 2 — federation.** `call_remote_pod`'s `{tool, arguments}` proxy is retired. Federation is
   **affordance-driven**: a thin, explicit remote-read op resolves a remote resource by its real URI and
   returns *its* self-description, so the agent operates the remote pod from *its* advertised affordances.
3. **Preserve JSON-LD in reads.** The pod's own structured representations (container listings, storage
   description, framed profile cards) are returned **as JSON-LD with `@context` intact** — never
   flattened to the opaque text envelope. Sanitization is reconciled per §5.
4. **Publish-and-resolve is an explicit dependency.** The pod MUST make its `@context` and vocabularies
   dereferenceable (§6). The system-layer mirror is in scope now; the profile layer is sequenced with
   Plan 2.
5. **The MCP promotes affordance-consuming behavior** (§7) — the surface actively makes runtime
   affordance-discovery the path of least resistance.
6. **Comunica *link-traversal* is rejected.** Validated broken (`@comunica/query-sparql-link-
   traversal@0.8.0`, frozen, parse error on trivial SPARQL under Node 26) **and** empirically the wrong
   model for LLMs (the vault's own KF experiment: agents route via catalog/shapes, not `@context` link-
   following). The **expressive query pillar is deferred and reframed** (§8) around progressive
   shape/`@context` disclosure — not blind traversal.
7. **Scope = the interface.** The memory model (OKF/Plan 2/L4) is the separate next track; this spec is
   the agent surface.

---

## 4. Read surface — affordance-first, real-URI Resources (issue 1)

**Addressing.** An MCP Resource's `uri` is the pod resource's **real `https://` URL**. `resources/read
{uri: "https://pod.example/alice/notes/a"}` returns that resource. The resolver maps the URL to a pod
path (strip origin; the reverse of `buildUrl`), WAC-checks (unchanged, before `storage.exists` —
no-oracle), and returns the representation.

**Representation.** For the pod's own structured/RDF resources (containers, storage description, framed
profile cards, linksets, ACL views), return **JSON-LD with `@context` intact** — the typed edges
(`up`, `describedby`, `items`, domain edges) are the read affordances and MUST survive to the model.
For opaque/binary resources, return the bytes with the real content-type (via `getContentType`, per the
review fix) and the truncation signal (per the review fix). The blunt "envelope everything as
text/plain" of v2 is replaced by §5.

**Variants without a parallel scheme.** The document view is not privileged into `lws://` kinds:
- **container listing** — reading a container URL (trailing `/`) returns the `application/lws+json`
  `items[]` representation the HTTP layer already produces (one builder, §5 "one Web").
- **linkset** — reached via the resource's `rel="linkset"` (LWS advertises it; note it is conneg on the
  *same* URL) — surfaced as an affordance, not a `lws://linkset/…` kind. Planning decides the exact
  MCP conneg carrier (a `mimeType`/variant hint on read vs. a distinct served linkset URL); the
  constraint is *no invented scheme*.
- **ACL, storage description** — already distinct real URLs (`rel="acl"`, `rel="…#storageDescription"`);
  read them by their real URIs.

**`resources/templates/list` / `resources/list`** advertise real-URI templates/anchors (the storage
root, the storage description, the vocab resources of §6) — the entry affordances a cold agent starts
from. Child enumeration stays no-oracle and page-bounded (v2 carryover).

---

## 5. Write / affordance surface + the sanitization reconciliation

**Writes stay Tools** (parameterized actions, not URIs): `write_resource`, `create_resource`,
`delete_resource`, `write_acl`, `put_typed_resource` — all through `applyLwsWrite` (admission + type-
capture), governance unchanged.

**Present the write affordances.** The surface makes the "semantics of change" legible without the agent
being programmed for it:
- **`describe_resource` (and the resource's own metadata) surface the write affordances** — the
  `describedby` shape URI, the container's member shape, and the storage description's `capability`
  entries — so an agent learns *what a valid write here requires* before attempting it.
- **The teaching-error is the write door handle** (already shipped): a rejected write returns the SHACL
  `sh:message` + violations + shape URI as content the model reads and acts on.

**Sanitization reconciliation (resolves the v2 tension).** v2 enveloped *all* bodies as `text/plain`,
which destroys `@context`/affordances. The rule becomes **trust-typed, not blanket**:
- **Trusted structured pod representations** (JSON-LD the pod itself produces: container listings,
  storage description, linksets, framed profile cards, the vocab resources) — returned **as JSON-LD,
  structure preserved**, with **field-level** hidden/bidi stripping (`sanitizeField`/`sanitizeTypes`, per
  the review fixes) on client-controlled leaf values (names, type/shape IRIs, ACL agents). The `@context`
  and edge structure are never flattened.
- **Untrusted free-text bodies** (arbitrary agent-written resource content whose bytes are opaque) —
  **enveloped** (the nonce-fenced untrusted-content frame, per the review fix), because there the bytes
  carry no affordance the model should trust as instruction.
- **Federated content** (`sanitizeDeep`, per the review fix) — deep-stripped; a remote pod is the least-
  trusted source.

The distinction is *does the pod vouch for this structure*. If yes, preserve it (it is affordance); if
no, neutralize it.

---

## 6. The self-description / publishing layer (explicit dependency)

**The gap, verified 2026-07-03:** `https://www.w3.org/ns/lws/v1`, `…/ns/lws#`, `…/ns/lws` all **404**;
no machine-readable LWS context/vocab is served anywhere public. JSS emits `@context:
"https://www.w3.org/ns/lws/v1"` *by reference* → a cold agent that dereferences it gets nothing. By
contrast the identity/credential contexts the pod also relies on **do resolve** (`did/v1`,
`credentials/v1`, `credentials/v2`, `security/v2` → 200 `application/ld+json`), so the core-JSON-LD
behavior is mostly already supported — **`lws/v1` is the single system-layer hole.** The domain/profile
layer is a separate, not-yet-existing job. So the self-description stack is broken at the bottom
**today** in exactly two places: the LWS-system context (patch now) and the profile context (Plan 2).

Resolvability is not polish — it is the cold-agent test. "APIs they're not programmed for" *requires*
the agent to resolve unfamiliar terms at runtime; if it must know LWS/OKF from pretraining, it is
programmed for the pod.

**Two publishing jobs:**

1. **Profile / domain `@context` + vocab (ours to mint + serve)** — the domain-meaning layer, minted
   under a namespace **we control and can serve** (reuse-first, w3id-shaped, per
   `docs/design-notes/iri-minting.md`). **Sequenced with Plan 2** (the profile mechanism owns publishing
   its context/vocab; a profile advertises `role:context`/`role:vocabulary` per the PROF direction).

2. **A served mirror of the LWS *system* context + vocab (in scope now)** — since `www.w3.org/ns/lws`
   404s, the pod serves a resolvable copy, copied **verbatim** from the normative spec object (we have it
   in the `lws-protocol` skill: `lws10-core/jsonld-context.md` + `lws10-vocab/vocabulary.yml`). Keep the
   **canonical `www.w3.org/ns/lws#` URIs as the term identities** (so the day W3C mints them the mirror
   retires and references "just work").

**Resolvability tactic (recommended):** make the term→URI mapping succeed with zero network by
**inlining the context object** in representations (JSON-LD allows the `@context` value to be the object,
or an array mixing object + canonical URI), and serve the vocab **documents** (system mirror + profile)
at pod-controlled dereferenceable URLs for the on-demand *semantics* step. Inline answers "what does this
term expand to"; the served vocab answers "what does `lws:items` / `okf:concept` mean" when the agent
does not already know. Both then work without pretraining.

*Planning decision:* where to fix the by-reference `@context` — at the HTTP representation layer (JSS
core, most "one-Web" consistent, larger fork edit) vs. at the MCP layer (localized). Recommendation:
the representation layer for consistency, staged if needed. Also non-normatively advertise a resolvable
context for plain-JSON resources via `Link: rel="http://www.w3.org/ns/json-ld#context"` (the card-weight
spectrum).

---

## 7. The MCP promotes affordance-consuming behavior

The MCP surface is the agent's entry point, so it is where behavior is shaped toward runtime discovery:

- **Preserve JSON-LD + `@context`** (§5) — the affordances are actually present to consume.
- **Expose the context + vocab as first-class readable resources** (§6) — the agent pulls the
  system/profile vocabulary as an affordance, never guesses it.
- **Lead with the storage description as the entry "strategy guide"** — the first self-describing handle
  names the services, the vocab locations, and the storage root; runtime discovery starts there. (The
  KF-experiment finding: the storage description is *"not just a data catalog — it is a strategy guide
  for agents."*)
- **Steer via descriptions + teaching-errors** — the tool/resource `description` fields the model reads
  (arXiv 2606.30317: selection is by description) and the L3 rejection content point the agent at "read
  the `@context`, follow the typed edges, consult the `describedby` shape." The surface nudges toward
  affordance-following and away from pre-programmed assumptions.

---

## 8. The expressive query pillar — DEFERRED and reframed (not built here)

Recorded so it is not re-litigated, and so the deferral is principled, not a gap:
- **Not Comunica link-traversal.** Validated broken (§3.6) and empirically not how LLMs operate.
- **Reframed as progressive shape/`@context` disclosure for query *authoring*** — built on shipped
  machinery: L3 `describedby` shapes are the type-declaration scaffold (Wardenga 2025: text-to-SPARQL F1
  0.00→0.28 on an *unseen* KG from injecting SHACL shapes — "the shape functions like a type
  declaration"); the TypeIndex/TypeSearch is the routing catalog; the storage description is the strategy
  guide. Calibrated disclosure (Class→Property→Constraint), not ontology dumps — "too much schema hurts"
  (FIRESPARQL; Agentic-SPARQL). RelationalAI's *progressively-revealing ontologies* (2410.09244) is the
  reference mechanism.
- **Execution, when it lands,** uses the **working non-traversal** Comunica (`@comunica/query-
  sparql@5.2.4`, parse verified) over explicitly-resolved sources, or a server-side query — never blind
  traversal. **Sequenced after Plan 2** (the vocabulary the authoring step needs must be published
  first, §6).

---

## 9. Carried forward (unchanged) from v2 + the review fixes (`la3d/lws@7e9c2c1`)

- The **Resources primitive** + dispatch, tool-budget discipline (≤ ~9 tools), `applyLwsWrite` governed
  writes, `collectAuthorizedResources` no-oracle discovery, `mcpCredentialPolicy`, the `/mcp` rate-limit.
- All 12 review fixes: transactional `put_typed_resource`, `sanitizeTypes`/`sanitizeField`/`sanitizeDeep`,
  container-ACL path resolution, malformed-percent → invalid-params, `readBounded` (bounded read +
  truncation signal), skill read-error surfacing, `ResourceError` teaching content, the single surface
  registry (`surface.js` — now generalized to the real-URI resolver table), helper reuse.
- The affordance model **re-uses**, not replaces, this machinery; the change is the *addressing* (real
  URIs), the *representation* (JSON-LD preserved), the *federation* (affordance-driven), and the new
  *self-description/publishing* + *promote-the-behavior* layers.

---

## 10. Scope, phasing, and out-of-scope

**Ships this round (the affordance surface):** §4 real-URI reads + JSON-LD preservation; §5 write-
affordance surfacing + sanitization reconciliation; §2/§4 retire `lws://`; §3.2 retire `call_remote_pod`
→ thin affordance-driven remote read; §6 **system-layer** context/vocab mirror + inline context; §7
promote-the-behavior surface.

**Dependency, sequenced with Plan 2 — deliberately, not just by ordering:** §6 **profile-layer**
`@context`/vocab publishing. Deferred on purpose: we want to **observe agentic behavior with the core
JSON-LD semantics first** — the system + identity/credential planes, which are (once `lws/v1` is
mirrored) fully resolvable — before adding domain-profile richness. The cold-agent test (§1) is thus run
first as an *experiment*: how far does a cold agent get on core JSON-LD affordances alone? What it can
and cannot do without the domain vocab is the evidence that shapes Plan 2. Adding the profile vocab
before observing the core-only behavior would confound that measurement.

**Deferred (own later phase):** §8 the expressive query pillar.

**Out of scope:** the memory/OKF/L4 model; A2A/RFC-8693 federation (the thin remote read is the current
home-grown stand-in); changing the auth chain.

---

## 11. Grounding / evidence trail

- **LWS spec** (the `lws-protocol` skill): core `logicalresourceorganization.md` (URI-independent-of-
  containment; `rel="up"`/`items`); `Discovery.html` (storage description = services with
  `serviceEndpoint`; "API of these services outside scope"); `jsonld-context.md` (the normative
  `@context` object, `@protected`, vocab reuse); `lws10-searchindex` (TypeIndex/TypeSearch = the
  constrained query pillar); `lws10-vocab` (system vocab scope).
- **Verborgh vision:** "Affordances weave the Web" (2013), "What web agents want" (2013) — affordances,
  the three agent needs, "APIs they're not programmed for", RESTdesc, one-Web; "The Web's data triad"
  (2024) — PIQ; "Let's talk about pods" (2024) — pods-as-graph, "no view is more special."
- **Comunica-MCP demo** (rubensworks, ESWC 2026) — Tools-only, real-URI `sources`; *no* schema-disclosure
  channel (works only on pretrained KGs) — the gap, live.
- **Link-traversal validation (2026-07-03):** `@comunica/query-sparql-link-traversal@0.8.0` frozen +
  parse-error under Node 26; `@comunica/query-sparql@5.2.4` parses cleanly.
- **Vault research:** `2026-03-11-phase2.5b-jsonld-navigation-findings` (LLMs route via catalog/shapes,
  not `@context` traversal; storage description = strategy guide); `@wardenga-2025-data-shapes-sparql`
  (shapes as type declarations, 0→0.28 unseen-KG); Progressive Disclosure / Hierarchical-Retrieval /
  bounded-branching notes.
- **External lit:** RelationalAI progressively-revealing ontologies (2410.09244); SIB VoID+example RAG
  (2410.06062); FIRESPARQL (2508.10467) + Agentic-SPARQL (2603.06582) — disclosure *calibration* is the
  real problem.
- **Project design notes:** `docs/design-notes/contextual-linked-memory.md` (three levels of self-
  description; card-is-the-handle); `iri-minting.md` (reuse-first, w3id-shaped, resolvable); prior spec
  `2026-07-02-mcp-v2-agent-surface-design.md`.
- **Namespace-404 verification (2026-07-03):** `curl` of `www.w3.org/ns/lws{,/v1,#}` → 404.

---

## 12. Open questions for planning (not blockers)

- **Linkset/conneg variant carrier over MCP** — a `mimeType`/variant hint on `resources/read` vs. a
  distinct served linkset URL (§4). Pick the one that reads clearest and stays "one Web."
- **`@context` fix placement** — HTTP representation layer vs. MCP layer (§6). Recommendation:
  representation layer, staged.
- **Inline vs. served-reference vs. both** for the context value — default inline for the small system
  context; served for the larger profile context (§6).
- **Thin remote-read op shape** — the minimal affordance-driven federation op(s) that let an agent read a
  remote resource + consult its storage description / TypeSearch, without re-encoding remote capabilities
  locally (§3.2). Keep it minimal (YAGNI); no God-Tool.
- **Cold-agent test as an automated gate** — can §1 be exercised as a live check (a fresh agent, root URL
  only, completes a read→write→remote-read task)? Scope the harness in planning.
