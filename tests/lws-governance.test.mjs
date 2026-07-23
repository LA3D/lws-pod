// tests/lws-governance.test.mjs — live gate for the governance round
// (solid:owner + schema:provider + backfill), against the fork-tls rig.
import { describe, it, expect } from 'vitest'

const BASE = process.env.BASE || 'https://pod.vardeman.me'
const OWNER_REL = 'http://www.w3.org/ns/solid/terms#owner'

describe('governance surfaces (live)', () => {
  it('alice description carries owner; ServerIndex carries provider', async () => {
    const desc = await (await fetch(`${BASE}/alice/lws-storage`)).json()
    // live: alice's account record uses the .jsonld card variant (confirmed via
    // `curl .../alice/lws-storage | jq .owner` and the boot-time backfill log line).
    expect(desc.owner).toEqual([`${BASE}/alice/profile/card.jsonld#me`])
    const idx = await (await fetch(`${BASE}/.well-known/lws-storage`)).json()
    expect(idx.provider).toBe(`${BASE}/alice/profile/card.jsonld#me`)
  })

  it('alice root GET and HEAD both carry Link rel=solid:owner', async () => {
    for (const method of ['GET', 'HEAD']) {
      const res = await fetch(`${BASE}/alice/`, { method })
      expect(res.headers.get('link') ?? '').toContain(`rel="${OWNER_REL}"`)
    }
  })

  it('a member response does not carry the owner Link', async () => {
    const res = await fetch(`${BASE}/alice/`, { headers: { Accept: 'application/lws+json' } })
    const first = (await res.json()).items?.find((i) => i.type !== 'Container')
    if (!first) return // seeded tree always has members; belt only
    const m = await fetch(new URL(first.id, `${BASE}/alice/`), { method: 'HEAD' })
    expect(m.headers.get('link') ?? '').not.toContain(OWNER_REL)
  })

  it("bob's owner is not disclosed anonymously (READ-gate inherited)", async () => {
    const desc = await fetch(`${BASE}/bob/lws-storage`)
    expect(desc.status).toBe(401) // unchanged multi-tenant behavior
    const root = await fetch(`${BASE}/bob/`, { method: 'HEAD' })
    expect(root.headers.get('link') ?? '').not.toContain(OWNER_REL)
  })

  it('anonymous OPTIONS on a private storage root carries no owner Link', async () => {
    const res = await fetch(`${BASE}/bob/`, { method: 'OPTIONS' })
    expect(res.status).toBeLessThan(500)
    expect(res.headers.get('link') ?? '').not.toContain('http://www.w3.org/ns/solid/terms#owner')
  })

  it('.lwsowner is write-refused live', async () => {
    const res = await fetch(`${BASE}/alice/.lwsowner`, {
      method: 'PUT',
      body: '[]',
      headers: { 'Content-Type': 'application/json' },
    })
    expect([401, 403, 405]).toContain(res.status) // dotfile guard / WAC / System-Managed — never 2xx
  })
})
