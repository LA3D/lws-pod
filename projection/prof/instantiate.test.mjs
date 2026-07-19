import { describe, it, expect } from 'vitest'
import { instantiate, mergeContexts } from './instantiate.mjs'

const C = 'https://pod.example/alice/wiki/'
const TTL = `<${C}> <http://www.w3.org/ns/ldp#contains> <${C}a.md>, <${C}b.md>, <${C}index.md>, <${C}sub/> .`

function podMock(extra = {}) {
  const store = new Map(Object.entries({
    [C]: { body: TTL, ct: 'text/turtle' },
    [`${C}a.md`]: { body: '---\ntitle: A\n---\nalpha', ct: 'text/markdown' },
    [`${C}b.md`]: { body: '---\ntitle: B\n---\nbeta', ct: 'text/markdown' },
    [`${C}index.md`]: { body: 'old index', ct: 'text/markdown' },
    ...extra,
  }))
  const fetchFn = async (url, init = {}) => {
    // Simulates the fork's write_acl MCP tool (bypasses SHACL admission by
    // design — see instantiate.mjs's mirrorAcl docstring): builds an ACL doc
    // with accessTo computed from the target path (same as the real tool),
    // stores it at `<target>.acl`, and reports success via JSON-RPC.
    if ((init.method ?? 'GET') === 'POST' && url.endsWith('/mcp')) {
      const req = JSON.parse(init.body)
      const { name, arguments: args } = req.params
      if (name !== 'write_acl') return { ok: true, status: 200, headers: { get: () => null }, json: async () => ({ jsonrpc: '2.0', id: req.id, result: { isError: true } }) }
      const targetUrl = 'https://pod.example' + args.path
      const doc = {
        '@context': { acl: 'http://www.w3.org/ns/auth/acl#' },
        '@graph': args.authorizations.map((a, i) => ({
          '@id': `#auth${i}`, '@type': 'acl:Authorization', 'acl:accessTo': { '@id': targetUrl },
          'acl:mode': (a.modes || []).map((m) => ({ '@id': `acl:${m}` })),
          ...(a.agents?.length ? { 'acl:agent': a.agents.map((x) => ({ '@id': x })) } : {}),
          ...(a.agentClasses?.length ? { 'acl:agentClass': a.agentClasses.map((x) => ({ '@id': x })) } : {}),
        })),
      }
      store.set(`${targetUrl}.acl`, { body: JSON.stringify(doc), ct: 'application/ld+json' })
      return { ok: true, status: 200, headers: { get: () => null }, json: async () => ({ jsonrpc: '2.0', id: req.id, result: { isError: false } }) }
    }
    if ((init.method ?? 'GET') === 'PUT') {
      store.set(url, { body: init.body, ct: init.headers['content-type'], link: init.headers.link })
      return { ok: true, status: 201, headers: { get: () => null } }
    }
    const e = store.get(url)
    if (!e) return { ok: false, status: 404, headers: { get: () => null }, text: async () => '', json: async () => ({}) }
    return { ok: true, status: 200, headers: { get: (k) => (k === 'content-type' ? e.ct : null) },
      text: async () => e.body, json: async () => JSON.parse(e.body) }
  }
  return { store, fetchFn }
}

const SELF = { id: 'content', self: true, default: true, format: 'text/markdown', conformsTo: 'https://p.example/base' }
const LINKS = { id: 'links', suffix: '.links.jsonld', format: 'application/ld+json', conformsTo: 'https://p.example/fam' }
const INDEX = { id: 'index', target: 'index.md', format: 'text/markdown', conformsTo: 'https://p.example/base' }

