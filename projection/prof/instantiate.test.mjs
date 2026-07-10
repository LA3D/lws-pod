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
