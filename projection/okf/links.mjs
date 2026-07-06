// projection/okf/links.mjs
// No engine vocabulary (P5/P13): a bare frontmatter type resolves only through
// the profile context's term aliases; indexed rels are the CALLER's choice.
export function typeLinkHeaders(frontmatter, ns, indexedRels) {
  if (!Array.isArray(indexedRels)) throw new Error('typeLinkHeaders: indexedRels is required (no engine defaults)')
  const parts = []
  if (frontmatter?.type) {
    const s = String(frontmatter.type)
    const curie = s.includes(':') ? s : (typeof ns.term[s] === 'string' ? ns.term[s] : null)
    if (curie) parts.push(`<${ns.resolveCurie(curie)}>; rel="type"`)
  }
  for (const rel of indexedRels) {
    if (frontmatter?.[rel] == null) continue
    const mapped = ns.term[rel] && ns.term[rel]['@id']
    if (!mapped) continue
    const relIri = ns.resolveCurie(mapped)
    if (!/^[a-z][a-z0-9+.-]*:/i.test(relIri)) continue
    const targets = Array.isArray(frontmatter[rel]) ? frontmatter[rel] : [frontmatter[rel]]
    for (const t of targets) parts.push(`<${encodeURI(String(t))}>; rel="${relIri}"`)
  }
  return parts.join(', ')
}
