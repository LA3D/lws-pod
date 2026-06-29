# LWS L1 — `lws+json` container representation + conneg Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make our JSS fork serve a W3C-LWS-conformant `application/lws+json` container representation (`items[]`) via content negotiation, gated behind a `--lws` flag, with a `rel="up"` Link header — purely additive over the existing LDP behavior.

**Architecture:** Add a pure `generateLwsContainer()` alongside the existing `generateContainerJsonLd()` in `src/ldp/container.js`; register `application/lws+json` as a negotiable output type in `src/rdf/conneg.js`; gate it with a `--lws` flag wired exactly like `--conneg`; in the container-GET path of `src/handlers/resource.js`, when `--lws` is on AND the client negotiates `application/lws+json`, serve the LWS representation and add `Link: <parent>; rel="up"`. Default responses (no `Accept: application/lws+json`, or `--lws` off) are byte-for-byte unchanged.

**Tech Stack:** Node ESM, Fastify, `commander` (CLI), `node:test` + `node:assert` (tests), `fs-extra` storage. No new dependencies.

## Global Constraints

- **Work in the fork**, not lws-pod: `~/dev/git/LA3D/JavaScriptSolidServer`. Branch `la3d/lws-container` off `la3d/main` (pinned to upstream `0f4287f` / 0.0.210). Never commit to `la3d/main` directly (it stays a pristine upstream pin for rebasing).
- **Additive only.** No change to default LDP/Solid behavior. The LWS representation is reachable *only* when `--lws` is enabled AND the request sends `Accept: application/lws+json`. Do not touch PUT/POST semantics (the `feature/lws-mode` PUT restriction was reverted upstream — "LWS allows PUT").
- **Spec ground truth** is the `lws-protocol` skill in lws-pod: `references/lws10-core/container-representation.md` and `logicalresourceorganization.md`. Container MUST carry `@context: "https://www.w3.org/ns/lws/v1"`, `id`, `type: "Container"`, `totalItems` (integer), `items[]`; each item MUST have `id` + `type` (`"Container"`/`"DataResource"`), DataResources MUST have `mediaType`, SHOULD have `size`/`modified`. Term IRIs: `items`→`lws:items`, `Container`→`lws#Container`, `DataResource`→`lws#DataResource`, `totalItems`→`as:totalItems`, `mediaType`→`as:mediaType`, `size`→`schema:size`, `modified`→`as:updated`.
- **Pagination is DEFERRED** to a later plan: emit the full `items[]` as a single page; do not implement `ContainerPage`/`first`/`next` yet. Leave a `// TODO(lws-pagination)` marker. (Logged here so it isn't mistaken for "done.")
- **Test command:** `npm test` runs `node --test --test-concurrency=1 'test/*.test.js'`. Single file: `node --test test/<file>.test.js`.
- **Commit trailer:** `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

---

### Task 0: Branch setup

**Files:** none (git only)

- [ ] **Step 1: Create the working branch off the pristine pin**

```bash
cd ~/dev/git/LA3D/JavaScriptSolidServer
git checkout la3d/main && git checkout -b la3d/lws-container
npm install   # first time in the fork; installs fastify, commander, autocannon, etc.
```

- [ ] **Step 2: Confirm the baseline is green before touching anything**

Run: `npm test`
Expected: existing suite passes (this is our regression baseline; if anything is already red, note it and stop).

---

### Task 1: `generateLwsContainer()` pure function

**Files:**
- Modify: `src/ldp/container.js` (add export alongside `generateContainerJsonLd`)
- Test: `test/lws-container.test.js` (new)

**Interfaces:**
- Consumes: container entries shaped `{ name: string, isDirectory: boolean, size?: number, modified?: string }` — the exact output of `src/storage/filesystem.js:listContainer`.
- Produces: `generateLwsContainer(containerUrl: string, entries: Entry[]) -> object` — a JSON object ready to `JSON.stringify`. Reuses the existing `isHiddenEntry` dotfile filter.

- [ ] **Step 1: Write the failing test**

Create `test/lws-container.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateLwsContainer } from '../src/ldp/container.js';

const C = 'http://localhost:3000/alice/notes/';
const entries = [
  { name: 'a.ttl', isDirectory: false, size: 12, modified: '2026-06-29T00:00:00.000Z' },
  { name: 'sub', isDirectory: true, size: 4096, modified: '2026-06-29T00:00:00.000Z' },
  { name: '.acl', isDirectory: false, size: 1 },        // hidden — must NOT appear
];

