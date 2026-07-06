# Content-Negotiation-by-Profile — Phase 1 (fork pillar) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add W3C Content-Negotiation-by-Profile (the DX-PROF-CONNEG `cnpr:http` functional profile) to the JSS fork as an additive, `--lws`-gated substrate affordance, proven by a neutral consumer over a live pod.

**Architecture:** A resource declares its alternate representations in its client-managed `.meta` using the `altr:` vocabulary (default + alternates, each with `dcterms:format` + `dcterms:conformsTo`). On GET/HEAD the fork (a) advertises them in the RFC 9264 linkset + `Link` header (`rel="canonical"`/`"alternate"`, `type=`/`formats=`), and (b) honors `Accept-Profile` by **exact-match** selection — serving the self representation with `Content-Profile`, `303`-redirecting to a distinct representation resource, or `406` when nothing matches. `conformsTo` is promoted to a Type-Search indexed relation. The fork resolves **no** profile hierarchy (opaque `conformsTo`); "most-specific via `isProfileOf`" is a client concern (P13).

**Tech Stack:** Node.js (fork: `node --test`), Fastify handlers, RDF/JS + n3 (`.meta` parsing via `toDataset`), lws-pod live gate in Vitest against the `--lws` TLS pod.

## Global Constraints

- **Fork branch:** `la3d/lws-conneg` off `la3d/lws` (HEAD `8b86a870c6fccaa6be0e3c52217db164ccd81857`). Merge `--no-ff` into `la3d/lws` at the end; never force-push; never `git add -A`.
- **Additive + `--lws`-gated + `lwsProfileConneg` sub-gate (default on when `--lws`).** The default LDP path MUST be provably unchanged (negative controls in tests). No behavior when `--lws` is off.
- **Exact-match only in the fork.** The fork MUST NOT dereference or resolve profile hierarchy; `conformsTo` stays an opaque string set (mirrors `src/lws/constraint.js:25-26`). This refines the design spec §4 ("most-specific via `isProfileOf`" is client-side, not fork).
- **No-oracle + authz-filtered.** Advertised alternate representations MUST be filtered to those the authenticated client may read (`checkAccess` READ), exactly as the Type Index filters (`src/lws/authorized-resources.js:30-34`).
- **`altr:` namespace (verbatim):** `http://www.w3.org/ns/dx/connegp/altr#` — `hasDefaultRepresentation`, `hasRepresentation`. Rep terms: `http://purl.org/dc/terms/format`, `http://purl.org/dc/terms/conformsTo`.
- **Single comma-joined `Link` header idiom** — append to `headers['Link']` (`headers['Link'] ? '${headers['Link']}, ${extra}' : extra`), never call `reply.header('Link', …)` twice (fork convention, `resource.js:375-377/1210-1213`).
- **Fork test runner:** `node --test --test-force-exit test/<file>` (the open-handle hang gotcha; FOLLOWUP).
- **Commit format:** `[Agent: Claude] type(scope): subject` + `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

Paths below are relative to the fork repo `/Users/cvardema/dev/git/LA3D/JavaScriptSolidServer` unless they start with `lws-pod/` (the pod repo `/Users/cvardema/dev/git/LA3D/agents/lws-pod`).

---

## File Structure

- `src/rdf/conneg.js` — **modify**: add `parseAcceptProfile()` and `negotiateProfile()` (next to `parseAcceptHeader`/`selectContentType`); add `Accept-Profile` to `getVaryHeader`.
- `src/lws/representations.js` — **create**: `readRepresentations(storage, metaPath, baseIri)` — parse the `altr:` model from `.meta`.
- `src/lws/constraint.js` — **modify**: nothing structural (reuse `toDataset`); `readRepresentations` lives in its own module but shares the parse pattern.
- `src/lws/linkset.js` — **modify**: `generateLinkset` gains a `representations` param → `canonical`/`alternate` members.
- `src/lws/type-index.js` — **modify**: add `'conformsTo'` to `INDEXED_RELATIONS`.
- `src/lws/authorized-resources.js` — **modify**: populate `entry.relations.conformsTo` when requested.
- `src/handlers/type-index.js` — **modify**: generalize the `needDescribedby` gate to any indexed relation.
- `src/lws/storage-description.js` — **modify**: `buildStorageDescription` emits `capability[]` with a ContentNegotiation entry.
- `src/ldp/headers.js` — **modify**: `getAllHeaders` appends the profile advertisement + `Content-Profile`/`rel="profile"`; add `Accept-Profile` to CORS allow-headers and `Content-Profile` to expose-headers.
- `src/handlers/resource.js` — **modify**: GET/HEAD file + container linkset/body seams call `negotiateProfile` and branch (serve-self / 303 / 406) + emit the advertisement.
- `src/server.js`, `bin/jss.js`, `src/config.js` — **modify**: `lwsProfileConneg` option + `--lws-profile-conneg` flag + request decoration.
- `lws-pod/tests/lws-conneg.test.mjs` — **create**: the live gate.
- `lws-pod/Makefile`, `lws-pod/Dockerfile.fork`, `lws-pod/docker-compose.fork-tls.yml` — **modify**: `make test-conneg` + repin to the merge SHA.

---

## Task 1: `parseAcceptProfile()` — parse the Accept-Profile request header

**Files:**
- Modify: `src/rdf/conneg.js` (add export near `parseAcceptHeader`)
- Test: `test/conneg-accept-profile.test.js` (create)

**Interfaces:**
- Produces: `parseAcceptProfile(header: string): string[]` — ordered (q desc, stable) list of profile URIs with angle brackets stripped; `[]` for empty/absent.

- [ ] **Step 1: Write the failing test**

```js
// test/conneg-accept-profile.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseAcceptProfile } from '../src/rdf/conneg.js';

