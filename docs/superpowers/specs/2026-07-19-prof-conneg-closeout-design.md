# PROF / Conneg-by-Profile Closeout — Design of Record (2026-07-19)

Standards-closeout item 3 (see `FOLLOWUP.md` round-1 order-of-work). Approved by Chuck 2026-07-19:
(1) **name the exact-match/URI-only subset** rather than implement the optional hierarchy/token
surface; (2) fix the shared-profile HTML faces **both** app-side (mint viewing profiles) and
fork-side (deterministic media+profile composition); (3) loader identity/conflict conventions get
the shape-enforce/document treatment, not generalized subject discovery.

Grounding: `.claude/skills/prof-conneg/references/dx-prof-conneg.html` (abstract model + HTTP
Headers Functional Profile, R.1.2.a, Example 6), `references/profile-negotiation-http.html`
(Accept-Profile/Content-Profile grammar), `.claude/skills/profiles/` (PROF vocabulary), RFC 9110
(q-values). Calibrations of record (verified 2026-07-18, Chuck-approved): hierarchy fallback is
abstract-model SHOULD and not among the HTTP-FP itemized requirements — exact-match does not
breach `cnpr:http`; tokens are a MAY-alternative to URIs; DX-PROF-CONNEG is silent on q-value
semantics (RFC 9110 territory); the spec's own Example 6 shows the post-303 final 200 *without*
`rel="profile"`, so the shipped redirect flow already matches the spec.

## 1. Current state (verified at fork `e74a2bb`, 2026-07-19 exploration)

| Surface | Today | Pin |
|---|---|---|
| Negotiated 303 + self-outcome 200 | `Content-Profile` + `Link rel="profile"` emitted ✅ | `src/handlers/resource.js:1002-1005,1017,1216-1219,1236,2244-2247,2258`; stamp in `src/ldp/headers.js:172-176` |
| Bare/default GET, HEAD | NO profile stamp, though `advertisedReps.default.profile` is already loaded on the serve path | `resource.js:1261-1263` (file), `1039-1041` (container), `2276-2282` (HEAD) |
| Direct GET of an alternate face | NO profile header — faces have no own `.meta`; the PUT-time `Link rel="profile"` is a request header, never persisted | `resource.js:1743-1770`; `projection/prof/instantiate.mjs:109-121` |
| `parseAcceptProfile` | keeps `q=0` (sorted last, not dropped), keeps out-of-range `q=2` (sorts above q=1), non-numeric → 1.0 | `src/rdf/conneg.js:156-168`; contrast media consumers' q=0 filter at `130-149` |
| Selection | EXACT URI match only; default slot first, then FIRST alternate in array order; **Accept media never consulted** | `conneg.js:178-192` |
| Same profile, two reps | llm-wiki: `content`+`html` and `index`+`index-html` both declare `okf-base`; `links`/`graph`/`viz` all declare llm-wiki (never co-resident at one level, but the class is live) | `profiles/defs/llm-wiki/*.rep.jsonld` |
| Variant ETag | keys on media/representation axis only, never the chosen profile | `resource.js:256-286,377-422` |
| Vary / 304-vs-406 | `Accept-Profile` in Vary under `--lws`; 406 beats 304; 304 beats 303 (inline If-None-Match on redirect arms) | `conneg.js:312-323`; `resource.js:994-1032,1208-1253,2236-2274` |
| Teaching surface | hints imply general "negotiation by profile"; nothing states exact-URI-only, no-token, no-hierarchy | `src/lws/storage-description.js:171,184`; `src/mcp/tools.js:468`; `src/mcp/resources.js:60`; `src/rdf/serve.js:88-96`; `resource.js:157-165` |
| Tokens / hierarchy in fork src | zero `hasToken`, zero `isProfileOf` | grep, fork `src/` |
| Loader | subject hard-coded = descriptor URL (`@id:""`); multi-parent merge: singletons last-writer-wins, lists union, NO equal-specificity conflict rule; `hasToken` parsed declaration-side, unused | `projection/prof/profile-doc.mjs:19-21`; `profile-loader.mjs:34-51,55-83` |

