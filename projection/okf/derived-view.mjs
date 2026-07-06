// projection/okf/derived-view.mjs
// Neutral derived-view materializer. Reads a container's member RDF resources and PUTs an
// aggregate named-graph JSON-LD view per a data declaration. No application vocabulary.
import { Parser } from 'n3'
import { jsonldToQuads } from './rdf.mjs'
import { quadsToNamedGraph, quadsToDataset } from './jsonld-graph.mjs'

const LDP_CONTAINS = 'http://www.w3.org/ns/ldp#contains'
const authH = (token) => (token ? { authorization: `Bearer ${token}` } : {})

async function readMembers(containerUrl, token, fetchFn) {
  const r = await fetchFn(containerUrl, { headers: { accept: 'text/turtle', ...authH(token) } })
  if (!r.ok) throw new Error(`container ${containerUrl} -> ${r.status}`)
  const quads = new Parser().parse(await r.text())
  return quads.filter(q => q.predicate.value === LDP_CONTAINS).map(q => q.object.value)
}

async function memberGraph(url, token, fetchFn) {
  const r = await fetchFn(url, { headers: { accept: 'application/ld+json', ...authH(token) } })
  if (!r.ok) throw new Error(`member ${url} -> ${r.status}`)
  const doc = await r.json()
  const name = doc['@id'] || url                                  // in-band graph name, else the URL
  const quads = await jsonldToQuads(doc, url)                      // flatten to quads (graph component dropped below)
  return { name, quads }
}

export async function materializeDerivedView(containerUrl, token, declaration, { context = {}, fetchFn = fetch } = {}) {
  const target = new URL(declaration.named_graph, containerUrl).href
  const members = (await readMembers(containerUrl, token, fetchFn)).filter(u => u !== target)
  const graphs = await Promise.all(members.map(u => memberGraph(u, token, fetchFn)))

  let body
  if (declaration.mode === 'dataset') {
    const byGraph = {}
    for (const g of graphs) byGraph[g.name] = g.quads
    body = await quadsToDataset(byGraph, { context })
  } else {
    body = await quadsToNamedGraph(graphs.flatMap(g => g.quads), { graphName: target, context })
  }

  const put = await fetchFn(target, {
    method: 'PUT',
    headers: { 'content-type': 'application/ld+json', ...authH(token) },
    body: JSON.stringify(body),
  })
  return { target, status: put.status, mode: declaration.mode }
}
