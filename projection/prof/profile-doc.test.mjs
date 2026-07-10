import { describe, it, expect } from 'vitest'
import { descriptorToProfile } from './profile-doc.mjs'

const DESCRIPTOR = {
  '@context': {
    prof: 'http://www.w3.org/ns/dx/prof/', dct: 'http://purl.org/dc/terms/',
    Profile: 'prof:Profile', isProfileOf: { '@id': 'prof:isProfileOf', '@type': '@id' },
    hasToken: 'prof:hasToken',
    hasResource: { '@id': 'prof:hasResource', '@type': '@id' },
    hasRole: { '@id': 'prof:hasRole', '@type': '@id' },
    hasArtifact: { '@id': 'prof:hasArtifact', '@type': '@id' },
    format: 'dct:format', source: { '@id': 'dct:source', '@type': '@id' }, version: 'dct:hasVersion',
  },
  '@id': '', '@type': 'Profile', hasToken: 'llm-wiki',
  isProfileOf: 'https://pod.example/profiles/okf-base.jsonld',
  hasResource: [
    { '@id': '#r1', hasRole: 'http://www.w3.org/ns/dx/prof/role/validation',
      hasArtifact: 'https://pod.example/profiles/llm-wiki/shapes.ttl', format: 'text/turtle',
      source: 'https://la3d.github.io/llm-wiki-colab/shapes.ttl', version: 'pin-1' },
    { '@id': '#r2', hasRole: 'https://w3id.org/lws-pod/profile/role/context',
      hasArtifact: 'https://pod.example/profiles/llm-wiki/context.jsonld', format: 'application/ld+json' },
  ],
}

describe('descriptorToProfile', () => {
  it('reads PROF terms at the graph level', async () => {
    const d = await descriptorToProfile(DESCRIPTOR, 'https://pod.example/profiles/llm-wiki/profile.jsonld')
    expect(d.id).toBe('https://pod.example/profiles/llm-wiki/profile.jsonld')
    expect(d.token).toBe('llm-wiki')
    expect(d.parents).toEqual(['https://pod.example/profiles/okf-base.jsonld'])
    const val = d.resources.find((r) => r.roles.includes('http://www.w3.org/ns/dx/prof/role/validation'))
    expect(val.artifact).toBe('https://pod.example/profiles/llm-wiki/shapes.ttl')
    expect(val.source).toBe('https://la3d.github.io/llm-wiki-colab/shapes.ttl')
    expect(val.version).toBe('pin-1')
    const ctx = d.resources.find((r) => r.roles.includes('https://w3id.org/lws-pod/profile/role/context'))
    expect(ctx.format).toBe('application/ld+json')
  })

  it('descriptor with no parents and unknown roles is preserved', async () => {
    const doc = { ...DESCRIPTOR, isProfileOf: undefined,
      hasResource: [{ '@id': '#r', hasRole: 'https://example.org/role/weird', hasArtifact: 'https://x/a' }] }
    const d = await descriptorToProfile(doc, 'https://pod.example/profiles/floor.jsonld')
    expect(d.parents).toEqual([])
    expect(d.resources[0].roles).toEqual(['https://example.org/role/weird'])
  })
})
