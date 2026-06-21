import { describe, it, beforeAll, expect } from 'vitest'

const KC = 'http://localhost:8080/realms/lws'
const GW = 'http://localhost:3840'
const POD = { name: 'alice', email: 'alice@example.com', password: 'alicepassword123' }

async function ensurePod() {
  await fetch('http://localhost:3838/.pods', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(POD),
  })
}
async function kcToken() {
  const r = await fetch(`${KC}/protocol/openid-connect/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: 'gateway', username: 'alice',
      password: 'alicepassword123', grant_type: 'password',
    }),
  })
  if (!r.ok) throw new Error(`kc token -> ${r.status}`)
  return (await r.json()).access_token
}

describe('keycloak token gates JSS via the gateway', () => {
  let token
  beforeAll(async () => { await ensurePod(); token = await kcToken() })

  it('rejects a request with no token (401)', async () => {
    const r = await fetch(`${GW}/alice/notes/kc.ttl`)
    expect(r.status).toBe(401)
  })

  it('rejects a tampered token (401)', async () => {
    const r = await fetch(`${GW}/alice/notes/kc.ttl`, {
      headers: { Authorization: `Bearer ${token}tampered` },
    })
    expect(r.status).toBe(401)
  })

  it('allows write+read with a valid keycloak token', async () => {
    const url = `${GW}/alice/notes/kc.ttl`
    const put = await fetch(url, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'text/turtle' },
      body: '<#it> <http://www.w3.org/2000/01/rdf-schema#label> "via keycloak" .',
    })
    expect([200, 201, 204, 205]).toContain(put.status)

    const get = await fetch(url, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/ld+json' },
    })
    expect(get.status).toBe(200)
    expect(await get.text()).toContain('via keycloak')
  })
})
