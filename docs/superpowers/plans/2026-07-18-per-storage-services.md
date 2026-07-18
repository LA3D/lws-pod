# Per-Storage Service Correctness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make LWS service advertisement per-storage (spec-honest): per-storage Type Index/Search
routes, NotificationService dropped, VoidService restored as a direct per-storage pointer,
ServerIndex carries the cross-storage extension surface.

**Architecture:** Spec of record `docs/superpowers/specs/2026-07-18-per-storage-service-design.md`.
Fork work happens in `/Users/cvardema/dev/git/LA3D/JavaScriptSolidServer` on a new branch
`la3d/lws-services` off `la3d/lws` (@ `48cd8ae`); lws-pod work happens in
`/Users/cvardema/dev/git/LA3D/agents/lws-pod` on `main`. The per-storage endpoints reuse the ONE
WAC-filtered walk (`collectAuthorizedResources`) with a scope root; advertisement changes flow
through the ONE builder (`buildStorageDescriptionFor`) so HTTP, MCP, and navigator can't drift.

**Tech Stack:** Node 20 / Fastify (fork), node:test (fork tests), Vitest (lws-pod live gates),
Docker + Caddy TLS rig (`make up-fork-tls`).

## Global Constraints

- Fork suite must end green: `npm test` in the fork repo (baseline 1758 pass / 0 fail / 1 skip).
- `--lws`-off responses byte-identical; origin `/types/index` + `/types/search` responses
  byte-identical for identical requests (scope param defaults preserve behavior).
- No-oracle: unknown `:pod` → plain `404`, indistinguishable from any missing path. The
  `storageRootFor` result must EQUAL the candidate root (the R6 `/` fallback must not alias
  `/bogus/` to a marked root pod).
- Never advertise a dead endpoint (FOLLOWUP explicit non-fix). `/.well-known/void` route stays
  untouched (legacy/root rail). `Updates-Via` header + `/.notifications` WS stay untouched.
- P13: fork stays application-neutral — no wiki/DCAT vocabulary in fork code or fork tests beyond
  generic schema.org fixtures.
- Commit format: `[Agent: Claude] type(scope): subject` + `Co-Authored-By: Claude Opus 4.8
  <noreply@anthropic.com>`. Stage specific files, never `git add -A`, never force-push.
- fastai style: brevity, comments only for *why*, match surrounding code.

---

### Task 1: Requirement-matrix addendum (lws-pod)

**Files:**
- Modify: `docs/superpowers/specs/2026-07-18-lws-core-requirement-matrix.md` (append section)

**Interfaces:**
- Produces: R7–R11 row IDs referenced by later commit messages and FOLLOWUP.

- [ ] **Step 1: Append the Round-2 section** to the end of the matrix doc:

