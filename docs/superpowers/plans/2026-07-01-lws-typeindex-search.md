# LWS Search & Type Index (L2.5) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the W3C LWS Search & Type Index services (`/types/index`, `/types/search`) to the JSS fork, backed by server-managed `type` metadata, authorization-filtered per requester.

**Architecture:** `type` is system-managed metadata = intrinsic LWS class ∪ user-defined types captured from `Link: rel="type"` on write and stored in a server-managed sidecar (never the client `.meta`). Two read-only service endpoints walk the store on demand, resolve each resource's types, and filter results through the existing WAC `checkAccess` predicate (reused, never reimplemented). All `--lws`-gated and additive.

**Tech Stack:** Node.js ESM, Fastify, `node:test` + `node:assert/strict`, the fork's `test/helpers.js` harness.

**Design of record:** `docs/superpowers/specs/2026-07-01-lws-typeindex-search-design.md` (W3C-aligned revision).

## Global Constraints

- **Work in the JSS fork**, branch `la3d/lws-typeindex` off `origin/la3d/lws` (@ `1772ed8`). NOT the lws-pod repo, except Task 12 (the live-pod gate).
- **Additive + `--lws`-gated:** every new surface is reachable only when `request.lwsEnabled`. The default LDP path and non-`--lws` behavior MUST stay byte-identical (negative controls required).
- **Never reimplement authorization.** Reuse `checkAccess` from `src/wac/checker.js` as the read filter.
- **`type` is server-managed** — persisted in a server-only sidecar, never in the client `.meta`/Description Resource.
- **CNF is the whole query ceiling:** `(A OR B) AND C`. No nesting/negation/ordering/text-match.
- **LWS namespace:** `https://www.w3.org/ns/lws#`; context `https://www.w3.org/ns/lws/v1`; media type `application/lws+json`.
- **Type-store sidecar suffix:** `.lwstypes` (JSON array of type URIs). Auxiliary suffixes `.acl`, `.meta`, `.lwstypes` and dot-entries are never indexed.
- **Commit after every task.** Test files run via `node --test --test-concurrency=1 'test/*.test.js'`.
- **Fork test data dir is `./data`** (helpers wipe it per run).

## File Structure

- Create `src/lws/type-index.js` — pure: `LWS_NS`, `intrinsicType`, `resourceTypes`, `buildTypeIndex`, `parseTypeFilter`, `matchesTypeFilter`, `isAbsoluteUri`.
- Create `src/lws/type-metadata.js` — server-managed store I/O: `typeStorePath`, `parseTypeLinks`, `captureDeclaredTypes`, `readDeclaredTypes`.
- Create `src/handlers/type-index.js` — `handleTypeIndex`, `handleTypeSearch` (walk + authz + serialize).
- Modify `src/storage/filesystem.js` — add `walkResources`.
- Modify `src/wac/checker.js` — thread an optional per-query ACL cache into `checkAccess` + `findApplicableAcl`.
- Modify `src/lws/linkset.js` — `generateLinkset` `type` = intrinsic ∪ declared.
- Modify `src/handlers/resource.js` (handlePut) + `src/handlers/container.js` (handlePost) — capture `rel="type"` on write; pass declared types to the linkset GET branches.
- Modify `src/server.js` — register the two routes + advertise the two services.
- Create fork tests: `test/lws-type-index-unit.test.js`, `test/lws-type-metadata.test.js`, `test/lws-type-index.test.js`.
- lws-pod repo (Task 12): `tests/lws-typeindex.test.mjs` + Makefile `test-typeindex` target.

---

### Task 1: Branch setup + green baseline

**Files:** none (git + install only)

- [ ] **Step 1: Create the working branch off the L3 integration branch**

```bash
FORK=/Users/cvardema/dev/git/LA3D/agents/JavaScriptSolidServer
git -C "$FORK" fetch origin
git -C "$FORK" worktree add -b la3d/lws-typeindex \
  /Users/cvardema/dev/git/LA3D/agents/lws-pod/.worktree-lws-typeindex origin/la3d/lws
cd /Users/cvardema/dev/git/LA3D/agents/lws-pod/.worktree-lws-typeindex
```

- [ ] **Step 2: Install deps**

Run: `npm ci`
Expected: completes; `node_modules/` present.

- [ ] **Step 3: Confirm the baseline suite is green**

Run: `node --test --test-concurrency=1 'test/*.test.js'`
Expected: all pass (the L3 baseline — ~1053 assertions). If red, STOP and report; do not build on a red baseline.

- [ ] **Step 4: Commit the plan marker** (empty tree change is fine to skip; no commit this task).

*(All subsequent tasks run `cd` into `.worktree-lws-typeindex` first.)*

---

### Task 2: CNF filter core (pure)

**Files:**
- Create: `src/lws/type-index.js`
- Test: `test/lws-type-index-unit.test.js`

**Interfaces:**
- Produces: `parseTypeFilter({ query?, body? }) → string[][]` (CNF: array of OR-groups); `matchesTypeFilter(types: string[], cnf: string[][]) → boolean`; `isAbsoluteUri(s) → boolean`. A `400`-worthy filter throws `FilterError` (a subclass of `Error` with `.status = 400`).

- [ ] **Step 1: Write the failing test**

```js
// test/lws-type-index-unit.test.js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseTypeFilter, matchesTypeFilter, isAbsoluteUri, FilterError } from '../src/lws/type-index.js';

const A = 'https://schema.org/Person';
const B = 'http://xmlns.com/foaf/0.1/Person';
const C = 'https://www.w3.org/ns/lws#DataResource';

describe('CNF type filter', () => {
  it('GET query: comma = OR group, repeated param = AND', () => {
    const q = new URLSearchParams(`type=${A},${B}&type=${C}`);
    assert.deepEqual(parseTypeFilter({ query: q }), [[A, B], [C]]);
  });
  it('POST body: array element = AND, nested array = OR', () => {
    assert.deepEqual(parseTypeFilter({ body: { type: [[A, B], C] } }), [[A, B], [C]]);
  });
  it('no type param → empty CNF (matches everything)', () => {
    assert.deepEqual(parseTypeFilter({ query: new URLSearchParams('') }), []);
    assert.equal(matchesTypeFilter([C], []), true);
  });
  it('matches (A OR B) AND C', () => {
    assert.equal(matchesTypeFilter([A, C], [[A, B], [C]]), true);
    assert.equal(matchesTypeFilter([A], [[A, B], [C]]), false); // missing C group
    assert.equal(matchesTypeFilter([B, C], [[A, B], [C]]), true);
  });
  it('rejects a non-absolute-URI type value with a 400 FilterError', () => {
    assert.throws(() => parseTypeFilter({ query: new URLSearchParams('type=notauri') }),
      (e) => e instanceof FilterError && e.status === 400);
  });
  it('empty/duplicate groups are ignored, not errors', () => {
    const q = new URLSearchParams(`type=${A},,${A}`);
    assert.deepEqual(parseTypeFilter({ query: q }), [[A]]);
  });
  it('isAbsoluteUri', () => {
    assert.equal(isAbsoluteUri(A), true);
    assert.equal(isAbsoluteUri('relative/path'), false);
  });
});
```

