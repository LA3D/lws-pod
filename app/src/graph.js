// graph.js — SPARQL-equivalent traversal using N3.js
// Implements worklist + cross-container neighborhood over graph.ttl Turtle sources.
//
// NOTE: @comunica/query-sparql-link-traversal@0.8.0 is broken in Node.js ESM context
// due to a dual-package (CJS+ESM) token vocabulary identity mismatch in @traqula packages.
// N3.js (already a dep) provides equivalent functionality without the Comunica bug.

import { Store, Parser as N3Parser, DataFactory } from 'n3'

const SKOS = 'http://www.w3.org/2004/02/skos/core#'
const WM = 'https://w3id.org/cogitarelink/wm#'
const RDF_TYPE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type'
const { namedNode } = DataFactory

// Derive the container graph.ttl URL from an edge-target IRI
const containerGraphOf = iri => {
  const u = new URL(iri); u.hash = ''
  u.pathname = u.pathname.replace(/[^/]*$/, '') + 'graph.ttl'
  return u.href
}

// Load an N3 Store from a URL (file:// or http://)
async function loadStore(graphUrl) {
  let turtle
  if (graphUrl.startsWith('file://')) {
    const { readFile } = await import('node:fs/promises')
    const { fileURLToPath } = await import('node:url')
    turtle = await readFile(fileURLToPath(graphUrl), 'utf8')
  } else {
    const res = await fetch(graphUrl, { headers: { Accept: 'text/turtle' } })
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${graphUrl}`)
    turtle = await res.text()
  }
  const store = new Store()
  const parser = new N3Parser({ format: 'Turtle', baseIRI: graphUrl })
  const quads = parser.parse(turtle)
  for (const q of quads) store.add(q)
  return store
}

// worklist(graphUrl) → [{concept, label}]
// Returns skos:Concept nodes that have no wm:implementedBy edge.
export async function worklist(graphUrl) {
  const store = await loadStore(graphUrl)
  const Concept = namedNode(SKOS + 'Concept')
  const type = namedNode(RDF_TYPE)
  const prefLabel = namedNode(SKOS + 'prefLabel')
  const implementedBy = namedNode(WM + 'implementedBy')

  const concepts = store.getSubjects(type, Concept, null)
  return concepts
    .filter(c => store.getObjects(c, implementedBy, null).length === 0)
    .filter(c => store.getObjects(c, prefLabel, null).length > 0)
    .map(c => {
      const labels = store.getObjects(c, prefLabel, null)
      return { concept: c.value, label: labels[0].value }
    })
}

// neighborhood(seedGraphUrl, focusIri) → {nodes, edges}
// Returns the focus node's direct typed edges (skos:broader, wm:implementedBy)
// and labeled/stub targets. Resolves cross-container labels by loading derived
// container graph.ttl URLs for each edge target.
// NOTE: uses store.getObjects/getSubjects, NOT the N3 store match method — it throws
// "Class constructor E cannot be invoked without 'new'" in the esm.sh browser build.
export async function neighborhood(seedGraphUrl, focusIri) {
  const seedStore = await loadStore(seedGraphUrl)
  const prefLabel = namedNode(SKOS + 'prefLabel')
  const focus = namedNode(focusIri)

  // Collect direct typed edges and targets
  const edges = []
  const targets = new Set()
  for (const pred of [namedNode(SKOS + 'broader'), namedNode(WM + 'implementedBy')]) {
    for (const o of seedStore.getObjects(focus, pred, null)) {
      edges.push({ source: focusIri, target: o.value, label: pred.value.split(/[#/]/).pop() })
      targets.add(o.value)
    }
  }

  // Seed store + derived container graphs for cross-container label resolution
  const stores = [seedStore]
  await Promise.allSettled([...targets].map(async t => {
    const cgUrl = containerGraphOf(t)
    if (cgUrl !== seedGraphUrl) {
      try { stores.push(await loadStore(cgUrl)) } catch { /* lenient: skip unreachable */ }
    }
  }))

  const labelFor = id => {
    for (const s of stores) { const objs = s.getObjects(namedNode(id), prefLabel, null); if (objs.length) return objs[0].value }
    return null
  }
  const ids = new Set([focusIri, ...targets])
  const nodes = [...ids].map(id => { const l = labelFor(id); return { id, label: l ?? id.split(/[#/]/).pop(), stub: l === null } })

  return { nodes, edges }
}

// backlinks(seedGraphUrl, focusIri) → [{source, label, sourceLabel}]
// Incoming typed edges: subjects S with (skos:broader | wm:implementedBy) pointing AT the focus.
// Queried over the focus's container graph (where sibling concepts' forward edges live).
export async function backlinks(seedGraphUrl, focusIri) {
  const store = await loadStore(seedGraphUrl)
  const prefLabel = namedNode(SKOS + 'prefLabel')
  const focus = namedNode(focusIri)
  const out = []
  for (const pred of [namedNode(SKOS + 'broader'), namedNode(WM + 'implementedBy')]) {
    for (const s of store.getSubjects(pred, focus, null)) {
      const labels = store.getObjects(s, prefLabel, null)
      out.push({ source: s.value, label: pred.value.split(/[#/]/).pop(), sourceLabel: labels[0]?.value || s.value.split(/[#/]/).pop() })
    }
  }
  return out
}
