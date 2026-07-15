import { describe, it, beforeAll, expect } from 'vitest'
import { BASE, ensurePod, getToken } from './helpers.mjs'
import { runOnce } from '../apps/wiki-projector/triggers/run.mjs'

// Human-viewing-surface live gate (spec 2026-07-15 §7, navigator round): the
// fork's text/html face dispatch + container/entity/root navigator views,
// exercised end-to-end against the fork-navigator rig (--mashlib-cdn retired
// under --lws). Seed recipe mirrors tests/lws-wiki.test.mjs (idempotent
// re-seed: cards -> public-read ACL -> bind -> instantiate), then extends it
// with a face-less card (for the I1 stale-ETag fix) and a private card (for
// the C1 ACL-mirror fix) materialized via a SECOND instantiate pass — the
// JS equivalent of `make reinstantiate` for a bound (non-datasets) container.
const WIKI = '/alice/wiki/'
const LLM_WIKI = `${BASE}/alice/profiles/llm-wiki/profile.jsonld`
const DCT = 'http://purl.org/dc/terms/'
const POWDER = 'http://www.w3.org/2007/05/powder-s#'
const BROWSER = 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'

const sd = await fetch(`${BASE}/.well-known/lws-storage`, { headers: { Accept: 'application/lws+json' } })
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
const CARD_C = `---
type: llm-wiki-colab:Project
title: Gamma
---
Gamma prose — seeded face-less, materialized mid-test (I1 fix).`
const CARD_PRIV = `---
type: llm-wiki-colab:Project
title: Private
---
Private prose — must never leak past its own ACL (C1 fix).`

