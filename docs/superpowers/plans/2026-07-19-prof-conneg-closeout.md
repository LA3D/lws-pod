# PROF/Conneg Closeout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close standards-closeout item 3 — direct-response profile identification (R12), q-value
robustness (R13), deterministic media+profile selection (R14), profile-axis ETag pins (R15), honest
exact-match subset naming (R16), write-contract labeling (R17) — per the design of record
`docs/superpowers/specs/2026-07-19-prof-conneg-closeout-design.md`.

**Architecture:** Fork work (F1–F7) lands on a new branch `la3d/lws-profconneg` off `la3d/lws` @
`e74a2bb` in `/Users/cvardema/dev/git/LA3D/JavaScriptSolidServer`, merged `--no-ff` after a
whole-branch review. lws-pod work (P1–P5, matrix, gates) lands directly on `main` in
`/Users/cvardema/dev/git/LA3D/agents/lws-pod`. The fork's un-negotiated profile stamp is ONE change
in the `getAllHeaders` choke point; the alternate-face coverage comes from data (`instantiate()`
writes per-face `.meta`), never fork special-casing.

**Tech Stack:** Node ESM. Fork: Fastify, `node --test`. lws-pod: vitest (root `tests/` live gates +
colocated `projection/**/*.test.mjs` units), Make targets, Docker fork rig (`up-fork-tls`).

## Global Constraints

- P13 substrate neutrality: the fork may read generic PROF/altr/dct facts; it never interprets
  application vocabulary.
- Commit format: `[Agent: Claude] type(scope): subject` + body bullets +
  `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`. Stage specific files, never `git add -A`.
- Fork suite: full run is `npm test` (per-file `--test-concurrency=1 --test-force-exit`). Ad-hoc
  multi-file `node --test` runs of files sharing `./data` race — run files individually with
  `node --test --test-concurrency=1 --test-force-exit <file>`. Known environmental flake:
  `test/lws-pod-visibility.test.js` ECONNRESET — re-run in isolation before believing it.
- `--lws`-off responses must stay byte-identical for every fork change.
- Live gates hit anon rate limit (~60/min): space back-to-back `make test-*` runs ~40s.
- `POST /.pods` is 1/IP/day in-memory: after a fork image rebuild, reseed needs a data-preserving
  `docker restart lws-pod-fork` first.
- `.superpowers/sdd/task-N-report.md` files exist from prior rounds — OVERWRITE them entirely.
- The spec is the design of record; where this plan and the spec disagree, the spec wins.

---

### Task 1: Matrix Round 3 addendum (R12–R17)

**Files:**
- Modify: `docs/superpowers/specs/2026-07-18-lws-core-requirement-matrix.md` (append a `## Round 3
  addendum — PROF/conneg closeout (2026-07-19)` section at the end)

**Interfaces:**
- Produces: row IDs R12–R17 referenced by every later task's commit messages and the closeout.

- [ ] **Step 1: Read the pinned spec sources** — `.claude/skills/prof-conneg/references/dx-prof-conneg.html`
  (HTTP Headers Functional Profile requirements incl. R.1.2.a; abstract-model MUST/SHOULD for
  most-specific selection and tokens; Example 6 `#eg-range14`) and
  `references/profile-negotiation-http.html` (Accept-Profile/Content-Profile grammar). Also RFC 9110
  §12.4.2/§12.5.1 (from knowledge; quote by section number, no fabricated quotes).

- [ ] **Step 2: Append the addendum** with one row per requirement, same table/format style as the
  existing Round 1/2 rows. Each row: ID, normative quote (VERBATIM from the pinned HTML — copy, then
  re-grep the skill file for the exact substring to verify), calibration, current status, closing
  task. Required content:
  - **R12** direct-response profile identification (R.1.2.a): bare 200 / direct-alternate 200 / HEAD
    MUST carry `Content-Profile` + `Link rel="profile"`. Calibration: Example 6 shows the post-303
    final 200 *without* `rel="profile"` — redirect flow already conformant, unchanged. Status: OPEN →
    Tasks 4, 10.
  - **R13** q-value handling, labeled **RFC 9110 robustness, NOT spec conformance** (DX-PROF-CONNEG
    treats weights as an optional ordering mechanism and says nothing about q=0/malformed): discard
    q=0, clamp to [0,1], non-numeric → 1.0, stable ties. Status: OPEN → Task 2.
  - **R14** deterministic combined media+profile selection among same-profile representations
    (project rule, not a spec MUST — the spec is silent; determinism + honesty is the requirement we
    set). Status: OPEN → Task 3.
  - **R15** profile-axis ETag/variant coherence + 406-beats-304 / 304-beats-303 precedence
    (RFC 9110 variant rules). Claim: profile selection never changes bytes at a URL (self-or-303) —
    verify-and-pin. Status: OPEN → Task 5.
  - **R16** honest subset naming: every teaching string states exact-URI match, no tokens, no
    `isProfileOf` fallback. Calibration: hierarchy = abstract-model SHOULD, absent from the HTTP-FP
    itemized requirements; tokens = MAY — the subset conforms to `cnpr:http`. Status: OPEN → Task 6.
  - **R17** write contract = read-side negotiation + write declaration; reactive 422 write-side
    negotiation explicitly deferred. Status: OPEN → Task 13 (docs labeling; no code).

- [ ] **Step 3: Commit**

