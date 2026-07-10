# Fork serving-path round — design of record

**Date:** 2026-07-10
**Status:** design of record. Governed by `docs/design-notes/layer-cake-principles.md` (P13) and the
standing fork discipline (every LWS behavior `--lws`-gated; the `--lws`-off path byte-identical,
negative-control tested). Grounded by `.claude/skills/json-ld` (JSON-LD 1.1), `.claude/skills/lws-protocol`
(lossless media-conneg mandate), `.claude/skills/solid-protocol` (WAC). This is the fork-queue
drain named "NEXT" in `FOLLOWUP.md` (2026-07-10). **Next step:** run `superpowers:writing-plans`
against this spec, then subagent-driven implementation. Do NOT start implementation from this doc
without a plan.

---

## 0. Why this exists

Two related defect families in the fork's hand-rolled JSON-LD⇄quads layer, plus six smaller queued
affordance/authz items, all probe-found and recorded in FOLLOWUP:

1. **Serving is silently lossy (probe #4, spec-weight).** `src/rdf/turtle.js`'s `jsonLdToQuads`
   collects only top-level nodes carrying `@id`, and spread-merges `@context` (`{...obj, ...array}`).
   A stored `{@context, @graph}` doc → **zero quads → 200 + empty Turtle, no error**. Array and
   remote `@context` docs parse to garbage or nothing. A Turtle-only cold client reads a populated
   container as empty. `Accept: application/n-quads` isn't recognized at all (raw JSON-LD returned).

2. **The store form is not self-describing JSON-LD.** `quadsToJsonLd` serializes a multi-subject
   Turtle PUT as a **top-level array with `@context` on element 0 only**. Standard JSON-LD expansion
   gives elements 1..n no prefix definitions — stored artifacts are invalid for conformant consumers.
   Reader and writer were bug-compatible; Phase 1 fixed the *admission* reader (`toDataset` →
   `@rdfjs/parser-jsonld`, commit `a9f690e`) and left `shimLegacyStoreArray` as a bridge "until the
   serializer round". This is that round: fix the writer, retire the shim, and put the same real
   parser on the *serving* path.

The six smalls: anonymous container listings leak unreadable members (probe #3, LWS Policy pillar);
`/.well-known/openid-configuration` advertises `http://localhost:3000` behind Caddy (probe #5);
`.lwstypes` sidecars serve as octet-stream; the storage-description hint over-promises ("every
resource serves a linkset") and omits membership steering; `/mcp` is invisible to an HTTP-cold agent;
`urlToStoragePath` silently misresolves under `--subdomains`. Plus one lws-pod-side contract seam
(publish `default` vs instantiate `self`) recorded at the Phase-2 final review.

---

## 1. Scope and hard constraints

**One round, one spec, one fork branch** (Chuck's call, 2026-07-10): the serving-path core + the six
queued smalls + the lws-pod contract seam. Branch `la3d/lws-servepath` off `la3d/lws` (`d75a4dd`),
merged `--no-ff` back, then the lws-pod repin + gate updates.

**Hard constraint — the gating discipline.** Both core arms (dataset serving, store-form envelope)
engage **only under `--lws`**. The `--lws`-off path — including a `--conneg`-only pod — stays
byte-identical to today, held by negative controls. "Retire the hand-rolled pair" therefore means:
under `--lws` it is unreachable on the serving/storing paths; it survives solely as the `--lws`-off
legacy arm (marked as such). Un-gating (e.g. to upstream the fix) is a deliberate later decision,
not a side effect.

**Hard constraint — P13.** Everything here is Bucket-1 substrate: generic RDF correctness, generic
authz filtering, generic affordances. Zero application vocabulary enters the fork.

**Out of scope (stays recorded in FOLLOWUP):** federation-hardening round (remote-arm size bound +
SSRF guard), console-on-fork rewire, seed hygiene (probe residue in `/alice/`, dangling
`good.links.jsonld`, `conneg-mem` 401), MCP affordance-polish fold-ins, root index-shadow conneg
(the rel is already suppressed; un-shadowing is a different decision), earned-at-admission
`conformsTo`, host-aware `urlToStoragePath` (this round only guards it).

---

## 2. Core, read side — the dataset seam

**The seam.** `toDataset(buffer, contentType, baseIri)` + `isRdfBody` + the no-network
`documentLoader` (sole preload: LWS v1 from `src/lws/context.js`) move from `src/lws/admission-rdf.js`
to a neutral module, `src/rdf/dataset.js`. One shared "bytes → RDF/JS DatasetCore" entry for
admission AND serving. `admission-rdf.js` re-exports or shrinks to the admission-specific residue.
No new dependencies: `@rdfjs/parser-jsonld`, `rdf-ext`, `n3` are already in `package.json`.

**The serving arm** (`src/handlers/resource.js`, the conneg branches that today run
`safeJsonParse → fromJsonLd → jsonLdToTurtle → jsonLdToQuads`): when `request.lwsEnabled` and the
negotiated type is Turtle/N-Triples/N-Quads, serve `toDataset(stored bytes) → n3 Writer` instead. Policy (Chuck's call — 406 teaching, both cases; grounded in the
LWS lossless-conneg mandate):

| Stored doc | Turtle / N-Triples | N-Quads | JSON-LD |
|---|---|---|---|
| default-graph-only | 200, real triples | 200 | 200 (unchanged arm) |
| has named graphs | **406 + teaching** (lossy) | 200 (lossless) | 200 |
| unparseable / remote `@context` | **406 + teaching** | **406 + teaching** | 200 (bytes are bytes) |

- The 406 body is `application/problem+json`, teaching-style (the admission-400 precedent): why the
  conversion is refused and which formats work (`application/ld+json` always; `application/n-quads`
  for datasets). Never again a silent 200 with empty or mislabeled content.
- `application/n-quads` joins `RDF_TYPES` and, with `application/n-triples`, joins the negotiable
  outputs (n3 Writer `format` option) — requiring `--lws` AND `--conneg`, exactly as Turtle does
  today. Today's dead `negotiated === 'application/n-triples'` checks in resource.js become live.
- GET/HEAD parity: the HEAD handler mirrors the same negotiation (Content-Length from the same
  serialization; 406 parity).
- The HTML data-island → Turtle branches ride the same arm (their input is a parsed JSON-LD island;
  feed it to the same dataset → writer path).
- Q-weighted Accept parsing (`selectContentType`) is unchanged; only the output-format set and the
  conversion engine change.

**Vocabulary note.** The n3 Writer keeps the existing `COMMON_PREFIXES` + parse-discovered prefixes
for readable Turtle; the terminator-spacing post-pass (`applyTerminatorSpacing`, #419) is retained.

---

## 3. Core, write side — the self-describing store form

**The envelope.** `quadsToJsonLd` (the Turtle/N3 → stored JSON-LD direction) keeps its compact,
prefix-based emission — the store form stays human-readable and git-diffable, which matters for a
git-versioned pod — but the multi-subject envelope changes from *top-level array, `@context` on
element 0* to **`{"@context": ..., "@graph": [...]}`**. Single-subject docs stay
`{"@context": ..., ...node}` (unchanged). Under `--lws` only (an options/flag parameter threaded
from the handlers, which know `request.lwsEnabled`); `--lws`-off keeps the legacy array form
byte-identically.

Deliberate asymmetry: *parsing* arbitrary JSON-LD is where hand-rolled code kept failing — that goes
to the real parser (§2). *Emitting* JSON-LD from quads we just parsed ourselves is total and simple —
the emitter stays ours, now with a correct envelope. (A library serializer would emit expanded form:
unreadable, diff-churning, and no gain.)

**Shim retirement.** `shimLegacyStoreArray` in `admission-rdf.js` is **deleted** in the same round
(Chuck's call: no migration). Consequences, accepted: legacy array-form docs already on a pod
degrade to standard JSON-LD semantics (context-less elements lose prefix expansion) for admission
and serving alike; the rig's story is `make reset`. A client PUTting a genuine top-level array keeps
standard JSON-LD semantics — the shim's cross-element context copying was itself the non-standard
behavior being retired.

**Consumer audit (done at design time).**

| Consumer of `turtleToJsonLd` output | Status |
|---|---|
| `src/wac/parser.js` `parseAcl` | Already normalizes `doc['@graph'] \|\| [doc]` — and JSS's own generated ACLs already use the `{@context, @graph}` envelope. The store form converges on JSS's native ACL shape. No change. |
| `src/auth/webid-tls.js` `extractCertKeys` | Does NOT unwrap `@graph` — gets the same one-line normalization `parseAcl` has. (Shape-agnostic after the fix, so safe regardless of gating.) |
| `src/handlers/resource.js` data-island embed (line ~607) | Stringifies whatever it gets; `{@context, @graph}` is valid JSON-LD where the old array was broken for conformant consumers. Improvement, no change needed. |

---

## 4. The queued smalls

**S1 — WAC-filtered container listings (spec-weight; probe #3 finding a).** When
`request.lwsEnabled`, the container GET filters directory entries through a per-member
`checkAccess`(READ)-and-drop loop for the requesting agent before any membership rendering is built:
`ldp:contains` JSON-LD, `lws+json` `items[]`, and the Turtle rendering derived from them. Extracted
as a small helper following `src/lws/authorized-resources.js` (whose header already declares the
checkAccess-and-drop loop "IS the authz boundary" — this closes the asymmetry where `/types/*`
filters and the plain listing doesn't). Semantics: **hide, never 401** (no-oracle, matching
`/types/*`). Cost: N ACL checks per listing — accepted at rig scale; recorded as a perf follow-up
(ACL-result memoization within a request) if listings grow.

**S2 — openid-configuration issuer (probe #5; rig-only, zero fork code).** The handler builds every
discovery URL from the config-time `issuer` (default `http://localhost:<port>` baked in
`bin/jss.js`), while `lws-storage` derives origin from the request (proxy-aware). The fix is NOT to
request-derive the issuer — OIDC issuer is identity and must be stable config — but to configure it:
`docker-compose.fork-tls.yml` sets `JSS_IDP_ISSUER=https://pod.vardeman.me` (the knob exists:
`src/config.js:190`). A gate assertion checks the advertised issuer. `make doctor-tls` unaffected.

**S3 — `.lwstypes` mediaType.** Only `.lwstypes` actually falls through to `application/octet-stream`
(`.meta`/`.acl` already map to `application/ld+json` in `getContentType`'s overrides — the probe-#3
finding is half-obsolete). Add `.lwstypes` → **`application/json`** (it is a plain-JSON server
sidecar, not JSON-LD; ld+json would over-claim RDF semantics). Ungated is acceptable: the file type
only exists under `--lws`.

**S4 — storage-description hint wording** (`src/lws/storage-description.js`, the `linkset` hint).
Two edits: (a) stop promising "every resource serves a linkset" — index.html-shadowed containers
correctly don't; say the shadowed-container case and "descend to a member". (b) Add the missing
membership steering: **membership lives in the container body** (`ldp:contains` / `lws+json`
`items[]`), type-based discovery in `/types/search`; the linkset carries governance edges
(`up`/`type`/`describedby`/`conformsTo`), not membership. Closes the probe finding "a linkset-only
client thinks containers are empty". Wording is the affordance — keep both hints one-breath short.

**S5 — MCP gateway advertisement.** New `service[]` entry in the storage description, emitted when
MCP is enabled (flag threaded into `buildStorageDescription`'s existing `flags`): type `McpService`
(minted in the same namespace as `ProfileIndexService`), `serviceEndpoint: {origin}/mcp`, one-line
hint naming JSON-RPC 2.0 Streamable HTTP + POST-initialize. Closes "MCP is invisible to an
HTTP-cold agent". HTTP+MCP surfaces share the one builder (existing parity test extends).

**S6 — `--subdomains` guard.** `urlToStoragePath` (`src/lws/admission.js:30`, bare `URL.pathname`)
is path-mode-only and feeds BOTH SHACL shape resolution (`write.js`) and the conneg authz filter
(`representations.js:82`). Guard accordingly: **refuse `--subdomains` + `--lws` at startup** with a
clear error naming the limitation — broader than the queued "subdomains+conneg" wording because
admission misresolves too. Host-aware path mapping stays deferred.

**S7 — publish/instantiate contract seam (lws-pod repo, not fork).** `checkRepresentation` in
`projection/publish/` gains a **`self ⟺ default` cross-check** (declaration-time teaching error), so
a rep declaring `default: true` without `self: true` can no longer check clean yet never advertise
as `altr:hasDefaultRepresentation`. `instantiate()` unchanged. One publish unit test.

---

## 5. Testing, verification, rollout

**Fork (TDD, per-change; suite `node --test`, `--test-force-exit` per the known hang):**

- Serving: `{@context, @graph}` doc → real Turtle triples (probe-#4 signature asserted dead);
  array-`@context` doc → correct triples; named-graph doc → Turtle **and** N-Triples 406 with
  teaching body + N-Quads 200 (graph names intact); remote-`@context` doc → 406 teaching, never a
  mislabeled 200; GET/HEAD parity on the 406 and on Content-Length.
- Store form: multi-subject Turtle PUT → `{@context, @graph}` bytes; single-subject unchanged;
  round-trip PUT-Turtle → GET-Turtle equivalence (isomorphic quads).
- Shim gone: new-form admission validates; a context-less array element now has standard (no-prefix)
  semantics — asserted, not shimmed.
- `extractCertKeys` unwraps `@graph`.
- S1: unreadable member absent from `ldp:contains` AND `items[]`; readable members intact; anonymous
  vs owner listings differ; no 401 leak.
- S3/S4/S5/S6: `.lwstypes` content-type; hint strings (exact-match the reworded text); `McpService`
  present iff MCP enabled (+ HTTP/MCP parity); `--subdomains --lws` startup refusal.
- **Negative controls:** `--lws`-off serving bytes, store-form bytes, and listing bytes are
  byte-identical to pre-round behavior (including a `--conneg`-only pod).
- Full fork suite green (~1226, 1 known pre-existing skip) before merge.

**lws-pod (after merge + push):** repin `Dockerfile.fork` `JSS_GIT_REF` to the full merge SHA (image
tag `fork-servepath`); compose-fork-tls gains `JSS_IDP_ISSUER`. Gate updates: `make test-conneg`
grows the serving cases (GET `@graph` doc as Turtle → triples; N-Quads 200; named-graph Turtle →
406 teaching); an openid-configuration issuer assertion; an anonymous-listing filter assertion; S7's
publish unit test. Then the **full sweep zero-regression** (lws 6, l3 2, typeindex 7,
indexed-relation 4, profiles 6, dcat 5, graph 6, conneg 7+new, mcp-v2 16, wiki 9, projection + apps
units) — minding the known mcp-v2 60s rate-limit window between back-to-back runs.

**Close-out:** cold probe #6 (unprimed, pod URL + CA only) re-runs the probe-#4 Turtle battery over
the corrected surface — the behavioral flip this round buys: **Turtle conneg either serves real
triples or teaches; it never lies.** FOLLOWUP updated (fork-queue drained to the recorded
carryovers); `docs/foundations/05-jss-spec-conformance.md` rows re-dispositioned where touched.

---

## 6. Decision log (2026-07-10, Chuck)

1. **One round, one spec** — serving-path core + queued smalls + S7, one branch, one repin.
2. **Approach A** — dataset-centric seam: real parser for parsing, our compact emitter (with the
   `@graph` envelope) for emitting; no new dependencies. (B — library serializer end-to-end —
   rejected: expanded-form store kills readability/diffability. C — patch `jsonLdToQuads` in place —
   rejected: keeps a partial JSON-LD processor as the serving foundation, the defect source this
   round retires.)
3. **Drop the shim, no migration** — legacy array-form docs degrade to standard JSON-LD semantics;
   `make reset` is the story; the shim's context-copying was itself non-standard.
4. **406 teaching, both cases** — unconvertible docs and named-graphs-as-Turtle both refuse with a
   teaching body; N-Quads is the lossless dataset serialization; no silent triple loss ever.