- [ ] **Step 2: Run it — expect failure**

Run: `node --test test/lws-type-index-unit.test.js`
Expected: FAIL — cannot find module `../src/lws/type-index.js`.

- [ ] **Step 3: Implement the module**

```js
// src/lws/type-index.js
export const LWS_NS = 'https://www.w3.org/ns/lws#';

export class FilterError extends Error {
  constructor(msg) { super(msg); this.name = 'FilterError'; this.status = 400; }
}

export function isAbsoluteUri(s) {
  if (typeof s !== 'string' || !s) return false;
  try { const u = new URL(s); return !!u.protocol && u.href.includes(':'); }
  catch { return false; }
}

// One OR-group from a comma list; drops empties/dupes; validates absolute URIs.
function group(values) {
  const out = [];
  for (const raw of values) {
    const v = raw.trim();
    if (!v) continue;                              // empty → ignored
    if (!isAbsoluteUri(v)) throw new FilterError(`type value is not an absolute URI: ${v}`);
    if (!out.includes(v)) out.push(v);             // dedupe within group
  }
  return out;
}

// GET query (URLSearchParams) OR POST body ({ type: (string|string[])[] }) → CNF string[][].
export function parseTypeFilter({ query, body } = {}) {
  const cnf = [];
  if (query) {
    for (const param of query.getAll('type')) {
      const g = group(param.split(','));
      if (g.length) cnf.push(g);                   // empty group → ignored
    }
    return cnf;
  }
  if (body && body.type !== undefined) {
    if (!Array.isArray(body.type)) throw new FilterError('body.type must be an array');
    for (const el of body.type) {
      if (typeof el === 'string') { const g = group([el]); if (g.length) cnf.push(g); }
      else if (Array.isArray(el)) { const g = group(el); if (g.length) cnf.push(g); }
      else throw new FilterError('each body.type element must be a string or array of strings');
    }
    return cnf;
  }
  return cnf;                                      // no filter → match all
}

// CNF: every group must have at least one member present in the resource's types.
export function matchesTypeFilter(types, cnf) {
  return cnf.every((g) => g.some((t) => types.includes(t)));
}
```

- [ ] **Step 4: Run tests — expect pass**

Run: `node --test test/lws-type-index-unit.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lws/type-index.js test/lws-type-index-unit.test.js
git commit -m "feat(lws): CNF type-filter core (parse + match)"
```

---

### Task 3: Type resolution + index builder (pure)

**Files:**
- Modify: `src/lws/type-index.js`
- Test: `test/lws-type-index-unit.test.js`

**Interfaces:**
- Produces: `intrinsicType(isDirectory: boolean) → string` (`lws:Container`/`lws:DataResource`); `resourceTypes({ isDirectory, declared: string[] }) → string[]` (intrinsic first, deduped); `buildTypeIndex(typeLists: string[][]) → { '@context', type:'TypeIndex', totalItems, items:[{id}] }`.

- [ ] **Step 1: Add failing tests**

```js
// append to test/lws-type-index-unit.test.js
import { intrinsicType, resourceTypes, buildTypeIndex } from '../src/lws/type-index.js';

describe('type resolution + index', () => {
  it('intrinsicType', () => {
    assert.equal(intrinsicType(true), 'https://www.w3.org/ns/lws#Container');
    assert.equal(intrinsicType(false), 'https://www.w3.org/ns/lws#DataResource');
  });
  it('resourceTypes = intrinsic ∪ declared, deduped, intrinsic first', () => {
    assert.deepEqual(
      resourceTypes({ isDirectory: false, declared: ['https://schema.org/Person'] }),
      ['https://www.w3.org/ns/lws#DataResource', 'https://schema.org/Person']);
    assert.deepEqual(
      resourceTypes({ isDirectory: false, declared: ['https://www.w3.org/ns/lws#DataResource'] }),
      ['https://www.w3.org/ns/lws#DataResource']); // dedupe intrinsic
  });
  it('buildTypeIndex returns distinct types with count', () => {
    const idx = buildTypeIndex([
      ['https://www.w3.org/ns/lws#DataResource', 'https://schema.org/Person'],
      ['https://www.w3.org/ns/lws#DataResource'],
    ]);
    assert.equal(idx.type, 'TypeIndex');
    assert.equal(idx['@context'], 'https://www.w3.org/ns/lws/v1');
    assert.equal(idx.totalItems, 2);
    assert.deepEqual(idx.items.map((i) => i.id).sort(),
      ['https://schema.org/Person', 'https://www.w3.org/ns/lws#DataResource']);
  });
});
```

- [ ] **Step 2: Run — expect failure**

Run: `node --test test/lws-type-index-unit.test.js`
Expected: FAIL — `intrinsicType` not exported.

- [ ] **Step 3: Append implementation to `src/lws/type-index.js`**

```js
const LWS_CONTEXT = 'https://www.w3.org/ns/lws/v1';

export function intrinsicType(isDirectory) {
  return LWS_NS + (isDirectory ? 'Container' : 'DataResource');
}

export function resourceTypes({ isDirectory, declared = [] }) {
  const out = [intrinsicType(isDirectory)];
  for (const t of declared) if (!out.includes(t)) out.push(t);
  return out;
}

export function buildTypeIndex(typeLists) {
  const seen = new Set();
  for (const list of typeLists) for (const t of list) seen.add(t);
  return {
    '@context': LWS_CONTEXT,
    type: 'TypeIndex',
    totalItems: seen.size,
    items: [...seen].map((id) => ({ id })),
  };
}
```

- [ ] **Step 4: Run — expect pass**

