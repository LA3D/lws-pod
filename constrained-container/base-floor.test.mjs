import { describe, it, beforeAll, expect } from 'vitest'

const JSS = process.env.BASE || 'http://localhost:3838'
const PROXY = process.env.PROXY || 'http://localhost:3839'
const POD = { name: 'alice', email: 'alice@example.com', password: 'alicepassword123' }
const auth = t => ({ Authorization: `Bearer ${t}` })

const NO_TITLE = `---
type: Concept
implementedBy: impl.md
---
# untitled`

describe('base NoteShape (always-on, no .meta required)', () => {
  let token
  const base = `alice/basefloor-${process.pid}-${Date.now()}`
  beforeAll(async () => {
    await fetch(`${JSS}/.pods`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(POD) })
    token = (await (await fetch(`${JSS}/idp/credentials`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: POD.email, password: POD.password }) })).json()).access_token
    await fetch(`${JSS}/${base}/`, { method: 'PUT', headers: { ...auth(token), 'Content-Type': 'text/turtle' }, body: '' })
  })

  it('rejects a typed card with no title even though the container has no .meta shape', async () => {
    const r = await fetch(`${PROXY}/${base}/no-title.md`, { method: 'PUT', headers: { ...auth(token), 'Content-Type': 'text/markdown' }, body: NO_TITLE })
    expect(r.status).toBe(422)
    expect(await r.text()).toMatch(/title/i)
  })
})
