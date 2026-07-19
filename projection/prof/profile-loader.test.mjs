import { describe, it, expect } from 'vitest'
import { loadProfile, discoverBinding } from './profile-loader.mjs'
import { mockFetch } from './resolve.test.mjs'
import { readFileSync } from 'fs'

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

  it('dcat-catalog loads end-to-end: walk reaches substrate-floor, identity inherited, roles dispatch', async () => {
    const defs = (rel) => new URL(`../profiles/defs/${rel}`, import.meta.url)
    const readJson = (rel) => JSON.parse(readFileSync(defs(rel), 'utf8'))
    const contextPath = 'profiles-compact.context.jsonld'
    const ctx = readJson(contextPath)['@context']

    // Build the dcat-catalog descriptor with expanded context (like the test MAP pattern)
    const dcatCatalog = {
      '@context': ctx,
      '@id': '',
      '@type': 'Profile',
      hasToken: 'dcat-catalog',
      isProfileOf: `${B}/substrate-floor.jsonld`,
      hasResource: [
        { '@id': '#ctx', hasRole: LWSP_ROLE + 'context', hasArtifact: `${B}/dcat-catalog/context.jsonld` },
        { '@id': '#shape', hasRole: ROLE + 'validation', hasArtifact: `${B}/dcat-catalog/shapes.ttl`, format: 'text/turtle' }
      ]
    }

    const mapWithDcat = {
      ...MAP,
      [`${B}/dcat-catalog/profile.jsonld`]: { body: dcatCatalog },
      [`${B}/dcat-catalog/context.jsonld`]: { body: readJson('dcat-catalog/context.jsonld') },
      [`${B}/dcat-catalog/shapes.ttl`]: { body: readFileSync(defs('dcat-catalog/shapes.ttl'), 'utf8') }
    }

    const p = await loadProfile(`${B}/dcat-catalog/profile.jsonld`, { fetchFn: mockFetch(mapWithDcat) })
    expect(p.token).toBe('dcat-catalog')
    expect(p.validation.some((v) => v.endsWith('dcat-catalog/shapes.ttl'))).toBe(true)
    expect(p.identityPolicy).toEqual({ fragment: '#it' })
    expect(p.conformance.some((c) => c.iri.endsWith('substrate-floor.jsonld') && c.resolved)).toBe(true)
  })
})

describe('derived-view role', () => {
  it('surfaces lwspr:derived-view artifacts on loadProfile().derivedViews', async () => {
    // Minimal in-memory pod: a descriptor declaring one derived-view resource.
    const docs = {
      'https://pod.example/p/profile.jsonld': {
        '@context': { prof: 'http://www.w3.org/ns/dx/prof/', dct: 'http://purl.org/dc/terms/',
          isProfileOf: { '@id': 'prof:isProfileOf', '@type': '@id' }, hasToken: 'prof:hasToken',
          hasResource: 'prof:hasResource', hasRole: { '@id': 'prof:hasRole', '@type': '@id' },
          hasArtifact: { '@id': 'prof:hasArtifact', '@type': '@id' } },
        '@id': 'https://pod.example/p/profile.jsonld', '@type': 'prof:Profile', hasToken: 'ex',
        hasResource: [{ '@id': '#view', hasRole: 'https://w3id.org/lws-pod/profile/role/derived-view',
          hasArtifact: 'https://pod.example/p/derived-view.jsonld' }],
      },
      'https://pod.example/p/derived-view.jsonld': { named_graph: 'view.jsonld', push_mode: 'replace', mode: 'union' },
    }
    const fetchFn = async (url) => ({ ok: true, json: async () => docs[url.split('#')[0]] })
    const p = await loadProfile('https://pod.example/p/profile.jsonld', { fetchFn })
    expect(p.derivedViews).toEqual([{ named_graph: 'view.jsonld', push_mode: 'replace', mode: 'union' }])
  })
})