Run: `node --test test/lws-type-index-unit.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lws/type-index.js test/lws-type-index-unit.test.js
git commit -m "feat(lws): intrinsic∪declared type resolution + TypeIndex builder"
```

---

### Task 4: `rel="type"` parser + server-managed type store

**Files:**
- Create: `src/lws/type-metadata.js`
- Test: `test/lws-type-metadata.test.js`

**Interfaces:**
- Consumes: the storage module (`src/storage/filesystem.js`) — `exists`, `read`, `write`.
- Produces: `parseTypeLinks(linkHeader: string) → string[]` (absolute URIs with `rel="type"`); `typeStorePath(storagePath: string) → string` (`<storagePath>.lwstypes`); `captureDeclaredTypes(storage, storagePath, typeUris) → Promise<void>` (writes JSON array; no-op if empty); `readDeclaredTypes(storage, storagePath) → Promise<string[]>` (`[]` if absent).

- [ ] **Step 1: Write failing test**

```js
// test/lws-type-metadata.test.js
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs-extra';
import * as storage from '../src/storage/filesystem.js';
import { parseTypeLinks, typeStorePath, captureDeclaredTypes, readDeclaredTypes } from '../src/lws/type-metadata.js';

describe('parseTypeLinks', () => {
  it('extracts rel="type" targets, ignores other rels', () => {
    const h = '<https://schema.org/Person>; rel="type", </alice/>; rel="up", <http://ex/Note>; rel="type"';
    assert.deepEqual(parseTypeLinks(h), ['https://schema.org/Person', 'http://ex/Note']);
  });
  it('ignores non-absolute targets and empty header', () => {
    assert.deepEqual(parseTypeLinks(''), []);
    assert.deepEqual(parseTypeLinks('<relative>; rel="type"'), []);
  });
});

describe('type store round-trip', () => {
  beforeEach(async () => { await fs.emptyDir('./data'); await storage.write('/foo', Buffer.from('x')); });
  it('typeStorePath appends .lwstypes', () => {
    assert.equal(typeStorePath('/alice/foo'), '/alice/foo.lwstypes');
  });
  it('captures and reads back declared types', async () => {
    await captureDeclaredTypes(storage, '/foo', ['https://schema.org/Person']);
    assert.deepEqual(await readDeclaredTypes(storage, '/foo'), ['https://schema.org/Person']);
  });
  it('missing store reads as empty array', async () => {
    assert.deepEqual(await readDeclaredTypes(storage, '/nope'), []);
  });
  it('empty capture writes nothing', async () => {
    await captureDeclaredTypes(storage, '/foo', []);
    assert.equal(await storage.exists(typeStorePath('/foo')), false);
  });
});
```

- [ ] **Step 2: Run — expect failure**

Run: `node --test test/lws-type-metadata.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/lws/type-metadata.js`**

```js
// src/lws/type-metadata.js
// Server-managed `type` metadata (LWS metadata.md: `type` is System-Managed,
// read-only to clients). Stored in a server-only `.lwstypes` sidecar — NOT the
// client-managed .meta/Description Resource.
import { isAbsoluteUri } from './type-index.js';

export function typeStorePath(storagePath) {
  return storagePath + '.lwstypes';
}

// RFC 8288 Link header → absolute URIs whose rel token set includes "type".
export function parseTypeLinks(linkHeader = '') {
  const out = [];
  // Split on commas that separate link-values: "<uri>; params, <uri>; params".
  const parts = linkHeader.split(/,(?=\s*<)/);
  for (const part of parts) {
    const m = part.match(/<([^>]*)>\s*;\s*(.*)$/);
    if (!m) continue;
    const target = m[1].trim();
    const rels = (m[2].match(/rel\s*=\s*"?([^";]+)"?/i) || [])[1];
    if (!rels) continue;
    if (!rels.split(/\s+/).includes('type')) continue;
    if (isAbsoluteUri(target) && !out.includes(target)) out.push(target);
  }
  return out;
}

export async function captureDeclaredTypes(storage, storagePath, typeUris) {
  if (!typeUris || !typeUris.length) return;                 // nothing to persist
  await storage.write(typeStorePath(storagePath), Buffer.from(JSON.stringify(typeUris)));
}

export async function readDeclaredTypes(storage, storagePath) {
  const p = typeStorePath(storagePath);
  if (!(await storage.exists(p))) return [];
  const buf = await storage.read(p);
  if (!buf) return [];
  try { const arr = JSON.parse(buf.toString('utf8')); return Array.isArray(arr) ? arr : []; }
  catch { return []; }
}
```

- [ ] **Step 4: Run — expect pass**

Run: `node --test test/lws-type-metadata.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lws/type-metadata.js test/lws-type-metadata.test.js
git commit -m "feat(lws): rel=type parser + server-managed .lwstypes store"
```

---

### Task 5: Capture declared types on write (handlePut + handlePost)

**Files:**
- Modify: `src/handlers/resource.js` (handlePut, after the `storage.write` at ~`:1184`)
- Modify: `src/handlers/container.js` (handlePost, after the `storage.write` at ~`:157`)
- Test: `test/lws-type-index.test.js` (new integration file)

**Interfaces:**
- Consumes: `captureDeclaredTypes`, `parseTypeLinks`, `typeStorePath` from `src/lws/type-metadata.js`; `readDeclaredTypes` for assertions.

- [ ] **Step 1: Write failing integration test**

