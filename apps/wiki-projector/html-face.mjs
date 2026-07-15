// html-face.mjs — the wiki family's human faces (spec 2026-07-15 §3/§6).
// Renderers must never throw: a throw aborts the whole instantiate() pass.
import MarkdownIt from 'markdown-it'
import { parseFrontmatter, isConformant } from './frontmatter.mjs'
import { subjectIri } from './identity.mjs'

const md = new MarkdownIt({ html: false, linkify: true })

export const esc = (s) => String(s).replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
export const localName = (t) => { const s = String(t); return s.includes(':') ? s.slice(s.lastIndexOf(':') + 1).replace(/^.*[#/]/, '') : s }
// Deterministic type->hue; duplicated verbatim in the viz client JS (Task 3) — keep in sync.
export const hueOf = (name) => { let h = 0; for (const c of String(name)) h = (h * 31 + c.charCodeAt(0)) % 360; return h }

const isEdge = (ns, key) => { const t = ns.term[key]; return typeof t === 'object' && t !== null && t['@type'] === '@id' }
const isAbsolute = (v) => /^[a-z][a-z0-9+.-]*:\S*$/i.test(String(v))
// In-bundle edge target ("b.md") -> its face; absolute IRIs pass through.
const edgeHref = (v) => isAbsolute(v) ? String(v) : `${String(v)}.html`

const badgeHtml = (t) => `<span class="badge" style="--h:${hueOf(t)}">${esc(t)}</span>`
const badge = (type) => badgeHtml(localName(type))

export const PAGE_CSS = `
:root{color-scheme:light dark;--fg:#1a1a1a;--bg:#fff;--muted:#666;--line:#ddd}
@media(prefers-color-scheme:dark){:root{--fg:#e8e8e8;--bg:#121212;--muted:#999;--line:#333}}
body{color:var(--fg);background:var(--bg);font:16px/1.6 system-ui,sans-serif;max-width:70ch;margin:2rem auto;padding:0 1rem}
a{color:hsl(210 70% 45%)}nav.crumb{font-size:.85rem;color:var(--muted)}nav.crumb a{color:inherit}
h1{margin:.3rem 0}
.badge{display:inline-block;padding:.05rem .5rem;border-radius:1rem;font-size:.75rem;
 background:hsl(var(--h) 60% 88%);color:hsl(var(--h) 60% 25%)}
@media(prefers-color-scheme:dark){.badge{background:hsl(var(--h) 40% 25%);color:hsl(var(--h) 60% 85%)}}
dl.meta{border:1px solid var(--line);border-radius:.5rem;padding:.75rem 1rem;font-size:.9rem}
dl.meta dt{float:left;clear:left;width:9rem;color:var(--muted)}dl.meta dd{margin:0 0 .25rem 9.5rem}
.chip{display:inline-block;background:var(--line);border-radius:1rem;padding:0 .5rem;font-size:.8rem;margin-right:.25rem}
footer{margin-top:2rem;border-top:1px solid var(--line);padding-top:.5rem;font-size:.9rem}
article{margin-top:1.5rem}`

const pageHtml = (title, crumb, main) => `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title><style>${PAGE_CSS}</style></head>
<body><nav class="crumb">${crumb}</nav>\n${main}\n</body></html>`

const crumbHtml = (url) => {
  const u = new URL(url)
  const segs = u.pathname.split('/').filter(Boolean)
  const parts = [`<a href="${esc(u.origin)}/?view=nav">pod</a>`]
  let path = ''
  for (let i = 0; i < segs.length - 1; i++) { path += `/${segs[i]}`; parts.push(`<a href="${esc(u.origin + path)}/">${esc(segs[i])}</a>`) }
  if (segs.length) parts.push(esc(segs[segs.length - 1]))
  return parts.join(' › ')
}

const metaRows = (fm, ns) => Object.entries(fm).filter(([k]) => k !== 'title').map(([k, v]) => {
  const vals = Array.isArray(v) ? v : [v]
  if (k === 'type') return `<dt>type</dt><dd>${vals.map(badge).join(' ')}</dd>`
  if (isEdge(ns, k)) return `<dt>${esc(k)}</dt><dd>${vals.map((t) => `<a href="${esc(edgeHref(t))}">${esc(t)}</a>`).join(', ')}</dd>`
  if (k === 'tags') return `<dt>tags</dt><dd>${vals.map((t) => `<span class="chip">${esc(t)}</span>`).join('')}</dd>`
  return `<dt>${esc(k)}</dt><dd>${vals.map((x) => esc(x)).join(', ')}</dd>`
}).join('\n')

export function renderCardHtml(src, ns, policy) {
  try {
    if (!(src.contentType?.startsWith('text/markdown') || /\.md$/.test(src.url))) return null
    const { frontmatter: fm, body } = parseFrontmatter(src.body)
    if (!isConformant(fm)) return null
    const subject = subjectIri(fm, src.url, policy)
    const title = fm.title ?? src.url.split('/').pop()
    const main = `<header><h1>${esc(title)}</h1>${(Array.isArray(fm.type) ? fm.type : [fm.type]).map(badge).join(' ')}</header>
<dl class="meta">${metaRows(fm, ns)}\n<dt>source</dt><dd><a href="${esc(src.url)}?view=nav">${esc(src.url)}</a> · <a href="${esc(subject)}">${esc(subject)}</a></dd></dl>
<article>${md.render(body)}</article>
<footer><a href="index.html">↑ index</a> · <a href="viz.html#focus=${encodeURIComponent(subject)}">⚯ graph</a></footer>`
    return pageHtml(title, crumbHtml(src.url), main)
  } catch (e) { console.warn(`[html-face] card render failed for ${src.url}: ${e.message}`); return null }
}

export function renderIndexHtml(containerUrl, cards, members) {
  try {
    const name = new URL(containerUrl).pathname.split('/').filter(Boolean).pop() ?? 'pod'
    const rel = (u) => u.startsWith(containerUrl) ? u.slice(containerUrl.length) : u
    const byType = new Map()
    for (const c of cards) {
      const t = localName(Array.isArray(c.frontmatter.type) ? c.frontmatter.type[0] : c.frontmatter.type)
      if (!byType.has(t)) byType.set(t, [])
      byType.get(t).push(c)
    }
    const groups = [...byType.entries()].map(([t, cs]) => `<h2>${esc(t)}s</h2><ul>` + cs.map((c) =>
      `<li><a href="${esc(rel(c.url))}.html">${esc(c.frontmatter.title ?? rel(c.url))}</a> ${badgeHtml(t)}` +
      (c.frontmatter.description ? ` — ${esc(c.frontmatter.description)}` : '') + '</li>').join('') + '</ul>').join('\n')
    const subs = members.filter((m) => m.isContainer || m.type === 'container')
    const subsHtml = subs.length ? `<h2>Subdirectories</h2><ul>` + subs.map((m) =>
      `<li><a href="${esc(rel(m.url))}">${esc(rel(m.url))}</a></li>`).join('') + '</ul>' : ''
    const main = `<header><h1>${esc(name)}</h1></header>\n${subsHtml}\n${groups}
<footer><a href="viz.html">⚯ graph</a> · <a href="?view=nav">navigator view</a></footer>`
    return pageHtml(name, crumbHtml(containerUrl), main)
  } catch (e) { console.warn(`[html-face] index render failed for ${containerUrl}: ${e.message}`); return null }
}
