# L4b Phase A — Generic Graph-Semantics Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the substrate a generic, application-neutral capability for an agent to store arbitrary RDF as JSON-LD 1.1 named graphs and read it back re-serialized, plus a data-declared derived-view mechanism — proven by a non-wiki gate and a cold-agent probe.

**Architecture:** Add the missing outbound serializer (quads → named-graph / dataset JSON-LD) and a neutral derived-view materializer that reads a container's member RDF and writes an aggregate named-graph view. A new PROF role `lwspr:derived-view` lets a profile *declare* its derived views as data; the loader surfaces them. All new code is Bucket 2 (neutral, zero application vocabulary) and lives in `projection/okf/` (the current neutral home; Phase B relocates it to `projection/prof/`). No fork change.

**Tech Stack:** Node ESM, `jsonld` (already a dep — used inbound in `rdf.mjs`), `n3`, Vitest. Live gate runs against the fork `--lws` TLS pod at `https://pod.vardeman.me`.

## Global Constraints

- **Fork diff is EMPTY.** Phase A touches no fork file. Store+read-back of named-graph JSON-LD is already faithful on the `application/ld+json` path (verified: `filesystem.js` opaque bytes; conneg `JSON.parse`→`JSON.stringify`). Assert an empty fork tree in the round.
- **Agent path stays on `application/ld+json`.** Never `Accept: text/turtle` for a named-graph resource — the fork's Turtle conneg drops `@graph` contents (`src/rdf/turtle.js:339`). Turtle is an unnamed-union export only.
- **Named graphs are JSON-LD 1.1.** A named graph is a graph object `{ "@context": …, "@id": <graph name>, "@graph": [ <nodes> ] }`. Graph name = the authority-scoped document IRI, distinct from a node's subject `@id` (which carries `#it`). TriG/N-Quads never on the agent path.
- **Generic, not wiki.** No new code or exercised mechanism may contain `wiki`, `okf`, `card`, or any application vocabulary. The gate asserts this.
- **Vocabulary under the w3id-shaped base we control:** roles under `https://w3id.org/lws-pod/profile/role/` (`lwspr:`), reuse-first per `docs/design-notes/iri-minting.md`.
- **Ungoverned container for the generic gate.** L3 admission is graph-blind (silently admits multi-`@graph`); that gap is a Phase-B decision. Phase A stores to a container with **no `describedby` shape bound**, so no admission expectation exists.
- **Commit format:** `[Agent: Claude] type(scope): subject` + `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`. Stage specific files.

---

## File Structure

- Create `projection/okf/jsonld-graph.mjs` — outbound serializer: quads → named-graph / dataset JSON-LD. The writer the tree lacks.
- Create `projection/okf/jsonld-graph.test.mjs` — unit tests for the serializer.
- Create `projection/okf/derived-view.mjs` — neutral derived-view materializer (read members → aggregate → PUT view).
- Create `projection/okf/derived-view.test.mjs` — unit tests with injected fetch.
- Modify `projection/profiles/defs/lwsp.ttl` — mint the `lwspr:derived-view` role.
- Modify `projection/okf/profile-loader.mjs` — one dispatch branch + `acc.derivedViews` seed.
- Modify `projection/okf/profile-loader.test.mjs` — assert `loadProfile` surfaces `derivedViews` (append; file exists).
- Create `projection/profiles/defs/ex-graph/{profile.jsonld,context.jsonld,derived-view.jsonld}` — a deliberately-neutral `ex:` profile family declaring a derived view (pure data).
- Create `tests/lws-graph.test.mjs` — the live generic gate.
- Modify `Makefile` — add the `test-graph` target + `.PHONY` entry.
- Modify `docs/design-notes/iri-minting.md` — add the graph-semantics section.

---

### Task 1: Named-graph JSON-LD serializer

**Files:**
- Create: `projection/okf/jsonld-graph.mjs`
- Test: `projection/okf/jsonld-graph.test.mjs`

**Interfaces:**
- Consumes: `jsonld` (`fromRDF`/`compact`), `n3` (`Writer`).
- Produces:
  - `quadsToNamedGraph(quads, { graphName, context }) → Promise<object>` — a single named graph `{ "@context", "@id": graphName, "@graph": [nodes] }`. Quad graph components are ignored; the name is supplied by the caller (in-band naming).
  - `quadsToDataset(quadsByGraph, { context }) → Promise<object>` — a dataset `{ "@context", "@graph": [ { "@id": name, "@graph": [nodes] }, … ] }`. `quadsByGraph` is `Record<graphName, Quad[]>`.

- [ ] **Step 1: Write the failing tests**

