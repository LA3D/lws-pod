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
| 3 | Agent surface (`/mcp`, CRUD+ACL under WAC) | EXTENDS (WAC core CONFORMS) |
| 4 | Conneg + container traversal | CONFORMS to Solid · DIVERGES from LWS storage |
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
