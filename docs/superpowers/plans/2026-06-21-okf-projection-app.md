# OKF Projection App Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the wiki-memory projection pipeline as a Linked Web Storage application — on each concept-card write, regenerate the derived disclosure channels (`index.md` navigation + a Turtle query graph) from the cards, over authenticated HTTP, and enforce the SHACL floor synchronously in the P2 proxy.

**Architecture:** Three layers. (A) Generic OKF pure libraries — frontmatter parse + `index.md` render, type-agnostic. (B) A channel-driven projection engine `project(containerUrl, token, profile)` that reads container membership over LDP, GETs each card, runs each declared channel, and PUTs the outputs — all authenticated HTTP, never the filesystem. (C) The wiki-memory profile: a pure Semantic-Markdown→RDF extractor, a Turtle graph channel, and the SHACL floor shape (shared into the proxy). Two triggers (CLI + a `solid-0.1` notifications subscriber) call the same engine.

**Tech Stack:** Node ESM (`.mjs`), Vitest, `gray-matter` (frontmatter), `n3` (Turtle parse/serialize + RDF/JS DataFactory), `rdf-ext` + `shacl-engine` (the proxy floor, already present), `ws` (notifications WebSocket). Live target: the local JSS pod (`make up`, `http://localhost:3838`).

## Global Constraints

- **No filesystem access to pod data.** All pod interaction is authenticated `fetch` over HTTP (LDP CRUD, conneg). Never read/write `./data`. (The retired `render/generate.js` is the anti-pattern.)
- **Membership from the container representation, never paths.** Read members by GETting the container as `text/turtle` and parsing `http://www.w3.org/ns/ldp#contains` — not by deriving from URL structure.
- **The engine never names `skos`/`wm`.** Those vocabularies live only in `profiles/wiki-memory/`. The engine is parameterized by a `profile`.
- **Pure libraries are I/O-free.** `okf/frontmatter`, `okf/index-channel`, `profiles/wiki-memory/extract`, `graph-channel`, `shape` do no network/disk I/O and are unit-tested without the pod.
- **Auth credential (local rung):** the replayable RS256 bearer from `POST /idp/credentials` (`tests/helpers.mjs` `getToken`). A proper app/agent identity (LWS-CID/did:key) is P4 / FOLLOWUP open-item 1 — out of scope.
- **Reserved names** (skipped as projection input): `index.md`, `log.md`, `graph.ttl`, `.acl`, `.meta`.
- **Vitest conventions:** `import { describe, it, beforeAll, expect } from 'vitest'`; `fileParallelism: false`; writes succeed with status in `[200, 201, 204, 205]`.

**Implementation note — graph channel target is `graph.ttl`, not `.graph`.** The spec's LWS sanity-check established the name is non-load-bearing (Link-rel discovery is the real mechanism later). JSS dotfile content-type handling is inconsistent (`.acl` is JSON-LD-only), so a plain `graph.ttl` DataResource avoids a 415 and keeps n3 Turtle serialization simple. When this lands, update the `.graph` reference in `docs/foundations/04-comunica-patterns.md` to `graph.ttl`.

---

## File Structure

```
projection/
├── package.json                       # Task 1
├── vitest.config.js                   # Task 1
├── okf/
│   ├── frontmatter.mjs                # Task 1 — parseFrontmatter, isConformant (pure)
│   └── index-channel.mjs              # Task 2 — renderIndex + indexChannel (pure)
├── profiles/
│   └── wiki-memory/
│       ├── extract.mjs                # Task 3 — extractCard, quadsToTurtle (pure, load-bearing)
│       ├── graph-channel.mjs          # Task 4 — graphChannel (pure)
│       ├── shape.mjs                  # Task 5 — wmConceptWiringShape (constant)
│       └── index.mjs                  # Task 5 — wikiMemoryProfile
├── engine.mjs                         # Task 6 — project() (the LWS app; I/O)
├── triggers/
│   ├── cli.mjs                        # Task 7 — project <containerUrl>
│   └── notifications.mjs              # Task 8 — solid-0.1 subscriber → debounce → project()
├── fixtures/                          # Task 2/3 — sample cards for unit tests
└── *.test.mjs                         # unit + e2e tests, colocated per task

constrained-container/proxy.js         # Task 9 — extract markdown bodies before SHACL
Makefile                               # Task 10 — test-projection target
render/                                # Task 10 — retired (prototype)
FOLLOWUP.md, docs/...                  # Task 10 — status update
```

---

### Task 1: Package scaffold + OKF frontmatter library

**Files:**
- Create: `projection/package.json`
- Create: `projection/vitest.config.js`
- Create: `projection/okf/frontmatter.mjs`
- Test: `projection/okf/frontmatter.test.mjs`

**Interfaces:**
- Produces: `parseFrontmatter(text: string) → { frontmatter: object, body: string }`; `isConformant(frontmatter: object) → boolean` (true iff a non-empty string `type`).

- [ ] **Step 1: Create the package manifest**

`projection/package.json`:
```json
{
  "name": "projection",
  "private": true,
  "type": "module",
  "description": "Wiki-memory OKF projection app: channel-driven derived views over a Solid/LWS pod via authenticated HTTP.",
  "scripts": {
    "start": "node triggers/notifications.mjs",
    "test": "vitest run"
  },
  "dependencies": {
    "gray-matter": "^4.0.3",
    "n3": "^1.17.4",
    "rdf-ext": "^2.5.1",
    "shacl-engine": "^1.0.2",
    "ws": "^8.18.0"
  },
  "devDependencies": {
    "vitest": "^3.2.0"
  },
  "allowScripts": {
    "esbuild@0.27.7": true,
    "fsevents@2.3.3": true
  }
}
```

- [ ] **Step 2: Create the vitest config**

`projection/vitest.config.js`:
```js
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: { include: ['**/*.test.mjs'], testTimeout: 30000, hookTimeout: 30000, fileParallelism: false },
})
```

- [ ] **Step 3: Install dependencies**

Run: `cd projection && npm install`
Expected: `node_modules/` created, no error.

- [ ] **Step 4: Write the failing test**

