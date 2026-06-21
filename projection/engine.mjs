// The projection engine — a Linked Web Storage application.
// On invocation: read container membership over LDP, GET each concept card, run every
// channel the profile declares, and PUT the derived views. All pod I/O is authenticated
// HTTP; membership comes from ldp:contains, never the filesystem or URL guessing.
import { Parser } from 'n3'
import { parseFrontmatter } from './okf/frontmatter.mjs'

const LDP_CONTAINS = 'http://www.w3.org/ns/ldp#contains'
const RESERVED = new Set(['index.md', 'log.md', 'graph.ttl', '.acl', '.meta'])
const authH = t => (t ? { Authorization: `Bearer ${t}` } : {})
const lastSeg = url => {
  const u = url.endsWith('/') ? url.slice(0, -1) : url
  return u.slice(u.lastIndexOf('/') + 1)
}

async function readMembers(containerUrl, token) {
  const r = await fetch(containerUrl, { headers: { Accept: 'text/turtle', ...authH(token) } })
  if (!r.ok) throw new Error(`GET ${containerUrl} -> ${r.status}`)
  const ttl = await r.text()
  const out = []
  for (const q of new Parser({ baseIRI: containerUrl }).parse(ttl)) {
    if (q.predicate.value === LDP_CONTAINS) {
      const url = q.object.value
      out.push({ url, type: url.endsWith('/') ? 'container' : 'data' })
    }
  }
  return out
}

export async function project(containerUrl, token, profile) {
  const members = await readMembers(containerUrl, token)
  const conceptMembers = members.filter(m => m.type === 'data' && !RESERVED.has(lastSeg(m.url)))

  const cards = []
  for (const m of conceptMembers) {
    const r = await fetch(m.url, { headers: { Accept: 'text/markdown, text/plain, */*', ...authH(token) } })
    if (!r.ok) continue
    const { frontmatter, body } = parseFrontmatter(await r.text())
    if (!profile.types || profile.types.includes(frontmatter.type)) cards.push({ url: m.url, body, frontmatter })
  }

  const results = []
  for (const ch of profile.channels) {
    const body = await ch.render(containerUrl, cards, members)
    const target = ch.target(containerUrl)
    const put = await fetch(target, { method: 'PUT', headers: { 'Content-Type': ch.mediaType, ...authH(token) }, body })
    results.push({ channel: ch.name, target, status: put.status })
  }
  return results
}
