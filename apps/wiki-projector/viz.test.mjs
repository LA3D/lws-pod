import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { makeRenderers } from './renderers.mjs'

const ctx = JSON.parse(readFileSync(new URL('../../projection/profiles/defs/llm-wiki/context.jsonld', import.meta.url)))
const loaded = { id: 'https://pod.example/p.jsonld', token: 'llm-wiki', contexts: [ctx],
  identityPolicy: { pathPrefix: 'id/', fragment: '#it' }, representations: [], validation: [] }
const { renderers } = makeRenderers(loaded, 'https://pod.example/')

describe('viz face', () => {
  it('is one self-contained file: inlined cytoscape, relative graph fetch, no external URLs', async () => {
    const html = await renderers.viz('https://pod.example/alice/wiki/', [], [])
    expect(html).toContain('cytoscape')                       // lib inlined
    expect(html).toContain("fetch('graph.jsonld')")           // relative, live
    expect(html).toContain('up')                              // edge keys baked in
    expect(html).not.toMatch(/src="https?:/)                  // no CDN
    expect(html).not.toMatch(/href="https?:\/\/(?!pod\.example)/)
    expect(html.length).toBeGreaterThan(100_000)              // cytoscape actually embedded
  })

  it('escapes graph-derived strings in the client panel and guards the script embed', async () => {
    const html = await renderers.viz('https://pod.example/alice/wiki/', [], [])
    expect(html).toContain('esc(')                                   // client-side escaper wired into show()
    expect((html.match(/<\/script>/g) || []).length).toBe(2)         // exactly the two intended closers
    expect(html).not.toMatch(/innerHTML = `[^`]*\$\{n\.label\}/)     // no unescaped label interpolation remains
  })

  // I2 (final-review): the detail panel's preview fetch used
  // `Accept: 'text/html'` to ask the fork for the entity face — but an
  // in-page fetch() sends Sec-Fetch-Dest: empty, which the fork's
  // browserWantsHtml rejects outright, so the face dispatch never fires and
  // the fetch 406s silently (caught, preview stays empty). Fix: fetch the
  // face directly via its own `.html` suffix (the wiki family's own
  // materialized-face convention), no Accept header needed at all.
  it('detail panel preview fetches the face by its .html suffix, not an Accept: text/html header', async () => {
    const html = await renderers.viz('https://pod.example/alice/wiki/', [], [])
    expect(html).toContain("+ '.html'")                      // fetch targets the materialized face directly
    expect(html).not.toContain("Accept: 'text/html'")        // in-page fetch() can never win this Accept path (Sec-Fetch-Dest: empty)
  })
})
