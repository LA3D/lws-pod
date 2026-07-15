import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { makeRenderers } from './renderers.mjs'

const ctx = JSON.parse(readFileSync(new URL('../../projection/profiles/defs/llm-wiki/context.jsonld', import.meta.url)))
const loaded = { id: 'https://pod.example/alice/profiles/llm-wiki/profile.jsonld', token: 'llm-wiki',
  contexts: [ctx], identityPolicy: { pathPrefix: 'id/', fragment: '#it' }, representations: [], validation: [] }
const AUTH = 'https://pod.example/'
const C = 'https://pod.example/alice/wiki/'
const CARD = `---\ntype: llm-wiki-colab:Concept\ntitle: Alpha\nstatus: draft\ntags: [memory, lws]\nup: b.md\n---\nAlpha prose with a [link](b.md).\n\n<script>alert(1)</script>`

const { renderers } = makeRenderers(loaded, AUTH)

describe('html card face', () => {
  it('renders title, type badge, metadata block, body', async () => {
    const html = await renderers.html({ url: `${C}a.md`, body: CARD, contentType: 'text/markdown' })
    expect(html).toContain('<h1>Alpha</h1>')
    expect(html).toContain('Concept')                       // type badge (localName)
    expect(html).toContain('<dt>up</dt>')                   // edge key in metadata block
    expect(html).toContain('href="b.md.html"')              // edge target -> face link
    expect(html).toContain('<dt>status</dt>')               // scalar row
    expect(html).toContain('draft')
    expect(html).toContain(`${C}a.md`)                      // canonical source URI shown
    expect(html).toContain('viz.html#focus=')               // graph footer link
  })
  it('does NOT pass raw script through', async () => {
    const html = await renderers.html({ url: `${C}a.md`, body: CARD, contentType: 'text/markdown' })
    expect(html).not.toContain('<script>alert(1)</script>')
  })
  it('returns null for non-conformant and non-markdown sources', async () => {
    expect(await renderers.html({ url: `${C}x.md`, body: 'no frontmatter', contentType: 'text/markdown' })).toBeNull()
    expect(await renderers.html({ url: `${C}x.jsonld`, body: '{}', contentType: 'application/ld+json' })).toBeNull()
  })
  it('escapes HTML-significant characters in frontmatter fields', async () => {
    const EVIL = `---\ntype: llm-wiki-colab:Concept\ntitle: 'A"><img src=x onerror=alert(1)>'\nstatus: '<b>bold</b>'\nup: 'b.md" onclick="alert(1)'\n---\nBody.`
    const html = await renderers.html({ url: `${C}evil.md`, body: EVIL, contentType: 'text/markdown' })
    expect(html).not.toContain('<img src=x')                 // title escaped
    expect(html).not.toContain('<b>bold</b>')                // scalar escaped
    expect(html).not.toContain('b.md" onclick')              // edge href attribute stays well-formed
    expect(html).toContain('&quot;')                          // quotes rendered as entities somewhere
  })
})
