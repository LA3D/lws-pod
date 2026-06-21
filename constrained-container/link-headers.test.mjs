// constrained-container/link-headers.test.mjs
import { describe, it, beforeAll, expect } from 'vitest'
const JSS = process.env.BASE || 'http://localhost:3838'
const PROXY = process.env.PROXY || 'http://localhost:3839'
const POD = { name: 'alice', email: 'alice@example.com', password: 'alicepassword123' }
const auth = t => ({ Authorization: `Bearer ${t}` })
const CARD = `---
type: Concept
title: PD
implementedBy: impl.md
---
# PD`

describe('proxy attaches Tier-1 Link headers and still admits', () => {
  let token
  const base = `alice/links-${process.pid}-${Date.now()}`
  beforeAll(async () => {
    await fetch(`${JSS}/.pods`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(POD) })
    token = (await (await fetch(`${JSS}/idp/credentials`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: POD.email, password: POD.password }) })).json()).access_token
    await fetch(`${JSS}/${base}/`, { method: 'PUT', headers: { ...auth(token), 'Content-Type': 'text/turtle' }, body: '' })
  })

  it('admits the card written through the proxy (headers attached upstream)', async () => {
    const r = await fetch(`${PROXY}/${base}/pd.md`, { method: 'PUT', headers: { ...auth(token), 'Content-Type': 'text/markdown' }, body: CARD })
    expect([200, 201, 204, 205]).toContain(r.status)
    const back = await fetch(`${JSS}/${base}/pd.md`, { headers: { ...auth(token), Accept: 'text/markdown' } })
    expect(await back.text()).toContain('# PD')
  })
})
