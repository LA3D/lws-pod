# Fork Serving-Path Round Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Retire the hand-rolled JSON-LD⇄quads pair on the fork's `--lws` serving/storing paths (real parser + n3 writer + 406-teaching policy + `{@context,@graph}` store form), and drain the fork queue (WAC-filtered listings, rig idp-issuer, `.lwstypes` mediaType, hint rewording, McpService advertisement, `--subdomains` guard) plus the lws-pod publish contract seam.

**Architecture:** Spec = `docs/superpowers/specs/2026-07-10-fork-serving-path-design.md` (READ IT FIRST — the 406 policy table, gating discipline, and consumer audit live there). Approach A: one shared "bytes → RDF/JS dataset" seam (`src/rdf/dataset.js`, promoted from `src/lws/admission-rdf.js`) feeds both admission and a new serving arm (`src/rdf/serve.js` → n3 Writer); the write direction keeps the compact hand-written emitter but gains a `{@context,@graph}` envelope. Everything gated under `--lws`.

**Tech Stack:** Node ≥18, Fastify 4, `@rdfjs/parser-jsonld` + `rdf-ext` + `n3` (all already dependencies — NO new packages), node:test on the fork, Vitest on lws-pod.

## Global Constraints

- **Two repos.** Fork tasks (1–11): `/Users/cvardema/dev/git/LA3D/JavaScriptSolidServer`, branch `la3d/lws-servepath` created off `la3d/lws` (`d75a4dd`). lws-pod tasks (12–15): `/Users/cvardema/dev/git/LA3D/agents/lws-pod`, on `main`.
- **`--lws`-off byte-identity.** Every behavior change is gated on `lwsEnabled` (server option `lws`, request decoration `request.lwsEnabled`). A `--conneg`-only pod (no `--lws`) must serve and store byte-identically to today. Negative-control tests are part of the tasks, not optional.
- **P13:** no application vocabulary in fork code; everything here is generic substrate.
- **No new npm dependencies.**
- **Fork test runs need `--test-force-exit`** (pre-existing open-handle hang in `test/mcp-lws-read.test.js` on node v26): `node --test --test-force-exit test/<file>.test.js`. Full suite: `npm test` (expect ~1226+ pass, 1 pre-existing skip, 0 fail).
- **Commit format (both repos):** `[Agent: Claude] type(scope): subject` + bullet list + `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`. Stage specific files, never `git add -A`, never force-push.
- **Code style:** fastai brevity; comments only for *why*; match surrounding code.
- Exact hint strings and teaching-message strings in this plan are the deliverable wording — reviewers may tune them, implementers must not silently drift from them.

---

### Task 1: The dataset seam — `src/rdf/dataset.js`, shim deleted

**Files:**
- Create: `src/rdf/dataset.js`
- Delete: `src/lws/admission-rdf.js`
- Modify: `src/lws/representations.js:6`, `src/lws/constraint.js:2`, `src/lws/admission.js:11` (import paths)
- Modify: any `test/*.test.js` importing `src/lws/admission-rdf.js` (find with grep in Step 3)
- Test: `test/rdf-dataset.test.js`

**Interfaces:**
- Consumes: `datasetFromTurtle` (`src/lws/shacl.js`), `RDF_TYPES` (`src/rdf/conneg.js`), `LWS_CONTEXT_OBJECT` (`src/lws/context.js`) — all existing.
- Produces: `export async function toDataset(buffer, contentType, baseIri)` → RDF/JS DatasetCore (throws on parse failure); `export function isRdfBody(contentType)` → boolean. Module: `src/rdf/dataset.js`. Tasks 2–5 import from here.

- [ ] **Step 0: Create the branch**

```bash
cd /Users/cvardema/dev/git/LA3D/JavaScriptSolidServer
git checkout la3d/lws && git pull && git checkout -b la3d/lws-servepath
```

- [ ] **Step 1: Write the failing test**

Create `test/rdf-dataset.test.js`:

```js
// test/rdf-dataset.test.js
// The shared bytes→dataset seam (src/rdf/dataset.js), promoted from
// src/lws/admission-rdf.js in the serving-path round with the legacy
// store-array shim REMOVED: a top-level array is standard JSON-LD now —
// elements without their own @context get no prefix expansion
// (spec 2026-07-10 §3, decision log #3).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toDataset, isRdfBody } from '../src/rdf/dataset.js';

const BASE = 'https://pod.example/x';

test('toDataset: {@context,@graph} JSON-LD parses to quads', async () => {
  const doc = { '@context': { name: 'https://schema.org/name' }, '@graph': [
    { '@id': `${BASE}#a`, name: 'A' }, { '@id': `${BASE}#b`, name: 'B' }] };
  const ds = await toDataset(Buffer.from(JSON.stringify(doc)), 'application/ld+json', BASE);
  assert.equal(ds.size, 2);
});

test('toDataset: legacy store array (context on element 0 only) is standard JSON-LD — no cross-element context bleed', async () => {
  const doc = [
    { '@context': { name: 'https://schema.org/name' }, '@id': `${BASE}#a`, name: 'A' },
    { '@id': `${BASE}#b`, name: 'B' },        // no @context: `name` must NOT expand
  ];
  const ds = await toDataset(Buffer.from(JSON.stringify(doc)), 'application/ld+json', BASE);
  const preds = [...ds].map(q => q.predicate.value).filter(p => p === 'https://schema.org/name');
  assert.equal(preds.length, 1);              // element 0 only — shim behavior is GONE
});

test('toDataset: Turtle arm unchanged', async () => {
  const ds = await toDataset(Buffer.from(`<${BASE}#a> <https://schema.org/name> "A".`), 'text/turtle', BASE);
  assert.equal(ds.size, 1);
});

test('isRdfBody: RDF media types recognized', () => {
  assert.equal(isRdfBody('application/ld+json; charset=utf-8'), true);
  assert.equal(isRdfBody('image/png'), false);
});
```

- [ ] **Step 2: Run it — expect FAIL** (`Cannot find module '../src/rdf/dataset.js'`)

```bash
node --test --test-force-exit test/rdf-dataset.test.js
```

- [ ] **Step 3: Create `src/rdf/dataset.js`** — the body of `src/lws/admission-rdf.js` minus `shimLegacyStoreArray`, with imports repointed:

```js
// src/rdf/dataset.js
// The shared "bytes → RDF/JS DatasetCore" seam for BOTH the SHACL admission
// path and the --lws serving arm (src/rdf/serve.js). JSON-LD is parsed by
// @rdfjs/parser-jsonld — a real JSON-LD 1.1 processor: array and aliased
// @context, @graph, @value all handled. (Promoted from src/lws/admission-rdf.js
// in the serving-path round; the legacy store-array shim is retired — a
// top-level array is standard JSON-LD now.)
//
// Remote @context fetch is DISABLED (no-network documentLoader — SSRF
// discipline, cf. PATCH_CID_PRIVATE_IPS): the sole preload is the LWS v1
// context, served from the pod's own resolvable mirror (src/lws/context.js).
// Parse failures THROW — fail loud; callers choose degrade-vs-reject
// (constraint/representations catch → empty; admission maps body failures to
// a teaching 400; serving maps them to a teaching 406).
import { Readable } from 'node:stream';
import ParserJsonld from '@rdfjs/parser-jsonld';
import rdf from 'rdf-ext';
import { datasetFromTurtle } from '../lws/shacl.js';
import { RDF_TYPES } from './conneg.js';
import { LWS_CONTEXT_OBJECT } from '../lws/context.js';

const main = ct => (ct || '').split(';')[0].trim().toLowerCase();

export function isRdfBody(contentType) {
  const t = main(contentType);
  return t === RDF_TYPES.TURTLE || t === RDF_TYPES.N3 || t === RDF_TYPES.JSON_LD || t === 'application/json';
}

const LWS_CONTEXT_URL = 'https://www.w3.org/ns/lws/v1';

// jsonld-streaming-parser IDocumentLoader: an object exposing load(url) that
// resolves to the raw context document. NOT the jsonld.js function-style
// loader — the interfaces differ.
const documentLoader = {
  async load(url) {
    if (url === LWS_CONTEXT_URL) return { '@context': LWS_CONTEXT_OBJECT };
    throw new Error(`remote @context fetch disabled: ${url}`);
  },
};

// Buffer (any accepted RDF media type) → RDF/JS DatasetCore.
export async function toDataset(buffer, contentType, baseIri) {
  const t = main(contentType);
  if (t === RDF_TYPES.TURTLE || t === RDF_TYPES.N3) {
    return datasetFromTurtle(buffer.toString('utf8'), baseIri);
  }
  const parser = new ParserJsonld({ documentLoader, baseIRI: baseIri });
  return rdf.dataset().import(parser.import(Readable.from([buffer.toString('utf8')])));
}
```

Then repoint the three source importers and delete the old module:

```bash
grep -rln "admission-rdf" src/ test/
```

In `src/lws/representations.js`, `src/lws/constraint.js`, `src/lws/admission.js` change
`from './admission-rdf.js'` → `from '../rdf/dataset.js'`. In each listed test file change
`../src/lws/admission-rdf.js` → `../src/rdf/dataset.js`. Then:

```bash
git rm src/lws/admission-rdf.js
```

- [ ] **Step 4: Run the new test + the admission tests — expect the shim-era assertions to surface**

```bash
node --test --test-force-exit test/rdf-dataset.test.js test/lws-admission-rdf-jsonld.test.js test/lws-admission-rdf.test.js
```

Any pre-existing test that asserts the SHIM behavior (a context-less array element expanding via element 0's context) now fails — **flip those assertions deliberately** to the standard-semantics expectation (mirroring the new test above), updating their comments to cite spec 2026-07-10 §3. Do NOT weaken tests that assert `{@context,@graph}` or array-with-own-contexts parsing.

- [ ] **Step 5: Full suite green, then commit**

```bash
npm test
git add src/rdf/dataset.js src/lws/representations.js src/lws/constraint.js src/lws/admission.js test/
git commit -m "$(cat <<'EOF'
[Agent: Claude] refactor(rdf): promote toDataset to src/rdf/dataset.js; retire the legacy store-array shim

