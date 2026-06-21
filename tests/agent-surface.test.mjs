import { describe, it, beforeAll, expect } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { BASE, ensurePod, getToken } from './helpers.mjs'

const hasGit = (() => {
  try { execFileSync('git', ['--version'], { stdio: 'ignore' }); return true } catch { return false }
})()

describe('agent surfaces', () => {
  let token
  beforeAll(async () => {
    await ensurePod()
    ;({ token } = await getToken())
  })

  async function mcp(body) {
    const r = await fetch(`${BASE}/mcp`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    return r.json()
  }

  it('MCP initialize returns a jsonrpc result', async () => {
    const j = await mcp({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} })
    expect(j.jsonrpc).toBe('2.0')
    expect(j.error).toBeUndefined()
    expect(j.result).toBeTruthy()
  })

  it('MCP tools/list returns a non-empty tool set', async () => {
    const j = await mcp({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} })
    expect(Array.isArray(j.result?.tools)).toBe(true)
    expect(j.result.tools.length).toBeGreaterThan(0)
  })

  it('serves a CID-shaped profile', async () => {
    // JSS 0.0.209 stores the profile at card.jsonld (no extension-free content negotiation)
    const r = await fetch(`${BASE}/alice/profile/card.jsonld`, { headers: { Accept: 'application/ld+json' } })
    expect(r.status).toBe(200)
    expect(await r.text()).toMatch(/cid|controller/i)
  })

  it.skipIf(!hasGit)('git push materializes a retrievable resource', async () => {
    const repo = `alice/gitprobe-${process.pid}-${Date.now()}`
    const dir = mkdtempSync(join(tmpdir(), 'gitprobe-'))
    try {
      const git = (...a) => execFileSync('git', a, { cwd: dir, stdio: 'pipe' })
      git('init', '-q')
      git('config', 'user.email', 'a@b.c')
      git('config', 'user.name', 'probe')
      writeFileSync(join(dir, 'pushed.ttl'),
        '<#g> <http://www.w3.org/2000/01/rdf-schema#label> "from git push" .\n')
      git('add', 'pushed.ttl')
      git('commit', '-qm', 'probe')
      git('-c', `http.extraHeader=Authorization: Bearer ${token}`,
          'push', `${BASE}/${repo}`, 'HEAD:refs/heads/main')

      const got = await fetch(`${BASE}/${repo}/pushed.ttl`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      expect(got.status).toBe(200)
      expect((await got.text()).length).toBeGreaterThan(0)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
