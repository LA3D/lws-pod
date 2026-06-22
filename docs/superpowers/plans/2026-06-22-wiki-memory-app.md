# Wiki-memory app Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Deviations recorded during execution (2026-06-22):**
> 1. **Graph engine: N3.js, not Comunica.** `@comunica/query-sparql-link-traversal@0.8.0` is broken
>    in Node ESM (two incompatible `@traqula/parser-sparql-1-2` pins, 0.0.24 vs 1.1.6 → every query
>    fails at the first token). v1 needs only bounded explicit-source traversal, so Task 3 uses N3
>    over the seed + derived container `graph.ttl` sources; signatures/return shapes unchanged.
>    Comunica link-traversal deferred to the Phase-2 agent layer. **Task 5's import map drops the
>    `@comunica/...` entry** (N3 is already in the map).
> 2. The plan's `@comunica/query-sparql-link-traversal@^4.0.0` pin was wrong (that package's latest
>    is `0.8.0`); moot now that the engine is N3, but `n3` stays.
> 3. **Content root: user pod space, not server root.** The pod's root ACL forbids writing at
>    `/concepts/` (alice writes only under `/alice/`). Content lives at `/<user>/concepts/` +
>    `/<user>/implementations/`, derived from the login WebID. `<wm-app>` mounts at
>    `${storageBase(webid)}concepts/` (Task 9b fix). Task 10's seed creates `/alice/concepts/` +
>    `/alice/implementations/` and must (a) write `hierarchical-retrieval` DIRECT to JSS (bypass the
>    proxy) so the ungoverned card lands on the worklist — the floor 422s it through the proxy, so it
>    can't be both proxy-rejected AND on the worklist; and (b) run the projection CLI per container
>    to generate `index.md`+`graph.ttl` (projection is not auto-running).

**Goal:** An installable static Solid/LWS curation console that lets a human browse agent-written concept cards, traverse their typed graph across containers, and correct them through the SHACL floor.

**Architecture:** Vanilla custom elements over three pure modules — `pod.js` (auth + CRUD), `parse.js` (frontmatter/markdown/index), `graph.js` (N3 over explicitly-derived container `graph.ttl` sources — see deviation note 1; Comunica deferred to Phase 2). Hierarchy (`index.md`) is the orientation overlay; typed edges traversed across containers are the structure. Reading renders client-side; corrections PUT through the `constrained-container` SHACL proxy so the 422 verdict shows at save time. No build step; heavy deps load from CDN/ESM at runtime.

**Tech Stack:** Browser-native ES modules + custom elements; `marked`, `js-yaml`, `n3` (the graph engine), `cytoscape` (CDN in browser, devDeps for tests); Vitest (jsdom + node) for the gate; JSS v0.0.209 pod + `constrained-container` proxy. (`@comunica/query-sparql-link-traversal` removed from v1 — deviation note 1.)

## Global Constraints

