// projection/okf/base-profile.test.mjs
import { describe, it, expect } from 'vitest'
import { baseProfile, makeBaseProfile } from './base-profile.mjs'
import { loadNamespaces } from '../prof/namespaces.mjs'
import { cardToQuads } from './card.mjs'

describe('baseProfile (legacy urn: fixture, test-only — not reachable from any running path)', () => {
  it('carries an identity policy and a minimal context that projects an OKF card', () => {
    expect(typeof baseProfile.identityPolicy.mint).toBe('function')
    const ns = loadNamespaces(baseProfile.context)
    const md = `---
type: Reference
title: Orders
---
# Orders`
    const { quads: q } = cardToQuads(md, 'http://pod/tables/orders.md', ns, baseProfile.identityPolicy)
    const titled = q.find(t => t.predicate.value === 'http://purl.org/dc/terms/title')
    expect(titled).toBeDefined()
    expect(titled.object.value).toBe('Orders')
    // subject is minted (base#slug), not the file URL
    expect(titled.subject.value.endsWith('orders#it')).toBe(true)
    expect(titled.subject.value.startsWith('http://pod/tables/')).toBe(false)
    // Plan-2 LANDED: type-scheme resolution now goes through the profile context
    // (term alias -> resolveCurie -> @vocab proto mint) — the old asTypeCurie()
    // 'skos:' engine-vocabulary hardcode is gone. This legacy context has no
    // @vocab and no 'Reference' alias, so the bare type: value passes through
    // UNRESOLVED — 'Reference', not 'skos:Reference'.
    const typed = q.find(t => t.predicate.value === 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type')
    expect(typed).toBeDefined()
    expect(typed.object.value).toBe('Reference')
  })
})

describe('makeBaseProfile', () => {
  it('resolves a bare type: through the runtime proto @vocab layer (authority + "proto#")', () => {
    const profile = makeBaseProfile('https://pod.example/')
    const ns = loadNamespaces(profile.context)
    const md = `---
type: Reference
title: Orders
---
# Orders`
    const { quads: q } = cardToQuads(md, 'http://pod/tables/orders.md', ns, profile.identityPolicy)
    const typed = q.find(t => t.predicate.value === 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type')
    expect(typed).toBeDefined()
    expect(typed.object.value).toBe('https://pod.example/proto#Reference')
    // identity policy mints under the passed authority, not the legacy urn: placeholder
    const titled = q.find(t => t.predicate.value === 'http://purl.org/dc/terms/title')
    expect(titled.subject.value).toBe('https://pod.example/orders#it')
  })
})
