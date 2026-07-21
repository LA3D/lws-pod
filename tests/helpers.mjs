import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

export const BASE = process.env.BASE || 'http://localhost:3838'
export const POD = { name: 'alice', email: 'alice@example.com', password: 'alicepassword123' }

// Best-effort pod creation: created (2xx) and already-exists (409) are both fine.
export async function ensurePod(pod = POD) {
  const r = await fetch(`${BASE}/.pods`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(pod),
  })
  return r.status
}

// Headless agent credential — the replayable RS256 bearer from the built-in IdP.
export async function getToken(pod = POD) {
  const r = await fetch(`${BASE}/idp/credentials`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: pod.email, password: pod.password }),
  })
  if (!r.ok) throw new Error(`/idp/credentials -> ${r.status}`)
  const j = await r.json()
  return { token: j.access_token, webid: j.webid }
}

const RIG_DIR = new URL('../rig/', import.meta.url).pathname

// Manifest whose `base` matches the BASE under test. Null when none matches — callers
// then fall back to old skip-on-absent behavior rather than inventing expectations.
export function loadManifest(base = BASE) {
  for (const f of readdirSync(RIG_DIR).filter((n) => n.endsWith('.json'))) {
    const m = JSON.parse(readFileSync(join(RIG_DIR, f), 'utf8'))
    if (m.base === base) return m
  }
  return null
}

export function expectedCap(manifest, name) {
  return Boolean(manifest?.capabilities?.[name])
}

// Probe the live pod for the same capability keys the manifests declare.
//
// CRITICAL (found 2026-07-21 while establishing the baseline): a probe that swallows errors
// reproduces the exact bug this gate exists to catch. A transient 429 — the anon budget is
// 60/min and a gate run burns it — made `hasConneg` false in tests/lws-profneg.test.mjs and
// silently skipped all 17 of its cases while reporting GREEN. Same artifact turned
// test-conneg into 11-passed/18-skipped and test-mcp-v2 into 8-passed/15-skipped; re-run
// quiet they are 29/29 and 18-passed. So: NEVER conflate "probe failed" with "capability
// absent". Retry on 429 honoring Retry-After, and THROW on an unresolvable probe so the gate
// errors loudly rather than reporting a false mismatch.
export async function probeCapabilities(base = BASE) {
  const lwsHdr = { Accept: 'application/lws+json' }
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

  // 404 is a real answer ("route absent" = capability absent) and returns null.
  // 429/5xx/network are NOT answers — retry, then throw.
  const j = async (u, h = {}, attempt = 0) => {
    let r
    try {
      r = await fetch(u, { headers: h })
    } catch (e) {
      if (attempt < 3) { await sleep(2000 * (attempt + 1)); return j(u, h, attempt + 1) }
      throw new Error(`probe ${u} failed after retries: ${e.message}`)
    }
    if (r.status === 404) return null
    if (r.status === 429 || r.status >= 500) {
      if (attempt < 3) {
        const ra = Number(r.headers.get('retry-after'))
        await sleep(Number.isFinite(ra) && ra > 0 && ra < 120 ? ra * 1000 : 2000 * (attempt + 1))
        return j(u, h, attempt + 1)
      }
      throw new Error(`probe ${u} still ${r.status} after retries — cannot determine capabilities`)
    }
    if (!r.ok) return null
    // Ok but not JSON (e.g. `/` serving an HTML index) is a real, parseable answer of
    // "not this shape" — not a probe failure. Only network/429/5xx are probe failures.
    try { return await r.json() } catch { return null }
  }

  const idx = await j(`${base}/.well-known/lws-storage`, lwsHdr)
  const svc = (doc, t) => Boolean(doc?.service?.some((s) => s.type === t))
  const alice = await j(`${base}/alice/lws-storage`, lwsHdr)
  const mcpDoc = await j(`${base}/mcp`)          // null only on a real 404
  const rootDoc = await j(`${base}/`)            // parsed opportunistically; may be null

  return {
    lwsEnabled: Boolean(idx),
    serverIndex: idx?.type === 'ServerIndex',
    // NOT a duplicate of serverIndex: this asserts the storage ROSTER is populated. A pod whose
    // roots lack the lws:Storage marker (.lwstypes) still returns type ServerIndex but with
    // storage: [] — exactly the degradation found on 2026-07-21, where alice had been
    // provisioned before the marker landed (fork a8e0c47, 2026-07-15) and was never backfilled,
    // so every per-storage route 404'd while the server looked healthy. Check the roster.
    multiTenant: Array.isArray(idx?.storage) && idx.storage.length > 0,
    typeIndexService: svc(idx, 'TypeIndexService'),
    typeSearchService: svc(idx, 'TypeSearchService'),
    mcpService: svc(idx, 'McpService') || mcpDoc !== null,
    voidService: svc(alice, 'VoidService'),
    perStorageServices: svc(alice, 'TypeIndexService'),
    notifications: true,
    git: true,
    mashlibCdn: /mashlib|databrowser/i.test(JSON.stringify(rootDoc ?? '')),
  }
}
