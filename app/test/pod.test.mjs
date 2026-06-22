import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setSession, login, podFetch, putCard, getGraph } from '../src/pod.js'

describe('pod', () => {
  beforeEach(() => setSession({ podUrl: '', token: '', proxyUrl: '' }))

  it('login posts credentials and returns token + webid', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ access_token: 'tok', webid: 'https://pod/alice#me' }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    const out = await login('http://localhost:3838', 'alice@x.io', 'pw')
    expect(out).toEqual({ token: 'tok', webid: 'https://pod/alice#me' })
    const [url, opts] = fetchMock.mock.calls[0]
    expect(url).toBe('http://localhost:3838/idp/credentials')
    expect(JSON.parse(opts.body)).toEqual({ email: 'alice@x.io', password: 'pw' })
  })

  it('podFetch attaches the bearer token', async () => {
    setSession({ podUrl: 'http://localhost:3838', token: 'tok', proxyUrl: '' })
    const fetchMock = vi.fn().mockResolvedValue(new Response('ok', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    await podFetch('http://localhost:3838/concepts/')
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe('Bearer tok')
  })

  it('putCard targets the proxy with text/markdown and returns status + body message', async () => {
    setSession({ podUrl: 'http://localhost:3838', token: 'tok', proxyUrl: 'http://localhost:8080' })
    const fetchMock = vi.fn().mockResolvedValue(new Response('# 422 …declare implementation', { status: 422 }))
    vi.stubGlobal('fetch', fetchMock)
    const r = await putCard('http://localhost:3838/concepts/x.md', '---\ntype: Concept\n---\n# X')
    const [url, opts] = fetchMock.mock.calls[0]
    expect(url).toBe('http://localhost:8080/concepts/x.md')
    expect(opts.headers['Content-Type']).toBe('text/markdown')
    expect(r.status).toBe(422)
    expect(r.message).toContain('declare implementation')
  })

  it('getGraph fetches graph.ttl with turtle accept', async () => {
    setSession({ podUrl: 'http://localhost:3838', token: 'tok', proxyUrl: '' })
    const fetchMock = vi.fn().mockResolvedValue(new Response('@prefix … .', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    await getGraph('http://localhost:3838/concepts/')
    expect(fetchMock.mock.calls[0][0]).toBe('http://localhost:3838/concepts/graph.ttl')
    expect(fetchMock.mock.calls[0][1].headers.Accept).toBe('text/turtle')
  })
})