```bash
cd /Users/cvardema/dev/git/LA3D/agents/lws-pod
git add docs/superpowers/specs/2026-07-18-lws-core-requirement-matrix.md
git commit -m "$(cat <<'EOF'
[Agent: Claude] docs(spec): matrix round-3 addendum — PROF/conneg closeout (R12-R17)

- R12 direct-response rel=profile; R13 q robustness; R14 joint selection
- R15 profile-axis ETag pins; R16 subset naming; R17 write-contract label

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Fork — `parseAcceptProfile` robustness (R13/F3)

**Files:**
- Modify: `/Users/cvardema/dev/git/LA3D/JavaScriptSolidServer/src/rdf/conneg.js:156-168`
- Test: `/Users/cvardema/dev/git/LA3D/JavaScriptSolidServer/test/conneg-accept-profile.test.js`

**Interfaces:**
- Consumes: nothing new.
- Produces: `parseAcceptProfile(header) -> string[]` (same signature; q=0 entries now dropped,
  weights clamped to [0,1]). Task 3's `negotiateProfile` and Task 12's live gate rely on the
  q=0-discard behavior.

- [ ] **Step 1: Create the branch** (first fork task only):

```bash
cd /Users/cvardema/dev/git/LA3D/JavaScriptSolidServer
git checkout la3d/lws && git pull && git rev-parse HEAD   # expect e74a2bb2dbc0ec60a1277595c7a85a9b696d36d2
git checkout -b la3d/lws-profconneg
```

- [ ] **Step 2: Write failing tests** — append to `test/conneg-accept-profile.test.js`, matching its
  existing `node:test` style:

```js
test('R13: q=0 entry is discarded (RFC 9110 §12.5.1 "not acceptable")', () => {
  assert.deepEqual(parseAcceptProfile('<https://p/a>;q=0, <https://p/b>;q=0.5'), ['https://p/b']);
});
test('R13: all-q=0 header yields empty list (degrades to outcome none)', () => {
  assert.deepEqual(parseAcceptProfile('<https://p/a>;q=0'), []);
});
test('R13: out-of-range q clamps into [0,1] — q=2 no longer outranks q=1', () => {
  assert.deepEqual(parseAcceptProfile('<https://p/a>;q=2, <https://p/b>'), ['https://p/a', 'https://p/b']);
  // clamped to 1.0 each; stable input order breaks the tie — b would LOSE its
  // rightful tie if 2.0 were kept (it used to sort strictly above q=1)
  assert.deepEqual(parseAcceptProfile('<https://p/a>, <https://p/b>;q=2'), ['https://p/a', 'https://p/b']);
});
test('R13: negative q clamps to 0 and is discarded', () => {
  assert.deepEqual(parseAcceptProfile('<https://p/a>;q=-1, <https://p/b>'), ['https://p/b']);
});
test('R13: non-numeric q stays 1.0 (unchanged behavior, now pinned)', () => {
  assert.deepEqual(parseAcceptProfile('<https://p/a>;q=abc, <https://p/b>;q=0.5'), ['https://p/a', 'https://p/b']);
});
```

- [ ] **Step 3: Run to verify failure**:
`node --test --test-concurrency=1 --test-force-exit test/conneg-accept-profile.test.js` — expect the
q=0/clamp tests FAIL (today q=0 sorts last but survives; q=2 is kept).

- [ ] **Step 4: Implement** — in `parseAcceptProfile`, replace the q line and add the filter:

```js
    const qParam = params.find((p) => p.toLowerCase().startsWith('q='));
    const qRaw = qParam ? parseFloat(qParam.slice(2)) : 1.0;
    // R13 (RFC 9110 robustness): clamp out-of-range weights into [0,1];
    // non-numeric falls back to 1.0. q=0 is §12.5.1 "explicitly not
    // acceptable" — discarded below, matching this file's media-type
    // consumers (acceptSatisfiable/acceptsHtml).
    const q = Number.isFinite(qRaw) ? Math.min(Math.max(qRaw, 0), 1) : 1.0;
    return { uri, q, i };
  }).filter((p) => p.uri && p.q !== 0);
