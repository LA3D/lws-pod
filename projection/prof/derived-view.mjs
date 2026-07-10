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

async function memberGraph(url, token, fetchFn, origin) {
  if (new URL(url).origin !== origin) throw new Error(`member off-origin: ${url}`)
  const r = await fetchFn(url, { headers: { accept: 'application/ld+json', ...authH(token) } })
  if (!r.ok) throw new Error(`member ${url} -> ${r.status}`)
  const doc = await r.json()
  const name = (doc['@id'] || url).split('#')[0]                  // graph name = doc IRI; flat members carry #it — strip to the document
  const quads = await jsonldToQuads(doc, url)                      // flatten to quads (graph component dropped below)
  return { name, quads }
}

export async function materializeDerivedView(containerUrl, token, declaration, { context = {}, fetchFn = fetch, skip = [] } = {}) {
  if (!['union', 'dataset'].includes(declaration.mode)) throw new Error(`derived-view: unknown mode ${declaration.mode}`)
  // v1: 'merge' behaves as 'replace' (push_mode is not yet consumed elsewhere; documented plan stance).
  if (declaration.push_mode && !['replace', 'merge'].includes(declaration.push_mode)) throw new Error(`derived-view: unknown push_mode ${declaration.push_mode}`)

  const origin = new URL(containerUrl).origin
  const target = new URL(declaration.named_graph, containerUrl).href
  if (new URL(target).origin !== origin) throw new Error(`derived-view target off-origin: ${target}`)
  let members = (await readMembers(containerUrl, token, fetchFn)).filter(u => u !== target && !skip.includes(u))
  if (declaration.members) members = members.filter(u => u.endsWith(declaration.members))
  const graphs = await Promise.all(members.map(u => memberGraph(u, token, fetchFn, origin)))

  let body
  if (declaration.mode === 'dataset') {
    const byGraph = {}
    for (const g of graphs) byGraph[g.name] = (byGraph[g.name] || []).concat(g.quads)   // same-named graphs union, never drop
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
