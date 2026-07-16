import { describe, it, beforeAll, expect } from 'vitest'
import { BASE, getToken } from './helpers.mjs'

// Multi-tenant storage live gate (spec 2026-07-15 §4). Verifies the rig seeded
// by `make seed-multitenant`: alice (public storage) + bob (private storage),
// each self-describing, WAC-filtered roster, per-storage referent 303s. Reads
// only — assumes the seed already ran (like test-viewer assumes publish). Self-
// skips on a single-tenant / unseeded pod so plain `make test` stays green.

const ALICE = { name: 'alice', email: 'alice@example.com', password: 'alicepassword123' }
const BOB = { name: 'bob', email: 'bob@example.com', password: 'bobpassword123' }

const idx = await fetch(`${BASE}/.well-known/lws-storage`, { headers: { Accept: 'application/lws+json' } })
  .then((r) => (r.ok ? r.json() : {})).catch(() => ({}))
const isMultiTenant = idx.type === 'ServerIndex'

describe.skipIf(!isMultiTenant)('LWS multi-tenant storage (spec §4)', () => {
  let bobAuth
  beforeAll(async () => {
    const { token } = await getToken(BOB)   // bob reads his own private root + alice's public root
    bobAuth = { Authorization: `Bearer ${token}` }
  })

  it('§4.4 anon server index lists the public storage (alice), NOT the private one (bob)', async () => {
    const r = await fetch(`${BASE}/.well-known/lws-storage`, { headers: { Accept: 'application/lws+json' } })
    const ids = (await r.json()).storage.map((s) => s.id)
    expect(ids.some((i) => i.endsWith('/alice/'))).toBe(true)
    expect(ids.some((i) => i.endsWith('/bob/'))).toBe(false)
  })

  it('§4.4 an agent with READ on both (bob) sees BOTH storages in the roster', async () => {
    const r = await fetch(`${BASE}/.well-known/lws-storage`, { headers: { Accept: 'application/lws+json', ...bobAuth } })
    const ids = (await r.json()).storage.map((s) => s.id)
    expect(ids.some((i) => i.endsWith('/alice/'))).toBe(true)
    expect(ids.some((i) => i.endsWith('/bob/'))).toBe(true)
  })

  it('§4.1 bob’s resources self-describe as bob; anon is denied the private description', async () => {
    const anon = await fetch(`${BASE}/bob/lws-storage`, { headers: { Accept: 'application/lws+json' } })
    expect(anon.status).toBe(401)   // private root → description READ-gated (parity with the root ACL)
    const owner = await fetch(`${BASE}/bob/lws-storage`, { headers: { Accept: 'application/lws+json', ...bobAuth } })
    expect(owner.status).toBe(200)
    expect((await owner.json()).id).toMatch(/\/bob\/$/)
  })

  it('§4.2 bob mints his own /bob/id/ independently (bob-token 303 → /bob/wiki/); no-oracle to anon', async () => {
    const owner = await fetch(`${BASE}/bob/id/a`, { redirect: 'manual', headers: bobAuth })
    expect(owner.status).toBe(303)
    expect(owner.headers.get('location')).toBe(`${BASE}/bob/wiki/a.md`)
    // private tenant: anon must NOT resolve the referent (would leak existence) → 404-hide
    const anon = await fetch(`${BASE}/bob/id/a`, { redirect: 'manual' })
    expect(anon.status).toBe(404)
  })

  it('§4.5 anon GET /alice/id/a 303s to /alice/wiki/a.md (public re-mint), undisturbed by bob', async () => {
    const r = await fetch(`${BASE}/alice/id/a`, { redirect: 'manual' })
    expect(r.status).toBe(303)
    expect(r.headers.get('location')).toBe(`${BASE}/alice/wiki/a.md`)
  })

  it('§4.1 the storageDescription Link under /alice/ points at /alice/lws-storage (per-storage)', async () => {
    const r = await fetch(`${BASE}/alice/wiki/a.md`, { headers: { Accept: 'text/markdown' } })
    expect(r.headers.get('link')).toContain('/alice/lws-storage')
    expect(r.headers.get('link')).toContain('rel="https://www.w3.org/ns/lws#storageDescription"')
  })
})
