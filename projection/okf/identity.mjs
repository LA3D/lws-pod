export function slugFromUrl(cardUrl) {
  const file = (cardUrl.split('/').pop() || '')
  return file.replace(/\.md(#.*)?$/, '').replace(/#.*$/, '')
}

export function makeIdentityPolicy({ base, fragment = '#it' }) {
  return { base, fragment, mint(slug) { return `${base}${slug}${fragment}` } }
}

// Declared id wins (location-independent); otherwise mint from slug + profile namespace.
export function subjectIri(frontmatter, cardUrl, policy) {
  return frontmatter.id ? String(frontmatter.id) : policy.mint(slugFromUrl(cardUrl))
}
