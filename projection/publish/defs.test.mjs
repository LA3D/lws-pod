import { describe, it, expect } from 'vitest'
import { readFile } from 'node:fs/promises'
import { Parser } from 'n3'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const DEFS = join(dirname(fileURLToPath(import.meta.url)), '..', 'profiles', 'defs')

describe('profile definition sources', () => {
  it('every .ttl parses as Turtle', async () => {
    for (const f of ['lwsp.ttl', 'descriptor-shape.ttl', 'okf-base.shape.ttl', 'llm-wiki/ontology.ttl', 'llm-wiki/shapes.ttl', 'vendor/shacl-shacl.ttl']) {
      const quads = new Parser().parse(await readFile(join(DEFS, f), 'utf8'))
      expect(quads.length, f).toBeGreaterThan(0)
    }
  })
  it('every .jsonld parses as JSON and no llm-wiki pin is left unfilled', async () => {
    for (const f of ['profiles-compact.context.jsonld', 'substrate-floor.jsonld', 'floor-identity.jsonld', 'okf-base.jsonld', 'okf-base.context.jsonld', 'index.jsonld',
      'llm-wiki/profile.jsonld', 'llm-wiki/identity.jsonld', 'llm-wiki/context.jsonld',
      'llm-wiki/content.rep.jsonld', 'llm-wiki/links.rep.jsonld', 'llm-wiki/index.rep.jsonld', 'llm-wiki/graph.rep.jsonld',
      'dcat-catalog/content.rep.jsonld']) {
      const text = await readFile(join(DEFS, f), 'utf8')
      expect(() => JSON.parse(text), f).not.toThrow()
      expect(text.includes('<PIN>'), `${f} has an unfilled pin`).toBe(false)
    }
  })
})
