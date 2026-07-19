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

  // True child-override diamond: rt -> [at, bt] equal-depth disagreeing
  // parents, AND rt ITSELF declares its own identity-policy — the override
  // escape hatch (spec §4 P3) must suppress the conflict, no throw.
  const rt = prof('rt', { isProfileOf: [`${PB}/at.jsonld`, `${PB}/bt.jsonld`], hasResource: idRes(`${PB}/rt-identity.jsonld`) })
  const at = prof('at', { hasResource: idRes(`${PB}/at-identity.jsonld`) })
  const bt = prof('bt', { hasResource: idRes(`${PB}/bt-identity.jsonld`) })

  // Reviewer's wrong-depth construction: rd declares isProfileOf [aa, zz,
  // yy] in JSON — but that declared array order does NOT control walk
  // order. jsonldToQuads (rdf.mjs) runs the descriptor through jsonld.js's
  // N-Quads serialization, which sorts same-subject/-predicate quads by
  // object string, so isProfileOf's parents are actually walked in
  // ALPHABETICAL-BY-IRI order regardless of declaration order: aa, then yy,
  // then zz ('aa' < 'yy' < 'zz'). This fixture's names were chosen so that
  // alphabetical order still visits the LONG path (aa->bb->shared, depth 3)
  // before the SHORT path (zz->shared, depth 2) — which is what the test
  // needs to pin the relaxation: aa->bb->shared reaches `shared` at depth 3
  // first; zz->shared reaches it again at its TRUE depth 2. yy->ww puts ww
  // at depth 2 too. `shared` and `ww` disagree on identityPolicy at their
  // true equal depth (2) — MUST throw. A loader that pins `shared`'s depth
  // at its first-seen (longer, 3) value would silently let `ww` (wrongly
  // "nearer" at 2) win instead. (Standalone debt, not fixed here: this
  // N-Quads alphabetization reorders every multi-valued PROF property away
  // from authored order, e.g. hasResource too — recorded in FOLLOWUP.)
  const rd = prof('rd', { isProfileOf: [`${PB}/aa.jsonld`, `${PB}/zz.jsonld`, `${PB}/yy.jsonld`] })
  const aa = prof('aa', { isProfileOf: `${PB}/bb.jsonld` })
  const bb = prof('bb', { isProfileOf: `${PB}/shared.jsonld` })
  const zz = prof('zz', { isProfileOf: `${PB}/shared.jsonld` })
  const yy = prof('yy', { isProfileOf: `${PB}/ww.jsonld` })
  const shared = prof('shared', { hasResource: idRes(`${PB}/shared-identity.jsonld`) })
  const ww = prof('ww', { hasResource: idRes(`${PB}/ww-identity.jsonld`) })

  // planeMapping conflict — the symmetric singleton gets the same treatment.
  const planeRes = (artifact) => [{ '@id': '#pm', hasRole: LWSP_ROLE + 'plane-mapping', hasArtifact: artifact }]
  const rp = prof('rp', { isProfileOf: [`${PB}/ap.jsonld`, `${PB}/bp.jsonld`] })
  const ap = prof('ap', { hasResource: planeRes(`${PB}/ap-plane.jsonld`) })
  const bp = prof('bp', { hasResource: planeRes(`${PB}/bp-plane.jsonld`) })

  const P3B_MAP = {
    [`${PB}/r1.jsonld`]: { body: r1 }, [`${PB}/a1.jsonld`]: { body: a1 }, [`${PB}/b1.jsonld`]: { body: b1 },
    [`${PB}/a1-identity.jsonld`]: { body: { pathPrefix: 'a1/' } },
    [`${PB}/b1-identity.jsonld`]: { body: { pathPrefix: 'b1/' } },
    [`${PB}/r3.jsonld`]: { body: r3 }, [`${PB}/a3.jsonld`]: { body: a3 }, [`${PB}/ga3.jsonld`]: { body: ga3 },
    [`${PB}/a3-identity.jsonld`]: { body: { pathPrefix: 'a3/' } },
    [`${PB}/ga3-identity.jsonld`]: { body: { pathPrefix: 'ga3/' } },
    [`${PB}/rt.jsonld`]: { body: rt }, [`${PB}/at.jsonld`]: { body: at }, [`${PB}/bt.jsonld`]: { body: bt },
    [`${PB}/rt-identity.jsonld`]: { body: { pathPrefix: 'rt/' } },
    [`${PB}/at-identity.jsonld`]: { body: { pathPrefix: 'at/' } },
    [`${PB}/bt-identity.jsonld`]: { body: { pathPrefix: 'bt/' } },
    [`${PB}/rd.jsonld`]: { body: rd }, [`${PB}/aa.jsonld`]: { body: aa }, [`${PB}/bb.jsonld`]: { body: bb },
    [`${PB}/zz.jsonld`]: { body: zz }, [`${PB}/yy.jsonld`]: { body: yy },
    [`${PB}/shared.jsonld`]: { body: shared }, [`${PB}/ww.jsonld`]: { body: ww },
    [`${PB}/shared-identity.jsonld`]: { body: { pathPrefix: 'shared/' } },
    [`${PB}/ww-identity.jsonld`]: { body: { pathPrefix: 'ww/' } },
    [`${PB}/rp.jsonld`]: { body: rp }, [`${PB}/ap.jsonld`]: { body: ap }, [`${PB}/bp.jsonld`]: { body: bp },
    [`${PB}/ap-plane.jsonld`]: { body: { plane: 'a' } },
    [`${PB}/bp-plane.jsonld`]: { body: { plane: 'b' } },
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

  it('P3b: the root\'s own identity-policy overrides two equal-depth disagreeing parents — child override suppresses the conflict', async () => {
    // TRUE diamond-with-override: rt has two equal-depth parents (at/bt) that
    // disagree, AND rt declares its own identityPolicy. Spec §4 P3: a child
    // override suppresses the equal-depth error entirely — no throw, rt wins.
    const p = await loadProfile(`${PB}/rt.jsonld`, { fetchFn: mockFetch(P3B_MAP) })
    expect(p.identityPolicy).toEqual({ pathPrefix: 'rt/' })
  })

  it('P3b: diamond without override — equal-depth parents disagree, root stays silent, still throws naming both', async () => {
    // Same shape as the very first case above (r1), restated explicitly as
    // the negative control for the child-override test just above: no
    // override anywhere in the root means the deferred conflict is never
    // cleared, so it must still surface after the root's own (empty) dispatch.
    await expect(loadProfile(`${PB}/r1.jsonld`, { fetchFn: mockFetch(P3B_MAP) })).rejects.toThrow(/profile merge conflict: 'identityPolicy' from equally-near/)
  })

  it('P3b: diamond relaxation finds the TRUE shortest depth — a shared ancestor first reached via a longer path must not keep the wrong depth', async () => {
    // Without relaxation, `shared` (reached first via aa->bb->shared at depth
    // 3) would keep depth 3, letting `ww` (depth 2) silently "win" as the
    // nearer singleton with NO conflict raised — the wrong, silent outcome.
    // With true-shortest-path relaxation (zz->shared at depth 2 corrects it),
    // `shared` and `ww` are genuinely equal-depth and MUST conflict.
    await expect(loadProfile(`${PB}/rd.jsonld`, { fetchFn: mockFetch(P3B_MAP) })).rejects.toThrow(/profile merge conflict: 'identityPolicy' from equally-near/)
  })

  it('P3b: planeMapping gets the identical equal-depth conflict treatment (symmetric singleton)', async () => {
    await expect(loadProfile(`${PB}/rp.jsonld`, { fetchFn: mockFetch(P3B_MAP) })).rejects.toThrow(/profile merge conflict: 'planeMapping' from equally-near/)
  })

  it('P3b: equal-depth parents whose identity-policy JSON differs only in KEY ORDER do not false-conflict', async () => {
    const keyOrderMap = {
      ...P3B_MAP,
      [`${PB}/a1-identity.jsonld`]: { body: { pathPrefix: 'x/', fragment: '#it' } },
      [`${PB}/b1-identity.jsonld`]: { body: { fragment: '#it', pathPrefix: 'x/' } },   // same object, keys reordered
    }
    const p = await loadProfile(`${PB}/r1.jsonld`, { fetchFn: mockFetch(keyOrderMap) })
    expect(p.identityPolicy).toEqual({ pathPrefix: 'x/', fragment: '#it' })
  })
})
