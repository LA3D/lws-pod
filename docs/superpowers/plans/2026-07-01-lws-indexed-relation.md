# LWS Indexed-Relation Filter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generalize the shipped LWS Type Search from a `type`-only filter to `type` + a server-chosen set of indexed relations, indexing `describedby → SHACL shape` as the first (and only v1) relation, and fix the linkset `describedby` read surface to carry that shape instead of the storage-description URL.

**Architecture:** Two surfaces over one source. Both read a resource's `powder-s:describedby` shape target(s) from its `.meta` (the LWS linkset resource) via a new `describedbyTargets` helper in the existing L3 `constraint.js`. The **read surface** is the per-resource linkset (`generateLinkset` emits the shape, or omits `describedby` when unconstrained). The **search surface** is `/types/search`, whose filter parser is generalized from `type`-only to `type` + indexed-relation keys with the same CNF grammar. An unindexed relation key forces an empty result (no-oracle rule), never an error.

**Tech Stack:** Node ESM; `node:test` + `node:assert/strict` (fork unit/integration); Vitest (lws-pod live-pod gate); `shacl-engine` (pinned SHA, unchanged); Fastify handlers; RFC 9264 linkset JSON.

## Global Constraints

- **Two repos.** Fork code: `/Users/cvardema/dev/git/LA3D/agents/JavaScriptSolidServer` (the JSS fork). Live gate + docs: `/Users/cvardema/dev/git/LA3D/agents/lws-pod`. Every fork task runs in the fork repo; Tasks 6–7 run in lws-pod.
- **Fork branch:** all fork work on `la3d/lws-indexed-relation`, created off `la3d/lws` (HEAD `6cd5d9b`). Merge `--no-ff` into `la3d/lws` (solo-dev model — no GitHub PR; the per-task + whole-branch reviews are the gate). `la3d/main` stays the pristine upstream pin — never touched.
- **`--lws`-gated + additive.** Every behavior change is reachable only under `--lws` (`request.lwsEnabled`). The default LDP path MUST stay provably unchanged — every task that touches a shared handler carries a negative control.
- **No content parsing.** Shape targets come only from the `.meta` graph and declared `Link` headers — never from parsing resource bodies.
- **No-oracle rule.** An unindexed relation key, or a well-formed URI matching nothing, yields an **empty** result set — never an error, and the two cases MUST be indistinguishable to the client.
- **Descriptive-only.** Only `describedby` (as a shape pointer) is indexable in v1. Structural/protocol relations (`up`, `anchor`, `linkset`, `storageDescription`, `type`-as-metadata) are never indexable.
- **CNF caps** (reuse, unchanged values): `MAX_GROUPS=32`, `MAX_VALUES_PER_GROUP=64`, `MAX_TOTAL_TERMS=256` — applied **globally across the combined filter** (type + all relation groups). Over-limit → `400`, never silently narrowed.
- **Commit format:** `[Agent: Claude] type(scope): subject` … `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`. Stage specific files, never `git add -A`.
- **Fork test runners:** single file `node --test test/<file>.test.js`; full suite serial `node --test --test-concurrency=1 'test/*.test.js'`.

**Spec:** `docs/superpowers/specs/2026-07-01-lws-indexed-relation-design.md`.

---

### Task 0: Branch

- [ ] **Step 1: Create the feature branch off the integration branch**

```bash
cd /Users/cvardema/dev/git/LA3D/agents/JavaScriptSolidServer
git checkout la3d/lws
git pull --ff-only 2>/dev/null || true
git rev-parse --short HEAD          # expect 6cd5d9b (or later la3d/lws HEAD)
git checkout -b la3d/lws-indexed-relation
```

Expected: on branch `la3d/lws-indexed-relation`.

---

### Task 1: `describedbyTargets` — read ALL shape targets from `.meta`

**Files:**
- Modify: `src/lws/constraint.js`
- Test: `test/lws-constraint.test.js`

**Interfaces:**
- Consumes: `toDataset` (existing, `./admission-rdf.js`); the `DESCRIBEDBY` POWDER IRI constant (existing).
- Produces: `describedbyTargets(storage, metaPath, baseIri) → Promise<string[]>` — every object of a `powder-s:describedby` quad in the `.meta` dataset (deduped, order-preserved); `[]` when `.meta` missing/unreadable/parse-corrupt. `describedbyFrom` (existing, still used by admission) is re-expressed as `describedbyTargets(...)[0] ?? null` — behavior preserved.

- [ ] **Step 1: Write failing tests**

Append to `test/lws-constraint.test.js`:

```js
import { describedbyTargets } from '../src/lws/constraint.js';

const metaTwo = (subject, ...shapes) => Buffer.from(JSON.stringify({
  '@id': subject, [DESCRIBEDBY]: shapes.map((s) => ({ '@id': s })),
}));

test('describedbyTargets: returns all shape targets in the .meta', async () => {
  const s = fakeStorage({ '/alice/x.meta': metaTwo('http://h/alice/x', 'http://h/shapes/A', 'http://h/shapes/B') });
  const got = await describedbyTargets(s, '/alice/x.meta', 'http://h/alice/x');
  assert.deepEqual(got.sort(), ['http://h/shapes/A', 'http://h/shapes/B']);
});

test('describedbyTargets: single target', async () => {
  const s = fakeStorage({ '/alice/x.meta': metaJson('http://h/alice/x', 'http://h/shapes/X.ttl') });
  assert.deepEqual(await describedbyTargets(s, '/alice/x.meta', 'http://h/alice/x'), ['http://h/shapes/X.ttl']);
});

test('describedbyTargets: no .meta → []', async () => {
  assert.deepEqual(await describedbyTargets(fakeStorage({}), '/alice/x.meta', 'http://h/alice/x'), []);
});

test('describedbyTargets: malformed .meta → [] (unconstrained)', async () => {
  const s = fakeStorage({ '/alice/x.meta': Buffer.from('{ not json-ld') });
  assert.deepEqual(await describedbyTargets(s, '/alice/x.meta', 'http://h/alice/x'), []);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `node --test test/lws-constraint.test.js`
Expected: FAIL — `describedbyTargets` is not exported.

- [ ] **Step 3: Implement**

Rewrite the body of `src/lws/constraint.js` (keep the `DESCRIBEDBY` const and imports):

```js
// src/lws/constraint.js
import { toDataset } from './admission-rdf.js';

