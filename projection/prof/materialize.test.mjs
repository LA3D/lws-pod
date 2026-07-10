import { describe, it, expect } from 'vitest'
import { DataFactory } from 'n3'
import { materializeInverses } from './materialize.mjs'
const { namedNode, quad } = DataFactory

// Self-contained fixture — materialize.mjs is the neutral floor and must not
// depend on any app-specific profile fixture (wiki-memory was deleted L4b).
const edges = `
@prefix wm:   <https://w3id.org/cogitarelink/wm#> .
@prefix rdf:  <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
@prefix owl:  <http://www.w3.org/2002/07/owl#> .

wm:implementedBy a rdf:Property ;
    rdfs:label "implemented by" ;
    rdfs:domain wm:Concept ;
    rdfs:range wm:Implementation ;
    owl:inverseOf wm:implements .

wm:implements a rdf:Property ;
    rdfs:label "implements" ;
    owl:inverseOf wm:implementedBy ;
    rdfs:comment "Materialized by the projection; not authored in frontmatter." .
`

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