```js
// projection/okf/jsonld-graph.test.mjs
import { describe, it, expect } from 'vitest'
import { DataFactory } from 'n3'
import { quadsToNamedGraph, quadsToDataset } from './jsonld-graph.mjs'
const { namedNode, literal, quad } = DataFactory

const CTX = { rdfs: 'http://www.w3.org/2000/01/rdf-schema#', label: { '@id': 'rdfs:label' }, type: '@type' }
const S = 'https://authority.example/kb/foo#it'
const qs = [
  quad(namedNode(S), namedNode('http://www.w3.org/1999/02/22-rdf-syntax-ns#type'), namedNode('https://example.org/ns#Thing')),
  quad(namedNode(S), namedNode('http://www.w3.org/2000/01/rdf-schema#label'), literal('Foo')),
]

describe('quadsToNamedGraph', () => {
  it('wraps quads as one named graph, name = supplied graphName (not the subject)', async () => {
    const g = await quadsToNamedGraph(qs, { graphName: 'https://authority.example/kb/foo', context: CTX })
    expect(g['@id']).toBe('https://authority.example/kb/foo')          // graph name
    expect(Array.isArray(g['@graph'])).toBe(true)
    const node = g['@graph'].find(n => n['@id'] === S)                  // subject distinct from graph name
    expect(node).toBeTruthy()
    expect(node.label).toBe('Foo')
    expect(g['@context']).toEqual(CTX)
  })
  it('ignores the quad graph component (name comes from the caller)', async () => {
    const placed = qs.map(q => quad(q.subject, q.predicate, q.object, namedNode('urn:ignore')))
    const g = await quadsToNamedGraph(placed, { graphName: 'urn:g', context: CTX })
    expect(g['@id']).toBe('urn:g')
    expect(g['@graph'].find(n => n['@id'] === S)).toBeTruthy()
  })
})

describe('quadsToDataset', () => {
  it('emits one graph object per source graph name', async () => {
    const ds = await quadsToDataset({ 'https://a.example/1': qs, 'https://a.example/2': qs }, { context: CTX })
    expect(ds['@graph'].map(g => g['@id']).sort()).toEqual(['https://a.example/1', 'https://a.example/2'])
    for (const g of ds['@graph']) expect(g['@graph'].find(n => n['@id'] === S)).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run projection/okf/jsonld-graph.test.mjs`
Expected: FAIL — `Cannot find module './jsonld-graph.mjs'`.

- [ ] **Step 3: Write the serializer**

```js
// projection/okf/jsonld-graph.mjs
// Outbound serializer: RDF quads -> JSON-LD 1.1 named graph / dataset.
// The graph NAME is supplied in-band by the caller (never derived from a storage path);
// quad graph components are ignored so callers control naming explicitly.
import jsonld from 'jsonld'
import { Writer } from 'n3'

function writeNQuads(quads) {
  return new Promise((resolve, reject) => {
    // Force the default graph so fromRDF yields plain node objects we wrap ourselves.
    const w = new Writer({ format: 'application/n-quads' })
    for (const q of quads) w.addQuad(q.subject, q.predicate, q.object)
    w.end((err, result) => (err ? reject(err) : resolve(result)))
  })
}

async function nodesFor(quads, context) {
  if (!quads.length) return []
  const expanded = await jsonld.fromRDF(await writeNQuads(quads), { format: 'application/n-quads' })
  const compacted = await jsonld.compact(expanded, context)
  if (Array.isArray(compacted['@graph'])) return compacted['@graph']
  const { '@context': _c, ...node } = compacted
  return Object.keys(node).length ? [node] : []
}

export async function quadsToNamedGraph(quads, { graphName, context }) {
  return { '@context': context, '@id': graphName, '@graph': await nodesFor(quads, context) }
}

export async function quadsToDataset(quadsByGraph, { context }) {
  const graphs = []
  for (const [graphName, quads] of Object.entries(quadsByGraph))
    graphs.push({ '@id': graphName, '@graph': await nodesFor(quads, context) })
  return { '@context': context, '@graph': graphs }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run projection/okf/jsonld-graph.test.mjs`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add projection/okf/jsonld-graph.mjs projection/okf/jsonld-graph.test.mjs
git commit -m "$(cat <<'EOF'
[Agent: Claude] feat(graph): quads -> named-graph/dataset JSON-LD serializer

- quadsToNamedGraph / quadsToDataset — the outbound writer the projection lacked
- graph name supplied in-band by the caller, distinct from subject @id

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Mint the `lwspr:derived-view` role + loader dispatch

**Files:**
- Modify: `projection/profiles/defs/lwsp.ttl` (append after line 24)
- Modify: `projection/okf/profile-loader.mjs:17-28` (dispatch) and `:51-52` (acc seed)
- Test: `projection/okf/profile-loader.test.mjs` (append)

**Interfaces:**
- Consumes: existing `dispatch`/`loadProfile` in `profile-loader.mjs`; `fetchJson(url, fetchFn)`.
- Produces: `loadProfile(...)` return object gains `derivedViews: object[]` — the parsed JSON of each `lwspr:derived-view` artifact, in profile-walk order (parents first).

- [ ] **Step 1: Write the failing test (append to `profile-loader.test.mjs`)**

