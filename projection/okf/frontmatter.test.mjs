import { describe, it, expect } from 'vitest'
import { parseFrontmatter, isConformant } from './frontmatter.mjs'

const CARD = `---
type: Concept
title: Progressive Disclosure
description: Layered retrieval.
---
{=<#it> .skos:Concept}

# Progressive Disclosure
Body text.`

describe('parseFrontmatter', () => {
  it('splits frontmatter from body', () => {
    const { frontmatter, body } = parseFrontmatter(CARD)
    expect(frontmatter.type).toBe('Concept')
    expect(frontmatter.title).toBe('Progressive Disclosure')
    expect(body).toContain('{=<#it> .skos:Concept}')
    expect(body).not.toContain('type: Concept')
  })

  it('returns empty frontmatter for a body with no block', () => {
    const { frontmatter, body } = parseFrontmatter('# Just a heading\n')
    expect(frontmatter).toEqual({})
    expect(body).toContain('Just a heading')
  })
})

describe('isConformant', () => {
  it('is true with a non-empty type', () => {
    expect(isConformant({ type: 'Concept' })).toBe(true)
  })
  it('is false without a type', () => {
    expect(isConformant({ title: 'x' })).toBe(false)
    expect(isConformant({ type: '' })).toBe(false)
  })
})
