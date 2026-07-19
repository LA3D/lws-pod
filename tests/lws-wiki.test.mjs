import { describe, it, beforeAll, expect } from 'vitest'
import { BASE, ensurePod, getToken } from './helpers.mjs'
import { runOnce } from '../apps/wiki-projector/triggers/run.mjs'

// Phase-2 wiki gate (spec §6/§10 #2): the re-derived family live — content is
// canonical + ungoverned, links are materialized + SHACL-floor-governed, the
// Phase-1 conneg surface selects between them. beforeAll is the app onboarding
// recipe (bind + ACL + instantiate); profiles come from `make publish-profiles`.
const WIKI = '/alice/wiki/'
const LLM_WIKI = `${BASE}/alice/profiles/llm-wiki/profile.jsonld`
const OKF_BASE = `${BASE}/alice/profiles/okf-base.jsonld`
const VIEW_PROFILE = `${BASE}/alice/profiles/llm-wiki/view.profile.jsonld`
const DCT = 'http://purl.org/dc/terms/'
const POWDER = 'http://www.w3.org/2007/05/powder-s#'

// capability[] is advertised per-storage (multi-tenant round) — the
// well-known root is a ServerIndex with no capability[] of its own.
const sd = await fetch(`${BASE}/alice/lws-storage`, { headers: { Accept: 'application/lws+json' } })
  .then((r) => (r.ok ? r.json() : {})).catch(() => ({}))
const hasConneg = JSON.stringify(sd.capability || []).includes('connegp/profile/http')

const CARD_A = `---
type: llm-wiki-colab:Project
title: Alpha
up: b.md
---
Alpha prose — content the graph never sees.`
const CARD_B = `---
type: llm-wiki-colab:MOC
title: Beta
---
Beta prose.`

