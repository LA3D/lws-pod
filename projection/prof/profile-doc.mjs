import { jsonldToQuads } from './rdf.mjs'

const PROF = 'http://www.w3.org/ns/dx/prof/'
const DCT = 'http://purl.org/dc/terms/'
const P = {
  isProfileOf: PROF + 'isProfileOf', hasToken: PROF + 'hasToken',
  hasResource: PROF + 'hasResource', hasRole: PROF + 'hasRole', hasArtifact: PROF + 'hasArtifact',
  format: DCT + 'format', source: DCT + 'source', version: DCT + 'hasVersion',
}

function objectsOf(quads, subject, predicate) {
  return quads.filter((q) => q.subject.value === subject && q.predicate.value === predicate).map((q) => q.object)
}

// Graph-level PROF read (P10). Roles stay opaque IRI strings here; the
// loader (profile-loader.mjs) owns dispatch. Unknown roles pass through.
export async function descriptorToProfile(doc, descriptorUrl, { documentLoader } = {}) {
  const quads = await jsonldToQuads(doc, descriptorUrl, { documentLoader })
  const id = descriptorUrl
  // prof:hasToken is declaration-side metadata only; server-side selection is
  // exact-profile-URI (2026-07-19 closeout, R16).
  const token = objectsOf(quads, id, P.hasToken)[0]?.value ?? null
  const parents = objectsOf(quads, id, P.isProfileOf).map((o) => o.value)
  const resources = objectsOf(quads, id, P.hasResource).map((node) => ({
    roles: objectsOf(quads, node.value, P.hasRole).map((o) => o.value),
    artifact: objectsOf(quads, node.value, P.hasArtifact)[0]?.value ?? null,
    format: objectsOf(quads, node.value, P.format)[0]?.value ?? null,
    source: objectsOf(quads, node.value, P.source)[0]?.value ?? null,
    version: objectsOf(quads, node.value, P.version)[0]?.value ?? null,
  })).filter((r) => r.artifact)
  return { id, token, parents, resources }
}
