import { describe, it, expect } from 'vitest'
import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { buildAclPayload } from './acl.mjs'

const projectionRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const defsPath = (f) => join(projectionRoot, 'profiles', 'defs', f)

// publish.mjs is a CLI script (Task 10 exercises it live against a real pod).
// Here we only smoke-test that it IMPORTS CLEANLY — static imports resolve
// (checks.mjs, profile-loader.mjs) and the top-level --base guard fires
// before any network access, since vitest's argv never carries --base.
describe('publish.mjs (import smoke — full run is Task 10, live)', () => {
  it('imports cleanly and fails loud on missing --base before any write', async () => {
    await expect(import('./publish.mjs')).rejects.toThrow('--base required')
  })

  it('--check validates every manifest profile and writes nothing', async () => {
    const out = execSync(`node publish/publish.mjs --base https://example.invalid --check`, { cwd: projectionRoot }).toString()
    expect(out).toMatch(/checks passed for \d+ profile\(s\)/)
  })

  it('token→descriptor resolution comes from the manifest, subdirectory layout included', async () => {
    // llm-wiki lives in a subdirectory; resolution must come from hasToken, not name convention
    const manifest = JSON.parse(readFileSync(defsPath('index.jsonld'), 'utf8'))
    expect(manifest.profiles).toContain('llm-wiki/profile.jsonld')
  })
})

// ACL provisioning (spec §7): buildAclPayload is the pure shape builder consumed by the
// publish CLI's write_acl step (live-exercised by Task 13's gate, not here).
describe('buildAclPayload', () => {
  const OWNER = 'https://pod.example/alice/profile/card.jsonld#me'

  it('grants public-read + owner Read/Write/Control, both isDefault', () => {
    const p = buildAclPayload('/alice/profiles/', OWNER)
    expect(p.path).toBe('/alice/profiles/')
    expect(p.authorizations).toEqual([
      { agentClasses: ['foaf:Agent'], modes: ['Read'], isDefault: true },
      { agents: [OWNER], modes: ['Read', 'Write', 'Control'], isDefault: true },
    ])
  })
})
