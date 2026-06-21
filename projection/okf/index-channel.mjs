// OKF index.md — the navigation disclosure channel (progressive disclosure for agents).
// Lists child sub-containers and concept docs with their frontmatter descriptions.
// Pure; no frontmatter in the output (OKF §6).

const relOf = (containerUrl, url) => url.startsWith(containerUrl) ? url.slice(containerUrl.length) : url
const lastSeg = url => {
  const u = url.endsWith('/') ? url.slice(0, -1) : url
  return u.slice(u.lastIndexOf('/') + 1)
}

export function renderIndex(containerUrl, cards, members) {
  const subs = members.filter(m => m.type === 'container')
  const lines = []
  if (subs.length) {
    lines.push('# Subdirectories', '')
    for (const s of subs) lines.push(`* [${lastSeg(s.url)}](${relOf(containerUrl, s.url)})`)
    lines.push('')
  }
  lines.push('# Concepts', '')
  for (const c of cards) {
    const title = c.frontmatter.title || lastSeg(c.url)
    const desc = c.frontmatter.description ? ` - ${c.frontmatter.description}` : ''
    lines.push(`* [${title}](${relOf(containerUrl, c.url)})${desc}`)
  }
  return lines.join('\n') + '\n'
}

export const indexChannel = {
  name: 'index',
  mediaType: 'text/markdown',
  target: containerUrl => `${containerUrl}index.md`,
  render: async (containerUrl, cards, members) => renderIndex(containerUrl, cards, members),
}
