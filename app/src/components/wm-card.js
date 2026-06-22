import { getText } from '../pod.js'
import { splitCard, renderBody } from '../parse.js'
import { neighborhood } from '../graph.js'

const containerOf = url => url.slice(0, url.lastIndexOf('/') + 1)
const subjectOf = url => url.replace(/\.md$/, '') + '#it'

class WmCard extends HTMLElement {
  connectedCallback() { this.attachShadow({ mode: 'open' }); this.refresh() }
  get url() { return this.getAttribute('url') }
  async refresh() {
    if (!this.url) return
    this._md = await getText(this.url, 'text/markdown')
    const { frontmatter, body } = splitCard(this._md)
    let nb = { nodes: [], edges: [] }
    try { nb = await neighborhood(`${containerOf(this.url)}graph.ttl`, subjectOf(this.url)) } catch {}
    const esc = s => String(s).replace(/[<&"]/g, c => ({ '<': '&lt;', '&': '&amp;', '"': '&quot;' }[c]))
    const labelOf = id => (nb.nodes.find(n => n.id === id) || {}).label || id
    const rel = nb.edges.length ? `<aside class="relates"><h3>Relates / Implements</h3><ul>${
      nb.edges.map(e => `<li>${esc(e.label)} → ${esc(labelOf(e.target))}</li>`).join('')}</ul></aside>` : ''
    this.shadowRoot.innerHTML = `
      <header><h1>${esc(frontmatter.title || '')}</h1>
        <p class="meta">${esc(frontmatter.type || '')} — ${esc(frontmatter.description || '')}</p>
        <button class="edit">Edit</button></header>
      <article>${renderBody(body)}</article>${rel}`
    this.shadowRoot.querySelector('.edit').addEventListener('click', () =>
      this.dispatchEvent(new CustomEvent('wm-edit', { bubbles: true, composed: true, detail: { url: this.url, markdown: this._md } })))
  }
}
customElements.define('wm-card', WmCard)
