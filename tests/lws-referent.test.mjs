import { describe, it, beforeAll, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { BASE, ensurePod, getToken } from './helpers.mjs'
import { runOnce } from '../apps/wiki-projector/triggers/run.mjs'
import { discoverBinding, loadProfile } from '../projection/prof/profile-loader.mjs'

// Referent identity & discovery live gate (spec 2026-07-13 §8/§9): the `/id/`
// name-space resolver (algorithmic 303, no-oracle) + the referent-type-search
// enrichment (a stored RDF resource is indexed by its subject's rdf:type
// ALONGSIDE lws#DataResource, never replacing it). Self-skips on a pod that
// doesn't advertise the ReferentResolution capability.
const WIKI = '/alice/wiki/'
const LLM_WIKI = `${BASE}/alice/profiles/llm-wiki/profile.jsonld`
const LLM_WIKI_SHAPES = `${BASE}/alice/profiles/llm-wiki/shapes.ttl`
const DCAT_CATALOG = `${BASE}/alice/profiles/dcat-catalog/profile.jsonld`
const DCAT_SHAPES = `${BASE}/alice/profiles/dcat-catalog/shapes.ttl`
const DCT = 'http://purl.org/dc/terms/'
const POWDER = 'http://www.w3.org/2007/05/powder-s#'
const PROJECT_TYPE = 'https://la3d.github.io/llm-wiki-colab/ontology#Project'
const DATA_RESOURCE_TYPE = 'https://www.w3.org/ns/lws#DataResource'
const DCAT_DATASET_TYPE = 'http://www.w3.org/ns/dcat#Dataset'
const REFERENT_CAP = 'https://w3id.org/lws-pod/capability/ReferentResolution'

const DIR = '/alice/profiles/dcat-catalog/'
const DATASETS = '/alice/datasets/'
const dcatDefs = (rel) => new URL(`../projection/profiles/defs/dcat-catalog/${rel}`, import.meta.url)

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

const sd = await fetch(`${BASE}/.well-known/lws-storage`, { headers: { Accept: 'application/lws+json' } })
  .then((r) => (r.ok ? r.json() : {})).catch(() => ({}))
const hasReferentCap = (sd.capability || []).some((c) => c.type === REFERENT_CAP)

describe.skipIf(!hasReferentCap)('LWS referent identity & discovery (Phase 1+2 live gate, spec §8/§9)', () => {
  let token, auth

  beforeAll(async () => {
    await ensurePod()
    ;({ token } = await getToken())
    auth = { Authorization: `Bearer ${token}` }

    // --- wiki fixture: same recipe as tests/lws-wiki.test.mjs (idempotent re-seed) ---
    const prof = await fetch(LLM_WIKI)
    if (!prof.ok) throw new Error(`llm-wiki descriptor unreachable (${prof.status}) — run 'make publish-profiles' first`)

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
    meta['powder:describedby'] = (await loadProfile(LLM_WIKI)).validation.map((v) => ({ '@id': v }))
    const rb = await fetch(metaUrl, { method: 'PUT', headers: { ...auth, 'content-type': 'application/ld+json' }, body: JSON.stringify(meta) })
    expect([200, 201, 204, 205]).toContain(rb.status)

    const res = await runOnce(`${BASE}${WIKI}`, token)
    const bad = res.filter((r) => r.status && ![200, 201, 204, 205].includes(r.status))
    expect(bad, JSON.stringify(bad)).toEqual([])

    // --- DCAT fixture: same recipe as tests/lws-dcat.test.mjs (idempotent re-seed) ---
    for (const [name, ct] of [['profile.jsonld', 'application/ld+json'], ['context.jsonld', 'application/ld+json'], ['shapes.ttl', 'text/turtle']]) {
      const r = await fetch(`${BASE}${DIR}${name}`, { method: 'PUT',
        headers: { ...auth, 'content-type': ct }, body: readFileSync(dcatDefs(name)) })
      expect([200, 201, 204, 205]).toContain(r.status)
    }
    const aclDatasets = await fetch(`${BASE}/mcp`, { method: 'POST', headers: { ...auth, 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'write_acl', arguments: {
        path: DATASETS, authorizations: [
          { agentClasses: ['foaf:Agent'], modes: ['Read'], isDefault: true },
          { agents: [`${BASE}/alice/profile/card.jsonld#me`], modes: ['Read', 'Write', 'Control'], isDefault: true },
        ] } } }) })
    expect((await aclDatasets.json()).result?.isError ?? false).toBe(false)

    const dsMetaUrl = `${BASE}${DATASETS}.meta`
    let dsMeta = {}
    const rds0 = await fetch(dsMetaUrl, { headers: { ...auth, accept: 'application/ld+json' } })
    if (rds0.ok) { try { dsMeta = await rds0.json() } catch { dsMeta = {} } }
    dsMeta['@context'] = { ...(typeof dsMeta['@context'] === 'object' && !Array.isArray(dsMeta['@context']) ? dsMeta['@context'] : {}), dct: DCT, powder: POWDER }
    dsMeta['@id'] = dsMeta['@id'] ?? ''
    dsMeta['dct:conformsTo'] = { '@id': DCAT_CATALOG }
    dsMeta['powder:describedby'] = [{ '@id': DCAT_SHAPES }]
    const rdsb = await fetch(dsMetaUrl, { method: 'PUT', headers: { ...auth, 'content-type': 'application/ld+json' }, body: JSON.stringify(dsMeta) })
    expect([200, 201, 204, 205]).toContain(rdsb.status)

    const seed = { '@context': { dcat: 'http://www.w3.org/ns/dcat#', dct: DCT }, '@id': '#it', '@type': 'dcat:Dataset', 'dct:title': 'Referent-gate seed dataset' }
    const rSeed = await fetch(`${BASE}${DATASETS}referent-seed.jsonld`, { method: 'PUT',
      headers: { ...auth, 'content-type': 'application/ld+json' }, body: JSON.stringify(seed) })
    expect([200, 201, 204, 205]).toContain(rSeed.status)
  }, 120000)

  it('1. capability: storage description advertises URI-typed ReferentResolution', () => {
    const types = (sd.capability || []).map((c) => c.type)
    expect(types).toContain(REFERENT_CAP)
    expect(types).toContain('http://www.w3.org/ns/dx/connegp/profile/http')
  })

  it('2. name deref (headline): anonymous GET /id/a 303s to the card, with rel="canonical"', async () => {
    const r = await fetch(`${BASE}/id/a`, { redirect: 'manual' })
    expect(r.status).toBe(303)
    expect(r.headers.get('location')).toBe(`${BASE}${WIKI}a.md`)
    expect(r.headers.get('link')).toContain('rel="canonical"')
  })

  it('3. no-oracle: an unminted name 404-hides (not a leaking 303-then-401)', async () => {
    const r = await fetch(`${BASE}/id/nonexistent-xyz`, { redirect: 'manual' })
    expect(r.status).toBe(404)
  })

  it('4. referent-type search (enrich): finds the links rep by the referent\'s real type, alongside DataResource', async () => {
    const r = await fetch(`${BASE}/types/search?type=${encodeURIComponent(PROJECT_TYPE)}`, { headers: auth })
    expect(r.status).toBe(200)
    const page = await r.json()
    expect(page.type).toBe('ContainerPage')
    const item = page.items.find((i) => i.id === `${BASE}${WIKI}a.md.links.jsonld`)
    expect(item).toBeTruthy()
    const types = [].concat(item.type)
    expect(types.some((t) => t === DATA_RESOURCE_TYPE || t === 'DataResource')).toBe(true)
    expect(types).toContain(PROJECT_TYPE)
  })

  it('5. enrich control: the native lws#DataResource filter still matches the same resource', async () => {
    const r = await fetch(`${BASE}/types/search?type=${encodeURIComponent(DATA_RESOURCE_TYPE)}`, { headers: auth })
    expect(r.status).toBe(200)
    const page = await r.json()
    expect(page.items.some((i) => i.id === `${BASE}${WIKI}a.md.links.jsonld`)).toBe(true)
  })

  it('6. DCAT degradation: referent-type search works for dcat:Dataset; no pathPrefix declared for it (clean degradation)', async () => {
    const r = await fetch(`${BASE}/types/search?type=${encodeURIComponent(DCAT_DATASET_TYPE)}`, { headers: auth })
    expect(r.status).toBe(200)
    const page = await r.json()
    expect(page.items.some((i) => i.id === `${BASE}${DATASETS}referent-seed.jsonld`)).toBe(true)

    const cfg = await fetch(`${BASE}/alice/profiles/pod-config.jsonld`).then((res) => res.json())
    expect(cfg.uriSpaces).toEqual([{ pathPrefix: '/id/', container: '/alice/wiki/', suffix: '.md' }])
  })
})

