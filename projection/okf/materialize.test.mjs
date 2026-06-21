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
