import { describe, it, beforeAll, afterAll, expect } from 'vitest'
import { BASE, ensurePod, getToken } from './helpers.mjs'

// Content-negotiation-by-profile live gate (DX-PROF-CONNEG cnpr:http) against
// the running FORK pod (--lws). A neutral memory declares a content default
// (text/markdown, the canonical resource) + a distinct links alternate
// (JSON-LD) in its client-managed .meta — authored with an ARRAY @context on
// purpose: the exact idiomatic form the old hand-rolled JSON-LD bridge parsed
// to ZERO quads (silently-inert conneg). This gate passing live proves the
// @rdfjs/parser-jsonld seam end-to-end, not just in unit tests.
// Self-skips on a non-conneg pod via the storage-description capability.
const sd = await fetch(`${BASE}/.well-known/lws-storage`, { headers: { Accept: 'application/lws+json' } })
  .then(r => (r.ok ? r.json() : {})).catch(() => ({}))
const hasConneg = JSON.stringify(sd.capability || []).includes('connegp/profile/http')

const ALTR = 'http://www.w3.org/ns/dx/connegp/altr#'
const DCT = 'http://purl.org/dc/terms/'
const CONTENT_P = 'https://profiles.vardeman.me/neutral/content'
const LINKS_P = 'https://profiles.vardeman.me/neutral/links'

describe.skipIf(!hasConneg)('LWS content negotiation by profile', () => {
  let token, auth, mem, links
  beforeAll(async () => {
    await ensurePod()
    ;({ token } = await getToken())
    auth = { Authorization: `Bearer ${token}` }
    mem = `${BASE}/alice/conneg-mem`
    links = `${BASE}/alice/conneg-mem.links.jsonld`
    await fetch(mem, { method: 'PUT', headers: { 'Content-Type': 'text/markdown', ...auth }, body: '# Memory A\n' })
    await fetch(links, { method: 'PUT', headers: { 'Content-Type': 'application/ld+json', ...auth },
      body: JSON.stringify({ '@id': `${mem}#it`, 'https://schema.org/name': 'Memory A' }) })
    const meta = {
      '@context': [{ altr: ALTR }, { dct: DCT }],          // array form — the parser-fix proof
      '@id': mem,
      'altr:hasDefaultRepresentation': { '@id': mem, 'dct:format': 'text/markdown', 'dct:conformsTo': { '@id': CONTENT_P } },
      'altr:hasRepresentation': { '@id': links, 'dct:format': 'application/ld+json', 'dct:conformsTo': { '@id': LINKS_P } },
    }
    const r = await fetch(`${mem}.meta`, { method: 'PUT', headers: { 'Content-Type': 'application/ld+json', ...auth }, body: JSON.stringify(meta) })
    expect([200, 201, 204]).toContain(r.status)
  })

  it('linkset advertises canonical(content) + alternate(links) — array-@context .meta SEEN', async () => {
    const r = await fetch(mem, { headers: { Accept: 'application/linkset+json', ...auth } })
    expect(r.status).toBe(200)
    const link = (await r.json()).linkset[0]
    expect(link.canonical).toEqual([{ href: mem, type: 'text/markdown', formats: CONTENT_P }])
    expect(link.alternate).toEqual([{ href: links, type: 'application/ld+json', formats: LINKS_P }])
  })

  it('Accept-Profile <content> → 200 self: markdown + Content-Profile + list-profiles Link', async () => {
    const r = await fetch(mem, { headers: { 'Accept-Profile': `<${CONTENT_P}>`, ...auth }, redirect: 'manual' })
    expect(r.status).toBe(200)
    expect(r.headers.get('content-profile')).toBe(`<${CONTENT_P}>`)
    const link = r.headers.get('link') || ''
    expect(link).toContain(`<${CONTENT_P}>; rel="profile"`)
    expect(link).toContain(`<${mem}>; rel="canonical"; type="text/markdown"; formats="${CONTENT_P}"`)
    expect(link).toContain(`<${links}>; rel="alternate"; type="application/ld+json"; formats="${LINKS_P}"`)
    expect(await r.text()).toBe('# Memory A\n')
  })

  it('Accept-Profile <links> → 303 to the links resource, full Vary', async () => {
    const r = await fetch(mem, { headers: { 'Accept-Profile': `<${LINKS_P}>`, ...auth }, redirect: 'manual' })
    expect(r.status).toBe(303)
    expect(r.headers.get('location')).toBe(links)
    expect(r.headers.get('link') || '').toContain(`<${LINKS_P}>; rel="profile"`)
    expect(r.headers.get('vary') || '').toContain('Authorization')   // no-oracle cache-correctness
  })

  it('Accept-Profile <unknown> → 406 advertising what IS available', async () => {
    const r = await fetch(mem, { headers: { 'Accept-Profile': '<https://profiles.vardeman.me/nope>', ...auth }, redirect: 'manual' })
    expect(r.status).toBe(406)
    const link = r.headers.get('link') || ''
    expect(link).toContain('rel="canonical"')
    expect(link).toContain(`formats="${LINKS_P}"`)
    expect(r.headers.get('content-profile')).toBeNull()
  })

  it('HEAD parity: same status/headers as GET for self and redirect', async () => {
    const h1 = await fetch(mem, { method: 'HEAD', headers: { 'Accept-Profile': `<${CONTENT_P}>`, ...auth }, redirect: 'manual' })
    expect(h1.status).toBe(200)
    expect(h1.headers.get('content-profile')).toBe(`<${CONTENT_P}>`)
    const h2 = await fetch(mem, { method: 'HEAD', headers: { 'Accept-Profile': `<${LINKS_P}>`, ...auth }, redirect: 'manual' })
    expect(h2.status).toBe(303)
    expect(h2.headers.get('location')).toBe(links)
  })

  it('bare GET stays unnegotiated (no Content-Profile) but now advertises A1 alternates', async () => {
    const r = await fetch(mem, { headers: auth })
    expect(r.status).toBe(200)
    expect(r.headers.get('content-profile')).toBeNull()
    // Gateway round A1 (spec 2026-07-11 §4, fork merge 71da6f0): the bare 200
    // now carries canonical/alternate Links for discovery even without
    // Accept-Profile — supersedes this test's pre-round "no canonical Link"
    // claim (Phase-1 additivity meant "unnegotiated", not "no Link headers").
    expect(r.headers.get('link') || '').toContain('rel="canonical"')
    expect(await r.text()).toBe('# Memory A\n')
  })

  it('TypeSearch ?conformsTo composes: 200, and unknown target → empty (no-oracle)', async () => {
    const hit = await fetch(`${BASE}/types/search?conformsTo=${encodeURIComponent(LINKS_P)}`, { headers: auth })
    expect(hit.status).toBe(200)
    const miss = await fetch(`${BASE}/types/search?conformsTo=${encodeURIComponent(LINKS_P + 'X')}`, { headers: auth })
    expect(miss.status).toBe(200)
    expect((await miss.json()).items.length).toBe(0)
  })
})

