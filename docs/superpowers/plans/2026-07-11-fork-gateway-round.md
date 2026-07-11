# Fork Gateway Round Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the `sourceContentType` seam (both faces), extend the 406-teaching policy to non-RDF sources, complete the cold-agent gateway (bare-200 alternates, shadow-honors-Accept, storage-description nav hints, `/.well-known/void` with the pod-dereferenceable-vocabulary rail), and drain the correctness/MCP smalls — closing with probe #7 (MCP-cold + HTTP-cold arms).

**Architecture:** Spec = `docs/superpowers/specs/2026-07-11-fork-gateway-round-design.md` (**READ IT FIRST** — §10 decision log is binding). Fork work rides the existing `src/rdf/serve.js` policy engine and `src/ldp/headers.js` Link builder; VoID content is DATA materialized by lws-pod's manifest-driven publish (P13: the fork only routes).

**Tech Stack:** Node ≥18, Fastify 4, `@rdfjs/parser-jsonld` + `rdf-ext` + `n3` (already deps — NO new packages), node:test on the fork, Vitest on lws-pod.

## Global Constraints

- **Two repos.** Fork tasks (1–13): `/Users/cvardema/dev/git/LA3D/JavaScriptSolidServer`, branch `la3d/lws-gateway` created off `la3d/lws` (`1783c6a`). lws-pod tasks (14–16): `/Users/cvardema/dev/git/LA3D/agents/lws-pod`, on `main`.
- **`--lws`-off byte-identity.** Every behavior change is gated on `request.lwsEnabled` (or the `--lws-void` flag). Each behavior task pairs a positive test with a negative-control test proving the `--lws`-off path unchanged (pattern: `test/lws-serving-path-negative.test.js`, `startTestServer({ lws: false, conneg: true })`).
- **P13:** no application vocabulary in fork code. The fork never generates VoID content — it routes to a configured resource.
- **No new npm dependencies** in either repo.
- **Fork test runs:** `node --test --test-concurrency=1 --test-force-exit 'test/<file>'` for single files; full suite via `npm test` (has a known pre-existing skip; 0 failures required).
- **The legacy `isRdfContentType` (`src/utils/url.js:277`) is UNTOUCHED** — `--lws`-off paths keep using it.
- **Commit format (both repos):** `[Agent: Claude] type(scope): subject` + bullets + `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`. Stage specific files, never `git add -A`, never force-push.
- **Code style:** fastai brevity; comments only for *why*; match surrounding code.
- **Exact hint strings** in Tasks 6–7 are design-reviewed copy — do not silently drift. Where a task says "verify against the handler source," adjust the string to match actual behavior and note the change in the commit body.

---

### Task 1: Seam threading + the non-RDF source gate (spec §2)

**Files:**
- Modify: `src/rdf/serve.js` (add `isRdfSourceType`, own-format short-circuit)
- Modify: `src/handlers/resource.js` (~827-860 file GET arm; ~1000-1015 HEAD arm — pass `sourceContentType`, gate on the new predicate)
- Test: `test/lws-serving-source.test.js` (new), `test/lws-serving-source-negative.test.js` (new)

**Interfaces:**
- Consumes: `serveStoredRdf`/`checkServable` (`src/rdf/serve.js:80,88` — already accept `sourceContentType`, default `RDF_TYPES.JSON_LD`); `getContentType` (`src/utils/url.js:233`); `toDataset` (`src/rdf/dataset.js` — already parses `text/turtle`/`text/n3` input).
- Produces: `export function isRdfSourceType(contentType)` in `src/rdf/serve.js` — true for `application/ld+json`, `text/turtle`, `text/n3`, `application/n-triples`, `application/n-quads`; **false for `application/json`** and everything else. Tasks 2 and 9 rely on this predicate.

- [ ] **Step 1: Write the failing tests**

Create `test/lws-serving-source.test.js`:

```js
// Seam threading (spec 2026-07-11 §2): the serving arm receives the STORED
// content type — a .ttl serves its own bytes and converts correctly; plain
// application/json never enters the RDF arm (probe-#6 live repro: 200 empty Turtle).
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startTestServer, stopTestServer, request, createTestPod, getBaseUrl } from './helpers.js';

describe('lws serving arm: sourceContentType threading', () => {
  let base, auth;
  before(async () => {
    await startTestServer({ lws: true, conneg: true });
    base = getBaseUrl();
    auth = await createTestPod('seamsrc');
    // A stored Turtle doc (multi-format source face)
    await request(`${base}/seamsrc/v.ttl`, { method: 'PUT', headers: { ...auth, 'content-type': 'text/turtle' },
      body: '<https://ex.org/s> <https://ex.org/p> "o" .' });
    // A stored plain-JSON doc (the probe-#6 face)
    await request(`${base}/seamsrc/d.json`, { method: 'PUT', headers: { ...auth, 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'plain', n: 3 }) });
  });
  after(stopTestServer);

  it('stored .ttl requested as Turtle serves its own bytes (200, bytes-are-bytes)', async () => {
    const r = await request(`${base}/seamsrc/v.ttl`, { headers: { ...auth, accept: 'text/turtle' } });
    assert.equal(r.status, 200);
    assert.equal(r.headers.get('content-type').split(';')[0], 'text/turtle');
    assert.match(await r.text(), /<https:\/\/ex\.org\/s> <https:\/\/ex\.org\/p> "o"/);
  });

  it('stored .ttl requested as N-Quads converts with real triples', async () => {
    const r = await request(`${base}/seamsrc/v.ttl`, { headers: { ...auth, accept: 'application/n-quads' } });
    assert.equal(r.status, 200);
    const body = await r.text();
    assert.match(body, /<https:\/\/ex\.org\/s> <https:\/\/ex\.org\/p> "o" \./);
  });

  it('stored plain .json requested with no Accept serves application/json, correctly labeled', async () => {
    const r = await request(`${base}/seamsrc/d.json`, { headers: auth });
    assert.equal(r.status, 200);
    assert.equal(r.headers.get('content-type').split(';')[0], 'application/json');
  });

  it('stored plain .json requested as Turtle NEVER yields empty-Turtle 200 (406 comes in Task 2)', async () => {
    const r = await request(`${base}/seamsrc/d.json`, { headers: { ...auth, accept: 'text/turtle' } });
    // Task 1 pins only the seam: no 200-with-text/turtle-and-zero-triples.
    const ct = (r.headers.get('content-type') || '').split(';')[0];
    assert.ok(!(r.status === 200 && ct === 'text/turtle'), `got the probe-#6 signature: 200 ${ct}`);
  });

  it('HEAD parity: stored .ttl as N-Quads reports the converted type', async () => {
    const r = await request(`${base}/seamsrc/v.ttl`, { method: 'HEAD', headers: { ...auth, accept: 'application/n-quads' } });
    assert.equal(r.status, 200);
    assert.equal(r.headers.get('content-type').split(';')[0], 'application/n-quads');
  });
});
```

Create `test/lws-serving-source-negative.test.js`:

```js
// NEGATIVE CONTROL (spec 2026-07-11 §1): --lws off, the legacy arm is byte-identical —
// plain .json still flows through the legacy JSON-LD arm exactly as before this round.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startTestServer, stopTestServer, request, createTestPod, getBaseUrl } from './helpers.js';

