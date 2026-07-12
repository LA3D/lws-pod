# Debt-Drain Round Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close every open FOLLOWUP carryover — representation preservation (B1), 304/406 ordering, flag consolidation to `--lws-config`, the MCP affordance batch, federation hardening, publish ACL provisioning — leaving the carryover section empty except the L4 read-side pointer.

**Architecture:** Spec = `docs/superpowers/specs/2026-07-11-debt-drain-round-design.md` (**READ IT FIRST** — §10 decision log is binding). The through-line: `--lws` becomes the single conformant switch (implies LWS-mandated conneg; one `--lws-config` pod resource replaces the per-service path flags), and the pod stores what the client submitted so every advertisement tells the same truth.

**Tech Stack:** Node ≥18, Fastify 4, `@rdfjs/parser-jsonld` + `rdf-ext` + `n3` (already deps — NO new packages), node:test on the fork, Vitest on lws-pod.

## Global Constraints

- **Two repos.** Fork tasks (1–9): `/Users/cvardema/dev/git/LA3D/JavaScriptSolidServer`, branch `la3d/lws-drain` created off `la3d/lws` (`be2ddba`). lws-pod tasks (10–14): `/Users/cvardema/dev/git/LA3D/agents/lws-pod`, on `main`.
- **`--lws`-off byte-identity.** Every change keeps the `--lws`-off path (incl. a `--conneg`-only pod) byte-identical, pinned per task by a negative-control test — the standing invariant.
- **ONE deliberate behavior change this round:** `--lws` implies the LWS-mandated negotiation surface (Task 1). A `--lws`-without-`--conneg` pod changes by design; pinned by new tests. Everything else preserves the `--lws`+`--conneg` pairing's behavior except where the spec names a fix.
- **No new npm dependencies.** P13: fork code only guards; applications are data.
- **Fork test runs:** `node --test --test-concurrency=1 --test-force-exit 'test/<file>'` per file; full suite `node --test --test-concurrency=1 --test-force-exit 'test/*.test.js'` (bare `npm test` hangs on a pre-existing `mcp-lws-read` open handle — always use `--test-force-exit`; expect 0 fail / 1 pre-existing skip).
- **Commit format (both repos):** `[Agent: Claude] type(scope): subject` + bullet list + `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`. Stage specific files, never `git add -A`, never force-push.
- **Code style:** fastai brevity; comments only for *why*; match surrounding code.
- **Exact hint/teaching strings** in Tasks 4–6 are design copy — where a task says "verify against source," adjust to real behavior and note the change in the commit body; never silently drift.

---

### Task 1: `--lws` implies the LWS-mandated negotiation surface (spec §4a)

**Files:**
- Modify: `src/handlers/resource.js` (the shared `connegEnabled` guards), `src/handlers/container.js` (POST input gate)
- Test: `test/lws-implies-conneg.test.js` (new), `test/lws-implies-conneg-negative.test.js` (new)

**Interfaces:**
- Consumes: `request.lwsEnabled`, `connegEnabled` (both already in scope at every site — `server.js:99`/`:101` set them independently).
- Produces: under `--lws`, the container-listing negotiator's `(connegEnabled || request.lwsEnabled)` pattern (already at `resource.js:447`) is applied to the remaining SHARED sites: the file-GET RDF serving block (`resource.js:910`), its HEAD mirror (`resource.js:1159`), HEAD container negotiation (`resource.js:1328`), and the `canAcceptInput` 415-gates (`resource.js:1590`, `container.js:48`). Turtle input/negotiation works under plain `--lws`. Task 2's write path and Task 3's ordering rely on this being live under `--lws`-only.

- [ ] **Step 1: Write the failing tests**

Create `test/lws-implies-conneg.test.js`:

```js
// Spec §4a: --lws implies the LWS-mandated content-negotiation surface (LWS core:
// "Servers MUST support content negotiation for application/lws+json, application/ld+json,
// application/json for container representations", + Turtle as sanctioned MAY). A pod
// started with --lws but WITHOUT --conneg must still negotiate.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startTestServer, stopTestServer, request, createTestPod, getBaseUrl } from './helpers.js';

describe('--lws implies conneg (no --conneg flag)', () => {
  let base, auth;
  before(async () => {
    await startTestServer({ lws: true });          // NB: no conneg:true
    base = getBaseUrl();
    auth = await createTestPod('lc');
  });
  after(stopTestServer);

  it('container negotiates application/lws+json under --lws alone', async () => {
    const r = await request(`${base}/lc/`, { headers: { ...authH(auth), accept: 'application/lws+json' } });
    assert.equal(r.status, 200);
    assert.equal(r.headers.get('content-type').split(';')[0], 'application/lws+json');
  });

  it('a stored JSON-LD resource negotiates to Turtle under --lws alone', async () => {
    await request(`${base}/lc/d.jsonld`, { method: 'PUT', headers: { ...authH(auth), 'content-type': 'application/ld+json' },
      body: JSON.stringify({ '@context': {}, '@id': `${base}/lc/d.jsonld`, 'http://ex/p': 'v' }) });
    const r = await request(`${base}/lc/d.jsonld`, { headers: { ...authH(auth), accept: 'text/turtle' } });
    assert.equal(r.status, 200);
    assert.equal(r.headers.get('content-type').split(';')[0], 'text/turtle');
  });
});

// authH: adapt to the helper's auth shape (createTestPod returns a pod handle;
// copy the exact header derivation used in test/lws-serving-source.test.js).
function authH(a) { return typeof a === 'string' ? { authorization: `Bearer ${a}` } : a; }
```

Create `test/lws-implies-conneg-negative.test.js`:

```js
// NEGATIVE CONTROL (spec §1): --lws OFF, --conneg OFF → no negotiation, byte-identical upstream.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startTestServer, stopTestServer, request, createTestPod, getBaseUrl } from './helpers.js';

describe('negative: neither --lws nor --conneg negotiates', () => {
  let base, auth;
  before(async () => { await startTestServer({}); base = getBaseUrl(); auth = await createTestPod('ln'); });
  after(stopTestServer);
  it('a JSON-LD resource does NOT negotiate to Turtle with no flags', async () => {
    await request(`${base}/ln/d.jsonld`, { method: 'PUT', headers: { authorization: `Bearer ${auth}`, 'content-type': 'application/ld+json' }, body: '{"@id":"x"}' });
    const r = await request(`${base}/ln/d.jsonld`, { headers: { authorization: `Bearer ${auth}`, accept: 'text/turtle' } });
    assert.equal(r.headers.get('content-type').split(';')[0], 'application/ld+json'); // unchanged
  });
});
```

- [ ] **Step 2: Run — expect the positive file to FAIL** (Turtle negotiation dark under `--lws`-only), negative to PASS.

