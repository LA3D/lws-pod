// projection/okf/links.test.mjs
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { loadNamespaces } from './namespaces.mjs'
import { typeLinkHeaders } from './links.mjs'
const ns = loadNamespaces(JSON.parse(readFileSync(new URL('../profiles/wiki-memory/context.jsonld', import.meta.url))))

describe('typeLinkHeaders', () => {
  it('emits rel="type" for the resolved class and rels for indexed relations present', () => {
    const h = typeLinkHeaders({ type: 'Concept', implementedBy: 'impl.md' }, ns)
    expect(h).toContain('<http://www.w3.org/2004/02/skos/core#Concept>; rel="type"')
    expect(h).toContain('rel="https://w3id.org/cogitarelink/wm#implementedBy"')
  })

  it('omits relation entries absent from the frontmatter', () => {
    const h = typeLinkHeaders({ type: 'Concept' }, ns)
    expect(h).not.toContain('implementedBy')
  })
})
