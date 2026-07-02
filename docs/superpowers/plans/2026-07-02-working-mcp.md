# Working MCP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the pod's MCP a faithful, governed, discoverable surface over the shipped LWS layer — MCP writes go through SHACL admission + type-capture, MCP can read the LWS discovery surfaces (WAC-filtered, no-oracle), `/mcp` is rate-limited, skill reads honor WAC, and a credential-tier seam exists (default off).

**Architecture:** Two "shared core, two entry points" extractions — `applyLwsWrite` (admission→write→type-capture) called by both the HTTP handlers and the MCP write tools; `collectAuthorizedResources` (WAC-filtered walk) called by both the HTTP `/types/*` handlers and the new MCP `lws_type_search`. Everything `--lws`-gated + additive; the default LDP path and non-`--lws` path stay provably unchanged (negative controls). Credential hardening ships as a seam that defaults to today's behavior.

**Tech Stack:** Node ESM, Fastify, `@fastify/rate-limit`, `node:test` (fork unit suite, run serial), Vitest (lws-pod live-pod gate), Docker + Caddy TLS rig.

**Spec:** `docs/superpowers/specs/2026-07-02-working-mcp-design.md`.

## Global Constraints

- **Two repos.** Fork code + fork unit tests live in **`~/dev/git/LA3D/JavaScriptSolidServer`** (branch `la3d/lws`, work on a new `la3d/mcp-working` branch). The live-pod gate, Makefile, `Dockerfile.fork`, `docker-compose.fork-tls.yml`, and `FOLLOWUP.md` live in **`~/dev/git/LA3D/agents/lws-pod`**. Every file below is labeled with its repo.
- **Additive + gated.** All new behavior is behind `request.lwsEnabled` (the `--lws` flag) except the skill-WAC fix (a security fix that applies always) and the rate-limit (applies always). Non-`--lws` and default-LDP paths MUST stay byte-for-byte unchanged — prove with a negative-control test per task where applicable.
- **Fork test runner:** `node --test --test-concurrency=1` (serial — the suite shares a filesystem pod). Never run fork tests concurrently.
- **Commit style (both repos):** `[Agent: Claude] type(scope): subject` … ending `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`. Stage specific files; never `git add -A`.
- **No new deps.** Reuse `admit`, `captureDeclaredTypes`, `parseFilter`, `matchesFilter`, `checkAccess`, `trustAwareRateLimit` — all already in the fork.
- **Credential-policy default is `'trusted-local'`** — behavior identical to today unless explicitly set to `'audience-bound'`.

---

### Task 1: Extract `applyLwsWrite` shared core (behavior-preserving refactor)

Pull the LWS governance+persist slice (admission → `storage.write` → type-capture) out of `handlePut` and `handlePost` into one request-agnostic function. HTTP behavior must not change.

**Files:**
- Create: `~/dev/git/LA3D/JavaScriptSolidServer/src/lws/write.js`
- Modify: `~/dev/git/LA3D/JavaScriptSolidServer/src/handlers/resource.js` (`handlePut`, the admission+write+capture block ~lines 145-190)
- Modify: `~/dev/git/LA3D/JavaScriptSolidServer/src/handlers/container.js` (`handlePost`, block ~lines 105-139)
- Test: `~/dev/git/LA3D/JavaScriptSolidServer/test/lws-write.test.js`

**Interfaces:**
- Produces: `applyLwsWrite({ storage, storagePath, resourceUrl, content, contentType, declaredTypes, lwsEnabled }) → Promise<Result>` where
  `Result = { ok: true, wrote: boolean, shapeUrl: string|null, advisories: object[] }` on admit/clean,
  or `{ ok: false, shapeUrl: string|null, violations: object[] }` on SHACL Violation.
  `declaredTypes: string[]` is the list of `rel="type"` URIs (already parsed; empty array clears the sidecar). When `lwsEnabled` is false: skip admission + skip capture, just `storage.write`, return `{ ok:true, wrote, shapeUrl:null, advisories:[] }`.
- Consumes (from existing modules): `admit`, `constraintProblem`, `urlToStoragePath` (`../lws/admission.js`); `captureDeclaredTypes`, `typeStorePath` (`../lws/type-metadata.js`).

- [ ] **Step 1: Write the failing test**

`test/lws-write.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyLwsWrite } from '../src/lws/write.js';

// Minimal in-memory storage double exposing the surface applyLwsWrite uses.
function fakeStorage(initial = {}) {
  const files = new Map(Object.entries(initial));
  return {
    files,
    async read(p) { if (!files.has(p)) throw new Error('nf'); return Buffer.from(files.get(p)); },
    async write(p, buf) { files.set(p, buf.toString('utf8')); return true; },
    async remove(p) { files.delete(p); return true; },
    async exists(p) { return files.has(p); },
  };
}

test('lwsEnabled=false: writes, no admission, no capture', async () => {
  const s = fakeStorage();
  const r = await applyLwsWrite({
    storage: s, storagePath: '/alice/x', resourceUrl: 'https://pod/alice/x',
    content: Buffer.from('{}'), contentType: 'application/ld+json',
    declaredTypes: [], lwsEnabled: false,
  });
  assert.equal(r.ok, true);
  assert.equal(r.wrote, true);
  assert.equal(s.files.get('/alice/x'), '{}');
});

test('lwsEnabled, no constraint declared: admits and writes', async () => {
  const s = fakeStorage();
  const r = await applyLwsWrite({
    storage: s, storagePath: '/alice/y', resourceUrl: 'https://pod/alice/y',
    content: Buffer.from('{}'), contentType: 'application/ld+json',
    declaredTypes: [], lwsEnabled: true,
  });
  assert.equal(r.ok, true);
  assert.equal(s.files.get('/alice/y'), '{}');
});

test('declaredTypes captured to sidecar; empty clears it', async () => {
  const s = fakeStorage();
  await applyLwsWrite({
    storage: s, storagePath: '/alice/z', resourceUrl: 'https://pod/alice/z',
    content: Buffer.from('{}'), contentType: 'application/ld+json',
    declaredTypes: ['https://ex/Note'], lwsEnabled: true,
  });
  assert.ok(s.files.has('/alice/z.lwstypes'), 'sidecar written');
  await applyLwsWrite({
    storage: s, storagePath: '/alice/z', resourceUrl: 'https://pod/alice/z',
    content: Buffer.from('{}'), contentType: 'application/ld+json',
    declaredTypes: [], lwsEnabled: true,
  });
  assert.equal(s.files.has('/alice/z.lwstypes'), false, 'sidecar cleared');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd ~/dev/git/LA3D/JavaScriptSolidServer && node --test --test-concurrency=1 test/lws-write.test.js`
