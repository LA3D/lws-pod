# Repo Reconciliation — Plan 1: Stable Subject Identity + Base-Profile Foundation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the location-derived subject IRI with a profile-minted, declared-or-namespaced stable IRI, drop the retired inline Semantic-Markdown extractor, and give the base profile an identity policy — the foundation every later profile builds on.

**Architecture:** A card's RDF subject becomes a *stable, location-independent* IRI: a declared frontmatter `id:` if present, else minted by the profile's identity policy from the card's slug + the profile's namespace (never from the storage URL). Edges point at minted subject IRIs too, so the graph survives resources moving. This is the spec's Section-B fix; it is purely in `projection/okf/`.

**Tech Stack:** Node ESM, `n3` (DataFactory/Parser/Writer), `gray-matter` (frontmatter), `vitest`. No new dependencies.

**This is Plan 1 of 3** reconciling the repo to `docs/superpowers/specs/2026-06-28-general-memory-substrate-design.md`. Plan 2 = the profile mechanism + profiles #1/#2; Plan 3 = optional governance + provenance + storage description + the acceptance gate.

## Global Constraints

- **profile = schema, bundle = content** — keep the terms distinct in code and comments.
- **Subject IRI is stable and location-independent** — derived from a declared `id:` or `{profile namespace}{slug}`, NEVER from the storage/file URL.
- **Frontmatter is the canonical semantic surface** — inline body annotation (curly-brace Semantic-Markdown) is DROPPED, not read.
- **No vocabulary names in engine code** — the engine (`okf/`) must not hardcode `skos`/`wm`/etc.; those come from a profile's context.
- **fastai style** — brevity; no comments except WHY; match the surrounding terse style of `card.mjs`.
- Tests: `make test-projection` runs the full projection gate (`cd projection && npm test`). For single-file TDD runs use `cd projection && npx vitest run okf/<file>.test.mjs` — `projection/` has its own vitest setup, separate from the repo-root `tests/` config.

---

### Task 1: Identity policy module

**Files:**
- Create: `projection/okf/identity.mjs`
- Test: `projection/okf/identity.test.mjs`

**Interfaces:**
- Produces: `slugFromUrl(cardUrl: string): string` — the filename stem (no dir, no `.md`, no fragment).
- Produces: `makeIdentityPolicy({base: string, fragment?: string}): {base, fragment, mint(slug: string): string}` — `mint` returns `base + slug + fragment`.
- Produces: `subjectIri(frontmatter: object, cardUrl: string, policy): string` — returns `frontmatter.id` if set (declared, location-independent), else `policy.mint(slugFromUrl(cardUrl))`.

- [ ] **Step 1: Write the failing test**

```js
// projection/okf/identity.test.mjs
import { describe, it, expect } from 'vitest'
import { slugFromUrl, makeIdentityPolicy, subjectIri } from './identity.mjs'

const policy = makeIdentityPolicy({ base: 'https://pod.example/kb/' })

describe('identity', () => {
  it('slugFromUrl strips dir, .md, and fragment', () => {
    expect(slugFromUrl('http://pod/c/progressive-disclosure.md')).toBe('progressive-disclosure')
    expect(slugFromUrl('http://pod/c/x.md#it')).toBe('x')
  })

  it('mints a namespace+slug IRI independent of the storage URL', () => {
    expect(subjectIri({}, 'http://pod-A/c/x.md', policy)).toBe('https://pod.example/kb/x#it')
    expect(subjectIri({}, 'http://pod-B/other/x.md', policy)).toBe('https://pod.example/kb/x#it')
  })

  it('honors a declared frontmatter id verbatim', () => {
    expect(subjectIri({ id: 'https://w3id.org/thing/42' }, 'http://pod/c/x.md', policy))
      .toBe('https://w3id.org/thing/42')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd projection && npx vitest run okf/identity.test.mjs`
Expected: FAIL — cannot resolve `./identity.mjs`.

- [ ] **Step 3: Write minimal implementation**

