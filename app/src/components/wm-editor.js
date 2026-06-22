import { putCard } from '../pod.js'

class WmEditor extends HTMLElement {
  connectedCallback() {
    this.attachShadow({ mode: 'open' }).innerHTML =
      `<textarea rows="20" cols="80"></textarea><button class="save">Save</button><pre class="floor-msg"></pre>`
    this.shadowRoot.querySelector('.save').addEventListener('click', () => this.save())
  }
  open({ url, markdown }) {
    this._url = url
    this.shadowRoot.querySelector('textarea').value = markdown
    this.shadowRoot.querySelector('.floor-msg').textContent = ''
  }
  async save() {
    const md = this.shadowRoot.querySelector('textarea').value
    const r = await putCard(this._url, md)
    const msg = this.shadowRoot.querySelector('.floor-msg')
    if (r.status >= 200 && r.status < 300) {
      msg.textContent = ''
      this.dispatchEvent(new CustomEvent('wm-saved', { bubbles: true, composed: true, detail: { url: this._url } }))
    } else { msg.textContent = r.message || `save failed (${r.status})` }
  }
}
customElements.define('wm-editor', WmEditor)
