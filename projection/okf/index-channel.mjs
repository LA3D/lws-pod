// OKF index.md — the navigation disclosure channel (progressive disclosure for agents).
// Lists child sub-containers and concept docs with their frontmatter descriptions.
// Pure; no frontmatter in the output (OKF §6).

const relOf = (containerUrl, url) => url.startsWith(containerUrl) ? url.slice(containerUrl.length) : url
const lastSeg = url => {
  const u = url.endsWith('/') ? url.slice(0, -1) : url
  return u.slice(u.lastIndexOf('/') + 1)
}

const entry = (containerUrl, c) => {
  const title = c.frontmatter.title || lastSeg(c.url)
  const desc = c.frontmatter.description ? ` - ${c.frontmatter.description}` : ''
  return `* [${title}](${relOf(containerUrl, c.url)})${desc}`
}

export function renderIndex(containerUrl, cards, members) {
  const subs = members.filter(m => m.type === 'container')
  const lines = []
  if (subs.length) {
    lines.push('# Subdirectories', '')
    for (const s of subs) lines.push(`* [${lastSeg(s.url)}](${relOf(containerUrl, s.url)})`)
    lines.push('')
  }
  // A section per card type (frontmatter `type`, default 'Concept'), heading = pluralized type.
  // Concept-only containers still read "# Concepts"; an implementation container reads "# Implementations".
  const groups = new Map()
  for (const c of cards) {
    const t = c.frontmatter.type || 'Concept'
    if (!groups.has(t)) groups.set(t, [])
    groups.get(t).push(c)
  }
  const order = [...groups.keys()].sort((a, b) => (a === 'Concept' ? -1 : b === 'Concept' ? 1 : a.localeCompare(b)))
  for (const t of order) {
    lines.push(`# ${t}s`, '')
    for (const c of groups.get(t)) lines.push(entry(containerUrl, c))
    lines.push('')
  }
  return lines.join('\n').replace(/\n+$/, '\n')
}

export const indexChannel = {
  name: 'index',
  mediaType: 'text/markdown',
  target: containerUrl => `${containerUrl}index.md`,
  render: async (containerUrl, cards, members) => renderIndex(containerUrl, cards, members),
}
