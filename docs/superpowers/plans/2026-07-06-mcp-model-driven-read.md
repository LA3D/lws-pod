# MCP Model-Driven Read Path Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the pod's read/follow loop onto model-controlled MCP Tools (`read_resource` one-Web + `list_resources` + a `links` affordance carrier), fix the RFC 9264 salience + two probe defects, and make the agent-eval harness drive the pod's own tools bridge-less.

**Architecture:** Two new tools in the fork's MCP surface delegate to the *existing* resolver (`resources.js#readResource`) and registry (`surface.js`) — one implementation, two surfaces (Resources primitive stays for the host view). The remote arm absorbs `read_remote_resource` verbatim. Header-borne affordances travel as a structured `links` member (JSON-LD 1.1 §6.1/§6.2). Steering + defect fixes are small additive edits to `storage-description.js`, `mcp/index.js`, `ldp/headers.js`.

**Tech Stack:** Node 26, Fastify (JSS fork `la3d/lws`), `node --test`; lws-pod Vitest live gates; Anthropic SDK harness.

**Spec:** `docs/superpowers/specs/2026-07-06-mcp-model-driven-read-design.md` (amends `2026-07-03-mcp-affordance-surface-design.md`).

## Global Constraints

- **Two repos.** Tasks 1–8: the fork, `~/dev/git/LA3D/JavaScriptSolidServer`, branch **`la3d/mcp-read-tools`** off `la3d/lws`. Tasks 9–11: this repo (`lws-pod`), on `main`.
- **Fork commits:** conventional style (`feat(mcp): …`, `fix(lws): …`, `test(mcp): …`) + trailer `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`. lws-pod commits: `[Agent: Claude] type(scope): subject` + same trailer. Stage specific files, never `git add -A`.
- **Fork test commands:** single file `node --test --test-force-exit test/<file>`; full suite `node --test --test-concurrency=1 --test-force-exit test/` (serial; `--test-force-exit` works around a pre-existing open-handle hang in `test/mcp-lws-read.test.js` on node v26.4.0).
- **Tool budget:** registry ends at exactly **10** tools (9 − `read_remote_resource` + `read_resource` + `list_resources`).
- **Governance is inherited, never reimplemented:** the local arm calls `readResource()` (WAC-before-exists no-oracle, trust-typed sanitization); the remote arm moves the federation gate + depth cap + `sanitizeDeep` **verbatim**. No new authz path anywhere. `mcpCredentialPolicy` + `/mcp` rate-limit cover the new tools automatically (they sit at dispatch).
- **Surface-don't-apply:** the pod never fetches/merges an advertised remote context — it only surfaces the link.
- **Default LDP / non-`--lws` behavior unchanged** except the two deliberate defect fixes (§6 of the spec): `GET /mcp` 405 (mcp-gated anyway) and linkset-rel suppression (inside the `lwsEnabled` guard).

---

### Task 1: `read-tools.js` helpers — `parseRemoteLinks` + `localLinks`

**Files:**
- Create: `src/mcp/read-tools.js`
- Test: `test/mcp-read-tools.test.js`

**Interfaces:**
- Consumes: `describedbyTargets(storage, metaPath, resourceUrl)` (`src/lws/constraint.js`), `storageDescriptionUrl(url)` (`src/lws/storage-description.js`), `buildUrl(ctx, path)` / `parentPath(p)` (`src/mcp/wac.js`), `sanitizeTypes(arr)` / `sanitizeField(s)` (`src/mcp/sanitize.js`).
- Produces: `parseRemoteLinks(header: string|null) -> {context?, alternate?, linkset?}` and `localLinks(path: string, ctx) -> Promise<{storageDescription, up?, describedby?}>` — consumed by Task 2's handlers.

- [ ] **Step 1: Create the branch**

```bash
cd ~/dev/git/LA3D/JavaScriptSolidServer
git checkout la3d/lws && git pull && git checkout -b la3d/mcp-read-tools
```

- [ ] **Step 2: Write the failing tests**

Create `test/mcp-read-tools.test.js`:

```js
// test/mcp-read-tools.test.js
// The model-driven read path (spec 2026-07-06): MCP Resources are
// application-driven (host-staged), so the read/follow loop needs Tools.
// read_resource is one-Web (local -> readResource resolver; remote ->
// federation gate, verbatim); links carries the header-borne affordances
// (JSON-LD 1.1 §6.1/§6.2) that MCP results otherwise strip.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseRemoteLinks, localLinks } from '../src/mcp/read-tools.js';
import { startLwsPod, ownerCtx } from './helpers.js';

test('parseRemoteLinks extracts json-ld#context, ld+json alternate, and linkset rels', () => {
  const h = '<https://ex.org/ctx.jsonld>; rel="http://www.w3.org/ns/json-ld#context"; type="application/ld+json", ' +
            '<https://ex.org/alt.jsonld>; rel="alternate"; type="application/ld+json", ' +
            '<https://ex.org/r>; rel="linkset"; type="application/linkset+json", ' +
            '<https://ex.org/other>; rel="stylesheet"';
  assert.deepEqual(parseRemoteLinks(h), {
    context: 'https://ex.org/ctx.jsonld',
    alternate: 'https://ex.org/alt.jsonld',
    linkset: 'https://ex.org/r',
  });
});

test('parseRemoteLinks: alternate without ld+json type is ignored; empty/absent header -> {}', () => {
  assert.deepEqual(parseRemoteLinks('<https://ex.org/a>; rel="alternate"; type="text/html"'), {});
  assert.deepEqual(parseRemoteLinks(null), {});
  assert.deepEqual(parseRemoteLinks(''), {});
});

test('parseRemoteLinks strips hidden/bidi chars from targets (sanitizeField)', () => {
  const h = '<https://ex.org/c‮tx.jsonld>; rel="http://www.w3.org/ns/json-ld#context"';
  assert.equal(parseRemoteLinks(h).context.includes('‮'), false);
});

test('localLinks: file gets up + storageDescription; describedby only when a shape is declared', async (t) => {
  const pod = await startLwsPod(t);
  const ctx = { ...ownerCtx(pod), lwsEnabled: true };
  const links = await localLinks(`/${pod.podName}/notes/a`, ctx);
  assert.equal(links.up, `${pod.origin}/${pod.podName}/notes/`);
  assert.equal(links.storageDescription, `${pod.origin}/.well-known/lws-storage`);
  assert.equal(links.describedby, undefined);
});

test('localLinks: root has no up', async (t) => {
  const pod = await startLwsPod(t);
  const links = await localLinks('/', { ...ownerCtx(pod), lwsEnabled: true });
  assert.equal(links.up, undefined);
  assert.ok(links.storageDescription);
});
```

- [ ] **Step 3: Run to verify failure**

