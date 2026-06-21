// constrained-container/unknown-type.test.mjs
import { describe, it, beforeAll, expect } from 'vitest'
const JSS = process.env.BASE || 'http://localhost:3838'
const PROXY = process.env.PROXY || 'http://localhost:3839'
const POD = { name: 'alice', email: 'alice@example.com', password: 'alicepassword123' }
const auth = t => ({ Authorization: `Bearer ${t}` })

const NOVEL = `---
type: Playbook
title: Incident Response
---
# Incident Response`

describe('unknown-to-profile type', () => {
  let token
  const base = `alice/unknown-${process.pid}-${Date.now()}`
  beforeAll(async () => {
    await fetch(`${JSS}/.pods`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(POD) })
    token = (await (await fetch(`${JSS}/idp/credentials`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: POD.email, password: POD.password }) })).json()).access_token
    await fetch(`${JSS}/${base}/`, { method: 'PUT', headers: { ...auth(token), 'Content-Type': 'text/turtle' }, body: '' })
  })

  it('admits a card with an unknown type but warns it is ungoverned', async () => {
    const r = await fetch(`${PROXY}/${base}/playbook.md`, { method: 'PUT', headers: { ...auth(token), 'Content-Type': 'text/markdown' }, body: NOVEL })
    expect([200, 201, 204, 205]).toContain(r.status)
    expect(r.headers.get('warning') || '').toMatch(/new|ungoverned|Playbook/i)
  })
})
