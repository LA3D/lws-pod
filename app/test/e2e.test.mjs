// @vitest-environment node
import { describe, it, expect, beforeAll } from 'vitest'
import { setSession, login, getText, putCard } from '../src/pod.js'
import { worklist } from '../src/graph.js'

const POD   = process.env.POD   || 'http://localhost:3838'
const PROXY = process.env.PROXY || 'http://localhost:8080'

describe('e2e (requires: pod up at :3838, proxy up at :8080, seeded)', () => {
  beforeAll(async () => {
    const { token } = await login(
      POD,
      process.env.EMAIL || 'alice@example.com',
      process.env.PW    || 'alicepassword123',
    )
    setSession({ podUrl: POD, token, proxyUrl: PROXY })
  })

  it('index.md contains "Progressive Disclosure"', async () => {
    const idx = await getText(`${POD}/alice/concepts/index.md`, 'text/markdown')
    expect(idx).toContain('Progressive Disclosure')
  })

  it('worklist names "Hierarchical Retrieval" (the ungoverned card)', async () => {
    const rows = await worklist(`${POD}/alice/concepts/graph.ttl`)
    expect(rows.map(r => r.label)).toContain('Hierarchical Retrieval')
  })

  it('proxy rejects a Concept card with no wm:implementedBy with 422 + "implement" message', async () => {
    const bad = [
      '---',
      'type: Concept',
      'title: Needs Impl',
      'description: A concept that deliberately omits the wm:implementedBy link.',
      '---',
      '{=<#it> .skos:Concept}',
      '',
      '# Needs Impl',
      '',
      '[Needs Impl]{skos:prefLabel} has no implementation yet.',
    ].join('\n')
    const r = await putCard(`${POD}/alice/concepts/needs-impl.md`, bad)
    expect(r.status).toBe(422)
    expect(r.message.toLowerCase()).toContain('implement')
  })
})
