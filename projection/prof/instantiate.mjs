// Neutral instantiation (spec §5): materialize a profile's declared representations
// over a bound container + advertise the altr: facts the Phase-1 conneg surface
// selects on. Applications supply renderers; this module never interprets content
// (P13 — the server selects and serves, the application materializes).
import { Parser } from 'n3'
import { materializeDerivedView } from './derived-view.mjs'

const LDP_CONTAINS = 'http://www.w3.org/ns/ldp#contains'
const ALTR = 'http://www.w3.org/ns/dx/connegp/altr#'
const authH = (token) => (token ? { authorization: `Bearer ${token}` } : {})
const lastSeg = (url) => { const u = url.endsWith('/') ? url.slice(0, -1) : url; return u.slice(u.lastIndexOf('/') + 1) }
const metaUrlOf = (url) => url + '.meta'                            // JSS convention: file -> <url>.meta, container -> <url>/.meta
const SIDECAR_SUFFIXES = ['.meta', '.acl', '.lwstypes']             // substrate sidecars are members in ldp:contains — never sources

export const mergeContexts = (contexts) => contexts.reduce((m, c) => Object.assign(m, c['@context'] ?? {}), {})

async function readMembers(containerUrl, token, fetchFn) {
  const r = await fetchFn(containerUrl, { headers: { accept: 'text/turtle', ...authH(token) } })
  if (!r.ok) throw new Error(`container ${containerUrl} -> ${r.status}`)
  return new Parser().parse(await r.text())
    .filter((q) => q.predicate.value === LDP_CONTAINS)
    .map((q) => ({ url: q.object.value, isContainer: q.object.value.endsWith('/') }))
}

const repEntry = (href, rep) => ({ '@id': href, 'dct:format': rep.format, 'dct:conformsTo': { '@id': rep.conformsTo } })

