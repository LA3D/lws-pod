import { describe, it, expect } from 'vitest'
import { loadProfile, discoverBinding } from './profile-loader.mjs'
import { mockFetch } from './resolve.test.mjs'

const B = 'https://pod.example/profiles'
const ROLE = 'http://www.w3.org/ns/dx/prof/role/'
const LWSP_ROLE = 'https://w3id.org/lws-pod/profile/role/'
const CTX = {
  prof: 'http://www.w3.org/ns/dx/prof/', dct: 'http://purl.org/dc/terms/',
  Profile: 'prof:Profile', isProfileOf: { '@id': 'prof:isProfileOf', '@type': '@id' },
  hasToken: 'prof:hasToken', hasResource: { '@id': 'prof:hasResource', '@type': '@id' },
  hasRole: { '@id': 'prof:hasRole', '@type': '@id' }, hasArtifact: { '@id': 'prof:hasArtifact', '@type': '@id' },
  format: 'dct:format',
}
const floor = { '@context': CTX, '@id': '', '@type': 'Profile', hasToken: 'substrate-floor',
  hasResource: [{ '@id': '#i', hasRole: LWSP_ROLE + 'identity-policy', hasArtifact: `${B}/floor-identity.jsonld` }] }
const okfBase = { '@context': CTX, '@id': '', '@type': 'Profile', hasToken: 'okf-base',
  isProfileOf: `${B}/substrate-floor.jsonld`,
  hasResource: [
    { '@id': '#v', hasRole: ROLE + 'validation', hasArtifact: `${B}/okf-base.shape.ttl`, format: 'text/turtle' },
    { '@id': '#c', hasRole: LWSP_ROLE + 'context', hasArtifact: `${B}/okf-base.context.jsonld` },
  ] }
const llmWiki = { '@context': CTX, '@id': '', '@type': 'Profile', hasToken: 'llm-wiki',
  isProfileOf: `${B}/okf-base.jsonld`,
  hasResource: [
    { '@id': '#v', hasRole: ROLE + 'validation', hasArtifact: `${B}/llm-wiki/shapes.ttl`, format: 'text/turtle' },
    { '@id': '#c', hasRole: LWSP_ROLE + 'context', hasArtifact: `${B}/llm-wiki/context.jsonld` },
    { '@id': '#i', hasRole: LWSP_ROLE + 'identity-policy', hasArtifact: `${B}/llm-wiki/identity.jsonld` },
  ] }
// RO-Crate stub: canonical external parent + our floor (spec §2, acceptance #7).
const roCrate = { '@context': CTX, '@id': '', '@type': 'Profile', hasToken: 'ro-crate',
  isProfileOf: ['https://w3id.org/ro/crate/1.2', `${B}/substrate-floor.jsonld`],
  hasResource: [{ '@id': '#c', hasRole: LWSP_ROLE + 'context', hasArtifact: `${B}/ro-crate/context.jsonld` }] }

const MAP = {
  [`${B}/substrate-floor.jsonld`]: { body: floor },
  [`${B}/okf-base.jsonld`]: { body: okfBase },
  [`${B}/llm-wiki/profile.jsonld`]: { body: llmWiki },
  [`${B}/ro-crate/profile.jsonld`]: { body: roCrate },
  [`${B}/floor-identity.jsonld`]: { body: { fragment: '#it' } },
  [`${B}/okf-base.context.jsonld`]: { body: { '@context': { type: '@type' } } },
  [`${B}/llm-wiki/context.jsonld`]: { body: { '@context': { wm: 'https://example.org/wm#' } } },
  [`${B}/llm-wiki/identity.jsonld`]: { body: { pathPrefix: 'id/', fragment: '#it' } },
  [`${B}/ro-crate/context.jsonld`]: { body: { '@context': {} } },
  'https://w3id.org/ro/crate/1.2': { body: { '@context': { schema: 'https://schema.org/' }, '@id': '', 'schema:name': 'RO-Crate 1.2 spec page' } },
}

