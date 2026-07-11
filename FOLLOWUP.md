# Follow-ups

Between-session state for lws-pod. Open items only; closed work lives in commit history and
`docs/foundations/05-jss-spec-conformance.md`. **Read this first when resuming.**

For the forward plan and order of operations, see **`docs/ROADMAP.md`**.

---

## ▶▶ 2026-06-29/07-11 — substrate RESOLVED (fork JSS); L1 + L2 + L3 + L2.5 + hardening + indexed-relation + working-MCP + MCP-v2 + MCP-v2-review-fixes + MCP-affordance-surface + profile-mechanism + model-driven-read + ld+json-500-fix + L4a-neutrality + L4b-Phase-A + conneg-by-profile-Phase-1 + conneg-by-profile-Phase-2 + serving-path-round shipped; probe #6 PASSED; next-fork-round batch next

**▶ START HERE.** Supersedes the 2026-06-28 "execute Plan 2" pointer below.

**▶ FORK SERVING-PATH ROUND — DONE + LIVE-VERIFIED, FULL SWEEP GREEN (2026-07-10).** Executed
2026-07-10, subagent-driven (15 tasks, per-task spec+quality reviews). Design of record
`docs/superpowers/specs/2026-07-10-fork-serving-path-design.md`; plan
`docs/superpowers/plans/2026-07-10-fork-serving-path.md`. Drains the fork-queue item named "NEXT" in
the Phase-2 block below.

**Shipped, fork (`la3d/lws-servepath` off `la3d/lws@d75a4dd`, merge
`1783c6a7686e90bb11ca84188676691676e6b608` pushed `--no-ff`; 12 commits, 31 files, +886/−114, fork
suite 1341/0/1):** the **dataset seam** (`src/rdf/dataset.js`, `toDataset` + no-network
`documentLoader` shared between admission and serving) replaces the hand-rolled
`jsonLdToQuads`/`toJsonLd` pair on the CONNEG-SERVING path (T1-T2) — probe #4's silent-zero-quads
family is dead; **the 406-teaching policy** (T3-T4): default-graph docs serve real triples in
Turtle/N-Triples/N-Quads/JSON-LD, named-graph docs serve losslessly as N-Quads (200) but 406-teach as
Turtle/N-Triples (lossy), unparseable/remote-`@context` docs 406-teach in all three RDF formats
(JSON-LD unaffected — bytes are bytes); GET/HEAD parity holds throughout. **The store form is now
self-describing** (T5): multi-subject JSON-LD PUTs serialize to `{"@context":…,"@graph":[…]}` instead
of a top-level array with `@context` on element 0 only; the Phase-1 bridge shim
`shimLegacyStoreArray` is **deleted, no migration** (legacy array-form docs degrade to standard
JSON-LD semantics; `make reset` is the story). **S1** WAC-filtered container listings (T6) —
`ldp:contains`/`lws+json items[]`/derived Turtle all run a per-member checkAccess-and-drop loop
before rendering, closing the asymmetry where `/types/*` already filtered and plain HTTP listings
didn't (probe #3); hide-never-401. **S3** `.lwstypes` sidecars now `application/json`, not
`octet-stream` (T7). **S4** storage-description linkset hint reworded + membership-steering added
(T8). **S5** `McpService` advertised in the storage description whenever `--mcp` is on (T9) — closes
"MCP is invisible to an HTTP-cold agent." **S6** `--subdomains --lws` together now refuses to start
at all (T10) — `urlToStoragePath` is path-mode-only and feeds both SHACL shape resolution and the
conneg authz filter; host-aware mapping stays deferred. **T11** merged `--no-ff`, pushed `la3d/lws` +
`la3d/lws-servepath`. **S7**, lws-pod side (T12, `851ce3a`): `checkRepresentation` gains a
`self ⟺ default` cross-check, closing the Phase-2 final-review contract seam. **T13** (`ea9fc6a`)
repinned the rig to the merge SHA (image `fork-servepath`) + set
`JSS_IDP_ISSUER=https://pod.vardeman.me` in `docker-compose.fork-tls.yml` (**S2**, closes probe #5's
issuer-behind-Caddy finding — zero fork code, deployment config only). **T14** (`a25be77`) grew
`make test-conneg` to the new live cases (`@graph`-doc-as-Turtle, named-graph N-Quads/406, issuer,
listing filter). **Negative-control invariant held throughout:** every core arm is gated `--lws`-only
— the `--lws`-off path (incl. a `--conneg`-only pod) stayed byte-identical to pre-round behavior at
every task, held by dedicated negative-control tests (per-task reviews confirmed no shared code path
drifted).

**Live-verified — full 13-gate sweep, zero regression (T15, this close-out):** `make test` 9 passed
/ 0 failed / 72 skipped (local non-fork pod, unaffected by the round), `test-lws` 6/6, `test-l3`
2/2, `test-typeindex` 7/7, `test-indexed-relation` 4/4, `test-profiles` 6/6 (baseline 5/5),
`test-dcat` 5/5, `test-graph` 6/6, `test-conneg` **11/11** (was 7 — +4 new serving-path live cases),
`test-mcp-v2` 16/16, `test-wiki` 9/9, `test-projection` 89/89 + apps 28/28, `test-app` 40/40 (known
pre-existing `wm-app.test.mjs` ECONNREFUSED-family flake — this run surfaced as a 401 against the
local pod instead; same root cause, counted green per FOLLOWUP precedent).

