# L4a — the substrate proves application-neutrality — design of record

**Date:** 2026-07-06
**Status:** design of record. Governed by `docs/design-notes/layer-cake-principles.md` (this spec
adds **P13** to it) and by the 2026-07-06 coupling review (FOLLOWUP block: substrate UPHELD,
mechanism REFUTED). Supersedes the earlier one-round "L4 = OKF projection rewritten to LWS shapes"
framing: **L4 splits into L4a (this spec) and L4b** (wiki-memory re-derived on the decoupled floor —
own later spec). **Next step:** a new session runs `superpowers:writing-plans` against this spec,
then subagent-driven implementation. Do NOT start implementation from this doc without a plan.

---

## 0. Why this exists

The coupling review refuted the claim that the mechanism tier presupposes no application: the
engine bridge force-fits the OKF index channel on every profile (B1), the engine parses everything
as markdown (B2), publish cannot onboard a new family without code edits (B4/B5), and the binding
API collapses plural `conformsTo` (B6). Chuck's corrective principle (2026-07-06, verbatim intent):

> The substrate is an implementation of W3C Linked Web Storage with W3C PROF profiles — that is it.
> It must support many applications, and an application must never require writing code inside the
> machinery: onboarding is agentic GETs and PUTs of profile data. Code is legitimate only as
> **agentic guardrails** — the MCP surface, constrained containers, SHACL admission — the minimum
> viable agent surface.

L4a makes that principle enforceable (P13 + a durable audit), fixes the mechanism, and proves the
claim with a second application family onboarded as pure data.

---

## 1. Scope and the hard constraint

**L4a = audit + mechanism fixes + the zero-code DCAT gate.** The projection engine is NOT
generalized this round — it is *demoted* (decision recorded here, executed in L4b).

**Hard constraint: the fork diff for this round is EMPTY.** Application #2 needs nothing from the
substrate. Asserted in the round (byte-identical fork tree before/after the gate), not assumed.
Consequence: every recorded fork-side nit (MCP gateway advertisement in the storage description,
the hint's "every resource" wording, GET-405 Content-Type, npm-test `--test-force-exit`) is out of
scope and stays queued for the next fork round.

---

## 2. P13 — the code-placement test (append to `layer-cake-principles.md` as canon)

> **P13 — Code only guards; applications are data.** Code belongs server-side exactly where
> (a) enforcement must be independent of the agent being guarded — admission/SHACL, WAC/no-oracle,
> sanitization, rate limits — or (b) affordances must exist before any agent arrives — discovery
> surfaces, the MCP tool surface, teaching errors. The profile-mechanism tier may be code only if
> it dispatches on profile data and contains no application vocabulary (P5). Everything
> application-semantic — content models/parsers, derived-view renderers, domain vocabularies — is
> profile data plus agent behavior. Onboarding a new application requires zero code anywhere.
> (P9 generalized: same courthouse, any law.)

The three buckets, for the audit rubric:

| Bucket | What | Verdict test |
|---|---|---|
| 1. Guardrails & affordances | fork L1–L3, MCP surface, WAC, sanitization, rate limits, admission engine, linksets, type index, storage description | application-neutral + P13(a)/(b) |
| 2. Profile mechanism & onboarding tooling | `loadProfile`/`resolveStorageAuthority`/`discoverBinding`, publish | code allowed iff manifest/data-driven, zero app vocabulary |
| 3. Application semantics | parsers (gray-matter), channels/renderers, app vocabularies, the projection engine | data + agent behavior; engine = application #1's client tooling |

---

## 3. The audit — `docs/foundations/06-code-placement-audit.md`

Every extension point in `projection/` plus the fork's profile touchpoints gets a row: **item,
bucket, verdict (keep / move-to-data / move-to-agent / app-tooling / delete), disposition (L4a /
L4b / justified-as-is)**. Seeded by the coupling review's findings (A1–A3, B1–B10, the
`base-shape.ttl` universality comment); the audit's job is completeness beyond them. The doc is
durable and re-runnable — the standing gate CLAUDE.md now names, analogous to
`check-skill-grounding.sh` for the skills contract. (A future script that greps Bucket-1/2 code for
application vocabulary per P5 is a welcome plan-level addition, not a spec requirement.)

