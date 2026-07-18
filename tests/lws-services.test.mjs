import { describe, it, beforeAll, expect } from 'vitest'
import { BASE, getToken } from './helpers.mjs'

// Per-storage services live gate (spec 2026-07-18 round 2, matrix R7-R11).
// Needs up-fork-tls + seed-multitenant (alice public + bob private). Reads
// only; self-skips on a single-tenant/unseeded pod.

const BOB = { name: 'bob', email: 'bob@example.com', password: 'bobpassword123' }
const lws = { Accept: 'application/lws+json' }

const idx = await fetch(`${BASE}/.well-known/lws-storage`, { headers: lws })
  .then((r) => (r.ok ? r.json() : {})).catch(() => ({}))
const isMultiTenant = idx.type === 'ServerIndex'

describe.skipIf(!isMultiTenant)('per-storage services (spec 2026-07-18 R7-R11)', () => {
  let bobAuth
  beforeAll(async () => {
    const { token } = await getToken(BOB)
    bobAuth = { Authorization: `Bearer ${token}` }
  })

  it('S1 alice SD advertises HER OWN scoped services; no NotificationService', async () => {
    const sd = await fetch(`${BASE}/alice/lws-storage`, { headers: lws }).then((r) => r.json())
    const by = (t) => sd.service.find((s) => s.type === t)
    expect(by('TypeIndexService').serviceEndpoint).toBe(`${BASE}/alice/types/index`)
    expect(by('TypeSearchService').serviceEndpoint).toBe(`${BASE}/alice/types/search`)
    expect(by('VoidService').serviceEndpoint).toBe(`${BASE}/alice/profiles/void.jsonld`)
    expect(by('NotificationService')).toBeUndefined()
  })

  it('S2 scope isolation: bob token on /alice/types/search sees only alice; origin sees both', async () => {
    const scoped = await fetch(`${BASE}/alice/types/search`, { headers: bobAuth }).then((r) => r.json())
    expect(scoped.totalItems).toBeGreaterThan(0)
    for (const i of scoped.items) expect(new URL(i.id).pathname.startsWith('/alice/')).toBe(true)
    const origin = await fetch(`${BASE}/types/search`, { headers: bobAuth }).then((r) => r.json())
    expect(origin.items.some((i) => new URL(i.id).pathname.startsWith('/bob/'))).toBe(true)
  })

  it('S3 VoidService dereferences directly (200, no 303)', async () => {
    const sd = await fetch(`${BASE}/alice/lws-storage`, { headers: lws }).then((r) => r.json())
    const vs = sd.service.find((s) => s.type === 'VoidService')
    const r = await fetch(vs.serviceEndpoint, { redirect: 'manual' })
    expect(r.status).toBe(200)
  })

  it('S4 ServerIndex carries the cross-storage extension service array', async () => {
    expect(idx.service.find((s) => s.type === 'TypeIndexService').serviceEndpoint).toBe(`${BASE}/types/index`)
    expect(idx.service.find((s) => s.type === 'McpService')).toBeDefined()
    expect(idx.service.find((s) => s.type === 'NotificationService')).toBeUndefined()
  })

  it('S5 conditional + reserved-name + no-oracle posture on the new routes', async () => {
    const first = await fetch(`${BASE}/alice/types/index`)
    const etag = first.headers.get('etag')
    expect(etag).toBeTruthy()
    const cond = await fetch(`${BASE}/alice/types/index`, { headers: { 'If-None-Match': etag } })
    expect(cond.status).toBe(304)
    expect((await fetch(`${BASE}/alice/types/index`, { method: 'PUT' })).status).toBe(405)
    expect((await fetch(`${BASE}/nosuchpod/types/index`)).status).toBe(404)
  })

  it('S6 bob-private posture: anon gets 401 on bob SD; bob token sees his scoped endpoints', async () => {
    expect((await fetch(`${BASE}/bob/lws-storage`, { headers: lws })).status).toBe(401)
    const sd = await fetch(`${BASE}/bob/lws-storage`, { headers: { ...lws, ...bobAuth } }).then((r) => r.json())
    expect(sd.service.find((s) => s.type === 'TypeIndexService').serviceEndpoint).toBe(`${BASE}/bob/types/index`)
  })
})