// Task 8 read-semantics confirmations (spec §6): the leanings already design-of-
// record in iri-minting.md "read-side plane mapping (RESOLVED)" (c), confirmed
// against live fixtures — not reopened.
describe.skipIf(!hasReferentCap)('read semantics — confirm the leanings (Task 8)', () => {
  let token, auth, authedFetch
  const GOV = '/alice/referent-govtest/'
  const GOV_PLURAL = '/alice/referent-plural/'

  beforeAll(async () => {
    await ensurePod()
    ;({ token } = await getToken())
    auth = { Authorization: `Bearer ${token}` }
    // GOV/GOV_PLURAL are owner-private by JSS default (no ACL set, unlike the
    // wiki/dcat fixtures) — discoverBinding needs an authed fetchFn to read
    // their .meta at all; the pod's own admission path uses its own privileged
    // access, so this is only a test-harness concern, not a server one.
    authedFetch = (url, opts = {}) => fetch(url, { ...opts, headers: { ...opts.headers, ...auth } })

    // Bind GOV to llm-wiki ONLY — the pod's manifest defaultProfile is okf-base.jsonld
    // (confirmed: projection/profiles/defs/index.jsonld), so a member here is governed
    // by the CONTAINER's own conformsTo, never falling through to the pod-wide default.
    const govMeta = { '@context': { dct: DCT, powder: POWDER }, '@id': '',
      'dct:conformsTo': { '@id': LLM_WIKI }, 'powder:describedby': [{ '@id': LLM_WIKI_SHAPES }] }
    const rGov = await fetch(`${BASE}${GOV}.meta`, { method: 'PUT', headers: { ...auth, 'content-type': 'application/ld+json' }, body: JSON.stringify(govMeta) })
    expect([200, 201, 204, 205]).toContain(rGov.status)

    // Plural binding: conformsTo to TWO profiles at once (B6 — profile-loader.mjs
    // deliberately keeps discoverBinding's result plural).
    const plMeta = { '@context': { dct: DCT, powder: POWDER }, '@id': '',
      'dct:conformsTo': [{ '@id': LLM_WIKI }, { '@id': DCAT_CATALOG }],
      'powder:describedby': [{ '@id': LLM_WIKI_SHAPES }, { '@id': DCAT_SHAPES }] }
    const rPl = await fetch(`${BASE}${GOV_PLURAL}.meta`, { method: 'PUT', headers: { ...auth, 'content-type': 'application/ld+json' }, body: JSON.stringify(plMeta) })
    expect([200, 201, 204, 205]).toContain(rPl.status)
  })

  it('(a) container conformsTo (llm-wiki) governs a member\'s admission, not the pod-wide defaultProfile (okf-base)', async () => {
    const bindings = await discoverBinding(`${BASE}${GOV}x.jsonld`, { fetchFn: authedFetch })
    expect(bindings).toEqual([LLM_WIKI])                 // not okf-base.jsonld, the pod defaultProfile
    const p = await loadProfile(bindings[0])
    expect(p.token).toBe('llm-wiki')

    const bad = { '@context': { wm: 'https://la3d.github.io/llm-wiki-colab/ns#' }, '@id': '#it', '@type': 'wm:Concept' }
    const rBad = await fetch(`${BASE}${GOV}bad.jsonld`, { method: 'PUT',
      headers: { ...auth, 'content-type': 'application/ld+json' }, body: JSON.stringify(bad) })
    expect(rBad.status).toBe(400)
    const problem = await rBad.json()
    expect(JSON.stringify(problem.violations)).toMatch(/title/i)   // llm-wiki's shape speaks

    const good = { '@context': { wm: 'https://la3d.github.io/llm-wiki-colab/ns#', dcterms: DCT }, '@id': '#it', '@type': 'wm:Concept', 'dcterms:title': 'Gov test concept' }
    const rGood = await fetch(`${BASE}${GOV}good.jsonld`, { method: 'PUT',
      headers: { ...auth, 'content-type': 'application/ld+json' }, body: JSON.stringify(good) })
    expect([200, 201, 204, 205]).toContain(rGood.status)  // 204: idempotent re-PUT of unchanged bytes on a re-run
  })

  it('(b) governance edges live on the container .meta; a member carries none of its own (up-walk contract)', async () => {
    const cMeta = await fetch(`${BASE}${GOV}.meta`, { headers: { ...auth, accept: 'application/ld+json' } }).then((r) => r.json())
    expect(cMeta['dct:conformsTo']['@id']).toBe(LLM_WIKI)
    expect(cMeta['powder:describedby'].map((d) => d['@id'])).toContain(LLM_WIKI_SHAPES)

    const member = (await (await fetch(`${BASE}${GOV}good.jsonld`,
      { headers: { accept: 'application/linkset+json', ...auth } })).json()).linkset[0]
    expect('describedby' in member).toBe(false)
    expect(`${DCT}conformsTo` in member).toBe(false)
    expect(member.up[0].href).toBe(`${BASE}${GOV}`)       // reaches its profile via rel="up", not its own edges
  })

  // (c) plural bindings — PARTIAL confirmation only. discoverBinding correctly
  // preserves BOTH conformsTo targets (the mechanism-level plural contract, B6),
  // and admission stays consistent (governed, not silently unbound) under a
  // plural binding. This does NOT discriminate true AND-compose from a
  // single/OR-style compose: both llm-wiki's shapes.ttl (targetSubjectsOf
  // rdf:type) and dcat-catalog's shapes.ttl (targetClass dcat:Dataset) have
  // dct:title as their ONLY sh:Violation-severity rule, so a title-present/
  // absent fixture can't tell "both shapes enforced" apart from "either shape
  // enforced" — see task-9-report.md for the full rationale (no shape pair in
  // the current profile defs has non-overlapping Violation rules to fixture
  // that discrimination with).
  it('(c) plural conformsTo bindings are preserved and stay governed (AND-vs-OR discrimination deferred — see report)', async () => {
    const bindings = await discoverBinding(`${BASE}${GOV_PLURAL}x.jsonld`, { fetchFn: authedFetch })
    expect([...bindings].sort()).toEqual([DCAT_CATALOG, LLM_WIKI].sort())

    const bad = { '@context': { dcat: 'http://www.w3.org/ns/dcat#' }, '@id': '#it', '@type': 'dcat:Dataset' }
    const rBad = await fetch(`${BASE}${GOV_PLURAL}bad.jsonld`, { method: 'PUT',
      headers: { ...auth, 'content-type': 'application/ld+json' }, body: JSON.stringify(bad) })
    expect(rBad.status).toBe(400)

    const good = { '@context': { dcat: 'http://www.w3.org/ns/dcat#', dct: DCT }, '@id': '#it', '@type': 'dcat:Dataset', 'dct:title': 'Plural gov test dataset' }
    const rGood = await fetch(`${BASE}${GOV_PLURAL}good.jsonld`, { method: 'PUT',
      headers: { ...auth, 'content-type': 'application/ld+json' }, body: JSON.stringify(good) })
    expect([200, 201, 204, 205]).toContain(rGood.status)  // 204: idempotent re-PUT of unchanged bytes on a re-run
  })
})
