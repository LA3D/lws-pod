// projection/okf/card.mjs
import matter from 'gray-matter'
import { DataFactory } from 'n3'
import { subjectIri as mintSubject, slugFromUrl } from './identity.mjs'
const { namedNode, literal, quad } = DataFactory

const RDF_TYPE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type'

function targetIri(href, policy) {
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(href)) return href            // absolute IRI passes through
  return policy.mint(slugFromUrl(href))                              // in-bundle link -> minted subject IRI
}

function asTypeCurie(v) { return String(v).includes(':') ? String(v) : 'skos:' + v }

function frontmatterQuads(data, subject, ns, policy) {
  const out = []
  for (const [key, raw] of Object.entries(data)) {
    if (key === 'id') continue                                       // identity, not a property
    const term = ns.term[key]
    if (term === undefined) continue
    const values = Array.isArray(raw) ? raw : [raw]
    if (term === '@type') {
      for (const v of values) out.push(quad(subject, namedNode(RDF_TYPE), namedNode(ns.resolveCurie(asTypeCurie(v)))))
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
  const all = frontmatterQuads(data, subject, ns, policy)
  const seen = new Set(), out = []
  for (const q of all) { const k = `${q.subject.value}|${q.predicate.value}|${q.object.value}`; if (!seen.has(k)) { seen.add(k); out.push(q) } }
  return out
}
