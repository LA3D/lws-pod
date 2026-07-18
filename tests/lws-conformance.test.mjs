import { describe, it, expect } from 'vitest'
import { BASE } from './helpers.mjs'

// LWS-core conformance live gate (round 1, matrix 2026-07-18 R1-R4): up/type
// Link headers, GET/HEAD parity, generated-doc ETag + 304. Runs against the
// up-fork-tls rig (alice public / bob private). Self-skips on a non-lws pod.
const probe = await fetch(`${BASE}/alice/lws-storage`).then(r => r.ok).catch(() => false)
const LWS = 'https://www.w3.org/ns/lws#'

describe.skipIf(!probe)('LWS resource-server conformance', () => {
  it('R1/R2: data resource GET Link carries up + lws type (LDP types preserved)', async () => {
    const r = await fetch(`${BASE}/alice/wiki/a.md`)
    const link = r.headers.get('link') || ''
    expect(link).toContain(`<${BASE}/alice/wiki/>; rel="up"`)
    expect(link).toContain(`<${LWS}DataResource>; rel="type"`)
    expect(link).toContain('<http://www.w3.org/ns/ldp#Resource>; rel="type"')
    expect(link).toContain('rel="linkset"')
  })

  it('R1: HEAD Link identical to GET', async () => {
    const g = await fetch(`${BASE}/alice/wiki/a.md`)
    const h = await fetch(`${BASE}/alice/wiki/a.md`, { method: 'HEAD' })
    expect(h.headers.get('link')).toBe(g.headers.get('link'))
  })

  it('R1/R2: container GET Link carries up + lws Container type', async () => {
    const r = await fetch(`${BASE}/alice/wiki/`, { headers: { Accept: 'application/lws+json' } })
    const link = r.headers.get('link') || ''
    expect(link).toContain(`<${BASE}/alice/>; rel="up"`)
    expect(link).toContain(`<${LWS}Container>; rel="type"`)
  })

  it('R3/R4: per-storage description ETag + 304', async () => {
    const r1 = await fetch(`${BASE}/alice/lws-storage`)
    const etag = r1.headers.get('etag')
    expect(etag).toBeTruthy()
    const r2 = await fetch(`${BASE}/alice/lws-storage`, { headers: { 'If-None-Match': etag } })
    expect(r2.status).toBe(304)
  })

  it('R3/R4: ServerIndex well-known ETag + 304 + Vary Authorization', async () => {
    const r1 = await fetch(`${BASE}/.well-known/lws-storage`)
    const etag = r1.headers.get('etag')
    expect(etag).toBeTruthy()
    expect(r1.headers.get('vary') || '').toContain('Authorization')
    const r2 = await fetch(`${BASE}/.well-known/lws-storage`, { headers: { 'If-None-Match': etag } })
    expect(r2.status).toBe(304)
  })

  it('no-oracle KEEP: anon bob description still bare 401', async () => {
    const r = await fetch(`${BASE}/bob/lws-storage`)
    expect(r.status).toBe(401)
  })
})
