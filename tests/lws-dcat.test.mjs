import { describe, it, beforeAll, expect } from 'vitest'
import { BASE, ensurePod, getToken } from './helpers.mjs'
import { discoverBinding, loadProfile } from '../projection/okf/profile-loader.mjs'

// The zero-code DCAT gate (spec L4a §5): application #2 onboards as PURE DATA
// through agentic requests — this beforeAll IS the onboarding recipe (also
// documented in docs/foundations/06). publish.mjs is deliberately NOT used.
const DIR = '/alice/profiles/dcat-catalog/'
const DATASETS = '/alice/datasets/'
const DCT = 'http://purl.org/dc/terms/'
const POWDER = 'http://www.w3.org/2007/05/powder-s#'
const defs = (rel) => new URL(`../projection/profiles/defs/dcat-catalog/${rel}`, import.meta.url)
const { readFileSync } = await import('node:fs')

const probe = await fetch(`${BASE}/.well-known/lws-storage`).catch(() => null)
const up = !!probe?.ok

describe.skipIf(!up)('zero-code DCAT onboarding (L4a gate)', () => {
  let token
  beforeAll(async () => {
    await ensurePod()
    ;({ token } = await getToken())
    const H = { authorization: `Bearer ${token}` }

    // RECIPE step 1 — publish the three profile artifacts (plain PUTs of data).
    for (const [name, ct] of [['profile.jsonld', 'application/ld+json'], ['context.jsonld', 'application/ld+json'], ['shapes.ttl', 'text/turtle']]) {
      const r = await fetch(`${BASE}${DIR}${name}`, { method: 'PUT',
        headers: { ...H, 'content-type': ct }, body: readFileSync(defs(name)) })
      // 204: idempotent re-PUT of an unchanged resource on a re-run (adapt-on-contact —
      // fixed paths make the recipe idempotent, so overwrite-with-same-bytes is expected).
      expect([200, 201, 204, 205]).toContain(r.status)
    }

    // RECIPE step 2 — public-read ACL via the MCP write_acl tool (agentic guardrail
    // surface, still zero code) so unauthenticated profile resolution works.
    const acl = await fetch(`${BASE}/mcp`, { method: 'POST', headers: { ...H, 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'write_acl', arguments: {
        path: DIR, authorizations: [
          { agentClasses: ['foaf:Agent'], modes: ['Read'], isDefault: true },
          { agents: [`${BASE}/alice/profile/card.jsonld#me`], modes: ['Read', 'Write', 'Control'], isDefault: true },
        ] } } }) })
    expect((await acl.json()).result?.isError ?? false).toBe(false)

    // RECIPE step 2b — public-read ACL on the BOUND container too (adapt-on-contact: the
    // documented OPS finding — JSS default owner-only ACLs mean bound containers, not just
    // the profile dir, need public-read before unauthenticated discoverBinding/loadProfile
    // can walk their .meta — same pattern as the live /alice/concepts/.acl).
    const aclDatasets = await fetch(`${BASE}/mcp`, { method: 'POST', headers: { ...H, 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'write_acl', arguments: {
        path: DATASETS, authorizations: [
          { agentClasses: ['foaf:Agent'], modes: ['Read'], isDefault: true },
          { agents: [`${BASE}/alice/profile/card.jsonld#me`], modes: ['Read', 'Write', 'Control'], isDefault: true },
        ] } } }) })
    expect((await aclDatasets.json()).result?.isError ?? false).toBe(false)

    // RECIPE step 3 — bind the container: .meta read-merge-write (conformsTo + describedby).
    const metaUrl = `${BASE}${DATASETS}.meta`
    let meta = {}
    const r0 = await fetch(metaUrl, { headers: { ...H, accept: 'application/ld+json' } })
    if (r0.ok) { try { meta = await r0.json() } catch { meta = {} } }
    meta['@context'] = { ...(typeof meta['@context'] === 'object' ? meta['@context'] : {}), dct: DCT, powder: POWDER }
    meta['@id'] = meta['@id'] ?? ''
    meta['dct:conformsTo'] = { '@id': `${BASE}${DIR}profile.jsonld` }
    meta['powder:describedby'] = [{ '@id': `${BASE}${DIR}shapes.ttl` }]
    const rb = await fetch(metaUrl, { method: 'PUT', headers: { ...H, 'content-type': 'application/ld+json' }, body: JSON.stringify(meta) })
    expect([200, 201, 204, 205]).toContain(rb.status)
  })

  it('gate 1: non-conformant dcat:Dataset → 400 + teaching violations through the UNCHANGED admission engine', async () => {
    const bad = { '@context': { dcat: 'http://www.w3.org/ns/dcat#', dct: DCT }, '@id': '#it', '@type': 'dcat:Dataset' }
    const r = await fetch(`${BASE}${DATASETS}bad.jsonld`, { method: 'PUT',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/ld+json' }, body: JSON.stringify(bad) })
    expect(r.status).toBe(400)
    const problem = await r.json()
    expect(JSON.stringify(problem.violations)).toMatch(/dct:title|title/i)
  })

  it('gate 2: conformant dataset admits (201/200, Info advisory when description absent)', async () => {
    const good = { '@context': { dcat: 'http://www.w3.org/ns/dcat#', dct: DCT }, '@id': '#it', '@type': 'dcat:Dataset', 'dct:title': 'Seed dataset' }
    const r = await fetch(`${BASE}${DATASETS}seed.jsonld`, { method: 'PUT',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/ld+json',
        link: '<http://www.w3.org/ns/dcat#Dataset>; rel="type"' }, body: JSON.stringify(good) })
    expect([200, 201]).toContain(r.status)
    expect(JSON.stringify(await r.json())).toMatch(/advisories/)
  })

  it('gate 3: handoff edges — container linkset carries describedby + conformsTo; member carries up/type', async () => {
    const c = (await (await fetch(`${BASE}${DATASETS}`, { headers: { accept: 'application/linkset+json', authorization: `Bearer ${token}` } })).json()).linkset[0]
    expect(c.describedby.map((x) => x.href)).toContain(`${BASE}${DIR}shapes.ttl`)
    expect(c[`${DCT}conformsTo`][0].href).toBe(`${BASE}${DIR}profile.jsonld`)
    const m = (await (await fetch(`${BASE}${DATASETS}seed.jsonld`, { headers: { accept: 'application/linkset+json', authorization: `Bearer ${token}` } })).json()).linkset[0]
    expect(m.up[0].href).toBe(`${BASE}${DATASETS}`)
    expect('describedby' in m).toBe(false)
  })

  it('gate 4: loadProfile walks dcat-catalog → substrate-floor over the LIVE pod (unauthenticated)', async () => {
    const bindings = await discoverBinding(`${BASE}${DATASETS}anything.jsonld`)
    expect(bindings).toEqual([`${BASE}${DIR}profile.jsonld`])
    const p = await loadProfile(bindings[0])
    expect(p.token).toBe('dcat-catalog')
    expect(p.identityPolicy).toEqual({ fragment: '#it' })
    expect(p.conformance.some((c) => c.iri.endsWith('substrate-floor.jsonld') && c.resolved)).toBe(true)
  })

  it('gate 5: type search finds the dcat-typed member', async () => {
    const r = await fetch(`${BASE}/types/search?type=${encodeURIComponent('http://www.w3.org/ns/dcat#Dataset')}`,
      { headers: { authorization: `Bearer ${token}` } })
    const page = await r.json()
    expect(page.items.map((i) => i.id)).toContain(`${BASE}${DATASETS}seed.jsonld`)
  })
})
