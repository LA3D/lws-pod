import { descriptorToProfile } from './profile-doc.mjs'
import { readProfileIndex } from './resolve.mjs'
import { jsonldToQuads } from './rdf.mjs'

const ROLE = 'http://www.w3.org/ns/dx/prof/role/'
const LWSP_ROLE = 'https://w3id.org/lws-pod/profile/role/'
const DCT_CONFORMS = 'http://purl.org/dc/terms/conformsTo'

async function fetchJson(url, fetchFn) {
  const r = await fetchFn(url, { headers: { accept: 'application/ld+json, application/json' } })
  if (!r.ok) throw new Error(`${url} -> ${r.status}`)
  return r.json()
}

// The role dispatch table — the ONLY place role IRIs are interpreted (P7).
// context→parser input, identity-policy/plane-mapping→configs, validation/vocabulary→artifact URLs,
// derived-view→fetched artifact appended to the derivedViews list,
// representation→fetched config appended to the representations list (conformsTo resolved absolute).
async function dispatch(resources, acc, fetchFn) {
  for (const r of resources) {
    for (const role of r.roles) {
      if (role === ROLE + 'validation') { if (!acc.validation.includes(r.artifact)) acc.validation.push(r.artifact) }
      else if (role === ROLE + 'vocabulary') { if (!acc.vocabulary.includes(r.artifact)) acc.vocabulary.push(r.artifact) }
      else if (role === LWSP_ROLE + 'context') acc.contexts.push(await fetchJson(r.artifact, fetchFn))
      else if (role === LWSP_ROLE + 'identity-policy') acc.identityPolicy = await fetchJson(r.artifact, fetchFn)
      else if (role === LWSP_ROLE + 'plane-mapping') acc.planeMapping = await fetchJson(r.artifact, fetchFn)
      else if (role === LWSP_ROLE + 'derived-view') acc.derivedViews.push(await fetchJson(r.artifact, fetchFn))
      else if (role === LWSP_ROLE + 'representation') {
        const rep = await fetchJson(r.artifact, fetchFn)
        if (rep.conformsTo) rep.conformsTo = new URL(rep.conformsTo, r.artifact).href
        acc.representations.push(rep)
      }
      else acc.unknownRoles.push({ role, artifact: r.artifact })
    }
  }
}

// Depth-first, parents first: floor artifacts land before parent-family
// artifacts before child's. nearest-wins configs = child assignment overwrites parent's.
async function walk(url, acc, visited, fetchFn) {
  if (visited.has(url)) return
  visited.add(url)
  let d
  try { d = await descriptorToProfile(await fetchJson(url, fetchFn), url) }
  catch { acc.conformance.push({ iri: url, resolved: false }); return }   // opaque parent (spec §2/§6)
  // Non-PROF parent (valid JSON-LD, zero PROF triples about itself) is opaque
  // too (spec §6) — external standards like w3id.org/ro/crate resolve to real
  // docs that are not PROF descriptors. Legit descriptors always carry a token.
  if (!d.token && !d.parents.length && !d.resources.length) {
    acc.conformance.push({ iri: url, resolved: false })
    return
  }
  acc.conformance.push({ iri: url, resolved: true })
  for (const p of d.parents) await walk(p, acc, visited, fetchFn)
  await dispatch(d.resources, acc, fetchFn)
}

export async function loadProfile(descriptorUrl, { fetchFn = fetch } = {}) {
  const acc = { conformance: [], validation: [], vocabulary: [], contexts: [],
    identityPolicy: null, planeMapping: null, derivedViews: [], representations: [], unknownRoles: [] }
  // The root descriptor must resolve — loud (P8 declaration side of the loader).
  const root = await descriptorToProfile(await fetchJson(descriptorUrl, fetchFn), descriptorUrl)
  const visited = new Set([descriptorUrl])
  for (const p of root.parents) await walk(p, acc, visited, fetchFn)
  await dispatch(root.resources, acc, fetchFn)
  // conformance lists parents (walked or opaque); the root itself is the profile.
  return { id: root.id, token: root.token, ...acc }
}

async function conformsToFromMeta(metaUrl, fetchFn) {
  let r
  try { r = await fetchFn(metaUrl, { headers: { accept: 'application/ld+json, application/json' } }) } catch { return [] }
  if (!r.ok) return []
  let quads
  try { quads = await jsonldToQuads(await r.text(), metaUrl) } catch { return [] }
  // Plural on purpose (B6): a resource may conform to several profiles; the
  // substrate's linkset layer is plural (conformsToTargets) and this API must
  // not collapse it. Which profile GOVERNS a read is an L4b read-side question.
  //
  // Subject-scoped to the .meta document's OWN node (task-10 finding,
  // navigator round): `.meta`'s `@id: ''` expands against `metaUrl` (the
  // base IRI passed to jsonldToQuads), so the container/resource's own
  // binding triple has subject === metaUrl. `altr:hasRepresentation`
  // entries (conneg-by-profile Phase 2) are SEPARATE JSON-LD nodes with
  // their OWN explicit `@id` (the represented resource's URL) and carry
  // their OWN per-representation `dct:conformsTo` — a different fact
  // (which profile a MATERIALIZED FACE conforms to, not what the
  // container/resource is BOUND to). An unscoped predicate-only filter
  // swept those in too, inflating a single binding into a duplicated,
  // wrong array once a bound container also had materialized alternates.
  return quads.filter((q) => q.predicate.value === DCT_CONFORMS && q.subject.value === metaUrl).map((q) => q.object.value)
}

// Binding discovery (spec §4/§6): every dct:conformsTo target at the FIRST level
// that has any (own .meta → container .meta up-walk via URL path → index default
// → []). Never null; empty array = unbound.
export async function discoverBinding(resourceUrl, { fetchFn = fetch, indexUrl = null } = {}) {
  const u = new URL(resourceUrl)
  const own = await conformsToFromMeta(resourceUrl.replace(/\/$/, '') + (resourceUrl.endsWith('/') ? '/.meta' : '.meta'), fetchFn)
  if (own.length) return own
  const segs = u.pathname.split('/').filter(Boolean)
  for (let i = segs.length - 1; i >= 0; i--) {
    const containerMeta = `${u.origin}/${segs.slice(0, i).join('/')}${i ? '/' : ''}.meta`
    const found = await conformsToFromMeta(containerMeta, fetchFn)
    if (found.length) return found
  }
  if (indexUrl) {
    try {
      const d = (await readProfileIndex(indexUrl, { fetchFn })).defaultProfile
      return d ? [d] : []
    } catch { return [] }
  }
  return []
}
