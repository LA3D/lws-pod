# Pod Governance Layer + lws:Storage Marker/Owner Backfill Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Record and surface storage governance (per-storage `solid:owner`, deployment `schema:provider`) and heal pre-marker pods via a boot-time backfill, per spec `docs/superpowers/specs/2026-07-22-pod-governance-and-marker-backfill-design.md`.

**Architecture:** A new System-Managed `.lwsowner` sidecar (JSON array of owner URIs) on every storage root joins the `.lwstypes`/`.lwsprov` sidecar class at every existing choke point; a config-only `--lws-provider <uri>` surfaces the operator; a roster-driven, never-fatal `onReady` backfill stamps missing markers + owner records on legacy trees. Owner advertisement rides surfaces that are already READ-gated.

**Tech Stack:** Fork = Node/Fastify (`/Users/cvardema/dev/git/LA3D/JavaScriptSolidServer`, branch off `la3d/lws`), node:test (`npm test`, serial). Rig = `/Users/cvardema/dev/git/LA3D/agents/lws-pod`, Vitest live gates against the fork-tls pod.

## Global Constraints

- Fork work on feature branch `la3d/governance-backfill` created from `la3d/lws`; merge back in Task 7. Never force-push; stage specific files; commit format `[Agent: Claude] type(scope): subject` + `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>` trailer (per lws-pod CLAUDE.md).
- `--lws`-off behavior must stay byte-identical (every new behavior is `lwsEnabled`-gated).
- Boot backfill is LOUD, NEVER FATAL (Phase D discipline): any failure logs a warning and boot continues.
- `.lwsowner` write refusal mirrors the existing System-Managed semantics per surface: HTTP 405 problem+json, MCP `toolError`, remoteStorage 403.
- Never overwrite an existing `.lwsowner`; never drop existing `.lwstypes` entries (read-merge-write only).
- Code style: fastai philosophy — brevity, comments explain *why*, match surrounding code.
- Fork tests: `npm test` runs serial (`--test-concurrency=1`) and all suites share `./data` — follow the `test/helpers.js` `startTestServer`/`startLwsPod` patterns.

---

### Task 1: `.lwsowner` + marker-merge primitives (fork)

**Files:**
- Modify: `src/lws/type-metadata.js` (append after `readDeclaredTypes`, before the `.lwsprov` block)
- Test: `test/lwsowner-metadata.test.js` (new)

**Interfaces:**
- Consumes: existing `typeStorePath`, `readDeclaredTypes`, `isAbsoluteUri`, `LWS_STORAGE`.
- Produces (used by Tasks 2–6): `ownerStorePath(storagePath) -> string`; `readOwners(storage, storagePath) -> Promise<string[]>`; `writeOwners(storage, storagePath, ownerUris) -> Promise<void>`; `ensureDeclaredType(storage, storagePath, typeUri) -> Promise<boolean>` (true = stamped, false = already present).

- [ ] **Step 1: Create the fork feature branch**

```bash
cd /Users/cvardema/dev/git/LA3D/JavaScriptSolidServer
git checkout la3d/lws && git pull --ff-only 2>/dev/null; git checkout -b la3d/governance-backfill
```

- [ ] **Step 2: Write the failing test**

Create `test/lwsowner-metadata.test.js`:

```js
// test/lwsowner-metadata.test.js
// Governance round (2026-07-22): .lwsowner sidecar primitives + the
// read-merge-write marker helper the boot backfill depends on.
import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { startLwsPod } from './helpers.js';
import * as storage from '../src/storage/filesystem.js';
import {
  ownerStorePath, readOwners, writeOwners, ensureDeclaredType,
  readDeclaredTypes, typeStorePath, LWS_STORAGE,
} from '../src/lws/type-metadata.js';

describe('.lwsowner primitives + marker merge', () => {
  let pod, root;
  before(async (t) => { pod = await startLwsPod(t, 'govmeta'); root = `/${pod.podName}/`; });

  it('writeOwners/readOwners round-trip, dedupe, URI-only', async () => {
    await writeOwners(storage, root, [pod.webId, pod.webId, 'not a uri']);
    assert.deepEqual(await readOwners(storage, root), [pod.webId]);
    assert.equal(ownerStorePath(root), `${root}.lwsowner`);
  });

  it('readOwners returns [] for missing/corrupt sidecars', async () => {
    assert.deepEqual(await readOwners(storage, '/nowhere/'), []);
    await storage.write(ownerStorePath(root), Buffer.from('{corrupt'));
    assert.deepEqual(await readOwners(storage, root), []);
    await writeOwners(storage, root, [pod.webId]);            // restore
  });

  it('ensureDeclaredType merges, never overwrites, idempotent', async () => {
    await storage.write(typeStorePath(root), Buffer.from(JSON.stringify(['https://example.org/Custom'])));
    assert.equal(await ensureDeclaredType(storage, root, LWS_STORAGE), true);
    const types = await readDeclaredTypes(storage, root);
    assert.ok(types.includes('https://example.org/Custom'));   // merge, not overwrite
    assert.ok(types.includes(LWS_STORAGE));
    assert.equal(await ensureDeclaredType(storage, root, LWS_STORAGE), false);  // idempotent
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `node --test --test-force-exit test/lwsowner-metadata.test.js`
Expected: FAIL — `ownerStorePath` etc. are not exported.

- [ ] **Step 4: Implement in `src/lws/type-metadata.js`**

Append after the `readDeclaredTypes` function (keep the `.lwsprov` block last):

```js
// Merge one type into `.lwstypes` without clobbering what's there —
// captureDeclaredTypes overwrites by design (provisioning), but the boot
// backfill (governance round 2026-07-22) touches roots that may already
// carry client-declared types. Returns true only when it wrote.
export async function ensureDeclaredType(storage, storagePath, typeUri) {
  const existing = await readDeclaredTypes(storage, storagePath);
  if (existing.includes(typeUri)) return false;
  await storage.write(typeStorePath(storagePath), Buffer.from(JSON.stringify([...existing, typeUri])));
  return true;
}

// Per-storage owner record (governance round 2026-07-22): solid:owner URIs
// for a storage root, System-Managed like `.lwstypes`. In-storage (not
// config) because ownership travels with the data on re-homing; the
// deployment operator (schema:provider) is config precisely because it
// does not. Design: docs/superpowers/specs/2026-07-22-* in lws-pod.
export function ownerStorePath(storagePath) {
  return storagePath + '.lwsowner';
}

