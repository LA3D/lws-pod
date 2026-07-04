import jsonld from 'jsonld'
import { Parser } from 'n3'

// Default remote-context loader rides the global fetch (honors NODE_EXTRA_CA_CERTS,
// same transport as the rest of the mechanism). Tests/checks inject their own.
async function fetchLoader(url) {
  const r = await fetch(url, { headers: { accept: 'application/ld+json, application/json' } })
  if (!r.ok) throw new Error(`remote context ${url} -> ${r.status}`)
  return { contextUrl: null, document: await r.json(), documentUrl: url }
}

// Descriptors/artifacts are consumed at the graph level (layer-cake P10):
// expand via jsonld → N-Quads → n3 quads. Never string-match compact JSON.
export async function jsonldToQuads(doc, base, { documentLoader = fetchLoader } = {}) {
  const input = typeof doc === 'string' ? JSON.parse(doc) : doc
  const nq = await jsonld.toRDF(input, { format: 'application/n-quads', base, documentLoader })
  return new Parser({ format: 'N-Quads' }).parse(nq)
}
