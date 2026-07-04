export function loadNamespaces(contextObj) {
  const ctx = contextObj['@context'] || {}
  const prefixes = {}
  for (const [k, v] of Object.entries(ctx)) if (typeof v === 'string' && /[#/]$/.test(v)) prefixes[k] = v
  const vocab = typeof ctx['@vocab'] === 'string' ? ctx['@vocab'] : null

  const resolveCurie = (curie) => {
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(curie)) return curie
    const i = curie.indexOf(':')
    if (i < 0) return curie
    const pfx = curie.slice(0, i), local = curie.slice(i + 1)
    return prefixes[pfx] ? prefixes[pfx] + local : curie
  }
  return { prefixes, resolveCurie, term: ctx, vocab }
}
