// projection/okf/base-profile.test.mjs
import { describe, it, expect } from 'vitest'
import { baseProfile } from './base-profile.mjs'
import { loadNamespaces } from './namespaces.mjs'
import { cardToQuads } from './card.mjs'

describe('baseProfile', () => {
  it('carries an identity policy and a minimal context that projects an OKF card', () => {
    expect(typeof baseProfile.identityPolicy.mint).toBe('function')
    const ns = loadNamespaces(baseProfile.context)
    const md = `---
type: Reference
title: Orders
---
# Orders`
    const q = cardToQuads(md, 'http://pod/tables/orders.md', ns, baseProfile.identityPolicy)
    const titled = q.find(t => t.predicate.value === 'http://purl.org/dc/terms/title')
    expect(titled).toBeDefined()
    expect(titled.object.value).toBe('Orders')
    // subject is minted (base#slug), not the file URL
    expect(titled.subject.value.endsWith('orders#it')).toBe(true)
    expect(titled.subject.value.startsWith('http://pod/tables/')).toBe(false)
  })
})
