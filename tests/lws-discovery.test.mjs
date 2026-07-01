import { describe, it, beforeAll, expect } from 'vitest'
import { BASE, ensurePod, getToken } from './helpers.mjs'

// The L2 (LWS storage-discovery) surface only exists on an --lws pod (the fork). Probe once;
// if absent (e.g. `make test` against the base npm pod), skip the whole suite so that gate stays
// green. `make test-lws` points BASE at the fork pod, where this runs. Top-level await is fine
// in a Vitest ESM test file (runs at collection).
const lwsEnabled = await fetch(`${BASE}/.well-known/lws-storage`, { headers: { Accept: 'application/lws+json' } })
  .then(r => r.status === 200).catch(() => false)

const ORIGIN = new URL(BASE).origin
const LWS = 'https://www.w3.org/ns/lws#'

describe.skipIf(!lwsEnabled)('LWS L2 discovery surface (live --lws pod)', () => {
  let token
  const note = `${BASE}/alice/notes/disc.ttl`
  const container = `${BASE}/alice/notes/`

  beforeAll(async () => {
    await ensurePod()
    ;({ token } = await getToken())
    // a plain resource (no index.html) so conneg isn't shadowed by the mashlib landing page
    await fetch(note, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'text/turtle' },
      body: '<#it> <http://schema.org/name> "discovery harness" .',
    })
  })

  it('serves the Storage Description (type:Storage + service[]) with a scheme matching the base', async () => {
    const r = await fetch(`${BASE}/.well-known/lws-storage`, { headers: { Accept: 'application/lws+json' } })
    expect(r.status).toBe(200)
    expect(r.headers.get('content-type')).toMatch(/application\/lws\+json/)
    const sd = await r.json()
    expect(sd['@context']).toBe('https://www.w3.org/ns/lws/v1')
    expect(sd.type).toBe('Storage')
    // scheme parity (request.protocol fix): behind a TLS proxy id/serviceEndpoint are https
    expect(sd.id.startsWith(ORIGIN)).toBe(true)
    const self = sd.service.find(s => s.type === 'StorageDescription')
    expect(self).toBeTruthy()
    expect(self.serviceEndpoint.startsWith(ORIGIN)).toBe(true)
  })

  it('advertises rel=storageDescription + rel=linkset on a resource GET', async () => {
    const r = await fetch(note, { headers: { Authorization: `Bearer ${token}`, Accept: 'text/turtle' } })
    expect(r.status).toBe(200)
    const link = r.headers.get('link') || ''
    expect(link).toContain(`rel="${LWS}storageDescription"`)
    expect(link).toContain('rel="linkset"')
  })

  it('advertises the same Link rels on HEAD (parity)', async () => {
    const r = await fetch(note, { method: 'HEAD', headers: { Authorization: `Bearer ${token}` } })
    expect(r.status).toBe(200)
    const link = r.headers.get('link') || ''
    expect(link).toContain(`rel="${LWS}storageDescription"`)
    expect(link).toContain('rel="linkset"')
  })

  it('serves a per-resource RFC 9264 linkset for a file (DataResource)', async () => {
    const r = await fetch(note, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/linkset+json' } })
    expect(r.status).toBe(200)
    expect(r.headers.get('content-type')).toMatch(/application\/linkset\+json/)
    const ls = await r.json()
    const link = ls.linkset[0]
    expect(link.anchor.endsWith('/alice/notes/disc.ttl')).toBe(true)
    expect(link.type[0].href).toBe(`${LWS}DataResource`)
    expect(link.up[0].href.endsWith('/alice/notes/')).toBe(true)
    // Unconstrained resource: linkset omits describedby (the shape-declaration
    // relation). The storage description is its own rel=storageDescription
    // header (asserted above), not a linkset describedby target.
    expect('describedby' in link).toBe(false)
  })

  it('serves lws+json items[] and a Container linkset for a container', async () => {
    const j = await fetch(container, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/lws+json' } })
    expect(j.headers.get('content-type')).toMatch(/application\/lws\+json/)
    const c = await j.json()
    expect(c['@context']).toBe('https://www.w3.org/ns/lws/v1')
    expect(c.type).toBe('Container')
    expect(Array.isArray(c.items)).toBe(true)

    const l = await fetch(container, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/linkset+json' } })
    const ls = await l.json()
    expect(ls.linkset[0].type[0].href).toBe(`${LWS}Container`)
  })

  it('leaves the default (no LWS Accept) representation unchanged — still LDP/Turtle', async () => {
    const r = await fetch(note, { headers: { Authorization: `Bearer ${token}`, Accept: 'text/turtle' } })
    expect(r.headers.get('content-type')).toMatch(/text\/turtle/)
  })
})
