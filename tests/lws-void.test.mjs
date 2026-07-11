import { describe, it, expect } from 'vitest'
import { BASE } from './helpers.mjs'

// VoID gateway live gate (spec 2026-07-11 §5): /.well-known/void routes (303)
// to the pod-materialized void.jsonld (Task 14's publish.mjs output); the
// document itself carries pod-served dumps for every declared vocabulary (the
// deref rail — no vocabulary without a pod-served definition) and signposts
// the /id/ subject namespace + the profile-walk subsets. Self-skips on a pod
// that doesn't advertise VoidService (the --lws-void flag is opt-in, same
// precedent as --lws-profile-index).
const sd = await fetch(`${BASE}/.well-known/lws-storage`).then(r => (r.ok ? r.json() : {})).catch(() => ({}))
const voidSvc = (sd.service || []).find(s => s.type === 'VoidService')

describe.skipIf(!voidSvc)('VoID gateway (live)', () => {
  it('/.well-known/void 303s to the pod document', async () => {
    const r = await fetch(`${BASE}/.well-known/void`, { redirect: 'manual' })
    expect(r.status).toBe(303)
    expect(r.headers.get('location')).toBe(`${BASE}/alice/profiles/void.jsonld`)
  })

  it('the document parses, declares the OOD vocabularies with pod-served dumps', async () => {
    const d = await fetch(`${BASE}/alice/profiles/void.jsonld`).then(r => r.json())
    expect(d['@type']).toBe('void:Dataset')
    const dumped = d['void:vocabulary'].filter(v => v['void:dataDump'])
    expect(dumped.length).toBeGreaterThanOrEqual(2)
    for (const v of dumped) {
      const dump = await fetch(v['void:dataDump']['@id'])
      expect(dump.status).toBe(200)   // the deref rail, live: every dump GETs from the pod
    }
  })

  it('uriSpace signposts the /id/ namespace', async () => {
    const d = await fetch(`${BASE}/alice/profiles/void.jsonld`).then(r => r.json())
    expect(d['void:uriSpace']).toBe(`${BASE}/id/`)
  })

  it('subsets route into the profile walk (conformsTo dereferences)', async () => {
    const d = await fetch(`${BASE}/alice/profiles/void.jsonld`).then(r => r.json())
    for (const s of d['void:subset'])
      expect((await fetch(s['dcterms:conformsTo']['@id'])).status).toBe(200)
  })
})