describe('negative control: --lws off, .json serving unchanged', () => {
  let base, auth;
  before(async () => {
    await startTestServer({ lws: false, conneg: true });
    base = getBaseUrl();
    auth = await createTestPod('seamneg');
    await request(`${base}/seamneg/d.json`, { method: 'PUT', headers: { ...auth, 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'plain' }) });
  });
  after(stopTestServer);

  it('legacy arm still converts parseable JSON on a Turtle Accept (pre-round behavior)', async () => {
    const r = await request(`${base}/seamneg/d.json`, { headers: { ...auth, accept: 'text/turtle' } });
    // Pre-round: legacy hand-rolled arm returns 200 text/turtle (empty preamble).
    assert.equal(r.status, 200);
    assert.equal(r.headers.get('content-type').split(';')[0], 'text/turtle');
  });
});
```

- [ ] **Step 2: Run both — expect FAIL**

```bash
cd /Users/cvardema/dev/git/LA3D/JavaScriptSolidServer
git checkout -b la3d/lws-gateway la3d/lws
node --test --test-concurrency=1 --test-force-exit 'test/lws-serving-source.test.js'
```
Expected: the `.ttl`-as-Turtle case FAILS (406 "did not parse as application/ld+json"), the `.json` cases FAIL (200 empty turtle / mislabeled ld+json). The negative control PASSES already (it pins current behavior) — keep it.

- [ ] **Step 3: Implement**

In `src/rdf/serve.js`, add after the `QUADS_OUTPUTS` block:

```js
// Serving-arm source gate (spec 2026-07-11 §2): what counts as an RDF SOURCE.
// Deliberately narrower than utils/url.js isRdfContentType — plain application/json
// is NOT RDF for serving (probe-#6: it parsed as JSON-LD to zero quads → empty
// Turtle 200). The legacy predicate stays for --lws-off byte-identity.
const RDF_SOURCE_TYPES = new Set([
  RDF_TYPES.JSON_LD, RDF_TYPES.TURTLE, RDF_TYPES.N3, RDF_TYPES.NTRIPLES, RDF_TYPES.NQUADS,
]);
export function isRdfSourceType(contentType) {
  return RDF_SOURCE_TYPES.has((contentType || '').split(';')[0].trim().toLowerCase());
}
```

In `serveStoredRdf`, add the own-format short-circuit before `policyDataset` (the rule: *own format = bytes-are-bytes; conversions = parse or teach*):

```js
export async function serveStoredRdf({ bytes, sourceContentType = RDF_TYPES.JSON_LD, targetType, baseIri }) {
  if (QUADS_OUTPUTS[sourceContentType] === targetType && sourceContentType !== RDF_TYPES.N3) {
    return { ok: true, content: bytes, contentType: sourceContentType };   // own format: bytes are bytes
  }
  const p = await policyDataset({ bytes, sourceContentType, targetType, baseIri });
  ...
```

(`checkServable` gets the same short-circuit returning `{ ok: true }`. N3 is excluded from the short-circuit because `QUADS_OUTPUTS` maps it to Turtle — serving N3 bytes labeled `text/turtle` would mislabel; N3 sources parse.)

In `src/handlers/resource.js`, the file GET arm (~line 827): change the branch gate and thread the type —

```js
} else if (request.lwsEnabled ? isRdfSourceType(storedContentType) : isRdfContentType(storedContentType)) {
  ...
      const served = await serveStoredRdf({ bytes: content, sourceContentType: storedContentType, targetType: quadsTarget, baseIri: resourceUrl });
```

Import `isRdfSourceType` from `../rdf/serve.js`. Apply the same two changes in `negotiateHeadFileContentType` (~line 1000: the `lwsEnabled && isRdfContentType(...)` gate becomes `lwsEnabled && isRdfSourceType(...)`; the `checkServable` call at ~1009 gains `sourceContentType: storedContentType`). Under `--lws`, a `.json` file now falls past the RDF arm into the generic file-serving branch, which serves stored bytes with `storedContentType` (= `application/json` — fixes the mislabel). Also guard the legacy JSON.parse-convert block inside the same `else if` so under `--lws` a JSON-LD-target request on a real RDF source keeps working (the stored bytes ARE JSON-LD — unchanged), but `.json` never reaches it (it exited the branch at the gate).

Container arms (261, 494, 797) are untouched — they serve generated/island JSON-LD; the default source type is correct there.

- [ ] **Step 4: Run tests — expect PASS (both files)**
- [ ] **Step 5: Run the adjacent suites** — `node --test --test-concurrency=1 --test-force-exit 'test/lws-serving-path*.test.js' 'test/rdf-serve.test.js' 'test/head-conneg.test.js'` — zero failures.
- [ ] **Step 6: Commit** — `[Agent: Claude] feat(lws): thread sourceContentType through the serving arm; plain JSON exits the RDF gate`

---

### Task 2: Teaching 406 on non-RDF sources (F3, spec §3)

**Files:**
- Modify: `src/rdf/conneg.js` (add `acceptSatisfiable`)
- Modify: `src/rdf/serve.js` (add `nonRdfNotAcceptable` problem builder)
- Modify: `src/handlers/resource.js` (file GET generic branch + `negotiateHeadFileContentType`)
- Test: `test/lws-nonrdf-teaching.test.js` (new), extend `test/lws-serving-source-negative.test.js`

**Interfaces:**
- Consumes: `parseAcceptHeader` (`src/rdf/conneg.js:89`); `isRdfSourceType` (Task 1); `readAuthorizedRepresentations`/`representationLinks` (`src/handlers/resource.js:85`, `src/ldp/headers.js:113`).
- Produces: `export function acceptSatisfiable(acceptHeader, contentType)` in `src/rdf/conneg.js` — true when the header is absent/empty, or any accept entry equals the content type's main type, is `*/*`, or is a `major/*` wildcard matching the content type's major type. Task 9 (HEAD) and Task 15's gates rely on the 406 body shape below.

- [ ] **Step 1: Write the failing tests**

Create `test/lws-nonrdf-teaching.test.js`:

```js
// F3 (spec 2026-07-11 §3): a non-RDF source with a specific unsatisfiable Accept
// answers a teaching 406 naming the authored format + the profile route.
// Wildcards keep serving the authored format — browsers see nothing new.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startTestServer, stopTestServer, request, createTestPod, getBaseUrl } from './helpers.js';

describe('lws: teaching 406 on non-RDF sources', () => {
  let base, auth;
  before(async () => {
    await startTestServer({ lws: true, conneg: true });
    base = getBaseUrl();
    auth = await createTestPod('f3');
    await request(`${base}/f3/card.md`, { method: 'PUT', headers: { ...auth, 'content-type': 'text/markdown' },
      body: '# A card\n' });
    await request(`${base}/f3/d.json`, { method: 'PUT', headers: { ...auth, 'content-type': 'application/json' },
      body: '{"plain": true}' });
  });
  after(stopTestServer);

  it('markdown + Accept: text/turtle → 406 problem+json naming the authored format and the profile route', async () => {
    const r = await request(`${base}/f3/card.md`, { headers: { ...auth, accept: 'text/turtle' } });
    assert.equal(r.status, 406);
    assert.equal(r.headers.get('content-type').split(';')[0], 'application/problem+json');
    const p = await r.json();
    assert.match(p.detail, /text\/markdown/);
    assert.match(p.detail, /Accept-Profile/);
  });

  it('plain JSON + Accept: application/ld+json → 406 (no more mislabeled 200)', async () => {
    const r = await request(`${base}/f3/d.json`, { headers: { ...auth, accept: 'application/ld+json' } });
    assert.equal(r.status, 406);
  });

  it('markdown + Accept: */* → 200 markdown, unchanged', async () => {
    const r = await request(`${base}/f3/card.md`, { headers: { ...auth, accept: 'text/html,application/xhtml+xml,*/*;q=0.8' } });
    assert.equal(r.status, 200);
    assert.equal(r.headers.get('content-type').split(';')[0], 'text/markdown');
  });

  it('markdown + Accept: text/* → 200 markdown (major-type wildcard satisfies)', async () => {
    const r = await request(`${base}/f3/card.md`, { headers: { ...auth, accept: 'text/*' } });
    assert.equal(r.status, 200);
  });

  it('no Accept header → 200 authored format', async () => {
    const r = await request(`${base}/f3/card.md`, { headers: auth });
    assert.equal(r.status, 200);
  });

  it('HEAD parity: markdown + text/turtle → 406, empty body', async () => {
    const r = await request(`${base}/f3/card.md`, { method: 'HEAD', headers: { ...auth, accept: 'text/turtle' } });
    assert.equal(r.status, 406);
  });
});
```

Append to `test/lws-serving-source-negative.test.js` (inside the existing describe):

```js
  it('markdown + specific RDF Accept still 200s the authored format when --lws is off', async () => {
    await request(`${base}/seamneg/card.md`, { method: 'PUT', headers: { ...auth, 'content-type': 'text/markdown' }, body: '# x\n' });
    const r = await request(`${base}/seamneg/card.md`, { headers: { ...auth, accept: 'text/turtle' } });
    assert.equal(r.status, 200);
  });
