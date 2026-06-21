import { describe, it, expect } from 'vitest'
import { renderIndex, indexChannel } from './index-channel.mjs'

const C = 'http://localhost:3838/alice/concepts/'
const cards = [
  { url: C + 'progressive-disclosure.md',
    frontmatter: { title: 'Progressive Disclosure', description: 'Layered retrieval.' }, body: '' },
  { url: C + 'hierarchical-retrieval.md',
    frontmatter: { title: 'Hierarchical Retrieval', description: 'Typed routing.' }, body: '' },
]
const members = [
  ...cards.map(c => ({ url: c.url, type: 'data' })),
  { url: C + 'sub/', type: 'container' },
]

describe('renderIndex', () => {
  it('lists concepts with title + description, container-relative links', () => {
    const md = renderIndex(C, cards, members)
    expect(md).toContain('* [Progressive Disclosure](progressive-disclosure.md) - Layered retrieval.')
    expect(md).toContain('* [Hierarchical Retrieval](hierarchical-retrieval.md) - Typed routing.')
  })
  it('emits a Subdirectories section for child containers', () => {
    const md = renderIndex(C, cards, members)
    expect(md).toContain('# Subdirectories')
    expect(md).toContain('* [sub](sub/)')
  })
  it('omits the Subdirectories section when there are none', () => {
    const md = renderIndex(C, cards, members.filter(m => m.type === 'data'))
    expect(md).not.toContain('# Subdirectories')
  })
  it('has no frontmatter (OKF index files carry none)', () => {
    expect(renderIndex(C, cards, members).startsWith('---')).toBe(false)
  })
})

describe('indexChannel', () => {
  it('targets index.md and renders markdown', async () => {
    expect(indexChannel.target(C)).toBe(C + 'index.md')
    expect(indexChannel.mediaType).toBe('text/markdown')
    expect(await indexChannel.render(C, cards, members)).toContain('Progressive Disclosure')
  })
})
