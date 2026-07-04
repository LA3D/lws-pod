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
// context→parser input, identity-policy/plane-mapping→configs, validation/vocabulary→artifact URLs.
async function dispatch(resources, acc, fetchFn) {
  for (const r of resources) {
    for (const role of r.roles) {
      if (role === ROLE + 'validation') { if (!acc.validation.includes(r.artifact)) acc.validation.push(r.artifact) }
      else if (role === ROLE + 'vocabulary') { if (!acc.vocabulary.includes(r.artifact)) acc.vocabulary.push(r.artifact) }
      else if (role === LWSP_ROLE + 'context') acc.contexts.push(await fetchJson(r.artifact, fetchFn))
      else if (role === LWSP_ROLE + 'identity-policy') acc.identityPolicy = await fetchJson(r.artifact, fetchFn)
      else if (role === LWSP_ROLE + 'plane-mapping') acc.planeMapping = await fetchJson(r.artifact, fetchFn)
      else acc.unknownRoles.push({ role, artifact: r.artifact })
    }
  }
}

// Depth-first, parents first: floor artifacts land before okf-base before
// llm-wiki. nearest-wins configs = child assignment overwrites parent's.
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
    identityPolicy: null, planeMapping: null, unknownRoles: [] }
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
  try { r = await fetchFn(metaUrl, { headers: { accept: 'application/ld+json, application/json' } }) } catch { return null }
  if (!r.ok) return null
  let quads
  try { quads = await jsonldToQuads(await r.text(), metaUrl) } catch { return null }
  return quads.find((q) => q.predicate.value === DCT_CONFORMS)?.object.value ?? null
}

// Binding discovery (spec §4/§6): own .meta → container .meta up-walk (URL
// path; linkset rel=up equivalence documented) → index default → null.
export async function discoverBinding(resourceUrl, { fetchFn = fetch, indexUrl = null } = {}) {
  const u = new URL(resourceUrl)
  const own = await conformsToFromMeta(resourceUrl.replace(/\/$/, '') + (resourceUrl.endsWith('/') ? '/.meta' : '.meta'), fetchFn)
  if (own) return own
  const segs = u.pathname.split('/').filter(Boolean)
  for (let i = segs.length - 1; i >= 0; i--) {
    const containerMeta = `${u.origin}/${segs.slice(0, i).join('/')}${i ? '/' : ''}.meta`
    const found = await conformsToFromMeta(containerMeta, fetchFn)
    if (found) return found
  }
  if (indexUrl) {
    try { return (await readProfileIndex(indexUrl, { fetchFn })).defaultProfile } catch { return null }
  }
  return null
}
