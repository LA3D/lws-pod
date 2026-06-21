// projection/okf/links.mjs
export function typeLinkHeaders(frontmatter, ns, indexedRels = ['implementedBy', 'broader']) {
  const parts = []
  if (frontmatter?.type) {
    const curie = String(frontmatter.type).includes(':') ? String(frontmatter.type) : 'skos:' + frontmatter.type
    parts.push(`<${ns.resolveCurie(curie)}>; rel="type"`)
  }
  for (const rel of indexedRels) {
    if (frontmatter?.[rel] == null) continue
    const mapped = ns.term[rel] && ns.term[rel]['@id']
    if (!mapped) continue                              // unmapped rel → cannot form a valid absolute rel; skip
    const relIri = ns.resolveCurie(mapped)
    if (!/^[a-z][a-z0-9+.-]*:/i.test(relIri)) continue // not absolute → skip
    const targets = Array.isArray(frontmatter[rel]) ? frontmatter[rel] : [frontmatter[rel]]
    for (const t of targets) parts.push(`<${encodeURI(String(t))}>; rel="${relIri}"`)
  }
  return parts.join(', ')
}
