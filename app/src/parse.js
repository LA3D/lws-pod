import yaml from 'js-yaml'
import { marked } from 'marked'

export function splitCard(md) {
  const m = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(md)
  if (!m) return { frontmatter: {}, body: md }
  return { frontmatter: yaml.load(m[1]) || {}, body: m[2] }
}

// Semantic-Markdown: [text](url){pred} -> [text](url); [text]{pred} -> text; {=<#it> .Class} -> removed.
export function renderBody(body) {
  const cleaned = body
    .replace(/^\{=[^}]*\}\s*$/gm, '')
    .replace(/(\[[^\]]*\]\([^)]*\))\{[^}]*\}/g, '$1')
    .replace(/\[([^\]]*)\]\{[^}]*\}/g, '$1')
  return marked.parse(cleaned)
}

export function parseIndex(md) {
  const sections = []
  let cur = null
  for (const line of md.split('\n')) {
    const h = /^#\s+(.*)$/.exec(line)
    if (h) { cur = { heading: h[1].trim(), entries: [] }; sections.push(cur); continue }
    const e = /^\*\s+\[([^\]]+)\]\(([^)]+)\)(?:\s+-\s+(.*))?$/.exec(line)
    if (e && cur) cur.entries.push({ title: e[1], href: e[2], desc: (e[3] || '').trim(), isContainer: e[2].endsWith('/') })
  }
  return { sections }
}
