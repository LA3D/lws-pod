import { describe, it, beforeAll, expect } from 'vitest'
import { BASE, ensurePod, getToken } from './helpers.mjs'

// L2.5 live gate — Type Index / Type Search surfaces against the running FORK
// pod (--lws). Self-skips on a non-lws pod: the storage description must
// advertise TypeIndexService (top-level probe, mirrors lws-admission/lws-discovery).
const sd = await fetch(`${BASE}/.well-known/lws-storage`, {
  headers: { Accept: 'application/lws+json' },
}).then(r => (r.ok ? r.json() : {})).catch(() => ({}))
const lwsTypeIndex = (sd.service || []).some(s => s.type === 'TypeIndexService')

const CONTAINER = 'https://www.w3.org/ns/lws#Container'
const PROBE = 'http://example.org/test/Probe'

describe.skipIf(!lwsTypeIndex)('LWS Type Index / Search (L2.5)', () => {
  let token

  beforeAll(async () => {
    await ensurePod()
    ;({ token } = await getToken())
    // Provision a resource that declares a distinctive type via Link: rel="type".
    const r = await fetch(`${BASE}/alice/lws-typeprobe`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/ld+json',
        Authorization: `Bearer ${token}`,
        Link: `<${PROBE}>; rel="type"`,
      },
      body: '{}',
    })
    expect([200, 201, 204]).toContain(r.status)
  })

  it('advertises both services in the storage description', () => {
    const types = (sd.service || []).map(s => s.type)
    expect(types).toContain('TypeIndexService')
    expect(types).toContain('TypeSearchService')
  })

  it('GET /types/index returns a TypeIndex; a bearer sees the declared probe type', async () => {
    const r = await fetch(`${BASE}/types/index`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    expect(r.status).toBe(200)
    expect(r.headers.get('content-type')).toContain('application/lws+json')
    const idx = await r.json()
    expect(idx.type).toBe('TypeIndex')
    expect(Array.isArray(idx.items)).toBe(true)
    expect(idx.items.map(i => i.id)).toContain(PROBE)
  })

  it('GET /types/search on lws:Container returns container resources', async () => {
    const r = await fetch(`${BASE}/types/search?type=${encodeURIComponent(CONTAINER)}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    expect(r.status).toBe(200)
    const page = await r.json()
    expect(page.type).toBe('ContainerPage')
    for (const item of page.items) expect([].concat(item.type)).toContain('Container')
  })

  it('type search (GET and POST) find the probe resource by its declared type', async () => {
    const url = `${BASE}/types/search?type=${encodeURIComponent(PROBE)}`
    const get = await (await fetch(url, { headers: { Authorization: `Bearer ${token}` } })).json()
    const getIds = get.items.map(i => i.id)
    expect(getIds.some(u => u.endsWith('/alice/lws-typeprobe'))).toBe(true)

    const post = await (await fetch(`${BASE}/types/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/lws+json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ type: [PROBE] }),
    })).json()
    expect(post.items.map(i => i.id)).toEqual(getIds) // GET/POST equivalence
  })

  it('invalid type value → 400; unsupported POST media type → 415', async () => {
    const bad = await fetch(`${BASE}/types/search?type=notanabsoluteuri`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    expect(bad.status).toBe(400)

    const wrongCt = await fetch(`${BASE}/types/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain', Authorization: `Bearer ${token}` },
      body: 'x',
    })
    expect(wrongCt.status).toBe(415)
  })

  // The security-critical property: authorization-filtered discovery. /alice/lws-typeprobe
  // is owner-private (the pod's default ACL — an anonymous GET on it 401s), so its declared
  // type must be visible to the owner's bearer but NOT to an anonymous caller, in both the
  // index and search. This is the live end-to-end proof of the checkAccess-and-drop filter.
  it('authz filter: an anonymous caller does NOT see a private resource type (the bearer does)', async () => {
    const authedIdx = await (await fetch(`${BASE}/types/index`, { headers: { Authorization: `Bearer ${token}` } })).json()
    expect(authedIdx.items.map(i => i.id)).toContain(PROBE)

    const anonIdx = await (await fetch(`${BASE}/types/index`)).json()
    expect(anonIdx.type).toBe('TypeIndex')
    expect(anonIdx.items.map(i => i.id)).not.toContain(PROBE)

    const url = `${BASE}/types/search?type=${encodeURIComponent(PROBE)}`
    const authedSearch = await (await fetch(url, { headers: { Authorization: `Bearer ${token}` } })).json()
    expect(authedSearch.items.map(i => i.id).some(u => u.endsWith('/alice/lws-typeprobe'))).toBe(true)

    const anonSearch = await (await fetch(url)).json()
    expect(anonSearch.type).toBe('ContainerPage') // empty result, not an error
    expect(anonSearch.totalItems).toBe(0)
    expect(anonSearch.items).toEqual([])
  })
})
