# LWS Resource-Server Conformance Closeout — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the verified LWS-core read/discovery conformance gaps (FOLLOWUP 2026-07-18 round 1):
`up`/`type` Link headers on every `--lws` GET/HEAD, ETag + 304 on the special LWS surfaces, the
root-pod `storageRootFor('/')` fallback — gated by fork unit tests and a new live gate.

**Architecture:** All header work lands in ONE choke point (`getAllHeaders`, `src/ldp/headers.js`)
so every GET/HEAD branch and `handleHead` inherit it; ETag/304 for generated documents is a shared
`sendJsonWithEtag` helper (md5-of-body strong ETag + `checkIfNoneMatchForGet`); the root-pod fix is
a fallback inside `storageRootFor` plus one new `/lws-storage` route that delegates to `handleGet`
when `/` is unmarked. Everything is `lwsEnabled`-gated.

**Tech Stack:** Fork = JavaScriptSolidServer (`~/dev/git/LA3D/JavaScriptSolidServer`), Fastify,
`node --test` suite. lws-pod = Vitest live gates against `https://pod.vardeman.me` (up-fork-tls rig).

## Global Constraints

- **Spec anchors (pinned, `.claude/skills/lws-protocol/references/lws10-core/`):**
  - `Operations/read-resource.md` L9: responses MUST carry Link headers for `rel="linkset"`, `rel="up"`, `rel="type"`.
  - `Operations/metadata.md` L22: "Servers MUST include a Link header with `rel="up"` pointing to the parent container for any non-root resource."
  - `Operations/read-resource.md` L12+L89: "ETags MUST be provided in all GET/HEAD responses"; conditional If-None-Match → 304.
  - `Operations/update-resource.md` L45: linkset GET/HEAD responses MUST include an ETag.
- **Header parity invariant:** HTTP Link `up`/`type` must be derived by the SAME helpers the linkset
  body uses (`parentContainerUrl`, `isContainer ? 'Container' : 'DataResource'`) — parity by
  construction, not by duplication.
- **P13 neutrality:** the fork never interprets application vocabulary. Everything here is generic
  LWS surface.
- **`--lws` off = byte-identical.** New Link parts ride the existing `if (lwsEnabled && resourceUrl)`
  block; the `/lws-storage` route registers only under `lwsEnabled`. Negative-control tests required.
- **KEEP the no-oracle disposition:** `/:pod/lws-storage` 404-unmarked vs 401-private stays exactly
  as is (FOLLOWUP "Explicit non-fixes"). Do NOT reconcile, do NOT add `WWW-Authenticate` (that is
  round 4, the authorization-server track — out of scope here).
- **"ServerIndex" is a JSS concept, not an LWS-spec object** — the requirement that covers it is the
  blanket all-GET/HEAD ETag clause, nothing storage-description-specific.
- Fork branch: `la3d/lws-conformance` off `la3d/lws` @ `7de911d`. Merge `--no-ff` when green. Never
  force-push. Full fork suite (`npm test`, ~1673 tests) must stay green.
- Commits: `[Agent: Claude] type(scope): subject` + `Co-Authored-By: Claude Opus 4.8
  <noreply@anthropic.com>`. Stage specific files only.
- fastai style: brevity, comments only for *why*, match surrounding code.
- Live-gate gotcha: anon rate limit (~60/min) — space back-to-back live gates ~40s.

---

### Task 1: Pinned requirement matrix (lws-pod)

**Files:**
- Create: `docs/superpowers/specs/2026-07-18-lws-core-requirement-matrix.md`

**Interfaces:**
- Produces: the normative row list Tasks 2–5 gate against, and the input round 5 (conformance
  ledger) will rewrite `docs/foundations/05-jss-spec-conformance.md` from.

- [ ] **Step 1: Write the matrix document**

Content (verbatim quotes are from the pinned skill sources; verify each against the file before
writing — paths relative to `.claude/skills/lws-protocol/references/lws10-core/`):

```markdown
# LWS core requirement matrix — Discovery + Read Resource (round 1 scope)

Pinned normative rows for the 2026-07-18 resource-server conformance closeout. Quotes verbatim
from `.claude/skills/lws-protocol/references/lws10-core/`. Status column = live state on fork
`7de911d` before this round; every MISSING row gets a gate + fix in this round; deferred rows say
so explicitly.

| # | Requirement (verbatim source) | Source | Surface | Status @7de911d |
|---|---|---|---|---|
| R1 | "All responses MUST integrate with metadata as defined in Section 8.1, including Link headers for key relations such as `rel=\"linkset\"`, `rel=\"up\"`, and `rel=\"type\"`." | Operations/read-resource.md L9 | every `--lws` GET/HEAD | `linkset` ✅ · `up`/`type` MISSING (header) |
| R2 | "**Containment**: Servers MUST include a Link header with `rel=\"up\"` pointing to the parent container for any non-root resource." | Operations/metadata.md L22 | every non-root resource | MISSING on data resources; container lws+json arm only |
| R3 | "Responses MUST include an ETag header for concurrency control and caching." / "ETags MUST be provided in all GET/HEAD responses" | Operations/read-resource.md L12, L89 | ALL GET/HEAD incl. generated docs (`/:pod/lws-storage`, `/.well-known/lws-storage`, `/types/index`, `/types/search` GET) | ordinary resources ✅ · generated docs MISSING |
| R4 | "Servers MUST support conditional requests via If-None-Match (with ETags) or If-Modified-Since headers. If the resource or container listing has not changed, respond with 304 Not Modified" | Operations/read-resource.md L89 | same as R3 | ordinary ✅ · generated docs MISSING |
| R5 | "A server MUST include an Etag header in its responses to GET and HEAD requests for a linkset resource." | Operations/update-resource.md L45 | `Accept: application/linkset+json` GET/HEAD | believed ✅ (variant key `ls`) — LOCK with a gate |
| R6 | Storage discovery: every resource response carries `Link rel="https://www.w3.org/ns/lws#storageDescription"` to its owning storage description | Discovery.html | root-pod deployments | ✅ named pods · BROKEN root-pod (`storageRootFor` has no `/` fallback → points at ServerIndex) |

