// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { pathToFileURL } from 'node:url'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { worklist, neighborhood } from '../src/graph.js'

const concepts = pathToFileURL(new URL('../fixtures/concepts.ttl', import.meta.url).pathname).href

describe('graph', () => {
  it('worklist returns concepts with no wm:implementedBy', async () => {
    const rows = await worklist(concepts)
    expect(rows.map(r => r.label).sort()).toEqual(['Hierarchical Retrieval'])
  })

  // S4: label-less concept must be absent from worklist
  it('worklist omits concepts with no skos:prefLabel', async () => {
    const rows = await worklist(concepts)
    const iris = rows.map(r => r.concept)
    const labels = rows.map(r => r.label)
    expect(iris).not.toContain('http://pod.test/concepts/unlabeled-concept#it')
    expect(labels).not.toContain('unlabeled-concept')
    // Existing labeled concept must still appear
    expect(labels).toContain('Hierarchical Retrieval')
  })

  it('neighborhood returns focus edges with labeled and stub targets', async () => {
    const n = await neighborhood(concepts, 'http://pod.test/concepts/progressive-disclosure#it')
    const labels = n.nodes.map(x => x.label)
    expect(labels).toContain('Progressive Disclosure')
    expect(labels).toContain('Hierarchical Retrieval')
    expect(n.edges.find(e => e.label === 'implementedBy')).toBeTruthy()
  })

  // S3: target whose container graph is unreachable → stub:true + localname label
  it('neighborhood returns stub:true with localname for unresolvable container target', async () => {
    const n = await neighborhood(concepts, 'http://pod.test/concepts/progressive-disclosure#it')
    // index-view#it is an implementedBy target; its container (http://pod.test/implementations/graph.ttl)
    // is unreachable in tests, so it should come back as stub:true
    const implNode = n.nodes.find(x => x.id === 'http://pod.test/implementations/index-view#it')
    expect(implNode).toBeDefined()
    expect(implNode.stub).toBe(true)
    // localname = last segment after # or / — for ...index-view#it that is 'it'
    expect(implNode.label).toBe('it')
  })

  // S2: cross-container label resolution — target label lives in a DIFFERENT container file
  it('neighborhood resolves a label from a cross-container graph.ttl', async () => {
    // Create two temp containers under a shared tmpdir.
    // Container A: holds the focus concept; its implementedBy points to an IRI in container B.
    // Container B: holds the target IRI's label.
    // containerGraphOf(targetIri) must derive Container B's graph.ttl path from the target IRI.
    const tmp = await mkdtemp(join(tmpdir(), 'graph-test-'))

    // Container A: file://<tmp>/concepts/graph.ttl
    // Container B: file://<tmp>/implementations/graph.ttl
    // Target IRI (in container B's namespace): file://<tmp>/implementations/cross-impl#it
    // containerGraphOf strips the fragment and filename, appends graph.ttl:
    //   file://<tmp>/implementations/cross-impl#it → file://<tmp>/implementations/graph.ttl ✓

    const conceptIri = `file://${tmp}/concepts/cross-concept#it`
    const implIri    = `file://${tmp}/implementations/cross-impl#it`

    const conceptsTtl = `
@prefix skos: <http://www.w3.org/2004/02/skos/core#> .
@prefix wm:   <https://w3id.org/cogitarelink/wm#> .
<${conceptIri}> a skos:Concept ;
  skos:prefLabel "Cross Concept" ;
  wm:implementedBy <${implIri}> .
`
    const implsTtl = `
@prefix skos: <http://www.w3.org/2004/02/skos/core#> .
<${implIri}> a skos:Concept ;
  skos:prefLabel "Cross Impl" .
`
    // Write container files to tmpdir; directory structure mirrors IRI paths
    const { mkdir } = await import('node:fs/promises')
    await mkdir(join(tmp, 'concepts'), { recursive: true })
    await mkdir(join(tmp, 'implementations'), { recursive: true })
    await writeFile(join(tmp, 'concepts', 'graph.ttl'), conceptsTtl)
    await writeFile(join(tmp, 'implementations', 'graph.ttl'), implsTtl)

    const seedUrl = `file://${tmp}/concepts/graph.ttl`
    const n = await neighborhood(seedUrl, conceptIri)

    const implNode = n.nodes.find(x => x.id === implIri)
    expect(implNode).toBeDefined()
    // Cross-container label resolved → stub must be false and label must be real
    expect(implNode.stub).toBe(false)
    expect(implNode.label).toBe('Cross Impl')
  })
})
