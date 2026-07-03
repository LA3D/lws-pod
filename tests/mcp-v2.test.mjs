import { describe, it, beforeAll, expect } from 'vitest'
import { BASE, ensurePod, getToken } from './helpers.mjs'

// MCP affordance-surface live gate — real-URI Resource reads against the running
// FORK pod (--lws). Self-skips unless initialize advertises the resources capability.

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
const PROBE_PATH = '/alice/mcp-affordance-probe'
const PROBE_BODY = JSON.stringify({ '@context': { ex: 'http://ex/' }, 'ex:note': 'probe' })

describe.skipIf(!hasResources)('MCP affordance surface (real-URI reads)', () => {
  let token
  beforeAll(async () => {
    await ensurePod()
    ;({ token } = await getToken())
    // governed write through the tool path; a JSON-LD body so the read test can
    // assert its @context survives structurally.
    const w = await rpc('tools/call', { name: 'put_typed_resource', arguments: { path: PROBE_PATH, content: PROBE_BODY, contentType: 'application/ld+json', types: [PROBE] } }, token)
    expect(w.body.result.isError ?? false).toBe(false)
  })

  it('advertises resources + a real-URI template + fixed real-URL resources', async () => {
    expect(init.result.capabilities.resources).toBeTruthy()
    const tmpl = (await rpc('resources/templates/list', {}, token)).body.result.resourceTemplates.map(t => t.uriTemplate)
    expect(tmpl.some(t => t.startsWith('https://'))).toBe(true)   // real-URI template, not lws://
    const fixed = (await rpc('resources/list', {}, token)).body.result.resources.map(r => r.uri)
    expect(fixed).toContain(`${BASE}/.well-known/lws-storage`)
  })

  it('reads a resource by its real https:// URL → JSON-LD with an intact @context', async () => {
    const body = (await rpc('resources/read', { uri: `${BASE}${PROBE_PATH}` }, token)).body.result
    const obj = JSON.parse(text(body))              // parses — structured, not enveloped text
    expect(obj['@context']).toBeTruthy()
  })

  it('the LWS @context resolves as a fixed resource (cold-agent term resolution)', async () => {
    const ctxDoc = (await rpc('resources/read', { uri: `${BASE}/.well-known/lws/context` }, token)).body.result
    expect(JSON.parse(text(ctxDoc))['@context'].items).toBe('lws:items')
  })

  it('no-oracle: anonymous read of the owner-private probe is denied; bearer is not', async () => {
    const anon = await rpc('resources/read', { uri: `${BASE}${PROBE_PATH}` })   // no token
    expect(anon.body.error).toBeTruthy()
    expect(String(anon.body.error.message).toLowerCase()).toContain('access denied')
    const owner = await rpc('resources/read', { uri: `${BASE}${PROBE_PATH}` }, token)
    expect(owner.body.error).toBeFalsy()            // WAC, not a path bypass
  })

  it('no-oracle: an anonymous lws_type_search does NOT enumerate the owner-private probe', async () => {
    const page = toolData((await rpc('tools/call', { name: 'lws_type_search', arguments: { type: [PROBE] } })).body.result)
    expect(page.type).toBe('ContainerPage')
    expect((page.items || []).some(i => String(i.id).endsWith(PROBE_PATH))).toBe(false)
  })

  it('a shape-violating write returns teaching content (sh:message visible)', async () => {
    const shapePath = '/alice/shapes/affnote'
    const shape = { '@context': { sh: 'http://www.w3.org/ns/shacl#', ex: 'http://ex/' }, '@id': 'http://ex/AffNote', '@type': 'sh:NodeShape', 'sh:targetClass': { '@id': 'http://ex/AffNote' }, 'sh:property': { '@id': '_:p', 'sh:path': { '@id': 'http://ex/title' }, 'sh:minCount': 1, 'sh:severity': { '@id': 'http://www.w3.org/ns/shacl#Violation' }, 'sh:message': 'title required' } }
    await rpc('tools/call', { name: 'write_resource', arguments: { path: shapePath, content: JSON.stringify(shape), contentType: 'application/ld+json' } }, token)
    const bad = await rpc('tools/call', { name: 'put_typed_resource', arguments: { path: '/alice/affnotes/bad', content: JSON.stringify({ '@context': { ex: 'http://ex/' }, '@id': `${BASE}/alice/affnotes/bad`, '@type': 'ex:AffNote' }), contentType: 'application/ld+json', describedby: `${BASE}${shapePath}` } }, token)
    expect(bad.body.result.isError).toBe(true)
    expect(bad.body.result.content[0].text).toMatch(/title required/)
  })

  it('describe_resource returns body + linkset + types (the linkset carrier)', async () => {
    const d = await rpc('tools/call', { name: 'describe_resource', arguments: { path: PROBE_PATH } }, token)
    const obj = JSON.parse(d.body.result.content[0].text)
    expect(obj.linkset).toBeTruthy()
    expect(obj.types).toContain(PROBE)
  })

  it('read_remote_resource is gated (owner passes the federation gate; anon denied)', async () => {
    // The gate is the security-relevant, live-verifiable property. The happy-path
    // remote fetch is covered by the fork unit test — here the pod cannot fetch
    // its own external https URL from inside the container (no in-container
    // DNS/CA), so we assert gate behavior, not fetch success.
    const anon = (await rpc('tools/call', { name: 'read_remote_resource', arguments: { url: `${BASE}/.well-known/lws-storage` } })).body.result
    expect(String(toolText(anon)).toLowerCase()).toContain('access denied')   // anon/foreign denied by the gate
    const owner = (await rpc('tools/call', { name: 'read_remote_resource', arguments: { url: `${BASE}/.well-known/lws-storage` } }, token)).body.result
    expect(String(toolText(owner)).toLowerCase()).not.toContain('access denied') // owner passes the gate
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
