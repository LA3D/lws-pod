import { describe, it, expect } from 'vitest'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { checkDescriptor, checkShapes, checkContext, checkVocabulary, usedTermsFromContext } from './checks.mjs'

const DEFS = join(dirname(fileURLToPath(import.meta.url)), '..', 'profiles', 'defs')
const read = (f) => readFile(join(DEFS, f), 'utf8')

describe('declaration-time checks (spec §9 — fail loud at publish)', () => {
  it('our own descriptors pass', async () => {
    for (const f of ['substrate-floor.jsonld', 'okf-base.jsonld', 'llm-wiki/profile.jsonld'])
      expect(await checkDescriptor(await read(f), `https://pod.example/profiles/${f}`), f).toEqual([])
  })
  it('a descriptor with no token fails loud', async () => {
    const bad = JSON.parse(await read('okf-base.jsonld')); delete bad.hasToken
    const v = await checkDescriptor(JSON.stringify(bad), 'https://pod.example/profiles/okf-base.jsonld')
    expect(v.length).toBeGreaterThan(0)
  })
  it('an empty/parse-corrupt descriptor fails loud (the fail-open disease, blocked)', async () => {
    expect((await checkDescriptor('{}', 'https://x/p.jsonld')).length).toBeGreaterThan(0)
    expect((await checkDescriptor('not json', 'https://x/p.jsonld')).length).toBeGreaterThan(0)
  })
  it('our shapes pass; a target-less shapes doc fails', async () => {
    expect(await checkShapes(await read('okf-base.shape.ttl'), 'okf-base')).toEqual([])
    expect(await checkShapes(await read('llm-wiki/shapes.ttl'), 'llm-wiki')).toEqual([])
    const v = await checkShapes('@prefix sh: <http://www.w3.org/ns/shacl#> . <urn:s> a sh:NodeShape .', 'orphan')
    expect(v.length).toBeGreaterThan(0)
  })
  it('context lint: curated-@vocab and relative-@vocab rejected; ours pass', async () => {
    expect(checkContext(await read('okf-base.context.jsonld'), 'okf-base', ['https://example.org/wm#'])).toEqual([])
    expect(checkContext('{"@context":{"@vocab":"https://example.org/wm#"}}', 'bad', ['https://example.org/wm#']).length).toBeGreaterThan(0)
    expect(checkContext('{"@context":{"@vocab":""}}', 'bad', []).length).toBeGreaterThan(0)
    expect(checkContext('{"@context":{"items":"https://example.org/x#items"}}', 'bad', []).length).toBeGreaterThan(0)
  })
  it('context lint: keyword-alias exemption has a boundary — only the EXACT alias is exempt', () => {
    // 'type' re-declared as the real @type alias is a no-op, not a collision.
    expect(checkContext('{"@context":{"type":"@type","id":"@id"}}', 'ok', [])).toEqual([])
    // 'type' re-pointed at anything else is a real collision with the LWS protected term.
    expect(checkContext('{"@context":{"type":"https://example/other"}}', 'bad', []).length).toBeGreaterThan(0)
  })
  it('usedTermsFromContext: resolves CURIEs, skips keywords/aliases/prefix declarations', async () => {
    const ctx = JSON.parse(await read('llm-wiki/context.jsonld'))
    const used = usedTermsFromContext(ctx)
    expect(used).toContain('https://la3d.github.io/llm-wiki-colab/ontology#up')
    expect(used).toContain('http://purl.org/dc/terms/title')
    // namespace-prefix declarations themselves (llm-wiki-colab:, skos:, dcterms:, xsd:)
    // are not "used terms" — they're plumbing, not vocabulary the ontology must define.
    expect(used).not.toContain('https://la3d.github.io/llm-wiki-colab/ontology#')
    // '@base' and the 'type':'@type' keyword alias must not leak through as terms.
    expect(used.some((t) => t.endsWith('#type') || t === '@type')).toBe(false)
  })
  it('vocabulary completeness: llm-wiki context terms are ALL defined in the ontology (genuine pass — publish-gate viability proof)', async () => {
    const ctx = JSON.parse(await read('llm-wiki/context.jsonld'))
    const used = usedTermsFromContext(ctx)
    expect(used.length).toBeGreaterThan(10) // sanity: real CURIE-resolved coverage, not zero
    const report = await checkVocabulary(await read('llm-wiki/ontology.ttl'), used)
    expect(report).toEqual([])
  })
  it('vocabulary completeness: external-vocabulary terms (dct:, skos:, …) are out of scope', async () => {
    const used = usedTermsFromContext({ '@context': { title: 'http://purl.org/dc/terms/title' } })
    expect(await checkVocabulary(await read('llm-wiki/ontology.ttl'), used)).toEqual([])
  })
  it('vocabulary completeness: a drifted local term IS caught', async () => {
    const ctx = JSON.parse(await read('llm-wiki/context.jsonld'))
    ctx['@context'].fake = 'llm-wiki-colab:doesNotExist'
    const used = usedTermsFromContext(ctx)
    const report = await checkVocabulary(await read('llm-wiki/ontology.ttl'), used)
    expect(report).toEqual(['vocabulary: used term not defined: https://la3d.github.io/llm-wiki-colab/ontology#doesNotExist'])
  })
})