describe('representation role', () => {
  it('dispatches lwspr:representation — config fetched, conformsTo resolved vs the artifact URL', async () => {
    // Minimal in-memory pod: a descriptor declaring one representation resource.
    const docs = {
      'https://p.example/fam/profile.jsonld': {
        '@context': { prof: 'http://www.w3.org/ns/dx/prof/', dct: 'http://purl.org/dc/terms/',
          isProfileOf: { '@id': 'prof:isProfileOf', '@type': '@id' }, hasToken: 'prof:hasToken',
          hasResource: 'prof:hasResource', hasRole: { '@id': 'prof:hasRole', '@type': '@id' },
          hasArtifact: { '@id': 'prof:hasArtifact', '@type': '@id' }, format: 'dct:format' },
        '@id': 'https://p.example/fam/profile.jsonld', '@type': 'prof:Profile', hasToken: 'fam',
        hasResource: [{ '@id': '#rep', hasRole: 'https://w3id.org/lws-pod/profile/role/representation',
          hasArtifact: 'links.rep.jsonld', format: 'application/ld+json' }],
      },
      'https://p.example/fam/links.rep.jsonld': {
        id: 'links', suffix: '.links.jsonld', format: 'application/ld+json', conformsTo: 'profile.jsonld' },
    }
    const fetchFn = async (url) => ({ ok: true, json: async () => docs[url.split('#')[0]] })
    const loaded = await loadProfile('https://p.example/fam/profile.jsonld', { fetchFn })
    expect(loaded.representations).toHaveLength(1)
    expect(loaded.representations[0].id).toBe('links')
    expect(loaded.representations[0].conformsTo).toBe('https://p.example/fam/profile.jsonld')
  })

  it('resolves conformsTo against the ARTIFACT URL, not the descriptor URL (nested artifact)', async () => {
    // Artifact nested a directory below the descriptor: the two bases diverge, so
    // descriptor-relative resolution would give fam/nested.jsonld — a regression this catches.
    const docs = {
      'https://p.example/fam/profile.jsonld': {
        '@context': { prof: 'http://www.w3.org/ns/dx/prof/', dct: 'http://purl.org/dc/terms/',
          isProfileOf: { '@id': 'prof:isProfileOf', '@type': '@id' }, hasToken: 'prof:hasToken',
          hasResource: 'prof:hasResource', hasRole: { '@id': 'prof:hasRole', '@type': '@id' },
          hasArtifact: { '@id': 'prof:hasArtifact', '@type': '@id' }, format: 'dct:format' },
        '@id': 'https://p.example/fam/profile.jsonld', '@type': 'prof:Profile', hasToken: 'fam',
        hasResource: [{ '@id': '#rep', hasRole: 'https://w3id.org/lws-pod/profile/role/representation',
          hasArtifact: 'sub/links.rep.jsonld', format: 'application/ld+json' }],
      },
      'https://p.example/fam/sub/links.rep.jsonld': {
        id: 'links', suffix: '.links.jsonld', format: 'application/ld+json', conformsTo: 'nested.jsonld' },
    }
    const fetchFn = async (url) => ({ ok: true, json: async () => docs[url.split('#')[0]] })
    const loaded = await loadProfile('https://p.example/fam/profile.jsonld', { fetchFn })
    expect(loaded.representations).toHaveLength(1)
    expect(loaded.representations[0].conformsTo).toBe('https://p.example/fam/sub/nested.jsonld')
  })
})

