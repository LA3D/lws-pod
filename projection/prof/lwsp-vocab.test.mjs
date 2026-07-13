import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { Parser } from 'n3'

// B7 — the identity-policy convention (pathPrefix/fragment/slugStrategy/
// versioning/planeContainer) minted as first-class RDF terms, not bare JSON
// keys, so a cold agent can read the minting/deref convention as a graph.
// Spec §5 "Discovery layer — B7 identity-policy vocabulary".

const RDF_TYPE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type'
const RDF_PROPERTY = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#Property'
const SKOS_CONCEPT = 'http://www.w3.org/2004/02/skos/core#Concept'
const SKOS_IN_SCHEME = 'http://www.w3.org/2004/02/skos/core#inScheme'
const LWSP = 'https://w3id.org/lws-pod/profile#'

const TERMS = ['pathPrefix', 'fragment', 'slugStrategy', 'versioning', 'planeContainer']

const ttlPath = new URL('../profiles/defs/lwsp.ttl', import.meta.url)

describe('lwsp.ttl identity-policy vocabulary (B7)', () => {
  it('parses as valid Turtle', () => {
    const ttl = readFileSync(ttlPath, 'utf8')
    expect(() => new Parser().parse(ttl)).not.toThrow()
  })

  for (const term of TERMS) {
    const iri = LWSP + term
    it(`mints lwsp:${term} as an rdf:Property + skos:Concept in the lwsp: scheme`, () => {
      const ttl = readFileSync(ttlPath, 'utf8')
      const quads = new Parser().parse(ttl)
      const subjectTriples = quads.filter((q) => q.subject.value === iri)
      expect(subjectTriples.length, `no triples at all for ${iri}`).toBeGreaterThan(0)
      expect(subjectTriples.some((q) => q.predicate.value === RDF_TYPE && q.object.value === RDF_PROPERTY),
        `${iri} missing 'a rdf:Property'`).toBe(true)
      expect(subjectTriples.some((q) => q.predicate.value === RDF_TYPE && q.object.value === SKOS_CONCEPT),
        `${iri} missing 'a skos:Concept'`).toBe(true)
      expect(subjectTriples.some((q) => q.predicate.value === SKOS_IN_SCHEME && q.object.value === LWSP),
        `${iri} missing 'skos:inScheme lwsp:'`).toBe(true)
    })
  }
})
