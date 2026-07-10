import { describe, it, expect } from 'vitest'
import { jsonldToQuads } from './rdf.mjs'

describe('jsonldToQuads', () => {
  it('parses compact JSON-LD to quads at the graph level', async () => {
    const doc = {
      '@context': { dct: 'http://purl.org/dc/terms/', title: 'dct:title' },
      '@id': 'https://example.org/x',
      title: 'hello',
    }
    const quads = await jsonldToQuads(doc)
    expect(quads).toHaveLength(1)
    expect(quads[0].subject.value).toBe('https://example.org/x')
    expect(quads[0].predicate.value).toBe('http://purl.org/dc/terms/title')
    expect(quads[0].object.value).toBe('hello')
  })

  it('resolves relative IRIs against base', async () => {
    const doc = { '@context': { dct: 'http://purl.org/dc/terms/' }, '@id': '', 'dct:title': 't' }
    const quads = await jsonldToQuads(doc, 'https://pod.example/profiles/okf-base.jsonld')
    expect(quads[0].subject.value).toBe('https://pod.example/profiles/okf-base.jsonld')
  })

  it('throws on unparseable input', async () => {
    await expect(jsonldToQuads('not json at all')).rejects.toThrow()
  })

  it('threads a custom documentLoader for remote @context resolution', async () => {
    const doc = { '@context': 'ctx.jsonld', '@id': '', title: 'hi' }
    const loader = async (url) => {
      if (url === 'https://x/profiles/ctx.jsonld')
        return { contextUrl: null, document: { '@context': { dct: 'http://purl.org/dc/terms/', title: 'dct:title' } }, documentUrl: url }
      throw new Error(`unexpected fetch of ${url}`)
    }
    const quads = await jsonldToQuads(doc, 'https://x/profiles/d.jsonld', { documentLoader: loader })
    expect(quads[0].predicate.value).toBe('http://purl.org/dc/terms/title')
  })
})
