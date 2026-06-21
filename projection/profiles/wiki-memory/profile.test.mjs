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
