// projection/okf/links.test.mjs
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { loadNamespaces } from '../prof/namespaces.mjs'
import { typeLinkHeaders } from './links.mjs'
const ns = loadNamespaces(JSON.parse(readFileSync(new URL('../profiles/wiki-memory/context.jsonld', import.meta.url))))

describe('typeLinkHeaders', () => {
  it('emits rel="type" for the resolved class and rels for indexed relations present', () => {
    const h = typeLinkHeaders({ type: 'skos:Concept', implementedBy: 'impl.md' }, ns, ['implementedBy', 'broader'])
    expect(h).toContain('<http://www.w3.org/2004/02/skos/core#Concept>; rel="type"')
    expect(h).toContain('rel="https://w3id.org/cogitarelink/wm#implementedBy"')
  })

  it('omits relation entries absent from the frontmatter', () => {
    const h = typeLinkHeaders({ type: 'skos:Concept' }, ns, ['implementedBy', 'broader'])
    expect(h).not.toContain('implementedBy')
  })

  it('percent-encodes non-ASCII characters in Link targets', () => {
    const h = typeLinkHeaders({ type: 'skos:Concept', implementedBy: 'implé.md' }, ns, ['implementedBy', 'broader'])
    expect(h).toContain('impl%C3%A9.md')
    expect(h).not.toContain('implé.md')
  })

  it('omits unmapped indexedRels entirely (no relative rel emitted)', () => {
    const h = typeLinkHeaders({ type: 'skos:Concept', bogusRel: 'some-target.md' }, ns, ['bogusRel'])
    expect(h).not.toContain('bogusRel')
    expect(h).not.toContain('some-target.md')
  })

  it('bare type with no ns alias emits NO rel="type" (no engine vocabulary — P5)', () => {
    const ns = { resolveCurie: (c) => 'http://x/' + c.split(':')[1], term: {} }
    expect(typeLinkHeaders({ type: 'Concept' }, ns, [])).toBe('')
  })

  it('bare type resolves through a ns term alias when one exists', () => {
    const ns = { resolveCurie: (c) => 'http://vocab/' + c.split(':')[1], term: { Concept: 'wm:Concept' } }
    expect(typeLinkHeaders({ type: 'Concept' }, ns, [])).toContain('rel="type"')
  })

  it('indexedRels is required', () => {
    expect(() => typeLinkHeaders({ type: 'a:B' }, { resolveCurie: (c) => c, term: {} })).toThrow(/indexedRels/)
  })
})