- JSS pinned **v0.0.209**; pod run with `--idp` and `--conneg`.
- Installed app must fit the `jss install` **10 MB body limit** → no bundled deps; runtime ESM/CDN only.
- Auth: `POST <pod>/idp/credentials` body `{email, password}` → `{access_token, webid}`; send `Authorization: Bearer <access_token>`.
- Channel filenames are `index.md` and `graph.ttl` (the design sketch's `.graph` is superseded by `graph.ttl`).
- Namespaces: `wm: https://w3id.org/cogitarelink/wm#`, `skos: http://www.w3.org/2004/02/skos/core#`. Concept type `skos:Concept`; label `skos:prefLabel`; wiring edge `wm:implementedBy`; `skos:broader` for hierarchy edges.
- Card write Content-Type is `text/markdown`; the proxy validates markdown writes and returns `422` with the `sh:message` on violation.
- App lives at pod path `/public/apps/wiki-memory/`; dev serves the `app/` dir against the local http pod (`:3838`); proxy default `:8080 -> :3838`.
- Commit style: `[Agent: Claude]`-free here (repo convention in this tree is plain Conventional Commits, e.g. `feat(w2): …`); end with `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`. Stage specific files.

---

### Task 0: Spike — verify `jss install` on v0.0.209 (gates distribution)

**Files:**
- Create: `docs/superpowers/findings/2026-06-22-jss-install-spike.md`

This is a spike, not TDD. `features/app-install.md` documents `jss install` but the eval lists it OFF; the distribution story (Task 11) depends on it. Find out now.

- [ ] **Step 1: Bring up the local pod**

Run: `make up` then `curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3838/`
Expected: `200` (or `401`/`403` — pod reachable).

- [ ] **Step 2: Try installing a known app**

Run: `docker compose -f docker-compose.yml -f docker-compose.local.yml exec jss jss install chrome --user alice --password alicepassword123 2>&1 | tee /tmp/jss-install.log`
(If the `jss` binary isn't on PATH in the container, locate it: `... exec jss sh -lc 'command -v jss || ls /app/node_modules/.bin'` and adjust.)
Expected: either `✓ chrome` and `GET /public/apps/chrome/index.html` → 200, OR a captured failure.

- [ ] **Step 3: Record the finding**

Write `docs/superpowers/findings/2026-06-22-jss-install-spike.md` with: the exact command that worked (or failed), the resulting `GET /public/apps/chrome/` status, and the verdict — **WORKS** (Task 11 uses `jss install`) or **BLOCKED** (Task 11 falls back to a manual git push to `/public/apps/wiki-memory/` per `features/app-install.md` §"How it works": full clone, dual-push `HEAD:main`+`HEAD:gh-pages`).

- [ ] **Step 4: Commit**

```bash
git add docs/superpowers/findings/2026-06-22-jss-install-spike.md
git commit -m "$(printf 'spike(w2): verify jss install on v0.0.209\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

### Task 1: App scaffold + `pod.js` data-access core

**Files:**
- Create: `app/package.json`, `app/vitest.config.js`, `app/src/pod.js`, `app/test/pod.test.mjs`

**Interfaces:**
- Produces: `pod.js` exports `setSession({podUrl, token, proxyUrl})`, `getSession()`, `login(podUrl, email, password)`, `podFetch(url, opts)`, `listContainer(url)`, `getText(url, accept)`, `putCard(cardUrl, markdown)`, `getGraph(containerUrl)`.
  - `login` → `{token, webid}`; throws `Error` on non-2xx.
  - `podFetch(url, opts)` adds `Authorization: Bearer <token>` when a session token exists; returns the raw `Response`.
  - `putCard` PUTs to `proxyUrl + path-of(cardUrl)` with `Content-Type: text/markdown`; returns `{status, message}` where `message` is the response body text (the `sh:message` on 422).
  - `getGraph(containerUrl)` → text of `containerUrl + 'graph.ttl'` (Accept `text/turtle`).
  - `getText(url, accept)` → response body text.

- [ ] **Step 1: Scaffold package + vitest config**

`app/package.json`:
```json
{
  "name": "wiki-memory-app",
  "private": true,
  "type": "module",
  "scripts": { "test": "vitest run" },
  "devDependencies": {
    "vitest": "^4.1.9",
    "jsdom": "^25.0.0",
    "marked": "^14.1.0",
    "js-yaml": "^4.1.0",
    "n3": "^1.21.0",
    "cytoscape": "^3.30.0",
    "@comunica/query-sparql-link-traversal": "^4.0.0"
  }
}
```
`app/vitest.config.js`:
```js
import { defineConfig } from 'vitest/config'
export default defineConfig({ test: { environment: 'node' } })
```
Run: `cd app && npm install --silent && echo ok`
Expected: `ok`.

- [ ] **Step 2: Write the failing test**

`app/test/pod.test.mjs`:
```js
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setSession, login, podFetch, putCard, getGraph } from '../src/pod.js'

describe('pod', () => {
  beforeEach(() => setSession({ podUrl: '', token: '', proxyUrl: '' }))

  it('login posts credentials and returns token + webid', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ access_token: 'tok', webid: 'https://pod/alice#me' }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    const out = await login('http://localhost:3838', 'alice@x.io', 'pw')
    expect(out).toEqual({ token: 'tok', webid: 'https://pod/alice#me' })
    const [url, opts] = fetchMock.mock.calls[0]
    expect(url).toBe('http://localhost:3838/idp/credentials')
    expect(JSON.parse(opts.body)).toEqual({ email: 'alice@x.io', password: 'pw' })
  })

  it('podFetch attaches the bearer token', async () => {
    setSession({ podUrl: 'http://localhost:3838', token: 'tok', proxyUrl: '' })
    const fetchMock = vi.fn().mockResolvedValue(new Response('ok', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    await podFetch('http://localhost:3838/concepts/')
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe('Bearer tok')
  })

  it('putCard targets the proxy with text/markdown and returns status + body message', async () => {
    setSession({ podUrl: 'http://localhost:3838', token: 'tok', proxyUrl: 'http://localhost:8080' })
    const fetchMock = vi.fn().mockResolvedValue(new Response('# 422 …declare implementation', { status: 422 }))
    vi.stubGlobal('fetch', fetchMock)
    const r = await putCard('http://localhost:3838/concepts/x.md', '---\ntype: Concept\n---\n# X')
    const [url, opts] = fetchMock.mock.calls[0]
    expect(url).toBe('http://localhost:8080/concepts/x.md')
    expect(opts.headers['Content-Type']).toBe('text/markdown')
    expect(r.status).toBe(422)
    expect(r.message).toContain('declare implementation')
  })

  it('getGraph fetches graph.ttl with turtle accept', async () => {
    setSession({ podUrl: 'http://localhost:3838', token: 'tok', proxyUrl: '' })
    const fetchMock = vi.fn().mockResolvedValue(new Response('@prefix … .', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    await getGraph('http://localhost:3838/concepts/')
    expect(fetchMock.mock.calls[0][0]).toBe('http://localhost:3838/concepts/graph.ttl')
    expect(fetchMock.mock.calls[0][1].headers.Accept).toBe('text/turtle')
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd app && npx vitest run test/pod.test.mjs`
Expected: FAIL — `Cannot find module '../src/pod.js'`.

- [ ] **Step 4: Implement `app/src/pod.js`**

```js
// Data-access core. The ONE module that talks to the pod/proxy. No DOM.
let session = { podUrl: '', token: '', proxyUrl: '' }
export const setSession = s => { session = { ...session, ...s } }
export const getSession = () => ({ ...session })

const pathOf = url => new URL(url).pathname

export async function login(podUrl, email, password) {
  const res = await fetch(`${podUrl}/idp/credentials`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  if (!res.ok) throw new Error(`login failed (${res.status})`)
  const j = await res.json()
  return { token: j.access_token, webid: j.webid }
}

export function podFetch(url, opts = {}) {
  const headers = { ...(opts.headers || {}) }
  if (session.token) headers.Authorization = `Bearer ${session.token}`
  return fetch(url, { ...opts, headers })
}

export async function getText(url, accept = 'text/markdown') {
  const res = await podFetch(url, { headers: { Accept: accept } })
  if (!res.ok) throw new Error(`GET ${url} -> ${res.status}`)
  return res.text()
}

export async function listContainer(url) { return getText(url, 'text/turtle') }

export async function getGraph(containerUrl) {
  return getText(`${containerUrl}graph.ttl`, 'text/turtle')
}

export async function putCard(cardUrl, markdown) {
  const target = session.proxyUrl ? `${session.proxyUrl}${pathOf(cardUrl)}` : cardUrl
  const res = await podFetch(target, {
    method: 'PUT', headers: { 'Content-Type': 'text/markdown' }, body: markdown,
  })
  return { status: res.status, message: await res.text() }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd app && npx vitest run test/pod.test.mjs`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add app/package.json app/vitest.config.js app/src/pod.js app/test/pod.test.mjs
git commit -m "$(printf 'feat(w2): pod.js data-access core (auth + CRUD)\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

### Task 2: `parse.js` — frontmatter, markdown render, index.md parse

**Files:**
- Create: `app/src/parse.js`, `app/test/parse.test.mjs`

**Interfaces:**
- Produces:
  - `splitCard(md)` → `{ frontmatter: object, body: string }` (YAML between leading `---` fences; `{}` if none).
  - `renderBody(body)` → HTML string (`marked`, Semantic-Markdown `{…}` annotations stripped to plain text/links).
  - `parseIndex(md)` → `{ sections: [{ heading, entries: [{ title, href, desc, isContainer }] }] }` (isContainer = href ends with `/`).

- [ ] **Step 1: Write the failing test**

`app/test/parse.test.mjs`:
```js
import { describe, it, expect } from 'vitest'
import { splitCard, renderBody, parseIndex } from '../src/parse.js'

const card = `---
type: Concept
title: Progressive Disclosure
description: Layered retrieval.
---
{=<#it> .skos:Concept}

# Progressive Disclosure

A kind of [Hierarchical Retrieval](hierarchical-retrieval.md){skos:broader}.`

describe('parse', () => {
  it('splitCard separates frontmatter and body', () => {
    const { frontmatter, body } = splitCard(card)
    expect(frontmatter.title).toBe('Progressive Disclosure')
    expect(frontmatter.type).toBe('Concept')
    expect(body).toContain('# Progressive Disclosure')
  })

  it('renderBody drops semantic-markdown annotations and renders links', () => {
    const html = renderBody(splitCard(card).body)
    expect(html).toContain('<a href="hierarchical-retrieval.md">Hierarchical Retrieval</a>')
    expect(html).not.toContain('{skos:broader}')
    expect(html).not.toContain('{=<#it>')
  })

  it('parseIndex extracts sections with container vs concept entries', () => {
    const idx = `# Subdirectories\n\n* [implementations](implementations/)\n\n# Concepts\n\n* [Progressive Disclosure](progressive-disclosure.md) - Layered retrieval.\n`
    const { sections } = parseIndex(idx)
    expect(sections[0].heading).toBe('Subdirectories')
    expect(sections[0].entries[0]).toEqual({ title: 'implementations', href: 'implementations/', desc: '', isContainer: true })
    expect(sections[1].entries[0]).toEqual({ title: 'Progressive Disclosure', href: 'progressive-disclosure.md', desc: 'Layered retrieval.', isContainer: false })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd app && npx vitest run test/parse.test.mjs`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `app/src/parse.js`**

```js
import yaml from 'js-yaml'
import { marked } from 'marked'

export function splitCard(md) {
  const m = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(md)
  if (!m) return { frontmatter: {}, body: md }
  return { frontmatter: yaml.load(m[1]) || {}, body: m[2] }
}

// Semantic-Markdown: [text](url){pred} -> [text](url); [text]{pred} -> text; {=<#it> .Class} -> removed.
export function renderBody(body) {
  const cleaned = body
    .replace(/^\{=[^}]*\}\s*$/gm, '')
    .replace(/(\[[^\]]*\]\([^)]*\))\{[^}]*\}/g, '$1')
    .replace(/\[([^\]]*)\]\{[^}]*\}/g, '$1')
  return marked.parse(cleaned)
}

export function parseIndex(md) {
  const sections = []
  let cur = null
  for (const line of md.split('\n')) {
    const h = /^#\s+(.*)$/.exec(line)
    if (h) { cur = { heading: h[1].trim(), entries: [] }; sections.push(cur); continue }
    const e = /^\*\s+\[([^\]]+)\]\(([^)]+)\)(?:\s+-\s+(.*))?$/.exec(line)
    if (e && cur) cur.entries.push({ title: e[1], href: e[2], desc: (e[3] || '').trim(), isContainer: e[2].endsWith('/') })
  }
  return { sections }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd app && npx vitest run test/parse.test.mjs`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add app/src/parse.js app/test/parse.test.mjs
git commit -m "$(printf 'feat(w2): parse.js — frontmatter, sem-markdown render, index parse\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

### Task 3: `graph.js` — Comunica traversal: worklist + cross-container neighborhood

**Files:**
- Create: `app/src/graph.js`, `app/test/graph.test.mjs`, `app/fixtures/concepts.ttl`, `app/fixtures/implementations.ttl`

**Interfaces:**
- Produces:
  - `worklist(graphUrl)` → `[{ concept, label }]` — concepts of type `skos:Concept` with no `wm:implementedBy` (the floor's rule).
  - `neighborhood(seedGraphUrl, focusIri)` → `{ nodes: [{ id, label, stub }], edges: [{ source, target, label }] }`. Follows typed edges; a target with no `skos:prefLabel` reachable becomes a stub node. Bounded: only the focus node's direct edges + their targets.
- Consumes: `pod.js` `getSession()` for the bearer (Comunica `httpProxyHandler`/headers via `lenient` fetch — in tests sources are local `file://`, no auth).

Note: traversal queries run with `@comunica/query-sparql-link-traversal`'s `QueryEngine`. Sources are `graph.ttl` URLs; the engine dereferences `wm:`/`skos:` IRI objects whose path resolves to another container's `graph.ttl` is NOT automatic — we seed with the concept-container graph and add the target container graphs explicitly by deriving them from edge object IRIs (path → `<container>graph.ttl`).

- [ ] **Step 1: Create fixtures**

`app/fixtures/concepts.ttl`:
```turtle
@prefix skos: <http://www.w3.org/2004/02/skos/core#> .
@prefix wm:   <https://w3id.org/cogitarelink/wm#> .
<http://pod.test/concepts/progressive-disclosure#it> a skos:Concept ;
  skos:prefLabel "Progressive Disclosure" ;
  skos:broader <http://pod.test/concepts/hierarchical-retrieval#it> ;
  wm:implementedBy <http://pod.test/implementations/index-view#it> .
<http://pod.test/concepts/hierarchical-retrieval#it> a skos:Concept ;
  skos:prefLabel "Hierarchical Retrieval" .
```
`app/fixtures/implementations.ttl`:
```turtle
@prefix skos: <http://www.w3.org/2004/02/skos/core#> .
<http://pod.test/implementations/index-view#it> a skos:Concept ;
  skos:prefLabel "Index View" .
```

- [ ] **Step 2: Write the failing test**

`app/test/graph.test.mjs`:
```js
import { describe, it, expect } from 'vitest'
import { pathToFileURL } from 'node:url'
import { worklist, neighborhood } from '../src/graph.js'

const concepts = pathToFileURL(new URL('../fixtures/concepts.ttl', import.meta.url).pathname).href

describe('graph', () => {
  it('worklist returns concepts with no wm:implementedBy', async () => {
    const rows = await worklist(concepts)
    expect(rows.map(r => r.label).sort()).toEqual(['Hierarchical Retrieval'])
  })

  it('neighborhood returns focus edges with labeled and stub targets', async () => {
    const n = await neighborhood(concepts, 'http://pod.test/concepts/progressive-disclosure#it')
    const labels = n.nodes.map(x => x.label)
    expect(labels).toContain('Progressive Disclosure')
    expect(labels).toContain('Hierarchical Retrieval')
    expect(n.edges.find(e => e.label === 'implementedBy')).toBeTruthy()
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd app && npx vitest run test/graph.test.mjs`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement `app/src/graph.js`**

```js
import { QueryEngine } from '@comunica/query-sparql-link-traversal'
const engine = new QueryEngine()
const SKOS = 'http://www.w3.org/2004/02/skos/core#'
const WM = 'https://w3id.org/cogitarelink/wm#'

const containerGraphOf = iri => { // path of an edge target → its container graph.ttl
  const u = new URL(iri); u.hash = ''
  u.pathname = u.pathname.replace(/[^/]*$/, '') + 'graph.ttl'
  return u.href
}

async function rows(query, sources) {
  const bindings = await (await engine.queryBindings(query, { sources, lenient: true })).toArray()
  return bindings
}

export async function worklist(graphUrl) {
  const q = `PREFIX skos: <${SKOS}> PREFIX wm: <${WM}>
    SELECT ?concept ?label WHERE {
      ?concept a skos:Concept ; skos:prefLabel ?label .
      FILTER NOT EXISTS { ?concept wm:implementedBy ?i } }`
  return (await rows(q, [graphUrl])).map(b => ({
    concept: b.get('concept').value, label: b.get('label').value }))
}

export async function neighborhood(seedGraphUrl, focusIri) {
  const edgeQ = `PREFIX skos: <${SKOS}> PREFIX wm: <${WM}>
    SELECT ?p ?o WHERE { <${focusIri}> ?p ?o .
      FILTER(?p IN (skos:broader, wm:implementedBy)) }`
  const edges = [], targets = new Set()
  for (const b of await rows(edgeQ, [seedGraphUrl])) {
    const o = b.get('o').value
    edges.push({ source: focusIri, target: o, label: b.get('p').value.split(/[#/]/).pop() })
    targets.add(o)
  }
  const sources = [seedGraphUrl, ...[...targets].map(containerGraphOf)]
  const labelQ = `PREFIX skos: <${SKOS}> SELECT ?s ?label WHERE { ?s skos:prefLabel ?label }`
  const labels = new Map()
  for (const b of await rows(labelQ, [...new Set(sources)])) labels.set(b.get('s').value, b.get('label').value)
  const ids = new Set([focusIri, ...targets])
  const nodes = [...ids].map(id => ({ id, label: labels.get(id) || id.split(/[#/]/).pop(), stub: !labels.has(id) }))
  return { nodes, edges }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd app && npx vitest run test/graph.test.mjs`
Expected: PASS (2 tests). (If link-traversal logs dereference warnings for `file://` targets, they're harmless — `lenient: true` tolerates them; labels for cross-file targets resolve because their container graphs are added explicitly.)

- [ ] **Step 6: Commit**

```bash
git add app/src/graph.js app/test/graph.test.mjs app/fixtures/
git commit -m "$(printf 'feat(w2): graph.js — Comunica worklist + cross-container neighborhood\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

### Task 4: CORS on the SHACL proxy (browser write path)

**Files:**
- Modify: `constrained-container/proxy.js:78-152`
- Test: `constrained-container/cors.test.js`

**Interfaces:**
- Produces: every proxy response carries `access-control-allow-origin`; `OPTIONS` preflight returns `204`; `access-control-expose-headers` includes `link, warning` so the browser can read the 422 `constrainedBy` Link and advisory Warning.

- [ ] **Step 1: Write the failing test**

`constrained-container/cors.test.js`:
```js
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { spawn } from 'node:child_process'

let proc
const PORT = 8099
beforeAll(async () => {
  proc = spawn('node', ['proxy.js'], { cwd: import.meta.dirname, env: { ...process.env, PORT, UPSTREAM: 'http://localhost:3838' } })
  await new Promise(r => setTimeout(r, 600))
})
afterAll(() => proc?.kill())

describe('proxy CORS', () => {
  it('answers OPTIONS preflight with 204 and allow headers', async () => {
    const res = await fetch(`http://localhost:${PORT}/concepts/x.md`, {
      method: 'OPTIONS', headers: { origin: 'http://localhost:5173', 'access-control-request-method': 'PUT' } })
    expect(res.status).toBe(204)
    expect(res.headers.get('access-control-allow-origin')).toBeTruthy()
    expect(res.headers.get('access-control-allow-headers').toLowerCase()).toContain('authorization')
  })

  it('exposes link and warning headers on responses', async () => {
    const res = await fetch(`http://localhost:${PORT}/`, { headers: { origin: 'http://localhost:5173' } })
    expect((res.headers.get('access-control-expose-headers') || '').toLowerCase()).toContain('link')
  })
})
```
Add to `constrained-container/package.json` test deps if needed (vitest already configured there per `vitest.config.js`).

- [ ] **Step 2: Run test to verify it fails**

Run: `cd constrained-container && npx vitest run cors.test.js`
Expected: FAIL — OPTIONS returns non-204 / missing CORS headers.

- [ ] **Step 3: Edit `constrained-container/proxy.js`**

Immediately after `const auth = req.headers['authorization'];` (line 82), insert:
```js
  const CORS = {
    'access-control-allow-origin': req.headers.origin || '*',
    'access-control-allow-methods': 'GET, HEAD, PUT, POST, PATCH, OPTIONS',
    'access-control-allow-headers': 'authorization, content-type, accept',
    'access-control-expose-headers': 'link, warning',
  };
  if (method === 'OPTIONS') { res.writeHead(204, CORS); res.end(); return; }
```
Then merge `CORS` into the three `res.writeHead(...)` response objects: the early 422 (line ~94), the shape 422 (line ~127), and the final forward (line ~150). For each, spread `...CORS` into the headers object, e.g. line 150 becomes:
```js
  res.writeHead(up.status, { ...out, ...CORS });
```
and the two 422 writes become `res.writeHead(422, { 'Content-Type': 'text/plain', ...CORS })` and `res.writeHead(422, { 'Content-Type': 'text/plain', 'Link': `<${shapeUrl}>; rel="${CB}"`, ...CORS })`.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd constrained-container && npx vitest run cors.test.js`
Expected: PASS (2 tests).

- [ ] **Step 5: Run the existing proxy suite to confirm no regression**

Run: `cd constrained-container && npx vitest run`
Expected: prior floor + P2 tests still PASS.

- [ ] **Step 6: Commit**

```bash
git add constrained-container/proxy.js constrained-container/cors.test.js
git commit -m "$(printf 'feat(w2): CORS on the admission proxy for the browser write path\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

### Task 5: App shell + `<wm-login>` + import map (`index.html`)

**Files:**
- Create: `app/index.html`, `app/src/components/wm-login.js`, `app/test/wm-login.test.mjs`
- Modify: `app/vitest.config.js` (allow jsdom per-file)

**Interfaces:**
- Produces: `<wm-login>` custom element. On successful `login()` it calls `setSession({podUrl, token, proxyUrl})` and dispatches `wm-authenticated` (bubbles, composed) with `detail: { webid }`. Reads pod URL + proxy URL + email + password from inputs.

- [ ] **Step 1: Allow jsdom for component tests**

Set `app/vitest.config.js`:
```js
import { defineConfig } from 'vitest/config'
export default defineConfig({ test: { environment: 'jsdom' } })
```
(Node-only tests still pass under jsdom; `fetch`/`Response` are global in Node 18+.)

- [ ] **Step 2: Write the failing test**

`app/test/wm-login.test.mjs`:
```js
import { describe, it, expect, beforeEach, vi } from 'vitest'
import '../src/components/wm-login.js'
import { getSession } from '../src/pod.js'

describe('<wm-login>', () => {
  beforeEach(() => { document.body.innerHTML = '' })

  it('logs in, sets session, and emits wm-authenticated', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ access_token: 'tok', webid: 'https://pod/alice#me' }), { status: 200 })))
    const el = document.createElement('wm-login')
    document.body.appendChild(el)
    el.shadowRoot.querySelector('[name=pod]').value = 'http://localhost:3838'
    el.shadowRoot.querySelector('[name=proxy]').value = 'http://localhost:8080'
    el.shadowRoot.querySelector('[name=email]').value = 'alice@x.io'
    el.shadowRoot.querySelector('[name=password]').value = 'pw'
    const seen = new Promise(r => el.addEventListener('wm-authenticated', e => r(e.detail)))
    el.shadowRoot.querySelector('form').dispatchEvent(new Event('submit'))
    const detail = await seen
    expect(detail.webid).toBe('https://pod/alice#me')
    expect(getSession().token).toBe('tok')
    expect(getSession().proxyUrl).toBe('http://localhost:8080')
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd app && npx vitest run test/wm-login.test.mjs`
Expected: FAIL — custom element undefined / no shadowRoot.

- [ ] **Step 4: Implement `app/src/components/wm-login.js`**

```js
import { login, setSession } from '../pod.js'

class WmLogin extends HTMLElement {
  connectedCallback() {
    this.attachShadow({ mode: 'open' }).innerHTML = `
      <form>
        <input name="pod" placeholder="pod URL" value="http://localhost:3838">
        <input name="proxy" placeholder="proxy URL" value="http://localhost:8080">
        <input name="email" placeholder="email">
        <input name="password" type="password" placeholder="password">
        <button type="submit">Log in</button>
        <p class="err"></p>
      </form>`
    this.shadowRoot.querySelector('form').addEventListener('submit', e => { e.preventDefault?.(); this._submit() })
  }
  async _submit() {
    const v = n => this.shadowRoot.querySelector(`[name=${n}]`).value.trim()
    try {
      const { token, webid } = await login(v('pod'), v('email'), v('password'))
      setSession({ podUrl: v('pod'), token, proxyUrl: v('proxy') })
      this.dispatchEvent(new CustomEvent('wm-authenticated', { bubbles: true, composed: true, detail: { webid } }))
    } catch (e) { this.shadowRoot.querySelector('.err').textContent = e.message }
  }
}
customElements.define('wm-login', WmLogin)
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd app && npx vitest run test/wm-login.test.mjs`
Expected: PASS.

- [ ] **Step 6: Create the shell `app/index.html`**

```html
<!doctype html><html><head><meta charset="utf-8"><title>wiki-memory</title>
<script type="importmap">
{ "imports": {
  "marked": "https://esm.sh/marked@14",
  "js-yaml": "https://esm.sh/js-yaml@4",
  "n3": "https://esm.sh/n3@1",
  "cytoscape": "https://esm.sh/cytoscape@3"
}}
</script>
</head><body>
<wm-app></wm-app>
<script type="module" src="./src/components/wm-app.js"></script>
</body></html>
```
(`wm-app.js` is created in Task 9; the shell references it now so the file is complete.)

- [ ] **Step 7: Commit**

```bash
git add app/index.html app/src/components/wm-login.js app/test/wm-login.test.mjs app/vitest.config.js
git commit -m "$(printf 'feat(w2): app shell, import map, and <wm-login>\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

### Task 6: `<wm-index>` — progressive-disclosure navigation

**Files:**
- Create: `app/src/components/wm-index.js`, `app/test/wm-index.test.mjs`

**Interfaces:**
- Consumes: `pod.js` `getText(containerUrl+'index.md')`, `parse.js` `parseIndex`.
- Produces: `<wm-index container="<url>">`. Renders each section; concept entries dispatch `wm-open-card` (detail `{ url }`), container entries dispatch `wm-open-container` (detail `{ url }`). If any single section has > 12 entries, renders a `.fano-warn` notice ("N children — exceeds the Fano bound of 12; candidate for a sub-index").

- [ ] **Step 1: Write the failing test**

`app/test/wm-index.test.mjs`:
```js
import { describe, it, expect, vi, beforeEach } from 'vitest'
import '../src/components/wm-index.js'
import * as pod from '../src/pod.js'

const INDEX = `# Subdirectories\n\n* [implementations](implementations/)\n\n# Concepts\n\n* [Progressive Disclosure](progressive-disclosure.md) - Layered retrieval.\n`

describe('<wm-index>', () => {
  beforeEach(() => { document.body.innerHTML = ''; vi.restoreAllMocks() })

  it('renders entries and emits open events', async () => {
    vi.spyOn(pod, 'getText').mockResolvedValue(INDEX)
    const el = document.createElement('wm-index')
    el.setAttribute('container', 'http://localhost:3838/concepts/')
    document.body.appendChild(el)
    await el.refresh()
    const links = [...el.shadowRoot.querySelectorAll('a')]
    expect(links.map(a => a.textContent)).toContain('Progressive Disclosure')
    const card = new Promise(r => el.addEventListener('wm-open-card', e => r(e.detail.url)))
    links.find(a => a.textContent === 'Progressive Disclosure').click()
    expect(await card).toBe('http://localhost:3838/concepts/progressive-disclosure.md')
  })

  it('flags a section exceeding the Fano bound', async () => {
    const many = '# Concepts\n\n' + Array.from({ length: 13 }, (_, i) => `* [C${i}](c${i}.md)`).join('\n') + '\n'
    vi.spyOn(pod, 'getText').mockResolvedValue(many)
    const el = document.createElement('wm-index')
    el.setAttribute('container', 'http://localhost:3838/concepts/')
    document.body.appendChild(el)
    await el.refresh()
    expect(el.shadowRoot.querySelector('.fano-warn')).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd app && npx vitest run test/wm-index.test.mjs`
Expected: FAIL — element undefined.

- [ ] **Step 3: Implement `app/src/components/wm-index.js`**

```js
import { getText } from '../pod.js'
import { parseIndex } from '../parse.js'

class WmIndex extends HTMLElement {
  connectedCallback() { this.attachShadow({ mode: 'open' }); this.refresh() }
  get container() { return this.getAttribute('container') }
  async refresh() {
    if (!this.container) return
    let md
    try { md = await getText(`${this.container}index.md`, 'text/markdown') }
    catch { this.shadowRoot.innerHTML = '<p>empty container</p>'; return }
    const { sections } = parseIndex(md)
    const esc = s => s.replace(/[<&]/g, c => ({ '<': '&lt;', '&': '&amp;' }[c]))
    this.shadowRoot.innerHTML = sections.map(sec => `
      <section><h2>${esc(sec.heading)}</h2>
      ${sec.entries.length > 12 ? `<p class="fano-warn">${sec.entries.length} children — exceeds the Fano bound of 12; candidate for a sub-index.</p>` : ''}
      <ul>${sec.entries.map(e => `<li><a href="#" data-url="${this.container}${e.href}" data-c="${e.isContainer}">${esc(e.title)}</a>${e.desc ? ' — ' + esc(e.desc) : ''}</li>`).join('')}</ul>
      </section>`).join('')
    this.shadowRoot.querySelectorAll('a').forEach(a => a.addEventListener('click', ev => {
      ev.preventDefault()
      const url = a.dataset.url
      const name = a.dataset.c === 'true' ? 'wm-open-container' : 'wm-open-card'
      this.dispatchEvent(new CustomEvent(name, { bubbles: true, composed: true, detail: { url } }))
    }))
  }
}
customElements.define('wm-index', WmIndex)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd app && npx vitest run test/wm-index.test.mjs`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add app/src/components/wm-index.js app/test/wm-index.test.mjs
git commit -m "$(printf 'feat(w2): <wm-index> progressive-disclosure navigation + Fano flag\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

### Task 7: `<wm-card>` — read view + Relates/Implements panel + Edit toggle

**Files:**
- Create: `app/src/components/wm-card.js`, `app/test/wm-card.test.mjs`

**Interfaces:**
- Consumes: `pod.js` `getText(cardUrl)` + `getGraph(containerOf(cardUrl))`; `parse.js` `splitCard`/`renderBody`; `graph.js` `neighborhood`.
- Produces: `<wm-card url="<cardUrl>">`. Renders header (title/type/description) + body HTML + a Relates panel listing edges from `neighborhood`. An "Edit" button dispatches `wm-edit` (detail `{ url, markdown }`).
- The card's subject IRI is `<cardUrl-without-.md>#it`; its container is `cardUrl` up to the last `/`.

- [ ] **Step 1: Write the failing test**

`app/test/wm-card.test.mjs`:
```js
import { describe, it, expect, vi, beforeEach } from 'vitest'
import '../src/components/wm-card.js'
import * as pod from '../src/pod.js'
import * as graph from '../src/graph.js'

const CARD = `---\ntype: Concept\ntitle: Progressive Disclosure\ndescription: Layered retrieval.\n---\n{=<#it> .skos:Concept}\n\n# Progressive Disclosure\n\nBody.`

describe('<wm-card>', () => {
  beforeEach(() => { document.body.innerHTML = ''; vi.restoreAllMocks() })

  it('renders header, body, relates panel, and emits wm-edit', async () => {
    vi.spyOn(pod, 'getText').mockResolvedValue(CARD)
    vi.spyOn(pod, 'getGraph').mockResolvedValue('')
    vi.spyOn(graph, 'neighborhood').mockResolvedValue({
      nodes: [{ id: 'http://pod/implementations/index-view#it', label: 'Index View', stub: false }],
      edges: [{ source: 'x', target: 'http://pod/implementations/index-view#it', label: 'implementedBy' }] })
    const el = document.createElement('wm-card')
    el.setAttribute('url', 'http://localhost:3838/concepts/progressive-disclosure.md')
    document.body.appendChild(el)
    await el.refresh()
    expect(el.shadowRoot.querySelector('h1').textContent).toBe('Progressive Disclosure')
    expect(el.shadowRoot.textContent).toContain('implementedBy')
    expect(el.shadowRoot.textContent).toContain('Index View')
    const edit = new Promise(r => el.addEventListener('wm-edit', e => r(e.detail)))
    el.shadowRoot.querySelector('.edit').click()
    const d = await edit
    expect(d.url).toContain('progressive-disclosure.md')
    expect(d.markdown).toContain('# Progressive Disclosure')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd app && npx vitest run test/wm-card.test.mjs`
Expected: FAIL — element undefined.

- [ ] **Step 3: Implement `app/src/components/wm-card.js`**

```js
import { getText } from '../pod.js'
import { splitCard, renderBody } from '../parse.js'
import { neighborhood } from '../graph.js'

const containerOf = url => url.slice(0, url.lastIndexOf('/') + 1)
const subjectOf = url => url.replace(/\.md$/, '') + '#it'

class WmCard extends HTMLElement {
  connectedCallback() { this.attachShadow({ mode: 'open' }); this.refresh() }
  get url() { return this.getAttribute('url') }
  async refresh() {
    if (!this.url) return
    this._md = await getText(this.url, 'text/markdown')
    const { frontmatter, body } = splitCard(this._md)
    let nb = { nodes: [], edges: [] }
    try { nb = await neighborhood(`${containerOf(this.url)}graph.ttl`, subjectOf(this.url)) } catch {}
    const esc = s => String(s).replace(/[<&]/g, c => ({ '<': '&lt;', '&': '&amp;' }[c]))
    const labelOf = id => (nb.nodes.find(n => n.id === id) || {}).label || id
    const rel = nb.edges.length ? `<aside class="relates"><h3>Relates / Implements</h3><ul>${
      nb.edges.map(e => `<li>${esc(e.label)} → ${esc(labelOf(e.target))}</li>`).join('')}</ul></aside>` : ''
    this.shadowRoot.innerHTML = `
      <header><h1>${esc(frontmatter.title || '')}</h1>
        <p class="meta">${esc(frontmatter.type || '')} — ${esc(frontmatter.description || '')}</p>
        <button class="edit">Edit</button></header>
      <article>${renderBody(body)}</article>${rel}`
    this.shadowRoot.querySelector('.edit').addEventListener('click', () =>
      this.dispatchEvent(new CustomEvent('wm-edit', { bubbles: true, composed: true, detail: { url: this.url, markdown: this._md } })))
  }
}
customElements.define('wm-card', WmCard)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd app && npx vitest run test/wm-card.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/src/components/wm-card.js app/test/wm-card.test.mjs
git commit -m "$(printf 'feat(w2): <wm-card> read view + relates panel + edit toggle\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

### Task 8: `<wm-editor>` — correction loop through the floor

**Files:**
- Create: `app/src/components/wm-editor.js`, `app/test/wm-editor.test.mjs`

**Interfaces:**
- Consumes: `pod.js` `putCard(url, markdown)`.
- Produces: `<wm-editor>`. `open({url, markdown})` shows a textarea. Save → `putCard`; on `422` shows `result.message` in `.floor-msg` (the `sh:message`); on 2xx dispatches `wm-saved` (detail `{ url }`) and clears the message.

- [ ] **Step 1: Write the failing test**

`app/test/wm-editor.test.mjs`:
```js
import { describe, it, expect, vi, beforeEach } from 'vitest'
import '../src/components/wm-editor.js'
import * as pod from '../src/pod.js'

describe('<wm-editor>', () => {
  beforeEach(() => { document.body.innerHTML = ''; vi.restoreAllMocks() })

  it('shows the floor 422 message and does not emit saved', async () => {
    vi.spyOn(pod, 'putCard').mockResolvedValue({ status: 422, message: '# 422 …declare how this concept is implemented' })
    const el = document.createElement('wm-editor'); document.body.appendChild(el)
    el.open({ url: 'http://localhost:3838/concepts/x.md', markdown: '---\ntype: Concept\n---\n# X' })
    let saved = false; el.addEventListener('wm-saved', () => { saved = true })
    await el.save()
    expect(el.shadowRoot.querySelector('.floor-msg').textContent).toContain('declare how this concept is implemented')
    expect(saved).toBe(false)
  })

  it('emits wm-saved on 2xx', async () => {
    vi.spyOn(pod, 'putCard').mockResolvedValue({ status: 205, message: '' })
    const el = document.createElement('wm-editor'); document.body.appendChild(el)
    el.open({ url: 'http://localhost:3838/concepts/x.md', markdown: 'x' })
    const seen = new Promise(r => el.addEventListener('wm-saved', e => r(e.detail.url)))
    await el.save()
    expect(await seen).toContain('x.md')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd app && npx vitest run test/wm-editor.test.mjs`
Expected: FAIL — element undefined.

- [ ] **Step 3: Implement `app/src/components/wm-editor.js`**

```js
import { putCard } from '../pod.js'

class WmEditor extends HTMLElement {
  connectedCallback() {
    this.attachShadow({ mode: 'open' }).innerHTML =
      `<textarea rows="20" cols="80"></textarea><button class="save">Save</button><pre class="floor-msg"></pre>`
    this.shadowRoot.querySelector('.save').addEventListener('click', () => this.save())
  }
  open({ url, markdown }) {
    this._url = url
    this.shadowRoot.querySelector('textarea').value = markdown
    this.shadowRoot.querySelector('.floor-msg').textContent = ''
  }
  async save() {
    const md = this.shadowRoot.querySelector('textarea').value
    const r = await putCard(this._url, md)
    const msg = this.shadowRoot.querySelector('.floor-msg')
    if (r.status >= 200 && r.status < 300) {
      msg.textContent = ''
      this.dispatchEvent(new CustomEvent('wm-saved', { bubbles: true, composed: true, detail: { url: this._url } }))
    } else { msg.textContent = r.message || `save failed (${r.status})` }
  }
}
customElements.define('wm-editor', WmEditor)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd app && npx vitest run test/wm-editor.test.mjs`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add app/src/components/wm-editor.js app/test/wm-editor.test.mjs
git commit -m "$(printf 'feat(w2): <wm-editor> correction loop surfaces the floor sh:message\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

### Task 9: `<wm-graph>` + `<wm-app>` shell (routing + composition)

**Files:**
- Create: `app/src/components/wm-graph.js`, `app/src/components/wm-app.js`, `app/test/wm-app.test.mjs`

**Interfaces:**
- `<wm-graph container="<url>" focus="<iri>">`: builds Cytoscape elements from `neighborhood`; stub nodes get class `stub`; node tap dispatches `wm-open-card` (detail `{ url }`, deriving cardUrl from the node IRI: strip `#it`, add `.md`). Cytoscape is imported lazily; in jsdom tests `<wm-graph>` exposes `elements()` (the computed array) so we assert on data without a real canvas.
- `<wm-app>`: composes `<wm-login>` → on `wm-authenticated` mounts `<wm-index>` (root container `${podUrl}/concepts/`) + listens for `wm-open-card`/`wm-open-container`/`wm-edit`/`wm-saved` and routes (mounts `<wm-card>`, swaps container, opens `<wm-editor>`, refreshes on save).

- [ ] **Step 1: Write the failing test (graph elements + app wiring)**

`app/test/wm-app.test.mjs`:
```js
import { describe, it, expect, vi, beforeEach } from 'vitest'
import '../src/components/wm-graph.js'
import '../src/components/wm-app.js'
import * as graph from '../src/graph.js'

describe('<wm-graph>', () => {
  beforeEach(() => { document.body.innerHTML = ''; vi.restoreAllMocks() })
  it('computes cytoscape elements with a stub class and card-open on tap data', async () => {
    vi.spyOn(graph, 'neighborhood').mockResolvedValue({
      nodes: [{ id: 'http://pod/concepts/a#it', label: 'A', stub: false },
              { id: 'http://pod/concepts/b#it', label: 'B', stub: true }],
      edges: [{ source: 'http://pod/concepts/a#it', target: 'http://pod/concepts/b#it', label: 'implementedBy' }] })
    const el = document.createElement('wm-graph')
    el.setAttribute('container', 'http://pod/concepts/')
    el.setAttribute('focus', 'http://pod/concepts/a#it')
    document.body.appendChild(el)
    await el.refresh()
    const els = el.elements()
    expect(els.find(e => e.data.id === 'http://pod/concepts/b#it').classes).toBe('stub')
    expect(els.find(e => e.data.source)).toBeTruthy()
  })
})

describe('<wm-app>', () => {
  beforeEach(() => { document.body.innerHTML = '' })
  it('mounts index after authentication', async () => {
    const el = document.createElement('wm-app'); document.body.appendChild(el)
    el.dispatchEvent(new CustomEvent('wm-authenticated', { bubbles: true, composed: true, detail: { webid: 'w' } }))
    // session podUrl is read from getSession(); set it directly for the test
    const { setSession } = await import('../src/pod.js'); setSession({ podUrl: 'http://localhost:3838' })
    el._onAuth()
    expect(el.shadowRoot.querySelector('wm-index')).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd app && npx vitest run test/wm-app.test.mjs`
Expected: FAIL — elements undefined.

- [ ] **Step 3: Implement `app/src/components/wm-graph.js`**

```js
import { neighborhood } from '../graph.js'
const cardUrlOf = iri => { const u = new URL(iri); u.hash = ''; return u.href.replace(/([^/]+)$/, '$1.md') }

class WmGraph extends HTMLElement {
  connectedCallback() { this.attachShadow({ mode: 'open' }).innerHTML = '<div id="cy" style="height:400px"></div>'; this.refresh() }
  get container() { return this.getAttribute('container') }
  get focus() { return this.getAttribute('focus') }
  _els = []
  elements() { return this._els }
  async refresh() {
    if (!this.container || !this.focus) return
    const nb = await neighborhood(`${this.container}graph.ttl`, this.focus)
    this._els = [
      ...nb.nodes.map(n => ({ data: { id: n.id, label: n.label }, classes: n.stub ? 'stub' : '' })),
      ...nb.edges.map(e => ({ data: { id: `${e.source}|${e.label}|${e.target}`, source: e.source, target: e.target, label: e.label } })),
    ]
    const cy = await import('cytoscape').then(m => m.default).catch(() => null)
    if (!cy || !this.shadowRoot.querySelector('#cy')) return
    const inst = cy({ container: this.shadowRoot.querySelector('#cy'), elements: this._els,
      style: [{ selector: 'node', style: { label: 'data(label)' } },
              { selector: 'node.stub', style: { 'border-style': 'dashed', 'background-color': '#fff' } },
              { selector: 'edge', style: { label: 'data(label)', 'curve-style': 'bezier', 'target-arrow-shape': 'triangle' } }] })
    inst.on('tap', 'node', ev => this.dispatchEvent(new CustomEvent('wm-open-card',
      { bubbles: true, composed: true, detail: { url: cardUrlOf(ev.target.id()) } })))
  }
}
customElements.define('wm-graph', WmGraph)
```

- [ ] **Step 4: Implement `app/src/components/wm-app.js`**

```js
import './wm-login.js'; import './wm-index.js'; import './wm-card.js'; import './wm-editor.js'; import './wm-graph.js'
import { getSession } from '../pod.js'
const containerOf = url => url.slice(0, url.lastIndexOf('/') + 1)
const subjectOf = url => url.replace(/\.md$/, '') + '#it'

class WmApp extends HTMLElement {
  connectedCallback() {
    this.attachShadow({ mode: 'open' }).innerHTML = `<wm-login></wm-login><main></main>`
    this.addEventListener('wm-authenticated', () => this._onAuth())
    this.addEventListener('wm-open-container', e => this._showContainer(e.detail.url))
    this.addEventListener('wm-open-card', e => this._showCard(e.detail.url))
    this.addEventListener('wm-edit', e => this._edit(e.detail))
    this.addEventListener('wm-saved', e => this._showCard(e.detail.url))
  }
  get _main() { return this.shadowRoot.querySelector('main') }
  _onAuth() { this.shadowRoot.querySelector('wm-login').remove?.(); this._showContainer(`${getSession().podUrl}/concepts/`) }
  _showContainer(url) { this._main.innerHTML = `<wm-index container="${url}"></wm-index>` }
  _showCard(url) {
    this._main.innerHTML =
      `<wm-card url="${url}"></wm-card><wm-graph container="${containerOf(url)}" focus="${subjectOf(url)}"></wm-graph>`
  }
  _edit({ url, markdown }) {
    this._main.innerHTML = `<wm-editor></wm-editor>`
    this._main.querySelector('wm-editor').open({ url, markdown })
  }
}
customElements.define('wm-app', WmApp)
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd app && npx vitest run test/wm-app.test.mjs`
Expected: PASS (graph elements + app mounts index). (Cytoscape's lazy import is tolerated by the `.catch(() => null)` guard in jsdom.)

- [ ] **Step 6: Run the whole app unit suite**

Run: `cd app && npx vitest run`
Expected: all unit tests PASS.

- [ ] **Step 7: Commit**

```bash
git add app/src/components/wm-graph.js app/src/components/wm-app.js app/test/wm-app.test.mjs
git commit -m "$(printf 'feat(w2): <wm-graph> scoped neighborhood + <wm-app> routing shell\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

### Task 10: Seed content + e2e against the local pod + `make test-app`

**Files:**
- Create: `app/seed/concepts/progressive-disclosure.md`, `.../hierarchical-retrieval.md`, `.../dual-layer-linking.md`, `app/seed/implementations/index-view.md`, `app/seed/seed.mjs`, `app/test/e2e.test.mjs`
- Modify: `Makefile` (add `test-app`), `Makefile:5` (`.PHONY`)

**Interfaces:**
- `seed.mjs` logs in (env `POD`, `EMAIL`, `PW`), creates `/concepts/` + `/implementations/` containers, and PUTs the cards **through the proxy** (env `PROXY`). `hierarchical-retrieval` deliberately omits `wm:implementedBy`.

- [ ] **Step 1: Write the seed cards**

`app/seed/concepts/progressive-disclosure.md`:
```markdown
---
type: Concept
title: Progressive Disclosure
description: Layered retrieval — orientation first, drill into detail on demand.
---
{=<#it> .skos:Concept}

# Progressive Disclosure

[Progressive Disclosure]{skos:prefLabel} is a kind of [Hierarchical Retrieval](hierarchical-retrieval.md){skos:broader}, realized by the [index view](/implementations/index-view.md){wm:implementedBy}.
```
`app/seed/concepts/hierarchical-retrieval.md` (no implementation edge — the floor flags it):
```markdown
---
type: Concept
title: Hierarchical Retrieval
description: Routing through a typed hierarchy instead of flat similarity search.
---
{=<#it> .skos:Concept}

# Hierarchical Retrieval

[Hierarchical Retrieval]{skos:prefLabel} routes a query through typed structure.
```
`app/seed/concepts/dual-layer-linking.md`:
```markdown
---
type: Concept
title: Dual-Layer Linking
description: Markdown wikilinks at the token layer plus RDF predicates at the data layer.
---
{=<#it> .skos:Concept}

# Dual-Layer Linking

[Dual-Layer Linking]{skos:prefLabel} realized by the [markdown projection](/implementations/index-view.md){wm:implementedBy}.
```
`app/seed/implementations/index-view.md`:
```markdown
---
type: Concept
title: Index View
description: The derived index.md navigation channel.
---
{=<#it> .skos:Concept}

# Index View

[Index View]{skos:prefLabel} renders a container's OKF navigation.
```

- [ ] **Step 2: Write `app/seed/seed.mjs`**

```js
import { readFileSync } from 'node:fs'
const POD = process.env.POD || 'http://localhost:3838'
const PROXY = process.env.PROXY || 'http://localhost:8080'
const EMAIL = process.env.EMAIL || 'alice@example.com'
const PW = process.env.PW || 'alicepassword123'

const tok = await (await fetch(`${POD}/idp/credentials`, { method: 'POST',
  headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: EMAIL, password: PW }) })).json()
const H = { Authorization: `Bearer ${tok.access_token}` }
const mkContainer = async name => fetch(`${POD}/${name}/`, { method: 'PUT', headers: { ...H, 'Content-Type': 'text/turtle', Link: '<http://www.w3.org/ns/ldp#BasicContainer>; rel="type"' } })
const put = async (container, file) => {
  const md = readFileSync(new URL(`./${container}/${file}`, import.meta.url))
  const r = await fetch(`${PROXY}/${container}/${file}`, { method: 'PUT', headers: { ...H, 'Content-Type': 'text/markdown' }, body: md })
  console.log(`${container}/${file} -> ${r.status}`)
}
await mkContainer('concepts'); await mkContainer('implementations')
await put('implementations', 'index-view.md')
await put('concepts', 'progressive-disclosure.md')
await put('concepts', 'dual-layer-linking.md')
await put('concepts', 'hierarchical-retrieval.md') // expect 422 from the floor — that's the demo
```

- [ ] **Step 3: Write the e2e test**

`app/test/e2e.test.mjs`:
```js
import { describe, it, expect } from 'vitest'
import { setSession, login, getText, getGraph, putCard } from '../src/pod.js'
import { worklist } from '../src/graph.js'

const POD = process.env.POD || 'http://localhost:3838'
const PROXY = process.env.PROXY || 'http://localhost:8080'

describe('e2e (requires: make up, proxy on :8080, seeded)', () => {
  it('logs in, reads index, lists worklist, and the floor rejects a bad correction', async () => {
    const { token } = await login(POD, process.env.EMAIL || 'alice@example.com', process.env.PW || 'alicepassword123')
    setSession({ podUrl: POD, token, proxyUrl: PROXY })
    const idx = await getText(`${POD}/concepts/index.md`, 'text/markdown')
    expect(idx).toContain('Progressive Disclosure')
    const graphUrl = `${POD}/concepts/graph.ttl`
    const rows = await worklist(graphUrl)
    expect(rows.map(r => r.label)).toContain('Hierarchical Retrieval')
    const bad = `---\ntype: Concept\ntitle: T\n---\n{=<#it> .skos:Concept}\n\n# T\n\n[T]{skos:prefLabel} has no implementation.`
    const r = await putCard(`${POD}/concepts/needs-impl.md`, bad)
    expect(r.status).toBe(422)
    expect(r.message.toLowerCase()).toContain('implement')
  })
})
```

- [ ] **Step 4: Add the Makefile gate**

In `Makefile`, add `test-app` to `.PHONY` (line 5) and a target:
```make
# Wiki-memory app gate — unit (jsdom/node) + e2e against the running pod (Task 10).
test-app:
	cd app && npm install --silent && npx vitest run --exclude '**/e2e.test.mjs'

test-app-e2e:
	cd app && POD=http://localhost:3838 PROXY=http://localhost:8080 npx vitest run test/e2e.test.mjs
```

- [ ] **Step 5: Run the unit gate, then the e2e gate**

Run: `make test-app`
Expected: all unit tests PASS.
Then (pod up, proxy running, seeded): `make up && (cd constrained-container && PORT=8080 node proxy.js &) && node app/seed/seed.mjs && make test-app-e2e`
Expected: e2e PASS — index has the concepts, worklist names `Hierarchical Retrieval`, the bad PUT returns 422 with an "implement" message.

- [ ] **Step 6: Commit**

```bash
git add app/seed/ app/test/e2e.test.mjs Makefile
git commit -m "$(printf 'feat(w2): seed content + e2e gate + make test-app\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

### Task 11: Distribution — serve in dev, install into the pod

**Files:**
- Create: `app/README.md`
- Depends on: Task 0 verdict.

- [ ] **Step 1: Document dev serving**

`app/README.md` — record: dev = `cd app && python3 -m http.server 5173` (or any static server) against `make up` (:3838) + proxy on :8080; the import map loads deps from esm.sh so no bundler is needed. Note the pod must run with `--idp --conneg` and the proxy must have CORS (Task 4).

- [ ] **Step 2: Install into the pod (per Task 0 verdict)**

If Task 0 = **WORKS**: push the `app/` tree to a git repo and run `jss install <org>/<repo>=wiki-memory --user alice --password alicepassword123`, OR install directly from the local path per the spike's working invocation.
If Task 0 = **BLOCKED**: manual path from `features/app-install.md` — `git init` in `app/`, commit, then dual-push to `<pod>/public/apps/wiki-memory` on `HEAD:main` and `HEAD:gh-pages` with `git -c http.extraHeader="Authorization: Bearer <token>" push`.

Run (whichever applies), then: `curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3838/public/apps/wiki-memory/index.html`
Expected: `200`.

- [ ] **Step 3: Manual smoke in a browser**

Open `http://localhost:3838/public/apps/wiki-memory/`, log in (pod `http://localhost:3838`, proxy `http://localhost:8080`, alice creds), confirm: `/concepts/` index lists the three concepts; opening Progressive Disclosure shows the body + a Relates panel naming Index View; the graph shows Hierarchical Retrieval; editing it to add `[…](/implementations/index-view.md){wm:implementedBy}` and saving clears the floor message and drops it off the worklist.

- [ ] **Step 4: Commit**

```bash
git add app/README.md
git commit -m "$(printf 'docs(w2): wiki-memory app dev + install instructions\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

## Self-Review

**Spec coverage:**
- §3 architecture (components, pod.js, graph.js) → Tasks 1,3,5,6,7,8,9 ✅
- §4 hierarchy + cross-container graph traversal → Task 3 (`neighborhood`), Task 6 (index + Fano flag), Task 9 (`<wm-graph>`) ✅
- §5 data flow (read / graph+sanity / correct) → Tasks 6,7 / 3,9 / 8 ✅
- §6 auth credentials→bearer → Tasks 1,5 ✅
- §7 write through proxy + CORS → Tasks 1 (`putCard`→proxy), 4 (CORS) ✅
- §8 runtime deps not bundled → Task 5 import map ✅
- §9 projection dependency → resolved during planning: `index-channel.mjs` already emits `# Subdirectories`; no change needed (noted here so no task is required) ✅
- §10 seed/demo → Task 10 ✅
- §11 distribution + jss install spike → Task 0, Task 11 ✅
- §12 testing (`make test-app`) → Tasks 1–10 (unit) + Task 10 (e2e + gate) ✅
- §13 out of scope (agent/search, static HTML channels, authoring wizard) → not implemented, by design ✅
- §14 reuse posture (geoff as reference) → `<wm-login>` mirrors geoff-solid-auth's shape; no geoff dependency ✅

**Placeholder scan:** No TBD/TODO; every code step shows complete code; the only conditional is Task 11 branching on the Task 0 spike verdict (both branches fully specified).

**Type consistency:** event names (`wm-authenticated`, `wm-open-card`, `wm-open-container`, `wm-edit`, `wm-saved`) consistent across Tasks 5–9; `pod.js` signatures (`login`/`putCard`/`getText`/`getGraph`/`setSession`) consistent across consumers; `neighborhood(seedGraphUrl, focusIri)` and `worklist(graphUrl)` consistent between Task 3 and Tasks 7,9,10; channel filenames `index.md`/`graph.ttl` consistent throughout.