// Final-review C1: mirror a source member's own ACL onto every materialized
// suffix-rep face — spec §5 claims a face 401s like its member; before this,
// a member tightened to owner-only (an `<member>.acl` exists) got a
// WORLD-READABLE face under the container's default ACL (and the face
// showed as a row in anon container listings).
//
// Routes through the write_acl MCP tool rather than a raw content PUT of
// the ACL body (live-gate finding, task-10, navigator round): a raw PUT of
// ANY JSON-LD `.acl` document lands on the SAME applyLwsWrite/SHACL
// admission path as any other write, and the substrate's own base floor
// shape (okf-base's `sh:targetSubjectsOf rdf:type`, "every card must
// declare a title") matches an `acl:Authorization` node too — it carries
// rdf:type but never a title, so the original string-replace mirror
// (raw PUT of the source's own bytes onto the target `.acl`) 400s on ANY
// real, profile-bound wiki container. write_acl is the substrate's
// dedicated WAC write path and is admission-EXEMPT by design (access
// control is not governed content) — routing through it fixes that
// live-only-discoverable gap. It also drops the earlier fragile
// assumption that the source ACL encodes its own target as an absolute
// IRI byte-identical to sourceUrl (write_acl computes accessTo itself
// from the target path — see src/mcp/tools.js buildAclDoc in the fork).
// Extraction (parseAclAuthorizations) is MECHANICAL structured
// field-pulling (agent/agentClass/mode/default) off the fork's own
// write_acl JSON-LD shape — access-control metadata, not application
// content, so this stays within P13's substrate/application separation.
function parseAclAuthorizations(doc) {
  const arr = (v) => (v == null ? [] : [].concat(v))
  const idOf = (v) => (v && typeof v === 'object' ? v['@id'] : v)
  const localName = (v) => String(idOf(v) ?? '').replace(/^.*[:#]/, '')
  const isAuthorization = (n) => arr(n['@type']).some((t) => localName(t) === 'Authorization')
  return arr(doc['@graph'] ?? doc).filter((n) => n && typeof n === 'object' && isAuthorization(n)).map((n) => {
    const authz = { modes: arr(n['acl:mode']).map(localName).filter(Boolean), isDefault: Boolean(n['acl:default'] ?? n['acl:defaultForNew']) }
    const agents = arr(n['acl:agent']).map(idOf).filter(Boolean)
    const agentClasses = arr(n['acl:agentClass']).map(idOf).filter(Boolean)
    if (agents.length) authz.agents = agents
    if (agentClasses.length) authz.agentClasses = agentClasses
    return authz
  }).filter((a) => a.modes.length && (a.agents?.length || a.agentClasses?.length))
}

// ORDERING: called BEFORE the face body PUT (see the member-rep loop below)
// — a crash between the two leaves, at worst, an ACL with no body yet
// (safe: nothing world-readable), never a world-readable body with no ACL.
// Never-throw, but fail CLOSED: a source WITH an .acl whose mirror can't be
// read/written/parsed blocks the face body PUT for that rep — a face is
// only as safe as its ACL, so we refuse to publish one we couldn't secure.
// A source with NO .acl (inherits the container default, same as before
// this fix) is the common case and costs one extra GET, mirroring nothing.
async function mirrorAcl(sourceUrl, targetUrl, token, fetchFn) {
  const srcAclUrl = sourceUrl + '.acl'
  const r0 = await fetchFn(srcAclUrl, { headers: { accept: 'application/ld+json', ...authH(token) } })
  if (r0.status === 404) return { ok: true, mirrored: false }
  if (!r0.ok) { console.warn(`[instantiate] ACL mirror: GET ${srcAclUrl} -> ${r0.status}, refusing to publish ${targetUrl} unprotected`); return { ok: false } }
  let authorizations
  try { authorizations = parseAclAuthorizations(await r0.json()) } catch (e) {
    console.warn(`[instantiate] ACL mirror: could not parse ${srcAclUrl} (${e.message}), refusing to publish ${targetUrl} unprotected`); return { ok: false }
  }
  if (!authorizations.length) {
    console.warn(`[instantiate] ACL mirror: ${srcAclUrl} had no recognizable acl:Authorization entries, refusing to publish ${targetUrl} unprotected`)
    return { ok: false }
  }
  const mcpUrl = `${new URL(sourceUrl).origin}/mcp`
  const targetPath = new URL(targetUrl).pathname
  const put = await fetchFn(mcpUrl, { method: 'POST', headers: { 'content-type': 'application/json', ...authH(token) },
    body: JSON.stringify({ jsonrpc: '2.0', id: `acl-mirror:${targetPath}`, method: 'tools/call',
      params: { name: 'write_acl', arguments: { path: targetPath, authorizations } } }) })
  if (!put.ok) { console.warn(`[instantiate] ACL mirror: write_acl POST for ${targetPath} -> HTTP ${put.status}, refusing to publish ${targetUrl} unprotected`); return { ok: false } }
  let rpc
  try { rpc = await put.json() } catch { rpc = null }
  // Fail-closed on the shape, not just the isError flag: an HTTP-200 JSON-RPC
  // *error* envelope (`rpc.error`, no `result`) or an unparseable body both
  // leave `rpc?.result` missing — treat missing/non-object `result` as a
  // refusal too, or this silently falls through to "success" (review finding).
  if (!rpc?.result || rpc.result.isError) {
    console.warn(`[instantiate] ACL mirror: write_acl refused ${targetPath}: ${JSON.stringify(rpc?.result ?? rpc?.error ?? rpc)}, refusing to publish ${targetUrl} unprotected`)
    return { ok: false }
  }
  return { ok: true, mirrored: true }
}

// Read-merge-write the altr: facts into a client-managed .meta; the bind's
// conformsTo/describedby members are preserved.
async function advertise(resourceUrl, token, dflt, alternates, fetchFn) {
  const metaUrl = metaUrlOf(resourceUrl)
  let meta = {}
  const r0 = await fetchFn(metaUrl, { headers: { accept: 'application/ld+json', ...authH(token) } })
  if (r0.ok) { try { meta = await r0.json() } catch { meta = {} } }
  meta['@context'] = { ...(typeof meta['@context'] === 'object' && !Array.isArray(meta['@context']) ? meta['@context'] : {}),
    altr: ALTR, dct: 'http://purl.org/dc/terms/' }
  meta['@id'] = meta['@id'] ?? ''
  if (dflt) meta['altr:hasDefaultRepresentation'] = dflt
  if (alternates.length) meta['altr:hasRepresentation'] = alternates
  const r = await fetchFn(metaUrl, { method: 'PUT', headers: { 'content-type': 'application/ld+json', ...authH(token) }, body: JSON.stringify(meta, null, 2) })
  return { rep: 'altr', target: metaUrl, status: r.status }
}

export async function instantiate(containerUrl, token, profile, { renderers = {}, fetchFn = fetch, onMissingRenderer = 'throw' } = {}) {
  const reps = profile.representations ?? []
  if (!reps.length) return []
  const selfRep = reps.find((r) => r.self)
  const memberReps = reps.filter((r) => r.suffix)
  const containerReps = reps.filter((r) => r.target || r.named_graph)
  const results = []

  const need = (rep) => {
    if (rep.named_graph || renderers[rep.id]) return true
    if (onMissingRenderer === 'throw') throw new Error(`representation '${rep.id}' declared but no renderer supplied`)
    results.push({ rep: `skipped:${rep.id}`, target: null, status: 0 })
    return false
  }

  const members = await readMembers(containerUrl, token, fetchFn)
  const containerTargets = containerReps.map((r) => new URL(r.target ?? r.named_graph, containerUrl).href)
  const isTarget = (url) => containerTargets.includes(url) || memberReps.some((r) => url.endsWith(r.suffix))
  const sourceMembers = members.filter((m) => !m.isContainer && !isTarget(m.url) && !lastSeg(m.url).startsWith('.')
    && !SIDECAR_SUFFIXES.some((s) => m.url.endsWith(s)))

  // Fetch each source once; renderers parse what they understand.
  const sources = []
  for (const m of sourceMembers) {
    const r = await fetchFn(m.url, { headers: { accept: '*/*', ...authH(token) } })
    if (!r.ok) { console.warn(`[instantiate] skip ${m.url} -> ${r.status}`); continue }
    sources.push({ url: m.url, body: await r.text(), contentType: r.headers.get('content-type') ?? '' })
  }

  // Per-member representations: materialize + advertise.
  for (const src of sources) {
    const alternates = []
    for (const rep of memberReps) {
      if (!need(rep)) continue
      const body = await renderers[rep.id](src)
      if (body == null) continue
      const target = src.url + rep.suffix
      // C1: mirror the source's ACL onto the face BEFORE writing the face
      // body (see mirrorAcl's docstring for the ordering argument). A
      // source with its own .acl whose mirror fails blocks this face
      // entirely — never publish a face we couldn't secure.
      const acl = await mirrorAcl(src.url, target, token, fetchFn)
      if (!acl.ok) { results.push({ rep: rep.id, target, status: 0 }); continue }
      const put = await fetchFn(target, { method: 'PUT',
        headers: { 'content-type': rep.format, link: `<${rep.conformsTo}>; rel="profile"`, ...authH(token) }, body })
      results.push({ rep: rep.id, target, status: put.status })
      // P2 (spec 2026-07-19 §4): the face's OWN .meta declares itself as its
      // default representation, so a direct GET of the face carries its
      // profile via the fork's un-negotiated stamp (R12) — data, not fork
      // special-casing. Rides AFTER mirrorAcl: the face's .meta write binds
      // WRITE-on-subject, and a private member's face ACL is already in place.
      results.push(await advertise(target, token, repEntry(target, rep), [], fetchFn))
      alternates.push(repEntry(target, rep))
    }
    if (selfRep || alternates.length)
      results.push(await advertise(src.url, token, selfRep ? repEntry(src.url, selfRep) : null, alternates, fetchFn))
  }

  // Container-level representations: neutral aggregates + renderer-backed artifacts.
  // Aggregates re-read the container AFTER member artifacts are written — a profile declaring
  // member reps should give its aggregates a members: filter, or they absorb the artifacts.
  const containerAlts = []
  for (const rep of containerReps) {
    if (rep.mode) {
      const out = await materializeDerivedView(containerUrl, token, rep, { context: profile.context ?? {}, fetchFn, skip: containerTargets })
      results.push({ rep: rep.id, target: out.target, status: out.status })
      results.push(await advertise(out.target, token, repEntry(out.target, rep), [], fetchFn))
      containerAlts.push(repEntry(out.target, rep))
    } else {
      if (!need(rep)) continue
      const target = new URL(rep.target, containerUrl).href
      const body = await renderers[rep.id](containerUrl, sources, members)
      const put = await fetchFn(target, { method: 'PUT',
        headers: { 'content-type': rep.format, link: `<${rep.conformsTo}>; rel="profile"`, ...authH(token) }, body })
      results.push({ rep: rep.id, target, status: put.status })
      results.push(await advertise(target, token, repEntry(target, rep), [], fetchFn))
      containerAlts.push(repEntry(target, rep))
    }
  }
  if (containerAlts.length) results.push(await advertise(containerUrl, token, null, containerAlts, fetchFn))
  return results
}
