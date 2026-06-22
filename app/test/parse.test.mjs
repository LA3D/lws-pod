import { describe, it, expect } from 'vitest'
import { splitCard, renderBody, parseIndex } from '../src/parse.js'

const card = `---
type: Concept
title: Progressive Disclosure
description: Layered retrieval.
---
{=<#it> .skos:Concept}

# Progressive Disclosure

A kind of [Hierarchical Retrieval](hierarchical-retrieval.md){skos:broader}.`

describe('parse', () => {
  it('splitCard separates frontmatter and body', () => {
    const { frontmatter, body } = splitCard(card)
    expect(frontmatter.title).toBe('Progressive Disclosure')
    expect(frontmatter.type).toBe('Concept')
    expect(body).toContain('# Progressive Disclosure')
  })

  it('splitCard no-frontmatter fallback: returns empty frontmatter and input as body', () => {
    const input = '# Just a body, no fences'
    const { frontmatter, body } = splitCard(input)
    expect(frontmatter).toEqual({})
    expect(body).toBe(input)
  })

  it('renderBody drops semantic-markdown annotations and renders links', () => {
    const html = renderBody(splitCard(card).body)
    expect(html).toContain('<a href="hierarchical-retrieval.md">Hierarchical Retrieval</a>')
    expect(html).not.toContain('{skos:broader}')
    expect(html).not.toContain('{=<#it>')
  })

  it('renderBody rule 3: [text]{pred} becomes bare text without brackets or braces', () => {
    const body = 'A label: [Some Label]{skos:prefLabel} in context.'
    const html = renderBody(body)
    expect(html).toContain('Some Label')
    expect(html).not.toContain('[Some Label]')
    expect(html).not.toContain('{skos:prefLabel}')
    expect(html).not.toContain('<a')
  })

  it('parseIndex extracts sections with container vs concept entries', () => {
    const idx = `# Subdirectories\n\n* [implementations](implementations/)\n\n# Concepts\n\n* [Progressive Disclosure](progressive-disclosure.md) - Layered retrieval.\n`
    const { sections } = parseIndex(idx)
    expect(sections[0].heading).toBe('Subdirectories')
    expect(sections[0].entries[0]).toEqual({ title: 'implementations', href: 'implementations/', desc: '', isContainer: true })
    expect(sections[1].entries[0]).toEqual({ title: 'Progressive Disclosure', href: 'progressive-disclosure.md', desc: 'Layered retrieval.', isContainer: false })
  })

  it('parseIndex entry without description: desc defaults to empty string', () => {
    const idx = '# References\n\n* [Plain](plain.md)\n'
    const { sections } = parseIndex(idx)
    expect(sections[0].entries[0]).toEqual({ title: 'Plain', href: 'plain.md', desc: '', isContainer: false })
  })
})