- one bytes->dataset seam for admission AND the serving arm (spec 2026-07-10 s2-s3)
- shimLegacyStoreArray deleted: top-level arrays are standard JSON-LD now
- importers repointed; admission-rdf.js removed

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Output formats + the 406-teaching policy engine — `src/rdf/serve.js`

**Files:**
- Modify: `src/rdf/conneg.js` (add `NQUADS` to `RDF_TYPES` ~line 13-21; `selectContentType` third param ~line 35)
- Modify: `src/rdf/turtle.js` (export `COMMON_PREFIXES` ~line 68 and `applyTerminatorSpacing` ~line 42 — add `export` keywords only)
- Create: `src/rdf/serve.js`
- Test: `test/rdf-serve.test.js`

**Interfaces:**
- Consumes: `toDataset` from Task 1.
- Produces (Tasks 3–4 rely on these exact names):
  - `RDF_TYPES.NQUADS === 'application/n-quads'` (conneg.js)
  - `selectContentType(acceptHeader, connegEnabled = false, lwsEnabled = false)` — existing call sites unchanged (default `false` keeps them byte-identical)
  - `serve.js`: `QUADS_OUTPUTS` (negotiated type → output type map; `text/n3` → Turtle), `async serveStoredRdf({bytes, sourceContentType?, targetType, baseIri})` → `{ok:true, content, contentType} | {ok:false, status:406, problem}`, `async checkServable({bytes, sourceContentType?, targetType, baseIri})` → `{ok:boolean}`, `hasNamedGraphs(dataset)`, `datasetToFormat(dataset, targetType)`

- [ ] **Step 1: Write the failing test**

Create `test/rdf-serve.test.js`:

```js
// test/rdf-serve.test.js
// The --lws serving arm's policy engine (spec 2026-07-10 §2): real parser +
// n3 writer; lossy or failed conversions refuse with a teaching 406 payload —
// never a silent 200 with empty or mislabeled bytes (the probe-#4 family).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { serveStoredRdf, checkServable, QUADS_OUTPUTS } from '../src/rdf/serve.js';
import { selectContentType, RDF_TYPES } from '../src/rdf/conneg.js';

const BASE = 'https://pod.example/x';
const buf = (o) => Buffer.from(JSON.stringify(o));

test('RDF_TYPES.NQUADS exists and n-quads negotiates only under lws+conneg', () => {
  assert.equal(RDF_TYPES.NQUADS, 'application/n-quads');
  assert.equal(selectContentType('application/n-quads', true, true), RDF_TYPES.NQUADS);
  assert.equal(selectContentType('application/n-quads', true, false), RDF_TYPES.JSON_LD);
  assert.equal(selectContentType('application/n-quads', false, true), RDF_TYPES.JSON_LD);
  assert.equal(selectContentType('application/n-triples', true, true), RDF_TYPES.NTRIPLES);
  // pre-existing behavior untouched
  assert.equal(selectContentType('text/turtle', true), RDF_TYPES.TURTLE);
});

test('serveStoredRdf: {@context,@graph} doc → real Turtle triples (probe-#4 dead)', async () => {
  const doc = { '@context': { name: 'https://schema.org/name' }, '@graph': [
    { '@id': `${BASE}#a`, name: 'A' }, { '@id': `${BASE}#b`, name: 'B' }] };
  const r = await serveStoredRdf({ bytes: buf(doc), targetType: RDF_TYPES.TURTLE, baseIri: BASE });
  assert.equal(r.ok, true);
  assert.equal(r.contentType, RDF_TYPES.TURTLE);
  assert.match(r.content, /"A"/);
  assert.match(r.content, /"B"/);
});