```

- [ ] **Step 2: Run — expect the new file to FAIL (200s where 406 expected), negative to PASS**

- [ ] **Step 3: Implement**

`src/rdf/conneg.js`:

```js
// F3 (spec 2026-07-11 §3): can this Accept header be satisfied by the authored
// content type at all? Absent/empty header always satisfies (serve authored).
export function acceptSatisfiable(acceptHeader, contentType) {
  if (!acceptHeader || !acceptHeader.trim()) return true;
  const main = (contentType || '').split(';')[0].trim().toLowerCase();
  const major = main.split('/')[0];
  return parseAcceptHeader(acceptHeader).some(({ type }) =>
    type === '*/*' || type === main || type === `${major}/*`);
}
```

`src/rdf/serve.js` — the teaching body (exported for HEAD reuse):

```js
/** F3: a non-RDF source cannot satisfy a specific media Accept — teach, never lie. */
export function nonRdfNotAcceptable(instance, storedType, requestedAccept, hasAlternates) {
  const route = hasAlternates
    ? ' Its declared alternate representations are in the Link header (rel="alternate"), or send Accept-Profile: <profile-uri> to negotiate one.'
    : ' If this resource has profile-negotiated representations, its linkset (Accept: application/linkset+json) lists them.';
  return { ok: false, status: 406, problem: {
    type: 'about:blank', title: 'Not Acceptable', status: 406,
    detail: `this resource is ${storedType} and has no representation matching "${requestedAccept}".${route} Formats that work directly: ${storedType}.`,
    instance,
  } };
}
```

`src/handlers/resource.js` — in the file GET flow, after the RDF-source branch is not taken (the generic non-RDF serving path), insert before serving bytes:

```js
if (request.lwsEnabled && !isRdfSourceType(storedContentType)
    && !acceptSatisfiable(acceptHeader, storedContentType)) {
  const reps = await authorizedRepresentations(request, resourceUrl, storagePath);
  const avail = representationLinks(reps);
  if (avail) reply.header('Link', avail);
  const na = nonRdfNotAcceptable(resourceUrl, storedContentType, acceptHeader, !!(reps?.default || reps?.alternates?.length));
  reply.header('Vary', getVaryHeader(connegEnabled, request.mashlibEnabled, request.lwsEnabled));
  return reply.code(406).type('application/problem+json').send(JSON.stringify(na.problem, null, 2));
}
```

(Reuse the existing `authorizedRepresentations` helper at `resource.js:85-92` — it reads `.meta` and authz-filters; on a resource with no `.meta` it returns empty, and the 406 still teaches the linkset route.) HEAD: mirror in `negotiateHeadFileContentType` — same condition → return `{ notAcceptable: true }` (the caller already 406s on that). Exclude the HTML-with-data-island arm (line ~797) — HTML sources keep their existing island conversion behavior.

- [ ] **Step 4: Run — expect PASS.** Also re-run `test/lws-serving-source.test.js` (the Task-1 `.json`-as-Turtle case now sees 406 — its assertion already allows that).
- [ ] **Step 5: Commit** — `[Agent: Claude] feat(lws): teaching 406 on non-RDF sources (F3) — wildcards unaffected`

---

### Task 3: One 406 grammar — profile-406 onto problem+json + conforming profiles (F5, spec §3)

**Files:**
- Modify: `src/handlers/resource.js:419-425` (container) and `:593-599` (file) and `:1220-1225` (HEAD parity)
- Test: `test/conneg-accept-profile.test.js` (update the 406 assertions), `test/lws-profile-406.test.js` (new)

**Interfaces:**
- Consumes: `reps` (authz-filtered `{default, alternates}` in scope at both 406 sites), `representationLinks`.
- Produces: profile-406 body shape `{type,title,status,detail,instance}` with `detail` listing the conforming profile URIs — Task 15's gate asserts this shape.

- [ ] **Step 1: Write the failing test**

Create `test/lws-profile-406.test.js`:

```js
// F5 (spec 2026-07-11 §3): the profile-406 speaks the same RFC 9457 problem+json
// as the media-406 and LISTS the profiles that would conform.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startTestServer, stopTestServer, request, createTestPod, getBaseUrl } from './helpers.js';

describe('lws: unified profile-406', () => {
  let base, auth;
  before(async () => {
    await startTestServer({ lws: true, conneg: true });
    base = getBaseUrl();
    auth = await createTestPod('f5');
    await request(`${base}/f5/m.md`, { method: 'PUT', headers: { ...auth, 'content-type': 'text/markdown' }, body: '# m\n' });
    // Declare a representation set on m.md via .meta (altr:), same shape the
    // conneg suite uses (see test/conneg-accept-profile.test.js beforeEach).
    await request(`${base}/f5/m.md.meta`, { method: 'PUT', headers: { ...auth, 'content-type': 'application/ld+json' },
      body: JSON.stringify({
        '@context': { altr: 'http://www.w3.org/ns/dx/connegp/altr#', dct: 'http://purl.org/dc/terms/' },
        '@id': `${base}/f5/m.md`,
        'altr:hasDefaultRepresentation': { '@id': `${base}/f5/m.md`, 'dct:format': 'text/markdown', 'dct:conformsTo': { '@id': 'https://ex.org/profiles/content' } },
      }) });
  });
  after(stopTestServer);

  it('unknown Accept-Profile → 406 problem+json listing conforming profiles', async () => {
    const r = await request(`${base}/f5/m.md`, { headers: { ...auth, 'Accept-Profile': '<https://ex.org/profiles/nope>' } });
    assert.equal(r.status, 406);
    assert.equal(r.headers.get('content-type').split(';')[0], 'application/problem+json');
    const p = await r.json();
    assert.equal(p.status, 406);
    assert.match(p.detail, /https:\/\/ex\.org\/profiles\/content/);
  });
});
```

(Adapt the `.meta` body to the exact altr: shape used in `test/conneg-accept-profile.test.js` — read that file first and copy its fixture form.)

- [ ] **Step 2: Run — expect FAIL** (current body is `{"error":"no representation conforms..."}`, content-type application/json).

- [ ] **Step 3: Implement.** At all three sites, replace the `{ error: ... }` send with a problem+json build:

```js
const conforming = [reps?.default, ...(reps?.alternates || [])].filter(Boolean)
  .map(r => r.profile).filter(Boolean);
