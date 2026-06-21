import { describe, it, beforeAll, expect } from 'vitest'
import { BASE, ensurePod, getToken } from './helpers.mjs'

describe('pod lifecycle', () => {
  let token, webid
  beforeAll(async () => {
    await ensurePod()
    ;({ token, webid } = await getToken())
  })

  it('server is reachable', async () => {
    const r = await fetch(`${BASE}/`)
    expect(r.status).toBeLessThan(500)
  })

  it('creates the pod (or it already exists)', async () => {
    const status = await ensurePod()
    expect([200, 201, 409]).toContain(status)
  })

  it('issues a headless bearer + webid', async () => {
    expect(token).toBeTruthy()
    expect(webid).toMatch(/^https?:\/\//)
  })

  it('writes and reads a resource as the agent', async () => {
    const url = `${BASE}/alice/notes/hello.ttl`
    const put = await fetch(url, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'text/turtle' },
      body: '<#it> <http://www.w3.org/2000/01/rdf-schema#label> "hello from an agent" .',
    })
    expect([200, 201, 204, 205]).toContain(put.status)

    const get = await fetch(url, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/ld+json' },
    })
    expect(get.status).toBe(200)
    expect(await get.text()).toContain('hello from an agent')
  })

  it('content-negotiates to turtle', async () => {
    const r = await fetch(`${BASE}/alice/notes/hello.ttl`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'text/turtle' },
    })
    expect(r.status).toBe(200)
    expect(r.headers.get('content-type')).toMatch(/text\/turtle/)
  })
})
