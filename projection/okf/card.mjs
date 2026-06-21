// projection/okf/card.mjs
import matter from 'gray-matter'
import { DataFactory } from 'n3'
const { namedNode, literal, quad } = DataFactory

const RDF_TYPE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type'

export function subjectIri(cardUrl) {
  return cardUrl.includes('#') ? cardUrl : cardUrl + '#it'
}

function targetIri(href, cardUrl) {
  if (href.startsWith('#')) return new URL(href, cardUrl).href
  const stripped = href.replace(/\.md(#.*)?$/, '')
  const u = new URL(stripped, cardUrl).href
  return u.includes('#') ? u : u + '#it'
}

// A friendly type value ("Concept") maps to skos:Concept by profile convention
// (matches the existing `{=<#it> .skos:Concept}` body annotation); an explicit
// CURIE ("schema:Article") is kept. The type scheme (Task 3) is the registry.
function asTypeCurie(v) {
  return String(v).includes(':') ? String(v) : 'skos:' + v
}

// Frontmatter projection: each frontmatter key that the context maps becomes a quad.
// "@type" → rdf:type (value resolved as a class CURIE); a term with "@type":"@id"
// → IRI-valued edge; otherwise a literal property.
function frontmatterQuads(data, subject, cardUrl, ns) {
  const out = []
  for (const [key, raw] of Object.entries(data)) {
    const term = ns.term[key]
    if (term === undefined) continue
    const values = Array.isArray(raw) ? raw : [raw]
    if (term === '@type') {
      for (const v of values) out.push(quad(subject, namedNode(RDF_TYPE), namedNode(ns.resolveCurie(asTypeCurie(v)))))
    } else if (typeof term === 'object' && term['@type'] === '@id') {
      for (const v of values) out.push(quad(subject, namedNode(ns.resolveCurie(term['@id'])), namedNode(targetIri(String(v), cardUrl))))
    } else {
      const pred = typeof term === 'object' ? term['@id'] : term
      for (const v of values) out.push(quad(subject, namedNode(ns.resolveCurie(pred)), literal(String(v))))
    }
  }
  return out
}

// Body Semantic-Markdown extraction. Uses the unified subject passed from cardToQuads
// so frontmatter and body quads always share the same name.md#it node.
function bodyQuads(content, subject, cardUrl, ns) {
  const out = []
  const subjM = content.match(/\{=<([^>]+)>\s*\.([\w:]+)\}/)
  if (!subjM) return out
  out.push(quad(subject, namedNode(RDF_TYPE), namedNode(ns.resolveCurie(subjM[2]))))
  let m
  const linkRe = /\[[^\]]+\]\(([^)]+)\)\{([\w:]+)\}/g
  while ((m = linkRe.exec(content))) out.push(quad(subject, namedNode(ns.resolveCurie(m[2])), namedNode(targetIri(m[1], cardUrl))))
  const spanRe = /\[([^\]]+)\]\{([\w:]+)\}/g
  while ((m = spanRe.exec(content))) out.push(quad(subject, namedNode(ns.resolveCurie(m[2])), literal(m[1])))
  return out
}

export function cardToQuads(markdown, cardUrl, ns) {
  const { data, content } = matter(markdown)
  const subject = namedNode(subjectIri(cardUrl))
  return [...frontmatterQuads(data, subject, cardUrl, ns), ...bodyQuads(content, subject, cardUrl, ns)]
}
