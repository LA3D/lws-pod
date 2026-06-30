# LWS L3 — SHACL Admission Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add in-process, opt-in SHACL admission to the JSS fork: a write whose target declares a shape (via a `describedby` link) is validated against that shape before it is stored, with the SHACL report returned to the agent as LWS-native structured feedback.

**Architecture:** A profile-neutral engine in `src/lws/`. `shacl.js` isolates the SHACL library; `admission-rdf.js` turns request/stored bytes into RDF/JS datasets; `constraint.js` resolves the shape URL from the target's persisted metadata (`.meta`); `admission.js` orchestrates validate→map-severity→outcome. `handlePut`/`handlePost` call it behind the `request.lwsEnabled` gate, immediately before `storage.write`. Violations → `400` + RFC 9457 `application/problem+json`; warnings/infos → admit + advisory body; every response carries `Link: rel="describedby"`.

**Tech Stack:** Node ESM, Fastify, `n3` (already a dep), `rdf-ext` (new), `shacl-engine` pinned to the 1.2 git SHA (new). Fork tests use `node:test` + `node:assert/strict`. The live-pod gate is Vitest in the `lws-pod` repo.

## Global Constraints

- **Repo:** the **fork** `~/dev/git/LA3D/JavaScriptSolidServer`, branch off `la3d/lws` named `la3d/lws-admission`. Merge `--no-ff` into `la3d/lws` at the end (solo-dev model; no GitHub PR). `la3d/main` stays the pristine pin.
- **Gate everything behind `request.lwsEnabled`.** When it is falsy, behavior MUST be byte-identical to upstream. Every task includes a negative control proving the default LDP path is unchanged.
- **Opt-in by construction.** A target with no `describedby→shape` in its `.meta`, every non-RDF body, and every non-write request pass through with zero validation work.
- **Engine pin (exact, reproducible):** `shacl-engine` at git SHA `ce39d07eb9c3da0940ee0f72ba56cbca2271f500`; `package.json` entry `"shacl-engine": "github:rdf-ext/shacl-engine#ce39d07eb9c3da0940ee0f72ba56cbca2271f500"`. Never a moving branch ref. `rdf-ext` at `^2.5.1`.
- **The SHACL library is imported in exactly one file:** `src/lws/shacl.js`. No other file imports `shacl-engine`.
- **`describedby` predicate IRI (the stored constraint triple):** `http://www.w3.org/2007/05/powder-s#describedby` (POWDER-DR, the RDF form of the `describedby` link relation Solid §4.3.2 cites). One token across `.meta` (RDF), Link headers, and future linkset/Type-Search.
- **Status codes (LWS-native, from `lws10-core/Operations/rest-table.md`):** Violation → `400` + `application/problem+json` (RFC 9457). Admit+advisory → `200` (update) / `201` (create) with advisory body. Clean → unchanged (`204`/`201`). Never `422`. Never the RFC-9111-obsolete `Warning` header.
- **Round-1 store deviation (deliberate):** the spec frames the constraint as a `describedby` link in the resource's **linkset**. The fork's linkset is generated read-only (mutation is a deferred L2 carryover), so round 1 **stores and reads the constraint from the target's `.meta`** (JSON-LD on disk — client-writable, already served). The token (`describedby` → shape) is identical, so it surfaces in the linkset unchanged once linkset mutation lands. Surfacing-in-linkset + `Prefer: set-linkset` + PATCH-linkset + PATCH-body validation are **out of scope** here (Task 8 notes them).
- **TDD:** every task is failing-test → run-red → implement → run-green → commit.

---

## File Structure

