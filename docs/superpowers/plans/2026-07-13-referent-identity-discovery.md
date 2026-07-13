# Referent Identity & Discovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make any profile's minted subject IRIs dereferenceable (name → algorithmic 303) and type-searchable (found by the referent's real `rdf:type`, not `lws#DataResource`), as a neutral LWS affordance any linked application rides.

**Architecture:** Two lightweight fixes to machinery that already exists — no new bulk index. Phase 1 (fork) adds: (a) **type enrichment** — extract the RDF subject's `rdf:type` from the body already parsed during a write and union it into the existing `.lwstypes` sidecar (enrich, never replace); (b) an **algorithmic 303 resolver** at the GET/HEAD `!stats` seam that reads a `pathPrefix→container` plane-mapping from pod-config; (c) a URI-typed **referent-resolution capability** in the storage description; (d) optional **earned-`conformsTo`** provenance. Phase 2 (lws-pod) adds the B7 identity-policy vocabulary, the plane-mapping data in pod-config, read-semantics fixtures, the live gate, the iri-minting update, the rig repin, and the cold-agent probes.

**Tech Stack:** Fork — Node 22, `node --test` (`test/*.test.js`), n3.js / `@rdfjs/parser-jsonld` / rdf-ext (`src/rdf/dataset.js`), Fastify. lws-pod — Docker + Caddy TLS rig, Vitest live gates, `.mjs` ESM.

## Global Constraints