return reply.code(406).type('application/problem+json').send(JSON.stringify({
  type: 'about:blank', title: 'Not Acceptable', status: 406,
  detail: `no representation conforms to the requested profile(s). Profiles that conform: ${conforming.length ? conforming.join(', ') : '(none declared)'}.`,
  instance: resourceUrl,
}, null, 2));
```

Keep the existing `Link: representationLinks(reps)` and `Vary` headers (already emitted). HEAD keeps an empty body but gains the problem+json content-type. **Grep the fork suite for the old body** (`no representation conforms`) and update every assertion (`test/conneg-accept-profile.test.js`, any `test/lws-conneg*.test.js` case).

- [ ] **Step 4: Run the conneg suites — zero failures**
```bash
node --test --test-concurrency=1 --test-force-exit 'test/conneg*.test.js' 'test/lws-profile-406.test.js' 'test/lws-conneg.test.js'
```
- [ ] **Step 5: Commit** — `[Agent: Claude] feat(lws): profile-406 speaks problem+json and lists conforming profiles (F5)`

---

### Task 4: Alternates on the bare 200 (A1, spec §4)

**Files:**
- Modify: `src/handlers/resource.js` (file GET ~560-620 and HEAD — populate `advertisedReps` on the un-negotiated path when `.meta` exists)
- Test: `test/lws-bare-alternates.test.js` (new + negative case inside it)

**Interfaces:**
- Consumes: `authorizedRepresentations` (resource.js:85), `representationLinks` (headers.js:113), `getAllHeaders`'s existing `representations` param (headers.js:166-169).
- Produces: bare GET/HEAD 200s carry `rel="canonical"/"alternate"` Links whenever a readable `.meta` declares representations. Task 15's gate asserts the Link on a bare GET of `a.md`.

- [ ] **Step 1: Write the failing test**

Create `test/lws-bare-alternates.test.js` (reuse the Task-3 altr: fixture shape; one resource with a declared alternate):

```js
describe('lws: alternates advertised on the bare 200 (A1)', () => {
  // before(): PUT m.md + m.md.links.jsonld + m.md.meta declaring default(content)+alternate(links)
  it('bare GET (no Accept-Profile) carries canonical+alternate Links', async () => {
    const r = await request(`${base}/a1/m.md`, { headers: auth });
    assert.equal(r.status, 200);
    const link = r.headers.get('link') || '';
    assert.match(link, /rel="canonical"/);
    assert.match(link, /rel="alternate"/);
    assert.match(link, /formats="/);
  });
  it('a resource with NO .meta gets no canonical/alternate rels (zero-cost path)', async () => {
    const r = await request(`${base}/a1/plain.md`, { headers: auth });
    assert.equal(r.status, 200);
    assert.doesNotMatch(r.headers.get('link') || '', /rel="(canonical|alternate)"/);
  });
  it('--lws off: bare GET carries no canonical/alternate rels (negative control)', async () => { /* second server, lws:false */ });
});
```

(Write the full before/after scaffolding in the style of Task 2's test; the negative control boots `startTestServer({ lws: false, conneg: true })` in a second describe.)

- [ ] **Step 2: Run — expect FAIL** (no Links on the bare path today; explorer: `advertisedReps` only set inside the Accept-Profile negotiation block, resource.js:428/607/1228).

- [ ] **Step 3: Implement.** On the file GET path where `advertisedReps` currently stays undefined (no `Accept-Profile` header), add an exists-gated read (perf: one `storage.exists` on the hot path, full read+authz-filter only when a `.meta` is present):

```js
if (request.lwsEnabled && !advertisedReps && await storage.exists(storagePath + '.meta')) {
  advertisedReps = await authorizedRepresentations(request, resourceUrl, storagePath);
}
```

Place it before the header-assembly point shared by all file-serving arms so the RDF arm, the F3 406, and the plain-file 200 all pick it up (`getAllHeaders` already threads `representations` — no header-builder change). Mirror on the HEAD file path. Containers: same exists-gated read in the container GET/HEAD branch (container `.meta` path is `storagePath + '/.meta'` — check how the negotiation block at resource.js:428 computes it and reuse).

- [ ] **Step 4: Run — PASS**; re-run `test/conneg-accept-profile.test.js` (negotiated path must be unchanged — the guard is `!advertisedReps`).
- [ ] **Step 5: Commit** — `[Agent: Claude] feat(lws): advertise declared representations on the bare 200 (A1)`

---

### Task 5: Shadow honors non-HTML Accepts (A2, spec §4)

**Files:**
- Modify: `src/rdf/conneg.js` (add `acceptsHtml`)
- Modify: `src/handlers/resource.js` (GET container index.html branch ~205-327; HEAD mirror ~1131-1184)
- Modify: `src/ldp/headers.js` (no change to builder; suppression flag now conditional at call sites)
- Test: `test/lws-shadow-conneg.test.js` (new), `test/lws-shadow-conneg-negative.test.js` (new)

**Interfaces:**
- Consumes: `acceptSatisfiable`/`parseAcceptHeader` (Task 2), the existing listing branch (resource.js:329+), `suppressLinkset` threading (resource.js:278,294,316,1173).
- Produces: `export function acceptsHtml(acceptHeader)` in `src/rdf/conneg.js` — true when header absent, or any entry is `text/html`, `application/xhtml+xml`, `*/*`, or `text/*`. Under `--lws`, a non-HTML-accepting request on an index.html-shadowed container reaches the REAL listing branch (lws+json/linkset/turtle/ld+json/quads all work), and `rel="linkset"` is no longer suppressed. Task 15's root-enumeration gate depends on this.

- [ ] **Step 1: Write the failing tests**

`test/lws-shadow-conneg.test.js`:

```js
describe('lws: index.html shadow honors non-HTML Accepts (A2)', () => {
  // before(): create pod 'a2', PUT /a2/index.html (any small html body) so the pod root is shadowed;
  //           PUT /a2/x.md so the listing is non-empty.
  it('Accept: text/html → 200 html (browsers unchanged)', async () => { /* expect text/html body */ });
  it('browser-style Accept with */* → 200 html', async () => { /* text/html,...;q=0.9,*/*;q=0.8 */ });
  it('Accept: application/lws+json → 200 items[] listing (the escape)', async () => {
    const r = await request(`${base}/a2/`, { headers: { ...auth, accept: 'application/lws+json' } });
    assert.equal(r.status, 200);
    const j = await r.json();
    assert.ok(Array.isArray(j.items));
    assert.ok(j.items.some(i => i.id.endsWith('/a2/x.md')));
  });
  it('Accept: text/turtle → 200 membership graph with ldp:contains triples', async () => { /* count > 0 */ });
  it('Accept: application/linkset+json → 200 linkset (rel no longer a false affordance)', async () => {});
  it('shadowed container GET (html) now ADVERTISES rel="linkset" again', async () => {
    const r = await request(`${base}/a2/`, { headers: { ...auth, accept: 'text/html' } });
    assert.match(r.headers.get('link') || '', /rel="linkset"/);
  });
  it('HEAD parity: lws+json HEAD on shadowed container reports lws+json', async () => {});
});
```

`test/lws-shadow-conneg-negative.test.js`: `startTestServer({ lws: false, conneg: true })`, shadowed container: `Accept: application/lws+json` → **200 text/html** (pre-round shadow-wins behavior pinned), and no `rel="linkset"` reappearance if it was suppressed pre-round with lws off — check git history behavior: the suppression is inside `if (lwsEnabled ...)` in headers.js:151-159, so with `--lws` off there's no linkset rel at all; pin that.

- [ ] **Step 2: Run — expect FAIL** (every non-HTML Accept currently gets the HTML or island conversion).

- [ ] **Step 3: Implement.**

`src/rdf/conneg.js`:

```js
// A2 (spec 2026-07-11 §4): does this request accept an HTML answer at all?
// Absent header = yes (curl, browsers without Accept). Only a header naming
// specific non-HTML types refuses the shadow.
export function acceptsHtml(acceptHeader) {
  if (!acceptHeader || !acceptHeader.trim()) return true;
  return parseAcceptHeader(acceptHeader).some(({ type }) =>
    type === 'text/html' || type === 'application/xhtml+xml' || type === '*/*' || type === 'text/*');
}
```

`src/handlers/resource.js` GET: wrap the entire `if (indexExists) { ... }` body:

```js
if (indexExists && !(request.lwsEnabled && !acceptsHtml(acceptHeader))) {
  ... existing shadow/island logic unchanged ...
}
// falls through to the real listing branch (line ~329) when --lws and non-HTML Accept
```

Remove the three `suppressLinkset: true` sets on the `--lws` path (they were compensating for the very behavior this task fixes) — but ONLY where `request.lwsEnabled`; when `--lws` is off the builder never emits the rel anyway (headers.js:151 is `lwsEnabled`-gated), so the flag becomes dead under `--lws`-off — delete the sets and the HEAD mirror flag (resource.js:1173-1177), and note in the commit body that the island-JSON-LD arm under `--lws` is now reachable only by HTML-accepting requests (spec §4 decision). HEAD mirror: same wrap in the HEAD container branch.

- [ ] **Step 4: Run new tests + the whole conneg/serving family + `test/lws-listing-authz.test.js`** (the listing branch now serves more requests — the WAC filter must still fire; zero failures). Some existing fork tests may pin the old shadow-wins-for-turtle behavior under `--lws` — update them to the new design with a comment citing spec §4.
- [ ] **Step 5: Commit** — `[Agent: Claude] feat(lws): index-shadow honors non-HTML Accepts; linkset rel honest again (A2)`

---

### Task 6: Storage-description gateway hints (A3 + nav, spec §4)

**Files:**
- Modify: `src/lws/storage-description.js:41-90`
- Test: `test/lws-storage-description.test.js` (extend)

**Interfaces:**
- Consumes: `buildStorageDescription(origin, flags)`.
- Produces: updated `linkset.hint` wording + `hint` on the TypeSearchService entry. Task 7 adds the VoidService entry in the same builder.

- [ ] **Step 1: Write the failing test** (extend the existing storage-description suite):

```js
it('linkset hint teaches the shadow escape (root is listable by conneg)', async () => {
  const sd = await getStorageDescription();
  assert.match(sd.linkset.hint, /non-HTML Accept/);
  assert.match(sd.linkset.hint, /application\/lws\+json/);
});
it('TypeSearchService carries a query-syntax hint', async () => {
  const sd = await getStorageDescription();
  const ts = sd.service.find(s => s.type === 'TypeSearchService');
  assert.match(ts.hint, /\?type=/);
});
```

- [ ] **Step 2: Run — FAIL.**

- [ ] **Step 3: Implement.** In the linkset hint, replace the sentence `a container shadowed by its index.html serves the HTML instead, so descend to a member` with:

> `a container shadowed by its index.html serves the HTML only to HTML-accepting requests — request it with a specific non-HTML Accept (application/lws+json, text/turtle, application/linkset+json) for the real container view; this includes the root: GET / with Accept: application/lws+json lists the top-level containers`

TypeSearchService entry gains (VERIFY the parameter name and combination semantics against the `/types/search` handler source — `src/lws/` type-search module — before committing; adjust the string to match actual behavior):

> `hint: 'GET with ?type=<uri> returns instances of that type; repeat the parameter to AND-combine. A bare GET returns the full inventory. Indexed relations: rdf:type and dct:conformsTo.'`

- [ ] **Step 4: Run storage-description suites + the MCP parity test** (`test/lws-profiles-storage-description.test.js` asserts HTTP↔MCP agreement — both surfaces share the one builder, so it should stay green).
- [ ] **Step 5: Commit** — `[Agent: Claude] feat(lws): gateway nav + TypeSearch syntax hints in the storage description (A3)`

---

### Task 7: The `--lws-void` rung (spec §5)

**Files:**
- Modify: `bin/jss.js` (~line 98, next to `--lws-profile-index`), `src/config.js` (~39, ~183), `src/server.js` (~107, ~1049-1068 well-known block), `src/lws/storage-description.js`
- Test: `test/lws-void-route.test.js` (new)

**Interfaces:**
- Consumes: the ProfileIndexService threading pattern (bin/jss.js:98 → config.js:39/183 → server.js:107 → route/builder).
- Produces: `--lws-void <path>` / `JSS_LWS_VOID` config key `lwsVoid` (default null); `GET /.well-known/void` → `303` + `Location: ${origin}${lwsVoid}` when configured, `404` when not; storage-description service entry `{ type: 'VoidService', serviceEndpoint: '${origin}/.well-known/void', hint }` when configured. Task 14's document is what the 303 points at; Task 15's gate walks it.

- [ ] **Step 1: Write the failing test**

`test/lws-void-route.test.js`:

```js
describe('lws: /.well-known/void rung', () => {
  it('configured: GET /.well-known/void → 303 to the configured pod resource', async () => {
    // startTestServer({ lws: true, lwsVoid: '/alice/profiles/void.jsonld' })
    const r = await request(`${base}/.well-known/void`, { redirect: 'manual' });
    assert.equal(r.status, 303);
    assert.equal(r.headers.get('location'), `${base}/alice/profiles/void.jsonld`);
  });
  it('configured: storage description advertises VoidService', async () => {
    const sd = await getStorageDescription();
    const v = sd.service.find(s => s.type === 'VoidService');
    assert.equal(v.serviceEndpoint, `${base}/.well-known/void`);
    assert.match(v.hint, /vocabular/i);
  });
  it('unconfigured: /.well-known/void → 404 and no VoidService entry', async () => { /* second server without lwsVoid */ });
  it('writes → 405', async () => { /* PUT /.well-known/void expects 405 */ });
});
```

(Check `test/helpers.js` `startTestServer` — mirror how `lwsProfileIndex` is passed through and add `lwsVoid` the same way if the helper maps options to CLI flags.)

- [ ] **Step 2: Run — FAIL.**

- [ ] **Step 3: Implement** following the ProfileIndexService pattern verbatim: option `--lws-void <path>` (path-valued, NOT in `BOOLEAN_KEYS`); `config.js` default `lwsVoid: null` + env map `JSS_LWS_VOID: 'lwsVoid'`; `server.js` `const voidPath = lwsEnabled ? (options.lwsVoid ?? null) : null;` — route in the same `lwsEnabled` block as `lws-storage`:

```js
if (voidPath) {
  fastify.get('/.well-known/void', async (request, reply) => {
    const origin = `${request.protocol}://${request.hostname}`;
    reply.header('Cache-Control', 'public, max-age=3600');
    return reply.code(303).header('Location', `${origin}${voidPath}`).send();
  });
  for (const m of ['put', 'post', 'patch', 'delete']) fastify[m]('/.well-known/void', methodNotAllowed);
}
```

Builder: `buildStorageDescription` gains `voidPath` in flags →

```js
if (voidPath) {
  services.push({ type: 'VoidService', serviceEndpoint: `${origin}/.well-known/void`,
    hint: 'VoID description of the datasets this storage serves — the vocabularies in use (each with a pod-served copy), root resources, and the subject URI space. GET follows a 303 to the description document.' });
}
```

Thread `voidPath` to the MCP `pod-info`/storage-description surface the same way `profileIndexPath` is (`src/mcp/resources.js:72`) so HTTP↔MCP parity holds.

- [ ] **Step 4: Run — PASS** (+ storage-description suites, MCP parity test).
- [ ] **Step 5: Commit** — `[Agent: Claude] feat(lws): --lws-void rung — /.well-known/void 303s to a configured pod resource`

---

### Task 8: Honest WAC-Allow on denial (F1, spec §6)

**Files:**
- Modify: `src/auth/middleware.js:431-454` (`authorizeAclAccess`)
- Test: `test/lws-wac-allow-denial.test.js` (new)

**Interfaces:**
- Consumes: `checkAccess` (`src/wac/checker.js:23`), `handleUnauthorized` (middleware.js:166).
- Produces: a 401/403 on a `.acl` URL carries `WAC-Allow` describing access to the **ACL resource** (empty grants on denial), never the protected resource's read modes.

- [ ] **Step 1: Write the failing test**

```js
describe('wac-allow on .acl denial is honest (F1)', () => {
  // before(): lws server; create pod; grant public-read on /f1/ (so the PROTECTED
  //           resource has public read — the probe-#6 condition), no public control.
  it('anonymous GET /f1/.acl → 401 with empty WAC-Allow grants', async () => {
    const r = await request(`${base}/f1/.acl`);   // no auth header
    assert.equal(r.status, 401);
    const wa = r.headers.get('wac-allow') || '';
    assert.match(wa, /user=""/);
    assert.match(wa, /public=""/);
  });
  it('owner GET /f1/.acl → 200 (control holds) with non-empty user modes', async () => { /* auth header */ });
});
```

- [ ] **Step 2: Run — FAIL** (today: `user="read", public="read"` from the protected resource).

- [ ] **Step 3: Implement.** In `authorizeAclAccess`, the returned `wacAllow` currently passes through `checkAccess`'s computation for the protected resource. Replace with modes derived for the ACL resource itself (WAC: `.acl` access ⇔ CONTROL on the protected resource):

```js
const { allowed } = await checkAccess({ ...as today, requiredMode: AccessMode.CONTROL });
// WAC-Allow must describe the REQUESTED resource (the .acl), not the protected
// resource — control-holders may read+write the acl; everyone else gets nothing
// (probe-#6 F1: a 401 wearing public="read" is retry-loop bait).
const aclWacAllow = allowed ? 'user="read write", public=""' : 'user="", public=""';
return { authorized: allowed, webId, wacAllow: aclWacAllow, authError };
```

(If public CONTROL is actually granted — rare — `public=""` under-reports; acceptable and safe. Note it in a comment.) This is not `--lws`-gated (it's a correctness fix on a header that was factually wrong), but confirm no existing test pins the old header — grep `wac-allow` in `test/` and update assertions with a spec-citing comment.

- [ ] **Step 4: Run — PASS** + `test/wac.test.js`, `test/auth.test.js` zero failures.
- [ ] **Step 5: Commit** — `[Agent: Claude] fix(wac): WAC-Allow on .acl responses describes the acl, not the protected resource (F1)`

---

### Task 9: OPTIONS Link parity + container-HEAD conneg parity (F7 + carryover, spec §6)

**Files:**
- Modify: `src/handlers/resource.js:1565-1580` (`handleOptions`), `:1164` (container HEAD 2-arg call)
- Test: `test/lws-options-links.test.js` (new), extend `test/head-conneg.test.js`

**Interfaces:**
- Consumes: `getAllHeaders` (already accepts `lwsEnabled`), `selectContentType` 3-arg (Task-independent, conneg.js:37), `QUADS_OUTPUTS`.
- Produces: OPTIONS emits the same `storageDescription` (+ linkset) rels as GET/HEAD under `--lws`; container HEAD reports the same content-type a GET would for quads Accepts.

- [ ] **Step 1: Failing tests.** OPTIONS: `OPTIONS /` under `--lws` → Link contains `rel="…storageDescription"`. Container HEAD: `HEAD /pod/ Accept: application/n-quads` → `content-type: application/n-quads` (compare a GET of the same). Negative: `--lws` off, OPTIONS Link unchanged (no storageDescription rel).

- [ ] **Step 2: Run — FAIL.**

- [ ] **Step 3: Implement.** `handleOptions`: pass `lwsEnabled: request.lwsEnabled` into `getAllHeaders` (leave `representations`/`chosenProfile` out — OPTIONS answers "what can I do here", not content negotiation). Container HEAD line 1164: add the third arg + quads branch:

```js
const lwsNeg = selectContentType(acceptHeader, connegEnabled, request.lwsEnabled);
if (lwsNeg === RDF_TYPES.LWS_JSON) contentType = RDF_TYPES.LWS_JSON;
else if (lwsNeg === RDF_TYPES.LINKSET) contentType = RDF_TYPES.LINKSET;
else if (QUADS_OUTPUTS[lwsNeg]) contentType = QUADS_OUTPUTS[lwsNeg];
```

(Membership graphs are default-graph-only — no 406 risk on HEAD; content-type parity is the whole fix.)

- [ ] **Step 4: Run — PASS** + `test/head-conneg.test.js` whole file.
- [ ] **Step 5: Commit** — `[Agent: Claude] fix(lws): OPTIONS carries storage-description Link; container HEAD negotiates quads types (F7)`

---

### Task 10: ETag per variant (spec §6)

**Files:**
- Modify: `src/handlers/resource.js` (the `--lws` serving arms + container listing branches — everywhere a converted/filtered body is sent with `stats.etag`)
- Test: `test/lws-etag-variant.test.js` (new)

**Interfaces:**
- Consumes: `stats.etag` (filesystem.js:34), the mashlib `-html` suffix precedent (resource.js:163).
- Produces: helper `variantEtag(etag, key)` in `src/handlers/resource.js` (module-local): `etag.replace(/"$/, `-${key}"`)`. Variant keys: `ttl`, `nt`, `nq`, `lws`, `ls` for converted formats (stored-format serves keep the bare etag); WAC-filtered listings additionally suffix an 8-char md5 of the sorted visible member names.

- [ ] **Step 1: Failing tests:**

```js
it('Turtle and JSON-LD variants of one resource carry different ETags', async () => { /* GET twice, compare */ });
it('If-None-Match with the Turtle-variant ETag on a JSON-LD request → 200, not 304', async () => {});
it('listing ETag changes when the visible member set changes (auth vs anon)', async () => {
  // owner-only member: anon listing etag ≠ owner listing etag
});
it('own-format GET keeps the bare stats etag (unchanged for non-negotiated reads)', async () => {});
```

- [ ] **Step 2: Run — FAIL** (one strong etag across variants today — probe-#6 F2).

- [ ] **Step 3: Implement.** Add the helper + apply at the `--lws` arm response points: file RDF conversions (`served.contentType` → key map), container listing serializations (lws+json → `lws`, linkset → `ls`, quads → per-format), and after `filterReadableEntries` compute the visibility hash:

```js
const visKey = crypto.createHash('md5').update(entries.map(e => e.name).sort().join('\n')).digest('hex').slice(0, 8);
```

suffix `-${visKey}` on listing etags. All `--lws`-gated (legacy arms keep the shared etag — negative control pins that).

- [ ] **Step 4: Run — PASS** + any suite asserting etags (`grep -rl etag test/`) green.
- [ ] **Step 5: Commit** — `[Agent: Claude] fix(lws): representation- and visibility-keyed ETags (probe-#6 F2)`

---

### Task 11: Envelope-admission e2e pin (spec §6)

**Files:**
- Test: `test/lws-envelope-admission.test.js` (new — test-only task)

**Interfaces:**
- Consumes: the admission path (SHACL via `.meta describedby`), the `{@context,@graph}` store form (serving-path round T5).

- [ ] **Step 1: Write the test** (this pins existing behavior — it should PASS immediately; that IS the deliverable):

```js
// Pins the composition the serving-path round left unpinned (spec 2026-07-11 §6):
// a shape published as TURTLE (stored via the {@context,@graph} form) still
// rejects a non-conforming write end-to-end.
describe('envelope-shape admission pin', () => {
  // before(): PUT a multi-subject SHACL shapes doc as text/turtle (two NodeShapes so
  //           the store form is the @graph envelope); bind container .meta describedby → it.
  it('non-conforming write → 400 with the sh:message teaching text', async () => { /* expect 400 + message */ });
  it('conforming write → 2xx', async () => {});
  it('the stored shape doc round-trips as {@context,@graph} (envelope form asserted)', async () => {
    const r = await request(shapeUrl, { headers: { ...auth, accept: 'application/ld+json' } });
    const j = await r.json();
    assert.ok(j['@graph'], 'expected the self-describing envelope store form');
  });
});
```

(Use the shapes fixture pattern from `test/mcp-v2` item-10 style / the ld+json-500 round's tests — grep `sh:message` in `test/` and reuse the closest fixture.)

- [ ] **Step 2: Run — expect PASS.** If any leg FAILS, STOP — that is a real regression finding; report before proceeding.
- [ ] **Step 3: Commit** — `[Agent: Claude] test(lws): pin envelope-form shape admission end-to-end`

---

### Task 12: MCP batch — listing filter + affordance minors (spec §8)

**Files:**
- Modify: `src/mcp/resources.js:98-107` (`readContainerView`), `:194-208` (`readResource` bare-origin)
- Modify: `src/mcp/read-tools.js:54-60` (`localLinks`), `:126-149` (dedupe with resolver normalization)
- Modify: `src/mcp/tools.js:396-406` (describe_resource description text), `docs/mcp.md`
- Test: `test/mcp-listing-authz.test.js` (new), extend `test/mcp-read-tools.test.js`

**Interfaces:**
- Consumes: `filterReadableEntries` (`src/lws/authorized-listing.js:10-47` — signature `{ entries, containerUrl, containerStoragePath, agentWebId }` → filtered array); `ctx` (has the agent's webId — verify the field name in `src/mcp/` context construction and use it).
- Produces: MCP container views are per-member WAC-filtered; `read_resource`/`resources/read` treat `uri === origin` as `/`; `localLinks` omits `up` for `/.well-known/*` paths. **The tool registry is unchanged (10 tools)** — the lws-pod mcp-v2 gate's count assertion stays valid.

- [ ] **Step 1: Failing tests.**

`test/mcp-listing-authz.test.js`: two members in a container, one owner-only (write a member `.acl` granting only the owner); MCP `resources/read` of the container as ANON (or a second agent) must not list the protected member; as owner it must. Plus the negative: HTTP listing and MCP listing agree (same visible set — S1 parity).

Extend `test/mcp-read-tools.test.js`:
```js
it('read_resource with the bare origin reads the root container', async () => { /* uri = base, no trailing slash → items view, not "not a local resource" */ });
it('resources/read with the bare origin behaves identically (resolver-level normalization)', async () => {});
it('localLinks on a .well-known resource carries no up link', async () => {});
```

- [ ] **Step 2: Run — FAIL** (unfiltered listing; bare-origin throws in the resolver; 404ing up).

- [ ] **Step 3: Implement.**

`readContainerView`: after `listContainer`, filter —

```js
const entries = await filterReadableEntries({
  entries: await storage.listContainer(path),
  containerUrl: buildUrl(ctx, path), containerStoragePath: path,
  agentWebId: ctx.webId ?? null,
});
```

(Import from `../lws/authorized-listing.js`; verify `ctx`'s webId field name.) Bare-origin: in `readResource` (resources.js:197-198), after the origin-strip, add `if (uri === origin) uri = origin + '/';` — then DELETE the now-redundant tool-level patch at read-tools.js:130 (that's the recorded origin-normalization dedup: one normalization point, the resolver). `localLinks`: `if (path !== '/' && !path.startsWith('/.well-known/')) links.up = ...`. `describe_resource`: append to the tool's `description` string: `"When both are given, path wins and uri is ignored."` Update `docs/mcp.md` accordingly.

- [ ] **Step 4: Run the MCP suites** — `node --test --test-concurrency=1 --test-force-exit 'test/mcp*.test.js'` — zero failures (tool count untouched).
- [ ] **Step 5: Commit** — `[Agent: Claude] fix(mcp): WAC-filtered container views + read-path affordance minors`

---

### Task 13: Hygiene + full fork suite + merge

**Files:**
- Modify: `src/rdf/serve.js` (`e.message` hardening: line 66 `e.message.includes(...)` → `String(e?.message ?? e)` pattern applied to both uses)
- Modify: `src/utils/url.js` (the recorded comment nits), the extractCertKeys JSDoc (grep `extractCertKeys` for the file)
- Test: extend `test/lws-listing-authz.test.js` with the dedicated bare-`.acl` branch case (the container's own `.acl` entry: visible to a CONTROL-holder, hidden otherwise)

- [ ] **Step 1: The bare-`.acl` test** (the T6 adjudication left this branch untested — add both directions), run it, and make the small code edits.
- [ ] **Step 2: Full fork suite:**

```bash
cd /Users/cvardema/dev/git/LA3D/JavaScriptSolidServer && npm test
```
Expected: **0 failures** (1 known pre-existing skip). Any failure = fix before merging.

- [ ] **Step 3: Merge + push:**

```bash
git checkout la3d/lws && git merge --no-ff la3d/lws-gateway \
  -m "Merge la3d/lws-gateway: seam threading + teaching policy + gateway/VoID rung + smalls (spec 2026-07-11)"
git push origin la3d/lws la3d/lws-gateway
git rev-parse HEAD   # record the FULL merge SHA for Task 15's repin
```

- [ ] **Step 4: Commit any doc stragglers on the fork, then STOP fork work** — everything after this is lws-pod.

---

### Task 14: VoID materialization + the deref rail (lws-pod, spec §5/§16)

**Files:**
- Create: `projection/publish/void.mjs`, `projection/publish/void.test.mjs`
- Modify: `projection/profiles/defs/index.jsonld` (the void config — DATA), `projection/publish/publish.mjs` (wire the step + check)

**Interfaces:**
- Consumes: the manifest shape (`index.jsonld`: `{profiles[], defaultProfile, knownVocabGaps[]}`), publish's `root`/`base`/`headers` locals, the fails-loud pattern (`failures[]` → `process.exit(1)`).
- Produces: `export function buildVoid(manifest, { root, base })` → the void.jsonld object; `export function checkVoid(manifest, existsRel)` → `string[]` failures (`existsRel(relPath)` → boolean, supplied by publish from the defs tree). Publish PUTs the built doc to `${root}void.jsonld` (in-memory — the generated doc does NOT live in the defs source tree). Task 15's gate and rig depend on the pod path `/alice/profiles/void.jsonld`.

- [ ] **Step 1: Write the failing unit tests**

`projection/publish/void.test.mjs`:

```js
import { describe, it, expect } from 'vitest'
import { buildVoid, checkVoid } from './void.mjs'

const manifest = {
  void: {
    rootResource: '/alice/',
    uriSpace: 'id/',
    vocabularies: [
      { namespace: 'https://la3d.github.io/llm-wiki-colab/ontology#', dataDump: 'llm-wiki/ontology.ttl' },
      { namespace: 'https://w3id.org/lws-pod/profile#', dataDump: 'lwsp.ttl' },
    ],
    declaredExternal: ['http://www.w3.org/ns/dcat#', 'http://purl.org/dc/terms/'],
    subsets: [
      { name: 'wiki-memory', conformsTo: 'llm-wiki/profile.jsonld', rootResource: '/alice/wiki/' },
      { name: 'data-catalog', conformsTo: 'dcat-catalog/profile.jsonld', rootResource: '/alice/datasets/' },
    ],
  },
  profiles: ['llm-wiki/profile.jsonld', 'dcat-catalog/profile.jsonld'],
}
const OPTS = { root: 'https://pod.example/alice/profiles/', base: 'https://pod.example' }

describe('buildVoid', () => {
  it('builds a void:Dataset with absolute rootResource + uriSpace', () => {
    const d = buildVoid(manifest, OPTS)
    expect(d['@type']).toBe('void:Dataset')
    expect(d['void:rootResource']['@id']).toBe('https://pod.example/alice/')
    expect(d['void:uriSpace']).toBe('https://pod.example/id/')
  })
  it('every vocabulary is a described node with a pod-served dataDump', () => {
    const d = buildVoid(manifest, OPTS)
    for (const v of d['void:vocabulary'])
      expect(v['void:dataDump']['@id']).toMatch(/^https:\/\/pod\.example\/alice\/profiles\//)
  })
  it('declaredExternal vocabularies appear as bare IRIs, no dataDump', () => {
    const d = buildVoid(manifest, OPTS)
    const ext = d['void:vocabulary'].filter(v => !v['void:dataDump'])
    expect(ext.map(v => v['@id'])).toContain('http://www.w3.org/ns/dcat#')
  })
  it('one subset per family with dcterms:conformsTo → descriptor URL', () => {
    const d = buildVoid(manifest, OPTS)
    expect(d['void:subset']).toHaveLength(2)
    expect(d['void:subset'][0]['dcterms:conformsTo']['@id'])
      .toBe('https://pod.example/alice/profiles/llm-wiki/profile.jsonld')
  })
})

describe('checkVoid — the deref rail', () => {
  const allExist = () => true
  it('passes the curated manifest', () => {
    expect(checkVoid(manifest, allExist)).toEqual([])
  })
  it('FAILS a declared vocabulary whose dataDump is not in the defs tree', () => {
    const bad = structuredClone(manifest)
    bad.void.vocabularies.push({ namespace: 'https://ex.org/ns#', dataDump: 'nope.ttl' })
    const fails = checkVoid(bad, (rel) => rel !== 'nope.ttl')
    expect(fails.some(f => f.includes('nope.ttl'))).toBe(true)
  })
  it('FAILS a subset whose conformsTo is not a manifest profile', () => {
    const bad = structuredClone(manifest)
    bad.void.subsets.push({ name: 'x', conformsTo: 'ghost/profile.jsonld', rootResource: '/x/' })
    expect(checkVoid(bad, allExist).some(f => f.includes('ghost'))).toBe(true)
  })
  it('FAILS a vocabulary listed both as dumped and declaredExternal (contradiction)', () => {
    const bad = structuredClone(manifest)
    bad.void.declaredExternal.push('https://w3id.org/lws-pod/profile#')
    expect(checkVoid(bad, allExist).length).toBeGreaterThan(0)
  })
  it('no void config → no failures (void is optional)', () => {
    expect(checkVoid({ profiles: [] }, allExist)).toEqual([])
  })
})
```

- [ ] **Step 2: Run — FAIL** (`cd projection && npx vitest run publish/void.test.mjs`).

- [ ] **Step 3: Implement `projection/publish/void.mjs`:**

```js
// VoID materialization (spec 2026-07-11 §5): the /.well-known/void document is DATA,
// built from the manifest — every declared vocabulary carries a pod-served dataDump
// (the pinned mirror), never a bare external URI, unless deliberately declaredExternal
// (proto-knowledge in model priors: DCAT, DCTERMS, SKOS...). checkVoid is the rail.
const CTX = {
  void: 'http://rdfs.org/ns/void#', dcterms: 'http://purl.org/dc/terms/',
  'void:rootResource': { '@type': '@id' }, 'void:uriSpace': { '@type': '@id' },
}

export function buildVoid(manifest, { root, base }) {
  const v = manifest.void
  const abs = (p, against = base) => new URL(p, against).href
  const vocab = [
    ...v.vocabularies.map((x) => ({ '@id': x.namespace, '@type': 'void:Dataset', 'void:dataDump': { '@id': abs(x.dataDump, root) } })),
    ...(v.declaredExternal ?? []).map((ns) => ({ '@id': ns })),
  ]
  return {
    '@context': CTX,
    '@id': abs('void.jsonld', root),
    '@type': 'void:Dataset',
    'void:rootResource': { '@id': abs(v.rootResource) },
    'void:uriSpace': abs(v.uriSpace),
    'void:vocabulary': vocab,
    'void:subset': (v.subsets ?? []).map((s) => ({
      '@id': abs(`void.jsonld#${s.name}`, root), '@type': 'void:Dataset',
      'void:rootResource': { '@id': abs(s.rootResource) },
      'dcterms:conformsTo': { '@id': abs(s.conformsTo, root) },
    })),
  }
}