Scope notes (calibrations from the verified 2026-07-18 review, FOLLOWUP top block):
- "ServerIndex" is JSS's well-known surface, not an LWS-spec object. Its ETag obligation comes
  from R3's blanket clause only.
- `rel="type"` sits under R1's "such as" umbrella (illustrative list); `rel="up"` has its own
  standalone MUST (R2). We emit both, derived identically to the linkset body
  (`parentContainerUrl` / `lws#DataResource`-vs-`lws#Container`).
- `/.well-known/void` is a 303 redirect, not a representation — no ETag obligation.
- `WWW-Authenticate` / `/.well-known/lws-configuration` (Authorization.html) = round 4, NOT here.
- Per-storage VoID/type-index/search *scoping* = round 2, NOT here (R3/R4 only add ETags to the
  existing server-scoped surfaces; they do not re-scope them).
- Storage-root `up`: linkset body already emits `up` for a storage root (→ origin `/`); the header
  mirrors the linkset for parity. metadata.md requires `up` only for non-root resources; emitting
  it on the storage root too is benign surplus, recorded here deliberately.
```

- [ ] **Step 2: Verify every quote against the pinned skill files**

Run (from lws-pod root):
```bash
grep -n 'rel="up"' .claude/skills/lws-protocol/references/lws10-core/Operations/read-resource.md .claude/skills/lws-protocol/references/lws10-core/Operations/metadata.md
grep -n 'ETag' .claude/skills/lws-protocol/references/lws10-core/Operations/read-resource.md | head
grep -n 'Etag header' .claude/skills/lws-protocol/references/lws10-core/Operations/update-resource.md
```
Expected: each quoted sentence found verbatim (adjust line refs in the matrix if they differ).

- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/specs/2026-07-18-lws-core-requirement-matrix.md
git commit -m "$(cat <<'EOF'
[Agent: Claude] docs(spec): pinned LWS-core requirement matrix (conformance round 1)

- R1-R6 normative rows w/ verbatim quotes + scope calibrations from the verified review

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Fork — `up` + LWS `type` Link headers on every `--lws` GET/HEAD

**Files:**
- Modify: `~/dev/git/LA3D/JavaScriptSolidServer/src/ldp/headers.js` (getAllHeaders, ~L151-174)
- Modify: `~/dev/git/LA3D/JavaScriptSolidServer/src/handlers/resource.js` (~L1060-1066: remove the
  now-duplicated manual `rel="up"` append in the lws+json container arm)
- Test: `~/dev/git/LA3D/JavaScriptSolidServer/test/lws-read-headers.test.js` (new)

**Interfaces:**
- Consumes: `parentContainerUrl(url)` from `src/utils/url.js` (returns parent URL string or null
  at/above origin root) — the SAME helper `generateLinkset` uses for the body's `up`.
- Produces: every `getAllHeaders({lwsEnabled: true, resourceUrl, isContainer})` result's `Link`
  now contains `<parent>; rel="up"` (when non-root) and
  `<https://www.w3.org/ns/lws#DataResource|Container>; rel="type"`. Tasks 7's live gate asserts
  these strings.

- [ ] **Step 0: Create the branch**

```bash
cd ~/dev/git/LA3D/JavaScriptSolidServer
git checkout la3d/lws && git checkout -b la3d/lws-conformance
```

- [ ] **Step 1: Write the failing test**

`test/lws-read-headers.test.js` — unit-level against `getAllHeaders` (fast, no server) plus one
integration case via the test server for the GET/HEAD wire check:

```js
// R1/R2 (matrix 2026-07-18): every --lws GET/HEAD response Link header carries
// rel="up" (non-root) + rel="type" -> lws#DataResource|Container, derived by the
// SAME helpers as the linkset body (header parity). --lws off: byte-identical.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { getAllHeaders } from '../src/ldp/headers.js';
import { startTestServer, stopTestServer, createPod } from './helpers.js';

const LWS = 'https://www.w3.org/ns/lws#';

test('getAllHeaders --lws: data resource gets up + lws type links', () => {
  const h = getAllHeaders({ isContainer: false, lwsEnabled: true, resourceUrl: 'http://x/alice/notes/a.md' });
  assert.match(h.Link, /<http:\/\/x\/alice\/notes\/>; rel="up"/);
  assert.match(h.Link, new RegExp(`<${LWS}DataResource>; rel="type"`));
  assert.match(h.Link, /<http:\/\/www\.w3\.org\/ns\/ldp#Resource>; rel="type"/); // LDP types preserved
});

test('getAllHeaders --lws: container gets up + lws Container type', () => {
  const h = getAllHeaders({ isContainer: true, lwsEnabled: true, resourceUrl: 'http://x/alice/notes/' });
  assert.match(h.Link, /<http:\/\/x\/alice\/>; rel="up"/);
  assert.match(h.Link, new RegExp(`<${LWS}Container>; rel="type"`));
});

test('getAllHeaders --lws: origin root has no up link', () => {
  const h = getAllHeaders({ isContainer: true, lwsEnabled: true, resourceUrl: 'http://x/' });
  assert.doesNotMatch(h.Link, /rel="up"/);
});

test('getAllHeaders without --lws: no up, no lws type (byte-identical control)', () => {
  const h = getAllHeaders({ isContainer: false, lwsEnabled: false, resourceUrl: 'http://x/alice/a.md' });
  assert.doesNotMatch(h.Link, /rel="up"/);
  assert.doesNotMatch(h.Link, new RegExp(LWS.replace(/[/#]/g, '\\$&')));
});
```

Then a wire-level GET/HEAD parity block in the same file (adapt pod-creation to `helpers.js`
conventions — see `test/head-conneg.test.js` for the closest existing pattern):

```js
// GET vs HEAD Link parity on the wire (handleHead mirrors by duplication — lock it).
let baseUrl;
before(async () => { ({ baseUrl } = await startTestServer({ lws: true })); /* + create pod/resource per helpers.js */ });
after(async () => { await stopTestServer(); });

test('GET and HEAD emit identical Link header incl. up/type', async () => {
  const url = `${baseUrl}/testpod/hello.txt`;   // adjust to the pod fixture used above
  const g = await fetch(url);
  const h = await fetch(url, { method: 'HEAD' });
  assert.equal(h.headers.get('link'), g.headers.get('link'));
  assert.match(g.headers.get('link'), /rel="up"/);
  assert.match(g.headers.get('link'), new RegExp(`<${LWS}DataResource>; rel="type"`));
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
node --test --test-force-exit test/lws-read-headers.test.js
```
Expected: FAIL — no `rel="up"` / no `lws#DataResource` in Link.

- [ ] **Step 3: Implement in getAllHeaders**

`src/ldp/headers.js` — add the import and extend the existing `lwsEnabled` block:

```js
import { parentContainerUrl } from '../utils/url.js';
// (top of file, near LWS_STORAGE_DESC_REL)
const LWS_NS = 'https://www.w3.org/ns/lws#';
```

Inside `getAllHeaders`, replace the current `if (lwsEnabled && resourceUrl)` block's `parts` with:

```js
  if (lwsEnabled && resourceUrl) {
    // R1/R2: up + type in the HTTP Link header, derived by the SAME helpers as
    // the linkset body (parentContainerUrl / Container-vs-DataResource) so the
    // two surfaces can never disagree.
    const parts = [
      `<${LWS_NS}${isContainer ? 'Container' : 'DataResource'}>; rel="type"`,
      `<${storageDescriptionUrl(resourceUrl, storageRootPath)}>; rel="${LWS_STORAGE_DESC_REL}"`,
      `<${resourceUrl}>; rel="linkset"; type="application/linkset+json"`
    ];
    const parent = parentContainerUrl(resourceUrl);
    if (parent) parts.unshift(`<${parent}>; rel="up"`);
    const extra = parts.join(', ');
    headers['Link'] = headers['Link'] ? `${headers['Link']}, ${extra}` : extra;
  }
```

- [ ] **Step 4: Remove the now-duplicated manual up-append**

`src/handlers/resource.js` ~L1060-1066 (lws+json container arm) — delete:

```js
      const parent = parentContainerUrl(resourceUrl);
      if (parent) {
        headers['Link'] = headers['Link']
          ? `${headers['Link']}, <${parent}>; rel="up"`
          : `<${parent}>; rel="up"`;
      }
```

(`getAllHeaders` now emits it for that branch too. If `parentContainerUrl` becomes unused in
resource.js after this, leave the import — the linkset arms at ~L1078/L1525 still use it.)

- [ ] **Step 5: Run the new tests + targeted neighbors**

```bash
node --test --test-force-exit test/lws-read-headers.test.js test/head-conneg.test.js test/conneg.test.js test/container.test.js
```
Expected: PASS. If existing tests assert exact full Link strings, update them to include the new
`up`/`type` parts (they are conformance-required — the tests were locking the gap).

- [ ] **Step 6: Full fork suite**

```bash
npm test
```
Expected: green (~1673 pass, 1 known skip). Fix any Link-string assertions the sweep surfaces.

- [ ] **Step 7: Commit**

