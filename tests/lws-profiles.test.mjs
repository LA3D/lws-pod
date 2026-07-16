import { describe, it, expect, beforeAll } from 'vitest'
import { BASE, ensurePod, getToken } from './helpers.mjs'
import { resolveStorageAuthority, readProfileIndex } from '../projection/prof/resolve.mjs'
import { loadProfile, discoverBinding } from '../projection/prof/profile-loader.mjs'

// Live-pod profile-mechanism gate (spec §10). Needs the fork --lws TLS pod
// (make up-fork-tls, NODE_EXTRA_CA_CERTS=certs/rootCA.pem) + make publish-profiles run.
//
// Task-10 (navigator round) finding #1: this file hardcoded `/alice/concepts/`
// — the wiki family's PRE-rename home. The next-fork round (2026-07-13/14)
// moved the Makefile's `publish-profiles` bind target to `/alice/wiki/`
// (VoID-consistent plane), but this file was never updated to match, so it
// silently depended on a STALE `/alice/concepts/.meta` binding left over
// from before that rename — invisible as long as a live pod's data volume
// kept surviving between rounds. A genuine `down-fork-tls -v` (this task's
// own Step 1) wipes that leftover state and exposes it.
//
// Task-10 finding #2: simply re-pointing at `/alice/wiki/` isn't enough —
// that container is the SHARED wiki-family fixture every other live test
// (lws-wiki/lws-referent/viewer) also `instantiate()`s over, and
// instantiate()'s member loop unconditionally `advertise()`s the llm-wiki
// profile's self-rep (`altr:hasDefaultRepresentation`, `dct:conformsTo`
// okf-base) onto EVERY source member's own `.meta` — including this file's
// `unbound.md`/`good.jsonld` fixtures, once ANY other test file's beforeAll
// runs `runOnce()` after they exist. That directly contradicts acceptance
// #4/#5b's claim ("a member carries no conformsTo of its own"), and is
// timing-dependent on live-sweep ORDER, not a real regression. Fix: bind a
// DEDICATED, isolated container (`/alice/profile-mech/`) this file alone
// writes into — nothing else in the live suite touches it, so no other
// test's instantiate() pass can ever stamp its members. Owner-private by
// JSS default (no ACL set): every request in this file authenticates as
// the owner, so no public grant is needed (same reasoning as
// tests/lws-referent.test.mjs's GOV/GOV_PLURAL fixtures).
const DCT_CONFORMS = 'http://purl.org/dc/terms/conformsTo'
const PMECH = '/alice/profile-mech/'
const LLM_WIKI = `https://pod.vardeman.me/alice/profiles/llm-wiki/profile.jsonld`

// Top-level probe, matching the existing gates' self-skip pattern: the
// suite skips (never fails) on a non---lws pod. The well-known root is a
// ServerIndex (multi-tenant round) — probe alice's own per-storage
// StorageDescription for the --lws Storage shape this suite exercises.
const lws = await fetch(`${BASE}/alice/lws-storage`)
  .then(async (r) => r.ok && (await r.json()).type === 'Storage').catch(() => false)
let token, authedFetch

