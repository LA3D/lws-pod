import { describe, it, expect, vi, beforeEach } from 'vitest'
import '../src/components/wm-index.js'
import * as pod from '../src/pod.js'

const INDEX = `# Subdirectories\n\n* [implementations](implementations/)\n\n# Concepts\n\n* [Progressive Disclosure](progressive-disclosure.md) - Layered retrieval.\n`

describe('<wm-index>', () => {
  beforeEach(() => { document.body.innerHTML = ''; vi.restoreAllMocks() })

  it('renders entries and emits open events', async () => {
    vi.spyOn(pod, 'getText').mockResolvedValue(INDEX)
    const el = document.createElement('wm-index')
    el.setAttribute('container', 'http://localhost:3838/concepts/')
    document.body.appendChild(el)
    await el.refresh()
    const links = [...el.shadowRoot.querySelectorAll('a')]
    expect(links.map(a => a.textContent)).toContain('Progressive Disclosure')
    const card = new Promise(r => el.addEventListener('wm-open-card', e => r(e.detail.url)))
    links.find(a => a.textContent === 'Progressive Disclosure').click()
    expect(await card).toBe('http://localhost:3838/concepts/progressive-disclosure.md')
  })

  it('flags a section exceeding the Fano bound', async () => {
    const many = '# Concepts\n\n' + Array.from({ length: 13 }, (_, i) => `* [C${i}](c${i}.md)`).join('\n') + '\n'
    vi.spyOn(pod, 'getText').mockResolvedValue(many)
    const el = document.createElement('wm-index')
    el.setAttribute('container', 'http://localhost:3838/concepts/')
    document.body.appendChild(el)
    await el.refresh()
    expect(el.shadowRoot.querySelector('.fano-warn')).toBeTruthy()
  })
})
