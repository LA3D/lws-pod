# LWS L2 — Storage Description + per-resource Linkset (discovery slice) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make our JSS fork serve the two storage-side LWS *discovery* MUSTs — a **Storage Description** resource (`type: "Storage"`, `service[]`) advertised by a `Link: rel="https://www.w3.org/ns/lws#storageDescription"` header on **every** storage GET/HEAD, and a **per-resource linkset** (RFC 9264 `application/linkset+json`, served via content negotiation, advertised by `Link: rel="linkset"`). Purely additive over the existing LDP behavior, gated behind the existing `--lws` flag.

**Architecture:** Two new pure generators (`generateStorageDescription`, `generateLinkset`) in a new `src/lws/` module; a fixed `--lws`-gated route serving the storage description at `/.well-known/lws-storage` (mirrors the existing `/.well-known/openid-configuration` route idiom); a `rel="…#storageDescription"` Link header threaded through `src/ldp/headers.js:getAllHeaders` for all resources; an additive `application/linkset+json` conneg branch in the container and file GET paths (mirroring L1's `application/lws+json` branch) plus a `rel="linkset"` Link header. Default responses (no LWS Accept, or `--lws` off) are byte-for-byte unchanged.

**Tech Stack:** Node ESM, Fastify, `commander` (CLI), `node:test` + `node:assert` (tests), `fs-extra` storage. No new dependencies.

## Why this scope (and what is deliberately OUT)

Grounded against the `lws-protocol` skill (spec) + the design of record (`docs/superpowers/specs/2026-06-29-lws-storage-layer-design.md`, §8/§10/§12) + this session's two source-read agents:

- **`/.well-known/lws-configuration` is DEFERRED to the auth track.** Per spec (`Authorization.html`) it is **authorization-server** metadata (RFC 8414: `token_endpoint`, `grant_types_supported: [urn:…token-exchange]`, `jwks_uri`). JSS is an OAuth2 **resource server** that issues a *direct* RS256 bearer — it does **not** implement RFC 8693 token-exchange (design §8; conformance map axis 2). Emitting `lws-configuration` would advertise a capability JSS lacks. The LWS-conformant AS is the Keycloak-in-front spike (`experiments/keycloak-jss/`); `lws-configuration` lives there, not in the storage server. JSS already serves `/.well-known/openid-configuration` for its own IdP.
- **Linkset is READ-ONLY in L2.** The spec MUST is "make metadata links available as a standalone resource" — i.e. *availability*. The linkset **write** MUSTs (PUT/PATCH with `If-Match` → 412/`If-Match` absent → 428, atomic-with-resource updates, ETag regeneration) only bind a server that *supports mutating* the linkset. L2 ships read availability; linkset mutation + concurrency is a later sub-plan.
- **Single-storage only in L2.** The storage description is served once at `/.well-known/lws-storage` with `id` = the storage root. Per-pod (multi-user) storage descriptions — one per `/<pod>/` storage, with the `Link` header on `/<pod>/x` pointing at that pod's description — are a deferred carryover.
- **Storage Description `capability` set (PatchSupport etc.), `TypeIndexService`, linkset `license`/custom rels, and the standalone `.meta` linkset resource** are all OUT — capability advertising and Type Index are L3/Tranche-2 per the design.

## Global Constraints

- **Work in the fork**, not lws-pod: `~/dev/git/LA3D/JavaScriptSolidServer`. Branch `la3d/lws-discovery` off **`la3d/lws`** (the integration branch — already contains L1 via merged PR #1). Never commit to `la3d/main` directly (pristine upstream pin `0f4287f` / 0.0.210, for rebasing onto JSS releases).
- **Additive only.** No change to default LDP/Solid behavior. The new representations are reachable *only* when `--lws` is enabled AND (for linkset) the request sends `Accept: application/linkset+json`. The `rel="…#storageDescription"` and `rel="linkset"` Link headers are emitted **only when `--lws` is on**. Do not touch PUT/POST/PATCH/DELETE semantics.
- **Build on L1.** L1 already provides: `request.lwsEnabled` (decorated in `src/server.js`), the `--lws` flag (`bin/jss.js`), `RDF_TYPES.LWS_JSON = 'application/lws+json'` and `selectContentType` (`src/rdf/conneg.js`), `parentContainerUrl` (`src/utils/url.js`), `getAllHeaders({…, lwsEnabled})` (`src/ldp/headers.js`), and the `application/lws+json` container conneg branch (`src/handlers/resource.js` ~line 350). Reuse these by name; do not re-derive.
- **Spec ground truth** is the `lws-protocol` skill in lws-pod. Exact shapes this plan asserts (verified this session):
  - **Storage Description** (`Discovery.html`, `lws-media-type.md`, `jsonld-context.md`): `{ "@context": "https://www.w3.org/ns/lws/v1", "id": <storageURI>, "type": "Storage", "service": [ { "type": "StorageDescription", "serviceEndpoint": <uri> }, … ] }`. `@context`/`id`/`type`/`service` all REQUIRED; each service MUST have `type` + `serviceEndpoint` (`id` OPTIONAL). Served as `application/lws+json`.
  - **storageDescription Link rel** (`Discovery.html`): "All responses to GET and HEAD requests targeting storage resources MUST include a `Link` header whose target is the URI of the storage description resource, including a relation (`rel`) parameter whose value equals `https://www.w3.org/ns/lws#storageDescription`."
  - **Linkset** (`Operations/metadata.md`, `Operations/read-resource.md`, RFC 9264): `{ "linkset": [ { "anchor": <resourceURI>, "up": [ { "href": <parentURI> } ], "type": [ { "href": <lws#Container|lws#DataResource> } ], "describedby": [ { "href": <storageDescURI> } ] } ] }`. Served as `application/linkset+json`. Discoverable via `Link: <…>; rel="linkset"; type="application/linkset+json"`.
  - **Vocabulary** (`lws10-vocab/vocabulary.yml`): namespace `https://www.w3.org/ns/lws#`; `lws:Storage`, `lws:StorageDescription`, `lws:service`, `lws:serviceEndpoint`, `lws:storageDescription` (rel), `lws:DataResource`, `lws:Container`, `lws:NotificationService`.
- **Test command:** `npm test` runs `node --test --test-concurrency=1 'test/*.test.js'`. Single file: `node --test test/<file>.test.js`.
- **Commit trailer:** `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

---

### Task 0: Branch setup

**Files:** none (git only)

- [ ] **Step 1: Create the working branch off the integration branch**

```bash
cd ~/dev/git/LA3D/JavaScriptSolidServer
git fetch origin
git checkout la3d/lws && git pull --ff-only      # must already contain the L1 merge (d8166f2)
git checkout -b la3d/lws-discovery
```

- [ ] **Step 2: Confirm the baseline is green before touching anything**

Run: `npm test`
Expected: full suite passes (this includes L1's lws-container tests — our regression baseline). If anything is already red, note it and stop.

---

### Task 1: `generateStorageDescription()` pure function

**Files:**
- Add: `src/lws/storage-description.js` (new module)
- Test: `test/lws-storage-description.test.js` (new)

**Interfaces:**
- Produces: `generateStorageDescription(storageRootUrl: string, services: Array<{type:string, serviceEndpoint:string, [k:string]:any}>) -> object` — a JSON object ready to `JSON.stringify`. **Thin builder** (per the global YAGNI constraint): it passes `services` through verbatim and adds no entries. **The caller is responsible for including the `StorageDescription` self-service entry** (Task 2's route does exactly this); Task 6's e2e asserts that entry is present, catching any caller that forgets.

- [ ] **Step 1: Write the failing test**

Create `test/lws-storage-description.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateStorageDescription } from '../src/lws/storage-description.js';

const ROOT = 'http://localhost:3000/';
const DESC = 'http://localhost:3000/.well-known/lws-storage';

test('storage description: required top-level shape', () => {
  const d = generateStorageDescription(ROOT, [
    { type: 'StorageDescription', serviceEndpoint: DESC },
  ]);
  assert.equal(d['@context'], 'https://www.w3.org/ns/lws/v1');
  assert.equal(d.id, ROOT);
  assert.equal(d.type, 'Storage');
  assert.ok(Array.isArray(d.service));
});

test('storage description: every service has type + serviceEndpoint', () => {
  const d = generateStorageDescription(ROOT, [
    { type: 'StorageDescription', serviceEndpoint: DESC },
    { type: 'NotificationService', serviceEndpoint: ROOT + 'notification/api' },
  ]);
  for (const s of d.service) {
    assert.equal(typeof s.type, 'string');
    assert.equal(typeof s.serviceEndpoint, 'string');
  }
  assert.ok(d.service.some(s => s.type === 'StorageDescription' && s.serviceEndpoint === DESC));
  assert.ok(d.service.some(s => s.type === 'NotificationService'));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/lws-storage-description.test.js`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement `generateStorageDescription`**

Create `src/lws/storage-description.js`:

```js
const LWS_CONTEXT = 'https://www.w3.org/ns/lws/v1';

/**
 * Generate the W3C LWS Storage Description resource (application/lws+json).
 * Spec: Discovery.html — @context/id/type/service all REQUIRED; each service
 * MUST carry type + serviceEndpoint. Single-storage; multi-pod deferred.
 * @param {string} storageRootUrl  the storage's URI (the `id`)
 * @param {Array<{type:string, serviceEndpoint:string}>} services
 * @returns {object}
 */
export function generateStorageDescription(storageRootUrl, services = []) {
  return {
    '@context': LWS_CONTEXT,
    id: storageRootUrl,
    type: 'Storage',
    service: services,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/lws-storage-description.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lws/storage-description.js test/lws-storage-description.test.js
git commit -m "$(printf 'feat(lws): generateStorageDescription (Storage + service[])\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

### Task 2: Serve the Storage Description at `/.well-known/lws-storage`

**Files:**
- Modify: `src/server.js` (register a fixed route near the existing `.well-known` blocks, ~line 872, before the wildcard LDP routes)
- Test: fold into Task 6's e2e (boot with `--lws`, GET the route) — or `test/lws-storage-description-route.test.js` if `createServer` boots cleanly in isolation; follow whatever `test/conneg.test.js` does.

**Interfaces:**
- Produces: `GET /.well-known/lws-storage` → the storage description doc as `application/lws+json` when `--lws`; `405` on writes; route not registered at all when `--lws` is off.
- The storage root `id` = the server base URL with a trailing `/` (single-storage). Compute it from the same `baseUrl`/`issuer` derivation used at startup (`src/server.js` ~line 936) — or rebuild from `request.protocol`/`request.hostname` at request time (matches subdomain mode). The `StorageDescription` `serviceEndpoint` = `{baseUrl}/.well-known/lws-storage`. Conditionally add a `NotificationService` entry (`serviceEndpoint = {baseUrl}/notification/api`) **only when `notificationsEnabled`**.

- [ ] **Step 1: Register the route (gated on `lwsEnabled`)**

In `src/server.js`, after the did/nostr `.well-known` block (~line 872) and before the wildcard routes, following the `/.well-known/openid-configuration` idiom (`src/idp/index.js:221`):

```js
if (lwsEnabled) {
  const lwsStoragePath = '/.well-known/lws-storage';
  fastify.get(lwsStoragePath, async (request, reply) => {
    const proto = options.ssl ? 'https' : 'http';
    const host = request.hostname;                       // subdomain-mode safe
    const root = `${proto}://${host}/`;
    const desc = `${proto}://${host}${lwsStoragePath}`;
    const services = [{ type: 'StorageDescription', serviceEndpoint: desc }];
    if (notificationsEnabled) services.push({ type: 'NotificationService', serviceEndpoint: `${proto}://${host}/notification/api` });
    reply.header('Cache-Control', 'public, max-age=3600');
    reply.type('application/lws+json');
    return generateStorageDescription(root, services);
  });
  const lwsMethodNotAllowed = async (_req, reply) => reply.code(405).send();
  for (const m of ['put', 'post', 'patch', 'delete']) fastify[m](lwsStoragePath, lwsMethodNotAllowed);
}
```

Add `import { generateStorageDescription } from './lws/storage-description.js';` near the other `src/server.js` imports. Confirm `notificationsEnabled` is in scope at this point (it is decorated nearby — `src/server.js:332`); if not, read it from `options` the same way `lwsEnabled` is.

- [ ] **Step 2: Verify nothing breaks**

Run: `npm test`
Expected: full suite still PASSES. The `.well-known/` path already skips WAC (`src/server.js:713`), so no auth wiring is needed.

- [ ] **Step 3: Commit**

```bash
git add src/server.js
git commit -m "$(printf 'feat(lws): serve Storage Description at /.well-known/lws-storage (--lws)\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

### Task 3: `rel="…#storageDescription"` Link header on all storage GET/HEAD

**Design (read first — this supersedes a fragile param-threading approach):** `getAllHeaders` is called from ~19 sites in `src/handlers/resource.js`, and it **already receives `resourceUrl` and `lwsEnabled`** (it even derives `Vary` from `lwsEnabled`). So **derive the storage-description URL *inside* `getAllHeaders`** from `resourceUrl`'s origin — do **not** add a new param threaded through every call site. This automatically scopes the header to the call sites that pass `lwsEnabled: true` (the GET/HEAD storage paths) and leaves POST/PUT/error responses (which default `lwsEnabled:false`) untouched. Single-storage assumption (L2): the storage description lives at `{origin}/.well-known/lws-storage`.

**Files:**
- Add: a `storageDescriptionUrl(resourceUrl)` helper in `src/lws/storage-description.js` → `\`${new URL(resourceUrl).origin}/.well-known/lws-storage\``.
- Modify: `src/ldp/headers.js` (`getAllHeaders` — when `lwsEnabled && resourceUrl`, append the rel to the `Link` header, deriving the URL via the helper).
- Modify: `src/handlers/resource.js` ONLY where needed — ensure the container-GET, file-GET, and `handleHead` call sites pass `lwsEnabled: request.lwsEnabled` (the L1 container-LWS branch already does; add it to the file-GET and HEAD sites if they don't). Do NOT touch the non-GET/HEAD call sites.
- Test: `test/lws-storage-link.test.js` (new) — unit-test `getAllHeaders` output.

**Interfaces:**
- `storageDescriptionUrl(resourceUrl: string) -> string`. Reused by Task 5 (linkset `describedby`).
- `getAllHeaders`: when `lwsEnabled && resourceUrl`, append `<{storageDescriptionUrl(resourceUrl)}>; rel="https://www.w3.org/ns/lws#storageDescription"` to the combined `Link` header (comma-join with whatever `getLinkHeader` already produced). No new param.

- [ ] **Step 1: Write the failing test**

Create `test/lws-storage-link.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getAllHeaders } from '../src/ldp/headers.js';
import { storageDescriptionUrl } from '../src/lws/storage-description.js';

const REL = 'https://www.w3.org/ns/lws#storageDescription';
const R = 'http://localhost:3000/alice/note.ttl';

test('storageDescriptionUrl derives {origin}/.well-known/lws-storage', () => {
  assert.equal(storageDescriptionUrl(R), 'http://localhost:3000/.well-known/lws-storage');
});

test('storageDescription rel present when lwsEnabled + resourceUrl', () => {
  const h = getAllHeaders({
    isContainer: false, etag: '"x"', contentType: 'text/turtle',
    origin: 'http://localhost:3000', resourceUrl: R, lwsEnabled: true,
  });
  assert.match(h['Link'], new RegExp(`<http://localhost:3000/\\.well-known/lws-storage>; rel="${REL}"`));
});

test('storageDescription rel ABSENT when lwsEnabled is false', () => {
  const h = getAllHeaders({
    isContainer: false, etag: '"x"', contentType: 'text/turtle',
    origin: 'http://localhost:3000', resourceUrl: R, lwsEnabled: false,
  });
  assert.equal((h['Link'] || '').includes('storageDescription'), false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/lws-storage-link.test.js`
Expected: FAIL — helper not exported / rel not emitted.

- [ ] **Step 3: Add the helper + emit the rel**

In `src/lws/storage-description.js`, add and export:

```js
export function storageDescriptionUrl(resourceUrl) {
  return `${new URL(resourceUrl).origin}/.well-known/lws-storage`;
}
```

In `src/ldp/headers.js`, import the helper, define the rel constant once, and after the existing `Link` header is assembled inside `getAllHeaders`:

```js
const LWS_STORAGE_DESC_REL = 'https://www.w3.org/ns/lws#storageDescription';
// … inside getAllHeaders, after Link is built:
if (lwsEnabled && resourceUrl) {
  const sd = `<${storageDescriptionUrl(resourceUrl)}>; rel="${LWS_STORAGE_DESC_REL}"`;
  headers['Link'] = headers['Link'] ? `${headers['Link']}, ${sd}` : sd;
}
```

- [ ] **Step 4: Ensure GET/HEAD call sites pass `lwsEnabled`**

The spec MUST is "all responses to GET/HEAD targeting storage resources." Confirm the container-GET, file-GET, and `handleHead` `getAllHeaders(...)` call sites pass `lwsEnabled: request.lwsEnabled`. The L1 container-LWS branch already does; add `lwsEnabled: request.lwsEnabled` to the file-GET and HEAD sites if missing. Leave the non-GET/HEAD sites (POST/PUT/error responses) alone — they default to `lwsEnabled:false` and correctly omit the rel.

- [ ] **Step 5: Run the unit test + full suite**

Run: `node --test test/lws-storage-link.test.js` then `npm test`
Expected: both PASS (no default-path regression — the rel only appears under `--lws` on GET/HEAD).

- [ ] **Step 6: Commit**

```bash
git add src/lws/storage-description.js src/ldp/headers.js src/handlers/resource.js test/lws-storage-link.test.js
git commit -m "$(printf 'feat(lws): emit rel=storageDescription Link on all storage GET/HEAD (--lws)\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

### Task 4: `generateLinkset()` pure function

**Files:**
- Add: `src/lws/linkset.js` (new)
- Test: `test/lws-linkset.test.js` (new)

**Interfaces:**
- Produces: `generateLinkset(resourceUrl, { parentUrl, isContainer, describedByUrl }) -> object` — RFC 9264 JSON: `{ linkset: [ { anchor, up?, type, describedby? } ] }`. `up` omitted for the storage root (no parent). `type` href = `lws#Container` or `lws#DataResource`. `describedby` href = the storage description URL (so a client can hop resource → storage description).

- [ ] **Step 1: Write the failing test**

Create `test/lws-linkset.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateLinkset } from '../src/lws/linkset.js';

const R = 'http://localhost:3000/alice/note.ttl';
const P = 'http://localhost:3000/alice/';
const DESC = 'http://localhost:3000/.well-known/lws-storage';
const LWS = 'https://www.w3.org/ns/lws#';

test('linkset: RFC 9264 shape with anchor/up/type/describedby', () => {
  const ls = generateLinkset(R, { parentUrl: P, isContainer: false, describedByUrl: DESC });
  assert.ok(Array.isArray(ls.linkset));
  const link = ls.linkset[0];
  assert.equal(link.anchor, R);
  assert.deepEqual(link.up, [{ href: P }]);
  assert.deepEqual(link.type, [{ href: LWS + 'DataResource' }]);
  assert.deepEqual(link.describedby, [{ href: DESC }]);
});

test('linkset: container type + no up at storage root', () => {
  const ls = generateLinkset(P, { parentUrl: null, isContainer: true, describedByUrl: DESC });
  assert.deepEqual(ls.linkset[0].type, [{ href: LWS + 'Container' }]);
  assert.equal('up' in ls.linkset[0], false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/lws-linkset.test.js`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement `src/lws/linkset.js`**

```js
const LWS = 'https://www.w3.org/ns/lws#';

/**
 * Generate an RFC 9264 linkset (application/linkset+json) for a resource.
 * Read-only discovery slice — mutation/concurrency (If-Match/412/428) deferred.
 * @param {string} resourceUrl
 * @param {{parentUrl?:string|null, isContainer:boolean, describedByUrl?:string}} opts
 * @returns {object}
 */
export function generateLinkset(resourceUrl, { parentUrl = null, isContainer = false, describedByUrl } = {}) {
  const link = { anchor: resourceUrl };
  if (parentUrl) link.up = [{ href: parentUrl }];
  link.type = [{ href: LWS + (isContainer ? 'Container' : 'DataResource') }];
  if (describedByUrl) link.describedby = [{ href: describedByUrl }];
  return { linkset: [link] };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/lws-linkset.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lws/linkset.js test/lws-linkset.test.js
git commit -m "$(printf 'feat(lws): generateLinkset (RFC 9264 anchor/up/type/describedby)\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

### Task 5: Negotiate `application/linkset+json` on resource GET + `rel="linkset"`

**Files:**
- Modify: `src/rdf/conneg.js` (register the media type — mirror L1's `LWS_JSON`)
- Modify: `src/handlers/resource.js` (additive conneg branch in BOTH the container GET branch ~line 340 and the file GET branch ~line 416)
- Test: fold the e2e into Task 6; a `selectContentType` unit assertion goes in `test/lws-conneg.test.js` (extend the L1 file) or a new `test/lws-linkset-conneg.test.js`.

**Interfaces:**
- `RDF_TYPES.LINKSET === 'application/linkset+json'`; `selectContentType` returns it when explicitly requested (independent of the Turtle conneg flag, same as `LWS_JSON`).
- When `request.lwsEnabled && selectContentType(acceptHeader, …) === RDF_TYPES.LINKSET`: serve `generateLinkset(resourceUrl, {parentUrl: parentContainerUrl(resourceUrl), isContainer, describedByUrl})` as `application/linkset+json`, and also emit `Link: <resourceUrl>; rel="linkset"; type="application/linkset+json"` on the **default** (non-linkset) GET so clients can discover it.

- [ ] **Step 1: Register the media type (failing test first)**

Add to `test/lws-conneg.test.js` (or new file):

```js
test('linkset+json is a known RDF type and is negotiable', () => {
  assert.equal(RDF_TYPES.LINKSET, 'application/linkset+json');
  assert.equal(selectContentType('application/linkset+json', false), 'application/linkset+json');
});
```

Then in `src/rdf/conneg.js`: add `LINKSET: 'application/linkset+json'` to `RDF_TYPES`, and an early branch in `selectContentType` (next to the `LWS_JSON` one L1 added):

```js
if (acceptHeader && acceptHeader.toLowerCase().includes(RDF_TYPES.LINKSET)) {
  return RDF_TYPES.LINKSET;
}
```

- [ ] **Step 2: Add the linkset GET branch (additive) in both paths**

In `src/handlers/resource.js`, in the container GET branch (alongside the L1 `lws+json` branch ~line 350) and in the file GET branch (~line 416), insert **before** the existing serialization:

```js
// LWS per-resource linkset — only when enabled AND explicitly negotiated.
if (request.lwsEnabled && selectContentType(acceptHeader, request.connegEnabled) === RDF_TYPES.LINKSET) {
  const ls = generateLinkset(resourceUrl, {
    parentUrl: parentContainerUrl(resourceUrl),
    isContainer,                                  // true in the container branch, false in the file branch
    describedByUrl: storageDescriptionUrl(resourceUrl),  // helper from Task 3 (src/lws/storage-description.js)
  });
  reply.header('Content-Type', RDF_TYPES.LINKSET);
  reply.header('Vary', 'Accept, Authorization, Origin');
  return reply.send(JSON.stringify(ls, null, 2));
}
```

Add `generateLinkset` + `storageDescriptionUrl` to the imports. In the file branch `isContainer` is `false`; in the container branch it is `true`.

- [ ] **Step 3: Advertise the linkset via `rel="linkset"` on the default GET**

In `getAllHeaders` (`src/ldp/headers.js`), when `lwsEnabled`, also append `<{resourceUrl}>; rel="linkset"; type="application/linkset+json"` to the `Link` header (the same place Task 3 appended `storageDescription`). The `resourceUrl` is already available to `getAllHeaders`. Extend the Task 3 unit test with a `rel="linkset"` assertion.

- [ ] **Step 4: Full suite**

Run: `npm test`
Expected: PASS — default GETs unchanged; only `Accept: application/linkset+json` under `--lws` returns the linkset.

- [ ] **Step 5: Commit**

```bash
git add src/rdf/conneg.js src/handlers/resource.js src/ldp/headers.js test/lws-conneg.test.js
git commit -m "$(printf 'feat(lws): serve per-resource linkset via conneg + rel=linkset (--lws)\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

### Task 6: HEAD parity + end-to-end conformance test

**Files:**
- Modify: `src/handlers/resource.js` `handleHead` (~line 769–934; resolve the relevant part of the `TODO(lws-head-parity)` at ~line 854 — emit the `rel="storageDescription"` + `rel="linkset"` headers on HEAD too; HEAD does not return a linkset *body*, only the headers)
- Test: `test/lws-discovery-conformance.test.js` (new) — boots `--lws`, exercises storage description + linkset + Link headers + negative controls.

- [ ] **Step 1: HEAD parity for the discovery Link headers**

In `handleHead`, ensure the same `getAllHeaders({…, lwsEnabled, storageDescriptionUrl})` path runs (so HEAD carries `rel="storageDescription"` and `rel="linkset"` identically to GET). HEAD never returns a body; if a client sends `Accept: application/lws+json`/`application/linkset+json` on HEAD, set the matching `Content-Type` header (parity with GET's negotiated type) but send no body. Narrow the `TODO(lws-head-parity)` comment to whatever remains (the L1 `lws+json` HEAD body-negotiation parity, if still open).

- [ ] **Step 2: Write the e2e conformance test**

Model the boot on `test/container.test.js` / the L1 `test/lws-conformance.test.js`. Boot with `{ lws: true }`, create `/alice/notes/note.ttl`, then assert:

```js
// (a) Storage Description resource
const sd = await get('/.well-known/lws-storage', { Accept: 'application/lws+json' });
assert.equal(sd.headers['content-type'].split(';')[0], 'application/lws+json');
const sdBody = JSON.parse(sd.body);
assert.equal(sdBody['@context'], 'https://www.w3.org/ns/lws/v1');
assert.equal(sdBody.type, 'Storage');
assert.ok(sdBody.service.some(s => s.type === 'StorageDescription' && s.serviceEndpoint));

// (b) storageDescription Link rel on a regular resource GET (MUST: all GET/HEAD)
const note = await get('/alice/notes/note.ttl', { Accept: 'text/turtle' });
assert.match(note.headers['link'] || '', /rel="https:\/\/www\.w3\.org\/ns\/lws#storageDescription"/);
assert.match(note.headers['link'] || '', /rel="linkset"/);

// (c) per-resource linkset via conneg
const ls = await get('/alice/notes/note.ttl', { Accept: 'application/linkset+json' });
assert.equal(ls.headers['content-type'].split(';')[0], 'application/linkset+json');
const lsBody = JSON.parse(ls.body);
assert.equal(lsBody.linkset[0].anchor.endsWith('/alice/notes/note.ttl'), true);
assert.equal(lsBody.linkset[0].type[0].href, 'https://www.w3.org/ns/lws#DataResource');
assert.ok(lsBody.linkset[0].up);

// (d) HEAD parity
const head = await head('/alice/notes/note.ttl');
assert.match(head.headers['link'] || '', /rel="https:\/\/www\.w3\.org\/ns\/lws#storageDescription"/);

// (e) negative controls: with --lws OFF (separate boot), none of the rels/route appear;
//     and with --lws ON but default Accept, the body is still LDP/Turtle (not linkset).
```

- [ ] **Step 3: Run it, then the full suite**

Run: `node --test test/lws-discovery-conformance.test.js` then `npm test`
Expected: PASS — discovery additions + zero regressions across the whole suite (including L1).

- [ ] **Step 4: Commit + push + open PR into `la3d/lws`**

```bash
git add src/handlers/resource.js test/lws-discovery-conformance.test.js
git commit -m "$(printf 'test(lws): e2e storage-description + linkset conformance + HEAD parity + negative controls\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
git push -u origin la3d/lws-discovery
gh pr create --repo LA3D/JavaScriptSolidServer --base la3d/lws --head la3d/lws-discovery \
  --title 'L2: LWS Storage Description + per-resource Linkset (discovery slice, --lws)' \
  --body 'Adds the two storage-side LWS discovery MUSTs over L1. See docs/superpowers/plans/2026-06-30-lws-L2-storage-discovery.md in lws-pod.'
```

---

## What L2 delivers / what it does NOT

**Delivers:** a JSS fork that, behind `--lws`, serves a spec-conformant **Storage Description** (`type: "Storage"`, `service[]`) at `/.well-known/lws-storage`, advertises it via `Link: rel="https://www.w3.org/ns/lws#storageDescription"` on **all** storage GET/HEAD responses (the spec MUST), and serves a **per-resource RFC 9264 linkset** (`application/linkset+json`, `anchor`/`up`/`type`/`describedby`) via content negotiation advertised by `Link: rel="linkset"` — with default LDP/Solid behavior provably unchanged (negative controls in Task 6).

**Explicitly NOT in L2** (later plans / layers, restated from "Why this scope"):
- `/.well-known/lws-configuration` (RFC 8414 **AS** metadata — belongs to the Keycloak auth track; JSS lacks RFC 8693 token-exchange).
- Linkset **mutation** — PUT/PATCH with `If-Match` → 412 / absent → 428, atomic-with-resource updates, ETag regeneration; the standalone `.meta` linkset resource.
- Per-pod (multi-user) storage descriptions (L2 is single-storage).
- Storage Description `capability` advertising (PatchSupport etc.); `TypeIndexService` / Type Search (L3 / Tranche 2).
- S3 storage backend; any PUT/POST/PATCH/DELETE semantic changes.

## Self-review notes

- Spec coverage: storage description `@context`/`id`/`type:"Storage"`/`service[]` with `type`+`serviceEndpoint` (Task 1, `Discovery.html`); the `rel="…#storageDescription"` MUST on all GET/HEAD (Tasks 3+6); RFC 9264 linkset `anchor`/`up`/`type`/`describedby` (Task 4) served via conneg with `rel="linkset"` (Task 5) — all from `Discovery.html` / `Operations/metadata.md` / `Operations/read-resource.md`. `lws-configuration`, linkset mutation, multi-pod, capability/TypeIndex intentionally deferred (see scope section).
- Type consistency: `generateStorageDescription`, `generateLinkset`, `storageDescriptionUrl(resourceUrl)`, `RDF_TYPES.LINKSET` are defined once and consumed by name in later tasks. Builds on L1's `RDF_TYPES.LWS_JSON`, `parentContainerUrl`, `request.lwsEnabled`, `getAllHeaders({…,lwsEnabled})` — reused, not re-derived.
- Additivity guarantee is itself tested (Task 6 negative controls: `--lws` off ⇒ no rels/route; `--lws` on + default Accept ⇒ still LDP), so a regression in default behavior fails the suite.
