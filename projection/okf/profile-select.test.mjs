// projection/okf/profile-select.test.mjs
import { describe, it, expect } from 'vitest'
import { selectProfile } from './profile-select.mjs'
import { wikiMemoryProfile } from '../profiles/wiki-memory/index.mjs'
import { baseProfile } from './base-profile.mjs'

const registry = { 'wiki-memory': wikiMemoryProfile }

describe('selectProfile', () => {
  it('selects the declared profile from root index.md frontmatter', () => {
    const root = `---\nokf_profile: wiki-memory\n---\n# Root`
    expect(selectProfile(root, registry)).toBe(wikiMemoryProfile)
  })

  it('falls back to base mode when no profile is declared', () => {
    expect(selectProfile('# Root, no frontmatter', registry)).toBe(baseProfile)
  })

  it('falls back to base mode for an unknown profile name', () => {
    const root = `---\nokf_profile: nope\n---\n# Root`
    expect(selectProfile(root, registry)).toBe(baseProfile)
  })

  it('base mode runs index.md only — no typed graph channel', () => {
    expect(baseProfile.channels.map(c => c.name)).toEqual(['index'])
  })
})
