import { describe, it, expect } from 'vitest'
import { resolveStorageAuthority, readProfileIndex } from './resolve.mjs'

export function mockFetch(map) {
  return async (url, opts = {}) => {
    const e = map[String(url)]
    if (!e) return new Response('not found', { status: 404 })
    return new Response(opts.method === 'HEAD' ? null : (typeof e.body === 'string' ? e.body : JSON.stringify(e.body)),
      { status: e.status ?? 200, headers: e.headers ?? {} })
  }
}

const SD_URL = 'https://pod.example/.well-known/lws-storage'
const SD = {
  '@context': 'https://www.w3.org/ns/lws/v1',
  id: 'https://pod.example/', type: 'Storage',
  service: [
    { type: 'StorageDescription', serviceEndpoint: SD_URL },
    { type: 'ProfileIndexService', serviceEndpoint: 'https://pod.example/profiles/index.jsonld' },
  ],
}

describe('resolveStorageAuthority', () => {
  it('follows the storageDescription Link header and returns authority + profile index', async () => {
    const f = mockFetch({
      'https://pod.example/alice/notes/x.md': { body: '', headers: {
        link: `<${SD_URL}>; rel="https://www.w3.org/ns/lws#storageDescription"` } },
      [SD_URL]: { body: SD },
    })
    const r = await resolveStorageAuthority('https://pod.example/alice/notes/x.md', { fetchFn: f })
    expect(r.authority).toBe('https://pod.example/')
    expect(r.profileIndex).toBe('https://pod.example/profiles/index.jsonld')
  })

  it('falls back to the well-known convention when no Link header', async () => {
    const f = mockFetch({
      'https://pod.example/alice/y.md': { body: '' },
      [SD_URL]: { body: SD },
    })
    const r = await resolveStorageAuthority('https://pod.example/alice/y.md', { fetchFn: f })
    expect(r.authority).toBe('https://pod.example/')
  })

  it('profileIndex is null when the service is absent', async () => {
    const f = mockFetch({
      'https://pod.example/z.md': { body: '' },
      [SD_URL]: { body: { ...SD, service: [SD.service[0]] } },
    })
    const r = await resolveStorageAuthority('https://pod.example/z.md', { fetchFn: f })
    expect(r.profileIndex).toBeNull()
  })
})

describe('readProfileIndex', () => {
  it('returns descriptor list + optional default', async () => {
    const f = mockFetch({
      'https://pod.example/profiles/index.jsonld': { body: {
        profiles: ['https://pod.example/profiles/okf-base.jsonld', 'https://pod.example/profiles/llm-wiki/profile.jsonld'],
        defaultProfile: 'https://pod.example/profiles/okf-base.jsonld',
      } },
    })
    const r = await readProfileIndex('https://pod.example/profiles/index.jsonld', { fetchFn: f })
    expect(r.profiles).toHaveLength(2)
    expect(r.defaultProfile).toBe('https://pod.example/profiles/okf-base.jsonld')
  })
})