export async function readOwners(storage, storagePath) {
  const p = ownerStorePath(storagePath);
  if (!(await storage.exists(p))) return [];
  const buf = await storage.read(p);
  if (!buf) return [];
  try { const arr = JSON.parse(buf.toString('utf8')); return Array.isArray(arr) ? arr.filter((o) => isAbsoluteUri(o)) : []; }
  catch { return []; }
}

export async function writeOwners(storage, storagePath, ownerUris) {
  const clean = [];
  for (const o of (ownerUris || [])) if (isAbsoluteUri(o) && !clean.includes(o)) clean.push(o);
  if (!clean.length) return;                                  // ≥1 owner or no record
  await storage.write(ownerStorePath(storagePath), Buffer.from(JSON.stringify(clean)));
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `node --test --test-force-exit test/lwsowner-metadata.test.js`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add src/lws/type-metadata.js test/lwsowner-metadata.test.js
git commit -m "[Agent: Claude] feat(lws): .lwsowner sidecar primitives + ensureDeclaredType merge helper

- ownerStorePath/readOwners/writeOwners (URI-validated, dedup, ≥1)
- ensureDeclaredType: read-merge-write marker stamp for the boot backfill

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Reserve `.lwsowner` at every choke point (fork)

**Files:**
- Modify: `src/utils/url.js` (`SIDECAR_SUFFIX` ~line 175, `AUX_SUFFIX_RE` ~line 204, `AUX_SUFFIX_CI_RE` ~line 215)
- Modify: `src/auth/middleware.js:119` (GET/HEAD sidecar branch regex)
- Modify: `src/lws/write-consistency.js:60` (405 refusal regex)
- Modify: `src/handlers/resource.js:2671` and `:2899` (DELETE + PATCH guards)
- Modify: `src/mcp/resources.js:251` (readSidecarView dispatch regex)
- Modify: `src/mcp/tools.js:212` (delete kind-check)
- Modify: `src/remotestorage.js:118` (read-only kind-check) and `:224` (listing skip regex)
- Test: `test/lwsowner-sidecar-authz.test.js` (new) + suffix lists in `test/sidecar-authz.test.js`, `test/remotestorage-sidecar-authz.test.js`

**Interfaces:**
- Consumes: Task 1's `writeOwners`/`readOwners`; existing `auxSubject`/`sidecarSubject` (updated regexes propagate `kind: 'lwsowner'` automatically).
- Produces: `.lwsowner` classified/refused/hidden identically to `.lwstypes` on all surfaces. Note: a storage root's own `/alice/.lwsowner` has a leading-dot segment, so the HTTP dotfile guard 403s it outright (same as `/alice/.lwstypes` today) — the regex work matters for mid-name forms (`victim.lwsowner`), MCP, and remoteStorage.

- [ ] **Step 1: Write the failing tests**

Create `test/lwsowner-sidecar-authz.test.js`:

```js
// test/lwsowner-sidecar-authz.test.js
// Governance round: .lwsowner joins the System-Managed sidecar class.
// Write-refused on every surface, READ-gated on the subject, hidden from
// remoteStorage listings — mirrors the .lwstypes/.lwsprov properties.
import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { startLwsPod } from './helpers.js';
import * as storage from '../src/storage/filesystem.js';
import { writeOwners, ownerStorePath } from '../src/lws/type-metadata.js';
import { callTool } from './helpers.js';

describe('.lwsowner is System-Managed', () => {
  let pod, root;
  before(async (t) => {
    pod = await startLwsPod(t, 'govauthz'); root = `/${pod.podName}/`;
    await writeOwners(storage, root, [pod.webId]);
    // a member-level decoy: mid-name suffix must classify as sidecar too
    await storage.write(`${root}victim.md`, Buffer.from('# v'));
  });

  it('HTTP PUT/PATCH/DELETE of a mid-name .lwsowner are refused (405)', async () => {
    for (const method of ['PUT', 'PATCH', 'DELETE']) {
      const res = await fetch(`${pod.base}${root}victim.md.lwsowner`, {
        method, headers: { Authorization: `Bearer ${pod.token}`, 'Content-Type': 'application/json' },
        body: method === 'DELETE' ? undefined : '["https://evil.example/#me"]',
      });
      assert.equal(res.status, 405, `${method} must be refused`);
      assert.equal(await storage.exists(`${root}victim.md.lwsowner`), false);
    }
  });

  it('MCP write_resource / delete_resource refuse .lwsowner', async () => {
    const w = await callTool(pod, 'write_resource', { path: `${root}victim.md.lwsowner`, content: '[]' });
    assert.ok(w.isError, 'write must error');
    const d = await callTool(pod, 'delete_resource', { path: `${root}.lwsowner` });
    assert.ok(d.isError, 'delete must error');
    assert.equal(await storage.exists(ownerStorePath(root)), true);
  });

  it('case-variant suffix still classifies (F1 inheritance)', async () => {
    const res = await fetch(`${pod.base}${root}victim.md.LWSOWNER`, {
      method: 'PUT', headers: { Authorization: `Bearer ${pod.token}`, 'Content-Type': 'application/json' },
      body: '["https://evil.example/#me"]',
    });
    assert.notEqual(res.status, 201, 'case-variant must not create a sidecar-aliasable resource');
  });
});
```

Check `callTool`'s exact export/signature in `test/helpers.js` (`grep -n "callTool" test/helpers.js`) and align the two MCP calls with how `test/sidecar-authz.test.js` invokes it — same call shape, different paths.

- [ ] **Step 2: Run to verify failure**

Run: `node --test --test-force-exit test/lwsowner-sidecar-authz.test.js`
Expected: FAIL — PUT of `victim.md.lwsowner` currently creates an ordinary resource (201), MCP write succeeds.

- [ ] **Step 3: Extend the two shared regexes + comments in `src/utils/url.js`**

- `SIDECAR_SUFFIX`: `/\.(lwstypes|lwsprov|lwsowner|meta)$/` — extend the docstring's enumeration ("`.lwstypes`/`.lwsprov`/`.lwsowner` (System-Managed type/provenance/owner)").
- `AUX_SUFFIX_RE`: `/\.(acl|meta|lwstypes|lwsprov|lwsowner)$/`
- `AUX_SUFFIX_CI_RE`: `/\.(acl|meta|lwstypes|lwsprov|lwsowner)$/i`

- [ ] **Step 4: Extend the seven hardcoded alternations**

Each is a literal-regex or kind-check edit; keep surrounding comments and extend their enumerations:

- `src/auth/middleware.js:119` → `/\.(lwstypes|lwsprov|lwsowner)$/`
- `src/lws/write-consistency.js:60` → `/\.(lwstypes|lwsprov|lwsowner)$/`
- `src/handlers/resource.js:2671` (DELETE) and `:2899` (PATCH) → `/\.(lwstypes|lwsprov|lwsowner)$/`
- `src/mcp/resources.js:251` → `/\.(lwstypes|lwsprov|lwsowner)$/`
- `src/mcp/tools.js:212` → `(sc?.kind === 'lwstypes' || sc?.kind === 'lwsprov' || sc?.kind === 'lwsowner')`
- `src/remotestorage.js:118` → `(sc.kind === 'lwstypes' || sc.kind === 'lwsprov' || sc.kind === 'lwsowner')`
- `src/remotestorage.js:224` → `/\.(acl|meta|lwstypes|lwsprov|lwsowner)$/i`

Then verify no alternation was missed:

```bash
grep -rn "lwstypes" src/ | grep -v "lwsowner" | grep -E "lwstypes\|lwsprov|lwsprov\|lwstypes"
```

Expected: only comment lines (no live regex/kind-check without `lwsowner`). Update any straggler.

- [ ] **Step 5: Add `'lwsowner'` to the parameterized suffix lists in the two existing authz suites**

```bash
grep -n "lwsprov" test/sidecar-authz.test.js test/remotestorage-sidecar-authz.test.js
```

Each file drives its escalation matrix from a suffix list containing `lwstypes`/`lwsprov` — add `lwsowner` to those lists so the property tests (path-form canonicalization, remoteStorage PUT/DELETE/GET refusal, listing-hiding F4) cover the new suffix. If a case count is asserted anywhere (e.g. the "12 escalation-refusal" arithmetic), update it.

- [ ] **Step 6: Run the three suites**

Run: `node --test --test-force-exit test/lwsowner-sidecar-authz.test.js test/sidecar-authz.test.js test/remotestorage-sidecar-authz.test.js test/sidecar-path-invariant.test.js`
Expected: ALL PASS (the path-invariant property test must stay green with the widened regex).

- [ ] **Step 7: Commit**

```bash
git add src/utils/url.js src/auth/middleware.js src/lws/write-consistency.js src/handlers/resource.js src/mcp/resources.js src/mcp/tools.js src/remotestorage.js test/lwsowner-sidecar-authz.test.js test/sidecar-authz.test.js test/remotestorage-sidecar-authz.test.js
git commit -m "[Agent: Claude] feat(sec): reserve .lwsowner as a System-Managed sidecar on every surface

- shared regexes (SIDECAR_SUFFIX/AUX_SUFFIX_RE/_CI_RE) + 7 literal choke points
- write-refused on HTTP/MCP/remoteStorage, READ-gated, listing-hidden, case-insensitive

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Provisioning writes the owner record (fork)

**Files:**
- Modify: `src/handlers/container.js:303` (in `createPodStructure`, right after the marker stamp)
- Modify: `src/server.js:1728-1729` (in `createRootPodStructure`, same spot)
- Test: extend `test/lws-storage-marker.test.js`

**Interfaces:**
- Consumes: Task 1's `writeOwners`; the `webId` already in scope at both call sites.
- Produces: every freshly provisioned storage root carries `.lwsowner` = `[webId]`.

- [ ] **Step 1: Extend the test**

Append to the `describe` block in `test/lws-storage-marker.test.js`:

```js
  it('a freshly provisioned pod root records its owner (.lwsowner)', async () => {
    const { readOwners } = await import('../src/lws/type-metadata.js');
    assert.deepEqual(await readOwners(storage, `/${pod.podName}/`), [pod.webId]);
  });
```

- [ ] **Step 2: Run to verify failure**

Run: `node --test --test-force-exit test/lws-storage-marker.test.js`
Expected: FAIL — `readOwners` returns `[]`.

- [ ] **Step 3: Implement both provisioning sites**

`src/handlers/container.js` — change the import at line 14 to include `writeOwners`, then after the marker line in `createPodStructure`:

```js
  await captureDeclaredTypes(storage, podPath, [LWS_STORAGE]);   // storage-root marker (multi-tenant)
  await writeOwners(storage, podPath, [webId]);                  // solid:owner record (governance round)
```

`src/server.js` `createRootPodStructure` — extend the existing dynamic import:

```js
    const { captureDeclaredTypes, writeOwners, LWS_STORAGE } = await import('./lws/type-metadata.js');
    await captureDeclaredTypes(storage, '/', [LWS_STORAGE]);       // root-pod is its own storage
    await writeOwners(storage, '/', [webId]);                      // solid:owner record (governance round)
```

- [ ] **Step 4: Run to verify pass**

Run: `node --test --test-force-exit test/lws-storage-marker.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/handlers/container.js src/server.js test/lws-storage-marker.test.js
git commit -m "[Agent: Claude] feat(lws): record solid:owner (.lwsowner) at pod provisioning

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: Surface owner + provider in descriptions, ServerIndex, context; add `--lws-provider` (fork)

**Files:**
- Modify: `src/lws/context.js` (`LWS_CONTEXT_OBJECT`)
- Modify: `src/lws/storage-description.js` (`assembleDescription`, `buildStorageDescriptionFor`, `buildServerIndex`)
- Modify: `src/server.js` (~line 111 option intake; the `/:pod/lws-storage` and `/lws-storage` routes ~1240-1305; the well-known ServerIndex route ~1205-1219; capability-report call ~1850)
- Modify: `src/lws/capability-report.js`
- Modify: `bin/jss.js` (option ~line 100; createServer mapping ~line 246)
- Test: `test/governance-surfacing.test.js` (new)

**Interfaces:**
- Consumes: Task 1's `readOwners`; Task 3's provisioning-written records.
- Produces: description flag keys `owners: string[]` and `provider: string|null` (later tasks and the rig gate rely on the JSON property names `owner` and `provider`); server option `lwsProvider` / CLI `--lws-provider <uri>`.

- [ ] **Step 1: Write the failing test**

Create `test/governance-surfacing.test.js`:

```js
// test/governance-surfacing.test.js
// Governance round: owner in the per-storage description, provider on the
// ServerIndex/root description. Gating is inherited from the routes' existing
// READ checks — no new oracle to test, just presence/absence of properties.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startTestServer, stopTestServer, createTestPod, getBaseUrl } from './helpers.js';

const PROVIDER = 'https://org.example/profile/card#it';

describe('governance surfacing (description + ServerIndex + provider)', () => {
  let base, pod;
  before(async () => {
    await startTestServer({ lws: true, mcp: true, lwsProvider: PROVIDER });
    pod = await createTestPod('govsurf');
    base = getBaseUrl();
  });
  after(async () => { await stopTestServer(); });

  it('per-storage description carries owner (solid:owner URIs)', async () => {
    const res = await fetch(`${base}/govsurf/lws-storage`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.deepEqual(body.owner, [pod.webId]);
  });

  it('ServerIndex carries provider; per-storage description does not', async () => {
    const idx = await (await fetch(`${base}/.well-known/lws-storage`)).json();
    assert.equal(idx.provider, PROVIDER);
    const desc = await (await fetch(`${base}/govsurf/lws-storage`)).json();
    assert.equal(desc.provider, undefined);
  });

  it('without --lws-provider no provider key appears', async () => {
    await stopTestServer();
    await startTestServer({ lws: true });
    const idx = await (await fetch(`${getBaseUrl()}/.well-known/lws-storage`)).json();
    assert.equal(idx.provider, undefined);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `node --test --test-force-exit test/governance-surfacing.test.js`
Expected: FAIL — `body.owner` undefined.

- [ ] **Step 3: Context terms** — in `src/lws/context.js` `LWS_CONTEXT_OBJECT`, after the `schema:` prefix line add the `solid` prefix, and after the `Storage:` term line add the two governance terms:

```js
  solid: 'http://www.w3.org/ns/solid/terms#',
  ...
  owner: { '@id': 'solid:owner', '@type': '@id', '@container': '@set' },
  provider: { '@id': 'schema:provider', '@type': '@id' },
```

- [ ] **Step 4: Builders** — in `src/lws/storage-description.js`:

`assembleDescription` signature gains `owners = [], provider = null` in its destructured flags; before `if (capability.length > 0)` add:

```js
  // Governance (2026-07-22): owner = solid:owner (the storage's .lwsowner
  // record, READ-gated by the serving route); provider = schema:provider
  // (deployment operator, config-only — root-pod description + ServerIndex,
  // never per-tenant). LWS Discovery: "Additional properties MAY be present."
  if (owners.length) doc.owner = owners;
  if (provider) doc.provider = provider;
```

`buildStorageDescriptionFor`'s JSDoc flags line: add `owners`/`provider` (pass-through is automatic — flags are forwarded whole). `buildServerIndex` signature gains `provider = null` and, after the `storage:` mapping:

```js
  if (provider) idx.provider = provider;
```

- [ ] **Step 5: Server plumbing** — in `src/server.js`:

Near `const lwsEnabled = options.lws ?? false;` (line ~111):

```js
  // Deployment operator (governance round 2026-07-22): a URI, possibly on
  // another pod deployment — config-only on purpose (ownership travels with
  // data, operatorship does not). Surfaced, never persisted into tenant data.
  const lwsProviderUri = options.lwsProvider ?? null;
```

Import `readOwners` alongside the existing `storage-description.js` imports (it lives in `./lws/type-metadata.js` — extend that import). Then:

- ServerIndex route: `buildServerIndex(origin, roots.map(...), { typeIndexEnabled, mcpEnabled, anonRateLimitMax, provider: lwsProviderUri })`.
- `/:pod/lws-storage` route: after the READ check, `const owners = await readOwners(storage, root);` and add `owners` to the `buildStorageDescriptionFor` flags.
- `/lws-storage` (root-pod) route: same `owners` read for `'/'`, plus `provider: lwsProviderUri` in its flags (root description carries the operator; per-tenant does not).
- Capability report call (~1850): add `lwsProvider: lwsProviderUri` to the config object.

- [ ] **Step 6: Capability report line** — in `src/lws/capability-report.js`, inside the `if (config.lws) {` block:

```js
    if (config.lwsProvider) L.push(`  provider             ${config.lwsProvider}`);
```

- [ ] **Step 7: CLI flag** — in `bin/jss.js`, after the `--lws-config` option:

```js
  .option('--lws-provider <uri>', 'Deployment operator URI (schema:provider) advertised on the ServerIndex/root storage description (requires --lws)')
```

and in the createServer mapping after `lwsConfig: config.lwsConfig,`:

```js
        lwsProvider: config.lwsProvider,
```

- [ ] **Step 8: Run tests**

Run: `node --test --test-force-exit test/governance-surfacing.test.js test/lws-storage-marker.test.js`
Expected: PASS. Also `node --test --test-force-exit test/lws-discovery* test/mcp-lws*.test.js 2>/dev/null || npm test` if unsure a description-shape assertion elsewhere broke — description-shape suites must stay green (the new keys are additive).

- [ ] **Step 9: Commit**

```bash
git add src/lws/context.js src/lws/storage-description.js src/lws/capability-report.js src/server.js bin/jss.js test/governance-surfacing.test.js
git commit -m "[Agent: Claude] feat(lws): surface solid:owner + schema:provider in descriptions/ServerIndex

- owner (READ-gated routes) in per-storage description; provider (config --lws-provider) on ServerIndex + root description
- context terms solid:/owner/provider; capability-report provider line

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: `Link rel="solid:owner"` on storage-root GET/HEAD (fork)

**Files:**
- Modify: `src/server.js` (onRequest hook, the A6 `storageRootPath` block ~line 513)
- Modify: `src/ldp/headers.js` (`getAllHeaders`)
- Modify: `src/handlers/resource.js` (thread the new request field into the call sites that already pass `storageRootPath`)
- Test: extend `test/governance-surfacing.test.js`

**Interfaces:**
- Consumes: Task 1's `readOwners`; `request.storageRootPath` (A6).
- Produces: `request.storageOwners: string[]|null` (non-null only when the request targets a storage root); `getAllHeaders({ ..., storageOwners })` emits one `Link` part per owner with `rel="http://www.w3.org/ns/solid/terms#owner"`.

- [ ] **Step 1: Extend the test** — append to `test/governance-surfacing.test.js`'s describe (uses the `before`-created pod):

```js
  it('storage-root GET carries Link rel=solid:owner; a member does not', async () => {
    const rootRes = await fetch(`${base}/govsurf/`);
    assert.match(rootRes.headers.get('link') ?? '', /rel="http:\/\/www\.w3\.org\/ns\/solid\/terms#owner"/);
    await fetch(`${base}/govsurf/note.md`, { method: 'PUT', headers: { Authorization: `Bearer ${(await import('./helpers.js')).getPodToken('govsurf')}`, 'Content-Type': 'text/markdown' }, body: '# n' });
    const memberRes = await fetch(`${base}/govsurf/note.md`);
    assert.doesNotMatch(memberRes.headers.get('link') ?? '', /solid\/terms#owner/);
  });
```

- [ ] **Step 2: Run to verify failure**

Run: `node --test --test-force-exit test/governance-surfacing.test.js`
Expected: the new test FAILS (no owner Link).

- [ ] **Step 3: Resolve owners once per request** — in `src/server.js`, add a decorator next to `decorateRequest('storageRootPath', null)`:

```js
  // Governance round: the storage's solid:owner URIs, resolved ONLY when the
  // request targets the storage root itself (the one response Solid's
  // advertising MUST applies to) — every other request pays nothing. Rides
  // the A6-resolved root; READ-gating is inherited (the root response only
  // exists after the WAC hook passed).
  fastify.decorateRequest('storageOwners', null);
```

and in the onRequest hook, right after the `request.storageRootPath = ...` assignment:

```js
    request.storageOwners = null;
    if (request.storageRootPath && request.url.split('?')[0] === request.storageRootPath) {
      const { readOwners } = await import('./lws/type-metadata.js');
      request.storageOwners = await readOwners(storage, request.storageRootPath);
    }
```

(If `type-metadata.js` is already statically imported in server.js after Task 4, use that import instead of the dynamic one.)

- [ ] **Step 4: Emit the Link parts** — in `src/ldp/headers.js`, add `storageOwners = null` to `getAllHeaders`' destructured params, and inside the `if (lwsEnabled && resourceUrl)` block, after the `parts` array is built:

```js
    // Solid Protocol: when a server advertises the owner of a storage it MUST
    // use this Link relation on the root container. Only ever non-null on the
    // storage root itself (server.js onRequest), so members never carry it.
    if (storageOwners?.length) {
      parts.push(...storageOwners.map((o) => `<${o}>; rel="http://www.w3.org/ns/solid/terms#owner"`));
    }
```

- [ ] **Step 5: Thread the request field** — list the call sites already threading the A6 field:

```bash
grep -n "storageRootPath: request.storageRootPath" src/handlers/resource.js
```

At EVERY match, add the sibling argument `storageOwners: request.storageOwners,` (it is null except on the storage root, so the threading is uniform and inert elsewhere). GET and HEAD both go through these call sites (`handleHead` is a duplicated implementation — confirm its call sites are in the grep output; if any `getAllHeaders` call in `handleHead` passes `storageRootPath` it must get the same sibling).

- [ ] **Step 6: Run tests**

Run: `node --test --test-force-exit test/governance-surfacing.test.js`
Expected: PASS. Then HEAD parity spot-check:

```bash
node --test --test-force-exit test/lws-conformance*.test.js 2>/dev/null; true
```

plus `curl -sI` equivalent lives in the rig gate (Task 8).

- [ ] **Step 7: Commit**

```bash
git add src/server.js src/ldp/headers.js src/handlers/resource.js test/governance-surfacing.test.js
git commit -m "[Agent: Claude] feat(lws): advertise solid:owner via Link on storage-root GET/HEAD

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 6: Boot-time governance backfill (fork)

**Files:**
- Create: `src/lws/governance-backfill.js`
- Modify: `src/idp/accounts.js` (new `listUsernames` export)
- Modify: `src/server.js` (register the onReady hook AFTER the single-user provisioning block, ~line 1483)
- Test: `test/governance-backfill.test.js` (new)

**Interfaces:**
- Consumes: Task 1's `ensureDeclaredType`/`readOwners`/`writeOwners`/`LWS_STORAGE`; `accounts.listUsernames() -> Promise<string[]>` + existing `findByUsername`.
- Produces: `backfillGovernance(storage, { idpEnabled, singleUser, singleUserName, baseUrl }, log) -> Promise<{checked, markers, owners}>`, wired into boot.

- [ ] **Step 1: Write the failing test**

Create `test/governance-backfill.test.js`:

```js
// test/governance-backfill.test.js
// Governance round: boot self-heal. A pod tree provisioned before the
// marker/owner records existed regains storage discovery + its owner record
// on the next boot — roster-only, merge-not-overwrite, idempotent.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs-extra';
import { createServer } from '../src/server.js';
import * as storage from '../src/storage/filesystem.js';
import {
  readDeclaredTypes, readOwners, typeStorePath, ownerStorePath, LWS_STORAGE,
} from '../src/lws/type-metadata.js';

async function boot(options = {}) {
  const s = createServer({ logger: false, forceCloseConnections: true, podCreateRateLimitMax: 1000, ...options });
  await s.listen({ port: 0, host: '127.0.0.1' });
  return { s, base: `http://127.0.0.1:${s.server.address().port}` };
}

describe('governance backfill (boot self-heal)', () => {
  it('heals a legacy named pod: marker merged, owner recorded, idempotent', async () => {
    await fs.emptyDir('./data');
    const a = await boot({ lws: true, idp: true });
    const res = await fetch(`${a.base}/.pods`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'legacy', password: 'test-pass-1234' }),
    });
    assert.equal(res.status, 201);
    const { webId } = await res.json();
    await a.s.close();

    // Simulate the pre-a8e0c47 tree: no marker (but another declared type
    // that must survive), no owner record.
    await storage.write(typeStorePath('/legacy/'), Buffer.from(JSON.stringify(['https://example.org/Custom'])));
    await fs.remove('./data/legacy/.lwsowner');

    const b = await boot({ lws: true, idp: true });
    await b.s.close();                                   // onReady ran during listen

    const types = await readDeclaredTypes(storage, '/legacy/');
    assert.ok(types.includes(LWS_STORAGE), 'marker healed');
    assert.ok(types.includes('https://example.org/Custom'), 'merge, not overwrite');
    assert.deepEqual(await readOwners(storage, '/legacy/'), [webId], 'owner recorded');

    // Idempotence: a healthy boot changes neither sidecar.
    const before = [
      (await storage.read(typeStorePath('/legacy/'))).toString(),
      (await storage.read(ownerStorePath('/legacy/'))).toString(),
    ];
    const c = await boot({ lws: true, idp: true });
    await c.s.close();
    assert.equal((await storage.read(typeStorePath('/legacy/'))).toString(), before[0]);
    assert.equal((await storage.read(ownerStorePath('/legacy/'))).toString(), before[1]);
    await fs.emptyDir('./data');
  });

  it('never overwrites an operator-edited .lwsowner', async () => {
    await fs.emptyDir('./data');
    const a = await boot({ lws: true, idp: true });
    await fetch(`${a.base}/.pods`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'edited', password: 'test-pass-1234' }),
    });
    await a.s.close();
    const custom = ['https://org.example/steward#it'];
    await storage.write(ownerStorePath('/edited/'), Buffer.from(JSON.stringify(custom)));
    const b = await boot({ lws: true, idp: true });
    await b.s.close();
    assert.deepEqual(await readOwners(storage, '/edited/'), custom);
    await fs.emptyDir('./data');
  });

  it('single-user root pod heals through the profile-card roster branch', async () => {
    await fs.emptyDir('./data');
    const a = await boot({ lws: true, singleUser: true });   // root pod at /
    await a.s.close();
    await fs.remove('./data/.lwstypes');
    await fs.remove('./data/.lwsowner');
    const b = await boot({ lws: true, singleUser: true });
    await b.s.close();
    assert.ok((await readDeclaredTypes(storage, '/')).includes(LWS_STORAGE));
    const owners = await readOwners(storage, '/');
    assert.equal(owners.length, 1);
    assert.match(owners[0], /\/profile\/card(\.jsonld)?#me$/);
    await fs.emptyDir('./data');
  });
});
```

Before running: confirm the single-user option name with `grep -n "singleUser\b" src/server.js | head -5` (the boot block reads `singleUser`/`singleUserName` — pass whatever `createServer` expects; check how existing tests boot single-user mode with `grep -rn "singleUser" test/*.test.js | head -3` and mirror it).

- [ ] **Step 2: Run to verify failure**

Run: `node --test --test-force-exit test/governance-backfill.test.js`
Expected: FAIL — marker not healed.

- [ ] **Step 3: `listUsernames` in `src/idp/accounts.js`** — after `getAccountForProvider`:

```js
/**
 * All registered usernames (from the username index). Governance-backfill
 * roster source — usernames are pod names in path mode.
 */
