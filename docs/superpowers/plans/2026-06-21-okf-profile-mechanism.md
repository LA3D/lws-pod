# OKF Profile Mechanism (W1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the existing wiki-memory-specific `projection/` + `constrained-container/` packages into a generic, profile-agnostic OKF agentic-memory application, with wiki-memory as the first formalization.

**Architecture:** A profile is declarative data (a JSON-LD `@context` + SKOS/RDFS type scheme + edge vocab + SHACL shapes) that parameterizes one generic engine. The engine projects each card into a Tier-1 feed (`rel="type"`/edge `Link` headers), a Tier-2 feed (`graph.ttl`), and OKF navigation (`index.md`); a three-tier graded SHACL floor governs writes; everything above OKF is additive so a plain OKF reader still works.

**Tech Stack:** Node ESM (`.mjs`), `n3` (RDF/Turtle), `shacl-engine` (validation), `gray-matter` (frontmatter), `rdf-ext` (dataset factory), `vitest` (e2e against a live local JSS pod). No new heavyweight dependencies.

## Global Constraints

- **JSS pinned at v0.0.209.** Tests run against the local http pod at `BASE` (default `http://localhost:3838`); start it with `make up` before any e2e task.
- **Backward-compat invariant:** every addition is additive — extra frontmatter keys, extra `Link` headers, derived sidecar resources. Never overload OKF's `type:`, `index.md`, or `log.md`. Stripping the profile must leave a spec-conformant OKF bundle.
- **Namespace single-indirection:** the `wm:` authority (`https://w3id.org/cogitarelink/wm#` for now) is declared in exactly one place (`context.jsonld`, mirrored in `*.ttl` prefix headers). No module hardcodes the absolute authority IRI; changing it is a one-line edit.
- **Graded severity → HTTP:** only `sh:Violation` maps to `422`. `sh:Warning`/`sh:Info` admit (2xx) and are recorded.
- **Core vocabs only for content:** RDF/RDFS, SKOS, DCTERMS, schema.org, PROV-O, AS2; bespoke predicates live in the shared `wm:` set.
- **Style:** fastai — brevity, no comments except to explain *why*. Match existing `.mjs` idiom. ESM only.
- **Commits:** `[Agent: Claude]` prefix; end with `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`. Stage specific files.
- **Test discipline:** `fileParallelism: false` (shared pod state); each e2e test uses a unique container path (`${BASE}/alice/<name>-${process.pid}-${Date.now()}/`).

---

## File Structure

**New (the declarative wiki-memory profile):**
- `projection/profiles/wiki-memory/context.jsonld` — the single namespace-indirection point; friendly key → IRI.
- `projection/profiles/wiki-memory/types.ttl` — punned SKOS+RDFS type scheme (`Concept`, `Implementation`).
- `projection/profiles/wiki-memory/edges.ttl` — typed-edge vocab with `owl:inverseOf`.
- `projection/profiles/wiki-memory/shapes.ttl` — combined SHACL: base `NoteShape` + per-type `ConceptWiringShape` (graded).
- `projection/okf/namespaces.mjs` — loads prefixes from a `context.jsonld`; exposes `resolveCurie`.
- `projection/okf/card.mjs` — `cardToQuads(markdown, cardUrl, ns)`: frontmatter projection + body Semantic-Markdown, merged.
- `projection/okf/links.mjs` — `typeLinkHeaders(frontmatter, profile, ns)`: derives Tier-1 `Link` header value.
- `projection/okf/profile-select.mjs` — `selectProfile(rootIndexText)`: reads `okf_profile`, returns profile or base mode.

**Modified:**
- `projection/profiles/wiki-memory/extract.mjs` — `PREFIXES`/`resolveCurie` now come from `namespaces.mjs`; `extractCard` delegates to `card.mjs`.
- `projection/profiles/wiki-memory/graph-channel.mjs` — uses `cardToQuads`; materializes inverse edges.
- `projection/profiles/wiki-memory/index.mjs` — profile gains `context`, `typeScheme`, `edges`, `baseShape`.
- `constrained-container/proxy.js` — always-on base shape; graded severity; unknown-type warn; emits Tier-1 `Link` headers on admitted card writes.

---

## Task 1: Namespace single-indirection

**Files:**
- Create: `projection/profiles/wiki-memory/context.jsonld`
- Create: `projection/okf/namespaces.mjs`
- Test: `projection/okf/namespaces.test.mjs`
- Modify: `projection/profiles/wiki-memory/extract.mjs` (PREFIXES/resolveCurie source)

**Interfaces:**
- Consumes: nothing.
- Produces: `loadNamespaces(contextObj) → { prefixes: Record<string,string>, resolveCurie(curie: string) → string }`; the wiki-memory `context.jsonld` object.

- [ ] **Step 1: Write the failing test**

```javascript
// projection/okf/namespaces.test.mjs
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { loadNamespaces } from './namespaces.mjs'

const ctx = JSON.parse(readFileSync(new URL('../profiles/wiki-memory/context.jsonld', import.meta.url)))

describe('loadNamespaces', () => {
  it('resolves a CURIE through the context prefixes', () => {
    const ns = loadNamespaces(ctx)
    expect(ns.resolveCurie('skos:Concept')).toBe('http://www.w3.org/2004/02/skos/core#Concept')
    expect(ns.resolveCurie('wm:implementedBy')).toBe('https://w3id.org/cogitarelink/wm#implementedBy')
  })

  it('passes through an absolute IRI unchanged', () => {
    const ns = loadNamespaces(ctx)
    expect(ns.resolveCurie('https://schema.org/Article')).toBe('https://schema.org/Article')
  })

  it('changing the wm authority in the context re-grounds every wm CURIE', () => {
    const swapped = structuredClone(ctx)
    swapped['@context'].wm = 'https://example.org/v2#'
    const ns = loadNamespaces(swapped)
    expect(ns.resolveCurie('wm:implementedBy')).toBe('https://example.org/v2#implementedBy')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd projection && npx vitest run okf/namespaces.test.mjs`
Expected: FAIL — `context.jsonld` missing / `loadNamespaces` not defined.

- [ ] **Step 3: Create the context (the single indirection point)**