test('serveStoredRdf: named graphs → Turtle & N-Triples 406 teaching; N-Quads 200 lossless', async () => {
  const doc = { '@context': { name: 'https://schema.org/name' }, '@id': `${BASE}#g1`, '@graph': [
    { '@id': `${BASE}#a`, name: 'A' }] };
  for (const t of [RDF_TYPES.TURTLE, RDF_TYPES.NTRIPLES]) {
    const r = await serveStoredRdf({ bytes: buf(doc), targetType: t, baseIri: BASE });
    assert.equal(r.ok, false);
    assert.equal(r.status, 406);
    assert.match(r.problem.detail, /named graphs/);
    assert.match(r.problem.detail, /application\/n-quads/);
  }
  const nq = await serveStoredRdf({ bytes: buf(doc), targetType: RDF_TYPES.NQUADS, baseIri: BASE });
  assert.equal(nq.ok, true);
  assert.match(nq.content, /#g1>/);          // graph term survives — lossless
});

test('serveStoredRdf: remote @context → 406 teaching (offline loader), never empty output', async () => {
  const doc = { '@context': 'https://schema.org', '@id': `${BASE}#a`, name: 'A' };
  const r = await serveStoredRdf({ bytes: buf(doc), targetType: RDF_TYPES.TURTLE, baseIri: BASE });
  assert.equal(r.ok, false);
  assert.equal(r.status, 406);
  assert.match(r.problem.detail, /remote @context/);
  assert.match(r.problem.detail, /application\/ld\+json/);
});

test('checkServable mirrors the policy without serializing (HEAD parity)', async () => {
  const named = { '@context': { name: 'https://schema.org/name' }, '@id': `${BASE}#g1`, '@graph': [{ '@id': `${BASE}#a`, name: 'A' }] };
  assert.equal((await checkServable({ bytes: buf(named), targetType: RDF_TYPES.TURTLE, baseIri: BASE })).ok, false);
  assert.equal((await checkServable({ bytes: buf(named), targetType: RDF_TYPES.NQUADS, baseIri: BASE })).ok, true);
});

test('QUADS_OUTPUTS maps text/n3 to Turtle (existing N3-serves-Turtle behavior)', () => {
  assert.equal(QUADS_OUTPUTS[RDF_TYPES.N3], RDF_TYPES.TURTLE);
  assert.equal(QUADS_OUTPUTS[RDF_TYPES.JSON_LD], undefined);
});
```

- [ ] **Step 2: Run it — expect FAIL** (`Cannot find module '../src/rdf/serve.js'`)

```bash
node --test --test-force-exit test/rdf-serve.test.js
```

- [ ] **Step 3: Implement.** In `src/rdf/turtle.js` add `export` to `applyTerminatorSpacing` and `COMMON_PREFIXES`. In `src/rdf/conneg.js` add to `RDF_TYPES`:

```js
  NQUADS: 'application/n-quads',
```

and change `selectContentType`:

```js
export function selectContentType(acceptHeader, connegEnabled = false, lwsEnabled = false) {
```

with, inside (replacing the loop's `SUPPORTED_OUTPUT.includes(type)` check):

```js
  // Quads formats (N-Triples/N-Quads) are negotiable only on an --lws pod —
  // the --lws-off path must stay byte-identical (spec 2026-07-10 §1).
  const supported = lwsEnabled
    ? [...SUPPORTED_OUTPUT, RDF_TYPES.NTRIPLES, RDF_TYPES.NQUADS]
    : SUPPORTED_OUTPUT;
```

(and `supported.includes(type)` in the loop). Create `src/rdf/serve.js`:

```js
// src/rdf/serve.js
// The --lws serving arm (spec 2026-07-10 §2): stored RDF bytes → negotiated
// quads serialization via the real parser (toDataset) + the n3 writer.
// Policy: a conversion that would lose triples (named graphs into Turtle/
// N-Triples) or that cannot run offline (remote @context) answers 406 with a
// teaching problem+json — never a silent 200 with empty or mislabeled bytes
// (the probe-#4 family). LWS mandates media conneg be lossless.
import { Writer } from 'n3';
import { toDataset } from './dataset.js';
import { RDF_TYPES } from './conneg.js';
import { COMMON_PREFIXES, applyTerminatorSpacing } from './turtle.js';

// Negotiated type → served output type. N3 requests serve Turtle (existing
// behavior — Turtle is valid N3). Absence from this map = not a quads target.
export const QUADS_OUTPUTS = {
  [RDF_TYPES.TURTLE]: RDF_TYPES.TURTLE,
  [RDF_TYPES.N3]: RDF_TYPES.TURTLE,
  [RDF_TYPES.NTRIPLES]: RDF_TYPES.NTRIPLES,
  [RDF_TYPES.NQUADS]: RDF_TYPES.NQUADS,
};
const N3_FORMATS = {
  [RDF_TYPES.TURTLE]: 'Turtle',
  [RDF_TYPES.NTRIPLES]: 'N-Triples',
  [RDF_TYPES.NQUADS]: 'N-Quads',
};
const GRAPH_CAPABLE = new Set([RDF_TYPES.NQUADS]);

export function hasNamedGraphs(dataset) {
  for (const q of dataset) if (q.graph.termType !== 'DefaultGraph') return true;
  return false;
}

export function datasetToFormat(dataset, targetType) {
  return new Promise((resolve, reject) => {
    const format = N3_FORMATS[targetType];
    if (!format) return reject(new Error(`unsupported quads output: ${targetType}`));
    const writer = targetType === RDF_TYPES.TURTLE
      ? new Writer({ prefixes: COMMON_PREFIXES })
      : new Writer({ format });
    for (const q of dataset) writer.addQuad(q);
    writer.end((err, result) => err
      ? reject(err)
      : resolve(targetType === RDF_TYPES.TURTLE ? applyTerminatorSpacing(result) : result));
  });
}

function notAcceptable(instance, targetType, why, works) {
  return {
    ok: false,
    status: 406,
    problem: {
      type: 'about:blank',
      title: 'Not Acceptable',
      status: 406,
      detail: `cannot serve this resource as ${targetType}: ${why} Formats that work: ${works.join(', ')}.`,
      instance,
    },
  };
}

async function policyDataset({ bytes, sourceContentType, targetType, baseIri }) {
  let dataset;
  try {
    dataset = await toDataset(bytes, sourceContentType, baseIri);
  } catch (e) {
    return notAcceptable(baseIri, targetType,
      `the stored document did not parse as ${sourceContentType} (${e.message}) — a remote @context cannot be fetched (offline document loader).`,
      [RDF_TYPES.JSON_LD]);
  }
  if (!GRAPH_CAPABLE.has(targetType) && hasNamedGraphs(dataset)) {
    return notAcceptable(baseIri, targetType,
      'the document contains named graphs, which this format cannot express losslessly.',
      [RDF_TYPES.JSON_LD, RDF_TYPES.NQUADS]);
  }
  return { ok: true, dataset };
}

/** Serve stored RDF bytes as a quads format under the 406-teaching policy. */
export async function serveStoredRdf({ bytes, sourceContentType = RDF_TYPES.JSON_LD, targetType, baseIri }) {
  const p = await policyDataset({ bytes, sourceContentType, targetType, baseIri });
  if (!p.ok) return p;
  const content = await datasetToFormat(p.dataset, targetType);
  return { ok: true, content, contentType: targetType };
}

/** The same policy WITHOUT serializing — HEAD parity (#552 discipline). */
export async function checkServable({ bytes, sourceContentType = RDF_TYPES.JSON_LD, targetType, baseIri }) {
  const p = await policyDataset({ bytes, sourceContentType, targetType, baseIri });
  return { ok: p.ok === true };
}
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
node --test --test-force-exit test/rdf-serve.test.js test/conneg.test.js test/conneg-negotiate.test.js
```

- [ ] **Step 5: Commit**

```bash
git add src/rdf/serve.js src/rdf/conneg.js src/rdf/turtle.js test/rdf-serve.test.js
git commit -m "$(cat <<'EOF'
[Agent: Claude] feat(rdf): serving-arm policy engine — n-quads/n-triples output + 406 teaching

- serveStoredRdf/checkServable: real parser + n3 writer; named-graphs-into-
  Turtle and remote-@context refuse with a teaching problem+json
- RDF_TYPES.NQUADS; selectContentType lwsEnabled param (default false =
  byte-identical existing call sites)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Wire the file GET/HEAD through the serving arm (`--lws`-gated)

**Files:**
- Modify: `src/handlers/resource.js` — imports (~line 13-24), file-GET conneg branch (~line 767-799), `negotiateHeadFileContentType` (~line 902) and its call site (~line 1129)
- Test: `test/lws-serving-path.test.js` (new), `test/lws-serving-path-negative.test.js` (new)

**Interfaces:**
- Consumes: `serveStoredRdf`, `checkServable`, `QUADS_OUTPUTS` (Task 2); `selectContentType(accept, conneg, lws)` (Task 2).
- Produces: HTTP behavior only. `negotiateHeadFileContentType` gains params `lwsEnabled`, `resourceUrl` and may return `{ notAcceptable: true }`.

- [ ] **Step 1: Write the failing integration tests**

Create `test/lws-serving-path.test.js` (harness pattern: `test/lws-alternate-authz-filter.test.js`):

```js
// test/lws-serving-path.test.js
// The --lws serving arm end-to-end (spec 2026-07-10 §2): a real parser feeds
// Turtle/N-Triples/N-Quads conneg; lossy/failed conversions 406-teach.
// Resources live under /alice/public/ (pod-creation public-read default ACL).
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startTestServer, stopTestServer, request, createTestPod, getBaseUrl } from './helpers.js';

const DOC = '/alice/public/servepath-graphdoc.jsonld';
const NG = '/alice/public/servepath-namedgraph.jsonld';
const REMOTE = '/alice/public/servepath-remotectx.jsonld';

describe('LWS serving path (dataset seam + 406 teaching)', () => {
  before(async () => {
    await startTestServer({ lws: true, conneg: true });
    await createTestPod('alice');
    const base = getBaseUrl();
    await request(DOC, { method: 'PUT', headers: { 'Content-Type': 'application/ld+json' }, auth: 'alice',
      body: JSON.stringify({ '@context': { name: 'https://schema.org/name' }, '@graph': [
        { '@id': `${base}${DOC}#a`, name: 'A' }, { '@id': `${base}${DOC}#b`, name: 'B' }] }) });
    await request(NG, { method: 'PUT', headers: { 'Content-Type': 'application/ld+json' }, auth: 'alice',
      body: JSON.stringify({ '@context': { name: 'https://schema.org/name' }, '@id': `${base}${NG}#g`, '@graph': [
        { '@id': `${base}${NG}#a`, name: 'A' }] }) });
    await request(REMOTE, { method: 'PUT', headers: { 'Content-Type': 'application/ld+json' }, auth: 'alice',
      body: JSON.stringify({ '@context': 'https://schema.org', '@id': `${base}${REMOTE}#a`, name: 'A' }) });
  });
  after(async () => { await stopTestServer(); });

  it('GET @graph doc as Turtle → 200 real triples (probe-#4 signature dead)', async () => {
    const r = await request(DOC, { headers: { Accept: 'text/turtle' } });
    assert.equal(r.statusCode, 200);
    assert.match(r.headers['content-type'], /text\/turtle/);
    assert.match(r.body, /"A"/);
    assert.match(r.body, /"B"/);
  });

  it('named-graph doc: Turtle 406 problem+json teaching; N-Quads 200 lossless', async () => {
    const ttl = await request(NG, { headers: { Accept: 'text/turtle' } });
    assert.equal(ttl.statusCode, 406);
    assert.match(ttl.headers['content-type'], /application\/problem\+json/);
    const problem = JSON.parse(ttl.body);
    assert.match(problem.detail, /named graphs/);
    assert.match(problem.detail, /application\/n-quads/);
    const nq = await request(NG, { headers: { Accept: 'application/n-quads' } });
    assert.equal(nq.statusCode, 200);
    assert.match(nq.headers['content-type'], /application\/n-quads/);
    assert.match(nq.body, /#g>/);
  });

  it('remote-@context doc as Turtle → 406 teaching, never a mislabeled 200', async () => {
    const r = await request(REMOTE, { headers: { Accept: 'text/turtle' } });
    assert.equal(r.statusCode, 406);
    assert.match(JSON.parse(r.body).detail, /remote @context/);
  });

  it('HEAD parity: 406 on the named-graph doc, converted content-type on the good doc', async () => {
    const h406 = await request(NG, { method: 'HEAD', headers: { Accept: 'text/turtle' } });
    assert.equal(h406.statusCode, 406);
    const h200 = await request(DOC, { method: 'HEAD', headers: { Accept: 'text/turtle' } });
    assert.equal(h200.statusCode, 200);
    assert.match(h200.headers['content-type'], /text\/turtle/);
  });

  it('JSON-LD Accept unchanged: stored @graph doc round-trips', async () => {
    const r = await request(DOC, { headers: { Accept: 'application/ld+json' } });
    assert.equal(r.statusCode, 200);
    assert.ok(JSON.parse(r.body)['@graph']);
  });
});
```

Create `test/lws-serving-path-negative.test.js` (the byte-identity control):

```js
// test/lws-serving-path-negative.test.js
// NEGATIVE CONTROL (spec 2026-07-10 §1): a --conneg-only pod (no --lws)
// keeps the legacy hand-rolled serving arm byte-identically — including its
// documented defect (a @graph doc converts to prefix-only Turtle with zero
// triples). This test pins the legacy behavior so un-gating is a deliberate
// decision, not an accident.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startTestServer, stopTestServer, request, createTestPod, getBaseUrl } from './helpers.js';

const DOC = '/alice/public/servepath-neg.jsonld';