describe.skipIf(!hasConneg)('LWS serving path (dataset seam, spec 2026-07-10)', () => {
  let token, auth, doc, ng
  beforeAll(async () => {
    await ensurePod()
    ;({ token } = await getToken())
    auth = { Authorization: `Bearer ${token}` }
    doc = `${BASE}/alice/servepath-graphdoc.jsonld`
    ng = `${BASE}/alice/servepath-namedgraph.jsonld`
    await fetch(doc, { method: 'PUT', headers: { 'Content-Type': 'application/ld+json', ...auth },
      body: JSON.stringify({ '@context': { name: 'https://schema.org/name' }, '@graph': [
        { '@id': `${doc}#a`, name: 'A' }, { '@id': `${doc}#b`, name: 'B' }] }) })
    await fetch(ng, { method: 'PUT', headers: { 'Content-Type': 'application/ld+json', ...auth },
      body: JSON.stringify({ '@context': { name: 'https://schema.org/name' }, '@id': `${ng}#g`, '@graph': [
        { '@id': `${ng}#a`, name: 'A' }] }) })
  })
  afterAll(async () => {
    for (const u of [doc, ng]) await fetch(u, { method: 'DELETE', headers: auth })
  })

  it('@graph doc serves real Turtle triples (probe-#4 family dead, live)', async () => {
    const r = await fetch(doc, { headers: { Accept: 'text/turtle', ...auth } })
    expect(r.status).toBe(200)
    const body = await r.text()
    expect(body).toContain('"A"')
    expect(body).toContain('"B"')
  })

  it('named graphs: Turtle 406-teaches, N-Quads serves losslessly', async () => {
    const ttl = await fetch(ng, { headers: { Accept: 'text/turtle', ...auth } })
    expect(ttl.status).toBe(406)
    const problem = await ttl.json()
    expect(problem.detail).toMatch(/named graphs/)
    expect(problem.detail).toMatch(/application\/n-quads/)
    const nq = await fetch(ng, { headers: { Accept: 'application/n-quads', ...auth } })
    expect(nq.status).toBe(200)
    expect(await nq.text()).toContain('#g>')
  })
})