describe('discoverBinding', () => {
  const META = { '@context': { dct: 'http://purl.org/dc/terms/' }, '@id': '',
    'dct:conformsTo': { '@id': `${B}/llm-wiki/profile.jsonld` } }
  it('own .meta wins', async () => {
    const f = mockFetch({ 'https://pod.example/alice/notes/x.md.meta': { body: META } })
    expect(await discoverBinding('https://pod.example/alice/notes/x.md', { fetchFn: f }))
      .toEqual([`${B}/llm-wiki/profile.jsonld`])
  })
  it('falls back to the container .meta via URL up-walk', async () => {
    const f = mockFetch({ 'https://pod.example/alice/notes/.meta': { body: META } })
    expect(await discoverBinding('https://pod.example/alice/notes/x.md', { fetchFn: f }))
      .toEqual([`${B}/llm-wiki/profile.jsonld`])
  })
  it('falls back to the index default, else empty array', async () => {
    const f = mockFetch({ 'https://pod.example/profiles/index.jsonld': { body: { profiles: [], defaultProfile: `${B}/okf-base.jsonld` } } })
    expect(await discoverBinding('https://pod.example/alice/notes/x.md', { fetchFn: f, indexUrl: 'https://pod.example/profiles/index.jsonld' }))
      .toEqual([`${B}/okf-base.jsonld`])
    expect(await discoverBinding('https://pod.example/alice/notes/x.md', { fetchFn: mockFetch({}) })).toEqual([])
  })
  it('index fallback without a defaultProfile yields [], never [undefined]', async () => {
    const fetchFn = async (url) => url.endsWith('index.jsonld')
      ? ({ ok: true, text: async () => JSON.stringify({ profiles: ['a.jsonld'] }) })
      : ({ ok: false })
    const out = await discoverBinding('https://pod.example/c/x', { fetchFn, indexUrl: 'https://pod.example/p/index.jsonld' })
    expect(out).toEqual([])
  })
  it('discoverBinding returns EVERY conformsTo target at the winning level (plural, B6)', async () => {
    const meta = JSON.stringify({
      '@context': { dct: 'http://purl.org/dc/terms/' },
      '@id': '',
      'dct:conformsTo': [{ '@id': 'https://pod.example/p/a.jsonld' }, { '@id': 'https://pod.example/p/b.jsonld' }],
    })
    const fetchFn = async (url) => url.endsWith('/x.meta')
      ? { ok: true, text: async () => meta, headers: {} }
      : { ok: false, headers: {} }
    const out = await discoverBinding('https://pod.example/c/x', { fetchFn })
    expect(out.sort()).toEqual(['https://pod.example/p/a.jsonld', 'https://pod.example/p/b.jsonld'])
  })

  // Task-10 finding (navigator round, live gate): a bound container's .meta
  // ALSO carries `altr:hasRepresentation` entries once instantiate() has
  // materialized container-level alternates (conneg-by-profile Phase 2) —
  // each entry is its own JSON-LD node (explicit @id = the represented
  // resource's URL) with its OWN dct:conformsTo (which profile that FACE
  // conforms to — unrelated to what the container is BOUND to). An
  // unscoped predicate-only filter swept those in too, turning a single
  // binding into a duplicated, wrong array.
  it('ignores dct:conformsTo on altr:hasRepresentation entries (own node only, not every node in the doc)', async () => {
    const meta = JSON.stringify({
      '@context': { dct: 'http://purl.org/dc/terms/', altr: 'http://www.w3.org/ns/dx/connegp/altr#' },
      '@id': '',
      'dct:conformsTo': { '@id': `${B}/llm-wiki/profile.jsonld` },
      'altr:hasRepresentation': [
        { '@id': 'https://pod.example/c/graph.jsonld', 'dct:conformsTo': { '@id': `${B}/llm-wiki/profile.jsonld` } },
        { '@id': 'https://pod.example/c/index.html', 'dct:conformsTo': { '@id': `${B}/okf-base.jsonld` } },
      ],
    })
    const fetchFn = async (url) => url.endsWith('/x.meta')
      ? { ok: true, text: async () => meta, headers: {} }
      : { ok: false, headers: {} }
    const out = await discoverBinding('https://pod.example/c/x', { fetchFn })
    expect(out).toEqual([`${B}/llm-wiki/profile.jsonld`])
  })
})

