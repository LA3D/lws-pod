import { describe, it, beforeAll, expect } from 'vitest'
import { setPublicReadAcl } from './set-acl.mjs'
import { wmConceptWiringShape } from '../projection/profiles/wiki-memory/shape.mjs'

const JSS = 'http://localhost:3838'
const PROXY = 'http://localhost:3839'
const POD = { name: 'alice', email: 'alice@example.com', password: 'alicepassword123' }
const auth = t => ({ Authorization: `Bearer ${t}` })

const WIRED = `---\ntype: Concept\ntitle: Wired\n---\n{=<#it> .skos:Concept}\n[Wired]{skos:prefLabel} [impl](impl.md){wm:implementedBy}.`
const UNWIRED = `---\ntype: Concept\ntitle: Unwired\n---\n{=<#it> .skos:Concept}\n[Unwired]{skos:prefLabel}.`

describe('proxy floor over Semantic-Markdown card bodies', () => {
  let token
  const base = `alice/floor-${process.pid}-${Date.now()}`
  const shape = `${JSS}/${base}/shape.ttl`
  beforeAll(async () => {
    await fetch(`${JSS}/.pods`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(POD) })
    token = (await (await fetch(`${JSS}/idp/credentials`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: POD.email, password: POD.password }) })).json()).access_token
    await fetch(`${JSS}/${base}/`, { method: 'PUT', headers: { ...auth(token), 'Content-Type': 'text/turtle' }, body: '' })
    await fetch(shape, { method: 'PUT', headers: { ...auth(token), 'Content-Type': 'text/turtle' }, body: wmConceptWiringShape })
    await fetch(`${JSS}/${base}/.meta`, { method: 'PUT', headers: { ...auth(token), 'Content-Type': 'text/turtle' },
      body: `<${JSS}/${base}/> <http://www.w3.org/ns/ldp#constrainedBy> <${shape}> .` })
  })

  it('rejects a card with no wm:implementedBy (422 + laden message)', async () => {
    const r = await fetch(`${PROXY}/${base}/unwired.md`, { method: 'PUT', headers: { ...auth(token), 'Content-Type': 'text/markdown' }, body: UNWIRED })
    expect(r.status).toBe(422)
    expect(await r.text()).toMatch(/wm:implementedBy/)
  })

  it('admits a card that declares wm:implementedBy', async () => {
    const r = await fetch(`${PROXY}/${base}/wired.md`, { method: 'PUT', headers: { ...auth(token), 'Content-Type': 'text/markdown' }, body: WIRED })
    expect([200, 201, 204, 205]).toContain(r.status)
  })
})