```json
// projection/profiles/wiki-memory/context.jsonld
{
  "@context": {
    "wm":      "https://w3id.org/cogitarelink/wm#",
    "skos":    "http://www.w3.org/2004/02/skos/core#",
    "dcterms": "http://purl.org/dc/terms/",
    "schema":  "https://schema.org/",
    "prov":    "http://www.w3.org/ns/prov#",
    "as":      "https://www.w3.org/ns/activitystreams#",
    "rdf":     "http://www.w3.org/1999/02/22-rdf-syntax-ns#",
    "rdfs":    "http://www.w3.org/2000/01/rdf-schema#",

    "type":          "@type",
    "title":         { "@id": "dcterms:title" },
    "description":   { "@id": "dcterms:description" },
    "implementedBy": { "@id": "wm:implementedBy", "@type": "@id" },
    "broader":       { "@id": "skos:broader",     "@type": "@id" },
    "related":       { "@id": "rdfs:seeAlso",     "@type": "@id" },
    "wasAttributedTo": { "@id": "prov:wasAttributedTo", "@type": "@id" }
  }
}
```

- [ ] **Step 4: Implement `loadNamespaces`**

```javascript
// projection/okf/namespaces.mjs
export function loadNamespaces(contextObj) {
  const ctx = contextObj['@context'] || {}
  const prefixes = {}
  for (const [k, v] of Object.entries(ctx)) if (typeof v === 'string' && /[#/]$/.test(v)) prefixes[k] = v

  const resolveCurie = (curie) => {
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(curie)) return curie
    const i = curie.indexOf(':')
    if (i < 0) return curie
    const pfx = curie.slice(0, i), local = curie.slice(i + 1)
    return prefixes[pfx] ? prefixes[pfx] + local : curie
  }
  return { prefixes, resolveCurie, term: ctx }
}
```

`term` is the raw `@context` map (prefixes + term definitions); `card.mjs` (Task 2) and `links.mjs` (Task 8) read it to project frontmatter keys and indexed relations.

- [ ] **Step 5: Point `extract.mjs` at the shared namespaces**

Replace the hardcoded `PREFIXES` and `resolveCurie` in `projection/profiles/wiki-memory/extract.mjs` with an import:

```javascript
// at top of projection/profiles/wiki-memory/extract.mjs
import { readFileSync } from 'node:fs'
import { loadNamespaces } from '../../okf/namespaces.mjs'

const context = JSON.parse(readFileSync(new URL('./context.jsonld', import.meta.url)))
const ns = loadNamespaces(context)
export const PREFIXES = ns.prefixes
const resolveCurie = ns.resolveCurie
```

Delete the old `const PREFIXES = {...}` and `function resolveCurie(...)` definitions. Leave the rest of `extract.mjs` untouched for now.

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd projection && npx vitest run okf/namespaces.test.mjs profiles/wiki-memory/extract.test.mjs`
Expected: PASS (both the new namespaces tests and the existing extract tests).

- [ ] **Step 7: Commit**

```bash
git add projection/okf/namespaces.mjs projection/okf/namespaces.test.mjs projection/profiles/wiki-memory/context.jsonld projection/profiles/wiki-memory/extract.mjs
git commit -m "$(cat <<'EOF'
[Agent: Claude] feat(w1): namespace single-indirection via context.jsonld

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Frontmatter projection (one extraction path)

**Files:**
- Create: `projection/okf/card.mjs`
- Test: `projection/okf/card.test.mjs`
- Modify: `projection/profiles/wiki-memory/extract.mjs` (delegate `extractCard`)

**Interfaces:**
- Consumes: `loadNamespaces` (Task 1).
- Produces: `cardToQuads(markdown: string, cardUrl: string, ns) → Array<Quad>` — projects frontmatter (via the context) *and* body Semantic-Markdown, merged. `subjectIri(cardUrl) → string` (= `${cardUrl-without-.md}#it`).

- [ ] **Step 1: Write the failing test**

```javascript
// projection/okf/card.test.mjs
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { loadNamespaces } from './namespaces.mjs'
import { cardToQuads } from './card.mjs'

const ns = loadNamespaces(JSON.parse(readFileSync(new URL('../profiles/wiki-memory/context.jsonld', import.meta.url))))
const URL_C = 'http://pod/c/progressive-disclosure.md'

describe('cardToQuads — frontmatter projection', () => {
  it('projects type, title, description and edge fields from frontmatter alone', () => {
    const md = `---
type: Concept
title: Progressive Disclosure
description: Layered retrieval.
implementedBy: index-view.md
---
# Progressive Disclosure
plain prose, no inline annotation.`
    const q = cardToQuads(md, URL_C, ns)
    const s = 'http://pod/c/progressive-disclosure#it'
    const has = (p, o) => q.some(t => t.subject.value === s && t.predicate.value === p && t.object.value === o)
    expect(has('http://www.w3.org/1999/02/22-rdf-syntax-ns#type', 'http://www.w3.org/2004/02/skos/core#Concept')).toBe(true)
    expect(has('http://purl.org/dc/terms/title', 'Progressive Disclosure')).toBe(true)
    expect(has('https://w3id.org/cogitarelink/wm#implementedBy', 'http://pod/c/index-view#it')).toBe(true)
  })

  it('still extracts inline Semantic-Markdown body annotations and merges them', () => {
    const md = `---
type: Concept
title: X
---
{=<#it> .skos:Concept}
[X]{skos:prefLabel} links to [impl](impl.md){wm:implementedBy}.`
    const q = cardToQuads(md, URL_C, ns)
    const s = 'http://pod/c/progressive-disclosure#it'
    expect(q.some(t => t.predicate.value === 'http://www.w3.org/2004/02/skos/core#prefLabel' && t.object.value === 'X')).toBe(true)
    expect(q.some(t => t.predicate.value === 'https://w3id.org/cogitarelink/wm#implementedBy' && t.object.value === 'http://pod/c/impl#it')).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd projection && npx vitest run okf/card.test.mjs`
Expected: FAIL — `card.mjs` not found.

- [ ] **Step 3: Implement `cardToQuads`**

```javascript
// projection/okf/card.mjs
import matter from 'gray-matter'
import { DataFactory } from 'n3'
const { namedNode, literal, quad } = DataFactory

const RDF_TYPE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type'

export function subjectIri(cardUrl) {
  const stripped = cardUrl.replace(/\.md(#.*)?$/, '')
  return stripped.includes('#') ? stripped : stripped + '#it'
}

function targetIri(href, cardUrl) {
  if (href.startsWith('#')) return new URL(href, cardUrl).href
  const stripped = href.replace(/\.md(#.*)?$/, '')
  const u = new URL(stripped, cardUrl).href
  return u.includes('#') ? u : u + '#it'
}

// A friendly type value ("Concept") maps to skos:Concept by profile convention
// (matches the existing `{=<#it> .skos:Concept}` body annotation); an explicit
// CURIE ("schema:Article") is kept. The type scheme (Task 3) is the registry.
function asTypeCurie(v) {
  return String(v).includes(':') ? String(v) : 'skos:' + v
}

// Frontmatter projection: each frontmatter key that the context maps becomes a quad.
// "@type" → rdf:type (value resolved as a class CURIE); a term with "@type":"@id"
// → IRI-valued edge; otherwise a literal property.
function frontmatterQuads(data, subject, cardUrl, ns) {
  const out = []
  for (const [key, raw] of Object.entries(data)) {
    const term = ns.term[key]
    if (term === undefined) continue
    const values = Array.isArray(raw) ? raw : [raw]
    if (term === '@type') {
      for (const v of values) out.push(quad(subject, namedNode(RDF_TYPE), namedNode(ns.resolveCurie(asTypeCurie(v)))))
    } else if (typeof term === 'object' && term['@type'] === '@id') {
      for (const v of values) out.push(quad(subject, namedNode(ns.resolveCurie(term['@id'])), namedNode(targetIri(String(v), cardUrl))))
    } else {
      const pred = typeof term === 'object' ? term['@id'] : term
      for (const v of values) out.push(quad(subject, namedNode(ns.resolveCurie(pred)), literal(String(v))))
    }
  }
  return out
}

function bodyQuads(content, subject, cardUrl, ns) {
  const out = []
  let m
  const linkRe = /\[[^\]]+\]\(([^)]+)\)\{([\w:]+)\}/g
  while ((m = linkRe.exec(content))) out.push(quad(subject, namedNode(ns.resolveCurie(m[2])), namedNode(targetIri(m[1], cardUrl))))
  const spanRe = /\[([^\]]+)\]\{([\w:]+)\}/g
  while ((m = spanRe.exec(content))) out.push(quad(subject, namedNode(ns.resolveCurie(m[2])), literal(m[1])))
  return out
}