export async function listUsernames() {
  const index = await loadIndex(getUsernameIndexPath());
  return Object.keys(index);
}
```

- [ ] **Step 4: Create `src/lws/governance-backfill.js`**

```js
// src/lws/governance-backfill.js
// Boot-time self-heal (governance round 2026-07-22). Pods provisioned before
// the lws:Storage marker (a8e0c47) / .lwsowner records existed silently lose
// storage discovery on upgrade. Re-derive both from the provisioning roster —
// IDP account index, single-user config, root profile card. ROSTER-ONLY, no
// structural heuristics: a false positive would carve a fake tenant boundary
// that shadows the root storage (storageRootFor checks named candidates
// first). LOUD, NEVER FATAL, idempotent (Phase D discipline). The
// storage-resolver's positive-only cache needs no invalidation (marker
// status is monotonic). Design: lws-pod docs/superpowers/specs/2026-07-22-*.
import { readDeclaredTypes, readOwners, writeOwners, ensureDeclaredType, LWS_STORAGE } from './type-metadata.js';

// The same card-variant rule the single-user boot gate uses: a legacy pod
// keeps its extensionless /profile/card WebID.
async function profileWebId(storage, podPath, podUri) {
  if (await storage.exists(`${podPath}profile/card.jsonld`)) return `${podUri}profile/card.jsonld#me`;
  if (await storage.exists(`${podPath}profile/card`)) return `${podUri}profile/card#me`;
  return null;                       // no profile -> not a provisioned pod shape
}