```js
// append to projection/okf/profile-loader.test.mjs
import { describe, it, expect } from 'vitest'
import { loadProfile } from './profile-loader.mjs'

describe('derived-view role', () => {
  it('surfaces lwspr:derived-view artifacts on loadProfile().derivedViews', async () => {
    // Minimal in-memory pod: a descriptor declaring one derived-view resource.
    const docs = {
      'https://pod.example/p/profile.jsonld': {
        '@context': { prof: 'http://www.w3.org/ns/dx/prof/', dct: 'http://purl.org/dc/terms/',
          isProfileOf: { '@id': 'prof:isProfileOf', '@type': '@id' }, hasToken: 'prof:hasToken',
          hasResource: 'prof:hasResource', hasRole: { '@id': 'prof:hasRole', '@type': '@id' },
          hasArtifact: { '@id': 'prof:hasArtifact', '@type': '@id' } },
        '@id': 'https://pod.example/p/profile.jsonld', '@type': 'prof:Profile', hasToken: 'ex',
        hasResource: [{ '@id': '#view', hasRole: 'https://w3id.org/lws-pod/profile/role/derived-view',
          hasArtifact: 'https://pod.example/p/derived-view.jsonld' }],
      },
      'https://pod.example/p/derived-view.jsonld': { named_graph: 'view.jsonld', push_mode: 'replace', mode: 'union' },
    }
    const fetchFn = async (url) => ({ ok: true, json: async () => docs[url.split('#')[0]] })
    const p = await loadProfile('https://pod.example/p/profile.jsonld', { fetchFn })
    expect(p.derivedViews).toEqual([{ named_graph: 'view.jsonld', push_mode: 'replace', mode: 'union' }])
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run projection/okf/profile-loader.test.mjs -t "derived-view role"`
Expected: FAIL — `p.derivedViews` is `undefined`.

- [ ] **Step 3: Mint the role in `lwsp.ttl`**

Append after the `lwspr:plane-mapping` block (currently ends at line 24):

```turtle
lwspr:derived-view a prof:ResourceRole, skos:Concept ;
    skos:prefLabel "Derived view"@en ;
    skos:definition "Config consumed by a derived-view projector: the named_graph (a pod resource IRI whose URL is the graph name), the push_mode (replace|merge), and the mode (union|dataset). Declares — as data — an aggregate view a projector materializes into the container; it carries no application vocabulary."@en ;
    skos:inScheme lwsp: .
```

- [ ] **Step 4: Add the dispatch branch + acc seed in `profile-loader.mjs`**

In `dispatch()` (the `if/else if` chain at `:17-28`), add before the final `else` (the `unknownRoles` catch-all):

```js
    else if (role === LWSP_ROLE + 'derived-view') acc.derivedViews.push(await fetchJson(r.artifact, fetchFn))
```

In `loadProfile()` where `acc` is seeded (`:51-52`), add the field:

```js
    derivedViews: [],
```

(Any new `acc` field auto-surfaces on the returned profile via the existing `...acc` spread — no other change.)

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run projection/okf/profile-loader.test.mjs -t "derived-view role"`
Expected: PASS.

- [ ] **Step 6: Run the full loader + publish suites to check no regression**

Run: `npx vitest run projection/okf/profile-loader.test.mjs projection/publish/`
Expected: PASS (the `checks.mjs` vocabulary lint reads `lwsp.ttl`; confirm the new role does not trip it).

- [ ] **Step 7: Commit**

```bash
git add projection/profiles/defs/lwsp.ttl projection/okf/profile-loader.mjs projection/okf/profile-loader.test.mjs
git commit -m "$(cat <<'EOF'
[Agent: Claude] feat(graph): lwspr:derived-view role + loader dispatch

- mint lwspr:derived-view (operation contract: named_graph/push_mode/mode)
- loadProfile surfaces declared views on .derivedViews (parents-first)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Generic derived-view materializer

**Files:**
- Create: `projection/okf/derived-view.mjs`
- Test: `projection/okf/derived-view.test.mjs`

**Interfaces:**
- Consumes: `jsonldToQuads(doc, base, opts)` from `./rdf.mjs`; `quadsToNamedGraph`/`quadsToDataset` from `./jsonld-graph.mjs`.
- Produces: `materializeDerivedView(containerUrl, token, declaration, { context, fetchFn }) → Promise<{ target, status, mode }>`. Reads the container's non-reserved members as JSON-LD, aggregates them, and PUTs the view to `new URL(declaration.named_graph, containerUrl)`. `union` → one named graph named by the view URL; `dataset` → one named graph per member (name = member's `@id` or URL). `push_mode: 'merge'` GETs the existing view first (reserved for future union-merge; in v1 both modes overwrite — `merge` is accepted and behaves as `replace`, documented).

- [ ] **Step 1: Write the failing tests**