export function cardToQuads(markdown, cardUrl, ns) {
  const { data, content } = matter(markdown)
  const subject = namedNode(subjectIri(cardUrl))
  return [...frontmatterQuads(data, subject, cardUrl, ns), ...bodyQuads(content, subject, cardUrl, ns)]
}
```

(`ns.term` is the raw `@context` map returned by `loadNamespaces` in Task 1. `bodyQuads` preserves the existing Semantic-Markdown extraction so prior `extract.test.mjs`/`graph-channel.test.mjs` stay green; frontmatter quads are additive.)

- [ ] **Step 4: Delegate the existing `extractCard` to `cardToQuads`**

In `projection/profiles/wiki-memory/extract.mjs`, add the import at the top and replace the existing `extractCard` function body so the engine and proxy share one extraction path:

```javascript
// add to the imports at the top of extract.mjs
import { cardToQuads } from '../../okf/card.mjs'

// replace the whole existing `export function extractCard(...) { ... }` with:
export function extractCard(markdown, cardUrl) {
  return cardToQuads(markdown, cardUrl, ns)   // `ns` is the module-level binding added in Task 1
}
```

Keep the `quadsToTurtle` and `PREFIXES` exports unchanged. The old inline `extractCard` regex logic now lives in `card.mjs` (`bodyQuads`), so remove it here.

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd projection && npx vitest run okf/card.test.mjs profiles/wiki-memory/extract.test.mjs profiles/wiki-memory/graph-channel.test.mjs`
Expected: PASS. (Existing extract/graph tests still green because body extraction is preserved; frontmatter quads are additive.)

- [ ] **Step 6: Commit**

```bash
git add projection/okf/card.mjs projection/okf/card.test.mjs projection/okf/namespaces.mjs projection/profiles/wiki-memory/extract.mjs
git commit -m "$(cat <<'EOF'
[Agent: Claude] feat(w1): frontmatter projection merged with body Semantic-Markdown

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: The type scheme + edge vocabulary artifacts

**Files:**
- Create: `projection/profiles/wiki-memory/types.ttl`
- Create: `projection/profiles/wiki-memory/edges.ttl`
- Test: `projection/profiles/wiki-memory/vocab.test.mjs`

**Interfaces:**
- Consumes: nothing (pure data + a parse test).
- Produces: two Turtle files the floor (Task 5) and the inverse-materializer (Task 7) read.

- [ ] **Step 1: Write the failing test**

```javascript
// projection/profiles/wiki-memory/vocab.test.mjs
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { Parser } from 'n3'

const parse = (f) => new Parser({ baseIRI: 'https://w3id.org/cogitarelink/wm#' }).parse(readFileSync(new URL(f, import.meta.url), 'utf8'))