describe.skipIf(!hasConneg)('openid-configuration behind the TLS proxy (S2)', () => {
  it('advertises the public issuer, never localhost', async () => {
    const r = await fetch(`${BASE}/.well-known/openid-configuration`)
    expect(r.status).toBe(200)
    const oc = await r.json()
    expect(oc.issuer.startsWith('https://pod.vardeman.me')).toBe(true)
    expect(JSON.stringify(oc)).not.toContain('localhost')
  })
})

describe.skipIf(!hasConneg)('WAC-filtered listing (S1, live)', () => {
  let token, auth, priv
  beforeAll(async () => {
    await ensurePod()
    ;({ token } = await getToken())
    auth = { Authorization: `Bearer ${token}` }
    priv = `${BASE}/alice/servepath-private.jsonld`
    // owner-only by the pod's default ACL inheritance under /alice/
    await fetch(priv, { method: 'PUT', headers: { 'Content-Type': 'application/ld+json', ...auth }, body: '{}' })
  })
  afterAll(async () => { await fetch(priv, { method: 'DELETE', headers: auth }) })

  it('anonymous listing hides the owner-only member; the owner sees it', async () => {
    const anon = await fetch(`${BASE}/alice/`, { headers: { Accept: 'application/ld+json' } })
    expect(anon.status).toBe(200)
    expect(await anon.text()).not.toContain('servepath-private')
    const owner = await fetch(`${BASE}/alice/`, { headers: { Accept: 'application/ld+json', ...auth } })
    expect(await owner.text()).toContain('servepath-private')
  })
})

// Gateway round (spec 2026-07-11) live cases — the sourceContentType seam both
// faces (non-RDF teaching 406), the bare-200/root-shadow affordance fixes
// (A1/A2), and the F1/F2/F5/F7 probe-#6 smalls. Fork merge 71da6f0.
describe.skipIf(!hasConneg)('teaching 406 on non-RDF sources (F3, live)', () => {
  let token, auth, md, json
  beforeAll(async () => {
    await ensurePod()
    ;({ token } = await getToken())
    auth = { Authorization: `Bearer ${token}` }
    md = `${BASE}/alice/public/wiki-f3.md`
    json = `${BASE}/alice/public/f3.json`
    await fetch(md, { method: 'PUT', headers: { 'Content-Type': 'text/markdown', ...auth }, body: '# F3\n' })
    await fetch(json, { method: 'PUT', headers: { 'Content-Type': 'application/json', ...auth }, body: '{"plain":true}' })
  })
  afterAll(async () => {
    for (const u of [md, json]) await fetch(u, { method: 'DELETE', headers: auth })
  })

  it('markdown as text/turtle → 406 problem+json naming the authored format and Accept-Profile', async () => {
    const r = await fetch(md, { headers: { Accept: 'text/turtle' } })
    expect(r.status).toBe(406)
    expect(r.headers.get('content-type').split(';')[0]).toBe('application/problem+json')
    const p = await r.json()
    expect(p.detail).toMatch(/text\/markdown/)
    expect(p.detail).toMatch(/Accept-Profile/)
  })

  it('plain JSON as text/turtle → 406 (the probe-#6 live-repro case, now teaching)', async () => {
    const r = await fetch(json, { headers: { Accept: 'text/turtle' } })
    expect(r.status).toBe(406)
    expect(r.headers.get('content-type').split(';')[0]).toBe('application/problem+json')
  })

  it('browser Accept → 200 unchanged (no F3 406 regression; mashlib-cdn wraps markdown as html on this rig)', async () => {
    const r = await fetch(md, { headers: { Accept: 'text/html,application/xhtml+xml,*/*;q=0.8' } })
    expect(r.status).toBe(200)
    // This rig runs --mashlib-cdn, which wraps viewable types (text/markdown
    // included) in an HTML data-browser shell whenever Accept explicitly
    // names text/html (JSS src/mashlib/index.js shouldServeMashlib) — a
    // pre-existing, unrelated feature. The claim under test is "no new 406",
    // not the exact content-type served for a browser-navigation Accept.
    expect(r.headers.get('content-type').split(';')[0]).toBe('text/html')
  })
})

