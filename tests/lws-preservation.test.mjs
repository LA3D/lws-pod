import { describe, it, beforeAll, afterAll, expect } from 'vitest'
import { BASE, ensurePod, getToken } from './helpers.mjs'

// Representation-preservation live gate (spec 2026-07-11 §2, debt-drain round, B1 root
// fix) against the running FORK pod (--lws). Under --lws the write path stops converting
// non-JSON-LD RDF bodies: the pod stores exactly what the client submitted, serves it
// back as its own bytes, and items[].mediaType agrees. A write-time name/type
// consistency gate (teaching 400) keeps the extension-derived stored type truthful in
// both directions (Turtle-body-at-.jsonld-name, and the B1 gate hole's mirror image,
// JSON-LD-body-at-.ttl-name). Self-skips on a non-conneg pod via the storage-description
// capability — same guard as tests/lws-conneg.test.mjs.
const sd = await fetch(`${BASE}/.well-known/lws-storage`, { headers: { Accept: 'application/lws+json' } })
  .then(r => (r.ok ? r.json() : {})).catch(() => ({}))
const hasConneg = JSON.stringify(sd.capability || []).includes('connegp/profile/http')

const TTL = '@prefix ex: <http://ex/> .\nex:s ex:p "o" .\nex:s2 ex:p "o2" .'

describe.skipIf(!hasConneg)('representation preservation (--lws, live)', () => {
  let token, auth, ttl, mismatch, lie, noext
  beforeAll(async () => {
    await ensurePod()
    ;({ token } = await getToken())
    auth = { Authorization: `Bearer ${token}` }
    ttl = `${BASE}/alice/pres-v.ttl`
    mismatch = `${BASE}/alice/pres-mismatch.jsonld`
    lie = `${BASE}/alice/pres-lie.ttl`
    noext = `${BASE}/alice/pres-noext`
    const p = await fetch(ttl, { method: 'PUT', headers: { 'Content-Type': 'text/turtle', ...auth }, body: TTL })
    expect([200, 201, 204, 205]).toContain(p.status)
  })
  afterAll(async () => {
    // mismatch/lie/noext are all rejected 400s (never persisted) — deleting them is a
    // harmless no-op, same convention as mcp-v2.test.mjs's SHACL-refused-write cleanup.
    for (const u of [ttl, mismatch, lie, noext]) await fetch(u, { method: 'DELETE', headers: auth })
  })

  it('multi-subject Turtle PUT is stored AS Turtle, served as its own bytes (no JSON-LD envelope)', async () => {
    const g = await fetch(ttl, { headers: { Accept: 'text/turtle', ...auth } })
    expect(g.status).toBe(200)
    expect(g.headers.get('content-type').split(';')[0]).toBe('text/turtle')
    const body = await g.text()
    expect(body.trimStart().startsWith('{')).toBe(false)
    expect(body.trimStart().startsWith('[')).toBe(false)
    expect(body).toContain('ex:p "o"')
  })

  it('the stored Turtle negotiates to JSON-LD via real conversion', async () => {
    const g = await fetch(ttl, { headers: { Accept: 'application/ld+json', ...auth } })
    expect(g.status).toBe(200)
    expect(g.headers.get('content-type').split(';')[0]).toBe('application/ld+json')
    const doc = await g.json()
    expect(JSON.stringify(doc)).toContain('http://ex/p')
  })

  it('items[] mediaType agrees with the stored Turtle type', async () => {
    const l = await fetch(`${BASE}/alice/`, { headers: { Accept: 'application/lws+json', ...auth } })
    const item = (await l.json()).items.find(i => i.id.endsWith('/pres-v.ttl'))
    expect(item.mediaType).toBe('text/turtle')
  })

  it('name/type mismatch (Turtle body at a .jsonld name) -> teaching 400', async () => {
    const r = await fetch(mismatch, { method: 'PUT', headers: { 'Content-Type': 'text/turtle', ...auth }, body: TTL })
    expect(r.status).toBe(400)
    expect(r.headers.get('content-type').split(';')[0]).toBe('application/problem+json')
    const p = await r.json()
    expect(p.detail).toMatch(/text\/turtle/)
    expect(p.detail).toMatch(/application\/ld\+json/)
  })

  it('JSON-LD body at a .ttl name -> teaching 400 (the B1 gate, mirror direction)', async () => {
    const jld = JSON.stringify({ '@id': 'http://ex/s', 'http://ex/p': 'o' })
    const r = await fetch(lie, { method: 'PUT', headers: { 'Content-Type': 'application/ld+json', ...auth }, body: jld })
    expect(r.status).toBe(400)
    expect(r.headers.get('content-type').split(';')[0]).toBe('application/problem+json')
    const p = await r.json()
    expect(p.detail).toMatch(/text\/turtle/)
  })

  it('extension-less RDF write -> teaching 400 (would serve as octet-stream)', async () => {
    const r = await fetch(noext, { method: 'PUT', headers: { 'Content-Type': 'text/turtle', ...auth }, body: TTL })
    expect(r.status).toBe(400)
    const p = await r.json()
    expect(p.detail).toMatch(/octet-stream/)
  })
})