const DESCRIBEDBY = 'http://www.w3.org/2007/05/powder-s#describedby';

// All powder-s:describedby shape targets in a resource's .meta (the LWS
// linkset resource). [] when .meta is missing/unreadable/parse-corrupt —
// treated as "declares no shape". Deduped, order-preserved.
export async function describedbyTargets(storage, metaPath, baseIri) {
  if (!(await storage.exists(metaPath))) return [];
  let buf;
  try { buf = await storage.read(metaPath); } catch { return []; }
  let ds;
  try { ds = await toDataset(buf, 'application/ld+json', baseIri); } catch { return []; }
  const out = [];
  for (const q of ds) if (q.predicate.value === DESCRIBEDBY && !out.includes(q.object.value)) out.push(q.object.value);
  return out;
}

async function describedbyFrom(storage, metaPath, baseIri) {
  return (await describedbyTargets(storage, metaPath, baseIri))[0] ?? null;
}

// Target's own .meta wins (self-constraint); else the container's .meta
// (member-rule for a newly created resource). null = unconstrained → pass through.
export async function resolveShapeUrl({ storage, targetMetaPath, containerMetaPath, baseIri }) {
  return (await describedbyFrom(storage, targetMetaPath, baseIri))
      ?? (await describedbyFrom(storage, containerMetaPath, baseIri));
}
```

- [ ] **Step 4: Run to verify pass**

Run: `node --test test/lws-constraint.test.js`
Expected: PASS (new tests + the 4 existing `resolveShapeUrl` tests still green — admission behavior unchanged).

- [ ] **Step 5: Commit**

```bash
git add src/lws/constraint.js test/lws-constraint.test.js
git commit -m "$(cat <<'EOF'
[Agent: Claude] feat(lws): describedbyTargets — read all shape targets from .meta

- returns every powder-s:describedby object (deduped); [] when unconstrained
- describedbyFrom re-expressed over it; L3 admission behavior unchanged

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Generalize the filter parser — `parseFilter` + `matchesFilter` + `INDEXED_RELATIONS`

**Files:**
- Modify: `src/lws/type-index.js`
- Test: `test/lws-type-index-unit.test.js`

**Interfaces:**
- Consumes: existing module-private `group()`, exported `matchesTypeFilter`, `FilterError`, cap constants.
- Produces:
  - `INDEXED_RELATIONS: Set<string>` = `{'describedby'}` (the extensibility seam).
  - `parseFilter({query, body}) → { type: string[][], relations: Record<string,string[][]>, hasUnindexed: boolean }`. `type` handled specially; each key in `INDEXED_RELATIONS` becomes a `relations[key]` CNF; any other non-reserved key sets `hasUnindexed = true`. Caps enforced on a **shared budget** across all keys. Query pagination keys (`page`) and the body `@context` key are ignored (not relations).
  - `matchesFilter(resource, filter) → boolean` where `resource = { types: string[], relations?: Record<string,string[]> }`. Returns `false` if `hasUnindexed`; else type-CNF AND every relation-CNF must hold.
- `parseTypeFilter` (existing) stays exported and behavior-identical, but is **rewritten to delegate** to `parseFilter` (`return parseFilter(args).type`) — no duplicated cap logic; existing callers/tests unaffected.

- [ ] **Step 1: Write failing tests**

Append to `test/lws-type-index-unit.test.js`:

```js
import { parseFilter, matchesFilter, INDEXED_RELATIONS } from '../src/lws/type-index.js';

const SHAPE = 'https://shapes.example/PersonShape';
const SHAPE2 = 'https://shapes.example/Other';

describe('parseFilter (type + indexed relations)', () => {
  it('parses type and describedby into separate CNFs (GET)', () => {
    const q = new URLSearchParams(`type=${A}&describedby=${SHAPE}`);
    const f = parseFilter({ query: q });
    assert.deepEqual(f.type, [[A]]);
    assert.deepEqual(f.relations.describedby, [[SHAPE]]);
    assert.equal(f.hasUnindexed, false);
  });
  it('GET and POST are equivalent for type AND describedby', () => {
    const q = new URLSearchParams(`type=${A}&describedby=${SHAPE}`);
    const post = parseFilter({ body: { type: [A], describedby: [SHAPE] } });
    assert.deepEqual(post, parseFilter({ query: q }));
  });
  it('an unindexed relation key sets hasUnindexed (no error)', () => {
    const f = parseFilter({ query: new URLSearchParams(`type=${A}&madeup=${SHAPE}`) });
    assert.equal(f.hasUnindexed, true);
  });
  it('pagination key `page` is ignored, not treated as a relation', () => {
    const f = parseFilter({ query: new URLSearchParams(`type=${A}&page=2`) });
    assert.equal(f.hasUnindexed, false);
    assert.deepEqual(f.relations, {});
  });
  it('body @context is ignored', () => {
    const f = parseFilter({ body: { '@context': 'x', type: [A] } });
    assert.equal(f.hasUnindexed, false);
  });
  it('non-absolute-URI relation target → 400 FilterError', () => {
    assert.throws(() => parseFilter({ query: new URLSearchParams('describedby=notauri') }),
      (e) => e instanceof FilterError && e.status === 400);
  });
  it('caps are shared across keys (type groups + relation groups)', () => {
    const q = new URLSearchParams();
    for (let i = 0; i < MAX_GROUPS; i++) q.append('type', `https://ex.org/T${i}`);
    q.append('describedby', SHAPE);                 // one group over the global cap
    assert.throws(() => parseFilter({ query: q }), (e) => e instanceof FilterError && e.status === 400);
  });
  it('describedby is the sole indexed relation in v1', () => {
    assert.deepEqual([...INDEXED_RELATIONS], ['describedby']);
  });
});

