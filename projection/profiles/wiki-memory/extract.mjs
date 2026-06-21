// Semantic-Markdown → RDF extractor for wiki-memory concept cards. Pure.
// Handles only the subset the cards use: a block subject/type hint, span properties,
// and typed links. The rest of the SemMD spec is out of scope (YAGNI).
import matter from 'gray-matter'
import { DataFactory, Writer } from 'n3'

const { namedNode, literal, quad } = DataFactory

export const PREFIXES = {
  skos: 'http://www.w3.org/2004/02/skos/core#',
  wm:   'https://w3id.org/cogitarelink/wm#',
  rdf:  'http://www.w3.org/1999/02/22-rdf-syntax-ns#',
}
const RDF_TYPE = PREFIXES.rdf + 'type'

// CURIE (prefix:local) → absolute IRI via PREFIXES; pass through anything else.
function resolveCurie(token) {
  const m = token.match(/^([\w-]+):(.+)$/)
  return m && PREFIXES[m[1]] ? PREFIXES[m[1]] + m[2] : token
}

// A typed-link href → the target card's subject IRI: strip .md, resolve, append #it.
function targetIri(href, cardUrl) {
  if (href.startsWith('#')) return new URL(href, cardUrl).href
  const stripped = href.replace(/\.md(#.*)?$/, '')
  const u = new URL(stripped, cardUrl).href
  return u.includes('#') ? u : u + '#it'
}

export function extractCard(markdown, cardUrl) {
  const { content } = matter(markdown)
  const quads = []

  // 1. Block subject/type hint: {=<#it> .skos:Concept}
  const subjM = content.match(/\{=<([^>]+)>\s*\.([\w:]+)\}/)
  if (!subjM) return quads
  const subject = namedNode(new URL(subjM[1], cardUrl).href)
  quads.push(quad(subject, namedNode(RDF_TYPE), namedNode(resolveCurie(subjM[2]))))

  // 2. Typed links: [text](href){predicate}  (matched before bare spans; shapes don't overlap)
  let m
  const linkRe = /\[[^\]]+\]\(([^)]+)\)\{([\w:]+)\}/g
  while ((m = linkRe.exec(content)))
    quads.push(quad(subject, namedNode(resolveCurie(m[2])), namedNode(targetIri(m[1], cardUrl))))

  // 3. Span properties: [label]{predicate}  ("]{" — never matches the "](href){" link form)
  const spanRe = /\[([^\]]+)\]\{([\w:]+)\}/g
  while ((m = spanRe.exec(content)))
    quads.push(quad(subject, namedNode(resolveCurie(m[2])), literal(m[1])))

  return quads
}

export function quadsToTurtle(quads) {
  return new Promise((resolve, reject) => {
    const w = new Writer({ prefixes: PREFIXES })
    w.addQuads(quads)
    w.end((err, result) => (err ? reject(err) : resolve(result)))
  })
}