Run: `node --test --test-force-exit test/mcp-read-tools.test.js`
Expected: FAIL — `Cannot find module '../src/mcp/read-tools.js'`

- [ ] **Step 4: Implement the helpers**

Create `src/mcp/read-tools.js`:

```js
// src/mcp/read-tools.js
// The model-driven read/nav path (spec 2026-07-06-mcp-model-driven-read).
// MCP Resources are application-driven (host-staged) per MCP 2025-03-26, so
// an autonomous agent needs the read loop as Tools: read_resource (one-Web —
// local URIs hit the same resolver as resources/read; any other origin is a
// federation-gated remote read, absorbed verbatim from the retired
// read_remote_resource) and list_resources (the model-callable twin of
// resources/list). `links` carries the affordances HTTP puts in headers —
// MCP results have no header slot, so without it they'd be silently stripped
// (JSON-LD 1.1 syntax §6.1 context link / §6.2 alternate; surfaced, never
// applied — the agent dereferences them itself with read_resource).
import * as storage from '../storage/filesystem.js';
import { AccessMode } from '../wac/parser.js';
import { toolError, toolJson } from './protocol.js';
import { readResource } from './resources.js';
import { ResourceError } from './errors.js';
import { isLocalUri, uriToPath } from './uri.js';
import { wac, buildUrl, parentPath } from './wac.js';
import { sanitizeDeep, sanitizeTypes, sanitizeField } from './sanitize.js';
import { describedbyTargets } from '../lws/constraint.js';
import { storageDescriptionUrl } from '../lws/storage-description.js';
import { listFixed, RESOURCE_TEMPLATE } from './surface.js';

const JSONLD_CONTEXT_REL = 'http://www.w3.org/ns/json-ld#context';

// The JSON-LD-relevant subset of an RFC 8288 Link header, for the remote arm.
// context: json-ld#context (ordinary-JSON upgrade path, JSON-LD 1.1 §6.1);
// alternate: rel="alternate" typed ld+json (§6.2); linkset: RFC 9264. The
// spec allows at most one context link — a malformed multi-link response
// keeps the last one seen. Targets are client-controlled -> sanitizeField.
export function parseRemoteLinks(header) {
  const links = {};
  if (!header || typeof header !== 'string') return links;
  // Split on commas that begin a new <target>; commas inside params survive.
  for (const part of header.split(/,(?=\s*<)/)) {
    const m = part.match(/^\s*<([^>]*)>\s*((?:;[^;]*)*)$/);
    if (!m) continue;
    const params = {};
    for (const p of m[2].split(';')) {
      const kv = p.match(/^\s*([a-zA-Z0-9*_-]+)\s*=\s*"?([^"]*)"?\s*$/);
      if (kv) params[kv[1].toLowerCase()] = kv[2];
    }
    const rels = (params.rel || '').split(/\s+/);
    if (rels.includes(JSONLD_CONTEXT_REL)) links.context = sanitizeField(m[1]);
    else if (rels.includes('alternate') && params.type === 'application/ld+json') links.alternate = sanitizeField(m[1]);
    else if (rels.includes('linkset')) links.linkset = sanitizeField(m[1]);
  }
  return links;
}

// The local read's header-borne affordances, derived from the SAME sources as
// the HTTP Link headers / linkset (constraint store, storage description) —
// one source, no drift. describedby omitted when no shape is declared.
export async function localLinks(path, ctx) {
  const links = { storageDescription: storageDescriptionUrl(buildUrl(ctx, path)) };
  if (path !== '/') links.up = buildUrl(ctx, parentPath(path));
  const shapes = sanitizeTypes(await describedbyTargets(storage, path + '.meta', buildUrl(ctx, path)));
  if (shapes.length) links.describedby = shapes;
  return links;
}
```

(The imports unused until Task 2 — `AccessMode`, `toolError`, `toolJson`, `readResource`, `ResourceError`, `isLocalUri`, `uriToPath`, `wac`, `sanitizeDeep`, `listFixed`, `RESOURCE_TEMPLATE` — are consumed by the handlers added there; keep them now so Task 2 is a pure append.)

- [ ] **Step 5: Run to verify pass**

Run: `node --test --test-force-exit test/mcp-read-tools.test.js`
Expected: PASS (5 tests)

- [ ] **Step 6: Commit**

```bash
git add src/mcp/read-tools.js test/mcp-read-tools.test.js
git commit -m "feat(mcp): read-tools helpers — parseRemoteLinks + localLinks (links affordance carrier)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: `read_resource` (one-Web) + `list_resources`; retire `read_remote_resource`

**Files:**
- Modify: `src/mcp/read-tools.js` (append handlers)
- Modify: `src/mcp/tools.js` (remove `read_remote_resource` handler + `federationGatePathFor` + `MAX_FEDERATION_DEPTH` at lines ~306–383; swap registry entries at ~584–594; drop now-unused `sanitizeDeep` import if nothing else uses it — check first)
- Modify: `src/mcp/resources.js:200` (not-local steering message)
- Modify: `test/mcp-affordance-federation.test.js` (migrate to `read_resource`)
- Modify: `test/mcp-v2-convenience.test.js` (registry enumeration → 10 names)
- Test: `test/mcp-read-tools.test.js` (append)

**Interfaces:**
- Consumes: Task 1's helpers; `readResource(uri, ctx)` (`src/mcp/resources.js` — returns `{contents:[{uri,mimeType,text}]}` or throws `ResourceError`); `toolError`/`toolJson` (`src/mcp/protocol.js`).
- Produces: `read_resource({uri}, ctx)` and `list_resources(args, ctx)` handler exports; registry names `read_resource`, `list_resources`. **Local result shape:** `content[0]` = the body text exactly as `resources/read` returns it (JSON-LD structured or envelope), `content[1]` = `JSON.stringify({uri, mimeType, links})`. **Remote result shape:** single `toolJson({url, status, contentType, links?, body})` (the v1 remote shape + optional `links`).

- [ ] **Step 1: Write the failing tests** (append to `test/mcp-read-tools.test.js`)

```js
import { callTool, TOOLS, listToolsForRpc } from '../src/mcp/tools.js';
import { readResource } from '../src/mcp/resources.js';
import { ResourceError } from '../src/mcp/errors.js';
import { putFile } from './helpers.js';
import http from 'node:http';

test('registry: read_resource + list_resources in, read_remote_resource gone, exactly 10', () => {
  const names = listToolsForRpc().map(t => t.name).sort();
  assert.deepEqual(names, [
    'create_resource', 'delete_resource', 'describe_resource', 'list_resources',
    'lws_type_search', 'put_typed_resource', 'read_resource', 'subscribe',
    'write_acl', 'write_resource',
  ]);
});