test('LWS container: required top-level shape', () => {
  const c = generateLwsContainer(C, entries);
  assert.equal(c['@context'], 'https://www.w3.org/ns/lws/v1');
  assert.equal(c.id, C);
  assert.equal(c.type, 'Container');
  assert.equal(c.totalItems, 2);                         // .acl filtered out
  assert.ok(Array.isArray(c.items));
  assert.equal(c.items.length, 2);
});

test('LWS container: item typing + DataResource mediaType', () => {
  const c = generateLwsContainer(C, entries);
  const data = c.items.find(i => i.id === C + 'a.ttl');
  const cont = c.items.find(i => i.id === C + 'sub/');
  assert.equal(data.type, 'DataResource');
  assert.equal(data.mediaType, 'text/turtle');           // from extension
  assert.equal(data.size, 12);
  assert.equal(data.modified, '2026-06-29T00:00:00.000Z');
  assert.equal(cont.type, 'Container');
  assert.equal(cont.id.endsWith('/'), true);             // containers get a trailing slash
});

test('LWS container: hidden entries are excluded (no .acl leak)', () => {
  const c = generateLwsContainer(C, entries);
  assert.equal(c.items.some(i => i.id.endsWith('.acl')), false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/lws-container.test.js`
Expected: FAIL — `generateLwsContainer` is not exported.

- [ ] **Step 3: Implement `generateLwsContainer`**

In `src/ldp/container.js`, add `import mime from 'mime-types';` at the top (the package is already a dependency), and append this export (reuse the existing `isHiddenEntry` already defined in the file):

```js
const LWS_CONTEXT = 'https://www.w3.org/ns/lws/v1';

/**
 * Generate the W3C LWS container representation (application/lws+json).
 * Additive sibling of generateContainerJsonLd — items[] instead of ldp:contains.
 * Pagination deferred: emits the full membership as a single page.
 * @param {string} containerUrl
 * @param {Array<{name:string,isDirectory:boolean,size?:number,modified?:string}>} entries
 * @returns {object}
 */
export function generateLwsContainer(containerUrl, entries) {
  const baseUrl = containerUrl.endsWith('/') ? containerUrl : containerUrl + '/';
  const items = entries.filter(e => !isHiddenEntry(e.name)).map(e => {
    const id = baseUrl + e.name + (e.isDirectory ? '/' : '');
    const item = { id, type: e.isDirectory ? 'Container' : 'DataResource' };
    if (!e.isDirectory) item.mediaType = mime.lookup(e.name) || 'application/octet-stream';
    if (e.size != null) item.size = e.size;
    if (e.modified) item.modified = e.modified;
    return item;
  });
  // TODO(lws-pagination): emit ContainerPage with first/next/prev/last when membership is large.
  return { '@context': LWS_CONTEXT, id: baseUrl, type: 'Container', totalItems: items.length, items };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/lws-container.test.js`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/ldp/container.js test/lws-container.test.js
git commit -m "$(printf 'feat(lws): generateLwsContainer (items[] representation)\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

### Task 2: Register `application/lws+json` in content negotiation

**Files:**
- Modify: `src/rdf/conneg.js`
- Test: `test/lws-conneg.test.js` (new)

**Interfaces:**
- Consumes: existing `selectContentType(acceptHeader, connegEnabled)`.
- Produces: `RDF_TYPES.LWS_JSON === 'application/lws+json'`; `selectContentType` returns it when the client explicitly requests it (independent of the Turtle conneg flag — LWS is always a distinct negotiable target, since it's JSON-LD).

- [ ] **Step 1: Write the failing test**

Create `test/lws-conneg.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { selectContentType, RDF_TYPES } from '../src/rdf/conneg.js';

test('lws+json is a known RDF type', () => {
  assert.equal(RDF_TYPES.LWS_JSON, 'application/lws+json');
});

test('explicit Accept: application/lws+json is selected', () => {
  assert.equal(selectContentType('application/lws+json', false), 'application/lws+json');
});

test('absent lws+json, behavior is unchanged (defaults to JSON-LD)', () => {
  assert.equal(selectContentType('text/turtle', false), RDF_TYPES.JSON_LD); // conneg off
  assert.equal(selectContentType('application/ld+json', false), RDF_TYPES.JSON_LD);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/lws-conneg.test.js`
Expected: FAIL — `RDF_TYPES.LWS_JSON` undefined.

- [ ] **Step 3: Implement**

In `src/rdf/conneg.js`: add `LWS_JSON: 'application/lws+json'` to the `RDF_TYPES` object. Then in `selectContentType`, add a check **before** the `connegEnabled` gate so lws+json is negotiable regardless of the Turtle flag:

```js
export function selectContentType(acceptHeader, connegEnabled = false) {
  // LWS container media type is always negotiable when explicitly requested
  // (it is JSON-LD with the lws/v1 context — no Turtle conneg required).
  if (acceptHeader && acceptHeader.toLowerCase().includes(RDF_TYPES.LWS_JSON)) {
    return RDF_TYPES.LWS_JSON;
  }
  // ... existing body unchanged ...
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/lws-conneg.test.js`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/rdf/conneg.js test/lws-conneg.test.js
git commit -m "$(printf 'feat(lws): negotiate application/lws+json\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

### Task 3: `--lws` flag + request decoration

**Files:**
- Modify: `bin/jss.js` (add the `.option`)
- Modify: `src/server.js` (read option, decorate request — mirror `connegEnabled` exactly)
- Test: `test/lws-flag.test.js` (new, if `createServer` is unit-testable; otherwise fold the assertion into Task 5's e2e)

**Interfaces:**
- Produces: `request.lwsEnabled: boolean`, defaulting `false`, set from `options.lws`.

- [ ] **Step 1: Add the CLI flag**

In `bin/jss.js`, next to the other `.option(...)` calls (the `--conneg` option is the model), add:

```js
  .option('--lws', 'Enable the W3C Linked Web Storage surface (application/lws+json containers)')
```

Ensure the parsed `options.lws` is threaded into the `createServer(options)` call the same way `conneg` is (follow `--conneg` from `bin/jss.js` into the server options object).

- [ ] **Step 2: Decorate the request in `src/server.js`**

Mirror the three `connegEnabled` lines:
- near `const connegEnabled = options.conneg ?? false;` add `const lwsEnabled = options.lws ?? false;`
- near `fastify.decorateRequest('connegEnabled', null);` add `fastify.decorateRequest('lwsEnabled', null);`
- near `request.connegEnabled = connegEnabled;` (in the onRequest/preHandler hook) add `request.lwsEnabled = lwsEnabled;`

- [ ] **Step 3: Verify nothing breaks**

Run: `npm test`
Expected: full suite still PASSES (the flag is inert until Task 4 reads it).

- [ ] **Step 4: Commit**

```bash
git add bin/jss.js src/server.js
git commit -m "$(printf 'feat(lws): --lws flag + request.lwsEnabled decoration\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

### Task 4: Serve the LWS representation in the container-GET path + `rel="up"`

**Files:**
- Modify: `src/handlers/resource.js` (the container branch around lines 300–386: `generateContainerJsonLd` → `selectContentType` → `serializeJsonLd`/`reply.send`)

**Interfaces:**
- Consumes: `generateLwsContainer` (Task 1), `RDF_TYPES.LWS_JSON` + `selectContentType` (Task 2), `request.lwsEnabled` (Task 3).

- [ ] **Step 1: Locate the container-GET branch**

In `src/handlers/resource.js`, find where a container is rendered: `const jsonLd = generateContainerJsonLd(resourceUrl, entries || []);` (~line 300) and the later `selectContentType(acceptHeader, true)` (~339) + `return reply.send(serializeJsonLd(jsonLd));` (~386). Read the surrounding ~90 lines so the edit fits the existing reply/header flow.

- [ ] **Step 2: Add the LWS branch (additive)**

Add `generateLwsContainer` and `RDF_TYPES` to the existing imports from `../ldp/container.js` and `../rdf/conneg.js`. In the container branch, **before** the existing LDP serialization, insert:

```js
// LWS container representation — only when enabled AND explicitly negotiated.
if (request.lwsEnabled && selectContentType(acceptHeader, request.connegEnabled) === RDF_TYPES.LWS_JSON) {
  const lws = generateLwsContainer(resourceUrl, entries || []);
  // rel="up" to the parent container (omit for the storage root, which has no parent)
  const parent = parentContainerUrl(resourceUrl); // see Step 3
  if (parent) reply.header('Link', `<${parent}>; rel="up"`);
  reply.header('Content-Type', RDF_TYPES.LWS_JSON);
  reply.header('Vary', 'Accept, Authorization, Origin');
  return reply.send(JSON.stringify(lws, null, 2));
}
// ... existing LDP path unchanged below ...
```

- [ ] **Step 3: Add the `parentContainerUrl` helper**

If no equivalent exists in `src/utils/url.js`, add it there and import it. The storage root returns `null`:

```js
export function parentContainerUrl(url) {
  const u = url.endsWith('/') ? url.slice(0, -1) : url;
  const i = u.lastIndexOf('/');
  if (i <= u.indexOf('://') + 2) return null; // at/above origin root
  return u.slice(0, i + 1);
}
```

- [ ] **Step 4: Verify the existing suite still passes (no default-path regression)**

Run: `npm test`
Expected: PASS — default (non-lws+json) container GETs are byte-identical to before.

- [ ] **Step 5: Commit**

```bash
git add src/handlers/resource.js src/utils/url.js
git commit -m "$(printf 'feat(lws): serve lws+json containers + rel=up when --lws + negotiated\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

### Task 5: End-to-end conformance test (the L0 harness, now green)

**Files:**
- Test: `test/lws-conformance.test.js` (new) — boots the server with `--lws`, writes a resource, GETs the container as `application/lws+json`.

**Interfaces:**
- Consumes: `createServer` from `src/server.js`. Follow the existing `test/container.test.js` / `test/conneg.test.js` for the exact boot + request idiom in this repo (port handling, `fastify.inject` vs a real listen, auth setup). Use whichever those use; the assertions below are transport-agnostic.

- [ ] **Step 1: Write the e2e conformance test**

Model the server boot on `test/container.test.js`. Then assert the LWS contract against a container that has at least one member:

```js
// boot a server with { lws: true } (+ whatever container.test.js passes), create
// /alice/notes/ with one member note.ttl, then:
const res = await get('/alice/notes/', { Accept: 'application/lws+json' });
assert.equal(res.headers['content-type'].split(';')[0], 'application/lws+json');
assert.match(res.headers['link'] || '', /rel="up"/);
const body = JSON.parse(res.body);
assert.equal(body['@context'], 'https://www.w3.org/ns/lws/v1');
assert.equal(body.type, 'Container');
assert.equal(typeof body.totalItems, 'number');
assert.ok(body.items.some(i => i.id.endsWith('note.ttl') && i.type === 'DataResource' && i.mediaType));

// negative control: without --lws OR without the Accept, the response is still LDP
const ldp = await get('/alice/notes/', { Accept: 'application/ld+json' });
assert.ok(JSON.parse(ldp.body).contains, 'default GET must remain LDP ldp:contains');
```

- [ ] **Step 2: Run it (red until wired correctly), then the full suite**

Run: `node --test test/lws-conformance.test.js`
Expected: PASS. Then `npm test` — whole suite PASS (LWS additions + zero regressions).

- [ ] **Step 3: Commit**

```bash
git add test/lws-conformance.test.js
git commit -m "$(printf 'test(lws): e2e container conformance (items[], rel=up, lws+json) + LDP negative control\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

- [ ] **Step 4: Push the branch (do NOT touch la3d/main)**

```bash
git push -u origin la3d/lws-container
```

---

## What L1 delivers / what it does NOT

**Delivers:** a JSS fork that serves spec-conformant `application/lws+json` `items[]` containers (with `rel="up"`) via content negotiation behind `--lws`, with default LDP behavior provably unchanged (negative control in Task 5).

**Explicitly NOT in L1** (later plans / layers): `ContainerPage` pagination; the per-resource linkset (`rel="up"`/`describedBy` as an `application/linkset+json` resource); the Storage Description + `/.well-known/lws-configuration`; the Type Index/Search; the S3 storage backend; any PUT/POST semantic changes. These are L2+ per the design doc's layering.

## Self-review notes

- Spec coverage: container `@context`/`type`/`totalItems`/`items[]` + item `id`/`type`/`mediaType`/`size`/`modified` (Task 1); `application/lws+json` media type (Task 2); `rel="up"` (Task 4) — all from `container-representation.md`/`logicalresourceorganization.md`. Pagination intentionally deferred (Global Constraints).
- Type consistency: `generateLwsContainer`, `RDF_TYPES.LWS_JSON`, `request.lwsEnabled`, `parentContainerUrl` are defined once and consumed by name in later tasks.
- Additivity guarantee is itself tested (Task 5 negative control), so a regression in default LDP output fails the suite.
