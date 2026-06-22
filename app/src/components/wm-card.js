import { getText } from '../pod.js'
import { splitCard, renderBody } from '../parse.js'
import { neighborhood, backlinks } from '../graph.js'
import { esc } from '../esc.js'

const containerOf = url => url.slice(0, url.lastIndexOf('/') + 1)
const subjectOf = url => url.replace(/\.md$/, '') + '#it'
// concept IRI (…/name#it) → its card URL (…/name.md)
const cardUrlOf = iri => { const u = new URL(iri); u.hash = ''; return u.href.replace(/([^/]+)$/, '$1.md') }

class WmCard extends HTMLElement {
  connectedCallback() { this.attachShadow({ mode: 'open' }); this.refresh() }
  get url() { return this.getAttribute('url') }
  _open(cardUrl) { this.dispatchEvent(new CustomEvent('wm-open-card', { bubbles: true, composed: true, detail: { url: cardUrl } })) }
  async refresh() {
    if (!this.url) return
    this._md = await getText(this.url, 'text/markdown')
    const { frontmatter, body } = splitCard(this._md)
    const graphUrl = `${containerOf(this.url)}graph.ttl`
    let nb = { nodes: [], edges: [] }, back = []
    try { nb = await neighborhood(graphUrl, subjectOf(this.url)) } catch {}
    try { back = await backlinks(graphUrl, subjectOf(this.url)) } catch {}
    const node = id => nb.nodes.find(n => n.id === id) || { label: id.split(/[#/]/).pop(), stub: true }
    // a stub target has no card to open → plain text; a resolved one → an in-app link
    const targetLink = iri => node(iri).stub
      ? `<span class="stub">${esc(node(iri).label)}</span>`
      : `<a href="#" data-card="${esc(cardUrlOf(iri))}">${esc(node(iri).label)}</a>`
    const rel = nb.edges.length ? `<aside class="relates"><h3>Relates / Implements</h3><ul>${
      nb.edges.map(e => `<li>${esc(e.label)} &#8594; ${targetLink(e.target)}</li>`).join('')}</ul></aside>` : ''
    const bl = back.length ? `<aside class="backlinks"><h3>Backlinks</h3><ul>${
      back.map(b => `<li><a href="#" data-card="${esc(cardUrlOf(b.source))}">${esc(b.sourceLabel)}</a> &#8594; ${esc(b.label)}</li>`).join('')}</ul></aside>` : ''
    this.shadowRoot.innerHTML = `
      <header><h1>${esc(frontmatter.title || '')}</h1>
        <p class="meta">${esc(frontmatter.type || '')} — ${esc(frontmatter.description || '')}</p>
        <button class="edit">Edit</button></header>
      <article>${renderBody(body)}</article>${rel}${bl}`
    this.shadowRoot.querySelector('.edit').addEventListener('click', () =>
      this.dispatchEvent(new CustomEvent('wm-edit', { bubbles: true, composed: true, detail: { url: this.url, markdown: this._md } })))
    // panel links (Relates / Backlinks)
    this.shadowRoot.querySelectorAll('a[data-card]').forEach(a =>
      a.addEventListener('click', e => { e.preventDefault(); this._open(a.dataset.card) }))
    // in-body wikilinks to other cards → open in-app instead of a raw browser navigation
    this.shadowRoot.querySelectorAll('article a[href]').forEach(a => {
      let resolved
      try { resolved = new URL(a.getAttribute('href'), this.url) } catch { return }
      if (resolved.pathname.endsWith('.md')) a.addEventListener('click', e => { e.preventDefault(); this._open(resolved.href) })
    })
  }
}
customElements.define('wm-card', WmCard)
