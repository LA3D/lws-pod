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
  beforeEach(() => { document.body.innerHTML = '' })
  it('mounts index after authentication', async () => {
    const el = document.createElement('wm-app'); document.body.appendChild(el)
    el.dispatchEvent(new CustomEvent('wm-authenticated', { bubbles: true, composed: true, detail: { webid: 'w' } }))
    // session podUrl is read from getSession(); set it directly for the test
    const { setSession } = await import('../src/pod.js')
    setSession({ podUrl: 'http://localhost:3838', webid: 'http://localhost:3838/alice/profile/card.jsonld#me' })
    el._onAuth()
    expect(el.shadowRoot.querySelector('wm-index')).toBeTruthy()
    expect(el.shadowRoot.querySelector('wm-index').getAttribute('container')).toBe('http://localhost:3838/alice/concepts/')
  })
})
