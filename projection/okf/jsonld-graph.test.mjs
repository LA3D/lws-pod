import { describe, it, expect } from 'vitest'
import { DataFactory } from 'n3'
import { quadsToNamedGraph, quadsToDataset } from './jsonld-graph.mjs'
const { namedNode, literal, quad } = DataFactory

const CTX = { rdfs: 'http://www.w3.org/2000/01/rdf-schema#', label: { '@id': 'rdfs:label' }, type: '@type' }
const S = 'https://authority.example/kb/foo#it'
const qs = [
  quad(namedNode(S), namedNode('http://www.w3.org/1999/02/22-rdf-syntax-ns#type'), namedNode('https://example.org/ns#Thing')),
  quad(namedNode(S), namedNode('http://www.w3.org/2000/01/rdf-schema#label'), literal('Foo')),
]

describe('quadsToNamedGraph', () => {
  it('wraps quads as one named graph, name = supplied graphName (not the subject)', async () => {
    const g = await quadsToNamedGraph(qs, { graphName: 'https://authority.example/kb/foo', context: CTX })
    expect(g['@id']).toBe('https://authority.example/kb/foo')          // graph name
    expect(Array.isArray(g['@graph'])).toBe(true)
    const node = g['@graph'].find(n => n['@id'] === S)                  // subject distinct from graph name
    expect(node).toBeTruthy()
    expect(node.label).toBe('Foo')
    expect(g['@context']).toEqual(CTX)
  })
  it('ignores the quad graph component (name comes from the caller)', async () => {
    const placed = qs.map(q => quad(q.subject, q.predicate, q.object, namedNode('urn:ignore')))
    const g = await quadsToNamedGraph(placed, { graphName: 'urn:g', context: CTX })
    expect(g['@id']).toBe('urn:g')
    expect(g['@graph'].find(n => n['@id'] === S)).toBeTruthy()
  })
})

describe('quadsToDataset', () => {
  it('emits one graph object per source graph name', async () => {
    const ds = await quadsToDataset({ 'https://a.example/1': qs, 'https://a.example/2': qs }, { context: CTX })
    expect(ds['@graph'].map(g => g['@id']).sort()).toEqual(['https://a.example/1', 'https://a.example/2'])
    for (const g of ds['@graph']) expect(g['@graph'].find(n => n['@id'] === S)).toBeTruthy()
  })
})
