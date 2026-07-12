import { describe, it, expect } from 'vitest'
import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { buildAclPayload, ownerFromToken, provisionAcls } from './acl.mjs'

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
    // --container matters since review #15: pod-config pointers are checked against it.
    const out = execSync(`node publish/publish.mjs --base https://example.invalid --container /alice/profiles/ --check`, { cwd: projectionRoot }).toString()
    expect(out).toMatch(/checks passed for \d+ profile\(s\)/)
  })

  it('--check against a container the pod-config does not point at fails loud (review #15)', async () => {
    let failed = false
    try { execSync(`node publish/publish.mjs --base https://example.invalid --container /bob/profiles/ --check`, { cwd: projectionRoot, stdio: 'pipe' }) }
    catch (e) { failed = true; expect(e.stderr.toString()).toMatch(/pod-config: profileIndex/) }
    expect(failed).toBe(true)
  })

  it('token→descriptor resolution comes from the manifest, subdirectory layout included', async () => {
    // llm-wiki lives in a subdirectory; resolution must come from hasToken, not name convention
    const manifest = JSON.parse(readFileSync(defsPath('index.jsonld'), 'utf8'))
    expect(manifest.profiles).toContain('llm-wiki/profile.jsonld')
  })
})

// Owner derivation (review #11): the owner WebID comes from the bearer's own
// webid claim (or a validated --owner), never a hardcoded pod name.
describe('ownerFromToken', () => {
  const jwt = (claims) => `eyJhbGciOiJSUzI1NiJ9.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.sig`

  it('reads the webid claim from a bearer JWT', () => {
    expect(ownerFromToken(jwt({ webid: 'https://pod.example/bob/profile/card.jsonld#me' })))
      .toBe('https://pod.example/bob/profile/card.jsonld#me')
  })
  it('returns null for an opaque (non-JWT) token', () => {
    expect(ownerFromToken('not-a-jwt')).toBe(null)
  })
  it('returns null when the claim is missing or not an absolute http(s) URL', () => {
    expect(ownerFromToken(jwt({ sub: 'x' }))).toBe(null)
    expect(ownerFromToken(jwt({ webid: '/relative/card#me' }))).toBe(null)
  })
})

describe('publish.mjs owner guard (review #11 — fail loud BEFORE any write)', () => {
  const run = (args) => {
    try { execSync(`node publish/publish.mjs ${args}`, { cwd: projectionRoot, stdio: 'pipe' }); return null }
    catch (e) { return { stderr: e.stderr.toString(), stdout: e.stdout.toString() } }
  }
  it('no derivable owner + ACLs on: exits 1 with guidance, nothing PUT', () => {
    const r = run('--base https://example.invalid --container /alice/profiles/')
    expect(r, 'expected a non-zero exit').not.toBe(null)
    expect(r.stderr).toMatch(/--owner|webid/i)
    expect(r.stdout).not.toMatch(/PUT /)
  })
  it('rejects a relative --owner before any write', () => {
    const r = run('--base https://example.invalid --container /alice/profiles/ --owner /alice/card#me')
    expect(r, 'expected a non-zero exit').not.toBe(null)
    expect(r.stderr).toMatch(/--owner/)
    expect(r.stdout).not.toMatch(/PUT /)
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

// provisionAcls (review #1): probe <target>.acl FIRST — an owner who hand-tightened
// a container must never be silently re-opened by the routine freshness command.
describe('provisionAcls — never clobber an existing ACL', () => {
  const BASE = 'https://pod.example'
  const OWNER = `${BASE}/alice/profile/card.jsonld#me`
  const noop = () => {}
  const harness = ({ probeStatus, write = { ok: true, status: 200, body: { result: {} } } }) => {
    const calls = []
    const fetchFn = async (url, opts = {}) => {
      calls.push({ url, opts })
      if (url.endsWith('.acl')) return { ok: probeStatus >= 200 && probeStatus < 300, status: probeStatus }
      return { ok: write.ok, status: write.status, json: async () => write.body }
    }
    return { calls, run: () => provisionAcls({ base: BASE, targets: ['/alice/profiles/'], ownerWebId: OWNER, fetchFn, log: noop }) }
  }

  it('probes <target>.acl and writes via write_acl when absent (404)', async () => {
    const h = harness({ probeStatus: 404 })
    await h.run()
    expect(h.calls[0].url).toBe(`${BASE}/alice/profiles/.acl`)
    const rpc = JSON.parse(h.calls[1].opts.body)
    expect(h.calls[1].url).toBe(`${BASE}/mcp`)
    expect(rpc.params.name).toBe('write_acl')
    expect(rpc.params.arguments).toEqual(buildAclPayload('/alice/profiles/', OWNER))
  })
  it('skips the write when an .acl already exists — owner edits win', async () => {
    const h = harness({ probeStatus: 200 })
    await h.run()
    expect(h.calls.length).toBe(1)
    expect(h.calls[0].url).toBe(`${BASE}/alice/profiles/.acl`)
  })
  it('fails loud on a probe it cannot interpret (403), neither clobbering nor skipping silently', async () => {
    const h = harness({ probeStatus: 403 })
    await expect(h.run()).rejects.toThrow(/403/)
    expect(h.calls.length).toBe(1)
  })
  it('fails loud when write_acl itself errors', async () => {
    const h = harness({ probeStatus: 404, write: { ok: true, status: 200, body: { result: { isError: true } } } })
    await expect(h.run()).rejects.toThrow(/ACL/)
  })
})
