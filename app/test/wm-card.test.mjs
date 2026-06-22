import { describe, it, expect, vi, beforeEach } from 'vitest'
import '../src/components/wm-card.js'
import * as pod from '../src/pod.js'
import * as graph from '../src/graph.js'

const CARD = `---\ntype: Concept\ntitle: Progressive Disclosure\ndescription: Layered retrieval.\n---\n{=<#it> .skos:Concept}\n\n# Progressive Disclosure\n\nBody.`

describe('<wm-card>', () => {
  beforeEach(() => { document.body.innerHTML = ''; vi.restoreAllMocks() })

  it('renders header, body, relates panel, and emits wm-edit', async () => {
    vi.spyOn(pod, 'getText').mockResolvedValue(CARD)
    vi.spyOn(pod, 'getGraph').mockResolvedValue('')
    vi.spyOn(graph, 'neighborhood').mockResolvedValue({
      nodes: [{ id: 'http://pod/implementations/index-view#it', label: 'Index View', stub: false }],
      edges: [{ source: 'x', target: 'http://pod/implementations/index-view#it', label: 'implementedBy' }] })
    const el = document.createElement('wm-card')
    el.setAttribute('url', 'http://localhost:3838/concepts/progressive-disclosure.md')
    document.body.appendChild(el)
    await el.refresh()
    expect(el.shadowRoot.querySelector('h1').textContent).toBe('Progressive Disclosure')
    expect(el.shadowRoot.textContent).toContain('implementedBy')
    expect(el.shadowRoot.textContent).toContain('Index View')
    const edit = new Promise(r => el.addEventListener('wm-edit', e => r(e.detail)))
    el.shadowRoot.querySelector('.edit').click()
    const d = await edit
    expect(d.url).toContain('progressive-disclosure.md')
    expect(d.markdown).toContain('# Progressive Disclosure')
  })
})