async function assembleRoster(storage, { idpEnabled, singleUser, singleUserName, baseUrl }) {
  const roster = [];
  if (idpEnabled) {
    const accounts = await import('../idp/accounts.js');
    for (const username of await accounts.listUsernames()) {
      const account = await accounts.findByUsername(username);
      if (account) roster.push({ root: `/${username}/`, webId: account.webId ?? null });
    }
  }
  if (singleUser && singleUserName) {
    const podPath = `/${singleUserName}/`;
    roster.push({ root: podPath, webId: await profileWebId(storage, podPath, `${baseUrl}${podPath}`) });
  }
  // Root pod: only a root-pod deployment has /profile/card at the root, so
  // this stays null (and '/' unstamped) for named-pod deployments.
  const rootWebId = await profileWebId(storage, '/', `${baseUrl}/`);
  if (rootWebId) roster.push({ root: '/', webId: rootWebId });
  return roster;
}

export async function backfillGovernance(storage, opts, log) {
  const summary = { checked: 0, markers: 0, owners: 0 };
  let roster;
  try { roster = await assembleRoster(storage, opts); }
  catch (err) { log.warn({ err }, '[lws-pod] governance backfill: roster assembly failed — skipped'); return summary; }
  const seen = new Set();
  for (const { root, webId } of roster) {
    if (seen.has(root)) continue;
    seen.add(root);
    try {
      if (!(await storage.exists(root))) continue;
      summary.checked++;
      if (await ensureDeclaredType(storage, root, LWS_STORAGE)) {
        summary.markers++;
        log.warn(`[lws-pod] governance backfill: stamped lws:Storage marker on ${root}`);
      }
      if (webId && !(await readOwners(storage, root)).length) {   // never overwrite an operator edit
        await writeOwners(storage, root, [webId]);
        summary.owners++;
        log.warn(`[lws-pod] governance backfill: recorded owner ${webId} for ${root}`);
      }
    } catch (err) {
      log.warn({ err }, `[lws-pod] governance backfill: ${root} failed — continuing`);   // never fatal
    }
  }
  const stamped = summary.markers + summary.owners;
  log.info(`[lws-pod] governance backfill: ${summary.checked} storage(s) checked, ${summary.markers} marker(s) + ${summary.owners} owner record(s) stamped${stamped === 0 ? ' (clean)' : ''}`);
  return summary;
}
```

- [ ] **Step 5: Wire the boot hook** — in `src/server.js`, immediately AFTER the closing brace of the `if (singleUser) { fastify.addHook('onReady', ...) }` block (fastify runs onReady hooks in registration order, so fresh single-user provisioning lands first and the backfill sees a clean tree):

```js
  // Governance backfill (2026-07-22): heal pre-marker pods at boot — loud,
  // never fatal, idempotent. Registered after single-user provisioning so a
  // fresh pod is already stamped and this is a no-op for it.
  if (lwsEnabled) {
    fastify.addHook('onReady', async () => {
      const protocol = options.ssl ? 'https' : 'http';
      const host = options.host === '0.0.0.0' ? 'localhost' : (options.host || 'localhost');
      const port = options.port || defaults.port;
      const baseUrl = idpIssuer?.replace(/\/$/, '') || `${protocol}://${host}:${port}`;
      const { backfillGovernance } = await import('./lws/governance-backfill.js');
      await backfillGovernance(storage, { idpEnabled, singleUser, singleUserName, baseUrl }, fastify.log)
        .catch((err) => fastify.log.warn({ err }, '[lws-pod] governance backfill failed — boot continues'));
    });
  }
