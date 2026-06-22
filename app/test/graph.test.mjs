import { describe, it, expect } from 'vitest'
import { pathToFileURL } from 'node:url'
import { worklist, neighborhood } from '../src/graph.js'

const concepts = pathToFileURL(new URL('../fixtures/concepts.ttl', import.meta.url).pathname).href

describe('graph', () => {
  it('worklist returns concepts with no wm:implementedBy', async () => {
    const rows = await worklist(concepts)
    expect(rows.map(r => r.label).sort()).toEqual(['Hierarchical Retrieval'])
  })

  it('neighborhood returns focus edges with labeled and stub targets', async () => {
    const n = await neighborhood(concepts, 'http://pod.test/concepts/progressive-disclosure#it')
    const labels = n.nodes.map(x => x.label)
    expect(labels).toContain('Progressive Disclosure')
    expect(labels).toContain('Hierarchical Retrieval')
    expect(n.edges.find(e => e.label === 'implementedBy')).toBeTruthy()
  })
})