export function checkVoid(manifest, existsRel) {
  const v = manifest.void
  if (!v) return []
  const fails = []
  const dumped = new Set()
  for (const x of v.vocabularies ?? []) {
    dumped.add(x.namespace)
    if (!existsRel(x.dataDump)) fails.push(`void: vocabulary ${x.namespace} declares dataDump ${x.dataDump} — not in the defs tree (the deref rail: no vocabulary without a pod-served definition)`)
  }
  for (const ns of v.declaredExternal ?? [])
    if (dumped.has(ns)) fails.push(`void: ${ns} is both dumped and declaredExternal — pick one`)
  for (const s of v.subsets ?? [])
    if (!(manifest.profiles ?? []).includes(s.conformsTo)) fails.push(`void: subset ${s.name} conformsTo ${s.conformsTo} — not a manifest profile`)
  return fails
}
```

Manifest addition to `projection/profiles/defs/index.jsonld` (after `knownVocabGaps`):

```json
  "void": {
    "rootResource": "/alice/",
    "uriSpace": "id/",
    "vocabularies": [
      { "namespace": "https://la3d.github.io/llm-wiki-colab/ontology#", "dataDump": "llm-wiki/ontology.ttl" },
      { "namespace": "https://w3id.org/lws-pod/profile#", "dataDump": "lwsp.ttl" }
    ],
    "declaredExternal": [
      "http://www.w3.org/ns/dcat#",
      "http://purl.org/dc/terms/",
      "http://www.w3.org/2004/02/skos/core#",
      "http://www.w3.org/ns/dx/prof/"
    ],
    "knownUndumped": ["https://w3id.org/cogitarelink/okf#"],
    "subsets": [
      { "name": "wiki-memory", "conformsTo": "llm-wiki/profile.jsonld", "rootResource": "/alice/wiki/" },
      { "name": "data-catalog", "conformsTo": "dcat-catalog/profile.jsonld", "rootResource": "/alice/datasets/" }
    ]
  }
