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
