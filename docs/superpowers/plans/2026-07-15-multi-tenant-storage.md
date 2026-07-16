# Multi-tenant Storage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the LWS storage-description / identity layer per-storage (each JSS named pod is its own self-describing LWS storage) while auth realm/audience stays origin-scoped, and stand up a live two-tenant (alice-public + bob-private) rig.

**Architecture:** A new fork-side resolver (`storageRootFor`) answers "which storage owns this URL" from a `lws:Storage` marker in each pod root's `.lwstypes` sidecar (first-segment fast path + cached marker check). Every identity surface that today derives from the request origin — the `storageDescription` Link, the description resource + its `id`/services, the referent uriSpaces, the navigator chrome — reroutes through that resolver to the owning storage. `/.well-known/lws-storage` degrades from "the one storage" to a WAC-filtered server index of storages. The lws-pod phase re-mints alice's uriSpace under `/alice/id/`, provisions a private bob storage, and adds a `make test-multitenant` live gate.

**Tech Stack:** Node.js, Fastify (fork `la3d/lws`); fork tests = `node:test` + `node:assert` (in-process Fastify on a random port, global `fetch`); lws-pod live gates = Vitest against the TLS rig; Docker/Caddy fork-TLS rig.

## Global Constraints

- **Fork branch:** `la3d/lws-multitenant` off `la3d/lws@9b084e9` (navigator round). Merge `--no-ff` into `la3d/lws` at the end of Phase A; image tag `lws-pod:fork-multitenant`.
- **Additive-only under `--lws`; default (no `--lws`) behavior must stay byte-identical.** Every fork task keeps/repeats the existing "`--lws` OFF → unchanged" assertion.
- **Auth realm/audience stays origin-scoped** — do NOT touch token validation, `aud`, `realm`, or the CID/OIDC suites (spec §5). The token layer is out of scope.
- **Storage-root marker:** `https://www.w3.org/ns/lws#Storage` in the pod root's `.lwstypes` (via `captureDeclaredTypes`), read via `readDeclaredTypes`. NOT `.meta`.
- **`--subdomains` + `--lws` stays hard-refused** (`src/server.js:131`). Path-mode only.
- **Commit format** (project CLAUDE.md): `[Agent: Claude] type(scope): subject` + `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`. Stage specific files, never `git add -A`, never force-push, never `--no-verify`.
- **Fork test command:** `node --test test/<file>.test.js` (add `--test-force-exit` only if a file leaks a handle). Full suite: `npm test`.
- **lws-pod live-gate command:** `BASE=https://pod.vardeman.me NODE_EXTRA_CA_CERTS=$(CURDIR)/certs/rootCA.pem npx vitest run tests/<file>.test.mjs`.
- **Anonymous rate limit ~60/min** on the live rig — space back-to-back live gates ~40s or authenticate (FOLLOWUP standing gotcha).
- **Spec of record:** `docs/superpowers/specs/2026-07-15-multi-tenant-storage-design.md`. Decisions referenced as D1–D8, acceptance as §4.

---

# Phase A — Fork (`la3d/lws-multitenant`)

## Task A1: `lws:Storage` vocab term + storage-root marker at provisioning

**Files:**
- Modify: `src/lws/context.js` (add the `Storage` term)
- Modify: `src/handlers/container.js:241` `createPodStructure` (write the marker)
- Modify: `src/server.js:1452` `createRootPodStructure` (write the marker)
- Test: `test/lws-storage-marker.test.js` (create)

**Interfaces:**
- Consumes: `captureDeclaredTypes(storage, storagePath, typeUris)` / `readDeclaredTypes(storage, storagePath)` from `src/lws/type-metadata.js` (existing).
- Produces: the constant `LWS_STORAGE = 'https://www.w3.org/ns/lws#Storage'` (export from `src/lws/type-metadata.js`); after provisioning, `readDeclaredTypes(storage, '/<pod>/')` includes `LWS_STORAGE`.

- [ ] **Step 1: Write the failing test**

```js
// test/lws-storage-marker.test.js
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startTestServer, stopTestServer, getStorage } from './helpers.js';
import { readDeclaredTypes, LWS_STORAGE } from '../src/lws/type-metadata.js';

describe('storage-root marker (lws:Storage in .lwstypes)', () => {
  let storage;
  before(async () => { storage = await startTestServer({ lws: true, provisionKeys: true }); });
  after(async () => { await stopTestServer(); });

  it('a freshly provisioned named pod root carries lws:Storage', async () => {
    // helpers.startLwsPod provisions /<name>/; assert the marker is present
    const types = await readDeclaredTypes(storage, '/alice/');
    assert.ok(types.includes(LWS_STORAGE), `expected lws:Storage in ${JSON.stringify(types)}`);
  });
});
```

Note: if `test/helpers.js` has no `getStorage()`/pod-provision hook returning the storage handle, use the existing `startLwsPod(t, 'alice')` helper and read via the server's storage; adapt the import to whatever `helpers.js` exposes (the report shows `startLwsPod` exists). Keep the assertion identical.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/lws-storage-marker.test.js`
Expected: FAIL — `readDeclaredTypes` returns `[]` (no marker written) or `LWS_STORAGE` export missing.

- [ ] **Step 3: Add the constant + vocab term**

In `src/lws/type-metadata.js`, add near the top:
```js
export const LWS_STORAGE = 'https://www.w3.org/ns/lws#Storage';
```
In `src/lws/context.js`, add to `LWS_CONTEXT_OBJECT` alongside `Container`/`DataResource`:
```js
  Storage: 'lws:Storage',
```

- [ ] **Step 4: Stamp the marker in `createPodStructure`**

In `src/handlers/container.js`, import and call `captureDeclaredTypes` right after the pod-root container is created (after `await storage.createContainer(podPath);` ~line 242):
```js
import { captureDeclaredTypes, LWS_STORAGE } from '../lws/type-metadata.js';
// ...
  await storage.createContainer(podPath);
  await captureDeclaredTypes(storage, podPath, [LWS_STORAGE]);   // storage-root marker (multi-tenant)
```

- [ ] **Step 5: Stamp the marker in `createRootPodStructure`**

In `src/server.js` `createRootPodStructure` (~line 1452), after the root containers are created, mark `/`:
```js
  const { captureDeclaredTypes, LWS_STORAGE } = await import('./lws/type-metadata.js');
  await captureDeclaredTypes(storage, '/', [LWS_STORAGE]);       // root-pod is its own storage
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `node --test test/lws-storage-marker.test.js`
Expected: PASS.
Then regression: `node --test test/lws-provisioning*.test.js test/lws-navigator*.test.js` (whatever provisioning tests exist) — Expected: PASS (marker is additive; `.lwstypes` is already hidden from listings by the nextfork round).

- [ ] **Step 7: Commit**

```bash
git add src/lws/context.js src/lws/type-metadata.js src/handlers/container.js src/server.js test/lws-storage-marker.test.js
git commit -m "$(cat <<'EOF'
[Agent: Claude] feat(lws): stamp lws:Storage marker on pod roots (.lwstypes)