Expected: FAIL — `Cannot find module '../src/lws/write.js'`.

- [ ] **Step 3: Write `src/lws/write.js`**

```js
import { admit, urlToStoragePath } from './admission.js';
import { captureDeclaredTypes, typeStorePath } from './type-metadata.js';

/**
 * Shared LWS write pipeline: SHACL admission → storage.write → type-capture.
 * Request-agnostic so both the HTTP handlers and the MCP write tools use ONE
 * enforcement path (the drift that let MCP bypass admission becomes impossible).
 * Callers own their own reply/tool framing; this returns data only.
 */
export async function applyLwsWrite({
  storage, storagePath, resourceUrl, content, contentType, declaredTypes = [], lwsEnabled,
}) {
  let shapeUrl = null;
  let advisories = [];

  if (lwsEnabled) {
    const targetMetaPath = storagePath + '.meta';
    const containerMetaPath = storagePath.slice(0, storagePath.lastIndexOf('/') + 1) + '.meta';
    const result = await admit({
      storage, content, contentType, resourceUrl,
      targetMetaPath, containerMetaPath, shapeUrlToPath: urlToStoragePath,
    });
    if (result.decision === 'reject') {
      return { ok: false, shapeUrl: result.shapeUrl, violations: result.violations };
    }
    shapeUrl = result.shapeUrl || null;
    advisories = result.advisories || [];
  }

  const wrote = await storage.write(storagePath, content);

  if (lwsEnabled && wrote) {
    if (declaredTypes.length) await captureDeclaredTypes(storage, storagePath, declaredTypes);
    else await storage.remove(typeStorePath(storagePath));
  }

  return { ok: true, wrote, shapeUrl, advisories };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test --test-concurrency=1 test/lws-write.test.js`
Expected: PASS (3 tests).

- [ ] **Step 5: Refactor `handlePut` to call `applyLwsWrite`**

In `src/handlers/resource.js`, replace the admission block + `storage.write` + type-capture block (the code from `// L3 SHACL admission` through the `else await storage.remove(typeStorePath(storagePath));` block) with:

```js
  // L3 admission + write + type-capture via the shared LWS core (--lws-gated inside).
  const declared = request.lwsEnabled ? parseTypeLinks(request.headers.link || '') : [];
  const w = await applyLwsWrite({
    storage, storagePath, resourceUrl,
    content,
    contentType: (connegEnabled && (inputType === RDF_TYPES.TURTLE || inputType === RDF_TYPES.N3))
      ? RDF_TYPES.JSON_LD : (request.headers['content-type'] || ''),
    declaredTypes: declared,
    lwsEnabled: request.lwsEnabled,
  });
  if (!w.ok) {
    reply.header('content-type', 'application/problem+json');
    if (w.shapeUrl) reply.header('Link', `<${w.shapeUrl}>; rel="describedby"`);
    return reply.code(400).send(constraintProblem({
      shapeUrl: w.shapeUrl, violations: w.violations, instance: resourceUrl,
    }));
  }
  if (!w.wrote) {
    return reply.code(500).send({ error: 'Write failed' });
  }
  if (w.shapeUrl) request.__lwsShapeUrl = w.shapeUrl;
  if (w.advisories.length) request.__lwsAdvisories = w.advisories;
```

Add the import at the top of `resource.js`:

```js
import { applyLwsWrite } from '../lws/write.js';
```

Keep the existing `admit`/`constraintProblem`/`urlToStoragePath` and `captureDeclaredTypes`/`typeStorePath` imports only if still referenced elsewhere in the file; remove any that become unused (leave `parseTypeLinks`, `constraintProblem` — both still used here).

- [ ] **Step 6: Refactor `handlePost` the same way**

In `src/handlers/container.js`, replace its admission block + `success = await storage.write(...)` + type-capture block (~lines 105-139) with the equivalent, using its local `newStoragePath`, `resourceUrl`, `linkHeader`, and `isCreatingContainer`:

```js
  const declared = request.lwsEnabled ? parseTypeLinks(linkHeader) : [];
  const w = await applyLwsWrite({
    storage, storagePath: newStoragePath, resourceUrl,
    content, contentType: /* the post-conneg contentType already computed above */ postContentType,
    declaredTypes: isCreatingContainer ? [] : declared,
    lwsEnabled: request.lwsEnabled,
  });
  if (!w.ok) {
    reply.header('content-type', 'application/problem+json');
    if (w.shapeUrl) reply.header('Link', `<${w.shapeUrl}>; rel="describedby"`);
    return reply.code(400).send(constraintProblem({
      shapeUrl: w.shapeUrl, violations: w.violations, instance: resourceUrl,
    }));
  }
  let success = w.wrote;
  if (w.shapeUrl) request.__lwsShapeUrl = w.shapeUrl;
  if (w.advisories.length) request.__lwsAdvisories = w.advisories;
```

Note: `container.js` skips capture for container creation (`!isCreatingContainer`) — preserved by passing `declaredTypes: []` in that case. Use the same `contentType` value `handlePost` currently passes to `admit` (bind it to a local `postContentType` if not already named). Add `import { applyLwsWrite } from '../lws/write.js';`.

- [ ] **Step 7: Run the write/admission/type regression suites**

Run: `node --test --test-concurrency=1 test/lws-constraint.test.js test/lws-type-metadata.test.js test/lws-type-index.test.js test/lws-write.test.js`
Expected: PASS, no diffs in admission/capture behavior.