describe('loadProfile — P3b singleton nearest-wins / conflict rule (spec 2026-07-19 §4)', () => {
  // Separate namespace from the wiki/dcat fixtures above — small, purpose-built
  // descriptors isolating the identityPolicy singleton-merge behavior.
  const PB = 'https://pod.example/p3b'
  const idRes = (artifact) => [{ '@id': '#i', hasRole: LWSP_ROLE + 'identity-policy', hasArtifact: artifact }]
  const prof = (token, extra = {}) => ({ '@context': CTX, '@id': '', '@type': 'Profile', hasToken: token, ...extra })

  // Diamond: r1 -> [a1, b1], a1/b1 each declare identity-policy (different bodies).
  const r1 = prof('r1', { isProfileOf: [`${PB}/a1.jsonld`, `${PB}/b1.jsonld`] })
  const a1 = prof('a1', { hasResource: idRes(`${PB}/a1-identity.jsonld`) })
  const b1 = prof('b1', { hasResource: idRes(`${PB}/b1-identity.jsonld`) })

  // Chain: r3 -> a3 -> ga3, a3 and ga3 both declare identity-policy (different bodies).
  const r3 = prof('r3', { isProfileOf: `${PB}/a3.jsonld` })
  const a3 = prof('a3', { isProfileOf: `${PB}/ga3.jsonld`, hasResource: idRes(`${PB}/a3-identity.jsonld`) })
  const ga3 = prof('ga3', { hasResource: idRes(`${PB}/ga3-identity.jsonld`) })

  // Chain: r4 -> a4 -> ga4; ALL THREE declare identity-policy (all different bodies) —
  // r4's own (depth 0) must win over both ancestors, no conflict raised.
  const r4 = prof('r4', { isProfileOf: `${PB}/a4.jsonld`, hasResource: idRes(`${PB}/r4-identity.jsonld`) })
  const a4 = prof('a4', { isProfileOf: `${PB}/ga4.jsonld`, hasResource: idRes(`${PB}/a4-identity.jsonld`) })
  const ga4 = prof('ga4', { hasResource: idRes(`${PB}/ga4-identity.jsonld`) })

  const P3B_MAP = {
    [`${PB}/r1.jsonld`]: { body: r1 }, [`${PB}/a1.jsonld`]: { body: a1 }, [`${PB}/b1.jsonld`]: { body: b1 },
    [`${PB}/a1-identity.jsonld`]: { body: { pathPrefix: 'a1/' } },
    [`${PB}/b1-identity.jsonld`]: { body: { pathPrefix: 'b1/' } },
    [`${PB}/r3.jsonld`]: { body: r3 }, [`${PB}/a3.jsonld`]: { body: a3 }, [`${PB}/ga3.jsonld`]: { body: ga3 },
    [`${PB}/a3-identity.jsonld`]: { body: { pathPrefix: 'a3/' } },
    [`${PB}/ga3-identity.jsonld`]: { body: { pathPrefix: 'ga3/' } },
    [`${PB}/r4.jsonld`]: { body: r4 }, [`${PB}/a4.jsonld`]: { body: a4 }, [`${PB}/ga4.jsonld`]: { body: ga4 },
    [`${PB}/r4-identity.jsonld`]: { body: { pathPrefix: 'r4/' } },
    [`${PB}/a4-identity.jsonld`]: { body: { pathPrefix: 'a4/' } },
    [`${PB}/ga4-identity.jsonld`]: { body: { pathPrefix: 'ga4/' } },
  }

  it('P3b: equal-depth parents disagreeing on identityPolicy throw a named conflict', async () => {
    await expect(loadProfile(`${PB}/r1.jsonld`, { fetchFn: mockFetch(P3B_MAP) })).rejects.toThrow(/profile merge conflict: 'identityPolicy'/)
  })

  it('P3b: equal-depth parents AGREEING (identical JSON) do not throw', async () => {
    const agreeing = { ...P3B_MAP, [`${PB}/b1-identity.jsonld`]: { body: { pathPrefix: 'a1/' } } }
    const p = await loadProfile(`${PB}/r1.jsonld`, { fetchFn: mockFetch(agreeing) })
    expect(p.identityPolicy).toEqual({ pathPrefix: 'a1/' })
  })

  it('P3b: nearer parent beats a farther ancestor regardless of walk order', async () => {
    // today this already holds for chains (the DAG case above was the bug) — pin it.
    const p = await loadProfile(`${PB}/r3.jsonld`, { fetchFn: mockFetch(P3B_MAP) })
    expect(p.identityPolicy).toEqual({ pathPrefix: 'a3/' })
  })

  it('P3b: the root profile itself (depth 0) overrides every parent without conflict', async () => {
    const p = await loadProfile(`${PB}/r4.jsonld`, { fetchFn: mockFetch(P3B_MAP) })
    expect(p.identityPolicy).toEqual({ pathPrefix: 'r4/' })
  })
})
