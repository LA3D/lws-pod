import { describe, it, beforeAll, expect } from 'vitest'
import { BASE, ensurePod, getToken } from './helpers.mjs'

// Indexed-relation live gate — describedby filter + linkset describedby, against
// the running FORK pod (--lws). Self-skips on a non-lws pod: TypeSearchService
// must be advertised (mirrors lws-typeindex/lws-admission/lws-discovery gates).
// service[] is advertised per-storage (multi-tenant round) — the well-known
// root is a ServerIndex with no service[] of its own.
const sd = await fetch(`${BASE}/alice/lws-storage`, { headers: { Accept: 'application/lws+json' } })
  .then(r => (r.ok ? r.json() : {})).catch(() => ({}))
const hasSearch = (sd.service || []).some(s => s.type === 'TypeSearchService')

const DESCRIBEDBY = 'http://www.w3.org/2007/05/powder-s#describedby'

describe.skipIf(!hasSearch)('LWS indexed-relation (describedby)', () => {
  let token, shape, doc
  beforeAll(async () => {
    await ensurePod()
    ;({ token } = await getToken())
    const auth = { Authorization: `Bearer ${token}` }
    shape = `${BASE}/alice/shapes/IdxNote`
    doc = `${BASE}/alice/idx-doc1`
    await fetch(shape, { method: 'PUT', headers: { 'Content-Type': 'application/ld+json', ...auth }, body: '{}' })
    await fetch(doc, { method: 'PUT', headers: { 'Content-Type': 'application/json', ...auth }, body: '{}' })
    const meta = await fetch(`${doc}.meta`, { method: 'PUT', headers: { 'Content-Type': 'application/ld+json', ...auth },
      body: JSON.stringify({ '@id': doc, [DESCRIBEDBY]: { '@id': shape } }) })
    expect([200, 201, 204]).toContain(meta.status)
    await fetch(`${BASE}/alice/idx-doc2`, { method: 'PUT', headers: { 'Content-Type': 'application/json', ...auth }, body: '{}' })
  })

  it('?describedby=<shape> returns the constrained doc, excludes the unconstrained one', async () => {
    const r = await fetch(`${BASE}/types/search?describedby=${encodeURIComponent(shape)}`, { headers: { Authorization: `Bearer ${token}` } })
    expect(r.status).toBe(200)
    const ids = (await r.json()).items.map(i => i.id)
    expect(ids.some(u => u.endsWith('/alice/idx-doc1'))).toBe(true)
    expect(ids.some(u => u.endsWith('/alice/idx-doc2'))).toBe(false)
  })

  it('?describedby=<unknown-shape> → empty, status 200', async () => {
    const r = await fetch(`${BASE}/types/search?describedby=${encodeURIComponent(shape + 'X')}`, { headers: { Authorization: `Bearer ${token}` } })
    expect(r.status).toBe(200)
    expect((await r.json()).items.length).toBe(0)
  })

  it('an unindexed relation key → empty, status 200 (no-oracle)', async () => {
    const r = await fetch(`${BASE}/types/search?madeup=${encodeURIComponent(shape)}`, { headers: { Authorization: `Bearer ${token}` } })
    expect(r.status).toBe(200)
    expect((await r.json()).items.length).toBe(0)
  })

  it('the constrained doc linkset carries describedby=<shape> (not storage-desc)', async () => {
    const r = await fetch(doc, { headers: { Accept: 'application/linkset+json', Authorization: `Bearer ${token}` } })
    const link = (await r.json()).linkset[0]
    expect(link.describedby).toEqual([{ href: shape }])
    expect(JSON.stringify(link.describedby)).not.toContain('lws-storage')
    expect(r.headers.get('link') || '').toMatch(/rel="https:\/\/www\.w3\.org\/ns\/lws#storageDescription"/)
  })
})
