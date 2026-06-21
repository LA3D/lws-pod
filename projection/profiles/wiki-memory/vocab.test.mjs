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
