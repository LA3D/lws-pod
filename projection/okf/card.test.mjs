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
    const s = 'http://pod/c/progressive-disclosure.md#it'
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
    const s = 'http://pod/c/progressive-disclosure.md#it'
    expect(q.some(t => t.predicate.value === 'http://www.w3.org/2004/02/skos/core#prefLabel' && t.object.value === 'X')).toBe(true)
    expect(q.some(t => t.predicate.value === 'https://w3id.org/cogitarelink/wm#implementedBy' && t.object.value === 'http://pod/c/impl#it')).toBe(true)
  })

  it('frontmatter title and body edge share the same name.md#it subject', () => {
    const md = `---
type: Concept
title: Progressive Disclosure
---
{=<#it> .skos:Concept}
links to [impl](impl.md){wm:implementedBy}.`
    const q = cardToQuads(md, URL_C, ns)
    const s = 'http://pod/c/progressive-disclosure.md#it'
    const titleQ = q.find(t => t.predicate.value === 'http://purl.org/dc/terms/title')
    const edgeQ = q.find(t => t.predicate.value === 'https://w3id.org/cogitarelink/wm#implementedBy')
    expect(titleQ).toBeDefined()
    expect(edgeQ).toBeDefined()
    expect(titleQ.subject.value).toBe(s)
    expect(edgeQ.subject.value).toBe(s)
  })
})