```

(The baseUrl derivation is copied from the single-user block above it — keep the two literally identical.)

- [ ] **Step 6: Run tests**

Run: `node --test --test-force-exit test/governance-backfill.test.js test/lws-storage-marker.test.js test/governance-surfacing.test.js`
Expected: ALL PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lws/governance-backfill.js src/idp/accounts.js src/server.js test/governance-backfill.test.js
git commit -m "[Agent: Claude] feat(lws): boot-time governance backfill (marker + owner self-heal)

- roster-only (IDP index / single-user config / root profile card), merge-not-overwrite
- loud, never-fatal, idempotent; accounts.listUsernames roster export

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 7: Full fork suite + merge (fork)

**Files:**
- No new code. Merge `la3d/governance-backfill` → `la3d/lws`.

- [ ] **Step 1: Full suite**

Run: `cd /Users/cvardema/dev/git/LA3D/JavaScriptSolidServer && npm test`
Expected: 0 fail (baseline was 1952 pass / 0 fail / 1 skip; the known `test/mcp-lws-read.test.js` open-handle hang is pre-existing — if it hangs, re-run that file in isolation to confirm pre-existing behavior, do not chase it).

- [ ] **Step 2: Merge**

```bash
git checkout la3d/lws
git merge --no-ff la3d/governance-backfill -m "[Agent: Claude] merge: governance layer (solid:owner/.lwsowner + schema:provider + boot backfill) into la3d/lws

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
git log --oneline -3
```

Do NOT push — pushes are Chuck's call (record the new HEAD sha for Task 8's repin and Task 9's FOLLOWUP block).

---

### Task 8: Rig — repin, provider flag, `make test-governance` live gate (lws-pod)

**Files:**
- Modify: `docker-compose.fork-tls.yml` (command array; JSS_GIT_REF/pin per how `Dockerfile.fork` consumes it — see Step 1)
- Modify: `Makefile` (new `test-governance` target + `.PHONY`)
- Create: `tests/lws-governance.test.mjs`
- Possibly modify: `rig/capabilities.fork-tls.json` (only if `make capcheck` flags the new report line — check Step 5)

**Interfaces:**
- Consumes: fork merge sha from Task 7; the fork-tls rig conventions (BASE=`https://pod.vardeman.me`, `NODE_EXTRA_CA_CERTS=certs/rootCA.pem`, seeded alice+bob).
- Produces: green `make test-governance`; live pod advertising owner/provider.

