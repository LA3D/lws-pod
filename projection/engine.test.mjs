import { describe, it, beforeAll, expect } from 'vitest'
import { project } from './engine.mjs'
import { wikiMemoryProfile } from './profiles/wiki-memory/index.mjs'

const BASE = process.env.BASE || 'http://localhost:3838'
const POD = { name: 'alice', email: 'alice@example.com', password: 'alicepassword123' }
const auth = t => ({ Authorization: `Bearer ${t}` })

const CARD_A = `---
type: Concept
title: Progressive Disclosure
description: Layered retrieval.
---
{=<#it> .skos:Concept}

# Progressive Disclosure
[Progressive Disclosure]{skos:prefLabel} is realized by the
[index views](impl.md){wm:implementedBy}.`

const CARD_B = `---
type: Concept
title: Hierarchical Retrieval
description: Typed routing.
---
{=<#it> .skos:Concept}

# Hierarchical Retrieval
[Hierarchical Retrieval]{skos:prefLabel}.`

describe('project (e2e against the live local pod)', () => {
  let token
  const C = `${BASE}/alice/proj-${process.pid}-${Date.now()}/`
  beforeAll(async () => {
    await fetch(`${BASE}/.pods`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(POD) })
    const r = await fetch(`${BASE}/idp/credentials`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: POD.email, password: POD.password }),
    })
    token = (await r.json()).access_token
    await fetch(C, { method: 'PUT', headers: { ...auth(token), 'Content-Type': 'text/turtle' }, body: '' })
    await fetch(C + 'progressive-disclosure.md', { method: 'PUT', headers: { ...auth(token), 'Content-Type': 'text/markdown' }, body: CARD_A })
    await fetch(C + 'hierarchical-retrieval.md', { method: 'PUT', headers: { ...auth(token), 'Content-Type': 'text/markdown' }, body: CARD_B })
  })

  it('writes graph.ttl and index.md, derived from the cards', async () => {
    const res = await project(C, token, wikiMemoryProfile)
    for (const r of res) expect([200, 201, 204, 205], `${r.channel} -> ${r.status}`).toContain(r.status)

    const graph = await (await fetch(C + 'graph.ttl', { headers: { ...auth(token), Accept: 'text/turtle' } })).text()
    expect(graph).toContain('progressive-disclosure.md#it')
    expect(graph).toMatch(/implementedBy/)

    const index = await (await fetch(C + 'index.md', { headers: { ...auth(token), Accept: 'text/markdown' } })).text()
    expect(index).toContain('* [Progressive Disclosure](progressive-disclosure.md) - Layered retrieval.')
    expect(index).toContain('* [Hierarchical Retrieval](hierarchical-retrieval.md) - Typed routing.')
  })

  it('does not re-ingest its own derived views (reserved names skipped)', async () => {
    await project(C, token, wikiMemoryProfile) // second run
    const graph = await (await fetch(C + 'graph.ttl', { headers: { ...auth(token), Accept: 'text/turtle' } })).text()
    expect(graph).not.toContain('graph.ttl#it')
    expect(graph).not.toContain('index.md#it')
  })
})
