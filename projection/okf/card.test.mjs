// projection/okf/card.test.mjs
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

describe('legacy inline Semantic-Markdown (failing — Task 3 removes)', () => {
  it('still extracts inline Semantic-Markdown body annotations and merges them', () => {
    const md = `---
type: Concept
title: X
---
{=<#it> .skos:Concept}
[X]{skos:prefLabel} links to [impl](impl.md){wm:implementedBy}.`
    const q = cardToQuads(md, URL_C, ns, policy)
    const s = 'http://pod/c/progressive-disclosure#it'
    const spanQ = q.find(t => t.predicate.value === 'http://www.w3.org/2004/02/skos/core#prefLabel' && t.object.value === 'X')
    expect(spanQ).toBeDefined()
    expect(spanQ.subject.value).toBe(s)
    expect(q.some(t => t.predicate.value === 'https://w3id.org/cogitarelink/wm#implementedBy' && t.object.value === 'http://pod/c/impl#it')).toBe(true)
  })

  it('frontmatter title and body edge share the same name#it subject', () => {
    const md = `---
type: Concept
title: Progressive Disclosure
---
{=<#it> .skos:Concept}
links to [impl](impl.md){wm:implementedBy}.`
    const q = cardToQuads(md, URL_C, ns, policy)
    const s = 'http://pod/c/progressive-disclosure#it'
    const titleQ = q.find(t => t.predicate.value === 'http://purl.org/dc/terms/title')
    const edgeQ = q.find(t => t.predicate.value === 'https://w3id.org/cogitarelink/wm#implementedBy')
    expect(titleQ).toBeDefined()
    expect(edgeQ).toBeDefined()
    expect(titleQ.subject.value).toBe(s)
    expect(edgeQ.subject.value).toBe(s)
  })
})
