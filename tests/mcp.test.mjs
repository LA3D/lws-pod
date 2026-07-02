import { describe, it, beforeAll, expect } from 'vitest'
import { BASE, ensurePod, getToken } from './helpers.mjs'

// Working-MCP live gate — the MCP surface over the LWS layer, against the
// running FORK pod (--lws). Self-skips unless /mcp exposes the LWS read tools
// (top-level probe, mirrors the other live gates).

async function mcp(body, token) {
  const headers = { 'Content-Type': 'application/json' }
  if (token) headers.Authorization = `Bearer ${token}`
  const r = await fetch(`${BASE}/mcp`, { method: 'POST', headers, body: JSON.stringify(body) })
  return r
}
async function rpc(method, params, token, id = 1) {
  const r = await mcp({ jsonrpc: '2.0', id, method, params }, token)
  return { status: r.status, body: r.ok ? await r.json() : null }
}
// tools/call → the tool result object ({ content:[{text}], isError? }); parse toolJson text.
async function callTool(name, args, token) {
  const { body } = await rpc('tools/call', { name, arguments: args || {} }, token)
  return body?.result
}
function toolText(result) { return result?.content?.[0]?.text ?? '' }
function toolData(result) { try { return JSON.parse(toolText(result)) } catch { return null } }

// Probe: is this the working-MCP fork? tools/list must expose lws_type_search.
const probe = await rpc('tools/list', {}).then(r => r.body).catch(() => null)
const toolNames = (probe?.result?.tools || []).map(t => t.name)
const isWorkingMcp = toolNames.includes('lws_type_search')

const PROBE = 'http://example.org/mcp/Probe'
const PROBE_PATH = '/alice/mcp-probe'

describe.skipIf(!isWorkingMcp)('Working MCP surface (LWS)', () => {
  let token

  beforeAll(async () => {
    await ensurePod()
    ;({ token } = await getToken())
    // Write a distinctively-typed, owner-private resource THROUGH the MCP write tool
    // (proves the governed write path + type-capture over MCP end-to-end).
    const res = await callTool('write_resource', {
      path: PROBE_PATH, content: '{}', contentType: 'application/ld+json', types: [PROBE],
    }, token)
    expect(res?.isError ?? false).toBe(false)
  })

  it('tools/list advertises the LWS read tools and write_resource carries a types param', () => {
    for (const n of ['lws_type_search', 'lws_linkset', 'lws_storage_description']) {
      expect(toolNames).toContain(n)
    }
    const write = probe.result.tools.find(t => t.name === 'write_resource')
    expect(Object.keys(write.inputSchema.properties)).toContain('types')
  })

  it('lws_storage_description returns a Storage description with the service set', async () => {
    const sd = toolData(await callTool('lws_storage_description', {}, token))
    expect(sd.type).toBe('Storage')
    const svc = (sd.service || []).map(s => s.type)
    expect(svc).toContain('TypeIndexService')
    expect(svc).toContain('TypeSearchService')
  })

  it('MCP write → type-capture → lws_type_search finds the probe (bearer)', async () => {
    const page = toolData(await callTool('lws_type_search', { type: [PROBE] }, token))
    expect(page.type).toBe('ContainerPage')
    expect(page.items.map(i => i.id).some(u => u.endsWith(PROBE_PATH))).toBe(true)
  })

  it('lws_linkset returns the probe linkset with its declared type (bearer)', async () => {
    const ls = toolData(await callTool('lws_linkset', { path: PROBE_PATH }, token))
    // RFC 9264 linkset: a linkset[] whose anchor is the resource, carrying its type.
    const flat = JSON.stringify(ls)
    expect(flat).toContain(PROBE)
  })

  it('no-oracle: an anonymous lws_type_search does NOT see the owner-private probe', async () => {
    const page = toolData(await callTool('lws_type_search', { type: [PROBE] }, /* no token */))
    expect(page.type).toBe('ContainerPage')
    expect(page.items.map(i => i.id).some(u => u.endsWith(PROBE_PATH))).toBe(false)
  })

  it('skill-WAC: anonymous get_skill of the owner-private probe path is denied', async () => {
    const res = await callTool('get_skill', { path: PROBE_PATH } /* no token */)
    expect(res?.isError).toBe(true)
    expect(toolText(res).toLowerCase()).toContain('access denied')
  })

  it('a bearer get_skill of the same path is NOT denied (WAC, not a path bypass)', async () => {
    const res = await callTool('get_skill', { path: PROBE_PATH }, token)
    // Either the file is readable (ok) or not-a-skill, but it must NOT be "access denied".
    expect(toolText(res).toLowerCase()).not.toContain('access denied')
  })

  it('/mcp is rate-limited: a burst of anonymous calls eventually returns 429', async () => {
    // Anonymous per-IP cap is 60/min; drive past it. Tolerant: assert SOME 429 within 75 calls.
    let saw429 = false
    for (let i = 0; i < 75 && !saw429; i++) {
      const r = await mcp({ jsonrpc: '2.0', id: i, method: 'tools/list' })
      if (r.status === 429) saw429 = true
    }
    expect(saw429).toBe(true)
  }, 30_000)
})
