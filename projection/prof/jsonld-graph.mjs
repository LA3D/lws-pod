// Outbound serializer: RDF quads -> JSON-LD 1.1 named graph / dataset.
// The graph NAME is supplied in-band by the caller (never derived from a storage path);
// quad graph components are ignored so callers control naming explicitly.
import jsonld from 'jsonld'
import { Writer } from 'n3'

function writeNQuads(quads) {
  return new Promise((resolve, reject) => {
    // Force the default graph so fromRDF yields plain node objects we wrap ourselves.
    const w = new Writer({ format: 'application/n-quads' })
    for (const q of quads) w.addQuad(q.subject, q.predicate, q.object)
    w.end((err, result) => (err ? reject(err) : resolve(result)))
  })
}

async function nodesFor(quads, context) {
  if (!quads.length) return []
  const expanded = await jsonld.fromRDF(await writeNQuads(quads), { format: 'application/n-quads' })
  const compacted = await jsonld.compact(expanded, context)
  if (Array.isArray(compacted['@graph'])) return compacted['@graph']
  const { '@context': _c, ...node } = compacted
  return Object.keys(node).length ? [node] : []
}

export async function quadsToNamedGraph(quads, { graphName, context }) {
  return { '@context': context, '@id': graphName, '@graph': await nodesFor(quads, context) }
}

export async function quadsToDataset(quadsByGraph, { context }) {
  const graphs = []
  for (const [graphName, quads] of Object.entries(quadsByGraph))
    graphs.push({ '@id': graphName, '@graph': await nodesFor(quads, context) })
  return { '@context': context, '@graph': graphs }
}

// Flat node form (spec §3): the memory's links representation — subject-first,
// no top-level @graph when the quads describe one subject. Multi-subject falls
// back to @graph (the fork admission parser handles both since the toDataset swap).
export async function quadsToFlat(quads, context) {
  const nodes = await nodesFor(quads, context)
  if (nodes.length === 1) return { '@context': context, ...nodes[0] }
  return { '@context': context, '@graph': nodes }
}
