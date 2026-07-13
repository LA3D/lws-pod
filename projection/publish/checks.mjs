import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { Parser } from 'n3'
import rdf from 'rdf-ext'
import { Validator } from 'shacl-engine'
import { jsonldToQuads } from '../prof/rdf.mjs'

const DEFS = join(dirname(fileURLToPath(import.meta.url)), '..', 'profiles', 'defs')
const SH = 'http://www.w3.org/ns/shacl#'
const PROF = 'http://www.w3.org/ns/dx/prof/'
const RDF_TYPE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type'
// The LWS v1 @protected term set (lws10-core jsonld-context.md).
const LWS_TERMS = ['id', 'type', 'Container', 'DataResource', 'items', 'totalItems', 'mediaType', 'size', 'modified']
// 'id'/'type' are also JSON-LD keyword aliases (@id/@type) — the LWS v1 context
// itself defines them that way, so a profile context re-declaring the SAME
// alias is a harmless no-op, not a collision. Any other value IS a collision.
const LWS_KEYWORD_ALIAS = { id: '@id', type: '@type' }

// Declaration-time checks read everything from the LOCAL defs tree — the pod
// copies don't exist yet at check time (checks run before publish).
async function defsLoader(url) {
  const name = new URL(url).pathname.split('/').pop()
  const doc = JSON.parse(await readFile(join(DEFS, name), 'utf8'))
  return { contextUrl: null, document: doc, documentUrl: url }
}

// Path-aware defs loader (B5): resolves a published URL back to its local defs
// path by stripping the publish root, preserving subdirectories. Falls back to
// basename for URLs outside the root (e.g. the shared compact context).
export function makeDefsLoader(rootHref) {
  return async function pathAwareDefsLoader(url) {
    const rel = url.startsWith(rootHref) ? url.slice(rootHref.length) : new URL(url).pathname.split('/').pop()
    const doc = JSON.parse(await readFile(join(DEFS, ...rel.split('/')), 'utf8'))
    return { contextUrl: null, document: doc, documentUrl: url }
  }
}

async function validate(dataQuads, shapesTtl) {
  const shapes = rdf.dataset(new Parser().parse(shapesTtl))
  const data = rdf.dataset(dataQuads.map((q) => rdf.quad(q.subject, q.predicate, q.object)))
  const report = await new Validator(shapes, { factory: rdf }).validate({ dataset: data })
  return report.conforms ? [] : report.results.map((r) => `${r.message?.[0]?.value ?? r.constraintComponent?.value ?? 'violation'}`)
}

export async function checkDescriptor(jsonText, url, loader = defsLoader) {
  let quads
  try { quads = await jsonldToQuads(jsonText, url, { documentLoader: loader }) } catch (e) { return [`descriptor ${url}: unparseable (${e.message})`] }
  if (!quads.length) return [`descriptor ${url}: parses to an EMPTY graph (fail-open blocked)`]
  if (!quads.some((q) => q.predicate.value === RDF_TYPE && q.object.value === PROF + 'Profile'))
    return [`descriptor ${url}: no prof:Profile-typed subject`]
  if (jsonText.includes('<PIN>')) return [`descriptor ${url}: unfilled <PIN> version`]
  return validate(quads, await readFile(join(DEFS, 'descriptor-shape.ttl'), 'utf8'))
}

export async function checkShapes(ttlText, name) {
  let quads
  try { quads = new Parser().parse(ttlText) } catch (e) { return [`shapes ${name}: unparseable Turtle (${e.message})`] }
  const isShape = quads.some((q) => q.predicate.value === RDF_TYPE && (q.object.value === SH + 'NodeShape' || q.object.value === SH + 'PropertyShape'))
  const hasTarget = quads.some((q) => [SH + 'targetClass', SH + 'targetNode', SH + 'targetSubjectsOf', SH + 'targetObjectsOf'].includes(q.predicate.value))
  const out = []
  if (!isShape) out.push(`shapes ${name}: no NodeShape/PropertyShape`)
  if (!hasTarget) out.push(`shapes ${name}: no target — validates nothing (fail-open blocked)`)
  if (out.length) return out
  return validate(quads, await readFile(join(DEFS, 'vendor', 'shacl-shacl.ttl'), 'utf8'))
}