```js
// test/lws-type-index.test.js
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startTestServer, stopTestServer, getBaseUrl, createTestPod, getPodToken } from './helpers.js';

const PERSON = 'https://schema.org/Person';

describe('type capture on write', () => {
  let base, token;
  before(async () => { await startTestServer({ lws: true }); base = getBaseUrl(); const p = await createTestPod('alice'); token = p.token; });
  after(async () => { await stopTestServer(); });

  it('PUT with Link rel=type persists the type (visible in the resource linkset)', async () => {
    const url = `${base}/alice/p1`;
    const put = await fetch(url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`,
                 Link: `<${PERSON}>; rel="type"` },
      body: JSON.stringify({ name: 'Alice' }),
    });
    assert.equal(put.status, 201);
    const ls = await fetch(url, { headers: { Accept: 'application/linkset+json', Authorization: `Bearer ${token}` } });
    const body = await ls.json();
    const types = body.linkset[0].type.map((t) => t.href);
    assert.ok(types.includes(PERSON), `linkset type should include ${PERSON}, got ${types}`);
    assert.ok(types.includes('https://www.w3.org/ns/lws#DataResource'));
  });
});
```

*(This test also exercises Task 6's linkset enrichment; it stays RED until both land — acceptable, they are one deliverable slice. If preferred, split the linkset assertion into Task 6.)*

- [ ] **Step 2: Run — expect failure**

Run: `node --test test/lws-type-index.test.js`
Expected: FAIL — linkset `type` has only `DataResource` (capture + enrichment not wired).

- [ ] **Step 3: Wire capture into handlePut**

At the top of `src/handlers/resource.js`, add to the existing imports:

```js
import { captureDeclaredTypes, parseTypeLinks, typeStorePath } from '../lws/type-metadata.js';
```

Immediately after the successful write block (`const success = await storage.write(storagePath, content);` … `}` at `:1184–1187`), insert:

```js
  // Capture server-managed `type` metadata from Link: rel="type" (--lws only).
  if (request.lwsEnabled) {
    const declared = parseTypeLinks(request.headers.link || '');
    if (declared.length) await captureDeclaredTypes(storage, storagePath, declared);
  }
```

- [ ] **Step 4: Wire capture into handlePost**

At the top of `src/handlers/container.js`, add:

```js
import { captureDeclaredTypes, parseTypeLinks } from '../lws/type-metadata.js';
```

After `success = await storage.write(newStoragePath, content);` (`:157`), before the quota update, insert:

```js
    // Capture server-managed `type` metadata from Link: rel="type" (--lws only).
    if (success && request.lwsEnabled && !isCreatingContainer) {
      const declared = parseTypeLinks(linkHeader);
      if (declared.length) await captureDeclaredTypes(storage, newStoragePath, declared);
    }
```

- [ ] **Step 5: Run — expect the DataResource assertion to pass, PERSON still failing until Task 6**

Run: `node --test test/lws-type-index.test.js`
Expected: still FAIL on the `PERSON` assertion (linkset not yet enriched). The store now holds it — verified indirectly in Task 6. Proceed.

- [ ] **Step 6: Commit**

```bash
git add src/handlers/resource.js src/handlers/container.js test/lws-type-index.test.js
git commit -m "feat(lws): capture Link rel=type into the server-managed type store on write"
```

---

### Task 6: Linkset `type` = intrinsic ∪ declared

**Files:**
- Modify: `src/lws/linkset.js` (`generateLinkset`)
- Modify: `src/handlers/resource.js` (the two LINKSET GET branches: container `:379`, data resource `:571`)
- Test: `test/lws-linkset.test.js` (extend) + `test/lws-type-index.test.js` (Task 5 test now goes green)

**Interfaces:**
- Consumes: `readDeclaredTypes` from `src/lws/type-metadata.js`.
- Produces: `generateLinkset(resourceUrl, { parentUrl, isContainer, describedByUrl, declaredTypes: string[] })` — `type` now lists intrinsic ∪ declaredTypes.

- [ ] **Step 1: Add a failing unit test to `test/lws-linkset.test.js`**

```js
// append to test/lws-linkset.test.js
import { generateLinkset } from '../src/lws/linkset.js';
import assert from 'node:assert/strict';
import { it } from 'node:test';

it('includes declared types alongside the intrinsic class', () => {
  const ls = generateLinkset('https://pod/alice/p1', {
    isContainer: false, declaredTypes: ['https://schema.org/Person'],
  });
  const types = ls.linkset[0].type.map((t) => t.href);
  assert.deepEqual(types, ['https://www.w3.org/ns/lws#DataResource', 'https://schema.org/Person']);
});
```

- [ ] **Step 2: Run — expect failure**

Run: `node --test test/lws-linkset.test.js`
Expected: FAIL — only `DataResource` present.

- [ ] **Step 3: Update `generateLinkset` in `src/lws/linkset.js`**

Replace the body with:

```js
const LWS = 'https://www.w3.org/ns/lws#';

