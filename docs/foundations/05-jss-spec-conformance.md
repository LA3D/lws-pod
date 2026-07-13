# Spec-vs-JSS conformance map

Project analysis (not verbatim spec): for each of the seven evaluation-checklist axes
(`README.md`), this puts the Solid/LWS spec **requirement** next to what **JSS documents**
and gives a verdict. The application layer the three grounded skills point to —
`solid-protocol` / `lws-protocol` (what the standard says) and `jss-server` (what the server
says it does). Where JSS docs are silent we mark **GAP** and defer to a live test rather than
assume conformance.

Verdicts: **CONFORMS** · **EXTENDS** (adds beyond spec) · **DIVERGES** (differs from spec) ·
**GAP** (docs silent → verify live). Axes marked *(verified live)* were probed against a running
pod on 2026-06-20 via `make smoke` (`smoke.sh` steps 7-11).

| # | Axis | Verdict |
|---|---|---|
| 1 | Container boot / reset-with-volume | CONFORMS — survives `down`/`up` *(verified live)* |
| 2 | Headless agent auth (`/idp/credentials`) | DIVERGES — RS256 JWT bearer, no DPoP *(verified live)* |
| 3 | Agent surface (`/mcp`, CRUD+ACL under WAC) | EXTENDS (WAC core CONFORMS) *(MCP self-advertised 2026-07-10; listing WAC-filtered + guard-parity/alternates/SSRF-hardened 2026-07-11)* |
| 4 | Conneg + container traversal | CONFORMS to Solid conneg · DIVERGES from LWS storage · ✅ **PATCH + ETag conformance RESTORED** *(serving hardened, listings WAC-filtered 2026-07-10; teaching-406/gateway/VoID/ETag + representation-preservation/304-406-ordering/`--lws-config` 2026-07-11; the 2026-07-12 audit's 2 round-introduced violations + 3 pre-existing — N3-Patch-on-Turtle, Turtle↔JSON-LD ETag, JSON-Merge-Patch, missing-Content-Type, json-label — all FIXED by the fork review round `4824fe2..b31510a`; see the §4 correction block)* |
| 5 | Git clone/push as storage | EXTENDS — materializes, but bypasses conneg *(verified live)* |
| 6 | LWS-CID identity | CONFORMS (RS-direct profile of the AS-mediated suite); `aud`+`exp` replay-guards enforced; provisioning WORKS headless, auth needs public-IP WebID *(verified live)* |
| 7 | L2 port landing (SHACL / projection / git-commit) | CONFORMS — `.meta`/`constrainedBy` work, proxy ports *(verified live)* · GAP (in-process hooks) |

---

## 1. Boots clean in a container; survives reset with persistent volume

**Spec.** Out of scope for Solid/LWS — both specify HTTP behaviour, not deployment. The
closest spec hook is storage discovery: a storage is *"a space of URIs that affords agents
controlled access to resources"* and is found via *"a relation of type
…pim/space#storage"* (`protocol.html`). Persistence is an implementation property.

**JSS.** Storage is a filesystem tree under `--root`: *"`--root <path>` … Data directory …
`./data`"* (`reference/cli.md`), persisted via config/env (`reference/configuration.md`).
First-run is idempotent: *"The seeded landing page is skip-if-exists … JSS will never
overwrite an operator-provided file"* (`getting-started/first-run.md`). No doc describes
restart/reset behaviour, volume mounting, or what survives a wipe.

**Verdict: GAP** (restart test pending). Filesystem-rooted storage *implies* a volume mount
works, but persistence is undocumented. Mind the Makefile: `make reset` runs `docker compose
down -v` — it **wipes** the volume by design. The persistence test is `make down && make up`
(volume kept). `smoke.sh` step 10 writes a marker for exactly this; the marker survived across
runs against the same running instance, but the `down`/`up` restart test is still outstanding.

**Implication.** The `--root ./data` dir is the volume boundary; the eval must confirm `make
down && make up` re-reads it intact (pods, ACLs, any provisioned keys) — and treat `make reset`
as a deliberate wipe, not a restart.

## 2. Headless agent auth — the main draw

**Spec.** Solid-OIDC tokens are **DPoP-bound by design**: *"When requesting a DPoP-bound
OIDC ID Token, the Client MUST send a DPoP proof JWT"* and *"A DPoP Proof … MUST be present
when a DPoP-bound OIDC ID Token is used"* (`oidc.html`). The AS *"MUST be capable of
exchanging a valid Solid-OIDC ID Token for an OAuth 2.0 Access Token"*. LWS core requires a
signed credential carrying `subject`/`issuer`/`client` URIs (`Authentication.html`). Neither
spec defines a username/password `/idp/credentials` token endpoint.

**JSS.** The docs describe *"Simple HMAC tokens from `POST /idp/credentials`"* (`features/mcp.md`)
sent as *"`Authorization: Bearer …`"* (`features/app-install.md`), and JSS *also* accepts the
spec path: *"JSS accepts DPoP-bound tokens from any Solid IdP"* (`features/authentication.md`).
**Verified live (2026-06-20, `smoke.sh` step 7):** `/idp/credentials` actually returns an
**RS256 JWT** — claims `iss`/`sub`/`aud`/`webid`/`client_id`/`iat`/`exp`/`jti`/`scope`, header
`alg: RS256` — with **no `cnf` claim**. So it is *not* the "HMAC" token the docs imply, but it
*is* a plain, non-sender-constrained bearer.

**Verdict: DIVERGES** *(verified live)* — the headless credential is a **replayable RS256 JWT
bearer**, not DPoP-bound; a **CONFORMS** DPoP path exists alongside it. (The docs' "HMAC"
wording is contradicted by the live token — mechanism differs, verdict unchanged.)

**Implication.** The draw is real (one POST, no browser) but the token is a bearer secret, not
a proof-of-possession credential — capture = replay. For an agent substrate, decide whether
bearer-replay risk is acceptable or whether agents should ride the DPoP / LWS-CID paths (axis 6).

**Rig note (fork serving-path round, 2026-07-10, S2 — zero fork code).** Probe #5 found
`/.well-known/openid-configuration` advertising every discovery URL from the config-time default
(`http://localhost:<port>`) even behind the TLS Caddy proxy at `pod.vardeman.me` — a cold OIDC
client would fail on the mismatch. Not a fork bug: OIDC issuer is identity and must be stable
config, not request-derived (`lws-storage`'s origin, by contrast, is correctly proxy-aware). Fix is
deployment-side (spec `docs/superpowers/specs/2026-07-10-fork-serving-path-design.md` §4 S2):
`docker-compose.fork-tls.yml` now sets `JSS_IDP_ISSUER=https://pod.vardeman.me` (the knob already
existed, `src/config.js:190`). Live-verified: `tests/lws-conneg.test.mjs`'s "openid-configuration
behind the TLS proxy" gate asserts the advertised issuer starts with `https://pod.vardeman.me` and
never mentions `localhost`.

## 3. Agent surface: `/mcp` lists tools; CRUD + ACL under WAC

**Spec.** MCP is not a Solid/LWS concept — no spec requirement. The underlying CRUD+ACL is:
Solid requires LDP CRUD and WAC modes *"acl:Read … acl:Write … acl:Control"* with
*"acl:agent … acl:default"* inheritance, ACL discovery via *"a Link header with the rel
value of acl"* (`wac.html`).

**JSS + affordance surface (2026-07-03; fork `la3d/lws`).** `--mcp` exposes `POST /mcp`
(JSON-RPC 2.0). **Reads are MCP Resources** addressed by the pod's **real `https://` URLs**,
dispatched on the resource itself (container→`application/lws+json` `items[]`, `<X>.acl`→a
`Control`-gated ACL view, `<X>.meta`→metadata, else the body — the pod's own JSON-LD preserved
with `@context` intact, untrusted free-text enveloped). Mutations/queries stay **9 tools**:
`write_resource`/`create_resource`/`delete_resource`/`write_acl`/`lws_type_search`/`subscribe`/
`read_remote_resource` + convenience `put_typed_resource`/`describe_resource` (`docs/mcp.md`).
Crucially: *"There is no separate MCP auth layer — granting an agent access … is the same
operation as granting a human: edit the ACL"* — every **read and** tool call is WAC-checked on
the path it touches (no-oracle: WAC **before** existence). WAC modes/agent classes match the
spec. The real-URI model **aligns with LWS core** — a resource's URI is *independent of
containment* and structure lives in `rel="up"`/`items`, not a URI scheme — which is why the
earlier invented `lws://` scheme was retired.

**Verdict: EXTENDS.** WAC + LDP CRUD **CONFORMS**; `/mcp` is a value-add surface on top with
no spec to violate, and its reads now follow the LWS URI/discovery model rather than an
invented namespace. Carve-outs: `update_resource` (PATCH) still deferred; `read_remote_resource`
reads *public* remote resources only (authenticated remote read = trust track).

**Finding (2026-07-03) — the LWS `@context` 404s.** `https://www.w3.org/ns/lws/v1` (and
`…/ns/lws#`) return **404** — the W3C WG has not minted the namespace. JSS emits it by
reference, so a cold agent that dereferences it gets nothing. The fork now **serves + inlines a
verbatim mirror** of the normative context + a vocab doc (`/.well-known/lws/context|vocab`,
`src/lws/context.js`) so term resolution works with zero network; canonical `www.w3.org/ns/lws#`
term URIs are kept so the mirror retires when W3C publishes. The DID/VC/security contexts the
pod also uses (`did/v1`, `credentials/v1|v2`, `security/v2`) **do** resolve — `lws/v1` was the
single hole. This is a divergence-until-upstream-publishes, not a conformance gap.

**Implication.** This is the cleanest win — agent identity *is* a WAC subject, revocation is
one ACL edit. The MCP `write_acl` structured form is exactly where the L2 governance hooks
attach. Watch the relative-WebID footgun (`features/mcp.md`).

**Fork serving-path round (2026-07-10) — MCP now advertised to HTTP-cold agents; sidecar
mediaType corrected.** The storage description gains a `service[]` entry (`McpService`,
`serviceEndpoint: {origin}/mcp`, a one-line JSON-RPC 2.0 Streamable HTTP hint) whenever `--mcp` is
on (spec `docs/superpowers/specs/2026-07-10-fork-serving-path-design.md` §4 S5) — closing "an
HTTP-cold agent can't discover `/mcp` exists" (HTTP + MCP surfaces share the one builder,
parity-tested). `.lwstypes` sidecars now serve `application/json` instead of falling through to
`application/octet-stream` (§4 S3; `.meta`/`.acl` already mapped correctly — the probe-#3 finding
on sidecar mediaTypes was half-obsolete). The other half of probe #3 — anonymous/authenticated
**container listings** now running the same checkAccess-and-drop loop this section's `/types/*`
already used — is recorded under axis 4 alongside the rest of the conneg-serving hardening (the
listing is a conneg-adjacent representation, not an MCP-specific concern).

**Fork gateway round (2026-07-11) — the last unfiltered listing surface closed.** `readContainerView`
(`src/mcp/resources.js`) now runs the same per-member WAC checkAccess-and-drop loop as the HTTP
listing surfaces (spec `docs/superpowers/specs/2026-07-11-fork-gateway-round-design.md` §8),
closing the carryover this section itself recorded above ("the MCP `readContainerView` listing
surface remains **unfiltered**") — S1 parity is now complete across HTTP and MCP. Folded in the
same batch: `isLocalUri`/`uriToPath` widened to an EXACT `uri === origin` match (no prefix
bypass — all 4 consumers verified, federation arm stays unreachable via bare origin), a bare-origin
normalization test, and `localLinks` no longer emits a 404ing `up` for fixed `.well-known`
resources. **Verified:** `make test-mcp-v2` **18/18** (was 16).

**Debt-drain round (2026-07-11, `la3d/lws-drain` merge `4824fe2375d0959856e93bebf9878f9db9da099c`)
— MCP read-path trust unified; conneg-by-profile discoverable from inside MCP; federation arm
hardened.** Spec of record `docs/superpowers/specs/2026-07-11-debt-drain-round-design.md` §5-6.
Probe #7 (Arm A) had claimed an injection-guard asymmetry between `resources/read` and the
`read_resource`/`describe_resource` tools; a verify-first characterization (DT5) found the
premise **wrong** — `resources/read` and `read_resource` already agreed exactly (both funnel
through the shared `readBody`). The real gap was `describe_resource`, which unconditionally
fenced JSON-LD bodies, destroying `@context`; extracted the shared trust decision into
`sanitizeForTrust` (`src/mcp/read.js`) so all three read surfaces now treat a given resource's
trust identically. **DT6** closes the "conneg-by-profile is undiscoverable from MCP" gap (probe
#7 A2): `read_resource`/`describe_resource` now surface authz-filtered
`canonical`/`alternate` representations plus a teaching sentence naming `Accept-Profile` — an
agent no longer has to drop to raw HTTP to find a resource's alternate representations. Smalls:
real `mimeType` (A5), a single "not found or not authorized" denial string across both the 403
and 404 branches (A8, no oracle split), `lws_type_search`'s empty-args-means-full-inventory
documented (A9), and the `McpService` hint now names the anonymous rate-limit budget. **DT7**
fixes `items[]` mediaType for suffixed sidecars (`x.meta`/`x.acl`) via the Solid-aware
`getContentType` instead of `mime.lookup`'s `octet-stream` fallback (closes the S3-family probe
#7 finding). **DT8** closes the federation remote arm's two long-deferred hardening gaps (named
at the model-driven-read round, 2026-07-06): a new `src/mcp/ssrf.js` blocks
loopback/RFC-1918/link-local/cloud-metadata targets by default (`--lws-federation-private`
opts a local rig back in), and the remote body read is now streamed-and-capped
(`MAX_BODY_BYTES`) instead of buffered unbounded. An adversarial review found and closed 2
Critical bypasses (redirect-follow to a blocked host was never rechecked; `new URL().hostname`'s
bracketed IPv6 form made the entire IPv6 block-list dead code on the real fetch path, so
`[::ffff:169.254.169.254]` reached cloud metadata) — DNS-rebinding and IPv4-compatible/NAT64
literal addresses stay a recorded, explicit, out-of-scope limitation (checks the literal
hostname, not a resolved address; documented in-code).

**Verdict unchanged (EXTENDS)** — this round closes trust/discoverability/hardening gaps in the
value-add surface, not a conformance-class change (MCP has no Solid/LWS spec to conform to).
**Live-verified** (image `fork-drain`, merge `4824fe2375d0959856e93bebf9878f9db9da099c`): `make
test-mcp-v2` **23/23** (was 18), full 15-gate sweep zero regression (`FOLLOWUP.md`).

## 4. Conneg round-trip; container `ldp:contains` Comunica-traversable

**Spec — two different container models in play.**
- *Solid* requires RDF sources to satisfy both formats: *"the server MUST satisfy GET
  requests … when the … Accept header … requests text/turtle or application/ld+json"*
  (`protocol.html`); containers are LDP Basic Containers with *"a 1-1 correspondence between
  containment triples and …the path name hierarchy"* (i.e. `ldp:contains`).
- *LWS* specifies a **different** container shape: an `items` array, not `ldp:contains`, and
  *"container representation … MUST use the media type `application/lws+json`"*
  (`lws-media-type.md`, `container-representation.md`).

**JSS.** Bidirectional Turtle ↔ JSON-LD with `--conneg`: *"PUT as Turtle and read as
JSON-LD, or PUT as JSON-LD and read as Turtle. The transcoding is transparent"*
(`core-concepts/content-negotiation.md`); containers are *"LDP Basic Containers"*
(`core-concepts/pods-and-resources.md`) — the **Solid/LDP** model. The `.graph` aggregate is
Comunica-traversable and verified live (`04-comunica-patterns.md`).

**Verdict: CONFORMS to Solid** (conneg + `ldp:contains`, both verified for the query path in
axis-4 patterns). **DIVERGES from LWS storage**: JSS does not serve `application/lws+json`
`items`-shaped containers — consistent with `README.md` ("ships the LWS *authentication*
suite, not LWS storage — that stays Solid/LDP").

**Implication.** Good news for the L2 layer: the Comunica/`.graph` query model rides the
Solid container shape, which JSS gives us. If LWS storage ever becomes the target, the
`items`/`lws+json` container is a separate port — out of scope for this substrate decision.

**Fork serving-path round (2026-07-10, `la3d/lws-servepath` merge
`1783c6a7686e90bb11ca84188676691676e6b608`, `--lws` only) — the JSON-LD⇄quads serving seam
replaced; store form self-describing; listings WAC-filtered.** Spec of record
`docs/superpowers/specs/2026-07-10-fork-serving-path-design.md`. Probe #4 had found the fork's
hand-rolled `jsonLdToQuads` silently dropping `{@context,@graph}` docs, arrays, and remote-`@context`
docs to **zero quads** — a Turtle-only cold client read a populated container as empty, and
`application/n-quads` wasn't recognized at all. Fixed at the seam (§2): `toDataset` now runs
`@rdfjs/parser-jsonld` (a no-network `documentLoader`, sole preload = the LWS v1 mirror), shared
between admission and serving (`src/rdf/dataset.js`); under `--lws`, Turtle/N-Triples/N-Quads GET
runs the real parser → an `n3` Writer, never the hand-rolled pair. **Policy (406 teaching, not
lying, both cases):** default-graph docs serve real triples in any of the three RDF formats;
named-graph docs serve losslessly as N-Quads (200) but **406 + teaching** as Turtle/N-Triples
(lossy — the LWS lossless-conneg mandate at stake); unparseable or remote-`@context` docs **406 +
teaching** in all three (JSON-LD is unaffected — bytes are bytes, never mislabeled). GET/HEAD
parity holds. **The store form is now self-describing** (§3): multi-subject JSON-LD PUTs serialize
to `{"@context": …, "@graph": […]}` instead of a top-level array with `@context` on element 0 only
(invalid JSON-LD under strict expansion for conformant consumers — reader and writer had been
bug-compatible since Phase 1). The Phase-1 admission-side bridge shim (`shimLegacyStoreArray`) is
**deleted, no migration** — legacy array-form docs already on a pod degrade to standard (no
cross-element context) JSON-LD semantics; `make reset` is the story. `--lws`-off keeps the legacy
array form byte-identically (negative control). **Container listings are now WAC-filtered** (§4
S1): `ldp:contains`, `lws+json` `items[]`, and the derived Turtle rendering each run a per-member
`checkAccess`(READ)-and-drop loop before rendering — closing the asymmetry where `/types/*` already
filtered but a plain HTTP container listing didn't (probe #3). NOTE: the MCP `readContainerView`
listing surface remains **unfiltered** (same class, recorded FOLLOWUP carryover — next MCP round).
Hide-never-401, matching the no-oracle invariant used elsewhere.

**Verdict update: still CONFORMS to Solid** (the hardening fixes a correctness bug in that
conformance, not the conformance class) **· DIVERGES from LWS storage unchanged.** **Live-verified**
(image `fork-servepath`): `make test-conneg` **11/11** (was 7 — new cases: `@graph`-doc-as-Turtle
real triples, named-graph Turtle 406 + N-Quads 200, anonymous-listing filter, issuer) plus the full
gate sweep zero-regression (`FOLLOWUP.md`).

**Rig guard, re-dispositioned here (S6).** `urlToStoragePath` (`src/lws/admission.js`,
path-mode-only) feeds both SHACL shape resolution (axis 7) and this axis's new listing/conneg authz
filter — under `--subdomains` it silently omits the pod-name prefix, misresolving both. The fork
now **refuses to start** with `--subdomains --lws` together, naming the limitation, rather than
degrading silently (host-aware path mapping stays deferred — recorded in `FOLLOWUP.md`).

**Fork gateway round (2026-07-11) — the non-RDF teaching gap closed; the root becomes a real
gateway; a VoID surface added.** Spec of record
`docs/superpowers/specs/2026-07-11-fork-gateway-round-design.md`. Probe #6 had found the last
silent arm: a non-RDF source (markdown, plain JSON) under a specific unsatisfiable `Accept`
**silently 200'd the authored format** instead of teaching — sharply asymmetric with the dataset
406. Fixed by generalizing the axis's own "own format = bytes-are-bytes" rule symmetrically:
*own format = 200; conversions = parse or teach (406)* (§2-3). Concretely:
- **`sourceContentType` threaded both faces** (T1): file GET/HEAD pass the stored content type
  into the serving seam; the serving gate now excludes `application/json` from the RDF set (a
  stored plain-JSON sidecar or resource is a **non-RDF source** for conneg purposes, closing the
  probe-#6-predicted "stored-plain-JSON" repro).
- **F3 teaching-406 + F5 unified error shape** (T2/T3): a non-RDF source under a specific,
  unsatisfiable Accept now answers a teaching `406` (authored format + declared `altr:`
  alternates + the Accept-Profile route); wildcard/absent Accept is unchanged (browsers see
  nothing new). The profile-406 moved onto the same RFC 9457 problem+json builder as the
  media-406 and now lists the profiles that would conform — one error grammar across both conneg
  dimensions.
- **A1/A2/A3 — the root becomes a self-describing gateway:** alternates now advertise via
  `canonical`/`alternate` Link headers on the **bare, un-negotiated** 200 too (A1 — kills the
  "three-request entry cost" three probes found); the root's `index.html` shadow now honors
  non-HTML Accepts, so a specific media/linkset request negotiates the real container instead of
  being eaten by the shadow (A2 — root enumeration by plain conneg, closing a friction three
  probes in a row hit); the storage description carries a root-enumeration nav hint and a
  TypeSearch syntax hint (A3).
- **`/.well-known/void`** (T7 fork rung + T14 lws-pod materialization): `--lws-void <path>` (off
  by default, the `--lws-profile-index` precedent) 303s to a publish-time-built `void.jsonld` —
  one `void:Dataset` per pod, `void:rootResource`/`void:uriSpace`, a `void:subset` per bound
  application family, and **every declared vocabulary carries `void:dataDump` to a pod-served
  pinned mirror, never a bare external URI** — a deref rail fails `make publish-profiles` loud on
  any undeclared external (the linked-data self-containment discipline already used for
  `/.well-known/lws/context|vocab`, §3, extended outward). Rationale: VoID/DCAT/SKOS are in a
  semantic-web-literate agent's model priors — the probe-#6 lesson generalized ("where the pod
  teaches, cold agents succeed").
- **F1/F7/ETag/HEAD-parity smalls** (T8-T10): a `401`/`403` no longer carries a granting
  `wac-allow` header (`--lws`-gated, per Chuck's pre-flight decision — off-path byte-identical);
  `OPTIONS` now carries the storageDescription Link, parity with GET/HEAD; strong `ETag`s are now
  **variant-keyed** (served-content-type suffix + the WAC-filtered-listing auth-visibility key),
  closing the stale-variant risk the serving-path round's S1 note flagged **[⚠ 2026-07-12: OVER-BROAD
  — JSON-LD is NOT variant-keyed (`VARIANT_KEYS`/`QUADS_OUTPUTS` cover only quads targets), so a
  Turtle/N3 source served as `application/ld+json` shares the own-format Turtle ETag → a reachable
  wrong-variant 304 that VIOLATES RFC 9110 §8.8.3 + the LWS ETag MUST. The two colliding
  serializations are the two Solid-*mandated* ones. See the §4 correction below; FOLLOWUP backlog
  #5]**; HEAD's directory
  branch now calls the lws 3-arg `selectContentType` form, closing a GET/HEAD N-Quads-vs-ld+json
  divergence.

**Verdict unchanged** (CONFORMS to Solid conneg · DIVERGES from LWS storage) — this round closes
correctness/teaching gaps in that conformance, not the conformance class itself; the VoID surface
is a value-add (EXTENDS, no Solid/LWS requirement — VoID is an independent W3C IG Note). **Live-
verified** (image `fork-gateway`, merge `71da6f070a1e192ace99d49749d2f9c0694df6aa`): `make
test-conneg` **21/21** (was 11), new `make test-void` **4/4**, full 14-gate sweep zero regression
(`FOLLOWUP.md`). Final whole-round review (2026-07-11) fixed a HEAD-face gap in the same
`sourceContentType` seam (fork `be2ddba`) — verdict/counts above unaffected; see `FOLLOWUP.md`.

**Debt-drain round (2026-07-11, `la3d/lws-drain` off `la3d/lws@be2ddba`, merge
`4824fe2375d0959856e93bebf9878f9db9da099c`, `--lws` only) — representation preservation (B1
root fix); the conditional-request family closed; the flag surface collapses to `--lws-config`.**
Spec of record `docs/superpowers/specs/2026-07-11-debt-drain-round-design.md` §2-4. Probe #7 had
found the root cause the serving-path/gateway rounds' `sourceContentType` fixes only patched
downstream of: the **write** path converted submitted Turtle/N3/N-Triples/N-Quads into the
JSON-LD envelope while the target kept its original extension, so a `.ttl` artifact served
JSON-LD bytes labeled `text/turtle` — a direct conflict with the LWS read binding ("content is
exactly the stored data", "Content-Type matching the stored media type") and the
advertisement-consistency requirement (`items[].mediaType` must agree). Fixed **at the root, not
the serving arm** (DT2): under `--lws`, the write path stops converting non-JSON-LD RDF bodies —
the pod stores exactly what was submitted (JSON-LD keeps its self-describing `{@context,@graph}`
envelope; Turtle is already self-describing as Turtle). A new write-time **name/type consistency
gate** (`src/lws/write-consistency.js`) teaches a 400 on a name/body mismatch or an
extension-less RDF write (would silently serve `octet-stream`) — so the stored type, the served
`Content-Type`, and `items[].mediaType` can never disagree (`items[]` itself fixed via
`getContentType`, DT7, axis 3). **[⚠ 2026-07-12: this "can never disagree" invariant is enforced at
the 2 HTTP write handlers ONLY — MCP writes bypass `applyLwsWrite`'s gate entirely (FOLLOWUP backlog
#2), and `application/json` bodies at RDF names (#10) + slug-less RDF POST (#9) evade or mis-fire the
gate. See the §4 correction below.]** The hand-rolled RDF→JSON-LD serializer is retired for
`jsonld@9.0.0`'s `fromRDF` per explicit user directive (fixes `@type`/`@list` flattening the
hand-roll had introduced). **Conditional-request correctness** (DT3): the file/container/HEAD
`If-None-Match` fast path now defers until the negotiation outcome (media F3 arm OR profile arm)
is known — RFC 9110 §13.2.2's "preconditions apply only to requests that would otherwise
succeed": a request that would 406 always 406s, never a stale 304 **[⚠ 2026-07-12: OVER-BROAD — the
deferral predicate `wouldNotNegotiate` excludes RDF sources (`!isRdfSourceType`), so a would-406
RDF-source lossy conversion (named-graph→Turtle) can still be preempted by the early 304. RFC 9110
§13.2.2 gap; ~unreachable (no replayable strong validator) but real. See §4 correction, FOLLOWUP
backlog #4]**; file-304 `Vary` gains
`Accept-Profile`. 304 winning over a profile-303 stays deliberate, pre-existing, and now tested
(not a bug). **Flag consolidation** (DT4): `--lws-profile-index`/`--lws-void` are **replaced, no
aliases**, by `--lws-config <pod-path>` — one pod resource declaring `{profileIndex, void}` as
data, read lazily with an mtime+size cache (absent = services off, no crash-loop on a fresh pod;
malformed = logged, pod keeps serving; present = picked up on the next request, no restart). One
shared `podConfig` instance threads both the HTTP routes and the MCP ctx, closing the per-flag
threading pattern the gateway round's T7 flagged three times.

**Verdict unchanged** (CONFORMS to Solid conneg · DIVERGES from LWS storage) — this round closes
the LAST correctness gap in that conformance (the write-side root cause of every "own format
lies" finding since probe #4), not the conformance class. **Live-verified** (image `fork-drain`,
merge `4824fe2375d0959856e93bebf9878f9db9da099c`): new `make test-preservation` **6/6** (Turtle
round-trip pinned to exact bytes, not a substring — tightened after a review finding), `make
test-conneg` **27/27** (was 21, +6: 3 for 304-never-beats-406 GET+HEAD+Vary, 3 for
`--lws-config`-driven service presence), `make test-void` **4/4** unchanged, full 15-gate sweep
zero regression (`FOLLOWUP.md`).

**⚠ Conformance-review correction (2026-07-12) — the "closed" claims above were over-broad; the round
introduced two standards VIOLATIONS. ✅ ALL RESOLVED the same day by the fork REVIEW ROUND (la3d/lws
`4824fe2..b31510a`; see the "FORK REVIEW-ROUND" block in `FOLLOWUP.md`).** A post-round audit against
the pinned LWS 1.0 core / Solid Protocol / RFC 9110 specs (`.claude/skills/{lws-protocol,solid-protocol}`)
found that the "truthful-by-construction," "stale-variant risk closed," and "would-406 always 406s"
claims in this section were each narrower in truth than stated, and that the round's DT2 store-verbatim
change — whose downstream PATCH and ETag handlers were **not** made serialization-agnostic — introduced
two genuine violations. This doc previously **did not track PATCH conformance at all**, which is why
V1/P1 went unrecorded. **PATCH is now conformant and the ETag/negotiation path is now spec-correct** —
each item below carries its resolving commit; the round was TDD-per-finding, two opus whole-branch
reviews, live-verified on the fork-review rig.

- **V1 (round-introduced VIOLATION) → ✅ FIXED (`e2c20f4`→`d597277`).** N3-Patch on a verbatim-Turtle
  resource returned 409, violating Solid `#server-patch-n3-accept` MUST. `handlePatch` now dispatches
  verbatim-stored Turtle-family resources through `patchTurtleFamilyResource`, which applies the parsed
  N3/SPARQL patch triples **directly on the rdf-ext dataset** (n3 DataFactory terms, default-graph-scoped)
  and serializes back in the stored format — no JSON-LD document detour (owner directive: real RDF libs).
  N3-Patch on `.ttl`/`.n3`/`.nt`/`.nq` applies; `.nq` named graphs preserved. (FOLLOWUP backlog #7.)
- **V2 (round-introduced VIOLATION) → ✅ FIXED (`1296e8d`).** One strong ETag was shared across the
  Turtle and JSON-LD representations (wrong-variant 304), violating RFC 9110 §8.8.3 + LWS core's ETag
  MUST. `predictFileEtag` now gives the JSON-LD conversion arm a `-json` variant ETag and keys the whole
  predicate on the real negotiation surface (`negotiate = connegEnabled || lwsEnabled`, not
  `connegEnabled` alone), so `--lws`-without-`--conneg` no longer collapses variants either. A cross-format
  `If-None-Match` never 304s the wrong variant. (FOLLOWUP backlog #5.)

Risky deviations the audit flagged → dispositioned this round: **#4** 304-preempts-a-would-406 →
✅ FIXED (`cd6ad88`): a pending RDF conversion defers the early 304, the serving arm re-checks after the
outcome is known, and a 406 carries no ETag (RFC 9110 §13.2.2). **#6** stored `.nt`/`.nq` 406 on every
conversion → ✅ FIXED (`f0e3c4d`): `toDataset` routes NT/NQ through the n3 parser and JSON-LD is
graph-capable, so git/filesystem-seeded quads convert on read (the live path §5 flagged). **#9**
slug-less RDF POST 400 → ✅ FIXED (`c0608ef`): the server derives an extension from the submitted type
so it never mints a name its own gate rejects. **#10** `application/json` name/type (spec-silent) →
gated as JSON-LD at the write choke point (`06aae62`), matching how the rest of the pipeline reads it.

Pre-existing violations the audit surfaced (were NOT round-attributable) → all resolved this round when
the PATCH/write handlers were opened:
- **P1 — JSON Merge Patch MUST → ✅ FIXED (`e2c20f4`).** `application/merge-patch+json` is now accepted
  under `--lws` (RFC 7386, `src/patch/merge-patch.js`), 415-teaches on a non-JSON stored resource, and
  is advertised in `Accept-Patch` (the `--lws`-off value stays byte-identical).
- **P2 — bodied write with no `Content-Type` not 400'd → ✅ FIXED (`e2c20f4`).** Confirmed empirically
  that Fastify's wildcard parser buffers such bodies with no upstream guard; PUT/POST/PATCH with content
  and no `Content-Type` now answer 400 problem+json under `--lws` (Solid `#server-content-type-missing`).
- **P3 — `Accept: application/json` on a container returned `application/ld+json` → ✅ FIXED
  (`d7d808d`+`7165855`).** `application/json` is now a first-class Content-Type label on the container
  listing, the `index.html`-shadowed data-island branch, and the storage description, with its own ETag
  variant and byte-identical payload (GET/HEAD agree — the shadowed path was the fix-round catch).

**The cornerstone is unaffected.** The same audit pass confirmed profile content negotiation (exact
W3C `altr:` vocabulary + the registered `profile`/`canonical`/`alternate` relations + spec-shaped
303/200/406 arms), the PROF profile mechanism (`projection/prof/` — faithful `prof:` terms, clean
`lwspr:` role extension), the LWS vocabulary + storage-description shape + the byte-exact
`https://www.w3.org/ns/lws#storageDescription` discovery relation, and the `/.well-known/void` rail
(a safe additive extension — registered well-known, real VoID vocab, off by default) all CONFORM. One
cosmetic item: the storage-description vendor service types (`ProfileIndexService`/`VoidService`/
`McpService`) are bare tokens where the LWS extension convention is a URI (the pod already uses a URI
for its conneg capability, `http://www.w3.org/ns/dx/connegp/profile/http`). Full findings + fix
directions: the "2026-07-12 POST-DRAIN CODE-REVIEW BACKLOG" block in `FOLLOWUP.md`.

## 5. Git: container clone-able; push materializes files as resources

**Spec.** No Solid/LWS requirement — git-as-storage is entirely an extension.

**JSS.** `--git` adds a git HTTP backend: *"`git clone http://localhost:3000/alice/myrepo`
… Requires `acl:Read`"* and push *"Requires `acl:Write`"*; *"After a successful push to a
non-bare repository, JSS automatically updates the working directory. No post-receive hooks
needed"* (`features/git-integration.md`). Push is WAC-gated through the same auth chain
(`features/app-install.md`).

**Verdict: EXTENDS** *(verified live)*. A capability the spec doesn't address, gated by
spec-conformant WAC. **Verified live (2026-06-20, `smoke.sh` step 9):** a `git push` of a `.ttl`
materializes a **retrievable resource** at the pushed path — but a GET with `Accept:
application/ld+json` comes back `Content-Type: text/turtle`. So **git-pushed files are served
as-is and bypass conneg** — unlike a PUT-written resource, which transcodes (axis 4).

**Implication.** This is the QuitStore-style versioning angle (axis 7): auto-checkout means a
push lands as a live pod resource. But because pushed files skip conneg, a PUT and a git-push
are **not** equivalent on the read side — whether pushed files still join `.graph` aggregation
(which the L2 query path needs) is the remaining live test.

## 6. LWS-CID identity: pod profile CID-shaped with `verificationMethod`

**Spec.** LWS self-signed CID suite: the credential is *"a signed JSON Web Token"* whose
*"`sub`, `iss`, and `client_id` MUST all use the same URI value"*; the verifier *"MUST use
the `kid` … to identify a verification method from the subject's controlled identifier
document"* and the dereferenced subject *"MUST be formatted as a valid controlled identifier
document … with an `id` value equal to the subject identifier"* (`lws10-authn-ssi-cid/
index.html`).

**JSS.** Profiles are CID-shaped: *"pod profiles are CID-shaped … the server accepts strict
LWS10-CID JWTs"* (`features/lws.md`). The verifier matches the spec point-for-point: *"Confirms
`sub === iss === client_id`"*, *"Looks up `kid` in `verificationMethod`"*, *"Confirms the
profile's `@id` equals the JWT's `sub`"*. CID v1 `@context` is emitted at pod creation (JSS
0.0.174+).

**Verdict: CONFORMS** — a faithful FPWD §4 implementation, the strongest alignment of the
seven axes. **At creation the profile carries the CID `@context` but an empty
`verificationMethod`** (confirmed live, `smoke.sh` step 8) — keys are not minted automatically.
But the "browser doctor required" reading is **wrong**: an agent can provision the key
**headlessly**.

**Verified live (2026-06-20, `experiments/headless-cid/`, http + TLS):**
- **Provisioning WORKS headless.** The doctor's recipe — authenticated GET-merge-PUT of
  `card.jsonld` with `If-Match`, splicing in a `JsonWebKey` `verificationMethod` + an
  `authentication` reference — succeeds from a script with only the owner bearer (`PUT … 204`).
  No browser needed.
- **Self-signed auth is BLOCKED — by design — even over TLS.** Two gates: over http the verifier
  rejects `"kid must use https"`; over TLS (mkcert `pod.vardeman.me:8443`) it dereferences the
  WebID but the **SSRF guard** rejects it — `"Hostname … resolves to private IP"`. Root cause:
  `src/auth/cid-doc-fetch.js` hardcodes `blockPrivateIPs: true` (no config knob). JSS won't fetch
  a CID document on a loopback/private IP, so **LWS-CID auth requires a public-IP WebID**.

**Implication.** Headless self-issued identity is *provisioning-viable today* but its auth
round-trip is *only verifiable on a public deployment* — the blocker is JSS's SSRF policy, not a
missing capability. Until that's run (public host + domain, or a patched test build), axis-2's
bearer-replay risk stands: the practical headless credential is the replayable RS256 bearer.

**Token-replay posture (verified 2026-07-02, `src/auth/lws-cid.js`).** Core §Token Security
(`lws10-core/Security-Considerations.html`) makes **audience-binding + short lifetime** the primary
replay mitigations (governed by RFC 9700; **RFC 8693** token-exchange for cross-domain), and all
four auth suites require the ID Token's `aud` + `exp`/`iat`. **JSS's CID verifier enforces exactly
this:** `aud` is required and matched against the pod's **own origin** (fail-closed if absent,
mismatched, or if the origin can't be determined — `lws-cid.js:238-259`); `exp`/`iat` are required
and the lifetime `exp − iat` is capped (clock-skew-tolerant — `:206-235`). So the LWS-CID credential
is audience-bound + short-lived *as the spec mandates* — the replay protection the RS256 bearer
(axis 2, no `aud`) structurally lacks. (Note: `aud`+short-`exp` is the spec's mitigation for CID;
per-request proof-of-possession à la DPoP is *not* mandated for the CID suite.)

**Divergence — RS-direct vs AS-mediated (record).** The auth suites are written for an
authorization server: the ID Token's *"`aud` MUST include the target authorization server."* JSS
has no AS — it accepts the self-signed CID JWT **directly at the resource server** and verifies
`aud` = its own pod origin (the pod *is* the audience). This is a coherent, *more*-decentralized
RS-direct profile that still satisfies core Token Security, but it diverges from the letter of the
suite (audience = AS). Cross-security-domain credentials (pod↔pod / federation) are where the
spec's RFC 8693 token-exchange + an AS would re-enter — deferred to the federation/auth track.

## 7. L2 port landing: SHACL admission, projection-on-write, git-commit-on-write

**Spec.** Solid `ldp:constrainedBy` is the admission hook: servers *"publish any constraints
on clients' ability to create or update resources by adding a Link header field … a link
relation of …ldp#constrainedBy, and a target URI identifying a set of constraints"*
(`protocol.html` §5.6). The constraint *language* is unspecified (SHACL is our choice). No
spec covers write-time projection or auto-commit.

**JSS.** No SHACL admission, projection, or write-hook in the JSS docs — the only SHACL
mention is a *future* idea for inbox spam (`features/inbox-and-spam-mitigation.md`), and
*"JSS has no external plugin API"* (`constrained-container/README.md`). The L2 floor is
therefore built **beside** JSS:
- **SHACL admission** = the `constrained-container` proxy, already verified end-to-end
  against live JSS (good writes 201, bad writes 422 + `constrainedBy` Link)
  (`constrained-container/README.md`) — a spec-conformant realization of §5.6.
- **Projection-on-write** = the dual-projection design (`docs/archive/wiki-memory-dual-projection.md`):
  cards → `index.md` + `.graph`. No JSS write hook exists to run it server-side.
- **Git-commit-on-write** = approximated by `--git` auto-checkout (axis 5); JSS has no
  documented "commit on every PUT" (QuitStore-style) behaviour.

**Verdict: CONFORMS** for SHACL admission *as a proxy* (Solid §5.6, verified). **GAP** for
in-process landing: projection and auto-commit-on-write have no JSS hook documented —
*"validation logic ports straight into a server … if/when an in-process hook is available"*
(`constrained-container/README.md`).

**Implication.** The governance floor ships today as a sidecar proxy (server-agnostic,
already the shippable `constrained-container/`). Native in-process landing is blocked on JSS
exposing a write hook — that absence, not a spec gap, is the L2 porting constraint to track.

---

## Live test results & open questions

Run `make test` (Vitest suite) and `bash experiments/smoke.sh` (the archived probe, steps 7-11) and `experiments/headless-cid/` against a booted pod.

**Answered live (2026-06-20):**
- **Headless token shape** (axis 2) — `/idp/credentials` returns an **RS256 JWT** bearer with
  **no `cnf`** → replayable, not DPoP-bound. Corrects the docs' "HMAC" wording.
- **Git → resource** (axis 5) — a push **materializes a retrievable resource**, but it is served
  `text/turtle` even for an `ld+json` request → **git-pushed files bypass conneg**.
- **Empty VM at creation** (axis 6) — a fresh headless pod's profile has an **empty
  `verificationMethod`** (keys aren't auto-minted).
- **Headless key provisioning WORKS** (axis 6, `experiments/headless-cid/`) — an agent **can**
  add a `JsonWebKey` VM via authenticated GET-merge-PUT with `If-Match`, **no browser doctor**.
  The "doctor required" reading is wrong.
- **LWS-CID auth requires a public-IP WebID** (axis 6) — verified over TLS: JSS hardcodes
  `blockPrivateIPs: true` in `src/auth/cid-doc-fetch.js`, so the self-signed-JWT round-trip can't
  run on any local/private deployment. Not a config issue — a deployment requirement.
- **Restart persistence** (axis 1) — the marker survives `make down && make up` (volume kept);
  `make reset` wipes by design.
- **Git push → queryable** (axis 5) — a pushed `.ttl` is a first-class `ldp:BasicContainer`
  member (`ldp:contains <…/member.ttl>`, retrievable RDF) → reachable by Comunica link-traversal.
- **L2 admission substrate** (axis 7) — JSS serves `.meta` and stores `ldp:constrainedBy`, so the
  `constrained-container/` SHACL-admission proxy mechanism ports.

**Still open / build-time:**
1. **LWS-CID auth on a PUBLIC deployment** (axis 6) — blocked locally by the hardcoded SSRF
   guard. Deferred (not required for the substrate decision). To close axis-2's bearer-replay
   concern: deploy JSS to a public host + domain and re-run `experiments/headless-cid/`.
2. **ACL provisioning + proxy auth** (axis 7) — JSS rejected `.acl` PUT (415) in testing, and the
   proxy reads `.meta`/shapes unauthenticated; settle public-read provisioning or have the proxy
   forward the requester's auth on constraint reads. Build detail, not a blocker.
3. **In-process L2 hooks** (axis 7) — no plugin API (docs-confirmed); the proxy stays the landing
   point for projection + auto-commit unless JSS adds a `storage.write()` hook.

---

## Appendix — the README evaluation checklist (moved here 2026-07-10)

The repo README carried this dated checklist until the 2026-07-10 README rewrite; preserved
verbatim as the evaluation-era record (its last row describes the since-retired
`constrained-container/` proxy in its own era's terms).

**Verdict (2026-06-21): JSS is a good replacement for CSS — proceed to build the L2 memory layer
on it.** Evidence per axis above; live probes in `experiments/smoke.sh` and `experiments/headless-cid/`.

- [x] Boots clean in a container; survives a restart with the volume (`make down && make up`;
      `make reset` wipes by design).
- [x] **Headless agent auth**: `POST /idp/credentials` returns a usable bearer (RS256 JWT; *not*
      DPoP-bound — replayable). The main draw works; the bearer-replay caveat is real.
- [x] **Agent surface**: `/mcp` lists tools; CRUD + ACL are WAC-gated (agent identity = WAC subject).
- [x] **Conneg**: resources round-trip `application/ld+json` ↔ `text/turtle`; containers expose
      `ldp:contains` with conneg-able RDF members (Comunica-traversable, per `docs/foundations/04`).
- [x] **Git**: a push materializes a first-class `ldp:contains` container member (queryable).
- [x] **LWS-CID identity**: profile is CID-shaped; key provisioning works **headless** (no browser
      doctor). Self-signed-JWT *auth* requires a public-IP WebID (JSS SSRF guard) — unverified locally.
- [x] **L2 port lands** (built in that era): JSS served `.meta` + stored `ldp:constrainedBy`, so the
      `constrained-container/` SHACL-admission proxy ported; git push gave QuitStore-style
      versioning into the queryable graph. That proxy was superseded by the fork's in-process L3
      admission (2026-06-30) and retired 2026-07-10; projection runs out-of-process via
      `apps/wiki-projector/triggers/`.