describe('wiki-memory vocab', () => {
  it('types.ttl puns Concept as both rdfs:Class and skos:Concept with a notation', () => {
    const q = parse('./types.ttl')
    const concept = 'https://w3id.org/cogitarelink/wm#Concept'
    expect(q.some(t => t.subject.value === concept && t.predicate.value === 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type' && t.object.value === 'http://www.w3.org/2000/01/rdf-schema#Class')).toBe(true)
    expect(q.some(t => t.subject.value === concept && t.object.value === 'http://www.w3.org/2004/02/skos/core#Concept')).toBe(true)
    expect(q.some(t => t.predicate.value === 'http://www.w3.org/2004/02/skos/core#notation' && t.object.value === 'Concept')).toBe(true)
  })

  it('edges.ttl declares implementedBy with an inverse', () => {
    const q = parse('./edges.ttl')
    const impl = 'https://w3id.org/cogitarelink/wm#implementedBy'
    expect(q.some(t => t.subject.value === impl && t.predicate.value === 'http://www.w3.org/2002/07/owl#inverseOf')).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd projection && npx vitest run profiles/wiki-memory/vocab.test.mjs`
Expected: FAIL — files missing.

- [ ] **Step 3: Create `types.ttl`**

```turtle
# projection/profiles/wiki-memory/types.ttl
@prefix wm:   <https://w3id.org/cogitarelink/wm#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
@prefix skos: <http://www.w3.org/2004/02/skos/core#> .

wm:Concept a rdfs:Class, skos:Concept ;
    skos:prefLabel "Concept"@en ;
    skos:notation "Concept" ;
    skos:definition "A named idea in the memory; pairs with an implementation."@en .

wm:Implementation a rdfs:Class, skos:Concept ;
    skos:prefLabel "Implementation"@en ;
    skos:notation "Implementation" ;
    skos:definition "Code, system, or experiment realizing a concept."@en .
```

- [ ] **Step 4: Create `edges.ttl`**

```turtle
# projection/profiles/wiki-memory/edges.ttl
@prefix wm:   <https://w3id.org/cogitarelink/wm#> .
@prefix rdf:  <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
@prefix owl:  <http://www.w3.org/2002/07/owl#> .
@prefix skos: <http://www.w3.org/2004/02/skos/core#> .

wm:implementedBy a rdf:Property ;
    rdfs:label "implemented by" ;
    rdfs:domain wm:Concept ;
    rdfs:range wm:Implementation ;
    owl:inverseOf wm:implements .

wm:implements a rdf:Property ;
    rdfs:label "implements" ;
    owl:inverseOf wm:implementedBy ;
    rdfs:comment "Materialized by the projection; not authored in frontmatter." .
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd projection && npx vitest run profiles/wiki-memory/vocab.test.mjs`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add projection/profiles/wiki-memory/types.ttl projection/profiles/wiki-memory/edges.ttl projection/profiles/wiki-memory/vocab.test.mjs
git commit -m "$(cat <<'EOF'
[Agent: Claude] feat(w1): punned type scheme + edge vocab (Concept/Implementation)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Base NoteShape — unconditional type+title gate

**Files:**
- Create: `projection/profiles/wiki-memory/shapes.ttl`
- Modify: `constrained-container/proxy.js` (always apply a base shape to markdown card writes)
- Test: `constrained-container/base-floor.test.mjs`

**Interfaces:**
- Consumes: `cardToQuads` (Task 2) — already used by the proxy via `extractCard`.
- Produces: a base `wm:NoteShape` always evaluated on card (markdown) writes regardless of `ldp:constrainedBy`.

- [ ] **Step 1: Create `shapes.ttl` (base + per-type, graded)**

```turtle
# projection/profiles/wiki-memory/shapes.ttl
@prefix sh:   <http://www.w3.org/ns/shacl#> .
@prefix rdf:  <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .
@prefix skos: <http://www.w3.org/2004/02/skos/core#> .
@prefix dcterms: <http://purl.org/dc/terms/> .
@prefix wm:   <https://w3id.org/cogitarelink/wm#> .

# Tier 1 — base gate: every typed subject needs a title. Violation → 422.
wm:NoteShape a sh:NodeShape ;
    sh:targetSubjectsOf rdf:type ;
    sh:property [
        sh:path dcterms:title ;
        sh:minCount 1 ;
        sh:severity sh:Violation ;
        sh:message "Every card must declare a title (frontmatter `title:`)."
    ] .

# Tier 2 — per-type: a Concept must declare how it is implemented. Violation → 422.
wm:ConceptWiringShape a sh:NodeShape ;
    sh:targetClass skos:Concept ;
    sh:property [
        sh:path wm:implementedBy ;
        sh:minCount 1 ;
        sh:nodeKind sh:IRI ;
        sh:severity sh:Violation ;
        sh:message "Declare how this concept is implemented: add a wm:implementedBy link. The target need not exist yet."
    ] .
```

- [ ] **Step 2: Write the failing test**

```javascript
// constrained-container/base-floor.test.mjs
import { describe, it, beforeAll, expect } from 'vitest'

const JSS = process.env.BASE || 'http://localhost:3838'
const PROXY = process.env.PROXY || 'http://localhost:3839'
const POD = { name: 'alice', email: 'alice@example.com', password: 'alicepassword123' }
const auth = t => ({ Authorization: `Bearer ${t}` })

const NO_TITLE = `---
type: Concept
implementedBy: impl.md
---
# untitled`

describe('base NoteShape (always-on, no .meta required)', () => {
  let token
  const base = `alice/basefloor-${process.pid}-${Date.now()}`
  beforeAll(async () => {
    await fetch(`${JSS}/.pods`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(POD) })
    token = (await (await fetch(`${JSS}/idp/credentials`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: POD.email, password: POD.password }) })).json()).access_token
    await fetch(`${JSS}/${base}/`, { method: 'PUT', headers: { ...auth(token), 'Content-Type': 'text/turtle' }, body: '' })
  })

  it('rejects a typed card with no title even though the container has no .meta shape', async () => {
    const r = await fetch(`${PROXY}/${base}/no-title.md`, { method: 'PUT', headers: { ...auth(token), 'Content-Type': 'text/markdown' }, body: NO_TITLE })
    expect(r.status).toBe(422)
    expect(await r.text()).toMatch(/title/i)
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Start the pod and proxy, then run:

```bash
make up   # JSS at :3838
cd constrained-container && node proxy.js &   # proxy at :3839
npx vitest run base-floor.test.mjs
```

Expected: FAIL — the proxy passes the write through (no `.meta` shape), returns 201, not 422.

- [ ] **Step 4: Add an always-on base shape to the proxy**

In `constrained-container/proxy.js`, load the base shape once at startup and apply it to every markdown card write *before* the existing per-container `constrainedBy` check. Add near the top (after imports):

```javascript
import { readFileSync } from 'node:fs'
const BASE_SHAPE = readFileSync(new URL('../projection/profiles/wiki-memory/shapes.ttl', import.meta.url), 'utf8')
```

Add a helper that validates a markdown card against a Turtle shape and returns the report (reusing `extractCard`/`quadsToTurtle`/`mkDataset`/`Validator` already in the file):

```javascript
async function validateCard(body, baseIri, shapeTtl) {
  const ttl = await quadsToTurtle(extractCard(body.toString('utf8'), baseIri))
  const validator = new Validator(mkDataset(shapeTtl, baseIri), { factory: rdf })
  return validator.validate({ dataset: mkDataset(ttl, baseIri) })
}
```

In the request handler, in the `if (isWrite)` block, before the `constrainedBy` lookup, add (only for markdown writes):

```javascript
const ctype = req.headers['content-type'] || '';
if (ctype.includes('markdown')) {
  const baseIri = `${UPSTREAM}${url}`;
  const report = await validateCard(body, baseIri, BASE_SHAPE);
  const violations = report.results.filter(r => !r.severity || r.severity.value.endsWith('#Violation'));
  if (violations.length) {
    const lines = violations.map(r => `#   - ${msgOf(r)}${r.path?.value ? ` (path: ${r.path.value})` : ''}`).join('\n');
    res.writeHead(422, { 'Content-Type': 'text/plain' });
    res.end(`# 422 Unprocessable: card fails the base/profile shape\n${lines}\n`);
    console.log(`[reject] ${method} ${url} -> 422 (base/profile shape)`);
    return;
  }
}
```

Add the `msgOf` helper (factored from the existing 422 path):

```javascript
function msgOf(r) {
  return (Array.isArray(r.message) ? r.message[0]?.value : r.message) || 'constraint violation';
}
```

Note: because `shapes.ttl` contains both `NoteShape` (targets every typed subject) and `ConceptWiringShape` (targets `skos:Concept`), this single validation already runs Tier 1 **and** Tier 2 for the wiki-memory profile. Task 5 generalizes the severity handling; this task establishes the always-on path and the type+title gate.

- [ ] **Step 5: Run test to verify it passes**

Run: `cd constrained-container && npx vitest run base-floor.test.mjs`
Expected: PASS (422 with a title message).

- [ ] **Step 6: Run the existing floor regression**

Run: `cd constrained-container && npx vitest run floor.test.mjs p2.test.mjs`
Expected: PASS — existing behavior preserved.

- [ ] **Step 7: Commit**

```bash
git add projection/profiles/wiki-memory/shapes.ttl constrained-container/proxy.js constrained-container/base-floor.test.mjs
git commit -m "$(cat <<'EOF'
[Agent: Claude] feat(w1): always-on base NoteShape (type+title) on card writes

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Graded severity (Violation→422; Warning/Info→admit+report)

**Files:**
- Modify: `constrained-container/proxy.js` (severity split + admit-with-findings header)
- Test: `constrained-container/graded.test.mjs`

**Interfaces:**
- Consumes: `validateCard`, `msgOf` (Task 4).
- Produces: admitted card writes carry a `Link: <…>; rel="…describedby"` is *not* added here; instead non-blocking findings are returned via a `Warning` HTTP header on the admitted (2xx) response and logged.

- [ ] **Step 1: Write the failing test**

```javascript
// constrained-container/graded.test.mjs
import { describe, it, beforeAll, expect } from 'vitest'
const JSS = process.env.BASE || 'http://localhost:3838'
const PROXY = process.env.PROXY || 'http://localhost:3839'
const POD = { name: 'alice', email: 'alice@example.com', password: 'alicepassword123' }
const auth = t => ({ Authorization: `Bearer ${t}` })

// Concept WITH title + implementedBy (passes Violations) but missing an optional description (Info).
const WARN_OK = `---
type: Concept
title: Has Title
implementedBy: impl.md
---
# Has Title`

describe('graded severity', () => {
  let token
  const base = `alice/graded-${process.pid}-${Date.now()}`
  beforeAll(async () => {
    await fetch(`${JSS}/.pods`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(POD) })
    token = (await (await fetch(`${JSS}/idp/credentials`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: POD.email, password: POD.password }) })).json()).access_token
    await fetch(`${JSS}/${base}/`, { method: 'PUT', headers: { ...auth(token), 'Content-Type': 'text/turtle' }, body: '' })
  })

  it('admits a card that satisfies all Violations even if Info/Warning findings exist', async () => {
    const r = await fetch(`${PROXY}/${base}/has-title.md`, { method: 'PUT', headers: { ...auth(token), 'Content-Type': 'text/markdown' }, body: WARN_OK })
    expect([200, 201, 204, 205]).toContain(r.status)
  })
})
```

Add an `Info`-severity property to `shapes.ttl` `wm:ConceptWiringShape` so there is a non-blocking finding to exercise:

```turtle
    sh:property [
        sh:path dcterms:description ;
        sh:minCount 1 ;
        sh:severity sh:Info ;
        sh:message "Consider adding a description for index.md disclosure."
    ] ;
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd constrained-container && npx vitest run graded.test.mjs`
Expected: FAIL — current code 422s on any non-conforming report, including the `Info` description finding.

- [ ] **Step 3: Split severity in the proxy**

Replace the markdown-validation block from Task 4 so only `Violation` blocks; `Warning`/`Info` are attached to the admitted response and logged:

```javascript
if (ctype.includes('markdown')) {
  const baseIri = `${UPSTREAM}${url}`;
  const report = await validateCard(body, baseIri, BASE_SHAPE);
  const sev = r => (r.severity?.value || 'http://www.w3.org/ns/shacl#Violation').split('#')[1];
  const violations = report.results.filter(r => sev(r) === 'Violation');
  const advisories = report.results.filter(r => sev(r) !== 'Violation');
  if (violations.length) {
    const lines = violations.map(r => `#   - ${msgOf(r)}${r.path?.value ? ` (path: ${r.path.value})` : ''}`).join('\n');
    res.writeHead(422, { 'Content-Type': 'text/plain' });
    res.end(`# 422 Unprocessable: card fails the profile shape\n${lines}\n`);
    console.log(`[reject] ${method} ${url} -> 422`);
    return;
  }
  if (advisories.length) {
    req.__advisories = advisories.map(r => `${sev(r)}: ${msgOf(r)}`);
    console.log(`[admit]  ${method} ${url} (with ${advisories.length} advisory finding(s))`);
  }
}
```

Then, where the proxy writes the upstream response headers back to the client, append a `Warning` header when advisories exist. Find the block that builds `out` headers for the proxied response and add:

```javascript
if (req.__advisories?.length) out['warning'] = req.__advisories.map(a => `199 - "${a.replace(/"/g, "'")}"`).join(', ');
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd constrained-container && npx vitest run graded.test.mjs base-floor.test.mjs floor.test.mjs`
Expected: PASS — `has-title.md` admitted (2xx) despite the `Info` description finding; the base/violation tests still reject.

- [ ] **Step 5: Commit**

```bash
git add constrained-container/proxy.js constrained-container/graded.test.mjs projection/profiles/wiki-memory/shapes.ttl
git commit -m "$(cat <<'EOF'
[Agent: Claude] feat(w1): graded severity — only Violation blocks; advisories admit + Warning header

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Unknown-type → admit + agent warning

