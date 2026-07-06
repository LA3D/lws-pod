// projection/okf/derived-view.test.mjs
import { describe, it, expect } from 'vitest'
import { materializeDerivedView } from './derived-view.mjs'

const CTX = { rdfs: 'http://www.w3.org/2000/01/rdf-schema#', label: { '@id': 'rdfs:label' }, type: '@type' }
const CONTAINER = 'https://pod.example/data/'
// A fake pod: container listing (Turtle ldp:contains) + two JSON-LD member graphs.
const memberA = { '@context': CTX, '@id': 'https://authority.example/kb/a', '@graph': [{ '@id': 'https://authority.example/kb/a#it', label: 'A' }] }
const memberB = { '@context': CTX, '@id': 'https://authority.example/kb/b', '@graph': [{ '@id': 'https://authority.example/kb/b#it', label: 'B' }] }
const listing = `@prefix ldp: <http://www.w3.org/ns/ldp#> .
<${CONTAINER}> ldp:contains <${CONTAINER}a.jsonld>, <${CONTAINER}b.jsonld>, <${CONTAINER}view.jsonld> .`

function fakePod() {
  const puts = []
  const fetchFn = async (url, opts = {}) => {
    const u = String(url)
    if (opts.method === 'PUT') { puts.push({ url: u, body: JSON.parse(opts.body) }); return { ok: true, status: 201 } }
    if (u === CONTAINER) return { ok: true, text: async () => listing }
    if (u.endsWith('a.jsonld')) return { ok: true, json: async () => memberA, text: async () => JSON.stringify(memberA) }
    if (u.endsWith('b.jsonld')) return { ok: true, json: async () => memberB, text: async () => JSON.stringify(memberB) }
    return { ok: false, status: 404 }
  }
  return { fetchFn, puts }
}

describe('materializeDerivedView', () => {
  it('union: one named graph named by the view URL, members flattened', async () => {
    const { fetchFn, puts } = fakePod()
    const decl = { named_graph: 'view.jsonld', push_mode: 'replace', mode: 'union' }
    const r = await materializeDerivedView(CONTAINER, 'tok', decl, { context: CTX, fetchFn })
    expect(r.target).toBe(`${CONTAINER}view.jsonld`)
    expect(r.status).toBe(201)
    const body = puts[0].body
    expect(body['@id']).toBe(`${CONTAINER}view.jsonld`)             // graph name = the view's own URL
    const ids = body['@graph'].map(n => n['@id']).sort()
    expect(ids).toEqual(['https://authority.example/kb/a#it', 'https://authority.example/kb/b#it'])
  })
  it('dataset: one named graph per member, provenance preserved', async () => {
    const { fetchFn, puts } = fakePod()
    const decl = { named_graph: 'view.jsonld', push_mode: 'replace', mode: 'dataset' }
    await materializeDerivedView(CONTAINER, 'tok', decl, { context: CTX, fetchFn })
    const body = puts[0].body
    expect(body['@graph'].map(g => g['@id']).sort()).toEqual(['https://authority.example/kb/a', 'https://authority.example/kb/b'])
  })
  it('skips the view target itself when re-projecting', async () => {
    const { fetchFn, puts } = fakePod()
    await materializeDerivedView(CONTAINER, 'tok', { named_graph: 'view.jsonld', push_mode: 'replace', mode: 'union' }, { context: CTX, fetchFn })
    // view.jsonld is in the listing but must not be read back into itself
    expect(puts[0].body['@graph'].some(n => String(n['@id']).endsWith('view.jsonld'))).toBe(false)
  })
})