```bash
cd /Users/cvardema/dev/git/LA3D/JavaScriptSolidServer
git checkout -b la3d/lws-drain la3d/lws
node --test --test-concurrency=1 --test-force-exit 'test/lws-implies-conneg.test.js'
```

- [ ] **Step 3: Implement.** Introduce a single derived local at each handler entry and use it for the SHARED (item-3 class (c)) guards. In `handleGet`/`handleHead`/`handlePut` (`resource.js`) and `handlePost` (`container.js`), immediately after `connegEnabled` is read, add:

```js
// Spec §4a: --lws mandates the negotiation surface; conneg is implied by it.
const negotiate = connegEnabled || request.lwsEnabled;
```

Then replace the shared behavioral gates (NOT the legacy/`--lws`-off ones, NOT the Vary/header-shape `connegEnabled` args):
- `resource.js:910` `if (connegEnabled)` (file-GET RDF serving block) → `if (negotiate)`.
- `resource.js:1159` `if (connegEnabled)` (HEAD mirror) → `if (negotiate)`.
- `resource.js:1328` `if (connegEnabled)` (HEAD container) → `if (negotiate)`.
- `resource.js:1590` `canAcceptInput(contentType, connegEnabled)` → `canAcceptInput(contentType, negotiate)`; same at `container.js:48`.
- Inside those blocks, every `selectContentType(accept, connegEnabled, request.lwsEnabled)` already threads `lwsEnabled` (so Turtle/quads reach past the internal `!connegEnabled` early return via the lwsEnabled `supported` list) — leave the args, they already work once the outer gate opens. Where a site calls `selectContentType(accept, connegEnabled)` 2-arg inside a now-`negotiate` block, change it to `selectContentType(accept, negotiate, request.lwsEnabled)`.

Do NOT touch: `resource.js:328`/`:1002` (legacy island + `fromJsonLd` arms, `--lws`-off), the `getVaryHeader(connegEnabled, …)` calls (header shape, not behavior), and the write-conversion gate at `resource.js:1643`/`container.js:112` (that is Task 2's — leave it exactly as-is here).

- [ ] **Step 4: Run both new files — PASS.** Then the negotiation/serving regression set:
```bash
node --test --test-concurrency=1 --test-force-exit 'test/lws-serving-source.test.js' 'test/lws-serving-source-negative.test.js' 'test/lws-shadow-conneg.test.js' 'test/head-conneg.test.js' 'test/conneg*.test.js'
```
zero failures. (The rig pairs `--lws`+`--conneg`, so paired-flag behavior is unchanged; the new file proves `--lws`-only now negotiates.)

- [ ] **Step 5: Commit** — `[Agent: Claude] feat(lws): --lws implies the LWS-mandated negotiation surface`

---

### Task 2: Representation preservation — store what was submitted (spec §2, B1 root fix)

**Files:**
- Modify: `src/handlers/resource.js:1641-1673` (PUT), `src/handlers/container.js:110-137` (POST-create)
- Create: `src/lws/write-consistency.js` (the shared name-vs-type gate)
- Test: `test/lws-representation-preservation.test.js` (new), update `test/lws-store-form.test.js`, `test/lws-envelope-admission.test.js`

**Interfaces:**
- Consumes: `getContentType` (`src/utils/url.js:233`), `RDF_TYPES` (`src/rdf/conneg.js`), the submitted `contentType` (PUT `resource.js:1570`, POST `container.js:45`), `request.lwsEnabled`.
- Produces: `export function writeTypeConsistency({ urlPath, submittedType, lwsEnabled })` in `src/lws/write-consistency.js` → `{ ok: true }` or `{ ok: false, problem }` (RFC 9457 problem+json body). Task 13's gate and Task 11's publish rely on Turtle-at-rest serving its own bytes.

- [ ] **Step 1: Write the failing test**

Create `test/lws-representation-preservation.test.js`:

```js
// Spec §2: under --lws the pod stores exactly what the client submitted; the LWS read
// binding requires "content is exactly the stored data" + "Content-Type matching the
// stored media type", and container items[].mediaType MUST agree. So a .ttl PUT as
// text/turtle is stored AS Turtle (no JSON-LD envelope), served as its own bytes, and
// negotiable to JSON-LD via real conversion.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startTestServer, stopTestServer, request, createTestPod, getBaseUrl } from './helpers.js';
const TTL = '@prefix ex: <http://ex/> .\nex:s ex:p "o" .\nex:s2 ex:p "o2" .';

describe('representation preservation (--lws)', () => {
  let base, tok;
  before(async () => { await startTestServer({ lws: true }); base = getBaseUrl(); tok = await createTestPod('rp'); });
  after(stopTestServer);
  const H = (ct) => ({ authorization: `Bearer ${tok}`, 'content-type': ct });

  it('multi-subject Turtle PUT is stored AS Turtle, served as its own bytes', async () => {
    const p = await request(`${base}/rp/v.ttl`, { method: 'PUT', headers: H('text/turtle'), body: TTL });
    assert.ok([200, 201, 204, 205].includes(p.status));
    const g = await request(`${base}/rp/v.ttl`, { headers: { authorization: `Bearer ${tok}`, accept: 'text/turtle' } });
    assert.equal(g.status, 200);
    assert.equal(g.headers.get('content-type').split(';')[0], 'text/turtle');
    const body = await g.text();
    assert.ok(!body.trimStart().startsWith('{') && !body.trimStart().startsWith('['), 'stored as Turtle, not a JSON-LD envelope');
    assert.match(body, /ex:p "o"/);
  });

  it('the stored Turtle negotiates to JSON-LD via real conversion', async () => {
    const g = await request(`${base}/rp/v.ttl`, { headers: { authorization: `Bearer ${tok}`, accept: 'application/ld+json' } });
    assert.equal(g.status, 200);
    assert.equal(g.headers.get('content-type').split(';')[0], 'application/ld+json');
    const doc = await g.json();
    assert.ok(JSON.stringify(doc).includes('http://ex/p'));
  });

  it('items[] mediaType agrees with the stored Turtle type', async () => {
    const l = await request(`${base}/rp/`, { headers: { authorization: `Bearer ${tok}`, accept: 'application/lws+json' } });
    const item = (await l.json()).items.find(i => i.id.endsWith('/v.ttl'));
    assert.equal(item.mediaType, 'text/turtle');   // NB: relies on Task 7 (getContentType); assert after Task 7 lands
  });

  it('name/type mismatch → teaching 400', async () => {
    const r = await request(`${base}/rp/x.jsonld`, { method: 'PUT', headers: H('text/turtle'), body: TTL });
    assert.equal(r.status, 400);
    assert.equal(r.headers.get('content-type').split(';')[0], 'application/problem+json');
    assert.match((await r.json()).detail, /text\/turtle|\.ttl|application\/ld\+json/);
  });

  it('extension-less RDF write → teaching 400 (would serve octet-stream)', async () => {
    const r = await request(`${base}/rp/noext`, { method: 'PUT', headers: H('text/turtle'), body: TTL });
    assert.equal(r.status, 400);
  });
});
```

Note the `items[].mediaType` assertion depends on Task 7 — if Task 2 runs first, mark that one `it` `.skip` with a `TODO(task-7)` and un-skip in Task 7. (Sequence Task 7 before Task 2 if the implementer prefers; the tasks are independent.)

- [ ] **Step 2: Run — expect FAIL** (Turtle currently stored as the JSON-LD envelope under `--lws`+conversion; no 400 gate).

- [ ] **Step 3: Implement.** `src/lws/write-consistency.js`:

```js
// Spec §2: under --lws, extension-derived typing must not lie. A write whose target
// name implies one RDF media type while the body declares another (or an RDF body at
// an extension-less name that would serve as octet-stream) is refused with a teaching
// 400 — so the stored bytes, the served Content-Type, and items[].mediaType all agree.
import { getContentType } from '../utils/url.js';
import { RDF_TYPES } from '../rdf/conneg.js';

const RDF = new Set([RDF_TYPES.TURTLE, RDF_TYPES.N3, RDF_TYPES.NTRIPLES, RDF_TYPES.NQUADS, RDF_TYPES.JSON_LD]);
const main = (t) => (t || '').split(';')[0].trim().toLowerCase();

export function writeTypeConsistency({ urlPath, submittedType, lwsEnabled }) {
  if (!lwsEnabled) return { ok: true };
  const sub = main(submittedType);
  if (!RDF.has(sub)) return { ok: true };                 // non-RDF bodies: not our concern
  const nameType = main(getContentType(urlPath));         // extension-derived (octet-stream if none)
  if (nameType === 'application/octet-stream') {
    return problem(urlPath, sub, `the resource name has no extension, so it would be served as application/octet-stream; name it with an extension matching ${sub} (e.g. .ttl for text/turtle, .jsonld for application/ld+json)`);
  }
  if (nameType !== sub) {
    return problem(urlPath, sub, `the resource name implies ${nameType} but the body is ${sub}; rename to match the body's type or submit the body as ${nameType}`);
  }
  return { ok: true };
}