```bash
git add src/ldp/headers.js src/handlers/resource.js test/lws-read-headers.test.js
# plus any test files whose Link assertions were updated — stage them explicitly by name
git commit -m "$(cat <<'EOF'
[Agent: Claude] feat(lws): R1/R2 up + lws type Link headers on every --lws GET/HEAD

- getAllHeaders emits rel="up" (parentContainerUrl) + rel="type" lws#DataResource|Container
- same helpers as the linkset body: header/body parity by construction
- lws+json container arm's manual up-append removed (now duplicated)
- --lws off byte-identical (negative control test)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Fork — ETag + 304 + Vary on the two storage-description routes

**Files:**
- Modify: `~/dev/git/LA3D/JavaScriptSolidServer/src/utils/conditional.js` (add shared helper)
- Modify: `~/dev/git/LA3D/JavaScriptSolidServer/src/server.js` (`/.well-known/lws-storage` route
  ~L1131-1143; `/:pod/lws-storage` route ~L1166-1191)
- Test: `~/dev/git/LA3D/JavaScriptSolidServer/test/lws-storage-etag.test.js` (new)

**Interfaces:**
- Consumes: `checkIfNoneMatchForGet(header, etag)` from `src/utils/conditional.js` (returns
  `{ok:true}` or `{ok:false, notModified:true}`); `buildServerIndex` / `buildStorageDescriptionFor`
  from `src/lws/storage-description.js`.
- Produces: `sendJsonWithEtag(request, reply, body)` exported from `src/utils/conditional.js` —
  sets `ETag` (md5 of `JSON.stringify(body)`, strong) + `Vary: Accept, Authorization`, answers
  If-None-Match with 304 (ETag still present per RFC 9110), else returns the body for Fastify to
  serialize. Task 4 reuses it.

- [ ] **Step 1: Write the failing test**

`test/lws-storage-etag.test.js`:

```js
// R3/R4 (matrix 2026-07-18): generated LWS documents are GET/HEAD responses too —
// blanket "ETags MUST be provided in all GET/HEAD responses" + If-None-Match 304.
// Bodies are requester-dependent (WAC-filtered roster / 401-gated description),
// hence Vary: Authorization; media-type label conneg hence Vary: Accept.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startTestServer, stopTestServer /* + pod fixture helpers per helpers.js */ } from './helpers.js';

let baseUrl;
before(async () => { ({ baseUrl } = await startTestServer({ lws: true })); /* create pod 'testpod' */ });
after(async () => { await stopTestServer(); });

test('/.well-known/lws-storage: ETag + 304 + Vary', async () => {
  const r1 = await fetch(`${baseUrl}/.well-known/lws-storage`);
  assert.equal(r1.status, 200);
  const etag = r1.headers.get('etag');
  assert.ok(etag, 'ETag present');
  assert.match(r1.headers.get('vary') || '', /Authorization/);
  const r2 = await fetch(`${baseUrl}/.well-known/lws-storage`, { headers: { 'If-None-Match': etag } });
  assert.equal(r2.status, 304);
  assert.equal(r2.headers.get('etag'), etag);   // 304 carries the ETag (RFC 9110)
});

test('/:pod/lws-storage: ETag + 304; HEAD shares headers', async () => {
  const r1 = await fetch(`${baseUrl}/testpod/lws-storage`);
  assert.equal(r1.status, 200);
  const etag = r1.headers.get('etag');
  assert.ok(etag);
  const r304 = await fetch(`${baseUrl}/testpod/lws-storage`, { headers: { 'If-None-Match': etag } });
  assert.equal(r304.status, 304);
  const h = await fetch(`${baseUrl}/testpod/lws-storage`, { method: 'HEAD' });
  assert.equal(h.headers.get('etag'), etag);    // Fastify auto-HEAD runs the GET handler
});

