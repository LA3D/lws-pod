import { describe, it, expect } from 'vitest'
import { loadNamespaces } from './namespaces.mjs'

// Self-contained fixture — namespaces.mjs is the neutral floor and must not
// depend on any app-specific profile fixture (wiki-memory was deleted L4b).
const ctx = { '@context': {
  wm: 'https://w3id.org/cogitarelink/wm#',
  skos: 'http://www.w3.org/2004/02/skos/core#',
} }

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
