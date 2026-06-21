// constrained-container/graded.test.mjs
import { describe, it, beforeAll, expect } from 'vitest'
const JSS = process.env.BASE || 'http://localhost:3838'
const PROXY = process.env.PROXY || 'http://localhost:3839'
const POD = { name: 'alice', email: 'alice@example.com', password: 'alicepassword123' }
const auth = t => ({ Authorization: `Bearer ${t}` })

// Concept WITH title + implementedBy (passes Violations) but missing an optional description (Info).
const WARN_OK = `---
type: Concept
title: Has Title
implementedBy: impl.md
---
# Has Title`

describe('graded severity', () => {
  let token
  const base = `alice/graded-${process.pid}-${Date.now()}`
  beforeAll(async () => {
    await fetch(`${JSS}/.pods`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(POD) })
    token = (await (await fetch(`${JSS}/idp/credentials`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: POD.email, password: POD.password }) })).json()).access_token
    await fetch(`${JSS}/${base}/`, { method: 'PUT', headers: { ...auth(token), 'Content-Type': 'text/turtle' }, body: '' })
  })

  it('admits a card that satisfies all Violations (Info/description finding only) and surfaces it via Warning header', async () => {
    const r = await fetch(`${PROXY}/${base}/has-title.md`, { method: 'PUT', headers: { ...auth(token), 'Content-Type': 'text/markdown' }, body: WARN_OK })
    expect([200, 201, 204, 205]).toContain(r.status)
    // Task 5: proxy must forward Info-severity advisories via the Warning header
    const w = r.headers.get('warning')
    expect(w).toBeTruthy()
    expect(w).toMatch(/description/i)
  })
})