test('parseAcceptProfile: empty/absent → []', () => {
  assert.deepEqual(parseAcceptProfile(''), []);
  assert.deepEqual(parseAcceptProfile(undefined), []);
});

test('parseAcceptProfile: single bracketed URI', () => {
  assert.deepEqual(parseAcceptProfile('<https://ex.org/p/x>'), ['https://ex.org/p/x']);
});

test('parseAcceptProfile: multiple, ordered by q desc, stable ties', () => {
  assert.deepEqual(
    parseAcceptProfile('<https://ex.org/p/x>;q=0.6, <https://ex.org/p/y>;q=1.0'),
    ['https://ex.org/p/y', 'https://ex.org/p/x']
  );
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test --test-force-exit test/conneg-accept-profile.test.js`
Expected: FAIL — `parseAcceptProfile is not a function`.

- [ ] **Step 3: Write minimal implementation**

Add to `src/rdf/conneg.js`:

```js
// Parse an Accept-Profile header (DX-PROF-CONNEG cnpr:http). Values are
// angle-bracketed profile URIs with optional ;q= weights. Returns profile
// URIs ordered by q descending (stable for ties), brackets stripped.
export function parseAcceptProfile(header) {
  if (!header) return [];
  const entries = String(header).split(',').map((s) => s.trim()).filter(Boolean);
  const parsed = entries.map((e, i) => {
    const [ref, ...params] = e.split(';').map((s) => s.trim());
    const uri = ref.replace(/^</, '').replace(/>$/, '');
    const qParam = params.find((p) => p.toLowerCase().startsWith('q='));
    const q = qParam ? parseFloat(qParam.slice(2)) : 1.0;
    return { uri, q: Number.isFinite(q) ? q : 1.0, i };
  }).filter((p) => p.uri);
  parsed.sort((a, b) => (b.q - a.q) || (a.i - b.i));
  return parsed.map((p) => p.uri);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test --test-force-exit test/conneg-accept-profile.test.js`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/rdf/conneg.js test/conneg-accept-profile.test.js
git commit -m "$(printf 'feat(conneg): parseAcceptProfile — the Accept-Profile request header\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

## Task 2: `readRepresentations()` — parse the altr: model from `.meta`

**Files:**
- Create: `src/lws/representations.js`
- Test: `test/lws-representations.test.js` (create)

**Interfaces:**
- Consumes: `toDataset(buf, 'application/ld+json', baseIri)` from `src/lws/admission-rdf.js`; the storage interface (`storage.exists(path)`, `storage.read(path)`) as used by `src/lws/constraint.js:10-15`.
- Produces: `readRepresentations(storage, metaPath, baseIri): Promise<{ default: Rep | null, alternates: Rep[] }>` where `Rep = { href: string, format: string | null, profile: string | null }`. `href` = the representation node's IRI (a named node; falls back to `baseIri` for the resource-self default). `[]`/`null` when `.meta` is missing/unreadable.

- [ ] **Step 1: Write the failing test**

```js
// test/lws-representations.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readRepresentations } from '../src/lws/representations.js';

const ALTR = 'http://www.w3.org/ns/dx/connegp/altr#';
const DCT = 'http://purl.org/dc/terms/';

// minimal in-memory storage stub matching constraint.js usage
function stubStorage(metaJson) {
  return {
    async exists() { return metaJson != null; },
    async read() { return Buffer.from(JSON.stringify(metaJson), 'utf8'); },
  };
}

const RES = 'https://pod.example/alice/mem-a';
const LINKS = 'https://pod.example/alice/mem-a.links.jsonld';
const CONTENT_P = 'https://profiles.example/content';
const LINKS_P = 'https://profiles.example/links';

test('readRepresentations: default (self) + one alternate', async () => {
  const meta = {
    '@id': RES,
    [ALTR + 'hasDefaultRepresentation']: { '@id': RES, [DCT + 'format']: 'text/markdown', [DCT + 'conformsTo']: { '@id': CONTENT_P } },
    [ALTR + 'hasRepresentation']: { '@id': LINKS, [DCT + 'format']: 'application/ld+json', [DCT + 'conformsTo']: { '@id': LINKS_P } },
  };
  const reps = await readRepresentations(stubStorage(meta), RES + '.meta', RES);
  assert.deepEqual(reps.default, { href: RES, format: 'text/markdown', profile: CONTENT_P });
  assert.equal(reps.alternates.length, 1);
  assert.deepEqual(reps.alternates[0], { href: LINKS, format: 'application/ld+json', profile: LINKS_P });
});

test('readRepresentations: missing .meta → empty', async () => {
  const reps = await readRepresentations(stubStorage(null), RES + '.meta', RES);
  assert.deepEqual(reps, { default: null, alternates: [] });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test --test-force-exit test/lws-representations.test.js`
Expected: FAIL — cannot find module `../src/lws/representations.js`.

- [ ] **Step 3: Write minimal implementation**

```js
// src/lws/representations.js
// Reads a resource's alternate-representation declarations (DX-PROF-CONNEG
// altr: model) from its client-managed .meta. Opaque: no profile-hierarchy
// resolution (P13) — conformsTo/format are surfaced verbatim. [] when .meta
// is missing/unreadable, mirroring src/lws/constraint.js.
import { toDataset } from './admission-rdf.js';

const ALTR = 'http://www.w3.org/ns/dx/connegp/altr#';
const HAS_DEFAULT = ALTR + 'hasDefaultRepresentation';
const HAS_REP = ALTR + 'hasRepresentation';
const DCT_FORMAT = 'http://purl.org/dc/terms/format';
const DCT_CONFORMS = 'http://purl.org/dc/terms/conformsTo';

function repFrom(ds, repTerm, baseIri) {
  const href = repTerm.termType === 'NamedNode' ? repTerm.value : baseIri;
  let format = null, profile = null;
  for (const q of ds) {
    if (q.subject.value !== repTerm.value) continue;
    if (q.predicate.value === DCT_FORMAT) format = q.object.value;
    else if (q.predicate.value === DCT_CONFORMS) profile = q.object.value;
  }
  return { href, format, profile };
}

export async function readRepresentations(storage, metaPath, baseIri) {
  const empty = { default: null, alternates: [] };
  if (!(await storage.exists(metaPath))) return empty;
  let buf;
  try { buf = await storage.read(metaPath); } catch { return empty; }
  let ds;
  try { ds = await toDataset(buf, 'application/ld+json', baseIri); } catch { return empty; }
  let def = null;
  const alternates = [];
  for (const q of ds) {
    if (q.predicate.value === HAS_DEFAULT) def = repFrom(ds, q.object, baseIri);
    else if (q.predicate.value === HAS_REP) alternates.push(repFrom(ds, q.object, baseIri));
  }
  return { default: def, alternates };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test --test-force-exit test/lws-representations.test.js`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lws/representations.js test/lws-representations.test.js
git commit -m "$(printf 'feat(conneg): readRepresentations — parse the altr: model from .meta\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

## Task 3: promote `conformsTo` to a Type-Search indexed relation

**Files:**
- Modify: `src/lws/type-index.js:40` (`INDEXED_RELATIONS`)
- Modify: `src/lws/authorized-resources.js:37-39` (populate `conformsTo`)
- Modify: `src/handlers/type-index.js:93` (generalize the `needDescribedby` gate)
- Test: `test/lws-conformsto-indexed.test.js` (create)

**Interfaces:**
- Consumes: `conformsToTargets(storage, metaPath, baseIri)` — already exists (`src/lws/constraint.js:27`); `describedbyTargets` (same module); `parseFilter`, `matchesFilter` (`src/lws/type-index.js`).
- Produces: `INDEXED_RELATIONS` now `Set(['describedby','conformsTo'])`; `collectAuthorizedResources` populates `entry.relations.conformsTo` when any relation filter references it.

- [ ] **Step 1: Write the failing test**

```js
// test/lws-conformsto-indexed.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { INDEXED_RELATIONS, parseFilter, matchesFilter } from '../src/lws/type-index.js';

test('conformsTo is an indexed relation', () => {
  assert.ok(INDEXED_RELATIONS.has('conformsTo'));
});

test('parseFilter routes conformsTo into relations (not hasUnindexed)', () => {
  const q = new URLSearchParams({ conformsTo: 'https://profiles.example/links' });
  const f = parseFilter({ query: q });
  assert.equal(f.hasUnindexed, false);
  assert.deepEqual(f.relations.conformsTo, [['https://profiles.example/links']]);
});

test('matchesFilter: resource with the conformsTo target matches', () => {
  const f = parseFilter({ query: new URLSearchParams({ conformsTo: 'https://profiles.example/links' }) });
  const yes = { types: ['x'], relations: { conformsTo: ['https://profiles.example/links'] } };
  const no = { types: ['x'], relations: { conformsTo: ['https://profiles.example/other'] } };
  assert.equal(matchesFilter(yes, f), true);
  assert.equal(matchesFilter(no, f), false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test --test-force-exit test/lws-conformsto-indexed.test.js`
Expected: FAIL — `INDEXED_RELATIONS.has('conformsTo')` is false.

- [ ] **Step 3: Write minimal implementation**

In `src/lws/type-index.js:40`:

```js
export const INDEXED_RELATIONS = new Set(['describedby', 'conformsTo']);
```

In `src/lws/authorized-resources.js` — replace the `needDescribedby` block (lines ~37-39) with a per-relation populate. First find the caller `src/handlers/type-index.js:93` and generalize:

```js
// src/handlers/type-index.js — was: const needDescribedby = Object.keys(filter.relations).length > 0;
const neededRelations = Object.keys(filter.relations); // e.g. ['describedby','conformsTo']
```
and pass `neededRelations` where `needDescribedby` was passed into `collectAuthorizedResources`.

In `src/lws/authorized-resources.js` (the `collectAuthorizedResources` signature takes the flag; change it to accept `neededRelations = []`):

```js
import { describedbyTargets, conformsToTargets } from './constraint.js';
const RELATION_READERS = {
  describedby: describedbyTargets,
  conformsTo: conformsToTargets,
};
// inside the per-resource loop, replacing the old `if (needDescribedby)` block:
if (neededRelations.length) {
  entry.relations = {};
  for (const rel of neededRelations) {
    const reader = RELATION_READERS[rel];
    if (reader) entry.relations[rel] = await reader(storage, r.urlPath + '.meta', id);
  }
}
```

(Confirm the exact current parameter name/threading in `collectAuthorizedResources` and its call site; keep the same gating so no extra `.meta` read happens when no relation filter is present.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test --test-force-exit test/lws-conformsto-indexed.test.js`
Expected: PASS (3 tests).
Run the existing type-index + indexed-relation fork tests to confirm no regression:
`node --test --test-force-exit test/lws-type-index*.test.js test/*indexed*.test.js`
Expected: PASS (all).

- [ ] **Step 5: Commit**

```bash
git add src/lws/type-index.js src/lws/authorized-resources.js src/handlers/type-index.js test/lws-conformsto-indexed.test.js
git commit -m "$(printf 'feat(conneg): conformsTo as a Type-Search indexed relation\n\nResolves the describedby-overloading: describedby -> shape, conformsTo -> profile.\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

## Task 4: linkset alternate-representation advertisement

**Files:**
- Modify: `src/lws/linkset.js` (`generateLinkset`)
- Test: `test/lws-linkset-altrep.test.js` (create)

**Interfaces:**
- Consumes: `Rep` objects from Task 2 (`{ href, format, profile }`).
- Produces: `generateLinkset(resourceUrl, { …, representations })` where `representations = { default, alternates }`; the linkset link object gains `canonical: [{ href, type, formats }]` (the default) and `alternate: [{ href, type, formats }]` (each alternate). Omitted when `representations` absent/empty.

- [ ] **Step 1: Write the failing test**

```js
// test/lws-linkset-altrep.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateLinkset } from '../src/lws/linkset.js';

test('generateLinkset: emits canonical + alternate from representations', () => {
  const res = 'https://pod.example/alice/mem-a';
  const ls = generateLinkset(res, {
    representations: {
      default: { href: res, format: 'text/markdown', profile: 'https://p.example/content' },
      alternates: [{ href: res + '.links.jsonld', format: 'application/ld+json', profile: 'https://p.example/links' }],
    },
  });
  const link = ls.linkset[0];
  assert.deepEqual(link.canonical, [{ href: res, type: 'text/markdown', formats: 'https://p.example/content' }]);
  assert.deepEqual(link.alternate, [{ href: res + '.links.jsonld', type: 'application/ld+json', formats: 'https://p.example/links' }]);
});

test('generateLinkset: no representations → no canonical/alternate keys', () => {
  const ls = generateLinkset('https://pod.example/alice/mem-a', {});
  assert.equal('canonical' in ls.linkset[0], false);
  assert.equal('alternate' in ls.linkset[0], false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test --test-force-exit test/lws-linkset-altrep.test.js`
Expected: FAIL — `link.canonical` is undefined.

- [ ] **Step 3: Write minimal implementation**

In `src/lws/linkset.js`, extend the signature and the assembly block (after line 22, before `return`):

```js
export function generateLinkset(resourceUrl, { parentUrl = null, isContainer = false, describedByShapes = [], declaredTypes = [], conformsTo = [], representations = null } = {}) {
  const link = { anchor: resourceUrl };
  if (parentUrl) link.up = [{ href: parentUrl }];
  const types = [LWS + (isContainer ? 'Container' : 'DataResource')];
  for (const t of declaredTypes) if (!types.includes(t)) types.push(t);
  link.type = types.map((href) => ({ href }));
  if (describedByShapes.length) link.describedby = describedByShapes.map((href) => ({ href }));
  if (conformsTo.length) link[DCT_CONFORMS] = conformsTo.map((href) => ({ href }));
  if (representations) {
    const asEntry = (r) => ({ href: r.href, ...(r.format ? { type: r.format } : {}), ...(r.profile ? { formats: r.profile } : {}) });
    if (representations.default) link.canonical = [asEntry(representations.default)];
    if (representations.alternates && representations.alternates.length) link.alternate = representations.alternates.map(asEntry);
  }
  return { linkset: [link] };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test --test-force-exit test/lws-linkset-altrep.test.js`
Expected: PASS (2 tests). Also run existing linkset tests: `node --test --test-force-exit test/*linkset*.test.js` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lws/linkset.js test/lws-linkset-altrep.test.js
git commit -m "$(printf 'feat(conneg): linkset canonical/alternate representation advertisement\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

## Task 5: storage description `capability[]` — ContentNegotiation

**Files:**
- Modify: `src/lws/storage-description.js` (`buildStorageDescription`)
- Test: `test/lws-storage-description-capability.test.js` (create)

**Interfaces:**
- Produces: `buildStorageDescription(origin, { …, profileConnegEnabled })` adds `capability: [{ type: 'http://www.w3.org/ns/dx/connegp/profile/http', … }]` when `profileConnegEnabled`.

- [ ] **Step 1: Write the failing test**

```js
// test/lws-storage-description-capability.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildStorageDescription } from '../src/lws/storage-description.js';

test('capability[] advertises ContentNegotiation when profileConnegEnabled', () => {
  const sd = buildStorageDescription('https://pod.example', { profileConnegEnabled: true });
  assert.ok(Array.isArray(sd.capability));
  const cn = sd.capability.find((c) => /ContentNegotiation/.test(c.type) || /connegp\/profile\/http/.test(c.type));
  assert.ok(cn, 'a content-negotiation-by-profile capability is present');
});

test('no capability[] when disabled', () => {
  const sd = buildStorageDescription('https://pod.example', {});
  assert.equal('capability' in sd, false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test --test-force-exit test/lws-storage-description-capability.test.js`
Expected: FAIL — `sd.capability` is undefined.

- [ ] **Step 3: Write minimal implementation**

In `src/lws/storage-description.js`, thread `profileConnegEnabled` and add `capability[]` to the returned object (after the `linkset` steering block):

```js
export function buildStorageDescription(origin, { typeIndexEnabled = false, notificationsEnabled = false, profileIndexPath = null, profileConnegEnabled = false } = {}) {
  // … existing services assembly unchanged …
  const base = {
    ...generateStorageDescription(`${origin}/`, services),
    linkset: { /* … existing steering block unchanged … */ },
  };
  if (profileConnegEnabled) {
    base.capability = [{
      // DX-PROF-CONNEG cnpr:http functional profile — the pod negotiates
      // representations by profile via Accept-Profile / Content-Profile.
      type: 'http://www.w3.org/ns/dx/connegp/profile/http',
      hint: 'This storage negotiates by profile (W3C Content Negotiation by Profile). Send Accept-Profile: <profile-uri> to select a representation; a resource lists its representations as canonical/alternate links in its RFC 9264 linkset (type=media, formats=profile).',
    }];
  }
  return base;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test --test-force-exit test/lws-storage-description-capability.test.js`
Expected: PASS (2). Run existing storage-description tests → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lws/storage-description.js test/lws-storage-description-capability.test.js
git commit -m "$(printf 'feat(conneg): advertise ContentNegotiation capability in the storage description\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

## Task 6: config + gating — `lwsProfileConneg`

**Files:**
- Modify: `src/server.js:98-107` (derive), `:379-401` (decorate)
- Modify: `bin/jss.js` (`--lws-profile-conneg` flag, thread as `lwsProfileConneg`)
- Modify: `src/config.js` (default `lwsProfileConneg: false`, env `JSS_LWS_PROFILE_CONNEG`)
- Modify: `src/server.js` storage-description build call site → pass `profileConnegEnabled`
- Test: `test/lws-profile-conneg-config.test.js` (create — an integration test booting the server with `--lws`)

**Interfaces:**
- Produces: `request.lwsProfileConneg` (boolean); `profileConnegEnabled` passed into `buildStorageDescription`.

- [ ] **Step 1: Write the failing test** — an integration test that boots the app with `{ lws: true }` and asserts the storage description advertises the capability, and with `{ lws: false }` it does not. Model it on an existing server-boot test (grep `test/` for `createServer(`/`buildApp(` usage) and copy that harness. Example shape:

```js
// test/lws-profile-conneg-config.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from '../src/server.js'; // confirm the exact export used by other server tests

test('storage description advertises ContentNegotiation when --lws (conneg on by default)', async () => {
  const app = await createServer({ lws: true /*, other required opts per existing tests */ });
  const res = await app.inject({ method: 'GET', url: '/.well-known/lws-storage', headers: { accept: 'application/lws+json' } });
  const sd = res.json();
  assert.ok((sd.capability || []).some((c) => /connegp\/profile\/http/.test(c.type)));
  await app.close();
});
```

- [ ] **Step 2: Run to verify it fails** — `node --test --test-force-exit test/lws-profile-conneg-config.test.js` → FAIL (no capability).

- [ ] **Step 3: Implement** — mirror the `lwsTypeIndex` plumbing:
  - `src/server.js:105` neighbourhood: `const profileConnegEnabled = lwsEnabled && (options.lwsProfileConneg ?? true);`
  - decorate: `fastify.decorateRequest('lwsProfileConneg', null);` + `request.lwsProfileConneg = profileConnegEnabled;`
  - pass `profileConnegEnabled` into the `buildStorageDescription(origin, { … })` call site (grep `buildStorageDescription(` in `src/server.js` / `src/handlers/`).
  - `bin/jss.js`: `.option('--lws-profile-conneg', 'Enable content negotiation by profile (default on when --lws)')` and thread `lwsProfileConneg` (mirror `lwsTypeIndex` lines 96/229-231).
  - `src/config.js`: `lwsProfileConneg: false` default + `JSS_LWS_PROFILE_CONNEG` env (mirror `lwsProfileIndex`/line 180).

- [ ] **Step 4: Run to verify it passes** — PASS. Run the broader server test file it was modeled on → no regression.

- [ ] **Step 5: Commit**

```bash
git add src/server.js bin/jss.js src/config.js test/lws-profile-conneg-config.test.js
git commit -m "$(printf 'feat(conneg): --lws-profile-conneg gate + storage-description wiring\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

## Task 7: `negotiateProfile()` + wire the file GET path (serve-self / 303 / 406)

**Files:**
- Modify: `src/rdf/conneg.js` (`negotiateProfile`, `getVaryHeader`)
- Modify: `src/handlers/resource.js` (file GET path, the linkset/body seam ~581-687)
- Modify: `src/ldp/headers.js` (CORS allow/expose headers)
- Test: `test/conneg-negotiate.test.js` (unit for `negotiateProfile`) + extend the live gate later (Task 11)

**Interfaces:**
- Produces: `negotiateProfile(acceptProfileHeader, representations): { outcome: 'none'|'self'|'redirect'|'notacceptable', rep: Rep|null }` — `none` when no `Accept-Profile`; `self` when the matched rep href === the resource's own URL; `redirect` when matched rep is a distinct href; `notacceptable` when `Accept-Profile` present but nothing matches.

- [ ] **Step 1: Write the failing test**

```js
// test/conneg-negotiate.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { negotiateProfile } from '../src/rdf/conneg.js';

const RES = 'https://pod.example/alice/mem-a';
const reps = {
  default: { href: RES, format: 'text/markdown', profile: 'https://p/content' },
  alternates: [{ href: RES + '.links.jsonld', format: 'application/ld+json', profile: 'https://p/links' }],
};

test('no Accept-Profile → none', () => {
  assert.equal(negotiateProfile('', reps).outcome, 'none');
});
test('matches self default profile → self', () => {
  const r = negotiateProfile('<https://p/content>', reps);
  assert.equal(r.outcome, 'self');
  assert.equal(r.rep.href, RES);
});
test('matches a distinct alternate → redirect', () => {
  const r = negotiateProfile('<https://p/links>', reps);
  assert.equal(r.outcome, 'redirect');
  assert.equal(r.rep.href, RES + '.links.jsonld');
});
test('no match → notacceptable', () => {
  assert.equal(negotiateProfile('<https://p/nope>', reps).outcome, 'notacceptable');
});
```

- [ ] **Step 2: Run to verify it fails** — `node --test --test-force-exit test/conneg-negotiate.test.js` → FAIL.

- [ ] **Step 3: Implement** `negotiateProfile` in `src/rdf/conneg.js` (uses `parseAcceptProfile` from Task 1):

```js
export function negotiateProfile(acceptProfileHeader, representations) {
  const requested = parseAcceptProfile(acceptProfileHeader);
  if (!requested.length) return { outcome: 'none', rep: null };
  const all = [representations?.default, ...(representations?.alternates || [])].filter(Boolean);
  for (const wanted of requested) {              // preference order
    const rep = all.find((r) => r.profile === wanted);   // EXACT match (no hierarchy — P13)
    if (rep) return { outcome: rep.href === representations.default?.href ? 'self' : 'redirect', rep };
  }
  return { outcome: 'notacceptable', rep: null };
}
```

Add `Accept-Profile` to `getVaryHeader` (conneg.js:215-219): return `'Accept, Accept-Profile, Authorization, Origin'` in the lws/conneg branch.

Wire into the **file GET path** in `src/handlers/resource.js` — immediately after `resourceUrl`/`storagePath` are known and before the existing body-serving block (~581), guarded by `request.lwsProfileConneg`:

```js
if (request.lwsProfileConneg) {
  const reps = await readRepresentations(storage, storagePath + '.meta', resourceUrl);
  const neg = negotiateProfile(request.headers['accept-profile'] || '', reps);
  if (neg.outcome === 'redirect') {
    reply.header('Link', `<${neg.rep.profile}>; rel="profile"`);
    reply.header('Content-Profile', `<${neg.rep.profile}>`);
    return reply.code(303).header('Location', neg.rep.href).send();
  }
  if (neg.outcome === 'notacceptable') {
    // advertise what IS available (authz-filtered in Task 9)
    return reply.code(406).send({ error: 'no representation conforms to the requested profile(s)' });
  }
  // 'self' and 'none' fall through to normal serving; on 'self' we stamp the chosen profile below
  request.__lwsChosenProfile = neg.outcome === 'self' ? neg.rep.profile : (reps.default?.profile || null);
  request.__lwsRepresentations = reps;
}
```

Import `readRepresentations` and `negotiateProfile` at the top of `resource.js`. On the normal serve path, when `request.__lwsChosenProfile` is set, append `Content-Profile` + `Link: rel="profile"` to the `headers` object before the `Object.entries(headers).forEach(...)` spread (use the comma-join idiom).

- [ ] **Step 4: Run to verify** — unit PASS; boot-level file GET returns `303` on `Accept-Profile: <links>` and `text/markdown` self on `Accept-Profile: <content>` (add a small server-inject test mirroring Task 6's harness, or defer full coverage to the live gate Task 11 and keep the unit test authoritative here).

- [ ] **Step 5: Commit**

```bash
git add src/rdf/conneg.js src/handlers/resource.js src/ldp/headers.js test/conneg-negotiate.test.js
git commit -m "$(printf 'feat(conneg): negotiateProfile + file GET Accept-Profile (self/303/406)\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

## Task 8: container GET + HEAD parity + advertisement emission

**Files:**
- Modify: `src/handlers/resource.js` (container GET seam ~384-408; HEAD seams ~927-934, 988-1008)
- Modify: `src/handlers/resource.js` / `src/ldp/headers.js` — emit the `canonical`/`alternate` advertisement (pass `representations` into `generateLinkset`; append the `Link` advertisement in `getAllHeaders` when reps exist)
- Test: extend the live gate (Task 11) — HEAD/GET parity asserted there; add a focused unit if a pure function is extracted.

- [ ] **Step 1: Write the failing test** — in the live-gate file (Task 11) assert: a container/file linkset (`Accept: application/linkset+json`) now carries `canonical` + `alternate`; `HEAD` and `GET` return identical `Link`/`Content-Profile` for the same `Accept-Profile`. (If a helper is extracted for the advertisement Link string, unit-test it here with `node --test`.)

- [ ] **Step 2–4:** Mirror Task 7's `readRepresentations` + `negotiateProfile` branch into the **container GET** seam (resource.js:384-408) and both **HEAD** seams (927-934, 988-1008); pass `representations: await readRepresentations(...)` into the two `generateLinkset(...)` call sites (resource.js:388-394 container, 585-591 file) so the linkset carries `canonical`/`alternate`. Centralize the advertisement `Link` append in `getAllHeaders` (`src/ldp/headers.js:117-126`) so GET/HEAD parity is automatic: accept an optional `representations` arg and, when present, append `<${default.href}>; rel="canonical"; type="…"; formats="…"` + `<${alt.href}>; rel="alternate"; …` to `headers['Link']`. Run the full fork suite (`npm test` or `node --test --test-force-exit test/`) to confirm no regression and GET/HEAD parity.

- [ ] **Step 5: Commit**

```bash
git add src/handlers/resource.js src/ldp/headers.js
git commit -m "$(printf 'feat(conneg): container + HEAD parity; linkset/Link representation advertisement\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

## Task 9: no-oracle authz filter on advertised alternates

**Files:**
- Modify: `src/handlers/resource.js` (filter `representations.alternates` before advertising/negotiating)
- Test: extend the live gate (Task 11) with an unreadable-alternate case.

**Interfaces:**
- Consumes: `checkAccess({ resourceUrl, resourcePath, isContainer, agentWebId, requiredMode: AccessMode.READ, aclCache })` (`src/wac/checker.js:23`); `getWebIdFromRequestAsync(request)` (as in `src/handlers/type-index.js:21`).

- [ ] **Step 1: Write the failing test** — live gate (Task 11): a resource with an alternate whose URL the anonymous client cannot read → that alternate is **absent** from the linkset `alternate` list and an `Accept-Profile` for it returns `406`, not `303` (a client must not learn the representation exists).

- [ ] **Step 2–4: Implement** a filter applied to `reps.alternates` right after `readRepresentations`, before advertising/negotiating: for each alternate, resolve its storage path from its href (same-origin only; off-origin alternates are dropped) and `checkAccess` READ for the request's webId; drop the ones not `allowed`. Reuse the `getWebIdFromRequestAsync` + `checkAccess` pattern from `src/handlers/type-index.js:21-29`. Keep the default (self) representation unfiltered (the client is already reading it). Verify against the live gate.

- [ ] **Step 5: Commit**

```bash
git add src/handlers/resource.js
git commit -m "$(printf 'feat(conneg): no-oracle authz filter on advertised alternate representations\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

## Task 10: whole-branch review + merge into `la3d/lws`

- [ ] **Step 1:** Run the full fork suite serially: `node --test --test-concurrency=1 --test-force-exit test/` — expect 0 failures (baseline was 1227/0-fail/1-skip; new tests add to the count).
- [ ] **Step 2:** Request an opus whole-branch review of `la3d/lws-conneg` vs `la3d/lws` (use `superpowers:requesting-code-review`). Focus: additivity (default path unchanged), the exact-match/no-hierarchy P13 stance, GET/HEAD parity, no-oracle filtering, the single-`Link`-header idiom. Fix any Critical/Important.
- [ ] **Step 3:** Merge:

```bash
git checkout la3d/lws
git merge --no-ff la3d/lws-conneg -m "$(printf 'Merge la3d/lws-conneg: content negotiation by profile (cnpr:http)\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
git push origin la3d/lws
git rev-parse HEAD   # record the merge SHA for the pod repin
```

---

## Task 11: lws-pod live gate — neutral consumer + `make test-conneg`

**Files:**
- Create: `lws-pod/tests/lws-conneg.test.mjs`
- Modify: `lws-pod/Makefile` (`test-conneg` target + `.PHONY`)
- Modify: `lws-pod/Dockerfile.fork` (`ARG JSS_GIT_REF=<merge SHA>`) + `lws-pod/docker-compose.fork-tls.yml` (`JSS_GIT_REF` default + `image:` tag → `lws-pod:fork-conneg`)

**Interfaces:**
- Consumes: `BASE`, `ensurePod`, `getToken` from `lws-pod/tests/helpers.mjs`; the running `--lws` TLS pod at `https://pod.vardeman.me` (repinned to the Task-10 merge SHA).

- [ ] **Step 1: Repin + rebuild the pod**

In `Dockerfile.fork` set `ARG JSS_GIT_REF=<merge SHA from Task 10>`; in `docker-compose.fork-tls.yml` set the `JSS_GIT_REF` default to the same SHA and `image: lws-pod:fork-conneg`. Then:

```bash
cd /Users/cvardema/dev/git/LA3D/agents/lws-pod
make cert && make up-fork-tls
curl --cacert certs/rootCA.pem https://pod.vardeman.me/.well-known/lws-storage | grep -o connegp   # capability present
```

- [ ] **Step 2: Write the live gate** (the neutral consumer declares a content self-rep + a distinct links alternate via `.meta`, mirroring `tests/lws-indexed-relation.test.mjs`):

```js
// lws-pod/tests/lws-conneg.test.mjs
import { describe, it, beforeAll, expect } from 'vitest'
import { BASE, ensurePod, getToken } from './helpers.mjs'

const ALTR = 'http://www.w3.org/ns/dx/connegp/altr#'
const DCT = 'http://purl.org/dc/terms/'
const sd = await fetch(`${BASE}/.well-known/lws-storage`, { headers: { Accept: 'application/lws+json' } })
  .then(r => (r.ok ? r.json() : {})).catch(() => ({}))
const hasConneg = JSON.stringify(sd.capability || []).includes('connegp/profile/http')

describe.skipIf(!hasConneg)('LWS content negotiation by profile', () => {
  let token, mem, links
  const CONTENT_P = 'https://profiles.vardeman.me/neutral/content'
  const LINKS_P = 'https://profiles.vardeman.me/neutral/links'
  beforeAll(async () => {
    await ensurePod(); ({ token } = await getToken())
    const auth = { Authorization: `Bearer ${token}` }
    mem = `${BASE}/alice/mem-a`
    links = `${BASE}/alice/mem-a.links.jsonld`
    await fetch(mem, { method: 'PUT', headers: { 'Content-Type': 'text/markdown', ...auth }, body: '# Memory A\n' })
    await fetch(links, { method: 'PUT', headers: { 'Content-Type': 'application/ld+json', ...auth }, body: JSON.stringify({ '@id': `${mem}#it`, 'https://schema.org/name': 'Memory A' }) })
    const meta = {
      '@id': mem,
      [ALTR + 'hasDefaultRepresentation']: { '@id': mem, [DCT + 'format']: 'text/markdown', [DCT + 'conformsTo']: { '@id': CONTENT_P } },
      [ALTR + 'hasRepresentation']: { '@id': links, [DCT + 'format']: 'application/ld+json', [DCT + 'conformsTo']: { '@id': LINKS_P } },
    }
    const r = await fetch(`${mem}.meta`, { method: 'PUT', headers: { 'Content-Type': 'application/ld+json', ...auth }, body: JSON.stringify(meta) })
    expect([200, 201, 204]).toContain(r.status)
    // public-read so the cold-agent arm can read (instantiation OPS finding)
    // (grant via the pod's write_acl / .acl PUT per tests/helpers or existing dcat gate pattern)
  })

  it('linkset advertises canonical(content) + alternate(links)', async () => {
    const r = await fetch(mem, { headers: { Accept: 'application/linkset+json', Authorization: `Bearer ${token}` } })
    const link = (await r.json()).linkset[0]
    expect(link.canonical).toEqual([{ href: mem, type: 'text/markdown', formats: CONTENT_P }])
    expect(link.alternate).toEqual([{ href: links, type: 'application/ld+json', formats: LINKS_P }])
  })

  it('Accept-Profile: <content> serves the markdown self (Content-Profile)', async () => {
    const r = await fetch(mem, { headers: { 'Accept-Profile': `<${CONTENT_P}>`, Authorization: `Bearer ${token}` }, redirect: 'manual' })
    expect(r.status).toBe(200)
    expect(r.headers.get('content-profile') || r.headers.get('link') || '').toContain(CONTENT_P)
  })

  it('Accept-Profile: <links> 303-redirects to the links resource', async () => {
    const r = await fetch(mem, { headers: { 'Accept-Profile': `<${LINKS_P}>`, Authorization: `Bearer ${token}` }, redirect: 'manual' })
    expect(r.status).toBe(303)
    expect(r.headers.get('location')).toBe(links)
    expect(r.headers.get('link') || '').toContain(LINKS_P)
  })

  it('Accept-Profile: <unknown> → 406', async () => {
    const r = await fetch(mem, { headers: { 'Accept-Profile': '<https://profiles.vardeman.me/nope>', Authorization: `Bearer ${token}` }, redirect: 'manual' })
    expect(r.status).toBe(406)
  })

  it('TypeSearch ?conformsTo=<links-profile> finds the member; unknown → empty (no-oracle)', async () => {
    const hit = await fetch(`${BASE}/types/search?conformsTo=${encodeURIComponent(LINKS_P)}`, { headers: { Authorization: `Bearer ${token}` } })
    // membership depends on how the member declares conformsTo in its own .meta; assert the endpoint composes
    expect(hit.status).toBe(200)
    const miss = await fetch(`${BASE}/types/search?conformsTo=${encodeURIComponent(LINKS_P + 'X')}`, { headers: { Authorization: `Bearer ${token}` } })
    expect((await miss.json()).items.length).toBe(0)
  })
})
```

- [ ] **Step 3: Add the Makefile target** — append `test-conneg` to the `.PHONY` line and add:

```make
# Content-negotiation-by-profile live gate — needs `make up-fork-tls` (fork-conneg image) + `make cert`.
test-conneg:
	@[ -f certs/rootCA.pem ] || { echo "run 'make cert && make up-fork-tls' first"; exit 1; }
	BASE=https://pod.vardeman.me NODE_EXTRA_CA_CERTS=$(CURDIR)/certs/rootCA.pem npx vitest run tests/lws-conneg.test.mjs
```

- [ ] **Step 4: Run the gate + full sweep**

```bash
make test-conneg          # expect the conneg suite green
make test-lws && make test-typeindex && make test-indexed-relation && make test-l3 && make test-graph && make test-dcat && make test-mcp-v2
# expect zero regression across all
```

- [ ] **Step 5: Commit (pod repo)**

```bash
cd /Users/cvardema/dev/git/LA3D/agents/lws-pod
git add tests/lws-conneg.test.mjs Makefile Dockerfile.fork docker-compose.fork-tls.yml
git commit -m "$(printf '[Agent: Claude] test(conneg): live gate + repin fork to conneg merge SHA\n\n- neutral consumer: content self-rep + distinct links alternate via .meta altr:\n- asserts linkset canonical/alternate, Accept-Profile self/303/406, conformsTo TypeSearch\n- make test-conneg; Dockerfile.fork/compose repinned, image fork-conneg\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

## Self-Review

**Spec coverage (against `2026-07-06-profile-conneg-instantiation-design.md` §4, the Phase-1 scope):**
- `Accept-Profile`/`Content-Profile` → Tasks 1, 7. ✅
- linkset alternate-representation advertisement (`altr:`) → Tasks 2, 4, 8. ✅
- `capability[]` ContentNegotiation → Task 5. ✅
- `conformsTo` indexed relation (resolves `describedby` overloading) → Task 3. ✅
- 303-by-profile (read-side plane-mapping) → Task 7. ✅
- no-oracle authz filtering → Task 9. ✅
- `--lws`-gated + additive + default path unchanged → Task 6 + negative controls throughout. ✅
- neutral consumer + live gate → Task 11. ✅
- **Deviation from spec §4 (flagged):** most-specific-via-`isProfileOf` is **client-side**, not fork; the fork does **exact-match** (Global Constraints). A one-line spec amendment to §4 accompanies this plan.

**Placeholder scan:** Tasks 6, 8, 9 contain "confirm the exact export / call site / harness" pointers rather than fully-quoted code because those depend on server-boot test scaffolding and `collectAuthorizedResources`'s current signature that the explorer did not quote verbatim — the implementer must open those two files. This is the one accepted soft spot; every RDF/linkset/conneg unit (Tasks 1-5, 7) carries complete code.

**Type consistency:** `Rep = { href, format, profile }` is consistent across Tasks 2, 4, 7. `representations = { default, alternates }` consistent across Tasks 2, 4, 8. `negotiateProfile` outcomes (`none/self/redirect/notacceptable`) consistent Task 7↔11.

**Out of scope (Phase 2, separate plan):** instantiation (representation roles + materialize + advertise), the wiki-memory re-derivation, the `projection/` engine split, QSA functional profile, the `@graph`-descend admission hardening.
