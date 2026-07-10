import { describe, it, expect } from 'vitest'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

describe('cli trigger', () => {
  it('exits 2 with usage when no container URL is given', () => {
    try { execFileSync('node', [fileURLToPath(new URL('./cli.mjs', import.meta.url))], { stdio: 'pipe' }); expect.unreachable() }
    catch (e) { expect(e.status).toBe(2); expect(String(e.stderr)).toContain('usage:') }
  })
})
