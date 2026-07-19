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

// jsonld.toRDF (inside descriptorToProfile → jsonldToQuads) resolves remote
// @context refs through its OWN documentLoader, defaulting to an anonymous
// fetch — independent of the fetchFn used to fetch the descriptor body
// above. A private profiles tree (no public-read ACL, e.g. a private-tenant
// --no-acl publish) 401s on that anonymous context fetch even though the
// descriptor fetch itself was authenticated. Build a loader riding the same
// fetchFn so context resolution carries the same auth.
function authedDocumentLoader(fetchFn) {
  return async (url) => {
    const r = await fetchFn(url, { headers: { accept: 'application/ld+json, application/json' } })
    if (!r.ok) throw new Error(`remote context ${url} -> ${r.status}`)
    return { contextUrl: null, document: await r.json(), documentUrl: url }
  }
}

// Key-sorted recursive stringify — value equality for the conflict check must
// not depend on JSON key order (two descriptors expressing the identical
// policy with keys written in a different order are NOT a conflict).
function canonicalStringify(v) {
  if (v === null || typeof v !== 'object') return JSON.stringify(v)
  if (Array.isArray(v)) return `[${v.map(canonicalStringify).join(',')}]`
  return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canonicalStringify(v[k])}`).join(',')}}`
}

// P3b (spec 2026-07-19 §4): singleton configs resolve NEAREST-WINS by walk
// depth (child 0, parents 1, grandparents 2, …). Equal-depth disagreement is
// a hard error naming both sources UNLESS a strictly nearer assignment later
// resolves it — a root that declares its own value is depth 0, dispatched
// LAST (after every parent), so it always wins and always clears any pending
// conflict for that key. Conflicts are therefore DEFERRED (recorded, not
// thrown) here; `loadProfile` throws for whatever is still pending only
// after the root's own dispatch has had its chance to override.
function assignSingleton(acc, key, value, depth, source) {
  const cur = acc._singleton[key]
  if (!cur || depth < cur.depth) {
    acc._singleton[key] = { value, depth, source }
    acc[key] = value
    delete acc._conflicts[key]   // a strictly-nearer assignment supersedes any prior equal-depth dispute
    return
  }
  if (depth === cur.depth && canonicalStringify(cur.value) !== canonicalStringify(value))
    acc._conflicts[key] = { key, sourceA: cur.source, sourceB: source }
  // depth > cur.depth: farther than the nearest already recorded — ignore.
}