beforeAll(async () => {
  await ensurePod()
  ;({ token } = await getToken())
  // PMECH is owner-private (no ACL set, JSS default) — discoverBinding needs
  // an authed fetchFn to read its .meta at all (same reasoning as
  // tests/lws-referent.test.mjs's GOV fixture).
  authedFetch = (url, opts = {}) => fetch(url, { ...opts, headers: { ...opts.headers, authorization: `Bearer ${token}` } })
  // describedby = BOTH llm-wiki's own shape AND the okf-base floor it's
  // profiled from (loadProfile's `.validation` walks isProfileOf) — matches
  // what `make publish-profiles`'s bind step writes onto /alice/wiki/.meta;
  // a describedby of llm-wiki's shape alone omits okf-base's Info-severity
  // "consider a description" rule, so acceptance #5b's advisories-body
  // claim would never fire (title-only good.jsonld never advises without it).
  const meta = { '@context': { dct: 'http://purl.org/dc/terms/', powder: 'http://www.w3.org/2007/05/powder-s#' }, '@id': '',
    'dct:conformsTo': { '@id': LLM_WIKI }, 'powder:describedby': (await loadProfile(LLM_WIKI)).validation.map((v) => ({ '@id': v })) }
  const r = await fetch(`${BASE}${PMECH}.meta`, { method: 'PUT',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/ld+json' }, body: JSON.stringify(meta) })
  if (![200, 201, 204, 205].includes(r.status)) throw new Error(`binding ${PMECH}.meta -> ${r.status}`)
  // Re-run safety: delete acceptance #5b's own fixture so its 201-with-
  // advisories-body assertion is never masked by an idempotent 204 (no
  // body) from an unchanged re-PUT on a repeat `make test-profiles`.
  for (const u of ['good.jsonld', 'good.jsonld.meta']) await fetch(`${BASE}${PMECH}${u}`, { method: 'DELETE', headers: { authorization: `Bearer ${token}` } })
})

describe.skipIf(!lws)('profile mechanism (live)', () => {
  it('acceptance #1/#2: storage description advertises the index; authority resolved from it', async () => {
    // PMECH is owner-private (no ACL set, JSS default): an ANONYMOUS HEAD 401s
    // with no Link header at all, so resolveStorageAuthority's real-resource
    // read silently falls back to the well-known convention — which, since
    // the multi-tenant round, is the origin ServerIndex, not this storage's
    // own description. Authenticate so the mechanism reads the resource's
    // OWN storageDescription Link (the thing this acceptance is pinning),
    // same reasoning as discoverBinding's authedFetch elsewhere in this file.
    const { authority, profileIndex } = await resolveStorageAuthority(`${BASE}${PMECH}`, { fetchFn: authedFetch })
    expect(authority).toBe(`${BASE}/alice/`)
    expect(profileIndex).toBe(`${BASE}/alice/profiles/index.jsonld`)
    const idx = await readProfileIndex(profileIndex)
    expect(idx.profiles.length).toBeGreaterThanOrEqual(3)
  })

  it('acceptance #4: bound container linkset carries full-URI conformsTo; unbound member omits it', async () => {
    const bound = await fetch(`${BASE}${PMECH}`, { headers: { accept: 'application/linkset+json', authorization: `Bearer ${token}` } })
    const ls = (await bound.json()).linkset[0]
    expect(ls[DCT_CONFORMS][0].href).toBe(LLM_WIKI)
    await fetch(`${BASE}${PMECH}unbound.md`, { method: 'PUT',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'text/markdown' }, body: '---\ntitle: u\n---\n' })
    const member = await fetch(`${BASE}${PMECH}unbound.md`, { headers: { accept: 'application/linkset+json', authorization: `Bearer ${token}` } })
    expect(DCT_CONFORMS in (await member.json()).linkset[0]).toBe(false)
  })

  it('loader resolves the published llm-wiki profile end-to-end (walk + merge live)', async () => {
    const bindings = await discoverBinding(`${BASE}${PMECH}anything.md`, { fetchFn: authedFetch })
    expect(bindings).toEqual([LLM_WIKI])
    const p = await loadProfile(bindings[0])
    expect(p.token).toBe('llm-wiki')
    expect(p.validation.some((v) => v.endsWith('llm-wiki/shapes.ttl'))).toBe(true)
    expect(p.identityPolicy).toEqual({ pathPrefix: 'id/', fragment: '#it' })
    expect(p.conformance.some((c) => c.iri.endsWith('substrate-floor.jsonld') && c.resolved)).toBe(true)
  })

  it('acceptance #5 (STRICT): L3 rejects a non-conformant RDF write through the profile-sourced shape, teaching message intact', async () => {
    // llm-wiki shapes constrain wm-typed subjects; a deliberately wrong typed node.
    // STRICT since the array-form-shape sniff fix (was three-armed while the
    // ld+json-500 fork bug stood): the ONLY acceptable outcome is a SHACL
    // rejection with the teaching channel — a 2xx here is the silent-accept
    // this gate exists to catch, and any 5xx is a regression.
    const bad = { '@context': { wm: 'https://la3d.github.io/llm-wiki-colab/ns#' }, '@id': '#it', '@type': 'wm:Concept' }
    const r = await fetch(`${BASE}${PMECH}bad.jsonld`, { method: 'PUT',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/ld+json' }, body: JSON.stringify(bad) })
    expect(r.status).toBe(400)
    const problem = await r.json()
    expect(problem.violations?.length ?? 0).toBeGreaterThan(0)       // the teaching channel
    expect(JSON.stringify(problem.violations)).toMatch(/title/i)     // the llm-wiki floor rule speaks
  })

  it('acceptance #5b: a CONFORMANT member admits through the profile shape and stays observable', async () => {
    // The positive path (never live-proven before the array-form sniff fix) +
    // the observability seed: strict #5 rejects every bad member, so without
    // this the bound container holds no RDF member a cold agent can sample.
    // Pins the CURRENT handoff design: governance edges (describedby,
    // conformsTo) live on the CONTAINER linkset; a member carries up/type and
    // reaches its profile via `up`. Member-level inheritance (or an
    // earned-at-admission conformsTo) is an explicit L4 brainstorm input —
    // if L4 changes the design, flip these assertions deliberately. (This
    // dedicated container is never `instantiate()`d by any test, so the
    // separate "earned conformsTo" provenance feature — stamped only on
    // SHACL-admitted members, see src/lws/write.js — never fires here
    // either; both are orthogonal to what this test pins.)
    const good = { '@context': { wm: 'https://la3d.github.io/llm-wiki-colab/ns#', dcterms: 'http://purl.org/dc/terms/' },
      '@id': '#it', '@type': 'wm:Concept', 'dcterms:title': 'Conformant seed concept' }
    const w = await fetch(`${BASE}${PMECH}good.jsonld`, { method: 'PUT',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/ld+json' }, body: JSON.stringify(good) })
    expect([200, 201]).toContain(w.status)                            // admitted, not rejected
    expect(JSON.stringify(await w.json())).toMatch(/advisories/)      // Info advisory channel intact
    const member = (await (await fetch(`${BASE}${PMECH}good.jsonld`,
      { headers: { accept: 'application/linkset+json', authorization: `Bearer ${token}` } })).json()).linkset[0]
    expect(member.up[0].href).toBe(`${BASE}${PMECH}`)         // the handoff affordance
    expect('describedby' in member).toBe(false)                       // current design: not on the member
    expect(DCT_CONFORMS in member).toBe(false)
    const container = (await (await fetch(`${BASE}${PMECH}`,
      { headers: { accept: 'application/linkset+json', authorization: `Bearer ${token}` } })).json()).linkset[0]
    expect('describedby' in container).toBe(true)                     // ...because it lives here
    expect(DCT_CONFORMS in container).toBe(true)
  })

  it('acceptance #9: an unbound container behaves exactly as today (negative control)', async () => {
    await fetch(`${BASE}/alice/plain/x.md`, { method: 'PUT',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'text/markdown' }, body: 'hi' })
    const ls = await fetch(`${BASE}/alice/plain/`, { headers: { accept: 'application/linkset+json', authorization: `Bearer ${token}` } })
    const link = (await ls.json()).linkset[0]
    expect(DCT_CONFORMS in link).toBe(false)
    expect('describedby' in link).toBe(false)
  })
})
