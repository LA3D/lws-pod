// projection/okf/card.mjs
import matter from 'gray-matter'
import { DataFactory } from 'n3'
import { subjectIri as mintSubject, slugFromUrl } from './identity.mjs'
const { namedNode, literal, quad } = DataFactory

const RDF_TYPE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type'

function targetIri(href, policy) {
  if (/^[a-z][a-z0-9+.-]*:\S*$/i.test(href) && href.includes(':')) return href   // any absolute IRI (urn:, did:, https:) passes through
  return policy.mint(slugFromUrl(href))                                          // in-bundle link -> minted subject IRI
}

// Bare type: resolves through the profile context (term alias -> curie -> @vocab
// proto mint). No engine vocabulary — the 'skos:' hardcode is dead (Plan-1 #4).
function resolveType(v, ns) {
  const s = String(v)
  if (s.includes(':')) return ns.resolveCurie(s)
  const alias = ns.term[s]
  if (typeof alias === 'string') return ns.resolveCurie(alias)
  if (ns.vocab) return ns.vocab + s
  return s
}

function frontmatterQuads(data, subject, ns, policy, protoTerms) {
  const out = []
  for (const [key, raw] of Object.entries(data)) {
    if (key === 'id') continue                                       // identity, not a property
    const term = ns.term[key]
    const values = Array.isArray(raw) ? raw : [raw]
    if (term === undefined) {
      // P6: silent drop is memory loss — mint under the proto @vocab, report.
      if (!ns.vocab) continue
      protoTerms.push(key)
      for (const v of values) out.push(quad(subject, namedNode(ns.vocab + key), literal(String(v))))
    } else if (term === '@type') {
      for (const v of values) out.push(quad(subject, namedNode(RDF_TYPE), namedNode(resolveType(v, ns))))
    } else if (typeof term === 'object' && term['@type'] === '@id') {
      for (const v of values) out.push(quad(subject, namedNode(ns.resolveCurie(term['@id'])), namedNode(targetIri(String(v), policy))))
    } else {
      const pred = typeof term === 'object' ? term['@id'] : term
      for (const v of values) out.push(quad(subject, namedNode(ns.resolveCurie(pred)), literal(String(v))))
    }
  }
  return out
}

export function cardToQuads(markdown, cardUrl, ns, policy) {
  const { data } = matter(markdown)
  const subject = namedNode(mintSubject(data, cardUrl, policy))
  const protoTerms = []
  const all = frontmatterQuads(data, subject, ns, policy, protoTerms)
  const seen = new Set(), quads = []
  for (const q of all) { const k = `${q.subject.value}|${q.predicate.value}|${q.object.value}`; if (!seen.has(k)) { seen.add(k); quads.push(q) } }
  return { quads, protoTerms }
}
