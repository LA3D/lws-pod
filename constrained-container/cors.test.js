import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { spawn } from 'node:child_process'

let proc
const PORT = 8099
beforeAll(async () => {
  proc = spawn('node', ['proxy.js'], { cwd: import.meta.dirname, env: { ...process.env, PORT, UPSTREAM: 'http://localhost:3838' } })
  await new Promise(r => setTimeout(r, 600))
})
afterAll(() => proc?.kill())

describe('proxy CORS', () => {
  it('answers OPTIONS preflight with 204 and allow headers', async () => {
    const res = await fetch(`http://localhost:${PORT}/concepts/x.md`, {
      method: 'OPTIONS', headers: { origin: 'http://localhost:5173', 'access-control-request-method': 'PUT' } })
    expect(res.status).toBe(204)
    expect(res.headers.get('access-control-allow-origin')).toBeTruthy()
    expect(res.headers.get('access-control-allow-headers').toLowerCase()).toContain('authorization')
  })

  it('exposes link and warning headers on responses', async () => {
    const res = await fetch(`http://localhost:${PORT}/`, { headers: { origin: 'http://localhost:5173' } })
    expect((res.headers.get('access-control-expose-headers') || '').toLowerCase()).toContain('link')
  })

  it('emits CORS headers on 422 base-shape rejections (browser can read sh:message)', async () => {
    // A markdown PUT that fails the base shape must carry CORS headers so the
    // browser can inspect the 422 body (the sh:message floor verdict).
    const res = await fetch(`http://localhost:${PORT}/concepts/test.md`, {
      method: 'PUT',
      headers: {
        origin: 'http://localhost:5173',
        'content-type': 'text/markdown; charset=utf-8',
      },
      body: '---\ntype: concept-note\n---\n# Bad card\n\nMissing required fields.\n',
    })
    expect(res.status).toBe(422)
    expect(res.headers.get('access-control-allow-origin')).toBeTruthy()
    expect((res.headers.get('access-control-expose-headers') || '').toLowerCase()).toContain('link')
  })
})
