import { describe, it, expect, vi, beforeEach } from 'vitest'
import '../src/components/wm-graph.js'
import '../src/components/wm-app.js'
import * as graph from '../src/graph.js'

describe('<wm-graph>', () => {
  beforeEach(() => { document.body.innerHTML = ''; vi.restoreAllMocks() })
  it('computes cytoscape elements with a stub class and card-open on tap data', async () => {
    vi.spyOn(graph, 'neighborhood').mockResolvedValue({
      nodes: [{ id: 'http://pod/concepts/a#it', label: 'A', stub: false },
              { id: 'http://pod/concepts/b#it', label: 'B', stub: true }],
      edges: [{ source: 'http://pod/concepts/a#it', target: 'http://pod/concepts/b#it', label: 'implementedBy' }] })
    const el = document.createElement('wm-graph')
    el.setAttribute('container', 'http://pod/concepts/')
    el.setAttribute('focus', 'http://pod/concepts/a#it')
    document.body.appendChild(el)
    await el.refresh()
    const els = el.elements()
    expect(els.find(e => e.data.id === 'http://pod/concepts/b#it').classes).toBe('stub')
    expect(els.find(e => e.data.source)).toBeTruthy()
  })
})

describe('<wm-app>', () => {
  const WEBID = 'http://localhost:3838/alice/profile/card.jsonld#me'
  const tick = () => new Promise(r => setTimeout(r, 0))
  beforeEach(async () => {
    document.body.innerHTML = ''
    const { clearSession } = await import('../src/pod.js')
    clearSession(); location.hash = ''
  })

  it('restores a persisted session, skips login, and routes to the user container', async () => {
    const { setSession } = await import('../src/pod.js')
    setSession({ podUrl: 'http://localhost:3838', token: 'tok', webid: WEBID })
    const el = document.createElement('wm-app'); document.body.appendChild(el)
    await tick()
    const idx = el.shadowRoot.querySelector('wm-index')
    expect(idx).toBeTruthy()
    expect(idx.getAttribute('container')).toBe('http://localhost:3838/alice/concepts/')
    expect(el.shadowRoot.querySelector('wm-login')).toBeFalsy()   // login skipped on restore
  })

  it('opens a card via hash routing and Back returns to the index', async () => {
    const { setSession } = await import('../src/pod.js')
    setSession({ podUrl: 'http://localhost:3838', token: 'tok', webid: WEBID })
    const el = document.createElement('wm-app'); document.body.appendChild(el)
    await tick()
    el.dispatchEvent(new CustomEvent('wm-open-card', { bubbles: true, composed: true,
      detail: { url: 'http://localhost:3838/alice/concepts/progressive-disclosure.md' } }))
    await tick()
    expect(location.hash).toContain('card=')               // navigation is a history entry
    expect(el.shadowRoot.querySelector('wm-card')).toBeTruthy()
    // simulate the browser Back button (hash returns to the container route)
    location.hash = 'container=' + encodeURIComponent('http://localhost:3838/alice/concepts/')
    await tick()
    expect(el.shadowRoot.querySelector('wm-index')).toBeTruthy()
    expect(el.shadowRoot.querySelector('wm-card')).toBeFalsy()
  })
})
