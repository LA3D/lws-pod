import { describe, it, expect } from 'vitest'
import { makeEngineProfile } from './engine-profile.mjs'
import { cardToQuads } from './card.mjs'
import { loadNamespaces } from './namespaces.mjs'

const AUTH = 'https://pod-a.example/'
const loaded = {
  id: 'https://pod-a.example/profiles/llm-wiki/profile.jsonld', token: 'llm-wiki',
  conformance: [], validation: ['https://pod-a.example/profiles/llm-wiki/shapes.ttl'],
  vocabulary: [], unknownRoles: [],
  contexts: [
    { '@context': { dcterms: 'http://purl.org/dc/terms/', type: '@type', title: { '@id': 'dcterms:title' } } },
    { '@context': { wm: 'https://example.org/wm#', extends: { '@id': 'wm:extends', '@type': '@id' }, Concept: 'wm:Concept' } },
  ],
  identityPolicy: { pathPrefix: 'id/', fragment: '#it' },
  planeMapping: null,
}

describe('makeEngineProfile', () => {
  it('mints under the resolved authority — same card, two pods, two IRIs; declared id still wins', () => {
    const pA = makeEngineProfile(loaded, 'https://pod-a.example/')
    const pB = makeEngineProfile(loaded, 'https://pod-b.example/')
    const md = '---\ntitle: X\n---\n'
    const nsA = loadNamespaces(pA.context), nsB = loadNamespaces(pB.context)
    const a = cardToQuads(md, 'https://pod-a.example/alice/notes/x.md', nsA, pA.identityPolicy)
    const b = cardToQuads(md, 'https://pod-b.example/bob/stuff/x.md', nsB, pB.identityPolicy)
    expect(a.quads[0].subject.value).toBe('https://pod-a.example/id/x#it')
    expect(b.quads[0].subject.value).toBe('https://pod-b.example/id/x#it')
    const dec = cardToQuads('---\nid: urn:me:1\ntitle: X\n---\n', 'https://pod-a.example/y.md', nsA, pA.identityPolicy)
    expect(dec.quads[0].subject.value).toBe('urn:me:1')
  })

  it('stacks contexts base-first and injects the runtime proto @vocab layer', () => {
    const p = makeEngineProfile(loaded, AUTH)
    const ns = loadNamespaces(p.context)
    expect(ns.vocab).toBe(AUTH + 'proto#')
    expect(ns.term.title).toBeDefined()           // base layer survives
    expect(ns.term.extends).toBeDefined()          // profile layer stacked
  })

  it('unknown frontmatter keys mint to proto and are reported, not dropped (P6)', () => {
    const p = makeEngineProfile(loaded, AUTH)
    const ns = loadNamespaces(p.context)
    const { quads, protoTerms } = cardToQuads('---\ntitle: X\nvibe: chill\n---\n', AUTH + 'n.md', ns, p.identityPolicy)
    const q = quads.find((x) => x.predicate.value === AUTH + 'proto#vibe')
    expect(q.object.value).toBe('chill')
    expect(protoTerms).toEqual(['vibe'])
  })

  it('bare type: resolves via the profile context, else proto — skos: hardcode is dead', () => {
    const p = makeEngineProfile(loaded, AUTH)
    const ns = loadNamespaces(p.context)
    const typed = cardToQuads('---\ntype: Concept\n---\n', AUTH + 'c.md', ns, p.identityPolicy)
    expect(typed.quads.find((q) => q.predicate.value.endsWith('#type')).object.value).toBe('https://example.org/wm#Concept')
    const unknown = cardToQuads('---\ntype: Gadget\n---\n', AUTH + 'g.md', ns, p.identityPolicy)
    expect(unknown.quads.find((q) => q.predicate.value.endsWith('#type')).object.value).toBe(AUTH + 'proto#Gadget')
  })

  it('urn:/did: edge targets pass through unminted (Plan-1 carryover #2)', () => {
    const p = makeEngineProfile(loaded, AUTH)
    const ns = loadNamespaces(p.context)
    const { quads } = cardToQuads('---\nextends: did:web:pod.example:z\n---\n', AUTH + 'e.md', ns, p.identityPolicy)
    expect(quads.find((q) => q.predicate.value === 'https://example.org/wm#extends').object.value).toBe('did:web:pod.example:z')
  })
})
