import { describe, it, expect } from 'vitest'
import { graphChannel } from './graph-channel.mjs'

const C = 'http://localhost:3838/alice/concepts/'
const cards = [
  { url: C + 'a.md', frontmatter: { type: 'Concept' },
    body: '{=<#it> .skos:Concept}\n[A]{skos:prefLabel} → [B](b.md){wm:implementedBy}.' },
  { url: C + 'b.md', frontmatter: { type: 'Concept' },
    body: '{=<#it> .skos:Concept}\n[B]{skos:prefLabel}.' },
]

describe('graphChannel', () => {
  it('targets graph.ttl with turtle media type', () => {
    expect(graphChannel.target(C)).toBe(C + 'graph.ttl')
    expect(graphChannel.mediaType).toBe('text/turtle')
  })
  it('unions every card\'s quads into one turtle document', async () => {
    const ttl = await graphChannel.render(C, cards, [])
    expect(ttl).toContain('a.md#it')
    expect(ttl).toContain('b.md#it')
    expect(ttl).toMatch(/wm:implementedBy/)
    expect((ttl.match(/skos:prefLabel/g) || []).length).toBe(2)
  })
})
