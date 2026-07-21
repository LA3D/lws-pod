import { describe, it, expect } from 'vitest'
import { BASE, loadManifest, probeCapabilities } from './helpers.mjs'

// The RED gate (guardrails spec L5). Every other gate file self-skips when its capability
// probe comes back empty — 37 skipIf sites — so a degraded pod reports green. This one
// compares the pod against its manifest and FAILS. It must never gain a skipIf.
const manifest = loadManifest(BASE)

describe('deployed capabilities match the rig manifest', () => {
  it('a manifest exists for this BASE', () => {
    expect(manifest, `no rig/capabilities.*.json declares base "${BASE}"`).not.toBeNull()
  })

  it('every declared capability matches actual', async () => {
    const actual = await probeCapabilities(BASE)
    const mismatches = []
    for (const [name, want] of Object.entries(manifest?.capabilities ?? {})) {
      if (actual[name] !== want) {
        mismatches.push(`${name}: expected ${want}, actual ${actual[name]}`)
      }
    }
    expect(mismatches, `\n  ${mismatches.join('\n  ')}\n`).toEqual([])
  })
})