**Files:**
- Modify: `constrained-container/proxy.js` (warn when `type:` not in profile's declared set)
- Test: `constrained-container/unknown-type.test.mjs`

**Interfaces:**
- Consumes: the profile's declared `types` list — read from `types.ttl` `skos:notation` values at proxy startup.
- Produces: an admitted (2xx) card write whose response carries a `Warning` advising the type is new to the profile.

- [ ] **Step 1: Write the failing test**

```javascript
// constrained-container/unknown-type.test.mjs
import { describe, it, beforeAll, expect } from 'vitest'
const JSS = process.env.BASE || 'http://localhost:3838'
const PROXY = process.env.PROXY || 'http://localhost:3839'
const POD = { name: 'alice', email: 'alice@example.com', password: 'alicepassword123' }
const auth = t => ({ Authorization: `Bearer ${t}` })

const NOVEL = `---
type: Playbook
title: Incident Response
---
# Incident Response`

describe('unknown-to-profile type', () => {
  let token
  const base = `alice/unknown-${process.pid}-${Date.now()}`
  beforeAll(async () => {
    await fetch(`${JSS}/.pods`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(POD) })
    token = (await (await fetch(`${JSS}/idp/credentials`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: POD.email, password: POD.password }) })).json()).access_token
    await fetch(`${JSS}/${base}/`, { method: 'PUT', headers: { ...auth(token), 'Content-Type': 'text/turtle' }, body: '' })
  })

  it('admits a card with an unknown type but warns it is ungoverned', async () => {
    const r = await fetch(`${PROXY}/${base}/playbook.md`, { method: 'PUT', headers: { ...auth(token), 'Content-Type': 'text/markdown' }, body: NOVEL })
    expect([200, 201, 204, 205]).toContain(r.status)
    expect(r.headers.get('warning') || '').toMatch(/new|ungoverned|Playbook/i)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd constrained-container && npx vitest run unknown-type.test.mjs`
Expected: FAIL — no `Warning` header (and the `Playbook` card actually passes the base shape since it has a title, so it is admitted silently).

- [ ] **Step 3: Load the profile's declared types and warn on unknowns**

In `constrained-container/proxy.js`, at startup parse the declared notations from `types.ttl`:

```javascript
import { Parser as TtlParser } from 'n3'
const PROFILE_TYPES = new Set(
  new TtlParser().parse(readFileSync(new URL('../projection/profiles/wiki-memory/types.ttl', import.meta.url), 'utf8'))
    .filter(q => q.predicate.value === 'http://www.w3.org/2004/02/skos/core#notation')
    .map(q => q.object.value)
);
```

In the markdown-validation block, after the Violation check passes, read the frontmatter `type` and add an advisory if it is not declared:

```javascript
import matter from 'gray-matter'
// inside the markdown block, after violations handled:
const fmType = matter(body.toString('utf8')).data?.type;
if (fmType && !PROFILE_TYPES.has(fmType)) {
  (req.__advisories ||= []).push(`Unknown: type "${fmType}" is new to the wiki-memory profile — admitted ungoverned; register a shape or pick an existing type`);
}
```

(The `Warning` header emission from Task 5 Step 3 already serializes `req.__advisories`.)

- [ ] **Step 4: Run test to verify it passes**

Run: `cd constrained-container && npx vitest run unknown-type.test.mjs graded.test.mjs base-floor.test.mjs`
Expected: PASS — `Playbook` admitted with a `Warning` naming the new type.

- [ ] **Step 5: Commit**

```bash
git add constrained-container/proxy.js constrained-container/unknown-type.test.mjs
git commit -m "$(cat <<'EOF'
[Agent: Claude] feat(w1): unknown-to-profile type admitted with agent-facing Warning

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Inverse-edge materialization in the graph channel

**Files:**
- Create: `projection/okf/materialize.mjs`
- Test: `projection/okf/materialize.test.mjs`
- Modify: `projection/profiles/wiki-memory/graph-channel.mjs` (apply materialization)

**Interfaces:**
- Consumes: `edges.ttl` (Task 3), `cardToQuads` (Task 2).
- Produces: `materializeInverses(quads: Array<Quad>, edgesTtl: string) → Array<Quad>` — appends one inverse quad per edge with a declared `owl:inverseOf`.

- [ ] **Step 1: Write the failing test**

```javascript
// projection/okf/materialize.test.mjs
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { DataFactory } from 'n3'
import { materializeInverses } from './materialize.mjs'
const { namedNode, quad } = DataFactory

const edges = readFileSync(new URL('../profiles/wiki-memory/edges.ttl', import.meta.url), 'utf8')

describe('materializeInverses', () => {
  it('adds the inverse of implementedBy (implements)', () => {
    const C = 'http://pod/c/x#it', I = 'http://pod/c/impl#it'
    const q = [quad(namedNode(C), namedNode('https://w3id.org/cogitarelink/wm#implementedBy'), namedNode(I))]
    const out = materializeInverses(q, edges)
    expect(out.some(t => t.subject.value === I && t.predicate.value === 'https://w3id.org/cogitarelink/wm#implements' && t.object.value === C)).toBe(true)
  })

  it('leaves literal-valued and inverse-less edges untouched', () => {
    const q = [quad(namedNode('http://pod/c/x#it'), namedNode('http://www.w3.org/2004/02/skos/core#prefLabel'), DataFactory.literal('X'))]
    expect(materializeInverses(q, edges)).toHaveLength(1)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd projection && npx vitest run okf/materialize.test.mjs`
Expected: FAIL — `materialize.mjs` not found.

- [ ] **Step 3: Implement `materializeInverses`**

```javascript
// projection/okf/materialize.mjs
import { Parser, DataFactory } from 'n3'
const { namedNode, quad } = DataFactory
const INVERSE_OF = 'http://www.w3.org/2002/07/owl#inverseOf'

export function materializeInverses(quads, edgesTtl) {
  const inv = new Map()
  for (const q of new Parser().parse(edgesTtl)) if (q.predicate.value === INVERSE_OF) inv.set(q.subject.value, q.object.value)

  const out = [...quads]
  for (const q of quads) {
    const p = inv.get(q.predicate.value)
    if (p && q.object.termType === 'NamedNode') out.push(quad(q.object, namedNode(p), q.subject))
  }
  return out
}
```

- [ ] **Step 4: Apply materialization in the graph channel**

Modify `projection/profiles/wiki-memory/graph-channel.mjs`:

```javascript
import { readFileSync } from 'node:fs'
import { extractCard, quadsToTurtle } from './extract.mjs'
import { materializeInverses } from '../../okf/materialize.mjs'

const EDGES = readFileSync(new URL('./edges.ttl', import.meta.url), 'utf8')

export const graphChannel = {
  name: 'graph',
  mediaType: 'text/turtle',
  target: containerUrl => `${containerUrl}graph.ttl`,
  render: async (containerUrl, cards, _members) =>
    quadsToTurtle(materializeInverses(cards.flatMap(c => extractCard(c.body, c.url)), EDGES)),
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd projection && npx vitest run okf/materialize.test.mjs profiles/wiki-memory/graph-channel.test.mjs`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add projection/okf/materialize.mjs projection/okf/materialize.test.mjs projection/profiles/wiki-memory/graph-channel.mjs
git commit -m "$(cat <<'EOF'
[Agent: Claude] feat(w1): materialize inverse edges into graph.ttl from edges.ttl

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Tier-1 `Link`-header derivation + proxy emission

**Files:**
- Create: `projection/okf/links.mjs`
- Test: `projection/okf/links.test.mjs`
- Modify: `constrained-container/proxy.js` (attach derived `Link` headers to the upstream card PUT)
- Test: `constrained-container/link-headers.test.mjs`

**Interfaces:**
- Consumes: `loadNamespaces` (Task 1).
- Produces: `typeLinkHeaders(frontmatter, ns, indexedRels=['implementedBy','broader']) → string` — an HTTP `Link` header value with one `rel="type"` entry plus one entry per indexed relation present in the frontmatter. These feed the future LWS Type Index/Search (Phase 2); W1 only emits them.

- [ ] **Step 1: Write the failing unit test**

```javascript
// projection/okf/links.test.mjs
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { loadNamespaces } from './namespaces.mjs'
import { typeLinkHeaders } from './links.mjs'
const ns = loadNamespaces(JSON.parse(readFileSync(new URL('../profiles/wiki-memory/context.jsonld', import.meta.url))))

describe('typeLinkHeaders', () => {
  it('emits rel="type" for the resolved class and rels for indexed relations present', () => {
    const h = typeLinkHeaders({ type: 'Concept', implementedBy: 'impl.md' }, ns)
    expect(h).toContain('<http://www.w3.org/2004/02/skos/core#Concept>; rel="type"')
    expect(h).toContain('rel="https://w3id.org/cogitarelink/wm#implementedBy"')
  })

  it('omits relation entries absent from the frontmatter', () => {
    const h = typeLinkHeaders({ type: 'Concept' }, ns)
    expect(h).not.toContain('implementedBy')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd projection && npx vitest run okf/links.test.mjs`
Expected: FAIL — `links.mjs` not found.

- [ ] **Step 3: Implement `typeLinkHeaders`**

```javascript
// projection/okf/links.mjs
export function typeLinkHeaders(frontmatter, ns, indexedRels = ['implementedBy', 'broader']) {
  const parts = []
  if (frontmatter?.type) {
    const curie = String(frontmatter.type).includes(':') ? String(frontmatter.type) : 'skos:' + frontmatter.type
    parts.push(`<${ns.resolveCurie(curie)}>; rel="type"`)
  }
  for (const rel of indexedRels) {
    if (frontmatter?.[rel] == null) continue
    const relIri = ns.resolveCurie((ns.term[rel] && ns.term[rel]['@id']) || rel)
    const targets = Array.isArray(frontmatter[rel]) ? frontmatter[rel] : [frontmatter[rel]]
    for (const t of targets) parts.push(`<${String(t)}>; rel="${relIri}"`)
  }
  return parts.join(', ')
}
```

- [ ] **Step 4: Write the failing proxy integration test**

```javascript
// constrained-container/link-headers.test.mjs
import { describe, it, beforeAll, expect } from 'vitest'
const JSS = process.env.BASE || 'http://localhost:3838'
const PROXY = process.env.PROXY || 'http://localhost:3839'
const POD = { name: 'alice', email: 'alice@example.com', password: 'alicepassword123' }
const auth = t => ({ Authorization: `Bearer ${t}` })
const CARD = `---
type: Concept
title: PD
implementedBy: impl.md
---
# PD`

describe('proxy attaches Tier-1 Link headers and still admits', () => {
  let token
  const base = `alice/links-${process.pid}-${Date.now()}`
  beforeAll(async () => {
    await fetch(`${JSS}/.pods`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(POD) })
    token = (await (await fetch(`${JSS}/idp/credentials`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: POD.email, password: POD.password }) })).json()).access_token
    await fetch(`${JSS}/${base}/`, { method: 'PUT', headers: { ...auth(token), 'Content-Type': 'text/turtle' }, body: '' })
  })

  it('admits the card written through the proxy (headers attached upstream)', async () => {
    const r = await fetch(`${PROXY}/${base}/pd.md`, { method: 'PUT', headers: { ...auth(token), 'Content-Type': 'text/markdown' }, body: CARD })
    expect([200, 201, 204, 205]).toContain(r.status)
    const back = await fetch(`${JSS}/${base}/pd.md`, { headers: { ...auth(token), Accept: 'text/markdown' } })
    expect(await back.text()).toContain('# PD')
  })
})
```

- [ ] **Step 5: Run test to verify it fails (or passes trivially), then wire emission**

Run: `cd constrained-container && npx vitest run link-headers.test.mjs`
Expected: PASS for admission, but the headers are not yet attached. Wire emission: in `proxy.js`, where the admitted markdown write is forwarded upstream, compute and add the headers. Import at top:

```javascript
import { loadNamespaces } from '../projection/okf/namespaces.mjs'
import { typeLinkHeaders } from '../projection/okf/links.mjs'
const NS = loadNamespaces(JSON.parse(readFileSync(new URL('../projection/profiles/wiki-memory/context.jsonld', import.meta.url))))
```

In the markdown block (after Violation/advisory handling, before forwarding upstream), set a request-scoped header to merge into the upstream fetch:

```javascript
const fm = matter(body.toString('utf8')).data || {};
req.__linkHeader = typeLinkHeaders(fm, NS);
```

Where the proxy builds headers for the upstream request, append:

```javascript
if (req.__linkHeader) upstreamHeaders['link'] = (upstreamHeaders['link'] ? upstreamHeaders['link'] + ', ' : '') + req.__linkHeader;
```

(Use the existing variable the proxy passes as `headers` to its upstream `fetch`; the name in `proxy.js` is the forwarded-headers object built from `req.headers`.)

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd projection && npx vitest run okf/links.test.mjs` then `cd ../constrained-container && npx vitest run link-headers.test.mjs floor.test.mjs`
Expected: PASS — unit test green; card admitted and round-trips; existing floor unaffected.