- [ ] **Step 8: Run the FULL fork suite (negative controls prove LDP unchanged)**

Run: `node --test --test-concurrency=1`
Expected: PASS — same count as before the refactor (baseline 1127). If any test flips, the extraction changed behavior — fix before proceeding.

- [ ] **Step 9: Commit**

```bash
cd ~/dev/git/LA3D/JavaScriptSolidServer
git checkout -b la3d/mcp-working
git add src/lws/write.js src/handlers/resource.js src/handlers/container.js test/lws-write.test.js
git commit -m "$(printf '%s\n' '[Agent: Claude] refactor(lws): extract applyLwsWrite shared write core' '' 'Admission→write→type-capture in one request-agnostic fn; handlePut/handlePost' 'now call it. Behavior-preserving (full suite green).' '' 'Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

### Task 2: Route MCP writes through `applyLwsWrite`

Close the finding: `write_resource`/`create_resource` currently call `storage.write` directly, bypassing admission + capture. Route them through the shared core and add a `types` param (MCP has no `Link` header).

**Files:**
- Modify: `~/dev/git/LA3D/JavaScriptSolidServer/src/mcp/tools.js` (`write_resource` ~132, `create_resource` ~146, plus their `TOOLS` registry `inputSchema` entries)
- Test: `~/dev/git/LA3D/JavaScriptSolidServer/test/mcp-lws-write.test.js`

**Interfaces:**
- Consumes: `applyLwsWrite` (Task 1); `ctx.webId`, `ctx.lwsEnabled` (see Step 4 — the plugin must pass `lwsEnabled` into `ctx`).
- Produces: MCP `write_resource`/`create_resource` now honor admission when `ctx.lwsEnabled`; a Violation returns a `toolError` carrying `violations` + `describedby`.

- [ ] **Step 1: Thread `lwsEnabled` into the MCP `ctx`**

In `src/mcp/index.js`, the `ctx` object (~line 176) gains `lwsEnabled`. The plugin is registered in `server.js`; pass the flag through. In `mcpPlugin`, read it from the fastify instance options or a decorator. Concretely, in `src/mcp/index.js` where `ctx` is built:

```js
    const ctx = {
      webId: webId || null,
      origin: originOf(request),
      federationDepth,
      lwsEnabled: request.lwsEnabled || false,
    };
```

(`request.lwsEnabled` is already decorated on every request by the same onRequest hook that sets it for the HTTP handlers — confirm it is visible on `/mcp` requests; if not, decorate it in the plugin from the server option.)

- [ ] **Step 2: Write the failing test**

`test/mcp-lws-write.test.js` (uses the fork's MCP test harness pattern from `test/mcp.test.js` — spin a server with `--lws`, provision a shape + container `.meta` `describedby`, then call the tool):

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { callTool } from '../src/mcp/tools.js';
// Reuse the shape/.meta provisioning + owner ctx helpers from test/helpers.js.
import { startLwsPod, ownerCtx, putShape, putContainerMeta } from './helpers.js';

test('MCP write of a non-conforming body is rejected with violations', async (t) => {
  const pod = await startLwsPod(t);                       // --lws server + storage double
  const ctx = { ...ownerCtx(pod), lwsEnabled: true };
  await putShape(pod, '/shapes/note', /* min-count on ex:title */);
  await putContainerMeta(pod, '/notes/', { describedby: '/shapes/note' });

  const res = await callTool('write_resource', {
    path: '/notes/bad', content: '{"@type":"https://ex/Note"}', contentType: 'application/ld+json',
  }, ctx);
  assert.equal(res.isError, true);
  assert.match(JSON.stringify(res), /violation/i);
});

test('MCP write of a conforming body admits and captures types', async (t) => {
  const pod = await startLwsPod(t);
  const ctx = { ...ownerCtx(pod), lwsEnabled: true };
  const res = await callTool('write_resource', {
    path: '/notes/ok', content: '{"@type":"https://ex/Note","https://ex/title":"hi"}',
    contentType: 'application/ld+json', types: ['https://ex/Note'],
  }, ctx);
  assert.equal(res.isError ?? false, false);
});
```

(If `test/helpers.js` lacks `startLwsPod`/`putShape`/`putContainerMeta`, add thin wrappers there mirroring `test/lws-type-index.test.js` setup — fold that into this task.)

- [ ] **Step 3: Run test to verify it fails**

Run: `node --test --test-concurrency=1 test/mcp-lws-write.test.js`
Expected: FAIL — the current `write_resource` bypasses admission, so the non-conforming write returns success.

- [ ] **Step 4: Rewrite `write_resource`**

```js
async function write_resource({ path, content, contentType, types }, ctx) {
  if (!path) return toolError('path required');
  if (path.endsWith('/')) return toolError('cannot PUT a container; use create_resource');
  if (content == null) return toolError('content required');
  if (!(await wac(ctx, path, AccessMode.WRITE))) {
    return toolError(`access denied: write ${path}`);
  }
  const w = await applyLwsWrite({
    storage,
    storagePath: path,
    resourceUrl: buildUrl(ctx, path),
    content: Buffer.from(content, 'utf8'),
    contentType: contentType || 'text/plain',
    declaredTypes: Array.isArray(types) ? types : [],
    lwsEnabled: ctx.lwsEnabled,
  });
  if (!w.ok) {
    return toolError(`admission rejected ${path}`, {
      violations: w.violations, describedby: w.shapeUrl,
    });
  }
  if (!w.wrote) return toolError(`write failed: ${path}`);
  emitChange(buildUrl(ctx, path));
  return toolText(`wrote ${path} (${Buffer.byteLength(content, 'utf8')} bytes)`);
}
```

Add `import { applyLwsWrite } from '../lws/write.js';` to `tools.js`. If `toolError` does not accept a second data arg, extend it in `src/mcp/protocol.js` to merge an optional `data` object into the error payload (small, additive).

- [ ] **Step 5: Apply the same routing to `create_resource`**