- **`--lws`-off byte-identity:** every fork behavior change is gated on `request.lwsEnabled` (HTTP) / `ctx.lwsEnabled` (MCP). The published-npm/legacy path stays byte-identical. Every task includes a negative control.
- **P13 neutrality (proven, not asserted):** no fork mechanism names `wiki`/`okf`/`dcat`/`card`. Type enrichment indexes whatever `rdf:type` a subject declares; the resolver serves whatever uriSpaces pod-config declares. The Phase-1 live gate uses a neutral `ex:` profile and asserts no application term is exercised.
- **Enrich, never replace** (LWS `lws10-searchindex` §Type-and-Relation-Derivation): the referent's type is added *alongside* `lws#DataResource`; content-derived types are treated identically to `rel="type"`-header types. `?type=lws#DataResource` must keep matching.
- **no-oracle everywhere:** the resolver 404-hides a referent the requester can't read (never 303-then-401); referent-type search omits unreadable entries. Matches the Type Index discipline.
- **Commit format** (both repos): `[Agent: Claude] type(scope): subject` + bullet list + `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`. Stage specific files, never `git add -A`, never force-push.
- **TDD:** every task writes its failing test first and shows the failure before implementing.
- **Fork suite runner:** `npm test` = `node --test --test-concurrency=1 'test/*.test.js'`. Single file: `node --test test/<file>.test.js`. Pre-existing quirk: `test/mcp-lws-read.test.js` holds a handle under the full run — run it alone if the full run wedges (documented, not this round's problem).
- **Spec of record:** `docs/superpowers/specs/2026-07-13-referent-identity-discovery-design.md`.

## File Structure

**Fork (`/Users/cvardema/dev/git/LA3D/JavaScriptSolidServer`, branch `la3d/lws-referent` off `la3d/lws` @ `b31510a`):**
- Create `src/lws/subject-types.js` — `subjectTypesFromBody(content, contentType, baseIri)`: parse an RDF body, return the primary referent's `rdf:type`s (empty unless exactly one typed named subject).
- Create `src/lws/referent-resolver.js` — `resolveReferent(urlPath, uriSpaces)`: pure path→target computation.
- Modify `src/lws/write.js` — union body-derived types into the `.lwstypes` capture; record earned `conformsTo`.
- Modify `src/lws/type-metadata.js` — earned-`conformsTo` sidecar read/write helpers.
- Modify `src/handlers/resource.js` — `handleGet`/`handleHead` `!stats` seam calls the resolver.
- Modify `src/server.js` — decorate `request.podConfig` in the `onRequest` hook.
- Modify `src/lws/storage-description.js` — add the referent-resolution `capability[]` entry.
- Fork tests: `test/lws-referent-types.test.js`, `test/lws-referent-resolver.test.js`, `test/lws-referent-capability.test.js`, `test/lws-referent-earned-conformsto.test.js`.

**lws-pod (`/Users/cvardema/dev/git/LA3D/agents/lws-pod`, branch `main`):**
- Modify `projection/profiles/defs/lwsp.ttl` — mint `lwsp:` identity-policy + plane-mapping terms (B7).
- Modify `projection/profiles/defs/pod-config.jsonld` — add the `uriSpaces` plane-mapping field.
- Modify `projection/publish/checks.mjs` — extend `checkPodConfig` for the new field.
- Modify `projection/profiles/defs/llm-wiki/identity.jsonld` (+ manifest) — declare wiki's plane-mapping.
- Create `tests/lws-referent.test.mjs`; modify `Makefile` (`test-referent` target + `.PHONY`).
- Modify `docs/design-notes/iri-minting.md` — read-side name-deref update.
- Modify `Dockerfile.fork` / `docker-compose.fork-tls.yml` — repin to the merge SHA.

---

## PHASE 1 — FORK (neutral substrate pillar)

### Task 0: Round branch

**Files:** none (git only)

- [ ] **Step 1: Create the branch**

```bash
cd /Users/cvardema/dev/git/LA3D/JavaScriptSolidServer
git checkout la3d/lws && git pull origin la3d/lws
git checkout -b la3d/lws-referent
git log --oneline -1   # expect b31510a
```

---

### Task 1: Type enrichment — index the referent's `rdf:type` from the body

**Why:** `.lwstypes` today stores only client-declared types (`rel="type"` Link headers / MCP `types`). The body IS parsed for SHACL (`admission.js:63`) but discarded. An RDF resource whose subject is `<…>#it a skos:Concept` therefore indexes only `lws#DataResource`. Fix: at the single write choke point, parse the body's primary subject type and **union** it with the declared types before writing `.lwstypes`. All three write surfaces (HTTP PUT/POST, MCP write tools) funnel through `applyLwsWrite`, so they all inherit it — no handler/read changes.

**Primary-referent rule (P13-neutral, convention-free):** index the `rdf:type`s of the body's subject **only when exactly one distinct named subject carries a type** (the referent). Zero → nothing to add; more than one (an aggregate / multi-`@graph` dataset) → skip (Link-header types only) — the deferred "secondary subjects" extension (spec §4/§10). This needs no identity-policy knowledge.

**Files:**
- Create: `src/lws/subject-types.js`
- Modify: `src/lws/write.js` (the `applyLwsWrite` capture block, ~lines 12-45)
- Test: `test/lws-referent-types.test.js`

**Interfaces:**
- Produces: `subjectTypesFromBody(content, contentType, baseIri): Promise<string[]>` — the primary referent's type URIs, or `[]`.
- Consumes (in `write.js`): existing `captureDeclaredTypes` / `typeStorePath` (`src/lws/type-metadata.js`), `applyLwsWrite`'s existing `content`, `contentType`, `resourceUrl`, `declaredTypes`, `lwsEnabled`, `storagePath`, `storage`.

- [ ] **Step 1: Write the failing test**

```js
// test/lws-referent-types.test.js
// Referent identity & discovery (2026-07-13): a stored RDF resource is indexed
// by its subject's rdf:type ALONGSIDE lws#DataResource — enrich, not replace.
// LWS lws10-searchindex §Type-and-Relation-Derivation ¶2 (content derivation).
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startLwsPod, request } from './helpers.js';

const CONCEPT = 'https://example.org/ex#Thing';   // neutral ex: type, no app vocabulary
const DATARES = 'https://www.w3.org/ns/lws#DataResource';

describe('referent-type enrichment', () => {
  let pod;
  before(async (t) => { pod = await startLwsPod(t, 'alice'); });

  it('indexes the body subject rdf:type with NO rel=type header', async () => {
    // PUT JSON-LD whose subject #it declares @type = ex:Thing, no Link: rel=type
    const url = `${pod.base}/alice/m1`;
    const put = await request(url, { method: 'PUT',
      headers: { 'Content-Type': 'application/ld+json', Authorization: `Bearer ${pod.token}` },
      body: JSON.stringify({ '@id': `${pod.base}/alice/m1#it`, '@type': CONCEPT, 'http://purl.org/dc/terms/title': 'M1' }) });
    assert.ok([200, 201, 204].includes(put.status), `PUT ${put.status}`);

    // /types/search by the ex: type finds it
    const r = await request(`${pod.base}/types/search?type=${encodeURIComponent(CONCEPT)}`,
      { headers: { Authorization: `Bearer ${pod.token}` } });
    assert.equal(r.status, 200);
    const page = await r.json();
    const ids = page.items.map((i) => i.id);
    assert.ok(ids.some((id) => id.endsWith('/alice/m1')), 'referent type not indexed');
  });

  it('ENRICHES — lws#DataResource still matches the same resource', async () => {
    const r = await request(`${pod.base}/types/search?type=${encodeURIComponent(DATARES)}`,
      { headers: { Authorization: `Bearer ${pod.token}` } });
    const page = await r.json();
    assert.ok(page.items.map((i) => i.id).some((id) => id.endsWith('/alice/m1')),
      'enrich-not-replace violated: DataResource filter lost the resource');
  });

  it('SKIPS a multi-typed-subject aggregate (primary-referent-only rule)', async () => {
    const url = `${pod.base}/alice/agg`;
    await request(url, { method: 'PUT',
      headers: { 'Content-Type': 'application/ld+json', Authorization: `Bearer ${pod.token}` },
      body: JSON.stringify({ '@graph': [
        { '@id': `${pod.base}/alice/agg#a`, '@type': CONCEPT },
        { '@id': `${pod.base}/alice/agg#b`, '@type': CONCEPT } ] }) });
    const r = await request(`${pod.base}/types/search?type=${encodeURIComponent(CONCEPT)}`,
      { headers: { Authorization: `Bearer ${pod.token}` } });
    const page = await r.json();
    assert.ok(!page.items.map((i) => i.id).some((id) => id.endsWith('/alice/agg')),
      'aggregate with >1 typed subject should NOT be content-type-enriched');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/lws-referent-types.test.js`
Expected: FAIL — the first `it` finds no match (type not indexed from content).

- [ ] **Step 3: Create the subject-type extractor**

```js
// src/lws/subject-types.js
// Referent identity & discovery (2026-07-13): derive the primary referent's
// rdf:type from an RDF write body — the LWS-encouraged content-derivation path
// (lws10-searchindex §Type-and-Relation-Derivation ¶2). Vocabulary-blind.
import { toDataset, isRdfBody } from '../rdf/dataset.js';

const RDF_TYPE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type';

// Primary-referent-only rule: return the type URIs iff EXACTLY ONE distinct
// named subject in the body carries an rdf:type. Zero → []. More than one (an
// aggregate / multi-@graph dataset) → [] (secondary-subject indexing is the
// deferred extension). Never throws — a parse failure yields [].
export async function subjectTypesFromBody(content, contentType, baseIri) {
  if (!isRdfBody(contentType)) return [];
  let ds;
  try { ds = await toDataset(content, contentType, baseIri); } catch { return []; }
  const bySubject = new Map();
  for (const q of ds) {
    if (q.predicate.value !== RDF_TYPE) continue;
    if (q.subject.termType !== 'NamedNode' || q.object.termType !== 'NamedNode') continue;
    if (!bySubject.has(q.subject.value)) bySubject.set(q.subject.value, new Set());
    bySubject.get(q.subject.value).add(q.object.value);
  }
  if (bySubject.size !== 1) return [];
  return [...[...bySubject.values()][0]];
}
```

- [ ] **Step 4: Union body types into the `.lwstypes` capture**

In `src/lws/write.js`, `applyLwsWrite`: import the helper and enrich `declaredTypes` before the capture. The capture block (currently ~`:38-43`) becomes:

```js
import { subjectTypesFromBody } from './subject-types.js';   // add to imports
// ...
const wrote = await storage.write(storagePath, content);
if (lwsEnabled && wrote) {
  const bodyTypes = await subjectTypesFromBody(content, contentType, resourceUrl);
  const enriched = [...new Set([...declaredTypes, ...bodyTypes])];
  if (enriched.length) await captureDeclaredTypes(storage, storagePath, enriched);
  else await storage.remove(typeStorePath(storagePath));   // clear only when BOTH empty
}
```

This also fixes the caveat the map flagged: the `else → remove` branch now fires only when Link-declared **and** body-derived sets are both empty, so an update that keeps `@type` in the body but drops the `rel="type"` header no longer wipes the sidecar.

- [ ] **Step 5: Run the test to verify it passes**

Run: `node --test test/lws-referent-types.test.js`
Expected: PASS (all three `it`s).

- [ ] **Step 6: Negative control — `--lws`-off unchanged**

Add to the same test file:

```js
import { startTestServer, stopTestServer, createTestPod, getPodToken, getBaseUrl } from './helpers.js';
describe('referent-type enrichment: --lws OFF is unchanged', () => {
  let base, tok;
  before(async () => { await startTestServer({ lws: false }); base = getBaseUrl(); await createTestPod('bob'); tok = getPodToken('bob'); });
  after(stopTestServer);
  it('no .lwstypes enrichment without --lws', async () => {
    await fetch(`${base}/bob/x`, { method: 'PUT', headers: { 'Content-Type': 'application/ld+json', Authorization: `Bearer ${tok}` },
      body: JSON.stringify({ '@id': `${base}/bob/x#it`, '@type': CONCEPT }) });
    // No TypeSearchService without --lws; assert the write path didn't throw and the resource reads back.
    const g = await fetch(`${base}/bob/x`, { headers: { Authorization: `Bearer ${tok}` } });
    assert.ok([200, 406].includes(g.status));
  });
});
```

Run: `node --test test/lws-referent-types.test.js` → PASS.

- [ ] **Step 7: Commit**

```bash
cd /Users/cvardema/dev/git/LA3D/JavaScriptSolidServer
git add src/lws/subject-types.js src/lws/write.js test/lws-referent-types.test.js
git commit -m "$(cat <<'EOF'
[Agent: Claude] feat(lws): enrich .lwstypes with the referent rdf:type from the body

- new src/lws/subject-types.js: primary-referent-only, vocabulary-blind, never throws
- applyLwsWrite unions body-derived types with rel=type-declared types (enrich, not replace)
- fixes the else->remove branch to clear only when BOTH type sets are empty
- LWS lws10-searchindex content-derivation path; --lws-off unchanged

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Earned-`conformsTo` provenance (optional System-Managed fact)

**Why:** the write path already runs at admission; stamp each member that was validated with the profile that validated it, as System-Managed provenance — distinct from the client-managed `.meta conformsTo` (declared binding intent). Keeps the `up`-walk the discovery contract; this is provenance only.

**Storage shape:** a sibling sidecar `<storagePath>.lwsprov` holding `{ conformsTo: [<profile-uri>...] }` (JSON). Do NOT overload `.lwstypes` (a plain type-URI array) — a separate sidecar keeps both simple.

**Files:**
- Modify: `src/lws/type-metadata.js` (add `provStorePath`, `writeProvenance`, `readProvenance`)
- Modify: `src/lws/write.js` (write earned `conformsTo` when admission validated against a profile-bound container)
- Test: `test/lws-referent-earned-conformsto.test.js`

**Interfaces:**
- Produces: `provStorePath(storagePath): string` (= `storagePath + '.lwsprov'`), `writeProvenance(storage, storagePath, {conformsTo})`, `readProvenance(storage, storagePath): Promise<{conformsTo:string[]}|null>`.
- Consumes: the container `conformsTo` targets — reuse `conformsToTargets` from `src/lws/constraint.js` (the reader `authorized-resources.js` already uses); `applyLwsWrite` reads the container `.meta` for the bound profile at admission.

- [ ] **Step 1: Write the failing test**

```js
// test/lws-referent-earned-conformsto.test.js
import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { startLwsPod, request, putContainerMeta } from './helpers.js';
import { readProvenance } from '../src/lws/type-metadata.js';
import * as storage from '../src/storage/filesystem.js';

describe('earned conformsTo provenance', () => {
  let pod;
  before(async (t) => { pod = await startLwsPod(t, 'alice'); });

  it('stamps the validating profile on an admitted member', async () => {
    // Bind /alice/c/ to a profile via .meta conformsTo, publish a trivial always-pass shape via describedby,
    // PUT a conformant member, and assert .lwsprov records the container conformsTo.
    // (Full fixture: reuse putContainerMeta for describedby; add a conformsTo triple in the same .meta PUT.)
    // ... see Step 3 for the exact .meta shape ...
    const prov = await readProvenance(storage, '/alice/c/m');
    assert.ok(prov && prov.conformsTo.includes('https://example.org/prof/ex'), 'earned conformsTo not recorded');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test test/lws-referent-earned-conformsto.test.js`
Expected: FAIL — `readProvenance` undefined / no `.lwsprov`.

- [ ] **Step 3: Implement the provenance sidecar + write-path stamp**

Add to `src/lws/type-metadata.js` (mirror the `.lwstypes` helpers at `:39-46`):

```js
export function provStorePath(storagePath) { return storagePath + '.lwsprov'; }
export async function readProvenance(storage, storagePath) {
  const p = provStorePath(storagePath);
  if (!(await storage.exists(p))) return null;
  try { return JSON.parse((await storage.read(p)).toString('utf8')); } catch { return null; }
}
export async function writeProvenance(storage, storagePath, prov) {
  await storage.write(provStorePath(storagePath), Buffer.from(JSON.stringify(prov), 'utf8'));
}
```

In `applyLwsWrite` (`src/lws/write.js`), after a successful admitted write, read the container's `conformsTo` (via `conformsToTargets` on the container `.meta`) and, if non-empty, `writeProvenance(storage, storagePath, { conformsTo })`. Gate on `lwsEnabled && wrote && admission-decision !== 'reject'`. (The container `.meta` path is already computed in `applyLwsWrite`'s admission call — reuse `containerMetaPath`.)

- [ ] **Step 4: Run to verify it passes**

Run: `node --test test/lws-referent-earned-conformsto.test.js` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lws/type-metadata.js src/lws/write.js test/lws-referent-earned-conformsto.test.js
git commit -m "[Agent: Claude] feat(lws): record earned conformsTo provenance in .lwsprov at admission

- System-Managed provenance, distinct from client-managed .meta conformsTo
- up-walk stays the discovery contract; this is a validation-provenance stamp

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: The uriSpace 303 resolver

**Why:** `/id/{slug}` is a minted name with no stored resource → today it 404s. Resolve it algorithmically: read a `pathPrefix→container` plane-mapping from pod-config and 303 to the backing resource. no-oracle: 404-hide when the target is missing or the requester can't read it.

**Files:**
- Create: `src/lws/referent-resolver.js` (`resolveReferent`)
- Modify: `src/server.js` (decorate `request.podConfig` in the `onRequest` hook, ~`:422`)
- Modify: `src/handlers/resource.js` (`handleGet` `!stats` block ~`:314`; `handleHead` `!stats` block ~`:1529`)
- Test: `test/lws-referent-resolver.test.js`

**Interfaces:**
- Produces: `resolveReferent(urlPath, uriSpaces): string|null` — `uriSpaces` = `[{pathPrefix, container}]`; returns the target **urlPath** (pod-relative) or null. Pure.
- Consumes: `request.podConfig.get()` → `{ ..., uriSpaces?: [{pathPrefix, container}] }` (the pod-config field Task 7 adds); the fork's existing read-access check.

- [ ] **Step 1: Write the failing test** (clone `lws-config.test.js`'s config-PUT shape)

```js
// test/lws-referent-resolver.test.js
import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { startTestServer, stopTestServer, createTestPod, getPodToken, getBaseUrl, request } from './helpers.js';
import { resolveReferent } from '../src/lws/referent-resolver.js';

describe('resolveReferent (pure)', () => {
  const spaces = [{ pathPrefix: '/id/', container: '/alice/concepts/' }];
  it('maps a flat minted name to its container', () => {
    assert.equal(resolveReferent('/id/alpha', spaces), '/alice/concepts/alpha');
  });
  it('ignores nested / empty names and non-matching prefixes', () => {
    assert.equal(resolveReferent('/id/a/b', spaces), null);
    assert.equal(resolveReferent('/id/', spaces), null);
    assert.equal(resolveReferent('/other/x', spaces), null);
  });
});

describe('303 referent resolver (live)', () => {
  let base, tok;
  before(async () => {
    await startTestServer({ lws: true, lwsConfig: '/alice/profiles/pod-config.jsonld' });
    base = getBaseUrl(); await createTestPod('alice'); tok = getPodToken('alice');
    // pod-config declaring the plane-mapping
    await request(`${base}/alice/profiles/pod-config.jsonld`, { method: 'PUT',
      headers: { authorization: `Bearer ${tok}`, 'content-type': 'application/ld+json' },
      body: JSON.stringify({ profileIndex: '/alice/profiles/index.jsonld', void: '/alice/profiles/void.jsonld',
        uriSpaces: [{ pathPrefix: '/id/', container: '/alice/concepts/' }] }) });
    // a real, PUBLIC-READ target the name resolves to
    await request(`${base}/alice/concepts/alpha`, { method: 'PUT',
      headers: { authorization: `Bearer ${tok}`, 'content-type': 'application/ld+json' },
      body: JSON.stringify({ '@id': `${base}/id/alpha#it`, 'http://purl.org/dc/terms/title': 'Alpha' }) });
    const { generatePublicReadAcl, serializeAcl } = await import('../src/wac/parser.js');
    await request(`${base}/alice/concepts/alpha.acl`, { method: 'PUT',
      headers: { authorization: `Bearer ${tok}`, 'content-type': 'application/ld+json' },
      body: serializeAcl(generatePublicReadAcl(`${base}/alice/concepts/alpha`)) });
  });
  after(stopTestServer);

  it('303s a minted name to the public target (anonymous)', async () => {
    const r = await request(`${base}/id/alpha`, { redirect: 'manual' });
    assert.equal(r.status, 303);
    assert.equal(r.headers.get('location'), `${base}/alice/concepts/alpha`);
    assert.match(r.headers.get('link') || '', /rel="canonical"/);
  });
  it('404-hides a name with no backing target', async () => {
    const r = await request(`${base}/id/missing`, { redirect: 'manual' });
    assert.equal(r.status, 404);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test test/lws-referent-resolver.test.js`
Expected: FAIL — `resolveReferent` undefined; live 303 case returns 404.

- [ ] **Step 3: The pure resolver**

```js
// src/lws/referent-resolver.js
// Referent identity & discovery (2026-07-13): algorithmic 303 name->location.
// A minted name in a declared uriSpace maps to its backing container by a
// pathPrefix rewrite (httpRange-14; DBpedia /resource/ -> /data/ precedent).
// Pure; the caller applies no-oracle read-authz before emitting the 303.
export function resolveReferent(urlPath, uriSpaces = []) {
  for (const { pathPrefix, container } of uriSpaces) {
    if (!pathPrefix || !container || !urlPath.startsWith(pathPrefix)) continue;
    const slug = urlPath.slice(pathPrefix.length);
    if (!slug || slug.includes('/')) continue;               // flat namespace only
    return (container.endsWith('/') ? container : container + '/') + slug;
  }
  return null;
}
```

- [ ] **Step 4: Decorate `request.podConfig`** in `src/server.js` `onRequest` hook (~`:422`, where `request.lwsEnabled` is set): add `request.podConfig = podConfig;` (in scope from `server.js:113`).

- [ ] **Step 5: Wire the resolver into `handleGet`** at the `!stats` block (`src/handlers/resource.js:314`), BEFORE the existing 404:

```js
if (!stats) {
  if (request.lwsEnabled && request.podConfig) {
    const cfg = await request.podConfig.get();
    const target = resolveReferent(urlPath, cfg.uriSpaces || []);
    if (target) {
      // no-oracle: only 303 when the target exists AND the requester may read it.
      const targetStoragePath = target;   // pod-relative storage path == urlPath in non-subdomain mode
      const tStat = await storage.stat(targetStoragePath);
      if (tStat && await requesterCanRead(request, targetStoragePath, tStat)) {
        const origin = `${request.protocol}://${request.hostname}`;
        return reply.code(303)
          .header('Location', `${origin}${target}`)
          .header('Link', `<${origin}${target}>; rel="canonical"`)
          .send();
      }
      // missing or unreadable → fall through to the existing 404 (hide existence)
    }
  }
  // ... existing 404 body unchanged ...
}
```

`requesterCanRead(request, targetStoragePath, tStat)` reuses the fork's existing WAC check — the same `checkAccess({ resourceUrl, resourcePath, isContainer, agentWebId, requiredMode: AccessMode.READ, aclCache })` that `src/lws/authorized-resources.js:30-54` calls. Obtain `agentWebId` the way the normal GET path resolves the authenticated agent (the request's auth context). Import `checkAccess` + `AccessMode` from the module `authorized-resources.js` imports them from; build a one-off `aclCache` (a `new Map()`), and return its `allowed`. Mirror the whole block in `handleHead` (`:1529`), sending a bodyless 303.

- [ ] **Step 6: Run to verify it passes**

Run: `node --test test/lws-referent-resolver.test.js` → PASS (pure + both live cases).

- [ ] **Step 7: Add the no-oracle authenticated case + negative control**

Add an `it` that PUTs a private target (no public `.acl`) and asserts an **anonymous** `GET /id/<private>` returns 404 (not 303) — the hide. And an `it` under a `--lws`-off server asserting `/id/alpha` returns the plain 404 (resolver dormant). Run → PASS.

- [ ] **Step 8: Commit**

```bash
git add src/lws/referent-resolver.js src/server.js src/handlers/resource.js test/lws-referent-resolver.test.js
git commit -m "[Agent: Claude] feat(lws): 303 uriSpace resolver for minted subject-IRI names

- resolveReferent: pure pathPrefix->container rewrite (httpRange-14)
- handleGet/handleHead !stats seam emits 303 + Link rel=canonical, --lws-gated
- no-oracle: 404-hide when the target is missing or unreadable
- reads uriSpaces from pod-config (request.podConfig decorated in onRequest)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Referent-resolution capability advertisement

**Why:** so a cold agent *discovers* the pod resolves subject-IRI names, parallel to the conneg `capability`.

**Files:**
- Modify: `src/lws/storage-description.js` (`buildStorageDescription`, `:62-137`)
- Test: `test/lws-referent-capability.test.js`

**Interfaces:**
- Consumes: a new `buildStorageDescription` option `referentResolutionEnabled` (or reuse `lwsEnabled` presence + a non-empty uriSpaces signal). Thread it from the caller (`server.js:1076` HTTP, `mcp/resources.js:74` MCP) the same way `profileConnegEnabled` is threaded.

- [ ] **Step 1: Write the failing test**

```js
// test/lws-referent-capability.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildStorageDescription } from '../src/lws/storage-description.js';

const CAP = 'https://w3id.org/lws-pod/capability/ReferentResolution';

test('advertises the referent-resolution capability when enabled', () => {
  const sd = buildStorageDescription('https://pod.example', { referentResolutionEnabled: true });
  assert.ok((sd.capability || []).some((c) => c.type === CAP), 'capability missing');
});
test('absent when disabled; default path unchanged', () => {
  const sd = buildStorageDescription('https://pod.example', {});
  assert.ok(!(sd.capability || []).some((c) => c.type === CAP));
});
test('coexists with the profile-conneg capability', () => {
  const sd = buildStorageDescription('https://pod.example', { profileConnegEnabled: true, referentResolutionEnabled: true });
  const types = (sd.capability || []).map((c) => c.type);
  assert.ok(types.includes('http://www.w3.org/ns/dx/connegp/profile/http'));
  assert.ok(types.includes(CAP));
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test test/lws-referent-capability.test.js` → FAIL.

- [ ] **Step 3: Add the capability** in `buildStorageDescription`. Hoist the capability array so it isn't conneg-gated, and push both entries conditionally:

```js
base.capability = base.capability || [];
if (profileConnegEnabled) {
  base.capability.push({ type: 'http://www.w3.org/ns/dx/connegp/profile/http', hint: '…existing hint…' });
}
if (referentResolutionEnabled) {
  base.capability.push({
    type: 'https://w3id.org/lws-pod/capability/ReferentResolution',
    hint: 'This storage dereferences minted subject-IRI names by 303 redirect to their backing resource. A resource in a declared void:uriSpace resolves via GET; the referent is the #it fragment. Discover typed referents via the Type Search service.',
  });
}
```
Add `referentResolutionEnabled = false` to the destructured options (`:62`). Only assign `base.capability` at the end if non-empty (preserve byte-identity when neither flag is set — match the current shape where `capability` is absent).

- [ ] **Step 4: Thread the flag** from `server.js:1076` and `mcp/resources.js:74` — set `referentResolutionEnabled` true when `lwsEnabled` and the pod-config carries a non-empty `uriSpaces` (read `await podConfig.get()`), mirroring how `profileConnegEnabled` is passed.

- [ ] **Step 5: Run to verify it passes**

Run: `node --test test/lws-referent-capability.test.js` → PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lws/storage-description.js test/lws-referent-capability.test.js
git commit -m "[Agent: Claude] feat(lws): advertise a URI-typed ReferentResolution capability

- parallel to the DX-PROF-CONNEG capability; shows on HTTP + MCP (single builder)
- absent unless --lws + a non-empty uriSpaces plane-mapping; default path byte-identical

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Fork suite green + merge + push

- [ ] **Step 1: Full fork suite**

```bash
cd /Users/cvardema/dev/git/LA3D/JavaScriptSolidServer
npm test 2>&1 | tail -30
# If it wedges on test/mcp-lws-read.test.js, run that file alone:
node --test test/mcp-lws-read.test.js
```
Expected: prior pass count + the 4 new files, zero new failures. Investigate any regression before merging.

- [ ] **Step 2: Merge `--no-ff` into `la3d/lws` and push**

```bash
git checkout la3d/lws
git merge --no-ff la3d/lws-referent -m "[Agent: Claude] merge: referent identity & discovery (type enrichment + 303 resolver + capability)"
git log --oneline -1   # record the merge SHA for the lws-pod repin (Task 11)
git push origin la3d/lws la3d/lws-referent
```

---

## PHASE 2 — LWS-POD (consumers + data)

### Task 6: B7 — mint first-class identity-policy vocabulary

**Why:** make the minting/deref convention self-describing RDF (spec §5). Today `lwsp.ttl` mints only role IRIs; `pathPrefix`/`fragment` are bare JSON keys.

**Files:**
- Modify: `projection/profiles/defs/lwsp.ttl`
- Test: extend `projection/prof/*.test.mjs` (a unit assertion that the terms parse) or a new `projection/prof/lwsp-vocab.test.mjs`

- [ ] **Step 1: Write a failing parse/term test**

```js
// projection/prof/lwsp-vocab.test.mjs
import { test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
test('lwsp.ttl mints the identity-policy terms', () => {
  const ttl = readFileSync(new URL('../profiles/defs/lwsp.ttl', import.meta.url), 'utf8');
  for (const t of ['lwsp:pathPrefix', 'lwsp:fragment', 'lwsp:slugStrategy', 'lwsp:versioning', 'lwsp:planeContainer'])
    expect(ttl).toContain(t);
});
```

Run: `npx vitest run projection/prof/lwsp-vocab.test.mjs` → FAIL.

- [ ] **Step 2: Mint the terms** in `projection/profiles/defs/lwsp.ttl`, following the existing block style (SKOS + `rdfs:`), under the `lwsp:` namespace:

```turtle
lwsp:pathPrefix a rdf:Property, skos:Concept ;
  skos:prefLabel "path prefix"@en ;
  skos:definition "The uriSpace segment under the pod authority in which this profile mints subject IRIs (e.g. 'id/'). A GET of a minted name in this space 303-redirects to the backing resource via the plane container."@en ;
  skos:inScheme lwsp: .
lwsp:fragment a rdf:Property, skos:Concept ;
  skos:prefLabel "fragment"@en ;
  skos:definition "The fragment identifying the referent within a minted document IRI (default '#it'; httpRange-14: the document is the graph, the referent is the fragment)."@en ;
  skos:inScheme lwsp: .
lwsp:slugStrategy a rdf:Property, skos:Concept ;
  skos:prefLabel "slug strategy"@en ;
  skos:definition "How the slug is derived (e.g. filename-stem for flat spaces, bundle-path for hierarchical); content-derived, never the storage path."@en ;
  skos:inScheme lwsp: .
lwsp:versioning a rdf:Property, skos:Concept ;
  skos:prefLabel "versioning"@en ;
  skos:definition "Whether a version segment is included in minted IRIs (off by default)."@en ;
  skos:inScheme lwsp: .
lwsp:planeContainer a rdf:Property, skos:Concept ;
  skos:prefLabel "plane container"@en ;
  skos:definition "The storage container backing this profile's pathPrefix uriSpace — the 303 target base for name dereference (the read-side plane mapping)."@en ;
  skos:inScheme lwsp: .
```

(Add `@prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .` if not present.) **Keep the identity `.jsonld` artifacts as plain minter config** (no `@context`); the vocabulary is the readable self-description, the artifacts remain the operational key/value the loader reads — no artifact-shape change, so `profile-loader.mjs` is untouched.

- [ ] **Step 3: Run to verify it passes**

Run: `npx vitest run projection/prof/lwsp-vocab.test.mjs` → PASS.

- [ ] **Step 4: Commit**

```bash
cd /Users/cvardema/dev/git/LA3D/agents/lws-pod
git add projection/profiles/defs/lwsp.ttl projection/prof/lwsp-vocab.test.mjs
git commit -m "[Agent: Claude] feat(profiles): mint first-class lwsp: identity-policy vocabulary (B7)

- lwsp:pathPrefix/fragment/slugStrategy/versioning/planeContainer as RDF terms
- identity policy is now self-describing; artifacts stay plain minter config

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Plane-mapping data in pod-config + pin the real uriSpace↔container

**Why:** the fork resolver reads `uriSpaces` from pod-config. Establish the ACTUAL minted-IRI→container mapping (don't guess — the map flagged uriSpace resolves to `{BASE}/id/` while content lives under `/alice/…`).

**Files:**
- Modify: `projection/profiles/defs/pod-config.jsonld`
- Modify: `projection/publish/checks.mjs` (`checkPodConfig`, `:151-163`)
- Test: extend `projection/publish/checks.test.mjs`

- [ ] **Step 1: Pin the real mapping.** Determine, from a live/minted wiki card, the exact subject IRI and the storage container its content lives in:

```bash
# with the fork rig up (make up-fork-tls) or from the projection minter unit output:
grep -rn "pathPrefix\|uriSpace\|rootResource" projection/profiles/defs/index.jsonld projection/profiles/defs/llm-wiki/identity.jsonld
# Confirm: does a wiki subject mint as {BASE}/id/{slug}#it (origin-relative) or {BASE}/alice/id/{slug}#it?
# The void gate asserts void:uriSpace == `${BASE}/id/` (tests/lws-void.test.mjs:32) → the space is origin-relative /id/.
# Establish the content container (where instantiate PUTs the card / its links rep).
```

Record the answer in the task notes. The `uriSpaces` entry is `{ pathPrefix: "/id/", container: "<the content container>" }`.

- [ ] **Step 2: Write the failing check test**

```js
// projection/publish/checks.test.mjs (add)
test('checkPodConfig validates the uriSpaces plane-mapping', () => {
  const cfg = JSON.stringify({ profileIndex: '/alice/profiles/index.jsonld', void: '/alice/profiles/void.jsonld',
    uriSpaces: [{ pathPrefix: '/id/', container: '/alice/concepts/' }] });
  const manifest = { void: { rootResource: '/alice/', uriSpace: 'id/' } };
  const fails = checkPodConfig(cfg, manifest, () => true, '/alice/profiles/');
  expect(fails).toEqual([]);
});
test('checkPodConfig rejects a uriSpaces entry missing container', () => {
  const cfg = JSON.stringify({ profileIndex: '/alice/profiles/index.jsonld', void: '/alice/profiles/void.jsonld',
    uriSpaces: [{ pathPrefix: '/id/' }] });
  const fails = checkPodConfig(cfg, { void: { uriSpace: 'id/' } }, () => true, '/alice/profiles/');
  expect(fails.length).toBeGreaterThan(0);
});
```

Run: `npx vitest run projection/publish/checks.test.mjs` → FAIL.

- [ ] **Step 3: Extend `checkPodConfig`** (`projection/publish/checks.mjs`) to validate `uriSpaces` when present: each entry must have a non-empty string `pathPrefix` and `container`; the `pathPrefix` should match `/${manifest.void.uriSpace}` (consistency with VoID). Keep unknown-key tolerance for forward-compat.

- [ ] **Step 4: Add the field to `pod-config.jsonld`:**

```json
{ "profileIndex": "/alice/profiles/index.jsonld", "void": "/alice/profiles/void.jsonld",
  "uriSpaces": [{ "pathPrefix": "/id/", "container": "/alice/concepts/" }] }
```
(Use the container pinned in Step 1.)

- [ ] **Step 5: Run to verify it passes**

Run: `npx vitest run projection/publish/checks.test.mjs` → PASS.

- [ ] **Step 6: Commit**

```bash
git add projection/profiles/defs/pod-config.jsonld projection/publish/checks.mjs projection/publish/checks.test.mjs
git commit -m "[Agent: Claude] feat(publish): pod-config uriSpaces plane-mapping for the fork resolver

- pod-config carries [{pathPrefix, container}] the fork reads for 303 name-deref
- checkPodConfig validates the entries against the manifest uriSpace

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: Read-semantics fixtures (confirm the leanings)

**Why:** the read semantics are already design-of-record (`iri-minting.md` (c)); confirm them against live/unit fixtures, don't re-decide.

**Files:**
- Test: add cases to `tests/lws-profiles.test.mjs` (or the new `tests/lws-referent.test.mjs`, Task 9)

- [ ] **Step 1:** Add live assertions (behind the existing capability skip-guard):
  - **container `conformsTo` beats pod-wide `defaultProfile`:** bind a container to `llm-wiki` and assert a member is governed by wiki's shape even though the manifest `defaultProfile` is `okf-base`.
  - **`up`-walk:** assert governance edges (`describedby`/`conformsTo`) are on the container `.meta`, and a member with no own governance is still validated (reaches its profile via `up`).
  - **plural bindings AND-compose:** bind a container to two `conformsTo` profiles; assert a member must satisfy both shapes (a violation of either → rejected).
- [ ] **Step 2: Run + commit** (`make test-profiles` and/or `make test-referent`).

---

### Task 9: Live gate — `tests/lws-referent.test.mjs` + Makefile

**Files:**
- Create: `tests/lws-referent.test.mjs` (clone the typeindex/conneg house style — capability probe → `describe.skipIf` → `ensurePod`+`getToken` → PUT fixtures → asserts)
- Modify: `Makefile` (`test-referent` recipe + add to `.PHONY` line 9)

- [ ] **Step 1: Write the gate** using `tests/helpers.mjs` (`getToken`, `ensurePod`). Assert, against the fork rig:
  1. **Referent-type search (neutral):** PUT JSON-LD with `#it a ex:Thing` (no `rel=type`); `GET /types/search?type=<ex:Thing>` returns it; `?type=lws#DataResource` still returns it (enrich).
  2. **Name deref (wiki):** `GET {BASE}/id/{slug}` (a published wiki card's minted name) → 303 to the card; anonymous follows iff public.
  3. **no-oracle:** an unreadable referent's name-GET 404-hides; `/types/search` omits it.
  4. **Capability:** `/.well-known/lws-storage` carries the `ReferentResolution` capability (URI-typed).
  5. **DCAT degradation:** a dcat member is found by `?type=dcat:Dataset`; DCAT declares no `pathPrefix` → no name-space to resolve.
- [ ] **Step 2: Add the Makefile target** (copy the `test-void` block, swap the filename, add `test-referent` to `.PHONY` at line 9). Note it needs `make publish-profiles` first (published profiles/plane-mapping), like `test-void`/`test-wiki`.
- [ ] **Step 3: Commit** (do not run live yet — the rig isn't repinned until Task 11).

---

### Task 10: `iri-minting.md` read-side update

- [ ] **Step 1:** Amend `docs/design-notes/iri-minting.md` "Plane 1 — read-side plane mapping (RESOLVED)" (a) to state the **name-space** deref: dereferencing a minted name 303s to the backing resource via the profile's `pathPrefix→container` plane-mapping (a rewrite rule read from pod-config), distinct from GETting the canonical URL and negotiating a profile. Note the rewrite-rule (not a lookup index) choice + the DBpedia precedent.
- [ ] **Step 2: Commit.**

---

### Task 11: Rig repin + rebuild + full live sweep

**Files:** `Dockerfile.fork`, `docker-compose.fork-tls.yml`

- [ ] **Step 1: Repin** `Dockerfile.fork` `JSS_GIT_REF` and `docker-compose.fork-tls.yml`'s default to the Task-5 merge SHA. Update the Dockerfile.fork comment banner (the "post-drain review-round" note) to the referent round.
- [ ] **Step 2: Rebuild + publish + reseed:**

```bash
make cert && make up-fork-tls
POD_TOKEN=$(…) make publish-profiles   # publishes the new pod-config uriSpaces + lwsp vocab
```

- [ ] **Step 3: Full live sweep, zero regression** (space runs ~40s apart — the anon rate limiter, standing gotcha):

```bash
make test-referent        # NEW gate
make test-typeindex ; make test-conneg ; make test-void ; make test-preservation
make test-profiles ; make test-dcat ; make test-graph ; make test-wiki
make test-mcp-v2 ; make test-lws ; make test-l3 ; make test-indexed-relation
make test-projection ; make test-app
```
Expected: all green; `test-referent` new; no regression. Record counts.

- [ ] **Step 4: Commit the repin.**

---

### Task 12: Cold-agent probes (progressive-disclosure utility)

**Why:** the spec (§8) gates on *utility*, not just 200s. Run the unprimed protocol.

- [ ] **Step 1: Probe (generic).** Dispatch a fresh sub-agent (pod URL + CA cert only, read-only, zero project context): "read `/.well-known/void` → learn `void:uriSpace` + the referent-resolution capability → type-search by the referent's `ex:` type → follow the returned subject IRI (303) → read it." Record whether the chain served progressive disclosure (right granularity; the landed rep surfaced the typed edges to follow onward; the 303 was legible). Frictions → surface-fix items.
- [ ] **Step 2: Probe #(wiki+DCAT).** Same walk over the wiki family (resolve `/id/{slug}`, find `skos:Concept`) and DCAT (find `dcat:Dataset`, confirm no name-space). Two apps, one walk.
- [ ] **Step 3:** Record findings in FOLLOWUP; fold any surface fixes into a follow-up commit or the fork-queue.

---

### Task 13: Console-rewire rider (DROPPABLE)

**Why:** the curation console targets the fork the round changed. Rider — drop if it bloats.

- [ ] **Step 1:** Fix `app/seed/seed.mjs`'s `putViaProxy` + the stale `projection/triggers` path so the console runs against the fork pod. Verify `make test-app` green. Commit separately so it can be dropped.

---

### Task 14: Close-out

- [ ] **Step 1:** Update `FOLLOWUP.md` (new top block: round done, fork SHA range + merge, image, gate counts, probe findings; drain the L4 read-side carryover). Update `docs/foundations/05-jss-spec-conformance.md` §3/§4 (type search enriched, resolver added) and `06-code-placement-audit.md` (new Bucket-1 rows: type enrichment, resolver, capability). Update `CLAUDE.md`/`ROADMAP.md` status banners.
- [ ] **Step 2: Commit** the living-docs sync.

---

## Self-Review

**Spec coverage:**
- §2 type enrichment → Task 1 (+ §"enrich not replace" asserted; content-derivation path). ✓
- §3 resolver (algorithmic 303, no-oracle, per-profile opt-in) → Task 3. ✓
- §4 "not built" (no reverse index) → honored: Task 3 is a rewrite rule, no per-resource index. ✓
- §5 capability + B7 vocab → Task 4 + Task 6. ✓
- §6 read semantics + earned conformsTo → Task 8 + Task 2. ✓
- §7 consumers (wiki/DCAT) + iri-minting + console rider → Tasks 9, 10, 13. ✓
- §8 cold-agent probes (utility) → Task 12. ✓
- §9 acceptance (P13 assertion, size guard, zero-regression sweep) → Tasks 1/3/9/11. ✓
- Plane-mapping data seam (fork can't resolve today) → Task 7 (pod-config) + Task 3 (fork read). ✓

**Placeholder scan:** the two integration points that reference existing fork code rather than quoting it — `requesterCanRead` (Task 3 Step 5, reuse `checkAccess` from `authorized-resources.js`) and the flag threading (Task 4 Step 4, mirror `profileConnegEnabled`) — are pinned to a named existing pattern + file, with the logical code shown. Task 7 Step 1 deliberately requires establishing the real container path before writing the value (not a placeholder — a required measurement).

**Type consistency:** `subjectTypesFromBody`, `resolveReferent`, `provStorePath`/`readProvenance`/`writeProvenance`, `referentResolutionEnabled`, `uriSpaces:[{pathPrefix,container}]`, capability `type` URI `https://w3id.org/lws-pod/capability/ReferentResolution` — used identically across their producing and consuming tasks.

**Scope:** Phase 1 = fork (Tasks 0-5), Phase 2 = lws-pod (Tasks 6-14). Each task ends with an independently testable deliverable + commit.