```markdown

---

# Round 2 addendum — per-storage services (2026-07-18)

Pinned rows for the per-storage service correctness round (spec
`2026-07-18-per-storage-service-design.md`). Quotes verbatim from
`.claude/skills/lws-protocol/references/`. Status @48cd8ae = fork state after round 1.

| # | Requirement (verbatim source) | Source | Surface | Status @48cd8ae |
|---|---|---|---|---|
| R7 | "A storage that supports one of these services MUST advertise it with a service object in the `service` array of its storage description resource" + the Type Index "enumerates the distinct resource types present within a storage as visible to the requesting client" | lws10-searchindex Discovery + Terminology | per-storage SD + `/:pod/types/*` | VIOLATION: every SD advertises the origin-wide endpoints |
| R8 | "any filter expressible in one MUST be expressible in the other, and equivalent `GET` and `POST` requests MUST return the same result set" | lws10-searchindex GET/POST equivalence | `/:pod/types/search` | origin ✅ · per-storage NEW |
| R9 | "A storage that supports notifications MUST advertise a service object … with `type` equal to `NotificationService`. … The service object MUST include a `subscriptionType` property" | lws10-notifications Discovery | SD `service` array | VIOLATION: entry lacks `subscriptionType` AND its `/notification/api` endpoint is dead → resolved by REMOVAL; a real LWS notifications implementation is a recorded future round |
| R10 | "Responses to GET/POST on `TypeIndexService` or `TypeSearchService` include only types and resource URIs that the authenticated client is explicitly authorized to read. … Any count … MUST be computed over this client-specific, authorization-filtered view … against the requesting client's current access" | lws10-searchindex security-authorization | both scopes | ✅ (per-request WAC loop) — per-storage routes inherit the same loop; gated |
| R11 | "the `service` property is REQUIRED. … `type` … REQUIRED … `serviceEndpoint` … REQUIRED" | lws10-core Discovery data model | every SD | ✅ (StorageDescription self-entry) |

Scope notes:
- VoID appears nowhere in LWS (only substring "devoid") — `VoidService` and `/.well-known/void`
  are project extensions; so are `ServerIndex`, `McpService`, `ProfileIndexService`, and the
  `ReferentResolution` capability. Never counted as spec requirements.
- The spec defines NO server-wide advertisement mechanism (no storage catalog, no server
  capability doc) — multi-storage deployments surface as per-storage descriptions + realm scoping.
- Recorded limitation (spec §5): in a mixed root+named deployment the root storage's SD
  advertises the origin `/types/*` endpoints, whose walk is server-wide. Recorded, not fixed —
  mixed mode is not a deployed configuration.
```

- [ ] **Step 2: Commit**

```bash
cd /Users/cvardema/dev/git/LA3D/agents/lws-pod
git add docs/superpowers/specs/2026-07-18-lws-core-requirement-matrix.md
git commit -m "$(cat <<'EOF'
[Agent: Claude] docs(spec): matrix round-2 addendum — per-storage services (R7-R11)

- searchindex discovery/scope + GET/POST equivalence + authz rows
- notifications advertisement MUST resolved by removal (impl = future round)
- VoID/ServerIndex/MCP recorded as extensions, never spec claims

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Fork — drop NotificationService + delete the dead origin builder

**Files:**
- Modify: `src/lws/storage-description.js` (delete NotificationService block ~L115-117, the
  `notificationsEnabled` param, and `buildStorageDescription` ~L198-215)
- Modify: `src/server.js:1198`, `src/server.js:1230` (drop `notificationsEnabled:` arg)
- Modify: `src/handlers/resource.js:~889` (drop `notificationsEnabled:` arg)
- Modify: `src/mcp/resources.js:107` (drop `notificationsEnabled:` arg)
- Test: `test/lws-discovery-conformance.test.js` (invert the NotificationService block, ~L235-261)
- Test: any `test/` file importing `buildStorageDescription` (sweep in Step 5)

**Interfaces:**
- Consumes: nothing new.
- Produces: `buildStorageDescriptionFor(storageRootUrl, flags)` is the ONLY description builder;
  `flags` no longer accepts `notificationsEnabled`. Tasks 3-6 build on this file state.

All fork tasks run in `/Users/cvardema/dev/git/LA3D/JavaScriptSolidServer`.

- [ ] **Step 0: Create the branch**

```bash
cd /Users/cvardema/dev/git/LA3D/JavaScriptSolidServer
git checkout la3d/lws && git pull && git checkout -b la3d/lws-services
```

- [ ] **Step 1: Invert the conformance test.** In `test/lws-discovery-conformance.test.js`,
replace the body of the `'service array contains a NotificationService entry'` test (keep
`startTestServer({ lws: true, notifications: true })` — flag ON must still mean NOT advertised)
and rename the describe/it accordingly:

```js
describe('NO NotificationService in storage description (--lws + --notifications)', () => {
  // ... before/after unchanged ...
  it('service array contains NO NotificationService entry (dead /notification/api dropped; real LWS notifications = recorded future round)', async () => {
    const res = await request('/alice/lws-storage', { headers: { Accept: 'application/lws+json' } });
    assertStatus(res, 200);
    const body = await res.json();
    assert.ok(Array.isArray(body.service), 'service must be an array');
    assert.equal(body.service.find(s => s.type === 'NotificationService'), undefined,
      'NotificationService must not be advertised');
  });
});
```

- [ ] **Step 2: Run it to verify it FAILS** (entry still advertised):

```bash
node --test test/lws-discovery-conformance.test.js
```
Expected: the new assertion fails with "NotificationService must not be advertised".

- [ ] **Step 3: Implement.** In `src/lws/storage-description.js`:
  - Delete the block:
    ```js
    if (notificationsEnabled) {
      services.push({ type: 'NotificationService', serviceEndpoint: `${origin}/notification/api` });
    }
    ```
  - Remove `notificationsEnabled = false` from `assembleDescription`'s destructured params and
    `notificationsEnabled?:boolean` from BOTH JSDoc `@param` typedefs (assembleDescription and
    buildStorageDescriptionFor).
  - Delete `buildStorageDescription` (the origin form, its full JSDoc included) — zero callers
    since R6. Keep `assembleDescription` (still the shared assembly for `buildStorageDescriptionFor`).
  - In the four callers, delete the `notificationsEnabled: …,` line from the
    `buildStorageDescriptionFor` flags object: `src/server.js` (two routes: `/:pod/lws-storage`
    and root-pod `/lws-storage`), `src/handlers/resource.js` (navigator root view),
    `src/mcp/resources.js` (`readPerStorageDescription`).

- [ ] **Step 4: Run the test to verify it passes**

```bash
node --test test/lws-discovery-conformance.test.js
```
Expected: PASS (all tests in file).

- [ ] **Step 5: Sweep for stragglers**

```bash
grep -rn "notification/api\|NotificationService\|buildStorageDescription\b" src/ test/
```
Expected survivors: only `buildStorageDescriptionFor` call sites and historical *comments*.
Fix any test still importing/calling `buildStorageDescription` by switching to
`buildStorageDescriptionFor('http://pod.example/', flags)` (id/self-endpoint assertions change
from `/.well-known/lws-storage` to `http://pod.example/lws-storage`). Update the stale comment at
`src/server.js:~120-130` (it narrates the interim suppression, rewritten fully in Task 3) and the
`mcp/resources.js:107` comment if it names `notificationsEnabled`.

- [ ] **Step 6: Run the full suite**

```bash
npm test
```
Expected: green (count drops only by intentionally deleted/changed tests).

- [ ] **Step 7: Commit**

```bash
git add src/lws/storage-description.js src/server.js src/handlers/resource.js src/mcp/resources.js test/
git commit -m "$(cat <<'EOF'
[Agent: Claude] fix(lws): R9 — drop NotificationService advertisement + dead origin builder

- /notification/api never existed; entry also lacked the REQUIRED subscriptionType
- Updates-Via + /.notifications WS untouched (legacy rail); real LWS
  notifications recorded as its own future round
- buildStorageDescription (origin form) deleted — zero callers since R6

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Fork — per-storage Type endpoints + VoidService restoration in the builder

**Files:**
- Modify: `src/lws/storage-description.js` (`assembleDescription` endpoints ~L102-114 + ~L121-126;
  `buildStorageDescriptionFor` ~L232-245)
- Test: `test/lws-storage-description.test.js` (add unit assertions; update any origin-endpoint
  expectations)

**Interfaces:**
- Consumes: Task-2 file state.
- Produces: `buildStorageDescriptionFor('http://h/alice/', {typeIndexEnabled:true})` advertises
  `http://h/alice/types/index|search`; `{voidPath:'/alice/profiles/void.jsonld'}` advertises
  `VoidService` with `serviceEndpoint: 'http://h/alice/profiles/void.jsonld'`. Task 6's routes
  must exist at exactly these URLs; Task 10's live gate asserts them.

- [ ] **Step 1: Write failing unit tests** (append to `test/lws-storage-description.test.js`,
matching its import style):

```js
describe('per-storage service endpoints (services round)', () => {
  it('type endpoints are storage-scoped, derived from the storage root', () => {
    const sd = buildStorageDescriptionFor('http://h/alice/', { typeIndexEnabled: true });
    assert.equal(sd.service.find(s => s.type === 'TypeIndexService').serviceEndpoint,
      'http://h/alice/types/index');
    assert.equal(sd.service.find(s => s.type === 'TypeSearchService').serviceEndpoint,
      'http://h/alice/types/search');
  });
  it('root-pod form keeps the origin endpoints (same URLs as before)', () => {
    const sd = buildStorageDescriptionFor('http://h/', { typeIndexEnabled: true });
    assert.equal(sd.service.find(s => s.type === 'TypeIndexService').serviceEndpoint,
      'http://h/types/index');
  });
  it('VoidService is restored as a DIRECT per-storage pointer (no 303 route)', () => {
    const sd = buildStorageDescriptionFor('http://h/alice/', { voidPath: '/alice/profiles/void.jsonld' });
    const vs = sd.service.find(s => s.type === 'VoidService');
    assert.equal(vs.serviceEndpoint, 'http://h/alice/profiles/void.jsonld');
    assert.ok(!vs.hint.includes('303'), 'hint must not describe a 303 anymore');
  });
  it('no voidPath -> no VoidService', () => {
    const sd = buildStorageDescriptionFor('http://h/alice/', {});
    assert.equal(sd.service.find(s => s.type === 'VoidService'), undefined);
  });
});
```

- [ ] **Step 2: Run to verify FAIL**

```bash
node --test test/lws-storage-description.test.js
```
Expected: FAIL — endpoints still origin-scoped, VoidService still suppressed.

- [ ] **Step 3: Implement** in `src/lws/storage-description.js`:
  - In `assembleDescription`, `idUrl` always ends with `/` — derive type endpoints from it
    (per-storage for `/alice/`, origin-identical for the root-pod `/` form):
    ```js
    if (typeIndexEnabled) {
      services.push({ type: 'TypeIndexService', serviceEndpoint: `${idUrl}types/index` });
      services.push({
        type: 'TypeSearchService',
        serviceEndpoint: `${idUrl}types/search`,
        hint: /* existing CNF hint UNCHANGED */,
      });
    }
    ```
  - VoidService becomes a direct document pointer (keep the `origin` composition — `voidPath` is
    absolute-from-origin, same convention as `profileIndexPath`):
    ```js
    if (voidPath) {
      services.push({ type: 'VoidService', serviceEndpoint: `${origin}${voidPath}`,
        // Direct pointer to the pod-served VoID document (services round): the
        // SD is generated from the same per-storage pod-config at request
        // time, so a 303 indirection here buys nothing. The origin
        // /.well-known/void 303 stays as the legacy/root rail.
        hint: 'VoID description of the datasets this storage serves — the vocabularies in use (each with a pod-served copy), root resources, and the subject URI space.' });
    }
    ```
  - In `buildStorageDescriptionFor`, delete the INTERIM SUPPRESSION comment and change
    `{ ...flags, voidPath: null }` back to `flags`. Update its JSDoc paragraph (~L217-227): the
    services are now storage-scoped by construction; note the recorded mixed-mode limitation
    (spec §5) in one sentence. Also update the now-stale suppression narration comment at
    `src/server.js:~120-130`.

- [ ] **Step 4: Run tests**

```bash
node --test test/lws-storage-description.test.js && npm test
```
Expected: file PASS; full suite green EXCEPT tests pinning origin-scoped per-storage endpoints —
update those expectations (`grep -rn '"/types/index"\|/types/index' test/ | grep -i "storage\|discovery\|conformance"`)
to `/alice/types/index` where the asserted document is a per-storage SD. Re-run until green.

- [ ] **Step 5: Commit**

```bash
git add src/lws/storage-description.js src/server.js test/
git commit -m "$(cat <<'EOF'
[Agent: Claude] feat(lws): R7 — storage-scoped type endpoints + VoidService direct pointer

