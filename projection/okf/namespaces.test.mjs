import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { loadNamespaces } from './namespaces.mjs'

const ctx = JSON.parse(readFileSync(new URL('../profiles/wiki-memory/context.jsonld', import.meta.url)))

describe('loadNamespaces', () => {
  it('resolves a CURIE through the context prefixes', () => {
    const ns = loadNamespaces(ctx)
    expect(ns.resolveCurie('skos:Concept')).toBe('http://www.w3.org/2004/02/skos/core#Concept')
    expect(ns.resolveCurie('wm:implementedBy')).toBe('https://w3id.org/cogitarelink/wm#implementedBy')
  })

  it('passes through an absolute IRI unchanged', () => {
    const ns = loadNamespaces(ctx)
    expect(ns.resolveCurie('https://schema.org/Article')).toBe('https://schema.org/Article')
  })

  it('changing the wm authority in the context re-grounds every wm CURIE', () => {
    const swapped = structuredClone(ctx)
    swapped['@context'].wm = 'https://example.org/v2#'
    const ns = loadNamespaces(swapped)
    expect(ns.resolveCurie('wm:implementedBy')).toBe('https://example.org/v2#implementedBy')
  })
})
