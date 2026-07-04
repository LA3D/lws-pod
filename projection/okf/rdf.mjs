import jsonld from 'jsonld'
import { Parser } from 'n3'

// Descriptors/artifacts are consumed at the graph level (layer-cake P10):
// expand via jsonld → N-Quads → n3 quads. Never string-match compact JSON.
export async function jsonldToQuads(doc, base) {
  const input = typeof doc === 'string' ? JSON.parse(doc) : doc
  const nq = await jsonld.toRDF(input, { format: 'application/n-quads', base })
  return new Parser({ format: 'N-Quads' }).parse(nq)
}
