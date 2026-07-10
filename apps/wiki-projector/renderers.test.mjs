import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { makeRenderers } from './renderers.mjs'

const AUTH = 'https://pod.example/'
const ctx = JSON.parse(readFileSync(new URL('../../projection/profiles/defs/llm-wiki/context.jsonld', import.meta.url)))
const loaded = {
  id: 'https://pod.example/alice/profiles/llm-wiki/profile.jsonld', token: 'llm-wiki',
  contexts: [ctx], identityPolicy: { pathPrefix: 'id/', fragment: '#it' },
  representations: [], validation: [], planeMapping: null, conformance: [], vocabulary: [], derivedViews: [], unknownRoles: [],
}

const CARD_A = `---
type: llm-wiki-colab:Project
title: Alpha
up: b.md
---
Alpha prose the graph never sees.`

describe('links renderer', () => {
  const { renderers } = makeRenderers(loaded, AUTH)
  it('frontmatter card -> flat #it JSON-LD: minted subject, title literal, typed edge', async () => {
    const out = JSON.parse(await renderers.links({ url: 'https://pod.example/alice/wiki/a.md', body: CARD_A, contentType: 'text/markdown' }))
    expect(out['@id']).toBe('https://pod.example/id/a#it')
    expect(out['@graph']).toBeUndefined()                          // flat node form (spec §3)
    expect(JSON.stringify(out)).toContain('Alpha')
    expect(JSON.stringify(out)).toContain('https://pod.example/id/b#it')   // up: b.md minted
  })
  it('non-markdown and non-conformant members -> null', async () => {
    expect(await renderers.links({ url: 'x/graph.jsonld', body: '{}', contentType: 'application/ld+json' })).toBeNull()
    expect(await renderers.links({ url: 'x/loose.md', body: 'no frontmatter', contentType: 'text/markdown' })).toBeNull()
  })
})

describe('index renderer', () => {
  const { renderers } = makeRenderers(loaded, AUTH)
  it('groups cards by local-name type and lists subdirectories', async () => {
    const C = 'https://pod.example/alice/wiki/'
    const sources = [{ url: C + 'a.md', body: CARD_A, contentType: 'text/markdown' }]
    const members = [{ url: C + 'a.md', isContainer: false }, { url: C + 'sub/', isContainer: true }]
    const md = await renderers.index(C, sources, members)
    expect(md).toContain('# Projects')                             // local name, not the CURIE
    expect(md).toContain('[Alpha](a.md)')
    expect(md).toContain('# Subdirectories')
    expect(md).toContain('[sub](sub/)')
  })
})
