import matter from 'gray-matter'

// Split an OKF concept doc into frontmatter (object) + body (markdown after the YAML block).
export function parseFrontmatter(text) {
  const { data, content } = matter(text)
  return { frontmatter: data, body: content }
}

// OKF §9 conformance: a parseable frontmatter block with a non-empty `type`.
export function isConformant(frontmatter) {
  return typeof frontmatter?.type === 'string' && frontmatter.type.length > 0
}
