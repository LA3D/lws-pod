import { describe, it, expect, beforeEach, vi } from 'vitest'
import '../src/components/wm-login.js'
import { getSession } from '../src/pod.js'

describe('<wm-login>', () => {
  beforeEach(() => { document.body.innerHTML = '' })

  it('logs in, sets session, and emits wm-authenticated', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ access_token: 'tok', webid: 'https://pod/alice#me' }), { status: 200 })))
    const el = document.createElement('wm-login')
    document.body.appendChild(el)
    el.shadowRoot.querySelector('[name=pod]').value = 'http://localhost:3838'
    el.shadowRoot.querySelector('[name=proxy]').value = 'http://localhost:8080'
    el.shadowRoot.querySelector('[name=email]').value = 'alice@x.io'
    el.shadowRoot.querySelector('[name=password]').value = 'pw'
    const seen = new Promise(r => el.addEventListener('wm-authenticated', e => r(e.detail)))
    el.shadowRoot.querySelector('form').dispatchEvent(new Event('submit'))
    const detail = await seen
    expect(detail.webid).toBe('https://pod/alice#me')
    expect(getSession().token).toBe('tok')
    expect(getSession().proxyUrl).toBe('http://localhost:8080')
  })
})