```

(`knownUndumped` = the okf namespace: minted-ours with no vocabulary artifact yet — neither dumpable nor honestly "external". Publish logs it as a notice, `knownVocabGaps`-style; it does NOT appear in the built doc. Recorded, not hidden.)

Wire into `publish.mjs`: in the checks phase — `failures.push(...checkVoid(manifest, (rel) => existsSync(join(DEFS, ...rel.split('/')))))` (+ the `knownUndumped` notice log); after the tree-walk PUT phase (and only when `manifest.void && !checkOnly`):

```js
const voidDoc = buildVoid(manifest, { root, base })
const rv = await fetch(new URL('void.jsonld', root).href, { method: 'PUT',
  headers: { ...headers, 'content-type': 'application/ld+json' }, body: JSON.stringify(voidDoc, null, 2) })
if (!rv.ok && rv.status !== 201 && rv.status !== 205) { console.error(`PUT void.jsonld -> ${rv.status}`); process.exit(1) }
```

- [ ] **Step 4: Run** — `npx vitest run publish/void.test.mjs publish/checks.test.mjs publish/publish.test.mjs publish/defs.test.mjs` — all green.
- [ ] **Step 5: Commit** — `[Agent: Claude] feat(publish): VoID materialization + the pod-dereferenceable-vocabulary rail`

---

### Task 15: Rig repin + gates (lws-pod)

**Files:**
- Modify: `Dockerfile.fork` (JSS_GIT_REF → Task-13 merge SHA), `docker-compose.fork-tls.yml` (image tag `lws-pod:fork-gateway`, command gains `--lws-void`), `Makefile` (`test-void` target + `.PHONY`), `README.md` (gates table row)
- Create: `tests/lws-void.test.mjs`
- Modify: `tests/lws-conneg.test.mjs` (new describe blocks), `tests/mcp-v2.test.mjs` (filter + bare-origin cases)

**Interfaces:**
- Consumes: Task-13 merge SHA; Task-14 pod path `/alice/profiles/void.jsonld`; the F3/F5 406 body shapes; the `hasConneg` guard pattern.
- Produces: `make test-void`; grown `make test-conneg`; grown `make test-mcp-v2`.

- [ ] **Step 1: Repin the rig.** `Dockerfile.fork`: `ARG JSS_GIT_REF=<full merge SHA from Task 13>`. Compose: `image: lws-pod:fork-gateway`, default build-arg = same SHA, command gains `"--lws-void", "/alice/profiles/void.jsonld"`. Rebuild + reseed:

```bash
cd /Users/cvardema/dev/git/LA3D/agents/lws-pod
docker compose -p lws-pod-forktls -f docker-compose.fork-tls.yml up -d --build
# reseed (runbook): POD_TOKEN=$(curl -sS --cacert certs/rootCA.pem -X POST https://pod.vardeman.me/idp/credentials \
#   -H 'Content-Type: application/json' -d '{"email":"alice@example.com","password":"alicepassword123"}' | python3 -c 'import sys,json;print(json.load(sys.stdin)["access_token"])')
POD_TOKEN=... make publish-profiles
# + the write_acl grants on /alice/profiles/ /alice/concepts/ /alice/graphs/ (FOLLOWUP runbook)
```

- [ ] **Step 2: `tests/lws-void.test.mjs`** (guard on the VoidService entry, mirroring the `hasConneg` pattern):

```js
import { describe, it, expect } from 'vitest'
import { BASE } from './helpers.mjs'

