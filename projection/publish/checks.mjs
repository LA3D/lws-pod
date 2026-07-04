import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { Parser } from 'n3'
import rdf from 'rdf-ext'
import { Validator } from 'shacl-engine'
import { jsonldToQuads } from '../okf/rdf.mjs'

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

async function validate(dataQuads, shapesTtl) {
  const shapes = rdf.dataset(new Parser().parse(shapesTtl))
  const data = rdf.dataset(dataQuads.map((q) => rdf.quad(q.subject, q.predicate, q.object)))
  const report = await new Validator(shapes, { factory: rdf }).validate({ dataset: data })
  return report.conforms ? [] : report.results.map((r) => `${r.message?.[0]?.value ?? r.constraintComponent?.value ?? 'violation'}`)
}

export async function checkDescriptor(jsonText, url) {
  let quads
  try { quads = await jsonldToQuads(jsonText, url, { documentLoader: defsLoader }) } catch (e) { return [`descriptor ${url}: unparseable (${e.message})`] }
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