For the non-container branch of `create_resource`, replace the direct `storage.write(childPath, ...)` with an `applyLwsWrite` call (same shape, `storagePath: childPath`, `declaredTypes: Array.isArray(types) ? types : []`, `lwsEnabled: ctx.lwsEnabled`), returning a `toolError` with `violations`/`describedby` on `!w.ok`. Leave the container-creation branch (`isContainer`) unchanged — container POST carries no body to admit (matches the HTTP handler's `!isCreatingContainer` capture skip).

- [ ] **Step 6: Add the `types` param to both `inputSchema` registry entries**

In the `TOOLS` registry, add to `write_resource` and `create_resource` `inputSchema.properties`:

```js
        types: { type: 'array', items: { type: 'string' },
          description: 'Optional server-managed type URIs (LWS rel="type" equivalent).' },
```

- [ ] **Step 7: Run tests**

Run: `node --test --test-concurrency=1 test/mcp-lws-write.test.js test/mcp.test.js`
Expected: PASS (new admission behavior + existing MCP tests still green).

- [ ] **Step 8: Full suite**

Run: `node --test --test-concurrency=1`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/mcp/tools.js src/mcp/index.js src/mcp/protocol.js test/mcp-lws-write.test.js test/helpers.js
git commit -m "$(printf '%s\n' '[Agent: Claude] fix(mcp): route MCP writes through LWS admission + type-capture' '' 'write_resource/create_resource now call applyLwsWrite; add types param; a' 'SHACL Violation returns a tool error with violations + describedby. Closes the' 'MCP-write-bypasses-admission gap.' '' 'Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

### Task 3: LWS-aware read tools (`lws_type_search`, `lws_linkset`, `lws_storage_description`)

Extract the WAC-filtered walk so the MCP tool inherits the no-oracle property, then add three read tools.

**Files:**
- Create: `~/dev/git/LA3D/JavaScriptSolidServer/src/lws/authorized-resources.js`
- Modify: `~/dev/git/LA3D/JavaScriptSolidServer/src/handlers/type-index.js` (`authorizedResources` → delegate to the extracted fn)
- Modify: `~/dev/git/LA3D/JavaScriptSolidServer/src/mcp/tools.js` (three new tools + registry)
- Test: `~/dev/git/LA3D/JavaScriptSolidServer/test/mcp-lws-read.test.js`

**Interfaces:**
- Produces: `collectAuthorizedResources({ agentWebId, origin, needDescribedby }) → Promise<Array<{ id, types, relations? }>>` — walks `/`, drops any resource the `agentWebId` can't READ (per-query ACL memo), enriches with declared types (+ `describedby` targets when `needDescribedby`). Identical logic to the current `authorizedResources`, but keyed on identity instead of a Fastify request.
- Consumes: `walkResources`, `checkAccess`, `readDeclaredTypes`, `resourceTypes`, `describedbyTargets` (all already imported by `type-index.js`); `parseFilter`, `matchesFilter`, `containerItemTypes` (`../lws/type-index.js`); `ctx.webId`, `ctx.origin` (MCP tools).

- [ ] **Step 1: Write the failing test**

`test/mcp-lws-read.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { collectAuthorizedResources } from '../src/lws/authorized-resources.js';
import { callTool } from '../src/mcp/tools.js';
import { startLwsPod, ownerCtx, seedTyped } from './helpers.js';

test('collectAuthorizedResources drops resources the agent cannot read (no oracle)', async (t) => {
  const pod = await startLwsPod(t);
  await seedTyped(pod, '/pub/a', 'https://ex/Note', { publicRead: true });
  await seedTyped(pod, '/priv/b', 'https://ex/Note', { publicRead: false });
  const anon = await collectAuthorizedResources({ agentWebId: null, origin: pod.origin });
  const ids = anon.map((r) => r.id);
  assert.ok(ids.some((i) => i.endsWith('/pub/a')));
  assert.equal(ids.some((i) => i.endsWith('/priv/b')), false, 'private resource invisible to anon');
});

test('lws_type_search returns only WAC-readable matches', async (t) => {
  const pod = await startLwsPod(t);
  await seedTyped(pod, '/pub/a', 'https://ex/Note', { publicRead: true });
  await seedTyped(pod, '/priv/b', 'https://ex/Note', { publicRead: false });
  const res = await callTool('lws_type_search',
    { type: ['https://ex/Note'] }, { webId: null, origin: pod.origin });
  const body = JSON.parse(res.content?.[0]?.text ?? res.text);
  assert.equal(body.items.length, 1);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test --test-concurrency=1 test/mcp-lws-read.test.js`
Expected: FAIL — `Cannot find module '../src/lws/authorized-resources.js'`.

- [ ] **Step 3: Create `src/lws/authorized-resources.js`**

```js
import { walkResources } from '../storage/filesystem.js';
import * as storage from '../storage/filesystem.js';
import { checkAccess } from '../wac/checker.js';
import { AccessMode } from '../wac/parser.js';
import { resourceTypes } from './type-index.js';
import { readDeclaredTypes } from './type-metadata.js';
import { describedbyTargets } from './constraint.js';

/** Origin-based resource id (path-mode: id = origin + urlPath). */
function idFor(origin, urlPath) { return origin.replace(/\/$/, '') + urlPath; }

/**
 * The single WAC-filtered walk. The per-resource checkAccess()-and-drop loop
 * IS the authz boundary — the filter is the GET predicate, so there is no
 * discovery oracle. Reused by the HTTP /types/* handlers and the MCP read tool.
 */
export async function collectAuthorizedResources({ agentWebId, origin, needDescribedby = false }) {
  const aclCache = new Map();
  const resources = await walkResources('/');
  const out = [];
  for (const r of resources) {
    const id = idFor(origin, r.urlPath);
    const { allowed } = await checkAccess({
      resourceUrl: id, resourcePath: r.urlPath, isContainer: r.isDirectory,
      agentWebId, requiredMode: AccessMode.READ, aclCache,
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

- [ ] **Step 4: Delegate the HTTP handler's `authorizedResources` to the extracted fn**

In `src/handlers/type-index.js`, replace the body of `authorizedResources(request, { needDescribedby })` with a call that resolves identity from the request, then delegates — keeping the HTTP behavior identical:

```js
async function authorizedResources(request, { needDescribedby = false } = {}) {
  const { webId: agentWebId } = await getWebIdFromRequestAsync(request).catch(() => ({ webId: null }));
  return collectAuthorizedResources({
    agentWebId, origin: originOf(request), needDescribedby,
  });
}
```

Add `import { collectAuthorizedResources } from '../lws/authorized-resources.js';`. Ensure `originOf`/`buildResourceUrl` produce the same id string the old code did (path-mode: `origin + urlPath`); if `buildResourceUrl` differs, keep using it inside `idFor` by parameterizing — but path-mode `pod.vardeman.me` deploy makes `origin + urlPath` exact.

- [ ] **Step 5: Run the HTTP type-index regression**

Run: `node --test --test-concurrency=1 test/lws-type-index.test.js test/lws-type-index-unit.test.js`
Expected: PASS (HTTP `/types/*` behavior unchanged).

- [ ] **Step 6: Add the three MCP tools**

In `src/mcp/tools.js`, add handlers + registry entries:

```js
import { collectAuthorizedResources } from '../lws/authorized-resources.js';
import { parseFilter, matchesFilter, containerItemTypes } from '../lws/type-index.js';
import { generateLinkset } from '../lws/linkset.js';

async function lws_type_search(args, ctx) {
  let filter;
  try { filter = parseFilter({ body: args || {} }); }
  catch (e) { return toolError(`bad filter: ${e.message}`); }
  const needDescribedby = Object.keys(filter.relations).length > 0;
  const resources = await collectAuthorizedResources({
    agentWebId: ctx.webId, origin: ctx.origin, needDescribedby,
  });
  const matched = resources.filter((r) => matchesFilter(r, filter));
  return toolJson({
    type: 'ContainerPage', totalItems: matched.length,
    items: matched.map((r) => ({ id: r.id, type: containerItemTypes(r.types) })),
  });
}

async function lws_linkset({ path }, ctx) {
  if (!path) return toolError('path required');
  if (!(await wac(ctx, path, AccessMode.READ))) return toolError(`access denied: read ${path}`);
  if (!(await storage.exists(path))) return toolError(`not found: ${path}`);
  const isContainer = path.endsWith('/');
  const declared = await readDeclaredTypes(storage, path);
  const shapes = await describedbyTargets(storage, path + '.meta', buildUrl(ctx, path));
  const ls = generateLinkset(buildUrl(ctx, path), {
    parentUrl: buildUrl(ctx, parentPath(path)),
    isContainer, describedByShapes: shapes, declaredTypes: declared,
  });
  return toolJson(ls);
}

async function lws_storage_description(_args, ctx) {
  // Mirror the /.well-known/lws-storage generator (same service set), scheme = ctx.origin.
  return toolJson(buildStorageDescription(ctx.origin));   // import the shared generator; see note
}
```

Note: `lws_storage_description` MUST call the same function that produces `/.well-known/lws-storage` — extract that generator into a shared module if it is currently inlined in `server.js`, and import it here (do NOT re-derive the service list). `readDeclaredTypes`, `describedbyTargets` are already imported by `constraint.js`/`type-metadata.js` — import them into `tools.js`.

Registry entries:

```js
  lws_type_search: {
    description: 'Search pod resources by LWS type (and describedby) — WAC-filtered, no-oracle.',
    inputSchema: { type: 'object', properties: {
      type: { type: 'array', items: {}, description: 'CNF type filter (see LWS Type Search).' },
      describedby: { type: 'array', items: {}, description: 'CNF describedby (shape) filter.' },
    } },
    handler: lws_type_search,
  },
  lws_linkset: {
    description: "A resource's RFC 9264 linkset: anchor/up/type/describedby.",
    inputSchema: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] },
    handler: lws_linkset,
  },
  lws_storage_description: {
    description: 'The pod storage description (type:Storage + advertised services).',
    inputSchema: { type: 'object', properties: {} },
    handler: lws_storage_description,
  },
```

- [ ] **Step 7: Run tests**

Run: `node --test --test-concurrency=1 test/mcp-lws-read.test.js`
Expected: PASS (no-oracle + WAC-filtered search).

- [ ] **Step 8: Full suite**

Run: `node --test --test-concurrency=1`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/lws/authorized-resources.js src/handlers/type-index.js src/mcp/tools.js test/mcp-lws-read.test.js
git commit -m "$(printf '%s\n' '[Agent: Claude] feat(mcp): LWS-aware read tools (type-search/linkset/storage-desc)' '' 'Extract collectAuthorizedResources (the WAC-filtered walk) and reuse it in the' 'MCP type-search tool so the no-oracle property is inherited, not reimplemented.' '' 'Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

### Task 4: Rate-limit `/mcp`

Attach the existing trust-aware limiter (anon 60/min per-IP; authed per-webId) to the `/mcp` route, mirroring the `/types/*` (`typeQueryRateLimit`) wiring incl. the plugin-boot-order fix.

**Files:**
- Modify: `~/dev/git/LA3D/JavaScriptSolidServer/src/server.js` (mcp registration ~541; reuse `trustAwareRateLimit`, `writeRateLimitMax`, `anonRateLimitMax`)
- Modify: `~/dev/git/LA3D/JavaScriptSolidServer/src/mcp/index.js` (accept a `rateLimit` route-config from plugin options and attach to `post('/mcp')`)
- Test: `~/dev/git/LA3D/JavaScriptSolidServer/test/mcp-rate-limit.test.js`

**Interfaces:**
- Consumes: `trustAwareRateLimit(authedMax, anonMax)` (`server.js:88`).
- Produces: `/mcp` returns `429` for an anonymous caller past `anonRateLimitMax`.

- [ ] **Step 1: Write the failing test**

`test/mcp-rate-limit.test.js` — start a server with a low `writeRateLimitMax`/anon override (mirror how `test/rate-limit-trust-aware.test.js` sets a low cap), fire N+1 anonymous `POST /mcp` from one IP, assert the last is `429`.

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, postMcp } from './helpers.js';   // helpers mirror rate-limit-trust-aware.test.js

test('/mcp is rate-limited for anonymous callers', async (t) => {
  const pod = await startServer(t, { mcp: true, writeRateLimitMax: 2 /* anon cap stays 60 unless overridden */ });
  let last;
  for (let i = 0; i < 62; i++) last = await postMcp(pod, { jsonrpc: '2.0', id: i, method: 'tools/list' });
  assert.equal(last.status, 429);
});
```

(If a low anon override isn't wired, this test drives 61 requests to exceed the fixed `anonRateLimitMax = 60`. Keep it under the CI time budget; if too slow, add an `anonRateLimitMax` option pass-through as part of this task and set it to 2.)

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test --test-concurrency=1 test/mcp-rate-limit.test.js`
Expected: FAIL — every request returns 200 (no limiter on `/mcp`).