## 2. Requirement matrix — Round 3 addendum (R12–R17)

Appended to `docs/superpowers/specs/2026-07-18-lws-core-requirement-matrix.md`, each row quoting
the pinned normative text + its calibration:

- **R12 — direct-response profile identification (HTTP-FP R.1.2.a).** Bare 200, direct-alternate
  200, and HEAD MUST identify the returned representation's profile (`Content-Profile` +
  `Link rel="profile"`). Calibration: the post-303 final 200 without `rel="profile"` matches spec
  Example 6 — the redirect flow is NOT changed by this round.
- **R13 — q-value robustness (RFC 9110, labeled robustness-not-conformance).** `parseAcceptProfile`
  discards `q=0` entries, clamps weights to [0,1], treats non-numeric as 1.0, keeps stable order
  for duplicates/ties.
- **R14 — deterministic combined media+profile selection** (design §3 F4).
- **R15 — ETag/variant audit on the profile axis** (design §3 F5 — verify-and-pin, not
  presume-fix).
- **R16 — honest subset naming.** Every teaching string states the implemented subset: exact
  profile-URI match; no tokens; no `isProfileOf` fallback. Conformant subset of `cnpr:http`
  (hierarchy = abstract-model SHOULD, tokens = MAY; both pinned).
- **R17 — write contract labeling.** The shipped contract is **read-side negotiation + write
  declaration**; reactive `422` write-side negotiation is explicitly deferred.

## 3. Fork design (neutral, P13-safe — no application vocabulary)

- **F1 — bare GET/HEAD profile stamp.** When a resource's `.meta` declares a default
  representation, the non-negotiated serve path sets `chosenProfile` from the already-loaded
  `advertisedReps.default.profile` (file branch, container branches, HEAD parity — HEAD is a
  duplicated handler, gate GET/HEAD together). No new reads. Resources without declared reps are
  byte-identical to today. Guard: the stamp binds to the declared representation as served — if
  the media axis converts the body to a format other than the default rep's declared
  `dct:format`, omit the stamp (a profile claim must not ride on a converted variant).
- **F2 — direct alternate GETs are covered by F1 + data, not special-casing.** P2 gives each
  materialized face its own `.meta` declaring itself as its default representation; the fork needs
  zero alternate-specific code and no reverse lookup. Substrate-neutral: any resource with a
  declared default rep gets the stamp.
- **F3 — `parseAcceptProfile` robustness** per R13, mirroring the media-parser consumers' q=0
  semantics. Unit tests: q=0 discard, clamp out-of-range, non-numeric, duplicates, ties, malformed
  segments.
- **F4 — joint media+profile selection.** `negotiateProfile` collects ALL reps exactly matching
  the requested profile (default slot + alternates). One match → today's behavior. Multiple →
  disambiguate by `Accept` media conneg among the matched set; tie or no `Accept` → default slot,
  then declaration order. Outcomes stay self-or-303. The rule is stated in the hints (F6).
- **F5 — ETag audit, not a fix.** Claim to pin: after F4, profile selection never changes bytes at
  a URL (self serves the default; every alternate is a 303 to its own URL), so no profile
  component in the variant ETag is needed. Gates pin: bare vs negotiated-self ETag/byte coherence;
  303-arm inline If-None-Match unchanged; 406-beats-304 and 304-beats-303 precedence retained.
  Extend `VARIANT_KEYS` ONLY if implementation falsifies the claim; record the falsification in
  the round ledger if so.
- **F6 — teaching-surface rewrite (R16).** SD capability hint
  (`storage-description.js:184`), linkset hint (`:171`), MCP hints (`tools.js:468`,
  `resources.js:60`), both 406 bodies (`serve.js` `nonRdfNotAcceptable`,
  `resource.js` `profileNotAcceptableProblem`): state exact-URI match; point agents at the
  linkset `formats=` / 406 "profiles that conform" enumeration as the complete set of valid
  inputs; state the F4 selection rule; name tokens + hierarchy as not implemented. Capability
  type stays `http://www.w3.org/ns/dx/connegp/profile/http` (conformant subset).
