import { describe, it, beforeAll, expect } from 'vitest'
import { BASE, ensurePod, getToken } from './helpers.mjs'

// Next-fork round live gate (spec 2026-07-13 / merge 32398c1): pins the headline
// discovery + sidecar-integrity behaviors through the full TLS/Caddy stack. The
// security/PATCH/N3-Patch conformance behaviors are exhaustively covered in-process
// by the fork suite (1626 tests); these are the cheap, high-value cases worth a
// live pin against the real HTTP/proxy rung.
//
// Self-skip guard (added 2026-07-18, task-10 sweep): this file has always run
// unconditionally, unlike every sibling live-gate file — a real gap, not
// scope-introduced. `make test` (bare) hits the LOCAL non-`--lws` pod, whose
// long-lived `alice` account carries unrelated ACL/state from earlier rounds,
// so all 5 cases here 401/204'd instead of self-skipping. Mirrors
// lws-discovery.test.mjs's probe-once pattern.
const lwsEnabled = await fetch(`${BASE}/.well-known/lws-storage`, { headers: { Accept: 'application/lws+json' } })
  .then(r => r.status === 200).catch(() => false)

const WIKI = '/alice/wiki/'
const REFERENT_CAP = 'https://w3id.org/lws-pod/capability/ReferentResolution'

describe.skipIf(!lwsEnabled)('next-fork round (live)', () => {
  let token
  beforeAll(async () => {
    await ensurePod()
    ;({ token } = await getToken())
  })

  it('Task 10: the ReferentResolution capability carries structured uriSpace prefixes = the VoID void:uriSpace', async () => {
    // capability[] is advertised per-storage (multi-tenant round) — the
    // well-known root is a ServerIndex with no capability[] of its own.
    const sd = await (await fetch(`${BASE}/alice/lws-storage`)).json()
    const cap = (sd.capability || []).find((c) => c.type === REFERENT_CAP)
    expect(cap, 'ReferentResolution capability advertised').toBeTruthy()
    expect(Array.isArray(cap.uriSpace)).toBe(true)
    // byte-match against the pod's own VoID document (follow the 303)
    const voidRes = await fetch(`${BASE}/.well-known/void`, { redirect: 'follow' })
    const voidDoc = await voidRes.json()
    // void:uriSpace may be a string or array in the doc; normalize
    const raw = voidDoc['void:uriSpace'] ?? voidDoc.uriSpace
    const voidSpaces = (Array.isArray(raw) ? raw : [raw]).filter(Boolean).map((u) => (typeof u === 'object' ? u['@id'] || u.value : u))
    for (const p of cap.uriSpace) expect(voidSpaces).toContain(p)
  })

  it('Task 3: a client PUT to a System-Managed .lwstypes sidecar is refused 405 with Allow: GET, HEAD', async () => {
    const r = await fetch(`${BASE}${WIKI}a.md.lwstypes`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(['https://evil.example/Injected']),
    })
    expect(r.status).toBe(405)
    expect((r.headers.get('allow') || '')).toMatch(/GET/)
  })

  it('Task 3: a client PUT to a .lwsprov sidecar is refused 405', async () => {
    const r = await fetch(`${BASE}${WIKI}a.md.lwsprov`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(['https://evil.example/prof']),
    })
    expect(r.status).toBe(405)
  })

  it('Task 9: a 404 under --lws advertises merge-patch in Accept-Patch', async () => {
    const r = await fetch(`${BASE}${WIKI}nonexistent-nextfork-probe.ttl`)
    expect(r.status).toBe(404)
    expect(r.headers.get('accept-patch') || '').toMatch(/application\/merge-patch\+json/)
  })

  it('Task referent/303: a minted /alice/id/ name dereferences by 303 to its backing card (anon)', async () => {
    const r = await fetch(`${BASE}/alice/id/a`, { redirect: 'manual' })
    expect(r.status).toBe(303)
    expect(r.headers.get('location') || '').toMatch(/\/alice\/wiki\/a\.md$/)
  })
})