describe.skipIf(!hasConneg)('bare-200 alternates (A1, live)', () => {
  it('GET /alice/wiki/a.md with no Accept-Profile carries rel="alternate" Link', async () => {
    const r = await fetch(`${BASE}/alice/wiki/a.md`)
    expect(r.status).toBe(200)
    const link = r.headers.get('link') || ''
    expect(link).toContain('rel="canonical"')
    expect(link).toContain('rel="alternate"')
    expect(link).toMatch(/formats="/)
  })
})

describe.skipIf(!hasConneg)('root listing by conneg (A2, live)', () => {
  it('GET / with Accept: application/lws+json lists top-level containers', async () => {
    const r = await fetch(`${BASE}/`, { headers: { Accept: 'application/lws+json' } })
    expect(r.status).toBe(200)
    const j = await r.json()
    expect(j.items.some((i) => i.id === `${BASE}/alice/`)).toBe(true)
  })
  it('GET / with a browser Accept still serves the HTML', async () => {
    const r = await fetch(`${BASE}/`, { headers: { Accept: 'text/html,application/xhtml+xml,*/*;q=0.8' } })
    expect(r.status).toBe(200)
    expect(r.headers.get('content-type').split(';')[0]).toBe('text/html')
  })
})

describe.skipIf(!hasConneg)('variant ETags + honest WAC-Allow + OPTIONS (F2/F1/F7, live)', () => {
  it('Turtle vs JSON-LD variant ETags differ on /alice/wiki/a.md.links.jsonld', async () => {
    const jsonld = await fetch(`${BASE}/alice/wiki/a.md.links.jsonld`, { headers: { Accept: 'application/ld+json' } })
    const ttl = await fetch(`${BASE}/alice/wiki/a.md.links.jsonld`, { headers: { Accept: 'text/turtle' } })
    expect(jsonld.status).toBe(200)
    expect(ttl.status).toBe(200)
    expect(ttl.headers.get('etag')).not.toBe(jsonld.headers.get('etag'))
    expect(ttl.headers.get('etag')).toMatch(/-ttl"$/)
  })

  it('anon GET /.acl → 401 with empty WAC-Allow grants', async () => {
    const r = await fetch(`${BASE}/alice/public/.acl`)
    expect(r.status).toBe(401)
    const wa = r.headers.get('wac-allow') || ''
    expect(wa).toMatch(/user=""/)
    expect(wa).toMatch(/public=""/)
  })

  it('OPTIONS / carries the storageDescription Link', async () => {
    const r = await fetch(`${BASE}/`, { method: 'OPTIONS' })
    expect(r.status).toBe(204)
    expect(r.headers.get('link') || '').toContain('rel="https://www.w3.org/ns/lws#storageDescription"')
  })
})

describe.skipIf(!hasConneg)('unified profile-406 (F5, live)', () => {
  it('unknown Accept-Profile on a.md → problem+json listing the conforming profiles', async () => {
    const r = await fetch(`${BASE}/alice/wiki/a.md`, { headers: { 'Accept-Profile': '<https://ex.org/profiles/nope>' } })
    expect(r.status).toBe(406)
    expect(r.headers.get('content-type').split(';')[0]).toBe('application/problem+json')
    const p = await r.json()
    expect(p.type).toBe('about:blank')
    expect(p.title).toBe('Not Acceptable')
    expect(p.status).toBe(406)
    expect(p.detail).toContain(`${BASE}/alice/profiles/okf-base.jsonld`)
    expect(p.detail).toContain(`${BASE}/alice/profiles/llm-wiki/profile.jsonld`)
    expect(p.instance).toBe(`${BASE}/alice/wiki/a.md`)
  })
})
