# Fork Review-Round (B) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the 12 confirmed post-drain review findings in the JSS fork (`(B)` block, FOLLOWUP 2026-07-12) plus the three pre-existing LWS/Solid conformance violations (`(C)` P1–P3), in one fork round: one branch, one `--no-ff` merge, one rebuild+repin of the lws-pod rig.

**Architecture:** All fork work happens in `/Users/cvardema/dev/git/LA3D/JavaScriptSolidServer` on a new branch `la3d/lws-review` off `la3d/lws` (@ `4824fe2`). Four clusters: (1) the write-time name/type gate moves into `applyLwsWrite` — the choke point every write surface shares; (2) the serving-path conditional/negotiation family (ETag variants, 304-vs-406, NT/NQ conversion); (3) PATCH conformance (N3-Patch on verbatim-stored RDF, JSON Merge Patch, missing-Content-Type 400); (4) MCP trust/federation (sanitization, redirect revalidation, SSRF consolidation). Then lws-pod (`/Users/cvardema/dev/git/LA3D/agents/lws-pod`) repins `Dockerfile.fork` to the merge SHA and re-runs the live gates.

**Tech Stack:** Node 22, `node --test` (fork test suite, `test/*.test.js`), n3.js, jsonld.js, `@rdfjs/parser-jsonld`, Fastify. lws-pod side: Docker + Caddy TLS rig, Vitest live gates.

## Global Constraints