test('mismatched If-None-Match still 200', async () => {
  const r = await fetch(`${baseUrl}/testpod/lws-storage`, { headers: { 'If-None-Match': '"nope"' } });
  assert.equal(r.status, 200);
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
node --test --test-force-exit test/lws-storage-etag.test.js
```
Expected: FAIL — no ETag header.

- [ ] **Step 3: Add the shared helper**

`src/utils/conditional.js` (bottom):

```js
import { createHash } from 'node:crypto';

/**
 * ETag + If-None-Match/304 for server-GENERATED JSON documents (R3/R4:
 * "ETags MUST be provided in all GET/HEAD responses"). Strong md5-of-body
 * ETag: the body already encodes every input that varies it (requester
 * visibility included), so hashing the serialization IS the variant key.
 * Vary: Authorization because bodies are requester-dependent; Accept for
 * the lws+json/ld+json/json label conneg.
 */
export function sendJsonWithEtag(request, reply, body) {
  const etag = `"${createHash('md5').update(JSON.stringify(body)).digest('hex')}"`;
  reply.header('ETag', etag);
  reply.header('Vary', 'Accept, Authorization');
  const cond = checkIfNoneMatchForGet(request.headers['if-none-match'], etag);
  if (!cond.ok && cond.notModified) return reply.code(304).send();
  return body;
}
```

- [ ] **Step 4: Wire both routes**

`src/server.js` — import `sendJsonWithEtag` (extend the existing `./utils/conditional.js` import
if present, else add one). Well-known route: replace the final `return buildServerIndex(...)` with:

```js
      const body = buildServerIndex(origin, roots.map((root) => ({ root })));
      return sendJsonWithEtag(request, reply, body);
```

Per-storage route: replace the final `return buildStorageDescriptionFor(...)` with:

```js
      const body = buildStorageDescriptionFor(`${origin}${root}`, {
        typeIndexEnabled, notificationsEnabled: request.notificationsEnabled,
        profileIndexPath, voidPath, profileConnegEnabled, referentResolutionEnabled,
        uriSpacePrefixes, mcpEnabled, anonRateLimitMax,
      });
      return sendJsonWithEtag(request, reply, body);
```

Keep both routes' existing `Cache-Control` and `reply.type(...)` lines untouched. The 401/404 arms
stay exactly as they are (no-oracle KEEP).

- [ ] **Step 5: Run tests**

```bash
node --test --test-force-exit test/lws-storage-etag.test.js test/conditional.test.js
```
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/utils/conditional.js src/server.js test/lws-storage-etag.test.js
git commit -m "$(cat <<'EOF'
[Agent: Claude] feat(lws): R3/R4 ETag + If-None-Match 304 + Vary on storage-description routes

- sendJsonWithEtag helper (md5-of-body strong ETag; body already encodes requester visibility)
- /.well-known/lws-storage + /:pod/lws-storage; Cache-Control + label conneg unchanged
- no-oracle 404-unmarked/401-private disposition untouched

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Fork — special-surface audit gates (linkset lock + /types ETags)

**Files:**
- Modify: type index/search handlers (locate: `grep -rn 'handleTypeIndex\|handleTypeSearch' src/`)
  — GET responses only
- Test: `~/dev/git/LA3D/JavaScriptSolidServer/test/lws-special-etag.test.js` (new)

**Interfaces:**
- Consumes: `sendJsonWithEtag(request, reply, body)` from Task 3.
- Produces: every remaining `--lws` GET surface answers with an ETag; the linkset R5 lock.

- [ ] **Step 1: Write the gates (some may already pass — they are conformance LOCKS)**

`test/lws-special-etag.test.js`:

```js
// R3/R5 sweep for the remaining generated GET surfaces. The linkset gate (R5:
// update-resource.md L45 MUST) is expected to pass already (variant key 'ls') —
// it LOCKS existing behavior; the /types gates drive new ETags.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startTestServer, stopTestServer /* + pod fixture per helpers.js */ } from './helpers.js';

let baseUrl;
before(async () => { ({ baseUrl } = await startTestServer({ lws: true, typeIndex: true })); /* pod 'testpod' + one resource */ });
after(async () => { await stopTestServer(); });

test('linkset GET carries an ETag distinct from the base representation (R5 lock)', async () => {
  const url = `${baseUrl}/testpod/hello.txt`;
  const base = await fetch(url);
  const ls = await fetch(url, { headers: { Accept: 'application/linkset+json' } });
  assert.ok(ls.headers.get('etag'), 'linkset ETag present');
  assert.notEqual(ls.headers.get('etag'), base.headers.get('etag'));
  const lsHead = await fetch(url, { method: 'HEAD', headers: { Accept: 'application/linkset+json' } });
  assert.equal(lsHead.headers.get('etag'), ls.headers.get('etag'));
});

test('/types/index GET: ETag + 304', async () => {
  const r1 = await fetch(`${baseUrl}/types/index`);
  assert.equal(r1.status, 200);
  const etag = r1.headers.get('etag');
  assert.ok(etag);
  const r2 = await fetch(`${baseUrl}/types/index`, { headers: { 'If-None-Match': etag } });
  assert.equal(r2.status, 304);
});

test('/types/search GET: ETag present; POST unaffected', async () => {
  const r = await fetch(`${baseUrl}/types/search?type=${encodeURIComponent('https://www.w3.org/ns/lws#DataResource')}`);
  assert.equal(r.status, 200);
  assert.ok(r.headers.get('etag'));
});
```

(Adjust the search query param to the handler's actual parameter name — read the handler first.)

- [ ] **Step 2: Run — record which fail**

```bash
node --test --test-force-exit test/lws-special-etag.test.js
```
Expected: linkset lock PASS (if it FAILS, that is a real R5 gap — fix via the existing
`variantEtag(etag, 'ls')` path in `src/handlers/resource.js`, do not invent a new mechanism);
`/types` gates FAIL (no ETag).

- [ ] **Step 3: Wire the /types GET handlers**

In the located handlers, wrap the final successful JSON reply for **GET only** with
`sendJsonWithEtag(request, reply, body)` (POST `/types/search` untouched). Preserve existing
status codes, rate-limit config, and per-resource WAC filtering exactly.

- [ ] **Step 4: Run tests + neighbors, then full suite**

```bash
node --test --test-force-exit test/lws-special-etag.test.js test/typeindex*.test.js
npm test
```
Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add test/lws-special-etag.test.js <handler files touched>
git commit -m "$(cat <<'EOF'
[Agent: Claude] feat(lws): R3/R5 ETags on /types GET surfaces + linkset ETag lock

- /types/index + /types/search GET via sendJsonWithEtag (POST untouched)
- R5 linkset variant-ETag behavior locked by gate

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Fork — root-pod `storageRootFor('/')` fallback + `/lws-storage` route

**Files:**
- Modify: `~/dev/git/LA3D/JavaScriptSolidServer/src/lws/storage-resolver.js`
- Modify: `~/dev/git/LA3D/JavaScriptSolidServer/src/server.js` (new route next to
  `/:pod/lws-storage`, ~L1191)
- Test: `~/dev/git/LA3D/JavaScriptSolidServer/test/lws-root-pod.test.js` (new)

**Interfaces:**
- Consumes: `readDeclaredTypes`/`LWS_STORAGE` marker (already written at `/` by
  `createRootPodStructure` — the marker exists; only the resolver never reads it);
  `storageDescriptionUrl(resourceUrl, '/')` → `{origin}/lws-storage` (already correct);
  `handleGet` for the unmarked-root delegation.
- Produces: `storageRootFor(storage, path)` returns `'/'` for any path when `/` carries the
  storage marker and no named-pod candidate matched; `GET /lws-storage` serves the root storage
  description in root-pod mode and falls through to `handleGet` otherwise.

- [ ] **Step 1: Write the failing tests**

`test/lws-root-pod.test.js`:

```js
// R6 (matrix 2026-07-18): root-pod deployments — the '/' marker is written by
// createRootPodStructure but storageRootFor never read it, so root-pod resources
// pointed their storageDescription at the (empty) ServerIndex and referent 303s
// were dead. Fallback: named-pod candidate first (unchanged), then '/'.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { storageRootFor, clearStorageRootCache } from '../src/lws/storage-resolver.js';

function fakeStorage(markedRoots) {   // minimal storage stub for readDeclaredTypes
  // adapt to readDeclaredTypes' actual storage calls (read of `${root}.lwstypes`):
  return {
    exists: async (p) => markedRoots.some((r) => p === `${r}.lwstypes`),
    read: async (p) => {
      const r = markedRoots.find((r) => p === `${r}.lwstypes`);
      if (!r) throw new Error('ENOENT');
      return JSON.stringify({ types: ['https://www.w3.org/ns/lws#Storage'] });
    },
  };
}

test('named-pod candidate still wins (unchanged behavior)', async () => {
  clearStorageRootCache();
  assert.equal(await storageRootFor(fakeStorage(['/alice/']), '/alice/notes/a.md'), '/alice/');
});

test('root-marked storage resolves any path to /', async () => {
  clearStorageRootCache();
  const s = fakeStorage(['/']);
  assert.equal(await storageRootFor(s, '/notes/a.md'), '/');
  assert.equal(await storageRootFor(s, '/'), '/');
});

test('unmarked stays null (named-pod rig unchanged)', async () => {
  clearStorageRootCache();
  assert.equal(await storageRootFor(fakeStorage(['/alice/']), '/stray.md'), null);
  assert.equal(await storageRootFor(fakeStorage(['/alice/']), '/'), null);
});

test('.well-known stays server-scope even when / is marked', async () => {
  clearStorageRootCache();
  assert.equal(await storageRootFor(fakeStorage(['/']), '/.well-known/lws-storage'), null);
});
```

(Adapt `fakeStorage` to `readDeclaredTypes`' real storage-interface calls — read
`src/lws/type-metadata.js` first. If stubbing is awkward, use a real temp-dir storage via
`test/helpers.js` instead; behavior assertions stay identical.)

Plus a wire test in the same file: boot a root-pod test server (whatever `helpers.js` offers for
root-pod provisioning — check how `createRootPodStructure` is exercised in existing tests), then:

```js
test('root-pod: resource Link points at /lws-storage; route serves the description', async () => {
  const r = await fetch(`${baseUrl}/hello.txt`);
  assert.match(r.headers.get('link'), /<[^>]*\/lws-storage>; rel="https:\/\/www\.w3\.org\/ns\/lws#storageDescription"/);
  const sd = await fetch(`${baseUrl}/lws-storage`, { headers: { Accept: 'application/lws+json' } });
  assert.equal(sd.status, 200);
  const body = await sd.json();
  assert.equal(body.type, 'Storage');
  assert.ok(sd.headers.get('etag'));           // R3 applies here too (sendJsonWithEtag)
});

test('named-pod mode: GET /lws-storage falls through to LDP (no shadowing)', async () => {
  // on a NAMED-pod server (/ unmarked): /lws-storage is an ordinary 404/resource path
  const r = await fetch(`${namedPodBaseUrl}/lws-storage`);
  assert.notEqual(r.headers.get('content-type'), 'application/lws+json');
});
```

- [ ] **Step 2: Run to verify the new behavior fails**

```bash
node --test --test-force-exit test/lws-root-pod.test.js
```
Expected: FAIL — `storageRootFor` returns null for root-marked paths; `/lws-storage` 404s.

- [ ] **Step 3: Implement the resolver fallback**

`src/lws/storage-resolver.js` — replace `storageRootFor`:

```js
export async function storageRootFor(storage, urlPath) {
  if (!urlPath) return null;
  const segs = urlPath.split('/').filter(Boolean);
  if (segs[0] === '.well-known') return null;
  if (segs.length) {
    const candidate = `/${segs[0]}/`;
    if (await isStorageRoot(storage, candidate)) return candidate;
  }
  // Root-pod fallback (R6): a single-user deployment marks '/' itself
  // (createRootPodStructure) — without this, root-pod resources point their
  // storageDescription at the empty ServerIndex and referent 303s never arm.
  return (await isStorageRoot(storage, '/')) ? '/' : null;
}
```

- [ ] **Step 4: Add the root route**

`src/server.js`, directly after the `/:pod/lws-storage` registrations (~L1194) — same
`lwsEnabled` block:

```js
    // Root-pod storage description (R6): storageDescriptionUrl(url, '/') yields
    // {origin}/lws-storage, which /:pod/lws-storage can't match (pod=""). When
    // '/' is unmarked (named-pod mode) fall through to LDP so an ordinary
    // resource named /lws-storage is not shadowed.
    fastify.get('/lws-storage', async (request, reply) => {
      if ((await storageRootFor(storage, '/')) !== '/') return handleGet(request, reply);
      const origin = `${request.protocol}://${request.hostname}`;
      const { webId } = await getWebIdFromRequestAsync(request).catch(() => ({ webId: null }));
      const { allowed } = await checkAccess({
        resourceUrl: `${origin}/`, resourcePath: '/', isContainer: true,
        agentWebId: webId, requiredMode: AccessMode.READ,
      });
      if (!allowed) return reply.code(401).send();
      reply.header('Cache-Control', 'public, max-age=3600');
      reply.type(storageDescriptionContentType(request.headers.accept));
      const { profileIndexPath, voidPath, referentResolutionEnabled, uriSpacePrefixes } =
        await resolveStorageDescriptionInputs(request.podConfigFor('/'), origin, request.lwsEnabled);
      const body = buildStorageDescriptionFor(`${origin}/`, {
        typeIndexEnabled, notificationsEnabled: request.notificationsEnabled,
        profileIndexPath, voidPath, profileConnegEnabled, referentResolutionEnabled,
        uriSpacePrefixes, mcpEnabled, anonRateLimitMax,
      });
      return sendJsonWithEtag(request, reply, body);
    });
```

(Verify `request.podConfigFor('/')` handles the root path — read its definition in the preHandler
first; if it is keyed to named roots only, extend it the same way the resolver was.)

Check whether `listVisibleStorageRoots` includes a marked `/` in the ServerIndex roster; if not,
add it (WAC-filtered like the rest) so root-pod discovery is coherent end-to-end.

- [ ] **Step 5: Run new tests, then the full suite**

```bash
node --test --test-force-exit test/lws-root-pod.test.js
npm test
```
Expected: all green. Watch specifically for multi-tenant and referent tests — the fallback must
not change ANY named-pod behavior (only paths where `/` itself carries the marker).

- [ ] **Step 6: Commit**

```bash
git add src/lws/storage-resolver.js src/server.js test/lws-root-pod.test.js
git commit -m "$(cat <<'EOF'
[Agent: Claude] feat(lws): R6 root-pod storage resolution + GET /lws-storage

- storageRootFor falls back to the '/' marker after the named-pod candidate
- /lws-storage serves the root storage description; unmarked mode falls through to LDP
- named-pod behavior unchanged (negative controls)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Fork — merge + push

**Files:** none (git only)

- [ ] **Step 1: Full suite one last time on the branch**

```bash
cd ~/dev/git/LA3D/JavaScriptSolidServer && npm test
```
Expected: green.

- [ ] **Step 2: Merge --no-ff into la3d/lws and push**

```bash
git checkout la3d/lws
git merge --no-ff la3d/lws-conformance -m "$(cat <<'EOF'
[Agent: Claude] merge: LWS resource-server conformance round (R1-R6)

- up/type Link headers on every --lws GET/HEAD (header/linkset parity)
- ETag + 304 + Vary on storage-description, /types GET, linkset lock
- root-pod storageRootFor fallback + /lws-storage route

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
git push origin la3d/lws
git rev-parse --short HEAD   # record MERGE_SHA for Task 7
```

---

### Task 7: lws-pod — live gate + repin + full sweep

**Files:**
- Create: `tests/lws-conformance.test.mjs`
- Modify: `Makefile` (new `test-conformance` target + .PHONY)
- Modify: `Dockerfile.fork` (L22: `ARG JSS_GIT_REF=<MERGE_SHA full 40-char>`)

**Interfaces:**
- Consumes: `BASE`, `ensurePod`, `getToken` from `tests/helpers.mjs` (same as
  `tests/lws-conneg.test.mjs`); MERGE_SHA from Task 6.

- [ ] **Step 1: Write the live gate**

`tests/lws-conformance.test.mjs`:

```js
import { describe, it, expect } from 'vitest'
import { BASE } from './helpers.mjs'

// LWS-core conformance live gate (round 1, matrix 2026-07-18 R1-R4): up/type
// Link headers, GET/HEAD parity, generated-doc ETag + 304. Runs against the
// up-fork-tls rig (alice public / bob private). Self-skips on a non-lws pod.
const probe = await fetch(`${BASE}/alice/lws-storage`).then(r => r.ok).catch(() => false)
const LWS = 'https://www.w3.org/ns/lws#'

describe.skipIf(!probe)('LWS resource-server conformance', () => {
  it('R1/R2: data resource GET Link carries up + lws type (LDP types preserved)', async () => {
    const r = await fetch(`${BASE}/alice/wiki/a.md`)
    const link = r.headers.get('link') || ''
    expect(link).toContain(`<${BASE}/alice/wiki/>; rel="up"`)
    expect(link).toContain(`<${LWS}DataResource>; rel="type"`)
    expect(link).toContain('<http://www.w3.org/ns/ldp#Resource>; rel="type"')
    expect(link).toContain('rel="linkset"')
  })

  it('R1: HEAD Link identical to GET', async () => {
    const g = await fetch(`${BASE}/alice/wiki/a.md`)
    const h = await fetch(`${BASE}/alice/wiki/a.md`, { method: 'HEAD' })
    expect(h.headers.get('link')).toBe(g.headers.get('link'))
  })

  it('R1/R2: container GET Link carries up + lws Container type', async () => {
    const r = await fetch(`${BASE}/alice/wiki/`, { headers: { Accept: 'application/lws+json' } })
    const link = r.headers.get('link') || ''
    expect(link).toContain(`<${BASE}/alice/>; rel="up"`)
    expect(link).toContain(`<${LWS}Container>; rel="type"`)
  })

  it('R3/R4: per-storage description ETag + 304', async () => {
    const r1 = await fetch(`${BASE}/alice/lws-storage`)
    const etag = r1.headers.get('etag')
    expect(etag).toBeTruthy()
    const r2 = await fetch(`${BASE}/alice/lws-storage`, { headers: { 'If-None-Match': etag } })
    expect(r2.status).toBe(304)
  })

  it('R3/R4: ServerIndex well-known ETag + 304 + Vary Authorization', async () => {
    const r1 = await fetch(`${BASE}/.well-known/lws-storage`)
    const etag = r1.headers.get('etag')
    expect(etag).toBeTruthy()
    expect(r1.headers.get('vary') || '').toContain('Authorization')
    const r2 = await fetch(`${BASE}/.well-known/lws-storage`, { headers: { 'If-None-Match': etag } })
    expect(r2.status).toBe(304)
  })

  it('no-oracle KEEP: anon bob description still bare 401', async () => {
    const r = await fetch(`${BASE}/bob/lws-storage`)
    expect(r.status).toBe(401)
  })
})
```

- [ ] **Step 2: Makefile target**

Add `test-conformance` to the `.PHONY` line (Makefile L9) and, next to `test-referent` (~L179):

```make
# LWS-core conformance live gate (matrix 2026-07-18 R1-R4). Needs up-fork-tls.
test-conformance:
	@[ -f certs/rootCA.pem ] || { echo "run 'make cert && make up-fork-tls' first"; exit 1; }
	BASE=https://pod.vardeman.me NODE_EXTRA_CA_CERTS=$(CURDIR)/certs/rootCA.pem npx vitest run tests/lws-conformance.test.mjs
```

- [ ] **Step 3: Repin + rebuild the rig**

```bash
# Dockerfile.fork L22 -> ARG JSS_GIT_REF=<MERGE_SHA-full-40>
make down-fork-tls && make up-fork-tls
# wait healthy, then reseed if the volume was rebuilt:
make seed-multitenant
```

- [ ] **Step 4: Run the new gate, then the full live sweep**

```bash
make test-conformance
# full sweep (space gates ~40s apart — anon rate limit):
make test-conneg && sleep 40 && make test-referent && sleep 40 && make test-multitenant \
  && sleep 40 && make test-nextfork && sleep 40 && make test-wiki && sleep 40 && make test-viewer
```
Expected: all green. Any failure = fix in the fork (new branch commit, re-merge, re-pin) — do not
weaken gates.

- [ ] **Step 5: Commit**

```bash
git add tests/lws-conformance.test.mjs Makefile Dockerfile.fork
git commit -m "$(cat <<'EOF'
[Agent: Claude] feat+test(rig): repin fork <MERGE_SHA-short> + lws-core conformance live gate

- test-conformance: R1-R4 live (up/type Link, GET/HEAD parity, ETag+304, no-oracle KEEP)
- full live sweep green

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: lws-pod — FOLLOWUP round close-out

**Files:**
- Modify: `FOLLOWUP.md` (top block)

- [ ] **Step 1: Update the 2026-07-18 top block**

Mark order-of-work item 1 DONE with: merge sha, image tag, fork suite count, `test-conformance`
result, live-sweep result, and which matrix rows closed (R1-R6). Note what item 1 explicitly did
NOT do (round 2 scoping, round 3 PROF, round 4 auth). Update the header's NEXT pointer to item 2/3.

- [ ] **Step 2: Commit**

```bash
git add FOLLOWUP.md
git commit -m "$(cat <<'EOF'
[Agent: Claude] docs(followup): resource-server conformance round DONE (R1-R6 closed, live-verified)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Self-review notes

- Spec coverage: R1/R2 → Task 2; R3/R4 → Tasks 3-4; R5 → Task 4; R6 → Task 5; matrix itself →
  Task 1; live verification + repin → Task 7; record → Task 8. Round-1 FOLLOWUP items all covered;
  rounds 2-5 explicitly out of scope.
- Fixture code marked "adapt to helpers.js" is deliberate: the fork's pod-creation helpers must be
  read by the implementer (conventions vary per suite); the ASSERTIONS are exact and non-negotiable.
- Type consistency: `sendJsonWithEtag(request, reply, body)` defined in Task 3, consumed in Tasks
  4-5; `LWS_NS` local to headers.js; MERGE_SHA produced in Task 6, consumed in Task 7.