- TypeIndex/TypeSearch serviceEndpoints derive from the storage root (idUrl);
  root-pod form keeps origin URLs by construction
- VoidService restored per-storage as a direct pointer to the pod-served VoID
  document (interim suppression removed); /.well-known/void 303 rail untouched

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Fork — ServerIndex extension service array

**Files:**
- Modify: `src/lws/storage-description.js` (`buildServerIndex` ~L257-267; extract `mcpServiceEntry`
  from `assembleDescription`'s MCP block)
- Modify: `src/server.js` (well-known ServerIndex route: pass flags — find with
  `grep -n "buildServerIndex" src/server.js`)
- Modify: `src/mcp/resources.js:82` (`readServerIndex`: pass flags)
- Test: `test/lws-storage-description.test.js`

**Interfaces:**
- Consumes: Task-3 file state.
- Produces: `buildServerIndex(origin, storages, { typeIndexEnabled, mcpEnabled, anonRateLimitMax })`
  — third param NEW, optional, default `{}` (no `service` key when nothing enabled, so
  single-tenant callers that don't pass flags emit the exact pre-round shape).

- [ ] **Step 1: Write failing unit tests:**

```js
describe('ServerIndex extension service array (services round)', () => {
  it('advertises the cross-storage surfaces when enabled', () => {
    const idx = buildServerIndex('http://h', [{ root: '/alice/' }],
      { typeIndexEnabled: true, mcpEnabled: true, anonRateLimitMax: 60 });
    assert.equal(idx.service.find(s => s.type === 'TypeIndexService').serviceEndpoint, 'http://h/types/index');
    assert.ok(idx.service.find(s => s.type === 'TypeIndexService').hint.includes('ALL storages'));
    assert.equal(idx.service.find(s => s.type === 'TypeSearchService').serviceEndpoint, 'http://h/types/search');
    assert.equal(idx.service.find(s => s.type === 'McpService').serviceEndpoint, 'http://h/mcp');
    assert.equal(idx.service.find(s => s.type === 'NotificationService'), undefined);
  });
  it('no flags -> no service key (pre-round shape preserved)', () => {
    const idx = buildServerIndex('http://h', [{ root: '/alice/' }]);
    assert.equal('service' in idx, false);
  });
});
```

- [ ] **Step 2: Run to verify FAIL** — `node --test test/lws-storage-description.test.js`

- [ ] **Step 3: Implement:**
  - Extract the McpService entry from `assembleDescription` into a module-level
    `function mcpServiceEntry(origin, anonRateLimitMax)` returning the existing object (hint +
    budget sentence verbatim); `assembleDescription` calls it.
  - Extend `buildServerIndex`:
    ```js
    export function buildServerIndex(origin, storages = [], { typeIndexEnabled = false, mcpEnabled = false, anonRateLimitMax = null } = {}) {
      const idx = { /* existing @context/id/type/storage object UNCHANGED */ };
      // Extension surface (ServerIndex is itself a JSS extension): the
      // cross-storage aggregates live here, NOT in per-storage descriptions —
      // each storage advertises only its own scoped services (R7).
      const service = [];
      if (typeIndexEnabled) {
        service.push({ type: 'TypeIndexService', serviceEndpoint: `${origin}/types/index`,
          hint: 'Cross-storage inventory: distinct resource types across ALL storages on this server, filtered to what you are authorized to read. Each storage advertises its own storage-scoped index in its storage description.' });
        service.push({ type: 'TypeSearchService', serviceEndpoint: `${origin}/types/search`,
          hint: 'Cross-storage search over ALL storages on this server (authorization-filtered). GET with ?type=<uri>; comma-separate values in one param for OR, repeat the parameter for AND; ?describedby=<uri> and ?conformsTo=<uri> filter by indexed relations. Each storage advertises its own storage-scoped search in its storage description.' });
      }
      if (mcpEnabled) service.push(mcpServiceEntry(origin, anonRateLimitMax));
      if (service.length) idx.service = service;
      return idx;
    }
    ```
  - Callers: in `src/server.js`'s well-known ServerIndex route pass
    `{ typeIndexEnabled, mcpEnabled, anonRateLimitMax }` (all three already in scope — same
    identifiers the `/:pod/lws-storage` route uses); in `src/mcp/resources.js`:
    ```js
    const idx = buildServerIndex(ctx.origin, roots.map((root) => ({ root })),
      { typeIndexEnabled: ctx.typeIndexEnabled, mcpEnabled: true, anonRateLimitMax: ctx.anonRateLimitMax });
    ```

- [ ] **Step 4: Run tests** — `node --test test/lws-storage-description.test.js && npm test` →
green (the existing MCP well-known parity test in `test/mcp-lws-read.test.js` proves the two
callers agree; if it pins the old body, update its expectation).

- [ ] **Step 5: Commit**

```bash
git add src/lws/storage-description.js src/server.js src/mcp/resources.js test/
git commit -m "$(cat <<'EOF'
[Agent: Claude] feat(lws): ServerIndex extension service array (cross-storage surfaces)

- TypeIndex/TypeSearch (origin-wide, WAC-filtered) + McpService advertised on
  the ServerIndex — an extension surface on an extension document, honestly
  hinted; per-storage SDs advertise only their own scoped services
- mcpServiceEntry extracted, shared by both builders

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Fork — scope-parameterized WAC walk

**Files:**
- Modify: `src/lws/authorized-resources.js` (add `scopeRoot`)
- Modify: `src/handlers/type-index.js` (refactor `authorizedTypeLists` onto
  `collectAuthorizedResources`; thread `{ scopeRoot }` through both handlers)
- Test: `test/lws-type-index-unit.test.js` or `test/lws-type-index.test.js` (scoped-walk unit)

**Interfaces:**
- Consumes: `collectAuthorizedResources({ agentWebId, origin, neededRelations, buildId })`
  (existing), `walkResources(rootUrlPath='/')` (existing, already prefix-aware).
- Produces: `collectAuthorizedResources({ …, scopeRoot = '/' })`;
  `handleTypeIndex(request, reply, { scopeRoot = '/' } = {})` and
  `handleTypeSearch(request, reply, { scopeRoot = '/' } = {})`. Task 6 calls these with a
  validated per-storage root. Defaults preserve origin-route behavior exactly.

- [ ] **Step 1: Write the failing test** (two pods, scoped walk returns only the subtree —
follow `test/lws-type-index.test.js`'s PUT-with-`Link rel="type"` pattern):

```js
import { collectAuthorizedResources } from '../src/lws/authorized-resources.js';

describe('collectAuthorizedResources scopeRoot', () => {
  let base, alice, bob;
  before(async () => {
    await startTestServer({ lws: true });
    base = getBaseUrl();
    alice = await createTestPod('alice'); bob = await createTestPod('bob');
    for (const [pod, type] of [['alice', 'https://schema.org/Person'], ['bob', 'https://schema.org/Event']]) {
      const token = pod === 'alice' ? alice.token : bob.token;
      const put = await fetch(`${base}/${pod}/x1`, { method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, Link: `<${type}>; rel="type"` },
        body: JSON.stringify({ n: 1 }) });
      assert.equal(put.status, 201);
    }
  });
  after(async () => { await stopTestServer(); });

  it('scopeRoot limits the walk to one storage subtree', async () => {
    const all = await collectAuthorizedResources({ agentWebId: null, origin: base });
    const scoped = await collectAuthorizedResources({ agentWebId: null, origin: base, scopeRoot: '/alice/' });
    assert.ok(all.some(r => r.id.includes('/bob/')), 'unscoped walk sees bob');
    assert.ok(scoped.length > 0 && scoped.every(r => r.id.includes('/alice/')), 'scoped walk sees only alice');
  });
});
```

- [ ] **Step 2: Run to verify FAIL** (`scopeRoot` unknown → scoped === all):

```bash
node --test test/lws-type-index-unit.test.js
```

- [ ] **Step 3: Implement:**
  - `src/lws/authorized-resources.js` — add `scopeRoot = '/'` to the destructured options and
    change the walk line to `const resources = await walkResources(scopeRoot);` with a why-comment:
    ```js
    // scopeRoot bounds the walk to one storage's subtree (per-storage
    // /:pod/types/* routes, services round). Named storages resolve by FIRST
    // path segment only (storage-resolver.js), so a subtree walk IS the
    // owning-storage scope — no per-resource re-resolution needed. The walk
    // excludes the base itself, mirroring the origin walk's exclusion of '/'.
    ```
  - `src/handlers/type-index.js` — delete `authorizedTypeLists` (its loop is
    `collectAuthorizedResources` minus relations) and rewrite:
    ```js
    export async function handleTypeIndex(request, reply, { scopeRoot = '/' } = {}) {
      const { webId: agentWebId } = await getWebIdFromRequestAsync(request).catch(() => ({ webId: null }));
      const resources = await collectAuthorizedResources({ agentWebId, scopeRoot,
        buildId: (urlPath) => buildResourceUrl(request, urlPath) });
      reply.header('Cache-Control', 'private, no-store');
      reply.type(LWS_JSON);
      // R3/R5: GET-only route (no POST /types/index) — always the ETag arm.
      return sendJsonWithEtag(request, reply, buildTypeIndex(resources.map((r) => r.types)));
    }
    ```
    In `handleTypeSearch`, change the helper call to
    `authorizedResources(request, { neededRelations, scopeRoot })` (add `scopeRoot = '/'` to the
    handler's options param and pass it through `authorizedResources` into
    `collectAuthorizedResources`). Remove now-unused imports (`walkResources`, `checkAccess`,
    `AccessMode`, `storage`, `readDeclaredTypes`, `resourceTypes` — whichever the refactor orphans).

- [ ] **Step 4: Run tests** — `node --test test/lws-type-index-unit.test.js test/lws-type-index.test.js && npm test`
Expected: green — origin `/types/*` responses unchanged (default `scopeRoot: '/'`).

- [ ] **Step 5: Commit**

```bash
git add src/lws/authorized-resources.js src/handlers/type-index.js test/
git commit -m "$(cat <<'EOF'
[Agent: Claude] feat(lws): scope-parameterized WAC walk for type index/search

- collectAuthorizedResources gains scopeRoot (default '/' — origin behavior
  byte-identical); authorizedTypeLists folded into it (was a relations-less copy)
- handleTypeIndex/handleTypeSearch accept { scopeRoot } for Task-6 routes

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Fork — `/:pod/types/*` routes

**Files:**
- Modify: `src/server.js` (route registration after the origin `/types/*` block ~L1291-1301; the
  blanket-WAC bypass list ~L925-926 area; `needsTrustAwareRateLimit` ~L86)
- Create: `test/lws-per-storage-types.test.js`

**Interfaces:**
- Consumes: `handleTypeIndex/handleTypeSearch(request, reply, { scopeRoot })` (Task 5);
  `storageRootFor(storage, urlPath)` (existing); `typeQueryRateLimit`, `methodNotAllowed`
  (existing, in scope at the registration site).
- Produces: the endpoints Task 3 advertises. Route paths: `GET /:pod/types/index`,
  `GET+POST /:pod/types/search`; writes 405; unknown pod 404.

- [ ] **Step 1: Write the failing integration tests** (`test/lws-per-storage-types.test.js`):

```js
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startTestServer, stopTestServer, getBaseUrl, createTestPod } from './helpers.js';

const PERSON = 'https://schema.org/Person';
const EVENT = 'https://schema.org/Event';
const LWS_JSON = 'application/lws+json';

describe('per-storage /:pod/types/* (R7/R8/R10)', () => {
  let base, alice, bob;
  before(async () => {
    await startTestServer({ lws: true });
    base = getBaseUrl();
    alice = await createTestPod('alice'); bob = await createTestPod('bob');
    const puts = [ ['alice', alice.token, PERSON], ['bob', bob.token, EVENT] ];
    for (const [pod, token, type] of puts) {
      const r = await fetch(`${base}/${pod}/x1`, { method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, Link: `<${type}>; rel="type"` },
        body: JSON.stringify({ n: 1 }) });
      assert.equal(r.status, 201);
    }
  });
  after(async () => { await stopTestServer(); });

  const items = async (res) => (await res.json()).items.map((i) => i.id);

  it('R7: /alice/types/index excludes bob even where WAC would allow (scope, not authz)', async () => {
    const scoped = await fetch(`${base}/alice/types/index`, { headers: { Authorization: `Bearer ${bob.token}` } });
    assert.equal(scoped.status, 200);
    const scopedTypes = await items(scoped);
    assert.ok(scopedTypes.includes(PERSON), 'alice type present');
    assert.ok(!scopedTypes.includes(EVENT), 'bob type absent despite bob token');
    const origin = await fetch(`${base}/types/index`, { headers: { Authorization: `Bearer ${bob.token}` } });
    assert.ok((await items(origin)).includes(EVENT), 'origin index still cross-storage');
  });

  it('R7: /alice/types/search returns only alice resources', async () => {
    const res = await fetch(`${base}/alice/types/search`, { headers: { Authorization: `Bearer ${bob.token}` } });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.ok(body.totalItems > 0);
    for (const i of body.items) assert.ok(new URL(i.id).pathname.startsWith('/alice/'), i.id);
  });

  it('R8: GET and POST /alice/types/search are equivalent', async () => {
    const get = await fetch(`${base}/alice/types/search?type=${encodeURIComponent(PERSON)}`);
    const post = await fetch(`${base}/alice/types/search`, { method: 'POST',
      headers: { 'Content-Type': LWS_JSON }, body: JSON.stringify({ type: [[PERSON]] }) });
    assert.deepEqual(await get.json(), await post.json());
  });

  it('R10: anon on a private resource — omitted from the per-storage view', async () => {
    // bob/x1 is readable per pod default ACL only if public; make alice/private explicit:
    const put = await fetch(`${base}/alice/secret`, { method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${alice.token}`, Link: `<${EVENT}>; rel="type"` },
      body: JSON.stringify({ s: 1 }) });
    assert.equal(put.status, 201);
    const acl = await fetch(`${base}/alice/secret.acl`, { method: 'PUT',
      headers: { 'Content-Type': 'text/turtle', Authorization: `Bearer ${alice.token}` },
      body: `@prefix acl: <http://www.w3.org/ns/auth/acl#>.
<#owner> a acl:Authorization; acl:agent <${alice.webId}>; acl:accessTo <./secret>; acl:mode acl:Read, acl:Write, acl:Control.` });
    assert.ok(acl.status === 200 || acl.status === 201, `acl PUT: ${acl.status}`);
    const anon = await fetch(`${base}/alice/types/search?type=${encodeURIComponent(EVENT)}`);
    const ids = (await anon.json()).items.map((i) => i.id);
    assert.ok(!ids.some((i) => i.endsWith('/alice/secret')), 'private resource omitted for anon');
    const owner = await fetch(`${base}/alice/types/search?type=${encodeURIComponent(EVENT)}`,
      { headers: { Authorization: `Bearer ${alice.token}` } });
    assert.ok((await owner.json()).items.some((i) => i.id.endsWith('/alice/secret')), 'visible to owner');
  });

  it('no-oracle: unknown pod is a plain 404', async () => {
    const res = await fetch(`${base}/nosuchpod/types/index`);
    assert.equal(res.status, 404);
  });

  it('writes are 405 (reserved names)', async () => {
    for (const [m, path] of [['PUT', 'types/index'], ['POST', 'types/index'], ['DELETE', 'types/search']]) {
      const res = await fetch(`${base}/alice/${path}`, { method: m });
      assert.equal(res.status, 405, `${m} ${path}`);
    }
  });

  it('R3/R4: ETag + If-None-Match 304 on the per-storage GET', async () => {
    const first = await fetch(`${base}/alice/types/index`);
    const etag = first.headers.get('etag');
    assert.ok(etag, 'ETag present');
    const cond = await fetch(`${base}/alice/types/index`, { headers: { 'If-None-Match': etag } });
    assert.equal(cond.status, 304);
  });
});

describe('per-storage /:pod/types/* negative control (no --lws)', () => {
  before(async () => { await startTestServer({ lws: false }); await createTestPod('alice'); });
  after(async () => { await stopTestServer(); });
  it('no route registered: /alice/types/index is an ordinary missing LDP path (404)', async () => {
    const res = await fetch(`${getBaseUrl()}/alice/types/index`);
    assert.equal(res.status, 404);
  });
});
```

- [ ] **Step 2: Run to verify FAIL** — `node --test test/lws-per-storage-types.test.js`
Expected: 404s everywhere (routes don't exist). If `createTestPod` doesn't return `webId`, read
it from the pod provisioning response the helper wraps (check `test/helpers.js:70`) and adjust
the ACL fixture accordingly.

- [ ] **Step 3: Implement in `src/server.js`:**
  - `needsTrustAwareRateLimit` (~L86) — after the existing `/types/*` line add (flag-blind, like
    its neighbors):
    ```js
    if (/^\/[^/]+\/types\/(index|search)$/.test(path)) return true;
    ```
  - Blanket-WAC bypass (~L926, after the two origin `/types/*` lines):
    ```js
    // Per-storage type aggregates (services round): same virtual-aggregate
    // self-authz rationale as origin /types/* above; the route's own
    // storageRootFor equality gate 404s any segment that isn't a real
    // storage, so this bypass only ever reaches those routes' own guards.
    (lwsEnabled && typeIndexEnabled && /^\/[^/]+\/types\/(index|search)(\?.*)?$/.test(request.url)) ||
    ```
  - Route registration — inside the existing `typeIndexEnabled` registration block, after the
    origin 405 lines (~L1301), gated on `lwsEnabled` (per-storage roots only exist under `--lws`):
    ```js
    if (lwsEnabled) {
      // Per-storage TypeIndex/TypeSearch (R7): the scoped twin of the origin
      // aggregates. The equality check is the no-oracle gate — and it also
      // stops the R6 root-pod '/' fallback from aliasing /bogus/ to '/'.
      const perStorageScope = async (request, reply) => {
        const root = `/${request.params.pod}/`;
        if ((await storageRootFor(storage, root)) !== root) { reply.code(404).send(); return null; }
        return root;
      };
      fastify.get('/:pod/types/index', typeQueryRateLimit, async (request, reply) => {
        const scopeRoot = await perStorageScope(request, reply);
        return scopeRoot === null ? reply : handleTypeIndex(request, reply, { scopeRoot });
      });
      const perStorageSearch = async (request, reply) => {
        const scopeRoot = await perStorageScope(request, reply);
        return scopeRoot === null ? reply : handleTypeSearch(request, reply, { scopeRoot });
      };
      fastify.get('/:pod/types/search', typeQueryRateLimit, perStorageSearch);
      fastify.post('/:pod/types/search', typeQueryRateLimit, perStorageSearch);
      for (const m of ['put', 'post', 'patch', 'delete']) fastify[m]('/:pod/types/index', methodNotAllowed);
      for (const m of ['put', 'patch', 'delete']) fastify[m]('/:pod/types/search', methodNotAllowed);
    }
    ```
    (`storageRootFor` and `storage` are already imported in server.js — verify, add imports if not.)

- [ ] **Step 4: Run tests** — `node --test test/lws-per-storage-types.test.js && npm test` → green.

- [ ] **Step 5: Commit**

```bash
git add src/server.js test/lws-per-storage-types.test.js
git commit -m "$(cat <<'EOF'
[Agent: Claude] feat(lws): R7/R8 — per-storage /:pod/types/index + /:pod/types/search

- scoped twin of the origin aggregates via scopeRoot; same self-authz WAC loop
  (R10 inherited), sendJsonWithEtag (R3/R4), trust-aware rate limit
- no-oracle 404 on unknown pods (equality gate also defeats the R6 '/' alias)
- writes 405 (reserved-name precedent); origin routes byte-identical

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: Fork — final sweep, full suite, merge + push

**Files:**
- Modify: none expected (sweep may touch comments/tests)

**Interfaces:**
- Produces: merged `la3d/lws` SHA — Task 8 pins it in the rig.

- [ ] **Step 1: Sweep** — confirm zero stragglers, and MCP/navigator parity holds:

```bash
grep -rn "notification/api" src/ test/          # expect: nothing
grep -rn "NotificationService" src/ test/       # expect: only the Task-2 absence test + comments
grep -rn "buildStorageDescription\b" src/ test/ # expect: nothing (only ...For)
node --test test/mcp-lws-read.test.js           # MCP<->HTTP SD + ServerIndex parity
npm test                                        # full suite green
```

- [ ] **Step 2: Merge + push**

```bash
git checkout la3d/lws
git merge --no-ff la3d/lws-services -m "$(cat <<'EOF'
[Agent: Claude] merge: per-storage services round (R7-R11)

- per-storage /:pod/types/* + storage-scoped advertisement; NotificationService
  dropped (R9, impl = recorded future round); VoidService per-storage direct
  pointer; ServerIndex extension service array; dead origin builder deleted

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
git push origin la3d/lws
git rev-parse HEAD   # record the FULL SHA for Task 8
```

---

### Task 8: lws-pod — rig repin + rebuild + reseed

**Files:**
- Modify: `Dockerfile.fork:20` (`ARG JSS_GIT_REF=<new full SHA>`)
- Modify: `docker-compose.fork-tls.yml:20` (`JSS_GIT_REF: "${JSS_GIT_REF:-<new full SHA>}"`)

**Interfaces:**
- Consumes: the merge SHA from Task 7.
- Produces: live rig at `https://pod.vardeman.me` running the services round; Task 9's gate runs
  against it.

- [ ] **Step 1: Repin BOTH files** (the compose fallback shadows the Dockerfile ARG — R-round
gotcha; update the trailing comments to say "services round").

- [ ] **Step 2: Rebuild + reseed**

```bash
cd /Users/cvardema/dev/git/LA3D/agents/lws-pod
make down-fork-tls && make up-fork-tls
make seed-multitenant
```

- [ ] **Step 3: Smoke-verify live**

```bash
curl -s --cacert certs/rootCA.pem https://pod.vardeman.me/alice/lws-storage | \
  python3 -c "import json,sys; s=json.load(sys.stdin)['service']; print([(x['type'],x['serviceEndpoint']) for x in s])"
```
Expected: TypeIndexService/TypeSearchService at `/alice/types/*`, VoidService at
`/alice/profiles/void.jsonld`, NO NotificationService. (Anon rate limit gotcha: space bursts ~40s.)

- [ ] **Step 4: Commit**

```bash
git add Dockerfile.fork docker-compose.fork-tls.yml
git commit -m "$(cat <<'EOF'
[Agent: Claude] feat(rig): repin fork <shortsha> — per-storage services round

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 9: lws-pod — live gate `make test-services`

**Files:**
- Create: `tests/lws-services.test.mjs`
- Modify: `Makefile` (`.PHONY` line 9 + new target after `test-conformance`)
- Modify: `README.md` (gates list — one line for `make test-services`)

**Interfaces:**
- Consumes: `tests/helpers.mjs` (`BASE`, `getToken`), the seeded two-tenant rig (alice public +
  bob private, `make seed-multitenant`).
- Produces: the named gate FOLLOWUP's round record cites.

- [ ] **Step 1: Write the gate** (`tests/lws-services.test.mjs`) — self-skips like
`tests/lws-multitenant.test.mjs`:

```js
import { describe, it, beforeAll, expect } from 'vitest'
import { BASE, getToken } from './helpers.mjs'

// Per-storage services live gate (spec 2026-07-18 round 2, matrix R7-R11).
// Needs up-fork-tls + seed-multitenant (alice public + bob private). Reads
// only; self-skips on a single-tenant/unseeded pod.

const BOB = { name: 'bob', email: 'bob@example.com', password: 'bobpassword123' }
const lws = { Accept: 'application/lws+json' }

const idx = await fetch(`${BASE}/.well-known/lws-storage`, { headers: lws })
  .then((r) => (r.ok ? r.json() : {})).catch(() => ({}))
const isMultiTenant = idx.type === 'ServerIndex'

describe.skipIf(!isMultiTenant)('per-storage services (spec 2026-07-18 R7-R11)', () => {
  let bobAuth
  beforeAll(async () => {
    const { token } = await getToken(BOB)
    bobAuth = { Authorization: `Bearer ${token}` }
  })

  it('S1 alice SD advertises HER OWN scoped services; no NotificationService', async () => {
    const sd = await fetch(`${BASE}/alice/lws-storage`, { headers: lws }).then((r) => r.json())
    const by = (t) => sd.service.find((s) => s.type === t)
    expect(by('TypeIndexService').serviceEndpoint).toBe(`${BASE}/alice/types/index`)
    expect(by('TypeSearchService').serviceEndpoint).toBe(`${BASE}/alice/types/search`)
    expect(by('VoidService').serviceEndpoint).toBe(`${BASE}/alice/profiles/void.jsonld`)
    expect(by('NotificationService')).toBeUndefined()
  })

  it('S2 scope isolation: bob token on /alice/types/search sees only alice; origin sees both', async () => {
    const scoped = await fetch(`${BASE}/alice/types/search`, { headers: bobAuth }).then((r) => r.json())
    expect(scoped.totalItems).toBeGreaterThan(0)
    for (const i of scoped.items) expect(new URL(i.id).pathname.startsWith('/alice/')).toBe(true)
    const origin = await fetch(`${BASE}/types/search`, { headers: bobAuth }).then((r) => r.json())
    expect(origin.items.some((i) => new URL(i.id).pathname.startsWith('/bob/'))).toBe(true)
  })

  it('S3 VoidService dereferences directly (200, no 303)', async () => {
    const sd = await fetch(`${BASE}/alice/lws-storage`, { headers: lws }).then((r) => r.json())
    const vs = sd.service.find((s) => s.type === 'VoidService')
    const r = await fetch(vs.serviceEndpoint, { redirect: 'manual' })
    expect(r.status).toBe(200)
  })

  it('S4 ServerIndex carries the cross-storage extension service array', async () => {
    expect(idx.service.find((s) => s.type === 'TypeIndexService').serviceEndpoint).toBe(`${BASE}/types/index`)
    expect(idx.service.find((s) => s.type === 'McpService')).toBeDefined()
    expect(idx.service.find((s) => s.type === 'NotificationService')).toBeUndefined()
  })

  it('S5 conditional + reserved-name + no-oracle posture on the new routes', async () => {
    const first = await fetch(`${BASE}/alice/types/index`)
    const etag = first.headers.get('etag')
    expect(etag).toBeTruthy()
    const cond = await fetch(`${BASE}/alice/types/index`, { headers: { 'If-None-Match': etag } })
    expect(cond.status).toBe(304)
    expect((await fetch(`${BASE}/alice/types/index`, { method: 'PUT' })).status).toBe(405)
    expect((await fetch(`${BASE}/nosuchpod/types/index`)).status).toBe(404)
  })

  it('S6 bob-private posture: anon gets 401 on bob SD; bob token sees his scoped endpoints', async () => {
    expect((await fetch(`${BASE}/bob/lws-storage`, { headers: lws })).status).toBe(401)
    const sd = await fetch(`${BASE}/bob/lws-storage`, { headers: { ...lws, ...bobAuth } }).then((r) => r.json())
    expect(sd.service.find((s) => s.type === 'TypeIndexService').serviceEndpoint).toBe(`${BASE}/bob/types/index`)
  })
})
```

- [ ] **Step 2: Makefile** — add `test-services` to the `.PHONY` list (line 9) and, after the
`test-conformance` target:

```makefile
# Per-storage services live gate (spec 2026-07-18 round 2, matrix R7-R11). Needs
# up-fork-tls + `make seed-multitenant`. Self-skips on a single-tenant pod.
test-services:
	@[ -f certs/rootCA.pem ] || { echo "run 'make cert && make up-fork-tls && make seed-multitenant' first"; exit 1; }
	BASE=https://pod.vardeman.me NODE_EXTRA_CA_CERTS=$(CURDIR)/certs/rootCA.pem npx vitest run tests/lws-services.test.mjs
```

Add one line to README.md's gate list mirroring the `test-conformance` entry.

- [ ] **Step 3: Run the gate**

```bash
make test-services
```
Expected: 6/6 pass. (If S2's per-storage `totalItems` is 0, seed drift — re-run `make seed-multitenant`.)

- [ ] **Step 4: Commit**

```bash
git add tests/lws-services.test.mjs Makefile README.md
git commit -m "$(cat <<'EOF'
[Agent: Claude] test(services): live gate for the per-storage services round (S1-S6)

- scoped advertisement, scope isolation, direct VoID deref, ServerIndex
  extension array, conditional/reserved/no-oracle posture, private-pod parity

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 10: lws-pod — full live sweep + FOLLOWUP + memory

**Files:**
- Modify: `FOLLOWUP.md` (new top block; annotate the 2026-07-16 residual)
- Modify: `/Users/cvardema/.claude/projects/-Users-cvardema-dev-git-LA3D-agents-lws-pod/memory/general-substrate-design.md`
  and `MEMORY.md` (round summary — outside the repo, no git add)

**Interfaces:**
- Consumes: all prior tasks done + green.

- [ ] **Step 1: Full live sweep** (space bursts ~40s — anon rate limit gotcha):

```bash
make test && make test-lws && make test-l3 && make test-typeindex && \
make test-indexed-relation && make test-mcp-v2 && make test-profiles && \
make test-dcat && make test-graph && make test-conneg && make test-preservation && \
make test-void && make test-referent && make test-multitenant && make test-nextfork && \
make test-conformance && make test-services && make test-wiki && make test-projection && make test-viewer
```
Expected: ALL green. `test-typeindex`/`test-void`/`test-mcp-v2` are the likeliest to catch an
advertisement regression — if one pins the old per-storage SD service set, update the pin to the
new scoped endpoints (that is the intended change), everything else must pass untouched.

- [ ] **Step 2: FOLLOWUP.md** — new `▶▶ 2026-07-18 — PER-STORAGE SERVICES ROUND DONE` top block
(supersedes the round-1 pointer as entry point) recording: fork merge SHA + image, R7–R11 closed,
gate names + counts, the mixed-mode recorded limitation, **a new explicit future-round item: LWS
notifications implementation (webhook subscriptions, `subscriptionType`, subscription containers,
signing keys — lws10-notifications)**, and NEXT = standards-closeout item 3 (PROF/conneg). In the
2026-07-16 block, mark the "Per-storage VoID (fork)" residual CLOSED with a pointer up.

- [ ] **Step 3: Memory** — append the round outcome to the `general-substrate-design.md` body
(fork SHA, R7–R11, notifications future round, NEXT = item 3) and refresh the matching clause in
`MEMORY.md`'s index line.

- [ ] **Step 4: Commit**

```bash
git add FOLLOWUP.md
git commit -m "$(cat <<'EOF'
[Agent: Claude] docs(followup): per-storage services round DONE (R7-R11, live-verified)

- NotificationService dropped; LWS notifications recorded as future round
- per-storage VoID residual (2026-07-16) closed; NEXT = PROF/conneg closeout

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Self-review notes (already applied)

- Spec §3 "sweep NotificationService in navigator" → `renderRootView` renders `sd.service`
  generically (escaped), so the drop flows through with no navigator edit; Task 7's grep confirms.
- Spec §3 MCP parity → the existing `test/mcp-lws-read.test.js` round-trip test IS the gate;
  Task 7 runs it explicitly.
- Spec §6 "--lws-off byte-identical" → Task 6 registers routes only under
  `typeIndexEnabled && lwsEnabled`, bypass line carries both flags; origin handlers keep default
  `scopeRoot '/'` (Task 5).
- Alice's pod-config already carries `"void": "/alice/profiles/void.jsonld"`
  (`projection/profiles/defs/pod-config.jsonld`) — no seed change needed for S1/S3.
