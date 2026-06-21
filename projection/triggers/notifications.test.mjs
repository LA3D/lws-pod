import { describe, it, beforeAll, afterAll, expect } from 'vitest'
import { watch } from './notifications.mjs'

const BASE = process.env.BASE || 'http://localhost:3838'
const POD = { name: 'alice', email: 'alice@example.com', password: 'alicepassword123' }
const auth = t => ({ Authorization: `Bearer ${t}` })
const sleep = ms => new Promise(r => setTimeout(r, ms))
const CARD = `---\ntype: Concept\ntitle: N\ndescription: n.\n---\n{=<#it> .skos:Concept}\n[N]{skos:prefLabel} [i](i.md){wm:implementedBy}.`

describe('notifications trigger (e2e)', () => {
  let token, ws
  const C = `${BASE}/alice/notif-${process.pid}-${Date.now()}/`
  beforeAll(async () => {
    await fetch(`${BASE}/.pods`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(POD) })
    token = (await (await fetch(`${BASE}/idp/credentials`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: POD.email, password: POD.password }) })).json()).access_token
    await fetch(C, { method: 'PUT', headers: { ...auth(token), 'Content-Type': 'text/turtle' }, body: '' })
  })
  afterAll(() => ws?.close())

  it('re-projects after a card is written', async () => {
    let projected = 0
    ws = watch(C, { token, debounceMs: 150, onProject: () => projected++ })
    await sleep(500) // allow socket open + subscribe
    await fetch(C + 'n.md', { method: 'PUT', headers: { ...auth(token), 'Content-Type': 'text/markdown' }, body: CARD })

    for (let i = 0; i < 40 && projected === 0; i++) await sleep(100) // up to 4s
    expect(projected).toBeGreaterThan(0)

    const graph = await (await fetch(C + 'graph.ttl', { headers: { ...auth(token), Accept: 'text/turtle' } })).text()
    expect(graph).toContain('n.md#it')
  })
})