```js
// projection/okf/identity.mjs
export function slugFromUrl(cardUrl) {
  const file = (cardUrl.split('/').pop() || '')
  return file.replace(/\.md(#.*)?$/, '').replace(/#.*$/, '')
}

export function makeIdentityPolicy({ base, fragment = '#it' }) {
  return { base, fragment, mint(slug) { return `${base}${slug}${fragment}` } }
}

// Declared id wins (location-independent); otherwise mint from slug + profile namespace.
export function subjectIri(frontmatter, cardUrl, policy) {
  return frontmatter.id ? String(frontmatter.id) : policy.mint(slugFromUrl(cardUrl))
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd projection && npx vitest run okf/identity.test.mjs`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add projection/okf/identity.mjs projection/okf/identity.test.mjs
git commit -m "feat(projection): profile-minted, location-independent subject IRIs

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Rewire `card.mjs` to mint subjects and edge targets via the identity policy

**Files:**
- Modify: `projection/okf/card.mjs` (replace `subjectIri`/`targetIri`; thread `policy` through `cardToQuads`/`frontmatterQuads`)
- Modify: `projection/okf/card.test.mjs` (pass a policy; assert minted + declared subjects)

**Interfaces:**
- Consumes: `makeIdentityPolicy`, `subjectIri` from Task 1.
- Produces: `cardToQuads(markdown: string, cardUrl: string, ns, policy): Quad[]` — subject and `@id`-typed edge objects are minted via `policy`. (Signature gains a 4th param `policy`.)