const sd = await fetch(`${BASE}/.well-known/lws-storage`).then(r => (r.ok ? r.json() : {})).catch(() => ({}))
const voidSvc = (sd.service || []).find(s => s.type === 'VoidService')

describe.skipIf(!voidSvc)('VoID gateway (live)', () => {
  it('/.well-known/void 303s to the pod document', async () => {
    const r = await fetch(`${BASE}/.well-known/void`, { redirect: 'manual' })
    expect(r.status).toBe(303)
    expect(r.headers.get('location')).toBe(`${BASE}/alice/profiles/void.jsonld`)
  })
  it('the document parses, declares the OOD vocabularies with pod-served dumps', async () => {
    const d = await fetch(`${BASE}/alice/profiles/void.jsonld`).then(r => r.json())
    expect(d['@type']).toBe('void:Dataset')
    const dumped = d['void:vocabulary'].filter(v => v['void:dataDump'])
    expect(dumped.length).toBeGreaterThanOrEqual(2)
    for (const v of dumped) {
      const dump = await fetch(v['void:dataDump']['@id'])
      expect(dump.status).toBe(200)   // the deref rail, live: every dump GETs from the pod
    }
  })
  it('uriSpace signposts the /id/ namespace', async () => {
    const d = await fetch(`${BASE}/alice/profiles/void.jsonld`).then(r => r.json())
    expect(d['void:uriSpace']).toBe(`${BASE}/id/`)
  })
  it('subsets route into the profile walk (conformsTo dereferences)', async () => {
    const d = await fetch(`${BASE}/alice/profiles/void.jsonld`).then(r => r.json())
    for (const s of d['void:subset'])
      expect((await fetch(s['dcterms:conformsTo']['@id'])).status).toBe(200)
  })
})
```

Makefile (+ `.PHONY` line):

```make
test-void:
	@[ -f certs/rootCA.pem ] || { echo "run 'make cert && make up-fork-tls' first"; exit 1; }
	BASE=https://pod.vardeman.me NODE_EXTRA_CA_CERTS=$(CURDIR)/certs/rootCA.pem npx vitest run tests/lws-void.test.mjs
