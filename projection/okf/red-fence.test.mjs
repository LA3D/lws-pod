import { describe, it, expect } from 'vitest'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

// Acceptance #8 fence: profiles/wiki-memory is L4 — it must still be calling
// the OLD 3-arg cardToQuads (its suite is RED by design). If someone "fixed"
// it ahead of L4's re-derivation, this fence fails and stops the merge.
describe('L4 fence', () => {
  it('wiki-memory extract.mjs still carries the TODO(plan-2) breadcrumb, unpatched', async () => {
    const p = join(dirname(fileURLToPath(import.meta.url)), '..', 'profiles', 'wiki-memory', 'extract.mjs')
    const src = await readFile(p, 'utf8')
    expect(src).toContain('TODO(plan-2)')
  })
})
