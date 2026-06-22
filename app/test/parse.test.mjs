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

  it('renderBody drops semantic-markdown annotations and renders links', () => {
    const html = renderBody(splitCard(card).body)
    expect(html).toContain('<a href="hierarchical-retrieval.md">Hierarchical Retrieval</a>')
    expect(html).not.toContain('{skos:broader}')
    expect(html).not.toContain('{=<#it>')
  })

  it('parseIndex extracts sections with container vs concept entries', () => {
    const idx = `# Subdirectories\n\n* [implementations](implementations/)\n\n# Concepts\n\n* [Progressive Disclosure](progressive-disclosure.md) - Layered retrieval.\n`
    const { sections } = parseIndex(idx)
    expect(sections[0].heading).toBe('Subdirectories')
    expect(sections[0].entries[0]).toEqual({ title: 'implementations', href: 'implementations/', desc: '', isContainer: true })
    expect(sections[1].entries[0]).toEqual({ title: 'Progressive Disclosure', href: 'progressive-disclosure.md', desc: 'Layered retrieval.', isContainer: false })
  })
})