- [ ] **Step 3: Pass the rate-limit config into `mcpPlugin` and attach it**

In `src/server.js` near the mcp registration (~541), build the config the same way `typeQueryRateLimit` is built (~922) and pass it into the plugin, ensuring it runs after the `@fastify/rate-limit` plugin boots (same `fastify.after()` structure the `/types/*` routes use ~1034-1057):

```js
    const mcpRateLimit = { config: { rateLimit: trustAwareRateLimit(writeRateLimitMax, anonRateLimitMax) } };
    fastify.register(mcpPlugin, { routeOptions: mcpRateLimit });
```

In `src/mcp/index.js`, accept the option and attach it to the route:

```js
export async function mcpPlugin(fastify, opts = {}) {
  const routeOptions = opts.routeOptions || {};
  // ...
  fastify.post('/mcp', routeOptions, async (request, reply) => { /* unchanged body */ });
}
```

Follow the exact boot-order pattern used for `writeRateLimit`/`typeQueryRateLimit` (the `server.js` comments ~1034 explain why the registration must sit inside the post-boot block). If `mcpPlugin` is registered outside that block, move its registration inside it so the `config.rateLimit` override actually wires.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test --test-concurrency=1 test/mcp-rate-limit.test.js`
Expected: PASS (last request `429`).

- [ ] **Step 5: Full suite (ensure no route-registration regressions)**

Run: `node --test --test-concurrency=1`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/server.js src/mcp/index.js test/mcp-rate-limit.test.js test/helpers.js
git commit -m "$(printf '%s\n' '[Agent: Claude] fix(mcp): rate-limit /mcp (trust-aware, matching /types/*)' '' 'Anon 60/min per-IP, authed per-webId. Closes the uncapped-/mcp DoS surface;' 'a type-search-over-MCP walk is now bounded like the HTTP /types/* walk.' '' 'Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

### Task 5: Skill reads honor WAC (close the arbitrary-file read)

`readSkill(path)` reads any pod path and the skill tools skip `wac()`. Gate them; "public" becomes an ACL fact.

**Files:**
- Modify: `~/dev/git/LA3D/JavaScriptSolidServer/src/mcp/tools.js` (`list_skills`, `read_skill`, `read_pod_skill`)
- Test: `~/dev/git/LA3D/JavaScriptSolidServer/test/mcp-skill-wac.test.js`

**Interfaces:**
- Consumes: `wac(ctx, path, AccessMode.READ)` (existing in `tools.js`).
- Produces: skill reads denied for a path the caller can't READ; `list_skills` omits skills the caller can't READ.

- [ ] **Step 1: Write the failing test**

`test/mcp-skill-wac.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { callTool } from '../src/mcp/tools.js';
import { startServer, ownerCtx, putFile, setPublicRead } from './helpers.js';

