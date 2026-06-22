import { getText } from '../pod.js'
import { parseIndex } from '../parse.js'
import { esc } from '../esc.js'

class WmIndex extends HTMLElement {
  connectedCallback() { this.attachShadow({ mode: 'open' }); this.refresh() }
  get container() { return this.getAttribute('container') }
  async refresh() {
    if (!this.container) return
    let md
    try { md = await getText(`${this.container}index.md`, 'text/markdown') }
    catch { this.shadowRoot.innerHTML = '<p>empty container</p>'; return }
    const { sections } = parseIndex(md)
    this.shadowRoot.innerHTML = sections.map(sec => `
      <section><h2>${esc(sec.heading)}</h2>
      ${sec.entries.length > 12 ? `<p class="fano-warn">${sec.entries.length} children — exceeds the Fano bound of 12; candidate for a sub-index.</p>` : ''}
      <ul>${sec.entries.map(e => `<li><a href="#" data-url="${esc(this.container + e.href)}" data-c="${esc(String(e.isContainer))}">${esc(e.title)}</a>${e.desc ? ' — ' + esc(e.desc) : ''}</li>`).join('')}</ul>
      </section>`).join('')
    this.shadowRoot.querySelectorAll('a').forEach(a => a.addEventListener('click', ev => {
      ev.preventDefault()
      const url = a.dataset.url
      const name = a.dataset.c === 'true' ? 'wm-open-container' : 'wm-open-card'
      this.dispatchEvent(new CustomEvent(name, { bubbles: true, composed: true, detail: { url } }))
    }))
  }
}
customElements.define('wm-index', WmIndex)