- LWS_STORAGE const + Storage vocab term
- createPodStructure + createRootPodStructure write the marker at provisioning

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task A2: `storageRootFor` resolver (the spine)

**Files:**
- Create: `src/lws/storage-resolver.js`
- Test: `test/lws-storage-resolver.test.js`

**Interfaces:**
- Consumes: `readDeclaredTypes` + `LWS_STORAGE` (Task A1); a `storage` handle with `exists`/`read`.
- Produces:
  - `async storageRootFor(storage, urlPath) => string | null` — the owning storage root path (e.g. `'/alice/'`), or `null` when the path belongs to server scope (`/`, `/.well-known/...`, `/types/...`, or any first segment without the marker). In `--lws` path mode `urlPath` is the URL pathname.
  - `clearStorageRootCache()` — test hook to reset the module-level cache.

- [ ] **Step 1: Write the failing test**

```js
// test/lws-storage-resolver.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { storageRootFor, clearStorageRootCache } from '../src/lws/storage-resolver.js';
import { LWS_STORAGE } from '../src/lws/type-metadata.js';

// minimal fake storage: only /alice/ carries the marker
function fakeStorage(marked = new Set(['/alice/'])) {
  return {
    async exists(p) { return marked.has(p.replace(/\.lwstypes$/, '')) && p.endsWith('.lwstypes'); },
    async read(p) {
      const root = p.replace(/\.lwstypes$/, '');
      return marked.has(root) ? Buffer.from(JSON.stringify([LWS_STORAGE])) : null;
    },
  };
}

test('resolves a resource under a marked pod to its storage root', async () => {
  clearStorageRootCache();
  assert.equal(await storageRootFor(fakeStorage(), '/alice/notes/x.ttl'), '/alice/');
  assert.equal(await storageRootFor(fakeStorage(), '/alice/'), '/alice/');
});

test('server-scope paths resolve to null', async () => {
  clearStorageRootCache();
  const s = fakeStorage();
  assert.equal(await storageRootFor(s, '/'), null);
  assert.equal(await storageRootFor(s, '/.well-known/lws-storage'), null);
  assert.equal(await storageRootFor(s, '/types/index'), null);   // first seg 'types' has no marker
});

test('an unmarked first segment resolves to null (not every path is a pod)', async () => {
  clearStorageRootCache();
  assert.equal(await storageRootFor(fakeStorage(), '/bob/x'), null); // /bob/ not marked here
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/lws-storage-resolver.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the resolver**

```js
// src/lws/storage-resolver.js
import { readDeclaredTypes, LWS_STORAGE } from './type-metadata.js';

// cache: candidate-root path -> boolean (is a storage root). Reset via clearStorageRootCache.
const _isRoot = new Map();

export function clearStorageRootCache() { _isRoot.clear(); }

async function isStorageRoot(storage, rootPath) {
  if (_isRoot.has(rootPath)) return _isRoot.get(rootPath);
  let marked = false;
  try { marked = (await readDeclaredTypes(storage, rootPath)).includes(LWS_STORAGE); } catch { marked = false; }
  _isRoot.set(rootPath, marked);
  return marked;
}

/**
 * The owning storage root path for a URL path, or null for server scope.
 * Fast path: first segment -> `/<seg>/` candidate, verified by the marker
 * (cached). null when the path is `/`, a `.well-known`, or a first segment
 * with no lws:Storage marker.
 * @param {{exists:Function, read:Function}} storage
 * @param {string} urlPath  URL pathname (== storage path in --lws path mode)
 */