- [ ] **Step 7: Commit**

```bash
git add projection/okf/links.mjs projection/okf/links.test.mjs constrained-container/proxy.js constrained-container/link-headers.test.mjs
git commit -m "$(cat <<'EOF'
[Agent: Claude] feat(w1): derive + attach Tier-1 rel=type/edge Link headers on card writes

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: Profile selection, base mode, backward-compat

**Files:**
- Create: `projection/okf/profile-select.mjs`
- Test: `projection/okf/profile-select.test.mjs`
- Modify: `projection/profiles/wiki-memory/index.mjs` (carry `context`, declared types, `name`)
- Create: `projection/okf/base-profile.mjs`
- Test: `projection/backcompat.test.mjs`

**Interfaces:**
- Consumes: `wikiMemoryProfile` (existing), the root `index.md` text.
- Produces: `selectProfile(rootIndexText, registry) → profile` — reads `okf_profile` from root frontmatter, returns the matching profile, or the base profile when absent/unknown. `baseProfile` = `{ application: 'okf-base', types: null, channels: [indexChannel] }` (OKF nav only, no typed `.graph`, no floor beyond the always-on base shape).

- [ ] **Step 1: Write the failing test**

```javascript
// projection/okf/profile-select.test.mjs
import { describe, it, expect } from 'vitest'
import { selectProfile } from './profile-select.mjs'
import { wikiMemoryProfile } from '../profiles/wiki-memory/index.mjs'
import { baseProfile } from './base-profile.mjs'