export function checkContext(jsonText, name, curatedBases = []) {
  let doc
  try { doc = JSON.parse(jsonText) } catch (e) { return [`context ${name}: not JSON (${e.message})`] }
  const ctx = doc['@context'] ?? {}
  const out = []
  const vocab = ctx['@vocab']
  if (vocab !== undefined) {
    if (typeof vocab !== 'string' || vocab === '' || !/^[a-z][a-z0-9+.-]*:/i.test(vocab))
      out.push(`context ${name}: relative/empty @vocab is banned (location-coupled predicates)`)
    else if (curatedBases.some((b) => vocab.startsWith(b)))
      out.push(`context ${name}: @vocab points at a curated namespace (typo-impostor rule)`)
  }
  for (const k of Object.keys(ctx)) {
    if (!LWS_TERMS.includes(k)) continue
    if (LWS_KEYWORD_ALIAS[k] && ctx[k] === LWS_KEYWORD_ALIAS[k]) continue
    out.push(`context ${name}: redefines LWS protected term '${k}'`)
  }
  return out
}

// Terms actually USED by a context: skip @-keywords and keyword aliases,
// skip namespace-prefix declarations (values ending #/), expand CURIEs
// against the context's own prefixes. Returns absolute IRIs only.
export function usedTermsFromContext(ctxObj) {
  const ctx = ctxObj['@context'] ?? ctxObj ?? {}
  const prefixes = {}
  for (const [k, v] of Object.entries(ctx))
    if (!k.startsWith('@') && typeof v === 'string' && /[#/]$/.test(v)) prefixes[k] = v
  const out = []
  for (const [k, raw] of Object.entries(ctx)) {
    if (k.startsWith('@')) continue
    const v = typeof raw === 'object' && raw !== null ? raw['@id'] : raw
    if (typeof v !== 'string' || v.startsWith('@') || /[#/]$/.test(v)) continue
    if (/^https?:/i.test(v)) { out.push(v); continue }
    const i = v.indexOf(':')
    if (i > 0 && prefixes[v.slice(0, i)]) out.push(prefixes[v.slice(0, i)] + v.slice(i + 1))
  }
  return [...new Set(out)]
}

export async function checkVocabulary(ttlText, usedTerms, knownGaps = []) {
  let quads
  try { quads = new Parser().parse(ttlText) } catch (e) { return [`vocabulary: unparseable Turtle (${e.message})`] }
  const subjects = new Set(quads.map((q) => q.subject.value).filter((s) => s.startsWith('http')))
  // Local namespaces = where this ontology actually defines things; terms in
  // external vocabularies (dct:, skos:, …) are defined elsewhere, not here.
  const localNs = new Set([...subjects].map((s) => s.slice(0, Math.max(s.lastIndexOf('#'), s.lastIndexOf('/')) + 1)))
  return usedTerms
    .filter((t) => localNs.has(t.slice(0, Math.max(t.lastIndexOf('#'), t.lastIndexOf('/')) + 1)))
    .filter((t) => !subjects.has(t))
    // knownGaps: verified upstream gaps (declared in a curated context, undefined
    // in the pinned mirror) — recorded rather than patched (spec §3, verbatim-
    // mirror discipline). Silently excluded here; the caller logs the notice.
    .filter((t) => !knownGaps.includes(t))
    .map((t) => `vocabulary: used term not defined: ${t}`)
}

const REP_KINDS = ['self', 'suffix', 'target', 'named_graph']
// Declaration-time check for lwspr:representation artifacts (spec §5) — loud, pre-write.
export function checkRepresentation(jsonText, name) {
  let rep
  try { rep = JSON.parse(jsonText) } catch (e) { return [`${name}: not JSON (${e.message})`] }
  const out = []
  for (const k of ['id', 'format', 'conformsTo']) if (typeof rep[k] !== 'string' || !rep[k]) out.push(`${name}: missing '${k}'`)
  const kinds = REP_KINDS.filter((k) => rep[k] !== undefined)
  if (kinds.length !== 1) out.push(`${name}: exactly one of ${REP_KINDS.join('/')} required (got ${kinds.join(',') || 'none'})`)
  // Contract seam (FOLLOWUP 2026-07-10): publish's ≤1-default check counts
  // `default`; instantiate() advertises altr:hasDefaultRepresentation from
  // `self`. A rep declaring one without the other checks clean here yet
  // never advertises (or advertises undeclared) — require them together.
  if (!!rep.self !== !!rep.default) out.push(`${name}: 'self' and 'default' must be declared together — instantiate advertises the default from 'self'`)
  if (rep.named_graph !== undefined && !['union', 'dataset'].includes(rep.mode)) out.push(`${name}: named_graph requires mode union|dataset`)
  return out
}

// pod-config.jsonld resolves-check (spec §4b/§7, review #15): the single DATA
// pointer pair --lws-config reads (profileIndex + void). Both pointers must
// live UNDER the publish container — the directory is the part most likely
// wrong, so it's checked, subdir-preserving (the B5 mapping, same rule as
// makeDefsLoader). profileIndex must land on a real defs-tree artifact; void
// isn't a defs file — it's materialized by buildVoid at the container root
// (publish.mjs step 2b) — so its rule is "container root + a manifest.void
// section to materialize", not existsRel.
export function checkPodConfig(cfgText, manifest, existsRel, container) {
  let cfg
  try { cfg = JSON.parse(cfgText) } catch (e) { return [`pod-config: not JSON (${e.message})`] }
  const root = container.endsWith('/') ? container : container + '/'
  const under = (p) => typeof p === 'string' && p.startsWith(root) ? p.slice(root.length) : null
  const fails = []
  const idxRel = under(cfg.profileIndex)
  if (!idxRel || !existsRel(idxRel))
    fails.push(`pod-config: profileIndex ${cfg.profileIndex} — not a defs-tree artifact under ${root}`)
  if (under(cfg.void) !== 'void.jsonld' || !manifest.void)
    fails.push(`pod-config: void ${cfg.void} — must be ${root}void.jsonld with a manifest.void to materialize it`)
  if (cfg.uriSpaces !== undefined) fails.push(...checkUriSpaces(cfg.uriSpaces, manifest))
  return fails
}

// uriSpaces (Task 7): the plane-mapping [{pathPrefix, container, suffix?}] the
// fork's 303 referent resolver reads to turn a minted /id/{slug}#it name back
// into the storage resource holding it. Optional — absence is fine (back-compat);
// when present each entry must be well-formed and its pathPrefix must agree
// with the published VoID uriSpace — same "can never disagree" rail as the
// rest of pod-config (spec §4b/§7, review #15, see checkPodConfig above).
function checkUriSpaces(uriSpaces, manifest) {
  if (!Array.isArray(uriSpaces)) return ['pod-config: uriSpaces must be an array']
  const expectedPrefix = manifest.void?.uriSpace ? `/${manifest.void.uriSpace}` : undefined
  const out = []
  uriSpaces.forEach((entry, i) => {
    const label = `pod-config: uriSpaces[${i}]`
    const prefix = entry?.pathPrefix
    if (typeof prefix !== 'string' || !prefix || !prefix.endsWith('/'))
      out.push(`${label}: pathPrefix must be a non-empty string ending in '/' (got ${JSON.stringify(prefix)})`)
    else if (expectedPrefix !== undefined && prefix !== expectedPrefix)
      out.push(`${label}: pathPrefix ${prefix} does not match manifest void.uriSpace (expected ${expectedPrefix})`)
    const cont = entry?.container
    if (typeof cont !== 'string' || !cont || !cont.endsWith('/'))
      out.push(`${label}: container must be a non-empty string ending in '/' (got ${JSON.stringify(cont)})`)
    if (entry?.suffix !== undefined && typeof entry.suffix !== 'string')
      out.push(`${label}: suffix must be a string when present (got ${JSON.stringify(entry.suffix)})`)
  })
  return out
}