Known dispositions the audit must carry (from the review, do not re-derive): B1/B2 → Bucket 3,
executed L4b (demotion); B4/B5/B6 → Bucket 2, fixed in L4a (§4); B3/B8/B9 → L4a smalls (§4);
B7 identity-config vocabulary + derived-view declaration + multi-profile read semantics → L4b.

---

## 4. Mechanism fixes (Bucket 2 — all lws-pod-side)

1. **Publish becomes manifest-driven (B4/B5).** The descriptor set comes from `defs/index.jsonld`
   (the manifest); each descriptor's artifacts and their check-wiring (shapes → SHACL-SHACL,
   context → lint, vocabulary → completeness) are discovered from its own `hasResource`/`hasRole`
   entries — no hardcoded filename lists, no `llm-wiki` special case (a family's subdirectory
   layout comes from its descriptor path), `defsLoader` resolves context references path-aware
   (not flat-basename), and `KNOWN_VOCAB_GAPS` moves into per-profile manifest data. Acceptance:
   adding a family = one manifest entry + its files; publish code untouched.
2. **`discoverBinding` returns plural `conformsTo` (B6).** The API stops collapsing to
   `quads.find(...)`; callers get every declared target (matching the substrate's plural
   `conformsToTargets`). Which profile *governs a read* when several are declared is an L4b
   read-side question, recorded not answered here.
3. **Smalls:** `lwsp.ttl` `lwspr:plane-mapping` `skos:definition` reworded application-neutral
   ("how content units map onto storage containers" — no "knowledge bundles") + profiles
   republished; `projection/okf/profile-select.mjs` deleted (dead, superseded by
   `discoverBinding`); `projection/okf/links.mjs` loses the `skos:` CURIE fallback and the
   `implementedBy`/`broader` defaults (indexed rels become a required caller parameter; the one
   known consumer, the legacy `constrained-container/` proxy, is updated to pass them explicitly —
   the plan verifies no other callers).

---

## 5. The zero-code DCAT gate (Bucket 3 proof)

**The family, as pure data** under `projection/profiles/defs/dcat-catalog/`:

- `profile.jsonld` — PROF descriptor, `hasToken: "dcat-catalog"`, **`isProfileOf:
  ../substrate-floor.jsonld`** (deliberately NOT okf-base: it inherits the identity floor and the
  conformsTo handoff, none of the card machinery).
- `context.jsonld` — DCAT/DCTERMS terms (reuse-first; nothing minted; W3C-hosted vocabularies).
- `shapes.ttl` — SHACL: `dcat:Dataset` requires exactly one `dct:title` (`sh:Violation`, teaching
  message) and recommends `dct:description` (`sh:Info`) — deliberately parallel to the okf floor's
  rules so the teaching-channel comparison across families is direct.

**Onboarding via agentic PUTs only** — plain authenticated writes of the artifacts to
`/alice/profiles/dcat-catalog/`, public-read ACLs, and the container bind via `.meta`
read-merge-write on `/alice/datasets/` (`dct:conformsTo` + `powder:describedby`), exactly the
sequence any remote agent could perform over the existing surface. The request sequence is
committed as **the zero-code onboarding recipe** (`docs/foundations/` section or appendix in the
audit doc) — the seed of the future `linked-web-memory` operating skill's write-side. The
manifest-driven `publish.mjs` is proven separately by adding `dcat-catalog` to the manifest and
running `make publish-profiles` idempotently over the same artifacts; the gate itself uses the
primitive path, because the primitive path is the claim.

**Gate assertions** (new live suite `tests/lws-dcat.test.mjs` + `make test-dcat` — its own file, so
per-family gates stay separable):

1. Non-conformant `dcat:Dataset` (no title) PUT to `/alice/datasets/` → **400 + violations +
   teaching message through the UNCHANGED admission engine**.