- [ ] **Step 1: Repin + add the provider flag**

Check how the fork image is pinned: `grep -n "JSS_GIT_REF" Dockerfile.fork docker-compose.fork-tls.yml Makefile`. Update the pin to Task 7's merge sha (same mechanism the 2026-07-21 round used — see `git log --oneline -5` in lws-pod for the repin commit shape). In `docker-compose.fork-tls.yml`, extend the command array:

```yaml
    command: ["jss", "start", "-p", "3000", "-h", "0.0.0.0", "-r", "/data",
      "--idp", "--mcp", "--conneg", "--git", "--notifications", "--provision-keys",
      "--idp-issuer", "https://pod.vardeman.me",
      "--lws", "--lws-config", "/alice/profiles/pod-config.jsonld",
      "--lws-provider", "https://pod.vardeman.me/alice/profile/card#me"]
```

(Rig-local operator value: alice is this deployment's primary owner — the unified-operator model where the operator's default storage is a named storage. Chuck can point it at an external org URI later without code change.)

- [ ] **Step 2: Rebuild + verify boot**

```bash
make up-fork-tls
make logs 2>/dev/null | grep -A2 "governance backfill" || docker logs lws-pod-fork 2>&1 | grep "governance backfill"
```

Expected: the backfill line. Because alice/bob were provisioned by a fork that already stamps markers but NOT `.lwsowner`, expect `2 storage(s) checked, 0 marker(s) + 2 owner record(s) stamped` on first boot, and `(clean)` on a restart (`docker restart lws-pod-fork`, check again) — this is the live idempotence check.

