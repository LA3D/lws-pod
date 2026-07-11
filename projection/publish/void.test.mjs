import { describe, it, expect } from 'vitest'
import { buildVoid, checkVoid } from './void.mjs'

const manifest = {
  void: {
    rootResource: '/alice/',
    uriSpace: 'id/',
    vocabularies: [
      { namespace: 'https://la3d.github.io/llm-wiki-colab/ontology#', dataDump: 'llm-wiki/ontology.ttl' },
      { namespace: 'https://w3id.org/lws-pod/profile#', dataDump: 'lwsp.ttl' },
    ],
    declaredExternal: ['http://www.w3.org/ns/dcat#', 'http://purl.org/dc/terms/'],
    subsets: [
      { name: 'wiki-memory', conformsTo: 'llm-wiki/profile.jsonld', rootResource: '/alice/wiki/' },
      { name: 'data-catalog', conformsTo: 'dcat-catalog/profile.jsonld', rootResource: '/alice/datasets/' },
    ],
  },
  profiles: ['llm-wiki/profile.jsonld', 'dcat-catalog/profile.jsonld'],
}
const OPTS = { root: 'https://pod.example/alice/profiles/', base: 'https://pod.example' }

describe('buildVoid', () => {
  it('builds a void:Dataset with absolute rootResource + uriSpace', () => {
    const d = buildVoid(manifest, OPTS)
    expect(d['@type']).toBe('void:Dataset')
    expect(d['void:rootResource']['@id']).toBe('https://pod.example/alice/')
    expect(d['void:uriSpace']).toBe('https://pod.example/id/')
  })
  it('every dataDump-declaring vocabulary is a described node with a pod-served dataDump', () => {
    const d = buildVoid(manifest, OPTS)
    const dumped = d['void:vocabulary'].filter(v => v['void:dataDump'])
    expect(dumped.map(v => v['@id']).sort()).toEqual([
      'https://la3d.github.io/llm-wiki-colab/ontology#',
      'https://w3id.org/lws-pod/profile#',
    ])
    for (const v of dumped)
      expect(v['void:dataDump']['@id']).toMatch(/^https:\/\/pod\.example\/alice\/profiles\//)
  })
  it('declaredExternal vocabularies appear as bare IRIs, no dataDump', () => {
    const d = buildVoid(manifest, OPTS)
    const ext = d['void:vocabulary'].filter(v => !v['void:dataDump'])
    expect(ext.map(v => v['@id'])).toContain('http://www.w3.org/ns/dcat#')
  })
  it('one subset per family with dcterms:conformsTo → descriptor URL', () => {
    const d = buildVoid(manifest, OPTS)
    expect(d['void:subset']).toHaveLength(2)
    expect(d['void:subset'][0]['dcterms:conformsTo']['@id'])
      .toBe('https://pod.example/alice/profiles/llm-wiki/profile.jsonld')
  })
})

describe('checkVoid — the deref rail', () => {
  const allExist = () => true
  it('passes the curated manifest', () => {
    expect(checkVoid(manifest, allExist)).toEqual([])
  })
  it('FAILS a declared vocabulary whose dataDump is not in the defs tree', () => {
    const bad = structuredClone(manifest)
    bad.void.vocabularies.push({ namespace: 'https://ex.org/ns#', dataDump: 'nope.ttl' })
    const fails = checkVoid(bad, (rel) => rel !== 'nope.ttl')
    expect(fails.some(f => f.includes('nope.ttl'))).toBe(true)
  })
  it('FAILS a subset whose conformsTo is not a manifest profile', () => {
    const bad = structuredClone(manifest)
    bad.void.subsets.push({ name: 'x', conformsTo: 'ghost/profile.jsonld', rootResource: '/x/' })
    expect(checkVoid(bad, allExist).some(f => f.includes('ghost'))).toBe(true)
  })
  it('FAILS a vocabulary listed both as dumped and declaredExternal (contradiction)', () => {
    const bad = structuredClone(manifest)
    bad.void.declaredExternal.push('https://w3id.org/lws-pod/profile#')
    expect(checkVoid(bad, allExist).length).toBeGreaterThan(0)
  })
  it('no void config → no failures (void is optional)', () => {
    expect(checkVoid({ profiles: [] }, allExist)).toEqual([])
  })
})
