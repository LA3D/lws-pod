// projection/okf/links.mjs
export function typeLinkHeaders(frontmatter, ns, indexedRels = ['implementedBy', 'broader']) {
  const parts = []
  if (frontmatter?.type) {
    const curie = String(frontmatter.type).includes(':') ? String(frontmatter.type) : 'skos:' + frontmatter.type
    parts.push(`<${ns.resolveCurie(curie)}>; rel="type"`)
  }
  for (const rel of indexedRels) {
    if (frontmatter?.[rel] == null) continue
    const relIri = ns.resolveCurie((ns.term[rel] && ns.term[rel]['@id']) || rel)
    const targets = Array.isArray(frontmatter[rel]) ? frontmatter[rel] : [frontmatter[rel]]
    for (const t of targets) parts.push(`<${String(t)}>; rel="${relIri}"`)
  }
  return parts.join(', ')
}