test('read_resource local: body block preserves @context; links block carries up + storageDescription', async (t) => {
  const p = await startLwsPod(t);
  await putFile(p, `/${p.podName}/pub.json`, '{"@context":{"ex":"http://ex/"},"ex:k":"v"}', { publicRead: true });
  const ctx = { ...ownerCtx(p), lwsEnabled: true };
  const res = await callTool('read_resource', { uri: `${p.origin}/${p.podName}/pub.json` }, ctx);
  assert.equal(res.isError ?? false, false, JSON.stringify(res));
  const body = JSON.parse(res.content[0].text);
  assert.ok(body['@context']);                                  // structured, not enveloped
  const meta = JSON.parse(res.content[1].text);
  assert.equal(meta.links.up, `${p.origin}/${p.podName}/`);
  assert.equal(meta.links.storageDescription, `${p.origin}/.well-known/lws-storage`);
});

test('read_resource local: WAC denial is a teaching error, not a throw (no-oracle preserved)', async (t) => {
  const p = await startLwsPod(t);
  await putFile(p, `/${p.podName}/private.json`, '{}');          // owner-only
  const anon = { ...ownerCtx(p), webId: null };
  const res = await callTool('read_resource', { uri: `${p.origin}/${p.podName}/private.json` }, anon);
  assert.equal(res.isError, true);
  assert.match(res.content[0].text, /access denied|not found/i);
});

test('read_resource remote: federation gate blocks anonymous; owner passes and links pass through', async (t) => {
  const p = await startLwsPod(t);
  // A genuinely foreign origin: a stub server on another port serving ordinary
  // JSON + the json-ld#context Link header (JSON-LD 1.1 §6.1).
  const stub = http.createServer((req, res) => {
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Link': '<https://ex.org/ctx.jsonld>; rel="http://www.w3.org/ns/json-ld#context"; type="application/ld+json"',
    });
    res.end('{"name":"probe"}');
  });
  await new Promise(r => stub.listen(0, '127.0.0.1', r));
  t.after(() => stub.close());
  const url = `http://127.0.0.1:${stub.address().port}/thing.json`;

  const anonRes = await callTool('read_resource', { uri: url }, { ...ownerCtx(p), webId: null, federationDepth: 0 });
  assert.equal(anonRes.isError, true);
  assert.match(anonRes.content[0].text, /federation requires a local WebID/);

  const res = await callTool('read_resource', { uri: url }, { ...ownerCtx(p), federationDepth: 0, lwsEnabled: true });
  assert.equal(res.isError ?? false, false, JSON.stringify(res));
  const out = JSON.parse(res.content[0].text);
  assert.equal(out.links.context, 'https://ex.org/ctx.jsonld');   // surfaced, not applied
  assert.match(out.body, /probe/);
});

test('read_resource remote: depth cap enforced (verbatim from read_remote_resource)', async (t) => {
  const p = await startLwsPod(t);
  const res = await callTool('read_resource', { uri: 'http://127.0.0.1:1/x' },
    { ...ownerCtx(p), federationDepth: 3 });
  assert.equal(res.isError, true);
  assert.match(res.content[0].text, /federation depth exceeded/);
});

test('list_resources returns the fixed entry resources + the real-URI template', async (t) => {
  const p = await startLwsPod(t);
  const res = await callTool('list_resources', {}, ownerCtx(p));
  const out = JSON.parse(res.content[0].text);
  assert.ok(out.resources.some(r => r.uri === `${p.origin}/.well-known/lws-storage`));
  assert.ok(out.templates[0].uriTemplate.startsWith('https://'));
});

