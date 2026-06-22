import './wm-login.js'; import './wm-index.js'; import './wm-card.js'; import './wm-editor.js'; import './wm-graph.js'
import { getSession } from '../pod.js'

const containerOf = url => url.slice(0, url.lastIndexOf('/') + 1)
const subjectOf = url => url.replace(/\.md$/, '') + '#it'

class WmApp extends HTMLElement {
  connectedCallback() {
    this.attachShadow({ mode: 'open' }).innerHTML = `<wm-login></wm-login><main></main>`
    this.addEventListener('wm-authenticated', () => this._onAuth())
    this.addEventListener('wm-open-container', e => this._showContainer(e.detail.url))
    this.addEventListener('wm-open-card', e => this._showCard(e.detail.url))
    this.addEventListener('wm-edit', e => this._edit(e.detail))
    this.addEventListener('wm-saved', e => this._showCard(e.detail.url))
  }
  get _main() { return this.shadowRoot.querySelector('main') }
  _onAuth() { this.shadowRoot.querySelector('wm-login')?.remove(); this._showContainer(`${getSession().podUrl}/concepts/`) }
  _showContainer(url) { this._main.innerHTML = `<wm-index container="${url}"></wm-index>` }
  _showCard(url) {
    const esc = s => String(s).replace(/[<&"]/g, c => ({ '<': '&lt;', '&': '&amp;', '"': '&quot;' }[c]))
    this._main.innerHTML =
      `<wm-card url="${esc(url)}"></wm-card><wm-graph container="${esc(containerOf(url))}" focus="${esc(subjectOf(url))}"></wm-graph>`
  }
  _edit({ url, markdown }) {
    this._main.innerHTML = `<wm-editor></wm-editor>`
    this._main.querySelector('wm-editor').open({ url, markdown })
  }
}
customElements.define('wm-app', WmApp)