describe.skipIf(!hasConneg)('viewer: navigator round live gate (spec 2026-07-15 §7)', () => {
  let token, webid, auth, staleCEtag

  beforeAll(async () => {
    await ensurePod()
    ;({ token, webid } = await getToken())
    auth = { Authorization: `Bearer ${token}` }
    const prof = await fetch(LLM_WIKI)
    if (!prof.ok) throw new Error(`llm-wiki descriptor unreachable (${prof.status}) — run 'make publish-profiles' first`)

    // Re-run safety: this suite's c.md/priv.md fixtures are order-sensitive
    // (c.md must be pre-face when the FIRST instantiate pass runs; priv.md
    // must not exist yet either, or the first pass would try — and, with a
    // stale prior-run ACL, fail — to materialize its faces too). A prior run
    // of this suite against this persistent live pod leaves both behind, so
    // wipe them (+ sidecars) before doing anything else.
    for (const u of ['c.md.html', 'c.md.html.acl', 'c.md.meta', 'c.md.links.jsonld', 'c.md',
      'priv.md.html', 'priv.md.html.acl', 'priv.md.links.jsonld', 'priv.md.links.jsonld.acl', 'priv.md.meta', 'priv.md.acl', 'priv.md'])
      await fetch(`${BASE}${WIKI}${u}`, { method: 'DELETE', headers: auth })

    // Recipe: cards -> public-read ACL -> bind -> instantiate (same as lws-wiki.test.mjs).
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

    const metaUrl = `${BASE}${WIKI}.meta`
    let meta = {}
    const r0 = await fetch(metaUrl, { headers: { ...auth, accept: 'application/ld+json' } })
    if (r0.ok) { try { meta = await r0.json() } catch { meta = {} } }
    meta['@context'] = { ...(typeof meta['@context'] === 'object' && !Array.isArray(meta['@context']) ? meta['@context'] : {}), dct: DCT, powder: POWDER }
    meta['@id'] = meta['@id'] ?? ''
    meta['dct:conformsTo'] = { '@id': LLM_WIKI }
    const { loadProfile } = await import('../projection/prof/profile-loader.mjs')
    meta['powder:describedby'] = (await loadProfile(LLM_WIKI)).validation.map((v) => ({ '@id': v }))
    const rb = await fetch(metaUrl, { method: 'PUT', headers: { ...auth, 'content-type': 'application/ld+json' }, body: JSON.stringify(meta) })
    expect([200, 201, 204, 205]).toContain(rb.status)

    // First instantiate pass: materializes a.md.html/b.md.html + the
    // container-level html/index-html/viz/index/graph representations.
    const res = await runOnce(`${BASE}${WIKI}`, token)
    const bad = res.filter((r) => typeof r.status === 'number' && ![200, 201, 204, 205].includes(r.status))
    expect(bad, JSON.stringify(bad)).toEqual([])

    // c.md: seeded AFTER the first instantiate pass, so it has no face yet —
    // a browser GET of it right now must land on the navigator entity face
    // (not a 303), and its ETag must carry the '-nav' variant. Captured here
    // so the I1 regression (a stale -nav ETag masking a newly materialized
    // face) can be exercised once c.md.html exists.
    const cRes = await fetch(`${BASE}${WIKI}c.md`, { method: 'PUT', headers: { 'Content-Type': 'text/markdown', ...auth }, body: CARD_C })
    expect([200, 201, 204, 205]).toContain(cRes.status)
    const navProbe = await fetch(`${BASE}${WIKI}c.md`, { headers: { Accept: BROWSER }, redirect: 'manual' })
    expect(navProbe.status).toBe(200)
    staleCEtag = navProbe.headers.get('etag')
    expect(staleCEtag).toMatch(/-nav"$/)

    // priv.md: owner-only member ACL via the MCP write_acl tool (task-10
    // finding: a raw HTTP PUT of ANY JSON-LD `.acl` document — including
    // one with an absolute acl:accessTo — lands on the SAME SHACL admission
    // path as any other write, and the substrate's base floor shape ("every
    // rdf:type'd subject needs a title") rejects an acl:Authorization node
    // outright on a real profile-bound container like this one. write_acl
    // is the substrate's dedicated WAC write path and is admission-exempt
    // by design; mirrorAcl (fixed below, this task) now routes through it
    // too, for exactly this reason.
    const privRes = await fetch(`${BASE}${WIKI}priv.md`, { method: 'PUT', headers: { 'Content-Type': 'text/markdown', ...auth }, body: CARD_PRIV })
    expect([200, 201, 204, 205]).toContain(privRes.status)
    const privAcl = await fetch(`${BASE}/mcp`, { method: 'POST', headers: { ...auth, 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'write_acl', arguments: {
        path: `${WIKI}priv.md`, authorizations: [
          { agents: [webid], modes: ['Read', 'Write', 'Control'], isDefault: false },
        ] } } }) })
    expect((await privAcl.json()).result?.isError ?? false).toBe(false)

    // Second instantiate pass ("make reinstantiate" for a bound container,
    // in-process): materializes c.md.html (the I1 fixture) and priv.md.html
    // WITH its ACL mirrored from priv.md.acl (the C1 fix) — a source with
    // its own .acl blocks the face PUT until the mirror succeeds.
    const res2 = await runOnce(`${BASE}${WIKI}`, token)
    const bad2 = res2.filter((r) => typeof r.status === 'number' && ![200, 201, 204, 205].includes(r.status))
    expect(bad2, JSON.stringify(bad2)).toEqual([])
  }, 120000)

  it('1. GET /alice/wiki/a.md.html -> 200 text/html, card body + edge to b.md.html', async () => {
    const r = await fetch(`${BASE}${WIKI}a.md.html`)
    expect(r.status).toBe(200)
    expect(r.headers.get('content-type').split(';')[0]).toBe('text/html')
    const body = await r.text()
    expect(body).toContain('<h1>Alpha</h1>')
    expect(body).toContain('b.md.html')
  })

  it('2. GET /alice/wiki/index.html -> 200 text/html, lists a.md.html', async () => {
    const r = await fetch(`${BASE}${WIKI}index.html`)
    expect(r.status).toBe(200)
    expect(r.headers.get('content-type').split(';')[0]).toBe('text/html')
    expect(await r.text()).toContain('a.md.html')
  })

  it('3. GET /alice/wiki/viz.html -> 200 text/html, self-contained graph viewer', async () => {
    const r = await fetch(`${BASE}${WIKI}viz.html`)
    expect(r.status).toBe(200)
    const body = await r.text()
    expect(body).toContain('cytoscape')
    expect(body).toContain("fetch('graph.jsonld')")
  })

  it('4. GET /alice/wiki/a.md w/ browser Accept, redirect:manual -> 303, Location ends a.md.html', async () => {
    const r = await fetch(`${BASE}${WIKI}a.md`, { headers: { Accept: BROWSER }, redirect: 'manual' })
    expect(r.status).toBe(303)
    expect(r.headers.get('location')).toBe(`${BASE}${WIKI}a.md.html`)
  })

  it('4b. stale pre-face -nav ETag on c.md now 303s to the materialized face (I1 fix, live)', async () => {
    const r = await fetch(`${BASE}${WIKI}c.md`, { headers: { Accept: BROWSER, 'If-None-Match': staleCEtag }, redirect: 'manual' })
    expect(r.status).toBe(303)
    expect(r.headers.get('location')).toBe(`${BASE}${WIKI}c.md.html`)
  })

  it('5. GET /alice/wiki/ w/ browser Accept -> 200, = index.html bytes (A2 shadow)', async () => {
    const shadow = await fetch(`${BASE}${WIKI}`, { headers: { Accept: BROWSER } })
    expect(shadow.status).toBe(200)
    expect(shadow.headers.get('content-type').split(';')[0]).toBe('text/html')
    const face = await fetch(`${BASE}${WIKI}index.html`)
    expect(await shadow.text()).toBe(await face.text())
  })

  it('6. GET /id/a w/ browser Accept, follow redirects -> final 200 text/html w/ <h1>Alpha</h1>', async () => {
    const r = await fetch(`${BASE}/id/a`, { headers: { Accept: BROWSER } })
    expect(r.status).toBe(200)
    expect(r.headers.get('content-type').split(';')[0]).toBe('text/html')
    expect(await r.text()).toContain('<h1>Alpha</h1>')
  })

  it('7. GET /alice/ w/ browser Accept -> 200 text/html navigator view, contains wiki', async () => {
    const r = await fetch(`${BASE}/alice/`, { headers: { Accept: BROWSER } })
    expect(r.status).toBe(200)
    expect(r.headers.get('content-type').split(';')[0]).toBe('text/html')
    expect(await r.text()).toContain('wiki')
  })

  it('8. GET /?view=nav w/ browser Accept -> 200 text/html, contains Storage', async () => {
    const r = await fetch(`${BASE}/?view=nav`, { headers: { Accept: BROWSER } })
    expect(r.status).toBe(200)
    expect(r.headers.get('content-type').split(';')[0]).toBe('text/html')
    expect(await r.text()).toContain('Storage')
  })

  it('9. private member (C1 live): anon face 401/403, listing omits both, owner sees the face', async () => {
    const anonFace = await fetch(`${BASE}${WIKI}priv.md.html`)
    expect([401, 403]).toContain(anonFace.status)

    const anonList = await fetch(`${BASE}${WIKI}`, { headers: { Accept: 'application/lws+json' } })
    expect(anonList.status).toBe(200)
    const items = (await anonList.json()).items.map((i) => i.id)
    expect(items.some((i) => i.endsWith('/priv.md'))).toBe(false)
    expect(items.some((i) => i.endsWith('/priv.md.html'))).toBe(false)

    const ownerFace = await fetch(`${BASE}${WIKI}priv.md.html`, { headers: auth })
    expect(ownerFace.status).toBe(200)
    expect(await ownerFace.text()).toContain('Private')
  })

  it('10. GET /alice/wiki/graph.jsonld (anon) -> 200 application/ld+json', async () => {
    const r = await fetch(`${BASE}${WIKI}graph.jsonld`)
    expect(r.status).toBe(200)
    expect(r.headers.get('content-type').split(';')[0]).toBe('application/ld+json')
  })
})