```

(The existing `.filter((p) => p.uri)` line is replaced by this combined filter.)

- [ ] **Step 5: Run the file green**, then the neighbors that consume it:
`node --test --test-concurrency=1 --test-force-exit test/conneg-negotiate.test.js` and
`test/lws-profile-conneg-get.test.js` — all green.

- [ ] **Step 6: Commit** (`git add src/rdf/conneg.js test/conneg-accept-profile.test.js`):
`[Agent: Claude] fix(conneg): R13 Accept-Profile q robustness — discard q=0, clamp [0,1]`.

---

### Task 3: Fork — joint media+profile selection (R14/F4)

**Files:**
- Modify: `/Users/cvardema/dev/git/LA3D/JavaScriptSolidServer/src/rdf/conneg.js:170-192`
- Modify: `/Users/cvardema/dev/git/LA3D/JavaScriptSolidServer/src/handlers/resource.js` — the three
  `negotiateProfile(` call sites (container GET ~988, file GET ~1202, HEAD ~2232)
- Test: `/Users/cvardema/dev/git/LA3D/JavaScriptSolidServer/test/conneg-negotiate.test.js`

**Interfaces:**
- Consumes: Task 2's `parseAcceptProfile` (q=0 discarded); module-private `parseAcceptHeader`.
- Produces: `negotiateProfile(acceptProfileHeader, representations, acceptHeader = '') ->
  {outcome, rep}` — third parameter NEW, optional, so existing callers/tests stay valid. Tasks 5, 6,
  12 rely on: multiple same-profile matches resolved by Accept media (q-ordered, q=0 excluded),
  tie/no-Accept → default slot first, then alternate declaration order.

- [ ] **Step 1: Write failing tests** — append to `test/conneg-negotiate.test.js`:

```js
const dupReps = {
  default: { href: RES, format: 'text/markdown', profile: 'https://p/shared' },
  alternates: [
    { href: RES + '.data.jsonld', format: 'application/ld+json', profile: 'https://p/shared' },
    { href: RES + '.page.html', format: 'text/html', profile: 'https://p/shared' },
  ],
};
test('R14: same profile on 3 reps, Accept text/html picks the html alternate', () => {
  const r = negotiateProfile('<https://p/shared>', dupReps, 'text/html');
  assert.equal(r.outcome, 'redirect');
  assert.equal(r.rep.href, RES + '.page.html');
});
test('R14: Accept application/ld+json picks the jsonld alternate', () => {
  const r = negotiateProfile('<https://p/shared>', dupReps, 'application/ld+json');
  assert.equal(r.rep.href, RES + '.data.jsonld');
});
test('R14: no Accept → default slot wins the duplicate set', () => {
  const r = negotiateProfile('<https://p/shared>', dupReps, '');
  assert.equal(r.outcome, 'self');
});
test('R14: Accept matching nothing in the set → default slot (tie-break, not 406)', () => {
  const r = negotiateProfile('<https://p/shared>', dupReps, 'image/png');
  assert.equal(r.outcome, 'self');
});
test('R14: Accept q-order respected — html;q=0.1, ld+json;q=0.9 picks jsonld', () => {
  const r = negotiateProfile('<https://p/shared>', dupReps, 'text/html;q=0.1, application/ld+json;q=0.9');
  assert.equal(r.rep.href, RES + '.data.jsonld');
});
test('R14: Accept q=0 excludes a media type from disambiguation', () => {
  const r = negotiateProfile('<https://p/shared>', dupReps, 'text/html;q=0, application/ld+json');
  assert.equal(r.rep.href, RES + '.data.jsonld');
});
test('R14: single match ignores Accept entirely (unchanged fast path)', () => {
  const r = negotiateProfile('<https://p/links>', reps, 'text/html');
  assert.equal(r.rep.href, RES + '.links.jsonld');
});
test('R14: wildcard Accept */* picks first in declaration order (default first)', () => {
  const r = negotiateProfile('<https://p/shared>', dupReps, '*/*');
  assert.equal(r.outcome, 'self');
});
```

- [ ] **Step 2: Run to verify failure** — the dupReps html/jsonld picks currently return `self`
  (default checked first, Accept ignored).

- [ ] **Step 3: Implement** — replace `negotiateProfile` (KEEP the existing slot-not-href comment,
  now above the `matches.push` lines) and add the private helper:

```js
export function negotiateProfile(acceptProfileHeader, representations, acceptHeader = '') {
  const requested = parseAcceptProfile(acceptProfileHeader);
  if (!requested.length) return { outcome: 'none', rep: null };
  for (const wanted of requested) {              // preference order; EXACT match (no hierarchy — P13)
    // Outcome is decided by WHICH SLOT matched, never by href equality: an
    // alternate whose href collapses to the resource's own URL (blank-node/
    // self-authored) must not serve the default's bytes under the alternate's
    // profile (mis-stamp). Default pushed first, so a duplicate profile
    // declaration tie-breaks to 'self'.
    const matches = [];
    if (representations?.default?.profile === wanted) matches.push({ outcome: 'self', rep: representations.default });
    for (const r of representations?.alternates || []) {
      if (r.profile === wanted) matches.push({ outcome: 'redirect', rep: r });
    }
    if (!matches.length) continue;
    // R14: any application may declare several representations under one
    // profile — the request's media preference (Accept, q-ordered, q=0
    // excluded) disambiguates; tie or no Accept → declaration order (default
    // slot first). Deterministic and taught in the capability hint.
    return matches.length === 1 ? matches[0] : pickByMedia(matches, acceptHeader);
  }
  return { outcome: 'notacceptable', rep: null };
}

function pickByMedia(matches, acceptHeader) {
  if (acceptHeader && acceptHeader.trim()) {
    const hit = (type, format) => {
      const main = (format || '').split(';')[0].trim().toLowerCase();
      return main && (type === '*/*' || type === main || type === `${main.split('/')[0]}/*`);
    };
    for (const { type, q } of parseAcceptHeader(acceptHeader)) {
      if (q === 0) continue;
      const m = matches.find((x) => hit(type, x.rep.format));
      if (m) return m;
    }
  }
  return matches[0];
}
```

- [ ] **Step 4: Thread the Accept header at the three call sites** in `src/handlers/resource.js` —
  each `negotiateProfile(request.headers['accept-profile'], reps)` becomes
  `negotiateProfile(request.headers['accept-profile'], reps, request.headers.accept || '')`.

- [ ] **Step 5: Run green**: `test/conneg-negotiate.test.js`, `test/conneg-accept-profile.test.js`,
  `test/lws-profile-conneg-get.test.js`, `test/lws-profile-conneg-head-container.test.js`
  (individually, `--test-concurrency=1 --test-force-exit`).

- [ ] **Step 6: Commit**: `[Agent: Claude] feat(conneg): R14 joint media+profile selection among
  same-profile representations`.

---

### Task 4: Fork — un-negotiated profile stamp (R12/F1)

**Files:**
- Modify: `/Users/cvardema/dev/git/LA3D/JavaScriptSolidServer/src/ldp/headers.js:129-182`
- Test: `/Users/cvardema/dev/git/LA3D/JavaScriptSolidServer/test/lws-profile-conneg-get.test.js`,
  `test/lws-profile-conneg-head-container.test.js`

**Interfaces:**
- Consumes: `getAllHeaders({..., chosenProfile, representations, contentType})` — every GET/HEAD
  serve branch already passes `representations: advertisedReps` and its served `contentType`
  (resource.js bare paths load `advertisedReps` behind a `storage.exists(storagePath + '.meta')`
  gate at ~1039/1261/2279).
- Produces: getAllHeaders stamps `Content-Profile: <uri>` + `Link rel="profile"` for UN-negotiated
  responses whose served media type equals the declared default representation's `dct:format`.
  Task 10's per-face `.meta` and Task 12's live pins rely on exactly this rule.

- [ ] **Step 1: Write failing integration tests.** In `test/lws-profile-conneg-get.test.js`, follow
  the file's existing server/pod setup and `.meta` fixture helpers (read the file first; reuse its
  `altr:` fixture-writing helper) to add a describe block:

```js
// R12 (spec 2026-07-19): un-negotiated responses identify the default rep's profile.
test('R12: bare GET (no Accept-Profile) of a resource with a declared default rep carries Content-Profile + Link rel=profile', async () => {
  // fixture: resource text/markdown, .meta altr:hasDefaultRepresentation
  // {href: self, format: 'text/markdown', profile: PROFILE_A}
  const res = await fetch(resourceUrl);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('content-profile'), `<${PROFILE_A}>`);
  assert.ok(res.headers.get('link').includes(`<${PROFILE_A}>; rel="profile"`));
});
test('R12: media-converted response does NOT carry the default rep profile', async () => {
  // fixture: turtle resource whose .meta declares default {format: 'text/turtle', profile: PROFILE_A};
  // GET with Accept: application/ld+json converts — served type ≠ declared format → no stamp
  const res = await fetch(rdfResourceUrl, { headers: { accept: 'application/ld+json' } });
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('content-profile'), null);
});
test('R12: resource with NO .meta stays byte-identical (no stamp, no rep links)', async () => {
  const res = await fetch(bareResourceUrl);
  assert.equal(res.headers.get('content-profile'), null);
});
test('R12: negotiated self-outcome still stamps (chosenProfile precedence unchanged)', async () => {
  const res = await fetch(resourceUrl, { headers: { 'accept-profile': `<${PROFILE_A}>` } });
  assert.equal(res.headers.get('content-profile'), `<${PROFILE_A}>`);
});
```

In `test/lws-profile-conneg-head-container.test.js` add HEAD parity: `HEAD` of the markdown fixture
asserts the same `content-profile`/`link` headers as GET (containers are NOT stamped — the wiki
family gives containers no default rep, and a container with none must stay stamp-free; add that
negative: HEAD/GET of a container whose `.meta` has only `altr:hasRepresentation` alternates → no
`Content-Profile`).

- [ ] **Step 2: Run to verify failure** (bare-GET stamp tests fail; negatives pass).

- [ ] **Step 3: Implement in `src/ldp/headers.js`** — add above `getAllHeaders`:

```js
// R12 (spec 2026-07-19, DX-PROF-CONNEG R.1.2.a): an UN-negotiated response
// still identifies its representation's profile — but only when the served
// body IS the declared default representation. The guard is media equality:
// a converted variant (turtle→JSON-LD, a server-rendered nav face) must
// never carry the declared representation's profile claim.
function defaultProfileFor(representations, contentType) {
  const d = representations?.default;
  if (!d?.profile || !d.format || !contentType) return null;
  const served = contentType.split(';')[0].trim().toLowerCase();
  const declared = d.format.split(';')[0].trim().toLowerCase();
  return served === declared ? d.profile : null;
}
```

and in `getAllHeaders`, replace the `if (chosenProfile) {` block's condition:

```js
  const stampProfile = chosenProfile || defaultProfileFor(representations, contentType);
  if (stampProfile) {
    const profileLink = `<${stampProfile}>; rel="profile"`;
    headers['Content-Profile'] = `<${stampProfile}>`;
    headers['Link'] = headers['Link'] ? `${headers['Link']}, ${profileLink}` : profileLink;
  }
```

Update the `chosenProfile` JSDoc: negotiated 'self' passes it explicitly; un-negotiated responses
derive the stamp from `representations.default` under the media-equality guard (R12).

- [ ] **Step 4: Run green** — both test files, then the header unit file if one exists
  (`ls test/ | grep -i header`), then the neighbors: `test/lws-navigator-root.test.js`,
  `test/lws-discovery-conformance.test.js` (individually).

- [ ] **Step 5: Full fork suite** `npm test` (background, ~5 min) — zero new failures. The
  known-flake and pre-existing skip counts are in Global Constraints.

- [ ] **Step 6: Commit**: `[Agent: Claude] feat(conneg): R12 un-negotiated profile stamp via
  getAllHeaders (media-equality guard)`.

---

### Task 5: Fork — profile-axis ETag/precedence pins (R15/F5)

**Files:**
- Test: `/Users/cvardema/dev/git/LA3D/JavaScriptSolidServer/test/lws-profile-conneg-get.test.js`

**Interfaces:**
- Consumes: Tasks 3–4 behavior. NO source changes expected — this task pins the spec §3 F5 claim:
  profile selection never changes bytes at a URL (self serves the default; alternates are 303s), so
  `VARIANT_KEYS` needs no profile component. If a test FALSIFIES the claim, STOP and report BLOCKED
  with the failing case — do not extend `VARIANT_KEYS` without review (the spec requires recording
  the falsification).

- [ ] **Step 1: Write the pin tests** (same fixtures as Task 4):

```js
test('R15: bare GET and negotiated-self GET share ETag AND bytes (same variant)', async () => {
  const bare = await fetch(resourceUrl);
  const neg = await fetch(resourceUrl, { headers: { 'accept-profile': `<${PROFILE_A}>` } });
  assert.equal(neg.headers.get('etag'), bare.headers.get('etag'));
  assert.equal(await neg.text(), await bare.text());
});
test('R15: 304 beats 303 — matching If-None-Match on a redirect-outcome request', async () => {
  const first = await fetch(resourceUrl);
  const res = await fetch(resourceUrl, { headers: {
    'accept-profile': `<${PROFILE_B}>`, 'if-none-match': first.headers.get('etag') } });
  assert.equal(res.status, 304);
});
test('R15: 406 beats 304 — unknown profile with matching If-None-Match still 406', async () => {
  const first = await fetch(resourceUrl);
  const res = await fetch(resourceUrl, { headers: {
    'accept-profile': '<https://p/unknown>', 'if-none-match': first.headers.get('etag') } });
  assert.equal(res.status, 406);
});
test('R15: R14 duplicate-set disambiguation does not perturb the self ETag', async () => {
  // dup fixture from Task 3's shape: default + same-profile alternates; no Accept → self
  const bare = await fetch(dupResourceUrl);
  const neg = await fetch(dupResourceUrl, { headers: { 'accept-profile': `<${SHARED_PROFILE}>` } });
  assert.equal(neg.status, 200);
  assert.equal(neg.headers.get('etag'), bare.headers.get('etag'));
});
```

- [ ] **Step 2: Run.** Expect ALL GREEN (these pin existing + Task-3/4 behavior). Any RED here =
  the F5 claim is falsified → BLOCKED report, no fix without review.

- [ ] **Step 3: Commit**: `[Agent: Claude] test(conneg): R15 profile-axis ETag coherence +
  406/304/303 precedence pins`.

---

### Task 6: Fork — teaching-surface rewrite (R16/F6)

**Files:**
- Modify: `/Users/cvardema/dev/git/LA3D/JavaScriptSolidServer/src/lws/storage-description.js:184`
- Modify: `/Users/cvardema/dev/git/LA3D/JavaScriptSolidServer/src/rdf/serve.js:88-96`
- Modify: `/Users/cvardema/dev/git/LA3D/JavaScriptSolidServer/src/handlers/resource.js:154-165`
- Modify: `/Users/cvardema/dev/git/LA3D/JavaScriptSolidServer/src/mcp/tools.js:468`
- Test: whatever pins the old strings — find with
  `grep -rln 'negotiates by profile\|conformsTo-uri\|profile-negotiated' test/`

**Interfaces:**
- Consumes: R14 selection rule wording (Task 3).
- Produces: hint strings that Task 12's live gate pins (`exact` must appear in the SD capability
  hint and the profile-406 detail).

- [ ] **Step 1: Replace the four strings.** These are agent-facing contracts — full sentences, no
  jargon, stating (a) exact-URI match, (b) where the complete set of valid URIs is enumerated,
  (c) the R14 rule, (d) tokens/hierarchy unsupported.

`storage-description.js:184` hint (capability `type` stays
`http://www.w3.org/ns/dx/connegp/profile/http` — the subset conforms):

```js
      hint: 'This storage negotiates representations by profile (a subset of W3C Content Negotiation by Profile): matching is by EXACT profile URI — token forms and isProfileOf hierarchy walking are not supported. Send Accept-Profile: <profile-uri> using a URI this resource declares; the complete set is enumerated in its linkset (Accept: application/linkset+json — canonical/alternate links with type=media, formats=profile) and repeated by any profile 406. When several representations share the requested profile, the Accept media type picks among them; ties go to the default representation, then declaration order.',
```

`serve.js` `nonRdfNotAcceptable` route strings:

```js
  const route = hasAlternates
    ? ' Its declared representations are in the Link header (rel="canonical"/"alternate"); send Accept-Profile: <profile-uri> with an exact URI from a formats= attribute to negotiate one (tokens and profile hierarchy are not supported).'
    : ' If this resource has profile-negotiated representations, send Accept-Profile: <profile-uri> with an exact declared profile URI (its linkset, Accept: application/linkset+json, lists what is declared; tokens and profile hierarchy are not supported).';
```

`resource.js` `profileNotAcceptableProblem` detail:

```js
    detail: `no representation conforms to the requested profile(s); matching is by exact profile URI (tokens and isProfileOf hierarchy are not supported). Profiles that conform: ${conforming.length ? conforming.join(', ') : '(none declared)'}.`,
```

`mcp/tools.js:468` hint:

```js
    hint: 'representations are negotiable via Accept-Profile: <conformsTo-uri> (exact URI match; tokens and profile hierarchy are not supported); alternates are listed as rel=alternate',
```

- [ ] **Step 2: Fix pinned tests.** Grep per above; update every assertion pinning the old
  sentences to the new ones (assert on stable substrings: `'EXACT profile URI'` /
  `'exact profile URI'`, `'formats='`). Run each touched test file individually.

- [ ] **Step 3: Run** `test/lws-storage-description.test.js`, `test/mcp-read-tools.test.js`, and
  the grep hits — green.

- [ ] **Step 4: Commit**: `[Agent: Claude] docs(conneg): R16 teaching surface names the
  exact-match URI-only subset`.

---

### Task 7: Fork — full suite, merge, push

**Files:** none new (merge task).

- [ ] **Step 1:** `npm test` full suite green (report exact counts vs the 1776/0/1 baseline; new
  tests raise the pass count — zero FAILING is the gate).
- [ ] **Step 2:** Whole-branch review happens per the SDD process BEFORE this merge (dispatcher's
  responsibility — do not skip).
- [ ] **Step 3: Merge + push**:

```bash
cd /Users/cvardema/dev/git/LA3D/JavaScriptSolidServer
git checkout la3d/lws
git merge --no-ff la3d/lws-profconneg -m "$(cat <<'EOF'
[Agent: Claude] merge: PROF/conneg closeout round (R12-R16 fork side)

- R12 un-negotiated profile stamp (getAllHeaders, media-equality guard)
- R13 Accept-Profile q robustness; R14 joint media+profile selection
- R15 ETag/precedence pins; R16 exact-match subset teaching surface

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
git push origin la3d/lws
git rev-parse HEAD   # RECORD this SHA — Task 11's repin needs it
```

---

### Task 8: lws-pod — loader conventions (P3): self-document check + merge conflict rule

**Files:**
- Modify: `projection/publish/checks.mjs:46-54` (`checkDescriptor`)
- Modify: `projection/prof/profile-loader.mjs:34-83` (`dispatch`/`walk`/`loadProfile`)
- Test: `projection/publish/checks.test.mjs`, `projection/prof/profile-loader.test.mjs`

**Interfaces:**
- Consumes: nothing from fork tasks (independent).
- Produces: `checkDescriptor` rejects descriptors whose top-level `@id` isn't `''`/the doc URL;
  `loadProfile` resolves singletons nearest-wins by walk depth and THROWS
  `profile merge conflict: '<key>' …` on equal-depth disagreement. Task 9's new descriptors must
  pass the new check.

- [ ] **Step 1: Failing tests — checks.** Append to `projection/publish/checks.test.mjs` (vitest,
  follow the file's existing `checkDescriptor` cases for the loader stub):

```js
it('P3a: descriptor whose @id is a foreign URL fails the self-document check', async () => {
  const doc = JSON.stringify({ '@context': ctx, '@id': 'https://elsewhere.example/p', '@type': 'Profile', hasToken: 'x' })
  const out = await checkDescriptor(doc, 'https://pod.example/profiles/p.jsonld', loader)
  expect(out.some((f) => f.includes("'@id' must be ''"))).toBe(true)
})
it('P3a: missing @id fails (blank-node subject reads as zero PROF facts)', async () => {
  const doc = JSON.stringify({ '@context': ctx, '@type': 'Profile', hasToken: 'x' })
  const out = await checkDescriptor(doc, 'https://pod.example/profiles/p.jsonld', loader)
  expect(out.some((f) => f.includes("'@id' must be ''"))).toBe(true)
})
it("P3a: '@id': '' passes (existing descriptors unchanged)", async () => {
  // reuse the file's existing known-good descriptor fixture — expect no self-document failure
})
```

(`ctx` = the same context object/URL the file's existing descriptor fixtures use.)

- [ ] **Step 2: Failing tests — loader.** Append to `projection/prof/profile-loader.test.mjs`,
  using its existing `fetchFn` stub pattern (descriptor JSON keyed by URL). Build a diamond:
  root R → parents A, B; A and B each declare `lwspr:identity-policy` artifacts with DIFFERENT
  JSON bodies:

```js
it('P3b: equal-depth parents disagreeing on identityPolicy throw a named conflict', async () => {
  await expect(loadProfile(R_URL, { fetchFn: stub })).rejects.toThrow(/profile merge conflict: 'identityPolicy'/)
})
it('P3b: equal-depth parents AGREEING (identical JSON) do not throw', async () => {
  // same diamond, B's identity artifact byte-identical to A's → resolves
})
it('P3b: nearer parent beats a farther ancestor regardless of walk order', async () => {
  // chain R → A → GA; GA and A both declare identity-policy; loaded value must be A's
  // (today this already holds for chains — pin it; the DAG case was the bug)
})
it('P3b: the root profile itself (depth 0) overrides every parent without conflict', async () => {
  // R declares its own identity-policy; A/B disagree underneath → no throw, R wins
})
```

- [ ] **Step 3: Run to verify failure** (`cd projection && npx vitest run publish/checks.test.mjs
  prof/profile-loader.test.mjs`).

- [ ] **Step 4: Implement — checks.mjs.** In `checkDescriptor`, after the `prof:Profile`-typed check
  (line ~51), add:

```js
  // P3a (spec 2026-07-19 §4): profile-doc.mjs reads every PROF fact off
  // subject === descriptorUrl, guaranteed by the authoring convention
  // `"@id": ""`. Enforce it: a descriptor with a foreign/missing subject
  // silently reads as zero facts — fail loud instead.
  let doc = null
  try { doc = JSON.parse(jsonText) } catch { /* unreachable: jsonldToQuads succeeded above */ }
  const id = doc?.['@id']
  if (id !== '' && id !== url)
    return [`descriptor ${url}: top-level '@id' must be '' (self-document convention; got ${JSON.stringify(id)})`]
```

- [ ] **Step 5: Implement — profile-loader.mjs.** Singleton assignment becomes depth-aware:

```js
// P3b (spec 2026-07-19 §4): singleton configs resolve NEAREST-WINS by walk
// depth (child 0, parents 1, grandparents 2, …). Equal-depth disagreement is
// a hard error naming both sources — silence here was last-writer-wins by
// walk order, which let a FARTHER ancestor beat a nearer parent (parents-
// first recursion dispatches grandparents before the next sibling parent).
function assignSingleton(acc, key, value, depth, source) {
  const cur = acc._singleton[key]
  if (!cur || depth < cur.depth) { acc._singleton[key] = { value, depth, source }; acc[key] = value; return }
  if (depth === cur.depth && JSON.stringify(cur.value) !== JSON.stringify(value))
    throw new Error(`profile merge conflict: '${key}' from equally-near ${cur.source} and ${source} disagree — the child profile must declare its own`)
}
```

`dispatch(resources, acc, fetchFn, depth)` gains the param; the two singleton lines become:

```js
      else if (role === LWSP_ROLE + 'identity-policy') assignSingleton(acc, 'identityPolicy', await fetchJson(r.artifact, fetchFn), depth, r.artifact)
      else if (role === LWSP_ROLE + 'plane-mapping') assignSingleton(acc, 'planeMapping', await fetchJson(r.artifact, fetchFn), depth, r.artifact)
```

`walk(url, acc, visited, fetchFn, depth)`: recurse parents with `depth + 1`, dispatch own resources
with `depth`. `loadProfile`: `acc._singleton = {}` at init; root parents walked at depth 1; root
resources dispatched at depth 0; `delete acc._singleton` before `return`.

- [ ] **Step 6: Run green** — the two files, then the full projection suite
  (`cd projection && npx vitest run`) — the existing wiki/dcat load paths are single-parent chains
  and must stay green untouched.

- [ ] **Step 7: Commit** (stage the four files):
  `[Agent: Claude] feat(projection): P3 loader conventions — self-document check + nearest-wins/conflict rule`.

---

### Task 9: lws-pod — mint viewing profiles (P1) + token-claim retraction (P4)

**Files:**
- Create: `projection/profiles/defs/llm-wiki/view.profile.jsonld`, `projection/profiles/defs/llm-wiki/viz.profile.jsonld`
- Modify: `projection/profiles/defs/llm-wiki/html.rep.jsonld`, `index-html.rep.jsonld`, `viz.rep.jsonld`
- Modify: `projection/profiles/defs/index.jsonld` (manifest `profiles` list)
- Modify: docs claiming `hasToken` negotiation (grep-driven, see Step 4)
- Test: `projection/publish/defs.test.mjs` (+ any test pinning rep `conformsTo` — grep)

**Interfaces:**
- Consumes: Task 8's checkDescriptor (new descriptors must pass it and `descriptor-shape.ttl`,
  which REQUIRES exactly one `hasToken` — tokens stay declaration-side per P4).
- Produces: published profile URLs
  `<container>llm-wiki/view.profile.jsonld` and `<container>llm-wiki/viz.profile.jsonld` — Task 11's
  reinstantiate puts them live; Task 12 pins the live URIs.

- [ ] **Step 1: Create the two descriptors** (pattern: `okf-base.jsonld`; NO `isProfileOf` — a view
  is not a narrowing of the information profile; NO `hasResource` — the shape allows zero):

`view.profile.jsonld`:
```json
{
  "@context": "../profiles-compact.context.jsonld",
  "@id": "",
  "@type": "Profile",
  "hasToken": "llm-wiki-view",
  "dct:title": "llm-wiki viewing profile — server-rendered HTML page view of okf-base content (a view of the information profile, deliberately not isProfileOf it)"
}
```

`viz.profile.jsonld`:
```json
{
  "@context": "../profiles-compact.context.jsonld",
  "@id": "",
  "@type": "Profile",
  "hasToken": "llm-wiki-viz",
  "dct:title": "llm-wiki visualization profile — HTML graph-visualization view of the wiki dataset (a view of the information profile, deliberately not isProfileOf it)"
}
```

- [ ] **Step 2: Repoint the three rep defs** (`conformsTo` resolves relative to the REP ARTIFACT's
  URL — same directory, so bare filenames):

```json
{ "id": "html", "suffix": ".html", "format": "text/html", "conformsTo": "view.profile.jsonld" }
{ "id": "index-html", "target": "index.html", "format": "text/html", "conformsTo": "view.profile.jsonld" }
{ "id": "viz", "target": "viz.html", "format": "text/html", "conformsTo": "viz.profile.jsonld" }
```

- [ ] **Step 3: Manifest** — in `index.jsonld`, extend `profiles`:

```json
  "profiles": ["substrate-floor.jsonld", "okf-base.jsonld", "llm-wiki/profile.jsonld",
               "llm-wiki/view.profile.jsonld", "llm-wiki/viz.profile.jsonld", "dcat-catalog/profile.jsonld"],
```

- [ ] **Step 4: Token-claim retraction (P4).** `grep -rn 'hasToken' docs/ projection/ apps/ --include='*.md' --include='*.mjs' -l`
  — in every DOC that promises token-based *negotiation* (the known claim class from the
  2026-07-18 audit; check `docs/superpowers/specs/2026-06-28-general-memory-substrate-design.md`
  and `docs/design-notes/`), append/reword to: *"`prof:hasToken` is declaration-side metadata only;
  server-side selection is exact-profile-URI (2026-07-19 closeout, R16)."* Add the same one-line
  note as a code comment where `profile-doc.mjs:20` parses it. Do NOT touch the verbatim
  `.claude/skills/` trees (grounded-skills contract).

- [ ] **Step 5: Run the checks + tests**:
  `cd projection && node publish/publish.mjs --base https://pod.vardeman.me --container /alice/profiles/ --check`
  (offline: reads local defs, exits before any write) — expect `checks passed for 6 profile(s)`.
  Then the unit surface: `npx vitest run publish/checks.test.mjs publish/defs.test.mjs` and fix
  `defs.test.mjs` pins (it validates the defs tree/manifest — the
  new descriptors + 6-entry profiles list will drift any count/content pins). Then grep the repo's
  OTHER test pins: `grep -rn 'okf-base' projection apps tests --include='*.test.mjs' -l` — update
  any test asserting html/index-html/viz `conformsTo` okf-base/llm-wiki (expect hits in
  `apps/wiki-projector` engine/renderer tests; `make test-projection` must end green).

- [ ] **Step 6: Commit**:
  `[Agent: Claude] feat(profiles): P1 mint llm-wiki view/viz profiles; P4 hasToken = declaration-side only`.

---

### Task 10: lws-pod — per-face `.meta` in instantiate (P2)

**Files:**
- Modify: `projection/prof/instantiate.mjs:152-196`
- Test: `projection/prof/instantiate.test.mjs`

**Interfaces:**
- Consumes: existing `advertise(resourceUrl, token, dflt, alternates, fetchFn)` and
  `repEntry(href, rep)` (both in the same file, unchanged).
- Produces: every materialized face `<target>` also gets `<target>.meta` carrying
  `altr:hasDefaultRepresentation` = itself (href/format/conformsTo). This is the data source for
  Task 4's stamp on direct-alternate GETs (fork F2). Task 12 pins it live.

- [ ] **Step 1: Failing tests.** In `projection/prof/instantiate.test.mjs`, follow the file's
  existing fetch-stub pattern (it records PUTs by URL) and assert:

```js
it('P2: a member face gets its own .meta declaring itself as default rep', async () => {
  // after instantiate(): among recorded PUTs there is `${memberUrl}.html.meta` whose body parses
  // to altr:hasDefaultRepresentation with '@id' === `${memberUrl}.html`,
  // 'dct:format' === 'text/html', 'dct:conformsTo'['@id'] === rep.conformsTo
})
it('P2: a container-level face (target rep) gets its own .meta default self-entry', async () => {
  // same assertion for `${containerUrl}index.html.meta`
})
it('P2: a derived-view (mode) face gets its own .meta default self-entry', async () => {})
it('P2: the SOURCE resource .meta advertisement is unchanged (default=self rep, alternates=faces)', async () => {
  // pin the existing shape so the new writes provably did not perturb it
})
```

- [ ] **Step 2: Run to verify failure.**

- [ ] **Step 3: Implement.** Member-rep loop — after `results.push({ rep: rep.id, target, status:
  put.status })` (line ~168) and BEFORE `alternates.push(...)`:

```js
      // P2 (spec 2026-07-19 §4): the face's OWN .meta declares itself as its
      // default representation, so a direct GET of the face carries its
      // profile via the fork's un-negotiated stamp (R12) — data, not fork
      // special-casing. Rides AFTER mirrorAcl: the face's .meta write binds
      // WRITE-on-subject, and a private member's face ACL is already in place.
      results.push(await advertise(target, token, repEntry(target, rep), [], fetchFn))
```

Container-rep loop — same line after BOTH arms' `results.push({ rep: rep.id, ... })` (the
`materializeDerivedView` arm uses `out.target`; the renderer arm uses `target`):

```js
      results.push(await advertise(out.target, token, repEntry(out.target, rep), [], fetchFn))
```
```js
      results.push(await advertise(target, token, repEntry(target, rep), [], fetchFn))
```

- [ ] **Step 4: Run green** — `npx vitest run prof/instantiate.test.mjs`, then the whole projection
  suite (`npx vitest run` in `projection/`) and `make test-projection` from the repo root.

- [ ] **Step 5: Commit**: `[Agent: Claude] feat(projection): P2 per-face .meta — faces declare
  themselves default reps (R12 data source)`.

---

### Task 11: lws-pod — rig repin + reinstantiate + existing-gate drift

**Files:**
- Modify: `Dockerfile.fork` (`ARG JSS_GIT_REF=`), `docker-compose.fork-tls.yml` (`JSS_GIT_REF`
  build-arg — BOTH must move; compose's fallback shadows the Dockerfile ARG)
- Modify: any drifted pins in `tests/lws-conneg.test.mjs`, `tests/lws-viewer.test.mjs`,
  `tests/lws-wiki.test.mjs` (grep-driven)

**Interfaces:**
- Consumes: Task 7's merged fork SHA; Tasks 9–10's defs/instantiate changes.
- Produces: live rig at the new fork ref with the wiki family re-instantiated under the new
  profiles + face `.meta`s. Task 12 runs against this rig.

- [ ] **Step 1: Repin** both files to Task 7's full 40-char SHA.
- [ ] **Step 2: Rebuild + restart**: `make up-fork-tls` (build with the new ref), then
  `docker restart lws-pod-fork` (data-preserving — clears the `/.pods` 1/IP/day counter without
  wiping `./data`), wait ~10s, verify:
  `curl -s --cacert certs/rootCA.pem https://pod.vardeman.me/.well-known/lws-storage | head -c 200`.
- [ ] **Step 3: Reinstantiate**: `make reinstantiate` — republishes defs (new descriptors land) and
  re-materializes/re-advertises the wiki family (face `.meta`s appear, faces now conform to
  view/viz profiles). Spot-verify live:

```bash
# pick a seeded card first: curl -s --cacert certs/rootCA.pem -H 'Accept: application/lws+json' https://pod.vardeman.me/alice/wiki/ | grep -o '[a-z-]*\.md' | head -1  (a.md in the standard seed)
curl -s --cacert certs/rootCA.pem https://pod.vardeman.me/alice/wiki/<card>.html.meta -H 'Accept: application/ld+json' | head -c 400   # expect altr:hasDefaultRepresentation self-entry (may need owner bearer if private)
curl -sI --cacert certs/rootCA.pem https://pod.vardeman.me/alice/wiki/<card> | grep -i content-profile   # expect <…okf-base.jsonld>
```

- [ ] **Step 4: Run the FULL existing sweep** (space runs ~40s: anon rate limit):
  `make test && make test-lws && make test-l3 && make test-typeindex && make test-indexed-relation
  && make test-mcp-v2 && make test-profiles && make test-dcat && make test-graph && make
  test-conneg && make test-preservation && make test-void && make test-referent && make
  test-multitenant && make test-nextfork && make test-conformance && make test-services && make
  test-wiki && make test-projection && make test-viewer`. Fix drifted pins ONLY where the assertion
  encodes the OLD behavior this round deliberately changed (html-face `conformsTo` okf-base;
  absence of `Content-Profile` on bare GETs; old hint sentences). Anything else RED = report
  BLOCKED, don't paper over.
- [ ] **Step 5: Commit**: `[Agent: Claude] feat(rig): repin fork <shortsha> — PROF/conneg closeout
  round` (+ a separate commit for pin-drift test fixes if any:
  `test(gates): re-pin drifted expectations for R12/P1`).

---

### Task 12: lws-pod — live gate `make test-profneg`

**Files:**
- Create: `tests/lws-profneg.test.mjs`
- Modify: `Makefile` (target + `.PHONY`), `README.md` (gate table row)

**Interfaces:**
- Consumes: `tests/helpers.mjs` (`BASE`, `getToken`); the live rig from Task 11; profile URLs
  `${BASE}/alice/profiles/llm-wiki/{profile.jsonld,view.profile.jsonld}` and
  `${BASE}/alice/profiles/okf-base.jsonld`.
- Produces: the acceptance gate (spec §5). Neutral fixture profiles are OPAQUE URIs (never
  dereferenced by the fork — exact-string matching), under `/alice/profneg/`.

- [ ] **Step 1: Write the gate.** Model on `tests/lws-services.test.mjs` (probe-once self-skip;
  vitest). Fixture setup in `beforeAll` with alice's owner bearer (reuse the alice credential
  pattern from `tests/lws-wiki.test.mjs` — read it first): PUT
  `/alice/profneg/doc.md` (`text/markdown`, body `# neutral fixture\n`),
  `/alice/profneg/doc.md.data.jsonld` (`application/ld+json`, body `{"@id":"","x":1}`),
  `/alice/profneg/doc.md.page.html` (`text/html`, body `<!DOCTYPE html><p>x</p>`), then
  `/alice/profneg/doc.md.meta` (`application/ld+json`):

```json
{ "@context": { "altr": "http://www.w3.org/ns/dx/connegp/altr#", "dct": "http://purl.org/dc/terms/" },
  "@id": "",
  "altr:hasDefaultRepresentation": { "@id": "https://pod.vardeman.me/alice/profneg/doc.md",
    "dct:format": "text/markdown", "dct:conformsTo": { "@id": "https://profiles.invalid/neutral/md" } },
  "altr:hasRepresentation": [
    { "@id": "https://pod.vardeman.me/alice/profneg/doc.md.data.jsonld",
      "dct:format": "application/ld+json", "dct:conformsTo": { "@id": "https://profiles.invalid/neutral/shared" } },
    { "@id": "https://pod.vardeman.me/alice/profneg/doc.md.page.html",
      "dct:format": "text/html", "dct:conformsTo": { "@id": "https://profiles.invalid/neutral/shared" } } ] }
```

(Build the absolute hrefs from `BASE` in code, not hard-coded.) Also PUT
`/alice/profneg/doc.md.page.html.meta` declaring the html face as ITS OWN default
(`format text/html`, `conformsTo …/neutral/view`) — the neutral direct-alternate R12 pin.
Idempotent: plain re-PUTs each run.

Cases (each `it` self-contained; `V = 'https://profiles.invalid/neutral'`):

```
V1  R12: bare GET doc.md → 200, Content-Profile <V/md>, Link contains `<V/md>; rel="profile"`
V2  R12: HEAD doc.md → same two headers (GET/HEAD parity)
V3  R12: direct GET doc.md.page.html → Content-Profile <V/view> (per-face .meta, neutrally authored)
V4  R14: GET doc.md, Accept-Profile <V/shared>, Accept: text/html → 303, Location …page.html
V5  R14: same but Accept: application/ld+json → 303, Location …data.jsonld
V6  R14: same, NO Accept → 303 to the FIRST declared alternate (…data.jsonld)
V7  R13: Accept-Profile "<V/md>;q=0, <V/shared>;q=0.5" → 303 (q=0 discarded, shared wins)
V8  R16: Accept-Profile <V/unknown> → 406 problem+json; detail contains 'exact profile URI'
     and lists V/md + V/shared; Link lists canonical/alternate with formats=
V9  R15: If-None-Match from V1's ETag + Accept-Profile <V/unknown> → still 406
V10 R15: bare GET and Accept-Profile <V/md> GET share ETag; the latter is 200 (self)
V11 unreadable alternate — OWN fixture (so V1-V10 stay ACL-clean and idempotent): PUT
     doc2.md + doc2.md.data.jsonld + doc2.md.page.html + doc2.md.meta (same shape as doc.md's);
     owner write_acl owner-only on doc2.md.page.html (MCP write_acl, same pattern as the wiki
     gates use, else direct .acl PUT); anon GET doc2.md with Accept-Profile <V/shared> +
     Accept: text/html → 303 must NOT target page.html (the jsonld alternate wins — the private
     one is invisible); owner same request → 303 …page.html
W1  wiki: bare GET /alice/wiki/<a seeded card>.md → Content-Profile …okf-base.jsonld
W2  wiki: GET card with Accept-Profile <…llm-wiki/view.profile.jsonld> → 303 to …md.html
W3  wiki: GET card, Accept-Profile <…okf-base.jsonld>, Accept: text/html → 200 self markdown
     (only content conforms to okf-base now — html face minted away, R14 has one match)
W4  wiki: direct GET …md.html → Content-Profile …view.profile.jsonld (instantiate-written face .meta)
H1  R16: SD capability hint — GET /alice/lws-storage (Accept: application/lws+json), the
     connegp/profile/http capability hint contains 'EXACT profile URI'
```

Pick the seeded card by listing `/alice/wiki/` (`Accept: application/lws+json`, first `.md` item) —
don't hard-code a name.

- [ ] **Step 2: Makefile target** (mirror `test-services:` exactly, lines ~190-192):

```make
test-profneg:
	@[ -f certs/rootCA.pem ] || { echo "run 'make cert && make up-fork-tls' first"; exit 1; }
	BASE=https://pod.vardeman.me NODE_EXTRA_CA_CERTS=$(CURDIR)/certs/rootCA.pem npx vitest run tests/lws-profneg.test.mjs
```

Add `test-profneg` to the `.PHONY` line. README: one gate-table row next to the `test-services`
row (`make test-profneg` — PROF/conneg closeout live gate, R12–R16, needs `up-fork-tls`).

- [ ] **Step 3: Run** `make test-profneg` — all green (wait ~40s after Task 11's sweep). Re-run
  once to prove fixture idempotence.
- [ ] **Step 4: Commit**: `[Agent: Claude] test(conneg): live gate for the PROF/conneg closeout
  (V1-V11, W1-W4, H1)`.

---

### Task 13: Closeout — R17 labeling, matrix flip, FOLLOWUP, sweep

**Files:**
- Modify: `docs/superpowers/specs/2026-07-18-lws-core-requirement-matrix.md` (flip R12–R16 to ✅
  with closing commits; R17 → ✅ label-only)
- Modify: `FOLLOWUP.md` (new top block)
- Modify: `docs/foundations/05-jss-spec-conformance.md` ONLY IF it asserts token/hierarchy
  negotiation (grep `hasToken\|isProfileOf` — expected no-op; the full ledger rewrite is closeout
  item 5, NOT this round)

- [ ] **Step 1: R17 labeling.** Verify the R16 hint edits (Task 6) don't imply write-side
  negotiation; add one sentence to the matrix R17 row: contract = read-side negotiation + write
  declaration (`instantiate` PUTs carry `Link rel="profile"`; no 422 reactive negotiation —
  deferred round, recorded).
- [ ] **Step 2: Full live sweep** — the Task 11 list PLUS `make test-profneg` (21 gates). Record
  per-gate counts. ALL GREEN or BLOCKED.
- [ ] **Step 3: FOLLOWUP top block** `## ▶▶ 2026-07-19 — PROF/CONNEG CLOSEOUT (item 3) DONE +
  LIVE-VERIFIED; NEXT = item 4 (authorization-server track)`: shipped-fork list (R12–R16 with the
  merged SHA), shipped-lws-pod list (P1–P5 commits), gate counts, residuals (record, not fix):
  hierarchy/tokens = optional future hardening; write-side 422 = deferred round; plus anything the
  round surfaced. Mark item 3 ✅ DONE in the round-1 order-of-work block (pointer up, same pattern
  as items 1–2).
- [ ] **Step 4: Commit**: `[Agent: Claude] docs(followup): PROF/conneg closeout DONE (R12-R17,
  live-verified)`.

---

## Self-review (done at write time)

- Spec coverage: R12→T2/4/10, R13→T2, R14→T3, R15→T5, R16→T6+T12(H1), R17→T13; F1–F7→T2–T7;
  P1→T9, P2→T10, P3→T8, P4→T9, P5→T11; acceptance fixture+gate→T12. `--lws`-off byte-identity: the
  R12 stamp is gated on `representations`, only populated under `request.lwsEnabled` (resource.js
  ~1039/1261/2279) — pinned by T4's no-`.meta` negative + the fork suite's existing off-controls.
- Type consistency: `negotiateProfile(header, reps, acceptHeader='')` (T3) matches T4/T5/T12 usage;
  `advertise(url, token, dflt, alternates, fetchFn)`/`repEntry(href, rep)` (T10) match
  instantiate.mjs:25/109; `defaultProfileFor(representations, contentType)` (T4) consumes the
  `readRepresentations` shape `{href, format, profile}` (representations.js:26).
- No placeholders: every code step carries the code; test skeletons that depend on file-local
  helpers name the file + helper to reuse and state the exact assertions.
