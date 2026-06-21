// projection/backcompat.test.mjs
import { describe, it, beforeAll, expect } from 'vitest'
import { project } from './engine.mjs'
import { baseProfile } from './okf/base-profile.mjs'
import { parseFrontmatter, isConformant } from './okf/frontmatter.mjs'

const BASE = process.env.BASE || 'http://localhost:3838'
const POD = { name: 'alice', email: 'alice@example.com', password: 'alicepassword123' }
const auth = t => ({ Authorization: `Bearer ${t}` })
const CARD = `---
type: Concept
title: PD
description: Layered retrieval.
implementedBy: impl.md
---
# PD`

describe('backward-compat: a wiki-memory bundle reads as plain OKF in base mode', () => {
  let token
  const C = `${BASE}/alice/bc-${process.pid}-${Date.now()}/`
  beforeAll(async () => {
    await fetch(`${BASE}/.pods`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(POD) })
    token = (await (await fetch(`${BASE}/idp/credentials`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: POD.email, password: POD.password }) })).json()).access_token
    await fetch(C, { method: 'PUT', headers: { ...auth(token), 'Content-Type': 'text/turtle' }, body: '' })
    await fetch(C + 'pd.md', { method: 'PUT', headers: { ...auth(token), 'Content-Type': 'text/markdown' }, body: CARD })
  })

  it('cards are OKF-conformant (type present) and parse as plain frontmatter', async () => {
    const txt = await (await fetch(C + 'pd.md', { headers: { ...auth(token), Accept: 'text/markdown' } })).text()
    const { frontmatter } = parseFrontmatter(txt)
    expect(isConformant(frontmatter)).toBe(true)
    expect(frontmatter.title).toBe('PD')
  })

  it('base mode projects index.md only — no graph.ttl', async () => {
    const res = await project(C, token, baseProfile)
    expect(res.map(r => r.channel)).toEqual(['index'])
    for (const r of res) expect([200, 201, 204, 205]).toContain(r.status)
    const graph = await fetch(C + 'graph.ttl', { headers: { ...auth(token), Accept: 'text/turtle' } })
    expect(graph.status).toBe(404)
  })
})