`projection/okf/frontmatter.test.mjs`:
```js
import { describe, it, expect } from 'vitest'
import { parseFrontmatter, isConformant } from './frontmatter.mjs'

const CARD = `---
type: Concept
title: Progressive Disclosure
description: Layered retrieval.
---
{=<#it> .skos:Concept}

# Progressive Disclosure
Body text.`

describe('parseFrontmatter', () => {
  it('splits frontmatter from body', () => {
    const { frontmatter, body } = parseFrontmatter(CARD)
    expect(frontmatter.type).toBe('Concept')
    expect(frontmatter.title).toBe('Progressive Disclosure')
    expect(body).toContain('{=<#it> .skos:Concept}')
    expect(body).not.toContain('type: Concept')
  })

  it('returns empty frontmatter for a body with no block', () => {
    const { frontmatter, body } = parseFrontmatter('# Just a heading\n')
    expect(frontmatter).toEqual({})
    expect(body).toContain('Just a heading')
  })
})

describe('isConformant', () => {
  it('is true with a non-empty type', () => {
    expect(isConformant({ type: 'Concept' })).toBe(true)
  })
  it('is false without a type', () => {
    expect(isConformant({ title: 'x' })).toBe(false)
    expect(isConformant({ type: '' })).toBe(false)
  })
})
```

- [ ] **Step 5: Run test to verify it fails**

Run: `cd projection && npx vitest run okf/frontmatter.test.mjs`
Expected: FAIL — cannot resolve `./frontmatter.mjs`.

- [ ] **Step 6: Write the implementation**

`projection/okf/frontmatter.mjs`:
```js
import matter from 'gray-matter'

// Split an OKF concept doc into frontmatter (object) + body (markdown after the YAML block).
export function parseFrontmatter(text) {
  const { data, content } = matter(text)
  return { frontmatter: data, body: content }
}

// OKF §9 conformance: a parseable frontmatter block with a non-empty `type`.
export function isConformant(frontmatter) {
  return typeof frontmatter?.type === 'string' && frontmatter.type.length > 0
}
```

- [ ] **Step 7: Run test to verify it passes**

Run: `cd projection && npx vitest run okf/frontmatter.test.mjs`
Expected: PASS (5 assertions across 4 tests).

- [ ] **Step 8: Commit**

```bash
git add projection/package.json projection/vitest.config.js projection/okf/frontmatter.mjs projection/okf/frontmatter.test.mjs projection/package-lock.json
git commit -m "[Agent: Claude] feat(p3): projection package scaffold + OKF frontmatter lib

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: OKF index channel (navigation disclosure)

**Files:**
- Create: `projection/okf/index-channel.mjs`
- Test: `projection/okf/index-channel.test.mjs`

**Interfaces:**
- Consumes: nothing (pure).
- Produces:
  - `renderIndex(containerUrl: string, cards: Card[], members: Member[]) → string` where `Card = { url, body, frontmatter }` and `Member = { url, type: 'container'|'data' }`.
  - `indexChannel = { name:'index', mediaType:'text/markdown', target(containerUrl)→string, render(containerUrl, cards, members)→Promise<string> }`.

- [ ] **Step 1: Write the failing test**

`projection/okf/index-channel.test.mjs`:
```js
import { describe, it, expect } from 'vitest'
import { renderIndex, indexChannel } from './index-channel.mjs'

const C = 'http://localhost:3838/alice/concepts/'
const cards = [
  { url: C + 'progressive-disclosure.md',
    frontmatter: { title: 'Progressive Disclosure', description: 'Layered retrieval.' }, body: '' },
  { url: C + 'hierarchical-retrieval.md',
    frontmatter: { title: 'Hierarchical Retrieval', description: 'Typed routing.' }, body: '' },
]
const members = [
  ...cards.map(c => ({ url: c.url, type: 'data' })),
  { url: C + 'sub/', type: 'container' },
]

describe('renderIndex', () => {
  it('lists concepts with title + description, container-relative links', () => {
    const md = renderIndex(C, cards, members)
    expect(md).toContain('* [Progressive Disclosure](progressive-disclosure.md) - Layered retrieval.')
    expect(md).toContain('* [Hierarchical Retrieval](hierarchical-retrieval.md) - Typed routing.')
  })
  it('emits a Subdirectories section for child containers', () => {
    const md = renderIndex(C, cards, members)
    expect(md).toContain('# Subdirectories')
    expect(md).toContain('* [sub](sub/)')
  })
  it('omits the Subdirectories section when there are none', () => {
    const md = renderIndex(C, cards, members.filter(m => m.type === 'data'))
    expect(md).not.toContain('# Subdirectories')
  })
  it('has no frontmatter (OKF index files carry none)', () => {
    expect(renderIndex(C, cards, members).startsWith('---')).toBe(false)
  })
})

describe('indexChannel', () => {
  it('targets index.md and renders markdown', async () => {
    expect(indexChannel.target(C)).toBe(C + 'index.md')
    expect(indexChannel.mediaType).toBe('text/markdown')
    expect(await indexChannel.render(C, cards, members)).toContain('Progressive Disclosure')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd projection && npx vitest run okf/index-channel.test.mjs`
Expected: FAIL — cannot resolve `./index-channel.mjs`.

- [ ] **Step 3: Write the implementation**

`projection/okf/index-channel.mjs`:
```js
// OKF index.md — the navigation disclosure channel (progressive disclosure for agents).
// Lists child sub-containers and concept docs with their frontmatter descriptions.
// Pure; no frontmatter in the output (OKF §6).

const relOf = (containerUrl, url) => url.startsWith(containerUrl) ? url.slice(containerUrl.length) : url
const lastSeg = url => {
  const u = url.endsWith('/') ? url.slice(0, -1) : url
  return u.slice(u.lastIndexOf('/') + 1)
}

export function renderIndex(containerUrl, cards, members) {
  const subs = members.filter(m => m.type === 'container')
  const lines = []
  if (subs.length) {
    lines.push('# Subdirectories', '')
    for (const s of subs) lines.push(`* [${lastSeg(s.url)}](${relOf(containerUrl, s.url)})`)
    lines.push('')
  }
  lines.push('# Concepts', '')
  for (const c of cards) {
    const title = c.frontmatter.title || lastSeg(c.url)
    const desc = c.frontmatter.description ? ` - ${c.frontmatter.description}` : ''
    lines.push(`* [${title}](${relOf(containerUrl, c.url)})${desc}`)
  }
  return lines.join('\n') + '\n'
}

export const indexChannel = {
  name: 'index',
  mediaType: 'text/markdown',
  target: containerUrl => `${containerUrl}index.md`,
  render: async (containerUrl, cards, members) => renderIndex(containerUrl, cards, members),
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd projection && npx vitest run okf/index-channel.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add projection/okf/index-channel.mjs projection/okf/index-channel.test.mjs
git commit -m "[Agent: Claude] feat(p3): OKF index.md navigation channel

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Semantic-Markdown → RDF extractor (load-bearing)

**Files:**
- Create: `projection/profiles/wiki-memory/extract.mjs`
- Test: `projection/profiles/wiki-memory/extract.test.mjs`

**Interfaces:**
- Consumes: nothing (pure).
- Produces:
  - `extractCard(markdown: string, cardUrl: string) → Quad[]` (RDF/JS quads via n3 `DataFactory`).
  - `quadsToTurtle(quads: Quad[]) → Promise<string>` (Turtle with the wiki-memory prefixes).
  - `PREFIXES` (object) exported for reuse.

**Extraction rules (the subset the cards use — see `docs/wiki-memory-dual-projection.md`):**
- `{=<#it> .skos:Concept}` — block hint: subject = `<#it>` resolved against `cardUrl`; emit `subject rdf:type skos:Concept`. No hint ⇒ no triples.
- `[label]{skos:prefLabel}` — span property → `subject skos:prefLabel "label"` (literal).
- `[text](href){predicate}` — typed link → `subject predicate <targetIri>` where `targetIri` = strip trailing `.md`, resolve against `cardUrl`, append `#it` (the target card's subject). Dangling targets allowed.
- CURIEs resolve via `PREFIXES` (`skos`, `wm`, `rdf`). Absolute-path hrefs (`/x/y.md`) resolve against the origin — authors should use relative or full URLs (documented caveat).

- [ ] **Step 1: Write the failing test**

`projection/profiles/wiki-memory/extract.test.mjs`:
```js
import { describe, it, expect } from 'vitest'
import { extractCard, quadsToTurtle, PREFIXES } from './extract.mjs'

const C = 'http://localhost:3838/alice/concepts/'
const SKOS = PREFIXES.skos, WM = PREFIXES.wm
const RDF_TYPE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type'

// resolving target + dangling target + no edge — the three example cards.
const RESOLVING = `---
type: Concept
title: Progressive Disclosure
---
{=<#it> .skos:Concept}

# Progressive Disclosure
[Progressive Disclosure]{skos:prefLabel} is a kind of
[Hierarchical Retrieval](hierarchical-retrieval.md){skos:broader}, realized by the
[index views](/implementations/index-view.md){wm:implementedBy}.`

const NO_EDGE = `---
type: Concept
---
{=<#it> .skos:Concept}

# Hierarchical Retrieval
[Hierarchical Retrieval]{skos:prefLabel} routes a query through typed structure.`

const has = (quads, s, p, o) =>
  quads.some(q => q.subject.value === s && q.predicate.value === p && q.object.value === o)

describe('extractCard', () => {
  const url = C + 'progressive-disclosure.md'
  const quads = extractCard(RESOLVING, url)
  const subj = url.replace('.md', '') // no... see below
})
```

Replace the placeholder `describe` block above with the full suite (the `subj` line was a deliberate stub to be removed):

```js
describe('extractCard — resolving card', () => {
  const url = C + 'progressive-disclosure.md'
  const subj = C + 'progressive-disclosure.md#it'
  const quads = extractCard(RESOLVING, url)

  it('sets subject + type from the block hint', () => {
    expect(has(quads, subj, RDF_TYPE, SKOS + 'Concept')).toBe(true)
  })
  it('emits the prefLabel literal', () => {
    const q = quads.find(q => q.predicate.value === SKOS + 'prefLabel')
    expect(q.object.value).toBe('Progressive Disclosure')
    expect(q.object.termType).toBe('Literal')
  })
  it('emits skos:broader to the sibling card subject (.md stripped, #it added)', () => {
    expect(has(quads, subj, SKOS + 'broader', C + 'hierarchical-retrieval#it')).toBe(true)
  })
  it('emits wm:implementedBy as a typed IRI link', () => {
    const q = quads.find(q => q.predicate.value === WM + 'implementedBy')
    expect(q.object.termType).toBe('NamedNode')
    expect(q.object.value.endsWith('/implementations/index-view#it')).toBe(true)
  })
})

describe('extractCard — no-edge card', () => {
  const quads = extractCard(NO_EDGE, C + 'hierarchical-retrieval.md')
  it('has the type + label but no implementedBy edge', () => {
    expect(quads.some(q => q.predicate.value === WM + 'implementedBy')).toBe(false)
    expect(quads.some(q => q.predicate.value === SKOS + 'prefLabel')).toBe(true)
  })
})

describe('extractCard — no subject hint', () => {
  it('returns no quads when the block hint is absent', () => {
    expect(extractCard('# Plain\nNo annotations here.', C + 'x.md')).toEqual([])
  })
})

describe('quadsToTurtle', () => {
  it('serializes with prefixes and round-trips the type', async () => {
    const ttl = await quadsToTurtle(extractCard(NO_EDGE, C + 'hierarchical-retrieval.md'))
    expect(ttl).toContain('@prefix skos:')
    expect(ttl).toMatch(/a\s+skos:Concept/)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd projection && npx vitest run profiles/wiki-memory/extract.test.mjs`
Expected: FAIL — cannot resolve `./extract.mjs`.

- [ ] **Step 3: Write the implementation**

`projection/profiles/wiki-memory/extract.mjs`:
```js
// Semantic-Markdown → RDF extractor for wiki-memory concept cards. Pure.
// Handles only the subset the cards use: a block subject/type hint, span properties,
// and typed links. The rest of the SemMD spec is out of scope (YAGNI).
import matter from 'gray-matter'
import { DataFactory, Writer } from 'n3'

const { namedNode, literal, quad } = DataFactory

export const PREFIXES = {
  skos: 'http://www.w3.org/2004/02/skos/core#',
  wm:   'https://w3id.org/cogitarelink/wm#',
  rdf:  'http://www.w3.org/1999/02/22-rdf-syntax-ns#',
}
const RDF_TYPE = PREFIXES.rdf + 'type'

// CURIE (prefix:local) → absolute IRI via PREFIXES; pass through anything else.
function resolveCurie(token) {
  const m = token.match(/^([\w-]+):(.+)$/)
  return m && PREFIXES[m[1]] ? PREFIXES[m[1]] + m[2] : token
}

// A typed-link href → the target card's subject IRI: strip .md, resolve, append #it.
function targetIri(href, cardUrl) {
  if (href.startsWith('#')) return new URL(href, cardUrl).href
  const stripped = href.replace(/\.md(#.*)?$/, '')
  const u = new URL(stripped, cardUrl).href
  return u.includes('#') ? u : u + '#it'
}

export function extractCard(markdown, cardUrl) {
  const { content } = matter(markdown)
  const quads = []

  // 1. Block subject/type hint: {=<#it> .skos:Concept}
  const subjM = content.match(/\{=<([^>]+)>\s*\.([\w:]+)\}/)
  if (!subjM) return quads
  const subject = namedNode(new URL(subjM[1], cardUrl).href)
  quads.push(quad(subject, namedNode(RDF_TYPE), namedNode(resolveCurie(subjM[2]))))

  // 2. Typed links: [text](href){predicate}  (matched before bare spans; shapes don't overlap)
  let m
  const linkRe = /\[[^\]]+\]\(([^)]+)\)\{([\w:]+)\}/g
  while ((m = linkRe.exec(content)))
    quads.push(quad(subject, namedNode(resolveCurie(m[2])), namedNode(targetIri(m[1], cardUrl))))

  // 3. Span properties: [label]{predicate}  ("]{" — never matches the "](href){" link form)
  const spanRe = /\[([^\]]+)\]\{([\w:]+)\}/g
  while ((m = spanRe.exec(content)))
    quads.push(quad(subject, namedNode(resolveCurie(m[2])), literal(m[1])))

  return quads
}

export function quadsToTurtle(quads) {
  return new Promise((resolve, reject) => {
    const w = new Writer({ prefixes: PREFIXES })
    w.addQuads(quads)
    w.end((err, result) => (err ? reject(err) : resolve(result)))
  })
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd projection && npx vitest run profiles/wiki-memory/extract.test.mjs`
Expected: PASS (all describe blocks green).

- [ ] **Step 5: Commit**

```bash
git add projection/profiles/wiki-memory/extract.mjs projection/profiles/wiki-memory/extract.test.mjs
git commit -m "[Agent: Claude] feat(p3): Semantic-Markdown -> RDF extractor (wiki-memory)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: Graph channel (query disclosure)

**Files:**
- Create: `projection/profiles/wiki-memory/graph-channel.mjs`
- Test: `projection/profiles/wiki-memory/graph-channel.test.mjs`

**Interfaces:**
- Consumes: `extractCard`, `quadsToTurtle` (Task 3).
- Produces: `graphChannel = { name:'graph', mediaType:'text/turtle', target(containerUrl)→string, render(containerUrl, cards, members)→Promise<string> }`. Target is `${containerUrl}graph.ttl`.

- [ ] **Step 1: Write the failing test**

`projection/profiles/wiki-memory/graph-channel.test.mjs`:
```js
import { describe, it, expect } from 'vitest'
import { graphChannel } from './graph-channel.mjs'

const C = 'http://localhost:3838/alice/concepts/'
const cards = [
  { url: C + 'a.md', frontmatter: { type: 'Concept' },
    body: '{=<#it> .skos:Concept}\n[A]{skos:prefLabel} → [B](b.md){wm:implementedBy}.' },
  { url: C + 'b.md', frontmatter: { type: 'Concept' },
    body: '{=<#it> .skos:Concept}\n[B]{skos:prefLabel}.' },
]

describe('graphChannel', () => {
  it('targets graph.ttl with turtle media type', () => {
    expect(graphChannel.target(C)).toBe(C + 'graph.ttl')
    expect(graphChannel.mediaType).toBe('text/turtle')
  })
  it('unions every card\'s quads into one turtle document', async () => {
    const ttl = await graphChannel.render(C, cards, [])
    expect(ttl).toContain('a.md#it')
    expect(ttl).toContain('b.md#it')
    expect(ttl).toMatch(/wm:implementedBy/)
    expect((ttl.match(/skos:prefLabel/g) || []).length).toBe(2)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd projection && npx vitest run profiles/wiki-memory/graph-channel.test.mjs`
Expected: FAIL — cannot resolve `./graph-channel.mjs`.

- [ ] **Step 3: Write the implementation**

`projection/profiles/wiki-memory/graph-channel.mjs`:
```js
// The query disclosure channel: the union of every card's typed triples, as one
// Turtle resource — the single Comunica source + the surface the SHACL floor reasons over.
import { extractCard, quadsToTurtle } from './extract.mjs'

export const graphChannel = {
  name: 'graph',
  mediaType: 'text/turtle',
  target: containerUrl => `${containerUrl}graph.ttl`,
  render: async (containerUrl, cards) =>
    quadsToTurtle(cards.flatMap(c => extractCard(c.body, c.url))),
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd projection && npx vitest run profiles/wiki-memory/graph-channel.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add projection/profiles/wiki-memory/graph-channel.mjs projection/profiles/wiki-memory/graph-channel.test.mjs
git commit -m "[Agent: Claude] feat(p3): graph.ttl query channel

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: Floor shape + the wiki-memory profile

**Files:**
- Create: `projection/profiles/wiki-memory/shape.mjs`
- Create: `projection/profiles/wiki-memory/index.mjs`
- Test: `projection/profiles/wiki-memory/profile.test.mjs`

**Interfaces:**
- Consumes: `indexChannel` (Task 2), `graphChannel` (Task 4).
- Produces:
  - `wmConceptWiringShape: string` (Turtle SHACL node shape).
  - `wikiMemoryProfile = { application:'wiki-memory', types:['Concept'], channels:[indexChannel, graphChannel], floorShape: wmConceptWiringShape }`.

- [ ] **Step 1: Write the failing test**

`projection/profiles/wiki-memory/profile.test.mjs`:
```js
import { describe, it, expect } from 'vitest'
import { Parser } from 'n3'
import { wmConceptWiringShape } from './shape.mjs'
import { wikiMemoryProfile } from './index.mjs'

describe('wmConceptWiringShape', () => {
  it('is parseable turtle declaring a minCount-1 IRI constraint on wm:implementedBy', () => {
    const quads = new Parser().parse(wmConceptWiringShape)
    const vals = quads.map(q => q.object.value)
    expect(vals).toContain('http://www.w3.org/2004/02/skos/core#Concept') // sh:targetClass
    expect(vals).toContain('https://w3id.org/cogitarelink/wm#implementedBy') // sh:path
    expect(wmConceptWiringShape).toMatch(/sh:minCount\s+1/)
    expect(wmConceptWiringShape).toMatch(/sh:nodeKind\s+sh:IRI/)
  })
})

describe('wikiMemoryProfile', () => {
  it('declares the Concept type, two channels, and the floor shape', () => {
    expect(wikiMemoryProfile.types).toEqual(['Concept'])
    expect(wikiMemoryProfile.channels.map(c => c.name)).toEqual(['index', 'graph'])
    expect(wikiMemoryProfile.floorShape).toBe(wmConceptWiringShape)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd projection && npx vitest run profiles/wiki-memory/profile.test.mjs`
Expected: FAIL — cannot resolve `./shape.mjs`.

- [ ] **Step 3: Write the shape**

`projection/profiles/wiki-memory/shape.mjs`:
```js
// The relational floor: every skos:Concept MUST declare a wm:implementedBy IRI edge.
// No target-existence check — dangling (not-yet-written) implementations are allowed.
// The laden message is the teaching channel agents respond to.
export const wmConceptWiringShape = `@prefix sh: <http://www.w3.org/ns/shacl#> .
@prefix skos: <http://www.w3.org/2004/02/skos/core#> .
@prefix wm: <https://w3id.org/cogitarelink/wm#> .

wm:ConceptWiringShape a sh:NodeShape ;
  sh:targetClass skos:Concept ;
  sh:property [
    sh:path wm:implementedBy ;
    sh:minCount 1 ;
    sh:nodeKind sh:IRI ;
    sh:message "Declare how this concept is implemented: add a wm:implementedBy link to an implementation card. The target need not exist yet — not-yet-written implementations are fine."
  ] .
`
```

- [ ] **Step 4: Write the profile**

`projection/profiles/wiki-memory/index.mjs`:
```js
import { indexChannel } from '../../okf/index-channel.mjs'
import { graphChannel } from './graph-channel.mjs'
import { wmConceptWiringShape } from './shape.mjs'

// The first concrete OKF application profile. The engine reads this; it never names skos/wm.
export const wikiMemoryProfile = {
  application: 'wiki-memory',
  types: ['Concept'],
  channels: [indexChannel, graphChannel],
  floorShape: wmConceptWiringShape,
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd projection && npx vitest run profiles/wiki-memory/profile.test.mjs`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add projection/profiles/wiki-memory/shape.mjs projection/profiles/wiki-memory/index.mjs projection/profiles/wiki-memory/profile.test.mjs
git commit -m "[Agent: Claude] feat(p3): floor shape + wiki-memory profile

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 6: Projection engine (the LWS application)

**Files:**
- Create: `projection/engine.mjs`
- Test: `projection/engine.test.mjs` (e2e — needs `make up`)

**Interfaces:**
- Consumes: `parseFrontmatter` (Task 1); a `profile` (Task 5) whose channels expose `target`/`mediaType`/`render`.
- Produces: `project(containerUrl: string, token: string|null, profile) → Promise<Array<{channel, target, status}>>`. Reads members via LDP `ldp:contains`, GETs each non-reserved concept doc, runs each channel, PUTs each output.

- [ ] **Step 1: Write the failing e2e test**

`projection/engine.test.mjs`:
```js
import { describe, it, beforeAll, expect } from 'vitest'
import { project } from './engine.mjs'
import { wikiMemoryProfile } from './profiles/wiki-memory/index.mjs'

const BASE = process.env.BASE || 'http://localhost:3838'
const POD = { name: 'alice', email: 'alice@example.com', password: 'alicepassword123' }
const auth = t => ({ Authorization: `Bearer ${t}` })

const CARD_A = `---
type: Concept
title: Progressive Disclosure
description: Layered retrieval.
---
{=<#it> .skos:Concept}

# Progressive Disclosure
[Progressive Disclosure]{skos:prefLabel} is realized by the
[index views](impl.md){wm:implementedBy}.`

const CARD_B = `---
type: Concept
title: Hierarchical Retrieval
description: Typed routing.
---
{=<#it> .skos:Concept}

# Hierarchical Retrieval
[Hierarchical Retrieval]{skos:prefLabel}.`

describe('project (e2e against the live local pod)', () => {
  let token
  const C = `${BASE}/alice/proj-${process.pid}-${Date.now()}/`
  beforeAll(async () => {
    await fetch(`${BASE}/.pods`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(POD) })
    const r = await fetch(`${BASE}/idp/credentials`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: POD.email, password: POD.password }),
    })
    token = (await r.json()).access_token
    await fetch(C, { method: 'PUT', headers: { ...auth(token), 'Content-Type': 'text/turtle' }, body: '' })
    await fetch(C + 'progressive-disclosure.md', { method: 'PUT', headers: { ...auth(token), 'Content-Type': 'text/markdown' }, body: CARD_A })
    await fetch(C + 'hierarchical-retrieval.md', { method: 'PUT', headers: { ...auth(token), 'Content-Type': 'text/markdown' }, body: CARD_B })
  })

  it('writes graph.ttl and index.md, derived from the cards', async () => {
    const res = await project(C, token, wikiMemoryProfile)
    for (const r of res) expect([200, 201, 204, 205], `${r.channel} -> ${r.status}`).toContain(r.status)

    const graph = await (await fetch(C + 'graph.ttl', { headers: { ...auth(token), Accept: 'text/turtle' } })).text()
    expect(graph).toContain('progressive-disclosure.md#it')
    expect(graph).toMatch(/implementedBy/)

    const index = await (await fetch(C + 'index.md', { headers: { ...auth(token), Accept: 'text/markdown' } })).text()
    expect(index).toContain('* [Progressive Disclosure](progressive-disclosure.md) - Layered retrieval.')
    expect(index).toContain('* [Hierarchical Retrieval](hierarchical-retrieval.md) - Typed routing.')
  })

  it('does not re-ingest its own derived views (reserved names skipped)', async () => {
    await project(C, token, wikiMemoryProfile) // second run
    const graph = await (await fetch(C + 'graph.ttl', { headers: { ...auth(token), Accept: 'text/turtle' } })).text()
    expect(graph).not.toContain('graph.ttl#it')
    expect(graph).not.toContain('index.md#it')
  })
})
```

- [ ] **Step 2: Start the pod and run the test to verify it fails**

Run: `make up && cd projection && BASE=http://localhost:3838 npx vitest run engine.test.mjs`
Expected: FAIL — cannot resolve `./engine.mjs`.

- [ ] **Step 3: Write the implementation**

`projection/engine.mjs`:
```js
// The projection engine — a Linked Web Storage application.
// On invocation: read container membership over LDP, GET each concept card, run every
// channel the profile declares, and PUT the derived views. All pod I/O is authenticated
// HTTP; membership comes from ldp:contains, never the filesystem or URL guessing.
import { Parser } from 'n3'
import { parseFrontmatter } from './okf/frontmatter.mjs'

const LDP_CONTAINS = 'http://www.w3.org/ns/ldp#contains'
const RESERVED = new Set(['index.md', 'log.md', 'graph.ttl', '.acl', '.meta'])
const authH = t => (t ? { Authorization: `Bearer ${t}` } : {})
const lastSeg = url => {
  const u = url.endsWith('/') ? url.slice(0, -1) : url
  return u.slice(u.lastIndexOf('/') + 1)
}

async function readMembers(containerUrl, token) {
  const r = await fetch(containerUrl, { headers: { Accept: 'text/turtle', ...authH(token) } })
  if (!r.ok) throw new Error(`GET ${containerUrl} -> ${r.status}`)
  const ttl = await r.text()
  const out = []
  for (const q of new Parser({ baseIRI: containerUrl }).parse(ttl)) {
    if (q.predicate.value === LDP_CONTAINS) {
      const url = q.object.value
      out.push({ url, type: url.endsWith('/') ? 'container' : 'data' })
    }
  }
  return out
}

export async function project(containerUrl, token, profile) {
  const members = await readMembers(containerUrl, token)
  const conceptMembers = members.filter(m => m.type === 'data' && !RESERVED.has(lastSeg(m.url)))

  const cards = []
  for (const m of conceptMembers) {
    const r = await fetch(m.url, { headers: { Accept: 'text/markdown, text/plain, */*', ...authH(token) } })
    if (!r.ok) continue
    const { frontmatter, body } = parseFrontmatter(await r.text())
    if (!profile.types || profile.types.includes(frontmatter.type)) cards.push({ url: m.url, body, frontmatter })
  }

  const results = []
  for (const ch of profile.channels) {
    const body = await ch.render(containerUrl, cards, members)
    const target = ch.target(containerUrl)
    const put = await fetch(target, { method: 'PUT', headers: { 'Content-Type': ch.mediaType, ...authH(token) }, body })
    results.push({ channel: ch.name, target, status: put.status })
  }
  return results
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd projection && BASE=http://localhost:3838 npx vitest run engine.test.mjs`
Expected: PASS. (If `graph.ttl` PUT returns 415, the dotfile rationale in Global Constraints did not apply — re-confirm the target is `graph.ttl`, not `.graph`.)

- [ ] **Step 5: Commit**

```bash
git add projection/engine.mjs projection/engine.test.mjs
git commit -m "[Agent: Claude] feat(p3): projection engine (LWS app, HTTP-native CRUD)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 7: CLI trigger

**Files:**
- Create: `projection/triggers/cli.mjs`
- Test: `projection/triggers/cli.test.mjs` (e2e — needs `make up`)

**Interfaces:**
- Consumes: `project` (Task 6), `wikiMemoryProfile` (Task 5).
- Produces: an executable module — `node triggers/cli.mjs <containerUrl>` with `TOKEN` env as the bearer; prints the results array as JSON and exits non-zero if any channel PUT failed.

- [ ] **Step 1: Write the failing e2e test**

`projection/triggers/cli.test.mjs`:
```js
import { describe, it, beforeAll, expect } from 'vitest'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const BASE = process.env.BASE || 'http://localhost:3838'
const POD = { name: 'alice', email: 'alice@example.com', password: 'alicepassword123' }
const auth = t => ({ Authorization: `Bearer ${t}` })
const CLI = join(dirname(fileURLToPath(import.meta.url)), 'cli.mjs')
const CARD = `---\ntype: Concept\ntitle: T\ndescription: d.\n---\n{=<#it> .skos:Concept}\n[T]{skos:prefLabel} [i](i.md){wm:implementedBy}.`

describe('cli trigger (e2e)', () => {
  let token
  const C = `${BASE}/alice/cli-${process.pid}-${Date.now()}/`
  beforeAll(async () => {
    await fetch(`${BASE}/.pods`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(POD) })
    token = (await (await fetch(`${BASE}/idp/credentials`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: POD.email, password: POD.password }) })).json()).access_token
    await fetch(C, { method: 'PUT', headers: { ...auth(token), 'Content-Type': 'text/turtle' }, body: '' })
    await fetch(C + 'c.md', { method: 'PUT', headers: { ...auth(token), 'Content-Type': 'text/markdown' }, body: CARD })
  })

  it('projects a container and prints channel results', () => {
    const out = execFileSync('node', [CLI, C], { env: { ...process.env, TOKEN: token }, encoding: 'utf8' })
    const res = JSON.parse(out)
    expect(res.map(r => r.channel).sort()).toEqual(['graph', 'index'])
    for (const r of res) expect([200, 201, 204, 205]).toContain(r.status)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd projection && BASE=http://localhost:3838 npx vitest run triggers/cli.test.mjs`
Expected: FAIL — cannot resolve `cli.mjs`.

- [ ] **Step 3: Write the implementation**

`projection/triggers/cli.mjs`:
```js
// Manual / backfill trigger. Drives the same project() the notifications trigger uses.
// Usage: TOKEN=<bearer> node triggers/cli.mjs <containerUrl>
import { project } from '../engine.mjs'
import { wikiMemoryProfile } from '../profiles/wiki-memory/index.mjs'

const container = process.argv[2]
if (!container) {
  console.error('usage: TOKEN=<bearer> node triggers/cli.mjs <containerUrl>')
  process.exit(2)
}
const res = await project(container, process.env.TOKEN || null, wikiMemoryProfile)
console.log(JSON.stringify(res))
if (res.some(r => ![200, 201, 204, 205].includes(r.status))) process.exit(1)
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd projection && BASE=http://localhost:3838 npx vitest run triggers/cli.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add projection/triggers/cli.mjs projection/triggers/cli.test.mjs
git commit -m "[Agent: Claude] feat(p3): CLI projection trigger

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 8: Notifications trigger (solid-0.1 subscriber)

**Files:**
- Create: `projection/triggers/notifications.mjs`
- Test: `projection/triggers/notifications.test.mjs` (e2e — needs `make up` with `--notifications`)

**Interfaces:**
- Consumes: `project` (Task 6), `wikiMemoryProfile` (Task 5).
- Produces: `watch(containerUrl, { token, wsUrl?, debounceMs?, profile?, onProject? }) → WebSocket`. Subscribes to the container on the server's notification socket; on each `pub` frame, debounces and calls `project()`. Default `wsUrl` = `ws://<host>/.notifications`; default `debounceMs` = 300; default `profile` = `wikiMemoryProfile`.

**Precondition:** JSS must run with `--notifications`. Confirm `.env.local` / the JSS start command enables it; if not, add `--notifications` to the JSS args before running the e2e step.

- [ ] **Step 1: Write the failing e2e test**

`projection/triggers/notifications.test.mjs`:
```js
import { describe, it, beforeAll, afterAll, expect } from 'vitest'
import { watch } from './notifications.mjs'

const BASE = process.env.BASE || 'http://localhost:3838'
const POD = { name: 'alice', email: 'alice@example.com', password: 'alicepassword123' }
const auth = t => ({ Authorization: `Bearer ${t}` })
const sleep = ms => new Promise(r => setTimeout(r, ms))
const CARD = `---\ntype: Concept\ntitle: N\ndescription: n.\n---\n{=<#it> .skos:Concept}\n[N]{skos:prefLabel} [i](i.md){wm:implementedBy}.`

describe('notifications trigger (e2e)', () => {
  let token, ws
  const C = `${BASE}/alice/notif-${process.pid}-${Date.now()}/`
  beforeAll(async () => {
    await fetch(`${BASE}/.pods`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(POD) })
    token = (await (await fetch(`${BASE}/idp/credentials`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: POD.email, password: POD.password }) })).json()).access_token
    await fetch(C, { method: 'PUT', headers: { ...auth(token), 'Content-Type': 'text/turtle' }, body: '' })
  })
  afterAll(() => ws?.close())

  it('re-projects after a card is written', async () => {
    let projected = 0
    ws = watch(C, { token, debounceMs: 150, onProject: () => projected++ })
    await sleep(500) // allow socket open + subscribe
    await fetch(C + 'n.md', { method: 'PUT', headers: { ...auth(token), 'Content-Type': 'text/markdown' }, body: CARD })

    for (let i = 0; i < 40 && projected === 0; i++) await sleep(100) // up to 4s
    expect(projected).toBeGreaterThan(0)

    const graph = await (await fetch(C + 'graph.ttl', { headers: { ...auth(token), Accept: 'text/turtle' } })).text()
    expect(graph).toContain('n.md#it')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd projection && BASE=http://localhost:3838 npx vitest run triggers/notifications.test.mjs`
Expected: FAIL — cannot resolve `notifications.mjs`.

- [ ] **Step 3: Write the implementation**

`projection/triggers/notifications.mjs`:
```js
// CDC trigger: subscribe to a container on JSS's solid-0.1 notification socket and
// re-project on change. One socket, debounced (the protocol does no dedup, so bursts
// coalesce). Decouples projection from the write path; catches all writes, not only proxied.
import WebSocket from 'ws'
import { project } from '../engine.mjs'
import { wikiMemoryProfile } from '../profiles/wiki-memory/index.mjs'

export function watch(containerUrl, opts = {}) {
  const { token = null, debounceMs = 300, profile = wikiMemoryProfile, onProject } = opts
  const wsUrl = opts.wsUrl || `ws://${new URL(containerUrl).host}/.notifications`
  const ws = new WebSocket(wsUrl)
  let timer = null

  const schedule = () => {
    clearTimeout(timer)
    timer = setTimeout(async () => {
      try { onProject?.(await project(containerUrl, token, profile)) }
      catch (e) { console.error('[project]', e.message) }
    }, debounceMs)
  }

  ws.on('open', () => ws.send('sub ' + containerUrl))
  ws.on('message', d => { if (d.toString().startsWith('pub ')) schedule() })
  ws.on('error', e => console.error('[ws]', e.message))
  return ws
}

// Run standalone: TOKEN=<bearer> node triggers/notifications.mjs <containerUrl>
if (import.meta.url === `file://${process.argv[1]}`) {
  const container = process.argv[2]
  if (!container) { console.error('usage: TOKEN=<bearer> node triggers/notifications.mjs <containerUrl>'); process.exit(2) }
  watch(container, { token: process.env.TOKEN || null, onProject: r => console.log('[projected]', JSON.stringify(r)) })
  console.log('watching', container)
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd projection && BASE=http://localhost:3838 npx vitest run triggers/notifications.test.mjs`
Expected: PASS. (If it times out, verify JSS was started with `--notifications` and that the container `pub` arrives — `curl -I <container>` should show an `Updates-Via` header.)

- [ ] **Step 5: Commit**

```bash
git add projection/triggers/notifications.mjs projection/triggers/notifications.test.mjs
git commit -m "[Agent: Claude] feat(p3): notifications-driven projection trigger

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 9: Synchronous floor — extract markdown bodies in the proxy

**Files:**
- Modify: `constrained-container/proxy.js`
- Modify: `constrained-container/package.json` (add `gray-matter` dep)
- Test: `constrained-container/floor.test.mjs`

**Interfaces:**
- Consumes: `extractCard`, `quadsToTurtle` from `../projection/profiles/wiki-memory/extract.mjs` (Task 3); `wmConceptWiringShape` from `../projection/profiles/wiki-memory/shape.mjs` (Task 5).
- Produces: the proxy, on a write whose `Content-Type` is markdown into a constrained container, extracts the card's triples and SHACL-validates *those* (instead of parsing the body as Turtle). Turtle bodies keep the existing path.

**Context:** Today `proxy.js` validates the request body parsed as Turtle (`dataset(body, …)`). A concept-card body is Semantic-Markdown, so the floor must extract first — the same `extractCard` the engine uses. The existing `dataset(ttl, base)` helper is renamed `mkDataset` to free the name.

- [ ] **Step 1: Write the failing test**

`constrained-container/floor.test.mjs`:
```js
import { describe, it, beforeAll, expect } from 'vitest'
import { setPublicReadAcl } from './set-acl.mjs'
import { wmConceptWiringShape } from '../projection/profiles/wiki-memory/shape.mjs'

const JSS = 'http://localhost:3838'
const PROXY = 'http://localhost:3839'
const POD = { name: 'alice', email: 'alice@example.com', password: 'alicepassword123' }
const auth = t => ({ Authorization: `Bearer ${t}` })

const WIRED = `---\ntype: Concept\ntitle: Wired\n---\n{=<#it> .skos:Concept}\n[Wired]{skos:prefLabel} [impl](impl.md){wm:implementedBy}.`
const UNWIRED = `---\ntype: Concept\ntitle: Unwired\n---\n{=<#it> .skos:Concept}\n[Unwired]{skos:prefLabel}.`

describe('proxy floor over Semantic-Markdown card bodies', () => {
  let token
  const base = `alice/floor-${process.pid}-${Date.now()}`
  const shape = `${JSS}/${base}/shape.ttl`
  beforeAll(async () => {
    await fetch(`${JSS}/.pods`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(POD) })
    token = (await (await fetch(`${JSS}/idp/credentials`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: POD.email, password: POD.password }) })).json()).access_token
    await fetch(`${JSS}/${base}/`, { method: 'PUT', headers: { ...auth(token), 'Content-Type': 'text/turtle' }, body: '' })
    await fetch(shape, { method: 'PUT', headers: { ...auth(token), 'Content-Type': 'text/turtle' }, body: wmConceptWiringShape })
    await fetch(`${JSS}/${base}/.meta`, { method: 'PUT', headers: { ...auth(token), 'Content-Type': 'text/turtle' },
      body: `<${JSS}/${base}/> <http://www.w3.org/ns/ldp#constrainedBy> <${shape}> .` })
  })

  it('rejects a card with no wm:implementedBy (422 + laden message)', async () => {
    const r = await fetch(`${PROXY}/${base}/unwired.md`, { method: 'PUT', headers: { ...auth(token), 'Content-Type': 'text/markdown' }, body: UNWIRED })
    expect(r.status).toBe(422)
    expect(await r.text()).toMatch(/wm:implementedBy/)
  })

  it('admits a card that declares wm:implementedBy', async () => {
    const r = await fetch(`${PROXY}/${base}/wired.md`, { method: 'PUT', headers: { ...auth(token), 'Content-Type': 'text/markdown' }, body: WIRED })
    expect([200, 201, 204, 205]).toContain(r.status)
  })
})
```

- [ ] **Step 2: Add the dependency and run the test to verify it fails**

Run: `cd constrained-container && npm install gray-matter@^4.0.3 && make -C .. up && node proxy.js & sleep 1 && npx vitest run floor.test.mjs`
Expected: FAIL — the proxy still parses the markdown body as Turtle, so the unwired card is not recognized as a `skos:Concept` and is wrongly admitted (no 422). Stop the backgrounded proxy after: `kill %1`.

- [ ] **Step 3: Apply the proxy change**

In `constrained-container/proxy.js`:

(a) Add imports after the existing `import { Validator } from 'shacl-engine'` line:
```js
import { extractCard, quadsToTurtle } from '../projection/profiles/wiki-memory/extract.mjs';
```

(b) Rename the `dataset` helper to `mkDataset` (line ~17) and update its two existing call sites in `constrainedBy()` and `validatorFor()`:
```js
const mkDataset = (ttl, base) => rdf.dataset(new Parser({ baseIRI: base }).parse(ttl));
```
- In `constrainedBy`: `for (const q of mkDataset(await r.text(), `${UPSTREAM}${container}`))`
- In `validatorFor`: `const v = new Validator(mkDataset(await r.text(), shapeUrl), { factory: rdf });`

(c) In the `isWrite` block, replace the single line that builds the dataset from the body:
```js
const report = await validator.validate({ dataset: dataset(body.toString('utf8'), `${UPSTREAM}${url}`) });
```
with content-type-aware extraction:
```js
const ctype = req.headers['content-type'] || '';
const baseIri = `${UPSTREAM}${url}`;
let ds;
if (ctype.includes('markdown')) {
  const ttl = await quadsToTurtle(extractCard(body.toString('utf8'), baseIri));
  ds = mkDataset(ttl, baseIri);
} else {
  ds = mkDataset(body.toString('utf8'), baseIri);
}
const report = await validator.validate({ dataset: ds });
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd constrained-container && node proxy.js & sleep 1 && npx vitest run floor.test.mjs ; kill %1`
Expected: PASS — unwired card → 422 with the laden message; wired card admitted.

- [ ] **Step 5: Verify the existing P2 turtle path still works**

Run: `cd constrained-container && node proxy.js & sleep 1 && npx vitest run p2.test.mjs ; kill %1`
Expected: PASS (the Turtle branch is unchanged).

- [ ] **Step 6: Commit**

```bash
git add constrained-container/proxy.js constrained-container/package.json constrained-container/package-lock.json constrained-container/floor.test.mjs
git commit -m "[Agent: Claude] feat(p3): proxy floor extracts Semantic-Markdown bodies before SHACL

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 10: Wire the gate, retire the prototype, update status

**Files:**
- Modify: `Makefile` (add `test-projection`)
- Delete: `render/` (the filesystem prototype superseded by the engine)
- Modify: `FOLLOWUP.md`
- Modify: `docs/foundations/04-comunica-patterns.md` (`.graph` → `graph.ttl`)

**Interfaces:** none (wiring + docs).

- [ ] **Step 1: Add the Makefile target**

In `Makefile`, add `test-projection` to the `.PHONY` line and append the target after the `test:` target:
```makefile
# Projection app gate — pure unit tests + e2e against the running pod (Task 6-8).
test-projection:
	cd projection && npm test
```
Update the `.PHONY` line to include it:
```makefile
.PHONY: build up down logs reset test test-projection shell cert up-tls down-tls cid-tls
```

- [ ] **Step 2: Verify the full projection suite passes against a fresh pod**

Run: `make reset && make test-projection`
Expected: PASS — all `projection/**/*.test.mjs` green (unit + e2e). (Ensure JSS is started with `--notifications` for Task 8's test.)

- [ ] **Step 3: Retire the render prototype**

Run: `git rm -r render`
Rationale: `render/generate.js` read cards from disk and wrote HTML to disk — the filesystem anti-pattern the engine replaces. The `<card>.html`/`viz.html` reading-experience renders are deferred to Phase-1 app work (spec §8) and will be rebuilt as channels when needed.

- [ ] **Step 4: Update the comunica doc reference**

In `docs/foundations/04-comunica-patterns.md`, change the `.graph` source URLs to `graph.ttl` (e.g. `http://pod/alice/concepts/graph.ttl`) and add a one-line note: "The aggregate is materialized at `graph.ttl` (a plain DataResource) by the projection app; see `projection/`."

- [ ] **Step 5: Update FOLLOWUP**

In `FOLLOWUP.md`, mark P3 done: under the open-items list, update item 3 to reference the shipped `projection/` package and the design/plan docs; note remaining Phase-0 work is P4 (public-dev rung) and the deferred items from spec §8 (HTML/viz channels, aggregate-`.graph` validation, incremental projection, Link-rel discovery, app identity). Add a short "DONE — P3 projection-on-write" block mirroring the P1/P2 entries, pointing at `docs/superpowers/specs/2026-06-21-okf-projection-app-design.md` and `docs/superpowers/plans/2026-06-21-okf-projection-app.md`.

- [ ] **Step 6: Commit**

```bash
git add Makefile FOLLOWUP.md docs/foundations/04-comunica-patterns.md
git rm -r render
git commit -m "[Agent: Claude] chore(p3): wire projection gate, retire render prototype, mark P3 done

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Self-Review

**Spec coverage:**
- Layer A generic OKF (frontmatter, index render) → Tasks 1, 2. ✅
- Layer B channel-driven engine (membership-from-listing, conneg GET, PUT, reserved names) → Task 6. ✅
- Layer C wiki-memory profile (extractor, graph channel, shape, profile object) → Tasks 3, 4, 5. ✅
- Decision 1 trigger (notifications + CLI, decoupled) → Tasks 7, 8. ✅
- Decision 2 channel scope (index.md + graph) → Tasks 2, 4 (HTML/viz explicitly out, Task 10 step 3). ✅
- Decision 3 synchronous floor via shared extractCard → Task 9. ✅
- Decision 4 `--git` commits → no code (relies on JSS `--git`); noted, nothing to build. ✅
- LWS sanity check items: membership-from-listing (Task 6 readMembers), reserved-name skip incl. derived views (Task 6 + its 2nd test), `.graph`→`graph.ttl` convention (Global Constraints + Task 10 step 4). ✅
- Profile selector (`okf_application` root-index key) → NOT implemented as a task: the engine takes the profile as a parameter (the CLI/notifications triggers pass `wikiMemoryProfile`). Reading the selector from the root `index.md` is deferred — single-profile now, so the parameter is sufficient. Flagged here as an intentional gap consistent with spec §8 ("a second profile … the seam is proven by structure").

**Placeholder scan:** The only `// see below` was the deliberate stub in Task 3 Step 1, explicitly replaced in the same step. No TBD/TODO/"add error handling"/"similar to Task N" remain. ✅

**Type consistency:**
- `Card = { url, body, frontmatter }` and `Member = { url, type }` used identically in Tasks 2, 4, 6. ✅
- `channel = { name, mediaType, target(containerUrl), render(containerUrl, cards, members) }` consistent across Tasks 2, 4, 6 (engine calls `ch.render(containerUrl, cards, members)`; graphChannel ignores the trailing args). ✅
- `extractCard(markdown, cardUrl)` / `quadsToTurtle(quads)` signatures match between Tasks 3, 4, 9. ✅
- `project(containerUrl, token, profile)` consistent across Tasks 6, 7, 8. ✅
- Reserved set identical in Task 6 and Global Constraints. ✅
</content>