- [ ] **Step 1: Write the failing test** (replace the body of `projection/okf/card.test.mjs`'s first `describe` with policy-aware assertions)

```js
// projection/okf/card.test.mjs  (top of file)
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { loadNamespaces } from './namespaces.mjs'
import { makeIdentityPolicy } from './identity.mjs'
import { cardToQuads } from './card.mjs'

const ns = loadNamespaces(JSON.parse(readFileSync(new URL('../profiles/wiki-memory/context.jsonld', import.meta.url))))
const policy = makeIdentityPolicy({ base: 'https://pod.example/kb/' })
const URL_C = 'http://pod/c/progressive-disclosure.md'

describe('cardToQuads — frontmatter projection', () => {
  it('subject and edges are minted via the policy, not the file URL', () => {
    const md = `---
type: Concept
title: Progressive Disclosure
implementedBy: index-view.md
---
# Progressive Disclosure
plain prose.`
    const q = cardToQuads(md, URL_C, ns, policy)
    const s = 'https://pod.example/kb/progressive-disclosure#it'
    const has = (p, o) => q.some(t => t.subject.value === s && t.predicate.value === p && t.object.value === o)
    expect(has('http://www.w3.org/1999/02/22-rdf-syntax-ns#type', 'http://www.w3.org/2004/02/skos/core#Concept')).toBe(true)
    expect(has('http://purl.org/dc/terms/title', 'Progressive Disclosure')).toBe(true)
    expect(has('https://w3id.org/cogitarelink/wm#implementedBy', 'https://pod.example/kb/index-view#it')).toBe(true)
  })

  it('a declared id overrides the minted subject', () => {
    const md = `---
id: https://w3id.org/thing/42
type: Concept
title: X
---
# X`
    const q = cardToQuads(md, URL_C, ns, policy)
    expect(q.some(t => t.subject.value === 'https://w3id.org/thing/42'
      && t.predicate.value === 'http://purl.org/dc/terms/title')).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd projection && npx vitest run okf/card.test.mjs`
Expected: FAIL — subjects are still `http://pod/c/...#it` (old `subjectIri`), and `cardToQuads` ignores `policy`.

- [ ] **Step 3: Write the implementation** (edit `projection/okf/card.mjs`)

Replace `subjectIri` and `targetIri` and thread `policy`. New `card.mjs`:

```js
// projection/okf/card.mjs
import matter from 'gray-matter'
import { DataFactory } from 'n3'
import { subjectIri as mintSubject, slugFromUrl } from './identity.mjs'
const { namedNode, literal, quad } = DataFactory

const RDF_TYPE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type'

function targetIri(href, policy) {
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(href)) return href            // absolute IRI passes through
  return policy.mint(slugFromUrl(href))                              // in-bundle link -> minted subject IRI
}

function asTypeCurie(v) { return String(v).includes(':') ? String(v) : 'skos:' + v }

function frontmatterQuads(data, subject, ns, policy) {
  const out = []
  for (const [key, raw] of Object.entries(data)) {
    if (key === 'id') continue                                       // identity, not a property
    const term = ns.term[key]
    if (term === undefined) continue
    const values = Array.isArray(raw) ? raw : [raw]
    if (term === '@type') {
      for (const v of values) out.push(quad(subject, namedNode(RDF_TYPE), namedNode(ns.resolveCurie(asTypeCurie(v)))))
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
  const all = frontmatterQuads(data, subject, ns, policy)
  const seen = new Set(), out = []
  for (const q of all) { const k = `${q.subject.value}|${q.predicate.value}|${q.object.value}`; if (!seen.has(k)) { seen.add(k); out.push(q) } }
  return out
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd projection && npx vitest run okf/card.test.mjs`
Expected: PASS for the two `frontmatter projection` tests. (The old inline-SM test still present below will now FAIL — Task 3 removes it.)

- [ ] **Step 5: Commit**

```bash
git add projection/okf/card.mjs projection/okf/card.test.mjs
git commit -m "refactor(projection): mint card subjects + edge targets via identity policy

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Drop the inline Semantic-Markdown extractor

**Files:**
- Modify: `projection/okf/card.test.mjs` (remove the two inline-SM tests; add a guard test that inline annotation is NOT extracted)

**Interfaces:**
- Consumes: `cardToQuads` from Task 2 (already free of `bodyQuads` — Task 2's `card.mjs` dropped it).

Task 2 already removed `bodyQuads` from `card.mjs`. This task removes the now-failing tests that asserted the dropped behavior and locks in the decision with an inversion test.

- [ ] **Step 1: Write the guard test** — delete the two tests titled *"still extracts inline Semantic-Markdown body annotations and merges them"* and *"frontmatter title and body edge share the same name#it subject"* from `card.test.mjs`, and add:

```js
  it('does NOT extract inline curly-brace Semantic-Markdown from the body (dropped 2026-06-25)', () => {
    const md = `---
type: Concept
title: X
---
{=<#it> .skos:Concept}
[X]{skos:prefLabel} links to [impl](impl.md){wm:implementedBy}.`
    const q = cardToQuads(md, URL_C, ns, policy)
    expect(q.some(t => t.predicate.value === 'http://www.w3.org/2004/02/skos/core#prefLabel')).toBe(false)
    // the plain markdown link is NOT a typed edge anymore; only frontmatter edges project
    expect(q.some(t => t.predicate.value === 'https://w3id.org/cogitarelink/wm#implementedBy')).toBe(false)
  })
```

- [ ] **Step 2: Run test to verify it passes**

Run: `cd projection && npx vitest run okf/card.test.mjs`
Expected: PASS — all remaining tests green; no inline extraction occurs.

- [ ] **Step 3: Commit**

```bash
git add projection/okf/card.test.mjs
git commit -m "test(projection): lock in dropped inline Semantic-Markdown surface

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: Give the base profile an identity policy

**Files:**
- Modify: `projection/okf/base-profile.mjs` (add `identityPolicy` + a minimal base `context`)
- Test: `projection/okf/base-profile.test.mjs`

**Interfaces:**
- Consumes: `makeIdentityPolicy` (Task 1), `loadNamespaces` (`namespaces.mjs`), `cardToQuads` (Task 2).
- Produces: `baseProfile.identityPolicy` (a policy with a placeholder base, overridden per-pod at deploy) and `baseProfile.context` (a minimal JSON-LD context: `type`→`@type`, `title`→`dcterms:title`, `description`→`dcterms:description`). The engine reads `profile.identityPolicy` + `profile.context`; no vocabulary is named in engine code.

- [ ] **Step 1: Write the failing test**

```js
// projection/okf/base-profile.test.mjs
import { describe, it, expect } from 'vitest'
import { baseProfile } from './base-profile.mjs'
import { loadNamespaces } from './namespaces.mjs'
import { cardToQuads } from './card.mjs'

describe('baseProfile', () => {
  it('carries an identity policy and a minimal context that projects an OKF card', () => {
    expect(typeof baseProfile.identityPolicy.mint).toBe('function')
    const ns = loadNamespaces(baseProfile.context)
    const md = `---
type: Reference
title: Orders
---
# Orders`
    const q = cardToQuads(md, 'http://pod/tables/orders.md', ns, baseProfile.identityPolicy)
    const titled = q.find(t => t.predicate.value === 'http://purl.org/dc/terms/title')
    expect(titled).toBeDefined()
    expect(titled.object.value).toBe('Orders')
    // subject is minted (base#slug), not the file URL
    expect(titled.subject.value.endsWith('orders#it')).toBe(true)
    expect(titled.subject.value.startsWith('http://pod/tables/')).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd projection && npx vitest run okf/base-profile.test.mjs`
Expected: FAIL — `baseProfile.identityPolicy` is undefined and `baseProfile.context` does not exist.

- [ ] **Step 3: Write the implementation**

```js
// projection/okf/base-profile.mjs
import { indexChannel } from './index-channel.mjs'
import { makeIdentityPolicy } from './identity.mjs'

// The OKF floor: any OKF bundle projects under this. `base` is a placeholder, overridden
// per-pod at deploy (Plan 3 wires the pod's storage IRI authority). No class vocabulary —
// a bare `type:` string maps into skos: by the card extractor's W1 convention.
const context = {
  '@context': {
    dcterms: 'http://purl.org/dc/terms/',
    type: '@type',
    title: { '@id': 'dcterms:title' },
    description: { '@id': 'dcterms:description' },
  },
}

export const baseProfile = {
  application: 'okf-base',
  types: null,
  channels: [indexChannel],
  context,
  identityPolicy: makeIdentityPolicy({ base: 'urn:okf:base/' }),
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd projection && npx vitest run okf/base-profile.test.mjs`
Expected: PASS.

- [ ] **Step 5: Run the full projection suite to check for regressions**

Run: `make test-projection`
Expected: PASS, except known breakage in tests that still call `cardToQuads(md, url, ns)` without a `policy` (e.g. `profiles/wiki-memory/extract.*`). Note any such failures — they are wired in Plan 2 when the wiki-memory profile gains its identity policy. If a failing test is purely a missing 4th arg, add a local `makeIdentityPolicy({base:'https://pod.example/kb/'})` to that test and pass it; do not change extractor behavior here.

- [ ] **Step 6: Commit**

```bash
git add projection/okf/base-profile.mjs projection/okf/base-profile.test.mjs
git commit -m "feat(projection): base profile carries identity policy + minimal context

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Self-Review

**Spec coverage (against §9 Remove/Rebuild rows handled in Plan 1):**
- "Remove location-derived `subjectIri()`" → Task 2. ✓
- "Remove the curly-brace `bodyQuads` extractor" → Task 2 (drop) + Task 3 (lock in). ✓
- "Rebuild: declared subject-IRI minting" → Tasks 1–2. ✓
- "base profile" (the floor, §4/§5) → Task 4. ✓
- Deferred to Plan 2/3 (correctly out of scope here): the full profile mechanism + profiles #1/#2 (Plan 2); provenance, storage description, opt-in `ldp:constrainedBy`, the `make test` acceptance gate (Plan 3).

**Placeholder scan:** no TBD/TODO; every code step shows complete code; the `urn:okf:base/` placeholder base is intentional and labeled (overridden in Plan 3) — not a plan placeholder.

**Type consistency:** `cardToQuads(markdown, cardUrl, ns, policy)` — 4-arg signature used consistently in Tasks 2, 3, 4. `makeIdentityPolicy({base, fragment})` → `.mint(slug)` used in Tasks 1, 2, 4. `subjectIri(frontmatter, cardUrl, policy)` (Task 1) is imported as `mintSubject` in `card.mjs` (Task 2) — names reconciled.

**Known interface ripple (flagged for Plan 2):** `cardToQuads` gained a 4th param. `projection/profiles/wiki-memory/extract.mjs` calls `cardToQuads(markdown, cardUrl, ns)` — Plan 2 gives the wiki-memory profile its identity policy and threads it; Task 4 Step 5 documents the interim.

## Execution Handoff

Plan complete and saved. Two execution options:

1. **Subagent-Driven (recommended)** — a fresh subagent per task, review between tasks, fast iteration.
2. **Inline Execution** — execute tasks in this session via executing-plans, batched with checkpoints.

Which approach?