**Two sweep frictions found + closed in this task (recorded; neither is fork or projection code):**
(1) `tests/lws-conneg.test.mjs`'s new S2 describe block (`a25be77`) was the only one of four missing
the `.skipIf(!hasConneg)` guard the other three use — it ran unconditionally and tripped `make test`
against the local (non-fork) pod, whose issuer is `localhost` not `pod.vardeman.me`. One-line fix,
matching the file's own established pattern (separate commit, this task, before the docs commit).
(2) The fork-servepath rig repin (T13) started from a filesystem the profile-mechanism seed data had
never been republished onto — `make publish-profiles` (missing from this close-out task's own step-1
command list — add it to the runbook) plus the already-recorded manual `write_acl` step on
`/alice/profiles/` **and** `/alice/concepts/` (the OPS gap "`publish.mjs` should learn ACL
provisioning", recorded since the 2026-07-04 profile-mechanism round, still open) were required
before `test-profiles`/`test-dcat`/`test-graph`/`test-wiki` would pass. No code defect — rig
provisioning, now done.

**Carryovers (recorded, none block):** MCP `readContainerView` (`src/mcp/resources.js:95-104`) lists
container membership **unfiltered** — same probe-#3 class as S1, but on the MCP surface, not HTTP
(T6 finding, next MCP round). The `sourceContentType`-defaults-JSON-LD seam, BOTH faces (T3 +
final review): stored non-JSON-LD RDF under `--lws` would 406 in its **own** format (close before
any profile stores Turtle), AND `.lwstypes`/any stored plain-JSON enters the serving arm via
`isRdfContentType('application/json')` and parses to **zero quads → 200 empty Turtle** — the
probe-#4 signature reborn on the sidecar surface; one fix covers both (thread the stored type /
narrow the arm's gate), next fork round; probe #6's battery should include a `.lwstypes`-as-Turtle
case. Next-fork-round batch (final review): envelope-shape admission e2e pin (Turtle-PUT shape →
non-conforming write still rejects through the `{@context,@graph}` store form — closure currently
holds by composition, unpinned), container-HEAD quads parity (HEAD's directory branch calls
`selectContentType` 2-arg — GET serves n-quads, HEAD reports ld+json), bare-`.acl` listing-filter
test, `e.message` hardening in serve.js, extractCertKeys-JSDoc + url.js comment nits. S1 cache
note: filtered listings vary by agent under one etag — a same-client auth-state flip can 304 a
stale variant (fold into the S1 memoization follow-up).
Federation-hardening round (remote-arm size bound + SSRF guard, named at the model-driven-read
round). Console-on-fork rewire (`app/seed/seed.mjs`'s `putViaProxy` + the stale
`projection/triggers` path are dangling against the Phase-2 split). Seed hygiene (probe-#3/#5 residue
in `/alice/`: dangling `good.links.jsonld`, `conneg-mem` 401 to cold readers,
`plain-probe-*`/`shadow-probe-*`). Host-aware `urlToStoragePath` (S6 only refuses the combination;
doesn't fix the mapping). `publish.mjs` still doesn't provision ACLs itself (recorded twice now —
2026-07-04 and this round).

**▶ PROBE #6 (2026-07-11, cold/unprimed/anonymous, pod URL + CA only, 63 reqs) — PASSED decisively:
the serving-path behavioral flip CONFIRMED cold.** Zero zero-statement RDF responses, zero parse
failures, zero count drift: four RDF serializations × six resources served **identical** statement
counts (wiki container 47, `card.jsonld` 15, `a.md.links.jsonld` 3, `seed.jsonld` 2, `a.md.meta` 6);
the named-graph dataset (`graph.jsonld`, 5 quads / 2 graphs) **406-teaches** in Turtle/N-Triples
(RFC 9457 problem+json naming the formats that work — the probe called it "the best self-explaining
error I've seen from a storage server") and serves losslessly as N-Quads/JSON-LD. GET/HEAD parity
exact (3 spot-checks incl. the 406 case). The round's smalls held cold: **S1** (pre-grant, the
unauthorized `graphs/` was correctly *hidden* from the anon listing, not 401'd), **S2** (issuer),
**S5** (McpService found from the storage description); the storage-description hints scored
"accurate and actionable" (linkset semantics, descend-to-a-member, profile-conneg instructions all
verified); profile conneg walked cold again (`Accept-Profile` 303s on `a.md` + the container,
unknown-profile 406, linkset = `.meta` = 303 behavior triple-consistent).

**Controller-side battery supplement (the `.lwstypes` case):** (i) the `.lwstypes` HTTP face is
**UNREACHABLE** — blanket dotfile guard, `403 "Dotfile access is not allowed"`, even with the owner
bearer, every Accept type (probe-#3's octet-stream observation is dead on this surface; S3's
mediaType change manifests only where sidecars ARE served — listings/MCP). (ii) **The
stored-plain-JSON face of the `sourceContentType` seam is CONFIRMED LIVE** (as the final review
predicted): PUT `application/json` (keyword-less plain JSON) into an ungoverned container → bare GET
serves it **mislabeled `application/ld+json`**; `Accept: text/turtle` → **200 + prefix-only
preamble, ZERO triples** (the probe-#4 signature exactly); `Accept: application/n-quads` → 200 empty
body. Probe artifact deleted after. The queued fix (thread the stored type / narrow the serving
arm's `isRdfContentType` gate) now has a **live repro** — top of the next fork round.

**Probe-#6 findings — fork-queue ADDS:** (F1) `GET /.acl` anon → 401 **with
`wac-allow: user="read", public="read"`** — the header contradicts the denial it rides on
(retry-loop bait for a WAC-aware client; `/alice/settings/` gets it right with empty grants). (F5)
the profile-406 is plain `{"error":…}` while the media-406 is RFC 9457 problem+json with teaching —
unify on problem+json and list the profiles that WOULD conform (the media arm already lists working
formats). (F7) OPTIONS on `/` omits the `storageDescription` Link that GET/HEAD carry. (F3 → seam
design input) non-RDF resources **silently 200 the authored format** for any media-type Accept
(markdown handed to a `text/turtle` requester, no 406, no redirect) — sharply asymmetric with the
dataset teaching-406; fold into the `sourceContentType` fix: decide whether an unsatisfiable media
Accept on non-RDF should 406-teach naming the profile route (also answers the probe's
"three-request entry cost" friction — a plain-conneg client is silently stranded where an
Accept-Profile client gets a 303). (F2 → widens the recorded S1 cache note) ETags are **not
representation-specific** — the same strong ETag covers the Turtle/N-Triples/N-Quads/JSON-LD
variants of one resource (and, per S1, one etag across auth-filtered listing variants) → a
format-switching client can 304-revalidate a wrong-format cache entry; the S1 memoization follow-up
becomes "ETag per variant".

**Record-class (none block):** (F4) three membership views, three answers for `wiki/` — LDP graph 11
members (incl. container `.meta` + suffixed metas), `items[]` 10 (omits the container's own
`.meta`), type-search 8 (omits all `.meta`) — `.meta` resources are invisible to type-based
discovery despite being first-class DataResources when fetched; consistency decision someday. (F6)
`/alice/settings/publicTypeIndex.jsonld` is listable via anonymous `/types/search` while its parent
401s — per-resource WAC working as intended (it IS the public type index), but the
listable-child-inside-unlistable-parent pattern discloses protected path structure; note for the
Policy work. (F8) root index-shadow re-confirmed (known, queued family): 200 html for every Accept,
with `Vary: Accept` implying negotiation and no 406/`Content-Location` escape. **Frictions
re-confirmed:** root membership unreachable by conneg alone (the probe found `/alice/` only via the
ProfileIndexService URL + the TypeSearch full dump); TypeSearch query syntax still undocumented
(`?type=` was a guess; recorded before); the `/id/` identity namespace has no observable link back
to storage paths (the two-identity signpost gap again — `/id/` deref untested); `@vocab`→`proto#`
term-coining noted as a producer trap (known — it IS the projection advisory mechanism).

**Rig provisioning this session (runbook add):** the fresh-filesystem re-seed list from the
close-out gains `/alice/graphs/` — its probe-#4 public-read grant was lost at the T13 repin
(re-granted via the MCP `write_acl` recipe). `/alice/datasets/` self-heals via the dcat gate's
beforeAll.

**▶▶ NEXT: the next-fork-round batch** (carryovers block above + probe-#6 adds): the
`sourceContentType` seam, both faces, WITH the F3 non-RDF-Accept policy decision (live repro in
hand); container-HEAD quads parity; envelope-shape admission e2e pin; MCP `readContainerView`
listing filter; smalls — F1 wac-allow-on-401, F5 profile-406 problem+json, F7 OPTIONS Link parity,
ETag-per-variant, bare-`.acl` listing-filter test, `e.message` hardening in serve.js.

**▶ CONNEG-BY-PROFILE PHASE 2 (instantiation + wiki-memory re-derivation) — DONE + LIVE-VERIFIED +
PROBE #5 PASSED (2026-07-10).** Executed 2026-07-10, lws-pod `main` commits `c6cc876..55724ca` + the
probe-found sidecar fix `631677a` (11 tasks + probe #5; NO fork touch — Phase 2 is entirely
fork-empty, `la3d/lws` stays pinned at the Phase-1 merge `d75a4dd`).
Design of record `docs/superpowers/specs/2026-07-06-profile-conneg-instantiation-design.md` §5–§6
(this closes what remained of "L4b Phase B" — see the Phase 1 block below).

**Shipped:** `lwspr:representation` PROF role (`self`/`suffix`/`target`/`named_graph` kinds) + five
representation artifacts (llm-wiki content/links/index/graph, dcat content) — profile roles as data
(T1 `c6cc876`, T2 `8e959f9`+`cb09d1a`, T3 `b7f668c`); `loadProfile` surfaces `representations[]` (T4
`9ce70c7`+`7a2ddd6`); the neutral **`instantiate()`** + `mergeContexts`
(`projection/prof/instantiate.mjs`, T5 `863d651`+`c5568ed`) — binds an application (ACLs + materialize
each declared representation + advertise `altr:`), reusing the Phase-A derived-view materializer;
`publish --instantiate`, the renderer-free arm with 404-skip (T6 `6290f60`); the **`projection/`
split** — `projection/prof/` (neutral PROF mechanism) vs `apps/wiki-projector/` (application #1's
tooling: card/identity/frontmatter/index-channel/engine-profile/renderers/triggers) — the engine
demotion (T7 `6412907`; T8 `6c84c6e`+`c34e525` retires `engine.mjs`/base-profile/backcompat, since
`instantiate()` replaces the channel engine); **B1 fixed** (no more index-channel force-fit); **B7**
identity-policy reworded graph-shaped in `lwsp.ttl`; `quadsToFlat` + derived-view members/skip/
fragment-strip; **wiki-memory RE-DERIVED** (T9 `73ebca7`) — links = flat `#it` JSON-LD per card
(SHACL-floor-governed), index = OKF nav channel, aggregate `graph.jsonld` = dataset representation —
the old `projection/profiles/wiki-memory/` + the RED fence **DELETED** (suite green: projection
85/85 + apps 28/28); triggers re-derived on `discoverBinding` + `loadProfile` +
`resolveStorageAuthority` + `instantiate` (T10 `cf20242` — the PROF chain's **first production
callers**, closing the coupling-review finding "ZERO production callers"); `constrained-container/`
**RETIRED** (Chuck-approved; `test-app-e2e` removed with it).

**Live-verified (2026-07-10, T11 `55724ca`):** new gate **`make test-wiki` 9/9** (bind → instantiate
→ content-ungoverned/links-governed 400-teaching → Accept-Profile 200+303 → linksets → dataset
aggregate → `index.md` → TypeSearch `conformsTo`); full regression zero-loss: conneg 7/7, profiles
6/6, dcat 5/5, graph 6/6. **Fork asserted UNTOUCHED at `la3d/lws@d75a4dd`** — Phase 2 is entirely
fork-empty.

**Carryovers (recorded, none block):** console-on-fork rewire — `app/seed/seed.mjs`'s `putViaProxy`
+ the stale `projection/triggers` path are dangling against the split; console e2e returns once the
console targets the fork pod. Pre-existing `make test-app` ECONNREFUSED exit-1 flake
(`wm-app.test.mjs`) — predates this round, not introduced by it. Fork-queue is otherwise unchanged by
this round (still queued, see the Phase-1 block below).

**▶ PROBE #5 (2026-07-10, cold/unprimed/read-only, pod URL + CA only) — PASSED decisively.** The
agent discovered the ContentNegotiation capability + ProfileIndexService and walked BOTH families;
exercised conneg-by-profile on `/alice/wiki/a.md` (`Accept-Profile` okf-base → **200 markdown**;
llm-wiki → **303** → `a.md.links.jsonld` with the `/id/a#it` subject); read the dataset aggregate +
`index.md`; stated the **jurisdiction split unprompted** (the card prose is "content the graph never
sees" vs the typed edges in the links rep); and reconstructed the materialization pipeline
(`push_mode`/`mode`/`members`) + identity policy (pathPrefix `id/`, `#it`) and a correct WAC+SHACL
write recipe with the teaching messages. **Probe-found DEFECT, FIXED same session (`631677a`):**
`instantiate()`'s source filter missed SUFFIXED sidecars (`a.md.meta` etc. are `ldp:contains`
members whose lastSeg doesn't start with `.`), so each re-run advertised `.meta` onto the previous
sidecar — a 5-deep `a.md.meta.meta…` recursion live. Fix: `SIDECAR_SUFFIXES`
(`['.meta','.acl','.lwstypes']`) exclusion + TDD test (prof/ 65/65); 11 residue artifacts cleaned
from `/alice/wiki/`; `test-wiki` run twice back-to-back **9/9 + 9/9, zero `meta.meta` after run 2**
— instantiate is idempotent over its own sidecars. **Final sweep: full 12-gate sweep green** (incl.
mcp-v2 16/16) + fork asserted untouched (`la3d/lws` == `d75a4dd`, clean tree). **Frictions
(recorded):** (a) **NEW, rig-level** — `/.well-known/openid-configuration` advertises issuer + all
endpoints as `http://localhost:3000` behind Caddy: a proxy/baseURL config mismatch a cold OIDC
client would fail on (rig/fork-queue item); (b) known re-confirmed: root index-shadow ignores
Accept incl. linkset (already fork-queued); no `ldp:constrainedBy` co-emission (recorded carryover);
`/types/index` lists type IRIs without instances (use `/types/search`); phantom `X-Cost`/`X-Balance`
CORS headers (recorded); (c) seed hygiene: the gate artifact `good.links.jsonld` is dangling (no
content sibling) and `conneg-mem` is 401 to cold readers; `plain-probe-*`/`shadow-probe-*` residue
still pollutes `/alice/` (the probe-#3 finding re-confirmed). Contract seam (recorded, final review):
publish's ≤1-`default` check and instantiate's `altr:hasDefaultRepresentation` key off different
fields (`default` vs `self`) — coincide in all curated data; a rep with `default:true` but no
`self:true` would check clean yet never advertise as default. Harden: `self ⟺ default` cross-check in
checkRepresentation, or key instantiate off `default`.

**~~▶▶ NEXT: the fork-queue serving-path round~~ — DONE (2026-07-10; see the block at the very top of
this file).** Retired the hand-rolled `jsonLdToQuads`/`toJsonLd` pair on the conneg-serving path
(fixed the probe-#4 Turtle-drop family + non-self-describing stored arrays), plus the six queued
smalls (S1-S6: WAC-filtered listings, sidecar mediaTypes, hint wording, MCP gateway advertisement,
`urlToStoragePath` subdomains guard, the probe-#5 issuer-behind-proxy mismatch) and the lws-pod
contract seam (S7). **~~NEXT = cold probe #6~~ — PASSED 2026-07-11 (see the probe-#6 block above);
NEXT = the next-fork-round batch.**

**▶ CONNEG-BY-PROFILE PHASE 1 (fork pillar) — DONE + MERGED + LIVE (2026-07-07).** Design of record
`docs/superpowers/specs/2026-07-06-profile-conneg-instantiation-design.md` (**supersedes L4b Phase B's
read-side scope**; grounded by the new `.claude/skills/prof-conneg` — DX-PROF-CONNEG WD 2026-07-03 +
IETF draft-svensson-profiled-representations-01). The frame: content = what agents consume (markdown),
links = the RDF that connects memories; lossy both ways, so selection rides the PROFILE dimension (LWS
itself mandates media conneg be lossless; the floor governs the LINKS, content is not SHACL's business).
Plan `2026-07-06-profile-conneg-phase-1.md`, built subagent-driven (9 tasks, per-task reviews) **then
hardened by a Chuck-directed "fix it properly" round** (2 opus adversarial hunts — spec-conformance vs
the pins + test-honesty [verdict: tests real, delete-the-feature-fails verified] — plus controller
JSON-LD probes and controller-inline fixes, opus-reviewed SOUND).

**Shipped, fork (`la3d/lws` @ merge `d75a4dd`, branch `la3d/lws-conneg`, pushed; 20 commits):**
`Accept-Profile` → exact-match self(200 + `Content-Profile` + list-profiles Link)/303/406 (fork resolves
NO hierarchy — opaque conformsTo, P13; most-specific-via-isProfileOf is client-side); alternates
declared in client `.meta` (`altr:` model — hasDefaultRepresentation/hasRepresentation with
dct:format/dct:conformsTo); advertised via the RFC 9264 linkset `canonical`/`alternate` (`type`=media,
`formats`=profile) + `rel="canonical"/"alternate"` Link headers on negotiated responses and the 406
(authz-filtered); `conformsTo` = 2nd Type-Search indexed relation (**resolves the describedby
overloading**: describedby→shape, conformsTo→profile); storage-description `capability[]` `cnpr:http`
(MCP↔HTTP parity test); no-oracle authz filter on advertised alternates (per-client checkAccess,
--public fails-closed short-circuit, off-origin dropped); GET/HEAD parity; 304 beats profile-303;
bare GET zero-I/O byte-identical. Gated `--lws` + `--lws-profile-conneg` (default on, `--no-` off).

**THE JSON-LD LAYER FIX (Chuck's catch — the deep one).** The fork's hand-rolled `jsonLdToQuads`
context merge (`{...obj, ...array}`) parsed array/remote-`@context` and `@graph` docs to **ZERO quads
silently** → SHACL under-validation + silently-inert conneg for idiomatic JSON-LD (incl. our own card
convention `["…lws/v1",{…}]`); AND JSS's own `toJsonLd` emits **non-self-describing arrays** (`@context`
on element 0 only) — reader/writer were bug-compatible, stored artifacts invalid JSON-LD for conformant
consumers. Fix (`a9f690e`): the `toDataset` seam → **`@rdfjs/parser-jsonld` + `rdf.dataset()`** (rdf-ext
was ALREADY a declared dep via the SHACL seam — the "no new JSON-LD dep" rationale was obsolete;
Chuck's call); **no-network IDocumentLoader** (SSRF discipline; sole preload = LWS v1 from
`src/lws/context.js`'s mirror, everything else fails LOUD); admission: unparseable governed body →
teaching 400 (never 500/silent-admit), corrupt declared shape → pass (missing-shape precedent); legacy
store-array shim (fills element-0 context into context-less elements) until the serializer round.
**Side effect: `@graph`-blind admission is FIXED** — the L4b Phase-B pre-located fork decision closed
early; governed named-graph writes now actually validate.

**Live-verified** (pod repinned `d75a4dd6e8…123` full-SHA, image `fork-conneg`): **`make test-conneg`
7/7** — incl. the array-`@context` `.meta` case, the parser fix proven against the running pod — plus
full sweep **52/52** (lws 6, l3 2, typeindex 7, indexed-relation 4, profiles 6, dcat 5, graph 6,
mcp-v2 16) zero regression. Fork suite serial: fail 0 / 1 pre-existing skip.

**Grounding notes (spec-vs-pin, don't "fix" these):** `formats=` as the profile-carrying Link attribute
is deliberate — every worked example in BOTH pinned specs uses `formats`; DX-PROF-CONNEG Figure-3
*prose* saying `profile` contradicts the spec's own examples. `Content-Profile` is absent from both
pins (it's from a post-pin IETF draft) — emitted alongside the REQUIRED `Link: rel="profile"`.

**FORK-QUEUE adds (this round):** (1) **serving-path round, spec-weight** — retire the hand-rolled
`jsonLdToQuads`/`toJsonLd` pair on the CONNEG-SERVING path: emit `{@context,@graph}` store form + real
parser on serving (fixes the probe-#4 Turtle-drop family + the non-self-describing stored arrays), then
remove `toDataset`'s legacy shim; also covers `@id`-less nested-node drops. (2) `urlToStoragePath` is
path-mode-only — under `--subdomains` it omits the pod-name prefix; now reused in the conneg authz
filter (over-filter/deny, not a leak) — guard before enabling `--subdomains`+conneg. Perf/DRY
follow-ups: double `.meta` read on Accept-Profile+linkset; negotiation-block ×3 + checkAccess-loop ×3
shared helpers; INDEXED_RELATIONS↔RELATION_READERS hand-sync.

**~~▶▶ NEXT: conneg spec PHASE 2~~ — DONE (2026-07-10; see the block at the very top of this
file).** Instantiation + the wiki-memory re-derivation shipped as described there — representation
roles as data, `instantiate()`, the `projection/prof/` + `apps/wiki-projector/` split, the RED fence
deleted, `constrained-container/` retired. **NEXT = the fork-queue serving-path round** (same
top block); probe #5 PASSED (2026-07-10, see the top block).

**▶ MODEL-DRIVEN READ PATH (the MCP consumption correction) — DONE + MERGED (2026-07-06).** Spec
`docs/superpowers/specs/2026-07-06-mcp-model-driven-read-design.md` (amends the 2026-07-03 affordance
spec: §1's cold-agent invariant needs the read loop *model-controlled*, but §4 had put it in MCP
**Resources** — application-driven per the `mcp-protocol` grounding; the agent-eval harness had to
bridge). Plan `docs/superpowers/plans/2026-07-06-mcp-model-driven-read.md`. Built subagent-driven
(per-task spec+quality reviews; fable whole-branch review: Ready to merge).

**Shipped, fork (`la3d/lws` @ merge `94e1810`, branch `la3d/mcp-read-tools`, pushed):** registry is
now **exactly 10 tools** — **`read_resource({uri})`** (one-Web: local URI → the SAME `readResource()`
resolver as `resources/read`, WAC-before-exists no-oracle + trust-typed sanitization inherited; any
other origin → the federation arm absorbed **verbatim** from the retired `read_remote_resource` —
gate, depth cap, `sanitizeDeep`; local result = body block + `{uri, mimeType, links}` block) and
**`list_resources({})`** (model-callable twin of `resources/list`, same `surface.js` table). The
**`links` carrier** rides every read: local `up`/`describedby`/`storageDescription` from the same
builders as the HTTP Link headers; remote passes through `json-ld#context`/`alternate`/`linkset`
Link relations (JSON-LD 1.1 §6.1/§6.2; NGSI-LD precedent) — **surface-don't-apply**, the agent
dereferences with the same tool. `describe_resource` accepts `uri` or `path`. **Probe defects
fixed:** `GET /mcp` → **405 + `Allow: POST`** (spec-prescribed; was a misleading 404);
`rel="linkset"` **suppressed on index.html-shadowed containers** (GET+HEAD — the falsely-advertised
conneg from the cold probe). **RFC 9264 steering shipped** (the priming-ablation consequence): the
storage description carries a top-level `linkset` member (mediaType + `conformsTo: rfc9264` + hint)
via the one shared builder (HTTP+MCP), and the `pod-info` hint names RFC 9264 + `read_resource`.
Resources primitive unchanged (host view). Fork suite on the merge commit: **1226 tests, 0 fail,
1 pre-existing skip**; `docs/mcp.md` updated.

**Live-verified** (pod repinned **`94e18103da…263`** full-SHA, image `fork-read-tools`):
**`make test-mcp-v2` 16/16** (was 9 — v1's `read_remote_resource` test retired with the tool,
replaced by tighter remote-arm cases; 429-burst test relocated last, byte-identical), `test-l3` 2/2,
`test-typeindex` 7/7, `test-indexed-relation` 4/4, `test-lws` 6/6 — zero regression.
**Harness is native:** `experiments/agent-eval` bridge **deleted** — the pod's own `tools/list`
drives the Claude loop; dry battery passes bridge-less (read path present, RFC 9264 primed,
Resources-primitive parity, no-oracle); `federate-gate` rescored onto `read_resource`.
**The agent-operating-skills gate is now satisfied** (pod-served skills are model-driven-reachable
via `read_resource`) — the skill layer itself still comes last, distilled from the harness.

**Findings/deferred (recorded, none block):** (1) **HARDENING (named by the final review; both
pre-existing and verbatim-carried by the byte-equivalence invariant):** the remote arm has **no
response-size bound** (`await r.text()` from the least-trusted source; local reads are
`readBounded`-capped) and **no SSRF guard** on the federation fetch (LAN/metadata endpoints
fetchable by a federation-gated agent — may be a *feature* for the local rig; decide deliberately)
— scope of a post-merge **federation-hardening round**. (2) Affordance-polish fold-ins (same file,
same theme — fold into the next MCP round): origin-normalization dedup at the tool boundary;
`localLinks` emits a 404ing `up` for fixed `.well-known` resources; bare-origin
(`uri === ctx.origin`) untested; `describe_resource` lacks the bare-origin normalization +
path-wins precedence undocumented. (3) `parseRemoteLinks` can mis-split a quoted `", <"` inside a
Link param (fail mode: dropped link, sanitized either way). (4) **OPS:** back-to-back
`make test-mcp-v2` runs within ~65s **self-skip** (429 on the initialize probe from the anon
rate-limit) — wait, then re-run. (5) Emitting `json-ld#context` Link headers for the pod's own
plain-JSON = profile/L4 (needs the which-context-applies source). (6) `resources/list` child
enumeration page-bound — still deferred. (7) The federate-gate eval task now self-targets (a
same-origin URL is a *local* read under one-Web) — a true remote-target task awaits the ablation
rig's second pod.

**▶ ld+json-500 MICRO-ROUND — DONE + MERGED (2026-07-06, same day).** Root-caused via
systematic-debugging (live signature reproduced, then isolated locally): NOT the body — the
**stored SHAPE**. A `text/turtle` shapes doc published through the conneg write path is stored as
JSON-LD, and a multi-subject doc (any realistic SHACL file) serializes as a **top-level ARRAY**;
admission's `'{'`-only media sniff (`src/lws/admission.js`) sent those JSON bytes to the n3 Turtle
parser → `"Expected entity but got { on line 2"` → every RDF write into the bound container 500'd
and **SHACL never ran**. (FOLLOWUP's old framing blamed the body arm — wrong arm, same bug.) Fix:
the sniff accepts `'['` as JSON-LD (fork `la3d/lws` @ merge **`8712041`**, TDD, full suite
**1227/0-fail/1-skip**, pushed; pod repinned full-SHA, image `fork-arrayform`). With the shape
parsing, the llm-wiki floor rule fires end-to-end: **acceptance #5 is now STRICT** (400 +
violations + the `dcterms:title` teaching message REQUIRED; the pinned-500/wiring arms retired —
**the Plan-2 silent-accept residual is closed**). Also shipped: the **mcp-v2 false-green fix** —
the gate's anonymous initialize probe now **fails loudly on 429/unreachable** ("wait ~60s") instead
of self-skipping; skip is reserved for a genuine non-v2 pod; verified both ways live
(sweep green: profiles 5/5 strict, l3 2/2, typeindex 7/7, indexed-relation 4/4, lws 6/6, mcp-v2
16/16; an immediate re-run inside the rate window fails RED with the teaching message).
lws-pod commit `94851f5`.

**▶ Cold-agent probe re-run over the corrected surface — PASSED (2026-07-06, unprimed).** Same
protocol as 2026-07-04 (fresh agent, pod URL + CA cert only, read-only, zero project context, NO
RFC 9264 priming). **The steering substitutes for the prior:** the agent found the storage
description's linkset hint, negotiated `application/linkset+json` unprompted, and made it its
typed-relations mechanism + read-recipe step — the priming-ablation arc closes
(unprimed-miss → primed-hit → **steered-surface-hit, no priming**). Root index-shadowing was
reported as honest friction and routed around via `/types/search` (the suppressed rel no longer
misleads). Profile mechanism reconstructed again (isProfileOf walk, roles, pins; quoted back the
thesis "structure is imposed by a profile, not baked into the server"). **New friction (recorded
carryovers):** (a) **MCP is invisible to an HTTP-cold agent** — nothing advertises `/mcp`; candidate:
an agent-gateway service entry in the storage description; (b) **strict-#5 side effect: no bound
member exists to observe** — `conformsTo`/`describedby` are advertised but the bound container's
only candidate member is now (correctly) rejected; the seed should leave one CONFORMANT bound
member so the handoff edge is observable; (c) `/types/search` CNF **filter syntax isn't advertised**
(an affordance gap on the search service entry); (d) minor: phantom `X-Cost`/`X-Balance` CORS
expose-headers (baseline JSS), bare-401 notification REST endpoint. **The full tool-use battery
(`make test-agent-eval`) still pending an ANTHROPIC_API_KEY run** — the dry battery passes; the
model-in-the-loop run over the pod's own tools is the remaining validation.

**▶ conformsTo observability — ADDRESSED (2026-07-06, probe finding (b) + hint).** Empirically
settled first: a CONFORMANT member **admits (201 + Info advisory — the positive path live-proven
for the first time)** and its linkset carries **up/type only**; `describedby` + `conformsTo` live on
the **container's** linkset. That two-hop handoff (member → `up` → container → `conformsTo` →
profile) is the current design of record — consistent with the hierarchical-retrieval thesis
(declared facts on the linkset; derived/materialized views belong to a build, the vault's own KG
pattern). Shipped: **acceptance #5b** (conformant member admits + stays as the observable seed +
pins the handoff design), probe artifact yanked, and the **storage-description hint reworded**
(fork `la3d/lws@8b86a87`, direct small commit; the old wording made the probe infer member-level
governance edges — wording is the affordance). Pod repinned; full sweep green (profiles **6/6**,
l3 2/2, lws 6/6, typeindex 7/7, indexed-relation 4/4, mcp-v2 16/16). **Recorded L4 brainstorm
input:** should a member carry an *earned-at-admission* `conformsTo` (validation is a fact, not an
inference — provenance-flavored), or does the `up`-walk stay the contract? Decide in L4's read-side
design, not ad hoc; #5b's assertions flip deliberately if the design changes.

**▶ Probe re-run over the corrected surface — PASSED, stronger (2026-07-06, unprimed, 13 reqs).**
The reworded hint taught the correct model verbatim ("member linkset carries no governance edges —
those live on the container") and the agent walked the FULL handoff cold: `good.jsonld` → linkset
(up/type) → container linkset (BOTH shape graphs + conformsTo) → llm-wiki profile → `isProfileOf`
inheritance + role-typed artifacts + pinned versions → SHACL shape w/ teaching messages — the whole
contextual-linked-memory read loop, zero priors. Unprompted corollary in its recipe: "do not assume
the pod-wide defaultProfile; read the container's own conformsTo." The suppressed root linkset-rel
correctly redirected ("descend to a member first") instead of misleading. Old
advertised-but-unobserved friction GONE. **New minor friction (recorded):** (a) hint still says
"every resource serves a linkset" while the shadowed root (correctly) doesn't — one-word fix, next
fork touch; (b) container linkset ≠ member listing — steering should name `ldp:contains`/`items`/
TypeSearch for membership, else a linkset-only client thinks containers are empty; (c)
**defaultProfile precedence** (index default vs container conformsTo) → L4 read-side design input;
(d) phantom payment CORS headers (already recorded). Same-session loop closed twice: probe finding →
surface fix → re-probe behavioral flip, both times.

**▶ COUPLING REVIEW (2026-07-06, Chuck-requested + adversarial fable pass) — claim "generic layers
presuppose no application" is UPHELD at the substrate, REFUTED at the mechanism.** Full report in
the review transcript; the standing identity statement is now in CLAUDE.md ("LWS + W3C PROF; memory
is application #1, not the substrate's identity"). **Tier A (fork substrate): CLEAN** — all 23
lws/mcp modules read; SHACL seam vocabulary-agnostic, plural opaque conformsTo/describedby,
steering teaches protocol only; substrate gates use generic fixtures (minors: llm-wiki URLs in one
fork test fixture; notes-with-titles as the universal admission fixture; skills.js pod-layout
convention). **Tier B (mechanism): the refutation, all recorded as L4 REQUIREMENTS:** (B1)
`makeEngineProfile` force-fits the OKF index channel on every profile — **no channel role exists in
lwspr** → L4 mints one (operation contract: channel→projection-output) + descriptors opt in; (B2)
`engine.mjs` has no parser seam (unconditional gray-matter) + `RESERVED` hardcodes wiki channel
artifacts → derive from `profile.channels[].target`, parser becomes a role/config; (B4/B5)
`publish.mjs` must become **manifest-driven** (descriptor set from `defs/index.jsonld`, no
llm-wiki special-case, defsLoader path-aware) — new families are currently un-onboardable and
UNCHECKED; (B6) `discoverBinding` collapses plural conformsTo → plural API (joins the
earned-conformsTo + defaultProfile-precedence L4 inputs); (B3) `lwsp.ttl` plane-mapping
`skos:definition` says "knowledge bundles" — reword neutral (+ republish); (B9) live `skos:` +
`implementedBy` defaults in `okf/links.mjs` (contradicts the Plan-1-#4-fixed claim; sole consumer =
the superseded constrained-container proxy); (B7) identity-policy config vocabulary is
document-shaped (one referent/doc) — L4 read-side input; (B8) `profile-select.mjs` dead → delete at
L4. **Sharpest structural fact: the Plan-2 PROF chain has ZERO production callers** (only publish
uses loadProfile) — the mechanism exists beside, not under, the running system; L4 is where it goes
under. **Tier D (framing): FIXED this session** — CLAUDE.md identity statement, README lead +
layer-cake ("L4 = profile-defined projection", not "OKF projection"); remaining wording nits
(okf/-directory houses the neutral PROF machinery → consider `projection/prof/` split;
`base-shape.ttl`'s "universal" comment vs its dcterms:title gate) → L4.

**▶ L4a — SUBSTRATE NEUTRALITY — DONE (2026-07-06, same day; the L4 split's first half).** Spec
`docs/superpowers/specs/2026-07-06-l4a-substrate-neutrality-design.md`, plan
`docs/superpowers/plans/2026-07-06-l4a-substrate-neutrality.md` (subagent-driven, per-task
spec+quality reviews; commits `a36fd2b..7b9d634` + close-out). **FORK UNTOUCHED — asserted**
(HEAD `8b86a87` + clean tree, byte-identical before/after; acceptance #1). Shipped: **P13** in
`layer-cake-principles.md` (code only guards; applications are data) + the durable
**`docs/foundations/06-code-placement-audit.md`** (every extension point dispositioned; now the
standing gate CLAUDE.md names); **manifest-driven publish** (descriptor set + vocab gaps from
`defs/index.jsonld`, checks driven by each descriptor's own PROF roles, path-aware loader, generic
token→descriptor bind, `--check` mode; one plan gap caught+fixed by the implementer:
`descriptorToProfile` needed optional `documentLoader` threading); **plural `discoverBinding`**
(B6, `string[]`, `[undefined]`-guarded); smalls (B3 neutral plane-mapping wording republished,
B8 selector deleted, B9 links.mjs de-vocabularied — the wiki edge choice moved to the proxy
caller). **THE ZERO-CODE GATE PASSED:** `dcat-catalog` (isProfileOf substrate-floor, DCAT/DCTERMS
reuse-first, Turtle shapes w/ teaching messages) onboarded **as pure data through agentic requests
only** — 3 artifact PUTs + TWO `write_acl` calls (the bound container needs its own public-read for
unauthenticated profile discovery — the Plan-2 OPS finding re-confirmed, fixed agentically) +
`.meta` bind; the recipe IS the gate's beforeAll and is documented in foundations/06. **`make
test-dcat` 5/5** (teaching 400 / admit+advisory / handoff edges / live profile walk / type search),
publish idempotent over it (4-profile checks, both binds), **full sweep 46/46 live gates
zero-regression**. **Probe #3 (unprimed) PASSED decisively:** both families discovered and walked by
the same recipe; the agent reconstructed the design intent cold ("dcat-catalog skips okf-base — it
is not markdown"), mapped the llm-wiki shape stack to the SPARQL rule level, and read the published
`knownVocabGaps` as pod self-honesty. **Probe-#3 new findings (recorded):** (a) **fork-queue,
spec-weight: the anonymous container LISTING is not WAC-filtered** — `/alice/` advertises members
that then 401 (existence leak; LWS's Policy pillar wants members-you-may-access; the /types/* walk
already filters — the listing doesn't); (b) probe/scratch clutter in `/alice/` pollutes the
cold-agent view (seed hygiene — clean or fence the probe artifacts); (c) `.lwstypes`/`.meta`
sidecars served as opaque `application/octet-stream` (mediaType affordance nit, fork-queue); (d)
root linkset-promise wording re-confirmed (already fork-queued); (e) no governance edges on
intermediate containers (leaf-binding is the design — steering could say so). Review minors
carried to L4b/final-triage: defs.test.mjs hardcodes per-family file lists (B4-adjacent — should
enumerate from the manifest); stale `KNOWN_VOCAB_GAPS` comment in checks.test.mjs:11; double
`jsonldToQuads` per descriptor (perf nit); gate-3 member-`type` assertion.

**▶ L4b PHASE A — GENERIC GRAPH SEMANTICS — DONE + probe #4 PASSED (2026-07-06).** The L4b design
split into one spec (`docs/superpowers/specs/2026-07-06-l4b-graph-semantics-design.md`), two phases;
**Phase A** = the application-neutral graph layer (plan
`docs/superpowers/plans/2026-07-06-l4b-graph-phase-a.md`, subagent-driven, per-task spec+quality
reviews). **FORK UNTOUCHED — Phase A is fork-empty** (source-verified: store+read-back of named-graph
JSON-LD is byte-faithful on the `application/ld+json` path — opaque-byte storage + `JSON.parse`→
`JSON.stringify` conneg; L3 admission is graph-blind — silently admits multi-`@graph` — but that only
bites *governed* named-graph writes = a Phase-B decision, fix pre-located at `src/rdf/turtle.js`
`jsonLdToQuads` / `src/lws/admission-rdf.js` `toDataset`).

**Shipped, lws-pod `main` (commits `aa60026..07ce103`):** the outbound writer the tree lacked —
`projection/okf/jsonld-graph.mjs` (`quadsToNamedGraph`/`quadsToDataset`, graph name supplied **in-band**
by the caller, quad graph-components ignored); the **`lwspr:derived-view` PROF role** + one loader
dispatch branch (`profile-loader.mjs` → `acc.derivedViews`, artifact fetched, auto-surfaces via
`...acc`); the neutral **derived-view materializer** `projection/okf/derived-view.mjs`
(`materializeDerivedView` — reads a container's members as JSON-LD, aggregates, PUTs a named-graph view;
**union** = flattened, named by the view URL; **dataset** = per-member named graphs); the **`ex-graph`**
neutral data-only family (`profiles/defs/ex-graph/`, `isProfileOf substrate-floor`, declares the view);
the live gate `tests/lws-graph.test.mjs` + **`make test-graph`**; and the `iri-minting.md` Plane-1
graph-semantics section (graph name = doc `@id` ≠ storage path; subject = `#it`; JSON-LD 1.1 only on the
agent path; container = dataset; read-side plane-mapping minimum). **Live-verified: `make test-graph`
6/6 (real, not skipped)** + full sweep zero-regression (profiles 6/6, dcat 5/5, l3 2/2, lws 6/6,
typeindex 7/7, indexed-relation 4/4, mcp-v2 16/16).

**Probe #4 (cold, unprimed, anonymous) — PASSED decisively.** A fresh agent (pod URL + CA only, told to
ignore all project context, HTTP-only) reconstructed the whole model: the **three-way identity split**
(storage URL vs document/graph `@id = authority.example/kb/a` — "the pod is custody, not naming
authority" — vs the thing `…/a#it`); **union vs dataset** read straight from the byte structure
(`view.jsonld` one `@graph` sources-indistinguishable; `view-ds.jsonld` nested `@graph`-of-`@graph`s,
named graphs preserved); and the governance trail (storage-desc → linkset → concluded `ex-graph` is
**schema-free by design**, understood PROF/`isProfileOf`/the `#it` floor convention). **The generic
graph layer is cold-agent-reconstructable — the Phase-A invariant.**

**Probe #4 findings (recorded):** (a) **FORK-QUEUE, spec-weight — Turtle conneg silently drops
custom-context JSON-LD triples**: `GET …/a.jsonld` with `Accept: text/turtle` → 200 + empty
`@prefix` preamble, **no triples, no error** (`jsonLdToQuads` skips `@`-keys — confirms the fork survey;
Turtle = unnamed-union only). Silent triple-loss is misleading; a Turtle-only cold client would read the
container as empty. Harden: correct serialization OR error. `Accept: application/n-quads` ignored (raw
JSON-LD returned). (b) **FORK-QUEUE — storage-desc hint over-promises**: it says governance edges live on
the container linkset, but an *ungoverned* container correctly has none → the agent hit a documented-path
dead end (ties to the existing "every resource" hint-wording fork item). (c) **Phase-B — ungoverned data
has no asserted profile link**: the agent matched `ex-graph` by dir-name+content, not a `conformsTo` edge
(`ex-graph` isn't in `profiles/index.jsonld`; `/alice/graphs/` is unbound). A *governed* container (Phase
B) asserts it via `.meta conformsTo`. (d) **Design signpost** — two identity conventions coexist
unexplained: members use portable `authority.example/kb` IRIs (in-band), derived views use their own pod
URL (pod-materialized aggregate). Intentional but unsignposted → Phase-B steering/design-note. (e) Minor:
container `stat:size` (raw 260) ≠ served `Content-Length` (350, pretty-printed) — could read as tampering.
(f) **SEED/OPS re-confirmed** — `/alice/graphs/` (ungoverned, gate writes authenticated) needed a
public-read ACL grant before the cold probe could read it (the L4a OPS finding again; the gate itself
reads authenticated — only cold discovery needs public-read). **Task-review roll-up minors (for Phase B):**
the materializer skips only its OWN target, not sibling derived views (`view.jsonld` leaks into
`view-ds`) → **Phase-B RESERVED-as-data** (skip-set from all declared views); `mode` typo falls through to
`union` silently; the dispatch-table header comment omits `derived-view`; `skipIf` style drift vs
`lws-dcat`. (Full task-by-task record: `.superpowers/sdd/progress.md`, round "L4b Phase A".)

**▶▶ ~~NEXT: L4b PHASE B~~ — SUPERSEDED (2026-07-07): the read-side scope moved to the conneg-by-profile
spec (see the CONNEG PHASE 1 block at top; Phase 2 there = instantiation + the wiki re-derivation); the
admission-inside-`@graph` fork decision is CLOSED by the toDataset parser swap.** Original scope kept
for reference (spec §6 + carried):
engine demotion executed (split `projection/` → neutral PROF mechanism, e.g. `projection/prof/`, vs wiki
projector as app-#1 tooling, e.g. `apps/wiki-projector/`; naming decided then), the RED+fenced
wiki-memory suite re-derived (not patched — project cards to JSON-LD **named graphs** per Phase A, declare
the wiki channels as **`lwspr:derived-view` data** — the vocabulary now EXISTS), B7 identity-config
vocabulary, read-side semantics (spec §5 leanings: keep the `up`-walk contract + optional
earned-at-admission member conformsTo; container conformsTo beats pod-wide defaultProfile; plural-binding
= AND-compose validation, most-specific for context), constrained-container retirement decision,
membership steering wording, `base-shape.ttl` universality comment. **Phase-A carryovers into Phase B:**
RESERVED-as-data (materializer skip-set from ALL declared views, not just its own target); the
**admission-inside-`@graph`** fork decision (governed named-graph writes silently pass today — fix
pre-located); the two-identity-convention signpost. **Probe #5** (over the re-derived wiki family) closes
Phase B. Fork-queue (first fork round after): **Turtle/n-quads conneg on custom-context JSON-LD (probe-#4,
spec-weight)**, container-listing WAC-filtering (probe-#3 finding a — spec-weight), sidecar mediaTypes,
hint "every resource"/ungoverned wording, MCP gateway advertisement in the storage description,
GET-405 Content-Type, admission fixture diversity, npm-test `--test-force-exit`.

**▶ PLAN 2 / PROFILE MECHANISM — DONE + MERGED (2026-07-04).** *(The "MCP correction then L4 NEXT"
pointer this block used to carry is superseded by the block above.)* Spec
`docs/superpowers/specs/2026-07-04-profile-mechanism-design.md` (governed by
`docs/design-notes/layer-cake-principles.md`), plan `docs/superpowers/plans/2026-07-04-profile-mechanism.md`.
Built subagent-driven (per-task spec+quality reviews, fix rounds, re-reviews).

**Shipped, lws-pod (`main`, commits `1699ecf..94f69d3`):** the mechanism in `projection/okf/` —
`rdf.mjs` (jsonldToQuads + documentLoader threading, global-fetch default), `resolve.mjs`
(resolveStorageAuthority — authority from the REAL storage description; readProfileIndex w/
relative-entry resolution), `profile-doc.mjs` (graph-level PROF read), `profile-loader.mjs`
(isProfileOf walk, role dispatch, opaque non-PROF/non-resolvable parents incl. the RO-Crate stub
proof, discoverBinding), `engine-profile.mjs` (Loaded→engine bridge; mint base = resolved authority +
pathPrefix; runtime `@vocab={authority}proto#` layer); `card.mjs` P6 mint-to-proto (returns
`{quads, protoTerms}` — unknown keys mint, never silently drop; bare `type:` resolves via profile
context — the `asTypeCurie` `skos:` hardcode is DEAD, Plan-1 #4 fixed; `urn:`/`did:` edge targets
pass through, Plan-1 #2 fixed). `urn:okf:base/` is GONE from running paths (legacy test-fixture
export only).

**Profile definitions** `projection/profiles/defs/`: lwsp vocab (minted roles w/ operation contracts:
context→parser, identity-policy→minter-config, plane-mapping→projection-config), substrate-floor /
okf-base / llm-wiki adoption descriptor (PROF compact JSON-LD, `prof:hasToken`, multi-parent
conformance), pinned upstream mirrors (**pin 2026-07-04/`c91b7a1`**, verified byte-identical),
descriptor shape, profiles-compact context, index.jsonld. **Publish + declaration checks**
`projection/publish/`: checks fail loud pre-write (descriptor shape + SHACL-SHACL + context lint +
CURIE-expanding local-ns-scoped vocabulary completeness); `make publish-profiles` PUTs + binds (.meta
read-merge-write: dct:conformsTo index + powder:describedby enforcement cache).

**Fork rung (`la3d/lws` @ `fbd4bfd`, pushed):** linkset surfaces declared `dct:conformsTo` (FULL URI,
RFC 8288 extension relation; omitted when undeclared; `constraint.js`'s `metaTargets` generalized,
`describedbyTargets` delegates) + `ProfileIndexService` storage-description advertisement
(`--lws-profile-index <path>` / `JSS_LWS_PROFILE_INDEX`, default off, HTTP+MCP surfaces share the one
builder + a parity test).

**Live-verified** (pod repinned `fbd4bfd`, image `fork-profiles`): `make test-profiles` **5/5** + full
sweep `test-lws` 6/6, `test-l3` 2/2, `test-typeindex` 7/7, `test-indexed-relation` 4/4, `test-mcp-v2`
9/9 — zero regression. okf+publish unit suites **82 tests green**; **wiki-memory suite still RED by
design + fenced** (`okf/red-fence.test.mjs` asserts the `TODO(plan-2)` breadcrumb survives until L4).

**Recorded deviations:** proto-Warning ships as a projection advisory (`protoTerms`), not the
okf-base shape rule (shacl-engine SPARQL-constraint support unverified — revisit at L4).
Acceptance-#5's strict arm is blocked by a fork bug (next item); the gate now pins the failure
signature so a regression stays distinguishable from real SHACL rejection. **Residual (final-review
flag):** the gate's 2xx arm proves container *wiring* only — a silent-accept of a shape-TARGETED
node would also land there; profile-sourced SHACL rejection is wired + negatively pinned but NOT yet
demonstrated end-to-end. Closes with the ld+json-500 fork round, which should precede L4's reliance
on that path.

**Findings (this round):** (1) **FORK BUG:** L3 admission **500s** on `application/ld+json` bodies in
describedby-bound containers (`"Expected entity but got {"` — the body hits a Turtle parse path) —
SHACL never runs for JSON-LD writes there; needs a small fork round. (2) **OPS:** JSS default
owner-only ACLs mean `/alice/profiles/**` + bound containers need **public-read ACLs before binding**
for unauthenticated profile resolution (reproducible sequence in `.superpowers/sdd/task-10-report.md`);
`publish.mjs` should learn ACL provisioning. (3) **FLAG UPSTREAM (llm-wiki-colab):** `mentions` is
declared in `context.jsonld` but undefined in `ontology.ttl` @ pin `c91b7a1` — caught by the
vocabulary gate, carried as `KNOWN_VOCAB_GAPS` in `publish.mjs` *(since L4a: the gap list is
manifest DATA — `defs/index.jsonld` `knownVocabGaps`; the export is gone)* (the mirror is NOT
patched — verbatim discipline held). (4) Fork `test/mcp-lws-read.test.js` has a pre-existing open-handle hang (node
v26.4.0) — suites run with `--test-force-exit`.

**▶ Cold-agent probe over the profile mechanism — PASSED (2026-07-04).** A fresh agent (zero project
context; given only the pod URL + CA cert, read-only, no mention of LWS/Solid/profiles) reconstructed
the whole stack from HTTP affordances alone: protocol identification from root headers; storage
description → `ProfileIndexService` → the full PROF chain (floor ← okf-base ← llm-wiki, `isProfileOf`
walked, role operation-contracts understood — quoted "never a source of meaning" back); `/alice/concepts/`
governance via `.meta` → `dct:conformsTo` + `powder:describedby` → shapes; and derived the actual write
rules (title = the sole Violation-level gate; typed edges advisory; identity `pathPrefix/#it` with
"never carries an authority literal" noted; terms via the profile context). **Friction found (maps to
recorded carryovers):** (a) it expected `ldp:constrainedBy` on the container Link header (Solid §5.6) —
the L3 co-emission carryover validated by a real cold agent; (b) it SAW the `rel="linkset"` affordance
but never negotiated it — found `.meta` by listing the container instead; the conformsTo-in-linkset
surface works (gate-proven) but isn't *salient* to a cold agent — steering/promote-the-behavior input
for the MCP-correction round; (c) NEW minor: `GET /mcp` 404s with an `Allow` header that omits `POST` —
a small misleading affordance on the MCP endpoint, fold into the MCP correction.
**Priming ablation (same day, Chuck's hypothesis CONFIRMED):** re-ran the probe with ONE added
sentence naming RFC 9264 → the agent negotiated `application/linkset+json` on the container and read
`describedby` + `conformsTo` straight from the linkset ("no prior knowledge of a `.meta` convention
was needed"); the unprimed agent had seen the same `rel="linkset"` everywhere and never dereferenced
it. **Affordance salience is prior-dependent — RFC 9264-as-storage-metadata is LWS-new and outside
model priors (Solid's `ldp:constrainedBy` is IN them).** Consequences: the `linked-web-memory`
operating skill's read path must open with "this substrate speaks RFC 9264 — negotiate the linkset
first"; the HTTP surface should name it (storage description / root), not just MCP `pod-info`. NEW
defect w/ evidence: the pod root advertises `rel="linkset"` but index-shadowing ignores Accept
(known JSS baseline, now shown to actively mislead) — candidate fork fix: suppress the rel where
conneg won't honor it. This A/B = the first knowledge-priming ablation for the agent-eval battery
(add a priming axis to the planned ablations).

**Deferred carryover (recorded, none block):** conformsTo as a second indexed relation +
fork-native conformsTo admission (post-L4); w3id registration (public rung); edge-target cross-card
`id:` resolution, trigger runtime adoption of `loadProfile`, typing-channel materialization rule,
`profile-select.mjs` legacy-baseProfile retirement *(DONE in L4a — deleted)* (all L4);
plane-mapping parsed-not-consumed; authorized-resources conformsTo parity; minor debt:
@vocab-in-prefixes smell (`namespaces.mjs`), defsLoader flat-basename resolution *(DONE in L4a —
`makeDefsLoader` path-aware)*, `checkContext` array-form `@context`, origin+path concat lint,
`KNOWN_VOCAB_GAPS` lib extraction *(SUPERSEDED in L4a — the gap list is manifest data)*.

**▶▶ NEXT SESSION (2026-07-04 decision, superseded — Plan 2 AND the MCP correction are now DONE; see
the 2026-07-06 block at top).** Next up: the deferred **MCP
affordance-spec correction** (the model-driven read/nav fix, the POST-AFFORDANCE block below), *then*
**L4** (OKF projection rewritten to LWS shapes — the wiki-memory suite fenced RED above). The three base
reference groundings this needed are **DONE**: `.claude/skills/{json-ld, profiles,
mcp-protocol}` (all pass `check-skill-grounding.sh`). Plan-2 grounding is ready (`profiles`/PROF +
`json-ld` + `lws-protocol`). **The 2026-07-04 layering walk is DONE — the Plan 2 spec operated
inside `docs/design-notes/layer-cake-principles.md`** (guiding principles + established facts + the open
questions D1–D7; note the `role:context` correction recorded there and in the Plan-2 block above).

**Decision (design of record):** `docs/superpowers/specs/2026-06-29-lws-storage-layer-design.md`,
the **"Substrate — RESOLVED"** block. We **fork production JSS 0.0.210 and add the LWS storage layer
in-process** (not a fronting proxy, not lwsd/tudor). Why: LWS-CID auth already ships in 0.0.210; the
LWS edits are small/localized/additive to clean pure functions (`src/ldp/container.js`,
`src/rdf/conneg.js`); JSS is Fastify + JSON-LD-native; S3 = swap the `src/storage/filesystem.js`
interface. §4–§9 of that spec are the reasoning/evidence trail; the RESOLVED block is the call.

**The fork:** `LA3D/JavaScriptSolidServer`, branch **`la3d/main`** = pristine pin of upstream gitHead
`0f4287f` (0.0.210); default branch set to `la3d/main`; `upstream` remote wired; local checkout
`~/dev/git/LA3D/JavaScriptSolidServer`. Upstream is **trunkless** (default `gh-pages`, 86 branches,
tags stop at v0.0.46, releases are unbranched commits) — track by rebasing `la3d/main` onto each
release's npm `gitHead`. Our work rides `la3d/*` branches (clear of his `feature/*`/`issue-*`).

**Layering (separable, spec-first):** L1 container `items[]` + conneg → L2 linkset + storage
description → L3 **LWS-native per-resource SHACL admission** (a `.meta` `describedby→<shape>`,
validated in-process on write — **not** the old `constrained-container/` proxy; see the L3 block below)
→ L4 OKF projection **rewritten to LWS shapes** (not the anchor — it gets re-derived to match the spec).

**▶ L1 DONE + MERGED (2026-06-30).** L1 (`docs/superpowers/plans/2026-06-29-lws-L1-container-conneg.md`):
branch `la3d/lws-container`, 8 commits, full suite **993/993 green**, opus-reviewed. Delivers a
spec-conformant `application/lws+json` `items[]` container via conneg, gated by `--lws`, `rel="up"` +
standard headers — purely additive (default LDP path provably unchanged). SDD ledger:
`~/dev/git/LA3D/JavaScriptSolidServer/.superpowers/sdd/progress.md`.

**Merge model RESOLVED (2026-06-30).** Created integration branch **`la3d/lws`** off the pristine
`la3d/main` pin; re-pointed PR #1 to base `la3d/lws` and **merged it** (merge commit `d8166f2`). So
`la3d/lws` = `la3d/main` (`0f4287f` / 0.0.210) + L1, and `la3d/main` stays a **pristine upstream pin**
(untouched, for rebasing onto future JSS releases). The L1–L4 stack rides `la3d/lws`; each layer
**`git merge --no-ff` directly into it** — no GitHub PRs (solo dev; see the merge-model note below).

**▶ L2 DONE + MERGED — L3 IS NEXT.** L2
(`docs/superpowers/plans/2026-06-30-lws-L2-storage-discovery.md`) is **merged into `la3d/lws`** (merge
commit **`281de43`**, was branch `la3d/lws-discovery`), full suite **1031/1031 green**. Delivers the two storage-side LWS *MUSTs*, all `--lws`-gated + additive (default LDP path
provably unchanged via negative controls): the **Storage Description** (`type:"Storage"`, `service[]`)
at `/.well-known/lws-storage` + `Link: rel="…lws#storageDescription"` on all GET/HEAD; **read-only**
per-resource RFC 9264 linkset (`application/linkset+json`, `anchor`/`up`/`type`/`describedby`) via
conneg + `Link: rel="linkset"`; HEAD content-type parity. Built subagent-driven (per-task spec+quality
reviews + opus whole-branch review; one Important TLS-proxy scheme split — `options.ssl` vs
`request.protocol` — found + fixed `8927ada` with an `X-Forwarded-Proto` regression test). SDD ledger:
`~/dev/git/LA3D/JavaScriptSolidServer/.superpowers/sdd/progress.md`.

**▶ Container-validated (2026-06-30).** L2 was additionally run in a **real Docker pod** (not just the
fork's Node suite). The committed `Dockerfile`/compose install the **published npm package** (0.0.209,
no `--lws`), so the fork is built via **`Dockerfile.fork`** (from a pinned git ref — see "Fork-build
wiring" below — adds `--lws`) → an http pod. **Live-verified** (curl, via the `tests/helpers.mjs`
headless-bearer flow), and now captured as a repeatable gate (**`make test-lws`**, see below): storage description at
`/.well-known/lws-storage` (`type:Storage` + `StorageDescription`/`NotificationService` services);
`rel=…#storageDescription` + `rel=linkset` Link headers on GET **and** HEAD; per-resource linkset via
conneg on a file (`DataResource`) and a container (`Container`); L1 `lws+json` `items[]`; all `id`/
`describedby`/`serviceEndpoint` consistent at the request scheme. **Finding (not our bug):** a container
that has an `index.html` (e.g. the pod root) serves `text/html` for **every** `Accept` (turtle, ld+json,
lws+json, linkset alike) — baseline JSS index-shadowing, identical for all conneg types; plain
containers/files negotiate correctly. **Caveat on the scheme fix:** the local mkcert TLS pod
(`docker-compose.tls.yml`) terminates TLS **inside JSS** (`--ssl-key/--ssl-cert`), so `options.ssl` and
`request.protocol` agree (both `https`) and it does **not** reproduce the proxy-scheme bug — that needs a
TLS-terminating **proxy** in front of an http JSS (`X-Forwarded-Proto` + `trustProxy`), i.e. the public
Caddy rung. The fix is unit-proven on that exact `trustProxy` code path.

**▶ Scheme fix PROVEN end-to-end (2026-06-30).** Stood up the Caddy TLS-proxy rig that the in-JSS-TLS
pod cannot: **`docker-compose.fork-tls.yml`** (`make up-fork-tls`) = the http fork pod (`--lws`,
`trustProxy`) + **Caddy** terminating TLS with the mkcert cert (`caddy/Caddyfile`), publishing
`https://pod.vardeman.me/`. Caddy sets `X-Forwarded-Proto: https`; the pod itself runs **plain http**.
Result: `GET https://pod.vardeman.me/.well-known/lws-storage` returns `id` + every `serviceEndpoint` as
**`https://pod.vardeman.me/...`**, and a resource's `rel=storageDescription`/`rel=linkset` Link headers
are likewise `https` — exactly the case where the *old* `options.ssl?'https':'http'` code would have
emitted `http://`. The fix is now proven in the real proxy topology, i.e. a rehearsal of the public
CRC-VM/Caddy rung. (Compose has its own project name `lws-pod-forktls` so it never touches
`lws-pod-local`; `down -v` cleans up. `certs/` stays gitignored.)

**Fork-build wiring DECIDED: git ref.** `Dockerfile.fork` installs the fork from a **pinned git ref**
(`npm install -g git+https://…#<SHA>`, default = L2 HEAD `8927ada`; the repo is public, so the build
needs no auth) — reproducible from git alone, override `JSS_GIT_REF` for another branch/SHA. This is the
mechanism L3/L4 in-container testing rides. The committed `Dockerfile`/`docker-compose*.yml` still target
the published npm package (0.0.209) — unchanged on purpose; the fork path is the separate `*.fork*`
files. **Carryover for the public rung:** when the pod first sits behind real Caddy at `*.crc.nd.edu`,
this rig is the local rehearsal; the only remaining checkbox is the LWS-CID SSRF-guard-on confirmation
(open item 1), independent of this scheme proof.

**L2 scope decisions (in the plan):** `/.well-known/lws-configuration` is **deferred to the
auth/Keycloak track** — it is RFC 8414 *authorization-server* metadata and JSS is a resource server with
a direct bearer (no RFC 8693 token-exchange), so emitting it would advertise a capability JSS lacks.
Deferred carryover: linkset **mutation** (If-Match/412/428, standalone `.meta` resource), multi-pod
storage descriptions (L2 is single-storage), `capability`/TypeIndex advertising. Still track open spec
PRs **#183** (storage-desc-as-CID-1.0 — feeds `resolveStorageAuthority`) and **#180** (linkset profile).

**▶ L3 DONE + MERGED (2026-06-30) — Plan 2 / L4 NEXT.** L3
(`docs/superpowers/plans/2026-06-30-lws-L3-shacl-admission.md`; design
`docs/superpowers/specs/2026-06-30-lws-L3-shacl-admission-design.md`) is **merged into `la3d/lws`**
(merge commit **`1772ed8`**, was branch `la3d/lws-admission`), **10 commits, full fork suite 1053/1053
serial** (`node --test --test-concurrency=1`), opus whole-branch review cleared (one Important — a 500
on an unresolvable declared shape — fixed `4cb42ed`). Built subagent-driven (per-task spec+quality
reviews + the opus final review). **Reframed by a spec deep-dive** (Solid §5.6 is *non-normative*; LWS
defines *no* constraint mechanism; Shape Trees + RO-Crate are batch/client-side, not server admission):
L3 is **not** the old `constrained-container/` proxy — it is an **LWS-native, in-process, opt-in**
admission layer that **front-runs `lws-ucs#93` / `solid/specification#86`**.

Delivers (all `--lws`-gated + additive; default LDP path provably unchanged via negative controls): a
resource's **`.meta` declares `describedby → <shape>`** (POWDER IRI `…/powder-s#describedby`); on
PUT/POST the incoming RDF graph is SHACL-validated against the shape; **`sh:severity` drives the
outcome** — `sh:Violation` → **`400` + RFC 9457 `application/problem+json`** (with a `violations[]`
member) + `Link: rel="describedby"`; `sh:Warning`/`sh:Info` → **admit (`200`/`201`) + advisory body**
(no RFC-9111-obsolete `Warning` header); clean → unchanged. Profile-neutral (OKF/RO-Crate are *shapes*,
not engine code). `shacl-engine` pinned to the **1.2 SHA `ce39d07`** behind the sole-importer seam
`src/lws/shacl.js`. Modules: `src/lws/{shacl,admission-rdf,constraint,admission}.js`; wired into
`handlePut` (`src/handlers/resource.js`) + `handlePost` (`src/handlers/container.js`). SDD ledger:
`~/dev/git/LA3D/JavaScriptSolidServer/.superpowers/sdd/progress.md`.

**Round-1 store deviation (deliberate):** the spec frames the constraint as a `describedby` link in the
**linkset**, but the fork's linkset is generated read-only (mutation is a deferred L2 carryover), so L3
**stores/reads the constraint from the target's `.meta`** (JSON-LD on disk, client-writable, already
served). Same `describedby` token, so it surfaces in the linkset unchanged once linkset mutation lands.

**L3 live-pod gate DONE (2026-06-30).** `la3d/lws` (incl. L3, merge `1772ed8`) + `la3d/lws-admission`
are **pushed to GitHub**; `Dockerfile.fork` + `docker-compose.fork-tls.yml` pin the L3 merge SHA. New
gate **`tests/lws-admission.test.mjs`** + **`make test-l3`** (against the fork `--lws` TLS pod at
`https://pod.vardeman.me`): provisions a shape + container `.meta` `describedby` member-rule, asserts a
non-conforming PUT → `400` + `application/problem+json` + `violations[]` + `rel="describedby"`, and a
conforming PUT → `201`. **Verified live: `make test-l3` 2/2, `make test-lws` 6/6 (no L2 regression on
the L3 pod).** (Gotcha re-confirmed: a JSON-LD shape needs an explicit `@id` on its `sh:property` blank
node or JSS's JSON-LD→quads orphans the restriction and everything admits.)

**L3 deferred carryover** (review findings + scope): **M1:** `urlToStoragePath`
(`src/lws/admission.js`) isn't pod-mapped → shape resolution breaks under `--subdomains` (path-mode
deploy `pod.vardeman.me` is fine; the I1 null-guard degrades a missing shape to pass-through, not a
500). **M2:** `POST` with `Link: rel=Container` (container creation) bypasses admission (no body). Plus:
surface the `.meta` `describedby` in the *generated* linkset (Type-Search synergy); `Prefer: set-linkset`
atomic declare+write + PATCH-linkset (depend on deferred L2 linkset mutation); PATCH-body (N3-Patch)
post-state validation; `ldp:constrainedBy` co-emission for Solid interop; shape-result caching; a second
worked profile (RO-Crate base) as a generality proof. Minors (deferred): `shacl.js` `value` accessor /
dead `msg` arm; problem `type` URI non-resolving (RFC-9457-legal); the `400` reject bypasses
`getAllHeaders`/CORS (pre-existing codebase convention on error responses — fix repo-wide).

**▶ L2.5 DONE + MERGED (2026-07-01) — indexed-relation / Plan 2 / L4 NEXT.** The LWS **Search & Type
Index** module (spec `docs/superpowers/specs/2026-07-01-lws-typeindex-search-design.md`, W3C-aligned
revision; plan `docs/superpowers/plans/2026-07-01-lws-typeindex-search.md`) is **merged into `la3d/lws`**
(merge **`dc770ca`**, was branch `la3d/lws-typeindex`; 14 commits + 2 finishing fixes). Full fork suite
**1085/1085**; subagent-driven build (per-task spec+quality reviews + opus whole-branch review — Ready
to merge, one Important fixed). Delivers (all `--lws`-gated + additive; default LDP path unchanged):
**`TypeIndexService`** (`GET /types/index`) + **`TypeSearchService`** (`GET|POST /types/search`, CNF
`type` filter) advertised in the storage description; **system-managed `type` metadata** = intrinsic
class ∪ user-defined types captured from `Link: rel="type"` on write into a **server-managed
`.lwstypes` sidecar** (NOT the client `.meta` — per LWS `metadata.md`, `type` is System-Managed),
surfaced via the resource **linkset** (`type` = intrinsic ∪ declared) and the two services;
**on-demand authz-filtered walk** reusing `checkAccess` (never a parallel authz path — the filter *is*
the GET predicate, so no discovery oracle) with a per-query ACL memo. The two endpoints **bypass the
global WAC preHandler** (like `/mcp`/`/db`) and resolve identity in-handler (fail-closed); the
per-resource `checkAccess`-and-drop loop is the sole, sound authz boundary (opus-verified).

**L2.5 live-pod gate DONE (2026-07-01).** `Dockerfile.fork` + `docker-compose.fork-tls.yml` pin the L2.5
merge SHA (`dc770ca`, image `fork-l2_5`). New gate **`tests/lws-typeindex.test.mjs`** + **`make
test-typeindex`** (against the fork `--lws` TLS pod). **Verified live: `make test-typeindex` 5/5,
`make test-l3` 2/2, `make test-lws` 6/6** (no L2/L3 regression on the L2.5 pod). The live gate caught a
real conformance gap the fork suite missed — `ContainerPage` `items[].type` must present the intrinsic
class **compact** (`"Container"`/`"DataResource"`) per `container-representation.md`, user types as URIs
— fixed `887e15e`.

**L2.5 deferred carryover** (whole-branch review triage — all DEFER, none block): **the general
indexed-relation filter (`describedby` etc.) is the immediate next spec** — the profile-layer seam;
L3 already stores `describedby`, so it's an additive read (must first resolve the `describedby`
overloading: Solid Description-Resource vs. SHACL-shape pointer). Plus: **spec §7/§8 promised a `400`
on an over-limit filter + a page/scan bound — NOT implemented** (`parseTypeFilter`/handlers have no
complexity bound; unauthenticated unbounded full-tree walk is a DoS-amplification surface on large
pods — harden for the public rung); container `items[].type` **enrichment in L1 listings**; **in-memory
derivation cache** + notifications-CDC refresh; **body pagination**; `walkResources` **symlink-cycle
guard** (no visited-set; symlinks are git-push-only); the `.lwstypes` store is LDP-writable by the
owner (same capability as `rel="type"`, note in §4); test-coverage adds (multi-group CNF,
matching-nothing, skip-dir, multi-token `rel`); `parseTypeLinks` rel-token boundary.

**▶ L2.5 HARDENING DONE + MERGED (2026-07-01) — safe for a VPN-fronted CRC container.** Spec
`docs/superpowers/specs/2026-07-01-lws-typeindex-hardening-design.md`, plan
`docs/superpowers/plans/2026-07-01-lws-typeindex-hardening.md`. **Merged into `la3d/lws`** (merge
**`6cd5d9b`**, was branch `la3d/lws-typeindex-harden`; 8 commits). Full fork suite **1102/1102**;
subagent-driven with three focused opus reviews of the rate-limit changes + an opus whole-branch review
(Ready-to-merge). Container repinned (`Dockerfile.fork` + compose → `6cd5d9b`, image `fork-l2_5h`).
**Live-verified: `make test-typeindex` 7/7 (incl. over-limit `400`), `test-l3` 2/2, `test-lws` 6/6.**

Delivers: (1) **CNF complexity cap → `400`** on `/types/search` (`MAX_GROUPS=32`/`VALUES=64`/`TERMS=256`,
dedup-evasion-proof) — closes the searchindex §Request-Equivalence-Errors / design §7 gap; (2)
**`lwsTypeIndex` config gate** (`--no-lws-type-index` unregisters the routes + bypass + service
advertisement; default on); (3) **trust-aware rate limits** on the resource endpoints (writes +
`/types/*`) — **anonymous → strict per-IP `60/min`** (crawler/flood), **authenticated → generous
per-`webId` `600/min`**, tunable via **`--write-rate-limit-max` / `JSS_WRITE_RATE_LIMIT_MAX`** (real
write abuse bounded by WAC + quota; the cap is a runaway-agent backstop); (4) — **security finding,
folded in** — the `@fastify/rate-limit` plugin booted *after* the idp/ap/write routes registered, so
**every route-level limit was globally inert**: the **IdP login brute-force**, signup, and OAuth-token
limits had **never fired**. Fixed (plugin-boot ordering + `fastify.after()` + `errorResponseBuilder`
now throws a real `429`); these pre-auth guards stay IP-limited. Design principle: **limit the
anonymous/pre-auth surface, not authenticated workers** (identity resolved once via a per-request
memo on `getWebIdFromRequestAsync`, so the two-tier limit adds exactly one token-verify on the hot
path and never changes an auth decision — opus-verified fail-safe: no path grants the generous tier
without a *resolved* webId; `trustProxy` keeps the anon per-IP cap from collapsing behind Caddy).

**Hardening deferred (all recorded, none block the VPN deploy):** **pagination + page-size cap** remains
the **internet-facing trigger** — `/types/*` is still an on-demand full-tree walk; a rate-limited
single walk is fine behind a VPN, but an internet-facing pod needs pagination to bound the per-request
scan. Also: an **in-memory derivation cache** (perf); `podCreateRateLimitMax`/`idpRateLimitMax` are
`createServer`-only (not CLI/env-threaded — defaults are the right security guards, low priority); CNF
GET/POST branch DRY; the AP OAuth `max:10` has no test-override knob. **`describedby` indexed-relation
follow-up + Plan 2 / L4 are still the next feature work.**

**▶ INDEXED-RELATION DONE + MERGED (2026-07-01) — Plan 2 / L4 NEXT.** The indexed-relation follow-up
(spec `docs/superpowers/specs/2026-07-01-lws-indexed-relation-design.md`, plan
`docs/superpowers/plans/2026-07-01-lws-indexed-relation.md`) is **merged into `la3d/lws`** (merge
**`21d9999`**, was branch `la3d/lws-indexed-relation`; 4 commits, subagent-driven — per-task spec+quality
reviews + opus whole-branch review: Ready-to-merge, no Critical/Important). Full fork suite **1127/0**.
Generalizes the shipped Type Search from `type`-only to **`type` + a server-chosen set of indexed
relations**, indexing exactly one relation in v1: **`describedby` → SHACL shape**, read additively from
L3's `.meta` store. **One source, two surfaces:** (1) **read** — `generateLinkset` `describedby` now
carries the resource's L3 shape target(s) and is **omitted when unconstrained** (fixes the L1/L2 bug that
put the storage-description URL under `describedby`; storage description stays its own
`rel="…lws#storageDescription"` header); (2) **search** — `/types/search` accepts a `describedby` CNF
filter, AND-composed with `type`, same grammar/global caps. **No-oracle holds end-to-end** (unindexed/
unknown relation key → empty 200, never an error, indistinguishable from a target matching nothing);
**descriptive-only by construction** (`INDEXED_RELATIONS={describedby}`); **authz unchanged** (shape
resolved only *inside* the already-`checkAccess`-filtered walk — opus-verified no discovery oracle).
Modules: `describedbyTargets` (`src/lws/constraint.js`); `parseFilter`/`matchesFilter`/`INDEXED_RELATIONS`
(`src/lws/type-index.js`, `parseTypeFilter` now delegates — DRY); linkset + both GET call sites
(`src/lws/linkset.js`, `src/handlers/resource.js`); search wiring (`src/handlers/type-index.js`).

**Live-pod gate DONE (2026-07-01).** Container repinned (`Dockerfile.fork` + `docker-compose.fork-tls.yml`
→ `21d9999`, image `fork-indexed-rel`). New gate **`tests/lws-indexed-relation.test.mjs`** + **`make
test-indexed-relation`** (fork `--lws` TLS pod at `https://pod.vardeman.me`). **Verified live:
`make test-indexed-relation` 4/4, `test-typeindex` 7/7, `test-l3` 2/2, `test-lws` 6/6** (no L2/L3/L2.5
regression). Reconciled the L2 discovery gate (`tests/lws-discovery.test.mjs`) to the corrected read
surface — an unconstrained file's linkset now **omits** `describedby` (was asserting the old
storage-description target).

**Indexed-relation deferred carryover** (whole-branch review Minors — none block): **`page` reserved on
the GET path only, not the POST body** — reserve it on the body path when body pagination lands, to keep
GET/POST result-set equivalence; add a guard-comment on the now-widened `parseTypeFilter` (iterates all
keys post-delegation — inert, no mixed-key callers today); spec §4.5/plan over-counted a HEAD linkset
call site (HEAD sets no linkset body — nothing to change, no regression). Also still: `describedby`
overloading vs. **`conformsTo`/W3C PROF** is the **Plan 2** profile-authority layer (this layer stays
spec-literal `describedby`); a general relation-*capture* path (arbitrary descriptive `rel` on write) for
relations L3 doesn't already store; container `items[].type` describedby enrichment.

**▶ WORKING MCP DONE + MERGED (2026-07-02) — Plan 2 / L4 NEXT.** Made the pod's MCP a faithful,
governed, discoverable surface over the LWS layer (spec
`docs/superpowers/specs/2026-07-02-working-mcp-design.md`, plan
`docs/superpowers/plans/2026-07-02-working-mcp.md`). **Merged into `la3d/lws`** (merge **`fbafd13`**, was
branch `la3d/mcp-working`; 8 commits = 6 tasks + 2 review fixes; subagent-driven per-task reviews + opus
whole-branch review: READY TO MERGE, no Critical/Important). Delivers (all additive; default LDP /
non-`--lws` paths provably unchanged):
- **Governed write** — MCP `write_resource`/`create_resource` route through a new shared `applyLwsWrite`
  core (SHACL admission → write → type-capture), the SAME path as HTTP PUT/POST, so an MCP write can no
  longer bypass the L3 admission floor (+ a `types` param = the `rel="type"` equivalent). Closes the
  finding that MCP writes hit `storage.write` directly.
- **LWS-aware read tools** — `lws_type_search` / `lws_linkset` / `lws_storage_description`, each reusing
  the HTTP-side function (`collectAuthorizedResources` WAC-filtered walk / `generateLinkset` /
  `buildStorageDescription`) so the **no-oracle** property is inherited, not reimplemented.
- **`/mcp` rate-limited** — trust-aware (anon 60/min per-IP, authed per-webId), matching `/types/*`;
  closes the previously-uncapped MCP surface.
- **Skill reads honor WAC** — `get_skill`/`get_pod_skill`/`list_skills` **and `pod_info`** now WAC-gate;
  closed an unauthenticated arbitrary-file read AND a pod-SKILL metadata oracle. "Public" = a public-read
  ACL, not an auth-layer bypass.
- **Credential-tier seam** — `mcpCredentialPolicy` (default **`trusted-local`** = today's behavior;
  `audience-bound` fails closed, refusing the replayable bearer / anonymous, requiring LWS-CID or
  Solid-OIDC-DPoP). Guard covers single + batch + streaming dispatch (opus-verified).

**Live-pod gate DONE (2026-07-02).** `Dockerfile.fork` + `docker-compose.fork-tls.yml` repinned to
`fbafd13` (image `fork-mcp`). New gate **`tests/mcp.test.mjs`** + **`make test-mcp`** (fork `--lws` TLS pod
at `https://pod.vardeman.me`). **Verified live: `make test-mcp` 8/8, `test-indexed-relation` 4/4,
`test-typeindex` 7/7, `test-l3` 2/2, `test-lws` 6/6** (no L2/L2.5/L3/indexed-relation regression). Security
divergence recorded in `docs/foundations/05-jss-spec-conformance.md` axis 6 (CID `aud`+`exp` enforced;
RS-direct vs AS-mediated profile).

**Working-MCP deferred (recorded, with forcing functions — none block Plan 2):**
- **Comunica/SPARQL "ask the memory" query surface** → after OKF (a cold agent needs published
  vocabulary/`@context` to interpret raw triples). Ties to open items 5–6.
- **Skills over the MCP Resources primitive (SEP-2640)** → align-when-stable (JSS has no Resources
  primitive; the SEP is experimental) — kept as bespoke tools for now.
- **Strict credential default + end-to-end CID-over-MCP accept** → public-IP rung (SSRF guard blocks CID
  doc-fetch on a private IP); the `@public-rung` skipped test (`test/mcp-cid-e2e.test.js`) is the forcing function.
- **A2A Agent Card / federation-as-A2A / RFC 8693 token-exchange** → federation track (`call_remote_pod` is
  the current home-grown stand-in).
- **Whole-branch review Minors (all defer):** an explicit anonymous-reject-under-`audience-bound` unit test
  (fail-closed is correct-by-construction but only implicitly tested); admission-error dedup; policy-validation
  consolidation.

**▶ MCP v2 REDESIGN — DONE + MERGED (2026-07-03) — Plan 2 / L4 NEXT.** Redesigned the pod's MCP into a
faithful **Resource-Gateway** surface (spec `docs/superpowers/specs/2026-07-02-mcp-v2-agent-surface-design.md`,
plan `docs/superpowers/plans/2026-07-03-mcp-v2-agent-surface.md`). **Merged into `la3d/lws`** (merge
**`0c1dd8b`**, was branch `la3d/mcp-v2`; 8 task commits + 1 final-review fix; subagent-driven — per-task
spec+quality reviews + opus whole-branch review: Ready-with-fixes, the one Important fixed). Fork docs
follow-up `4401ff8`. Delivers (all additive; default LDP / non-`--lws` paths provably unchanged):
- **Reads → MCP Resources** under an `lws://` URI scheme (`resources/list|templates/list|read`): templated
  `resource`/`container`/`linkset`/`meta`/`acl`/`skill` + fixed `storage-description`/`pod-info`/`skills`.
  New module `src/mcp/{uri,resources,errors,sanitize,wac}.js`; `initialize` advertises `resources`.
- **Hard break** — the 12 flat read/docs tools removed; capability re-appears as Resources. Tool registry
  is now **exactly 9**: 7 core (`write_resource`,`create_resource`,`delete_resource`,`write_acl`,
  `lws_type_search`,`subscribe`,`call_remote_pod`) + 2 convenience (`put_typed_resource`,`describe_resource`)
  — under the ~10–15 selection-accuracy budget (arXiv 2606.30317).
- **L3 teaching channel restored over MCP** — admission rejects now carry the SHACL `sh:message`/
  violations/shape URI in the `content[]` text the model reads (was dropped into an unrendered `data` field).
- **Content sanitization** — externally-sourced bodies/skills/child-names/ACL-agents are stripped of
  hidden/bidi chars (incl. Trojan-Source isolates) and free-text bodies are wrapped in a **nonce-fenced**
  envelope (unspoofable) — closes the cross-agent "Unsanitized Resource Content" injection on a shared pod.
- **Governance carried forward unchanged** (opus-verified): writes route through `applyLwsWrite`; discovery
  reuses `collectAuthorizedResources` (no-oracle — every resolver WAC-checks before `storage.exists`);
  `mcpCredentialPolicy` + `/mcp` rate-limit untouched (`src/server.js` diff = one comment word).

**Live-pod gate DONE (2026-07-03).** `Dockerfile.fork` + `docker-compose.fork-tls.yml` repinned to `0c1dd8b`
(image `fork-mcp-v2`). New gate **`tests/mcp-v2.test.mjs`** + **`make test-mcp-v2`** (replaces the v1
`tests/mcp.test.mjs` + `make test-mcp`). **Verified live: `make test-mcp-v2` 5/5, `test-l3` 2/2,
`test-typeindex` 7/7, `test-indexed-relation` 4/4, `test-lws` 6/6** (no L2/L2.5/L3/indexed-relation regression).

**MCP v2 deferred carryover** (all recorded, none block Plan 2): `resources/list` **child enumeration**
behind a page-bound (v1 = fixed + templates only); `put_typed_resource` **`.meta` clobber + persist-on-reject**
(overwrites existing `.meta` and leaves the `describedby` if admission then rejects — read-merge / write-after-success);
`lws://resource` **200 KB truncation** drops the old `truncated` signal (agent can't tell a body is partial);
`lws://acl` shape asymmetry (`agentClasses` full-URI vs `modes` compact); `admissionError` `String(value)` guard;
`sanitizeField(e.name)` double-call (DRY); **SEP-2640** align-when-stable (skills are `lws://skill` resources, not the Resources *primitive* per the experimental SEP); strict credential default + CID-over-MCP at the public rung.
This was the MCP *interface* track — **Plan 2 / L4 (the memory track) is now the next feature work.**

**▶ MCP v2 REVIEW FIXES — DONE + MERGED (2026-07-03).** A high-effort code review of the v2 surface
(9 finder angles + adversarial verify) surfaced 12 findings; **all 12 fixed, TDD, merged into `la3d/lws`**
(merge **`7e9c2c1`**, was branch `la3d/mcp-v2-review-fixes`; 4 commits). Fork changes are covered by
`test/mcp-v2-review-fixes.test.js` (14 unit/live-pod cases); mcp/lws/wac/acl/storage/container/handler
suites green per-file (273 + 101). **Correctness/security:** #1 `put_typed_resource` now declares the
`describedby` shape **transactionally** (snapshot → merge → roll back on reject) — no `.meta` clobber /
dangling shape / persist-on-reject; #2 client-controlled `types`/`describedby` are **sanitized** into
linkset/describe responses + the MCP `types` path is URI-validated (`captureDeclaredTypes` choke point);
#3 `readAcl` resolves `<dir>/.acl` for a **slashless container** path (was showing an empty ACL for a
governed container); #4 a **malformed `%`** in an `lws://` path → invalid-params, not a raw `URIError`
→ `-32603`; #5/#6 new `src/mcp/read.js#readBounded` = one **byte-range bounded read** (no full load of a
huge object) + an explicit **truncation marker** on both `lws://resource` and `describe_resource`; #7
`call_remote_pod` **deep-sanitizes** the federated `remote_result` (the God-Tool proxy shape kept — the
gate/depth-cap/sanitize is the governance, noted in-code); #8 a genuine skill **read error** is no longer
masked as not-found; #9 `ResourceError` carries the same **`isError`+`content[]`** teaching shape as a
tool error. **Maintainability:** #11 a **single surface registry** (`src/mcp/surface.js`) — parse set +
dispatch + advertisement derive from one table (guard test); #12 reuse (`getContentType`,
`getParentContainer`, `toolText` envelope); #10 **restored the live-gate coverage** the v2 gate dropped
(anon no-oracle *enumeration*, `lws://skill` WAC, `/mcp` rate-limit burst). **Live-verified** on the fork
TLS pod repinned to `7e9c2c1` (image `fork-mcp-v2-fixes`): **`make test-mcp-v2` 9/9** (was 5/5),
**`test-l3` 2/2, `test-typeindex` 7/7, `test-indexed-relation` 4/4, `test-lws` 6/6** (no regression).
This clears the review carryover above except the two design-level items reserved for later: `lws://` as a
parallel namespace vs. real `https://` resource URIs (undermines LWS self-describing discovery — the
highest-leverage redesign), and `resources/list` child enumeration behind a page-bound.

**▶ MCP AFFORDANCE SURFACE — DONE + MERGED (2026-07-03).** Resolved the first (and larger) of those two
reserved items. Design of record `docs/superpowers/specs/2026-07-03-mcp-affordance-surface-design.md`;
plan `docs/superpowers/plans/2026-07-03-mcp-affordance-surface.md`. **Merged into `la3d/lws`** (merge
**`343f0bc`** + a live-gate follow-up **`161bb99`**; branch `la3d/mcp-affordance`, 6 task commits + fix
pass + docs; subagent-driven — per-task spec+quality reviews + fable whole-branch review: Ready to merge).
Reframed through the LWS spec + Verborgh's 2013 (affordances / "APIs they're not programmed for") and 2024
(PIQ triad, pods-as-graph) vision; invariant = the **cold-agent affordance test**. Delivers:
- **Retire `lws://`** — MCP Resources are the pod's **real `https://` URLs**, dispatched on the resource
  itself (container→`lws+json`, `<X>.acl`→Control-gated view, `<X>.meta`→view, else body). The `lws://`
  scheme (and `parseUri`/registry) fully excised; 8 `lws://` test files migrated with **every**
  WAC/no-oracle/Control/skill assertion preserved (reviewer-verified).
- **JSON-LD preserved** — the pod's own RDF/JSON-LD is returned structured with `@context` intact
  (leaf-sanitized via `sanitizeJsonLeaves`); only untrusted free-text is enveloped. Content-sniff keeps
  extensionless JSON-LD (agent cards) from being enveloped (`161bb99`, found by the live gate).
- **Core JSON-LD `@context` made resolvable** — `www.w3.org/ns/lws/v1` **404s**; `src/lws/context.js`
  serves + inlines the normative LWS context (`withInlineContext`) and serves it + the vocab as fixed
  resources (`/.well-known/lws/context|vocab`). DID/VC/security contexts already resolve — `lws/v1` was
  the single hole. (Profile/domain vocab publishing deferred to Plan 2 — deliberately, to observe cold
  agentic behavior on core JSON-LD first.)
- **Affordance-driven federation** — `call_remote_pod`'s `{tool,arguments}` God-Tool replaced by a thin
  `read_remote_resource({url})` (WAC federation gate + depth cap carried verbatim, `sanitizeDeep` on the
  remote body). Reads public remote resources; authenticated remote read deferred to the trust track.
- **Promote-the-behavior** — `pod-info` advertises the storage root + storage description + context/vocab
  locations + a steering `hint`; tool/resource descriptions steer toward following typed links + `@context`.

**Live-verified** on the fork TLS pod repinned to `161bb99` (image `fork-affordance`): **`make test-mcp-v2`
9/9** (real-URI read → JSON-LD w/ resolvable `@context`; no-oracle read + enumeration; teaching content;
`describe_resource` linkset carrier; federation gate; rate-limit), **`test-l3` 2/2, `test-typeindex` 7/7,
`test-indexed-relation` 4/4, `test-lws` 6/6** (no L2/L2.5/L3/indexed-relation regression). Deferred
follow-ups (all recorded, none block): HTTP-layer `@context` inlining (MCP-layer shipped; §6 staged);
`read_remote_resource` authenticated reads (trust track); non-JSON RDF (Turtle) raw passthrough;
storage-description naming the vocab locations (spec §7); `resources/list` child enumeration (page-bound).

**▶ POST-AFFORDANCE — harness + Resources-vs-Tools finding + grounding pass (2026-07-04).** After the
affordance surface merged, we tested it *with an agent* and grounded the gaps that surfaced:

- **Cold-agent harness — DONE.** `experiments/agent-eval/` (`make test-agent-eval[-dry]`): a real Claude
  tool-use loop over the pod's MCP surface, cold (root URL only), scoring read/navigate/write-recover/
  federate/injection/resolve-term. **Dry smoke passes live** (handshake + read surface + no-oracle); the
  full battery needs `ANTHROPIC_API_KEY`. This is the **R&D pipeline** for the eventual operating skills
  (working trajectories → documented procedures). Next for it: the **ablation** (affordances on vs
  `@context`-404 vs no steering hint) — needs pod variants.
- **JSS MCP handshake VERIFIED + Claude Code can use the pod as a tool.** JSS speaks a **stateless** subset
  of MCP Streamable HTTP (2025-03-26; no `Mcp-Session-Id`, JSON not SSE, no `GET`/`DELETE /mcp`). Empirically
  `claude mcp add` → `✔ Connected`, and a headless `claude -p` **called a pod tool end-to-end**. Claude Code
  subagents can use the pod tools (`mcp__<server>__*`, inherited or scoped in agent frontmatter).
- **▶ RESOLVED 2026-07-06 (was: the Resources-vs-Tools consumption finding — the MCP correction
  thread).** Shipped as the model-driven read path — see the block at top. The affordance spec makes autonomous cold-agent navigation THE invariant (§1) but puts the read/
  follow loop in the MCP **Resources** primitive — which the `mcp-protocol` skill now grounds as
  **application-driven** (host-staged), not **model-controlled** (Tools). So a stock client (Claude Code)
  and the API loop don't drive the affordance loop autonomously — the harness had to **bridge** Resources
  into read *tools*. Fix (spec §1/§4/§7/§11): a **model-driven read/nav tool path** (`read(uri)` + a
  discovery entry, ~2–3 tools, under budget) *alongside* Resources (kept for the host/@-mention view). **Do
  this AFTER Plan 2** (see NEXT SESSION at top).
- **Design-note — `docs/design-notes/agent-operating-skills.md`.** Two skill classes: **grounding-reference**
  (verbatim upstream, for *building*) vs **agent-operating** (authored how-to, for *using* — cannot live
  under the grounded contract). The Obsidian vault's skills are the proven prototype; the LWS operating
  skills generalize them onto the substrate. Layer them base (`linked-web-memory`, harness-portable) +
  profile (**pod-served**, SEP-2640). Gate: pod-served skills must be **model-driven-reachable** (same fix
  as above). Operating skills are built **last**, distilled from the harness. SEP-2640 delegates the skill
  *format* to **agentskills.io** (a likely future grounded skill for the operating layer).
- **Grounded-skill pass — DONE (3 new, 11/11 pass).** `json-ld` (data-axis base — JSON-LD 1.1 syntax/api/
  framing RECs + BP), `profiles` (PROF — the profile-authority vocab Plan 2 needs), `mcp-protocol`
  (interface-axis base — MCP 2025-03-26 spec + schema + the experimental SEP-2640 skills-ext, Apache-2.0
  vendored; **arXiv 2606.30317 cited-not-vendored** — arXiv license + it's guidance not a spec). These close
  the grounding gap that let the reads-as-Resources decision go unexamined.

**▶ Plan 2 / L4 NEXT.** *(DONE 2026-07-04 — see the block at top.)* **Plan 2** = profile mechanism +
`resolveStorageAuthority` threaded onto the *real* storage-description resource L2 now serves
(replacing the `urn:okf:base/` placeholder); resolve the `describedby`-vs-`conformsTo`/PROF vocabulary
question (see the Plan-2 brainstorm block above). **L4** = OKF projection **rewritten to LWS shapes**
(the RED wiki-memory suite gets re-derived, not patched).

**Open design question for the Plan 2 brainstorm — profile/shape-selection vocabulary (do NOT prejudge;
an earlier note wrongly said "adopt the RO-Crate `conformsTo` seam" — RO-Crate merely *reuses* the
vocabulary below).** The L3 `.meta` `describedby → <shape>` stays as the **enforcement** pointer
(validate-me-against-this-shape). The separate **authority/bundle** layer — how `resolveStorageAuthority`
finds the shape+vocab+context set for a profile — is leaning toward **W3C PROF**: `dct:conformsTo`
(DCMI) + the **Profiles Vocabulary** (`prof:`, W3C DXWG Note, ns `http://www.w3.org/ns/dx/prof/`:
`prof:Profile ⊑ dct:Standard`, `prof:isProfileOf` for base-floor→profile inheritance, `prof:hasResource`/
`prof:ResourceDescriptor`, `prof:hasRole`) + the **profile-roles vocabulary** (`…/prof/role/`:
`role:validation`, `role:vocabulary`, `role:schema`, `role:constraints`…). **CORRECTION (2026-07-04):
`role:context` does NOT exist** — the W3C roles vocab defines exactly eight roles (constraints, example,
guidance, mapping, schema, specification, validation, vocabulary; see `.claude/skills/profiles/`); the
scheme is extensible, so a context role would be minted by us, with a syntactic operation contract
(context→parser, not interpreter — see the layer-cake note below). **Chuck's
call (2026-06-30): we will likely need the roles + vocabulary + context** — the vocabulary + context
artifacts are what **close the loop to storage** via advertised JSON-LD `@context`
(`docs/design-notes/contextual-linked-memory.md`), and **PROF/roles were already used in the prior Solid
experimentation**, so this is reuse, not new ground. **Reservation to weigh in the brainstorm:** PROF is
a W3C *Note* (not a REC) and adds indirection (`resource → conformsTo → profile → hasResource →
role:validation → artifact`) vs the one-hop `describedby`; decide how much of the bundle Plan 2 needs
now vs. `describedby`-only + `resolveStorageAuthority`. PROF + roles are now grounded
(`.claude/skills/profiles`). Threads into `docs/design-notes/iri-minting.md` (reuse-first,
w3id/DID-friendly).
**▶ GUIDING FRAME (2026-07-04): `docs/design-notes/layer-cake-principles.md`** — the agreed synthesis
of the pre-spec layering walk (three views, the two-hop context/vocabulary split, the `@vocab`
mint-to-proto policy, declaration-time shape integrity, the one-question-one-mechanism acceptance
table, PROF-as-candidate-not-decision). **The Plan 2 brainstorm and spec operate inside this frame.**
**Merge model (solo dev — no PR ceremony):** each layer is built on its own `la3d/*` feature branch and
**`git merge --no-ff` directly into `la3d/lws`** (the subagent per-task + opus whole-branch reviews are
the gate, not a GitHub PR); `la3d/main` stays the pristine `0f4287f` pin for rebasing onto upstream releases.

**▶ L2 live-pod harness (2026-06-30).** The `tests/` Vitest harness covered the base substrate but not
L2; the storage-discovery behavior was only ever checked by ad-hoc curl. Now a repeatable gate:
**`tests/lws-discovery.test.mjs`** + **`make test-lws`** (runs against the fork `--lws` pod at
`https://pod.vardeman.me` with the mkcert CA). Asserts storage-description shape + scheme parity,
`rel=storageDescription`/`rel=linkset` on GET+HEAD, per-resource linkset (file + container), `lws+json`
`items[]`, and the LDP-unchanged negative control. **Self-skips on a non-`--lws` pod** (top-level probe),
so plain `make test` (base pod) stays green and reports the L2 suite as skipped. Verified: `make
test-lws` 6/6 (live TLS rig); `make test` 9 passed | 6 skipped. (Host-prereq preflight for the TLS rigs:
**`make doctor-tls`**; full rig docs in `README.md` "TLS rigs".)

**L1 deferred carryover** (in the SDD ledger): `--no-lws` flag; HEAD `lws+json` negotiation parity
(`TODO(lws-head-parity)` marker in `handleHead`); `ContainerPage` pagination; per-variant 304/ETag;
`generateLwsContainer` unit-test gaps (trailing-slash, octet-stream, empty). **L3 is now DONE** (see the
L3 block above); next is **Plan 2** then **L4** (OKF projection rewritten to LWS shapes — the old RED
wiki-memory suite).

**Spec grounding refreshed:** the `lws-protocol` skill is bumped to upstream HEAD and vendors the
**first-publication LWS Vocabulary** (`references/lws10-vocab/SNAPSHOTS/DNOTE/Overview.html`). Facts
established: LWS auth = OAuth2 + RFC8693 token-exchange (JSS uses a direct bearer → Keycloak is the AS
gap); the storage backend is unspecified (`Portability-Considerations.md` is a blank stub) but the UCS
*requires* multi-provider + portability; the Type Index (`searchindex`) is an unmerged spec PR
(w3c/lws-protocol#115) — most volatile, build the CNF core behind an adapter. JSS tracks LWS via
#87/#88 (`--lws-mode`, draft/parked), #386 (LWS-CID, **landed in 0.0.210**), #535 (Type Index, align-when-stable).

**Plan-1 projection ripple reframed:** the wiki-memory projection suite (RED since Plan 1) is now
**L4** — it gets rewritten to LWS shapes, not patched to the old `cardToQuads` contract. The earlier
"execute Plan 2 / profile mechanism" framing folds into L4.

---

## ▶▶ DIRECTION CHANGE — general substrate (2026-06-28)

The project re-founded from "the wiki-memory L2 layer (Chuck's vault ported to a pod)" to a
**general, standards-based memory substrate**: a pod any agent connects to, where *structure* is
imposed by a **profile**, not baked in, and the pod is the canonical home (Obsidian/git become
clients). The current **design of record** is
`docs/superpowers/specs/2026-06-28-general-memory-substrate-design.md`; the path to it is three
sequential reconciliation plans (`docs/superpowers/plans/2026-06-28-substrate-reconciliation-*`),
**executed in a later round** — not yet implemented. See the project memory
`general-substrate-design` for the full decision set.

**▶ NEXT SESSION — start here:** the design is done (the spec is the design of record — do **not**
re-brainstorm it). **Plan 1 is DONE** (see the DONE block immediately below). **Write and execute
Plan 2** = the profile mechanism (loadable/discoverable profiles) + profiles #1 (llm-wiki) / #2
(data-catalog), threading the identity policy through `profiles/wiki-memory/extract.mjs` to turn its
suite green again. **§11 #1 (IRI + vocabulary minting) is now RESOLVED** —
`docs/design-notes/iri-minting.md` (content authority *resolved from the pod's storage description*,
never hardcoded, URI-typed/DID-ready; vocab reuse-first under a w3id-shaped base we control; agent
identity = CID-1.0, `did:webvh` preferred). **Plan 2 MUST add a `resolveStorageAuthority(webid|resource)`
seam** so `makeIdentityPolicy` takes a *resolved* URI, not a config literal (the `urn:okf:base/`
placeholder); slug strategy + profile-path + vocab context become profile parameters. Trust seam
(`did:webvh`/VC/ODRL/verifiable-history) is recorded in `docs/design-notes/trust-seam-agent-identity.md`
and stays deferred. The substrate's **"why"** — context cards over data objects, closing the loop to
storage via JSON-LD `@context` (inline or advertised) — is `docs/design-notes/contextual-linked-memory.md`
(Profile #2 is the describe-the-object layer; §11 #3 leans CDIF-aligned). Still open before Plan 2:
§11 #3 (data-catalog vocab — DCAT/CSVW/schema.org/**CDIF**, leaning CDIF-aligned reuse-first layering),
§11 #2 (vault SHACL-vs-curator); plus the Plan-1 carryover list below. (Design-of-record continuity
lives in this repo — FOLLOWUP + spec §12 design-note pointers; the `~/.claude` auto-memory is a
per-machine convenience and is NOT needed to resume on another machine.)

---

## ▶▶ DONE — Substrate Reconciliation Plan 1: stable subject identity + base profile (2026-06-28)

Executed Plan 1 (`docs/superpowers/plans/2026-06-28-substrate-reconciliation-1-identity.md`) via
subagent-driven-development. Branch `reconcile/plan1-identity`, 6 commits (`49a9048`, `f1c141a`,
`35347ff`, `3a8fe86`, `4c36763`, `33a9526`). Confined to `projection/okf/`. Per-task spec+quality
reviews all Approved; final whole-branch review (opus): ready-to-merge-with-fixes, fixes applied.

What changed:
- **`okf/identity.mjs`** (new): `slugFromUrl` / `makeIdentityPolicy` / `subjectIri`. A card's RDF
  subject is now a **stable, location-independent IRI** — a declared frontmatter `id:` if present,
  else minted `{profile-namespace}{slug}#it` — never derived from the storage URL. Proven by a test
  minting an identical subject from two different storage URLs (pod-A / pod-B).
- **`okf/card.mjs`**: `cardToQuads(markdown, cardUrl, ns, policy)` (4th arg). Subject AND `@id`-typed
  edge targets mint through the same `policy.mint(slugFromUrl(...))` path (symmetric by construction).
  `id` is identity, not a property (`continue`). The inline curly-brace Semantic-Markdown `bodyQuads`
  extractor is **removed**; a non-vacuous guard test locks in that body annotation is not extracted.
- **`okf/base-profile.mjs`**: the OKF floor gains an `identityPolicy` (`base: 'urn:okf:base/'`,
  placeholder until Plan 3 wires per-pod storage IRI authority) + a minimal context
  (`type`→`@type`, `title`/`description`→`dcterms`).

Spec grounding (read in full this session): OKF + DataBook confirm the declared-`id`-wins / mint-
from-slug rule (DataBook §3.3/§5.1; `id`→`@id`, location-independent). DataBook findings pinned into
spec §11 (commit `203b1e0` on main).

**Known-red, by design:** `projection/profiles/wiki-memory/` suite (~5 test files) is RED — its
`extract.mjs:12` still calls `cardToQuads` with 3 args. This is the Plan-1→Plan-2 ripple
(breadcrumbed with a `TODO(plan-2)` at the call site). The `okf/` floor itself is fully green.

**▶ Carryover into Plan 2 (final-review findings):**
1. **Edge-target identity resolution** (Important): subject minting honors a declared `id:`, but
   edge-target minting only slug-mints — it can't resolve a *referenced* card's declared `id:`, so an
   edge to a card that opted into a stable IRI dangles. Needs the bundle/import resolution Plan 2/3
   brings. One coherent piece of work with the two `targetIri` minors below.
2. `targetIri` passthrough requires `://` — `urn:`/`did:` edge values get mis-minted (and the base
   profile itself mints `urn:okf:base/` subjects, so a urn world is plausible).
3. `slugFromUrl` is filename-only → `a/x.md` and `b/x.md` collide to one subject (by design,
   DataBook-aligned, but "filename unique within a profile namespace" is an unstated hard invariant —
   document it; this is also spec §11's IRI-minting question).
4. **`asTypeCurie` engine-vocab debt:** `card.mjs` hardcodes `'skos:' + bareType`, violating the
   "no vocab in engine code" constraint. The base profile newly depends on it and emits an
   *unresolved* `skos:Reference` for a bare `type:` (no `skos` in the base context). The base-profile
   comment + test now document this honestly (a test pins `skos:Reference` and MUST be updated when
   Plan 2 lands type-scheme resolution). Real fix = move type→class resolution into the profile.
5. Minors: T2 declared-`id` guard has no negative assertion; T1 thin coverage; `extract.mjs:1`
   stale "Semantic-Markdown → RDF" header (fold into the Plan-2 edit that touches the file).

---

Read the DONE blocks below as **what exists**: the built machinery (projection,
constrained-container, the app, JSS) is **kept and re-founded** onto the general model, not
discarded. The old "Next: Phase-2 agent layer" framing (and open items 5–8) is **superseded** —
those concerns (agent query/discovery surface, MCP hardening, authenticated/cross-container reads)
are subsumed into the substrate reconciliation and its deferred LWS Type Search / trust layer (spec
§9 remove/restructure/rebuild/keep).

---

## ▶▶ DONE — wiki-memory curation app (Phase 1, 2026-06-22..25)

Built and merged the wiki-memory **curation console** — the client half of the wiki-memory system.
A static Solid/LWS app (vanilla custom elements, no build, no runtime CDN) to browse agent-written
cards, traverse their typed graph across containers, and correct them through the SHACL floor (the
422 `sh:message` is the teaching channel). Spec: `docs/superpowers/specs/2026-06-22-wiki-memory-app-design.md`,
plan: `docs/superpowers/plans/2026-06-22-wiki-memory-app.md`, app README: `app/README.md`. All on `main`.

What shipped:
- **The app** (`app/`): `pod.js` (auth/CRUD + localStorage session), `parse.js`, `graph.js` (N3),
  six custom elements, plus the shell — **hash routing + browser Back**, **session persistence**,
  in-app link navigation, and **Relates + Backlinks** panels.
- **Generic typed-edge graph**: `graph.js` traverses ANY non-describing predicate, so the graph
  lights up for any profile (verified against a Google **OKF GA4 bundle** with synthesized lineage).
- **Implementation typing fix**: implementation cards are `wm:Implementation` (not `skos:Concept`);
  `index.md` groups a section per type; the projection projects both Concept + Implementation.
- **CORS on the admission proxy** for the browser write path.
- **Vendored deps** (`app/vendor/`: marked/js-yaml/n3/cytoscape) — removes the esm.sh runtime
  single-point-of-failure (a CDN flake had taken the whole app down). No bundler.
- **Verified live in a real browser** (Chrome): persistence across reload, Back, in-app links, the
  422→green correction loop, the GA4 lineage graph. Unit 43 + e2e 3.

Key deviations (recorded in the spec/plan deviation notes):
- **N3 over Comunica** — `@comunica/query-sparql-link-traversal@0.8.0` is broken in Node ESM (two
  incompatible `@traqula` parser pins). v1 uses N3 over explicitly-derived container sources;
  Comunica link-traversal deferred to the Phase-2 agent layer.
- **Content under the user's pod space** (`/alice/concepts/`, `/alice/implementations/`), derived
  from the login WebID — the pod root ACL forbids server-root writes (same blocker as `jss install`).

Agent attach + understand (demonstrated over MCP, 2026-06-25): an agent attaches via `/mcp`
(JSON-RPC, `--mcp`), authenticates with a Bearer header — WAC-gated per tool call (proven: anonymous
write **denied**, bearer write **allowed**) — orients via `index.md`, and answers structural questions
by traversing `graph.ttl` (conneg Turtle/JSON-LD), e.g. the worklist. See OPEN items 5–6 for the gaps.

---

## ▶▶ DONE — LWS-CID auth proven locally (P4a, 2026-06-21)

Closes the local half of open-item 1. The self-signed LWS-CID JWT auth round-trip now passes
end-to-end against a local pod — no public host needed to prove the auth *logic*.

- **Mechanism:** opt-in `PATCH_CID_PRIVATE_IPS` build arg (`Dockerfile`, default OFF). When true,
  the image `sed`-relaxes JSS's hardcoded `blockPrivateIPs:true` in `src/auth/cid-doc-fetch.js`.
  Wired ON for the TLS proof pod (`docker-compose.tls.yml`); opt-in for local via `.env.local`
  (`.env.example` default false to keep the committed image pristine).
- **Proof:** `experiments/headless-cid` against the patched TLS pod (`make up-tls && make cid-tls`,
  JSS 0.0.209): Phase 2 WORKS — `LWS-CID PUT → 201` as the WebID, GET-back, all negative controls
  reject (expired / `sub≠iss` / unknown `kid`). README findings updated.
- **Why TLS too:** two gates — the verifier requires an https `kid` (the TLS pod supplies it) AND
  the SSRF private-IP guard (the patch relaxes it). The http local pod can't reach the CID path.
- **Still open (not a blocker):** the SSRF guard *with the guard on* is unexercised — a one-time
  confirmation on a real public host (public DNS + TLS, no patch). Auth logic is proven; this is a
  network-policy checkbox. So both the RS256 owner bearer and the self-signed LWS-CID JWT are now
  validated headless credentials.

---

## ▶▶ DONE — P3 projection-on-write (2026-06-21)

Shipped the OKF projection app: channel-driven, HTTP-native sidecar that reprojects a
wiki-memory container on every card write. Spec: `docs/superpowers/specs/2026-06-21-okf-projection-app-design.md`.
Plan: `docs/superpowers/plans/2026-06-21-okf-projection-app.md`.

What shipped:
- **Generic OKF libs** (`projection/okf/`): frontmatter parser + `index.md` channel.
- **Channel-driven engine** (`projection/engine.mjs`): membership-from-listing, conneg GET,
  authenticated PUT, reserved-name skip (incl. derived views), profile-parameterized.
- **Wiki-memory profile** (`projection/profiles/wiki-memory/`): `extractCard` (Semantic-Markdown
  → RDF quads), `graph.ttl` channel (Turtle aggregate), SHACL floor shape shared into the P2
  proxy (synchronous per-write validation).
- **Triggers** (`projection/triggers/`): CLI one-shot + notifications CDC (WebSocket `solid-0.1`
  subscribe/pub, debounced). Constrained-container tests run via their own vitest config
  (`constrained-container/vitest.config.js`).
- **Full suite green:** projection 25/25 (unit + e2e incl. notifications WebSocket), constrained-
  container floor 2/2 + P2 regression 5/5. Gate: `make test-projection`.

**DESIGN NOTE (discovered during build):** `solid-0.1` WebSocket `sub` to a PROTECTED container
requires the Bearer token in the WS upgrade headers — the design doc assumed anonymous subscribe
to a public container. The trigger passes the token in the headers when present; auth-less subscribe
returns `err … forbidden` from JSS.

**Filesystem prototype retired:** `render/` (`generate.js` — readdirSync cards → writeFileSync
HTML) removed; superseded by the projection engine.

Deferred to Phase-1 / production hardening (not silently dropped):
- `<card>.html` and `viz.html` reading-experience channels (spec §8; will be channels when built)
- Aggregate `graph.ttl` SHACL validation (current floor is per-card at write time)
- Incremental projection (full re-projection per container on each write now)
- Link-rel channel discovery + LWS-native container-type URIs
- `okf_application` root-index profile selector (engine takes profile as a parameter; single-
  profile now; reading selector from root `index.md` deferred)
- Proper app/agent identity via LWS-CID/did:key — auth round-trip now **proven locally** (P4a
  above); the replayable RS256 bearer remains the default credential, and the guard-on confirmation
  is reserved for the public host (P4)
- WS auto-reconnect/backoff (close handler logs halt + clears the timer; manual restart now)
- A GA4-style second profile
- **Proxy cache keying (P4):** `shapeCache`/`shapeDsCache` in `constrained-container/proxy.js`
  are keyed by the full bearer token and never invalidated — under token churn they grow
  unbounded, and a container's `.meta`/constraint change is not picked up until proxy restart.
  Acceptable for the local rung; harden at P4 alongside the app/agent identity item.

Remaining Phase-0: **P4** (public-dev rung on a CRC/SAI VM) — now deferred to LAST and **no longer
gates "working"** (LWS-CID auth proven locally, P4a above). Gated on the local definition-of-done
in `docs/ROADMAP.md`; on the VM, P4 only needs the one-time SSRF-guard-on confirmation.

---

## ▶▶ DONE — local deployment rung (2026-06-21)

Left experiment phase; began building the memory pods. Migrated the eval scaffolding into a
base+override deployment workflow — **local rung only**; public dev/prod deferred. Spec + plan
in `docs/superpowers/specs/` and `docs/superpowers/plans/` (2026-06-21). Merged to `main`.

- **Base+override compose:** `docker-compose.yml` (env-neutral `jss` service — no ports/volumes/
  container_name) + `docker-compose.local.yml` (http :3838, `./data` bind-mount for on-disk
  inspection). `.env.local` (gitignored) copied from `.env.example`; make targets wrap
  `-f base -f local --env-file .env.local`.
- **Vitest gate:** `tests/` via `make test` replaces `smoke.sh` (archived to `experiments/`).
  9/9 e2e green — lifecycle (pod create, headless RS256 bearer, write/read, conneg) + agent
  surfaces (MCP, CID-shaped profile, git push → retrievable resource).
- **Deferred by decision:** public rungs target a **CRC/SAI provisioned VM** + Docker Compose +
  Caddy at `*.crc.nd.edu` (`pod-dev.crc.nd.edu`, `pod.crc.nd.edu`); TLS via institutional
  wildcard cert (mounted) or Caddy/LE; deploy manual-now → GitHub-Actions CI later. The base is
  env-neutral so `.dev.yml`/`.prod.yml` will only ADD, never edit it.

Follow-ups (none blocking): Makefile `BASE` should track `ENV` when dev/prod arrive; `make up`
could add `--remove-orphans`; `mcp()` test helper could check HTTP status before `.json()`;
profile test pinned to `card.jsonld` until JSS adds extension-free conneg.

---

## ▶▶ DONE — JSS substrate evaluation (2026-06-21)

**Verdict: JSS is a good replacement for CSS — proceed to build the L2 memory layer on it.**
Eval pinned to JSS **v0.0.209**. Full evidence: `README.md` checklist (all checked) +
`docs/foundations/05-jss-spec-conformance.md` (per-axis CONFORMS/EXTENDS/DIVERGES/GAP, every
claim cited). Live probes: `experiments/smoke.sh` (steps 7-11) and `experiments/headless-cid/`.

What shipped this eval (all on `main`):
- **7 grounded skills** in `.claude/skills/` — verbatim, source-pinned, contamination-free
  (`scripts/check-skill-grounding.sh` enforces). Spec: lws-protocol, solid-protocol,
  shacl-constraints, comunica-sparql, okf, semantic-markdown. Implementation: jss-server.
- **Conformance map** `docs/foundations/05-jss-spec-conformance.md`.
- **`experiments/smoke.sh`** (archived) carried the 5 live tests; now ported to the Vitest suite (`make test`).
- **`experiments/headless-cid/`** — headless LWS-CID provisioning + auth probe (Node + jose).
- **TLS variant** — `make cert` / `up-tls` / `cid-tls`, `docker-compose.tls.yml` (mkcert,
  `pod.vardeman.me:8443`), reusing cogitarelink-solid's approach. `certs/` gitignored.

Live-verified: persistence (down/up), RS256-JWT headless bearer, MCP=WAC CRUD/ACL, Solid conneg,
git push → `ldp:contains` member, CID-shaped profile, **headless key provisioning works**,
JSS serves `.meta`+`ldp:constrainedBy` (admission proxy ports).

---

## ▶ OPEN — when building the L2 layer (none block the substrate decision)

1. **LWS-CID auth — guard-on confirmation on a PUBLIC deployment** (axis 6). *Auth logic now
   proven locally* (see "DONE — LWS-CID auth proven locally (P4a)" above): the self-signed-JWT
   round-trip passes on the patched TLS pod (`PATCH_CID_PRIVATE_IPS=true` relaxes JSS's hardcoded
   `blockPrivateIPs` in `src/auth/cid-doc-fetch.js`). Phase 1 *and* Phase 2 of
   `experiments/headless-cid/` are green. **What remains:** re-run on a real public host with the
   guard ON (no patch) to confirm the SSRF path itself — a network-policy checkbox, not an auth
   gap. Re axis-2's **bearer-replay** concern: the RS256 bearer is still the default headless
   credential, but the self-signed LWS-CID JWT is now a validated alternative for agent-trust design.
2. **L2 admission floor harness** (axis 7). The `constrained-container/` proxy reads `.meta`+shape
   **unauthenticated**; on JSS those are owner-only and `.acl` PUT returned **415** in testing.
   Settle either (a) public-read ACL provisioning (find JSS's accepted `.acl` write form), or
   (b) have the proxy forward the requester's `Authorization` on its constraint reads (the
   cleaner fix — lets it govern protected containers). Mechanism itself is confirmed working.
   **Resolved (P2, 2026-06-21):** proxy forwards the requester's Authorization on `.meta`/shape
   reads (governs protected containers); `constrained-container/set-acl.mjs` provisions public-read
   shapes via HTTP `application/ld+json` `.acl` PUT (no MCP). See `constrained-container/README.md`.
   *P2 follow-ups (non-blocking):* `set-acl.mjs` sets `acl:default` on file resources (no-op on
   files; correct once used on containers); its signature omits the unused `base` param; and
   `proxy.js`'s `validatorFor()` should add an `r.ok` guard (symmetry with `constrainedBy`) so a
   readable-`.meta`-but-protected-shape topology fails open instead of admitting all.
3. **In-process projection / auto-commit** (axis 7) = **P3 DONE (2026-06-21)**. Shipped as the
   `projection/` package: channel-driven engine + wiki-memory profile + CLI and notifications
   triggers. See `docs/superpowers/specs/2026-06-21-okf-projection-app-design.md` and the P3
   DONE block at the top of this file for what shipped and what is deferred.
4. **P1 spike done (2026-06-21):** Keycloak-in-front-of-JSS proven — `experiments/keycloak-jss/`.
   Approach A (token `webid` claim) confirmed; gateway-enforces pattern kept; token-exchange /
   native-JSS-acceptance deferred. See the experiment README's decision note.

5. **Phase-2 agent query + discovery surface** (the deferred agent layer). The pod is attach-able
   and traversable today (MCP CRUD + read `index.md`/`graph.ttl`), but there is **no "ask the
   memory" surface**: no SPARQL-over-MCP, no faceted search, and the vocabulary
   (`projection/profiles/wiki-memory/types.ttl`, `edges.ttl`, the SHACL shapes) is **not published
   on the pod** — a cold agent must be *told* that `wm:implementedBy` means "implementation." Highest
   leverage: (a) publish the vocabulary + a `.well-known`/manifest so an agent self-discovers the
   schema; then (b) a query tool (Comunica vs Oxigraph-WASM vs MCP manifest — `geoff` is the
   WASM-SPARQL candidate; see project memory `geoff-reference`).

6. **MCP auth hardening for untrusted/networked agents.** Auth is the HTTP `Authorization` header on
   `POST /mcp` (no MCP-native OAuth flow); JSS resolves a WebID and WAC-checks every tool call.
   Verified live (anonymous write denied, bearer write allowed). The default **RS256 bearer is
   replayable** (not DPoP-bound) — fine for a trusted local agent; an untrusted/networked agent
   wants DPoP or the self-signed CID/`did:nostr` signature-per-request path, which needs the
   public-IP rung (open item 1). Ties to the long-standing bearer-replay caveat (axis 2).

7. **`graph.js` authenticated reads.** `loadStore` uses an unauthenticated `fetch`, so the graph
   view/worklist require **public-read** content (the seed grants `/alice/` public-read via
   `acl:default`). Inject the session bearer (via `pod.js`) so private pods work — also retires the
   now-unused `pod.js` `getGraph`. App README "Known limitations".

8. **Cross-container backlinks.** Backlinks resolve from a card's own container `graph.ttl`, so a
   card pointed at from another container shows none unless an inverse edge is materialized next to
   it (concept→concept within `/alice/concepts/` works). Needs a global index or such
   materialization. *Related:* in-pod app install is BLOCKED at the root ACL (`jss install` →
   `/public/apps/` is unwritable; finding `docs/superpowers/findings/2026-06-22-jss-install-spike.md`) —
   dev-serve is the v1 path.

---

## 📍 Navigation (resume order)

1. This file → the verdict + open items.
2. `docs/foundations/README.md` → the four canon docs + the conformance map.
3. `docs/foundations/05-jss-spec-conformance.md` → per-axis spec-vs-JSS, "Live test results".
4. `.claude/skills/` (auto-loaded) → ground truth on specs + JSS; `jss-server` = what the server
   does, `solid-protocol`/`lws-protocol` = what the standard says.
5. The L2 IP to port: `constrained-container/` (admission), `docs/archive/wiki-memory-dual-projection.md`
   (content model), `docs/foundations/04-comunica-patterns.md` (query path).

## Local pod (deployment workflow)

Local stack: container `lws-pod-local`, http :3838, data bind-mounted to `./data` (inspect the
LDP containers + git repos directly on disk). `make up` / `make down` / `make logs` / `make shell`;
`make test` runs the Vitest gate; `make reset` wipes `./data` for a fresh pod. TLS eval pod
`lws-pod-tls` (https :8443) via `make up-tls` / `make down-tls` is unchanged. Test cruft on the
http pod (alice/notes, gitprobe-* repos) is harmless — `make reset` clears it.

## Phase-0 status

**P1 ✅** (Keycloak auth-plane, `experiments/keycloak-jss/`), **P2 ✅** (proxy auth + HTTP ACL
provisioning, `constrained-container/`), **P3 ✅** (OKF projection app, `projection/`), **P5 ✅**
(write-funnel = notifications CDC, resolved in P3), **P4a ✅** (LWS-CID auth proven locally). **P4
(CRC VM) is deferred to LAST and no longer gates "working."**

**The L2 layer + wiki-memory curation app are built on the local rung** (DONE block above):
governance floor (P2), projection (P3/P5), and the curation console — verified live in a browser,
and the pod is agent-attachable + traversable over MCP. **Next (per the 2026-06-28 direction change
above): the substrate reconciliation** — re-found this built machinery onto the general
profile-based model, per the design spec and the three `substrate-reconciliation-*` plans (a later
implementation round). The old open items 5–8 are folded into that work; **P4** (public-dev rung on
a CRC/SAI VM) stays deferred to LAST. The phase status below is the pre-pivot build record.