describe('instantiate', () => {
  it('self-only profile: advertises altr default on every source member, materializes nothing', async () => {
    const { store, fetchFn } = podMock()
    const res = await instantiate(C, 't', { representations: [SELF], context: {} }, { fetchFn })
    const meta = JSON.parse(store.get(`${C}a.md.meta`).body)
    expect(meta['altr:hasDefaultRepresentation']['@id']).toBe(`${C}a.md`)
    expect(meta['altr:hasDefaultRepresentation']['dct:format']).toBe('text/markdown')
    expect(store.has(`${C}a.md.links.jsonld`)).toBe(false)
    expect(res.every((r) => [200, 201].includes(r.status))).toBe(true)
  })

  it('member rep: renderer output PUT at member+suffix with a write-side profile Link; null skips', async () => {
    const { store, fetchFn } = podMock()
    const renderers = { links: async (src) => (src.url.endsWith('a.md') ? '{"@id":"x"}' : null) }
    await instantiate(C, 't', { representations: [SELF, LINKS], context: {} }, { fetchFn, renderers })
    expect(store.get(`${C}a.md.links.jsonld`).link).toBe('<https://p.example/fam>; rel="profile"')
    expect(store.has(`${C}b.md.links.jsonld`)).toBe(false)
    const metaA = JSON.parse(store.get(`${C}a.md.meta`).body)
    expect(metaA['altr:hasRepresentation'][0]['@id']).toBe(`${C}a.md.links.jsonld`)
    const metaB = JSON.parse(store.get(`${C}b.md.meta`).body)
    expect(metaB['altr:hasRepresentation']).toBeUndefined()
  })

  it('read-merge-write preserves the bind (conformsTo/describedby) in an existing .meta', async () => {
    const bind = JSON.stringify({ '@context': { dct: 'http://purl.org/dc/terms/' }, '@id': '', 'dct:conformsTo': { '@id': 'https://p.example/fam' } })
    const { store, fetchFn } = podMock({ [`${C}a.md.meta`]: { body: bind, ct: 'application/ld+json' } })
    await instantiate(C, 't', { representations: [SELF], context: {} }, { fetchFn })
    const meta = JSON.parse(store.get(`${C}a.md.meta`).body)
    expect(meta['dct:conformsTo']['@id']).toBe('https://p.example/fam')
    expect(meta['altr:hasDefaultRepresentation']).toBeDefined()
  })

  it('container rep with renderer: PUT at target + container .meta altr alternate; targets/dotfiles/containers excluded from sources', async () => {
    const { store, fetchFn } = podMock()
    const seen = []
    const renderers = { index: async (_c, sources) => { seen.push(...sources.map((s) => s.url)); return '# fresh' } }
    await instantiate(C, 't', { representations: [INDEX], context: {} }, { fetchFn, renderers })
    expect(store.get(`${C}index.md`).body).toBe('# fresh')
    expect(seen.sort()).toEqual([`${C}a.md`, `${C}b.md`])          // not index.md (target), not sub/ (container)
    const cmeta = JSON.parse(store.get(`${C}.meta`).body)
    expect(cmeta['altr:hasRepresentation'][0]['@id']).toBe(`${C}index.md`)
  })

  it('named_graph container rep: neutral aggregate materializes with no renderer; container .meta gets alternate, never a default', async () => {
    const listing = `<${C}> <http://www.w3.org/ns/ldp#contains> <${C}a.md>, <${C}x.links.jsonld> .`
    const flat = JSON.stringify({ '@context': {}, '@id': 'https://authority.example/kb/x#it', 'https://schema.org/name': 'X' })
    const { store, fetchFn } = podMock({
      [C]: { body: listing, ct: 'text/turtle' },
      [`${C}x.links.jsonld`]: { body: flat, ct: 'application/ld+json' },
    })
    const GRAPH = { id: 'graph', named_graph: 'g.jsonld', push_mode: 'replace', mode: 'dataset', members: '.links.jsonld', format: 'application/ld+json', conformsTo: 'https://p.example/fam' }
    const res = await instantiate(C, 't', { representations: [SELF, GRAPH], context: {} }, { fetchFn })
    const body = JSON.parse(store.get(`${C}g.jsonld`).body)
    expect(body['@graph']).toBeDefined()
    const cmeta = JSON.parse(store.get(`${C}.meta`).body)
    expect(cmeta['altr:hasRepresentation'].some((e) => e['@id'] === `${C}g.jsonld`)).toBe(true)
    expect(cmeta['altr:hasDefaultRepresentation']).toBeUndefined()
    expect(res.some((r) => r.rep === 'graph' && r.target === `${C}g.jsonld`)).toBe(true)
  })

  it('substrate sidecars listed in ldp:contains are never sources: no recursive .meta.meta', async () => {
    const listing = `<${C}> <http://www.w3.org/ns/ldp#contains> <${C}a.md>, <${C}b.md>, <${C}a.md.meta>, <${C}x.jsonld.lwstypes> .`
    const { store, fetchFn } = podMock({
      [C]: { body: listing, ct: 'text/turtle' },
      [`${C}a.md.meta`]: { body: '{}', ct: 'application/ld+json' },
      [`${C}x.jsonld.lwstypes`]: { body: '{}', ct: 'application/ld+json' },
    })
    const res = await instantiate(C, 't', { representations: [SELF], context: {} }, { fetchFn })
    expect(store.has(`${C}a.md.meta.meta`)).toBe(false)
    expect(store.has(`${C}x.jsonld.lwstypes.meta`)).toBe(false)
    const advertised = res.filter((r) => r.rep === 'altr').map((r) => r.target).sort()
    expect(advertised).toEqual([`${C}a.md.meta`, `${C}b.md.meta`])
  })

  it('C1: mirrors a source member ACL onto its materialized face via write_acl, BEFORE the face body (private member protected)', async () => {
    // NOT a raw PUT of the source's own .acl bytes (task-10 live-gate finding,
    // navigator round): a raw JSON-LD PUT to `.acl` lands on the same SHACL
    // admission path as any other write, and the substrate's base floor shape
    // ("every rdf:type'd subject needs a title") rejects an acl:Authorization
    // node on any real profile-bound container. mirrorAcl now routes through
    // write_acl (admission-exempt by design) instead — this fixture's source
    // ACL shape is exactly what the real fork's write_acl tool produces.
    const acl = JSON.stringify({
      '@context': { acl: 'http://www.w3.org/ns/auth/acl#' },
      '@graph': [{
        '@id': '#owner', '@type': 'acl:Authorization', 'acl:agent': { '@id': 'https://alice.example/#me' },
        'acl:accessTo': { '@id': `${C}a.md` },
        'acl:mode': [{ '@id': 'acl:Read' }, { '@id': 'acl:Write' }, { '@id': 'acl:Control' }],
      }],
    })
    const { store, fetchFn: baseFetch } = podMock({ [`${C}a.md.acl`]: { body: acl, ct: 'application/ld+json' } })
    const calls = []
    const fetchFn = async (url, init = {}) => { calls.push({ url, method: init.method ?? 'GET' }); return baseFetch(url, init) }
    const renderers = { links: async (src) => (src.url.endsWith('a.md') ? '{"@id":"x"}' : null) }
    await instantiate(C, 't', { representations: [SELF, LINKS], context: {} }, { fetchFn, renderers })

    expect(store.has(`${C}a.md.links.jsonld.acl`)).toBe(true)
    const mirrored = JSON.parse(store.get(`${C}a.md.links.jsonld.acl`).body)
    expect(mirrored['@graph'][0]['acl:accessTo']['@id']).toBe(`${C}a.md.links.jsonld`)
    expect(mirrored['@graph'][0]['acl:accessTo']['@id']).not.toBe(`${C}a.md`)
    expect(mirrored['@graph'][0]['acl:agent'][0]['@id']).toBe('https://alice.example/#me')
    expect(mirrored['@graph'][0]['acl:mode'].map((m) => m['@id']).sort()).toEqual(['acl:Control', 'acl:Read', 'acl:Write'])

    const aclCallIdx = calls.findIndex((c) => c.method === 'POST' && c.url.endsWith('/mcp'))
    const bodyPutIdx = calls.findIndex((c) => c.method === 'PUT' && c.url === `${C}a.md.links.jsonld`)
    expect(aclCallIdx).toBeGreaterThanOrEqual(0)
    expect(bodyPutIdx).toBeGreaterThanOrEqual(0)
    expect(aclCallIdx).toBeLessThan(bodyPutIdx)
  })

  it('C1: a source member with no ACL (inherits the container default) writes no ACL onto its face', async () => {
    const { store, fetchFn: baseFetch } = podMock()
    const calls = []
    const fetchFn = async (url, init = {}) => { calls.push({ url, method: init.method ?? 'GET' }); return baseFetch(url, init) }
    const renderers = { links: async (src) => (src.url.endsWith('a.md') ? '{"@id":"x"}' : null) }
    await instantiate(C, 't', { representations: [SELF, LINKS], context: {} }, { fetchFn, renderers })
    expect(store.has(`${C}a.md.links.jsonld.acl`)).toBe(false)
    expect(calls.some((c) => c.method === 'POST' && c.url.endsWith('/mcp'))).toBe(false)
    // the face body must still be written normally
    expect(store.has(`${C}a.md.links.jsonld`)).toBe(true)
  })

  it('C1: a source ACL with no recognizable acl:Authorization entries fails closed (no face published)', async () => {
    const acl = JSON.stringify({ '@context': { acl: 'http://www.w3.org/ns/auth/acl#' }, '@graph': [] })
    const { store, fetchFn: baseFetch } = podMock({ [`${C}a.md.acl`]: { body: acl, ct: 'application/ld+json' } })
    const calls = []
    const fetchFn = async (url, init = {}) => { calls.push({ url, method: init.method ?? 'GET' }); return baseFetch(url, init) }
    const renderers = { links: async (src) => (src.url.endsWith('a.md') ? '{"@id":"x"}' : null) }
    await instantiate(C, 't', { representations: [SELF, LINKS], context: {} }, { fetchFn, renderers })
    expect(calls.some((c) => c.method === 'POST' && c.url.endsWith('/mcp'))).toBe(false)
    expect(store.has(`${C}a.md.links.jsonld`)).toBe(false)          // face refused, not published unprotected
    expect(store.has(`${C}a.md.links.jsonld.acl`)).toBe(false)
  })

  it('C1: write_acl HTTP-200 JSON-RPC error envelope (no result) fails closed (no face published)', async () => {
    // Review follow-up: an HTTP-200 response carrying a JSON-RPC `error` (no
    // `result`) previously fell through mirrorAcl's `rpc?.result?.isError`
    // check as a false negative — `undefined` is falsy, so the face
    // published world-readable. This pins the fail-closed refusal.
    const acl = JSON.stringify({
      '@context': { acl: 'http://www.w3.org/ns/auth/acl#' },
      '@graph': [{
        '@id': '#owner', '@type': 'acl:Authorization', 'acl:agent': { '@id': 'https://alice.example/#me' },
        'acl:accessTo': { '@id': `${C}a.md` },
        'acl:mode': [{ '@id': 'acl:Read' }, { '@id': 'acl:Write' }, { '@id': 'acl:Control' }],
      }],
    })
    const { store, fetchFn: baseFetch } = podMock({ [`${C}a.md.acl`]: { body: acl, ct: 'application/ld+json' } })
    const fetchFn = async (url, init = {}) => {
      if ((init.method ?? 'GET') === 'POST' && url.endsWith('/mcp')) {
        const req = JSON.parse(init.body)
        if (req.params.name === 'write_acl')
          return { ok: true, status: 200, headers: { get: () => null },
            json: async () => ({ jsonrpc: '2.0', id: req.id, error: { code: -32000, message: 'boom' } }) }
      }
      return baseFetch(url, init)
    }
    const renderers = { links: async (src) => (src.url.endsWith('a.md') || src.url.endsWith('b.md') ? '{"@id":"x"}' : null) }
    await instantiate(C, 't', { representations: [SELF, LINKS], context: {} }, { fetchFn, renderers })
    expect(store.has(`${C}a.md.links.jsonld`)).toBe(false)          // ACL-carrying member's face refused
    expect(store.has(`${C}a.md.links.jsonld.acl`)).toBe(false)
    expect(store.has(`${C}b.md.links.jsonld`)).toBe(true)           // other member (no .acl) unaffected — instantiate still completes
  })

  it('C1: unparseable write_acl response body fails closed (no face published)', async () => {
    const acl = JSON.stringify({
      '@context': { acl: 'http://www.w3.org/ns/auth/acl#' },
      '@graph': [{
        '@id': '#owner', '@type': 'acl:Authorization', 'acl:agent': { '@id': 'https://alice.example/#me' },
        'acl:accessTo': { '@id': `${C}a.md` },
        'acl:mode': [{ '@id': 'acl:Read' }],
      }],
    })
    const { store, fetchFn: baseFetch } = podMock({ [`${C}a.md.acl`]: { body: acl, ct: 'application/ld+json' } })
    const fetchFn = async (url, init = {}) => {
      if ((init.method ?? 'GET') === 'POST' && url.endsWith('/mcp')) {
        const req = JSON.parse(init.body)
        if (req.params.name === 'write_acl')
          return { ok: true, status: 200, headers: { get: () => null }, json: async () => { throw new Error('not json') } }
      }
      return baseFetch(url, init)
    }
    const renderers = { links: async (src) => (src.url.endsWith('a.md') ? '{"@id":"x"}' : null) }
    await instantiate(C, 't', { representations: [SELF, LINKS], context: {} }, { fetchFn, renderers })
    expect(store.has(`${C}a.md.links.jsonld`)).toBe(false)
    expect(store.has(`${C}a.md.links.jsonld.acl`)).toBe(false)
  })

  it('P2: a member face gets its own .meta declaring itself as default rep', async () => {
    const { store, fetchFn } = podMock()
    const renderers = { links: async (src) => (src.url.endsWith('a.md') ? '{"@id":"x"}' : null) }
    await instantiate(C, 't', { representations: [SELF, LINKS], context: {} }, { fetchFn, renderers })
    const faceMeta = JSON.parse(store.get(`${C}a.md.links.jsonld.meta`).body)
    expect(faceMeta['altr:hasDefaultRepresentation']['@id']).toBe(`${C}a.md.links.jsonld`)
    expect(faceMeta['altr:hasDefaultRepresentation']['dct:format']).toBe('application/ld+json')
    expect(faceMeta['altr:hasDefaultRepresentation']['dct:conformsTo']['@id']).toBe('https://p.example/fam')
  })

  it('P2: a container-level face (target rep) gets its own .meta default self-entry', async () => {
    const { store, fetchFn } = podMock()
    const renderers = { index: async (_c, sources) => '# fresh' }
    await instantiate(C, 't', { representations: [INDEX], context: {} }, { fetchFn, renderers })
    const faceMeta = JSON.parse(store.get(`${C}index.md.meta`).body)
    expect(faceMeta['altr:hasDefaultRepresentation']['@id']).toBe(`${C}index.md`)
    expect(faceMeta['altr:hasDefaultRepresentation']['dct:format']).toBe('text/markdown')
    expect(faceMeta['altr:hasDefaultRepresentation']['dct:conformsTo']['@id']).toBe('https://p.example/base')
  })

  it('P2: a derived-view (mode) face gets its own .meta default self-entry', async () => {
    const listing = `<${C}> <http://www.w3.org/ns/ldp#contains> <${C}a.md>, <${C}x.links.jsonld> .`
    const flat = JSON.stringify({ '@context': {}, '@id': 'https://authority.example/kb/x#it', 'https://schema.org/name': 'X' })
    const { store, fetchFn } = podMock({
      [C]: { body: listing, ct: 'text/turtle' },
      [`${C}x.links.jsonld`]: { body: flat, ct: 'application/ld+json' },
    })
    const GRAPH = { id: 'graph', named_graph: 'g.jsonld', push_mode: 'replace', mode: 'dataset', members: '.links.jsonld', format: 'application/ld+json', conformsTo: 'https://p.example/fam' }
    await instantiate(C, 't', { representations: [SELF, GRAPH], context: {} }, { fetchFn })
    const faceMeta = JSON.parse(store.get(`${C}g.jsonld.meta`).body)
    expect(faceMeta['altr:hasDefaultRepresentation']['@id']).toBe(`${C}g.jsonld`)
    expect(faceMeta['altr:hasDefaultRepresentation']['dct:format']).toBe('application/ld+json')
    expect(faceMeta['altr:hasDefaultRepresentation']['dct:conformsTo']['@id']).toBe('https://p.example/fam')
  })

  it('P2: the SOURCE resource .meta advertisement is unchanged (default=self rep, alternates=faces)', async () => {
    const { store, fetchFn } = podMock()
    const renderers = { links: async (src) => (src.url.endsWith('a.md') ? '{"@id":"x"}' : null) }
    await instantiate(C, 't', { representations: [SELF, LINKS], context: {} }, { fetchFn, renderers })
    const metaA = JSON.parse(store.get(`${C}a.md.meta`).body)
    expect(metaA['altr:hasDefaultRepresentation']['@id']).toBe(`${C}a.md`)
    expect(metaA['altr:hasDefaultRepresentation']['dct:format']).toBe('text/markdown')
    expect(metaA['altr:hasRepresentation'][0]['@id']).toBe(`${C}a.md.links.jsonld`)
    const metaB = JSON.parse(store.get(`${C}b.md.meta`).body)
    expect(metaB['altr:hasDefaultRepresentation']['@id']).toBe(`${C}b.md`)
    expect(metaB['altr:hasRepresentation']).toBeUndefined()
  })

  it('missing renderer: throws by default, skips + reports when onMissingRenderer=skip', async () => {
    const { fetchFn } = podMock()
    await expect(instantiate(C, 't', { representations: [LINKS], context: {} }, { fetchFn })).rejects.toThrow(/links/)
    const res = await instantiate(C, 't', { representations: [LINKS], context: {} }, { fetchFn, onMissingRenderer: 'skip' })
    expect(res.some((r) => r.rep === 'skipped:links')).toBe(true)
  })
})

describe('mergeContexts', () => {
  it('flattens base-first, later wins', () =>
    expect(mergeContexts([{ '@context': { a: 'x', b: 'y' } }, { '@context': { b: 'z' } }])).toEqual({ a: 'x', b: 'z' }))
})