- [ ] **Step 3: Write the live gate**

Create `tests/lws-governance.test.mjs` (mirror the header/env conventions of `tests/lws-multitenant.test.mjs` — same BASE/fetch setup; copy its auth helper usage for bob's private storage if it exports one):

```js
// tests/lws-governance.test.mjs — live gate for the governance round
// (solid:owner + schema:provider + backfill), against the fork-tls rig.
import { describe, it, expect } from 'vitest';

const BASE = process.env.BASE || 'https://pod.vardeman.me';
const OWNER_REL = 'http://www.w3.org/ns/solid/terms#owner';

describe('governance surfaces (live)', () => {
  it('alice description carries owner; ServerIndex carries provider', async () => {
    const desc = await (await fetch(`${BASE}/alice/lws-storage`)).json();
    expect(desc.owner).toEqual([`${BASE}/alice/profile/card.jsonld#me`]);
    const idx = await (await fetch(`${BASE}/.well-known/lws-storage`)).json();
    expect(idx.provider).toBe(`${BASE}/alice/profile/card#me`);
  });

  it('alice root GET and HEAD both carry Link rel=solid:owner', async () => {
    for (const method of ['GET', 'HEAD']) {
      const res = await fetch(`${BASE}/alice/`, { method });
      expect(res.headers.get('link') ?? '').toContain(`rel="${OWNER_REL}"`);
    }
  });

  it('a member response does not carry the owner Link', async () => {
    const res = await fetch(`${BASE}/alice/`, { headers: { Accept: 'application/lws+json' } });
    const first = (await res.json()).items?.find((i) => i.type !== 'Container');
    if (!first) return;                       // seeded tree always has members; belt only
    const m = await fetch(new URL(first.id, `${BASE}/alice/`), { method: 'HEAD' });
    expect(m.headers.get('link') ?? '').not.toContain(OWNER_REL);
  });

  it("bob's owner is not disclosed anonymously (READ-gate inherited)", async () => {
    const desc = await fetch(`${BASE}/bob/lws-storage`);
    expect(desc.status).toBe(401);            // unchanged multi-tenant behavior
    const root = await fetch(`${BASE}/bob/`, { method: 'HEAD' });
    expect(root.headers.get('link') ?? '').not.toContain(OWNER_REL);
  });

  it('.lwsowner is write-refused live', async () => {
    const res = await fetch(`${BASE}/alice/.lwsowner`, { method: 'PUT', body: '[]', headers: { 'Content-Type': 'application/json' } });
    expect([401, 403, 405]).toContain(res.status);   // dotfile guard / WAC / System-Managed — never 2xx
  });
});
```

Adjust alice's exact WebID card variant after checking live: `curl -s --cacert certs/rootCA.pem https://pod.vardeman.me/alice/lws-storage | jq .owner` — assert whatever the pod actually recorded (card vs card.jsonld depends on the account record).