describe.skipIf(!hasConneg)('LWS wiki family — instantiation + conneg-by-profile (probe-#5 surface)', () => {
  let token, auth
  beforeAll(async () => {
    await ensurePod()
    ;({ token } = await getToken())
    auth = { Authorization: `Bearer ${token}` }
    // Profiles must be published — fail loud with the fix, never skip (mcp-v2 lesson).
    const prof = await fetch(LLM_WIKI)
    if (!prof.ok) throw new Error(`llm-wiki descriptor unreachable (${prof.status}) — run 'make publish-profiles' first`)
    if (!JSON.stringify(await prof.json()).includes('representation')) throw new Error('llm-wiki descriptor has no representation resources — re-run make publish-profiles')

    // Recipe: cards -> public-read ACL -> bind -> instantiate.
    for (const [name, body] of [['a.md', CARD_A], ['b.md', CARD_B]]) {
      const r = await fetch(`${BASE}${WIKI}${name}`, { method: 'PUT', headers: { 'Content-Type': 'text/markdown', ...auth }, body })
      expect([200, 201, 204, 205]).toContain(r.status)
    }
    const acl = await fetch(`${BASE}/mcp`, { method: 'POST', headers: { ...auth, 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'write_acl', arguments: {
        path: WIKI, authorizations: [
          { agentClasses: ['foaf:Agent'], modes: ['Read'], isDefault: true },
          { agents: [`${BASE}/alice/profile/card.jsonld#me`], modes: ['Read', 'Write', 'Control'], isDefault: true },
        ] } } }) })
    expect((await acl.json()).result?.isError ?? false).toBe(false)

    // Bind BEFORE instantiate: read-merge-write conformsTo + describedby (the dcat recipe).
    const metaUrl = `${BASE}${WIKI}.meta`
    let meta = {}
    const r0 = await fetch(metaUrl, { headers: { ...auth, accept: 'application/ld+json' } })
    if (r0.ok) { try { meta = await r0.json() } catch { meta = {} } }
    meta['@context'] = { ...(typeof meta['@context'] === 'object' && !Array.isArray(meta['@context']) ? meta['@context'] : {}), dct: DCT, powder: POWDER }
    meta['@id'] = meta['@id'] ?? ''
    meta['dct:conformsTo'] = { '@id': LLM_WIKI }
    // describedby = the profile's own walked validation artifacts — exactly what publish's bind writes.
    const { loadProfile } = await import('../projection/prof/profile-loader.mjs')
    meta['powder:describedby'] = (await loadProfile(LLM_WIKI)).validation.map((v) => ({ '@id': v }))
    const rb = await fetch(metaUrl, { method: 'PUT', headers: { ...auth, 'content-type': 'application/ld+json' }, body: JSON.stringify(meta) })
    expect([200, 201, 204, 205]).toContain(rb.status)

    const res = await runOnce(`${BASE}${WIKI}`, token)
    const bad = res.filter((r) => r.status && ![200, 201, 204, 205].includes(r.status))
    expect(bad, JSON.stringify(bad)).toEqual([])
  }, 120000)

  it('links rep materialized: flat #it JSON-LD, minted subject + typed edge, floor-admitted', async () => {
    const r = await fetch(`${BASE}${WIKI}a.md.links.jsonld`, { headers: auth })
    expect(r.status).toBe(200)
    const doc = await r.json()
    expect(doc['@id']).toMatch(/id\/a#it$/)
    expect(JSON.stringify(doc)).toMatch(/id\/b#it/)                 // up: b.md
  })

  it('content is canonical + ungoverned; links are governed (spec §3 jurisdiction)', async () => {
    // markdown w/o title admits — SHACL is not content's business
    const md = await fetch(`${BASE}${WIKI}loose.md`, { method: 'PUT', headers: { 'Content-Type': 'text/markdown', ...auth }, body: 'no frontmatter at all' })
    expect([200, 201, 204, 205]).toContain(md.status)
    // a typed links doc without dcterms:title violates the floor: teaching 400
    const bad = await fetch(`${BASE}${WIKI}bad.links.jsonld`, { method: 'PUT', headers: { 'Content-Type': 'application/ld+json', ...auth },
      body: JSON.stringify({ '@context': { 'llm-wiki-colab': 'https://la3d.github.io/llm-wiki-colab/ontology#' }, '@id': `${BASE}${WIKI}bad#it`, '@type': 'llm-wiki-colab:Project' }) })
    expect(bad.status).toBe(400)
    const problem = await bad.json()
    expect(JSON.stringify(problem.violations)).toContain('title')
    // a valid links doc admits
    const good = await fetch(`${BASE}${WIKI}good.links.jsonld`, { method: 'PUT', headers: { 'Content-Type': 'application/ld+json', ...auth },
      body: JSON.stringify({ '@context': { 'llm-wiki-colab': 'https://la3d.github.io/llm-wiki-colab/ontology#', dct: DCT }, '@id': `${BASE}${WIKI}good#it`, '@type': 'llm-wiki-colab:Project', 'dct:title': 'Good' }) })
    expect([200, 201]).toContain(good.status)
  })

  it('member linkset advertises canonical(content/okf-base) + alternate(links/llm-wiki, html/view-profile)', async () => {
    // Navigator round (2026-07-15): llm-wiki's profile gained a member-level
    // `html` representation (the card face) alongside `links` — a.md now
    // materializes TWO suffix reps, so the alternate array carries both.
    // Order is an instantiate() implementation detail, not a spec claim —
    // compared sorted-by-href instead of pinning array order.
    // PROF/conneg closeout round (P1): the html face now conforms to its own
    // minted view profile, not the generic okf-base floor — supersedes this
    // test's pre-round okf-base pin for the html alternate.
    const r = await fetch(`${BASE}${WIKI}a.md`, { headers: { Accept: 'application/linkset+json', ...auth } })
    expect(r.status).toBe(200)
    const link = (await r.json()).linkset[0]
    expect(link.canonical).toEqual([{ href: `${BASE}${WIKI}a.md`, type: 'text/markdown', formats: OKF_BASE }])
    const sortedAlts = [...link.alternate].sort((a, b) => a.href.localeCompare(b.href))
    expect(sortedAlts).toEqual([
      { href: `${BASE}${WIKI}a.md.html`, type: 'text/html', formats: VIEW_PROFILE },
      { href: `${BASE}${WIKI}a.md.links.jsonld`, type: 'application/ld+json', formats: LLM_WIKI },
    ])
  })

  it('Accept-Profile selects: okf-base -> 200 markdown self; llm-wiki -> 303 to links', async () => {
    const self = await fetch(`${BASE}${WIKI}a.md`, { headers: { 'Accept-Profile': `<${OKF_BASE}>`, ...auth }, redirect: 'manual' })
    expect(self.status).toBe(200)
    expect(self.headers.get('content-profile')).toBe(`<${OKF_BASE}>`)
    expect(await self.text()).toContain('Alpha prose')
    const links = await fetch(`${BASE}${WIKI}a.md`, { headers: { 'Accept-Profile': `<${LLM_WIKI}>`, ...auth }, redirect: 'manual' })
    expect(links.status).toBe(303)
    expect(links.headers.get('location')).toBe(`${BASE}${WIKI}a.md.links.jsonld`)
  })

  it('bare GET stays unnegotiated by Accept-Profile, but now stamps Content-Profile from .meta (R12)', async () => {
    // PROF/conneg closeout round (R12): un-negotiated bare GET/HEAD now carries
    // Content-Profile derived from the resource's own .meta default representation
    // — supersedes this test's pre-round "no Content-Profile on bare GET" claim
    // (Phase-1 additivity meant "unnegotiated by Accept-Profile", not "no header").
    const r = await fetch(`${BASE}${WIKI}a.md`, { headers: auth })
    expect(r.status).toBe(200)
    expect(r.headers.get('content-profile')).toBe(`<${OKF_BASE}>`)
    expect(await r.text()).toContain('Alpha prose')
  })

  it('aggregate graph.jsonld: dataset form, one named graph per card, doc-IRI names', async () => {
    const r = await fetch(`${BASE}${WIKI}graph.jsonld`, { headers: auth })
    expect(r.status).toBe(200)
    const doc = await r.json()
    const names = doc['@graph'].map((g) => g['@id'])
    expect(names.some((n) => /id\/a$/.test(n))).toBe(true)          // fragment-stripped doc IRI
    expect(names.every((n) => !n.includes('#'))).toBe(true)
  })

  it('index.md rendered: OKF navigation channel lists the cards', async () => {
    const r = await fetch(`${BASE}${WIKI}index.md`, { headers: auth })
    expect(r.status).toBe(200)
    const md = await r.text()
    expect(md).toContain('[Alpha](a.md)')
    expect(md).toContain('# Projects')
  })

  it('container linkset advertises the container-level alternates (index + graph)', async () => {
    const r = await fetch(`${BASE}${WIKI}`, { headers: { Accept: 'application/linkset+json', ...auth } })
    expect(r.status).toBe(200)
    const link = (await r.json()).linkset[0]
    const alts = (link.alternate ?? []).map((a) => a.href)
    expect(alts).toContain(`${BASE}${WIKI}graph.jsonld`)
    expect(alts).toContain(`${BASE}${WIKI}index.md`)
  })

  it('TypeSearch conformsTo=llm-wiki finds the bound container (indexed-relation seam)', async () => {
    const r = await fetch(`${BASE}/types/search?conformsTo=${encodeURIComponent(LLM_WIKI)}`, { headers: auth })
    expect(r.status).toBe(200)
    expect((await r.json()).items.map((i) => i.id ?? i['@id'] ?? i.url ?? '').join(' ')).toContain('/alice/wiki/')
  })
})
