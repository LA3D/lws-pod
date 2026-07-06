import { describe, it, beforeAll, expect } from 'vitest'
import { BASE, ensurePod, getToken } from './helpers.mjs'

// MCP affordance-surface live gate — real-URI Resource reads against the running
// FORK pod (--lws). Self-skips ONLY when initialize answers 2xx without the
// resources capability (a pod that genuinely doesn't speak the v2 surface).
// A 429 or an unreachable pod FAILS LOUDLY instead — the burst test at the end
// of this file spends the anonymous per-IP budget, so a re-run within ~60s
// used to 429 the probe and silently skip the whole suite: a green run that
// tested nothing (the false-green gotcha, FOLLOWUP 2026-07-06).

async function rpc(method, params, token, id = 1) {
  const headers = { 'Content-Type': 'application/json' }
  if (token) headers.Authorization = `Bearer ${token}`
  const r = await fetch(`${BASE}/mcp`, { method: 'POST', headers, body: JSON.stringify({ jsonrpc: '2.0', id, method, params }) })
  return { status: r.status, body: r.ok ? await r.json() : null }
}
const text = (res) => res?.contents?.[0]?.text ?? ''
const toolText = (res) => res?.content?.[0]?.text ?? ''
const toolData = (res) => { try { return JSON.parse(toolText(res)) } catch { return {} } }

const probe = await rpc('initialize', {}).catch(() => ({ status: 0, body: null }))
if (probe.status === 429) throw new Error(
  `mcp-v2 gate: the /mcp initialize probe was rate-limited (429) — that is not a capability answer. ` +
  `The burst test spends the anonymous budget; wait ~60s after a previous run and re-run.`)
if (probe.status === 0) throw new Error(`mcp-v2 gate: pod unreachable at ${BASE}`)
const init = probe.body
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

  // 'read_remote_resource is gated' removed 2026-07-06: the tool itself is retired
  // (absorbed into read_resource's remote arm, verified below in `tools.js` at
  // MERGE_SHA) — calling it now returns a plain "unknown tool" error, not a
  // federation-gate error, so the old assertion no longer tests anything real.
  // Equivalent coverage lives in the new describe block's 'read_resource remote
  // arm' test. The rate-limit burst test that used to close out this block is
  // moved to the very end of the file (after the model-driven block) — it trips
  // the anonymous per-IP 429 budget, and if it runs before the new block's
  // anonymous read_resource/GET calls it starves them of budget too.
})

describe.skipIf(!hasResources)('model-driven read tools (spec 2026-07-06)', () => {
  let token
  beforeAll(async () => { await ensurePod(); ({ token } = await getToken()) })

  it('tools/list: read_resource + list_resources present, read_remote_resource retired', async () => {
    const names = (await rpc('tools/list', {}, token)).body.result.tools.map(t => t.name)
    expect(names).toContain('read_resource')
    expect(names).toContain('list_resources')
    expect(names).not.toContain('read_remote_resource')
    expect(names.length).toBe(10)
  })

  it('read_resource local: body block keeps @context; links block carries up + storageDescription', async () => {
    const res = (await rpc('tools/call', { name: 'read_resource', arguments: { uri: `${BASE}${PROBE_PATH}` } }, token)).body.result
    expect(res.isError ?? false).toBe(false)
    expect(JSON.parse(res.content[0].text)['@context']).toBeTruthy()
    const meta = JSON.parse(res.content[1].text)
    expect(meta.links.up).toBe(`${BASE}/alice/`)
    expect(meta.links.storageDescription).toBe(`${BASE}/.well-known/lws-storage`)
  })

  it('read_resource no-oracle: anonymous read of the owner-private probe is a teaching error', async () => {
    const res = (await rpc('tools/call', { name: 'read_resource', arguments: { uri: `${BASE}${PROBE_PATH}` } })).body.result
    expect(res.isError).toBe(true)
    expect(toolText(res)).toMatch(/access denied|not found/i)
  })

  it('read_resource remote arm: anonymous is federation-gated; owner takes the remote path', async () => {
    const anon = (await rpc('tools/call', { name: 'read_resource', arguments: { uri: 'https://nonexistent.invalid/x' } })).body.result
    expect(toolText(anon)).toMatch(/federation requires a local WebID/)
    const owner = (await rpc('tools/call', { name: 'read_resource', arguments: { uri: 'https://nonexistent.invalid/x' } }, token)).body.result
    expect(toolText(owner)).toMatch(/remote unreachable/)   // gate passed -> remote arm, DNS-dead host
  })

  it('list_resources returns the entry resources + real-URI template', async () => {
    const out = toolData((await rpc('tools/call', { name: 'list_resources', arguments: {} }, token)).body.result)
    expect(out.resources.map(r => r.uri)).toContain(`${BASE}/.well-known/lws-storage`)
    expect(out.templates[0].uriTemplate.startsWith('https://')).toBe(true)
  })

  it('GET /mcp answers 405 + Allow: POST', async () => {
    const r = await fetch(`${BASE}/mcp`)
    expect(r.status).toBe(405)
    expect(r.headers.get('allow')).toMatch(/POST/)
  })

  it('storage description names RFC 9264', async () => {
    const sd = await (await fetch(`${BASE}/.well-known/lws-storage`)).json()
    expect(sd.linkset.conformsTo).toBe('https://www.rfc-editor.org/rfc/rfc9264')
  })

  it('index-shadowed container omits rel="linkset"; plain container keeps it', async () => {
    await rpc('tools/call', { name: 'create_resource', arguments: { container: '/alice/', slug: 'shadow-probe', isContainer: true } }, token)
    await rpc('tools/call', { name: 'write_resource', arguments: { path: '/alice/shadow-probe/index.html', content: '<html></html>', contentType: 'text/html' } }, token)
    await rpc('tools/call', { name: 'create_resource', arguments: { container: '/alice/', slug: 'plain-probe', isContainer: true } }, token)
    const shadowed = await fetch(`${BASE}/alice/shadow-probe/`, { headers: { Authorization: `Bearer ${token}` } })
    expect(shadowed.headers.get('link') || '').not.toMatch(/rel="linkset"/)
    const plain = await fetch(`${BASE}/alice/plain-probe/`, { headers: { Authorization: `Bearer ${token}` } })
    expect(plain.headers.get('link') || '').toMatch(/rel="linkset"/)
  })
})

// Relocated from the end of 'MCP affordance surface' (see comment there) so it
// runs dead last — it deliberately exhausts the anonymous per-IP /mcp budget,
// which would otherwise starve the anonymous calls in the block above.
describe.skipIf(!hasResources)('rate limiting (run last — exhausts anon budget)', () => {
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
