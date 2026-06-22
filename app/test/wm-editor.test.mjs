import { describe, it, expect, vi, beforeEach } from 'vitest'
import '../src/components/wm-editor.js'
import * as pod from '../src/pod.js'

describe('<wm-editor>', () => {
  beforeEach(() => { document.body.innerHTML = ''; vi.restoreAllMocks() })

  it('shows the floor 422 message and does not emit saved', async () => {
    vi.spyOn(pod, 'putCard').mockResolvedValue({ status: 422, message: '# 422 …declare how this concept is implemented' })
    const el = document.createElement('wm-editor'); document.body.appendChild(el)
    el.open({ url: 'http://localhost:3838/concepts/x.md', markdown: '---\ntype: Concept\n---\n# X' })
    let saved = false; el.addEventListener('wm-saved', () => { saved = true })
    await el.save()
    expect(el.shadowRoot.querySelector('.floor-msg').textContent).toContain('declare how this concept is implemented')
    expect(saved).toBe(false)
  })

  it('emits wm-saved on 2xx', async () => {
    vi.spyOn(pod, 'putCard').mockResolvedValue({ status: 205, message: '' })
    const el = document.createElement('wm-editor'); document.body.appendChild(el)
    el.open({ url: 'http://localhost:3838/concepts/x.md', markdown: 'x' })
    const seen = new Promise(r => el.addEventListener('wm-saved', e => r(e.detail.url)))
    await el.save()
    expect(await seen).toContain('x.md')
  })
})