test('resources/read foreign-origin steering error names read_resource (and it exists)', async (t) => {
  const p = await startLwsPod(t);
  await assert.rejects(
    () => readResource('https://other.example/x', ownerCtx(p)),
    (e) => e instanceof ResourceError && /read_resource/.test(e.message),
  );
  assert.ok(TOOLS.read_resource);
  assert.equal(TOOLS.read_remote_resource, undefined);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `node --test --test-force-exit test/mcp-read-tools.test.js`
Expected: FAIL — `read_resource` unknown tool / registry mismatch.

- [ ] **Step 3: Append the handlers to `src/mcp/read-tools.js`**

```js
// --- federation constants + gate (moved VERBATIM from tools.js read_remote_resource) ---

// Conservative defaults locked in for v1:
//   1. Federation gate is `<agent-pod>/private/federation/` — caller must
//      have acl:Write there to initiate outbound federation. Foreign WebIDs
//      are denied (no local path to gate against).
//   2. No pod-resident credential storage.
//   3. Depth cap via MCP-Federation-Depth header, max 3.
const MAX_FEDERATION_DEPTH = 3;

function federationGatePathFor(webId, origin) {
  if (!webId || !origin) return null;
  if (!webId.startsWith(origin)) return null;  // foreign WebID — deny
  const localPath = webId.slice(origin.length);
  const profileIdx = localPath.indexOf('/profile/');
  const podPath = profileIdx > 0 ? localPath.slice(0, profileIdx + 1) : '/';
  return podPath + 'private/federation/';
}

async function readRemote(url, ctx) {
  const gatePath = federationGatePathFor(ctx.webId, ctx.origin);
  if (!gatePath) {
    return toolError(
      'access denied: federation requires a local WebID identity (anonymous and foreign identities cannot initiate outbound federation)'
    );
  }
  if (!(await wac(ctx, gatePath, AccessMode.WRITE))) {
    return toolError(
      `access denied: write ${gatePath} (federation gate). Owner must grant acl:Write at this path to delegate outbound federation.`
    );
  }
  const depth = (ctx.federationDepth ?? 0) + 1;
  if (depth > MAX_FEDERATION_DEPTH) {
    return toolError(`federation depth exceeded (max ${MAX_FEDERATION_DEPTH})`);
  }
  let r;
  try {
    r = await fetch(url, {
      headers: {
        Accept: 'application/ld+json, application/lws+json, text/turtle, */*',
        'MCP-Federation-Depth': String(depth)
      },
      signal: AbortSignal.timeout(30_000)
    });
  } catch (e) {
    return toolError(`remote unreachable: ${e.message}`);
  }
  const body = await r.text();
  // Header-borne affordances (json-ld#context / alternate / linkset) are the
  // agent's ONLY channel to how a remote representation should be interpreted
  // — surface them (never auto-fetch/apply). Body: a remote pod is the
  // least-trusted content source — deep-strip (review #7, carried verbatim).
  const links = parseRemoteLinks(r.headers.get('link'));
  return toolJson({
    url,
    status: r.status,
    contentType: r.headers.get('content-type') || null,
    ...(Object.keys(links).length ? { links } : {}),
    body: sanitizeDeep(body)
  });
}

// --- the tools ---

export async function read_resource({ uri }, ctx) {
  if (!uri || typeof uri !== 'string' || !/^https?:\/\//.test(uri)) {
    return toolError('absolute http(s) uri required');
  }
  if (uri === ctx.origin) uri = uri + '/';           // bare origin = the root container
  if (!isLocalUri(ctx.origin, uri)) return readRemote(uri, ctx);

  let out;
  try {
    out = await readResource(uri, ctx);              // WAC-before-exists + sanitization inherited
  } catch (e) {
    if (e instanceof ResourceError) return toolError(e.message);  // teaching content, tool-shaped
    throw e;
  }
  const c = out.contents[0];
  const links = await localLinks(uriToPath(ctx.origin, uri), ctx);
  return {
    content: [
      { type: 'text', text: c.text },
      { type: 'text', text: JSON.stringify({ uri, mimeType: c.mimeType, links }, null, 2) },
    ],
    isError: false,
  };
}

export async function list_resources(_args, ctx) {
  return toolJson({ resources: listFixed(ctx.origin), templates: [RESOURCE_TEMPLATE] });
}
```

- [ ] **Step 4: Swap the registry in `src/mcp/tools.js`**

Delete the block from `// --- federation (#495) ---` (line ~306) through the end of the `read_remote_resource` function (line ~383). Delete the `read_remote_resource:` registry entry (lines ~584–594). Check whether `sanitizeDeep` is still used in tools.js (`grep -n sanitizeDeep src/mcp/tools.js`) — if not, remove it from the import at line 24. Add the import and the two entries:

```js
import { read_resource, list_resources } from './read-tools.js';
```

Registry entries (place where `read_remote_resource` was):

```js
  read_resource: {
    description: 'Read any resource by its real https:// URL — this pod\'s or another pod\'s (federation-gated). Returns the representation (JSON-LD with @context intact where the pod vouches for it) plus a `links` block of its header-borne affordances: up, describedby (SHACL shape), storageDescription locally; json-ld#context / alternate / linkset from a remote\'s Link headers. Follow the typed links and resolve terms via @context.',
    inputSchema: {
      type: 'object',
      properties: { uri: { type: 'string', description: 'Absolute http(s) URL.' } },
      required: ['uri']
    },
    handler: read_resource
  },
  list_resources: {
    description: 'List this pod\'s entry-point resources (storage description, pod-info, skills, LWS @context + vocabulary) and the real-URI resource template. Start here to discover the pod.',
    inputSchema: { type: 'object', properties: {} },
    handler: list_resources
  },
```

- [ ] **Step 5: Update the steering message in `src/mcp/resources.js:200`**

```js
    throw new ResourceError(RPC_ERRORS.INVALID_PARAMS,
      `not a local resource: ${uri}. Use the read_resource tool for another pod.`);
```

- [ ] **Step 6: Migrate the existing tests**

`test/mcp-v2-convenience.test.js` — replace the enumeration test:

```js
test('tool registry is the model-driven read set (exactly 10)', () => {
  const names = listToolsForRpc().map(t => t.name).sort();
  assert.deepEqual(names, [
    'create_resource', 'delete_resource', 'describe_resource', 'list_resources',
    'lws_type_search', 'put_typed_resource', 'read_resource', 'subscribe',
    'write_acl', 'write_resource',
  ]);
});
```

`test/mcp-affordance-federation.test.js` — mechanical migration: every `callTool('read_remote_resource', { url: X }, ctx)` becomes `callTool('read_resource', { uri: X }, ctx)`; the first test's assertions become `assert.equal(TOOLS.call_remote_pod, undefined)` + `assert.equal(TOOLS.read_remote_resource, undefined)` + `assert.ok(TOOLS.read_resource)`; the "steering error names a real tool" test regex becomes `/read_resource/` and asserts `TOOLS.read_resource`. **Caution:** the old "fetches a remote resource" test used the pod's own origin as the "remote" — under one-Web dispatch that is now a LOCAL read. Either assert it still succeeds as a local read (content[0] parses, `ex:k` present) and rename the test, or point it at a stub server per the Task 2 Step 1 pattern.

Then sweep for stragglers:

```bash
grep -rn "read_remote_resource" src/ test/ docs/ 2>/dev/null
```
Expected: no hits in `src/`; fix any remaining test/docs hits the same way.

- [ ] **Step 7: Run the affected suites**

Run: `node --test --test-force-exit test/mcp-read-tools.test.js test/mcp-affordance-federation.test.js test/mcp-v2-convenience.test.js test/mcp-affordance-read.test.js`
Expected: PASS all.

- [ ] **Step 8: Commit**

```bash
git add src/mcp/read-tools.js src/mcp/tools.js src/mcp/resources.js test/mcp-read-tools.test.js test/mcp-affordance-federation.test.js test/mcp-v2-convenience.test.js
git commit -m "feat(mcp): model-driven read path — read_resource (one-Web) + list_resources, retire read_remote_resource

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: `describe_resource` accepts `uri` or `path`

**Files:**
- Modify: `src/mcp/tools.js` (`describe_resource` handler ~line 473 + its registry entry ~610)
- Test: `test/mcp-v2-convenience.test.js` (append)

**Interfaces:**
- Consumes: `isLocalUri`/`uriToPath` (`src/mcp/uri.js`) — add to tools.js imports.
- Produces: `describe_resource({path?, uri?}, ctx)`; a non-local `uri` returns a teaching error naming `read_resource`.

- [ ] **Step 1: Write the failing tests** (append to `test/mcp-v2-convenience.test.js`)

```js
test('describe_resource accepts a real https:// uri for a local resource', async (t) => {
  const pod = await startLwsPod(t);
  const ctx = { ...ownerCtx(pod), lwsEnabled: true };
  await callTool('put_typed_resource', { path: `/${pod.podName}/things/y`, content: '{}', contentType: 'application/ld+json' }, ctx);
  const desc = await callTool('describe_resource', { uri: `${pod.origin}/${pod.podName}/things/y` }, ctx);
  assert.equal(desc.isError ?? false, false, JSON.stringify(desc));
  assert.equal(JSON.parse(desc.content[0].text).path, `/${pod.podName}/things/y`);
});

test('describe_resource on a foreign uri teaches read_resource', async (t) => {
  const pod = await startLwsPod(t);
  const desc = await callTool('describe_resource', { uri: 'https://other.example/x' }, ownerCtx(pod));
  assert.equal(desc.isError, true);
  assert.match(desc.content[0].text, /read_resource/);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `node --test --test-force-exit test/mcp-v2-convenience.test.js`
Expected: FAIL — `path required`.

- [ ] **Step 3: Implement**

In `src/mcp/tools.js`, add `import { isLocalUri, uriToPath } from './uri.js';` and change `describe_resource`'s head:

```js
async function describe_resource({ path, uri }, ctx) {
  // uri-or-path: removes the "read by URI, write by path" asymmetry at the
  // orientation tool. Local-only — a remote resource has no local linkset.
  if (!path && uri) {
    if (!isLocalUri(ctx.origin, uri)) {
      return toolError(`describe_resource is local-only; use the read_resource tool for ${uri}`);
    }
    path = uriToPath(ctx.origin, uri);
    if (path === null) return toolError(`bad resource uri: ${uri}`);
  }
  if (!path) return toolError('path or uri required');
```

Registry entry: change `required: ['path']` to `required: []`, add to properties `uri: { type: 'string', description: 'Alternative to path: the resource\'s real https:// URL (local only).' }`, and update the description to `"One-shot orientation on a local resource (by path or real URL): its body, declared types, and RFC 9264 linkset together."`

- [ ] **Step 4: Run to verify pass**

Run: `node --test --test-force-exit test/mcp-v2-convenience.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/mcp/tools.js test/mcp-v2-convenience.test.js
git commit -m "feat(mcp): describe_resource accepts uri or path (read-by-URI symmetry)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: `GET /mcp` → 405 + `Allow: POST`

**Files:**
- Modify: `src/mcp/index.js` (append route in `mcpPlugin`, beside the `fastify.options` handler at ~line 268)
- Test: `test/mcp-read-tools.test.js` (append)

**Interfaces:**
- Produces: `GET /mcp` → `405`, `Allow: POST, OPTIONS`, JSON body `{error, hint}`. (MCP Streamable HTTP: a server not offering the GET SSE stream returns 405.)

- [ ] **Step 1: Write the failing test** (append to `test/mcp-read-tools.test.js`)

```js
test('GET /mcp answers 405 with Allow: POST (not a misleading 404)', async (t) => {
  const p = await startLwsPod(t);
  const r = await fetch(`${p.origin}/mcp`);
  assert.equal(r.status, 405);
  assert.match(r.headers.get('allow') || '', /POST/);
  const body = await r.json();
  assert.match(body.hint, /POST JSON-RPC/);
});
```

*(If `startLwsPod` returns an inject-style pod without a live listener, use the same request style the other tests in `test/mcp-rate-limit.test.js` use against `/mcp` — match that file's transport.)*

- [ ] **Step 2: Run to verify failure**

Run: `node --test --test-force-exit test/mcp-read-tools.test.js`
Expected: the new test FAILS with status 404.

- [ ] **Step 3: Implement** — in `src/mcp/index.js` after the `fastify.options('/mcp', …)` block:

```js
  // MCP Streamable HTTP: this server does not offer the GET SSE stream, so a
  // GET answers 405 (spec-prescribed) — never a 404 whose Allow omits POST,
  // which reads as "no MCP here" to a discovering agent (cold-probe defect b).
  fastify.get('/mcp', async (_request, reply) => {
    reply.header('Allow', 'POST, OPTIONS');
    reply.code(405);
    return {
      error: 'method not allowed',
      hint: 'MCP endpoint — POST JSON-RPC 2.0 (protocol 2025-03-26). This server does not offer the GET SSE stream.'
    };
  });
```

- [ ] **Step 4: Run to verify pass**

Run: `node --test --test-force-exit test/mcp-read-tools.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/mcp/index.js test/mcp-read-tools.test.js
git commit -m "fix(mcp): GET /mcp answers 405 + Allow: POST (cold-probe defect b)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: suppress `rel="linkset"` under index-shadowing

**Files:**
- Modify: `src/ldp/headers.js` (`getAllHeaders`, ~line 112)
- Modify: `src/handlers/resource.js` (every `getAllHeaders(...)` call inside the GET `if (indexExists) {…}` branch, ~lines 240/255/287, and the HEAD index.html branch, ~lines 895–935 — locate with `grep -n getAllHeaders src/handlers/resource.js` and check enclosing branch)
- Test: `test/mcp-read-tools.test.js` (append; or a new `test/lws-linkset-suppress.test.js` if the pod helper can't PUT an index.html — prefer appending)

**Interfaces:**
- Produces: `getAllHeaders({..., suppressLinkset = false})` — when true, the `rel="linkset"` Link part is omitted; `rel="…lws#storageDescription"` is kept (different URL, unaffected by shadowing).

- [ ] **Step 1: Write the failing test** (append to `test/mcp-read-tools.test.js`)

```js
test('index-shadowed container omits rel="linkset"; plain container keeps it (cold-probe defect c)', async (t) => {
  const p = await startLwsPod(t);
  await putFile(p, `/${p.podName}/shadowed/index.html`, '<html></html>', { publicRead: true, contentType: 'text/html' });
  await putFile(p, `/${p.podName}/plain/x.txt`, 'x', { publicRead: true });
  const shadowed = await fetch(`${p.origin}/${p.podName}/shadowed/`);
  assert.doesNotMatch(shadowed.headers.get('link') || '', /rel="linkset"/);
  assert.match(shadowed.headers.get('link') || '', /storageDescription/);   // still advertised
  const plain = await fetch(`${p.origin}/${p.podName}/plain/`);
  assert.match(plain.headers.get('link') || '', /rel="linkset"/);
});
```

*(Check `putFile`'s signature in `test/helpers.js` for the contentType/publicRead options; adapt the two calls to its real shape.)*

- [ ] **Step 2: Run to verify failure**

Run: `node --test --test-force-exit test/mcp-read-tools.test.js`
Expected: the new test FAILS — shadowed container's Link still carries `rel="linkset"`.

- [ ] **Step 3: Implement** — `src/ldp/headers.js` `getAllHeaders`:

```js
export function getAllHeaders({ isContainer = false, etag = null, contentType = null, origin = null, resourceUrl = null, wacAllow = null, connegEnabled = false, mashlibEnabled = false, lwsEnabled = false, updatesVia = null, suppressLinkset = false }) {
  const headers = {
    ...getResponseHeaders({ isContainer, etag, contentType, resourceUrl, wacAllow, connegEnabled, mashlibEnabled, lwsEnabled, updatesVia }),
    ...getCorsHeaders(origin)
  };
  if (lwsEnabled && resourceUrl) {
    // An index.html-shadowed container serves text/html for every Accept, so
    // advertising linkset conneg there is a false affordance (cold-probe
    // defect c) — suppress the rel where conneg won't be honored. The
    // storage-description rel points at a DIFFERENT URL and stays.
    const parts = [`<${storageDescriptionUrl(resourceUrl)}>; rel="${LWS_STORAGE_DESC_REL}"`];
    if (!suppressLinkset) parts.push(`<${resourceUrl}>; rel="linkset"; type="application/linkset+json"`);
    const extra = parts.join(', ');
    headers['Link'] = headers['Link'] ? `${headers['Link']}, ${extra}` : extra;
  }
  return headers;
}
```

In `src/handlers/resource.js`, add `suppressLinkset: true` to the options object of every `getAllHeaders(...)` call that sits inside an `indexExists` branch (GET: the turtle-extraction, the JSON-LD-extraction, and the plain index.html serve; HEAD: the index.html branch). Calls outside those branches are untouched.

- [ ] **Step 4: Run to verify pass + no header regressions**

Run: `node --test --test-force-exit test/mcp-read-tools.test.js`
Expected: PASS.
Run: `node --test --test-force-exit test/lws-discovery* test/headers* 2>/dev/null || node --test --test-concurrency=1 --test-force-exit test/`
Expected: PASS (use the full serial suite if no targeted header suites exist).

- [ ] **Step 5: Commit**

```bash
git add src/ldp/headers.js src/handlers/resource.js test/mcp-read-tools.test.js
git commit -m "fix(lws): suppress rel=linkset on index-shadowed containers (false affordance, cold-probe defect c)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 6: RFC 9264 steering — storage description + pod-info hint

**Files:**
- Modify: `src/lws/storage-description.js` (`buildStorageDescription`, ~line 41)
- Modify: `src/mcp/resources.js` (`readPodInfo` `hint`, ~line 55)
- Test: `test/mcp-read-tools.test.js` (append)

**Interfaces:**
- Produces: the storage description gains a top-level `linkset` member `{mediaType, conformsTo, hint}` (additive; unmapped in the LWS `@context` — audience is the cold LLM agent reading JSON; both HTTP + MCP surfaces get it via the one shared builder). `pod-info.hint` names RFC 9264.

- [ ] **Step 1: Write the failing tests** (append to `test/mcp-read-tools.test.js`)

```js
import { buildStorageDescription } from '../src/lws/storage-description.js';

test('storage description names RFC 9264 linkset negotiation (priming-ablation steering)', () => {
  const sd = buildStorageDescription('https://pod.example', {});
  assert.equal(sd.linkset.mediaType, 'application/linkset+json');
  assert.equal(sd.linkset.conformsTo, 'https://www.rfc-editor.org/rfc/rfc9264');
  assert.match(sd.linkset.hint, /RFC 9264/);
  assert.equal(sd.type, 'Storage');                       // spec-required shape intact
  assert.ok(Array.isArray(sd.service));
});

test('pod-info hint primes RFC 9264 + read_resource', async (t) => {
  const p = await startLwsPod(t);
  const res = await callTool('read_resource', { uri: `${p.origin}/.well-known/mcp/pod-info` }, ownerCtx(p));
  const info = JSON.parse(res.content[0].text);
  assert.match(info.hint, /RFC 9264/);
  assert.match(info.hint, /read_resource/);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `node --test --test-force-exit test/mcp-read-tools.test.js`
Expected: the two new tests FAIL.

- [ ] **Step 3: Implement**

`src/lws/storage-description.js` — `buildStorageDescription` return becomes:

```js
  return {
    ...generateStorageDescription(`${origin}/`, services),
    // Steering, not spec vocabulary (unmapped in the LWS @context — the
    // audience is a cold LLM agent reading JSON): RFC-9264-as-storage-metadata
    // is LWS-new and outside model priors; the priming ablation (2026-07-04)
    // showed one sentence naming the RFC flips agent behavior.
    linkset: {
      mediaType: 'application/linkset+json',
      conformsTo: 'https://www.rfc-editor.org/rfc/rfc9264',
      hint: 'This storage speaks RFC 9264: every resource serves a linkset of its typed links (up, type, describedby, conformsTo) — request the resource URL with Accept: application/linkset+json (rel="linkset").',
    },
  };
```

`src/mcp/resources.js` `readPodInfo` — replace the `hint` value:

```js
    hint: 'Resources are real https:// URLs returning JSON-LD. Read one with the read_resource tool, then follow its typed links (up, describedby, and edges in the body) and resolve terms via @context (see `context`/`vocabulary`). Start at `storageDescription`. This substrate speaks RFC 9264 linksets — get a resource\'s typed links via describe_resource, or negotiate application/linkset+json on its URL.',
```

Then check the existing hint assertion: `grep -rn "hint" test/mcp-affordance-promote.test.js` — update any exact-match expectation to the new text (keep its `/follow/i`-style regex assertions passing).

- [ ] **Step 4: Run to verify pass**

Run: `node --test --test-force-exit test/mcp-read-tools.test.js test/mcp-affordance-promote.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lws/storage-description.js src/mcp/resources.js test/mcp-read-tools.test.js test/mcp-affordance-promote.test.js
git commit -m "feat(lws): RFC 9264 steering — storage-description linkset member + pod-info priming hint

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 7: full fork suite + docs + push

**Files:**
- Modify: `docs/mcp.md` (if present — tool registry section)
- No source changes expected.

- [ ] **Step 1: Full serial suite**

Run: `node --test --test-concurrency=1 --test-force-exit test/`
Expected: PASS, 0 failures (count grows from 1127 by the new tests). Fix any straggler (most likely: a test enumerating tools or asserting the old pod-info hint) and amend the relevant task's commit style.

- [ ] **Step 2: Update fork docs**

```bash
ls docs/ | grep -i mcp
grep -n "read_remote_resource\|tool" docs/mcp.md | head
```
Update the tool table/list: remove `read_remote_resource`, add `read_resource` + `list_resources` with their registry descriptions; note the `links` member and the GET-405 behavior.

- [ ] **Step 3: Commit + push the branch**

```bash
git add docs/
git commit -m "docs(mcp): model-driven read tools — registry, links carrier, GET 405

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
git push -u origin la3d/mcp-read-tools
```

---

### Task 8: whole-branch review, merge into `la3d/lws`, push

- [ ] **Step 1:** Whole-branch review (the subagent-driven-development final review gate — spec + quality against `docs/superpowers/specs/2026-07-06-mcp-model-driven-read-design.md`). Fix any Critical/Important findings on the branch first.

- [ ] **Step 2: Merge (no PR ceremony — solo-dev merge model)**

```bash
cd ~/dev/git/LA3D/JavaScriptSolidServer
git checkout la3d/lws
git merge --no-ff la3d/mcp-read-tools -m "merge: model-driven read path — read_resource/list_resources, links carrier, RFC 9264 steering, probe defects

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
node --test --test-concurrency=1 --test-force-exit test/   # green on the merge commit
git push origin la3d/lws
git rev-parse --short HEAD   # <- the MERGE_SHA tasks 9-11 pin
```

---

### Task 9: repin the pod + extend the live gate (lws-pod repo)

**Files:**
- Modify: `Dockerfile.fork` (default `JSS_GIT_REF` → MERGE_SHA)
- Modify: `docker-compose.fork-tls.yml` (image tag → `fork-read-tools`)
- Modify: `tests/mcp-v2.test.mjs` (append the new describe block)

**Interfaces:**
- Consumes: the live pod at `https://pod.vardeman.me` (`make up-fork-tls`), `BASE`/`ensurePod`/`getToken` from `tests/helpers.mjs`, the `rpc`/`toolText`/`toolData` helpers already defined in `tests/mcp-v2.test.mjs`.

- [ ] **Step 1: Repin + rebuild**

In `Dockerfile.fork`, set the default `JSS_GIT_REF` to MERGE_SHA (full SHA — the repo pins full SHAs per the final-review convention). In `docker-compose.fork-tls.yml`, set the image tag to `fork-read-tools`. Then:

```bash
cd ~/dev/git/LA3D/agents/lws-pod
make cert 2>/dev/null; make up-fork-tls
curl --cacert certs/rootCA.pem -s https://pod.vardeman.me/.well-known/lws-storage | head -3
```
Expected: pod up; storage description served.

- [ ] **Step 2: Write the live-gate tests** (append inside `tests/mcp-v2.test.mjs`, after the existing describe block, reusing its `rpc`/`toolText`/`toolData` helpers and the `PROBE_PATH` fixture)

```js
describe.skipIf(!hasResources)('model-driven read tools (spec 2026-07-06)', () => {
  let token
  beforeAll(async () => { await ensurePod(); ({ token } = await getToken()) })

  it('tools/list: read_resource + list_resources present, read_remote_resource retired', async () => {
    const names = (await rpc('tools/list', {}, token)).body.result.tools.map(t => t.name)
    expect(names).toContain('read_resource')
    expect(names).toContain('list_resources')
    expect(names).not.toContain('read_remote_resource')
    expect(names.length).toBe(10)
  })

  it('read_resource local: body block keeps @context; links block carries up + storageDescription', async () => {
    const res = (await rpc('tools/call', { name: 'read_resource', arguments: { uri: `${BASE}${PROBE_PATH}` } }, token)).body.result
    expect(res.isError ?? false).toBe(false)
    expect(JSON.parse(res.content[0].text)['@context']).toBeTruthy()
    const meta = JSON.parse(res.content[1].text)
    expect(meta.links.up).toBe(`${BASE}/alice/`)
    expect(meta.links.storageDescription).toBe(`${BASE}/.well-known/lws-storage`)
  })

  it('read_resource no-oracle: anonymous read of the owner-private probe is a teaching error', async () => {
    const res = (await rpc('tools/call', { name: 'read_resource', arguments: { uri: `${BASE}${PROBE_PATH}` } })).body.result
    expect(res.isError).toBe(true)
    expect(toolText(res)).toMatch(/access denied|not found/i)
  })

  it('read_resource remote arm: anonymous is federation-gated; owner takes the remote path', async () => {
    const anon = (await rpc('tools/call', { name: 'read_resource', arguments: { uri: 'https://nonexistent.invalid/x' } })).body.result
    expect(toolText(anon)).toMatch(/federation requires a local WebID/)
    const owner = (await rpc('tools/call', { name: 'read_resource', arguments: { uri: 'https://nonexistent.invalid/x' } }, token)).body.result
    expect(toolText(owner)).toMatch(/remote unreachable/)   // gate passed -> remote arm, DNS-dead host
  })

  it('list_resources returns the entry resources + real-URI template', async () => {
    const out = toolData((await rpc('tools/call', { name: 'list_resources', arguments: {} }, token)).body.result)
    expect(out.resources.map(r => r.uri)).toContain(`${BASE}/.well-known/lws-storage`)
    expect(out.templates[0].uriTemplate.startsWith('https://')).toBe(true)
  })

  it('GET /mcp answers 405 + Allow: POST', async () => {
    const r = await fetch(`${BASE}/mcp`)
    expect(r.status).toBe(405)
    expect(r.headers.get('allow')).toMatch(/POST/)
  })

  it('storage description names RFC 9264', async () => {
    const sd = await (await fetch(`${BASE}/.well-known/lws-storage`)).json()
    expect(sd.linkset.conformsTo).toBe('https://www.rfc-editor.org/rfc/rfc9264')
  })

  it('index-shadowed container omits rel="linkset"; plain container keeps it', async () => {
    await rpc('tools/call', { name: 'create_resource', arguments: { container: '/alice/', slug: 'shadow-probe', isContainer: true } }, token)
    await rpc('tools/call', { name: 'write_resource', arguments: { path: '/alice/shadow-probe/index.html', content: '<html></html>', contentType: 'text/html' } }, token)
    await rpc('tools/call', { name: 'create_resource', arguments: { container: '/alice/', slug: 'plain-probe', isContainer: true } }, token)
    const shadowed = await fetch(`${BASE}/alice/shadow-probe/`)
    expect(shadowed.headers.get('link') || '').not.toMatch(/rel="linkset"/)
    const plain = await fetch(`${BASE}/alice/plain-probe/`)
    expect(plain.headers.get('link') || '').toMatch(/rel="linkset"/)
  })
})
```

*(Container GETs here are unauthenticated; if the pod's default ACLs deny anonymous reads of `/alice/shadow-probe/`, headers still arrive on the 401/403 via `getAllHeaders`? They do not — error responses bypass `getAllHeaders` (known repo-wide convention). In that case add the owner bearer to the two `fetch` calls: `{ headers: { Authorization: 'Bearer ' + token } }`.)*

- [ ] **Step 3: Run the full live sweep**

```bash
make test-mcp-v2          # expect: prior 9 + new 8 all pass
make test-l3              # 2/2
make test-typeindex       # 7/7
make test-indexed-relation # 4/4
make test-lws             # 6/6
```
Expected: all green, no regression.

- [ ] **Step 4: Commit**

```bash
git add Dockerfile.fork docker-compose.fork-tls.yml tests/mcp-v2.test.mjs
git commit -m "$(cat <<'EOF'
[Agent: Claude] test(mcp): live gate for the model-driven read path + repin fork to MERGE_SHA

- read_resource local (links carrier) / no-oracle / remote-arm gate
- list_resources, GET /mcp 405, RFC 9264 in storage description
- linkset-rel suppression on index-shadowed containers

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 10: harness goes native (delete the bridge)

**Files:**
- Modify: `experiments/agent-eval/agent.mjs`
- Modify: `experiments/agent-eval/run.mjs` (dry-mode smoke)
- (Unchanged: `tasks.mjs` — the tool names match the retired bridge by design; `mcp.mjs` — keeps both RPC helpers, dry mode still exercises the Resources primitive for parity.)

**Interfaces:**
- Consumes: the pod's own `tools/list` now includes `read_resource` + `list_resources`.

- [ ] **Step 1: Rewrite `agent.mjs`** — replace the tool assembly + dispatch (lines 22–48 region):

```js
export async function runAgent({ base, token, model, system, task, maxTurns = 12, log }) {
  const anthropic = new Anthropic();               // reads ANTHROPIC_API_KEY
  const mcp = new JssMcp(base, token);
  await mcp.initialize();
  // The pod's OWN tools drive the whole loop — reads included (read_resource /
  // list_resources are served by the pod since spec 2026-07-06; the local
  // Resources->tools bridge this file used to carry is gone). `subscribe`
  // streams, which this single-shot loop doesn't consume.
  const tools = (await mcp.listTools())
    .filter(t => t.name !== 'subscribe')
    .map(t => ({ name: t.name, description: t.description, input_schema: t.inputSchema }));

  const messages = [{ role: 'user', content: task }];
  const trajectory = [];
  for (let turn = 0; turn < maxTurns; turn++) {
    const resp = await anthropic.messages.create({ model, max_tokens: 2048, system, tools, messages });
    messages.push({ role: 'assistant', content: resp.content });
    const text = resp.content.filter(b => b.type === 'text').map(b => b.text).join('\n').trim();
    if (text) trajectory.push({ type: 'thought', text });
    const toolUses = resp.content.filter(b => b.type === 'tool_use');
    if (resp.stop_reason !== 'tool_use') return { finalText: text, trajectory };

    const results = [];
    for (const tu of toolUses) {
      const out = await mcp.callTool(tu.name, tu.input);
      const rendered = renderResult(out);
      trajectory.push({ type: 'tool', name: tu.name, input: tu.input, result: rendered.slice(0, 4000) });
      log?.(`  → ${tu.name} ${JSON.stringify(tu.input).slice(0, 90)}`);
      results.push({ type: 'tool_result', tool_use_id: tu.id, content: rendered.slice(0, 12000) });
    }
    messages.push({ role: 'user', content: results });
  }
  return { finalText: '(max turns reached)', trajectory };
}
```

Update the file's header comment (no more "bridged"), and `renderResult` keeps its `out.contents` branch removed or kept — remove it (`tools/call` only returns `content[]`; keep the `error` branch).

- [ ] **Step 2: Update the dry smoke in `run.mjs`** — replace the dry-mode block body (lines 25–36):

```js
  const mcp = new JssMcp(BASE, token);
  const init = await mcp.initialize();
  log(`handshake: protocolVersion=${init.protocolVersion} server=${init.serverInfo?.name} caps=[${Object.keys(init.capabilities || {}).join(', ')}]`);
  const toolNames = (await mcp.listTools()).map(t => t.name);
  log(`tools: ${toolNames.join(', ')}`);
  log(`model-driven read path present: ${toolNames.includes('read_resource') && toolNames.includes('list_resources')}`);
  const info = await mcp.callTool('read_resource', { uri: `${BASE}/.well-known/mcp/pod-info` });
  log(`pod-info via read_resource, RFC 9264 primed: ${/9264/.test(info?.content?.[0]?.text || '')}`);
  const ctx = await mcp.readResource(`${BASE}/.well-known/lws/context`);   // Resources primitive parity (host view)
  log(`resources/read parity (lws @context resolves): ${JSON.parse(ctx.contents[0].text)['@context'].items === 'lws:items'}`);
  const anon = await new JssMcp(BASE, null).callTool('read_resource', { uri: `${BASE}/alice/notes/n1` });
  log(`no-oracle (anon read_resource of owner-private note is a teaching error): ${anon?.isError === true}`);
  if (!process.env.ANTHROPIC_API_KEY) log('\nANTHROPIC_API_KEY not set — ran plumbing smoke only. Set it to run the agent battery.');
  process.exit(0);
```

- [ ] **Step 3: Run the dry battery bridge-less**

```bash
make test-agent-eval-dry
```
Expected: handshake + `model-driven read path present: true` + `RFC 9264 primed: true` + parity + no-oracle `true`.

- [ ] **Step 4: Commit**

```bash
git add experiments/agent-eval/agent.mjs experiments/agent-eval/run.mjs
git commit -m "$(cat <<'EOF'
[Agent: Claude] feat(agent-eval): harness goes native — bridge deleted, pod tools drive the loop

- agent.mjs: pod's own tools/list (read_resource/list_resources included)
- run.mjs dry smoke: tool-path reads + Resources-primitive parity + no-oracle

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 11: FOLLOWUP.md — record the round

**Files:**
- Modify: `FOLLOWUP.md` (a new `▶ MCP MODEL-DRIVEN READ PATH — DONE + MERGED (date)` block in the 2026-06-29/07-03 section, following the house pattern of the MCP-v2 / affordance blocks)

- [ ] **Step 1: Write the block.** Cover: spec+plan paths; fork merge SHA + repin/image tag; the 10-tool registry (read_resource one-Web absorbing read_remote_resource, list_resources); the links carrier (JSON-LD §6.1/§6.2, surface-don't-apply); RFC 9264 steering placements; the two probe defects fixed; harness native (bridge deleted); live-gate counts from Task 9 Step 3; deferred items (emission of json-ld#context = profile/L4; `resources/list` child enumeration page-bound; SEP-2640 gate now satisfied). Update the `▶▶ NEXT SESSION` pointer: **next = the ld+json-500 L3 admission micro-round, then L4.**

- [ ] **Step 2: Commit**

```bash
git add FOLLOWUP.md
git commit -m "$(cat <<'EOF'
[Agent: Claude] docs(followup): MCP model-driven read path DONE — state, gates, carryover

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Self-Review (done at write time)

- **Spec coverage:** §2 decisions 1–8 → Tasks 1–2 (tools, one-Web, names, budget, registry/resolver reuse), 3 (uri-or-path), 4–5 (probe defects), 6 (steering), 3a → Tasks 1–2 (links carrier both arms, surface-don't-apply), §7 → Tasks 9–10 (acceptance + harness), merge model → Task 8, FOLLOWUP → Task 11. Emission of json-ld#context deliberately absent (spec §8 out-of-scope).
- **Type consistency:** `read_resource({uri})` / `list_resources({})` / `localLinks(path, ctx)` / `parseRemoteLinks(header)` used identically across Tasks 1, 2, 9, 10. Local result = two content blocks; remote = single `toolJson` — stated in Task 2 Interfaces and tested in both suites.
- **Known live-environment caveats flagged inline** (Task 4 transport, Task 5 `putFile` signature, Task 9 anonymous-GET headers) rather than left as surprises.