function problem(instance, sub, detail) {
  return { ok: false, problem: { type: 'about:blank', title: 'Bad Request', status: 400, detail, instance } };
}
```

PUT — replace the conversion block at `resource.js:1641-1653`:

```js
  const inputType = contentType.split(';')[0].trim().toLowerCase();
  if (request.lwsEnabled) {
    // Spec §2: store the submitted bytes; enforce name/type consistency instead of converting.
    const c = writeTypeConsistency({ urlPath, submittedType: contentType, lwsEnabled: true });
    if (!c.ok) return reply.code(400).type('application/problem+json').send(JSON.stringify(c.problem, null, 2));
    // JSON-LD keeps the self-describing envelope; Turtle/N3/etc. stored raw.
    if (inputType === RDF_TYPES.JSON_LD || inputType === 'application/json') {
      // (existing JSON-LD normalization, if any, stays; do NOT turtle-convert)
    }
  } else if (connegEnabled && (inputType === RDF_TYPES.TURTLE || inputType === RDF_TYPES.N3)) {
    // --lws-off legacy path — byte-identical upstream conversion.
    try {
      const jsonLd = await toJsonLd(content, contentType, resourceUrl, connegEnabled, { graphEnvelope: false });
      content = Buffer.from(JSON.stringify(jsonLd, null, 2));
    } catch (e) {
      return reply.code(400).send({ error: 'Bad Request', message: 'Invalid Turtle/N3 format: ' + e.message });
    }
  }
```

Update the post-convert content-type derivation (`resource.js:1672-1673`): under `--lws`, the stored type is the submitted type (no conversion), so pass `contentType` through unchanged; keep the `--lws`-off branch's `? RDF_TYPES.JSON_LD : …` exactly. Import `writeTypeConsistency` and `urlPath` (already in scope). Apply the identical restructure to `container.js:110-137` (POST-create), whose `urlPath` for the new resource is the container path + slug — use the slug-derived target name for `writeTypeConsistency` (verify how POST derives the new resource name; the consistency check must see the FINAL name's extension).

Admission: `applyLwsWrite` already accepts Turtle bodies (the dataset seam parses `text/turtle` — no change needed; verify by reading `src/lws/admission.js`'s `toDataset` call).

- [ ] **Step 4: Update the flipped tests.** `test/lws-store-form.test.js:46-64`: under plain `--lws` a multi-subject Turtle PUT now stores **raw Turtle**, not the envelope — rewrite those HTTP assertions to assert raw-Turtle storage + JSON-LD-conversion-on-negotiation (cite spec §2); the `turtleToJsonLd` unit test (`:16-37`) stays. `test/lws-envelope-admission.test.js`: the shape is now PUT **as `.ttl` Turtle** (rename from `.jsonld`), stored raw; keep the admission-rejects-nonconforming assertions (Turtle-at-rest admission), and narrow the "round-trips as {@context,@graph}" assertion to a NEW JSON-LD-submitted shape fixture (envelope only for JSON-LD writes). Add the N3-exclusion serving guard test here (a stored `.n3` served as `text/turtle` is a real conversion, not a mislabel).

- [ ] **Step 5: Run** the new file + both updated files + `'test/lws-serving-source.test.js'` + the full suite (force-exit). Zero failures.
- [ ] **Step 6: Commit** — `[Agent: Claude] feat(lws): store submitted RDF verbatim + write-time name/type consistency (B1)`

---

### Task 3: 304 never beats a 406 (spec §3)

**Files:**
- Modify: `src/handlers/resource.js` (GET file `:283`, container `:472`; HEAD `:1404`)
- Test: `test/lws-conditional-406.test.js` (new)

**Interfaces:**
- Consumes: `acceptSatisfiable` (`src/rdf/conneg.js`), `isRdfSourceType` (`src/rdf/serve.js`), the profile-negotiation outcome, `checkIfNoneMatchForGet`.
- Produces: a request that would 406 (media F3 arm OR profile arm) answers the 406, never a 304, on GET and HEAD; the file-304 `Vary` gains `Accept-Profile`.

- [ ] **Step 1: Write the failing test**

Create `test/lws-conditional-406.test.js`:

```js
// Spec §3 (RFC 9110 §13.2.2): preconditions apply only to requests that would otherwise
// succeed. A conditional request that would 406 (unsatisfiable Accept) must 406, never 304.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startTestServer, stopTestServer, request, createTestPod, getBaseUrl } from './helpers.js';