test('read_skill denies a private path to anonymous', async (t) => {
  const pod = await startServer(t, { mcp: true });
  await putFile(pod, '/private/secret.md', 'top secret', { publicRead: false });
  const res = await callTool('read_skill', { path: '/private/secret.md' },
    { webId: null, origin: pod.origin });
  assert.equal(res.isError, true);
  assert.match(JSON.stringify(res), /access denied/i);
});

test('read_skill allows a public-read skill file', async (t) => {
  const pod = await startServer(t, { mcp: true });
  await putFile(pod, '/SKILL.md', '# skill', { publicRead: true });
  const res = await callTool('read_skill', { path: '/SKILL.md' },
    { webId: null, origin: pod.origin });
  assert.equal(res.isError ?? false, false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test --test-concurrency=1 test/mcp-skill-wac.test.js`
Expected: FAIL — the private read succeeds (no WAC gate).

- [ ] **Step 3: Add `wac()` to the skill tools**

`read_skill` / `read_pod_skill` — gate on the resolved path:

```js
async function read_skill({ path }, ctx) {
  if (!path) return toolError('skill path required');
  const p = path.startsWith('/') ? path : '/' + path;
  if (!(await wac(ctx, p, AccessMode.READ))) return toolError(`access denied: read ${p}`);
  try { return toolJson(await readSkill(p)); }
  catch (e) { return toolError(e.message); }
}
```

`read_pod_skill` — gate on the pod-root skill path(s) it reads before returning. `list_skills` — after `discoverSkills()`, drop entries whose path fails `wac(ctx, entry.path, AccessMode.READ)`:

```js
async function list_skills(_args, ctx) {
  const idx = await discoverSkills();
  const visible = [];
  for (const s of idx) if (await wac(ctx, s.path, AccessMode.READ)) visible.push(s);
  return toolJson(visible);
}
```

(Confirm the `discoverSkills()` entry shape exposes `path`; if it uses a different key, use that.)

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test --test-concurrency=1 test/mcp-skill-wac.test.js`
Expected: PASS.

- [ ] **Step 5: Full suite + commit**

Run: `node --test --test-concurrency=1` → PASS.

```bash
git add src/mcp/tools.js test/mcp-skill-wac.test.js test/helpers.js
git commit -m "$(printf '%s\n' '[Agent: Claude] fix(mcp): skill reads honor WAC (close arbitrary-file read)' '' 'list_skills/read_skill/read_pod_skill now WAC-check; skill files are public by' 'ACL convention, not an auth bypass. WAC stays the sole access boundary.' '' 'Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

### Task 6: Credential-tier seam (`mcpCredentialPolicy`, default off)

Build the seam so the untrusted-agent decision lives in code, not a TODO. Default `'trusted-local'` = today's behavior; `'audience-bound'` refuses the replayable bearer.

**Files:**
- Modify: `~/dev/git/LA3D/JavaScriptSolidServer/src/config.js` (option + default) and `src/mcp/index.js` (enforcement in the `/mcp` handler)
- Modify: `~/dev/git/LA3D/JavaScriptSolidServer/bin/jss.js` (CLI flag pass-through, optional — keep minimal)
- Test: `~/dev/git/LA3D/JavaScriptSolidServer/test/mcp-credential-policy.test.js` (reject path, runs locally) + a `test/mcp-cid-e2e.test.js` marked skipped (`@public-rung`)

**Interfaces:**
- Consumes: `hasLwsCidAuth` (`../auth/lws-cid.js`), `hasSolidOidcAuth` (`../auth/solid-oidc.js`), `hasNostrAuth` (`../auth/token.js` neighbors) — the header-shape detectors already used by the auth dispatch.
- Produces: in `'audience-bound'` mode, `POST /mcp` without an audience-bound credential returns a JSON-RPC auth error (never proceeds to a tool call).

- [ ] **Step 1: Write the failing test (reject path — no doc-fetch, runs locally)**

`test/mcp-credential-policy.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, postMcp, ownerBearer } from './helpers.js';

test('audience-bound policy refuses the replayable RS256 bearer on /mcp', async (t) => {
  const pod = await startServer(t, { mcp: true, mcpCredentialPolicy: 'audience-bound' });
  const res = await postMcp(pod, { jsonrpc: '2.0', id: 1, method: 'tools/list' },
    { Authorization: `Bearer ${ownerBearer(pod)}` });   // 2-part / IdP-JWT bearer
  assert.equal(res.body.error?.code, -32001 /* auth error */);
});

test('trusted-local policy (default) still accepts the bearer', async (t) => {
  const pod = await startServer(t, { mcp: true });      // default 'trusted-local'
  const res = await postMcp(pod, { jsonrpc: '2.0', id: 1, method: 'tools/list' },
    { Authorization: `Bearer ${ownerBearer(pod)}` });
  assert.ok(res.body.result);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test --test-concurrency=1 test/mcp-credential-policy.test.js`
Expected: FAIL — the audience-bound case currently returns a normal result (no seam).

- [ ] **Step 3: Add the config option**

In `src/config.js`, add `mcpCredentialPolicy` with default `'trusted-local'` (mirror how `mcpEnabled`/`writeRateLimitMax` are read from options). Validate it is one of `'trusted-local' | 'audience-bound'`.

- [ ] **Step 4: Enforce in the `/mcp` handler**

In `src/mcp/index.js`, after resolving `webId` and before dispatching, when the policy is `'audience-bound'`:

```js
import { hasLwsCidAuth } from '../auth/lws-cid.js';
import { hasSolidOidcAuth } from '../auth/solid-oidc.js';

function isAudienceBoundCredential(request) {
  // Audience-bound + short-lived credential classes (aud=origin enforced downstream).
  return hasLwsCidAuth(request) || hasSolidOidcAuth(request);
}
// ...in the handler, after building ctx:
if (credentialPolicy === 'audience-bound' && !isAudienceBoundCredential(request)) {
  reply.code(401);
  return rpcError(body.id ?? null, RPC_ERRORS.AUTH_REQUIRED ?? -32001,
    'this endpoint requires an audience-bound credential (LWS-CID or Solid-OIDC DPoP)');
}
```

Thread `credentialPolicy` into the plugin from the server option (same mechanism as Task 4's `routeOptions`). Add the `-32001`/`AUTH_REQUIRED` code to `RPC_ERRORS` in `src/mcp/protocol.js` if absent.

- [ ] **Step 5: Run test to verify it passes**

Run: `node --test --test-concurrency=1 test/mcp-credential-policy.test.js`
Expected: PASS (reject in audience-bound; allow in trusted-local).

- [ ] **Step 6: Add the skipped `@public-rung` e2e placeholder**

`test/mcp-cid-e2e.test.js`:

```js
import { test } from 'node:test';

// Forcing function: CID-over-MCP *accept* needs a public-IP host (JSS's SSRF
// guard blocks fetching a CID doc on a loopback/private IP). Un-skip on the
// public rung. See docs/foundations/05-jss-spec-conformance.md axis 6.
test('@public-rung: audience-bound /mcp ACCEPTS a valid LWS-CID token', { skip: 'needs public-IP rung' }, () => {});
```

- [ ] **Step 7: Full suite + commit**

Run: `node --test --test-concurrency=1` → PASS (the `@public-rung` test reports skipped).

```bash
git add src/config.js src/mcp/index.js src/mcp/protocol.js bin/jss.js test/mcp-credential-policy.test.js test/mcp-cid-e2e.test.js test/helpers.js
git commit -m "$(printf '%s\n' '[Agent: Claude] feat(mcp): credential-tier seam (mcpCredentialPolicy, default off)' '' 'audience-bound mode refuses the replayable bearer on /mcp (reject path tested);' 'trusted-local default unchanged. CID-accept e2e skipped @public-rung as the' 'visible forcing function.' '' 'Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

- [ ] **Step 8: Merge the fork branch into `la3d/lws`**

```bash
cd ~/dev/git/LA3D/JavaScriptSolidServer
node --test --test-concurrency=1            # full suite green
git checkout la3d/lws && git merge --no-ff la3d/mcp-working
git log --oneline -1
git rev-parse HEAD                           # note the merge SHA for the container repin (Task 7)
```

---

### Task 7: Live-pod gate `make test-mcp` + container repin + docs

Prove the whole surface against the real fork `--lws` TLS pod, wire the gate, repin the container, update FOLLOWUP.

**Files (lws-pod repo `~/dev/git/LA3D/agents/lws-pod`):**
- Create: `tests/mcp.test.mjs`
- Modify: `Makefile` (add `test-mcp` target, mirror `test-typeindex`)
- Modify: `Dockerfile.fork` + `docker-compose.fork-tls.yml` (repin `JSS_GIT_REF`/image tag to the Task 6 merge SHA)
- Modify: `FOLLOWUP.md` (record working-MCP shipped + the remaining deferrals)

**Interfaces:**
- Consumes: the fork pod's MCP JSON-RPC (`POST /mcp`), the `tests/helpers.mjs` headless-bearer flow.

- [ ] **Step 1: Repin the container to the merge SHA + rebuild**

Edit `Dockerfile.fork` `ARG JSS_GIT_REF=<Task-6 merge SHA>` and `docker-compose.fork-tls.yml` `JSS_GIT_REF` default + `image:` tag (e.g. `fork-mcp`). Then:

Run: `cd ~/dev/git/LA3D/agents/lws-pod && make up-fork-tls`
Expected: build succeeds; `curl --cacert certs/rootCA.pem https://pod.vardeman.me/.well-known/lws-storage` lists the services.

- [ ] **Step 2: Write the live gate `tests/mcp.test.mjs`**

Mirror `tests/lws-typeindex.test.mjs`. Assert through `POST https://pod.vardeman.me/mcp` (JSON-RPC, owner bearer via `tests/helpers.mjs`):

```js
// 1. tools/list includes lws_type_search, lws_linkset, lws_storage_description, and write_resource has a `types` param.
// 2. write_resource of a non-conforming body against a describedby container → tool error with violations.
// 3. write_resource of a conforming body with types:[...] → ok; lws_type_search {type:[...]} returns it.
// 4. lws_type_search as ANONYMOUS omits a protected resource the owner can see (no-oracle).
// 5. read_skill of a non-public path as anonymous → access denied; of a public-read SKILL.md → ok.
// 6. 61 anonymous POST /mcp from one client → last is HTTP 429.
```

Write each as a Vitest `test(...)` using the same BASE/CA env as the other gates. Self-skip when the pod is not `--lws` (top-level probe), like `tests/lws-discovery.test.mjs`.

- [ ] **Step 3: Add the Makefile target**

In `Makefile`, after `test-indexed-relation`:

```make
test-mcp:
	@[ -d node_modules ] || npm ci
	@[ -f certs/rootCA.pem ] || { echo "certs/rootCA.pem missing — run 'make cert && make up-fork-tls' first"; exit 1; }
	BASE=https://pod.vardeman.me NODE_EXTRA_CA_CERTS=certs/rootCA.pem npx vitest run tests/mcp.test.mjs
```

- [ ] **Step 4: Run the full live gate matrix (no regressions)**

Run: `make test-mcp && make test-indexed-relation && make test-typeindex && make test-l3 && make test-lws`
Expected: `test-mcp` all green; the other four unchanged (indexed-relation 4/4, typeindex 7/7, l3 2/2, lws 6/6).

- [ ] **Step 5: Update `FOLLOWUP.md`**

Add a `▶ WORKING MCP DONE + MERGED (2026-07-02)` block: what shipped (governed MCP write, LWS read tools, `/mcp` rate-limit, skill-WAC fix, credential seam), the merge SHA + image tag, `make test-mcp` results. Move the MCP items out of the open-items list. Record the deferrals with their forcing functions: Comunica query surface (→ after OKF), SEP-2640 skills-as-Resources (→ align-when-stable), strict credential default + CID-over-MCP e2e (→ public rung, the `@public-rung` skipped test), A2A Agent Card / RFC 8693 (→ federation track). Reaffirm **Plan 2 / L4 (OKF) is next**.

- [ ] **Step 6: Commit (lws-pod repo)**

```bash
cd ~/dev/git/LA3D/agents/lws-pod
git add tests/mcp.test.mjs Makefile Dockerfile.fork docker-compose.fork-tls.yml FOLLOWUP.md
git commit -m "$(printf '%s\n' '[Agent: Claude] test(mcp): working-MCP live-pod gate + container repin' '' 'make test-mcp against the fork --lws TLS pod: governed write, LWS read tools' '(no-oracle), /mcp rate-limit, skill-WAC. Repin Dockerfile.fork to the merge SHA.' '' 'Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

## Self-Review

**Spec coverage:**
- Motivation gap 1 (write bypasses admission) → Tasks 1–2. ✓
- Gap 2 (no LWS surface) → Task 3. ✓
- Gap 3 (`/mcp` unbounded) → Task 4. ✓
- Gap 4 (skill arbitrary-read) → Task 5. ✓
- Security-model credential tiers + seam (⑤) → Task 6. ✓
- Out-of-scope items (Comunica, SEP-2640, strict default/CID e2e, A2A) → recorded, not built; forcing functions in Task 6 (skipped e2e) + Task 7 (FOLLOWUP). ✓
- Live gate + build discipline + conformance divergence → Task 7 (divergence already committed in `7f919ef`). ✓

**Placeholder scan:** No "TBD"/"add error handling". Two spots require the implementer to confirm an existing shape before wiring (`discoverSkills()` entry key in Task 5; `buildStorageDescription` extraction in Task 3) — each names the exact thing to confirm and the fallback, not a vague instruction.

**Type consistency:** `applyLwsWrite` return shape (`{ok, wrote, shapeUrl, advisories}` / `{ok:false, shapeUrl, violations}`) is used identically in Tasks 1, 2. `collectAuthorizedResources({agentWebId, origin, needDescribedby})` signature identical in Tasks 3 (HTTP delegate + MCP tool). `mcpCredentialPolicy` values (`'trusted-local'|'audience-bound'`) consistent across Task 6. Tool names (`lws_type_search`/`lws_linkset`/`lws_storage_description`) consistent Tasks 3, 7.

**Known implementer confirmations (fold into the relevant task, not blockers):** (a) `request.lwsEnabled` is visible on `/mcp` requests (Task 2 Step 1) — if not, decorate it from the server option; (b) the `/.well-known/lws-storage` generator is extractable into a shared module (Task 3 Step 6); (c) the `@fastify/rate-limit` boot-order block location for the mcp registration (Task 4 Step 3).
