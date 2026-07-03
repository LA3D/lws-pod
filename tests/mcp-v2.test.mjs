import { describe, it, beforeAll, expect } from 'vitest'
import { BASE, ensurePod, getToken } from './helpers.mjs'

// MCP v2 live gate — Resource Gateway surface against the running FORK pod
// (--lws). Self-skips unless initialize advertises the resources capability.

async function rpc(method, params, token, id = 1) {
  const headers = { 'Content-Type': 'application/json' }
  if (token) headers.Authorization = `Bearer ${token}`
  const r = await fetch(`${BASE}/mcp`, { method: 'POST', headers, body: JSON.stringify({ jsonrpc: '2.0', id, method, params }) })
  return { status: r.status, body: r.ok ? await r.json() : null }
}
const text = (res) => res?.contents?.[0]?.text ?? ''
const toolText = (res) => res?.content?.[0]?.text ?? ''
const toolData = (res) => { try { return JSON.parse(toolText(res)) } catch { return {} } }

const init = await rpc('initialize', {}).then(r => r.body).catch(() => null)
const hasResources = !!init?.result?.capabilities?.resources

const PROBE = 'http://example.org/mcp/Probe'
const PROBE_PATH = '/alice/mcp-v2-probe'

describe.skipIf(!hasResources)('MCP v2 (Resource Gateway)', () => {
  let token
  beforeAll(async () => {
    await ensurePod()
    ;({ token } = await getToken())
    // governed write through the tool path
    const w = await rpc('tools/call', { name: 'put_typed_resource', arguments: { path: PROBE_PATH, content: '{}', contentType: 'application/ld+json', types: [PROBE] } }, token)
    expect(w.body.result.isError ?? false).toBe(false)
  })

  it('advertises resources + the templated/fixed URIs', async () => {
    expect(init.result.capabilities.resources).toBeTruthy()
    const tmpl = (await rpc('resources/templates/list', {}, token)).body.result.resourceTemplates.map(t => t.uriTemplate)
    expect(tmpl).toContain('lws://resource/{+path}')
    const fixed = (await rpc('resources/list', {}, token)).body.result.resources.map(r => r.uri)
    expect(fixed).toContain('lws://storage-description')
  })

  it('resources/read round-trips a body and a linkset', async () => {
    const body = (await rpc('resources/read', { uri: `lws://resource${PROBE_PATH}` }, token)).body.result
    expect(text(body).length).toBeGreaterThan(0)
    const ls = (await rpc('resources/read', { uri: `lws://linkset${PROBE_PATH}` }, token)).body.result
    expect(text(ls)).toContain(PROBE)
  })

  it('no-oracle: anonymous resources/read of the owner-private probe is denied', async () => {
    const r = await rpc('resources/read', { uri: `lws://resource${PROBE_PATH}` })
    expect(r.body.error).toBeTruthy()
    expect(r.body.error.message.toLowerCase()).toContain('access denied')
  })

  it('a shape-violating write returns teaching content (sh:message visible)', async () => {
    // Provision a shape, then violate it via put_typed_resource's describedby declare.
    const shapePath = '/alice/shapes/v2note'
    const shape = { '@context': { sh: 'http://www.w3.org/ns/shacl#', ex: 'http://ex/' }, '@id': 'http://ex/V2Note', '@type': 'sh:NodeShape', 'sh:targetClass': { '@id': 'http://ex/V2Note' }, 'sh:property': { '@id': '_:p', 'sh:path': { '@id': 'http://ex/title' }, 'sh:minCount': 1, 'sh:severity': { '@id': 'http://www.w3.org/ns/shacl#Violation' }, 'sh:message': 'title required' } }
    await rpc('tools/call', { name: 'write_resource', arguments: { path: shapePath, content: JSON.stringify(shape), contentType: 'application/ld+json' } }, token)
    const bad = await rpc('tools/call', { name: 'put_typed_resource', arguments: { path: '/alice/v2notes/bad', content: JSON.stringify({ '@context': { ex: 'http://ex/' }, '@id': `${BASE}/alice/v2notes/bad`, '@type': 'ex:V2Note' }), contentType: 'application/ld+json', describedby: `${BASE}${shapePath}` } }, token)
    expect(bad.body.result.isError).toBe(true)
    expect(bad.body.result.content[0].text).toMatch(/title required/)
  })

  it('describe_resource returns body + linkset + types', async () => {
    const d = await rpc('tools/call', { name: 'describe_resource', arguments: { path: PROBE_PATH } }, token)
    const obj = JSON.parse(d.body.result.content[0].text)
    expect(obj.linkset).toBeTruthy()
    expect(obj.types).toContain(PROBE)
  })

  // --- carried forward from the v1 gate (review #10) ------------------------

  it('no-oracle: an anonymous lws_type_search does NOT enumerate the owner-private probe', async () => {
    const page = toolData((await rpc('tools/call', { name: 'lws_type_search', arguments: { type: [PROBE] } } /* no token */)).body.result)
    expect(page.type).toBe('ContainerPage')
    expect((page.items || []).some(i => String(i.id).endsWith(PROBE_PATH))).toBe(false)
  })

  it('skill-WAC: anonymous lws://skill of the owner-private probe path is denied', async () => {
    const r = await rpc('resources/read', { uri: `lws://skill${PROBE_PATH}` } /* no token */)
    expect(r.body.error).toBeTruthy()
    expect(String(r.body.error.message).toLowerCase()).toContain('access denied')
  })

  it('a bearer lws://skill of the same path is NOT denied (WAC, not a path bypass)', async () => {
    const r = await rpc('resources/read', { uri: `lws://skill${PROBE_PATH}` }, token)
    // Readable, or not-a-skill — but it must NOT be an access-denied error.
    const msg = (r.body.error ? r.body.error.message : text(r.body.result)).toLowerCase()
    expect(msg).not.toContain('access denied')
  })

  it('/mcp is rate-limited: a burst of anonymous calls eventually returns 429', async () => {
    // Anonymous per-IP cap is 60/min; drive past it. Tolerant: SOME 429 within 75 calls.
    let saw429 = false
    for (let i = 0; i < 75 && !saw429; i++) {
      const r = await rpc('tools/list', {}, undefined, 1000 + i)
      if (r.status === 429) saw429 = true
    }
    expect(saw429).toBe(true)
  }, 30_000)
})
