// projection/okf/card.test.mjs
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { loadNamespaces } from '../prof/namespaces.mjs'
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
    const { quads: q } = cardToQuads(md, URL_C, ns, policy)
    const s = 'https://pod.example/kb/progressive-disclosure#it'
    const has = (p, o) => q.some(t => t.subject.value === s && t.predicate.value === p && t.object.value === o)
    // Plan-2 LANDED: type resolution goes through the profile context (term alias
    // -> resolveCurie -> @vocab proto mint) — the 'skos:' engine-vocabulary hardcode
    // is dead. This fixture context (wiki-memory's, loaded directly, not through the
    // engine-profile stacker) has no @vocab and no 'Concept' alias, so the bare
    // type: value passes through UNRESOLVED — 'Concept', not a skos: IRI.
    expect(has('http://www.w3.org/1999/02/22-rdf-syntax-ns#type', 'Concept')).toBe(true)
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
    const { quads: q } = cardToQuads(md, URL_C, ns, policy)
    expect(q.some(t => t.subject.value === 'https://w3id.org/thing/42'
      && t.predicate.value === 'http://purl.org/dc/terms/title')).toBe(true)
  })
})

describe('guard: inline Semantic-Markdown dropped', () => {
  it('does NOT extract inline curly-brace Semantic-Markdown from the body (dropped 2026-06-25)', () => {
    const md = `---
type: Concept
title: X
---
{=<#it> .skos:Concept}
[X]{skos:prefLabel} links to [impl](impl.md){wm:implementedBy}.`
    const { quads: q } = cardToQuads(md, URL_C, ns, policy)
    expect(q.some(t => t.predicate.value === 'http://www.w3.org/2004/02/skos/core#prefLabel')).toBe(false)
    // the plain markdown link is NOT a typed edge anymore; only frontmatter edges project
    expect(q.some(t => t.predicate.value === 'https://w3id.org/cogitarelink/wm#implementedBy')).toBe(false)
  })
})