const registry = { 'wiki-memory': wikiMemoryProfile }

describe('selectProfile', () => {
  it('selects the declared profile from root index.md frontmatter', () => {
    const root = `---\nokf_profile: wiki-memory\n---\n# Root`
    expect(selectProfile(root, registry).application).toBe('wiki-memory')
  })

  it('falls back to base mode when no profile is declared', () => {
    expect(selectProfile('# Root, no frontmatter', registry)).toBe(baseProfile)
  })

  it('falls back to base mode for an unknown profile name', () => {
    const root = `---\nokf_profile: nope\n---\n# Root`
    expect(selectProfile(root, registry)).toBe(baseProfile)
  })

  it('base mode runs index.md only — no typed graph channel', () => {
    expect(baseProfile.channels.map(c => c.name)).toEqual(['index'])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd projection && npx vitest run okf/profile-select.test.mjs`
Expected: FAIL — modules missing.

- [ ] **Step 3: Implement base profile and selection**

```javascript
// projection/okf/base-profile.mjs
import { indexChannel } from './index-channel.mjs'
export const baseProfile = { application: 'okf-base', types: null, channels: [indexChannel] }
```

```javascript
// projection/okf/profile-select.mjs
import matter from 'gray-matter'
import { baseProfile } from './base-profile.mjs'

export function selectProfile(rootIndexText, registry) {
  const name = matter(rootIndexText).data?.okf_profile
  return (name && registry[name]) || baseProfile
}
```

- [ ] **Step 4: Add `name`/declared types to the wiki-memory profile**

In `projection/profiles/wiki-memory/index.mjs`, extend the export so selection and tooling can introspect it (keep existing fields):

```javascript
import { readFileSync } from 'node:fs'
import { indexChannel } from '../../okf/index-channel.mjs'
import { graphChannel } from './graph-channel.mjs'
import { wmConceptWiringShape } from './shape.mjs'

const context = JSON.parse(readFileSync(new URL('./context.jsonld', import.meta.url)))

export const wikiMemoryProfile = {
  application: 'wiki-memory',
  types: ['Concept'],
  channels: [indexChannel, graphChannel],
  floorShape: wmConceptWiringShape,
  context,
}
```

- [ ] **Step 5: Write the backward-compat e2e test**

```javascript
// projection/backcompat.test.mjs
import { describe, it, beforeAll, expect } from 'vitest'
import { project } from './engine.mjs'
import { baseProfile } from './okf/base-profile.mjs'
import { parseFrontmatter, isConformant } from './okf/frontmatter.mjs'

const BASE = process.env.BASE || 'http://localhost:3838'
const POD = { name: 'alice', email: 'alice@example.com', password: 'alicepassword123' }
const auth = t => ({ Authorization: `Bearer ${t}` })
const CARD = `---
type: Concept
title: PD
description: Layered retrieval.
implementedBy: impl.md
---
# PD`

describe('backward-compat: a wiki-memory bundle reads as plain OKF in base mode', () => {
  let token
  const C = `${BASE}/alice/bc-${process.pid}-${Date.now()}/`
  beforeAll(async () => {
    await fetch(`${BASE}/.pods`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(POD) })
    token = (await (await fetch(`${BASE}/idp/credentials`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: POD.email, password: POD.password }) })).json()).access_token
    await fetch(C, { method: 'PUT', headers: { ...auth(token), 'Content-Type': 'text/turtle' }, body: '' })
    await fetch(C + 'pd.md', { method: 'PUT', headers: { ...auth(token), 'Content-Type': 'text/markdown' }, body: CARD })
  })

  it('cards are OKF-conformant (type present) and parse as plain frontmatter', async () => {
    const txt = await (await fetch(C + 'pd.md', { headers: { ...auth(token), Accept: 'text/markdown' } })).text()
    const { frontmatter } = parseFrontmatter(txt)
    expect(isConformant(frontmatter)).toBe(true)
    expect(frontmatter.title).toBe('PD')
  })

  it('base mode projects index.md only — no graph.ttl', async () => {
    const res = await project(C, token, baseProfile)
    expect(res.map(r => r.channel)).toEqual(['index'])
    for (const r of res) expect([200, 201, 204, 205]).toContain(r.status)
    const graph = await fetch(C + 'graph.ttl', { headers: { ...auth(token), Accept: 'text/turtle' } })
    expect(graph.status).toBe(404)
  })
})
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd projection && npx vitest run okf/profile-select.test.mjs backcompat.test.mjs profiles/wiki-memory/profile.test.mjs`
Expected: PASS — selection works; base mode emits only `index.md`; the wiki-memory bundle is OKF-conformant and parses flat.

- [ ] **Step 7: Commit**

```bash
git add projection/okf/profile-select.mjs projection/okf/profile-select.test.mjs projection/okf/base-profile.mjs projection/profiles/wiki-memory/index.mjs projection/backcompat.test.mjs
git commit -m "$(cat <<'EOF'
[Agent: Claude] feat(w1): profile selection + base OKF mode + backward-compat tests

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Final verification