describe('negative control: --lws off keeps the legacy serving arm', () => {
  before(async () => {
    await startTestServer({ lws: false, conneg: true });
    await createTestPod('alice');
    const base = getBaseUrl();
    await request(DOC, { method: 'PUT', headers: { 'Content-Type': 'application/ld+json' }, auth: 'alice',
      body: JSON.stringify({ '@context': { name: 'https://schema.org/name' }, '@graph': [
        { '@id': `${base}${DOC}#a`, name: 'A' }] }) });
  });
  after(async () => { await stopTestServer(); });

  it('@graph doc as Turtle → legacy 200 with no triples (upstream behavior, unchanged)', async () => {
    const r = await request(DOC, { headers: { Accept: 'text/turtle' } });
    assert.equal(r.statusCode, 200);
    assert.ok(!r.body.includes('"A"'));
  });

  it('n-quads is NOT negotiable without --lws (JSON-LD default served)', async () => {
    const r = await request(DOC, { headers: { Accept: 'application/n-quads' } });
    assert.equal(r.statusCode, 200);
    assert.match(r.headers['content-type'], /application\/ld\+json/);
  });
});
```

- [ ] **Step 2: Run — expect FAIL** (406s come back as legacy 200s; HEAD parity missing)

```bash
node --test --test-force-exit test/lws-serving-path.test.js
```

- [ ] **Step 3: Wire the GET branch.** In `src/handlers/resource.js` add to the conneg imports (~line 13):
`selectContentType` is already imported; add `import { serveStoredRdf, checkServable, QUADS_OUTPUTS } from '../rdf/serve.js';`

In the plain-JSON-LD file branch (currently `} else if (isRdfContentType(storedContentType)) {` ~line 767), insert the gated arm BEFORE the existing `try {`:

```js
    } else if (isRdfContentType(storedContentType)) {
      // --lws serving arm (spec 2026-07-10 §2): real parser + n3 writer,
      // 406 teaching on lossy/failed conversion. The legacy hand-rolled arm
      // below stays byte-identical for --lws-off pods.
      if (request.lwsEnabled) {
        const negotiatedLws = urlPath.endsWith('.ttl')
          ? RDF_TYPES.TURTLE
          : selectContentType(acceptHeader, connegEnabled, true);
        const quadsTarget = QUADS_OUTPUTS[negotiatedLws];
        if (quadsTarget) {
          const served = await serveStoredRdf({ bytes: content, targetType: quadsTarget, baseIri: resourceUrl });
          const headers = getAllHeaders({
            isContainer: false,
            etag: stats.etag,
            contentType: served.ok ? served.contentType : 'application/problem+json',
            origin,
            resourceUrl,
            connegEnabled,
            mashlibEnabled: request.mashlibEnabled,
            lwsEnabled: request.lwsEnabled,
            chosenProfile,
            representations: advertisedReps
          });
          headers['Cache-Control'] = RDF_CACHE_CONTROL;
          Object.entries(headers).forEach(([k, v]) => reply.header(k, v));
          if (!served.ok) return reply.code(406).send(JSON.stringify(served.problem, null, 2));
          return reply.send(served.content);
        }
        // JSON-LD target: the stored bytes ARE JSON-LD — the legacy arm
        // below already serves them (JSON.parse→stringify), unchanged.
      }
      // Plain JSON-LD file (legacy arm — reached always when --lws off)
      try {
```

- [ ] **Step 3b: The HTML data-island → Turtle branches ride the same arm (spec §2).** Two sites convert a parsed JSON-LD island with the legacy `fromJsonLd(jsonLd, 'text/turtle', …)`: the profile-container path (~line 255) and the file path (~line 744). In each, when `request.lwsEnabled`, route through the serving arm instead — the island is already parsed, so re-encode it:

```js
            if (request.lwsEnabled) {
              const served = await serveStoredRdf({
                bytes: Buffer.from(JSON.stringify(jsonLd)), targetType: RDF_TYPES.TURTLE, baseIri: resourceUrl,
              });
              if (!served.ok) throw new Error(served.problem.detail);   // existing catch falls through to HTML — islands degrade, never 406
              turtleContent = served.content;
            } else {
              ({ content: turtleContent } = await fromJsonLd(jsonLd, 'text/turtle', resourceUrl, true));
            }
```

(adjust the destructuring to each site's local names — read the surrounding ~15 lines first; both sites sit in a `try` whose `catch` already falls through to serving the HTML, which is the right degradation for an island and stays the behavior under `--lws`).

- [ ] **Step 4: HEAD parity.** Change `negotiateHeadFileContentType` (~line 902) signature and add the gated arm at the top of its `connegEnabled` block:

```js
async function negotiateHeadFileContentType({ storagePath, urlPath, stats, acceptHeader, connegEnabled, lwsEnabled = false, resourceUrl = null }) {
  const storedContentType = getContentType(storagePath);
  const fitsFullRead = stats.size <= HEAD_FULL_READ_MAX_BYTES;

  if (connegEnabled) {
    // --lws serving-arm parity (spec 2026-07-10 §2): HEAD answers the same
    // 406 a GET would, and the same converted content-type. Large files stay
    // on the optimistic path (docstring above) — same divergence budget.
    if (lwsEnabled && isRdfContentType(storedContentType)) {
      const negotiatedLws = urlPath.endsWith('.ttl')
        ? RDF_TYPES.TURTLE
        : selectContentType(acceptHeader, true, true);
      const quadsTarget = QUADS_OUTPUTS[negotiatedLws];
      if (quadsTarget) {
        if (!fitsFullRead) return { contentType: quadsTarget, converted: true };
        const content = await storage.read(storagePath);
        if (content !== null) {
          const check = await checkServable({ bytes: content, targetType: quadsTarget, baseIri: resourceUrl || `https://head.invalid${urlPath}` });
          if (!check.ok) return { notAcceptable: true };
        }
        return { contentType: quadsTarget, converted: true };
      }
    }
```

(the existing body continues unchanged below). At the call site (~line 1129) pass the new params and handle the refusal:

```js
      const negotiation = await negotiateHeadFileContentType({
        storagePath, urlPath, stats, acceptHeader, connegEnabled,
        lwsEnabled: request.lwsEnabled, resourceUrl,
      });
      if (negotiation.notAcceptable) {
        reply.header('Vary', getVaryHeader(connegEnabled, request.mashlibEnabled, request.lwsEnabled));
        return reply.code(406).type('application/problem+json').send();
      }
```

(match the surrounding variable names at the call site — read the ~20 lines around 1129 first; keep every existing header emission after this check intact).

- [ ] **Step 5: Run tests — expect PASS; then the pre-existing conneg/HEAD suites**

```bash
node --test --test-force-exit test/lws-serving-path.test.js test/lws-serving-path-negative.test.js test/head-conneg.test.js test/conneg.test.js
```

- [ ] **Step 6: Commit**

```bash
git add src/handlers/resource.js test/lws-serving-path.test.js test/lws-serving-path-negative.test.js
git commit -m "$(cat <<'EOF'
[Agent: Claude] feat(lws): file GET/HEAD ride the dataset serving arm under --lws

- @graph/array-context docs serve real Turtle; named-graphs->Turtle and
  remote-@context answer 406 teaching; n-quads/n-triples negotiable
- HEAD mirrors the 406 and converted content-type (#552 parity)
- negative control pins the --lws-off legacy arm byte-identically

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Container GET through the serving arm

**Files:**
- Modify: `src/handlers/resource.js` — container negotiation (~line 374) and the container-Turtle branch (~line 470-500)
- Test: extend `test/lws-serving-path.test.js`

**Interfaces:**
- Consumes: `serveStoredRdf`, `QUADS_OUTPUTS` (Task 2). Container JSON-LD from `generateContainerJsonLd` (existing, possibly filtered by Task 6 — order-independent).

- [ ] **Step 1: Add failing tests** to `test/lws-serving-path.test.js`:

```js
  it('container listing as Turtle carries member IRIs (via the dataset arm)', async () => {
    const r = await request('/alice/public/', { headers: { Accept: 'text/turtle' } });
    assert.equal(r.statusCode, 200);
    assert.match(r.headers['content-type'], /text\/turtle/);
    assert.match(r.body, /servepath-graphdoc\.jsonld/);
    assert.match(r.body, /ldp#contains|ldp:contains/);
  });

  it('container listing negotiates application/n-quads under --lws', async () => {
    const r = await request('/alice/public/', { headers: { Accept: 'application/n-quads' } });
    assert.equal(r.statusCode, 200);
    assert.match(r.headers['content-type'], /application\/n-quads/);
    assert.match(r.body, /servepath-graphdoc\.jsonld/);
  });
```

Run: `node --test --test-force-exit test/lws-serving-path.test.js` — the n-quads case FAILS (JSON-LD served), the Turtle case may pass on the legacy arm (it must still pass after the switch).

- [ ] **Step 2: Wire it.** At ~line 374 pass the lws flag so quads formats negotiate:

```js
    const negotiated = (connegEnabled || request.lwsEnabled)
      ? selectContentType(acceptHeader, connegEnabled, request.lwsEnabled)
      : null;
```

Then insert the gated arm immediately BEFORE the legacy `if (wantsTurtle) {` container branch (~line 470):

```js
    // --lws serving arm for the container listing (spec 2026-07-10 §2). The
    // listing is pod-built JSON-LD (prefixed context, default graph only) so
    // the 406 arms are unreachable; the catch keeps the JSON-LD fallback.
    const quadsTarget = request.lwsEnabled ? QUADS_OUTPUTS[negotiated] : null;
    if (quadsTarget) {
      try {
        const served = await serveStoredRdf({
          bytes: Buffer.from(JSON.stringify(jsonLd)), targetType: quadsTarget, baseIri: resourceUrl,
        });
        if (served.ok) {
          const headers = getAllHeaders({
            isContainer: true,
            etag: stats.etag,
            contentType: served.contentType,
            origin,
            resourceUrl,
            connegEnabled,
            mashlibEnabled: request.mashlibEnabled,
            lwsEnabled: request.lwsEnabled,
            chosenProfile,
            representations: advertisedReps
          });
          headers['Cache-Control'] = RDF_CACHE_CONTROL;
          Object.entries(headers).forEach(([k, v]) => reply.header(k, v));
          return reply.send(served.content);
        }
      } catch (err) {
        console.error('Failed to convert container listing:', err.message);
      }
    }
    if (wantsTurtle) {
```

(the legacy branch is now reached only when `--lws` is off — leave it byte-identical).

- [ ] **Step 3: Run — expect PASS**, plus the L1 container suites:

```bash
node --test --test-force-exit test/lws-serving-path.test.js test/lws-container.test.js 2>/dev/null || node --test --test-force-exit test/lws-serving-path.test.js $(ls test/*container*.test.js)
```

- [ ] **Step 4: Commit**

```bash
git add src/handlers/resource.js test/lws-serving-path.test.js
git commit -m "$(cat <<'EOF'
[Agent: Claude] feat(lws): container listings serve Turtle/N-Quads via the dataset arm

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: The `{@context, @graph}` store form + consumer fix

**Files:**
- Modify: `src/rdf/turtle.js` (`turtleToJsonLd` ~line 88, `quadsToJsonLd` ~line 152/219-228)
- Modify: `src/rdf/conneg.js` (`toJsonLd` ~line 192 — thread an options arg)
- Modify: `src/handlers/resource.js` PUT conversion (~line 1308), `src/handlers/container.js` POST conversion (~line 114)
- Modify: `src/auth/webid-tls.js` (`extractCertKeys` ~line 59 — `@graph` unwrap; add it to the module's exports for the test)
- Test: `test/lws-store-form.test.js` (new)

**Interfaces:**
- Produces: `turtleToJsonLd(turtle, baseUri, { graphEnvelope = false } = {})`; `toJsonLd(content, contentType, baseUri, connegEnabled, { graphEnvelope = false } = {})`. Defaults keep every existing caller byte-identical.

- [ ] **Step 1: Write the failing tests**

Create `test/lws-store-form.test.js`:

```js
// test/lws-store-form.test.js
// The self-describing store form (spec 2026-07-10 §3): under --lws a
// multi-subject Turtle write stores {@context,@graph} (JSS's own generated-
// ACL envelope) instead of the legacy top-level array with @context on
// element 0 only. Single-subject docs and --lws-off pods are unchanged.
import { describe, it, before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { startTestServer, stopTestServer, request, createTestPod, getBaseUrl } from './helpers.js';
import { turtleToJsonLd } from '../src/rdf/turtle.js';
import { extractCertKeys } from '../src/auth/webid-tls.js';

const TTL = '@prefix schema: <https://schema.org/>.\n<#a> schema:name "A".\n<#b> schema:name "B".';

test('turtleToJsonLd: graphEnvelope option emits {@context,@graph}; default stays legacy array', async () => {
  const env = await turtleToJsonLd(TTL, 'https://pod.example/m', { graphEnvelope: true });
  assert.ok(Array.isArray(env['@graph']));
  assert.equal(env['@graph'].length, 2);
  assert.ok(env['@context']);
  const legacy = await turtleToJsonLd(TTL, 'https://pod.example/m');
  assert.ok(Array.isArray(legacy));                       // legacy array — unchanged
  const single = await turtleToJsonLd('<#a> <https://schema.org/name> "A".', 'https://pod.example/m', { graphEnvelope: true });
  assert.equal(single['@graph'], undefined);              // single subject: {@context, ...node}
  assert.equal(single['@id'], '#a');
});

test('extractCertKeys unwraps a {@context,@graph} profile (webid-tls consumer fix)', () => {
  // BEFORE finalizing this test: read parseKeyObject in src/auth/webid-tls.js
  // and shape the cert:key object to what it actually reads (modulus/exponent
  // key spellings). The assertion below is the contract; the fixture may need
  // its inner keys adjusted to parseKeyObject's expectations.
  const doc = { '@context': { cert: 'http://www.w3.org/ns/auth/cert#' }, '@graph': [{
    '@id': 'https://ex.org/profile#me',
    'cert:key': { 'cert:modulus': 'abc123', 'cert:exponent': 65537 },
  }] };
  const keys = extractCertKeys(doc, 'https://ex.org/profile#me');
  assert.equal(keys.length, 1);
  // Control: the same nodes passed as a bare array must give the same result.
  assert.equal(extractCertKeys(doc['@graph'], 'https://ex.org/profile#me').length, keys.length);
});

describe('store form over HTTP (--lws pod)', () => {
  before(async () => {
    await startTestServer({ lws: true, conneg: true });
    await createTestPod('alice');
  });
  after(async () => { await stopTestServer(); });

  it('multi-subject Turtle PUT stores the {@context,@graph} envelope', async () => {
    await request('/alice/public/multi.jsonld', {
      method: 'PUT', headers: { 'Content-Type': 'text/turtle' }, body: TTL, auth: 'alice',
    });
    const r = await request('/alice/public/multi.jsonld', { headers: { Accept: 'application/ld+json' } });
    const doc = JSON.parse(r.body);
    assert.ok(Array.isArray(doc['@graph']));
    assert.equal(doc['@graph'].length, 2);
    assert.ok(!Array.isArray(doc));                        // never the legacy top-level array
  });

  it('round-trip: Turtle PUT then Turtle GET returns both subjects (isomorphic content)', async () => {
    const r = await request('/alice/public/multi.jsonld', { headers: { Accept: 'text/turtle' } });
    assert.equal(r.statusCode, 200);
    assert.match(r.body, /"A"/);
    assert.match(r.body, /"B"/);
  });
});
```

And the negative control — append to `test/lws-serving-path-negative.test.js`:

```js
  it('multi-subject Turtle PUT stores the LEGACY array form without --lws', async () => {
    await request('/alice/public/multi-neg.jsonld', {
      method: 'PUT', headers: { 'Content-Type': 'text/turtle' },
      body: '@prefix schema: <https://schema.org/>.\n<#a> schema:name "A".\n<#b> schema:name "B".',
      auth: 'alice',
    });
    const r = await request('/alice/public/multi-neg.jsonld', { headers: { Accept: 'application/ld+json' } });
    assert.ok(Array.isArray(JSON.parse(r.body)));          // legacy array — byte-discipline held
  });
```

- [ ] **Step 2: Run — expect FAIL** (`graphEnvelope` unknown; `extractCertKeys` not exported; HTTP cases store arrays)

```bash
node --test --test-force-exit test/lws-store-form.test.js
```

- [ ] **Step 3: Implement.** `src/rdf/turtle.js` — thread the option:

```js
export async function turtleToJsonLd(turtle, baseUri, { graphEnvelope = false } = {}) {
```

(pass through to the completion callback: `const jsonLd = quadsToJsonLd(quads, baseUri, prefixes, { graphEnvelope });`), and in `quadsToJsonLd`:

```js
function quadsToJsonLd(quads, baseUri, prefixes = {}, { graphEnvelope = false } = {}) {
```

with the multi-node return (~line 222-227) becoming:

```js
  if (nodes.length === 1) {
    return { '@context': context, ...nodes[0] };
  }

  // Self-describing envelope (spec 2026-07-10 §3) — JSS's own generated
  // ACLs already use exactly this shape (wac/parser generate*Acl).
  if (graphEnvelope) {
    return { '@context': context, '@graph': nodes };
  }

  // Legacy store form (--lws off): top-level array, @context on element 0.
  return nodes.map((node, i) => i === 0 ? { '@context': context, ...node } : node);
```

`src/rdf/conneg.js` `toJsonLd`:

```js
export async function toJsonLd(content, contentType, baseUri, connegEnabled = false, { graphEnvelope = false } = {}) {
```

(and pass `{ graphEnvelope }` into the `turtleToJsonLd` call). `src/handlers/resource.js` PUT (~line 1308):

```js
      const jsonLd = await toJsonLd(content, contentType, resourceUrl, connegEnabled, { graphEnvelope: !!request.lwsEnabled });
```

`src/handlers/container.js` (~line 114) — same added argument (read the surrounding lines; the request object there also carries `lwsEnabled`). `src/auth/webid-tls.js` — export `extractCertKeys` and change its normalization (~line 63):

```js
  // Normalize: bare node, top-level array, or {@context,@graph} envelope —
  // the same unwrap wac/parser.js parseAcl uses.
  const nodes = Array.isArray(jsonLd) ? jsonLd : (jsonLd['@graph'] || [jsonLd]);
```

- [ ] **Step 4: Run — expect PASS**, then the WAC + webid suites (consumers):

```bash
node --test --test-force-exit test/lws-store-form.test.js test/lws-serving-path-negative.test.js $(ls test/*wac*.test.js test/*webid*.test.js 2>/dev/null)
```

- [ ] **Step 5: Commit**

```bash
git add src/rdf/turtle.js src/rdf/conneg.js src/handlers/resource.js src/handlers/container.js src/auth/webid-tls.js test/lws-store-form.test.js test/lws-serving-path-negative.test.js
git commit -m "$(cat <<'EOF'
[Agent: Claude] feat(rdf): {@context,@graph} store form under --lws + webid-tls @graph unwrap

- multi-subject Turtle writes store self-describing JSON-LD (the shape
  JSS's own generated ACLs already use); --lws-off keeps the legacy array
- extractCertKeys normalizes the envelope like parseAcl does

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: WAC-filtered container listings (S1)

**Files:**
- Create: `src/lws/authorized-listing.js`
- Modify: `src/handlers/resource.js` (~line 332 — filter before `generateContainerJsonLd`; import)
- Test: `test/lws-listing-authz.test.js` (new), `test/lws-listing-authz-negative.test.js` (new)

**Interfaces:**
- Consumes: `checkAccess` (`src/wac/checker.js`, signature as used in `src/lws/authorized-resources.js:37-40`), `AccessMode` (`src/wac/parser.js`), `getWebIdFromRequestAsync` (already imported in resource.js — verify with grep, else import from where `authorizedRepresentations` ~line 84 gets it).
- Produces: `export async function filterReadableEntries({ entries, containerUrl, containerStoragePath, agentWebId })` → filtered entries array.

- [ ] **Step 1: Write the failing tests**

Create `test/lws-listing-authz.test.js`:

```js
// test/lws-listing-authz.test.js
// S1 (spec 2026-07-10 §4): the container LISTING is WAC-filtered per member
// under --lws — the same checkAccess()-and-drop discipline as /types/*
// (src/lws/authorized-resources.js: "the filter IS the authz boundary").
// Hide, never 401 — no discovery oracle. Closes the probe-#3 existence leak.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startTestServer, stopTestServer, request, createTestPod, getBaseUrl } from './helpers.js';
import { generatePrivateAcl, serializeAcl } from '../src/wac/parser.js';

const PUB = '/alice/public/listing-open.jsonld';
const PRIV = '/alice/public/listing-private.jsonld';

describe('WAC-filtered container listing (--lws)', () => {
  before(async () => {
    await startTestServer({ lws: true, conneg: true });
    await createTestPod('alice');
    const base = getBaseUrl();
    await request(PUB, { method: 'PUT', headers: { 'Content-Type': 'application/ld+json' }, auth: 'alice',
      body: JSON.stringify({ '@id': `${base}${PUB}`, note: 'open' }) });
    await request(PRIV, { method: 'PUT', headers: { 'Content-Type': 'application/ld+json' }, auth: 'alice',
      body: JSON.stringify({ '@id': `${base}${PRIV}`, note: 'private' }) });
    // Owner-only resource ACL overrides the folder's inherited public-read
    // (resource ACL wins — src/wac/checker.js findApplicableAcl).
    const aclRes = await request(`${PRIV}.acl`, { method: 'PUT', headers: { 'Content-Type': 'application/ld+json' }, auth: 'alice',
      body: serializeAcl(generatePrivateAcl(`${getBaseUrl()}${PRIV}`, `${getBaseUrl()}/alice/profile/card.jsonld#me`, false)) });
    assert.ok([200, 201, 204].includes(aclRes.statusCode));
  });
  after(async () => { await stopTestServer(); });

  it('anonymous LDP listing hides the unreadable member (ldp:contains)', async () => {
    const r = await request('/alice/public/', { headers: { Accept: 'application/ld+json' } });
    assert.equal(r.statusCode, 200);
    assert.ok(r.body.includes('listing-open'));
    assert.ok(!r.body.includes('listing-private'));
  });

  it('anonymous lws+json items[] hides it too', async () => {
    const r = await request('/alice/public/', { headers: { Accept: 'application/lws+json' } });
    assert.equal(r.statusCode, 200);
    assert.ok(!r.body.includes('listing-private'));
  });

  it('the owner still sees both members', async () => {
    const r = await request('/alice/public/', { headers: { Accept: 'application/ld+json' }, auth: 'alice' });
    assert.ok(r.body.includes('listing-open'));
    assert.ok(r.body.includes('listing-private'));
  });

  it('no oracle: the hidden member still answers 401/403 directly (not 404-scrubbed here — existence policy unchanged)', async () => {
    const r = await request(PRIV, { headers: { Accept: 'application/ld+json' } });
    assert.ok([401, 403].includes(r.statusCode));
  });
});
```

Create `test/lws-listing-authz-negative.test.js`:

```js
// test/lws-listing-authz-negative.test.js
// NEGATIVE CONTROL (spec 2026-07-10 §1): without --lws the listing is NOT
// filtered — upstream LDP behavior byte-identical (the leak is the baseline;
// fixing it ungated would breach the fork discipline).
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startTestServer, stopTestServer, request, createTestPod, getBaseUrl } from './helpers.js';
import { generatePrivateAcl, serializeAcl } from '../src/wac/parser.js';

const PRIV = '/alice/public/listing-neg-private.jsonld';

describe('negative control: --lws off leaves the listing unfiltered', () => {
  before(async () => {
    await startTestServer({ lws: false, conneg: true });
    await createTestPod('alice');
    await request(PRIV, { method: 'PUT', headers: { 'Content-Type': 'application/ld+json' }, auth: 'alice',
      body: '{}' });
    await request(`${PRIV}.acl`, { method: 'PUT', headers: { 'Content-Type': 'application/ld+json' }, auth: 'alice',
      body: serializeAcl(generatePrivateAcl(`${getBaseUrl()}${PRIV}`, `${getBaseUrl()}/alice/profile/card.jsonld#me`, false)) });
  });
  after(async () => { await stopTestServer(); });

  it('anonymous listing still names the private member (baseline behavior pinned)', async () => {
    const r = await request('/alice/public/', { headers: { Accept: 'application/ld+json' } });
    assert.equal(r.statusCode, 200);
    assert.ok(r.body.includes('listing-neg-private'));
  });
});
```

Run: `node --test --test-force-exit test/lws-listing-authz.test.js` — the hide assertions FAIL.

- [ ] **Step 2: Implement the helper.** Create `src/lws/authorized-listing.js`:

```js
// src/lws/authorized-listing.js
// WAC-filter a container's directory entries for the requesting agent — the
// same per-resource checkAccess()-and-drop discipline as authorized-
// resources.js (the filter IS the authz boundary; members are HIDDEN, never
// 401'd — no discovery oracle). Closes the /types/*-vs-listing asymmetry
// (probe #3: anonymous listings advertised members that then 401'd).
import { checkAccess } from '../wac/checker.js';
import { AccessMode } from '../wac/parser.js';

export async function filterReadableEntries({ entries, containerUrl, containerStoragePath, agentWebId }) {
  const baseUrl = containerUrl.endsWith('/') ? containerUrl : containerUrl + '/';
  const basePath = containerStoragePath.endsWith('/') ? containerStoragePath : containerStoragePath + '/';
  const aclCache = new Map();
  const out = [];
  for (const e of entries) {
    const suffix = e.isDirectory ? '/' : '';
    const { allowed } = await checkAccess({
      resourceUrl: baseUrl + e.name + suffix,
      resourcePath: basePath + e.name + suffix,
      isContainer: e.isDirectory,
      agentWebId, requiredMode: AccessMode.READ, aclCache,
    });
    if (allowed) out.push(e);
  }
  return out;
}
```

- [ ] **Step 3: Wire it.** In `src/handlers/resource.js` import it, then change the listing site (~line 332):

```js
    let entries = await storage.listContainer(storagePath);
    // S1 (spec 2026-07-10 §4): WAC-filter the membership per requester
    // before ANY rendering (ldp:contains, lws+json items[], Turtle, mashlib
    // embed all flow from `entries`/`jsonLd`). --public mode has no WAC to
    // filter by; --lws off keeps the upstream unfiltered listing.
    if (request.lwsEnabled && !request.config?.public) {
      const { webId: agentWebId } = await getWebIdFromRequestAsync(request).catch(() => ({ webId: null }));
      entries = await filterReadableEntries({
        entries: entries || [], containerUrl: resourceUrl, containerStoragePath: storagePath, agentWebId,
      });
    }
    const jsonLd = generateContainerJsonLd(resourceUrl, entries || []);
```

(`const entries` becomes `let entries`; verify `getWebIdFromRequestAsync` is already imported in this file — it is used at ~line 84 — otherwise add the import from the same module `authorizedRepresentations` uses.)

- [ ] **Step 4: Run — expect PASS**, plus the L1/L2 container + linkset suites for regressions:

```bash
node --test --test-force-exit test/lws-listing-authz.test.js test/lws-listing-authz-negative.test.js $(ls test/lws-*.test.js | head -20)
```

- [ ] **Step 5: Commit**

```bash
git add src/lws/authorized-listing.js src/handlers/resource.js test/lws-listing-authz.test.js test/lws-listing-authz-negative.test.js
git commit -m "$(cat <<'EOF'
[Agent: Claude] feat(lws): WAC-filter container listings per member (probe-#3 existence leak)

- checkAccess-and-drop before every membership rendering; hide, never 401
- --public and --lws-off paths unchanged (negative control pinned)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: `.lwstypes` mediaType (S3)

**Files:**
- Modify: `src/utils/url.js` (`getContentType` overrides map ~line 239-252 and the bare-basename check ~line 260-261)
- Test: `test/content-type-lwstypes.test.js` (new)

- [ ] **Step 1: Failing test** — create `test/content-type-lwstypes.test.js`:

```js
// S3 (spec 2026-07-10 §4): .lwstypes is a plain-JSON server sidecar — serve
// application/json, not application/octet-stream (probe-#3 affordance nit).
// NOT application/ld+json: it carries no @context; ld+json would over-claim.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getContentType } from '../src/utils/url.js';

test('.lwstypes sidecars serve application/json', () => {
  assert.equal(getContentType('/alice/notes/a.md.lwstypes'), 'application/json');
  assert.equal(getContentType('/alice/notes/.lwstypes'), 'application/json');
});

test('.meta/.acl overrides unchanged', () => {
  assert.equal(getContentType('/alice/notes/a.md.meta'), 'application/ld+json');
  assert.equal(getContentType('/alice/.acl'), 'application/ld+json');
});
```

Run: `node --test --test-force-exit test/content-type-lwstypes.test.js` — FAIL (octet-stream).

- [ ] **Step 2: Implement** — in the `overrides` map add `'.lwstypes': 'application/json',` next to the `'.meta'` line, and extend the bare-basename check (the line handling basename `.acl`/`.meta`) to include `.lwstypes` with `application/json` (read the two code sites first; the basename branch returns ld+json for `.acl`/`.meta` — add a `.lwstypes` → `application/json` case beside it, not inside it).

- [ ] **Step 3: Run — PASS. Commit**

```bash
git add src/utils/url.js test/content-type-lwstypes.test.js
git commit -m "$(cat <<'EOF'
[Agent: Claude] fix(lws): .lwstypes sidecars serve application/json, not octet-stream

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: Storage-description hint rewording (S4)

**Files:**
- Modify: `src/lws/storage-description.js:66` (the `linkset.hint` string)
- Test: whichever existing test asserts the hint (find: `grep -rln "every resource serves" test/ src/`) + extend it

- [ ] **Step 1: Failing test.** Locate the hint assertions (`grep -rn "linkset of its typed links" test/`). Update/extend the covering test to assert the NEW wording (exact substrings):

```js
test('storage-description linkset hint: no over-promise + membership steering', () => {
  const sd = buildStorageDescription('https://pod.example', {});
  const hint = sd.linkset.hint;
  assert.ok(!hint.includes('every resource serves'));                    // the over-promise is gone
  assert.match(hint, /shadowed by its index\.html/);                     // the shadowed-container caveat
  assert.match(hint, /ldp:contains/);                                    // membership steering
  assert.match(hint, /items\[\]/);
  assert.match(hint, /TypeSearchService/);
  assert.match(hint, /CONTAINER's linkset/);                             // the load-bearing governance sentence survives
});
```

Run it — FAIL against the old string.

- [ ] **Step 2: Replace the hint** at `src/lws/storage-description.js:66` with EXACTLY:

```js
      hint: 'This storage speaks RFC 9264: resources serve a linkset of their typed links — request the resource URL with Accept: application/linkset+json (rel="linkset"); a container shadowed by its index.html serves the HTML instead, so descend to a member. A member linkset carries up/type; the governing describedby (SHACL shape) and conformsTo (profile) edges live on its CONTAINER\'s linkset — follow up. Linksets carry governance, not membership: list members by GETting the container itself (ldp:contains, or items[] via Accept: application/lws+json); search by type via the TypeSearchService.',
```

Keep the surrounding "wording is load-bearing" comment; append to it: `Reworded 2026-07-10 (probe #4b/#5): the old "every resource" over-promised on shadowed containers, and a linkset-only client concluded containers were empty — membership steering added.`

- [ ] **Step 3: Run the storage-description tests — PASS. Commit**

```bash
node --test --test-force-exit $(grep -rln "buildStorageDescription" test/)
git add src/lws/storage-description.js test/
git commit -m "$(cat <<'EOF'
[Agent: Claude] fix(lws): linkset hint — drop the every-resource over-promise, add membership steering

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 9: McpService advertisement (S5)

**Files:**
- Modify: `src/lws/storage-description.js` (`buildStorageDescription` flags ~line 41 + service list ~line 51-53)
- Modify: `src/server.js:1054` (pass `mcpEnabled` — the local of that name exists at line 211)
- Modify: `src/mcp/resources.js:70` (pass `mcpEnabled: true` — if MCP is answering, MCP is on)
- Test: the existing HTTP↔MCP storage-description parity test (find: `grep -rln "buildStorageDescription\|storage-description" test/`) + unit asserts

- [ ] **Step 1: Failing test** (add to the storage-description unit test file):

```js
test('McpService advertised iff MCP is enabled (S5 — /mcp was invisible to HTTP-cold agents)', () => {
  const on = buildStorageDescription('https://pod.example', { mcpEnabled: true });
  const svc = on.service.find(s => s.type === 'McpService');
  assert.ok(svc);
  assert.equal(svc.serviceEndpoint, 'https://pod.example/mcp');
  const off = buildStorageDescription('https://pod.example', {});
  assert.ok(!off.service.some(s => s.type === 'McpService'));
});
```

Run — FAIL.

- [ ] **Step 2: Implement.** `buildStorageDescription` signature gains `mcpEnabled = false`; after the `profileIndexPath` block add:

```js
  if (mcpEnabled) {
    services.push({
      type: 'McpService',
      serviceEndpoint: `${origin}/mcp`,
      // Steering (unmapped, like the linkset hint): the endpoint 405s GETs,
      // so a cold agent needs told HOW to speak to it.
      hint: 'Model Context Protocol gateway — JSON-RPC 2.0 over Streamable HTTP: POST initialize to this endpoint, then notifications/initialized; the read loop is the read_resource/list_resources tools.',
    });
  }
```

Wire the two call sites: `src/server.js:1054` add `mcpEnabled,` to the flags object; `src/mcp/resources.js:70` add `mcpEnabled: true,`.

- [ ] **Step 3: Run** the storage-description + MCP parity suites; extend the parity test so BOTH surfaces assert the entry when MCP is on. Then commit:

```bash
git add src/lws/storage-description.js src/server.js src/mcp/resources.js test/
git commit -m "$(cat <<'EOF'
[Agent: Claude] feat(lws): advertise the MCP gateway as a storage-description service

- McpService entry (HTTP+MCP surfaces share the one builder; parity kept)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 10: `--subdomains` + `--lws` startup guard (S6)

**Files:**
- Modify: `src/server.js` (~line 118, right after `subdomainsEnabled` is derived; `lwsEnabled` exists at line 101)
- Test: `test/lws-subdomains-guard.test.js` (new)

- [ ] **Step 1: Failing test** — create `test/lws-subdomains-guard.test.js` (check the exact exported creator first: `grep -n "^export" src/server.js`):

```js
// S6 (spec 2026-07-10 §4): urlToStoragePath (src/lws/admission.js) is
// path-mode-only — under --subdomains it drops the pod-name prefix, so BOTH
// SHACL shape resolution (write.js) and the conneg authz filter
// (representations.js) would silently misresolve. Refuse loudly at startup.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from '../src/server.js';

test('--lws + --subdomains is refused at startup', async () => {
  await assert.rejects(
    async () => { await createServer({ lws: true, subdomains: true, baseDomain: 'pods.example' }); },
    /path mode only/
  );
});

test('each flag alone still constructs', async () => {
  const a = await createServer({ lws: true });
  await a.close();
  const b = await createServer({ subdomains: true, baseDomain: 'pods.example' });
  await b.close();
});
```

(If the exported creator has a different name/shape, keep the test's semantics and adjust the import + close calls to the harness's actual creator.)

- [ ] **Step 2: Implement** — in `src/server.js` after `subdomainsEnabled` (~line 118):

```js
  // --lws is path-mode only for now: urlToStoragePath (src/lws/admission.js)
  // maps URLs to storage via bare URL.pathname, which drops the pod-name
  // prefix under --subdomains — SHACL shape admission (src/lws/write.js) and
  // the conneg authz filter (src/lws/representations.js) would silently
  // misresolve. Refuse loudly rather than misresolve (spec 2026-07-10 S6).
  if (lwsEnabled && subdomainsEnabled) {
    throw new Error('--lws cannot be combined with --subdomains yet: LWS resolves shape/alternate URLs in path mode only. Disable one of the two flags.');
  }
```

- [ ] **Step 3: Run — PASS. Commit**

```bash
node --test --test-force-exit test/lws-subdomains-guard.test.js
git add src/server.js test/lws-subdomains-guard.test.js
git commit -m "$(cat <<'EOF'
[Agent: Claude] feat(lws): refuse --lws + --subdomains at startup (path-mode-only guard)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 11: Full fork suite, merge, push

**Files:** none new — suite fixes only if regressions surface.

- [ ] **Step 1: Full suite**

```bash
cd /Users/cvardema/dev/git/LA3D/JavaScriptSolidServer && npm test
```

Expected: 0 fail, 1 pre-existing skip. If a test fails because it asserts pre-round `--lws` behavior (array store form under lws, unfiltered listing under lws, old hint string), flip it deliberately with a comment citing spec 2026-07-10; if it fails on `--lws`-OFF behavior, that is a REGRESSION — fix the source, not the test.

- [ ] **Step 2: Merge and push**

```bash
git checkout la3d/lws
git merge --no-ff la3d/lws-servepath -m "Merge la3d/lws-servepath: dataset serving arm + store form + queue drain (spec 2026-07-10)"
git push origin la3d/lws la3d/lws-servepath
git rev-parse la3d/lws   # <- record this FULL SHA; Task 13 pins it
```

---

### Task 12: Publish `self ⟺ default` cross-check (S7 — lws-pod repo)

**Files:**
- Modify: `projection/publish/checks.mjs:127-136` (`checkRepresentation`)
- Test: `projection/publish/checks.test.mjs`

**Interfaces:**
- Produces: a new failure string from `checkRepresentation`. `instantiate()` and `publish.mjs:83`'s ≤1-default check are UNCHANGED.

- [ ] **Step 1: Failing test** — add to `projection/publish/checks.test.mjs` (match its existing style):

```js
it('representation: default without self is a declaration error (contract seam, FOLLOWUP 2026-07-10)', () => {
  const rep = JSON.stringify({ id: 'links', suffix: '.links.jsonld', default: true, format: 'application/ld+json', conformsTo: 'p' })
  expect(checkRepresentation(rep, 'links').some((m) => m.includes("'self' and 'default' must be declared together"))).toBe(true)
})

it('representation: self without default is the same error', () => {
  const rep = JSON.stringify({ id: 'content', self: true, format: 'text/markdown', conformsTo: 'p' })
  expect(checkRepresentation(rep, 'content').some((m) => m.includes('declared together'))).toBe(true)
})

it('representation: self+default together stays clean (all curated reps)', () => {
  const rep = JSON.stringify({ id: 'content', self: true, default: true, format: 'text/markdown', conformsTo: 'p' })
  expect(checkRepresentation(rep, 'content')).toEqual([])
})
```

Run: `npx vitest run projection/publish/checks.test.mjs` — FAIL.

- [ ] **Step 2: Implement** — in `checkRepresentation`, after the kinds check (line 133):

```js
  // Contract seam (FOLLOWUP 2026-07-10): publish's ≤1-default check counts
  // `default`; instantiate() advertises altr:hasDefaultRepresentation from
  // `self`. A rep declaring one without the other checks clean here yet
  // never advertises (or advertises undeclared) — require them together.
  if (!!rep.self !== !!rep.default) out.push(`${name}: 'self' and 'default' must be declared together — instantiate advertises the default from 'self'`)
```

- [ ] **Step 3: Verify + commit** — the projection suite (its `defs.test.mjs` runs these checks over every curated rep artifact, all of which declare `self`+`default` together or neither) must stay green:

```bash
make test-projection
git add projection/publish/checks.mjs projection/publish/checks.test.mjs
git commit -m "$(cat <<'EOF'
[Agent: Claude] fix(publish): require self<=>default together in representation checks

- closes the contract seam: a default:true rep without self:true checked
  clean but never advertised as altr:hasDefaultRepresentation

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 13: Rig — idp-issuer + repin to the merge SHA

**Files:**
- Modify: `docker-compose.fork-tls.yml` (command array + `JSS_GIT_REF` default + `image:` tag)
- Modify: `Dockerfile.fork` (`ARG JSS_GIT_REF` default + rung comment)
- Check: `grep -rn "d75a4dd" --include="*.yml" --include="Dockerfile*" --include="Makefile" .` for any other pinned ref

- [ ] **Step 1: Pin.** Use the FULL SHA recorded in Task 11 Step 2 (`git -C /Users/cvardema/dev/git/LA3D/JavaScriptSolidServer rev-parse la3d/lws`). In `Dockerfile.fork` set `ARG JSS_GIT_REF=<that full SHA>` and update its comment to name the serving-path rung. In `docker-compose.fork-tls.yml` set the same SHA in the `JSS_GIT_REF` default and `image: lws-pod:fork-servepath`.

- [ ] **Step 2: Issuer (S2 — zero fork code).** In the `command:` array add two entries after `"--provision-keys",`:

```yaml
      "--idp-issuer", "https://pod.vardeman.me",
```

- [ ] **Step 3: Rebuild + verify by hand**

```bash
make down-fork-tls || true
make up-fork-tls
curl --cacert certs/rootCA.pem https://pod.vardeman.me/.well-known/lws-storage | head -5
curl --cacert certs/rootCA.pem https://pod.vardeman.me/.well-known/openid-configuration | grep -o '"issuer":"[^"]*"'
```

Expected: storage description serves; issuer is `https://pod.vardeman.me/` (NOT localhost).

- [ ] **Step 4: Commit**

```bash
git add docker-compose.fork-tls.yml Dockerfile.fork
git commit -m "$(cat <<'EOF'
[Agent: Claude] chore(rig): repin fork to the serving-path merge; set --idp-issuer behind Caddy

- image fork-servepath; openid-configuration now advertises the public
  issuer (probe-#5 rig finding — config, not request-derived: issuer is identity)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 14: Gate updates — serving cases, issuer, listing filter

**Files:**
- Modify: `tests/lws-conneg.test.mjs` (new describes; artifact cleanup)

**Interfaces:**
- Consumes: `BASE`, `ensurePod`, `getToken` from `tests/helpers.mjs`; the `hasConneg` self-skip already in the file.

- [ ] **Step 1: Add the gate cases** to `tests/lws-conneg.test.mjs` (after the existing describe; reuse its `hasConneg` guard; note the seed-hygiene probe finding — every artifact this gate writes gets DELETEd in `afterAll`):

```js
describe.skipIf(!hasConneg)('LWS serving path (dataset seam, spec 2026-07-10)', () => {
  let token, auth, doc, ng
  beforeAll(async () => {
    await ensurePod()
    ;({ token } = await getToken())
    auth = { Authorization: `Bearer ${token}` }
    doc = `${BASE}/alice/servepath-graphdoc.jsonld`
    ng = `${BASE}/alice/servepath-namedgraph.jsonld`
    await fetch(doc, { method: 'PUT', headers: { 'Content-Type': 'application/ld+json', ...auth },
      body: JSON.stringify({ '@context': { name: 'https://schema.org/name' }, '@graph': [
        { '@id': `${doc}#a`, name: 'A' }, { '@id': `${doc}#b`, name: 'B' }] }) })
    await fetch(ng, { method: 'PUT', headers: { 'Content-Type': 'application/ld+json', ...auth },
      body: JSON.stringify({ '@context': { name: 'https://schema.org/name' }, '@id': `${ng}#g`, '@graph': [
        { '@id': `${ng}#a`, name: 'A' }] }) })
  })
  afterAll(async () => {
    for (const u of [doc, ng]) await fetch(u, { method: 'DELETE', headers: auth })
  })

  it('@graph doc serves real Turtle triples (probe-#4 family dead, live)', async () => {
    const r = await fetch(doc, { headers: { Accept: 'text/turtle', ...auth } })
    expect(r.status).toBe(200)
    const body = await r.text()
    expect(body).toContain('"A"')
    expect(body).toContain('"B"')
  })

  it('named graphs: Turtle 406-teaches, N-Quads serves losslessly', async () => {
    const ttl = await fetch(ng, { headers: { Accept: 'text/turtle', ...auth } })
    expect(ttl.status).toBe(406)
    const problem = await ttl.json()
    expect(problem.detail).toMatch(/named graphs/)
    expect(problem.detail).toMatch(/application\/n-quads/)
    const nq = await fetch(ng, { headers: { Accept: 'application/n-quads', ...auth } })
    expect(nq.status).toBe(200)
    expect(await nq.text()).toContain('#g>')
  })
})

describe('openid-configuration behind the TLS proxy (S2)', () => {
  it('advertises the public issuer, never localhost', async () => {
    const r = await fetch(`${BASE}/.well-known/openid-configuration`)
    expect(r.status).toBe(200)
    const oc = await r.json()
    expect(oc.issuer.startsWith('https://pod.vardeman.me')).toBe(true)
    expect(JSON.stringify(oc)).not.toContain('localhost')
  })
})

describe.skipIf(!hasConneg)('WAC-filtered listing (S1, live)', () => {
  let token, auth, priv
  beforeAll(async () => {
    await ensurePod()
    ;({ token } = await getToken())
    auth = { Authorization: `Bearer ${token}` }
    priv = `${BASE}/alice/servepath-private.jsonld`
    // owner-only by the pod's default ACL inheritance under /alice/
    await fetch(priv, { method: 'PUT', headers: { 'Content-Type': 'application/ld+json', ...auth }, body: '{}' })
  })
  afterAll(async () => { await fetch(priv, { method: 'DELETE', headers: auth }) })

  it('anonymous listing hides the owner-only member; the owner sees it', async () => {
    const anon = await fetch(`${BASE}/alice/`, { headers: { Accept: 'application/ld+json' } })
    expect(anon.status).toBe(200)
    expect(await anon.text()).not.toContain('servepath-private')
    const owner = await fetch(`${BASE}/alice/`, { headers: { Accept: 'application/ld+json', ...auth } })
    expect(await owner.text()).toContain('servepath-private')
  })
})
```

- [ ] **Step 2: Run the gate against the repinned rig**

```bash
make test-conneg
```

Expected: all prior 7 cases + the new ones green. (If `/alice/` is not anonymously readable on a fresh rig, the S1 anonymous fetch 401s — assert `[200]` only after confirming the rig's seed grants public read on `/alice/`; if it doesn't, grant it the way the L4a recipe does, via an authenticated `write_acl`/ACL PUT, inside `beforeAll`.)

- [ ] **Step 3: Commit**

```bash
git add tests/lws-conneg.test.mjs
git commit -m "$(cat <<'EOF'
[Agent: Claude] test(gates): serving-path live cases — @graph Turtle, N-Quads, 406 teaching, issuer, listing filter

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 15: Full sweep + close-out docs

**Files:**
- Modify: `FOLLOWUP.md` (new top block; supersede the "NEXT: fork-queue serving-path round" pointer)
- Modify: `docs/foundations/05-jss-spec-conformance.md` (re-disposition the conneg/serving rows this round changed)

- [ ] **Step 1: The full sweep, zero regression** (mind the mcp-v2 ~60s rate-limit window between back-to-back runs). Both rigs must be up first: `make up` (local pod) and `make up-fork-tls` (the repinned fork behind Caddy); `make doctor` if Docker misbehaves.

```bash
make test           # substrate e2e
make test-lws && make test-l3 && make test-typeindex && make test-indexed-relation
make test-profiles && make test-dcat && make test-graph
make test-conneg && make test-mcp-v2 && make test-wiki
make test-projection && make test-app
```

Every gate green at its FOLLOWUP-recorded count or better. Any red = stop, fix, re-run.

- [ ] **Step 2: FOLLOWUP.md** — add the round's block at top (pattern: the existing 2026-07-10 Phase-2 block): shipped items (dataset seam, 406 policy, store form + shim retirement, S1–S7), the new fork merge SHA + image tag, gate counts, the negative-control invariant, and remaining carryovers (federation hardening, console rewire, seed hygiene, host-aware urlToStoragePath, probe #6 pending). Mark the old "▶▶ NEXT: fork-queue serving-path round" block `~~DONE~~` with a pointer up, same convention as prior rounds.

- [ ] **Step 3: foundations/05** — update the conneg/serving rows: Turtle conneg now real-parser-backed under `--lws` with the 406-teaching policy; N-Quads/N-Triples negotiable; store form self-describing; listing WAC-filtered. Cite the spec.

- [ ] **Step 4: Commit**

```bash
git add FOLLOWUP.md docs/foundations/05-jss-spec-conformance.md
git commit -m "$(cat <<'EOF'
[Agent: Claude] docs(followup): serving-path round close-out — sweep green, queue drained

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

**After Task 15:** cold probe #6 (unprimed, pod URL + CA only, re-running the probe-#4 Turtle battery) is a separate session per the probe protocol — record its findings in FOLLOWUP before any further fork work.