// The role dispatch table — the ONLY place role IRIs are interpreted (P7).
// context→parser input, identity-policy/plane-mapping→configs (nearest-wins, P3b),
// validation/vocabulary→artifact URLs,
// derived-view→fetched artifact appended to the derivedViews list,
// representation→fetched config appended to the representations list (conformsTo resolved absolute).
async function dispatch(resources, acc, fetchFn, depth) {
  for (const r of resources) {
    for (const role of r.roles) {
      if (role === ROLE + 'validation') { if (!acc.validation.includes(r.artifact)) acc.validation.push(r.artifact) }
      else if (role === ROLE + 'vocabulary') { if (!acc.vocabulary.includes(r.artifact)) acc.vocabulary.push(r.artifact) }
      else if (role === LWSP_ROLE + 'context') acc.contexts.push(await fetchJson(r.artifact, fetchFn))
      else if (role === LWSP_ROLE + 'identity-policy') assignSingleton(acc, 'identityPolicy', await fetchJson(r.artifact, fetchFn), depth, r.artifact)
      else if (role === LWSP_ROLE + 'plane-mapping') assignSingleton(acc, 'planeMapping', await fetchJson(r.artifact, fetchFn), depth, r.artifact)
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

// Phase 1 — COLLECT (P3b diamond fix): BFS over the parent DAG from the
// root's parents, WITH depth relaxation. A plain "visited once" set (the old
// code) lets the FIRST path found to a shared ancestor pin its depth even
// when a later, shorter path reaches the same node — a diamond's shared
// ancestor could keep a too-large depth and silently lose (or never
// conflict with) a genuinely equal-depth rival. Here every re-encounter with
// a SMALLER depth updates the node and re-queues ITS parents at the new
// depth+1 (no re-fetch — the descriptor is cached in `nodes` the first time
// it resolves), so every node ends up at its true shortest depth regardless
// of traversal order. Opaque parents (fetch/parse failure, or non-PROF: no
// token + no parents + no resources, spec §2/§6) get exactly one conformance
// entry and no node, by unique URL. `order` = first-encounter index, used
// only for stable tie-breaking in phase 2.
async function collect(rootUrl, rootParents, acc, fetchFn) {
  const nodes = new Map()
  const opaque = new Set()
  let order = 0
  const queue = rootParents.map((url) => ({ url, depth: 1 }))
  while (queue.length) {
    const { url, depth } = queue.shift()
    if (url === rootUrl || opaque.has(url)) continue   // root is depth 0 by construction; opaque never becomes a node
    const existing = nodes.get(url)
    if (existing) {
      if (depth < existing.depth) {
        existing.depth = depth
        for (const p of existing.d.parents) queue.push({ url: p, depth: depth + 1 })
      }
      continue
    }
    let d
    try { d = await descriptorToProfile(await fetchJson(url, fetchFn), url, { documentLoader: authedDocumentLoader(fetchFn) }) }
    catch { opaque.add(url); acc.conformance.push({ iri: url, resolved: false }); continue }
    if (!d.token && !d.parents.length && !d.resources.length) {
      opaque.add(url); acc.conformance.push({ iri: url, resolved: false }); continue
    }
    acc.conformance.push({ iri: url, resolved: true })
    nodes.set(url, { d, depth, order: order++ })
    for (const p of d.parents) queue.push({ url: p, depth: depth + 1 })
  }
  return nodes
}

// Phase 2 — DISPATCH: each collected node's resources exactly once, ordered
// by depth DESCENDING (farthest ancestor first), ties by first-encounter
// order — this reproduces the pre-P3b chain dispatch order exactly (floor
// artifacts land before parent-family artifacts before child's), so list
// fields (validation/vocabulary/contexts) keep their existing union/stack
// order. Singleton fields resolve nearest-wins purely off the `depth`
// threaded through `assignSingleton`, independent of this order — and since
// depth only decreases as this loop proceeds, the root's own depth-0
// dispatch (in `loadProfile`, run separately AFTER this) is always the last,
// nearest word on any singleton key (P3b child-override).
async function dispatchAll(nodes, acc, fetchFn) {
  const ordered = [...nodes.values()].sort((a, b) => b.depth - a.depth || a.order - b.order)
  for (const n of ordered) await dispatch(n.d.resources, acc, fetchFn, n.depth)
}

export async function loadProfile(descriptorUrl, { fetchFn = fetch } = {}) {
  const acc = { conformance: [], validation: [], vocabulary: [], contexts: [],
    identityPolicy: null, planeMapping: null, derivedViews: [], representations: [], unknownRoles: [],
    _singleton: {}, _conflicts: {} }
  // The root descriptor must resolve — loud (P8 declaration side of the loader).
  const root = await descriptorToProfile(await fetchJson(descriptorUrl, fetchFn), descriptorUrl, { documentLoader: authedDocumentLoader(fetchFn) })
  const nodes = await collect(descriptorUrl, root.parents, acc, fetchFn)
  await dispatchAll(nodes, acc, fetchFn)
  await dispatch(root.resources, acc, fetchFn, 0)   // depth 0, always last: the child-override escape hatch (P3b)
  // Only NOW — after the root had its chance to override — do any pending
  // equal-depth singleton disputes actually fail the load.
  for (const key of Object.keys(acc._conflicts)) {
    const c = acc._conflicts[key]
    throw new Error(`profile merge conflict: '${c.key}' from equally-near ${c.sourceA} and ${c.sourceB} disagree — the child profile must declare its own`)
  }
  delete acc._singleton
  delete acc._conflicts
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
