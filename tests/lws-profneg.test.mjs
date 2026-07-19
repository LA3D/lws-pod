import { describe, it, beforeAll, expect } from 'vitest'
import { BASE, ensurePod, getToken } from './helpers.mjs'

// PROF/conneg closeout acceptance gate (spec 2026-07-19 §5, matrix R12-R16):
// a NEUTRAL (non-wiki, non-DCAT) two-profile fixture under /alice/profneg/
// exercises the substrate mechanism opaquely — the fork never dereferences
// `https://profiles.invalid/neutral/*`, exact-string matching only — plus
// pins on the wiki family (P1 minted view profile, P2 per-face .meta) and
// the SD teaching hint (R16). Probe-once self-skip, mirroring
// tests/lws-conneg.test.mjs / tests/lws-services.test.mjs. Most requests use
// the owner bearer (trust-exempt from the anon rate limit); only V11's
// negative leg is intrinsically anon.
const sd = await fetch(`${BASE}/alice/lws-storage`, { headers: { Accept: 'application/lws+json' } })
  .then((r) => (r.ok ? r.json() : {})).catch(() => ({}))
const hasConneg = JSON.stringify(sd.capability || []).includes('connegp/profile/http')

const ALTR = 'http://www.w3.org/ns/dx/connegp/altr#'
const DCT = 'http://purl.org/dc/terms/'
const V = 'https://profiles.invalid/neutral'
const PROFNEG = '/alice/profneg/'
const WIKI = '/alice/wiki/'
const OKF_BASE = `${BASE}/alice/profiles/okf-base.jsonld`
const VIEW_PROFILE = `${BASE}/alice/profiles/llm-wiki/view.profile.jsonld`
const ALICE_WEBID = `${BASE}/alice/profile/card.jsonld#me`
const BROWSER = 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'