```

- [ ] **Step 3: Grow `tests/lws-conneg.test.mjs`** — new `describe.skipIf(!hasConneg)` blocks (each `beforeAll` PUTs its fixtures, `afterAll` DELETEs them — the house pattern):

```js
describe.skipIf(!hasConneg)('teaching 406 on non-RDF sources (F3, live)', () => {
  // beforeAll: PUT wiki-f3.md (markdown) + f3.json (plain application/json) under /alice/public/
  it('markdown as text/turtle → 406 problem+json naming Accept-Profile', async () => { /* status 406, detail match */ })
  it('plain JSON as text/turtle → 406 (the probe-#6 live-repro case, now teaching)', async () => {})
  it('browser Accept → 200 markdown unchanged', async () => {})
})
describe.skipIf(!hasConneg)('bare-200 alternates (A1, live)', () => {
  it('GET /alice/wiki/a.md with no Accept-Profile carries rel="alternate" Link', async () => {})
})
describe.skipIf(!hasConneg)('root listing by conneg (A2, live)', () => {
  it('GET / with Accept: application/lws+json lists top-level containers', async () => {
    const r = await fetch(`${BASE}/`, { headers: { Accept: 'application/lws+json' } })
    expect(r.status).toBe(200)
    const j = await r.json()
    expect(j.items.some(i => i.id === `${BASE}/alice/`)).toBe(true)
  })
  it('GET / with a browser Accept still serves the HTML', async () => {})
})
describe.skipIf(!hasConneg)('variant ETags + honest WAC-Allow + OPTIONS (F2/F1/F7, live)', () => {
  it('Turtle vs JSON-LD variant ETags differ on /alice/wiki/a.md.links.jsonld', async () => {})
  it('anon GET /.acl → 401 with empty WAC-Allow grants', async () => {})
  it('OPTIONS / carries the storageDescription Link', async () => {})
})
describe.skipIf(!hasConneg)('unified profile-406 (F5, live)', () => {
  it('unknown Accept-Profile on a.md → problem+json listing the conforming profiles', async () => {})
})
```

(Fill each `it` with the full fetch+expect following the file's existing style; run against the live pod.)

- [ ] **Step 4: Grow `tests/mcp-v2.test.mjs`:** a filtered-listing case (owner-only member invisible to an anonymous `read_resource` of its container; visible to owner) and a bare-origin case (`read_resource` with `uri: BASE` → root container view, `isError` falsy). Tool-count assertion stays 10.

- [ ] **Step 5: Run the grown gates live:**

```bash
make test-void && make test-conneg && make test-mcp-v2
```
All green (mind the mcp-v2 ~60s anon rate-limit window between runs).

- [ ] **Step 6: Commit** — `[Agent: Claude] test(gates): gateway-round live cases + test-void; rig repinned to fork-gateway w/ --lws-void`

---

### Task 16: Full sweep + close-out docs

**Files:**
- Modify: `FOLLOWUP.md` (new top block; supersede the "NEXT: next-fork-round batch" pointer), `docs/foundations/05-jss-spec-conformance.md` (re-disposition the conneg/serving/OPTIONS/ETag rows), `README.md` (gates table: `test-void`)

- [ ] **Step 1: The full sweep, zero regression.** Both rigs up (`make up` + `make up-fork-tls`), profiles republished (Task 15 step 1):

```bash
make test
make test-lws && make test-l3 && make test-typeindex && make test-indexed-relation
make test-profiles && make test-dcat && make test-graph
make test-conneg && make test-mcp-v2 && make test-wiki && make test-void
make test-projection && make test-app
```
Every gate green at its FOLLOWUP-recorded count or better (conneg and mcp-v2 counts GROW this round; record the new counts). Any red = stop, fix, re-run.

- [ ] **Step 2: FOLLOWUP.md** — new top block, house pattern: shipped items (seam both faces + own-format rule, F3/F5 teaching, A1/A2/A3 + hints, VoID rung + rail, F1/F7/ETag/HEAD-parity/envelope-pin, MCP batch), the fork merge SHA + image `fork-gateway`, new gate counts, the negative-control invariant statement, carryovers (federation-hardening round; console rewire; seed hygiene; host-aware urlToStoragePath; `publish.mjs` ACL provisioning — still open; okf `knownUndumped`; `/id/` dereference DEFERRED to L4 read-side per spec §7 — probe-#7 findings about `/id/` route there). Mark the old "▶▶ NEXT: the next-fork-round batch" block `~~DONE~~` with a pointer up.

- [ ] **Step 3: foundations/05** — update the rows this round changed (conneg on non-RDF sources, OPTIONS, WAC-Allow, ETag, the well-known surface, MCP listing).

- [ ] **Step 4: Commit:**

```bash
git add FOLLOWUP.md docs/foundations/05-jss-spec-conformance.md README.md
git commit -m "$(cat <<'EOF'
[Agent: Claude] docs(followup): gateway round close-out — sweep green, teaching surface complete

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

**After Task 16: probe #7, separate session per the probe protocol — TWO ARMS (spec §20).** Arm A (MCP-cold): fresh agent, ONLY `https://pod.vardeman.me/mcp` + the CA, bootstraps through initialize → tools/list → read_resource/list_resources, read-only tools, reports structure + affordance gaps. Arm B (HTTP-cold, small): fresh agent, only the pod root, NO battery — does it probe `/.well-known/void` unprompted; can it walk the OOD vocabularies without leaving the pod? Record findings in FOLLOWUP before any further fork work.