- **F7 — negative controls.** `--lws`-off byte-identity; WAC filtering, no-oracle 404 posture,
  and sidecar authz untouched.

## 4. lws-pod design (application #1 + projection toolkit)

- **P1 — mint honest viewing profiles.** Two new llm-wiki-family descriptors:
  **`llm-wiki-view`** (HTML page rendering; `html` + `index-html` conform to it) and
  **`llm-wiki-viz`** (graph visualization; `viz` conforms to it). `dct:conformsTo` stops claiming
  an HTML face conforms to a markdown+YAML information-format profile. End state — every rep at
  each level has a distinct (profile, media) pair: member {okf-base·md, llm-wiki·ld+json,
  llm-wiki-view·html}; container {okf-base·md, llm-wiki-view·html, llm-wiki·ld+json,
  llm-wiki-viz·html}. No `isProfileOf` claims minted (a view is not a narrowing of the
  information profile). F4 remains necessary
  regardless: any application may declare duplicates; the substrate must stay deterministic.
- **P2 — per-face `.meta`.** `instantiate()`'s `advertise()` additionally writes each face's own
  `.meta` carrying an `altr:hasDefaultRepresentation` self-entry (href = the face itself, its
  `dct:format`, its `dct:conformsTo`). This is F2's data source. Existing sidecar authz
  (`*.meta` GET/HEAD require READ-on-subject) already covers the new files; mirrorAcl already
  covers private members' faces.
- **P3 — loader conventions.** (a) Publish-time declaration check: a descriptor's subject MUST
  equal its document URL (the `@id: ""` convention, now enforced, fail-loud at publish). (b) The
  multi-parent merge gains an equal-specificity conflict rule: two equally-near parents
  disagreeing on a singleton (`identityPolicy`, `planeMapping`) without a child override → hard
  error naming both parents. List unions (validation/vocabulary/contexts/representations)
  unchanged.
- **P4 — token-claim retraction.** Design docs stop promising `prof:hasToken` negotiation
  (grep-and-edit pass over docs/); the loader keeps parsing `hasToken` declaration-side (generic
  PROF vocabulary, unused by selection — stated as such where it's parsed).
- **P5 — rig.** Repin `Dockerfile.fork` + `docker-compose.fork-tls.yml` to the merged fork ref
  (BOTH must move — compose's build-arg fallback shadows the Dockerfile ARG); `make
  reinstantiate` migrates the wiki family to the new profiles + face `.meta`s; update anticipated
  pin drift (any test asserting `okf-base` on HTML faces — expect hits in
  `tests/lws-viewer.test.mjs` / `tests/lws-conneg.test.mjs` / projector unit tests).

## 5. Acceptance

- Neutral (non-wiki, non-DCAT) two-profile fixture exercising: bare/HEAD/303/negotiated-final
  responses with correct profile headers; exact match; **ancestor-URI request → 406** (pinned as
  the named-subset behavior); the R13 q-value matrix; duplicate-profile/different-media reps
  resolved per F4; an unreadable alternate; 406/304/Vary ordering.
- New live gate on the fork rig — `tests/lws-profneg.test.mjs`, `make test-profneg` — + full
  sweep green, including re-verified `test-conneg`, `test-wiki`, `test-viewer` with updated pins.
- Full fork suite green; `--lws`-off byte-identity gate.
- Write-side negotiation explicitly labeled deferred (R17) in the conformance surface — not
  implied shipped.

## 6. Non-goals

- Profile-hierarchy fallback and token negotiation (recorded optional hardening; composes cleanly
  later — the exact-first ordering never changes).
- Write-side reactive `422` negotiation (R17 deferral).
- Authorization-server track (closeout item 4), conformance-ledger rewrite (item 5), curator
  round (item 6).
- The human-surface aggregate-leak residual (recorded 2026-07-15, unchanged here).
