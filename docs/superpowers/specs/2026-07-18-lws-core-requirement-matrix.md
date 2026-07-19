# LWS core requirement matrix — Discovery + Read Resource (round 1 scope)

Pinned normative rows for the 2026-07-18 resource-server conformance closeout. Quotes verbatim
from `.claude/skills/lws-protocol/references/lws10-core/`. Status column = live state on fork
`7de911d` before this round; every MISSING row gets a gate + fix in this round; deferred rows say
so explicitly.

| # | Requirement (verbatim source) | Source | Surface | Status @7de911d |
|---|---|---|---|---|
| R1 | "All responses MUST integrate with metadata as defined in Section 8.1, including Link headers for key relations such as `rel=\"linkset\"`, `rel=\"up\"`, and `rel=\"type\"`." | Operations/read-resource.md L9 | every `--lws` GET/HEAD | `linkset` ✅ · `up`/`type` MISSING (header) |
| R2 | "**Containment**: Servers MUST include a Link header with `rel=\"up\"` pointing to the parent container for any non-root resource." | Operations/metadata.md L22 | every non-root resource | MISSING on data resources; container lws+json arm only |
| R3 | "Responses MUST include an ETag header for concurrency control and caching." / "ETags MUST be provided in all GET/HEAD responses" | Operations/read-resource.md L12, L89 | ALL GET/HEAD incl. generated docs (`/:pod/lws-storage`, `/.well-known/lws-storage`, `/types/index`, `/types/search` GET) | ordinary resources ✅ · generated docs MISSING |
| R4 | "Servers MUST support conditional requests via If-None-Match (with ETags) or If-Modified-Since headers. If the resource or container listing has not changed, respond with 304 Not Modified" | Operations/read-resource.md L89 | same as R3 | ordinary ✅ · generated docs MISSING |
| R5 | "A server MUST include an Etag header in its responses to GET and HEAD requests for a linkset resource." | Operations/update-resource.md L45 | `Accept: application/linkset+json` GET/HEAD | believed ✅ (variant key `ls`) — LOCK with a gate |
| R6 | Storage discovery: every resource response carries `Link rel="https://www.w3.org/ns/lws#storageDescription"` to its owning storage description | Discovery.html | root-pod deployments | ✅ named pods · BROKEN root-pod (`storageRootFor` has no `/` fallback → points at ServerIndex) |

Scope notes (calibrations from the verified 2026-07-18 review, FOLLOWUP top block):
- "ServerIndex" is JSS's well-known surface, not an LWS-spec object. Its ETag obligation comes
  from R3's blanket clause only.
- `rel="type"` sits under R1's "such as" umbrella (illustrative list); `rel="up"` has its own
  standalone MUST (R2). We emit both, derived identically to the linkset body
  (`parentContainerUrl` / `lws#DataResource`-vs-`lws#Container`).
- `/.well-known/void` is a 303 redirect, not a representation — no ETag obligation.
- `WWW-Authenticate` / `/.well-known/lws-configuration` (Authorization.html) = round 4, NOT here.
- Per-storage VoID/type-index/search *scoping* = round 2, NOT here (R3/R4 only add ETags to the
  existing server-scoped surfaces; they do not re-scope them).
- Storage-root `up`: linkset body already emits `up` for a storage root (→ origin `/`); the header
  mirrors the linkset for parity. metadata.md requires `up` only for non-root resources; emitting
  it on the storage root too is benign surplus, recorded here deliberately.

---

# Round 2 addendum — per-storage services (2026-07-18)

Pinned rows for the per-storage service correctness round (spec
`2026-07-18-per-storage-service-design.md`). Quotes verbatim from
`.claude/skills/lws-protocol/references/`. Status @48cd8ae = fork state after round 1.