- **`--lws`-off byte-identity:** every behavior change is gated on `request.lwsEnabled` (or `ctx.lwsEnabled`). The published-npm/legacy path must stay byte-identical. (Standing rule, spec 2026-07-10 §1; DT1 made the ONE deliberate exception already.)
- **Commit format** (both repos): `[Agent: Claude] type(scope): subject` + bullet list + `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`. Stage specific files, never `git add -A`, never force-push.
- **TDD:** every task writes its failing test first and shows the failure before implementing.
- **Fork suite runner:** `npm test` = `node --test --test-concurrency=1 'test/*.test.js'` (147 files). Single files: `node --test test/<file>.test.js`. Known pre-existing quirk: `test/mcp-lws-read.test.js` holds a handle under the full run — run it alone if the full run wedges on it (documented in FOLLOWUP, not this round's problem).
- **Teaching errors:** rejects are `application/problem+json` with a `detail` that tells the client what to do instead (house style — see `write-consistency.js`'s `problem()`).
- **Spec citations in code comments** only where the code can't show the constraint (RFC 9110 §13.2.2, §8.8.3; Solid `#server-patch-n3-accept`, `#server-content-type-missing`; LWS media-type MUSTs; RFC 7386).

---

### Task 0: Round branch

**Files:** none (git only)

- [ ] **Step 1: Create the branch**

```bash
cd /Users/cvardema/dev/git/LA3D/JavaScriptSolidServer
git checkout la3d/lws && git pull origin la3d/lws
git checkout -b la3d/lws-review
```

Expected: on `la3d/lws-review`, HEAD = `4824fe2`.

---

### Task 1: Move the name/type gate into `applyLwsWrite` (#2) + gate `application/json` (#10)

The DT2 write-consistency gate is wired at only 2 HTTP call sites (`resource.js:1832`, `container.js:120`). The three MCP write tools (`write_resource`, `create_resource`, `put_typed_resource` — `src/mcp/tools.js:53/85/365`) call `applyLwsWrite` with no gate, so an MCP write with omitted `contentType` (defaults `text/plain`) stores arbitrary bytes at an RDF-extension name in a governed container — `admission.js` skips SHACL for non-RDF bodies, and the serving path then RDF-serves the name. Also (#10) the gate exempts `application/json`, which the rest of the pipeline treats as JSON-LD (`isRdfType`, `toJsonLd`, `isRdfBody`).

**Fix:** the gate runs inside `applyLwsWrite` (`src/lws/write.js`) — the choke point ALL write surfaces share. Two gate strengthenings: map `application/json` → JSON-LD (#10), and refuse a **non-RDF body at an RDF-extension name** (the #2 worst case; symmetric to the existing RDF-body-at-wrong-name check).

**Files:**
- Modify: `src/lws/write-consistency.js`
- Modify: `src/lws/write.js`
- Modify: `src/handlers/resource.js:1831-1833` (delete local gate call; handle `w.problem`)
- Modify: `src/handlers/container.js:118-121` (same)
- Modify: `src/mcp/tools.js` (handle `w.problem` in the three write tools)
- Test: `test/lws-write-gate-chokepoint.test.js` (new)

**Interfaces:**
- Produces: `applyLwsWrite` return gains `problem` field on gate rejection: `{ ok: false, problem: {type,title,status,detail,instance} }`. Admission rejects keep `{ ok: false, shapeUrl, violations }`. Callers branch: `w.problem` → 400 problem+json / `toolError(w.problem.detail)`; else existing admission framing.
- Produces: `writeTypeConsistency` unchanged signature, stronger semantics (used by Task 2's tests too).

- [ ] **Step 1: Write the failing tests**

```js
// test/lws-write-gate-chokepoint.test.js
// Review 2026-07-12 #2/#10: the name/type gate must hold at EVERY write
// surface (it lived at the 2 HTTP call sites only), and application/json
// must gate as JSON-LD (the rest of the pipeline already treats it so).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { callTool } from '../src/mcp/tools.js';
import { startLwsPod, ownerCtx, request, getBaseUrl, assertStatus, createTestPod, startTestServer, stopTestServer } from './helpers.js';

test('MCP write_resource: text/plain body at a .ttl name is refused (gate at choke point)', async (t) => {
  const p = await startLwsPod(t);
  const ctx = { ...ownerCtx(p), lwsEnabled: true };
  const r = await callTool('write_resource', {
    path: `/${p.podName}/evil.ttl`, content: 'not turtle at all', // contentType omitted -> text/plain
  }, ctx);
  assert.equal(r.isError, true);
  assert.match(r.content[0].text, /name implies text\/turtle/);
});

test('MCP write_resource: Turtle body at a .jsonld name is refused', async (t) => {
  const p = await startLwsPod(t);
  const ctx = { ...ownerCtx(p), lwsEnabled: true };
  const r = await callTool('write_resource', {
    path: `/${p.podName}/lie.jsonld`, content: '<#s> <#p> <#o>.', contentType: 'text/turtle',
  }, ctx);
  assert.equal(r.isError, true);
});

test('MCP put_typed_resource: extensionless write still passes (JSS idiom preserved)', async (t) => {
  const p = await startLwsPod(t);
  const ctx = { ...ownerCtx(p), lwsEnabled: true };
  const r = await callTool('put_typed_resource', {
    path: `/${p.podName}/shape1`, content: JSON.stringify({ '@id': '#it' }), contentType: 'application/ld+json',
  }, ctx);
  assert.equal(r.isError, false);
});
```

And HTTP-side (same file): `application/json` body at a `.ttl` name over PUT → 400 problem+json; `application/json` at a `.jsonld` name → 2xx (json ≡ JSON-LD, name agrees); `text/plain` PUT at `.ttl` name → 400 (symmetric check).

```js
test('HTTP PUT: application/json at .ttl name 400s; at .jsonld name passes (#10)', async () => {
  await startTestServer({ lws: true, conneg: true });
  try {
    await createTestPod('gatejson');
    const bad = await request('/gatejson/x.ttl', { method: 'PUT', auth: 'gatejson',
      headers: { 'Content-Type': 'application/json' }, body: '{"a":1}' });
    assertStatus(bad, 400);
    const ok = await request('/gatejson/x.jsonld', { method: 'PUT', auth: 'gatejson',
      headers: { 'Content-Type': 'application/json' }, body: '{"a":1}' });
    assert.ok(ok.status === 201 || ok.status === 204 || ok.status === 200);
    const plain = await request('/gatejson/y.ttl', { method: 'PUT', auth: 'gatejson',
      headers: { 'Content-Type': 'text/plain' }, body: 'junk' });
    assertStatus(plain, 400);
  } finally { await stopTestServer(); }
});
```

(Adapt harness calls to `helpers.js` exact signatures — `request(path, {method, headers, body, auth})`.)

- [ ] **Step 2: Run, verify failures**

`node --test test/lws-write-gate-chokepoint.test.js` — MCP cases fail (write succeeds today); `text/plain`-at-`.ttl` and `application/json`-at-`.ttl` HTTP cases fail (gate passes non-RDF and json today).

- [ ] **Step 3: Implement the gate strengthening** (`src/lws/write-consistency.js`)

```js
// #10 (review 2026-07-12): plain application/json gates as JSON-LD — the rest
// of the pipeline already reads it that way (isRdfType/toJsonLd/isRdfBody).
const asRdf = (t) => (t === 'application/json' ? RDF_TYPES.JSON_LD : t);

export function writeTypeConsistency({ urlPath, submittedType, lwsEnabled }) {
  if (!lwsEnabled) return { ok: true };
  const sub = asRdf(main(submittedType));
  const nameType = main(getContentType(urlPath));
  if (!RDF.has(sub)) {
    // #2 worst case: a non-RDF body at an RDF-extension name would be
    // admission-skipped on write yet RDF-served on read. Refuse the lie in
    // this direction too. Extensionless and non-RDF names stay legitimate.
    if (RDF.has(nameType)) {
      return problem(urlPath, sub || 'unspecified',
        `the resource name implies ${nameType} but the body is ${sub || 'unspecified'}; rename to a non-RDF extension or submit the body as ${nameType}`);
    }
    return { ok: true };
  }
  // ... existing JSON-LD branch and mismatch/extensionless checks unchanged,
  // with `sub` already normalized by asRdf above.
}
```

- [ ] **Step 4: Move the gate into `applyLwsWrite`** (`src/lws/write.js`)

```js
import { writeTypeConsistency } from './write-consistency.js';

export async function applyLwsWrite({ storage, storagePath, resourceUrl, content, contentType, declaredTypes = [], lwsEnabled }) {
  // #2 (review 2026-07-12): the gate runs at THE choke point every write
  // surface shares (HTTP PUT/POST + all MCP write tools) — no surface can
  // store a name/type lie or an admission-skipped body at an RDF name.
  const c = writeTypeConsistency({ urlPath: storagePath, submittedType: contentType, lwsEnabled });
  if (!c.ok) return { ok: false, problem: c.problem };
  // ... existing admission/write/type-capture unchanged
```

- [ ] **Step 5: Update the callers**

`src/handlers/resource.js`: delete lines 1831–1833 (the `if (request.lwsEnabled) { writeTypeConsistency... }` block — keep the `else if (connegEnabled ...)` legacy conversion, which becomes a plain `if (!request.lwsEnabled && connegEnabled ...)`). In the `if (!w.ok)` branch after `applyLwsWrite`:

```js
  if (!w.ok) {
    if (w.problem) {
      return reply.code(400).type('application/problem+json').send(JSON.stringify(w.problem, null, 2));
    }
    // ... existing admission problem path unchanged
```

`src/handlers/container.js`: same two edits (delete lines 119–121 gate call, add `w.problem` branch at line 155). Remove the now-unused `writeTypeConsistency` imports from both handlers.

`src/mcp/tools.js` (three write tools): `if (!w.ok) return w.problem ? toolError(w.problem.detail) : admissionError(...)`. In `put_typed_resource`, the `.meta` rollback must also run on a gate reject (it keys off `!w.ok || !w.wrote` already — verify the rollback happens before returning).

- [ ] **Step 6: Run tests** — new file passes; then `node --test test/lws-representation-preservation.test.js test/lws-admission-put.test.js test/lws-admission-post.test.js test/mcp-lws-write.test.js test/content-type-lwstypes.test.js` (nearest neighbors) all pass.

- [ ] **Step 7: Commit**

```bash
git add src/lws/write-consistency.js src/lws/write.js src/handlers/resource.js src/handlers/container.js src/mcp/tools.js test/lws-write-gate-chokepoint.test.js
git commit -m "$(cat <<'EOF'
[Agent: Claude] fix(lws): name/type gate moves into applyLwsWrite — the write choke point (review #2, #10)

- writeTypeConsistency runs inside applyLwsWrite: HTTP PUT/POST and all
  three MCP write tools share ONE gate; the MCP bypass is closed
- application/json gates as JSON-LD (pipeline parity)
- non-RDF body at an RDF-extension name is refused (the SHACL-skip lie)
- callers handle the new problem return; HTTP local gate calls deleted

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Slug-less POST of non-JSON-LD RDF gets a server-derived extension (#9)

Slug-less POST assigns `crypto.randomUUID()` — extensionless — and the gate then 400s Turtle/N3/NT/NQ bodies: standard LDP POST-to-create is broken for a name the *server* chose. Same applies to MCP `create_resource` once Task 1 lands.

**Files:**
- Modify: `src/lws/write-consistency.js` (export the extension map)
- Modify: `src/storage/filesystem.js:211-235` (`generateUniqueFilename` gains `defaultExt`)
- Modify: `src/handlers/container.js:92` (pass derived ext under `--lws`)
- Modify: `src/mcp/tools.js:78` (`create_resource` same)
- Test: `test/lws-post-slugless-rdf.test.js` (new)

**Interfaces:**
- Produces: `extensionForRdfType(contentType) -> '.ttl'|'.n3'|'.nt'|'.nq'|''` exported from `src/lws/write-consistency.js`. JSON-LD deliberately maps to `''` (extensionless JSON-LD is the legitimate legacy shape — do not change it).
- Produces: `generateUniqueFilename(containerPath, slug, isDir = false, defaultExt = '')` — `defaultExt` only used when `slug` is falsy and `!isDir`.

- [ ] **Step 1: Write the failing test**

```js
// test/lws-post-slugless-rdf.test.js
// Review #9: the server must not assign a name its own gate rejects — a
// slug-less POST of Turtle gets .ttl, N-Quads gets .nq; JSON-LD stays
// extensionless (legacy shape).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startTestServer, stopTestServer, request, createTestPod, assertStatus } from './helpers.js';

test('slug-less POST: turtle -> 201 with a .ttl-named resource that round-trips', async (t) => {
  await startTestServer({ lws: true, conneg: true });
  t.after(stopTestServer);
  await createTestPod('slugless');
  const r = await request('/slugless/', { method: 'POST', auth: 'slugless',
    headers: { 'Content-Type': 'text/turtle' }, body: '<#s> <http://ex/p> "v".' });
  assertStatus(r, 201);
  const loc = new URL(r.headers.get('location')).pathname;
  assert.match(loc, /\.ttl$/);
  const back = await request(loc, { headers: { Accept: 'text/turtle' }, auth: 'slugless' });
  assertStatus(back, 200);
  assert.match(await back.text(), /"v"/);
});

test('slug-less POST: n-quads -> .nq; JSON-LD -> extensionless (unchanged legacy shape)', async (t) => {
  await startTestServer({ lws: true, conneg: true });
  t.after(stopTestServer);
  await createTestPod('slugless2');
  const nq = await request('/slugless2/', { method: 'POST', auth: 'slugless2',
    headers: { 'Content-Type': 'application/n-quads' },
    body: '<http://ex/s> <http://ex/p> "v" <http://ex/g>.' });
  assertStatus(nq, 201);
  assert.match(new URL(nq.headers.get('location')).pathname, /\.nq$/);
  const jld = await request('/slugless2/', { method: 'POST', auth: 'slugless2',
    headers: { 'Content-Type': 'application/ld+json' }, body: JSON.stringify({ '@id': '#it' }) });
  assertStatus(jld, 201);
  assert.doesNotMatch(new URL(jld.headers.get('location')).pathname, /\.\w+$/);
});
```

Plus an MCP case: `create_resource` with `contentType: 'text/turtle'`, no slug → created path ends `.ttl`.

- [ ] **Step 2: Run, verify failure** — turtle/nq cases 400 today.

- [ ] **Step 3: Implement**

`src/lws/write-consistency.js`:

```js
// #9: the canonical extension per gated RDF type — slug-less POST/create
// derives the server-assigned name from it so the gate's own rule is never
// violated by a name the SERVER chose. JSON-LD absent on purpose:
// extensionless JSON-LD is the legitimate legacy creation shape.
export const RDF_EXTENSIONS = {
  [RDF_TYPES.TURTLE]: '.ttl',
  [RDF_TYPES.N3]: '.n3',
  [RDF_TYPES.NTRIPLES]: '.nt',
  [RDF_TYPES.NQUADS]: '.nq',
};
export const extensionForRdfType = (contentType) => RDF_EXTENSIONS[main(contentType)] || '';
```

`src/storage/filesystem.js`:

```js
export async function generateUniqueFilename(containerPath, slug, isDir = false, defaultExt = '') {
  const basePath = urlToPath(containerPath);
  let name = slug || (crypto.randomUUID() + (isDir ? '' : defaultExt));
  // ... rest unchanged
```

`src/handlers/container.js` (hoist the content-type read above filename generation — it's already at line 48):

```js
  const defaultExt = (request.lwsEnabled && !isCreatingContainer)
    ? extensionForRdfType(contentType) : '';
  const filename = await storage.generateUniqueFilename(storagePath, slug, isCreatingContainer, defaultExt);
```

`src/mcp/tools.js` `create_resource`:

```js
  const name = await storage.generateUniqueFilename(container, slug || null, !!isContainer,
    (!isContainer && ctx.lwsEnabled) ? extensionForRdfType(contentType || 'text/plain') : '');
```

Also update the gate's docstring in `write-consistency.js` — "POST slug-less create" now passes because the server derives the extension, not because extensionless RDF is allowed.

- [ ] **Step 4: Run tests** — new file + `test/lws-admission-post.test.js` + `test/container.test.js` pass.

- [ ] **Step 5: Commit** (same format; scope `fix(lws): server-derived extension for slug-less RDF POST (review #9)`).

---

### Task 3: Verbatim-stored N-Triples/N-Quads convert on read; JSON-LD is graph-capable (#6)

`toDataset` (`src/rdf/dataset.js:42`) routes NT/NQ bytes to the JSON-LD parser (never parses → every conversion 406s), and `GRAPH_CAPABLE` (`src/rdf/serve.js:27`) omits JSON-LD though `jsonld.fromRDF` is lossless for named graphs. Not a protocol obligation (`.nt`/`.nq` are 415-rejected on protocol writes) but a live data path for git/filesystem-seeded files.

**Files:**
- Modify: `src/rdf/dataset.js:42-46`
- Modify: `src/rdf/serve.js:27`
- Test: `test/lws-serve-nt-nq.test.js` (new)

- [ ] **Step 1: Write the failing test.** Seed files directly through the storage layer (the git-seeded path — bypasses the write gate):

```js
// test/lws-serve-nt-nq.test.js
// Review #6: filesystem/git-seeded .nt/.nq sources must convert on read —
// toDataset routed them to the JSON-LD parser (never parses), and JSON-LD
// was missing from GRAPH_CAPABLE though jsonld.fromRDF is lossless.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as storage from '../src/storage/filesystem.js';
import { startTestServer, stopTestServer, request, createTestPod, assertStatus } from './helpers.js';

test('seeded .nq with a named graph: -> ld+json 200 (lossless), -> turtle 406 (lossy)', async (t) => {
  await startTestServer({ lws: true, conneg: true });
  t.after(stopTestServer);
  await createTestPod('ntnq');
  await storage.write('/ntnq/g.nq', Buffer.from('<http://ex/s> <http://ex/p> "v" <http://ex/g>.\n'));
  const asJson = await request('/ntnq/g.nq', { headers: { Accept: 'application/ld+json' }, auth: 'ntnq' });
  assertStatus(asJson, 200);
  const doc = JSON.parse(await asJson.text());
  assert.match(JSON.stringify(doc), /http:\/\/ex\/g/);       // named graph survives
  const asTtl = await request('/ntnq/g.nq', { headers: { Accept: 'text/turtle' }, auth: 'ntnq' });
  assertStatus(asTtl, 406);                                   // still lossy — teaching 406
});

test('seeded .nt (no graphs): -> turtle 200; named-graph JSON-LD -> ld+json still self-serves', async (t) => {
  await startTestServer({ lws: true, conneg: true });
  t.after(stopTestServer);
  await createTestPod('ntnq2');
  await storage.write('/ntnq2/t.nt', Buffer.from('<http://ex/s> <http://ex/p> "v".\n'));
  const asTtl = await request('/ntnq2/t.nt', { headers: { Accept: 'text/turtle' }, auth: 'ntnq2' });
  assertStatus(asTtl, 200);
  assert.match(await asTtl.text(), /"v"/);
});
```

(Check how other tests seed via `storage.write` for the correct root-relative path convention — mirror `test/lws-items-mediatype.test.js` or similar. WAC: make the container public-read or pass owner auth.)

- [ ] **Step 2: Run, verify failure** (`-> ld+json` 406s today; `-> turtle` from `.nt` 406s today).

- [ ] **Step 3: Implement**

`src/rdf/dataset.js` — one route for the whole n3 family (n3's default parser mode is the permissive Turtle/TriG/N-Triples/N-Quads superset):

```js
  if (t === RDF_TYPES.TURTLE || t === RDF_TYPES.N3 || t === RDF_TYPES.NTRIPLES || t === RDF_TYPES.NQUADS) {
    return datasetFromTurtle(buffer.toString('utf8'), baseIri);
  }
```

`src/rdf/serve.js`:

```js
const GRAPH_CAPABLE = new Set([RDF_TYPES.NQUADS, RDF_TYPES.JSON_LD]);
```

- [ ] **Step 4: Run tests** — new file + `test/lws-representation-preservation.test.js` + `test/conneg-negotiate.test.js` + `test/lws-conneg.test.js` pass. Verify the named-graph→JSON-LD case emits expanded JSON-LD with `@graph` (jsonld.fromRDF output).

- [ ] **Step 5: Commit** (`fix(rdf): parse verbatim NT/NQ through n3; JSON-LD is graph-capable (review #6)`).

---

### Task 4: Representation-differentiating ETags on the JSON-LD arm (#5 — STANDARDS VIOLATION, priority)

`predictFileEtag` (`src/handlers/resource.js:244-258`) (a) gates its RDF branch on `connegEnabled` while the serving arm runs under `negotiate = connegEnabled || lwsEnabled`, and (b) has no variant key for the JSON-LD *conversion* of a non-JSON-LD source (`negotiateQuadsTarget` returns `undefined` for ld+json → bare ETag). A `.ttl` resource's Turtle bytes and its JSON-LD conversion share one bare ETag → cross-variant 304 reuse. RFC 9110 §8.8.3 + LWS ETag MUST.

**Files:**
- Modify: `src/handlers/resource.js:244-258` (`predictFileEtag`)
- Test: `test/lws-etag-variant.test.js` (extend — this file already pins the variant family)

**Interfaces:**
- Produces: the JSON-LD-conversion variant suffix is `-json` (Task 5's tests reuse it). Own-format reads keep the bare ETag (existing pins must stay green).

- [ ] **Step 1: Write the failing tests** (append to `test/lws-etag-variant.test.js`, new `describe` block seeding a **`.ttl`-stored** doc via PUT `text/turtle`):

```js
describe('lws: JSON-LD conversion arm ETag (review #5)', () => {
  let base;
  const TTL = '/etagj/public/r.ttl';
  before(async () => {
    await startTestServer({ lws: true, conneg: true });
    base = getBaseUrl();
    await createTestPod('etagj');
    await request(TTL, { method: 'PUT', headers: { 'Content-Type': 'text/turtle' }, auth: 'etagj',
      body: '<#s> <http://ex/p> "v".' });
  });
  after(stopTestServer);

  it('the JSON-LD conversion of a .ttl source carries a -json variant ETag', async () => {
    const r = await request(TTL, { headers: { Accept: 'application/ld+json' } });
    assertStatus(r, 200);
    assert.match(r.headers.get('etag'), /-json"$/);
  });

  it('own-format .ttl GET keeps the bare ETag; the two variants differ', async () => {
    const ttl = await request(TTL, { headers: { Accept: 'text/turtle' } });
    const json = await request(TTL, { headers: { Accept: 'application/ld+json' } });
    assert.match(ttl.headers.get('etag'), BARE_ETAG_RE);
    assert.notEqual(ttl.headers.get('etag'), json.headers.get('etag'));
  });

  it('a Turtle-variant If-None-Match never 304s the JSON-LD variant (cross-variant)', async () => {
    const ttl = await request(TTL, { headers: { Accept: 'text/turtle' } });
    const r = await request(TTL, { headers: { Accept: 'application/ld+json', 'If-None-Match': ttl.headers.get('etag') } });
    assertStatus(r, 200);
  });

  it('same-variant If-None-Match still 304s', async () => {
    const json = await request(TTL, { headers: { Accept: 'application/ld+json' } });
    const r = await request(TTL, { headers: { Accept: 'application/ld+json', 'If-None-Match': json.headers.get('etag') } });
    assertStatus(r, 304);
    assert.match(r.headers.get('etag'), /-json"$/);
  });

  it('HEAD mirrors GET ETags on both arms', async () => {
    const g = await request(TTL, { headers: { Accept: 'application/ld+json' } });
    const h = await request(TTL, { method: 'HEAD', headers: { Accept: 'application/ld+json' } });
    assert.equal(h.headers.get('etag'), g.headers.get('etag'));
  });
});
```

- [ ] **Step 2: Run, verify failures** (`-json` assertions fail — bare ETag today).

- [ ] **Step 3: Implement** (`predictFileEtag` — full replacement):

```js
function predictFileEtag(request, stats, effectiveEtag, willServeMashlib, storagePath, urlPath, connegEnabled) {
  if (!request.lwsEnabled || willServeMashlib) return effectiveEtag;
  const acceptHeader = request.headers.accept || '';
  if (selectContentType(acceptHeader, connegEnabled) === RDF_TYPES.LINKSET) {
    return variantEtag(stats.etag, 'ls');
  }
  const storedContentType = getContentType(storagePath);
  // #5 (RFC 9110 §8.8.3 / LWS ETag MUST): keyed on the negotiation surface the
  // serving arm actually runs (this function already early-returns unless
  // lwsEnabled, and --lws mandates negotiation — spec §4a), and covering BOTH
  // conversion arms: quads targets get their VARIANT_KEYS suffix, the JSON-LD
  // conversion of a non-JSON-LD source gets '-json'. Before this, Turtle
  // bytes and their JSON-LD conversion shared one bare ETag (cross-variant
  // 304 reuse), and --lws-without---conneg collapsed every variant.
  if (isRdfSourceType(storedContentType)) {
    const quadsTarget = negotiateQuadsTarget(acceptHeader, true, true, urlPath);
    if (quadsTarget && quadsTarget !== storedContentType) {
      return variantEtag(stats.etag, VARIANT_KEYS[quadsTarget]);
    }
    if (!quadsTarget && storedContentType !== RDF_TYPES.JSON_LD) {
      return variantEtag(stats.etag, 'json');   // the ld+json conversion arm (~line 1097)
    }
  }
  return stats.etag;
}
```

The GET serving arms (lines 1077, 1101) and HEAD (line 1532) already consume `fileEtag`/`predictFileEtag` — no further edits needed there; verify by test.

- [ ] **Step 4: Run** `node --test test/lws-etag-variant.test.js test/lws-conditional-406.test.js test/conditional.test.js test/head-conneg.test.js` — all pass (existing bare-ETag pins for own-format and JSON-LD-stored docs must stay green).

- [ ] **Step 5: Commit** (`fix(lws): JSON-LD conversion arm gets a variant ETag; prediction keyed on the real negotiation surface (review #5)`).

---

### Task 5: A pending RDF conversion defers the early 304; 406s carry no ETag (#4)

`wouldNotNegotiate` (`resource.js:307-309`) is false for every RDF source, so the zero-I/O early 304 short-circuits a would-406 (named-graph lossiness / parse-fail). Reachable replay: a named-graph doc's Turtle request 406s **with the variant ETag in the response**; replaying that ETag turns the retry into a wrong 304. Fix: (a) defer the early 304 whenever a real conversion is pending, re-check If-None-Match in the serving arm only after the outcome is known; (b) stop emitting ETag on 406 responses. GET + HEAD flow through the same predicate.

**Files:**
- Modify: `src/handlers/resource.js` (GET ~307-327, serving arms ~1073-1115; HEAD ~1539-1560 + its 406/serve path; the post-profile-block deferred re-check)
- Test: `test/lws-conditional-406.test.js` (extend)

**Interfaces:**
- Consumes: Task 4's `-json`/`-ttl` variant ETags.
- Produces: helper `pendingConversion(request, storagePath, urlPath)` (module-local to resource.js) returning `true` when an RDF-source conversion arm will run — shared by GET and HEAD deferral.

- [ ] **Step 1: Write the failing tests** (extend `test/lws-conditional-406.test.js`; seed a **named-graph JSON-LD** doc — `{'@id': `${base}#g`, '@graph': [...]}` — whose Turtle conversion 406s):

```js
it('replaying a variant ETag against a would-406 conversion answers 406, never 304 (review #4)', async () => {
  const own = await request(NG, { headers: { Accept: 'application/ld+json' } });   // own-format 200, bare etag
  const ttlVariant = own.headers.get('etag').replace(/"$/, '-ttl"');               // the etag a pre-fix 406 leaked
  const r = await request(NG, { headers: { Accept: 'text/turtle', 'If-None-Match': ttlVariant } });
  assertStatus(r, 406);
});

it('406 responses carry no ETag (no replayable validator for a non-representation)', async () => {
  const r = await request(NG, { headers: { Accept: 'text/turtle' } });
  assertStatus(r, 406);
  assert.equal(r.headers.get('etag'), null);
});

it('deferred conversion 304 still works when the conversion succeeds', async () => {
  const ok = await request(DG, { headers: { Accept: 'text/turtle' } });            // default-graph doc converts fine
  const r = await request(DG, { headers: { Accept: 'text/turtle', 'If-None-Match': ok.headers.get('etag') } });
  assertStatus(r, 304);
});

it('HEAD: would-406 + matching If-None-Match answers 406 (parity)', async () => {
  const own = await request(NG, { headers: { Accept: 'application/ld+json' } });
  const ttlVariant = own.headers.get('etag').replace(/"$/, '-ttl"');
  const r = await request(NG, { method: 'HEAD', headers: { Accept: 'text/turtle', 'If-None-Match': ttlVariant } });
  assertStatus(r, 406);
});
```

- [ ] **Step 2: Run, verify failures** (first case 304s today; second finds an ETag on the 406).

- [ ] **Step 3: Implement**

(a) Predicate (near `predictFileEtag` — one seam for GET + HEAD):

```js
// #4 (RFC 9110 §13.2.2): a real RDF conversion can still 406 (parse-fail /
// named-graph lossiness), and that outcome needs the bytes — so the zero-I/O
// early 304 defers whenever a conversion arm will run; the arm re-checks
// If-None-Match only after its outcome is known. Own-format reads (bytes are
// bytes) can never 406 and keep the early check.
function pendingConversion(request, storagePath, urlPath) {
  if (!request.lwsEnabled) return false;
  const stored = getContentType(storagePath);
  if (!isRdfSourceType(stored)) return false;
  const acceptHeader = request.headers.accept || '';
  if (selectContentType(acceptHeader, true) === RDF_TYPES.LINKSET) return false; // generated, never 406s
  const quadsTarget = negotiateQuadsTarget(acceptHeader, true, true, urlPath);
  if (quadsTarget) return !(QUADS_OUTPUTS[stored] === quadsTarget && stored !== RDF_TYPES.N3); // isOwnFormat mirror
  return stored !== RDF_TYPES.JSON_LD;   // ld+json target: converts unless self
}
```

(b) GET: compute `const conversionPending = !stats.isDirectory && pendingConversion(request, storagePath, urlPath);` next to `wouldNotNegotiate`, add `&& !conversionPending` to the early-check condition (line 320) AND to the post-profile-block deferred re-check (find the "deferred re-check sits right after it resolves" block); in BOTH serving arms (quads ~1073, ld+json ~1097), after `served.ok`:

```js
          if (ifNoneMatch) {
            const check = checkIfNoneMatchForGet(ifNoneMatch, fileEtag);
            if (!check.ok && check.notModified) {
              reply.header('ETag', fileEtag);
              reply.header('Vary', getVaryHeader(connegEnabled, request.mashlibEnabled, request.lwsEnabled));
              return reply.code(304).send();
            }
          }
```

(c) No ETag on 406: in both arms pass `etag: served.ok ? fileEtag : null` to `getAllHeaders` (verify `getAllHeaders` skips a null etag — check `src/ldp/headers.js`; if not, delete the header on the 406 path). Same for the HEAD notAcceptable path.

(d) HEAD: mirror — add `conversionPending` to the HEAD early-check deferral (~line 1543's condition), and after `negotiateHeadFileContentType` resolves without `notAcceptable`, re-check If-None-Match against `headEtag` before replying.

- [ ] **Step 4: Run** the extended file + `test/conditional.test.js` + `test/head-conneg.test.js` + `test/lws-etag-variant.test.js`. The existing "304 wins over profile-303" pin must stay green.

- [ ] **Step 5: Commit** (`fix(lws): pending RDF conversion defers the early 304; 406 carries no ETag (review #4)`).

---

### Task 6: PATCH conformance — N3-Patch on verbatim-stored RDF (#7, priority), JSON Merge Patch (P1), bodied write without Content-Type → 400 (P2)

`handlePatch` (`resource.js:1999+`) `safeJsonParse`es stored bytes: a `text/n3` PATCH of a verbatim-stored `.ttl` 409s "not valid JSON-LD" — violates Solid `#server-patch-n3-accept` MUST. The handler also 415s everything but n3/sparql-update — violates LWS core update-resource ("MUST minimally support JSON Merge Patch", RFC 7386). And `canAcceptInput('')` returns true — a bodied write without Content-Type is never 400'd (Solid `#server-content-type-missing` MUST).

**Files:**
- Modify: `src/handlers/resource.js` (`handlePatch`, `handlePut` P2 guard)
- Modify: `src/handlers/container.js` (`handlePost` P2 guard)
- Modify: `src/rdf/serve.js` (export `datasetToJsonLd`)
- Modify: `src/rdf/conneg.js` (`getAcceptHeaders` advertises merge-patch under lws)
- Modify: `src/server.js` or wherever content-type parsers are registered (merge-patch+json body parser; find with `grep -n addContentTypeParser src/*.js src/**/*.js`)
- Create: `src/patch/merge-patch.js`
- Test: `test/lws-patch-conformance.test.js` (new)

**Before coding:** read `src/patch/n3-patch.js` (`parseN3Patch`/`applyN3Patch`) to learn what document shape `applyN3Patch` operates on. The plan below assumes document-level application on a JSON-LD doc; if `applyN3Patch` turns out to work on expanded JSON-LD poorly, adapt by compacting first — the tests define the contract, triple-level, via GET round-trips.

- [ ] **Step 1: Write the failing tests**

```js
// test/lws-patch-conformance.test.js
// Review #7 (Solid #server-patch-n3-accept MUST) + P1 (LWS: JSON Merge Patch
// MUST, RFC 7386) + P2 (Solid #server-content-type-missing MUST).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startTestServer, stopTestServer, request, createTestPod, assertStatus } from './helpers.js';

const N3_INSERT = `@prefix solid: <http://www.w3.org/ns/solid/terms#>.
_:p a solid:InsertDeletePatch;
  solid:inserts { <#s> <http://ex/q> "added". }.`;

test('N3 Patch on a verbatim-stored .ttl applies and stays Turtle (#7)', async (t) => {
  await startTestServer({ lws: true, conneg: true });
  t.after(stopTestServer);
  await createTestPod('patchttl');
  await request('/patchttl/d.ttl', { method: 'PUT', auth: 'patchttl',
    headers: { 'Content-Type': 'text/turtle' }, body: '<#s> <http://ex/p> "v".' });
  const r = await request('/patchttl/d.ttl', { method: 'PATCH', auth: 'patchttl',
    headers: { 'Content-Type': 'text/n3' }, body: N3_INSERT });
  assert.ok([200, 204].includes(r.status), `expected 2xx, got ${r.status}`);
  const back = await request('/patchttl/d.ttl', { headers: { Accept: 'text/turtle' }, auth: 'patchttl' });
  const ttl = await back.text();
  assert.match(ttl, /"v"/);        // original triple survives
  assert.match(ttl, /"added"/);    // patch applied
  assert.equal(back.headers.get('content-type').split(';')[0], 'text/turtle');  // stored format preserved
});

test('JSON Merge Patch applies to a stored JSON-LD doc (P1, RFC 7386)', async (t) => {
  await startTestServer({ lws: true, conneg: true });
  t.after(stopTestServer);
  await createTestPod('mergep');
  await request('/mergep/d.jsonld', { method: 'PUT', auth: 'mergep',
    headers: { 'Content-Type': 'application/ld+json' },
    body: JSON.stringify({ '@context': { ex: 'http://ex/' }, '@id': '#it', 'ex:a': 'keep', 'ex:b': 'drop' }) });
  const r = await request('/mergep/d.jsonld', { method: 'PATCH', auth: 'mergep',
    headers: { 'Content-Type': 'application/merge-patch+json' },
    body: JSON.stringify({ 'ex:b': null, 'ex:c': 'new' }) });
  assert.ok([200, 204].includes(r.status), `expected 2xx, got ${r.status}`);
  const back = JSON.parse(await (await request('/mergep/d.jsonld', { auth: 'mergep' })).text());
  assert.equal(back['ex:a'], 'keep');
  assert.equal('ex:b' in back, false);
  assert.equal(back['ex:c'], 'new');
});

test('merge-patch on a Turtle-stored doc 415s with teaching (P1 scope)', async (t) => { /* PUT d.ttl, PATCH merge-patch -> 415 */ });

test('Accept-Patch advertises merge-patch under --lws', async (t) => {
  // OPTIONS or GET any resource; header contains text/n3 AND application/merge-patch+json
});

test('bodied PUT/POST/PATCH without Content-Type -> 400 (P2)', async (t) => {
  await startTestServer({ lws: true, conneg: true });
  t.after(stopTestServer);
  await createTestPod('noct');
  // NOTE: fetch auto-sets Content-Type for string bodies in some runtimes —
  // pass an explicit empty header or use a raw socket if needed; FIRST record
  // what the server does today (the audit flagged "verify no upstream Fastify
  // guard catches it first").
  const r = await request('/noct/x.bin', { method: 'PUT', auth: 'noct', body: 'some bytes',
    headers: { 'Content-Type': '' } });
  assertStatus(r, 400);
});
```

- [ ] **Step 2: Run, verify failures.** Record the P2 case's CURRENT status code in the task notes — if it already 400s from a Fastify layer, P2 is no-change-needed (report that; keep the test as a pin).

- [ ] **Step 3: Implement `src/patch/merge-patch.js`**

```js
// RFC 7386 JSON Merge Patch (P1 — LWS update-resource MUST).
export function applyMergePatch(target, patch) {
  if (patch === null || typeof patch !== 'object' || Array.isArray(patch)) return patch;
  const out = (target && typeof target === 'object' && !Array.isArray(target)) ? { ...target } : {};
  for (const [k, v] of Object.entries(patch)) {
    if (v === null) delete out[k];
    else out[k] = applyMergePatch(out[k], v);
  }
  return out;
}
```

- [ ] **Step 4: Implement the handler rework** (all gated `request.lwsEnabled`; the `--lws`-off PATCH path stays byte-identical):

1. Content-type dispatch: add `const isMergePatch = request.lwsEnabled && contentType.includes('application/merge-patch+json');` — extend the 415 gate accordingly; register the body parser for `application/merge-patch+json` (mirror how `text/n3` bodies arrive — likely a raw/string parser).
2. P2: at the top of `handlePatch`, `handlePut` (resource.js, after line 1756), `handlePost` (container.js, after line 48): under `request.lwsEnabled`, if the request has content (`content-length > 0` or non-empty body) and no `content-type` header → `400` problem+json (`detail: 'a request with content must carry Content-Type (Solid #server-content-type-missing)'`).
3. #7: replace the blind `safeJsonParse` flow — dispatch on `const storedType = getContentType(storagePath)`:
   - stored Turtle-family (`text/turtle`, `text/n3`, `application/n-triples`, `application/n-quads`) under `--lws`: parse via `toDataset(existingContent, storedType, resourceUrl)` (parse-fail → 409 teaching), project to a JSON-LD document via the exported `datasetToJsonLd`, apply the patch (N3/SPARQL/merge-patch is 415 here), then serialize BACK to the stored format: `JSON.stringify(updatedDocument)` → `toDataset(..., 'application/ld+json')` → `datasetToFormat(ds, QUADS_OUTPUTS[storedType] || RDF_TYPES.NQUADS)` — `.ttl`/`.n3` → Turtle bytes, `.nt` → N-Triples, `.nq` → N-Quads. Write those bytes; Content-Type identity of the resource is preserved.
   - stored JSON/JSON-LD (or new resource): existing flow, plus the merge-patch branch: `updatedDocument = applyMergePatch(document, safeJsonParse(patchContent))` (invalid patch JSON → 400).
   - merge-patch + non-JSON stored → 415 teaching (`detail: 'JSON Merge Patch applies to JSON documents; this resource is text/turtle — use text/n3 (N3 Patch) or application/sparql-update'`).
4. `src/rdf/serve.js`: `export` the existing `datasetToJsonLd`.
5. `src/rdf/conneg.js` `getAcceptHeaders`: add an `lwsEnabled = false` param; `Accept-Patch` becomes `'text/n3, application/sparql-update' + (lwsEnabled ? ', application/merge-patch+json' : '')`. Thread from `getAllHeaders` (check `src/ldp/headers.js` — it already receives `lwsEnabled` at most call sites).

- [ ] **Step 5: Run** the new file + `test/patch.test.js` + `test/conformance.test.js` — green, including legacy PATCH pins.

- [ ] **Step 6: Commit** (`fix(lws): PATCH parses stored form by its media type; JSON Merge Patch; bodied writes require Content-Type (review #7, P1, P2)`).

---

### Task 7: MCP sanitization — altr reps (#3), type-search items (#12), read_resource mimeType (#13)

`localLinks` (`read-tools.js:72-76`) and `describe_resource` (`tools.js:433-439`) emit `href`/`format`/`profile` from client-managed `.meta` to the model unfenced (U+200B/U+202E verified surviving) while adjacent fields get `sanitizeTypes`. `lws_type_search` (`tools.js:327`) emits `id`/`type` unsanitized. `read_resource` (`read-tools.js:230`) reports `getContentType(path)` — `application/octet-stream` for containers/`.well-known` (A5 over-generalization), disagreeing with `resources/read`.

**Files:**
- Modify: `src/mcp/sanitize.js` (add `sanitizeRep`/`sanitizeReps`)
- Modify: `src/mcp/read-tools.js:72-76` (#3), `:227-233` (#13)
- Modify: `src/mcp/tools.js:325-328` (#12), `:433` (#3 second site)
- Test: `test/mcp-v2-sanitize.test.js` (extend) or new `test/mcp-sanitize-reps.test.js`

- [ ] **Step 1: Write the failing tests** (harness: `startLwsPod`/`ownerCtx`/`callTool` as in `mcp-guard-parity.test.js`; declare an altr rep by PUTting `.meta` JSON-LD with `altr:hasRepresentation` whose href embeds `​` — mirror the `.meta` shape used in `test/mcp-alternates.test.js`):

```js
test('altr href/format/profile reach the model stripped of hidden chars (#3, both surfaces)', async (t) => {
  const p = await startLwsPod(t);
  const ctx = { ...ownerCtx(p), lwsEnabled: true };
  const path = `/${p.podName}/card.jsonld`;
  await putFile(p, path, JSON.stringify({ '@id': '#it' }));
  await putFile(p, path + '.meta', JSON.stringify({
    '@context': { altr: 'http://www.w3.org/ns/dx/connegp/altr#', dct: 'http://purl.org/dc/terms/' },
    '@id': `${p.origin}${path}`,
    'altr:hasRepresentation': { '@id': `${p.origin}${path}.md​`, 'dct:conformsTo': `http://ex/prof‮`, 'dct:format': 'text/mark​down' },
  }));
  const read = await callTool('read_resource', { uri: `${p.origin}${path}` }, ctx);
  const meta = JSON.parse(read.content[1].text);
  assert.doesNotMatch(JSON.stringify(meta.links), /[​‮]/u);
  const desc = await callTool('describe_resource', { path }, ctx);
  assert.doesNotMatch(desc.content[0].text, /[​‮]/u);
});

test('lws_type_search items are sanitized (#12)', async (t) => {
  const p = await startLwsPod(t);
  const ctx = { ...ownerCtx(p), lwsEnabled: true };
  await callTool('write_resource', { path: `/${p.podName}/typed1`, content: '{}',
    contentType: 'application/ld+json', types: ['http://ex/Type​X'] }, ctx);
  const r = await callTool('lws_type_search', { type: 'http://ex/Type​X' }, ctx);
  assert.doesNotMatch(r.content[0].text, /​/u);
});

test('read_resource mimeType: container -> lws+json, .md keeps text/markdown (#13)', async (t) => {
  const p = await startLwsPod(t);
  const ctx = { ...ownerCtx(p), lwsEnabled: true };
  const c = await callTool('read_resource', { uri: `${p.origin}/${p.podName}/` }, ctx);
  const cMeta = JSON.parse(c.content[1].text);
  assert.equal(cMeta.mimeType, 'application/lws+json');
  await putFile(p, `/${p.podName}/n.md`, '# hi');
  const m = await callTool('read_resource', { uri: `${p.origin}/${p.podName}/n.md` }, ctx);
  assert.equal(JSON.parse(m.content[1].text).mimeType, 'text/markdown');
});
```

(For #12, first check `lws_type_search`'s filter arg shape in `src/lws/type-index.js` `parseFilter` — adapt the args. If the `​` type never round-trips because the write path strips or rejects it, seed the `.lwstypes` sidecar via `storage.write` directly.)

- [ ] **Step 2: Run, verify failures.**

- [ ] **Step 3: Implement**

`src/mcp/sanitize.js`:

```js
// A representation descriptor from client-managed .meta (altr: model) headed
// for a model-bound response: href/format/profile are client-controlled —
// strip each (review #3). HTTP linksets stay raw (not model-bound).
export function sanitizeRep(rep) {
  if (!rep || typeof rep !== 'object') return rep;
  const out = { ...rep };
  for (const k of ['href', 'format', 'profile']) {
    if (typeof out[k] === 'string') out[k] = stripHidden(out[k]);
  }
  return out;
}
export function sanitizeReps(reps) {
  if (!reps) return reps;
  return {
    default: reps.default ? sanitizeRep(reps.default) : reps.default,
    alternates: Array.isArray(reps.alternates) ? reps.alternates.map(sanitizeRep) : [],
  };
}
```

`read-tools.js` `localLinks`: wrap `sanitizeReps(await readAuthorizedRepresentations(...))`. `tools.js` `describe_resource`: same wrap at line 433 (the sanitized object feeds both `generateLinkset` and the response). `tools.js:327`:

```js
    items: matched.map((r) => ({ id: sanitizeField(r.id), type: sanitizeTypes(containerItemTypes(r.types)) })),
```

(import `sanitizeField` — `sanitizeTypes` is already imported). `read-tools.js` `read_resource`:

```js
  // #13: extension-derived only when the extension actually resolves —
  // containers, /.well-known/*, and extensionless resources report the
  // trust/view type (c.mimeType), agreeing with the resources/read primitive.
  const extType = getContentType(path);
  const mimeType = extType !== 'application/octet-stream' ? extType : c.mimeType;
```

(use `mimeType` in the JSON payload at line 230).

- [ ] **Step 4: Run** the file + `test/mcp-alternates.test.js` + `test/mcp-read-tools.test.js` + `test/mcp-guard-parity.test.js` + `test/mcp-v2-sanitize.test.js`.

- [ ] **Step 5: Commit** (`fix(mcp): sanitize altr reps + type-search items; read_resource mimeType only ext-derived when it resolves (review #3, #12, #13)`).

---

### Task 8: Federation — per-hop redirect revalidation (#8) + one SSRF range table (#14)

`readRemote` (`read-tools.js:139-149`) uses `redirect:'error'`, dead-ending the pod's own `/.well-known/void` 303 rail cross-pod. And `src/mcp/ssrf.js` misses `100.64.0.0/10` (Alibaba metadata `100.100.100.200`, Tailscale) while `src/utils/ssrf.js` blocks it — two divergent hand-rolled lists.

**Files:**
- Modify: `src/utils/ssrf.js` (gains `embeddedV4` + normalization; wider `fc/fd`; `::`)
- Modify: `src/mcp/ssrf.js` (delegates to the shared table; keeps its API)
- Modify: `src/mcp/read-tools.js` (`readRemote` redirect loop)
- Test: `test/mcp-federation-hardening.test.js` (extend — read it first; it already has the redirect + blocklist seams)

**Interfaces:**
- Produces: `isBlockedHost(hostname, {allowPrivate})` — unchanged signature (importers: `read-tools.js`, tests).
- Produces: `embeddedV4(host) -> dotted-quad | null` exported from `src/utils/ssrf.js`.

- [ ] **Step 1: Write the failing tests**

```js
// unit — the consolidated table (review #14)
test('isBlockedHost blocks 100.64/10 incl. Alibaba metadata, mapped-IPv6 form too', () => {
  assert.equal(isBlockedHost('100.100.100.200'), true);
  assert.equal(isBlockedHost('100.64.0.1'), true);
  assert.equal(isBlockedHost('[::ffff:6464:64c8]'), true);   // 100.100.100.200 hex-mapped
  assert.equal(isBlockedHost('[::ffff:100.100.100.200]'), true);
  assert.equal(isBlockedHost('fc01::1'), true);              // fc00::/7, not just fc00:
  assert.equal(isBlockedHost('8.8.8.8'), false);
});
test('utils isPrivateIP gains the hex-group mapped form (importers inherit)', () => {
  assert.equal(isPrivateIP('::ffff:a9fe:a9fe'), true);       // 169.254.169.254
});
```

Redirect behavior (mock `fetch` with `node:test`'s `mock.method(globalThis, 'fetch', ...)`, or reuse the file's existing local-server seam — read the file first and mirror it):

```js
test('readRemote follows a 303 with per-hop SSRF revalidation (#8): public->public followed', ...);
test('readRemote refuses a redirect hop to a blocked host with a teaching error', ...);
test('readRemote stops after 3 hops', ...);
```

- [ ] **Step 2: Run, verify failures** (`100.100.100.200` unblocked today; 303 dead-ends today).

- [ ] **Step 3: Implement**

`src/utils/ssrf.js` — move/adopt the hex-group embedded-V4 decoder, normalize inside `isPrivateIP`, widen ULA, add `::`:

```js
// An IPv4-mapped IPv6 address embeds a real IPv4 target. Both the dotted
// (::ffff:169.254.169.254) and hex-group (::ffff:a9fe:a9fe) forms are
// recognized — `new URL().hostname` normalizes to the hex-group form.
export function embeddedV4(ip) {
  let m = /^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/i.exec(ip);
  if (m) return m[1];
  m = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i.exec(ip);
  if (m) {
    const hi = parseInt(m[1], 16), lo = parseInt(m[2], 16);
    return [(hi >> 8) & 0xff, hi & 0xff, (lo >> 8) & 0xff, lo & 0xff].join('.');
  }
  return null;
}
```

In `isPrivateIP`: first line `const mapped = embeddedV4(ip); if (mapped) return isPrivateIP(mapped);`; replace `/^fc00:/i, /^fd00:/i` with `/^f[cd]/i` (fc00::/7 — the MCP guard's stronger cut); add `/^::$/` to the IPv6 table; drop the now-redundant `::ffff:` regex row.

`src/mcp/ssrf.js` — one table, thin normalizing wrapper (keep the file + its docstring re: literal-scope limitations):

```js
import net from 'node:net';
import { isPrivateIP, embeddedV4 } from '../utils/ssrf.js';

export function isBlockedHost(hostname, { allowPrivate = false } = {}) {
  if (allowPrivate) return false;
  const h = (hostname || '').toLowerCase().replace(/^\[|\]$/g, '');
  if (h === 'localhost') return true;
  if (h === '0.0.0.0' || h === '::') return true;   // unspecified
  if (net.isIP(h) === 6) {
    const v4 = embeddedV4(h);
    if (v4) return isPrivateIP(v4);
  }
  if (net.isIP(h)) return isPrivateIP(h);
  return false;
}
```

`read-tools.js` `readRemote` — replace the single fetch with a bounded manual-redirect loop (guard EVERY hop):

```js
  const MAX_REDIRECT_HOPS = 3;
  let target = parsed;
  let r;
  for (let hop = 0; ; hop++) {
    if (isBlockedHost(target.hostname, { allowPrivate: ctx.federationPrivate })) {
      return toolError(`federation blocked: ${target.href} resolves to a private/internal address (set --lws-federation-private to allow)`);
    }
    try {
      // redirect:'manual' (review #8): follow redirects OURSELVES so every hop
      // re-runs the guard above — 'error' broke the pod's own /.well-known/void
      // 303 rail cross-pod; blind 'follow' was dt8's CRITICAL 1.
      r = await fetch(target.href, {
        headers: { Accept: 'application/ld+json, application/lws+json, text/turtle, */*',
          'MCP-Federation-Depth': String(depth) },
        redirect: 'manual',
        signal: AbortSignal.timeout(30_000),
      });
    } catch (e) {
      return toolError(`remote unreachable: ${e.message}`);
    }
    const loc = r.headers.get('location');
    if (![301, 302, 303, 307, 308].includes(r.status) || !loc) break;
    if (hop >= MAX_REDIRECT_HOPS - 1) return toolError(`too many redirects (max ${MAX_REDIRECT_HOPS}): ${url}`);
    try { target = new URL(loc, target); } catch { return toolError(`invalid redirect target from ${target.href}: ${loc}`); }
  }
```

(The rest of `readRemote` — bounded body read, links, sanitizeDeep — consumes `r` unchanged. Report the FINAL `target.href` as `url` in the payload alongside the original, so the agent sees where the 303 landed: add `...(target.href !== url ? { resolvedFrom: url } : {})` and use `url: target.href`.)

- [ ] **Step 4: Run** `test/mcp-federation-hardening.test.js` + `test/mcp-affordance-federation.test.js` — green. The existing dt8 pins (bracketed IPv6, 0.0.0.0, redirect-to-metadata) must stay green.

- [ ] **Step 5: Commit** (`fix(mcp): per-hop redirect revalidation restores the 303 VoID rail; one shared SSRF range table (review #8, #14)`).

---

### Task 9: `Accept: application/json` label MUST on container representations (P3)

LWS media-type MUST: same payload, `Content-Type: application/json` when that's what the client asked. `selectContentType` falls through to JSON-LD and the listing branch (`resource.js:490-495`) has no `application/json` arm. Scope per the MUST: container representations + the storage description (test the latter; fix only if red).

**Files:**
- Modify: `src/rdf/conneg.js` (add `prefersPlainJson`)
- Modify: `src/handlers/resource.js` (GET listing branch ~483-501; HEAD container branch ~1493-1498; VARIANT_KEYS gains `'application/json': 'json'`)
- Test: `test/lws-media-type-label.test.js` (new)

- [ ] **Step 1: Write the failing tests**

```js
// test/lws-media-type-label.test.js
// P3 (LWS media-type MUST): application/lws+json / application/ld+json /
// application/json each get their own Content-Type LABEL on a container —
// the payload is byte-identical JSON-LD.
test('the three JSON labels on a container: identical payload, correct labels, distinct ETags', async (t) => {
  await startTestServer({ lws: true, conneg: true });
  t.after(stopTestServer);
  await createTestPod('label');
  const get = (accept) => request('/label/', { headers: { Accept: accept }, auth: 'label' });
  const [lws, ld, plain] = await Promise.all([
    get('application/lws+json'), get('application/ld+json'), get('application/json')]);
  for (const r of [lws, ld, plain]) assertStatus(r, 200);
  assert.equal(lws.headers.get('content-type').split(';')[0], 'application/lws+json');
  assert.equal(ld.headers.get('content-type').split(';')[0], 'application/ld+json');
  assert.equal(plain.headers.get('content-type').split(';')[0], 'application/json');
  assert.deepEqual(JSON.parse(await plain.text()), JSON.parse(await ld.text()));   // payload identity
  assert.notEqual(plain.headers.get('etag'), ld.headers.get('etag'));              // RFC 9110 §8.8.3
});

test('HEAD mirrors the application/json label', async (t) => { /* HEAD /label/ Accept: application/json -> content-type application/json */ });

test('explicit ld+json outranking json keeps ld+json', async (t) => {
  /* Accept: 'application/ld+json, application/json;q=0.5' -> ld+json label */ });

test('storage description honors the three labels too (fix only if red)', async (t) => {
  /* GET /.well-known/lws-storage with each Accept; assert labels; if already green, no code change */ });
```

- [ ] **Step 2: Run, verify failure** (plain-json label case returns ld+json today).

- [ ] **Step 3: Implement**

`src/rdf/conneg.js`:

```js
// P3 (LWS media-type MUST): does this Accept explicitly prefer plain
// application/json over the ld+json/lws+json spellings? Label-only — the
// payload is identical (the MUST's own constraint).
export function prefersPlainJson(acceptHeader) {
  if (!acceptHeader) return false;
  for (const { type, q } of parseAcceptHeader(acceptHeader)) {
    if (q === 0) continue;
    if (type === 'application/json') return true;
    if (type === RDF_TYPES.JSON_LD || type === RDF_TYPES.LWS_JSON) return false;
  }
  return false;
}
```

`resource.js` GET listing branch — after `listingContentType` is computed (line 495):

```js
    // P3 (LWS media-type MUST): plain application/json is the same payload
    // under its own label — swap the label only, never the body.
    const labeledListingType = (request.lwsEnabled
      && listingContentType === RDF_TYPES.JSON_LD && prefersPlainJson(acceptHeader))
      ? 'application/json' : listingContentType;
```

Use `labeledListingType` for `containerListingEtag(...)` and for the response `contentType` wherever `listingContentType` currently labels the header (trace the branch below line 501 — the JSON-LD render path — and swap the label at header-build only; the body render keeps keying off `listingContentType`). Add `'application/json': 'json'` to `VARIANT_KEYS` (line 192) so the labeled variant revalidates independently.

HEAD container branch (~1493-1498): after the `lwsNeg` overrides, apply the same label swap so `contentType` (and thus `containerListingEtag`) mirrors GET.

Storage description: run the test — if the route already labels correctly, record no-change-needed; else apply the same `prefersPlainJson` label swap in its handler (`src/lws/storage-description.js`).

- [ ] **Step 4: Run** the new file + `test/lws-conneg.test.js` + `test/head-conneg.test.js` + `test/lws-etag-variant.test.js`.

- [ ] **Step 5: Commit** (`fix(lws): application/json is a first-class container label (P3, LWS media-type MUST)`).

---

### Task 10: Full fork suite, merge, push

- [ ] **Step 1: Full suite**

```bash
cd /Users/cvardema/dev/git/LA3D/JavaScriptSolidServer
npm test 2>&1 | tail -30
```

Expected: pass/fail/skip ≈ `1500+/0/1` (grew from 1486/0/1 by this round's new files). If the run wedges on the known `test/mcp-lws-read.test.js` open-handle, run that file alone (`node --test test/mcp-lws-read.test.js`) and the rest via the glob without it — record counts.

- [ ] **Step 2: Fix any fallout** — suite failures caused by this round's changes are fixed IN this round (each fix gets its own commit; behavior-pinning tests that legitimately changed get updated with a comment naming the finding).

- [ ] **Step 3: Merge + push**

```bash
git checkout la3d/lws
git merge --no-ff la3d/lws-review -m "$(cat <<'EOF'
Merge la3d/lws-review: post-drain review round — gate choke point, ETag/304 conformance, PATCH MUSTs, MCP sanitize + SSRF consolidation (review 2026-07-12 B1-B12 + P1-P3)
EOF
)"
git push origin la3d/lws
git log -1 --format=%H   # record the merge SHA for Task 11
```

---

### Task 11: lws-pod repin + live gates

(All in `/Users/cvardema/dev/git/LA3D/agents/lws-pod`.)

**Files:**
- Modify: `Dockerfile.fork:19` (`JSS_GIT_REF=<merge SHA>`)
- Modify: `docker-compose.fork-tls.yml` (image tag → `fork-review`; check the current `fork-drain` string for the exact field)
- Modify: `tests/lws-conneg.test.mjs` (grow 2 live cases: N3-Patch on a Turtle-stored resource 2xx; `Accept: application/json` label on a container)

- [ ] **Step 1: Repin** — edit `JSS_GIT_REF` to the Task 10 merge SHA; bump the compose image tag.

- [ ] **Step 2: Rebuild + reseed the rig**

```bash
make doctor-tls        # host prereqs still in place
make up-fork-tls       # rebuilds from the new ref
POD_TOKEN=$(cat data-fork/.owner-token 2>/dev/null || true) make publish-profiles   # check README "TLS rigs" for the exact reseed runbook — use the drain round's steps
```

(If the reseed runbook differs, follow `README.md` "TLS rigs" + FOLLOWUP's DT13 notes: reseed needed zero manual `write_acl` calls.)

- [ ] **Step 3: Add the two live pins to `tests/lws-conneg.test.mjs`** (match the file's existing style/env handling): PATCH `text/n3` against a `.ttl` artifact → 2xx and the triple lands; `Accept: application/json` on a profiles container → `content-type: application/json`.

- [ ] **Step 4: Run the live gates**

```bash
make test-conneg        # 21/21 + the 2 new
make test-preservation
make test-void          # 4/4
make test-mcp-v2        # 18/18
make test-profiles
make test-graph
make test-wiki
make test               # substrate e2e against the local (non-fork) rig if running; skip if rig down
```

Every gate green (or its documented self-skip). Any red = fix in the fork (new commit, re-merge is NOT needed — commit to `la3d/lws` directly only if trivial; otherwise branch again) — do not sweep.

- [ ] **Step 5: Commit** (lws-pod): `Dockerfile.fork`, `docker-compose.fork-tls.yml`, `tests/lws-conneg.test.mjs` — `[Agent: Claude] chore(rig): repin fork to review-round merge <short-sha>; live pins for N3-Patch + application/json label`.

---

### Task 12: Docs close-out

**Files:**
- Modify: `FOLLOWUP.md` (top block: (B) + (C) → FIXED with SHAs; NEXT = the L4 read-side design round; strike the ⚠ falsified-claim markers now that the gate really is choke-pointed; note the near-misses deliberately NOT taken: `seed.mjs` rides with L4, `pod-config.js` shape validation untouched)
- Modify: `docs/foundations/05-jss-spec-conformance.md` (§4 conformance-correction block: #5/#7/P1/P2/P3 → resolved with commit refs; PATCH conformance now tracked)
- Modify: memory `general-substrate-design.md` (append the round outcome + new NEXT pointer, keep it dense)

- [ ] **Step 1: FOLLOWUP.md** — new round block at top (`FORK REVIEW-ROUND — DONE + LIVE-VERIFIED (2026-07-12)`) in the house style: per-finding disposition (all 12 + P1-P3), fork merge SHA, suite counts, live-gate results, what did NOT change. Update the `▶▶` banner line and the `NEXT =` pointer to the L4 read-side design round.

- [ ] **Step 2: Conformance doc** — mark the resolved items in the 2026-07-12 correction block; add PATCH row(s) to the conformance map.

- [ ] **Step 3: Memory** — update `general-substrate-design.md` (and its MEMORY.md hook line): review-round SHIPPED (SHA, headline: gate choke-pointed, ETag/304/PATCH standards violations closed, MCP sanitize + SSRF consolidated), NEXT = L4 read-side design round.

- [ ] **Step 4: Commit** (lws-pod): `[Agent: Claude] docs: close out the fork review-round — (B)+(C) dispositioned, NEXT = L4 read-side`.

---

## Self-Review Notes

- **Coverage:** #2→T1, #10→T1, #9→T2, #6→T3, #5→T4, #4→T5, #7→T6, P1→T6, P2→T6, #3→T7, #12→T7, #13→T7, #8→T8, #14→T8, P3→T9. All 12 (B) + 3 (C) covered. Near-misses deliberately deferred (seed.mjs → L4; pod-config shape validation → untouched, recorded in T12).
- **Ordering:** T1 before T2 (T2's MCP case needs the gate at the choke point to be meaningful); T3 before T4/T5 (serving tests build on NT/NQ conversion behavior); T4 before T5 (T5's tests replay T4's variant ETags).
- **Type consistency:** `applyLwsWrite` reject shape `{ok:false, problem}` consumed in T1's three caller groups; `extensionForRdfType` produced T2, consumed T2 only; `pendingConversion` local to resource.js; `sanitizeReps` produced and consumed in T7; `embeddedV4` produced utils, consumed mcp (T8); `-json` variant produced T4, replayed T5.
- **Known risks for implementers:** (1) `applyN3Patch`'s document-shape assumptions — T6 says read `n3-patch.js` first; the tests define the contract at the triple level. (2) P2 may already be satisfied by a Fastify layer — the test-first step records reality before any code. (3) The `​`-in-URL round-trip for #12 may be normalized away by `new URL` — the test seeds the sidecar directly if so.