- `src/lws/shacl.js` (new) — the only importer of `shacl-engine`. `validate(dataDataset, shapeDataset) → { conforms, results }` with `results` normalized to `{ severity, message, path, focusNode, value }`.
- `src/lws/admission-rdf.js` (new) — `toDataset(buffer, contentType, baseIri) → DatasetCore` (Turtle/N3 via n3; JSON-LD via JSS `fromJsonLd`→Turtle→n3) and `isRdfBody(contentType) → boolean`.
- `src/lws/constraint.js` (new) — `resolveShapeUrl({ storage, targetMetaPath, containerMetaPath, baseIri }) → string|null`: reads `.meta`, returns the `describedby` shape IRI (target's own first, else container member-rule), or null.
- `src/lws/admission.js` (new) — `admit({ storage, content, contentType, resourceUrl, targetMetaPath, containerMetaPath }) → AdmissionResult`.
- `src/handlers/resource.js` (modify) — call admission in `handlePut` (Task 5) and `handlePost` (Task 6).
- `test/lws-shacl.test.js`, `test/lws-admission-rdf.test.js`, `test/lws-constraint.test.js`, `test/lws-admission.test.js` (new, `node:test`).
- `~/dev/git/LA3D/agents/lws-pod/tests/lws-admission.test.mjs` (new, Vitest live gate) + `Makefile` target (Task 7).

**Types (shared across tasks):**
```
Result          = { severity: 'Violation'|'Warning'|'Info', message: string, path: string|null, focusNode: string|null, value: string|null }
AdmissionResult = { decision: 'pass'|'admit'|'reject',   // 'pass' = no constraint (opt-in miss); 'admit' = conforms or only warn/info; 'reject' = ≥1 Violation
                    shapeUrl: string|null,
                    violations: Result[],                 // severity === 'Violation'
                    advisories: Result[] }                // severity Warning|Info
```

---

## Task 1: SHACL engine seam (`src/lws/shacl.js`)

**Files:**
- Modify: `~/dev/git/LA3D/JavaScriptSolidServer/package.json` (add deps)
- Create: `src/lws/shacl.js`
- Test: `test/lws-shacl.test.js`

**Interfaces:**
- Produces: `validate(dataDataset, shapeDataset) → Promise<{ conforms: boolean, results: Result[] }>`; `datasetFromTurtle(ttl, baseIri) → DatasetCore` (test helper exported for reuse).

- [ ] **Step 1: Add dependencies**

In `package.json` `"dependencies"`, add:
```json
"rdf-ext": "^2.5.1",
"shacl-engine": "github:rdf-ext/shacl-engine#ce39d07eb9c3da0940ee0f72ba56cbca2271f500"
```
Run: `cd ~/dev/git/LA3D/JavaScriptSolidServer && npm install`
Expected: installs without error; `node -e "import('shacl-engine').then(m=>console.log(typeof m.Validator))"` prints `function`.

- [ ] **Step 2: Write the failing test**

```javascript
// test/lws-shacl.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validate, datasetFromTurtle } from '../src/lws/shacl.js';

const SHAPE = `
@prefix sh: <http://www.w3.org/ns/shacl#> .
@prefix ex: <http://ex/> .
ex:S a sh:NodeShape ; sh:targetClass ex:Note ;
  sh:property [ sh:path ex:title ; sh:minCount 1 ;
                sh:severity sh:Violation ; sh:message "title required" ] ;
  sh:property [ sh:path ex:desc  ; sh:minCount 1 ;
                sh:severity sh:Info ; sh:message "consider a description" ] .`;
const GOOD = `@prefix ex: <http://ex/> . ex:n a ex:Note ; ex:title "t" ; ex:desc "d" .`;
const BAD  = `@prefix ex: <http://ex/> . ex:n a ex:Note ; ex:desc "d" .`;        // missing title
const INFO = `@prefix ex: <http://ex/> . ex:n a ex:Note ; ex:title "t" .`;       // missing desc (Info)

test('validate: conforming graph → conforms true, no results', async () => {
  const r = await validate(datasetFromTurtle(GOOD, 'http://ex/'), datasetFromTurtle(SHAPE, 'http://ex/'));
  assert.equal(r.conforms, true);
  assert.equal(r.results.length, 0);
});

test('validate: missing required → Violation result with message+path', async () => {
  const r = await validate(datasetFromTurtle(BAD, 'http://ex/'), datasetFromTurtle(SHAPE, 'http://ex/'));
  assert.equal(r.conforms, false);
  const v = r.results.find(x => x.severity === 'Violation');
  assert.ok(v, 'has a Violation');
  assert.equal(v.message, 'title required');
  assert.equal(v.path, 'http://ex/title');
});

test('validate: missing optional → Info severity, still reported', async () => {
  const r = await validate(datasetFromTurtle(INFO, 'http://ex/'), datasetFromTurtle(SHAPE, 'http://ex/'));
  const i = r.results.find(x => x.severity === 'Info');
  assert.ok(i, 'has an Info');
  assert.equal(i.message, 'consider a description');
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd ~/dev/git/LA3D/JavaScriptSolidServer && node --test test/lws-shacl.test.js`
Expected: FAIL — `Cannot find module '../src/lws/shacl.js'`.

- [ ] **Step 4: Implement `src/lws/shacl.js`**

```javascript
// src/lws/shacl.js
// The ONLY importer of shacl-engine (pinned to the 1.2 SHA). If the 1.2 API
// drifts, fix it here — admission code stays engine-agnostic.
import rdf from 'rdf-ext';
import { Parser } from 'n3';
import { Validator } from 'shacl-engine';

const SH = 'http://www.w3.org/ns/shacl#';

export function datasetFromTurtle(ttl, baseIri) {
  return rdf.dataset(new Parser({ baseIRI: baseIri }).parse(ttl));
}

// Normalize a 1.2 result to our stable shape. The 1.2 refactor reworked the
// report object; these accessors are pinned by lws-shacl.test.js. If a field
// is missing, `node --test` will show it — adjust the accessor here only.
function norm(r) {
  const sev = (r.severity?.value || SH + 'Violation').split('#')[1] || 'Violation';
  const msg = Array.isArray(r.message) ? (r.message[0]?.value ?? r.message[0]) : (r.message?.value ?? r.message);
  return {
    severity: sev,                                   // 'Violation' | 'Warning' | 'Info'
    message: msg || 'constraint violation',
    path: r.path?.value ?? null,
    focusNode: r.focusNode?.value ?? null,
    value: r.value?.value ?? null,
  };
}

export async function validate(dataDataset, shapeDataset) {
  const validator = new Validator(shapeDataset, { factory: rdf });
  const report = await validator.validate({ dataset: dataDataset });
  const results = (report.results || []).map(norm);
  return { conforms: report.conforms === true, results };
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `node --test test/lws-shacl.test.js`
Expected: PASS (3 tests). If a `norm()` accessor is wrong, add `console.log(report.results[0])` temporarily to read the 1.2 field names, fix `norm`, re-run.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json src/lws/shacl.js test/lws-shacl.test.js
git commit -m "feat(lws): SHACL engine seam pinned to shacl-engine 1.2 (ce39d07)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: RDF dataset helper (`src/lws/admission-rdf.js`)

Turns request/stored bytes into a dataset the seam can validate. Stored RDF in JSS is JSON-LD on disk; Turtle/N3 arrive on PUT when conneg is on. Both routes funnel through n3 (JSON-LD → Turtle via JSS `fromJsonLd`, then n3-parse).

**Files:**
- Create: `src/lws/admission-rdf.js`
- Test: `test/lws-admission-rdf.test.js`

**Interfaces:**
- Consumes: `datasetFromTurtle` (Task 1); `fromJsonLd`, `RDF_TYPES` from `../rdf/conneg.js`.
- Produces: `isRdfBody(contentType) → boolean`; `toDataset(buffer, contentType, baseIri) → Promise<DatasetCore>`.

- [ ] **Step 1: Write the failing test**

```javascript
// test/lws-admission-rdf.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toDataset, isRdfBody } from '../src/lws/admission-rdf.js';

const B = 'http://localhost:3000/alice/';

test('isRdfBody: turtle and json-ld are RDF, octet-stream is not', () => {
  assert.equal(isRdfBody('text/turtle'), true);
  assert.equal(isRdfBody('application/ld+json'), true);
  assert.equal(isRdfBody('application/octet-stream'), false);
  assert.equal(isRdfBody(''), false);
});

test('toDataset: parses turtle into quads', async () => {
  const ds = await toDataset(Buffer.from('@prefix ex: <http://ex/> . ex:a ex:b ex:c .'), 'text/turtle', B);
  assert.equal([...ds].length, 1);
});

test('toDataset: parses json-ld into quads', async () => {
  const jsonld = JSON.stringify({ '@id': 'http://ex/a', 'http://ex/b': { '@id': 'http://ex/c' } });
  const ds = await toDataset(Buffer.from(jsonld), 'application/ld+json', B);
  assert.equal([...ds].length, 1);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/lws-admission-rdf.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/lws/admission-rdf.js`**

```javascript
// src/lws/admission-rdf.js
import { datasetFromTurtle } from './shacl.js';
import { fromJsonLd, RDF_TYPES } from '../rdf/conneg.js';

const main = ct => (ct || '').split(';')[0].trim().toLowerCase();

export function isRdfBody(contentType) {
  const t = main(contentType);
  return t === RDF_TYPES.TURTLE || t === RDF_TYPES.N3 || t === RDF_TYPES.JSON_LD || t === 'application/json';
}

// Buffer (any accepted RDF media type) → RDF/JS dataset. JSON-LD is converted
// to Turtle via JSS's own serializer (no new JSON-LD parser dep), then n3-parsed.
export async function toDataset(buffer, contentType, baseIri) {
  const t = main(contentType);
  if (t === RDF_TYPES.TURTLE || t === RDF_TYPES.N3) {
    return datasetFromTurtle(buffer.toString('utf8'), baseIri);
  }
  const jsonLd = JSON.parse(buffer.toString('utf8'));
  const ttl = await fromJsonLd(jsonLd, RDF_TYPES.TURTLE, baseIri, true);
  return datasetFromTurtle(typeof ttl === 'string' ? ttl : String(ttl), baseIri);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/lws-admission-rdf.test.js`
Expected: PASS (3 tests). If `fromJsonLd` returns a non-string, the `String(ttl)` guard covers it; if it needs `connegEnabled` differently, confirm its signature in `src/rdf/conneg.js:174` and adjust the 4th arg.

- [ ] **Step 5: Commit**

```bash
git add src/lws/admission-rdf.js test/lws-admission-rdf.test.js
git commit -m "feat(lws): RDF dataset helper for admission (turtle + json-ld → dataset)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: Constraint resolution from `.meta` (`src/lws/constraint.js`)

Reads the target's `.meta` (self-constraint) and, failing that, the container's `.meta` (member-rule) for a `describedby` shape IRI.

**Files:**
- Create: `src/lws/constraint.js`
- Test: `test/lws-constraint.test.js`

**Interfaces:**
- Consumes: `toDataset` (Task 2); a `storage`-shaped object with `async read(path)` and `async exists(path)`.
- Produces: `resolveShapeUrl({ storage, targetMetaPath, containerMetaPath, baseIri }) → Promise<string|null>`.

- [ ] **Step 1: Write the failing test**

```javascript
// test/lws-constraint.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveShapeUrl } from '../src/lws/constraint.js';

const DESCRIBEDBY = 'http://www.w3.org/2007/05/powder-s#describedby';
// .meta is JSON-LD on disk: <subject> describedby <shape>
const metaJson = (subject, shape) => Buffer.from(JSON.stringify({
  '@id': subject, [DESCRIBEDBY]: { '@id': shape },
}));
const fakeStorage = (files) => ({
  async exists(p) { return p in files; },
  async read(p) { if (!(p in files)) throw new Error('ENOENT'); return files[p]; },
});

test('resolveShapeUrl: target .meta declares describedby → returns shape', async () => {
  const s = fakeStorage({ '/alice/x.meta': metaJson('http://h/alice/x', 'http://h/shapes/X.ttl') });
  const got = await resolveShapeUrl({ storage: s, targetMetaPath: '/alice/x.meta',
    containerMetaPath: '/alice/.meta', baseIri: 'http://h/alice/x' });
  assert.equal(got, 'http://h/shapes/X.ttl');
});

test('resolveShapeUrl: falls back to container .meta member-rule', async () => {
  const s = fakeStorage({ '/alice/.meta': metaJson('http://h/alice/', 'http://h/shapes/Member.ttl') });
  const got = await resolveShapeUrl({ storage: s, targetMetaPath: '/alice/new.meta',
    containerMetaPath: '/alice/.meta', baseIri: 'http://h/alice/' });
  assert.equal(got, 'http://h/shapes/Member.ttl');
});

test('resolveShapeUrl: no .meta anywhere → null (opt-in miss)', async () => {
  const got = await resolveShapeUrl({ storage: fakeStorage({}), targetMetaPath: '/alice/x.meta',
    containerMetaPath: '/alice/.meta', baseIri: 'http://h/alice/x' });
  assert.equal(got, null);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/lws-constraint.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/lws/constraint.js`**

```javascript
// src/lws/constraint.js
import { toDataset } from './admission-rdf.js';

const DESCRIBEDBY = 'http://www.w3.org/2007/05/powder-s#describedby';

async function describedbyFrom(storage, metaPath, baseIri) {
  if (!(await storage.exists(metaPath))) return null;
  let buf;
  try { buf = await storage.read(metaPath); } catch { return null; }
  const ds = await toDataset(buf, 'application/ld+json', baseIri);
  for (const q of ds) if (q.predicate.value === DESCRIBEDBY) return q.object.value;
  return null;
}

// Target's own .meta wins (self-constraint); else the container's .meta
// (member-rule for a newly created resource). null = unconstrained → pass through.
export async function resolveShapeUrl({ storage, targetMetaPath, containerMetaPath, baseIri }) {
  return (await describedbyFrom(storage, targetMetaPath, baseIri))
      ?? (await describedbyFrom(storage, containerMetaPath, baseIri));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/lws-constraint.test.js`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lws/constraint.js test/lws-constraint.test.js
git commit -m "feat(lws): resolve describedby shape from target/container .meta

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: Admission engine (`src/lws/admission.js`)

Orchestrates resolve → load shape → validate → partition severities → decide.

**Files:**
- Create: `src/lws/admission.js`
- Test: `test/lws-admission.test.js`

**Interfaces:**
- Consumes: `resolveShapeUrl` (Task 3), `toDataset`/`isRdfBody` (Task 2), `validate` (Task 1); a `storage` with `read`/`exists`; a `shapeUrlToPath(url) → storagePath` mapper passed in (the handler supplies it).
- Produces: `admit({ storage, content, contentType, resourceUrl, targetMetaPath, containerMetaPath, shapeUrlToPath }) → Promise<AdmissionResult>` (type in File Structure).

- [ ] **Step 1: Write the failing test**

```javascript
// test/lws-admission.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { admit } from '../src/lws/admission.js';

const DESCRIBEDBY = 'http://www.w3.org/2007/05/powder-s#describedby';
const SHAPE = `
@prefix sh: <http://www.w3.org/ns/shacl#> . @prefix ex: <http://ex/> .
ex:S a sh:NodeShape ; sh:targetClass ex:Note ;
  sh:property [ sh:path ex:title ; sh:minCount 1 ; sh:severity sh:Violation ; sh:message "title required" ] ;
  sh:property [ sh:path ex:desc ; sh:minCount 1 ; sh:severity sh:Info ; sh:message "add a description" ] .`;
const metaJson = (s, shape) => Buffer.from(JSON.stringify({ '@id': s, [DESCRIBEDBY]: { '@id': shape } }));
const storage = () => ({
  files: {
    '/alice/x.meta': metaJson('http://h/alice/x', 'http://h/shapes/X'),
    '/shapes/X': Buffer.from(SHAPE),                       // shape stored as turtle for the test
  },
  async exists(p) { return p in this.files; },
  async read(p) { if (!(p in this.files)) throw new Error('ENOENT'); return this.files[p]; },
});
const opts = (content) => ({
  storage: storage(), content, contentType: 'text/turtle', resourceUrl: 'http://h/alice/x',
  targetMetaPath: '/alice/x.meta', containerMetaPath: '/alice/.meta',
  shapeUrlToPath: (u) => '/' + u.split('/h/')[1],          // http://h/shapes/X → /shapes/X
});
const TTL = (body) => Buffer.from(`@prefix ex: <http://ex/> . <http://h/alice/x> a ex:Note ${body} .`);

test('admit: conforming → admit, no violations/advisories', async () => {
  const r = await admit(opts(TTL('; ex:title "t" ; ex:desc "d"')));
  assert.equal(r.decision, 'admit');
  assert.equal(r.violations.length, 0);
  assert.equal(r.advisories.length, 0);
});

test('admit: missing required → reject with violation', async () => {
  const r = await admit(opts(TTL('; ex:desc "d"')));
  assert.equal(r.decision, 'reject');
  assert.equal(r.violations[0].message, 'title required');
  assert.equal(r.shapeUrl, 'http://h/shapes/X');
});

test('admit: missing optional → admit but advisory carries Info', async () => {
  const r = await admit(opts(TTL('; ex:title "t"')));
  assert.equal(r.decision, 'admit');
  assert.equal(r.advisories[0].severity, 'Info');
});

test('admit: no .meta → pass (opt-in miss), no validation', async () => {
  const o = opts(TTL('; ex:title "t"')); o.storage.files = {};
  const r = await admit(o);
  assert.equal(r.decision, 'pass');
  assert.equal(r.shapeUrl, null);
});

test('admit: non-RDF body → pass without validation', async () => {
  const o = opts(Buffer.from('\\x89PNG')); o.contentType = 'image/png';
  const r = await admit(o);
  assert.equal(r.decision, 'pass');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/lws-admission.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/lws/admission.js`**

```javascript
// src/lws/admission.js
import { resolveShapeUrl } from './constraint.js';
import { toDataset, isRdfBody } from './admission-rdf.js';
import { validate } from './shacl.js';

const PASS = { decision: 'pass', shapeUrl: null, violations: [], advisories: [] };

export async function admit({ storage, content, contentType, resourceUrl,
                              targetMetaPath, containerMetaPath, shapeUrlToPath }) {
  if (!isRdfBody(contentType)) return PASS;                                  // bytes are trusted
  const shapeUrl = await resolveShapeUrl({ storage, targetMetaPath, containerMetaPath, baseIri: resourceUrl });
  if (!shapeUrl) return PASS;                                               // opt-in miss

  const shapeBuf = await storage.read(shapeUrlToPath(shapeUrl));
  const shapeDs = await toDataset(shapeBuf, 'application/ld+json', shapeUrl); // shapes stored as JSON-LD on disk
  const dataDs = await toDataset(content, contentType, resourceUrl);
  const { results } = await validate(dataDs, shapeDs);

  const violations = results.filter(r => r.severity === 'Violation');
  const advisories = results.filter(r => r.severity !== 'Violation');
  return {
    decision: violations.length ? 'reject' : 'admit',
    shapeUrl, violations, advisories,
  };
}
```

Note: the test stores the shape as Turtle but loads it with `contentType: 'application/ld+json'`. `toDataset` keys off the *passed* content type — in the test the shape is Turtle, so the test passes `text/turtle`? It does not: fix by having `admit` detect shape media type. **Simplest correct rule:** shapes on a live pod are JSON-LD on disk, so production passes `application/ld+json`; the unit test stores Turtle, so make the seam tolerant: in Step 1 the shape file is Turtle — change the `admit` shape-load line to sniff: if the buffer starts with `{` treat as JSON-LD else Turtle.

- [ ] **Step 3a: Make shape loading media-type tolerant**

Replace the shape-load lines in `admit` with:
```javascript
  const shapeBuf = await storage.read(shapeUrlToPath(shapeUrl));
  const shapeCt = shapeBuf.toString('utf8').trimStart().startsWith('{') ? 'application/ld+json' : 'text/turtle';
  const shapeDs = await toDataset(shapeBuf, shapeCt, shapeUrl);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/lws-admission.test.js`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lws/admission.js test/lws-admission.test.js
git commit -m "feat(lws): admission engine — resolve, validate, partition severities

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: Wire admission into `handlePut`

Gate on `request.lwsEnabled`, run `admit` immediately before `storage.write`. Violation → `400` problem+json; advisory → admit + body; always add the `describedby` Link.

**Files:**
- Modify: `src/handlers/resource.js` (inside `handlePut`, around line 1170 — the block just before `const success = await storage.write(...)`)
- Test: `test/lws-admission-put.test.js`

**Interfaces:**
- Consumes: `admit` (Task 4). Needs a `describedby` problem-builder; add it inline.
- Produces: the wired `handlePut` behavior; a helper `problemJson({ shapeUrl, violations, instance })` (local to the handler, not exported).

- [ ] **Step 1: Write the failing integration test**

This test imports the app the same way the existing conformance tests do. Confirm the bootstrap helper used by `test/lws-conformance.test.js` (e.g. `startServer`/`makeApp`) and reuse it verbatim.

```javascript
// test/lws-admission-put.test.js
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startTestServer } from './helpers/server.js';   // ← use the SAME helper the lws-conformance test uses

let srv, base, bearer;
before(async () => { ({ srv, base, bearer } = await startTestServer({ lws: true })); });
after(async () => { await srv.close(); });

const SHAPE = `@prefix sh: <http://www.w3.org/ns/shacl#> . @prefix ex: <http://ex/> .
ex:S a sh:NodeShape ; sh:targetClass ex:Note ;
  sh:property [ sh:path ex:title ; sh:minCount 1 ; sh:severity sh:Violation ; sh:message "title required" ] .`;
const auth = { authorization: `Bearer ${bearer}` };

test('PUT into a container with describedby member-rule: bad write → 400 problem+json', async () => {
  // provision: shape resource + container .meta with describedby member-rule
  await fetch(`${base}/alice/shapes/Note`, { method: 'PUT', headers: { ...auth, 'content-type': 'text/turtle' }, body: SHAPE });
  await fetch(`${base}/alice/notes/.meta`, { method: 'PUT', headers: { ...auth, 'content-type': 'application/ld+json' },
    body: JSON.stringify({ '@id': `${base}/alice/notes/`,
      'http://www.w3.org/2007/05/powder-s#describedby': { '@id': `${base}/alice/shapes/Note` } }) });

  const bad = await fetch(`${base}/alice/notes/n1`, { method: 'PUT',
    headers: { ...auth, 'content-type': 'text/turtle' },
    body: `@prefix ex: <http://ex/> . <${base}/alice/notes/n1> a ex:Note .` });   // no title
  assert.equal(bad.status, 400);
  assert.match(bad.headers.get('content-type') || '', /application\\/problem\\+json/);
  assert.match(bad.headers.get('link') || '', /rel="describedby"/);
  const body = await bad.json();
  assert.equal(body.status, 400);
  assert.ok(body.violations?.some(v => v.message === 'title required'));
});

test('PUT conforming → 201 and the resource is stored', async () => {
  const ok = await fetch(`${base}/alice/notes/n2`, { method: 'PUT',
    headers: { ...auth, 'content-type': 'text/turtle' },
    body: `@prefix ex: <http://ex/> . <${base}/alice/notes/n2> a ex:Note ; ex:title "hi" .` });
  assert.ok(ok.status === 201 || ok.status === 204);
  assert.match(ok.headers.get('link') || '', /rel="describedby"/);
});

test('negative control: same bad PUT with lws OFF → normal write (no 400)', async () => {
  const { srv: s2, base: b2, bearer: t2 } = await startTestServer({ lws: false });
  const r = await fetch(`${b2}/alice/notes/n3`, { method: 'PUT',
    headers: { authorization: `Bearer ${t2}`, 'content-type': 'text/turtle' },
    body: `@prefix ex: <http://ex/> . <${b2}/alice/notes/n3> a ex:Note .` });
  assert.ok(r.status === 201 || r.status === 204);
  await s2.close();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/lws-admission-put.test.js`
Expected: FAIL — bad PUT returns `201`, not `400` (admission not wired).

- [ ] **Step 3: Add imports + problem builder at the top of `src/handlers/resource.js`**

```javascript
import { admit } from '../lws/admission.js';

// RFC 9457 problem+json for a constraint violation, extended with the SHACL results.
function constraintProblem({ shapeUrl, violations, instance }) {
  return {
    type: 'https://www.w3.org/ns/lws#ShapeViolation',
    title: 'Resource does not conform to its declared shape',
    status: 400,
    detail: `${violations.length} violation(s) against ${shapeUrl}`,
    instance,
    describedby: shapeUrl,
    violations,   // [{ severity, message, path, focusNode, value }]
  };
}

// Map a resource/shape URL to its on-disk storage path (mirror getRequestPaths).
const urlToStoragePath = (request, url) => new URL(url).pathname;
```

- [ ] **Step 4: Insert the admission block in `handlePut`**

Immediately before `const success = await storage.write(storagePath, content);` (≈ line 1170), insert:

```javascript
  // L3 SHACL admission — opt-in, --lws-gated. `content` here is the post-conneg
  // body (JSON-LD or, with conneg off, JSON-LD/JSON; Turtle already converted above).
  if (request.lwsEnabled) {
    const containerMetaPath = urlPath.slice(0, urlPath.lastIndexOf('/') + 1) + '.meta';
    const result = await admit({
      storage,
      content,
      contentType: request.headers['content-type'] || '',
      resourceUrl,
      targetMetaPath: urlPath + '.meta',
      containerMetaPath,
      shapeUrlToPath: (u) => urlToStoragePath(request, u),
    });
    if (result.shapeUrl) reply.header('Link', `<${result.shapeUrl}>; rel="describedby"`);
    if (result.decision === 'reject') {
      reply.header('content-type', 'application/problem+json');
      return reply.code(400).send(constraintProblem({
        shapeUrl: result.shapeUrl, violations: result.violations, instance: resourceUrl,
      }));
    }
    if (result.advisories.length) request.__lwsAdvisories = result.advisories;
  }
```

Then change the final success return of `handlePut` from:
```javascript
  return reply.code(existed ? 204 : 201).send();
```
to:
```javascript
  if (request.__lwsAdvisories) {
    // RFC 9111 obsoletes the Warning header → advisories ride the success body.
    return reply.code(existed ? 200 : 201).send({ advisories: request.__lwsAdvisories });
  }
  return reply.code(existed ? 204 : 201).send();
```

Note: `content` has already been normalized to a Buffer and (when conneg is on) Turtle→JSON-LD converted by this point, so `contentType` may say `text/turtle` while `content` is JSON-LD. Pass the **post-conversion** signal: set `contentType: connegEnabled && (inputType===TURTLE||N3) ? 'application/ld+json' : (request.headers['content-type']||'')`. Use the `inputType`/`connegEnabled` locals already computed above the write.

- [ ] **Step 4a: Correct the contentType passed to `admit`**

In the inserted block, replace the `contentType:` line with:
```javascript
      contentType: (connegEnabled && (inputType === RDF_TYPES.TURTLE || inputType === RDF_TYPES.N3))
        ? RDF_TYPES.JSON_LD : (request.headers['content-type'] || ''),
```
Confirm `RDF_TYPES` is imported in `resource.js` (it is — used above); `inputType` and `connegEnabled` are in scope.

- [ ] **Step 5: Run test to verify it passes**

Run: `node --test test/lws-admission-put.test.js`
Expected: PASS (3 tests, including the lws-OFF negative control).

- [ ] **Step 6: Run the full L1/L2 suite — prove nothing regressed**

Run: `node --test 'test/lws-*.test.js'`
Expected: all green (L1 container, L2 linkset/storage-description, conformance, plus the new admission tests).

- [ ] **Step 7: Commit**

```bash
git add src/handlers/resource.js test/lws-admission-put.test.js
git commit -m "feat(lws): wire SHACL admission into handlePut (400 problem+json, advisories)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 6: Member-rule on `handlePost` (create-into-container)

`POST` creates a new resource in a container; the container's `.meta` member-rule applies. Same `admit` call; the target has no own `.meta` yet, so resolution falls through to the container rule (Task 3 already supports this).

**Files:**
- Modify: `src/handlers/resource.js` (`handlePost`)
- Test: `test/lws-admission-post.test.js`

**Interfaces:**
- Consumes: `admit`, `constraintProblem`, `urlToStoragePath` (Task 5).

- [ ] **Step 1: Write the failing test**

```javascript
// test/lws-admission-post.test.js
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startTestServer } from './helpers/server.js';

let srv, base, bearer;
before(async () => { ({ srv, base, bearer } = await startTestServer({ lws: true })); });
after(async () => { await srv.close(); });
const auth = { authorization: `Bearer ${bearer}` };
const SHAPE = `@prefix sh: <http://www.w3.org/ns/shacl#> . @prefix ex: <http://ex/> .
ex:S a sh:NodeShape ; sh:targetClass ex:Note ;
  sh:property [ sh:path ex:title ; sh:minCount 1 ; sh:severity sh:Violation ; sh:message "title required" ] .`;

test('POST a non-conforming member into a constrained container → 400', async () => {
  await fetch(`${base}/alice/shapes/Note`, { method: 'PUT', headers: { ...auth, 'content-type': 'text/turtle' }, body: SHAPE });
  await fetch(`${base}/alice/feed/.meta`, { method: 'PUT', headers: { ...auth, 'content-type': 'application/ld+json' },
    body: JSON.stringify({ '@id': `${base}/alice/feed/`,
      'http://www.w3.org/2007/05/powder-s#describedby': { '@id': `${base}/alice/shapes/Note` } }) });
  const r = await fetch(`${base}/alice/feed/`, { method: 'POST',
    headers: { ...auth, 'content-type': 'text/turtle', slug: 'p1' },
    body: `@prefix ex: <http://ex/> . <> a ex:Note .` });          // no title
  assert.equal(r.status, 400);
  assert.match(r.headers.get('content-type') || '', /application\\/problem\\+json/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/lws-admission-post.test.js`
Expected: FAIL — POST returns `201`.

- [ ] **Step 3: Insert the admission block in `handlePost`**

Locate the `storage.write` (or `storage.createContainer`) call in `handlePost`. Immediately before the member is written, insert the same block as Task 5 Step 4, with these path differences (the member URL is the server-assigned target):
```javascript
  if (request.lwsEnabled) {
    const memberUrlPath = /* the computed new member urlPath */;
    const memberUrl = /* resourceUrl of the new member */;
    const containerMetaPath = (request.urlPath.endsWith('/') ? request.urlPath : request.urlPath + '/') + '.meta';
    const result = await admit({
      storage, content,
      contentType: (connegEnabled && (inputType === RDF_TYPES.TURTLE || inputType === RDF_TYPES.N3)) ? RDF_TYPES.JSON_LD : (request.headers['content-type'] || ''),
      resourceUrl: memberUrl,
      targetMetaPath: memberUrlPath + '.meta',
      containerMetaPath,
      shapeUrlToPath: (u) => urlToStoragePath(request, u),
    });
    if (result.shapeUrl) reply.header('Link', `<${result.shapeUrl}>; rel="describedby"`);
    if (result.decision === 'reject') {
      reply.header('content-type', 'application/problem+json');
      return reply.code(400).send(constraintProblem({ shapeUrl: result.shapeUrl, violations: result.violations, instance: memberUrl }));
    }
    if (result.advisories.length) request.__lwsAdvisories = result.advisories;
  }
```
Use the existing local variables `handlePost` computes for the new member's path/URL and `content`/`inputType`/`connegEnabled` (mirror Task 5; if `handlePost` names them differently, adapt the names — do not introduce new computations).

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/lws-admission-post.test.js`
Expected: PASS.

- [ ] **Step 5: Run full lws suite**

Run: `node --test 'test/lws-*.test.js'`
Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add src/handlers/resource.js test/lws-admission-post.test.js
git commit -m "feat(lws): apply container member-rule admission on POST

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 7: Live-pod gate in `lws-pod` (`make test-l3`)

Mirror `make test-lws`: build the fork pod from the new branch, run a Vitest spec that exercises admission end-to-end over HTTP, self-skip on a non-`--lws` pod.

**Files:**
- Create: `~/dev/git/LA3D/agents/lws-pod/tests/lws-admission.test.mjs`
- Modify: `~/dev/git/LA3D/agents/lws-pod/Makefile` (add `test-l3`); `Dockerfile.fork` `JSS_GIT_REF` default → the admission branch HEAD
- Test: the spec itself

- [ ] **Step 1: Write the Vitest spec**

```javascript
// tests/lws-admission.test.mjs  (lws-pod repo)
import { describe, it, expect, beforeAll } from 'vitest';
import { headlessBearer } from './helpers.mjs';   // reuse the existing helper from tests/

const POD = process.env.POD_URL || 'https://pod.vardeman.me';
let auth, lws;
beforeAll(async () => {
  auth = await headlessBearer(POD);
  const probe = await fetch(`${POD}/.well-known/lws-storage`, { headers: { accept: 'application/lws+json' } });
  lws = probe.ok;                                  // self-skip on a non-lws pod
});

describe.skipIf(!process.env.RUN_L3)('L3 SHACL admission (live)', () => {
  it('rejects a non-conforming write with 400 problem+json + describedby Link', async () => {
    const h = { Authorization: `Bearer ${auth}` };
    await fetch(`${POD}/alice/shapes/Note`, { method: 'PUT', headers: { ...h, 'content-type': 'text/turtle' },
      body: `@prefix sh: <http://www.w3.org/ns/shacl#> . @prefix ex: <http://ex/> .
        ex:S a sh:NodeShape ; sh:targetClass ex:Note ; sh:property [ sh:path ex:title ; sh:minCount 1 ;
        sh:severity sh:Violation ; sh:message "title required" ] .` });
    await fetch(`${POD}/alice/l3/.meta`, { method: 'PUT', headers: { ...h, 'content-type': 'application/ld+json' },
      body: JSON.stringify({ '@id': `${POD}/alice/l3/`, 'http://www.w3.org/2007/05/powder-s#describedby': { '@id': `${POD}/alice/shapes/Note` } }) });
    const bad = await fetch(`${POD}/alice/l3/x`, { method: 'PUT', headers: { ...h, 'content-type': 'text/turtle' },
      body: `@prefix ex: <http://ex/> . <${POD}/alice/l3/x> a ex:Note .` });
    expect(bad.status).toBe(400);
    expect(bad.headers.get('content-type')).toMatch(/application\\/problem\\+json/);
    expect(bad.headers.get('link')).toMatch(/rel="describedby"/);
  });
});
```

- [ ] **Step 2: Add the Makefile target**

```makefile
test-l3: ## L3 admission live gate (needs the --lws fork pod up)
	RUN_L3=1 POD_URL=https://pod.vardeman.me npx vitest run tests/lws-admission.test.mjs
```

- [ ] **Step 3: Point `Dockerfile.fork` at the admission branch and bring up the rig**

Run:
```bash
cd ~/dev/git/LA3D/agents/lws-pod
JSS_GIT_REF=la3d/lws-admission make up-fork-tls
make test-l3
```
Expected: the admission test passes (1 it); other suites skip cleanly.

- [ ] **Step 4: Commit (in lws-pod repo)**

```bash
cd ~/dev/git/LA3D/agents/lws-pod
git add tests/lws-admission.test.mjs Makefile Dockerfile.fork
git commit -m "test(lws): L3 admission live-pod gate (make test-l3)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 8: Merge + docs

- [ ] **Step 1: Merge the fork branch**

```bash
cd ~/dev/git/LA3D/JavaScriptSolidServer
node --test 'test/*.test.js'        # full fork suite green
git checkout la3d/lws && git merge --no-ff la3d/lws-admission -m "merge: L3 SHACL admission"
```

- [ ] **Step 2: Update `lws-pod` state docs**

Edit `FOLLOWUP.md`: add an "L3 DONE/MERGED" block (mirror the L2 block) — what shipped, the `.meta`-store round-1 deviation, and the deferred follow-ons below. Update `docs/ROADMAP.md`'s status banner (L1+L2+L3 shipped; Plan 2 next).

- [ ] **Step 3: Commit docs**

```bash
git add FOLLOWUP.md docs/ROADMAP.md
git commit -m "docs: L3 SHACL admission merged to la3d/lws

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

**Deferred follow-ons (record in FOLLOWUP, do not build here):**
- Surface the `.meta` `describedby` in the *generated linkset* (`src/lws/linkset.js` caller) so Type-Search can filter on it — realizes the claim→warranty synergy. Depends on nothing; small, but its own task.
- `Prefer: set-linkset` atomic declare+write, PATCH-linkset client mutation (depends on the deferred L2 linkset-mutation carryover).
- PATCH-body (N3-Patch) post-state validation — validate the resulting graph, not the patch.
- `ldp:constrainedBy` co-emission on the `400` for Solid-client interop.
- Shape-result caching (the old proxy's `shapeCache`/`shapeDsCache`, with the unbounded-growth fix).
- A second worked profile (e.g. an RO-Crate base shape) as a standalone generality proof.

---

## Self-Review

**Spec coverage** (against `2026-06-30-lws-L3-shacl-admission-design.md`):
- §2 per-URI constraint, `describedby` → Tasks 3 (resolve), 5/6 (enforce). ✓ (round-1 store = `.meta`, per the flagged deviation; same `describedby` token.)
- §3 in-process, `--lws`-gated, `src/lws/admission.js` + `src/lws/shacl.js` seam, engine pin `ce39d07` → Tasks 1, 4, 5. ✓
- §4 severity = SHACL `sh:severity`; Violation→reject, Warning/Info→admit+report; report as feedback → Tasks 1 (norm severity), 4 (partition), 5 (problem+json + advisory body). ✓
- §4 response pathway: `400`+problem+json, advisory in success body, `Link rel=describedby`, no `Warning` header, no `422` → Task 5. ✓
- §5 bootstrapping both paths: container member-rule (Task 6) + request-carried `.meta`/self-constraint (Tasks 3, 5). ✓
- §6 Type-Search synergy → deferred surfacing noted (Task 8). ✓ (property realized when describedby hits the linkset; not required for L3 enforcement.)
- §7 profile-neutral, two unrelated shapes through one engine → the engine is shape-agnostic (Tasks 1/4 use only a generic `ex:` shape; no profile code). ✓ A standalone second-profile proof is deferred (Task 8) — the engine carries no profile knowledge, which is the substantive requirement.
- Non-RDF never validated → `isRdfBody` guard, Task 2/4. ✓

**Placeholder scan:** no TBD/TODO; every code step shows code; the one genuinely-unknowable detail (1.2 `report.results` field names) is pinned by an executable test (Task 1) with an explicit fallback (`console.log` the result, adjust `norm`). ✓

**Type consistency:** `AdmissionResult`/`Result` shapes are defined once (File Structure) and used identically in Tasks 4/5/6; `validate` returns `{conforms, results}` (Task 1) consumed in Task 4; `resolveShapeUrl`/`toDataset`/`isRdfBody` signatures match their call sites. ✓

**Two integration unknowns to confirm at execution start (not placeholders — verifications):** (1) the exact name of the test bootstrap helper (`startTestServer`/`makeApp`) used by `test/lws-conformance.test.js` — reuse it verbatim in Tasks 5–6; (2) `handlePost`'s local variable names for the new member path/URL — adapt the Task 6 block to them. Both are "read the neighbor and match," not new design.