| # | Requirement (verbatim source) | Source | Surface | Status @48cd8ae |
|---|---|---|---|---|
| R7 | "A storage that supports one of these services MUST advertise it with a service object in the `service` array of its storage description resource" + the Type Index "enumerates the distinct resource types present within a storage as visible to the requesting client" | lws10-searchindex Discovery + Terminology | per-storage SD + `/:pod/types/*` | VIOLATION: every SD advertises the origin-wide endpoints |
| R8 | "any filter expressible in one MUST be expressible in the other, and equivalent `GET` and `POST` requests MUST return the same result set" | lws10-searchindex GET/POST equivalence | `/:pod/types/search` | origin ✅ · per-storage NEW |
| R9 | "A storage that supports notifications MUST advertise a service object … with `type` equal to `NotificationService`. … The service object MUST include a `subscriptionType` property" | lws10-notifications Discovery | SD `service` array | VIOLATION: entry lacks `subscriptionType` AND its `/notification/api` endpoint is dead → resolved by REMOVAL; a real LWS notifications implementation is a recorded future round |
| R10 | "Responses to GET/POST on `TypeIndexService` or `TypeSearchService` include only types and resource URIs that the authenticated client is explicitly authorized to read. … Any count … MUST be computed over this client-specific, authorization-filtered view … against the requesting client's current access" | lws10-searchindex security-authorization | both scopes | ✅ (per-request WAC loop) — per-storage routes inherit the same loop; gated |
| R11 | "the `service` property is REQUIRED. … `type` … REQUIRED … `serviceEndpoint` … REQUIRED" | lws10-core Discovery data model | every SD | ✅ (StorageDescription self-entry) |

Scope notes:
- VoID appears nowhere in LWS (only substring "devoid") — `VoidService` and `/.well-known/void`
  are project extensions; so are `ServerIndex`, `McpService`, `ProfileIndexService`, and the
  `ReferentResolution` capability. Never counted as spec requirements.
- The spec defines NO server-wide advertisement mechanism (no storage catalog, no server
  capability doc) — multi-storage deployments surface as per-storage descriptions + realm scoping.
- Recorded limitation (spec §5): in a mixed root+named deployment the root storage's SD
  advertises the origin `/types/*` endpoints, whose walk is server-wide. Recorded, not fixed —
  mixed mode is not a deployed configuration.

---

# Round 3 addendum — PROF/conneg closeout (2026-07-19)

Pinned rows for the PROF/conneg closeout round (design
`2026-07-19-prof-conneg-closeout-design.md`). Quotes verbatim from
`.claude/skills/prof-conneg/references/dx-prof-conneg.html` (DX-PROF-CONNEG) and
`references/profile-negotiation-http.html` (IETF profile-negotiation-http, Accept-Profile
grammar + write-side reconneg). RFC 9110 cited by section number only, no quoted text (q-value
robustness territory, §12.4.2/§12.5.1). Status @e74a2bb = fork state after round 2.

