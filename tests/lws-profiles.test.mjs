import { describe, it, expect, beforeAll } from 'vitest'
import { BASE, ensurePod, getToken } from './helpers.mjs'
import { resolveStorageAuthority, readProfileIndex } from '../projection/prof/resolve.mjs'
import { loadProfile, discoverBinding } from '../projection/prof/profile-loader.mjs'

// Live-pod profile-mechanism gate (spec §10). Needs the fork --lws TLS pod
// (make up-fork-tls, NODE_EXTRA_CA_CERTS=certs/rootCA.pem) + make publish-profiles run.
const DCT_CONFORMS = 'http://purl.org/dc/terms/conformsTo'

// Top-level probe, matching the existing gates' self-skip pattern: the
// suite skips (never fails) on a non---lws pod.
const lws = await fetch(`${BASE}/.well-known/lws-storage`)
  .then(async (r) => r.ok && (await r.json()).type === 'Storage').catch(() => false)
let token

beforeAll(async () => {
  await ensurePod()
  ;({ token } = await getToken())
})

describe.skipIf(!lws)('profile mechanism (live)', () => {
  it('acceptance #1/#2: storage description advertises the index; authority resolved from it', async () => {
    const { authority, profileIndex } = await resolveStorageAuthority(`${BASE}/alice/concepts/`)
    expect(authority).toBe(`${BASE}/`)
    expect(profileIndex).toBe(`${BASE}/alice/profiles/index.jsonld`)
    const idx = await readProfileIndex(profileIndex)
    expect(idx.profiles.length).toBeGreaterThanOrEqual(3)
  })

  it('acceptance #4: bound container linkset carries full-URI conformsTo; unbound member omits it', async () => {
    const bound = await fetch(`${BASE}/alice/concepts/`, { headers: { accept: 'application/linkset+json', authorization: `Bearer ${token}` } })
    const ls = (await bound.json()).linkset[0]
    expect(ls[DCT_CONFORMS][0].href).toBe(`${BASE}/alice/profiles/llm-wiki/profile.jsonld`)
    await fetch(`${BASE}/alice/concepts/unbound.md`, { method: 'PUT',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'text/markdown' }, body: '---\ntitle: u\n---\n' })
    const member = await fetch(`${BASE}/alice/concepts/unbound.md`, { headers: { accept: 'application/linkset+json', authorization: `Bearer ${token}` } })
    expect(DCT_CONFORMS in (await member.json()).linkset[0]).toBe(false)
  })

  it('loader resolves the published llm-wiki profile end-to-end (walk + merge live)', async () => {
    const bindings = await discoverBinding(`${BASE}/alice/concepts/anything.md`)
    expect(bindings).toEqual([`${BASE}/alice/profiles/llm-wiki/profile.jsonld`])
    const p = await loadProfile(bindings[0])
    expect(p.token).toBe('llm-wiki')
    expect(p.validation.some((v) => v.endsWith('llm-wiki/shapes.ttl'))).toBe(true)
    expect(p.identityPolicy).toEqual({ pathPrefix: 'id/', fragment: '#it' })
    expect(p.conformance.some((c) => c.iri.endsWith('substrate-floor.jsonld') && c.resolved)).toBe(true)
  })

  it('acceptance #5 (STRICT): L3 rejects a non-conformant RDF write through the profile-sourced shape, teaching message intact', async () => {
    // llm-wiki shapes constrain wm-typed subjects; a deliberately wrong typed node.
    // STRICT since the array-form-shape sniff fix (was three-armed while the
    // ld+json-500 fork bug stood): the ONLY acceptable outcome is a SHACL
    // rejection with the teaching channel — a 2xx here is the silent-accept
    // this gate exists to catch, and any 5xx is a regression.
    const bad = { '@context': { wm: 'https://la3d.github.io/llm-wiki-colab/ns#' }, '@id': '#it', '@type': 'wm:Concept' }
    const r = await fetch(`${BASE}/alice/concepts/bad.jsonld`, { method: 'PUT',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/ld+json' }, body: JSON.stringify(bad) })
    expect(r.status).toBe(400)
    const problem = await r.json()
    expect(problem.violations?.length ?? 0).toBeGreaterThan(0)       // the teaching channel
    expect(JSON.stringify(problem.violations)).toMatch(/title/i)     // the llm-wiki floor rule speaks
  })

  it('acceptance #5b: a CONFORMANT member admits through the profile shape and stays observable', async () => {
    // The positive path (never live-proven before the array-form sniff fix) +
    // the observability seed: strict #5 rejects every bad member, so without
    // this the bound container holds no RDF member a cold agent can sample.
    // Pins the CURRENT handoff design: governance edges (describedby,
    // conformsTo) live on the CONTAINER linkset; a member carries up/type and
    // reaches its profile via `up`. Member-level inheritance (or an
    // earned-at-admission conformsTo) is an explicit L4 brainstorm input —
    // if L4 changes the design, flip these assertions deliberately.
    const good = { '@context': { wm: 'https://la3d.github.io/llm-wiki-colab/ns#', dcterms: 'http://purl.org/dc/terms/' },
      '@id': '#it', '@type': 'wm:Concept', 'dcterms:title': 'Conformant seed concept' }
    const w = await fetch(`${BASE}/alice/concepts/good.jsonld`, { method: 'PUT',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/ld+json' }, body: JSON.stringify(good) })
    expect([200, 201]).toContain(w.status)                            // admitted, not rejected
    expect(JSON.stringify(await w.json())).toMatch(/advisories/)      // Info advisory channel intact
    const member = (await (await fetch(`${BASE}/alice/concepts/good.jsonld`,
      { headers: { accept: 'application/linkset+json', authorization: `Bearer ${token}` } })).json()).linkset[0]
    expect(member.up[0].href).toBe(`${BASE}/alice/concepts/`)         // the handoff affordance
    expect('describedby' in member).toBe(false)                       // current design: not on the member
    expect(DCT_CONFORMS in member).toBe(false)
    const container = (await (await fetch(`${BASE}/alice/concepts/`,
      { headers: { accept: 'application/linkset+json', authorization: `Bearer ${token}` } })).json()).linkset[0]
    expect('describedby' in container).toBe(true)                     // ...because it lives here
    expect(DCT_CONFORMS in container).toBe(true)
  })

  it('acceptance #9: an unbound container behaves exactly as today (negative control)', async () => {
    await fetch(`${BASE}/alice/plain/x.md`, { method: 'PUT',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'text/markdown' }, body: 'hi' })
    const ls = await fetch(`${BASE}/alice/plain/`, { headers: { accept: 'application/linkset+json', authorization: `Bearer ${token}` } })
    const link = (await ls.json()).linkset[0]
    expect(DCT_CONFORMS in link).toBe(false)
    expect('describedby' in link).toBe(false)
  })
})