describe.skipIf(!hasConneg)('PROF/conneg closeout acceptance gate (spec 2026-07-19, R12-R16)', () => {
  let auth
  let doc, docData, docHtml, doc2, doc2Data, doc2Html
  let card, cardUrl, cardHtml

  async function writeAcl(path, authorizations) {
    const r = await fetch(`${BASE}/mcp`, { method: 'POST', headers: { ...auth, 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'write_acl', arguments: { path, authorizations } } }) })
    expect((await r.json()).result?.isError ?? false).toBe(false)
  }

  beforeAll(async () => {
    await ensurePod()
    const { token } = await getToken()
    auth = { Authorization: `Bearer ${token}` }

    doc = `${BASE}${PROFNEG}doc.md`
    docData = `${BASE}${PROFNEG}doc.md.data.jsonld`
    docHtml = `${BASE}${PROFNEG}doc.md.page.html`
    doc2 = `${BASE}${PROFNEG}doc2.md`
    doc2Data = `${BASE}${PROFNEG}doc2.md.data.jsonld`
    doc2Html = `${BASE}${PROFNEG}doc2.md.page.html`

    // doc.md fixture (V1-V10): shared alternates under one neutral profile pair.
    for (const [url, ct, body] of [
      [doc, 'text/markdown', '# neutral fixture\n'],
      [docData, 'application/ld+json', JSON.stringify({ '@id': '', x: 1 })],
      [docHtml, 'text/html', '<!DOCTYPE html><p>x</p>'],
    ]) {
      const r = await fetch(url, { method: 'PUT', headers: { 'Content-Type': ct, ...auth }, body })
      expect([200, 201, 204, 205]).toContain(r.status)
    }
    const docMeta = {
      '@context': { altr: ALTR, dct: DCT },
      '@id': '',
      'altr:hasDefaultRepresentation': { '@id': doc, 'dct:format': 'text/markdown', 'dct:conformsTo': { '@id': `${V}/md` } },
      'altr:hasRepresentation': [
        { '@id': docData, 'dct:format': 'application/ld+json', 'dct:conformsTo': { '@id': `${V}/shared` } },
        { '@id': docHtml, 'dct:format': 'text/html', 'dct:conformsTo': { '@id': `${V}/shared` } },
      ],
    }
    let r = await fetch(`${doc}.meta`, { method: 'PUT', headers: { 'Content-Type': 'application/ld+json', ...auth }, body: JSON.stringify(docMeta) })
    expect([200, 201, 204, 205]).toContain(r.status)

    // V3's own-default face: the neutral direct-alternate R12 pin (P2 shape, neutrally authored).
    const docFaceMeta = {
      '@context': { altr: ALTR, dct: DCT },
      '@id': '',
      'altr:hasDefaultRepresentation': { '@id': docHtml, 'dct:format': 'text/html', 'dct:conformsTo': { '@id': `${V}/view` } },
    }
    r = await fetch(`${docHtml}.meta`, { method: 'PUT', headers: { 'Content-Type': 'application/ld+json', ...auth }, body: JSON.stringify(docFaceMeta) })
    expect([200, 201, 204, 205]).toContain(r.status)

    // Public read on the fixture container — V1-V10 anon-shaped by nature; owner bearer used
    // throughout below to stay rate-limit-safe, except V11's intrinsically-anon leg.
    await writeAcl(PROFNEG, [
      { agentClasses: ['foaf:Agent'], modes: ['Read'], isDefault: true },
      { agents: [ALICE_WEBID], modes: ['Read', 'Write', 'Control'], isDefault: true },
    ])

    // doc2.md — V11's OWN fixture (unreadable alternate), so V1-V10 stay ACL-clean + idempotent.
    for (const [url, ct, body] of [
      [doc2, 'text/markdown', '# neutral fixture 2\n'],
      [doc2Data, 'application/ld+json', JSON.stringify({ '@id': '', x: 2 })],
      [doc2Html, 'text/html', '<!DOCTYPE html><p>y</p>'],
    ]) {
      const rr = await fetch(url, { method: 'PUT', headers: { 'Content-Type': ct, ...auth }, body })
      expect([200, 201, 204, 205]).toContain(rr.status)
    }
    const doc2Meta = {
      '@context': { altr: ALTR, dct: DCT },
      '@id': '',
      'altr:hasDefaultRepresentation': { '@id': doc2, 'dct:format': 'text/markdown', 'dct:conformsTo': { '@id': `${V}/md` } },
      'altr:hasRepresentation': [
        { '@id': doc2Data, 'dct:format': 'application/ld+json', 'dct:conformsTo': { '@id': `${V}/shared` } },
        { '@id': doc2Html, 'dct:format': 'text/html', 'dct:conformsTo': { '@id': `${V}/shared` } },
      ],
    }
    r = await fetch(`${doc2}.meta`, { method: 'PUT', headers: { 'Content-Type': 'application/ld+json', ...auth }, body: JSON.stringify(doc2Meta) })
    expect([200, 201, 204, 205]).toContain(r.status)

    // doc2's html alternate: owner-only (inherited public read overridden by its own .acl).
    await writeAcl(`${PROFNEG}doc2.md.page.html`, [{ agents: [ALICE_WEBID], modes: ['Read', 'Write', 'Control'] }])

    // Pick the seeded wiki card by listing, not a hard-coded name — first member
    // with a materialized .html face (a plain content .md, not index.md/loose.md).
    const listing = await fetch(`${BASE}${WIKI}`, { headers: { Accept: 'application/lws+json', ...auth } }).then((r2) => r2.json())
    const ids = (listing.items || []).map((i) => i.id ?? i['@id'])
    const cardId = ids.find((id) => id.endsWith('.md') && ids.includes(`${id}.html`))
    expect(cardId, `no wiki card with an .html face found in ${JSON.stringify(ids)}`).toBeTruthy()
    card = cardId.split('/').pop()
    cardUrl = `${BASE}${WIKI}${card}`
    cardHtml = `${cardUrl}.html`
  }, 60000)

  it('V1 R12: bare GET doc.md → 200, Content-Profile <V/md>, Link rel=profile', async () => {
    const r = await fetch(doc, { headers: auth })
    expect(r.status).toBe(200)
    expect(r.headers.get('content-profile')).toBe(`<${V}/md>`)
    expect(r.headers.get('link') || '').toContain(`<${V}/md>; rel="profile"`)
  })

  it('V2 R12: HEAD doc.md → same two headers (GET/HEAD parity)', async () => {
    const r = await fetch(doc, { method: 'HEAD', headers: auth })
    expect(r.status).toBe(200)
    expect(r.headers.get('content-profile')).toBe(`<${V}/md>`)
    expect(r.headers.get('link') || '').toContain(`<${V}/md>; rel="profile"`)
  })

  it('V3 R12: direct GET doc.md.page.html → Content-Profile <V/view> (per-face .meta)', async () => {
    const r = await fetch(docHtml, { headers: auth })
    expect(r.status).toBe(200)
    expect(r.headers.get('content-profile')).toBe(`<${V}/view>`)
  })

  it('V4 R14: Accept-Profile <V/shared> + Accept text/html → 303 to page.html', async () => {
    const r = await fetch(doc, { headers: { 'Accept-Profile': `<${V}/shared>`, Accept: 'text/html', ...auth }, redirect: 'manual' })
    expect(r.status).toBe(303)
    expect(r.headers.get('location')).toBe(docHtml)
  })

  it('V5 R14: same but Accept application/ld+json → 303 to data.jsonld', async () => {
    const r = await fetch(doc, { headers: { 'Accept-Profile': `<${V}/shared>`, Accept: 'application/ld+json', ...auth }, redirect: 'manual' })
    expect(r.status).toBe(303)
    expect(r.headers.get('location')).toBe(docData)
  })

  it('V6 R14: same, NO Accept → 303 to the FIRST declared alternate (data.jsonld)', async () => {
    const r = await fetch(doc, { headers: { 'Accept-Profile': `<${V}/shared>`, ...auth }, redirect: 'manual' })
    expect(r.status).toBe(303)
    expect(r.headers.get('location')).toBe(docData)
  })

  it('V7 R13: "<V/md>;q=0, <V/shared>;q=0.5" → 303 (q=0 discarded, shared wins)', async () => {
    const r = await fetch(doc, { headers: { 'Accept-Profile': `<${V}/md>;q=0, <${V}/shared>;q=0.5`, ...auth }, redirect: 'manual' })
    expect(r.status).toBe(303)
    expect(r.headers.get('location')).toBe(docData)
  })

  it('V8 R16: Accept-Profile <V/unknown> → 406 problem+json naming exact-URI subset + conforming profiles', async () => {
    const r = await fetch(doc, { headers: { 'Accept-Profile': `<${V}/unknown>`, ...auth } })
    expect(r.status).toBe(406)
    expect(r.headers.get('content-type').split(';')[0]).toBe('application/problem+json')
    const p = await r.json()
    expect(p.detail).toContain('exact profile URI')
    expect(p.detail).toContain(`${V}/md`)
    expect(p.detail).toContain(`${V}/shared`)
    const link = r.headers.get('link') || ''
    expect(link).toMatch(/rel="canonical"/)
    expect(link).toMatch(/rel="alternate"/)
    expect(link).toMatch(/formats="/)
  })

  it('V9 R15: If-None-Match from V1 + Accept-Profile <V/unknown> → still 406 (406 beats 304)', async () => {
    const bare = await fetch(doc, { headers: auth })
    const etag = bare.headers.get('etag')
    const r = await fetch(doc, { headers: { 'If-None-Match': etag, 'Accept-Profile': `<${V}/unknown>`, ...auth } })
    expect(r.status).toBe(406)
  })

  it('V10 R15: bare GET and Accept-Profile <V/md> GET share ETag; the latter is 200 (self)', async () => {
    const bare = await fetch(doc, { headers: auth })
    const neg = await fetch(doc, { headers: { 'Accept-Profile': `<${V}/md>`, ...auth } })
    expect(neg.status).toBe(200)
    expect(neg.headers.get('etag')).toBe(bare.headers.get('etag'))
  })

  it('V11: unreadable alternate — anon 303 skips the private page.html (jsonld wins); owner gets page.html', async () => {
    const anonReq = await fetch(doc2, { headers: { 'Accept-Profile': `<${V}/shared>`, Accept: 'text/html' }, redirect: 'manual' })
    expect(anonReq.status).toBe(303)
    expect(anonReq.headers.get('location')).toBe(doc2Data)
    expect(anonReq.headers.get('location')).not.toBe(doc2Html)

    const ownerReq = await fetch(doc2, { headers: { 'Accept-Profile': `<${V}/shared>`, Accept: 'text/html', ...auth }, redirect: 'manual' })
    expect(ownerReq.status).toBe(303)
    expect(ownerReq.headers.get('location')).toBe(doc2Html)
  })

  it('W1 wiki: bare GET seeded card → Content-Profile okf-base', async () => {
    const r = await fetch(cardUrl, { headers: auth })
    expect(r.status).toBe(200)
    expect(r.headers.get('content-profile')).toBe(`<${OKF_BASE}>`)
  })

  it('W2 wiki: Accept-Profile <llm-wiki/view.profile.jsonld> → 303 to card.html', async () => {
    const r = await fetch(cardUrl, { headers: { 'Accept-Profile': `<${VIEW_PROFILE}>`, ...auth }, redirect: 'manual' })
    expect(r.status).toBe(303)
    expect(r.headers.get('location')).toBe(cardHtml)
  })

  // W3 (live-corrected 2026-07-19 — see task-12 report "concerns"): the brief
  // predicted a 200-self markdown outcome (R14: okf-base now has exactly one
  // match since the html face was minted away to its own view profile). Live
  // verification shows a DIFFERENT, pre-existing mechanism wins first: any
  // browser-shaped Accept (text/html as a primary type) triggers the
  // Accept-Profile-agnostic face-dispatch redirect (spec 2026-07-15) to a
  // resource's declared html alternate — unconditionally, even though the
  // profile negotiation itself resolved definitively to 'self'. Reproduced
  // on the neutral V-fixture too (not wiki-specific): GET doc.md with
  // Accept-Profile <V/md> (single match, self) + Accept: text/html also 303s
  // to doc.md.page.html. Pinning the ACTUAL live behavior.
  it('W3 (live-verified): Accept-Profile <okf-base> (self, single R14 match) + browser Accept still 303s to the html face — face-dispatch precedence, not a profile-406/self', async () => {
    const r = await fetch(cardUrl, { headers: { 'Accept-Profile': `<${OKF_BASE}>`, Accept: 'text/html', ...auth }, redirect: 'manual' })
    expect(r.status).toBe(303)
    expect(r.headers.get('location')).toBe(cardHtml)
    expect(r.headers.get('content-profile')).toBeNull()
  })

  it('W4 wiki: direct GET card.html → Content-Profile view.profile.jsonld (instantiate-written face .meta)', async () => {
    const r = await fetch(cardHtml, { headers: auth })
    expect(r.status).toBe(200)
    expect(r.headers.get('content-profile')).toBe(`<${VIEW_PROFILE}>`)
  })

  it('W5: GET card.html?view=nav (browser Accept) → synthetic navigator view carries NO profile claim', async () => {
    const r = await fetch(`${cardHtml}?view=nav`, { headers: { Accept: BROWSER, ...auth } })
    expect(r.status).toBe(200)
    expect(r.headers.get('content-type').split(';')[0]).toBe('text/html')
    expect(r.headers.get('content-profile')).toBeNull()
    expect(r.headers.get('link') || '').not.toMatch(/rel="profile"/)
  })

  it('H1 R16: SD capability hint names the EXACT profile URI subset', async () => {
    const r = await fetch(`${BASE}/alice/lws-storage`, { headers: { Accept: 'application/lws+json', ...auth } })
    expect(r.status).toBe(200)
    const body = await r.json()
    const cap = (body.capability || []).find((c) => c.type === 'http://www.w3.org/ns/dx/connegp/profile/http')
    expect(cap).toBeTruthy()
    expect(cap.hint).toContain('EXACT profile URI')
  })
})