| # | Requirement (verbatim source) | Source | Surface | Status @e74a2bb |
|---|---|---|---|---|
| R12 | "A server implementing content negotiation by profile MUST respond with an HTTP Response header containing a Link header with `rel="profile"` indicating the profile returned." | dx-prof-conneg.html Appendix A.1.1, R.1.2.a (§8.2.2 Get Resource by Profile) | bare 200 GET/HEAD, direct-alternate-face 200 GET/HEAD | MISSING on bare/default GET+HEAD (`resource.js:1261-1263,1039-1041,2276-2282`) and on direct alternate-face GET (`resource.js:1743-1770`) — negotiated-303-then-self-200 arm already ✅ (`headers.js:172-176`) → Tasks 4, 10 |
| R13 | "Preferences MAY be indicated by by the Client using quality indicators (q-values) as an ordering mechanism separated from the URI by a semi-colon, ';'. An example of a URI (in this case a URN) with a q-value is `<urn:example:profile:x>;q=1.0,` where the URI is `<urn:example:profile:x>` and the q-value is `q=1.0`." | dx-prof-conneg.html Appendix A.1.1, R.1.2.d (§8.2.2); RFC 9110 §12.4.2/§12.5.1 (q-value semantics, robustness — no quote, section cite only) | `parseAcceptProfile` (`src/rdf/conneg.js:156-168`) | **RFC 9110 robustness, NOT spec conformance** — DX-PROF-CONNEG says nothing about q=0/malformed handling. Current: keeps `q=0` (sorted last, not dropped), keeps out-of-range `q=2`. Target: discard q=0, clamp to [0,1], non-numeric → 1.0, stable ties → Task 2 |
| R14 | *(spec silent — no DX-PROF-CONNEG MUST/SHOULD governs selection among multiple representations that all exactly match the same requested profile)* | design `2026-07-19-prof-conneg-closeout-design.md` §3 F4 — project determinism rule, not a spec conformance requirement | `negotiateProfile` joint media+profile selection (`src/rdf/conneg.js:178-192`) | Current: EXACT URI match only, Accept media never consulted once a profile matches — first alternate in declaration order wins even when multiple reps share the requested profile at different media types. Target: collect all exact-profile matches, disambiguate by `Accept` media conneg, tie → default slot then declaration order → Task 3 |
| R15 | *(no new spec text — RFC 9110 variant/conditional-request rules, general provision; existing 406-beats-304 / 304-beats-303 precedence already implemented, cited without a specific subsection this round)* | RFC 9110 (variant selection semantics, section cite only); design §3 F5 | variant ETag keys (`resource.js:256-286,377-422`); Vary/406/304/303 ordering (`conneg.js:312-323`; `resource.js:994-1032,1208-1253,2236-2274`) | Claim to verify-and-pin (not presume-fix): profile selection never changes bytes at a URL (self-or-303), so no profile component belongs in the variant ETag. Extend `VARIANT_KEYS` only if implementation falsifies the claim → Task 5 |
| R16 | "The server SHOULD attempt to reply with a profile that best matches the client request. The order of preference a server MUST follow to determine a best matching profile is: an exact match, followed the next most specific profile that the resource representation conforms to. Note that resource representations might conform to more general specifications or other profiles via a hierarchy (i.e. transitively)." (hierarchy) + "the attribute `token` is used to specify a token that a client MAY use as an alternative to the full profile URI given in the `anchor` attribute." (tokens) | dx-prof-conneg.html §7.3.2 Get Resource by Profile (hierarchy, abstract model — absent from the Appendix A.1.1 HTTP-FP itemized requirements); §9.1 Token (tokens MAY) | teaching surface: SD capability hint (`storage-description.js:184`), linkset hint (`:171`), MCP hints (`tools.js:468`, `resources.js:60`), both 406 bodies (`serve.js` `nonRdfNotAcceptable`, `resource.js` `profileNotAcceptableProblem`) | Current: hints imply general "negotiation by profile"; nothing states exact-URI-only, no-token, no-hierarchy. Calibration: hierarchy fallback is an abstract-model SHOULD/MUST-if-attempted, not itemized in the HTTP-FP requirement list — exact-match-only does not breach `cnpr:http`; tokens are a MAY-alternative to URIs, never mandatory. Target: every teaching string states the implemented subset explicitly → Task 6 |
| R17 | "A server that allows user agents to submit profiled representations SHOULD follow the directions for reactive negotiation described in Section 4.1.2." (write declaration = read-side reconneg mechanism, reused) + "A server that fails a submission request due to receiving a payload with a profile that it does not support MUST respond with a "422 Unprocessable Entity" HTTP status code and SHOULD use the approach described in Section 4.1.2 to convey profiles that are supported." (reactive write-side negotiation) | profile-negotiation-http.html §5 Writing Profiled Representations (§5.2 write declaration, §5.4 the 422 MUST) | write contract / conformance surface (docs only, no code this round) | Shipped contract = **read-side negotiation + write declaration** (server advertises supported profiles via the same reactive-negotiation Link mechanism read-side conneg already uses). Reactive `422` write-side negotiation (§5.4's MUST) is explicitly **deferred**, not implied shipped → Task 13 (docs labeling only) |

Scope notes:
- R12's calibration is Example 6 (`#eg-range14`): the post-303 final response is annotated
  "Note that this response does not include the profile-indicating Link rel="profile" header" —
  the redirect flow (negotiated-303 → self-200) already matches the spec's own example and is
  UNCHANGED by this round; only the three direct-response arms (bare, direct-alternate, HEAD) are
  in scope.
- R16's hierarchy/token calibration is load-bearing for the round's Chuck-approved direction: name
  the exact-match/URI-only subset rather than implement the optional hierarchy/token surface.
  Appendix A.1.1 (Itemized Requirements, HTTP Headers Functional Profile) contains only
  R.1.1.a/b and R.1.2.a-d — no itemized requirement for hierarchy fallback or token support exists
  in that list; both live in body prose (§7.3.2 abstract model, §9.1 Link Attributes) using SHOULD
  (attempt-to-match) and MAY (token-as-alternative) respectively.
- R17's "Section 4.1.2" is profile-negotiation-http.html's Reactive Profile Negotiation section —
  the same mechanism read-side conneg-by-profile already advertises via (a variant of) the `Link`
  header; the write path reuses it for declaration only. The `422` failure-response MUST (§5.4) is
  the deferred piece — recorded here as explicitly NOT shipped, not silently absent.
- Fork line references throughout are read from the design doc's §1 current-state table
  (verified 2026-07-19 at fork `e74a2bb`), not re-verified independently in this docs-only task.
