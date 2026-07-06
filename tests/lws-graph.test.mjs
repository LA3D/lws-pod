// tests/lws-graph.test.mjs
import { describe, it, beforeAll, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { BASE, ensurePod, getToken } from './helpers.mjs'
import { materializeDerivedView } from '../projection/okf/derived-view.mjs'
import { discoverBinding } from '../projection/okf/profile-loader.mjs'

const PROF = '/alice/profiles/ex-graph/'
const DATA = '/alice/graphs/'                                     // ungoverned: no describedby bound
const CTX = { ex: 'https://example.org/ns#', rdfs: 'http://www.w3.org/2000/01/rdf-schema#', type: '@type', label: { '@id': 'rdfs:label' } }
const AUTHORITY = 'https://authority.example/kb'                  // graph name base, deliberately != storage path
const defs = (rel) => new URL(`../projection/profiles/defs/ex-graph/${rel}`, import.meta.url)

const probe = await fetch(`${BASE}/.well-known/lws-storage`).catch(() => null)
describe.skipIf(!probe?.ok)('generic graph-semantics gate (L4b Phase A)', () => {
  let token
  const H = () => ({ authorization: `Bearer ${token}` })
  const member = (slug) => ({ '@context': CTX, '@id': `${AUTHORITY}/${slug}`,
    '@graph': [{ '@id': `${AUTHORITY}/${slug}#it`, type: 'ex:Thing', label: slug }] })

  beforeAll(async () => {
    await ensurePod()
    ;({ token } = await getToken())
    // Publish the neutral profile family (pure data PUTs).
    for (const name of ['profile.jsonld', 'context.jsonld', 'derived-view.jsonld']) {
      const r = await fetch(`${BASE}${PROF}${name}`, { method: 'PUT',
        headers: { ...H(), 'content-type': 'application/ld+json' }, body: readFileSync(defs(name)) })
      expect([200, 201, 204, 205]).toContain(r.status)
    }
    // Store two arbitrary named-graph resources into an UNGOVERNED container.
    for (const slug of ['a', 'b']) {
      const r = await fetch(`${BASE}${DATA}${slug}.jsonld`, { method: 'PUT',
        headers: { ...H(), 'content-type': 'application/ld+json' }, body: JSON.stringify(member(slug)) })
      expect([200, 201, 204, 205]).toContain(r.status)
    }
  })

  it('reads a stored named graph back faithfully; graph name != storage path', async () => {
    const r = await fetch(`${BASE}${DATA}a.jsonld`, { headers: { ...H(), accept: 'application/ld+json' } })
    expect(r.ok).toBe(true)
    const doc = await r.json()
    expect(doc['@id']).toBe(`${AUTHORITY}/a`)                      // graph name preserved, decoupled from storage URL
    expect(doc['@id']).not.toBe(`${BASE}${DATA}a.jsonld`)
    const node = (doc['@graph'] || []).find(n => n['@id'] === `${AUTHORITY}/a#it`)
    expect(node).toBeTruthy()                                     // subject distinct from graph name
  })

  it('materializes a union derived view (JSON-LD named graph, named by the view URL)', async () => {
    const r = await materializeDerivedView(`${BASE}${DATA}`, token,
      { named_graph: 'view.jsonld', push_mode: 'replace', mode: 'union' }, { context: CTX })
    expect([200, 201, 204, 205]).toContain(r.status)
    const view = await (await fetch(r.target, { headers: { ...H(), accept: 'application/ld+json' } })).json()
    expect(view['@id']).toBe(`${BASE}${DATA}view.jsonld`)
    const ids = (view['@graph'] || []).map(n => n['@id']).sort()
    expect(ids).toContain(`${AUTHORITY}/a#it`)
    expect(ids).toContain(`${AUTHORITY}/b#it`)
  })

  it('materializes a dataset derived view (one named graph per member)', async () => {
    const r = await materializeDerivedView(`${BASE}${DATA}`, token,
      { named_graph: 'view-ds.jsonld', push_mode: 'replace', mode: 'dataset' }, { context: CTX })
    const view = await (await fetch(r.target, { headers: { ...H(), accept: 'application/ld+json' } })).json()
    const names = (view['@graph'] || []).map(g => g['@id']).sort()
    expect(names).toContain(`${AUTHORITY}/a`)
    expect(names).toContain(`${AUTHORITY}/b`)
  })

  it('read-side: the derived-view graph name resolves to its own resource (plane-mapping minimum)', async () => {
    // The union view declared @id == its storage URL, so the name is directly dereferenceable.
    const url = `${BASE}${DATA}view.jsonld`
    const doc = await (await fetch(url, { headers: { ...H(), accept: 'application/ld+json' } })).json()
    expect(doc['@id']).toBe(url)                                  // graph name == the resource you GET
  })

  it('read-side: an ungoverned container has no binding (discoverBinding -> [])', async () => {
    // Authenticate to disambiguate: [] means genuinely no conformsTo, not a 401 fold (conformsToFromMeta collapses all non-2xx to [])
    const authFetch = (u, o = {}) => fetch(u, { ...o, headers: { ...(o.headers || {}), authorization: `Bearer ${token}` } })
    const bound = await discoverBinding(`${BASE}${DATA}a.jsonld`, { fetchFn: authFetch })  // /alice/graphs/ has no .meta conformsTo
    expect(Array.isArray(bound)).toBe(true)
    expect(bound).toEqual([])                                     // container-authority precedence: no local bind => empty
  })

  it('exercises no application vocabulary (generic proof)', async () => {
    // The modules the gate drives must be free of wiki/okf/card terms.
    for (const f of ['../projection/okf/jsonld-graph.mjs', '../projection/okf/derived-view.mjs']) {
      const src = readFileSync(new URL(f, import.meta.url), 'utf8')
      expect(src).not.toMatch(/\b(wiki|card|okf|concept|implementation)\b/i)
    }
  })
})