describe('304 never beats 406', () => {
  let base, tok, etag;
  before(async () => {
    await startTestServer({ lws: true });
    base = getBaseUrl(); tok = await createTestPod('c46');
    await request(`${base}/c46/card.md`, { method: 'PUT', headers: { authorization: `Bearer ${tok}`, 'content-type': 'text/markdown' }, body: '# c\n' });
    const r = await request(`${base}/c46/card.md`, { headers: { authorization: `Bearer ${tok}` } });
    etag = r.headers.get('etag');
  });
  after(stopTestServer);

  it('If-None-Match + unsatisfiable Accept → 406, not 304', async () => {
    const r = await request(`${base}/c46/card.md`, { headers: { authorization: `Bearer ${tok}`, 'if-none-match': etag, accept: 'text/turtle' } });
    assert.equal(r.status, 406);
  });
  it('If-None-Match + satisfiable Accept → 304 (unchanged fast path)', async () => {
    const r = await request(`${base}/c46/card.md`, { headers: { authorization: `Bearer ${tok}`, 'if-none-match': etag, accept: 'text/markdown' } });
    assert.equal(r.status, 304);
  });
  it('HEAD parity: conditional + unsatisfiable Accept → 406', async () => {
    const r = await request(`${base}/c46/card.md`, { method: 'HEAD', headers: { authorization: `Bearer ${tok}`, 'if-none-match': etag, accept: 'text/turtle' } });
    assert.equal(r.status, 406);
  });
  it('the 304 response Vary names Accept-Profile', async () => {
    const r = await request(`${base}/c46/card.md`, { headers: { authorization: `Bearer ${tok}`, 'if-none-match': etag, accept: 'text/markdown' } });
    assert.match(r.headers.get('vary') || '', /Accept-Profile/);
  });
});
```

- [ ] **Step 2: Run — FAIL** (early 304 short-circuits before the 406 gates; Vary lacks Accept-Profile).

- [ ] **Step 3: Implement.** The fix is a guard on the early If-None-Match check: only take the 304 path when the request would otherwise 200. At `resource.js:283` (GET file), before `checkIfNoneMatchForGet`, compute whether a 406 is pending and skip the 304 shortcut if so:

```js
  const ifNoneMatch = request.headers['if-none-match'];
  const wouldNotNegotiate = request.lwsEnabled
    && !isRdfSourceType(storedContentType)
    && !acceptSatisfiable(request.headers.accept || '', storedContentType);
  if (ifNoneMatch && !stats.isDirectory && !wouldNotNegotiate) {
    const check = checkIfNoneMatchForGet(ifNoneMatch, fileEtag);
    if (!check.ok && check.notModified) {
      reply.header('ETag', fileEtag);
      reply.header('Vary', getVaryHeader(connegEnabled, request.mashlibEnabled, request.lwsEnabled)); // +Accept-Profile (3-arg)
      return reply.code(304).send();
    }
  }
```

(The `getVaryHeader` 3-arg form already appends `Accept-Profile` under `--lws` — the current 2-arg call at `:288` is why the 304 Vary lacks it; adding the third arg is the Vary fix.) For the **profile** arm: the profile-406 gate (`resource.js:721`) sits after this check but the negotiation outcome isn't known at line 283. Add a lightweight profile-satisfiability pre-check into `wouldNotNegotiate` OR move the If-None-Match evaluation to just after the profile-negotiation block resolves (the latter is cleaner — the negotiation result at `:721` already tells you `notacceptable`). Prefer: compute the profile-negotiation outcome first (it's cheap — a `.meta` read the bare-200 path already does for `advertisedReps`), then gate the 304 on `!wouldNotNegotiate && negotiationOutcome !== 'notacceptable'`. Mirror both into HEAD (`resource.js:1404`, using `negotiateHeadFileContentType`'s returned `notAcceptable`). Containers (`:472`) have no F3 arm; add only the profile-arm guard + the `Accept-Profile` Vary (already 3-arg there — verify).

- [ ] **Step 4: Run — PASS** + `'test/lws-etag-variant.test.js'` + `'test/head-conneg.test.js'` + `'test/lws-nonrdf-teaching.test.js'` + `'test/lws-profile-406.test.js'` zero failures, then full suite.
- [ ] **Step 5: Commit** — `[Agent: Claude] fix(lws): a would-406 request never returns 304; 304 Vary names Accept-Profile`

---

### Task 4: `--lws-config` replaces the per-service path flags (spec §4b)

**Files:**
- Modify: `bin/jss.js` (remove `--lws-profile-index`/`--lws-void`, add `--lws-config`), `src/config.js`, `src/server.js`, `src/lws/storage-description.js`
- Create: `src/lws/pod-config.js` (the lazy mtime-cached reader)
- Test: `test/lws-config.test.js` (new); update `test/lws-void-route.test.js`, `test/lws-profiles-storage-description.test.js`

**Interfaces:**
- Consumes: `storage.read`/`storage.stat` (already imported `server.js:11`), the storage-description builder.
- Produces: `export function makePodConfig(storage, podPath)` → `{ get(): { profileIndex, void } }` (lazy, mtime-cached; absent file = `{}` + warn-once; malformed = `{}` + error-log). `server.js` resolves `profileIndexPath`/`voidPath` from `podConfig.get()` per request instead of from flags. Task 11 creates the `pod-config.jsonld` resource; Task 13's rig points `--lws-config` at it.

- [ ] **Step 1: Write the failing test**

Create `test/lws-config.test.js`:

```js
// Spec §4b: one --lws-config pod resource declares service pointers as data; it replaces
// --lws-profile-index and --lws-void. Read lazily + mtime-cached (a fresh pod boots before
// publish creates the resource; no restart needed once it appears).
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startTestServer, stopTestServer, request, createTestPod, getBaseUrl } from './helpers.js';