describe('matchesFilter', () => {
  const r = { types: [C, A], relations: { describedby: [SHAPE] } };
  it('type AND describedby both satisfied → true', () => {
    assert.equal(matchesFilter(r, { type: [[A]], relations: { describedby: [[SHAPE]] }, hasUnindexed: false }), true);
  });
  it('describedby mismatch → false', () => {
    assert.equal(matchesFilter(r, { type: [[A]], relations: { describedby: [[SHAPE2]] }, hasUnindexed: false }), false);
  });
  it('hasUnindexed forces false regardless of type match', () => {
    assert.equal(matchesFilter(r, { type: [[A]], relations: {}, hasUnindexed: true }), false);
  });
  it('empty filter matches everything', () => {
    assert.equal(matchesFilter(r, { type: [], relations: {}, hasUnindexed: false }), true);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `node --test test/lws-type-index-unit.test.js`
Expected: FAIL — `parseFilter`/`matchesFilter`/`INDEXED_RELATIONS` not exported.

- [ ] **Step 3: Implement**

In `src/lws/type-index.js`, add the following **after** the existing `parseTypeFilter`:

```js
export const INDEXED_RELATIONS = new Set(['describedby']);
const RESERVED_QUERY_KEYS = new Set(['page']);   // pagination refs, not relation filters

// Push comma/array raw groups into `cnf`, enforcing the shared budget.
function pushGroups(cnf, rawGroups, budget) {
  for (const values of rawGroups) {
    if (values.length > MAX_VALUES_PER_GROUP) throw new FilterError('too many values in one group');
    const g = group(values);                       // trims, dedupes, validates absolute URIs
    if (!g.length) continue;                        // empty group ignored
    if (budget.groups >= MAX_GROUPS) throw new FilterError('too many groups');
    budget.groups++;
    budget.terms += g.length;
    if (budget.terms > MAX_TOTAL_TERMS) throw new FilterError('too many terms');
    cnf.push(g);
  }
}

function groupsFromQuery(query, key) {
  return query.getAll(key).map((param) => param.split(','));
}
function groupsFromBody(val, label) {
  if (!Array.isArray(val)) throw new FilterError(`body.${label} must be an array`);
  return val.map((el) => {
    if (typeof el === 'string') return [el];
    if (Array.isArray(el)) return el;
    throw new FilterError(`each body.${label} element must be a string or array of strings`);
  });
}

// Generalized filter: `type` + any indexed relation key, one shared CNF budget.
// Unknown/unindexed non-reserved keys set hasUnindexed (→ empty result, not an error).
export function parseFilter({ query, body } = {}) {
  const budget = { groups: 0, terms: 0 };
  const type = [];
  const relations = {};
  let hasUnindexed = false;

  const keys = query
    ? new Set([...query.keys()])
    : new Set(Object.keys(body || {}).filter((k) => k !== '@context'));

  for (const key of keys) {
    if (query && RESERVED_QUERY_KEYS.has(key)) continue;
    const raw = query ? groupsFromQuery(query, key) : groupsFromBody(body[key], key);
    if (key === 'type') {
      pushGroups(type, raw, budget);
    } else if (INDEXED_RELATIONS.has(key)) {
      pushGroups(relations[key] || (relations[key] = []), raw, budget);
    } else {
      hasUnindexed = true;                          // no-oracle: constraint matches nothing
    }
  }
  return { type, relations, hasUnindexed };
}

// True iff hasUnindexed is false AND the type CNF AND every relation CNF hold.
export function matchesFilter(resource, filter) {
  if (filter.hasUnindexed) return false;
  if (!matchesTypeFilter(resource.types, filter.type)) return false;
  for (const [rel, cnf] of Object.entries(filter.relations)) {
    if (!matchesTypeFilter((resource.relations && resource.relations[rel]) || [], cnf)) return false;
  }
  return true;
}
```

Then **replace** the body of the existing `parseTypeFilter` so it delegates (removing its now-duplicated inline cap/group logic — DRY, behavior-identical since a type-only filter uses the same shared budget):

```js
// GET query (URLSearchParams) OR POST body → the type CNF only (back-compat).
export function parseTypeFilter(args) {
  return parseFilter(args).type;
}
```

- [ ] **Step 4: Run to verify pass**

Run: `node --test test/lws-type-index-unit.test.js`
Expected: PASS (new `parseFilter`/`matchesFilter` blocks + all existing `parseTypeFilter`/caps tests still green).

- [ ] **Step 5: Commit**

```bash
git add src/lws/type-index.js test/lws-type-index-unit.test.js
git commit -m "$(cat <<'EOF'
[Agent: Claude] feat(lws): generalize filter to type + indexed relations

- parseFilter: type + INDEXED_RELATIONS keys, shared CNF budget across keys
- unindexed/unknown key → hasUnindexed (empty result, no-oracle), never error
- matchesFilter: type AND every relation CNF; parseTypeFilter unchanged

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Fix the linkset read surface — `describedby` carries the shape, omit when unconstrained

**Files:**
- Modify: `src/lws/linkset.js`
- Modify: `src/handlers/resource.js` (two linkset call sites)
- Test: `test/lws-linkset.test.js`
- Test (integration): `test/lws-type-index.test.js`

**Interfaces:**
- Consumes: `describedbyTargets` (Task 1).
- Produces: `generateLinkset(resourceUrl, {parentUrl, isContainer, describedByShapes=[], declaredTypes=[]})` — emits `describedby: shapes.map(href=>({href}))` **only when non-empty**, else omits the member. The `describedByUrl` option is removed.

- [ ] **Step 1: Rewrite the linkset unit tests (failing)**

Replace the three tests in `test/lws-linkset.test.js` with:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateLinkset } from '../src/lws/linkset.js';

const R = 'http://localhost:3000/alice/note.ttl';
const P = 'http://localhost:3000/alice/';
const SHAPE = 'http://localhost:3000/alice/shapes/Note';
const LWS = 'https://www.w3.org/ns/lws#';

test('linkset: RFC 9264 shape with anchor/up/type; describedby carries the shape', () => {
  const ls = generateLinkset(R, { parentUrl: P, isContainer: false, describedByShapes: [SHAPE] });
  const link = ls.linkset[0];
  assert.equal(link.anchor, R);
  assert.deepEqual(link.up, [{ href: P }]);
  assert.deepEqual(link.type, [{ href: LWS + 'DataResource' }]);
  assert.deepEqual(link.describedby, [{ href: SHAPE }]);
});

test('linkset: omits describedby when the resource declares no shape', () => {
  const ls = generateLinkset(R, { parentUrl: P, isContainer: false });
  assert.equal('describedby' in ls.linkset[0], false);
});

test('linkset: multiple shapes surface as multiple describedby hrefs', () => {
  const ls = generateLinkset(R, { isContainer: false, describedByShapes: [SHAPE, SHAPE + '2'] });
  assert.deepEqual(ls.linkset[0].describedby, [{ href: SHAPE }, { href: SHAPE + '2' }]);
});

test('linkset: container type + no up at storage root', () => {
  const ls = generateLinkset(P, { parentUrl: null, isContainer: true });
  assert.deepEqual(ls.linkset[0].type, [{ href: LWS + 'Container' }]);
  assert.equal('up' in ls.linkset[0], false);
});

test('includes declared types alongside the intrinsic class', () => {
  const ls = generateLinkset('https://pod/alice/p1', {
    isContainer: false, declaredTypes: ['https://schema.org/Person'],
  });
  const types = ls.linkset[0].type.map((t) => t.href);
  assert.deepEqual(types, ['https://www.w3.org/ns/lws#DataResource', 'https://schema.org/Person']);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `node --test test/lws-linkset.test.js`
Expected: FAIL — `generateLinkset` still uses `describedByUrl`; `describedByShapes` ignored.

- [ ] **Step 3: Implement the generator change**

Replace `src/lws/linkset.js` body:

```js
const LWS = 'https://www.w3.org/ns/lws#';

/**
 * Generate an RFC 9264 linkset (application/linkset+json) for a resource.
 * Read-only discovery slice — mutation/concurrency (If-Match/412/428) deferred.
 * `describedby` carries the resource's declared SHACL shape target(s) (LWS
 * core: linkset describedby → schema); omitted entirely when none are declared.
 * @param {string} resourceUrl
 * @param {{parentUrl?:string|null, isContainer:boolean, describedByShapes?:string[], declaredTypes?:string[]}} opts
 * @returns {object}
 */
export function generateLinkset(resourceUrl, { parentUrl = null, isContainer = false, describedByShapes = [], declaredTypes = [] } = {}) {
  const link = { anchor: resourceUrl };
  if (parentUrl) link.up = [{ href: parentUrl }];
  const types = [LWS + (isContainer ? 'Container' : 'DataResource')];
  for (const t of declaredTypes) if (!types.includes(t)) types.push(t);
  link.type = types.map((href) => ({ href }));
  if (describedByShapes.length) link.describedby = describedByShapes.map((href) => ({ href }));
  return { linkset: [link] };
}
```

- [ ] **Step 4: Update the two call sites in `src/handlers/resource.js`**

Add the import near the other lws imports (after line 6):

```js
import { describedbyTargets } from '../lws/constraint.js';
```

Container-GET site (currently ~382–387):

```js
    if (request.lwsEnabled && negotiated === RDF_TYPES.LINKSET) {
      const declaredTypes = await readDeclaredTypes(storage, storagePath);
      const describedByShapes = await describedbyTargets(storage, storagePath + '.meta', resourceUrl);
      const ls = generateLinkset(resourceUrl, {
        parentUrl: parentContainerUrl(resourceUrl),
        isContainer: true,
        describedByShapes,
        declaredTypes,
      });
```

File-GET site (currently ~576–581):

```js
    const declaredTypes = await readDeclaredTypes(storage, storagePath);
    const describedByShapes = await describedbyTargets(storage, storagePath + '.meta', resourceUrl);
    const ls = generateLinkset(resourceUrl, {
      parentUrl: parentContainerUrl(resourceUrl),
      isContainer: false,
      describedByShapes,
      declaredTypes,
    });
```

- [ ] **Step 5: Remove the now-unused `storageDescriptionUrl` import if orphaned**

Run: `grep -n "storageDescriptionUrl" src/handlers/resource.js`
If the only remaining hit is the `import` line (6), delete that import line. If any other usage remains, leave it. (The `rel="storageDescription"` response **header** is emitted by `getAllHeaders`, not here — do not touch it.)

- [ ] **Step 6: Add an integration assertion for the linkset shape**

Append a describe block to `test/lws-type-index.test.js`:

```js
describe('linkset describedby = declared shape (not storage description)', () => {
  let base, token;
  const SHAPE_URL = () => `${base}/alice/shapes/Note`;
  before(async () => {
    await startTestServer({ lws: true });
    base = getBaseUrl();
    const p = await createTestPod('alice'); token = p.token;
    await fetch(`${base}/alice/shapes/Note`, { method: 'PUT',
      headers: { 'Content-Type': 'application/ld+json', Authorization: `Bearer ${token}` }, body: '{}' });
    await fetch(`${base}/alice/doc1`, { method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: '{}' });
    await fetch(`${base}/alice/doc1.meta`, { method: 'PUT',
      headers: { 'Content-Type': 'application/ld+json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ '@id': `${base}/alice/doc1`,
        'http://www.w3.org/2007/05/powder-s#describedby': { '@id': `${base}/alice/shapes/Note` } }) });
  });
  after(async () => { await stopTestServer(); });

  it('constrained resource: linkset describedby is the shape; storageDescription stays a header', async () => {
    const r = await fetch(`${base}/alice/doc1`, { headers: { Accept: 'application/linkset+json', Authorization: `Bearer ${token}` } });
    const link = (await r.json()).linkset[0];
    assert.deepEqual(link.describedby, [{ href: SHAPE_URL() }]);
    assert.match(r.headers.get('link') || '', /rel="storageDescription"/);  // header unchanged
    assert.ok(!/lws-storage/.test(JSON.stringify(link.describedby)));         // storage-desc NOT under describedby
  });

  it('unconstrained resource: linkset omits describedby', async () => {
    await fetch(`${base}/alice/doc2`, { method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: '{}' });
    const r = await fetch(`${base}/alice/doc2`, { headers: { Accept: 'application/linkset+json', Authorization: `Bearer ${token}` } });
    const link = (await r.json()).linkset[0];
    assert.equal('describedby' in link, false);
  });
});
```

- [ ] **Step 7: Run both test files**

Run: `node --test test/lws-linkset.test.js test/lws-type-index.test.js`
Expected: PASS. (If the `storageDescription` header assertion fails, confirm `getAllHeaders` emits it on the linkset path — it did in L2; investigate rather than deleting the assertion.)

- [ ] **Step 8: Commit**

```bash
git add src/lws/linkset.js src/handlers/resource.js test/lws-linkset.test.js test/lws-type-index.test.js
git commit -m "$(cat <<'EOF'
[Agent: Claude] fix(lws): linkset describedby carries the shape, not storage-desc

- generateLinkset: describedByShapes[]; omit describedby when unconstrained
- both resource.js GET call sites read describedbyTargets from .meta
- storageDescription stays its own rel= header (unchanged); integration guard

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Wire the search handler — `describedby` filter over the authorized walk

**Files:**
- Modify: `src/handlers/type-index.js`
- Test (integration): `test/lws-type-index.test.js`

**Interfaces:**
- Consumes: `parseFilter`, `matchesFilter` (Task 2); `describedbyTargets` (Task 1); existing `authorizedResources` walk.
- Produces: `handleTypeSearch` filters with `parseFilter` + `matchesFilter`; `authorizedResources(request, {needDescribedby})` attaches `relations.describedby` only when the filter references it (skips the extra `.meta` read otherwise). `/types/index` and its handler are unchanged.

- [ ] **Step 1: Write failing integration tests**

Append to `test/lws-type-index.test.js`:

```js
describe('GET/POST /types/search — describedby indexed relation', () => {
  let base, token;
  before(async () => {
    await startTestServer({ lws: true });
    base = getBaseUrl();
    const p = await createTestPod('alice'); token = p.token;
    const auth = { Authorization: `Bearer ${token}` };
    await fetch(`${base}/alice/shapes/Note`, { method: 'PUT', headers: { 'Content-Type': 'application/ld+json', ...auth }, body: '{}' });
    await fetch(`${base}/alice/doc1`, { method: 'PUT', headers: { 'Content-Type': 'application/json', ...auth }, body: '{}' });
    await fetch(`${base}/alice/doc1.meta`, { method: 'PUT', headers: { 'Content-Type': 'application/ld+json', ...auth },
      body: JSON.stringify({ '@id': `${base}/alice/doc1`,
        'http://www.w3.org/2007/05/powder-s#describedby': { '@id': `${base}/alice/shapes/Note` } }) });
    await fetch(`${base}/alice/doc2`, { method: 'PUT', headers: { 'Content-Type': 'application/json', ...auth }, body: '{}' });
  });
  after(async () => { await stopTestServer(); });

  const ids = (page) => page.items.map((i) => i.id);
  const search = async (qs) => (await fetch(`${base}/types/search?${qs}`, { headers: { Authorization: `Bearer ${token}` } })).json();

  it('?describedby=<shape> returns the constrained resource, not the unconstrained one', async () => {
    const page = await search(`describedby=${encodeURIComponent(`${base}/alice/shapes/Note`)}`);
    assert.ok(ids(page).some((u) => u.endsWith('/alice/doc1')));
    assert.ok(!ids(page).some((u) => u.endsWith('/alice/doc2')));
  });

  it('?describedby=<other-shape> returns nothing (empty, not error)', async () => {
    const r = await fetch(`${base}/types/search?describedby=${encodeURIComponent(`${base}/alice/shapes/Nope`)}`,
      { headers: { Authorization: `Bearer ${token}` } });
    assert.equal(r.status, 200);
    assert.equal((await r.json()).items.length, 0);
  });

  it('type AND describedby compose', async () => {
    const dr = encodeURIComponent('https://www.w3.org/ns/lws#DataResource');
    const sh = encodeURIComponent(`${base}/alice/shapes/Note`);
    const page = await search(`type=${dr}&describedby=${sh}`);
    assert.ok(ids(page).some((u) => u.endsWith('/alice/doc1')));
  });

  it('an unindexed relation key yields empty (no-oracle), status 200', async () => {
    const r = await fetch(`${base}/types/search?madeup=${encodeURIComponent(`${base}/alice/shapes/Note`)}`,
      { headers: { Authorization: `Bearer ${token}` } });
    assert.equal(r.status, 200);
    assert.equal((await r.json()).items.length, 0);
  });

  it('POST equivalent of describedby filter matches GET', async () => {
    const sh = `${base}/alice/shapes/Note`;
    const post = await (await fetch(`${base}/types/search`, { method: 'POST',
      headers: { 'Content-Type': 'application/lws+json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ '@context': 'https://www.w3.org/ns/lws/v1', describedby: [sh] }) })).json();
    assert.ok(post.items.some((i) => i.id.endsWith('/alice/doc1')));
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `node --test test/lws-type-index.test.js`
Expected: FAIL — the handler still uses `parseTypeFilter`/`matchesTypeFilter`; `describedby` is ignored so `doc2` leaks into the first test and the unindexed test returns everything.

- [ ] **Step 3: Implement the handler wiring**

In `src/handlers/type-index.js`:

Update imports (line 4–5):

```js
import { readDeclaredTypes } from '../lws/type-metadata.js';
import { resourceTypes, buildTypeIndex, parseFilter, matchesFilter, containerItemTypes, FilterError } from '../lws/type-index.js';
import { describedbyTargets } from '../lws/constraint.js';
```

(`parseTypeFilter`/`matchesTypeFilter` are no longer imported here — they remain exported for the unit tests and `parseTypeFilter`'s own callers.)

Replace `authorizedResources` (lines ~50–65):

```js
async function authorizedResources(request, { needDescribedby = false } = {}) {
  const { webId: agentWebId } = await getWebIdFromRequestAsync(request).catch(() => ({ webId: null }));
  const aclCache = new Map();
  const resources = await walkResources('/');
  const out = [];
  for (const r of resources) {
    const id = buildResourceUrl(request, r.urlPath);
    const { allowed } = await checkAccess({
      resourceUrl: id, resourcePath: r.urlPath,
      isContainer: r.isDirectory, agentWebId, requiredMode: AccessMode.READ, aclCache,
    });
    if (!allowed) continue;
    const declared = await readDeclaredTypes(storage, r.urlPath);
    const entry = { id, types: resourceTypes({ isDirectory: r.isDirectory, declared }) };
    if (needDescribedby) {
      entry.relations = { describedby: await describedbyTargets(storage, r.urlPath + '.meta', id) };
    }
    out.push(entry);
  }
  return out;
}
```

Replace the filter/match section of `handleTypeSearch` (the `cnf` parse block and the two lines after the `catch`) so it uses `parseFilter`/`matchesFilter`:

```js
export async function handleTypeSearch(request, reply) {
  let filter;
  try {
    if (request.method === 'POST') {
      const ct = (request.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
      if (ct !== LWS_JSON) {
        return reply.code(415).type('application/problem+json')
          .send({ type: 'about:blank', status: 415, title: 'Unsupported Media Type' });
      }
      let body;
      if (Buffer.isBuffer(request.body)) body = JSON.parse(request.body.toString('utf8') || '{}');
      else if (typeof request.body === 'string') body = JSON.parse(request.body || '{}');
      else if (request.body && typeof request.body === 'object') body = request.body;
      else body = {};
      filter = parseFilter({ body });
    } else {
      const q = new URLSearchParams(request.url.split('?')[1] || '');
      filter = parseFilter({ query: q });
    }
  } catch (e) {
    const status = e instanceof FilterError ? e.status : 400;
    return reply.code(status).type('application/problem+json')
      .send({ type: 'about:blank', status, title: 'Bad Request', detail: e.message });
  }

  const needDescribedby = Object.keys(filter.relations).length > 0;
  const resources = await authorizedResources(request, { needDescribedby });
  const matched = resources.filter((r) => matchesFilter(r, filter));
  reply.header('Cache-Control', 'private, no-store');
  reply.type(LWS_JSON);
  return reply.send(JSON.stringify({
    '@context': LWS_CONTEXT, type: 'ContainerPage', totalItems: matched.length,
    items: matched.map((r) => ({ id: r.id, type: containerItemTypes(r.types) })),
  }, null, 2));
}
```

Note `handleTypeIndex`/`authorizedTypeLists` are unchanged — `/types/index` never resolves relations.

- [ ] **Step 4: Run to verify pass**

Run: `node --test test/lws-type-index.test.js`
Expected: PASS (new describedby-search block + the existing type-search/index blocks + the Task-3 linkset block).

- [ ] **Step 5: Commit**

```bash
git add src/handlers/type-index.js test/lws-type-index.test.js
git commit -m "$(cat <<'EOF'
[Agent: Claude] feat(lws): index describedby as a Type-Search relation filter

- handleTypeSearch uses parseFilter/matchesFilter (type + describedby CNF)
- authorizedResources resolves describedby targets only when filtered on
- unindexed relation → empty (no-oracle); GET/POST equivalent

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Full fork suite + merge to `la3d/lws`

**Files:** none (verification + merge).

- [ ] **Step 1: Run the full fork suite serially**

Run: `node --test --test-concurrency=1 'test/*.test.js'`
Expected: all pass (baseline was 1102/1102; this adds the new unit/integration tests). If anything unrelated is red, STOP and investigate — do not merge over a regression.

- [ ] **Step 2: Whole-branch review gate**

Per the solo-dev model, run an opus whole-branch review of `la3d/lws-indexed-relation` vs `la3d/lws` (subagent-driven-development handles this between tasks; if executing inline, request a review before merging). Address any Important findings with a follow-up commit, then re-run Step 1.

- [ ] **Step 3: Merge --no-ff into `la3d/lws` and push**

```bash
git checkout la3d/lws
git merge --no-ff la3d/lws-indexed-relation -m "$(cat <<'EOF'
merge: LWS indexed-relation filter (describedby) into la3d/lws

- describedbyTargets read helper; parseFilter/matchesFilter (type + relations)
- linkset describedby now carries the shape (bug fix); /types/search indexes describedby

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
git rev-parse --short HEAD          # RECORD this merge SHA — needed for Task 6
git push origin la3d/lws la3d/lws-indexed-relation
```

Record the merge SHA (call it `<MERGE_SHA>`); Task 6 pins the container to it.

---

### Task 6: lws-pod live-pod gate

**Files (in `/Users/cvardema/dev/git/LA3D/agents/lws-pod`):**
- Create: `tests/lws-indexed-relation.test.mjs`
- Modify: `Makefile` (add `test-indexed-relation`)
- Modify: `Dockerfile.fork` and/or `docker-compose.fork-tls.yml` (re-pin `JSS_GIT_REF` to `<MERGE_SHA>`)

**Interfaces:**
- Consumes: `tests/helpers.mjs` (`BASE`, `ensurePod`, `getToken`); the running fork `--lws` TLS pod at `https://pod.vardeman.me`.
- Produces: a Vitest gate that self-skips on a non-`--lws` pod (top-level storage-description probe, same pattern as `lws-typeindex.test.mjs`).

- [ ] **Step 1: Re-pin the fork container to the merge SHA**

Find the current pin and update it to `<MERGE_SHA>`:

```bash
cd /Users/cvardema/dev/git/LA3D/agents/lws-pod
grep -rn "JSS_GIT_REF\|dc770ca\|6cd5d9b\|fork-l2_5" Dockerfile.fork docker-compose.fork-tls.yml
```

Update the default `JSS_GIT_REF` (and the image tag, e.g. `fork-indexed-rel`) to `<MERGE_SHA>` in the same place the L2.5-hardening pin lives.

- [ ] **Step 2: Write the live gate**

Create `tests/lws-indexed-relation.test.mjs`:

```js
import { describe, it, beforeAll, expect } from 'vitest'
import { BASE, ensurePod, getToken } from './helpers.mjs'

// Indexed-relation live gate — describedby filter + linkset describedby, against
// the running FORK pod (--lws). Self-skips on a non-lws pod: TypeSearchService
// must be advertised (mirrors lws-typeindex/lws-admission/lws-discovery gates).
const sd = await fetch(`${BASE}/.well-known/lws-storage`, { headers: { Accept: 'application/lws+json' } })
  .then(r => (r.ok ? r.json() : {})).catch(() => ({}))
const hasSearch = (sd.service || []).some(s => s.type === 'TypeSearchService')

const DESCRIBEDBY = 'http://www.w3.org/2007/05/powder-s#describedby'

describe.skipIf(!hasSearch)('LWS indexed-relation (describedby)', () => {
  let token, shape, doc
  beforeAll(async () => {
    await ensurePod()
    ;({ token } = await getToken())
    const auth = { Authorization: `Bearer ${token}` }
    shape = `${BASE}/alice/shapes/IdxNote`
    doc = `${BASE}/alice/idx-doc1`
    await fetch(shape, { method: 'PUT', headers: { 'Content-Type': 'application/ld+json', ...auth }, body: '{}' })
    await fetch(doc, { method: 'PUT', headers: { 'Content-Type': 'application/json', ...auth }, body: '{}' })
    const meta = await fetch(`${doc}.meta`, { method: 'PUT', headers: { 'Content-Type': 'application/ld+json', ...auth },
      body: JSON.stringify({ '@id': doc, [DESCRIBEDBY]: { '@id': shape } }) })
    expect([200, 201, 204]).toContain(meta.status)
    await fetch(`${BASE}/alice/idx-doc2`, { method: 'PUT', headers: { 'Content-Type': 'application/json', ...auth }, body: '{}' })
  })

  it('?describedby=<shape> returns the constrained doc, excludes the unconstrained one', async () => {
    const r = await fetch(`${BASE}/types/search?describedby=${encodeURIComponent(shape)}`, { headers: { Authorization: `Bearer ${token}` } })
    expect(r.status).toBe(200)
    const ids = (await r.json()).items.map(i => i.id)
    expect(ids.some(u => u.endsWith('/alice/idx-doc1'))).toBe(true)
    expect(ids.some(u => u.endsWith('/alice/idx-doc2'))).toBe(false)
  })

  it('?describedby=<unknown-shape> → empty, status 200', async () => {
    const r = await fetch(`${BASE}/types/search?describedby=${encodeURIComponent(shape + 'X')}`, { headers: { Authorization: `Bearer ${token}` } })
    expect(r.status).toBe(200)
    expect((await r.json()).items.length).toBe(0)
  })

  it('an unindexed relation key → empty, status 200 (no-oracle)', async () => {
    const r = await fetch(`${BASE}/types/search?madeup=${encodeURIComponent(shape)}`, { headers: { Authorization: `Bearer ${token}` } })
    expect(r.status).toBe(200)
    expect((await r.json()).items.length).toBe(0)
  })

  it('the constrained doc linkset carries describedby=<shape> (not storage-desc)', async () => {
    const r = await fetch(doc, { headers: { Accept: 'application/linkset+json', Authorization: `Bearer ${token}` } })
    const link = (await r.json()).linkset[0]
    expect(link.describedby).toEqual([{ href: shape }])
    expect(JSON.stringify(link.describedby)).not.toContain('lws-storage')
    expect(r.headers.get('link') || '').toMatch(/rel="storageDescription"/)
  })
})
```

- [ ] **Step 3: Add the Makefile target**

After the `test-typeindex:` target in `Makefile`, add:

```makefile
test-indexed-relation:
	@[ -d node_modules ] || npm ci
	@[ -f certs/rootCA.pem ] || { echo "certs/rootCA.pem missing — run 'make cert && make up-fork-tls' first"; exit 1; }
	BASE=https://pod.vardeman.me NODE_EXTRA_CA_CERTS=certs/rootCA.pem npx vitest run tests/lws-indexed-relation.test.mjs
```

- [ ] **Step 4: Rebuild the pinned fork pod and run the full live gate**

```bash
cd /Users/cvardema/dev/git/LA3D/agents/lws-pod
make cert 2>/dev/null || true
make up-fork-tls
curl --cacert certs/rootCA.pem https://pod.vardeman.me/.well-known/lws-storage   # sanity: services advertised
make test-indexed-relation
make test-typeindex        # no L2.5 regression on the repinned pod
make test-l3               # no L3 regression
make test-lws              # no L2 regression
```

Expected: `test-indexed-relation` all green; `test-typeindex`/`test-l3`/`test-lws` unchanged (no regression on the repinned image).

- [ ] **Step 5: Commit (in lws-pod)**

```bash
git add tests/lws-indexed-relation.test.mjs Makefile Dockerfile.fork docker-compose.fork-tls.yml
git commit -m "$(cat <<'EOF'
[Agent: Claude] test(lws): live gate for indexed-relation describedby filter

- tests/lws-indexed-relation.test.mjs + make test-indexed-relation
- repin fork container to the indexed-relation merge SHA
- verified: gate green; no L2/L3/L2.5 regression on the repinned pod

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: Update FOLLOWUP + close out

**Files (in lws-pod):**
- Modify: `FOLLOWUP.md`

- [ ] **Step 1: Add a DONE block to FOLLOWUP.md**

At the top of the `▶▶ 2026-06-29/07-01` section, add an `▶ INDEXED-RELATION DONE + MERGED` block recording: the merge SHA into `la3d/lws`; the two surfaces (linkset describedby fixed to the shape; `/types/search` indexes `describedby`); the fork suite count; the live gate result (`make test-indexed-relation` + no regressions); and update the "NEXT" pointer from "indexed-relation / Plan 2 / L4" to "**Plan 2 / L4 NEXT**" (indexed-relation now done). Note the still-deferred carryover: `conformsTo`/PROF (Plan 2), general relation-capture path, container `items[].type` describedby enrichment, pagination.

- [ ] **Step 2: Commit**

```bash
cd /Users/cvardema/dev/git/LA3D/agents/lws-pod
git add FOLLOWUP.md
git commit -m "$(cat <<'EOF'
[Agent: Claude] docs(followup): indexed-relation describedby filter shipped

- linkset describedby fixed + /types/search indexes describedby (merged to la3d/lws)
- NEXT is now Plan 2 / L4; conformsTo/PROF + capture path stay deferred

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Self-Review

**Spec coverage:**
- §2 scope item 1 (fix read surface) → Task 3. §2 scope item 2 (search surface) → Tasks 2+4. §3 (omit when unconstrained) → Task 3 Step 1/3. §4.1 `describedbyTargets` → Task 1. §4.2 generalized filter + allowlist + no-oracle → Task 2. §4.3 global caps → Task 2 (`pushGroups` shared budget) + test. §4.4 handler → Task 4. §4.5 linkset generator + call sites → Task 3. §4.6 wiring/gate → Tasks 4+6. §6 authorization unchanged → Task 4 (walk/`checkAccess` untouched). §8 testing (unit + live gate) → Tasks 1–4 + 6. §7 deferred → recorded, not built (Task 7 note). All covered.
- Descriptive-only rule (§1/§spec): satisfied by construction — `INDEXED_RELATIONS = {describedby}`; structural relations never enter the allowlist → `hasUnindexed` → empty. Verified by the `madeup=` tests (Task 4 Step 1, Task 6 Step 2).

**Placeholder scan:** none — every code step carries complete code; `<MERGE_SHA>` is an explicit recorded value from Task 5 Step 3, not a placeholder.

**Type consistency:** `describedbyTargets(storage, metaPath, baseIri) → string[]` defined in Task 1, consumed with that exact signature in Task 3 (call sites) and Task 4 (handler). `parseFilter → {type, relations, hasUnindexed}` and `matchesFilter(resource, filter)` defined in Task 2, consumed in Task 4 with matching shapes (`resource = {id, types, relations}`). `generateLinkset(..., {describedByShapes})` defined in Task 3, no other caller. Consistent throughout.