- [ ] **Step 4: Makefile target** — add `test-governance` to the `.PHONY` line and, next to `test-multitenant`:

```make
test-governance:
	@[ -f certs/rootCA.pem ] || { echo "run 'make cert && make up-fork-tls && make seed-multitenant' first"; exit 1; }
	BASE=https://pod.vardeman.me NODE_EXTRA_CA_CERTS=$(CURDIR)/certs/rootCA.pem npx vitest run tests/lws-governance.test.mjs
```

- [ ] **Step 5: Run the gate + capcheck**

```bash
make test-governance
make capcheck 2>/dev/null || true
```

Expected: gate green. If capcheck compares the boot report against `rig/capabilities.fork-tls.json` and flags the new `provider` line, add it to the manifest.

- [ ] **Step 6: Regression sweep (the standing gates)**

```bash
make test-multitenant && make test-services && make test-conformance
```

Expected: all green (429 back-to-back false-fails are a documented artifact — isolate and re-run any 429).

- [ ] **Step 7: Commit (lws-pod)**

```bash
git add docker-compose.fork-tls.yml Makefile tests/lws-governance.test.mjs rig/capabilities.fork-tls.json 2>/dev/null; git add docker-compose.fork-tls.yml Makefile tests/lws-governance.test.mjs
git commit -m "[Agent: Claude] feat(rig): repin fork — governance round (owner/provider/backfill) + test-governance gate

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

(Include the capabilities manifest in the `git add` only if Step 5 changed it.)

---

### Task 9: Docs — FOLLOWUP round block (lws-pod)

**Files:**
- Modify: `FOLLOWUP.md` (new `▶▶` top block; strike the marker-gap bullet in the 2026-07-21 block)

- [ ] **Step 1: Write the round block**

At the top of `FOLLOWUP.md` (above the 2026-07-21 block), add a `▶▶ 2026-07-22 — GOVERNANCE ROUND` block in the established style, recording: spec + plan paths, fork merge sha + rig repin sha, the vocabulary decision (`solid:owner`/`pim:storage`/`schema:provider`, CDIF/ODRL-reviewed), test counts, and the recorded deferrals (implicit owner Control → authz round item 4; ODRL `hasPolicy`; owner-change API; out-of-roster tree adoption — manual remedy: write `.lwstypes` marker + `.lwsowner` by hand). In the 2026-07-21 block's "Still open" list, mark the `lws:Storage marker migration gap` bullet `~~...~~ **DONE 2026-07-22** (governance round, see top block)`. Update the `▶ START HERE` pointer to name the next entry point (per the FOLLOWUP order-of-work: item 4, the authorization-server track — unless Chuck redirects).

- [ ] **Step 2: Commit**

```bash
git add FOLLOWUP.md
git commit -m "[Agent: Claude] docs(followup): governance round COMPLETE — marker/owner backfill live-verified

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Self-review notes (already applied)

- Spec §2 table → Tasks 1/3/4 (owner sidecar, provider config, pim:storage already emitted — no task needed); §3 → Tasks 1/2/4; §4 → Tasks 4/5 (READ-gate inherited — asserted live in Task 8's bob test); §5 → Tasks 3/6; §6 → every task's test steps + Task 8; §7 deferrals → Task 9 records them.
- Type consistency: `readOwners/writeOwners/ensureDeclaredType/ownerStorePath` (Task 1) are the only new shared symbols; Tasks 2–6 import exactly those names. Description JSON keys are `owner`/`provider` everywhere (Tasks 4, 8).
- Deliberate deviation from spec §5 wording: the backfill summary is its own loud log line rather than a `formatCapabilityReport` line — the report prints synchronously in `createServer` before `onReady` runs. The `provider` config line (Task 4) does ride the report. Record this nuance in the Task 9 FOLLOWUP block.