describe('--lws-config', () => {
  let base, tok;
  before(async () => { await startTestServer({ lws: true, lwsConfig: '/alice/profiles/pod-config.jsonld' }); base = getBaseUrl(); tok = await createTestPod('alice'); });
  after(stopTestServer);

  it('services are ABSENT before the config resource exists (no crash)', async () => {
    const sd = await (await request(`${base}/.well-known/lws-storage`)).json();
    assert.ok(!(sd.service || []).some(s => s.type === 'VoidService'));
  });

  it('after the config resource is written, services appear (no restart)', async () => {
    await request(`${base}/alice/profiles/pod-config.jsonld`, { method: 'PUT',
      headers: { authorization: `Bearer ${tok}`, 'content-type': 'application/ld+json' },
      body: JSON.stringify({ profileIndex: '/alice/profiles/index.jsonld', void: '/alice/profiles/void.jsonld' }) });
    const sd = await (await request(`${base}/.well-known/lws-storage`)).json();
    assert.ok((sd.service || []).some(s => s.type === 'VoidService' && s.serviceEndpoint.endsWith('/.well-known/void')));
    assert.ok((sd.service || []).some(s => s.type === 'ProfileIndexService'));
  });

  it('/.well-known/void 303s to the configured resource once config is present', async () => {
    const r = await request(`${base}/.well-known/void`, { redirect: 'manual' });
    assert.equal(r.status, 303);
    assert.equal(r.headers.get('location'), `${base}/alice/profiles/void.jsonld`);
  });
});
```

- [ ] **Step 2: Run — FAIL** (`lwsConfig` option unknown; flags still the source).

- [ ] **Step 3: Implement.** `filesystem.js` `stat`/`read` are async and the storage-description route (`server.js:1055`) is an async handler, so `get()` is async and awaited per request. `src/lws/pod-config.js`:

```js
// Spec §4b: the LWS service pointers live in ONE pod resource, read lazily and cached by
// mtime. A fresh pod boots before publish creates the resource — so absence is normal
// (services off, warn once); malformed is loud but non-fatal (the pod keeps serving).
export function makePodConfig(storage, storagePath) {
  const cache = { mtimeMs: -1, value: {} };
  let warned = false, errored = false;
  return {
    async get() {
      if (!storagePath) return {};
      let st;
      try { st = await storage.stat(storagePath); } catch { st = null; }
      if (!st) {
        if (!warned) { console.warn(`--lws-config: ${storagePath} not present yet — LWS services off until it is published`); warned = true; }
        return {};
      }
      const mtimeMs = st.mtime ? new Date(st.mtime).getTime() : st.mtimeMs ?? -1;
      if (mtimeMs !== cache.mtimeMs) {
        try {
          const buf = await storage.read(storagePath);
          cache.value = JSON.parse(buf.toString());
          cache.mtimeMs = mtimeMs; errored = false;
        } catch (e) {
          if (!errored) { console.error(`--lws-config: ${storagePath} unreadable/malformed (${e.message}) — services off`); errored = true; }
          cache.value = {}; cache.mtimeMs = mtimeMs;
        }
      }
      return cache.value;
    },
  };
}
```

Wire (`get()` is async — `await podConfig.get()` at each use site):
- `bin/jss.js`: delete the `--lws-profile-index`/`--lws-void` options + their `bin/jss.js:234`/`:236` threading; add `.option('--lws-config <path>', 'pod resource declaring LWS service endpoints')` + thread `lwsConfig: config.lwsConfig`.
- `src/config.js`: remove `lwsProfileIndex`/`lwsVoid` defaults+envMap; add `lwsConfig: null` + `JSS_LWS_CONFIG: 'lwsConfig'`.
- `src/server.js`: replace the `profileIndexPath`/`voidPath` resolution (`:107`/`:111`) with `const podConfig = makePodConfig(storage, lwsEnabled ? (options.lwsConfig ?? null) : null);`; in the storage-description route and the `/.well-known/void` route, resolve `const { profileIndex, void: voidPath } = await podConfig.get();` per request; pass those into `buildStorageDescription` and the void 303 (absent → service omitted / void route 404s, exactly as the old null-path did). Remove the per-request decorate of `profileIndexPath`/`voidPath` (`:397`/`:398`/`:419`/`:420`); the MCP ctx (`src/mcp/index.js:238-239`) instead reads from a shared `podConfig` accessor threaded into the plugin (or re-resolves via the same helper) — keep HTTP↔MCP parity (the `lws-void-route` parity test asserts `service` deepEqual).
- `src/lws/storage-description.js`: unchanged signature shape — it still receives `profileIndexPath`/`voidPath`; only their SOURCE changed.

- [ ] **Step 4: Update tests.** `test/lws-void-route.test.js`: the `startTestServer({ lws: true, lwsVoid: … })` option no longer exists — reshape to write a `pod-config.jsonld` fixture (as in the new test) or add a `lwsConfig` option to `test/helpers.js` `startTestServer` that maps to `--lws-config`. `test/lws-profiles-storage-description.test.js`: it calls `buildStorageDescription(…, { profileIndexPath })` directly — the builder signature is unchanged, so this stays green (verify). Keep the MCP-parity deepEqual.

- [ ] **Step 5: Run** the new + updated files + `'test/lws-storage-description.test.js'` + full suite. Zero failures.
- [ ] **Step 6: Commit** — `[Agent: Claude] feat(lws): --lws-config pod resource replaces the per-service path flags`

---

### Task 5: MCP read-path guard parity — verify, then fix only the real gap (spec §5)

**Files:**
- Modify: `src/mcp/tools.js` (`describe_resource` body treatment) and/or `src/mcp/resources.js` — DETERMINED BY STEP 1
- Test: `test/mcp-guard-parity.test.js` (new)

**Interfaces:**
- Consumes: `readBody` (`resources.js:169` — shared by `resources/read` AND the `read_resource` tool), `sanitizeBody`/`envelope` (`src/mcp/sanitize.js:26`), `sanitizeJsonLeaves`.
- Produces: the same trust treatment for a given resource across all read surfaces.

- [ ] **Step 1: CHARACTERIZE the actual behavior first (the probe's premise may be imprecise).** The explorer found `resources/read` and `read_resource` BOTH funnel through `readBody` (`resources.js:169`) — RDF/JSON-LD is structure-preserved+leaf-stripped (not fenced) on both; opaque/free-text is fenced on both. `describe_resource` (`tools.js:417`) uses `sanitizeBody` which ALWAYS fences. Write `test/mcp-guard-parity.test.js` asserting, for the SAME markdown resource and the SAME JSON-LD resource: `resources/read`, `read_resource`, and `describe_resource` agree on whether the body is fenced. Run it and record which pair actually diverges.

```js
// Characterize + pin: all read surfaces treat a given resource's trust the same way.
// (Probe #7 A1 claimed resources/read is unwrapped where the tool fences — verify against
// the shared readBody path; the real divergence may be describe_resource, which always fences.)
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
// ... boot { lws: true, mcp: true }; PUT a markdown card + a JSON-LD doc as owner ...
// helper rpc(method, params, token) as in test/mcp-v2.test.js
it('markdown: resources/read and read_resource agree on fencing', async () => { /* both fenced or both not */ });
it('json-ld: resources/read and read_resource agree', async () => { /* both structure-preserved */ });
it('describe_resource matches the read surfaces for json-ld', async () => { /* THE likely gap */ });
```

- [ ] **Step 2: Run — record the true state.** If the surfaces already agree where the spec wanted parity and only `describe_resource` diverges, the task NARROWS to: make `describe_resource`'s body use the same `readBody` trust split (structure-preserve RDF, fence opaque) instead of unconditional `sanitizeBody`. If a genuine `resources/read`-vs-tool gap exists, fix that. **Report the characterization in the task report** — do not "fix" a non-gap.

- [ ] **Step 3: Implement the real fix.** Most likely: in `tools.js` `describe_resource`, replace the `sanitizeBody(rawBody)` body construction with a call through `readBody`'s trust logic (extract the RDF-preserve-vs-fence decision from `resources.js:169` into a shared `sanitizeForTrust(text, type)` if it isn't already reusable, and call it from both). Keep `describe_resource`'s `linkset`/`types` output intact.

- [ ] **Step 4: Run** `'test/mcp-guard-parity.test.js'` + `'test/mcp*.test.js'` (force-exit), zero failures; tool count still 10 (unchanged).
- [ ] **Step 5: Commit** — `[Agent: Claude] fix(mcp): uniform trust treatment across read_resource / resources/read / describe_resource`

---

### Task 6: MCP alternates in the links carrier + affordance smalls (spec §5)

**Files:**
- Modify: `src/mcp/read-tools.js` (`localLinks` + the `read_resource` links block + `text/markdown` mimeType), `src/mcp/tools.js` (`describe_resource` teaching sentence + alternates; `lws_type_search` description; denial wording), `src/lws/storage-description.js` (budget sentence), `docs/mcp.md`
- Test: `test/mcp-alternates.test.js` (new), extend `test/mcp-read-tools.test.js`

**Interfaces:**
- Consumes: `readAuthorizedRepresentations` (`src/lws/representations.js:99` — NEW import into `src/mcp/`; call with `{ origin: ctx.origin, agentWebId: ctx.webId, public: ctx.public }`), `getContentType`, `anonRateLimitMax` (Task threads it to the builder — see Step 3).
- Produces: `read_resource`/`describe_resource` surface `rel="canonical"/"alternate"` representations; the McpService hint names the budget.

- [ ] **Step 1: Write the failing tests** (`test/mcp-alternates.test.js`): a resource with a `.meta` declaring a default + alternate representation → `read_resource`'s links block contains the alternate URIs with their profiles; `describe_resource`'s output contains the teaching sentence ("representations are negotiable via `Accept-Profile`…"). Extend `test/mcp-read-tools.test.js`: `read_resource` on a markdown card reports `mimeType` `text/markdown` (not `text/plain`); the no-oracle denial text reads "not found or not authorized"; `lws_type_search`'s tool description mentions empty-args = full inventory. Extend `test/lws-storage-description.test.js`: the McpService hint contains the budget sentence.

- [ ] **Step 2: Run — FAIL.**

- [ ] **Step 3: Implement.**
  - `localLinks` (`read-tools.js:54`): add `const reps = await readAuthorizedRepresentations(storage, path + '.meta', buildUrl(ctx, path), { origin: ctx.origin, agentWebId: ctx.webId, public: ctx.public });` and fold `{ canonical: reps.default, alternates: reps.alternates }` into the returned links object when present.
  - `read_resource` links block mimeType (`read-tools.js:151`): where `readBody` returns `text/plain` for a fenced markdown body, surface the true `getContentType(path)` (`text/markdown`) in the links carrier's `mimeType` (the fence's `original type` label already carries it — expose it, don't relabel the fenced text block itself).
  - `describe_resource` (`tools.js:420-427`): pass `representations` into `generateLinkset` (the builder already supports canonical/alternate — verify in `src/lws/linkset.js`) and append the teaching sentence to the tool's returned JSON (`hint: 'representations are negotiable via Accept-Profile: <conformsTo-uri>; alternates are listed as rel=alternate'`).
  - Denial wording: the shared no-oracle error string ("access denied: read …" / not-found) → "not found or not authorized" (grep the exact producer in `src/mcp/`; keep it a SINGLE indistinguishable string for both 403 and 404 — just reword).
  - `lws_type_search` tool description: append "Empty arguments return the full (WAC-filtered) inventory; filter with type/describedby/conformsTo (repeat to AND, comma to OR)."
  - Budget sentence: thread `anonRateLimitMax` (`server.js:209`) into `buildStorageDescription`'s flags (`server.js:1068` + the builder signature `storage-description.js:41`) and append to the McpService hint: `` `Anonymous callers: ${anonRateLimitMax} requests/minute — authenticate for more; the x-ratelimit headers carry your remaining budget.` ``
  - `docs/mcp.md`: update the `read_resource` row (links now include alternates) + `describe_resource` (teaching sentence).

- [ ] **Step 4: Run** the new + extended files + `'test/mcp*.test.js'` + `'test/lws-storage-description.test.js'` (force-exit) + full suite. Tool count still 10.
- [ ] **Step 5: Commit** — `[Agent: Claude] feat(mcp): alternates in the links carrier + affordance smalls (budget, mimeType, denial, type-search doc)`

---

### Task 7: `items[]` mediaType via `getContentType` (spec §5)

**Files:**
- Modify: `src/ldp/container.js:90-104` (`generateLwsContainer`)
- Test: `test/lws-items-mediatype.test.js` (new)

**Interfaces:**
- Consumes: `getContentType` (`src/utils/url.js:233` — Solid-aware overrides).
- Produces: suffixed sidecar members (`x.meta`, `x.acl`) report their true mapped type in `items[]`.

- [ ] **Step 1: Failing test** — a container with `a.md` + `a.md.meta`; `items[]` reports `a.md.meta` as `application/ld+json` (today: `application/octet-stream` via `mime.lookup`). A `.jpg` member still reports `image/jpeg` (getContentType falls through to mime for real files).

- [ ] **Step 2: Run — FAIL.**

- [ ] **Step 3: Implement** — `container.js:97`: `if (!e.isDirectory) item.mediaType = getContentType(e.name);` (import `getContentType` from `../utils/url.js`; it already returns `application/octet-stream` as its own fallback, so real unknown files are unchanged). Note `generateLwsContainer` filters bare dotfiles (`:94`), so only suffixed sidecars reach this line — the fix targets exactly them.

- [ ] **Step 4: Run** the new file + `'test/lws-serving-source.test.js'` + any container-listing test (`grep -rl generateLwsContainer test/`) + full suite. Un-skip the Task-2 `items[].mediaType` assertion if it was skipped.
- [ ] **Step 5: Commit** — `[Agent: Claude] fix(lws): items[] mediaType uses the Solid-aware getContentType`

---

### Task 8: Federation hardening — size bound + SSRF guard (spec §6)

**Files:**
- Modify: `src/mcp/read-tools.js` (`readRemote` `:102-112`), `bin/jss.js`/`src/config.js` (`--lws-federation-private`)
- Create: `src/mcp/ssrf.js`
- Test: `test/mcp-federation-hardening.test.js` (new)

**Interfaces:**
- Consumes: `MAX_BODY_BYTES` (`src/mcp/read.js:10`), the remote `fetch` at `read-tools.js:102`.
- Produces: `export function isBlockedHost(hostname, { allowPrivate })` in `src/mcp/ssrf.js` → boolean (loopback/RFC-1918/link-local/metadata denied unless `allowPrivate`). The remote body read is size-bounded.

- [ ] **Step 1: Failing tests** — `readRemote` against a `http://127.0.0.1:…`/`http://169.254.169.254/…` target → teaching error (SSRF blocked) when `allowPrivate` false; allowed when `--lws-federation-private`. An oversized remote body (> `MAX_BODY_BYTES`) is truncated-with-flag or refused, never fully buffered. (Use a local throwaway http server in the test for the size case; the SSRF case can assert on the pre-fetch host check without a live fetch.)