export function generateLinkset(resourceUrl, { parentUrl = null, isContainer = false, describedByUrl, declaredTypes = [] } = {}) {
  const link = { anchor: resourceUrl };
  if (parentUrl) link.up = [{ href: parentUrl }];
  const types = [LWS + (isContainer ? 'Container' : 'DataResource')];
  for (const t of declaredTypes) if (!types.includes(t)) types.push(t);
  link.type = types.map((href) => ({ href }));
  if (describedByUrl) link.describedby = [{ href: describedByUrl }];
  return { linkset: [link] };
}
```

- [ ] **Step 4: Pass declared types from the GET branches in `src/handlers/resource.js`**

Add the import at the top:

```js
import { readDeclaredTypes } from '../lws/type-metadata.js';
```

In the container LINKSET branch (`:379`), change the `generateLinkset(...)` call to include declared types (read just above it):

```js
    if (request.lwsEnabled && negotiated === RDF_TYPES.LINKSET) {
      const declaredTypes = await readDeclaredTypes(storage, storagePath);
      const ls = generateLinkset(resourceUrl, {
        parentUrl: parentContainerUrl(resourceUrl),
        isContainer: true,
        describedByUrl: storageDescriptionUrl(resourceUrl),
        declaredTypes,
      });
```

In the data-resource LINKSET branch (`:571`), do the same — read `declaredTypes` and pass it into that branch's `generateLinkset(...)` call (the branch already computes `storagePath`; if not in scope, use the resource's storage path variable available there).

- [ ] **Step 5: Run both test files — expect pass**

Run: `node --test test/lws-linkset.test.js test/lws-type-index.test.js`
Expected: PASS (Task 5's `PERSON` assertion now green).

- [ ] **Step 6: Commit**

```bash
git add src/lws/linkset.js src/handlers/resource.js test/lws-linkset.test.js
git commit -m "feat(lws): surface declared types in the resource linkset (intrinsic ∪ declared)"
```

---

### Task 7: Per-query ACL cache in `checkAccess`

**Files:**
- Modify: `src/wac/checker.js` (`checkAccess`, `findApplicableAcl`)
- Test: `test/lws-type-index.test.js` (extend with a memo unit-style check)

**Interfaces:**
- Produces: `checkAccess({ ..., aclCache?: Map })` — optional per-query cache; when passed, `.acl` reads/parses are memoized within the call set. Behavior identical with or without it.

- [ ] **Step 1: Add a failing test**

```js
// append to test/lws-type-index.test.js
import { checkAccess } from '../src/wac/checker.js';
import { AccessMode } from '../src/wac/parser.js';

describe('checkAccess per-query ACL cache', () => {
  it('same allow/deny with a shared cache, and the cache gets populated', async () => {
    const cache = new Map();
    const args = { resourceUrl: `${getBaseUrl()}/alice/p1`, resourcePath: '/alice/p1',
                   isContainer: false, agentWebId: null, requiredMode: AccessMode.READ };
    const a = await checkAccess({ ...args });               // no cache
    const b = await checkAccess({ ...args, aclCache: cache }); // with cache
    assert.equal(a.allowed, b.allowed);
    assert.ok(cache.size >= 1, 'cache should hold at least one parsed ACL');
  });
});
```

- [ ] **Step 2: Run — expect failure**

Run: `node --test test/lws-type-index.test.js`
Expected: FAIL — `cache.size` is 0 (param ignored).

- [ ] **Step 3: Thread the cache through `src/wac/checker.js`**

Change `checkAccess` to accept and forward `aclCache`:

```js
export async function checkAccess({ resourceUrl, resourcePath, isContainer, agentWebId, requiredMode, aclCache = null }) {
  const aclResult = await findApplicableAcl(resourceUrl, resourcePath, isContainer, aclCache);
  // ...unchanged below...
```

In `findApplicableAcl(resourceUrl, resourcePath, isContainer, aclCache = null)`, wrap each `storage.exists`/`storage.read`/`parseAcl` lookup with a cache keyed by ACL storage path. Add this helper inside the function and use it at each of the three lookup sites (resource ACL, walked default ACL, root ACL):

```js
  // Memoize parsed ACLs within one query. Key = acl storage path.
  // Value = { authorizations } | null (null = checked, absent).
  const loadAcl = async (aclStoragePath, aclUrl) => {
    if (aclCache && aclCache.has(aclStoragePath)) return aclCache.get(aclStoragePath);
    let parsed = null;
    if (await storage.exists(aclStoragePath)) {
      const content = await storage.read(aclStoragePath);
      if (content) parsed = { authorizations: await parseAcl(content.toString(), aclUrl) };
    }
    if (aclCache) aclCache.set(aclStoragePath, parsed);
    return parsed;
  };
```

Then replace, e.g., the resource-ACL block:

```js
  const resourceAclPath = isContainer
    ? (resourcePath.endsWith('/') ? resourcePath : resourcePath + '/') + '.acl'
    : resourcePath + '.acl';
  {
    const parsed = await loadAcl(resourceAclPath, getAclUrl(resourceUrl, isContainer));
    if (parsed) return { authorizations: parsed.authorizations, isDefault: false, targetUrl: resourceUrl };
  }
```

Apply the same `loadAcl` substitution to the walked-default block (`parentAclPath`, `getAclUrl(parentUrl, true)`, returning `isDefault:true, targetUrl:parentUrl`) and the root block (`/.acl`, `getAclUrl(rootUrl, true)`, `targetUrl:rootUrl`). Keep the return shapes exactly as they are today.

- [ ] **Step 4: Run — expect pass; also re-run the WAC suite for no regression**

Run: `node --test test/lws-type-index.test.js test/*wac*.test.js`
Expected: PASS; existing WAC tests still green.

- [ ] **Step 5: Commit**

```bash
git add src/wac/checker.js test/lws-type-index.test.js
git commit -m "perf(wac): optional per-query ACL cache in checkAccess (filter-safe, opt-in)"
```

---

### Task 8: Recursive resource walk

**Files:**
- Modify: `src/storage/filesystem.js` (add `walkResources`)
- Test: `test/lws-type-metadata.test.js` (extend)

**Interfaces:**
- Produces: `walkResources(rootUrlPath = '/') → Promise<Array<{ urlPath, isDirectory }>>` — every non-auxiliary, non-dot resource under the root (files and containers), recursively. Auxiliary suffixes (`.acl`, `.meta`, `.lwstypes`) and dot-entries are excluded and dot-dirs are not descended.

- [ ] **Step 1: Add failing test**

```js
// append to test/lws-type-metadata.test.js
import { walkResources } from '../src/storage/filesystem.js';

describe('walkResources', () => {
  beforeEach(async () => {
    await fs.emptyDir('./data');
    await storage.write('/a', Buffer.from('x'));
    await storage.createContainer('/sub/');
    await storage.write('/sub/b', Buffer.from('y'));
    await storage.write('/a.lwstypes', Buffer.from('[]'));   // auxiliary — must be skipped
    await storage.write('/a.acl', Buffer.from('x'));         // auxiliary — must be skipped
  });
  it('lists files + containers, skips auxiliaries', async () => {
    const paths = (await walkResources('/')).map((r) => r.urlPath).sort();
    assert.deepEqual(paths, ['/a', '/sub/', '/sub/b']);
  });
});
```

- [ ] **Step 2: Run — expect failure**

Run: `node --test test/lws-type-metadata.test.js`
Expected: FAIL — `walkResources` not exported.

- [ ] **Step 3: Implement `walkResources` in `src/storage/filesystem.js`**

```js
const AUX_SUFFIX = /\.(acl|meta|lwstypes)$/;

/**
 * Recursively enumerate subject resources under a container.
 * Skips auxiliary sidecars (.acl/.meta/.lwstypes) and dot-entries.
 * @param {string} rootUrlPath
 * @returns {Promise<Array<{urlPath: string, isDirectory: boolean}>>}
 */
export async function walkResources(rootUrlPath = '/') {
  const out = [];
  async function recur(urlPath) {
    const entries = await listContainer(urlPath);
    if (!entries) return;
    for (const e of entries) {
      if (e.name.startsWith('.') || AUX_SUFFIX.test(e.name)) continue;
      const childUrl = urlPath + e.name + (e.isDirectory ? '/' : '');
      out.push({ urlPath: childUrl, isDirectory: e.isDirectory });
      if (e.isDirectory) await recur(childUrl);
    }
  }
  await recur(rootUrlPath.endsWith('/') ? rootUrlPath : rootUrlPath + '/');
  return out;
}
```

- [ ] **Step 4: Run — expect pass**

Run: `node --test test/lws-type-metadata.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/storage/filesystem.js test/lws-type-metadata.test.js
git commit -m "feat(storage): walkResources — recursive subject-resource enumeration"
```

---

### Task 9: TypeIndex handler + `/types/index` route

**Files:**
- Create: `src/handlers/type-index.js` (`handleTypeIndex`)
- Modify: `src/server.js` (register route in the `if (lwsEnabled)` block, `:877`)
- Test: `test/lws-type-index.test.js` (extend)

**Interfaces:**
- Consumes: `walkResources` (storage), `readDeclaredTypes`/`typeStorePath` (type-metadata), `resourceTypes`/`buildTypeIndex` (type-index), `checkAccess`+`AccessMode` (wac), storage `stat`.
- Produces: `handleTypeIndex(request, reply)` — `200 application/lws+json` TypeIndex over authorized resources.

- [ ] **Step 1: Failing test**

```js
// append to test/lws-type-index.test.js
describe('GET /types/index', () => {
  let base, token;
  before(async () => {
    await stopTestServer();                       // fresh pod for this block
    await startTestServer({ lws: true }); base = getBaseUrl();
    token = (await createTestPod('bob')).token;
    await fetch(`${base}/bob/person`, { method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, Link: `<${PERSON}>; rel="type"` },
      body: '{}' });
  });
  after(async () => { await stopTestServer(); });

  it('bearer caller sees schema:Person; anonymous does not', async () => {
    const authed = await (await fetch(`${base}/types/index`, { headers: { Authorization: `Bearer ${token}` } })).json();
    assert.equal(authed.type, 'TypeIndex');
    assert.ok(authed.items.some((i) => i.id === PERSON));

    const anon = await (await fetch(`${base}/types/index`)).json();
    assert.ok(!anon.items.some((i) => i.id === PERSON), 'anonymous must not see the private type');
  });
});
```

- [ ] **Step 2: Run — expect failure**

Run: `node --test test/lws-type-index.test.js`
Expected: FAIL — `/types/index` 404 (route not registered).

- [ ] **Step 3: Implement `src/handlers/type-index.js`**

```js
// src/handlers/type-index.js
import * as storage from '../storage/filesystem.js';
import { walkResources } from '../storage/filesystem.js';
import { readDeclaredTypes } from '../lws/type-metadata.js';
import { resourceTypes, buildTypeIndex } from '../lws/type-index.js';
import { checkAccess } from '../wac/checker.js';
import { AccessMode } from '../wac/parser.js';

const LWS_JSON = 'application/lws+json';

// Resolve types for every resource the caller may READ. One ACL cache per request.
async function authorizedTypeLists(request) {
  const origin = `${request.protocol}://${request.hostname}`;
  const agentWebId = request.webId || null;
  const aclCache = new Map();
  const resources = await walkResources('/');
  const lists = [];
  for (const r of resources) {
    const { allowed } = await checkAccess({
      resourceUrl: origin + r.urlPath, resourcePath: r.urlPath,
      isContainer: r.isDirectory, agentWebId, requiredMode: AccessMode.READ, aclCache,
    });
    if (!allowed) continue;
    const declared = await readDeclaredTypes(storage, r.urlPath);
    lists.push(resourceTypes({ isDirectory: r.isDirectory, declared }));
  }
  return lists;
}

export async function handleTypeIndex(request, reply) {
  const lists = await authorizedTypeLists(request);
  reply.header('Cache-Control', 'private, no-store');
  reply.type(LWS_JSON);
  return reply.send(JSON.stringify(buildTypeIndex(lists), null, 2));
}
```

- [ ] **Step 4: Register the route in `src/server.js`**

Add the import near the other handler imports:

```js
import { handleTypeIndex } from './handlers/type-index.js';
```

Inside the existing `if (lwsEnabled) { ... }` block (after the storage-description write-block, before its closing `}` at `:896`), add:

```js
    fastify.get('/types/index', handleTypeIndex);
    for (const m of ['put', 'post', 'patch', 'delete']) fastify[m]('/types/index', methodNotAllowed);