```js
// projection/okf/derived-view.test.mjs
import { describe, it, expect } from 'vitest'
import { materializeDerivedView } from './derived-view.mjs'

const CTX = { rdfs: 'http://www.w3.org/2000/01/rdf-schema#', label: { '@id': 'rdfs:label' }, type: '@type' }
const CONTAINER = 'https://pod.example/data/'
// A fake pod: container listing (Turtle ldp:contains) + two JSON-LD member graphs.
const memberA = { '@context': CTX, '@id': 'https://authority.example/kb/a', '@graph': [{ '@id': 'https://authority.example/kb/a#it', label: 'A' }] }
const memberB = { '@context': CTX, '@id': 'https://authority.example/kb/b', '@graph': [{ '@id': 'https://authority.example/kb/b#it', label: 'B' }] }
const listing = `@prefix ldp: <http://www.w3.org/ns/ldp#> .
<${CONTAINER}> ldp:contains <${CONTAINER}a.jsonld>, <${CONTAINER}b.jsonld>, <${CONTAINER}view.jsonld> .`

function fakePod() {
  const puts = []
  const fetchFn = async (url, opts = {}) => {
    const u = String(url)
    if (opts.method === 'PUT') { puts.push({ url: u, body: JSON.parse(opts.body) }); return { ok: true, status: 201 } }
    if (u === CONTAINER) return { ok: true, text: async () => listing }
    if (u.endsWith('a.jsonld')) return { ok: true, json: async () => memberA, text: async () => JSON.stringify(memberA) }
    if (u.endsWith('b.jsonld')) return { ok: true, json: async () => memberB, text: async () => JSON.stringify(memberB) }
    return { ok: false, status: 404 }
  }
  return { fetchFn, puts }
}

describe('materializeDerivedView', () => {
  it('union: one named graph named by the view URL, members flattened', async () => {
    const { fetchFn, puts } = fakePod()
    const decl = { named_graph: 'view.jsonld', push_mode: 'replace', mode: 'union' }
    const r = await materializeDerivedView(CONTAINER, 'tok', decl, { context: CTX, fetchFn })
    expect(r.target).toBe(`${CONTAINER}view.jsonld`)
    expect(r.status).toBe(201)
    const body = puts[0].body
    expect(body['@id']).toBe(`${CONTAINER}view.jsonld`)             // graph name = the view's own URL
    const ids = body['@graph'].map(n => n['@id']).sort()
    expect(ids).toEqual(['https://authority.example/kb/a#it', 'https://authority.example/kb/b#it'])
  })
  it('dataset: one named graph per member, provenance preserved', async () => {
    const { fetchFn, puts } = fakePod()
    const decl = { named_graph: 'view.jsonld', push_mode: 'replace', mode: 'dataset' }
    await materializeDerivedView(CONTAINER, 'tok', decl, { context: CTX, fetchFn })
    const body = puts[0].body
    expect(body['@graph'].map(g => g['@id']).sort()).toEqual(['https://authority.example/kb/a', 'https://authority.example/kb/b'])
  })
  it('skips the view target itself when re-projecting', async () => {
    const { fetchFn, puts } = fakePod()
    await materializeDerivedView(CONTAINER, 'tok', { named_graph: 'view.jsonld', push_mode: 'replace', mode: 'union' }, { context: CTX, fetchFn })
    // view.jsonld is in the listing but must not be read back into itself
    expect(puts[0].body['@graph'].some(n => String(n['@id']).endsWith('view.jsonld'))).toBe(false)
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run projection/okf/derived-view.test.mjs`
Expected: FAIL — `Cannot find module './derived-view.mjs'`.

- [ ] **Step 3: Write the materializer**

```js
// projection/okf/derived-view.mjs
// Neutral derived-view materializer. Reads a container's member RDF resources and PUTs an
// aggregate named-graph JSON-LD view per a data declaration. No application vocabulary.
import { Parser } from 'n3'
import { jsonldToQuads } from './rdf.mjs'
import { quadsToNamedGraph, quadsToDataset } from './jsonld-graph.mjs'

const LDP_CONTAINS = 'http://www.w3.org/ns/ldp#contains'
const authH = (token) => (token ? { authorization: `Bearer ${token}` } : {})

async function readMembers(containerUrl, token, fetchFn) {
  const r = await fetchFn(containerUrl, { headers: { accept: 'text/turtle', ...authH(token) } })
  if (!r.ok) throw new Error(`container ${containerUrl} -> ${r.status}`)
  const quads = new Parser().parse(await r.text())
  return quads.filter(q => q.predicate.value === LDP_CONTAINS).map(q => q.object.value)
}

async function memberGraph(url, token, fetchFn) {
  const r = await fetchFn(url, { headers: { accept: 'application/ld+json', ...authH(token) } })
  if (!r.ok) throw new Error(`member ${url} -> ${r.status}`)
  const doc = await r.json()
  const name = doc['@id'] || url                                  // in-band graph name, else the URL
  const quads = await jsonldToQuads(doc, url)                      // flatten to quads (graph component dropped below)
  return { name, quads }
}

export async function materializeDerivedView(containerUrl, token, declaration, { context = {}, fetchFn = fetch } = {}) {
  const target = new URL(declaration.named_graph, containerUrl).href
  const members = (await readMembers(containerUrl, token, fetchFn)).filter(u => u !== target)
  const graphs = await Promise.all(members.map(u => memberGraph(u, token, fetchFn)))

  let body
  if (declaration.mode === 'dataset') {
    const byGraph = {}
    for (const g of graphs) byGraph[g.name] = g.quads
    body = await quadsToDataset(byGraph, { context })
  } else {
    body = await quadsToNamedGraph(graphs.flatMap(g => g.quads), { graphName: target, context })
  }

  const put = await fetchFn(target, {
    method: 'PUT',
    headers: { 'content-type': 'application/ld+json', ...authH(token) },
    body: JSON.stringify(body),
  })
  return { target, status: put.status, mode: declaration.mode }
}
```