- [ ] **Step 2: Run — FAIL.**

- [ ] **Step 3: Implement.** `src/mcp/ssrf.js`:

```js
// Spec §6: block SSRF to internal ranges after resolving the URL's host. Default on; the
// local rig re-enables private targets with --lws-federation-private.
import net from 'node:net';
const PRIV4 = [/^127\./, /^10\./, /^169\.254\./, /^192\.168\./, /^172\.(1[6-9]|2\d|3[01])\./];
export function isBlockedHost(hostname, { allowPrivate = false } = {}) {
  if (allowPrivate) return false;
  const h = (hostname || '').toLowerCase();
  if (h === 'localhost' || h === '[::1]' || h === '::1') return true;
  if (h === '169.254.169.254') return true;                       // cloud metadata
  if (net.isIP(h) === 4) return PRIV4.some((re) => re.test(h));
  if (net.isIP(h) === 6 && (h.startsWith('fc') || h.startsWith('fd') || h.startsWith('fe80'))) return true;
  return false;
}
```

In `readRemote`: after parsing `url`, `if (isBlockedHost(new URL(url).hostname, { allowPrivate: ctx.federationPrivate })) return toolError('federation blocked: <url> resolves to a private/internal address (set --lws-federation-private to allow)');` before the fetch. Replace `const body = await r.text();` (`:112`) with a bounded read: stream/slice to `MAX_BODY_BYTES`, set a `truncated` flag when exceeded (mirror `readBounded`'s shape). Thread `federationPrivate` from `--lws-federation-private` (default false) through config → ctx (same pattern as other MCP ctx fields).

- [ ] **Step 4: Run** the new file + `'test/mcp*.test.js'` (force-exit) + full suite. `--lws`-off unaffected (federation is MCP-only, `--mcp`-gated).
- [ ] **Step 5: Commit** — `[Agent: Claude] fix(mcp): SSRF guard + response-size bound on the federation arm`

---

### Task 9: Full fork suite + merge

- [ ] **Step 1: Full fork suite** — `node --test --test-concurrency=1 --test-force-exit 'test/*.test.js'`, 0 fail / 1 pre-existing skip. Any failure = fix before merge.
- [ ] **Step 2: Merge + push:**
```bash
cd /Users/cvardema/dev/git/LA3D/JavaScriptSolidServer
git checkout la3d/lws && git merge --no-ff la3d/lws-drain \
  -m "Merge la3d/lws-drain: representation preservation + 304/406 + --lws-config + MCP batch + federation hardening (spec 2026-07-11)"
git push origin la3d/lws la3d/lws-drain
git rev-parse HEAD   # record the FULL merge SHA for Task 13's repin
```
- [ ] **Step 3: STOP fork work** — Tasks 10–14 are lws-pod.

---

### Task 10: `publish.mjs` provisions ACLs (spec §7)

**Files:**
- Modify: `projection/publish/publish.mjs`
- Test: `projection/publish/publish.test.mjs` (extend — unit-level for the ACL-payload builder)

**Interfaces:**
- Consumes: the MCP `write_acl` recipe (`tests/lws-dcat.test.mjs:34-54` is the exact JSON-RPC shape), publish's `base`/`headers`/`binds`/`insts` locals.
- Produces: after the tree PUT, publish grants public-read + owner-control (`isDefault: true` both) on the profiles container and every `--bind`/`--instantiate` target via `POST /mcp write_acl`, unless `--no-acl`.

- [ ] **Step 1: Write the failing unit test** — a `buildAclPayload(path, ownerWebId)` helper returns the two-authorization structure (foaf:Agent Read isDefault + owner Read/Write/Control isDefault); assert its shape. (The live grant is exercised by Task 13's gate, not here.)

- [ ] **Step 2: Run — FAIL.**

- [ ] **Step 3: Implement.** Add `--no-acl` to the arg parse (`publish.mjs:21`); after the tree-walk PUT (`publish.mjs:98`) and before the binds, when `!process.argv.includes('--no-acl')`, for each of `[container, ...bindTargets, ...instTargets]` POST `write_acl` via `fetch(`${base}/mcp`, …)` with the recipe body (`buildAclPayload`); fail loud on `isError`. Owner WebID = `${base}/alice/profile/card.jsonld#me` (verify the pod's actual owner WebID from `tests/lws-dcat.test.mjs:40`). Idempotent (re-PUT of an ACL is fine).

- [ ] **Step 4: Run** `cd projection && npx vitest run publish/` — all green.
- [ ] **Step 5: Commit** — `[Agent: Claude] feat(publish): provision public-read/owner-control ACLs by default (--no-acl to skip)`

---

### Task 11: `pod-config.jsonld` as publish data + buildVoid shape (spec §4b/§7)

**Files:**
- Create: `projection/profiles/defs/pod-config.jsonld`
- Modify: `projection/profiles/defs/index.jsonld` (manifest note), `projection/publish/checks.mjs` (a resolves-check), `projection/publish/void.mjs` (rootResource shape)
- Test: `projection/publish/void.test.mjs` (extend), `projection/publish/checks.test.mjs` (extend)

**Interfaces:**
- Consumes: the manifest; `buildVoid` (`projection/publish/void.mjs`).
- Produces: `pod-config.jsonld` = `{ "profileIndex": "/alice/profiles/index.jsonld", "void": "/alice/profiles/void.jsonld" }` shipped in the publish tree (PUT to `/alice/profiles/pod-config.jsonld`); a check that its pointers resolve to manifest-known resources; `buildVoid`'s `void:rootResource` emitted consistently with `uriSpace` (both **bare-string** — `uriSpace`'s actual pre-existing form; the CTX `@type:@id` coercion makes them RDF-equivalent — per the T14 minor).

- [ ] **Step 1: Failing tests** — `checkVoid`/a new `checkPodConfig` fails a pod-config whose `void` points at a path no manifest resource declares; `buildVoid` emits `void:rootResource` in the agreed shape (assert the shape both ways — rootResource and uriSpace consistent).

- [ ] **Step 2: Run — FAIL.**

- [ ] **Step 3: Implement.** Create `pod-config.jsonld` (plain JSON data). Add `checkPodConfig(manifest, existsRel)` to `checks.mjs` mirroring `checkVoid`'s rule shape (pointers resolve). Fix `buildVoid`'s `void:rootResource` to match `uriSpace`'s form — both **bare-string** (`uriSpace` is already bare-string; converting rootResource to bare-string is what actually makes them consistent; the CTX `@type:@id` coercion keeps the RDF identical) (the T14 recorded minor). Wire `checkPodConfig` into `publish.mjs`'s checks phase (the file is in the tree walk, so it PUTs automatically).

- [ ] **Step 4: Run** `cd projection && npx vitest run publish/` — green.
- [ ] **Step 5: Commit** — `[Agent: Claude] feat(publish): ship pod-config.jsonld as data + resolves-check; buildVoid rootResource shape`

---

### Task 12: `make reinstantiate` + mcp-v2 cleanup + freshness docs (spec §7)

**Files:**
- Modify: `Makefile` (+ `.PHONY`), `tests/mcp-v2.test.mjs` (afterAll), `README.md`/`FOLLOWUP.md` (freshness story)

**Interfaces:**
- Produces: `make reinstantiate` (re-runs bind+instantiate for every manifest family — the derived-view refresh); mcp-v2 fixtures are deleted in `afterAll`.

- [ ] **Step 1:** Add a `reinstantiate` target that runs `publish-profiles`'s bind+instantiate steps only (no re-PUT of artifacts needed, but re-PUT is harmless — simplest is to alias the publish command; if a lighter form is wanted, pass only `--bind`/`--instantiate`). Register in `.PHONY`.
- [ ] **Step 2:** Add `afterAll` to `tests/mcp-v2.test.mjs` deleting the fixtures its `beforeAll`/cases create (`mcp-filter-open.jsonld`, `mcp-filter-priv.jsonld`+`.acl`, affnote/shape fixtures) — the file currently has none (T15 finding).
- [ ] **Step 3:** Document the derived-view freshness story in README (aggregates are build products; deletion doesn't auto-refresh; `make reinstantiate` refreshes; CDC watcher is a deliberate non-goal until an app needs it).
- [ ] **Step 4:** Run `make test-mcp-v2` (wait 70s if a prior mcp run touched `/mcp`) — 18/18, and confirm a second back-to-back run leaves no residue (the afterAll works).
- [ ] **Step 5: Commit** — `[Agent: Claude] chore: make reinstantiate + mcp-v2 fixture cleanup + derived-view freshness docs`

---

### Task 13: Rig repin to `--lws-config` + grown gates (spec §9)

**Files:**
- Modify: `Dockerfile.fork`, `docker-compose.fork-tls.yml` (image tag + `--lws-config`, drop the two old flags), `Makefile` (`test-config` if separate), `tests/lws-conneg.test.mjs` (preservation + 304/406 + config cases), `tests/mcp-v2.test.mjs` (alternates + guard-parity live)
- Create: `tests/lws-preservation.test.mjs` (live)

**Interfaces:**
- Consumes: Task 9's merge SHA; Task 11's `pod-config.jsonld`; Task 10's auto-ACLs.
- Produces: the rig runs `--lws --lws-config /alice/profiles/pod-config.jsonld` (the two path flags GONE); live gates for the round's behavior.

- [ ] **Step 1: Repin + reconfigure.** `Dockerfile.fork` `ARG JSS_GIT_REF=<merge SHA>`; compose `image: lws-pod:fork-drain`, command replaces `--lws-profile-index …` and `--lws-void …` with `--lws-config /alice/profiles/pod-config.jsonld` (keep `--idp-issuer`). Rebuild:
```bash
docker compose -p lws-pod-forktls -f docker-compose.fork-tls.yml up -d --build
```
- [ ] **Step 2: Reseed** — `POD_TOKEN=… make publish-profiles` (now ACL-provisioning AND publishes `pod-config.jsonld`; the manual `write_acl` steps are GONE). Verify: `/.well-known/lws-storage` shows VoidService + ProfileIndexService (config picked up lazily); `/.well-known/void` 303s; `make test-wiki` re-instantiates the family (heals any pre-round converted artifacts to raw Turtle).
- [ ] **Step 3: Live gates.** New `tests/lws-preservation.test.mjs` (PUT Turtle → exact bytes back + items[] mediaType agree + mismatch-400). Grow `tests/lws-conneg.test.mjs` (304-never-beats-406 live; config-driven service presence). Grow `tests/mcp-v2.test.mjs` (alternates in links carrier live; guard parity live). Run: `make test-conneg && make test-void`, then `sleep 70 && make test-mcp-v2`; regression `make test-wiki && make test-profiles && make test-dcat && make test-graph` at recorded counts.
- [ ] **Step 4: Commit** — `[Agent: Claude] test(gates): drain-round live cases; rig repinned to fork-drain w/ --lws-config`

---

### Task 14: Full sweep + close-out — carryovers END EMPTY (spec §8/§9)

**Files:**
- Modify: `FOLLOWUP.md` (rewrite the carryover section to empty + the single L4 pointer; new round block), `docs/foundations/05-jss-spec-conformance.md`, `README.md`

- [ ] **Step 1: Full sweep** (both rigs up), the 14-gate order from the gateway round's close-out + `make test-config` if separate. Every gate green at its recorded count or better. Any red = STOP.
- [ ] **Step 2: FOLLOWUP.md — the drain-round block** at top: shipped (preservation, 304/406, `--lws-config` collapse, MCP batch, federation hardening, publish ACLs, reinstantiate), merge SHA + image `fork-drain`, gate counts. Then **rewrite the Carryovers section to EMPTY except one line**: the L4 read-side design round pointer (with `/id/`-401, referent-type-search-blindness, earned-conformsTo, defaultProfile-precedence, B7 vocabulary as its inputs, probe #6/#7 evidence attached). **Delete** the WON'T-FIX items with a one-line rationale each (§8): host-aware urlToStoragePath, cost-weighted limiter, public-mode .acl quirk, phantom X-Cost, thin root linkset. Mark the old "next fork round queue" ~~DONE~~.
- [ ] **Step 3: foundations/05** — re-disposition the rows this round changed (write representation/consistency, conditional-request ordering, the flag surface, MCP read-path trust + alternates, federation, items[] mediaType). Cite the spec date.
- [ ] **Step 4: Commit** — `[Agent: Claude] docs(round): debt-drain close-out — carryovers drained, L4 pointer only`

**After Task 14:** the L4 read-side design round is next (its own brainstorm → spec → plan), NOT a cold probe — a targeted controller verification of the two changed cold surfaces (representation round-trip + MCP alternates/guard) suffices this round; cold probe #8 waits for L4. Do the targeted verification and record it in FOLLOWUP before opening L4.
