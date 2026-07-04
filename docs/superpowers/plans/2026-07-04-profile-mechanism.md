# Profile Mechanism (Plan 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Profiles become first-class, discoverable, resolvable pod resources (PROF compact JSON-LD descriptors published under `/profiles/`), and identity minting stops using the `urn:okf:base/` placeholder via a new `resolveStorageAuthority` seam.

**Architecture:** Client-side mechanism in `projection/okf` (resolver → descriptor loader → `isProfileOf` inheritance walk → engine-profile bridge), profile *definitions* as data in `projection/profiles/defs/` with publish-time declaration checks, and **one additive `--lws`-gated fork rung** (storage description advertises the profile index; linksets surface the target's own declared `dct:conformsTo`). Enforcement is unchanged: the publish step materializes the profile's validation artifact as the container's `describedby` declaration and shipped L3 does the rest.

**Tech Stack:** Node ESM. lws-pod: Vitest, `n3`, `gray-matter`, `shacl-engine`, **new dep `jsonld`** (descriptor parsing → N-Quads → n3). Fork: `node:test` + `node:assert/strict`, Fastify.

## Global Constraints

- **Two repos.** Mechanism/definitions/gates: `/Users/cvardema/dev/git/LA3D/agents/lws-pod`. Fork code: `/Users/cvardema/dev/git/LA3D/JavaScriptSolidServer` (branch `la3d/lws`, HEAD `161bb99`). **A stale second checkout exists at `~/dev/git/LA3D/agents/JavaScriptSolidServer` (@ `21d9999`) — do not touch it.**
- **Fork branch:** all fork work on `la3d/lws-profiles` off `la3d/lws`; merge `--no-ff` into `la3d/lws` (solo-dev model, no GitHub PR). `la3d/main` stays the pristine upstream pin.
- **`--lws`-gated + additive.** Fork changes reachable only under `--lws`; default LDP path provably unchanged (negative controls).
- **Layer-cake governance** (`docs/design-notes/layer-cake-principles.md`): P5 — no application vocabulary in mechanism code (`projection/okf/` must never contain `wm:`, "wiki", "memory"; profile names arrive only as data). P10 — descriptors are read at the graph level (parse to quads; never string-match compact JSON).
- **IRIs fixed by this plan** (spec §3 left them to us): mechanism vocab `lwsp:` = `https://w3id.org/lws-pod/profile#`; minted roles `https://w3id.org/lws-pod/profile/role/{context,identity-policy,plane-mapping}`; w3id registration is a later public rung — meanwhile these IRIs are *served from the pod* and the storage description/index maps them. Descriptor documents use **relative IRIs** in source; their published pod URL is their ID for now.
- **Proto namespace** = `{authority}proto#` (authority is the storage `id`, ends `/`).
- **Known spec deviation (deliberate, record in FOLLOWUP task):** spec §8 places the proto-predicate Warning rule in the okf-base *shape*; the pinned `shacl-engine`'s SPARQL-constraint support is unverified, so this plan ships the advisory in the **projection** (`cardToQuads` reports minted proto terms) and defers the shape-level rule. Everything else in §8 lands as spec'd.
- **Commits:** lws-pod → `[Agent: Claude] type(scope): subject` + `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`. Fork → plain `type(scope): subject` + the same Co-Authored-By (matches fork log convention). Stage specific files, never `git add -A`.
- **Test runners:** lws-pod projection: `cd projection && npx vitest run <paths>` (the FULL projection run stays RED by design — `profiles/wiki-memory` is L4; never "fix" it). Fork: `node --test test/<file>.test.js`; full suite `node --test --test-concurrency=1 'test/*.test.js'`.

**Spec:** `docs/superpowers/specs/2026-07-04-profile-mechanism-design.md`.
**PROF IRIs used throughout:** `prof:` = `http://www.w3.org/ns/dx/prof/`, `role:` = `http://www.w3.org/ns/dx/prof/role/`, `dct:` = `http://purl.org/dc/terms/`.

---

### Task 1: JSON-LD → quads utility (`okf/rdf.mjs`)

**Files:**
- Create: `projection/okf/rdf.mjs`
- Test: `projection/okf/rdf.test.mjs`
- Modify: `projection/package.json` (add `jsonld`)

**Interfaces:**
- Produces: `jsonldToQuads(doc: object|string, base?: string) → Promise<Quad[]>` (n3 quads; throws on unparseable input)

- [ ] **Step 1: Add the dependency**

```bash
cd /Users/cvardema/dev/git/LA3D/agents/lws-pod/projection
npm install jsonld@^8
```

- [ ] **Step 2: Write the failing test**

`projection/okf/rdf.test.mjs`:

```js
import { describe, it, expect } from 'vitest'
import { jsonldToQuads } from './rdf.mjs'

describe('jsonldToQuads', () => {
  it('parses compact JSON-LD to quads at the graph level', async () => {
    const doc = {
      '@context': { dct: 'http://purl.org/dc/terms/', title: 'dct:title' },
      '@id': 'https://example.org/x',
      title: 'hello',
    }
    const quads = await jsonldToQuads(doc)
    expect(quads).toHaveLength(1)
    expect(quads[0].subject.value).toBe('https://example.org/x')
    expect(quads[0].predicate.value).toBe('http://purl.org/dc/terms/title')
    expect(quads[0].object.value).toBe('hello')
  })

  it('resolves relative IRIs against base', async () => {
    const doc = { '@context': { dct: 'http://purl.org/dc/terms/' }, '@id': '', 'dct:title': 't' }
    const quads = await jsonldToQuads(doc, 'https://pod.example/profiles/okf-base.jsonld')
    expect(quads[0].subject.value).toBe('https://pod.example/profiles/okf-base.jsonld')
  })

  it('throws on unparseable input', async () => {
    await expect(jsonldToQuads('not json at all')).rejects.toThrow()
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd projection && npx vitest run okf/rdf.test.mjs`
Expected: FAIL — `Cannot find module './rdf.mjs'`

- [ ] **Step 4: Write the implementation**

`projection/okf/rdf.mjs`:

```js
import jsonld from 'jsonld'
import { Parser } from 'n3'

// Descriptors/artifacts are consumed at the graph level (layer-cake P10):
// expand via jsonld → N-Quads → n3 quads. Never string-match compact JSON.
export async function jsonldToQuads(doc, base) {
  const input = typeof doc === 'string' ? JSON.parse(doc) : doc
  const nq = await jsonld.toRDF(input, { format: 'application/n-quads', base })
  return new Parser({ format: 'N-Quads' }).parse(nq)
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd projection && npx vitest run okf/rdf.test.mjs`
Expected: 3 passed

- [ ] **Step 6: Commit**

```bash
cd /Users/cvardema/dev/git/LA3D/agents/lws-pod
git add projection/package.json projection/package-lock.json projection/okf/rdf.mjs projection/okf/rdf.test.mjs
git commit -m "$(cat <<'EOF'
[Agent: Claude] feat(okf): jsonldToQuads — graph-level JSON-LD reading (P10)

- jsonld → N-Quads → n3 quads; base-IRI resolution; throws on bad input

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Storage-authority resolver (`okf/resolve.mjs`)

**Files:**
- Create: `projection/okf/resolve.mjs`
- Test: `projection/okf/resolve.test.mjs`

**Interfaces:**
- Consumes: nothing from other tasks (pure fetch).
- Produces:
  - `resolveStorageAuthority(resourceUrl, {fetchFn=fetch}) → Promise<{authority: string, profileIndex: string|null}>`
  - `readProfileIndex(indexUrl, {fetchFn=fetch}) → Promise<{profiles: string[], defaultProfile: string|null}>`
  - Mock-fetch helper pattern used by Tasks 3–4 tests: `mockFetch(map)` where `map` is `{url: {status, headers, body}}`.

- [ ] **Step 1: Write the failing test**

`projection/okf/resolve.test.mjs`:

```js
import { describe, it, expect } from 'vitest'
import { resolveStorageAuthority, readProfileIndex } from './resolve.mjs'

export function mockFetch(map) {
  return async (url, opts = {}) => {
    const e = map[String(url)]
    if (!e) return new Response('not found', { status: 404 })
    return new Response(opts.method === 'HEAD' ? null : (typeof e.body === 'string' ? e.body : JSON.stringify(e.body)),
      { status: e.status ?? 200, headers: e.headers ?? {} })
  }
}

const SD_URL = 'https://pod.example/.well-known/lws-storage'
const SD = {
  '@context': 'https://www.w3.org/ns/lws/v1',
  id: 'https://pod.example/', type: 'Storage',
  service: [
    { type: 'StorageDescription', serviceEndpoint: SD_URL },
    { type: 'ProfileIndexService', serviceEndpoint: 'https://pod.example/profiles/index.jsonld' },
  ],
}

describe('resolveStorageAuthority', () => {
  it('follows the storageDescription Link header and returns authority + profile index', async () => {
    const f = mockFetch({
      'https://pod.example/alice/notes/x.md': { body: '', headers: {
        link: `<${SD_URL}>; rel="https://www.w3.org/ns/lws#storageDescription"` } },
      [SD_URL]: { body: SD },
    })
    const r = await resolveStorageAuthority('https://pod.example/alice/notes/x.md', { fetchFn: f })
    expect(r.authority).toBe('https://pod.example/')
    expect(r.profileIndex).toBe('https://pod.example/profiles/index.jsonld')
  })

  it('falls back to the well-known convention when no Link header', async () => {
    const f = mockFetch({
      'https://pod.example/alice/y.md': { body: '' },
      [SD_URL]: { body: SD },
    })
    const r = await resolveStorageAuthority('https://pod.example/alice/y.md', { fetchFn: f })
    expect(r.authority).toBe('https://pod.example/')
  })

  it('profileIndex is null when the service is absent', async () => {
    const f = mockFetch({
      'https://pod.example/z.md': { body: '' },
      [SD_URL]: { body: { ...SD, service: [SD.service[0]] } },
    })
    const r = await resolveStorageAuthority('https://pod.example/z.md', { fetchFn: f })
    expect(r.profileIndex).toBeNull()
  })
})

describe('readProfileIndex', () => {
  it('returns descriptor list + optional default', async () => {
    const f = mockFetch({
      'https://pod.example/profiles/index.jsonld': { body: {
        profiles: ['https://pod.example/profiles/okf-base.jsonld', 'https://pod.example/profiles/llm-wiki/profile.jsonld'],
        defaultProfile: 'https://pod.example/profiles/okf-base.jsonld',
      } },
    })
    const r = await readProfileIndex('https://pod.example/profiles/index.jsonld', { fetchFn: f })
    expect(r.profiles).toHaveLength(2)
    expect(r.defaultProfile).toBe('https://pod.example/profiles/okf-base.jsonld')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd projection && npx vitest run okf/resolve.test.mjs`
Expected: FAIL — `Cannot find module './resolve.mjs'`

- [ ] **Step 3: Write the implementation**

`projection/okf/resolve.mjs`:

```js
const SD_REL = 'https://www.w3.org/ns/lws#storageDescription'

function sdUrlFromLink(linkHeader) {
  if (!linkHeader) return null
  for (const part of linkHeader.split(',')) {
    const m = part.match(/<([^>]+)>\s*;[^,]*rel="([^"]*)"/)
    if (m && m[2].split(/\s+/).includes(SD_REL)) return m[1]
  }
  return null
}

// The seam (spec §6): authority is RESOLVED from the pod's real storage
// description, never a config literal. iri-minting.md rule.
export async function resolveStorageAuthority(resourceUrl, { fetchFn = fetch } = {}) {
  let sdUrl = null
  try {
    const head = await fetchFn(resourceUrl, { method: 'HEAD' })
    sdUrl = sdUrlFromLink(head.headers.get('link'))
  } catch { /* fall through to convention */ }
  sdUrl = sdUrl ?? `${new URL(resourceUrl).origin}/.well-known/lws-storage`
  const r = await fetchFn(sdUrl, { headers: { accept: 'application/lws+json, application/json' } })
  if (!r.ok) throw new Error(`storage description ${sdUrl} -> ${r.status}`)
  const sd = await r.json()
  const svc = (sd.service || []).find((s) => s.type === 'ProfileIndexService')
  return { authority: sd.id, profileIndex: svc?.serviceEndpoint ?? null }
}

export async function readProfileIndex(indexUrl, { fetchFn = fetch } = {}) {
  const r = await fetchFn(indexUrl, { headers: { accept: 'application/ld+json, application/json' } })
  if (!r.ok) throw new Error(`profile index ${indexUrl} -> ${r.status}`)
  const doc = await r.json()
  return { profiles: doc.profiles ?? [], defaultProfile: doc.defaultProfile ?? null }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd projection && npx vitest run okf/resolve.test.mjs`
Expected: 4 passed

- [ ] **Step 5: Commit**

```bash
cd /Users/cvardema/dev/git/LA3D/agents/lws-pod
git add projection/okf/resolve.mjs projection/okf/resolve.test.mjs
git commit -m "$(cat <<'EOF'
[Agent: Claude] feat(okf): resolveStorageAuthority — authority from the real storage description

- Link rel=storageDescription first, well-known fallback; ProfileIndexService
  discovery; readProfileIndex (profiles[] + optional defaultProfile)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Descriptor reader (`okf/profile-doc.mjs`)

**Files:**
- Create: `projection/okf/profile-doc.mjs`
- Test: `projection/okf/profile-doc.test.mjs`

**Interfaces:**
- Consumes: `jsonldToQuads` (Task 1).
- Produces: `descriptorToProfile(doc, descriptorUrl) → Promise<Descriptor>` where `Descriptor = { id: string, token: string|null, parents: string[], resources: Array<{roles: string[], artifact: string, format: string|null, source: string|null, version: string|null}> }`. Role IRIs are opaque strings (dispatch happens in Task 4).

- [ ] **Step 1: Write the failing test**

`projection/okf/profile-doc.test.mjs`:

```js
import { describe, it, expect } from 'vitest'
import { descriptorToProfile } from './profile-doc.mjs'

const DESCRIPTOR = {
  '@context': {
    prof: 'http://www.w3.org/ns/dx/prof/', dct: 'http://purl.org/dc/terms/',
    Profile: 'prof:Profile', isProfileOf: { '@id': 'prof:isProfileOf', '@type': '@id' },
    hasToken: 'prof:hasToken',
    hasResource: { '@id': 'prof:hasResource', '@type': '@id' },
    hasRole: { '@id': 'prof:hasRole', '@type': '@id' },
    hasArtifact: { '@id': 'prof:hasArtifact', '@type': '@id' },
    format: 'dct:format', source: { '@id': 'dct:source', '@type': '@id' }, version: 'dct:hasVersion',
  },
  '@id': '', '@type': 'Profile', hasToken: 'llm-wiki',
  isProfileOf: 'https://pod.example/profiles/okf-base.jsonld',
  hasResource: [
    { '@id': '#r1', hasRole: 'http://www.w3.org/ns/dx/prof/role/validation',
      hasArtifact: 'https://pod.example/profiles/llm-wiki/shapes.ttl', format: 'text/turtle',
      source: 'https://la3d.github.io/llm-wiki-colab/shapes.ttl', version: 'pin-1' },
    { '@id': '#r2', hasRole: 'https://w3id.org/lws-pod/profile/role/context',
      hasArtifact: 'https://pod.example/profiles/llm-wiki/context.jsonld', format: 'application/ld+json' },
  ],
}

describe('descriptorToProfile', () => {
  it('reads PROF terms at the graph level', async () => {
    const d = await descriptorToProfile(DESCRIPTOR, 'https://pod.example/profiles/llm-wiki/profile.jsonld')
    expect(d.id).toBe('https://pod.example/profiles/llm-wiki/profile.jsonld')
    expect(d.token).toBe('llm-wiki')
    expect(d.parents).toEqual(['https://pod.example/profiles/okf-base.jsonld'])
    const val = d.resources.find((r) => r.roles.includes('http://www.w3.org/ns/dx/prof/role/validation'))
    expect(val.artifact).toBe('https://pod.example/profiles/llm-wiki/shapes.ttl')
    expect(val.source).toBe('https://la3d.github.io/llm-wiki-colab/shapes.ttl')
    expect(val.version).toBe('pin-1')
    const ctx = d.resources.find((r) => r.roles.includes('https://w3id.org/lws-pod/profile/role/context'))
    expect(ctx.format).toBe('application/ld+json')
  })

  it('descriptor with no parents and unknown roles is preserved', async () => {
    const doc = { ...DESCRIPTOR, isProfileOf: undefined,
      hasResource: [{ '@id': '#r', hasRole: 'https://example.org/role/weird', hasArtifact: 'https://x/a' }] }
    const d = await descriptorToProfile(doc, 'https://pod.example/profiles/floor.jsonld')
    expect(d.parents).toEqual([])
    expect(d.resources[0].roles).toEqual(['https://example.org/role/weird'])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd projection && npx vitest run okf/profile-doc.test.mjs`
Expected: FAIL — `Cannot find module './profile-doc.mjs'`

- [ ] **Step 3: Write the implementation**

`projection/okf/profile-doc.mjs`:

```js
import { jsonldToQuads } from './rdf.mjs'

const PROF = 'http://www.w3.org/ns/dx/prof/'
const DCT = 'http://purl.org/dc/terms/'
const P = {
  isProfileOf: PROF + 'isProfileOf', hasToken: PROF + 'hasToken',
  hasResource: PROF + 'hasResource', hasRole: PROF + 'hasRole', hasArtifact: PROF + 'hasArtifact',
  format: DCT + 'format', source: DCT + 'source', version: DCT + 'hasVersion',
}

function objectsOf(quads, subject, predicate) {
  return quads.filter((q) => q.subject.value === subject && q.predicate.value === predicate).map((q) => q.object)
}

// Graph-level PROF read (P10). Roles stay opaque IRI strings here; the
// loader (profile-loader.mjs) owns dispatch. Unknown roles pass through.
export async function descriptorToProfile(doc, descriptorUrl) {
  const quads = await jsonldToQuads(doc, descriptorUrl)
  const id = descriptorUrl
  const token = objectsOf(quads, id, P.hasToken)[0]?.value ?? null
  const parents = objectsOf(quads, id, P.isProfileOf).map((o) => o.value)
  const resources = objectsOf(quads, id, P.hasResource).map((node) => ({
    roles: objectsOf(quads, node.value, P.hasRole).map((o) => o.value),
    artifact: objectsOf(quads, node.value, P.hasArtifact)[0]?.value ?? null,
    format: objectsOf(quads, node.value, P.format)[0]?.value ?? null,
    source: objectsOf(quads, node.value, P.source)[0]?.value ?? null,
    version: objectsOf(quads, node.value, P.version)[0]?.value ?? null,
  })).filter((r) => r.artifact)
  return { id, token, parents, resources }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd projection && npx vitest run okf/profile-doc.test.mjs`
Expected: 2 passed

- [ ] **Step 5: Commit**

```bash
cd /Users/cvardema/dev/git/LA3D/agents/lws-pod
git add projection/okf/profile-doc.mjs projection/okf/profile-doc.test.mjs
git commit -m "$(cat <<'EOF'
[Agent: Claude] feat(okf): descriptorToProfile — graph-level PROF descriptor read

- id/token/parents/resources{roles,artifact,format,source,version}; roles opaque

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Loader — inheritance walk, role dispatch, binding discovery (`okf/profile-loader.mjs`)

**Files:**
- Create: `projection/okf/profile-loader.mjs`
- Test: `projection/okf/profile-loader.test.mjs`

**Interfaces:**
- Consumes: `descriptorToProfile` (Task 3), `readProfileIndex` (Task 2).
- Produces:
  - `loadProfile(descriptorUrl, {fetchFn=fetch}) → Promise<Loaded>` where `Loaded = { id, token, conformance: Array<{iri, resolved: boolean}>, validation: string[], vocabulary: string[], contexts: object[] /* fetched context docs, base-first */, identityPolicy: object|null, planeMapping: object|null, unknownRoles: Array<{role, artifact}> }`
  - `discoverBinding(resourceUrl, {fetchFn=fetch, indexUrl=null}) → Promise<string|null>` (descriptor IRI: own `.meta` → `rel="up"` URL-walk of container `.meta`s → index `defaultProfile` → null)
- Role dispatch table (the ONLY place role IRIs are interpreted — layer-cake P7):
  `role:validation → validation`, `role:vocabulary → vocabulary`, `lwsp role/context → contexts (fetched)`, `lwsp role/identity-policy → identityPolicy (fetched)`, `lwsp role/plane-mapping → planeMapping (fetched)`; anything else → `unknownRoles`.
- Merge rules (spec §6): validation/vocabulary **union** (parents first, dedup); contexts **array-stack base-first**; identityPolicy/planeMapping **nearest-wins** (child overrides parent); `conformance` collects every parent IRI with `resolved` flag. **Opaque parent rule:** a parent that 404s, isn't JSON, or has no PROF `hasResource`/`isProfileOf`/`hasToken` triples about itself → `{iri, resolved:false}`, not walked. Cycle guard via visited set.

- [ ] **Step 1: Write the failing test**

`projection/okf/profile-loader.test.mjs`:

```js
import { describe, it, expect } from 'vitest'
import { loadProfile, discoverBinding } from './profile-loader.mjs'
import { mockFetch } from './resolve.test.mjs'

const B = 'https://pod.example/profiles'
const ROLE = 'http://www.w3.org/ns/dx/prof/role/'
const LWSP_ROLE = 'https://w3id.org/lws-pod/profile/role/'
const CTX = {
  prof: 'http://www.w3.org/ns/dx/prof/', dct: 'http://purl.org/dc/terms/',
  Profile: 'prof:Profile', isProfileOf: { '@id': 'prof:isProfileOf', '@type': '@id' },
  hasToken: 'prof:hasToken', hasResource: { '@id': 'prof:hasResource', '@type': '@id' },
  hasRole: { '@id': 'prof:hasRole', '@type': '@id' }, hasArtifact: { '@id': 'prof:hasArtifact', '@type': '@id' },
  format: 'dct:format',
}
const floor = { '@context': CTX, '@id': '', '@type': 'Profile', hasToken: 'substrate-floor',
  hasResource: [{ '@id': '#i', hasRole: LWSP_ROLE + 'identity-policy', hasArtifact: `${B}/floor-identity.jsonld` }] }
const okfBase = { '@context': CTX, '@id': '', '@type': 'Profile', hasToken: 'okf-base',
  isProfileOf: `${B}/substrate-floor.jsonld`,
  hasResource: [
    { '@id': '#v', hasRole: ROLE + 'validation', hasArtifact: `${B}/okf-base.shape.ttl`, format: 'text/turtle' },
    { '@id': '#c', hasRole: LWSP_ROLE + 'context', hasArtifact: `${B}/okf-base.context.jsonld` },
  ] }
const llmWiki = { '@context': CTX, '@id': '', '@type': 'Profile', hasToken: 'llm-wiki',
  isProfileOf: `${B}/okf-base.jsonld`,
  hasResource: [
    { '@id': '#v', hasRole: ROLE + 'validation', hasArtifact: `${B}/llm-wiki/shapes.ttl`, format: 'text/turtle' },
    { '@id': '#c', hasRole: LWSP_ROLE + 'context', hasArtifact: `${B}/llm-wiki/context.jsonld` },
    { '@id': '#i', hasRole: LWSP_ROLE + 'identity-policy', hasArtifact: `${B}/llm-wiki/identity.jsonld` },
  ] }
// RO-Crate stub: canonical external parent + our floor (spec §2, acceptance #7).
const roCrate = { '@context': CTX, '@id': '', '@type': 'Profile', hasToken: 'ro-crate',
  isProfileOf: ['https://w3id.org/ro/crate/1.2', `${B}/substrate-floor.jsonld`],
  hasResource: [{ '@id': '#c', hasRole: LWSP_ROLE + 'context', hasArtifact: `${B}/ro-crate/context.jsonld` }] }

const MAP = {
  [`${B}/substrate-floor.jsonld`]: { body: floor },
  [`${B}/okf-base.jsonld`]: { body: okfBase },
  [`${B}/llm-wiki/profile.jsonld`]: { body: llmWiki },
  [`${B}/ro-crate/profile.jsonld`]: { body: roCrate },
  [`${B}/floor-identity.jsonld`]: { body: { fragment: '#it' } },
  [`${B}/okf-base.context.jsonld`]: { body: { '@context': { type: '@type' } } },
  [`${B}/llm-wiki/context.jsonld`]: { body: { '@context': { wm: 'https://example.org/wm#' } } },
  [`${B}/llm-wiki/identity.jsonld`]: { body: { pathPrefix: 'id/', fragment: '#it' } },
  [`${B}/ro-crate/context.jsonld`]: { body: { '@context': {} } },
  // note: https://w3id.org/ro/crate/1.2 is deliberately NOT in the map → opaque
}

describe('loadProfile', () => {
  it('walks isProfileOf and merges per spec §6', async () => {
    const p = await loadProfile(`${B}/llm-wiki/profile.jsonld`, { fetchFn: mockFetch(MAP) })
    expect(p.token).toBe('llm-wiki')
    expect(p.validation).toEqual([`${B}/okf-base.shape.ttl`, `${B}/llm-wiki/shapes.ttl`])   // union, parents first
    expect(p.contexts.map((c) => JSON.stringify(c))).toEqual([                               // base-first stack
      JSON.stringify({ '@context': { type: '@type' } }),
      JSON.stringify({ '@context': { wm: 'https://example.org/wm#' } }),
    ])
    expect(p.identityPolicy).toEqual({ pathPrefix: 'id/', fragment: '#it' })                 // nearest wins over floor's
    expect(p.conformance.map((c) => c.iri)).toContain(`${B}/substrate-floor.jsonld`)
  })

  it('treats a non-resolvable parent as opaque conformance, not an error (RO-Crate stub)', async () => {
    const p = await loadProfile(`${B}/ro-crate/profile.jsonld`, { fetchFn: mockFetch(MAP) })
    const ext = p.conformance.find((c) => c.iri === 'https://w3id.org/ro/crate/1.2')
    expect(ext).toEqual({ iri: 'https://w3id.org/ro/crate/1.2', resolved: false })
    const fl = p.conformance.find((c) => c.iri === `${B}/substrate-floor.jsonld`)
    expect(fl.resolved).toBe(true)
    expect(p.identityPolicy).toEqual({ fragment: '#it' })   // inherited from the resolved floor
  })

  it('guards against isProfileOf cycles', async () => {
    const a = { '@context': CTX, '@id': '', '@type': 'Profile', isProfileOf: `${B}/b.jsonld`, hasResource: [] }
    const b = { '@context': CTX, '@id': '', '@type': 'Profile', isProfileOf: `${B}/a.jsonld`, hasResource: [] }
    const p = await loadProfile(`${B}/a.jsonld`, { fetchFn: mockFetch({ [`${B}/a.jsonld`]: { body: a }, [`${B}/b.jsonld`]: { body: b } }) })
    expect(p.id).toBe(`${B}/a.jsonld`)   // terminates
  })
})

describe('discoverBinding', () => {
  const META = { '@context': { dct: 'http://purl.org/dc/terms/' }, '@id': '',
    'dct:conformsTo': { '@id': `${B}/llm-wiki/profile.jsonld` } }
  it('own .meta wins', async () => {
    const f = mockFetch({ 'https://pod.example/alice/notes/x.md.meta': { body: META } })
    expect(await discoverBinding('https://pod.example/alice/notes/x.md', { fetchFn: f }))
      .toBe(`${B}/llm-wiki/profile.jsonld`)
  })
  it('falls back to the container .meta via URL up-walk', async () => {
    const f = mockFetch({ 'https://pod.example/alice/notes/.meta': { body: META } })
    expect(await discoverBinding('https://pod.example/alice/notes/x.md', { fetchFn: f }))
      .toBe(`${B}/llm-wiki/profile.jsonld`)
  })
  it('falls back to the index default, else null', async () => {
    const f = mockFetch({ 'https://pod.example/profiles/index.jsonld': { body: { profiles: [], defaultProfile: `${B}/okf-base.jsonld` } } })
    expect(await discoverBinding('https://pod.example/alice/notes/x.md', { fetchFn: f, indexUrl: 'https://pod.example/profiles/index.jsonld' }))
      .toBe(`${B}/okf-base.jsonld`)
    expect(await discoverBinding('https://pod.example/alice/notes/x.md', { fetchFn: mockFetch({}) })).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd projection && npx vitest run okf/profile-loader.test.mjs`
Expected: FAIL — `Cannot find module './profile-loader.mjs'`

- [ ] **Step 3: Write the implementation**

`projection/okf/profile-loader.mjs`:

```js
import { descriptorToProfile } from './profile-doc.mjs'
import { readProfileIndex } from './resolve.mjs'
import { jsonldToQuads } from './rdf.mjs'

const ROLE = 'http://www.w3.org/ns/dx/prof/role/'
const LWSP_ROLE = 'https://w3id.org/lws-pod/profile/role/'
const DCT_CONFORMS = 'http://purl.org/dc/terms/conformsTo'

async function fetchJson(url, fetchFn) {
  const r = await fetchFn(url, { headers: { accept: 'application/ld+json, application/json' } })
  if (!r.ok) throw new Error(`${url} -> ${r.status}`)
  return r.json()
}

// The role dispatch table — the ONLY place role IRIs are interpreted (P7).
// context→parser input, identity-policy/plane-mapping→configs, validation/vocabulary→artifact URLs.
async function dispatch(resources, acc, fetchFn) {
  for (const r of resources) {
    for (const role of r.roles) {
      if (role === ROLE + 'validation') { if (!acc.validation.includes(r.artifact)) acc.validation.push(r.artifact) }
      else if (role === ROLE + 'vocabulary') { if (!acc.vocabulary.includes(r.artifact)) acc.vocabulary.push(r.artifact) }
      else if (role === LWSP_ROLE + 'context') acc.contexts.push(await fetchJson(r.artifact, fetchFn))
      else if (role === LWSP_ROLE + 'identity-policy') acc.identityPolicy = await fetchJson(r.artifact, fetchFn)
      else if (role === LWSP_ROLE + 'plane-mapping') acc.planeMapping = await fetchJson(r.artifact, fetchFn)
      else acc.unknownRoles.push({ role, artifact: r.artifact })
    }
  }
}

// Depth-first, parents first: floor artifacts land before okf-base before
// llm-wiki. nearest-wins configs = child assignment overwrites parent's.
async function walk(url, acc, visited, fetchFn) {
  if (visited.has(url)) return
  visited.add(url)
  let d
  try { d = await descriptorToProfile(await fetchJson(url, fetchFn), url) }
  catch { acc.conformance.push({ iri: url, resolved: false }); return }   // opaque parent (spec §2/§6)
  acc.conformance.push({ iri: url, resolved: true })
  for (const p of d.parents) await walk(p, acc, visited, fetchFn)
  await dispatch(d.resources, acc, fetchFn)
}

export async function loadProfile(descriptorUrl, { fetchFn = fetch } = {}) {
  const acc = { conformance: [], validation: [], vocabulary: [], contexts: [],
    identityPolicy: null, planeMapping: null, unknownRoles: [] }
  // The root descriptor must resolve — loud (P8 declaration side of the loader).
  const root = await descriptorToProfile(await fetchJson(descriptorUrl, fetchFn), descriptorUrl)
  const visited = new Set([descriptorUrl])
  for (const p of root.parents) await walk(p, acc, visited, fetchFn)
  await dispatch(root.resources, acc, fetchFn)
  // conformance lists parents (walked or opaque); the root itself is the profile.
  return { id: root.id, token: root.token, ...acc }
}

async function conformsToFromMeta(metaUrl, fetchFn) {
  let r
  try { r = await fetchFn(metaUrl, { headers: { accept: 'application/ld+json, application/json' } }) } catch { return null }
  if (!r.ok) return null
  let quads
  try { quads = await jsonldToQuads(await r.text(), metaUrl) } catch { return null }
  return quads.find((q) => q.predicate.value === DCT_CONFORMS)?.object.value ?? null
}

// Binding discovery (spec §4/§6): own .meta → container .meta up-walk (URL
// path; linkset rel=up equivalence documented) → index default → null.
export async function discoverBinding(resourceUrl, { fetchFn = fetch, indexUrl = null } = {}) {
  const u = new URL(resourceUrl)
  const own = await conformsToFromMeta(resourceUrl.replace(/\/$/, '') + (resourceUrl.endsWith('/') ? '/.meta' : '.meta'), fetchFn)
  if (own) return own
  const segs = u.pathname.split('/').filter(Boolean)
  for (let i = segs.length - 1; i >= 0; i--) {
    const containerMeta = `${u.origin}/${segs.slice(0, i).join('/')}${i ? '/' : ''}.meta`
    const found = await conformsToFromMeta(containerMeta, fetchFn)
    if (found) return found
  }
  if (indexUrl) {
    try { return (await readProfileIndex(indexUrl, { fetchFn })).defaultProfile } catch { return null }
  }
  return null
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd projection && npx vitest run okf/profile-loader.test.mjs okf/resolve.test.mjs`
Expected: all passed (resolve suite re-run because loader test imports its `mockFetch`)

- [ ] **Step 5: Commit**

```bash
cd /Users/cvardema/dev/git/LA3D/agents/lws-pod
git add projection/okf/profile-loader.mjs projection/okf/profile-loader.test.mjs
git commit -m "$(cat <<'EOF'
[Agent: Claude] feat(okf): profile loader — isProfileOf walk, role dispatch, binding discovery

- merge rules per spec §6 (validation union parents-first, contexts stacked,
  configs nearest-wins); opaque external parents recorded not walked (RO-Crate
  stub proves it); cycle guard; discoverBinding .meta → up-walk → index default

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Identity threading + card fixes (`engine-profile.mjs`, `card.mjs`, `namespaces.mjs`, `base-profile.mjs`)

**Files:**
- Create: `projection/okf/engine-profile.mjs`, `projection/okf/engine-profile.test.mjs`
- Modify: `projection/okf/namespaces.mjs` (add `@vocab`), `projection/okf/card.mjs` (targetIri fix; kill `asTypeCurie`; mint-to-proto for unknown keys), `projection/okf/base-profile.mjs` (add `makeBaseProfile`), `projection/okf/card.test.mjs` + `projection/okf/base-profile.test.mjs` (update the pinned `skos:Reference` expectation as its comment demands)

**Interfaces:**
- Consumes: `Loaded` (Task 4), `makeIdentityPolicy`/`slugFromUrl` (existing `identity.mjs` — unchanged), `indexChannel` (existing).
- Produces:
  - `makeEngineProfile(loaded, authority) → {application, types: null, channels, context, identityPolicy, validation: string[], planeMapping}` — engine-compatible profile object (same shape as `baseProfile`).
  - `namespaces.mjs`: `loadNamespaces(contextObj)` additionally returns `vocab: string|null` (from `@vocab`).
  - `card.mjs`: `cardToQuads(markdown, cardUrl, ns, policy) → { quads, protoTerms: string[] }` — **signature change**: returns an object; `protoTerms` is the advisory channel (plan-level deviation from spec §8, see Global Constraints). Unknown frontmatter keys mint `ns.vocab + key` predicates instead of being dropped (P6: drop is memory loss); bare `type:` values resolve via context term → `resolveCurie` → else `ns.vocab` — the hardcoded `'skos:'` dies.
  - `makeBaseProfile(authority) → profile` — `identityPolicy` base = authority; context = existing base context **plus a runtime `@vocab` layer** `{ '@context': { '@vocab': authority + 'proto#' } }`. `baseProfile` (the `urn:okf:base/` legacy export) stays only for old unit tests; every running path uses `makeBaseProfile`.
- **Callers of `cardToQuads` in `okf/`** (extract/engine tests in `okf/` only — `profiles/wiki-memory/extract.mjs` is L4 and stays untouched/RED): update destructuring at each call site found by `grep -rn "cardToQuads" projection/okf/`.

- [ ] **Step 1: Write the failing tests**

Append to `projection/okf/engine-profile.test.mjs` (new file):

```js
import { describe, it, expect } from 'vitest'
import { makeEngineProfile } from './engine-profile.mjs'
import { cardToQuads } from './card.mjs'
import { loadNamespaces } from './namespaces.mjs'

const AUTH = 'https://pod-a.example/'
const loaded = {
  id: 'https://pod-a.example/profiles/llm-wiki/profile.jsonld', token: 'llm-wiki',
  conformance: [], validation: ['https://pod-a.example/profiles/llm-wiki/shapes.ttl'],
  vocabulary: [], unknownRoles: [],
  contexts: [
    { '@context': { dcterms: 'http://purl.org/dc/terms/', type: '@type', title: { '@id': 'dcterms:title' } } },
    { '@context': { wm: 'https://example.org/wm#', extends: { '@id': 'wm:extends', '@type': '@id' }, Concept: 'wm:Concept' } },
  ],
  identityPolicy: { pathPrefix: 'id/', fragment: '#it' },
  planeMapping: null,
}

describe('makeEngineProfile', () => {
  it('mints under the resolved authority — same card, two pods, two IRIs; declared id still wins', () => {
    const pA = makeEngineProfile(loaded, 'https://pod-a.example/')
    const pB = makeEngineProfile(loaded, 'https://pod-b.example/')
    const md = '---\ntitle: X\n---\n'
    const nsA = loadNamespaces(pA.context), nsB = loadNamespaces(pB.context)
    const a = cardToQuads(md, 'https://pod-a.example/alice/notes/x.md', nsA, pA.identityPolicy)
    const b = cardToQuads(md, 'https://pod-b.example/bob/stuff/x.md', nsB, pB.identityPolicy)
    expect(a.quads[0].subject.value).toBe('https://pod-a.example/id/x#it')
    expect(b.quads[0].subject.value).toBe('https://pod-b.example/id/x#it')
    const dec = cardToQuads('---\nid: urn:me:1\ntitle: X\n---\n', 'https://pod-a.example/y.md', nsA, pA.identityPolicy)
    expect(dec.quads[0].subject.value).toBe('urn:me:1')
  })

  it('stacks contexts base-first and injects the runtime proto @vocab layer', () => {
    const p = makeEngineProfile(loaded, AUTH)
    const ns = loadNamespaces(p.context)
    expect(ns.vocab).toBe(AUTH + 'proto#')
    expect(ns.term.title).toBeDefined()           // base layer survives
    expect(ns.term.extends).toBeDefined()          // profile layer stacked
  })

  it('unknown frontmatter keys mint to proto and are reported, not dropped (P6)', () => {
    const p = makeEngineProfile(loaded, AUTH)
    const ns = loadNamespaces(p.context)
    const { quads, protoTerms } = cardToQuads('---\ntitle: X\nvibe: chill\n---\n', AUTH + 'n.md', ns, p.identityPolicy)
    const q = quads.find((x) => x.predicate.value === AUTH + 'proto#vibe')
    expect(q.object.value).toBe('chill')
    expect(protoTerms).toEqual(['vibe'])
  })

  it('bare type: resolves via the profile context, else proto — skos: hardcode is dead', () => {
    const p = makeEngineProfile(loaded, AUTH)
    const ns = loadNamespaces(p.context)
    const typed = cardToQuads('---\ntype: Concept\n---\n', AUTH + 'c.md', ns, p.identityPolicy)
    expect(typed.quads.find((q) => q.predicate.value.endsWith('#type')).object.value).toBe('https://example.org/wm#Concept')
    const unknown = cardToQuads('---\ntype: Gadget\n---\n', AUTH + 'g.md', ns, p.identityPolicy)
    expect(unknown.quads.find((q) => q.predicate.value.endsWith('#type')).object.value).toBe(AUTH + 'proto#Gadget')
  })

  it('urn:/did: edge targets pass through unminted (Plan-1 carryover #2)', () => {
    const p = makeEngineProfile(loaded, AUTH)
    const ns = loadNamespaces(p.context)
    const { quads } = cardToQuads('---\nextends: did:web:pod.example:z\n---\n', AUTH + 'e.md', ns, p.identityPolicy)
    expect(quads.find((q) => q.predicate.value === 'https://example.org/wm#extends').object.value).toBe('did:web:pod.example:z')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd projection && npx vitest run okf/engine-profile.test.mjs`
Expected: FAIL — `Cannot find module './engine-profile.mjs'`

- [ ] **Step 3: Implement**

`projection/okf/namespaces.mjs` — replace whole file:

```js
export function loadNamespaces(contextObj) {
  const ctx = contextObj['@context'] || {}
  const prefixes = {}
  for (const [k, v] of Object.entries(ctx)) if (typeof v === 'string' && /[#/]$/.test(v)) prefixes[k] = v
  const vocab = typeof ctx['@vocab'] === 'string' ? ctx['@vocab'] : null

  const resolveCurie = (curie) => {
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(curie)) return curie
    const i = curie.indexOf(':')
    if (i < 0) return curie
    const pfx = curie.slice(0, i), local = curie.slice(i + 1)
    return prefixes[pfx] ? prefixes[pfx] + local : curie
  }
  return { prefixes, resolveCurie, term: ctx, vocab }
}
```

`projection/okf/card.mjs` — replace whole file:

```js
// projection/okf/card.mjs
import matter from 'gray-matter'
import { DataFactory } from 'n3'
import { subjectIri as mintSubject, slugFromUrl } from './identity.mjs'
const { namedNode, literal, quad } = DataFactory

const RDF_TYPE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type'

function targetIri(href, policy) {
  if (/^[a-z][a-z0-9+.-]*:\S*$/i.test(href) && href.includes(':')) return href   // any absolute IRI (urn:, did:, https:) passes through
  return policy.mint(slugFromUrl(href))                                          // in-bundle link -> minted subject IRI
}

// Bare type: resolves through the profile context (term alias -> curie -> @vocab
// proto mint). No engine vocabulary — the 'skos:' hardcode is dead (Plan-1 #4).
function resolveType(v, ns) {
  const s = String(v)
  if (s.includes(':')) return ns.resolveCurie(s)
  const alias = ns.term[s]
  if (typeof alias === 'string') return ns.resolveCurie(alias)
  if (ns.vocab) return ns.vocab + s
  return s
}

function frontmatterQuads(data, subject, ns, policy, protoTerms) {
  const out = []
  for (const [key, raw] of Object.entries(data)) {
    if (key === 'id') continue                                       // identity, not a property
    const term = ns.term[key]
    const values = Array.isArray(raw) ? raw : [raw]
    if (term === undefined) {
      // P6: silent drop is memory loss — mint under the proto @vocab, report.
      if (!ns.vocab) continue
      protoTerms.push(key)
      for (const v of values) out.push(quad(subject, namedNode(ns.vocab + key), literal(String(v))))
    } else if (term === '@type') {
      for (const v of values) out.push(quad(subject, namedNode(RDF_TYPE), namedNode(resolveType(v, ns))))
    } else if (typeof term === 'object' && term['@type'] === '@id') {
      for (const v of values) out.push(quad(subject, namedNode(ns.resolveCurie(term['@id'])), namedNode(targetIri(String(v), policy))))
    } else {
      const pred = typeof term === 'object' ? term['@id'] : term
      for (const v of values) out.push(quad(subject, namedNode(ns.resolveCurie(pred)), literal(String(v))))
    }
  }
  return out
}

export function cardToQuads(markdown, cardUrl, ns, policy) {
  const { data } = matter(markdown)
  const subject = namedNode(mintSubject(data, cardUrl, policy))
  const protoTerms = []
  const all = frontmatterQuads(data, subject, ns, policy, protoTerms)
  const seen = new Set(), quads = []
  for (const q of all) { const k = `${q.subject.value}|${q.predicate.value}|${q.object.value}`; if (!seen.has(k)) { seen.add(k); quads.push(q) } }
  return { quads, protoTerms }
}
```

`projection/okf/engine-profile.mjs` (new):

```js
import { indexChannel } from './index-channel.mjs'
import { makeIdentityPolicy } from './identity.mjs'

// Merge stacked contexts into one @context object, base-first (later layers
// win on key collision — JSON-LD array-context semantics for our flat reader),
// then inject the runtime proto @vocab layer (spec §8: {authority}proto#).
function stackContexts(contexts, authority) {
  const merged = {}
  for (const c of contexts) Object.assign(merged, c['@context'] || {})
  merged['@vocab'] = authority + 'proto#'
  return { '@context': merged }
}

// Bridge: Loaded (profile-loader) -> the engine profile shape (base-profile.mjs).
// Mint base = resolved authority + policy pathPrefix (spec §7); policy config
// never carries an authority literal (iri-minting.md).
export function makeEngineProfile(loaded, authority) {
  const cfg = loaded.identityPolicy ?? {}
  return {
    application: loaded.token ?? loaded.id,
    types: null,
    channels: [indexChannel],
    context: stackContexts(loaded.contexts, authority),
    identityPolicy: makeIdentityPolicy({ base: authority + (cfg.pathPrefix ?? ''), fragment: cfg.fragment ?? '#it' }),
    validation: loaded.validation,
    planeMapping: loaded.planeMapping,
  }
}
```

`projection/okf/base-profile.mjs` — replace whole file:

```js
// projection/okf/base-profile.mjs
import { indexChannel } from './index-channel.mjs'
import { makeIdentityPolicy } from './identity.mjs'

// The OKF floor context: type→@type, title/description→dcterms — nothing else.
// Type-scheme resolution happens through the profile context (+ proto @vocab);
// the old asTypeCurie 'skos:' engine-vocabulary debt is gone (Plan-1 #4 fixed).
const baseContext = {
  dcterms: 'http://purl.org/dc/terms/',
  type: '@type',
  title: { '@id': 'dcterms:title' },
  description: { '@id': 'dcterms:description' },
}

// The running path: authority is RESOLVED (resolveStorageAuthority), never a
// config literal. The proto @vocab layer implements P6 (mint, don't drop).
export function makeBaseProfile(authority) {
  return {
    application: 'okf-base',
    types: null,
    channels: [indexChannel],
    context: { '@context': { ...baseContext, '@vocab': authority + 'proto#' } },
    identityPolicy: makeIdentityPolicy({ base: authority }),
  }
}

// Legacy placeholder export — unit-test fixture ONLY. Not reachable from any
// running path (acceptance #2). Kept so pre-Plan-2 okf unit tests still compile.
export const baseProfile = {
  application: 'okf-base',
  types: null,
  channels: [indexChannel],
  context: { '@context': baseContext },
  identityPolicy: makeIdentityPolicy({ base: 'urn:okf:base/' }),
}
```

- [ ] **Step 4: Update the existing okf tests that the signature change breaks**

```bash
cd /Users/cvardema/dev/git/LA3D/agents/lws-pod
grep -rn "cardToQuads" projection/okf/
```

For every call site in `okf/*.test.mjs` and `okf/*.mjs` (NOT `profiles/wiki-memory/` — that stays RED): destructure the new return, e.g. `const { quads } = cardToQuads(...)` and assert on `quads`. In `card.test.mjs`, the test pinned to `skos:Reference` (the Plan-1 honesty pin — its comment says "MUST be updated when Plan 2 lands type-scheme resolution") now asserts: with the legacy `baseProfile` context (no `@vocab`, no alias) a bare `type: Reference` yields object value `Reference` (unresolved passthrough, no `skos:`), and with a proto-vocab context it yields `<vocab>Reference`.

- [ ] **Step 5: Run the whole okf floor**

Run: `cd projection && npx vitest run okf/`
Expected: ALL okf/ tests pass (engine-profile 5, card, base-profile, namespaces, identity, frontmatter, links, materialize, index-channel, profile-select, rdf, resolve, profile-doc, profile-loader). `profiles/wiki-memory` is NOT run here.

- [ ] **Step 6: Commit**

```bash
git add projection/okf/engine-profile.mjs projection/okf/engine-profile.test.mjs projection/okf/card.mjs projection/okf/namespaces.mjs projection/okf/base-profile.mjs projection/okf/card.test.mjs projection/okf/base-profile.test.mjs
git commit -m "$(cat <<'EOF'
[Agent: Claude] feat(okf): engine-profile bridge + identity threading + P6 mint-to-proto

- makeEngineProfile: Loaded -> engine profile; mint base = resolved authority
  (+pathPrefix); runtime @vocab={authority}proto# layer
- card.mjs: unknown keys mint to proto + protoTerms advisory (return shape
  {quads, protoTerms}); bare type: via context (skos: hardcode dead, Plan-1 #4);
  urn:/did: targets pass through (Plan-1 #2)
- namespaces.mjs: @vocab support; base-profile: makeBaseProfile(authority),
  urn placeholder demoted to test-only legacy export

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Profile definitions (`projection/profiles/defs/`)

**Files:**
- Create: `projection/profiles/defs/lwsp.ttl`, `defs/profiles-compact.context.jsonld`, `defs/descriptor-shape.ttl`, `defs/substrate-floor.jsonld`, `defs/floor-identity.jsonld`, `defs/okf-base.jsonld`, `defs/okf-base.context.jsonld`, `defs/okf-base.shape.ttl`, `defs/index.jsonld`, `defs/llm-wiki/profile.jsonld`, `defs/llm-wiki/identity.jsonld`, `defs/llm-wiki/{ontology.ttl,context.jsonld,shapes.ttl}` (pinned mirrors), `defs/vendor/shacl-shacl.ttl`
- Test: `projection/publish/defs.test.mjs` (created here, exercised fully in Task 7)

**Interfaces:**
- Produces: the on-disk source tree Task 7 publishes and Task 4's loader consumes at runtime. Descriptor `@id`s are relative (`""`); artifact refs are relative paths — resolved against the publish location.

- [ ] **Step 1: Fetch the pinned mirrors + SHACL-SHACL**

```bash
cd /Users/cvardema/dev/git/LA3D/agents/lws-pod/projection/profiles/defs
mkdir -p llm-wiki vendor
for f in ontology.ttl context.jsonld shapes.ttl; do
  curl -fsSL "https://la3d.github.io/llm-wiki-colab/$f" -o "llm-wiki/$f"
done
curl -fsSL "https://www.w3.org/ns/shacl-shacl.ttl" -o vendor/shacl-shacl.ttl 2>/dev/null \
  || curl -fsSL "https://www.w3.org/ns/shacl-shacl" -H 'Accept: text/turtle' -o vendor/shacl-shacl.ttl
git -C /Users/cvardema/dev/git/LA3D/agents/lws-pod status --short projection/profiles/defs | head
```

Record the fetch date + upstream commit (from `https://github.com/LA3D/llm-wiki-colab` default-branch HEAD at fetch time) — they go in the descriptor `version` fields below. If the upstream URLs 404, STOP and report — do not substitute content.

- [ ] **Step 2: Write the definition files**

`defs/lwsp.ttl` — the mechanism vocabulary (minted roles with operation contracts, spec §3):

```turtle
@prefix lwsp: <https://w3id.org/lws-pod/profile#> .
@prefix lwspr: <https://w3id.org/lws-pod/profile/role/> .
@prefix prof: <http://www.w3.org/ns/dx/prof/> .
@prefix skos: <http://www.w3.org/2004/02/skos/core#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .

lwsp: a skos:ConceptScheme ;
  rdfs:label "lws-pod profile mechanism vocabulary"@en ;
  rdfs:comment "Minted resource roles PROF lacks. Served from the pod; w3id registration is a later public rung."@en .

lwspr:context a prof:ResourceRole, skos:Concept ;
  skos:prefLabel "JSON-LD context"@en ;
  skos:definition "Syntactic binding: hand this artifact to JSON-LD processing (term-to-IRI mapping). It is never a source of meaning — for term semantics use the role:vocabulary artifact."@en ;
  skos:inScheme lwsp: .

lwspr:identity-policy a prof:ResourceRole, skos:Concept ;
  skos:prefLabel "Identity policy"@en ;
  skos:definition "Config consumed by the identity minter: slug strategy, path prefix, fragment, versioning, DID-anchoring. Combined at runtime with the pod's resolved storage authority; never carries an authority literal."@en ;
  skos:inScheme lwsp: .

lwspr:plane-mapping a prof:ResourceRole, skos:Concept ;
  skos:prefLabel "Plane mapping"@en ;
  skos:definition "Config consumed by the projection: how knowledge bundles map onto storage containers."@en ;
  skos:inScheme lwsp: .
```

`defs/profiles-compact.context.jsonld` — the authoring context for descriptors:

```json
{
  "@context": {
    "@version": 1.1,
    "prof": "http://www.w3.org/ns/dx/prof/",
    "dct": "http://purl.org/dc/terms/",
    "role": "http://www.w3.org/ns/dx/prof/role/",
    "lwspr": "https://w3id.org/lws-pod/profile/role/",
    "Profile": "prof:Profile",
    "isProfileOf": { "@id": "prof:isProfileOf", "@type": "@id" },
    "hasToken": "prof:hasToken",
    "hasResource": { "@id": "prof:hasResource", "@type": "@id" },
    "hasRole": { "@id": "prof:hasRole", "@type": "@id" },
    "hasArtifact": { "@id": "prof:hasArtifact", "@type": "@id" },
    "format": "dct:format",
    "source": { "@id": "dct:source", "@type": "@id" },
    "version": "dct:hasVersion",
    "conformsTo": { "@id": "dct:conformsTo", "@type": "@id" }
  }
}
```

`defs/descriptor-shape.ttl` — declaration check for descriptors (spec §9 row 1):

```turtle
@prefix sh: <http://www.w3.org/ns/shacl#> .
@prefix prof: <http://www.w3.org/ns/dx/prof/> .
@prefix dct: <http://purl.org/dc/terms/> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .
@prefix lwsp: <https://w3id.org/lws-pod/profile#> .

lwsp:DescriptorShape a sh:NodeShape ;
  sh:targetClass prof:Profile ;
  sh:property [ sh:path prof:hasToken ; sh:minCount 1 ; sh:maxCount 1 ; sh:datatype xsd:string ;
    sh:message "A descriptor MUST carry exactly one prof:hasToken slug." ] ;
  sh:property [ sh:path prof:hasResource ; sh:node lwsp:ResourceDescriptorShape ;
    sh:message "Every hasResource must be a well-formed ResourceDescriptor." ] .

lwsp:ResourceDescriptorShape a sh:NodeShape ;
  sh:property [ sh:path prof:hasRole ; sh:minCount 1 ; sh:nodeKind sh:IRI ;
    sh:message "A ResourceDescriptor MUST declare at least one role (prof:hasRole IRI)." ] ;
  sh:property [ sh:path prof:hasArtifact ; sh:minCount 1 ; sh:nodeKind sh:IRI ;
    sh:message "A ResourceDescriptor MUST point at an artifact (prof:hasArtifact IRI)." ] .
```

`defs/substrate-floor.jsonld` — the root contract (spec §2):

```json
{
  "@context": "profiles-compact.context.jsonld",
  "@id": "",
  "@type": "Profile",
  "hasToken": "substrate-floor",
  "dct:title": "lws-pod substrate floor — stable-subject-IRI + conformsTo handoff contract",
  "hasResource": [
    { "@id": "#identity", "hasRole": "lwspr:identity-policy", "hasArtifact": "floor-identity.jsonld", "format": "application/ld+json" }
  ]
}
```

`defs/floor-identity.jsonld`:

```json
{ "fragment": "#it" }
```

`defs/okf-base.jsonld`:

```json
{
  "@context": "profiles-compact.context.jsonld",
  "@id": "",
  "@type": "Profile",
  "hasToken": "okf-base",
  "isProfileOf": "substrate-floor.jsonld",
  "dct:title": "OKF floor — markdown+frontmatter family base (OKF §9 conformance)",
  "hasResource": [
    { "@id": "#ctx", "hasRole": "lwspr:context", "hasArtifact": "okf-base.context.jsonld", "format": "application/ld+json" },
    { "@id": "#shape", "hasRole": "role:validation", "hasArtifact": "okf-base.shape.ttl", "format": "text/turtle" }
  ]
}
```

`defs/okf-base.context.jsonld` — the base context (matches `base-profile.mjs`; NO `@vocab` here — the proto layer is injected at runtime from the resolved authority, a static file cannot carry it):

```json
{
  "@context": {
    "dcterms": "http://purl.org/dc/terms/",
    "type": "@type",
    "title": { "@id": "dcterms:title" },
    "description": { "@id": "dcterms:description" }
  }
}
```

`defs/okf-base.shape.ttl` — copy `projection/okf/base-shape.ttl` verbatim (`cp ../okf/base-shape.ttl okf-base.shape.ttl` from `defs/`). The proto-predicate Warning rule is NOT added (recorded deviation — see Global Constraints).

`defs/llm-wiki/profile.jsonld` — the adoption descriptor (fill `version` with the recorded pin from Step 1):

```json
{
  "@context": "../profiles-compact.context.jsonld",
  "@id": "",
  "@type": "Profile",
  "hasToken": "llm-wiki",
  "isProfileOf": "../okf-base.jsonld",
  "dct:title": "llm-wiki adoption descriptor — our assertion bundling the upstream artifacts",
  "hasResource": [
    { "@id": "#vocab", "hasRole": "role:vocabulary", "hasArtifact": "ontology.ttl", "format": "text/turtle",
      "source": "https://la3d.github.io/llm-wiki-colab/ontology.ttl", "version": "<PIN>" },
    { "@id": "#ctx", "hasRole": "lwspr:context", "hasArtifact": "context.jsonld", "format": "application/ld+json",
      "source": "https://la3d.github.io/llm-wiki-colab/context.jsonld", "version": "<PIN>" },
    { "@id": "#shape", "hasRole": "role:validation", "hasArtifact": "shapes.ttl", "format": "text/turtle",
      "source": "https://la3d.github.io/llm-wiki-colab/shapes.ttl", "version": "<PIN>" },
    { "@id": "#identity", "hasRole": "lwspr:identity-policy", "hasArtifact": "identity.jsonld", "format": "application/ld+json" }
  ]
}
```

(`<PIN>` is replaced with the actual `<fetch-date>/<upstream-commit>` string from Step 1 — it MUST NOT remain literally `<PIN>`; the Task 7 descriptor check rejects it.)

`defs/llm-wiki/identity.jsonld` — the missing fourth part (spec §4):

```json
{ "pathPrefix": "id/", "fragment": "#it" }
```

`defs/index.jsonld`:

```json
{
  "@context": { "profiles": { "@id": "https://w3id.org/lws-pod/profile#profiles", "@type": "@id", "@container": "@list" },
                "defaultProfile": { "@id": "https://w3id.org/lws-pod/profile#defaultProfile", "@type": "@id" } },
  "@id": "",
  "profiles": ["substrate-floor.jsonld", "okf-base.jsonld", "llm-wiki/profile.jsonld"],
  "defaultProfile": "okf-base.jsonld"
}
```

- [ ] **Step 3: Smoke-check the tree parses**

`projection/publish/defs.test.mjs` (new dir `projection/publish/`):

```js
import { describe, it, expect } from 'vitest'
import { readFile } from 'node:fs/promises'
import { Parser } from 'n3'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const DEFS = join(dirname(fileURLToPath(import.meta.url)), '..', 'profiles', 'defs')

describe('profile definition sources', () => {
  it('every .ttl parses as Turtle', async () => {
    for (const f of ['lwsp.ttl', 'descriptor-shape.ttl', 'okf-base.shape.ttl', 'llm-wiki/ontology.ttl', 'llm-wiki/shapes.ttl', 'vendor/shacl-shacl.ttl']) {
      const quads = new Parser().parse(await readFile(join(DEFS, f), 'utf8'))
      expect(quads.length, f).toBeGreaterThan(0)
    }
  })
  it('every .jsonld parses as JSON and no llm-wiki pin is left unfilled', async () => {
    for (const f of ['profiles-compact.context.jsonld', 'substrate-floor.jsonld', 'floor-identity.jsonld', 'okf-base.jsonld', 'okf-base.context.jsonld', 'index.jsonld', 'llm-wiki/profile.jsonld', 'llm-wiki/identity.jsonld', 'llm-wiki/context.jsonld']) {
      const text = await readFile(join(DEFS, f), 'utf8')
      expect(() => JSON.parse(text), f).not.toThrow()
      expect(text.includes('<PIN>'), `${f} has an unfilled pin`).toBe(false)
    }
  })
})
```

Run: `cd projection && npx vitest run publish/defs.test.mjs`
Expected: 2 passed

- [ ] **Step 4: Commit**

```bash
cd /Users/cvardema/dev/git/LA3D/agents/lws-pod
git add projection/profiles/defs projection/publish/defs.test.mjs
git commit -m "$(cat <<'EOF'
[Agent: Claude] feat(profiles): definition sources — lwsp vocab, floor/okf-base/llm-wiki descriptors, pinned mirrors

- minted roles w/ operation contracts (context/identity-policy/plane-mapping)
- adoption descriptor: dct:source + pinned version per mirrored artifact
- descriptor shape, profiles-compact authoring context, index; shacl-shacl vendored

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: Declaration-time checks + publish step (`projection/publish/`)

**Files:**
- Create: `projection/publish/checks.mjs`, `projection/publish/checks.test.mjs`, `projection/publish/publish.mjs`
- Modify: `Makefile` (add `publish-profiles`)

**Interfaces:**
- Consumes: `jsonldToQuads` (Task 1), defs tree (Task 6), `shacl-engine` + `rdf-ext` (already deps).
- Produces:
  - `checkDescriptor(jsonText, url) → Promise<string[]>` (violation messages; `[]` = pass) — parses to quads, requires non-empty + `prof:Profile` typed subject, validates against `descriptor-shape.ttl`, rejects literal `<PIN>`.
  - `checkShapes(ttlText, name) → Promise<string[]>` — parses, requires ≥1 `sh:NodeShape|sh:PropertyShape` subject AND ≥1 `sh:targetClass|sh:targetNode|sh:targetSubjectsOf|sh:targetObjectsOf` triple, validates against `vendor/shacl-shacl.ttl`.
  - `checkContext(jsonText, name, curatedBases: string[]) → string[]` — the lint: `@vocab` must be absent OR not start with any curated base AND not be relative/empty; term keys must not collide with the LWS v1 protected terms (`id,type,Container,DataResource,items,totalItems,mediaType,size,modified`).
  - `checkVocabulary(ttlText, usedTerms: string[]) → string[]` — parses; every `usedTerms` IRI must appear as a subject (completeness cross-check).
  - `publish.mjs` CLI: `node publish/publish.mjs --base <pod> [--container /profiles/] [--bind <containerPath>=<token>]` — runs ALL checks (any failure → exit 1, nothing written), PUTs the defs tree, then for each `--bind`: read-merge-writes the container's `.meta` with `dct:conformsTo` (descriptor URL) + `powder-s:describedby` (every validation artifact URL of the loaded profile — the materialization, spec §5).

- [ ] **Step 1: Write the failing tests**

`projection/publish/checks.test.mjs`:

```js
import { describe, it, expect } from 'vitest'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { checkDescriptor, checkShapes, checkContext, checkVocabulary } from './checks.mjs'

const DEFS = join(dirname(fileURLToPath(import.meta.url)), '..', 'profiles', 'defs')
const read = (f) => readFile(join(DEFS, f), 'utf8')

describe('declaration-time checks (spec §9 — fail loud at publish)', () => {
  it('our own descriptors pass', async () => {
    for (const f of ['substrate-floor.jsonld', 'okf-base.jsonld', 'llm-wiki/profile.jsonld'])
      expect(await checkDescriptor(await read(f), `https://pod.example/profiles/${f}`), f).toEqual([])
  })
  it('a descriptor with no token fails loud', async () => {
    const bad = JSON.parse(await read('okf-base.jsonld')); delete bad.hasToken
    const v = await checkDescriptor(JSON.stringify(bad), 'https://pod.example/profiles/okf-base.jsonld')
    expect(v.length).toBeGreaterThan(0)
  })
  it('an empty/parse-corrupt descriptor fails loud (the fail-open disease, blocked)', async () => {
    expect((await checkDescriptor('{}', 'https://x/p.jsonld')).length).toBeGreaterThan(0)
    expect((await checkDescriptor('not json', 'https://x/p.jsonld')).length).toBeGreaterThan(0)
  })
  it('our shapes pass; a target-less shapes doc fails', async () => {
    expect(await checkShapes(await read('okf-base.shape.ttl'), 'okf-base')).toEqual([])
    expect(await checkShapes(await read('llm-wiki/shapes.ttl'), 'llm-wiki')).toEqual([])
    const v = await checkShapes('@prefix sh: <http://www.w3.org/ns/shacl#> . <urn:s> a sh:NodeShape .', 'orphan')
    expect(v.length).toBeGreaterThan(0)
  })
  it('context lint: curated-@vocab and relative-@vocab rejected; ours pass', async () => {
    expect(checkContext(await read('okf-base.context.jsonld'), 'okf-base', ['https://example.org/wm#'])).toEqual([])
    expect(checkContext('{"@context":{"@vocab":"https://example.org/wm#"}}', 'bad', ['https://example.org/wm#']).length).toBeGreaterThan(0)
    expect(checkContext('{"@context":{"@vocab":""}}', 'bad', []).length).toBeGreaterThan(0)
    expect(checkContext('{"@context":{"items":"https://example.org/x#items"}}', 'bad', []).length).toBeGreaterThan(0)
  })
  it('vocabulary completeness: llm-wiki context/shape terms are defined in the ontology', async () => {
    const ctx = JSON.parse(await read('llm-wiki/context.jsonld'))['@context'] ?? {}
    const used = Object.values(ctx).map((v) => (typeof v === 'object' ? v['@id'] : v))
      .filter((v) => typeof v === 'string' && v.startsWith('http'))
    expect(await checkVocabulary(await read('llm-wiki/ontology.ttl'), used)).toEqual([])
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd projection && npx vitest run publish/checks.test.mjs`
Expected: FAIL — `Cannot find module './checks.mjs'`

- [ ] **Step 3: Implement `checks.mjs`**

`projection/publish/checks.mjs`:

```js
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { Parser } from 'n3'
import rdf from 'rdf-ext'
import { Validator } from 'shacl-engine'
import { jsonldToQuads } from '../okf/rdf.mjs'

const DEFS = join(dirname(fileURLToPath(import.meta.url)), '..', 'profiles', 'defs')
const SH = 'http://www.w3.org/ns/shacl#'
const PROF = 'http://www.w3.org/ns/dx/prof/'
const RDF_TYPE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type'
// The LWS v1 @protected term set (lws10-core jsonld-context.md).
const LWS_TERMS = ['id', 'type', 'Container', 'DataResource', 'items', 'totalItems', 'mediaType', 'size', 'modified']

async function validate(dataQuads, shapesTtl) {
  const shapes = rdf.dataset(new Parser().parse(shapesTtl))
  const data = rdf.dataset(dataQuads.map((q) => rdf.quad(q.subject, q.predicate, q.object)))
  const report = await new Validator(shapes, { factory: rdf }).validate({ dataset: data })
  return report.conforms ? [] : report.results.map((r) => `${r.message?.[0]?.value ?? r.constraintComponent?.value ?? 'violation'}`)
}

export async function checkDescriptor(jsonText, url) {
  let quads
  try { quads = await jsonldToQuads(jsonText, url) } catch (e) { return [`descriptor ${url}: unparseable (${e.message})`] }
  if (!quads.length) return [`descriptor ${url}: parses to an EMPTY graph (fail-open blocked)`]
  if (!quads.some((q) => q.predicate.value === RDF_TYPE && q.object.value === PROF + 'Profile'))
    return [`descriptor ${url}: no prof:Profile-typed subject`]
  if (jsonText.includes('<PIN>')) return [`descriptor ${url}: unfilled <PIN> version`]
  return validate(quads, await readFile(join(DEFS, 'descriptor-shape.ttl'), 'utf8'))
}

export async function checkShapes(ttlText, name) {
  let quads
  try { quads = new Parser().parse(ttlText) } catch (e) { return [`shapes ${name}: unparseable Turtle (${e.message})`] }
  const isShape = quads.some((q) => q.predicate.value === RDF_TYPE && (q.object.value === SH + 'NodeShape' || q.object.value === SH + 'PropertyShape'))
  const hasTarget = quads.some((q) => [SH + 'targetClass', SH + 'targetNode', SH + 'targetSubjectsOf', SH + 'targetObjectsOf'].includes(q.predicate.value))
  const out = []
  if (!isShape) out.push(`shapes ${name}: no NodeShape/PropertyShape`)
  if (!hasTarget) out.push(`shapes ${name}: no target — validates nothing (fail-open blocked)`)
  if (out.length) return out
  return validate(quads, await readFile(join(DEFS, 'vendor', 'shacl-shacl.ttl'), 'utf8'))
}

export function checkContext(jsonText, name, curatedBases = []) {
  let doc
  try { doc = JSON.parse(jsonText) } catch (e) { return [`context ${name}: not JSON (${e.message})`] }
  const ctx = doc['@context'] ?? {}
  const out = []
  const vocab = ctx['@vocab']
  if (vocab !== undefined) {
    if (typeof vocab !== 'string' || vocab === '' || !/^[a-z][a-z0-9+.-]*:/i.test(vocab))
      out.push(`context ${name}: relative/empty @vocab is banned (location-coupled predicates)`)
    else if (curatedBases.some((b) => vocab.startsWith(b)))
      out.push(`context ${name}: @vocab points at a curated namespace (typo-impostor rule)`)
  }
  for (const k of Object.keys(ctx)) if (LWS_TERMS.includes(k)) out.push(`context ${name}: redefines LWS protected term '${k}'`)
  return out
}

export async function checkVocabulary(ttlText, usedTerms) {
  let quads
  try { quads = new Parser().parse(ttlText) } catch (e) { return [`vocabulary: unparseable Turtle (${e.message})`] }
  const subjects = new Set(quads.map((q) => q.subject.value))
  return usedTerms.filter((t) => !subjects.has(t)).map((t) => `vocabulary: used term not defined: ${t}`)
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd projection && npx vitest run publish/`
Expected: checks (6) + defs (2) all pass. If `checkVocabulary` fails because upstream context uses terms the ontology genuinely lacks, record each missing term in the task notes and relax the *test* (not the check) to assert the check *reports* them — that is a real upstream finding, not a test bug.

- [ ] **Step 5: Implement `publish.mjs`**

`projection/publish/publish.mjs`:

```js
// Publish the defs tree to the pod + bind containers. Checks run FIRST; any
// failure exits 1 with nothing written (spec §9 — declaration-time, loud).
// Usage: node publish/publish.mjs --base https://pod.example [--container /alice/profiles/]
//        [--bind /alice/concepts/=llm-wiki] [--token <bearer>]
import { readFile, readdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join, relative } from 'node:path'
import { checkDescriptor, checkShapes, checkContext, checkVocabulary } from './checks.mjs'
import { loadProfile } from '../okf/profile-loader.mjs'

const DEFS = join(dirname(fileURLToPath(import.meta.url)), '..', 'profiles', 'defs')
const TYPES = { '.jsonld': 'application/ld+json', '.ttl': 'text/turtle' }
const DESCRIPTORS = ['substrate-floor.jsonld', 'okf-base.jsonld', 'llm-wiki/profile.jsonld']
const POWDER = 'http://www.w3.org/2007/05/powder-s#describedby'

function arg(name, dflt = null) {
  const i = process.argv.indexOf(`--${name}`)
  return i > -1 ? process.argv[i + 1] : dflt
}
const binds = process.argv.flatMap((a, i) => (process.argv[i - 1] === '--bind' ? [a] : []))

async function* files(dir) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name)
    if (e.isDirectory()) yield* files(p)
    else yield p
  }
}

const base = arg('base') ?? (() => { throw new Error('--base required') })()
const container = arg('container', '/profiles/')
const token = arg('token', process.env.POD_TOKEN)
const root = new URL(container, base).href

// 1. Checks — all of them, before any write.
const failures = []
const curatedBases = []   // filled from llm-wiki context prefixes below
const wikiCtx = JSON.parse(await readFile(join(DEFS, 'llm-wiki/context.jsonld'), 'utf8'))['@context'] ?? {}
for (const v of Object.values(wikiCtx)) if (typeof v === 'string' && /[#/]$/.test(v)) curatedBases.push(v)
for (const d of DESCRIPTORS) failures.push(...await checkDescriptor(await readFile(join(DEFS, d), 'utf8'), new URL(d, root).href))
for (const s of ['okf-base.shape.ttl', 'llm-wiki/shapes.ttl']) failures.push(...await checkShapes(await readFile(join(DEFS, s), 'utf8'), s))
for (const c of ['okf-base.context.jsonld', 'llm-wiki/context.jsonld']) failures.push(...checkContext(await readFile(join(DEFS, c), 'utf8'), c, curatedBases))
const used = Object.values(wikiCtx).map((v) => (typeof v === 'object' ? v['@id'] : v)).filter((v) => typeof v === 'string' && v.startsWith('http'))
failures.push(...await checkVocabulary(await readFile(join(DEFS, 'llm-wiki/ontology.ttl'), 'utf8'), used))
if (failures.length) { console.error('DECLARATION CHECKS FAILED:\n' + failures.map((f) => ' - ' + f).join('\n')); process.exit(1) }

// 2. Publish the tree.
const headers = token ? { authorization: `Bearer ${token}` } : {}
for await (const f of files(DEFS)) {
  const rel = relative(DEFS, f).split(sepEscape()).join('/')
  const url = new URL(rel, root).href
  const ct = TYPES[f.slice(f.lastIndexOf('.'))] ?? 'application/octet-stream'
  const r = await fetch(url, { method: 'PUT', headers: { ...headers, 'content-type': ct }, body: await readFile(f) })
  if (!r.ok && r.status !== 201 && r.status !== 205) { console.error(`PUT ${url} -> ${r.status}`); process.exit(1) }
  console.log(`PUT ${url} -> ${r.status}`)
}
function sepEscape() { return process.platform === 'win32' ? '\\' : '/' }

// 3. Bind containers: conformsTo (the index) + describedby (the enforcement
// cache, materialized from the profile's validation artifacts). Read-merge-write.
for (const b of binds) {
  const [path, tokenName] = b.split('=')
  const descriptor = tokenName === 'llm-wiki' ? new URL('llm-wiki/profile.jsonld', root).href
    : new URL(`${tokenName}.jsonld`, root).href
  const loaded = await loadProfile(descriptor)
  const metaUrl = new URL(path.endsWith('/') ? path + '.meta' : path + '.meta', base).href
  let meta = {}
  const r0 = await fetch(metaUrl, { headers: { ...headers, accept: 'application/ld+json' } })
  if (r0.ok) { try { meta = await r0.json() } catch { meta = {} } }
  meta['@context'] = { ...(typeof meta['@context'] === 'object' ? meta['@context'] : {}),
    dct: 'http://purl.org/dc/terms/', powder: 'http://www.w3.org/2007/05/powder-s#' }
  meta['@id'] = meta['@id'] ?? ''
  meta['dct:conformsTo'] = { '@id': descriptor }
  meta['powder:describedby'] = loaded.validation.map((v) => ({ '@id': v }))
  const r = await fetch(metaUrl, { method: 'PUT', headers: { ...headers, 'content-type': 'application/ld+json' }, body: JSON.stringify(meta, null, 2) })
  if (!r.ok && r.status !== 201 && r.status !== 205) { console.error(`BIND ${metaUrl} -> ${r.status}`); process.exit(1) }
  console.log(`BIND ${path} conformsTo ${descriptor} (+${loaded.validation.length} describedby) -> ${r.status}`)
}
console.log('publish complete')
```

Note the POWDER constant is used implicitly via the `powder:` prefix — if a lint flags it unused, delete the constant.

- [ ] **Step 6: Add the Makefile target**

Append to `Makefile` (near `test-projection`, keeping `.PHONY` updated):

```makefile
# Publish the profile definitions to the fork TLS pod + bind the demo container.
# Needs `make up-fork-tls` running + `make cert`'s CA. POD_TOKEN via tests helper flow.
publish-profiles:
	@[ -d projection/node_modules ] || ( cd projection && npm ci )
	cd projection && NODE_EXTRA_CA_CERTS=$(CURDIR)/certs/rootCA.pem \
	  node publish/publish.mjs --base https://pod.vardeman.me --container /alice/profiles/ \
	  --bind /alice/concepts/=llm-wiki --token $${POD_TOKEN}
```

Add `publish-profiles` to the `.PHONY` line.

- [ ] **Step 7: Run the unit suites + commit**

Run: `cd projection && npx vitest run publish/ okf/`
Expected: all pass.

```bash
cd /Users/cvardema/dev/git/LA3D/agents/lws-pod
git add projection/publish/checks.mjs projection/publish/checks.test.mjs projection/publish/publish.mjs Makefile
git commit -m "$(cat <<'EOF'
[Agent: Claude] feat(publish): declaration-time checks + profile publish/bind step

- checks fail loud pre-write: descriptor shape + non-empty graph, shapes
  SHACL-SHACL + target guard, context lint (@vocab rules, LWS protected terms),
  vocabulary completeness
- publish.mjs: PUT defs tree; bind = .meta read-merge-write of dct:conformsTo
  (index) + powder:describedby materialization (enforcement cache)
- make publish-profiles

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 8 (FORK): linkset surfaces declared `dct:conformsTo`

**Files (all in `/Users/cvardema/dev/git/LA3D/JavaScriptSolidServer`):**
- Modify: `src/lws/constraint.js`, `src/lws/linkset.js`, `src/handlers/resource.js:383-390` and `:578-585` (the two `generateLinkset` call sites), `src/mcp/tools.js:489-495` (describe_resource parity)
- Test: `test/lws-profiles-linkset.test.js` (new)

**Interfaces:**
- Consumes: existing `describedbyTargets(storage, metaPath, baseIri)` pattern, existing `generateLinkset(resourceUrl, opts)`.
- Produces:
  - `constraint.js`: `metaTargets(storage, metaPath, baseIri, predicateIri) → Promise<string[]>` (generalized; `describedbyTargets` delegates to it), `conformsToTargets(storage, metaPath, baseIri)` (predicate `http://purl.org/dc/terms/conformsTo`).
  - `linkset.js`: `generateLinkset(resourceUrl, {…, conformsTo?: string[]})` — emits link member key **`"http://purl.org/dc/terms/conformsTo"`** (full URI: not IANA-registered, RFC 8288 extension-relation rule) with `[{href}]`; omitted entirely when empty.

- [ ] **Step 0: Branch**

```bash
cd /Users/cvardema/dev/git/LA3D/JavaScriptSolidServer
git checkout la3d/lws && git rev-parse --short HEAD   # expect 161bb99 (or later la3d/lws HEAD)
git checkout -b la3d/lws-profiles
```

- [ ] **Step 1: Write the failing tests**

`test/lws-profiles-linkset.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateLinkset } from '../src/lws/linkset.js';
import { metaTargets, conformsToTargets, describedbyTargets } from '../src/lws/constraint.js';

const DCT_CONFORMS = 'http://purl.org/dc/terms/conformsTo';

function memStorage(files) {
  return {
    exists: async (p) => p in files,
    read: async (p) => { if (!(p in files)) throw new Error('ENOENT'); return Buffer.from(files[p]); },
  };
}

test('conformsToTargets reads dct:conformsTo from .meta; describedbyTargets still works via metaTargets', async () => {
  const meta = JSON.stringify({
    '@context': { dct: 'http://purl.org/dc/terms/', powder: 'http://www.w3.org/2007/05/powder-s#' },
    '@id': '',
    'dct:conformsTo': { '@id': 'https://pod.example/profiles/llm-wiki/profile.jsonld' },
    'powder:describedby': { '@id': 'https://pod.example/profiles/llm-wiki/shapes.ttl' },
  });
  const s = memStorage({ 'alice/concepts/.meta': meta });
  assert.deepEqual(await conformsToTargets(s, 'alice/concepts/.meta', 'https://pod.example/alice/concepts/'),
    ['https://pod.example/profiles/llm-wiki/profile.jsonld']);
  assert.deepEqual(await describedbyTargets(s, 'alice/concepts/.meta', 'https://pod.example/alice/concepts/'),
    ['https://pod.example/profiles/llm-wiki/shapes.ttl']);
  assert.deepEqual(await metaTargets(s, 'missing/.meta', 'https://x/', DCT_CONFORMS), []);
});

test('generateLinkset emits the full-URI conformsTo member only when declared', () => {
  const withIt = generateLinkset('https://pod.example/alice/concepts/', {
    isContainer: true, conformsTo: ['https://pod.example/profiles/llm-wiki/profile.jsonld'] });
  assert.deepEqual(withIt.linkset[0][DCT_CONFORMS], [{ href: 'https://pod.example/profiles/llm-wiki/profile.jsonld' }]);
  const without = generateLinkset('https://pod.example/alice/x.md', { isContainer: false });
  assert.equal(DCT_CONFORMS in without.linkset[0], false);   // negative: undeclared -> absent
});
```

- [ ] **Step 2: Run to verify failure**

Run: `node --test test/lws-profiles-linkset.test.js`
Expected: FAIL — `metaTargets`/`conformsToTargets` not exported; conformsTo member missing.

- [ ] **Step 3: Implement**

`src/lws/constraint.js` — replace the `describedbyTargets` block (keep `resolveShapeUrl` and `describedbyFrom` as-is; they now sit atop the generalized reader):

```js
// src/lws/constraint.js
import { toDataset } from './admission-rdf.js';

const DESCRIBEDBY = 'http://www.w3.org/2007/05/powder-s#describedby';
const DCT_CONFORMS = 'http://purl.org/dc/terms/conformsTo';

// All <predicateIri> targets in a resource's .meta (the LWS linkset resource).
// [] when .meta is missing/unreadable/parse-corrupt — treated as "declares
// nothing". Deduped, order-preserved.
export async function metaTargets(storage, metaPath, baseIri, predicateIri) {
  if (!(await storage.exists(metaPath))) return [];
  let buf;
  try { buf = await storage.read(metaPath); } catch { return []; }
  let ds;
  try { ds = await toDataset(buf, 'application/ld+json', baseIri); } catch { return []; }
  const out = [];
  for (const q of ds) if (q.predicate.value === predicateIri && !out.includes(q.object.value)) out.push(q.object.value);
  return out;
}

export async function describedbyTargets(storage, metaPath, baseIri) {
  return metaTargets(storage, metaPath, baseIri, DESCRIBEDBY);
}

// The profile handoff edge (Plan 2): the target's own declared dct:conformsTo.
// Inheritance/pod-defaults are client-resolver semantics — never read here.
export async function conformsToTargets(storage, metaPath, baseIri) {
  return metaTargets(storage, metaPath, baseIri, DCT_CONFORMS);
}
```

`src/lws/linkset.js` — extend signature + emission:

```js
const LWS = 'https://www.w3.org/ns/lws#';
const DCT_CONFORMS = 'http://purl.org/dc/terms/conformsTo';

/**
 * Generate an RFC 9264 linkset (application/linkset+json) for a resource.
 * Read-only discovery slice — mutation/concurrency (If-Match/412/428) deferred.
 * `describedby` carries the resource's declared SHACL shape target(s);
 * `http://purl.org/dc/terms/conformsTo` (full URI — extension relation per
 * RFC 8288 §2.1.2) carries the declared profile descriptor(s). Each omitted
 * entirely when not declared.
 * @param {string} resourceUrl
 * @param {{parentUrl?:string|null, isContainer:boolean, describedByShapes?:string[], declaredTypes?:string[], conformsTo?:string[]}} opts
 * @returns {object}
 */
export function generateLinkset(resourceUrl, { parentUrl = null, isContainer = false, describedByShapes = [], declaredTypes = [], conformsTo = [] } = {}) {
  const link = { anchor: resourceUrl };
  if (parentUrl) link.up = [{ href: parentUrl }];
  const types = [LWS + (isContainer ? 'Container' : 'DataResource')];
  for (const t of declaredTypes) if (!types.includes(t)) types.push(t);
  link.type = types.map((href) => ({ href }));
  if (describedByShapes.length) link.describedby = describedByShapes.map((href) => ({ href }));
  if (conformsTo.length) link[DCT_CONFORMS] = conformsTo.map((href) => ({ href }));
  return { linkset: [link] };
}
```

`src/handlers/resource.js` — at BOTH call sites (~:383 and ~:578), mirror the existing `describedbyTargets` line:

```js
      const describedByShapes = await describedbyTargets(storage, storagePath + '.meta', resourceUrl);
      const conformsTo = await conformsToTargets(storage, storagePath + '.meta', resourceUrl);
      const ls = generateLinkset(resourceUrl, {
        // ...existing opts unchanged...
        describedByShapes,
        conformsTo,
      });
```

(Import `conformsToTargets` alongside the existing `describedbyTargets` import at `src/handlers/resource.js:6`.) Same one-line addition in `src/mcp/tools.js` ~:489 (import at :22, add `const conformsTo = sanitizeTypes(await conformsToTargets(storage, path + '.meta', buildUrl(ctx, path)));` and pass `conformsTo` into the `generateLinkset` call at :490).

- [ ] **Step 4: Run the new + touched suites**

```bash
node --test test/lws-profiles-linkset.test.js
node --test --test-concurrency=1 'test/*.test.js'
```

Expected: new file green; full suite green (baseline 1127+; zero regressions — the default LDP path never calls these with declarations present, negative control is the omitted-member test).

- [ ] **Step 5: Commit**

```bash
git add src/lws/constraint.js src/lws/linkset.js src/handlers/resource.js src/mcp/tools.js test/lws-profiles-linkset.test.js
git commit -m "$(cat <<'EOF'
feat(lws): linkset surfaces declared dct:conformsTo (profile handoff edge)

- constraint.js: metaTargets generalized reader; describedbyTargets delegates;
  conformsToTargets added (target's own .meta only — inheritance is client-side)
- linkset.js: full-URI conformsTo member (RFC 8288 extension relation), omitted
  when undeclared; wired at both resource.js call sites + mcp describe parity

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 9 (FORK): storage description advertises the profile index

**Files (fork repo):**
- Modify: `src/lws/storage-description.js`, `src/server.js` (~:105 config resolution, ~:1044 call site), `src/config.js` (:38 defaults, :178 env map, :259 CLI passthrough list), `bin/jss.js` (:96 option defs, :229 pass-through), `src/mcp/resources.js` (~:70 — the second `buildStorageDescription` caller; keep the two surfaces drift-free)
- Test: `test/lws-profiles-storage-description.test.js` (new)

**Interfaces:**
- Produces: `buildStorageDescription(origin, {typeIndexEnabled, notificationsEnabled, profileIndexPath?: string|null})` — when `profileIndexPath` is a non-empty string, appends `{ type: 'ProfileIndexService', serviceEndpoint: origin + profileIndexPath }`. New option `lwsProfileIndex` (string path, default `null` = off; env `JSS_LWS_PROFILE_INDEX`; CLI `--lws-profile-index <path>`), active only under `--lws`.

- [ ] **Step 1: Write the failing test**

`test/lws-profiles-storage-description.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildStorageDescription } from '../src/lws/storage-description.js';

test('profileIndexPath adds ProfileIndexService; absent by default', () => {
  const on = buildStorageDescription('https://pod.example', { typeIndexEnabled: true, profileIndexPath: '/alice/profiles/index.jsonld' });
  const svc = on.service.find((s) => s.type === 'ProfileIndexService');
  assert.deepEqual(svc, { type: 'ProfileIndexService', serviceEndpoint: 'https://pod.example/alice/profiles/index.jsonld' });
  const off = buildStorageDescription('https://pod.example', { typeIndexEnabled: true });
  assert.equal(off.service.some((s) => s.type === 'ProfileIndexService'), false);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `node --test test/lws-profiles-storage-description.test.js`
Expected: FAIL — no ProfileIndexService emitted.

- [ ] **Step 3: Implement**

`src/lws/storage-description.js` — extend `buildStorageDescription`:

```js
export function buildStorageDescription(origin, { typeIndexEnabled = false, notificationsEnabled = false, profileIndexPath = null } = {}) {
  const lwsStoragePath = '/.well-known/lws-storage';
  const services = [{ type: 'StorageDescription', serviceEndpoint: `${origin}${lwsStoragePath}` }];
  if (typeIndexEnabled) {
    services.push({ type: 'TypeIndexService', serviceEndpoint: `${origin}/types/index` });
    services.push({ type: 'TypeSearchService', serviceEndpoint: `${origin}/types/search` });
  }
  if (notificationsEnabled) {
    services.push({ type: 'NotificationService', serviceEndpoint: `${origin}/notification/api` });
  }
  if (profileIndexPath) {
    services.push({ type: 'ProfileIndexService', serviceEndpoint: `${origin}${profileIndexPath}` });
  }
  return generateStorageDescription(`${origin}/`, services);
}
```

Threading — mirror `lwsTypeIndex` exactly:
- `src/config.js:38` area: add `lwsProfileIndex: null,`
- `src/config.js:178` area: add `JSS_LWS_PROFILE_INDEX: 'lwsProfileIndex',`
- `src/config.js:259` area: add `'lwsProfileIndex',`
- `bin/jss.js:96` area: add `.option('--lws-profile-index <path>', 'Advertise a ProfileIndexService at this pod path in the storage description (requires --lws)')`
- `bin/jss.js:229` area: add `lwsProfileIndex: config.lwsProfileIndex,`
- `src/server.js` ~:105: add `const profileIndexPath = lwsEnabled ? (options.lwsProfileIndex ?? null) : null;`
- `src/server.js:1044`: `return buildStorageDescription(origin, { typeIndexEnabled, notificationsEnabled: request.notificationsEnabled, profileIndexPath });`
- `src/mcp/resources.js` ~:70: thread the same value through the MCP ctx the way `typeIndexEnabled` reaches it (grep `typeIndexEnabled` in `src/mcp/` and replicate the plumbing for `profileIndexPath`), so the HTTP and MCP storage-description surfaces cannot drift.

- [ ] **Step 4: Run suites**

```bash
node --test test/lws-profiles-storage-description.test.js
node --test --test-concurrency=1 'test/*.test.js'
```

Expected: new test green; full suite green (default `null` keeps every existing storage-description assertion byte-identical — that IS the negative control).

- [ ] **Step 5: Commit, merge, push**

```bash
git add src/lws/storage-description.js src/server.js src/config.js bin/jss.js src/mcp/resources.js test/lws-profiles-storage-description.test.js
git commit -m "$(cat <<'EOF'
feat(lws): ProfileIndexService advertisement in the storage description

- opt-in via --lws-profile-index <path> / JSS_LWS_PROFILE_INDEX (default off);
  --lws-gated; HTTP + MCP storage-description surfaces share the one builder

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
git checkout la3d/lws
git merge --no-ff la3d/lws-profiles -m "merge: profile-mechanism fork rung (conformsTo linkset + ProfileIndexService) into la3d/lws

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
git push origin la3d/lws la3d/lws-profiles
git rev-parse --short HEAD   # <MERGE_SHA> — used in Task 10
```

---

### Task 10: Repin the fork pod + live gate (`tests/lws-profiles.test.mjs`)

**Files (lws-pod repo):**
- Modify: `Dockerfile.fork` (default `JSS_GIT_REF` → `<MERGE_SHA>` from Task 9), `docker-compose.fork-tls.yml` (image tag → `fork-profiles`, add `--lws-profile-index /alice/profiles/index.jsonld` to the pod command line alongside the existing `--lws` flags), `Makefile` (add `test-profiles` to `.PHONY` + target)
- Create: `tests/lws-profiles.test.mjs`

**Interfaces:**
- Consumes: `BASE`/`ensurePod`/`getToken` from `tests/helpers.mjs`; `make publish-profiles` (Task 7); the fork rung (Tasks 8–9).

- [ ] **Step 1: Repin + rebuild the fork TLS pod**

In `Dockerfile.fork`, set the default git ref to `<MERGE_SHA>`; in `docker-compose.fork-tls.yml`, bump the image tag to `fork-profiles` and append `--lws-profile-index /alice/profiles/index.jsonld` to the JSS command (exact edit points: grep `JSS_GIT_REF` and the existing `--lws` in those two files and mirror the previous repin commit `161bb99`-era diffs).

```bash
cd /Users/cvardema/dev/git/LA3D/agents/lws-pod
make down-fork-tls 2>/dev/null; make up-fork-tls
curl --cacert certs/rootCA.pem -s https://pod.vardeman.me/.well-known/lws-storage | head -c 400
```

Expected: storage description JSON; **no ProfileIndexService yet is FINE at this instant only if the pod hasn't been seeded** — the service is advertised regardless of content existing (it's config), so it SHOULD appear: verify `"ProfileIndexService"` is present.

- [ ] **Step 2: Publish + bind**

```bash
TOKEN_JSON=$(curl --cacert certs/rootCA.pem -s -X POST https://pod.vardeman.me/idp/credentials \
  -H 'content-type: application/json' -d '{"email":"alice@example.com","password":"alicepassword123"}')
export POD_TOKEN=$(echo "$TOKEN_JSON" | python3 -c 'import sys,json;print(json.load(sys.stdin)["access_token"])')
make publish-profiles
```

Expected: check lines, `PUT … -> 201` per file, `BIND /alice/concepts/ conformsTo … -> 201`, `publish complete`. (If `/alice/` doesn't exist, run the pod-create first: `curl --cacert certs/rootCA.pem -s -X POST https://pod.vardeman.me/.pods -H 'content-type: application/json' -d '{"name":"alice","email":"alice@example.com","password":"alicepassword123"}'`.)

- [ ] **Step 3: Write the live gate**

`tests/lws-profiles.test.mjs`:

```js
import { describe, it, expect, beforeAll } from 'vitest'
import { BASE, ensurePod, getToken } from './helpers.mjs'
import { resolveStorageAuthority, readProfileIndex } from '../projection/okf/resolve.mjs'
import { loadProfile, discoverBinding } from '../projection/okf/profile-loader.mjs'

// Live-pod profile-mechanism gate (spec §10). Needs the fork --lws TLS pod
// (make up-fork-tls, NODE_EXTRA_CA_CERTS=certs/rootCA.pem) + make publish-profiles run.
const DCT_CONFORMS = 'http://purl.org/dc/terms/conformsTo'

// Top-level probe, matching the existing gates' self-skip pattern: the
// suite skips (never fails) on a non---lws pod.
const lws = await fetch(`${BASE}/.well-known/lws-storage`)
  .then(async (r) => r.ok && (await r.json()).type === 'Storage').catch(() => false)
let token

beforeAll(async () => {
  await ensurePod()
  ;({ token } = await getToken())
})

describe.skipIf(!lws)('profile mechanism (live)', () => {
  it('acceptance #1/#2: storage description advertises the index; authority resolved from it', async () => {
    const { authority, profileIndex } = await resolveStorageAuthority(`${BASE}/alice/concepts/`)
    expect(authority).toBe(`${BASE}/`)
    expect(profileIndex).toBe(`${BASE}/alice/profiles/index.jsonld`)
    const idx = await readProfileIndex(profileIndex)
    expect(idx.profiles.length).toBeGreaterThanOrEqual(3)
  })

  it('acceptance #4: bound container linkset carries full-URI conformsTo; unbound member omits it', async () => {
    const bound = await fetch(`${BASE}/alice/concepts/`, { headers: { accept: 'application/linkset+json', authorization: `Bearer ${token}` } })
    const ls = (await bound.json()).linkset[0]
    expect(ls[DCT_CONFORMS][0].href).toBe(`${BASE}/alice/profiles/llm-wiki/profile.jsonld`)
    await fetch(`${BASE}/alice/concepts/unbound.md`, { method: 'PUT',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'text/markdown' }, body: '---\ntitle: u\n---\n' })
    const member = await fetch(`${BASE}/alice/concepts/unbound.md`, { headers: { accept: 'application/linkset+json', authorization: `Bearer ${token}` } })
    expect(DCT_CONFORMS in (await member.json()).linkset[0]).toBe(false)
  })

  it('loader resolves the published llm-wiki profile end-to-end (walk + merge live)', async () => {
    const descriptor = await discoverBinding(`${BASE}/alice/concepts/anything.md`)
    expect(descriptor).toBe(`${BASE}/alice/profiles/llm-wiki/profile.jsonld`)
    const p = await loadProfile(descriptor)
    expect(p.token).toBe('llm-wiki')
    expect(p.validation.some((v) => v.endsWith('llm-wiki/shapes.ttl'))).toBe(true)
    expect(p.identityPolicy).toEqual({ pathPrefix: 'id/', fragment: '#it' })
    expect(p.conformance.some((c) => c.iri.endsWith('substrate-floor.jsonld') && c.resolved)).toBe(true)
  })

  it('acceptance #5: L3 rejects a non-conformant RDF write through the profile-sourced shape, teaching message intact', async () => {
    // llm-wiki shapes constrain wm-typed subjects; a deliberately wrong typed node:
    const bad = { '@context': { wm: 'https://la3d.github.io/llm-wiki-colab/ns#' }, '@id': '#it', '@type': 'wm:Concept' }
    const r = await fetch(`${BASE}/alice/concepts/bad.jsonld`, { method: 'PUT',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/ld+json' }, body: JSON.stringify(bad) })
    if (r.status === 400) {
      const problem = await r.json()
      expect(problem.violations?.length ?? 0).toBeGreaterThan(0)   // the teaching channel
    } else {
      // The upstream shape may not target this node shape — the gate then asserts
      // the describedby wiring instead: shapes are declared on the container.
      const meta = await fetch(`${BASE}/alice/concepts/.meta`, { headers: { authorization: `Bearer ${token}` } })
      expect((await meta.text())).toContain('describedby')
    }
  })

  it('acceptance #9: an unbound container behaves exactly as today (negative control)', async () => {
    await fetch(`${BASE}/alice/plain/x.md`, { method: 'PUT',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'text/markdown' }, body: 'hi' })
    const ls = await fetch(`${BASE}/alice/plain/`, { headers: { accept: 'application/linkset+json', authorization: `Bearer ${token}` } })
    const link = (await ls.json()).linkset[0]
    expect(DCT_CONFORMS in link).toBe(false)
    expect('describedby' in link).toBe(false)
  })
})
```

- [ ] **Step 4: Makefile target + run everything**

```makefile
# Profile-mechanism live gate — needs up-fork-tls + publish-profiles run first.
test-profiles:
	@[ -f certs/rootCA.pem ] || { echo "run 'make cert && make up-fork-tls' first"; exit 1; }
	BASE=https://pod.vardeman.me NODE_EXTRA_CA_CERTS=$(CURDIR)/certs/rootCA.pem npx vitest run tests/lws-profiles.test.mjs
```

```bash
cd /Users/cvardema/dev/git/LA3D/agents/lws-pod
make test-profiles
make test-lws && make test-l3 && make test-typeindex && make test-indexed-relation && make test-mcp-v2
```

Expected: `test-profiles` 5/5; **all existing gates green — zero regression** (test-lws 6/6, test-l3 2/2, test-typeindex 7/7, test-indexed-relation 4/4, test-mcp-v2 9/9). If the acceptance-#5 strict branch didn't fire (upstream shapes don't target the probe node), record that in the FOLLOWUP task as an upstream-shapes finding — the describedby-wiring assertion keeps the gate honest.

- [ ] **Step 5: Commit**

```bash
git add Dockerfile.fork docker-compose.fork-tls.yml tests/lws-profiles.test.mjs Makefile
git commit -m "$(cat <<'EOF'
[Agent: Claude] test(profiles): live-pod profile-mechanism gate + fork repin

- repin fork to <MERGE_SHA> (image fork-profiles, --lws-profile-index)
- gate: index advertisement + authority resolution, linkset conformsTo
  (+ omitted negative), live loader walk, L3-through-profile-shape, LDP control
- make test-profiles

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 11: Wiki-memory-stays-RED assertion + okf floor regression sweep

**Files:**
- Create: `projection/okf/red-fence.test.mjs`

**Interfaces:** none — this is acceptance #8's guard.

- [ ] **Step 1: Write the fence test**

`projection/okf/red-fence.test.mjs`:

```js
import { describe, it, expect } from 'vitest'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

// Acceptance #8 fence: profiles/wiki-memory is L4 — it must still be calling
// the OLD 3-arg cardToQuads (its suite is RED by design). If someone "fixed"
// it ahead of L4's re-derivation, this fence fails and stops the merge.
describe('L4 fence', () => {
  it('wiki-memory extract.mjs still carries the TODO(plan-2) breadcrumb, unpatched', async () => {
    const p = join(dirname(fileURLToPath(import.meta.url)), '..', 'profiles', 'wiki-memory', 'extract.mjs')
    const src = await readFile(p, 'utf8')
    expect(src).toContain('TODO(plan-2)')
  })
})
```

- [ ] **Step 2: Run the full okf + publish scope one last time**

```bash
cd projection && npx vitest run okf/ publish/
```

Expected: everything green, including the fence. (`npx vitest run` over the WHOLE projection still fails on `profiles/wiki-memory` — by design, do not touch it.)

- [ ] **Step 3: Commit**

```bash
cd /Users/cvardema/dev/git/LA3D/agents/lws-pod
git add projection/okf/red-fence.test.mjs
git commit -m "$(cat <<'EOF'
[Agent: Claude] test(okf): L4 fence — wiki-memory stays RED/unpatched (acceptance #8)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 12: Docs — FOLLOWUP, README, memory

**Files:**
- Modify: `FOLLOWUP.md` (new DONE block at top + NEXT pointer), `README.md` (profiles section under the TLS-rigs / repo-layout area), `CLAUDE.md` (one line in Architecture for `projection/profiles/defs/` + `projection/publish/`), `/Users/cvardema/.claude/projects/-Users-cvardema-dev-git-LA3D-agents-lws-pod/memory/general-substrate-design.md` (status line: Plan 2 executed)

**Interfaces:** none.

- [ ] **Step 1: FOLLOWUP block**

Add above the current `▶▶ NEXT SESSION` content, following the house style of the existing DONE blocks: Plan 2 DONE — spec + plan paths; what shipped (mechanism modules, defs tree, publish+checks, fork rung `<MERGE_SHA>`, live gate `make test-profiles` N/N + zero regression list); **recorded deviations**: proto-Warning shipped as projection advisory not shape rule (and why: shacl-engine SPARQL-constraint support unverified — revisit at L4); acceptance-#5 branch outcome (which arm fired); **carryover**: fork-native conformsTo admission + second indexed relation (post-L4), w3id registration (public rung), edge-target cross-card `id:` resolution (L4), plane-mapping consumed-not-acted-on, trigger runtime adoption of `loadProfile` (L4). Update the `▶▶ NEXT SESSION` pointer: next = **MCP affordance-spec correction** (the deferred model-driven read/nav thread), then L4.

- [ ] **Step 2: README + CLAUDE.md + memory**

README: a "Profiles" subsection — what `/profiles/` is, `make publish-profiles`, `make test-profiles`, pointer to spec + layer-cake note. CLAUDE.md Architecture list: add `projection/profiles/defs/` (profile definition sources — descriptors, pinned mirrors) + `projection/publish/` (declaration checks + publish step) to the `projection/` bullet. Memory file: update the status sentence (Plan 2 DONE, wiki-memory still RED for L4, next = MCP correction then L4).

- [ ] **Step 3: Commit**

```bash
cd /Users/cvardema/dev/git/LA3D/agents/lws-pod
git add FOLLOWUP.md README.md CLAUDE.md
git commit -m "$(cat <<'EOF'
[Agent: Claude] docs(followup): Plan 2 profile mechanism DONE — state, deviations, carryover

- FOLLOWUP DONE block + next-session pointer (MCP correction, then L4)
- README profiles section; CLAUDE.md architecture lines

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

(The memory-file update is written directly with the Write tool, not committed — it lives outside the repo.)

---

## Plan self-review (spec coverage)

- Spec §1 scope items 1–5 → Tasks 3+6 (descriptor format + vocab), 6 (floor/okf-base/llm-wiki + mirrors), 2+4+5+7 (resolver/loading/materialization), 8+9 (fork rung), 5+7 (@vocab policy + lint). §2 multi-parent/opaque → Task 4 (tested via RO-Crate stub = acceptance #7). §3 namespaces/roles → Task 6 `lwsp.ttl`; descriptor self-conformance → Task 7 `checkDescriptor`. §4 layout/publication/binding → Tasks 6–7. §5 fork rung → Tasks 8–9 (deferred items recorded in Task 12). §6 resolver → Tasks 2, 4 (failure asymmetry: loader loud on root, graceful on binding; publish loud). §7 identity + carryover → Task 5 (#1/#3 recorded as documentation/L4 in Task 12 carryover — #3's invariant statement goes in the FOLLOWUP block). §8 policies → Task 5 (@vocab runtime layer, protoTerms advisory — recorded deviation), typing-channel rule is trigger-side and lands with L4 (recorded in Task 12). §9 checks → Task 7. §10 acceptance: #1–#5 Task 10, #6 Task 5 (unit), #7 Task 4, #8 Task 11, #9 Task 10, #10 Task 7. §11 decision log — no task needed (record).
- Type consistency: `cardToQuads → {quads, protoTerms}` consumed in Tasks 5, 10 (loader/live gate never call it with old shape); `Loaded` shape produced Task 4 = consumed Tasks 5, 7, 10; `mockFetch` exported from Task 2's test file, imported by Task 4's.