export async function storageRootFor(storage, urlPath) {
  if (!urlPath || urlPath === '/') return null;
  const segs = urlPath.split('/').filter(Boolean);
  if (!segs.length) return null;
  if (segs[0] === '.well-known') return null;
  const candidate = `/${segs[0]}/`;
  return (await isStorageRoot(storage, candidate)) ? candidate : null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/lws-storage-resolver.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lws/storage-resolver.js test/lws-storage-resolver.test.js
git commit -m "$(cat <<'EOF'
[Agent: Claude] feat(lws): storageRootFor resolver (first-segment + cached marker)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task A3: Per-storage config resolution (`podConfigFor`)

**Files:**
- Modify: `src/lws/pod-config.js` (add a per-storage factory)
- Modify: `src/server.js:113` (build a per-storage config resolver, decorate on request)
- Test: `test/lws-pod-config-per-storage.test.js`

**Interfaces:**
- Consumes: `storageRootFor` (A2); the existing `makePodConfig(storage, absPath)` reader (reads one pod resource, mtime+size cached, `.get()` → object or `{}`).
- Produces:
  - `makePodConfigResolver(storage, relConfigPath) => { for(storageRootPath) => { get(): Promise<object> } }` — returns a per-storage config handle whose `.get()` reads `<storageRootPath><relConfigPath>`; caches one reader per root. `relConfigPath` is the `--lws-config` value re-interpreted as **relative under each storage root** (e.g. `profiles/pod-config.jsonld`).
  - `request.podConfigFor(storageRootPath)` decorated helper returning `{get}`; `null` storageRoot → an empty-config handle (`.get()` → `{}`).

- [ ] **Step 1: Write the failing test**

```js
// test/lws-pod-config-per-storage.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makePodConfigResolver } from '../src/lws/pod-config.js';

function fakeStorage(files) {
  return {
    async exists(p) { return p in files; },
    async read(p) { return p in files ? Buffer.from(files[p]) : null; },
    async stat(p) { return { mtimeMs: 1, size: (files[p] || '').length }; },
  };
}

test('resolves each storage to its own config file', async () => {
  const files = {
    '/alice/profiles/pod-config.jsonld': JSON.stringify({ uriSpaces: [{ pathPrefix: '/alice/id/', container: '/alice/wiki/' }] }),
    '/bob/profiles/pod-config.jsonld':   JSON.stringify({ uriSpaces: [{ pathPrefix: '/bob/id/',   container: '/bob/wiki/' }] }),
  };
  const resolver = makePodConfigResolver(fakeStorage(files), 'profiles/pod-config.jsonld');
  const alice = await resolver.for('/alice/').get();
  const bob = await resolver.for('/bob/').get();
  assert.equal(alice.uriSpaces[0].pathPrefix, '/alice/id/');
  assert.equal(bob.uriSpaces[0].pathPrefix, '/bob/id/');
});

test('server scope (null root) returns empty config', async () => {
  const resolver = makePodConfigResolver(fakeStorage({}), 'profiles/pod-config.jsonld');
  assert.deepEqual(await resolver.for(null).get(), {});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/lws-pod-config-per-storage.test.js`
Expected: FAIL — `makePodConfigResolver` not exported.

- [ ] **Step 3: Implement `makePodConfigResolver`**

In `src/lws/pod-config.js`, add (reuse the existing `makePodConfig` per-root):
```js
export function makePodConfigResolver(storage, relConfigPath) {
  const byRoot = new Map();
  const empty = { get: async () => ({}) };
  return {
    for(storageRootPath) {
      if (!storageRootPath) return empty;
      if (!byRoot.has(storageRootPath)) {
        const abs = storageRootPath + relConfigPath.replace(/^\//, '');
        byRoot.set(storageRootPath, makePodConfig(storage, abs));
      }
      return byRoot.get(storageRootPath);
    },
  };
}
```

- [ ] **Step 4: Wire it into the server**

In `src/server.js` near line 113, keep the single `podConfig` (still used by the MCP plugin registration for now) and ADD the resolver; `options.lwsConfig` is now read as a **relative** path. If `options.lwsConfig` is absolute (legacy), take its basename-with-parent under root — for this round assume it is relative (the rig will pass `profiles/pod-config.jsonld`; see Phase B):
```js
const lwsConfigRel = lwsEnabled ? (options.lwsConfig ?? null) : null;
const podConfigResolver = lwsConfigRel ? makePodConfigResolver(storage, lwsConfigRel) : null;
```
Decorate + assign:
```js
fastify.decorateRequest('podConfigFor', null);
// inside the onRequest hook near request.podConfig = podConfig:
request.podConfigFor = (root) => podConfigResolver ? podConfigResolver.for(root) : { get: async () => ({}) };
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `node --test test/lws-pod-config-per-storage.test.js`
Expected: PASS. Then `npm test` for no regressions (the single `podConfig` still exists — nothing removed yet).

- [ ] **Step 6: Commit**

```bash
git add src/lws/pod-config.js src/server.js test/lws-pod-config-per-storage.test.js
git commit -m "$(cat <<'EOF'
[Agent: Claude] feat(lws): per-storage pod-config resolver (--lws-config as per-root path)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task A4: Per-storage `storageDescriptionUrl`, description `id`/services, `buildServerIndex`

**Files:**
- Modify: `src/lws/storage-description.js` (`storageDescriptionUrl`, `buildStorageDescription`, add `buildServerIndex`)
- Test: `test/lws-storage-description.test.js` (extend the existing unit file)

**Interfaces:**
- Consumes: nothing new (pure functions).
- Produces:
  - `storageDescriptionUrl(resourceUrl, storageRootPath)` — `${origin}${storageRootPath}lws-storage` when `storageRootPath` is truthy, else `${origin}/.well-known/lws-storage` (server index URL).
  - `buildStorageDescription(storageRootUrl, flags)` — first arg is now the **storage root URL** (absolute, trailing slash), used as `id` and as the base for every pod-scoped `serviceEndpoint`. (Rename the param; keep the flags object shape.)
  - `buildServerIndex(origin, storages)` — `{ '@context', id: origin+'/', type: 'ServerIndex', storage: [{ id, storageDescription }] }` where `storages` is `[{ root: '/alice/' }, ...]`.

- [ ] **Step 1: Write the failing tests**

```js
// append to test/lws-storage-description.test.js
import { storageDescriptionUrl, buildServerIndex } from '../src/lws/storage-description.js';

test('storageDescriptionUrl is per-storage when a root is given', () => {
  assert.equal(
    storageDescriptionUrl('http://h/alice/x.ttl', '/alice/'),
    'http://h/alice/lws-storage');
  assert.equal(
    storageDescriptionUrl('http://h/.well-known/x', null),
    'http://h/.well-known/lws-storage');
});

test('buildStorageDescription id + services are pod-scoped', () => {
  const d = buildStorageDescription('http://h/alice/', { typeIndexEnabled: true });
  assert.equal(d.id, 'http://h/alice/');
  const sd = d.service.find(s => s.type === 'StorageDescription');
  assert.equal(sd.serviceEndpoint, 'http://h/alice/lws-storage');
  const ti = d.service.find(s => s.type === 'TypeIndexService');
  assert.equal(ti.serviceEndpoint, 'http://h/alice/types/index');
});

test('buildServerIndex lists storages, not a Storage', () => {
  const idx = buildServerIndex('http://h', [{ root: '/alice/' }, { root: '/bob/' }]);
  assert.equal(idx.type, 'ServerIndex');
  assert.notEqual(idx.type, 'Storage');
  assert.deepEqual(idx.storage.map(s => s.id), ['http://h/alice/', 'http://h/bob/']);
  assert.equal(idx.storage[0].storageDescription, 'http://h/alice/lws-storage');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/lws-storage-description.test.js`
Expected: FAIL — `buildServerIndex` missing; `storageDescriptionUrl` arity/URL wrong; `id` is `origin/`.

- [ ] **Step 3: Rework `storage-description.js`**

`storageDescriptionUrl` (drop the "Single-storage assumption (L2)" JSDoc):
```js
export function storageDescriptionUrl(resourceUrl, storageRootPath = null) {
  if (!resourceUrl || !resourceUrl.includes('://')) throw new Error(`storageDescriptionUrl requires an absolute URL, got: ${resourceUrl}`);
  const origin = new URL(resourceUrl).origin;
  return storageRootPath ? `${origin}${storageRootPath}lws-storage` : `${origin}/.well-known/lws-storage`;
}
```
`buildStorageDescription` — change the first parameter name `origin` → `storageRootUrl` and build every endpoint from it. Compute a base without trailing slash for endpoint concatenation:
```js
export function buildStorageDescription(storageRootUrl, { typeIndexEnabled = false, /* …unchanged… */ } = {}) {
  const base = storageRootUrl.replace(/\/$/, '');           // e.g. http://h/alice
  const lwsStoragePath = `${base}/lws-storage`;
  const services = [{ type: 'StorageDescription', serviceEndpoint: lwsStoragePath }];
  if (typeIndexEnabled) {
    services.push({ type: 'TypeIndexService', serviceEndpoint: `${base}/types/index` });
    services.push({ type: 'TypeSearchService', serviceEndpoint: `${base}/types/search`, hint: /* unchanged */ });
  }
  // …notifications/profileIndex/void/mcp all use `${base}/…`; keep the hint strings verbatim…
  const doc = { ...generateStorageDescription(storageRootUrl, services), linkset: { /* unchanged */ } };
  // capability block unchanged
  return doc;
}
```
Note: MCP stays a single origin endpoint — keep `McpService.serviceEndpoint = ${origin}/mcp`. Derive `origin` inside from `new URL(storageRootUrl).origin` for the MCP endpoint only.

Add `buildServerIndex`:
```js
export function buildServerIndex(origin, storages = []) {
  return {
    '@context': LWS_CONTEXT,
    id: `${origin}/`,
    type: 'ServerIndex',
    storage: storages.map(s => ({
      id: `${origin}${s.root}`,
      storageDescription: `${origin}${s.root}lws-storage`,
    })),
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test test/lws-storage-description.test.js`
Expected: PASS. Existing tests in this file that asserted `id === origin/` or `serviceEndpoint` ending in `/.well-known/lws-storage` MUST be updated to the per-storage form — update them in this step (they encode the old single-storage invariant this task overturns).

- [ ] **Step 5: Commit**

```bash
git add src/lws/storage-description.js test/lws-storage-description.test.js
git commit -m "$(cat <<'EOF'
[Agent: Claude] feat(lws): per-storage description id/services + buildServerIndex

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task A5: Per-storage description route + server-index well-known

**Files:**
- Modify: `src/server.js:1067-1101` (the `/.well-known/lws-storage` route + add `/:pod/lws-storage`)
- Modify: `src/handlers/resource.js:804-834` (root view builds its `sd` from the owning storage) — deferred detail; here only the well-known + per-pod routes
- Test: `test/lws-storage-description-route.test.js` (extend)

**Interfaces:**
- Consumes: `storageRootFor` (A2), `request.podConfigFor` (A3), `buildStorageDescription`/`buildServerIndex`/`resolveStorageDescriptionInputs` (A4), directory-listing/WAC-filter to enumerate storages.
- Produces: `GET /<pod>/lws-storage` → that storage's description (`id = …/<pod>/`); `GET /.well-known/lws-storage` → `ServerIndex` roster (WAC-filtered).

- [ ] **Step 1: Write the failing tests**

```js
// append to test/lws-storage-description-route.test.js (inside a --lws ON describe with a provisioned alice pod)
it('GET /alice/lws-storage returns the per-storage description with id …/alice/', async () => {
  const res = await request('/alice/lws-storage', { headers: { Accept: 'application/lws+json' } });
  assertStatus(res, 200);
  const body = await res.json();
  assert.ok(body.id.endsWith('/alice/'), `id: ${body.id}`);
  assert.equal(body.type, 'Storage');
});

it('GET /.well-known/lws-storage is a ServerIndex roster, not a Storage', async () => {
  const res = await request('/.well-known/lws-storage', { headers: { Accept: 'application/lws+json' } });
  assertStatus(res, 200);
  const body = await res.json();
  assert.equal(body.type, 'ServerIndex');
  assert.ok(Array.isArray(body.storage));
  assert.ok(body.storage.some(s => s.id.endsWith('/alice/')));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/lws-storage-description-route.test.js`
Expected: FAIL — `/alice/lws-storage` 404s; `/.well-known/lws-storage` still returns `type: Storage`.

- [ ] **Step 3: Implement the routes**

In `src/server.js`, replace the well-known GET handler body to build a server index, and add a per-pod route. Enumerate storages by listing top-level container entries and keeping those whose root carries the marker, WAC-filtered for the requester (reuse `filterReadableEntries` from `src/lws/authorized-listing.js` + `storageRootFor`/`readDeclaredTypes`):
```js
fastify.get('/.well-known/lws-storage', async (request, reply) => {
  const origin = `${request.protocol}://${request.hostname}`;
  reply.header('Cache-Control', 'public, max-age=60');
  reply.type(storageDescriptionContentType(request.headers.accept));
  const roots = await listVisibleStorageRoots(storage, origin, request);   // WAC-filtered, marker-gated
  return buildServerIndex(origin, roots.map(root => ({ root })));
});

fastify.get('/:pod/lws-storage', async (request, reply) => {
  const origin = `${request.protocol}://${request.hostname}`;
  const root = `/${request.params.pod}/`;
  if (!(await storageRootFor(storage, root))) return reply.callNotFound();  // not a storage
  reply.header('Cache-Control', 'public, max-age=3600');
  reply.type(storageDescriptionContentType(request.headers.accept));
  const cfg = request.podConfigFor(root);
  const { profileIndexPath, voidPath, referentResolutionEnabled, uriSpacePrefixes } =
    await resolveStorageDescriptionInputs(cfg, `${origin}${root}`, lwsEnabled);
  return buildStorageDescription(`${origin}${root}`, { typeIndexEnabled, notificationsEnabled: request.notificationsEnabled, profileIndexPath, voidPath, profileConnegEnabled, referentResolutionEnabled, uriSpacePrefixes, mcpEnabled, anonRateLimitMax });
});
for (const m of ['put', 'post', 'patch', 'delete']) { fastify[m]('/.well-known/lws-storage', methodNotAllowed); fastify[m]('/:pod/lws-storage', methodNotAllowed); }
```
`resolveStorageDescriptionInputs` (A4-adjacent) must now take a config-handle whose base is the storage root — change its signature to `resolveStorageDescriptionInputs(configHandle, storageRootUrl, lwsEnabled)` and pass `configHandle.get()`; `uriSpacePrefixesFor(uriSpaces, storageRootUrl)` prefixes off the storage root. Add a small `listVisibleStorageRoots(storage, origin, request)` helper (module-scope in server.js or a new `src/lws/storage-index.js`): list `/` entries, keep dir entries whose `/<name>/` has the marker AND the requester can READ the root ACL (`checkAccess`), return their root paths.

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test test/lws-storage-description-route.test.js`
Expected: PASS. Keep the existing "`--lws` OFF → 404" test green.

- [ ] **Step 5: Commit**

```bash
git add src/server.js src/lws/storage-description.js test/lws-storage-description-route.test.js
git commit -m "$(cat <<'EOF'
[Agent: Claude] feat(lws): per-storage /:pod/lws-storage route + ServerIndex well-known

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task A6: `storageDescription` Link header per-storage

**Files:**
- Modify: `src/ldp/headers.js:146-158` (`getAllHeaders` resolves the owning storage)
- Modify: call sites that must thread the storage root (`src/handlers/resource.js`, `src/handlers/container.js`, `src/db/index.js`) — pass `storageRootPath`
- Test: `test/lws-storage-link.test.js` (extend)

**Interfaces:**
- Consumes: `storageRootFor` (A2). To avoid an async call inside `getAllHeaders` (it is sync and called ~40×), resolve the storage root in the request handler and pass it in.
- Produces: `getAllHeaders({ …, storageRootPath })` — the storage-description Link uses `storageDescriptionUrl(resourceUrl, storageRootPath)`. `storageRootPath` defaults to `null` (server scope → well-known URL, unchanged for `.well-known`/root resources).

- [ ] **Step 1: Write the failing test**

```js
// append to test/lws-storage-link.test.js
test('storageDescription rel points at the owning storage when storageRootPath given', () => {
  const h = getAllHeaders({ isContainer: false, origin: 'http://h', resourceUrl: 'http://h/alice/note.ttl', lwsEnabled: true, storageRootPath: '/alice/' });
  assert.match(h['Link'], /<http:\/\/h\/alice\/lws-storage>; rel="https:\/\/www\.w3\.org\/ns\/lws#storageDescription"/);
});
test('server-scope resource keeps the well-known target', () => {
  const h = getAllHeaders({ isContainer: false, origin: 'http://h', resourceUrl: 'http://h/robots.txt', lwsEnabled: true, storageRootPath: null });
  assert.match(h['Link'], /<http:\/\/h\/\.well-known\/lws-storage>/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/lws-storage-link.test.js`
Expected: FAIL — `getAllHeaders` ignores `storageRootPath`; emits well-known.

- [ ] **Step 3: Thread `storageRootPath` through `getAllHeaders`**

In `src/ldp/headers.js`, add `storageRootPath = null` to the destructured params (line 146) and update the emission block (line 153):
```js
      `<${storageDescriptionUrl(resourceUrl, storageRootPath)}>; rel="${LWS_STORAGE_DESC_REL}"`,
```

- [ ] **Step 4: Resolve + pass the root at the LWS handler call sites**

In `src/handlers/resource.js`, for the LWS-relevant `getAllHeaders` calls (the report lists `:2709`, `:3093`, `:822`, etc. — those with `lwsEnabled: request.lwsEnabled`), compute once near the top of the handler:
```js
const storageRootPath = request.lwsEnabled ? await storageRootFor(storage, urlPath) : null;
```
and add `storageRootPath` to each of those `getAllHeaders({...})` calls. Do the same for the two container.js calls (`:194`, `:473`). Leave `src/db/index.js` (MongoDB plugin) calls passing the default `null` — that subsystem doesn't thread `lwsEnabled` (report note; out of scope, matches Task-9 precedent from the referent round).

- [ ] **Step 5: Run tests to verify they pass**

Run: `node --test test/lws-storage-link.test.js test/lws-storage-description-route.test.js`
Expected: PASS. Then `npm test` — fix any test asserting the old well-known Link on a pod resource (update to the per-storage target).

- [ ] **Step 6: Commit**

```bash
git add src/ldp/headers.js src/handlers/resource.js src/handlers/container.js test/lws-storage-link.test.js
git commit -m "$(cat <<'EOF'
[Agent: Claude] feat(lws): storageDescription Link points at the owning storage

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task A7: MCP per-storage (link + description resource)

**Files:**
- Modify: `src/mcp/read-tools.js:58-59` (`localLinks`)
- Modify: `src/mcp/resources.js:72-96` (`readStorageDescription` + registration)
- Modify: `src/mcp/index.js` (thread a storage-root resolution into ctx / the read path)
- Test: `test/mcp-lws-read.test.js` (extend)

**Interfaces:**
- Consumes: `storageRootFor` (A2); MCP `ctx` (has `storage`, `origin`, config inputs).
- Produces: MCP `read_resource` of a pod resource reports `storageDescription = …/<pod>/lws-storage`; the MCP storage-description resource for a pod path returns `id = …/<pod>/`. The addressable resource `/.well-known/lws-storage` returns the `ServerIndex`.

- [ ] **Step 1: Write the failing test**

```js
// append to test/mcp-lws-read.test.js — using the existing postMcp helper against a provisioned alice pod
it('read_resource local links carry the per-storage storageDescription', async () => {
  const out = await postMcp(/* read_resource of /alice/note.ttl */);
  assert.ok(JSON.stringify(out).includes('/alice/lws-storage'));
});
```
(Match the file's existing `postMcp`/assertion helpers; the report shows `test/helpers.js` exposes `postMcp`.)

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/mcp-lws-read.test.js`
Expected: FAIL — link is `…/.well-known/lws-storage`.

- [ ] **Step 3: Make `localLinks` per-storage**

In `src/mcp/read-tools.js`:
```js
export async function localLinks(path, ctx) {
  const url = buildUrl(ctx, path);
  const root = await storageRootFor(ctx.storage, new URL(url).pathname);
  const links = { storageDescription: storageDescriptionUrl(url, root) };
  // …rest unchanged…
}
```

- [ ] **Step 4: Make the MCP storage-description resource per-storage**

In `src/mcp/resources.js`, `readStorageDescription(ctx, uri)` — resolve the storage root for the addressed URI; if it's `/.well-known/lws-storage`, return `buildServerIndex`; else `buildStorageDescription(storageRootUrl, {...ctx flags with per-storage config})`. Thread per-storage config via `ctx` (mirror A3's resolver into the MCP ctx builder at `src/mcp/index.js:248-269`, replacing the single `podConfig.get()` with `podConfigResolver.for(root).get()`).

- [ ] **Step 5: Run tests to verify they pass**

Run: `node --test test/mcp-lws-read.test.js`
Expected: PASS. Then `npm test`.

- [ ] **Step 6: Commit**

```bash
git add src/mcp/read-tools.js src/mcp/resources.js src/mcp/index.js test/mcp-lws-read.test.js
git commit -m "$(cat <<'EOF'
[Agent: Claude] feat(mcp): per-storage storageDescription link + description resource

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task A8: Referent resolver reads the owning storage's config

**Files:**
- Modify: `src/handlers/resource.js:125-144` (`resolveReferentTarget`)
- Modify: `src/auth/middleware.js:179-181` (the pre-check)
- Test: `test/lws-referent-per-storage.test.js` (create)

**Interfaces:**
- Consumes: `storageRootFor` (A2), `request.podConfigFor` (A3), `resolveReferent`/`uriSpacePrefixesFor` (existing).
- Produces: `GET /alice/id/<slug>` (anon) 303 → `/alice/wiki/<slug>.md` reading alice's uriSpaces; `GET /bob/id/<slug>` resolves bob's independently; a name outside any storage's prefixes → normal 404.

- [ ] **Step 1: Write the failing test**

```js
// test/lws-referent-per-storage.test.js — provision alice with a per-storage config declaring
// uriSpaces:[{pathPrefix:'/alice/id/',container:'/alice/wiki/',suffix:'.md'}], seed /alice/wiki/a.md
it('anon GET /alice/id/a 303s to /alice/wiki/a.md', async () => {
  const res = await request('/alice/id/a', { redirect: 'manual' });
  assertStatus(res, 303);
  assertHeaderContains(res, 'location', '/alice/wiki/a.md');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/lws-referent-per-storage.test.js`
Expected: FAIL — the resolver reads the single global config (prefix `/id/`), so `/alice/id/a` doesn't match.

- [ ] **Step 3: Route referent resolution through the owning storage's config**

In `src/handlers/resource.js` `resolveReferentTarget(request, urlPath)`:
```js
const root = await storageRootFor(storage, urlPath);
const cfg = await request.podConfigFor(root).get();
const target = resolveReferent(urlPath, cfg.uriSpaces || []);
```
Apply the same substitution in `src/auth/middleware.js:179-181`. The no-oracle existence+READ gate stays unchanged.

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test test/lws-referent-per-storage.test.js`
Expected: PASS. Then `npm test`.

- [ ] **Step 5: Commit**

```bash
git add src/handlers/resource.js src/auth/middleware.js test/lws-referent-per-storage.test.js
git commit -m "$(cat <<'EOF'
[Agent: Claude] feat(lws): referent resolver reads the owning storage's uriSpaces

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task A9: Provisioning visibility flag (public vs private root ACL)

**Files:**
- Modify: `src/wac/parser.js:284` `generateOwnerAcl` (add a `publicRead` option)
- Modify: `src/handlers/container.js:241` `createPodStructure` (accept `options.visibility`)
- Modify: the pod-creation route `src/server.js` (`handleCreatePod`, ~line 943 / 1259) to pass `visibility` from the request body
- Test: `test/lws-pod-visibility.test.js` (create)

**Interfaces:**
- Consumes: nothing new.
- Produces: `generateOwnerAcl(resourceUrl, ownerWebId, isContainer, { publicRead = true })` — omit the `#public` authorization when `publicRead === false`. `createPodStructure(name, webId, podUri, issuer, defaultQuota, { visibility })` — `visibility === 'private'` → root ACL has no public Read; default stays public (current behavior).

- [ ] **Step 1: Write the failing test**

```js
// test/lws-pod-visibility.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateOwnerAcl } from '../src/wac/parser.js';

test('public (default) root ACL grants foaf:Agent Read', () => {
  const acl = generateOwnerAcl('./', 'http://h/alice/profile/card#me', true);
  assert.ok(JSON.stringify(acl).includes('foaf:Agent'));
});
test('private root ACL omits the #public authorization', () => {
  const acl = generateOwnerAcl('./', 'http://h/bob/profile/card#me', true, { publicRead: false });
  assert.ok(!JSON.stringify(acl).includes('#public'));
  assert.ok(!JSON.stringify(acl).includes('foaf:Agent'));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/lws-pod-visibility.test.js`
Expected: FAIL — `generateOwnerAcl` ignores the 4th arg; always emits `#public`.

- [ ] **Step 3: Add the `publicRead` option**

In `src/wac/parser.js` `generateOwnerAcl`, gate the `#public` graph entry:
```js
export function generateOwnerAcl(resourceUrl, ownerWebId, isContainer = false, { publicRead = true } = {}) {
  const graph = [ { /* #owner … unchanged */ } ];
  if (publicRead) graph.push({ '@id': '#public', '@type': 'acl:Authorization',
    'acl:agentClass': { '@id': 'foaf:Agent' }, 'acl:accessTo': { '@id': resourceUrl },
    'acl:mode': [ { '@id': 'acl:Read' } ] });
  if (isContainer) graph[0]['acl:default'] = { '@id': resourceUrl };
  // …serialize unchanged…
}
```

- [ ] **Step 4: Thread `visibility` through provisioning**

In `createPodStructure`, destructure `const { visibility = 'public' } = options;` and pass `{ publicRead: visibility !== 'private' }` to the root `generateOwnerAcl('./', owner(''), true, …)` call. In the create-pod route, read `visibility` from the JSON body and pass it in `options`.

- [ ] **Step 5: Run tests to verify they pass**

Run: `node --test test/lws-pod-visibility.test.js`
Expected: PASS. Then `npm test`.

- [ ] **Step 6: Commit**

```bash
git add src/wac/parser.js src/handlers/container.js src/server.js test/lws-pod-visibility.test.js
git commit -m "$(cat <<'EOF'
[Agent: Claude] feat(provisioning): per-storage visibility flag (public|private root ACL)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task A10: Navigator per-storage chrome + WAC-filtered server index view

**Files:**
- Modify: `src/navigator/views.js:27` `crumbHtml`, `:107` `renderRootView`, add `renderServerIndexView`
- Modify: `src/handlers/resource.js:804-834` (root view builds `sd`/roster per storage) + the container-view caller
- Test: `test/lws-navigator-multitenant.test.js` (create)

**Interfaces:**
- Consumes: `storageRootFor` (A2), `buildStorageDescription`/`buildServerIndex` (A4), `listVisibleStorageRoots` (A5).
- Produces:
  - `crumbHtml(url, storageRootPath)` — the leading crumb links to the **owning storage root** (`<a href="/alice/?view=nav">alice</a>`), then relative segments; server-scope (`null`) keeps a `server` crumb to `/?view=nav`.
  - `renderServerIndexView({ origin, storages })` — the `/?view=nav` roster (one row per WAC-visible storage, linking to `/<pod>/?view=nav`).
  - `renderRootView` stays the per-storage view (used for `/<pod>/?view=nav`).

- [ ] **Step 1: Write the failing tests**

```js
// test/lws-navigator-multitenant.test.js  (unit-level on views + one HTTP assertion)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crumbHtml, renderServerIndexView } from '../src/navigator/views.js';

test('crumb root links to the owning storage, not /', () => {
  const html = crumbHtml('http://h/alice/wiki/a.md', '/alice/');
  assert.match(html, /href="\/alice\/\?view=nav"[^>]*>alice/);
  assert.ok(!/>pod</.test(html));   // no hardcoded single-pod crumb
});
test('server index view lists storages', () => {
  const html = renderServerIndexView({ origin: 'http://h', storages: [{ root: '/alice/' }, { root: '/bob/' }] });
  assert.match(html, /\/alice\/\?view=nav/);
  assert.match(html, /\/bob\/\?view=nav/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/lws-navigator-multitenant.test.js`
Expected: FAIL — `crumbHtml` has arity 1 and hardcodes `pod`; `renderServerIndexView` missing.

- [ ] **Step 3: Rework the views**

`crumbHtml(url, storageRootPath = null)` — when a storage root is given, first crumb = `<a href="${root}?view=nav">${podName}</a>` and subsequent segments are built from the path **after** the root; when `null`, first crumb = `<a href="/?view=nav">server</a>`. Add `renderServerIndexView({ origin, storages })` (roster rows linking `/<pod>/?view=nav`). Keep `renderRootView` for the per-storage storage view.

- [ ] **Step 4: Wire the handlers**

In `src/handlers/resource.js`: the `willServeRootStorageView` branch for `urlPath === '/'` now renders `renderServerIndexView({ origin, storages: await listVisibleStorageRoots(...) })`; a `/<pod>/?view=nav` renders `renderRootView` with that storage's `sd` (built from `${origin}${root}` + `request.podConfigFor(root)`). Container-view and entity-view callers pass `storageRootPath = await storageRootFor(storage, urlPath)` into `crumbHtml`.

- [ ] **Step 5: Run tests to verify they pass**

Run: `node --test test/lws-navigator-multitenant.test.js test/lws-navigator-root.test.js test/lws-navigator-parity.test.js`
Expected: PASS. Update the existing navigator-root/parity tests that asserted the `pod`/`/?view=nav` single-storage crumb to the new server/`<pod>` shape.

- [ ] **Step 6: Commit**

```bash
git add src/navigator/views.js src/handlers/resource.js test/lws-navigator-multitenant.test.js
git commit -m "$(cat <<'EOF'
[Agent: Claude] feat(navigator): per-storage breadcrumb + server-index root view

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task A11: Full fork suite + whole-branch review + merge + image

**Files:** none new (integration).

- [ ] **Step 1: Run the full fork suite**

Run: `npm test`
Expected: green (the 1 pre-existing skip + the isolated `mcp-lws-read` open-handle file are the only non-passes, per prior rounds). Fix any residual single-storage assertion still failing.

- [ ] **Step 2: Adversarial whole-branch review**

Dispatch an opus reviewer over `la3d/lws@9b084e9..HEAD` focused on: (a) any identity surface still deriving from origin instead of `storageRootFor` (grep `\.origin`/`/.well-known/lws-storage` in src/lws, src/mcp, src/handlers, src/navigator); (b) the `#public` visibility path — does a private root leak anywhere (listing, sidecar, description)?; (c) cache correctness in `storage-resolver.js` (does a newly provisioned pod become resolvable without a stale negative cache entry — provisioning must `clearStorageRootCache()` or the cache must key only positives with TTL); (d) MCP parity with the HTTP surface (the recurring twin-bug class from prior rounds). Fix findings; re-run `npm test`.

- [ ] **Step 3: Merge `--no-ff`**

```bash
git checkout la3d/lws
git merge --no-ff la3d/lws-multitenant -m "$(cat <<'EOF'
[Agent: Claude] merge: multi-tenant storage — per-storage identity/description layer

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
git push origin la3d/lws
```

- [ ] **Step 4: Record the merge SHA** for the Phase B rig repin (`git rev-parse HEAD`).

---

# Phase B — lws-pod (rig, re-mint, bob tenant, live gate)

## Task B1: Re-mint alice's uriSpace to `/alice/id/`

**Files:**
- Modify: `projection/profiles/defs/index.jsonld` (`void.uriSpace` → `alice/id/`)
- Modify: `projection/profiles/defs/pod-config.jsonld` (`uriSpaces[].pathPrefix` → `/alice/id/`)
- Verify: `projection/profiles/defs/llm-wiki/identity.jsonld` (`pathPrefix` STAYS `id/` — authority now carries `/alice/`)
- Modify: `projection/publish/checks.mjs` `checkUriSpaces` if its equality rail needs generalizing
- Test: `projection` unit suite (`checkPodConfig`)

**Interfaces:**
- Consumes: the fork's per-storage `sd.id = …/alice/` (Phase A) → `resolveStorageAuthority` returns `…/alice/`, so the projector mints `…/alice/id/<slug>#it` with `identity.jsonld pathPrefix` unchanged.
- Produces: `pod-config.jsonld` uriSpace `{ pathPrefix: '/alice/id/', container: '/alice/wiki/', suffix: '.md' }`; manifest `void.uriSpace = 'alice/id/'`.

- [ ] **Step 1: Update the three config points**

`index.jsonld` void block: `"uriSpace": "alice/id/"` (was `"id/"`). `pod-config.jsonld`: `"pathPrefix": "/alice/id/"` (container/suffix unchanged). `llm-wiki/identity.jsonld`: confirm `"pathPrefix": "id/"` unchanged.

- [ ] **Step 2: Run the projection check suite**

Run: `cd projection && npm test` (or the specific `checks` test).
Expected: `checkUriSpaces` passes with `pathPrefix '/alice/id/' === '/' + 'alice/id/'`. If `checkPodConfig` hard-asserts pointers under a single `--container`, generalize it to accept the per-storage container (spec §3 lws-pod row) — add/adjust the unit test accordingly.

- [ ] **Step 3: Commit**

```bash
git add projection/profiles/defs/index.jsonld projection/profiles/defs/pod-config.jsonld projection/publish/checks.mjs
git commit -m "$(cat <<'EOF'
[Agent: Claude] feat(projection): re-mint alice uriSpace under /alice/id/

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task B2: Rig repin + reseed alice + provision private bob

**Files:**
- Modify: `Dockerfile.fork` (`JSS_GIT_REF` → Phase A merge SHA), `docker-compose.fork-tls.yml` (`JSS_GIT_REF`, image tag `fork-multitenant`, and `--lws-config profiles/pod-config.jsonld` — now a per-root relative path)
- Modify: `Makefile` (a `publish-bob` / two-tenant seed target, or extend `publish-profiles`)
- Create: `projection/profiles/defs/` bob variant OR a seed script that PUTs bob's pod-config

**Interfaces:**
- Consumes: the fork image with per-storage identity.
- Produces: a running rig with alice (public, `/alice/wiki/`, `/alice/id/`) + bob (private root, `/bob/wiki/`, `/bob/id/`), each with its own `profiles/pod-config.jsonld`.

- [ ] **Step 1: Repin the rig**

Set `JSS_GIT_REF` to the merge SHA in `Dockerfile.fork` + `docker-compose.fork-tls.yml`; change the compose `--lws-config` arg from `/alice/profiles/pod-config.jsonld` to `profiles/pod-config.jsonld` (per-root relative, per A3). Rebuild: `make up-fork-tls`.

- [ ] **Step 2: Reseed alice + provision bob**

Get alice's token (`/idp/credentials`), `POD_TOKEN=… make publish-profiles`. Provision bob: `POST /.pods` with `{name:'bob', email, password, visibility:'private'}` (the A9 flag); get bob's token; publish bob's profiles + `--bind /bob/wiki/=llm-wiki` + a `/bob/profiles/pod-config.jsonld` with `pathPrefix:'/bob/id/'`, `container:'/bob/wiki/'`; run the projector (`runOnce('/bob/wiki/', bobToken)`) to mint bob's cards. Capture the exact commands into a `make seed-multitenant` target.

- [ ] **Step 3: Smoke-check by curl**

```bash
curl --cacert certs/rootCA.pem https://pod.vardeman.me/alice/lws-storage        # id …/alice/
curl --cacert certs/rootCA.pem https://pod.vardeman.me/bob/lws-storage          # id …/bob/
curl --cacert certs/rootCA.pem https://pod.vardeman.me/.well-known/lws-storage  # ServerIndex, anon sees alice only
curl --cacert certs/rootCA.pem -I https://pod.vardeman.me/alice/id/a            # 303 → /alice/wiki/a.md
```
Expected as annotated.

- [ ] **Step 4: Commit**

```bash
git add Dockerfile.fork docker-compose.fork-tls.yml Makefile projection/profiles/defs/
git commit -m "$(cat <<'EOF'
[Agent: Claude] feat(rig): repin fork-multitenant + seed alice(public)+bob(private)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task B3: `tests/lws-multitenant.test.mjs` + `make test-multitenant`

**Files:**
- Create: `tests/lws-multitenant.test.mjs`
- Modify: `Makefile` (`test-multitenant` target + `.PHONY`)

**Interfaces:**
- Consumes: the live two-tenant rig; `tests/helpers.mjs` (`BASE`, `ensurePod`, `getToken`).
- Produces: the §4 acceptance gate.

- [ ] **Step 1: Write the live gate (self-skipping on the base pod)**

```js
// tests/lws-multitenant.test.mjs
import { describe, it, beforeAll, expect } from 'vitest'
import { BASE, getToken } from './helpers.mjs'

const idx = await fetch(`${BASE}/.well-known/lws-storage`, { headers: { Accept: 'application/lws+json' } })
  .then(r => r.ok ? r.json() : {}).catch(() => ({}))
const isMultiTenant = idx.type === 'ServerIndex'

describe.skipIf(!isMultiTenant)('LWS multi-tenant storage (spec §4)', () => {
  let aliceAuth
  beforeAll(async () => { const { token } = await getToken(); aliceAuth = { Authorization: `Bearer ${token}` } })

  it('§4.1 a /bob/ resource self-describes as bob', async () => {
    const r = await fetch(`${BASE}/bob/lws-storage`, { headers: { Accept: 'application/lws+json', ...aliceAuth } })
    // alice may lack READ on bob's private description → accept 200(id …/bob/) or 403
    if (r.status === 200) expect((await r.json()).id).toMatch(/\/bob\/$/)
    else expect([401, 403]).toContain(r.status)
  })

  it('§4.4 anon server index lists alice, not private bob', async () => {
    const r = await fetch(`${BASE}/.well-known/lws-storage`, { headers: { Accept: 'application/lws+json' } })
    const body = await r.json()
    const ids = body.storage.map(s => s.id)
    expect(ids.some(i => i.endsWith('/alice/'))).toBe(true)
    expect(ids.some(i => i.endsWith('/bob/'))).toBe(false)
  })

  it('§4.5 anon GET /alice/id/a 303s to /alice/wiki/a.md', async () => {
    const r = await fetch(`${BASE}/alice/id/a`, { redirect: 'manual' })
    expect(r.status).toBe(303)
    expect(r.headers.get('location')).toBe(`${BASE}/alice/wiki/a.md`)
  })

  it('bob mints his own /bob/id/ independently', async () => {
    const { token: bobTok } = await getToken({ name: 'bob', email: 'bob@example.com', password: 'bobpassword123' })
    const r = await fetch(`${BASE}/bob/id/a`, { redirect: 'manual', headers: { Authorization: `Bearer ${bobTok}` } })
    expect(r.status).toBe(303)
    expect(r.headers.get('location')).toBe(`${BASE}/bob/wiki/a.md`)
  })

  it('§4.1 Link rel=storageDescription under /alice/ points at /alice/lws-storage', async () => {
    const r = await fetch(`${BASE}/alice/wiki/a.md`, { headers: { Accept: 'text/markdown' } })
    expect(r.headers.get('link')).toContain('/alice/lws-storage')
  })
})
```

- [ ] **Step 2: Add the Makefile target**

Copy `test-referent` (same two guards + env), pointing at `tests/lws-multitenant.test.mjs`; add `test-multitenant` to `.PHONY` (Makefile:9).

- [ ] **Step 3: Run the gate**

Run: `make test-multitenant`
Expected: all `it`s pass. Space ~40s after other live gates (rate limit).

- [ ] **Step 4: Commit**

```bash
git add tests/lws-multitenant.test.mjs Makefile
git commit -m "$(cat <<'EOF'
[Agent: Claude] test(rig): make test-multitenant live gate (spec §4)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task B4: Full live sweep (no single-tenant regression on alice)

**Files:** none (integration).

- [ ] **Step 1: Run the full live sweep on the fork-multitenant rig**

Run each gate (space ~40s): `make test-lws test-l3 test-typeindex test-indexed-relation test-graph test-conneg test-void test-preservation test-mcp-v2 test-referent test-dcat test-profiles test-wiki test-viewer test-multitenant` and `make test-projection`.
Expected: all green on the alice storage (spec §4.6). Any gate that hardcoded `/.well-known/lws-storage` as "the storage" or the bare `/id/` prefix must be updated to the per-storage form (alice now `/alice/id/`, description at `/alice/lws-storage`) — treat those updates as part of this task.

- [ ] **Step 2: Browser spot-check** (Chuck's §7-style acceptance, abbreviated): `/?view=nav` → server index lists alice; `/alice/?view=nav` → alice storage view; `/alice/wiki/` → breadcrumb roots at `alice`, not `pod`.

- [ ] **Step 3: Commit any gate updates + update FOLLOWUP.md + conformance doc**

```bash
git add tests/ FOLLOWUP.md docs/foundations/05-jss-spec-conformance.md
git commit -m "$(cat <<'EOF'
[Agent: Claude] docs+test: multi-tenant round DONE + live-verified; sweep green on alice

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Self-review notes (author)

- **Spec coverage:** D1 (§0/A11 no token changes) ✓; D2 (`/`=ServerIndex A5/A10, root-pod marker A1) ✓; D3 (marker A1 + resolver A2) ✓; D4 (description A4/A5 + per-storage config A3) ✓; D5 (well-known ServerIndex A5) ✓; D6 (re-mint B1 + resolver A8) ✓; D7 (visibility A9 + WAC roster A5/A10) ✓; D8 (navigator A10) ✓. Acceptance §4.1–§4.6 → B3/B4 ✓.
- **Cache caveat (flagged for A11 review):** `storage-resolver.js` caches negatives too; provisioning a new pod after a negative cache hit for `/<name>/` would stay unresolved. Mitigation options for the implementer: cache positives only, or call `clearStorageRootCache()` at the end of `createPodStructure`/`createRootPodStructure`. Pick one in A2/A11.
- **`resolveStorageDescriptionInputs` signature change** (config-handle + storageRootUrl) is introduced in A4/A5 and consumed in A5/A7/A10 — keep the handle-based form consistent across all three.