Note: `quadsToNamedGraph`/`quadsToDataset` write quads to the default graph internally (they ignore each quad's graph component), so member quads carrying a graph term are safely flattened and re-named by the caller-supplied name.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run projection/okf/derived-view.test.mjs`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add projection/okf/derived-view.mjs projection/okf/derived-view.test.mjs
git commit -m "$(cat <<'EOF'
[Agent: Claude] feat(graph): neutral derived-view materializer

- read container members as JSON-LD, aggregate, PUT a named-graph view
- union (flattened, named by the view URL) + dataset (per-member graphs)
- skips the view target when re-projecting; no application vocabulary

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: The neutral `ex-graph` profile family (pure data)

**Files:**
- Create: `projection/profiles/defs/ex-graph/profile.jsonld`
- Create: `projection/profiles/defs/ex-graph/context.jsonld`
- Create: `projection/profiles/defs/ex-graph/derived-view.jsonld`

**Interfaces:**
- Consumes: nothing (data). `isProfileOf` → `../substrate-floor.jsonld` (inherits the identity floor only — no card machinery).
- Produces: a family the live gate PUTs and binds; its `lwspr:derived-view` artifact drives Task 3.

- [ ] **Step 1: Create the descriptor**

```json
// projection/profiles/defs/ex-graph/profile.jsonld
{
  "@context": "../profiles-compact.context.jsonld",
  "@id": "",
  "@type": "Profile",
  "hasToken": "ex-graph",
  "isProfileOf": "../substrate-floor.jsonld",
  "dct:title": "Generic graph family — arbitrary RDF, named-graph JSON-LD (L4b Phase A gate)",
  "hasResource": [
    { "@id": "#ctx",  "hasRole": "lwspr:context",      "hasArtifact": "context.jsonld",      "format": "application/ld+json" },
    { "@id": "#view", "hasRole": "lwspr:derived-view", "hasArtifact": "derived-view.jsonld", "format": "application/ld+json" }
  ]
}
```

- [ ] **Step 2: Create the context (neutral `ex:` terms — nothing to couple to)**

```json
// projection/profiles/defs/ex-graph/context.jsonld
{
  "@context": {
    "ex": "https://example.org/ns#",
    "rdfs": "http://www.w3.org/2000/01/rdf-schema#",
    "type": "@type",
    "label": { "@id": "rdfs:label" }
  }
}
```

- [ ] **Step 3: Create the derived-view declaration**

```json
// projection/profiles/defs/ex-graph/derived-view.jsonld
{ "named_graph": "view.jsonld", "push_mode": "replace", "mode": "union" }
```

- [ ] **Step 4: Verify the descriptor passes the publish checks**

Run: `node projection/publish/publish.mjs --base https://x --check` after temporarily nothing — instead validate in isolation:
Run: `npx vitest run projection/publish/` (the `checks.mjs` unit suite parses descriptor + context shapes)
Expected: PASS — no check regression. (The gate in Task 5 PUTs these files directly, mirroring `lws-dcat.test.mjs`; adding `ex-graph` to `defs/index.jsonld` is optional and deferred to a manifest-onboarding check.)

- [ ] **Step 5: Commit**

```bash
git add projection/profiles/defs/ex-graph/
git commit -m "$(cat <<'EOF'
[Agent: Claude] feat(graph): ex-graph neutral profile family (data-only)

- isProfileOf substrate-floor; declares one lwspr:derived-view
- deliberately-neutral ex: terms — the generic-gate fixture

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: The live generic gate (`tests/lws-graph.test.mjs` + `make test-graph`)

**Files:**
- Create: `tests/lws-graph.test.mjs`
- Modify: `Makefile` (add `test-graph` + `.PHONY`)

**Interfaces:**
- Consumes: `BASE`, `ensurePod`, `getToken` from `tests/helpers.mjs`; `materializeDerivedView` from `../projection/okf/derived-view.mjs`; `readFileSync` for the `ex-graph` defs.
- Produces: a live gate proving store + read-back + derived-view materialization (union + dataset) on an ungoverned container, with no application vocabulary exercised.

- [ ] **Step 1: Write the gate**

```js
// tests/lws-graph.test.mjs
import { describe, it, beforeAll, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { BASE, ensurePod, getToken } from './helpers.mjs'
import { materializeDerivedView } from '../projection/okf/derived-view.mjs'

const PROF = '/alice/profiles/ex-graph/'
const DATA = '/alice/graphs/'                                     // ungoverned: no describedby bound
const CTX = { ex: 'https://example.org/ns#', rdfs: 'http://www.w3.org/2000/01/rdf-schema#', type: '@type', label: { '@id': 'rdfs:label' } }
const AUTHORITY = 'https://authority.example/kb'                  // graph name base, deliberately != storage path
const defs = (rel) => new URL(`../projection/profiles/defs/ex-graph/${rel}`, import.meta.url)

const probe = await fetch(`${BASE}/.well-known/lws-storage`).catch(() => null)
describe.skipIf(!probe?.ok)('generic graph-semantics gate (L4b Phase A)', () => {
  let token
  const H = () => ({ authorization: `Bearer ${token}` })
  const member = (slug) => ({ '@context': CTX, '@id': `${AUTHORITY}/${slug}`,
    '@graph': [{ '@id': `${AUTHORITY}/${slug}#it`, type: 'ex:Thing', label: slug }] })

  beforeAll(async () => {
    await ensurePod()
    ;({ token } = await getToken())
    // Publish the neutral profile family (pure data PUTs).
    for (const name of ['profile.jsonld', 'context.jsonld', 'derived-view.jsonld']) {
      const r = await fetch(`${BASE}${PROF}${name}`, { method: 'PUT',
        headers: { ...H(), 'content-type': 'application/ld+json' }, body: readFileSync(defs(name)) })
      expect([200, 201, 204, 205]).toContain(r.status)
    }
    // Store two arbitrary named-graph resources into an UNGOVERNED container.
    for (const slug of ['a', 'b']) {
      const r = await fetch(`${BASE}${DATA}${slug}.jsonld`, { method: 'PUT',
        headers: { ...H(), 'content-type': 'application/ld+json' }, body: JSON.stringify(member(slug)) })
      expect([200, 201, 204, 205]).toContain(r.status)
    }
  })

  it('reads a stored named graph back faithfully; graph name != storage path', async () => {
    const r = await fetch(`${BASE}${DATA}a.jsonld`, { headers: { ...H(), accept: 'application/ld+json' } })
    expect(r.ok).toBe(true)
    const doc = await r.json()
    expect(doc['@id']).toBe(`${AUTHORITY}/a`)                      // graph name preserved, decoupled from storage URL
    expect(doc['@id']).not.toBe(`${BASE}${DATA}a.jsonld`)
    const node = (doc['@graph'] || []).find(n => n['@id'] === `${AUTHORITY}/a#it`)
    expect(node).toBeTruthy()                                     // subject distinct from graph name
  })

  it('materializes a union derived view (JSON-LD named graph, named by the view URL)', async () => {
    const r = await materializeDerivedView(`${BASE}${DATA}`, token,
      { named_graph: 'view.jsonld', push_mode: 'replace', mode: 'union' }, { context: CTX })
    expect([200, 201, 204, 205]).toContain(r.status)
    const view = await (await fetch(r.target, { headers: { ...H(), accept: 'application/ld+json' } })).json()
    expect(view['@id']).toBe(`${BASE}${DATA}view.jsonld`)
    const ids = (view['@graph'] || []).map(n => n['@id']).sort()
    expect(ids).toContain(`${AUTHORITY}/a#it`)
    expect(ids).toContain(`${AUTHORITY}/b#it`)
  })

  it('materializes a dataset derived view (one named graph per member)', async () => {
    const r = await materializeDerivedView(`${BASE}${DATA}`, token,
      { named_graph: 'view-ds.jsonld', push_mode: 'replace', mode: 'dataset' }, { context: CTX })
    const view = await (await fetch(r.target, { headers: { ...H(), accept: 'application/ld+json' } })).json()
    const names = (view['@graph'] || []).map(g => g['@id']).sort()
    expect(names).toContain(`${AUTHORITY}/a`)
    expect(names).toContain(`${AUTHORITY}/b`)
  })

  it('exercises no application vocabulary (generic proof)', async () => {
    // The modules the gate drives must be free of wiki/okf/card terms.
    for (const f of ['../projection/okf/jsonld-graph.mjs', '../projection/okf/derived-view.mjs']) {
      const src = readFileSync(new URL(f, import.meta.url), 'utf8')
      expect(src).not.toMatch(/\b(wiki|card|okf|concept|implementation)\b/i)
    }
  })
})
```

- [ ] **Step 2: Add the Makefile target**

Add `test-graph` to the `.PHONY` line (near line 9), then append this recipe (mirrors `test-dcat`):

```make
# Generic graph-semantics gate (L4b Phase A) — store arbitrary named-graph JSON-LD,
# read it back, materialize union+dataset derived views. Needs up-fork-tls + make cert.
test-graph:
	@[ -f certs/rootCA.pem ] || { echo "run 'make cert && make up-fork-tls' first"; exit 1; }
	BASE=https://pod.vardeman.me NODE_EXTRA_CA_CERTS=$(CURDIR)/certs/rootCA.pem npx vitest run tests/lws-graph.test.mjs
```

- [ ] **Step 3: Bring up the fork pod and run the gate**

Run: `make cert && make up-fork-tls` (if not already up), then `make test-graph`
Expected: PASS (4 tests). If the pod isn't up, the suite self-skips (green, reported skipped) — bring it up to actually exercise it.

- [ ] **Step 4: Confirm no regression across the live sweep**

Run: `make test-profiles && make test-dcat && make test-l3 && make test-lws && make test-typeindex && make test-indexed-relation && make test-mcp-v2`
Expected: all green (profiles 6/6, dcat 5/5, l3 2/2, lws 6/6, typeindex 7/7, indexed-relation 4/4, mcp-v2 16/16). (If a back-to-back `mcp-v2` run self-skips on a 429, wait ~60s and re-run — known ops note.)

- [ ] **Step 5: Commit**

```bash
git add tests/lws-graph.test.mjs Makefile
git commit -m "$(cat <<'EOF'
[Agent: Claude] test(graph): live generic gate + make test-graph

- store arbitrary named-graph JSON-LD to an ungoverned container, read back
  faithfully (graph name != storage path), materialize union+dataset views
- asserts the exercised mechanism carries no application vocabulary

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Read-side minimum — pin the plane-mapping + governance leanings

**Files:**
- Modify: `tests/lws-graph.test.mjs` (append one `it` block)

**Interfaces:**
- Consumes: `discoverBinding` from `../projection/okf/profile-loader.mjs` (already surfaces the plural `conformsTo` up-walk).
- Produces: live assertions pinning the spec §5 leanings — the graph name resolves to its resource, and a container's own `conformsTo` is what `discoverBinding` returns (container-authority precedence).

- [ ] **Step 1: Append the read-side test**

```js
// append inside the describe(...) in tests/lws-graph.test.mjs
import { discoverBinding } from '../projection/okf/profile-loader.mjs'   // add to the import block at top

  it('read-side: the derived-view graph name resolves to its own resource (plane-mapping minimum)', async () => {
    // The union view declared @id == its storage URL, so the name is directly dereferenceable.
    const url = `${BASE}${DATA}view.jsonld`
    const doc = await (await fetch(url, { headers: { ...H(), accept: 'application/ld+json' } })).json()
    expect(doc['@id']).toBe(url)                                  // graph name == the resource you GET
  })

  it('read-side: an ungoverned container has no binding (discoverBinding -> [])', async () => {
    const bound = await discoverBinding(`${BASE}${DATA}a.jsonld`)  // /alice/graphs/ has no .meta conformsTo
    expect(Array.isArray(bound)).toBe(true)
    expect(bound).toEqual([])                                     // container-authority precedence: no local bind => empty
  })
```

- [ ] **Step 2: Run the gate**

Run: `make test-graph`
Expected: PASS (6 tests total).

- [ ] **Step 3: Commit**

```bash
git add tests/lws-graph.test.mjs
git commit -m "$(cat <<'EOF'
[Agent: Claude] test(graph): pin read-side plane-mapping + binding precedence

- graph name resolves to its own resource; ungoverned container -> no binding

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: Update `iri-minting.md` with the graph semantics

**Files:**
- Modify: `docs/design-notes/iri-minting.md`

**Interfaces:** none (documentation deliverable, spec §8).

- [ ] **Step 1: Add the section**

Insert after the "Plane 1 — content subject IRIs" section (after line 86, the "Honesty flag — minting ≠ dereference" paragraph), a new subsection:

```markdown
### Plane 1 — graph semantics (added L4b Phase A)

The name/dereference separation above is now realized **in-band** via JSON-LD 1.1:

- A resource's RDF is a JSON-LD **graph object** `{ "@id": <graph name>, "@graph": [ <nodes> ] }`.
  The **graph name is the document IRI** (`{authority}{profile-path}/{slug}`); the **subject** is the
  `#it` fragment within it. Two distinct `@id`s at two levels (httpRange-14).
- **Serialization is JSON-LD 1.1 only** on the agent path. TriG is an optional conneg export; Turtle is
  an *unnamed union* export only (it cannot carry a graph name; the fork's Turtle conneg drops `@graph`).
- **Containment:** a resource = one named graph; a **container = the dataset** (members are its named
  graphs, name = member URL); an **aggregate derived view** may be a resource-as-dataset (multi-`@graph`)
  when its declaration asks (`mode: dataset`).
- **Read-side minimum:** a derived view's `named_graph` is its own pod resource URL, so the graph name is
  directly dereferenceable. For a card whose graph name is the authority doc IRI (≠ storage URL), the
  resolution is the plane mapping (`rel="up"`/`describedby`/type index) — the read half of §11 #4.
```

- [ ] **Step 2: Commit**

```bash
git add docs/design-notes/iri-minting.md
git commit -m "$(cat <<'EOF'
[Agent: Claude] docs(iri-minting): graph semantics — in-band naming, JSON-LD 1.1

- graph name = doc IRI (@id), subject = #it fragment; container = dataset
- serialization JSON-LD 1.1 only on the agent path; read-side plane-mapping min

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: Probe #4 — cold-agent generic affordance check

**Files:** none (validation task; produces a recorded finding, not code).

**Interfaces:** Consumes the live pod (fork `--lws` TLS, seeded by Task 5's gate run).

- [ ] **Step 1: Seed the pod**

Run: `make up-fork-tls` (if down), then `make test-graph` once to leave `/alice/graphs/` populated with `a.jsonld`, `b.jsonld`, `view.jsonld`, `view-ds.jsonld` and the `ex-graph` profile published.

- [ ] **Step 2: Dispatch a fresh, unprimed sub-agent**

Use the Agent tool (subagent_type `general-purpose`), giving it ONLY: the pod base URL `https://pod.vardeman.me`, the CA cert path `certs/rootCA.pem`, read-only intent, zero project context. Prompt it to: discover `/alice/graphs/`, read a member and the derived view as JSON-LD, and report (a) what the graph *names* are and how they differ from the subjects, (b) whether it can tell union from dataset, (c) how it would find the profile that declares the view, (d) any friction. Do NOT prime it with RFC 9264 / named-graph vocabulary — the point is unprimed reconstruction.

- [ ] **Step 3: Record findings**

Append a short "Probe #4 (generic)" block to `FOLLOWUP.md` under the L4b entry: what the agent reconstructed cold, and any friction (→ surface fixes or Phase-B/fork-queue items). Frictions that are surface wording become follow-up items; frictions that are real gaps feed Phase B.

- [ ] **Step 4: Commit the findings**

```bash
git add FOLLOWUP.md
git commit -m "$(cat <<'EOF'
[Agent: Claude] docs(followup): L4b Phase A DONE + probe #4 findings

- generic graph-semantics layer shipped (serializer, derived-view role,
  materializer, live gate); cold-agent probe #4 recorded
- NEXT = L4b Phase B (projection split + wiki re-derivation)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Self-Review

**Spec coverage (Phase A slice of `2026-07-06-l4b-graph-semantics-design.md`):**
- §3.1 serialization JSON-LD 1.1 → Task 1 (serializer) + Global Constraints (agent path on ld+json). ✓
- §3.2 in-band naming, graph name = doc IRI ≠ subject → Task 1 tests + Task 5 read-back test. ✓
- §3.3 containment (resource / container / aggregate union|dataset) → Task 3 (union+dataset) + Task 5. ✓
- §4 derived-view declaration vocabulary (role + named_graph/push_mode/mode) → Task 2 (role+dispatch) + Task 4 (declaration) + Task 3 (consume). ✓
- §5 read-side minimum → Task 6. ✓ (Governance leanings that are already loader behavior — plural `discoverBinding` up-walk — are pinned, not re-implemented.)
- §8 iri-minting update → Task 7. ✓
- §9 probe #4 → Task 8. ✓
- §11 generic gate (`tests/lws-graph.test.mjs`, `make test-graph`, no-app-vocab assertion, both modes, Turtle=union) → Task 5. ✓
- §11 fork-empty → Global Constraints + no fork task anywhere. ✓
- **Deferred, correctly out of this plan:** §6 split, §7 wiki re-derivation, §10 retirements, admission-inside-`@graph` (Phase B).

**Placeholder scan:** No TBD/TODO/"handle appropriately". Every code step shows complete code. `push_mode: merge` is explicitly documented as behaving as `replace` in v1 (not a placeholder — a bounded YAGNI decision).

**Type consistency:** `materializeDerivedView(containerUrl, token, declaration, { context, fetchFn })` used identically in Task 3 tests, Task 5, Task 6. `quadsToNamedGraph({ graphName, context })` / `quadsToDataset({ context })` consistent Task 1 ↔ Task 3. `loadProfile(...).derivedViews` consistent Task 2 ↔ (consumed by the live driver). Role IRI `https://w3id.org/lws-pod/profile/role/derived-view` consistent Task 2 (mint + dispatch) ↔ Task 4 (declared as `lwspr:derived-view`).

**One risk to watch during execution:** `jsonld.compact` output shape can inline a single node rather than wrap in `@graph`; `nodesFor` handles both branches, but if a live member compacts unexpectedly, pin the shape in the Task 1 tests first (they already assert `@graph` is an array). If `jsonld.fromRDF` chokes on an empty N-Quads string, `nodesFor` early-returns `[]` for empty quads — covered.