2. Conformant dataset → 201 (+ Info advisory when description absent).
3. Container linkset carries `describedby` → dcat shapes and `dct:conformsTo` → the dcat profile;
   member linkset carries `up`/`type` (the pinned handoff design, #5b symmetry).
4. `loadProfile` resolves dcat-catalog end-to-end: `isProfileOf` walk reaches substrate-floor,
   roles dispatch, identity policy inherited.
5. Type search finds the typed member.
6. **The fork tree is byte-identical** before/after (`git -C <fork> status --porcelain` empty and
   HEAD unchanged, asserted in the round's verification).

**Cold-agent probe #3** — same unprimed protocol as 2026-07-06's two runs, with the governance
walkthrough left free to pick any resource: the agent should reconstruct the DCAT family by the
same walk that reconstructed llm-wiki. Two families discovered identically = the affordance-level
generality proof.

---

## 6. Engine demotion — recorded now, executed L4b

Decision of record: `projection/engine.mjs`, the channels (`index-channel`, `graph-channel`),
`okf/frontmatter` + gray-matter parsing, and card-identity minting are **application #1's client
tooling**, not substrate and not mechanism. L4b executes: split `projection/` into the neutral
PROF mechanism (own home, e.g. `projection/prof/`) and the wiki projector as app tooling
(e.g. `apps/wiki-projector/` — naming decided at L4b); re-derive the RED+fenced wiki-memory suite
on the decoupled floor; introduce the derived-view-declaration vocabulary **then** (a profile
declaring its derived targets as data — DCAT-as-pure-data needs none, YAGNI); and take the carried
read-side questions (earned-at-admission member `conformsTo` vs the `up`-walk, `defaultProfile`
precedence, plural-binding governance).

---

## 7. Acceptance

1. Fork diff empty (asserted, §5.6).
2. DCAT family end-to-end via data-only PUTs — gate assertions 1–5 green.
3. `docs/foundations/06-code-placement-audit.md` committed, every row dispositioned.
4. Manifest-driven publish proven by the dcat manifest entry (no publish-code edits).
5. Plural `conformsTo` API landed; smalls (B3 reword + republish, B8 delete, B9 fix) done.
6. Cold-agent probe #3 reconstructs both families by the same walk.
7. Zero regression across all existing gates (`test-profiles` 6/6, `test-l3`, `test-lws`,
   `test-typeindex`, `test-indexed-relation`, `test-mcp-v2`, projection unit suites; the
   wiki-memory suite stays RED+fenced — its fence test must still pass).

---

## 8. Out of scope

- **L4b** — engine move/rename, wiki-memory green, derived-view vocabulary, read-side semantics.
- **Any fork edit** (§1) — including the recorded fork-side nits.
- **Federation hardening** (remote body cap, SSRF policy) — own round, already FOLLOWUP-named.
- **The tool-use battery** — independent validation, pending an `ANTHROPIC_API_KEY` run.
- **Operating skills** — the onboarding recipe seeds them; authoring stays post-L4b, distilled
  from the harness per `docs/design-notes/agent-operating-skills.md`.

---

## 9. Grounding

- 2026-07-06 coupling review (FOLLOWUP block + review transcript) — the finding set and tier
  verdicts this spec answers.
- `docs/design-notes/layer-cake-principles.md` — P5/P7/P9 (P13 extends them); the D-questions
  already resolved by Plan 2 are not reopened.
- `.claude/skills/profiles` (W3C PROF), `.claude/skills/shacl-constraints`,
  `.claude/skills/json-ld` — the artifact kinds the DCAT family is authored in.
- W3C DCAT (vocabulary reused, not vendored — a grounded `dcat` reference skill is a welcome
  plan-level addition if authoring needs it).
- `docs/design-notes/iri-minting.md` — reuse-first vocabulary policy the DCAT context follows.
- Cold-agent probes #1/#2 (2026-07-06) — the walkthrough protocol probe #3 repeats.
