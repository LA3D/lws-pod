import './wm-login.js'; import './wm-index.js'; import './wm-card.js'; import './wm-editor.js'; import './wm-graph.js'
import { getSession, clearSession, getText } from '../pod.js'
import { esc } from '../esc.js'

const containerOf = url => url.slice(0, url.lastIndexOf('/') + 1)
const subjectOf = url => url.replace(/\.md$/, '') + '#it'
// user's pod storage base from the webid: http://host/alice/profile/card#me -> http://host/alice/
const storageBase = webid => { const u = new URL(webid); return `${u.origin}/${u.pathname.split('/').filter(Boolean)[0]}/` }
const enc = encodeURIComponent, dec = decodeURIComponent

// Routing: the URL hash is the source of truth, so the browser Back/Forward buttons work.
// #container=<url> · #card=<url> · #edit=<url> · empty -> the user's concepts container.
class WmApp extends HTMLElement {
  connectedCallback() {
    this.attachShadow({ mode: 'open' }).innerHTML = `<header></header><wm-login></wm-login><main></main>`
    this.addEventListener('wm-authenticated', () => this._start())
    this.addEventListener('wm-open-container', e => { location.hash = 'container=' + enc(e.detail.url) })
    this.addEventListener('wm-open-card', e => { location.hash = 'card=' + enc(e.detail.url) })
    this.addEventListener('wm-edit', e => { location.hash = 'edit=' + enc(e.detail.url) })
    this.addEventListener('wm-saved', e => { location.hash = 'card=' + enc(e.detail.url) })
    this._onHash = () => this._render()
    window.addEventListener('hashchange', this._onHash)
    if (getSession().token) this._start()   // restored session — skip the login screen
  }
  disconnectedCallback() { window.removeEventListener('hashchange', this._onHash) }
  get _main() { return this.shadowRoot.querySelector('main') }
  get _header() { return this.shadowRoot.querySelector('header') }

  _start() {
    this.shadowRoot.querySelector('wm-login')?.remove()
    const w = getSession().webid
    if (!location.hash && w) { location.hash = 'container=' + enc(`${storageBase(w)}concepts/`) }
    this._render()
  }
  _logout() {
    clearSession(); location.hash = ''
    this.shadowRoot.innerHTML = `<header></header><wm-login></wm-login><main></main>`
  }
  _route() {
    const h = location.hash.replace(/^#/, '')
    const i = h.indexOf('=')
    return i < 0 ? { kind: 'home' } : { kind: h.slice(0, i), arg: dec(h.slice(i + 1)) }
  }
  _renderHeader() {
    const w = getSession().webid
    const base = w ? `${storageBase(w)}concepts/` : ''
    this._header.innerHTML =
      `<nav><a href="#container=${esc(enc(base))}">&#8592; Concepts</a><a href="#" class="logout">log out</a></nav>`
    this._header.querySelector('.logout').addEventListener('click', e => { e.preventDefault(); this._logout() })
  }
  async _render() {
    if (!getSession().token) return
    const r = this._route()
    const w = getSession().webid
    if (r.kind === 'home') { if (w) location.hash = 'container=' + enc(`${storageBase(w)}concepts/`); return }
    this._renderHeader()
    if (r.kind === 'container') {
      this._main.innerHTML = `<wm-index container="${esc(r.arg)}"></wm-index>`
    } else if (r.kind === 'card') {
      this._main.innerHTML =
        `<wm-card url="${esc(r.arg)}"></wm-card><wm-graph container="${esc(containerOf(r.arg))}" focus="${esc(subjectOf(r.arg))}"></wm-graph>`
    } else if (r.kind === 'edit') {
      let md = ''
      try { md = await getText(r.arg, 'text/markdown') } catch {}
      this._main.innerHTML = `<wm-editor></wm-editor>`
      this._main.querySelector('wm-editor').open({ url: r.arg, markdown: md })
    }
  }
}
customElements.define('wm-app', WmApp)
