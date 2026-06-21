import { describe, it, beforeAll, expect } from 'vitest'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const BASE = process.env.BASE || 'http://localhost:3838'
const POD = { name: 'alice', email: 'alice@example.com', password: 'alicepassword123' }
const auth = t => ({ Authorization: `Bearer ${t}` })
const CLI = join(dirname(fileURLToPath(import.meta.url)), 'cli.mjs')
const CARD = `---\ntype: Concept\ntitle: T\ndescription: d.\n---\n{=<#it> .skos:Concept}\n[T]{skos:prefLabel} [i](i.md){wm:implementedBy}.`

describe('cli trigger (e2e)', () => {
  let token
  const C = `${BASE}/alice/cli-${process.pid}-${Date.now()}/`
  beforeAll(async () => {
    await fetch(`${BASE}/.pods`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(POD) })
    token = (await (await fetch(`${BASE}/idp/credentials`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: POD.email, password: POD.password }) })).json()).access_token
    await fetch(C, { method: 'PUT', headers: { ...auth(token), 'Content-Type': 'text/turtle' }, body: '' })
    await fetch(C + 'c.md', { method: 'PUT', headers: { ...auth(token), 'Content-Type': 'text/markdown' }, body: CARD })
  })

  it('projects a container and prints channel results', () => {
    const out = execFileSync('node', [CLI, C], { env: { ...process.env, TOKEN: token }, encoding: 'utf8' })
    const res = JSON.parse(out)
    expect(res.map(r => r.channel).sort()).toEqual(['graph', 'index'])
    for (const r of res) expect([200, 201, 204, 205]).toContain(r.status)
  })
})
