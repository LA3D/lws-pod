import { describe, it, beforeAll, expect } from 'vitest'

const JSS = 'http://localhost:3838'
const PROXY = 'http://localhost:3839'
const POD = { name: 'alice', email: 'alice@example.com', password: 'alicepassword123' }

const SHAPE = `@prefix sh: <http://www.w3.org/ns/shacl#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
@prefix ex: <http://example.org/> .
ex:NoteShape a sh:NodeShape ; sh:targetClass ex:Note ;
  sh:property [ sh:path rdfs:label ; sh:minCount 1 ] .`

const CONFORMING = `@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
@prefix ex: <http://example.org/> .
<#it> a ex:Note ; rdfs:label "ok" .`
const NONCONFORMING = `@prefix ex: <http://example.org/> .
<#it> a ex:Note .`

async function owner() {
  await fetch(`${JSS}/.pods`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(POD) })
  const r = await fetch(`${JSS}/idp/credentials`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: POD.email, password: POD.password }),
  })
  const j = await r.json()
  return { token: j.access_token, webid: j.webid }
}
const auth = t => ({ Authorization: `Bearer ${t}` })

describe('(b) proxy governs a protected constrained container', () => {
  let token
  beforeAll(async () => {
    ;({ token } = await owner())
    // Owner-only constrained container: container, shape, then .meta -> constrainedBy.
    await fetch(`${JSS}/alice/p2/`, { method: 'PUT', headers: { ...auth(token), 'Content-Type': 'text/turtle' }, body: '' })
    await fetch(`${JSS}/alice/p2/shape.ttl`, { method: 'PUT', headers: { ...auth(token), 'Content-Type': 'text/turtle' }, body: SHAPE })
    await fetch(`${JSS}/alice/p2/.meta`, {
      method: 'PUT', headers: { ...auth(token), 'Content-Type': 'text/turtle' },
      body: `<${JSS}/alice/p2/> <http://www.w3.org/ns/ldp#constrainedBy> <${JSS}/alice/p2/shape.ttl> .`,
    })
  })

  it('rejects a non-conforming write (422) through the proxy', async () => {
    const r = await fetch(`${PROXY}/alice/p2/bad.ttl`, {
      method: 'PUT', headers: { ...auth(token), 'Content-Type': 'text/turtle' }, body: NONCONFORMING,
    })
    expect(r.status).toBe(422)
    expect(r.headers.get('link') || '').toContain('constrainedBy')
  })

  it('admits a conforming write through the proxy', async () => {
    const r = await fetch(`${PROXY}/alice/p2/good.ttl`, {
      method: 'PUT', headers: { ...auth(token), 'Content-Type': 'text/turtle' }, body: CONFORMING,
    })
    expect([200, 201, 204, 205]).toContain(r.status)
  })
})
