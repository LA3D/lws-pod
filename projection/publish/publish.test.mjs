import { describe, it, expect } from 'vitest'

// publish.mjs is a CLI script (Task 10 exercises it live against a real pod).
// Here we only smoke-test that it IMPORTS CLEANLY — static imports resolve
// (checks.mjs, profile-loader.mjs) and the top-level --base guard fires
// before any network access, since vitest's argv never carries --base.
describe('publish.mjs (import smoke — full run is Task 10, live)', () => {
  it('imports cleanly and fails loud on missing --base before any write', async () => {
    await expect(import('./publish.mjs')).rejects.toThrow('--base required')
  })
})