- [ ] **Run the full suite against a fresh pod.**

```bash
make reset && make up
cd constrained-container && node proxy.js &
cd .. && make test-projection
cd constrained-container && npx vitest run
```

Expected: all projection unit + e2e tests pass; all constrained-container tests (floor, p2, base-floor, graded, unknown-type, link-headers) pass.

- [ ] **Confirm the local definition-of-done items this plan advances** (`docs/ROADMAP.md:124-131`): an agent authors cards through the graded SHACL floor; projection keeps `graph.ttl`/`index.md` in sync with materialized inverses; the type+title base gate and per-type wiring floor hold; backward-compat (base mode = flat reader) is proven. The "concepts with no implementation" Comunica query and the wiki-memory app/Porter control remain for later W1 slices / W2.

---

## Notes on deferred items (carried from the spec §10)

- **Real LWS Type Index/Search services** (Phase 2): W1 emits the `rel="type"`/edge `Link` headers (Task 8) but the consuming services are not built; Tier-1 stays a Comunica-over-`graph.ttl` stopgap.
- **`sh:SPARQLRule` materialization** (transitive `up` closure, hub flags): W1 does inverse-edge materialization programmatically (Task 7); SPARQL-rule inference is deferred (`shacl-engine` is validation-first).
- **CID-signed writes** beyond the proven LWS-CID auth; **per-resource authz over the `.graph` aggregate** (§7.2); the **vault as a second profile** (§4.3); the **W2 eval** task/metric design.