describe('loadProfile', () => {
  it('walks isProfileOf and merges per spec §6', async () => {
    const p = await loadProfile(`${B}/llm-wiki/profile.jsonld`, { fetchFn: mockFetch(MAP) })
    expect(p.token).toBe('llm-wiki')
    expect(p.validation).toEqual([`${B}/okf-base.shape.ttl`, `${B}/llm-wiki/shapes.ttl`])   // union, parents first
    expect(p.contexts.map((c) => JSON.stringify(c))).toEqual([                               // base-first stack
      JSON.stringify({ '@context': { type: '@type' } }),
      JSON.stringify({ '@context': { wm: 'https://example.org/wm#' } }),
    ])
    expect(p.identityPolicy).toEqual({ pathPrefix: 'id/', fragment: '#it' })                 // nearest wins over floor's
    expect(p.conformance.map((c) => c.iri)).toContain(`${B}/substrate-floor.jsonld`)
  })

  it('treats a non-resolvable parent as opaque conformance, not an error (RO-Crate stub)', async () => {
    const mapWithout404 = { ...MAP }
    delete mapWithout404['https://w3id.org/ro/crate/1.2']
    const p = await loadProfile(`${B}/ro-crate/profile.jsonld`, { fetchFn: mockFetch(mapWithout404) })
    const ext = p.conformance.find((c) => c.iri === 'https://w3id.org/ro/crate/1.2')
    expect(ext).toEqual({ iri: 'https://w3id.org/ro/crate/1.2', resolved: false })
    const fl = p.conformance.find((c) => c.iri === `${B}/substrate-floor.jsonld`)
    expect(fl.resolved).toBe(true)
    expect(p.identityPolicy).toEqual({ fragment: '#it' })   // inherited from the resolved floor
  })

  it('a fetchable non-PROF parent (real doc, zero PROF triples) is opaque too', async () => {
    const p = await loadProfile(`${B}/ro-crate/profile.jsonld`, { fetchFn: mockFetch(MAP) })
    const ext = p.conformance.find((c) => c.iri === 'https://w3id.org/ro/crate/1.2')
    expect(ext).toEqual({ iri: 'https://w3id.org/ro/crate/1.2', resolved: false })
    expect(p.identityPolicy).toEqual({ fragment: '#it' })   // floor still contributes
  })

  it('guards against isProfileOf cycles', async () => {
    const a = { '@context': CTX, '@id': '', '@type': 'Profile', isProfileOf: `${B}/b.jsonld`, hasResource: [] }
    const b = { '@context': CTX, '@id': '', '@type': 'Profile', isProfileOf: `${B}/a.jsonld`, hasResource: [] }
    const p = await loadProfile(`${B}/a.jsonld`, { fetchFn: mockFetch({ [`${B}/a.jsonld`]: { body: a }, [`${B}/b.jsonld`]: { body: b } }) })
    expect(p.id).toBe(`${B}/a.jsonld`)   // terminates
  })
})

describe('discoverBinding', () => {
  const META = { '@context': { dct: 'http://purl.org/dc/terms/' }, '@id': '',
    'dct:conformsTo': { '@id': `${B}/llm-wiki/profile.jsonld` } }
  it('own .meta wins', async () => {
    const f = mockFetch({ 'https://pod.example/alice/notes/x.md.meta': { body: META } })
    expect(await discoverBinding('https://pod.example/alice/notes/x.md', { fetchFn: f }))
      .toBe(`${B}/llm-wiki/profile.jsonld`)
  })
  it('falls back to the container .meta via URL up-walk', async () => {
    const f = mockFetch({ 'https://pod.example/alice/notes/.meta': { body: META } })
    expect(await discoverBinding('https://pod.example/alice/notes/x.md', { fetchFn: f }))
      .toBe(`${B}/llm-wiki/profile.jsonld`)
  })
  it('falls back to the index default, else null', async () => {
    const f = mockFetch({ 'https://pod.example/profiles/index.jsonld': { body: { profiles: [], defaultProfile: `${B}/okf-base.jsonld` } } })
    expect(await discoverBinding('https://pod.example/alice/notes/x.md', { fetchFn: f, indexUrl: 'https://pod.example/profiles/index.jsonld' }))
      .toBe(`${B}/okf-base.jsonld`)
    expect(await discoverBinding('https://pod.example/alice/notes/x.md', { fetchFn: mockFetch({}) })).toBeNull()
  })
})