```

- [ ] **Step 5: Run — expect pass**

Run: `node --test test/lws-type-index.test.js`
Expected: PASS (bearer sees Person; anon does not).

- [ ] **Step 6: Commit**

```bash
git add src/handlers/type-index.js src/server.js test/lws-type-index.test.js
git commit -m "feat(lws): TypeIndexService — GET /types/index, authz-filtered"
```

---

### Task 10: TypeSearch handler + `/types/search` (GET + POST)

**Files:**
- Modify: `src/handlers/type-index.js` (add `handleTypeSearch`)
- Modify: `src/server.js` (register GET + POST)
- Test: `test/lws-type-index.test.js` (extend)

**Interfaces:**
- Consumes: everything from Task 9 plus `parseTypeFilter`, `matchesTypeFilter`, `FilterError` (type-index).
- Produces: `handleTypeSearch(request, reply)` — `200 ContainerPage` of matches; `400`/`415` per spec.

- [ ] **Step 1: Failing test**

```js
// append to test/lws-type-index.test.js
describe('GET/POST /types/search', () => {
  let base, token;
  before(async () => {
    await stopTestServer(); await startTestServer({ lws: true }); base = getBaseUrl();
    token = (await createTestPod('carol')).token;
    const h = (t) => ({ method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, Link: `<${t}>; rel="type"` }, body: '{}' });
    await fetch(`${base}/carol/p1`, h(PERSON));
    await fetch(`${base}/carol/n1`, h('http://ex/Note'));
  });
  after(async () => { await stopTestServer(); });

  it('GET ?type=Person returns only the Person resource', async () => {
    const r = await (await fetch(`${base}/types/search?type=${encodeURIComponent(PERSON)}`, { headers: { Authorization: `Bearer ${token}` } })).json();
    assert.equal(r.type, 'ContainerPage');
    const ids = r.items.map((i) => i.id);
    assert.ok(ids.some((u) => u.endsWith('/carol/p1')));
    assert.ok(!ids.some((u) => u.endsWith('/carol/n1')));
  });
  it('POST body form is equivalent', async () => {
    const r = await (await fetch(`${base}/types/search`, { method: 'POST',
      headers: { 'Content-Type': 'application/lws+json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ type: [PERSON] }) })).json();
    assert.ok(r.items.map((i) => i.id).some((u) => u.endsWith('/carol/p1')));
  });
  it('POST with wrong media type → 415', async () => {
    const r = await fetch(`${base}/types/search`, { method: 'POST',
      headers: { 'Content-Type': 'text/plain', Authorization: `Bearer ${token}` }, body: 'x' });
    assert.equal(r.status, 415);
  });
  it('invalid type URI → 400', async () => {
    const r = await fetch(`${base}/types/search?type=notauri`, { headers: { Authorization: `Bearer ${token}` } });
    assert.equal(r.status, 400);
  });
});
```

- [ ] **Step 2: Run — expect failure**

Run: `node --test test/lws-type-index.test.js`
Expected: FAIL — `/types/search` 404.

- [ ] **Step 3: Add `handleTypeSearch` to `src/handlers/type-index.js`**

Extend the imports and add the handler:

```js
import { resourceTypes, buildTypeIndex, parseTypeFilter, matchesTypeFilter, FilterError } from '../lws/type-index.js';
```

```js
const LWS_CONTEXT = 'https://www.w3.org/ns/lws/v1';

// Like authorizedTypeLists but returns per-resource {id, types} so we can filter + describe.
async function authorizedResources(request) {
  const origin = `${request.protocol}://${request.hostname}`;
  const agentWebId = request.webId || null;
  const aclCache = new Map();
  const out = [];
  for (const r of await walkResources('/')) {
    const { allowed } = await checkAccess({
      resourceUrl: origin + r.urlPath, resourcePath: r.urlPath,
      isContainer: r.isDirectory, agentWebId, requiredMode: AccessMode.READ, aclCache,
    });
    if (!allowed) continue;
    const declared = await readDeclaredTypes(storage, r.urlPath);
    out.push({ id: origin + r.urlPath, types: resourceTypes({ isDirectory: r.isDirectory, declared }) });
  }
  return out;
}

export async function handleTypeSearch(request, reply) {
  let cnf;
  try {
    if (request.method === 'POST') {
      const ct = (request.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
      if (ct !== LWS_JSON) return reply.code(415).type('application/problem+json')
        .send({ type: 'about:blank', status: 415, title: 'Unsupported Media Type' });
      const body = typeof request.body === 'object' && request.body !== null
        ? request.body : JSON.parse(Buffer.isBuffer(request.body) ? request.body.toString() : String(request.body || '{}'));
      cnf = parseTypeFilter({ body });
    } else {
      const q = new URLSearchParams(request.url.split('?')[1] || '');
      cnf = parseTypeFilter({ query: q });
    }
  } catch (e) {
    const status = e instanceof FilterError ? 400 : 400;
    return reply.code(status).type('application/problem+json')
      .send({ type: 'about:blank', status, title: 'Bad Request', detail: e.message });
  }

  const resources = await authorizedResources(request);
  const matched = resources.filter((r) => matchesTypeFilter(r.types, cnf));
  reply.header('Cache-Control', 'private, no-store');
  reply.type(LWS_JSON);
  return reply.send(JSON.stringify({
    '@context': LWS_CONTEXT, type: 'ContainerPage', totalItems: matched.length,
    items: matched.map((r) => ({ id: r.id, type: r.types })),
  }, null, 2));
}
```

- [ ] **Step 4: Register routes in `src/server.js`**

Update the import and add the routes beside `/types/index`:

```js
import { handleTypeIndex, handleTypeSearch } from './handlers/type-index.js';
```

```js
    fastify.get('/types/search', handleTypeSearch);
    fastify.post('/types/search', handleTypeSearch);
    for (const m of ['put', 'patch', 'delete']) fastify[m]('/types/search', methodNotAllowed);
```

- [ ] **Step 5: Run — expect pass**

Run: `node --test test/lws-type-index.test.js`
Expected: PASS (filter, POST equivalence, 415, 400).

- [ ] **Step 6: Commit**

```bash
git add src/handlers/type-index.js src/server.js test/lws-type-index.test.js
git commit -m "feat(lws): TypeSearchService — GET/POST /types/search, CNF type filter"
```

---

### Task 11: Advertise the services in the storage description

**Files:**
- Modify: `src/server.js` (the `services` array at `:883`)
- Test: `test/lws-storage-link.test.js` or `test/lws-type-index.test.js` (extend)

**Interfaces:**
- Consumes: nothing new — edits the existing storage-description route.

- [ ] **Step 1: Failing test**

```js
// append to test/lws-type-index.test.js
describe('storage description advertises the services', () => {
  before(async () => { await stopTestServer(); await startTestServer({ lws: true }); });
  after(async () => { await stopTestServer(); });
  it('lists TypeIndexService + TypeSearchService', async () => {
    const sd = await (await fetch(`${getBaseUrl()}/.well-known/lws-storage`)).json();
    const types = sd.service.map((s) => s.type);
    assert.ok(types.includes('TypeIndexService'));
    assert.ok(types.includes('TypeSearchService'));
  });
});
```

- [ ] **Step 2: Run — expect failure**

Run: `node --test test/lws-type-index.test.js`
Expected: FAIL — services absent.

- [ ] **Step 3: Edit the `services` array in `src/server.js`** (`:883`, inside the `if (lwsEnabled)` GET handler)

After the existing `StorageDescription` push and before the `notificationsEnabled` block, add:

```js
      services.push({ type: 'TypeIndexService', serviceEndpoint: `${proto}://${host}/types/index` });
      services.push({ type: 'TypeSearchService', serviceEndpoint: `${proto}://${host}/types/search` });
```

- [ ] **Step 4: Run — expect pass**

Run: `node --test test/lws-type-index.test.js`
Expected: PASS.

- [ ] **Step 5: Full fork suite — no regressions**

Run: `node --test --test-concurrency=1 'test/*.test.js'`
Expected: all pass (baseline + the new suites).

- [ ] **Step 6: Commit**

```bash
git add src/server.js test/lws-type-index.test.js
git commit -m "feat(lws): advertise TypeIndexService + TypeSearchService in the storage description"
```

---

### Task 12: lws-pod live-pod gate

**Files (lws-pod repo, NOT the fork):**
- Create: `/Users/cvardema/dev/git/LA3D/agents/lws-pod/tests/lws-typeindex.test.mjs`
- Modify: `/Users/cvardema/dev/git/LA3D/agents/lws-pod/Makefile` (add `test-typeindex`, `.PHONY`)
- Modify: `Dockerfile.fork` + `docker-compose.fork-tls.yml` — bump `JSS_GIT_REF` / image tag to the merged L2.5 SHA (done in Task 13 after merge; note here).

**Interfaces:**
- Consumes: the running fork `--lws` TLS pod at `https://pod.vardeman.me`; mirrors `tests/lws-admission.test.mjs` wiring.

- [ ] **Step 1: Write the live gate**

```js
// tests/lws-typeindex.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';

const BASE = process.env.BASE || 'https://pod.vardeman.me';

// Self-skip on a non-lws pod: the storage description must advertise the services.
const sd = await (await fetch(`${BASE}/.well-known/lws-storage`)).json().catch(() => ({}));
const hasTypeIndex = (sd.service || []).some((s) => s.type === 'TypeIndexService');

test('TypeIndex advertised + reachable', { skip: !hasTypeIndex && 'non-lws pod' }, async () => {
  const idx = await (await fetch(`${BASE}/types/index`)).json();
  assert.equal(idx.type, 'TypeIndex');
  assert.ok(Array.isArray(idx.items));
});

test('TypeSearch on lws:Container returns containers', { skip: !hasTypeIndex && 'non-lws pod' }, async () => {
  const url = `${BASE}/types/search?type=${encodeURIComponent('https://www.w3.org/ns/lws#Container')}`;
  const r = await (await fetch(url)).json();
  assert.equal(r.type, 'ContainerPage');
  for (const it of r.items) assert.ok([].concat(it.type).includes('Container'));
});
```

- [ ] **Step 2: Add the Makefile target** (after `test-l3`, mirroring it)

```makefile
# L2.5 live gate — Type Index/Search surfaces against the running FORK pod (--lws).
# Self-skips on a non-lws pod. Needs `make up-fork-tls` + `make cert`.
test-typeindex:
	@[ -d node_modules ] || npm ci
	@[ -f certs/rootCA.pem ] || { echo "certs/rootCA.pem missing — run 'make cert && make up-fork-tls' first"; exit 1; }
	BASE=https://pod.vardeman.me NODE_EXTRA_CA_CERTS=certs/rootCA.pem npx vitest run tests/lws-typeindex.test.mjs
```

Add `test-typeindex` to the `.PHONY` line.

*(Note: `tests/lws-admission.test.mjs` uses vitest; if this file uses `node:test`, run it with `node --test` instead. Match the sibling gate's runner — inspect `tests/lws-admission.test.mjs` and mirror its imports exactly.)*

- [ ] **Step 3: Rebuild the fork pod at the new SHA and run the gate** (after Task 13 merge)

```bash
cd /Users/cvardema/dev/git/LA3D/agents/lws-pod
make up-fork-tls          # rebuilds fork-l3→ bump tag/SHA in Task 13 first
make test-typeindex
```

Expected: 2 passed (or skipped with a clear message if the pod is non-lws).

- [ ] **Step 4: Commit (lws-pod repo)**

```bash
git add tests/lws-typeindex.test.mjs Makefile
git commit -m "[Agent: Claude] test(lws): L2.5 Type Index/Search live-pod gate (make test-typeindex)"
```

---

### Task 13: Whole-branch review + merge into `la3d/lws`

**Files:** none (review + git)

- [ ] **Step 1: Re-run the full fork suite serially**

Run (in `.worktree-lws-typeindex`): `node --test --test-concurrency=1 'test/*.test.js'`
Expected: all green.

- [ ] **Step 2: Request an opus whole-branch review** (per the solo-dev gate). Address any Important findings with a follow-up commit; re-run the suite.

- [ ] **Step 3: Merge into `la3d/lws` (no-ff, no PR)**

```bash
FORK=/Users/cvardema/dev/git/LA3D/agents/JavaScriptSolidServer
git -C "$FORK" checkout la3d/lws
git -C "$FORK" merge --no-ff la3d/lws-typeindex -m "merge: L2.5 Type Index/Search into la3d/lws"
git -C "$FORK" push origin la3d/lws la3d/lws-typeindex
git -C "$FORK" rev-parse --short la3d/lws   # capture the merge SHA
```

- [ ] **Step 4: Bump the container pin + FOLLOWUP** (lws-pod repo)

Update `Dockerfile.fork` default `JSS_GIT_REF` and `docker-compose.fork-tls.yml` fallback to the merge SHA; rename the image tag `fork-l3` → `fork-l2_5` (evict the cached layer). Update `FOLLOWUP.md`: L2.5 shipped; next = the indexed-relation (`describedby`) follow-up spec. Commit both.

- [ ] **Step 5: Final live verification**

Run: `make up-fork-tls && make test-typeindex && make test-l3 && make test-lws`
Expected: all green (no regression across L2/L3 on the L2.5 pod).

- [ ] **Step 6: Clean up the worktrees**

```bash
git -C "$FORK" worktree remove /Users/cvardema/dev/git/LA3D/agents/lws-pod/.worktree-lws-typeindex
git -C "$FORK" worktree remove /Users/cvardema/dev/git/LA3D/agents/lws-pod/.worktree-jss-lws
```

---

## Self-Review

**Spec coverage:** §1 scope → Tasks 2–11; §3 modules → type-index (T2–3), type-metadata (T4), handler (T9–10), linkset (T6), walk (T8), wiring (T9–11); §4 server-managed type store → T4–T6 (`.lwstypes`, capture on write, linkset surface); §5 on-demand walk + ACL memo → T7–T10; §6 authz reuse → T9/T10 via `checkAccess`; §7 endpoints/errors → T9/T10; §8 totalItems approximate → T10 (count of authorized scan); §9 testing → every task + T12 live gate; §10 deferred items → none built (correct). No uncovered requirement.

**Placeholder scan:** all code steps carry real code; commands have expected output. Task 6 step 4 and Task 12 step 2 carry explicit "inspect the sibling and mirror" instructions rather than guessed line content, because the exact surrounding lines vary — these are directed, not vague. No TODO/TBD.

**Type consistency:** `parseTypeFilter`/`matchesTypeFilter`/`resourceTypes`/`buildTypeIndex`/`FilterError` (type-index.js) used identically in T9/T10; `captureDeclaredTypes`/`readDeclaredTypes`/`typeStorePath`/`parseTypeLinks` (type-metadata.js) consistent across T4–T10; `checkAccess({..., aclCache})` signature consistent T7→T9/T10; `walkResources('/')` return shape `{urlPath,isDirectory}` consistent T8→T9/T10; `generateLinkset(..., {declaredTypes})` consistent T6.
