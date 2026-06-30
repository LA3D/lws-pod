import { describe, it, beforeAll, expect } from 'vitest'
import { BASE, ensurePod, getToken } from './helpers.mjs'

// Self-skip on a non-lws pod (same gate as lws-discovery.test.mjs). Top-level
// await is fine in a Vitest ESM test file (runs at collection time).
const lwsEnabled = await fetch(`${BASE}/.well-known/lws-storage`, {
  headers: { Accept: 'application/lws+json' },
}).then(r => r.status === 200).catch(() => false)

// POWDER-S describedby predicate — the constraint token shared by .meta and Link headers.
const DESCRIBEDBY = 'http://www.w3.org/2007/05/powder-s#describedby'
const EX  = 'http://example.org/test/'
const SH  = 'http://www.w3.org/ns/shacl#'
const XSD = 'http://www.w3.org/2001/XMLSchema#'

// Shape as JSON-LD with an explicit @id on each sh:property blank node.
// JSS's JSON-LD→quads parser drops anonymous blank-node restrictions when the
// blank node has no @id — the restriction quads are emitted with a transient
// blank-node label that is then orphaned from the shape node.  Named blank nodes
// (`"@id": "_:p1"`) survive the round-trip.  This bit the fork integration
// tests; replicate the working pattern here.
function shapeJsonLd(shapeIri) {
  return JSON.stringify({
    '@context': { sh: SH, ex: EX, xsd: XSD },
    '@id': shapeIri,
    '@type': `${SH}NodeShape`,
    [`${SH}targetClass`]: { '@id': `${EX}Note` },
    [`${SH}property`]: {
      '@id': '_:p1',
      [`${SH}path`]:     { '@id': `${EX}title` },
      [`${SH}minCount`]: { '@value': '1', '@type': `${XSD}integer` },
      [`${SH}severity`]: { '@id': `${SH}Violation` },
      [`${SH}message`]:  'title required',
    },
  })
}

describe.skipIf(!lwsEnabled)('LWS L3 SHACL admission (live --lws pod)', () => {
  let token
  // Unique path prefix to avoid collisions across test runs.
  const shapeUrl      = `${BASE}/alice/shapes/l3-note-shape`
  const containerUrl  = `${BASE}/alice/l3-test/`
  const containerMeta = `${BASE}/alice/l3-test/.meta`

  beforeAll(async () => {
    await ensurePod()
    ;({ token } = await getToken())

    // 1. PUT the SHACL shape resource as JSON-LD (named blank-node restrictions).
    const sr = await fetch(shapeUrl, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/ld+json' },
      body: shapeJsonLd(shapeUrl),
    })
    if (!sr.ok) throw new Error(`PUT shape → ${sr.status} ${await sr.text()}`)

    // 2. PUT the container .meta declaring the member-rule: describedby → shapeUrl.
    const mr = await fetch(containerMeta, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/ld+json' },
      body: JSON.stringify({ '@id': containerUrl, [DESCRIBEDBY]: { '@id': shapeUrl } }),
    })
    if (!mr.ok) throw new Error(`PUT container .meta → ${mr.status} ${await mr.text()}`)
  })

  it('rejects a non-conforming write with 400 problem+json + violations[] + describedby Link', async () => {
    // ex:Note without ex:title violates sh:minCount 1 → Violation → 400.
    const bad = await fetch(`${containerUrl}bad-note`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/ld+json' },
      body: JSON.stringify({
        '@context': { ex: EX },
        '@id': `${containerUrl}bad-note`,
        '@type': 'ex:Note',
        // intentionally no ex:title
      }),
    })
    expect(bad.status).toBe(400)
    expect(bad.headers.get('content-type')).toMatch(/application\/problem\+json/)
    expect(bad.headers.get('link')).toMatch(/rel="describedby"/)
    const body = await bad.json()
    expect(body.status).toBe(400)
    expect(Array.isArray(body.violations)).toBe(true)
    expect(body.violations.length).toBeGreaterThan(0)
    expect(body.violations.some(v => v.message === 'title required')).toBe(true)
  })

  it('admits a conforming write (201 or 204)', async () => {
    // ex:Note WITH ex:title → passes admission.
    const good = await fetch(`${containerUrl}good-note`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/ld+json' },
      body: JSON.stringify({
        '@context': { ex: EX },
        '@id': `${containerUrl}good-note`,
        '@type': 'ex:Note',
        'ex:title': 'A valid note title',
      }),
    })
    expect([201, 204]).toContain(good.status)
  })
})
