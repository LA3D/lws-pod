import { login, setSession } from '../pod.js'

class WmLogin extends HTMLElement {
  connectedCallback() {
    this.attachShadow({ mode: 'open' }).innerHTML = `
      <form>
        <input name="pod" placeholder="pod URL" value="http://localhost:3838">
        <input name="proxy" placeholder="proxy URL" value="http://localhost:8080">
        <input name="email" placeholder="email">
        <input name="password" type="password" placeholder="password">
        <button type="submit">Log in</button>
        <p class="err"></p>
      </form>`
    this.shadowRoot.querySelector('form').addEventListener('submit', e => { e.preventDefault?.(); this._submit() })
  }
  async _submit() {
    const v = n => this.shadowRoot.querySelector(`[name=${n}]`).value.trim()
    try {
      const { token, webid } = await login(v('pod'), v('email'), v('password'))
      setSession({ podUrl: v('pod'), token, proxyUrl: v('proxy'), webid })
      this.dispatchEvent(new CustomEvent('wm-authenticated', { bubbles: true, composed: true, detail: { webid } }))
    } catch (e) { this.shadowRoot.querySelector('.err').textContent = e.message }
  }
}
customElements.define('wm-login', WmLogin)
