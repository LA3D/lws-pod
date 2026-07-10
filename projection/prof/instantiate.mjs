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
      const put = await fetchFn(target, { method: 'PUT',
        headers: { 'content-type': rep.format, link: `<${rep.conformsTo}>; rel="profile"`, ...authH(token) }, body })
      results.push({ rep: rep.id, target, status: put.status })
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
      containerAlts.push(repEntry(out.target, rep))
    } else {
      if (!need(rep)) continue
      const target = new URL(rep.target, containerUrl).href
      const body = await renderers[rep.id](containerUrl, sources, members)
      const put = await fetchFn(target, { method: 'PUT',
        headers: { 'content-type': rep.format, link: `<${rep.conformsTo}>; rel="profile"`, ...authH(token) }, body })
      results.push({ rep: rep.id, target, status: put.status })
      containerAlts.push(repEntry(target, rep))
    }
  }
  if (containerAlts.length) results.push(await advertise(containerUrl, token, null, containerAlts, fetchFn))
  return results
}
