// app/seed/seed.mjs — Seed wiki-memory content into the live pod under /alice/
// Usage: node app/seed/seed.mjs
// Env: POD (default http://localhost:3838), PROXY (default http://localhost:8080),
//      EMAIL (default alice@example.com), PW (default alicepassword123)
import { readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'

const POD   = process.env.POD   || 'http://localhost:3838'
const PROXY = process.env.PROXY || 'http://localhost:8080'
const EMAIL = process.env.EMAIL || 'alice@example.com'
const PW    = process.env.PW    || 'alicepassword123'

// Step 1: Authenticate
console.log('[seed] logging in...')
const loginRes = await fetch(`${POD}/idp/credentials`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: EMAIL, password: PW }),
})
if (!loginRes.ok) throw new Error(`login failed (${loginRes.status}): ${await loginRes.text()}`)
const loginJson = await loginRes.json()
const token = loginJson.access_token
if (!token) throw new Error(`no access_token in response: ${JSON.stringify(loginJson)}`)
console.log(`[seed] token acquired`)

const H = { Authorization: `Bearer ${token}` }

// Step 2: Create containers (direct PUT to POD)
async function mkContainer(path) {
  const url = `${POD}${path}`
  const r = await fetch(url, {
    method: 'PUT',
    headers: { ...H, 'Content-Type': 'text/turtle', Link: '<http://www.w3.org/ns/ldp#BasicContainer>; rel="type"' },
  })
  console.log(`[seed] container ${path} -> ${r.status} ${r.statusText}`)
  if (![200, 201, 204, 205, 409].includes(r.status)) {
    const body = await r.text()
    console.error(`  body: ${body.slice(0, 200)}`)
  }
}

await mkContainer('/alice/concepts/')
await mkContainer('/alice/implementations/')

// Step 2b: Ensure /alice/ is publicly readable (acl:default on public rule covers subdirs).
// This is idempotent — safe to re-run.
console.log('[seed] ensuring /alice/ public-read ACL...')
const aclBody = JSON.stringify({
  '@context': { acl: 'http://www.w3.org/ns/auth/acl#', foaf: 'http://xmlns.com/foaf/0.1/' },
  '@graph': [
    {
      '@id': '#owner',
      '@type': 'acl:Authorization',
      'acl:agent': { '@id': './profile/card.jsonld#me' },
      'acl:accessTo': { '@id': './' },
      'acl:mode': [{ '@id': 'acl:Read' }, { '@id': 'acl:Write' }, { '@id': 'acl:Control' }],
      'acl:default': { '@id': './' },
    },
    {
      '@id': '#public',
      '@type': 'acl:Authorization',
      'acl:agentClass': { '@id': 'foaf:Agent' },
      'acl:accessTo': { '@id': './' },
      'acl:mode': [{ '@id': 'acl:Read' }],
      'acl:default': { '@id': './' },
    },
  ],
})
const aclR = await fetch(`${POD}/alice/.acl`, {
  method: 'PUT',
  headers: { ...H, 'Content-Type': 'application/ld+json' },
  body: aclBody,
})
console.log(`[seed] /alice/.acl -> ${aclR.status} ${aclR.statusText}`)

// Step 3: Constrain /alice/concepts/ — PUT shape + .meta
console.log('[seed] constraining /alice/concepts/...')

// Read the ConceptWiringShape from the projection profile
const shapePath = new URL('../../projection/profiles/defs/llm-wiki/shapes.ttl', import.meta.url)
const shapeTtl = readFileSync(shapePath, 'utf8')

// PUT shape.ttl to the pod
const shapeUrl = `${POD}/alice/concepts/shape.ttl`
const shapeR = await fetch(shapeUrl, {
  method: 'PUT',
  headers: { ...H, 'Content-Type': 'text/turtle' },
  body: shapeTtl,
})
console.log(`[seed] shape.ttl -> ${shapeR.status} ${shapeR.statusText}`)

// PUT .meta to register the ldp:constrainedBy link
const metaBody = `<${POD}/alice/concepts/> <http://www.w3.org/ns/ldp#constrainedBy> <${POD}/alice/concepts/shape.ttl> .`
const metaR = await fetch(`${POD}/alice/concepts/.meta`, {
  method: 'PUT',
  headers: { ...H, 'Content-Type': 'text/turtle' },
  body: metaBody,
})
console.log(`[seed] /alice/concepts/.meta -> ${metaR.status} ${metaR.statusText}`)

// Helper: PUT a card through the proxy (governed write)
async function putViaProxy(podPath, localFile) {
  const md = readFileSync(new URL(`./${localFile}`, import.meta.url))
  const proxyUrl = `${PROXY}${podPath}`
  const r = await fetch(proxyUrl, {
    method: 'PUT',
    headers: { ...H, 'Content-Type': 'text/markdown' },
    body: md,
  })
  const txt = await r.text()
  console.log(`[seed] proxy PUT ${podPath} -> ${r.status}`)
  if (![200, 201, 204, 205].includes(r.status)) console.error(`  body: ${txt.slice(0, 300)}`)
  return r.status
}

// Helper: PUT a card direct to pod (bypass proxy — ungoverned write)
async function putDirect(podPath, localFile) {
  const md = readFileSync(new URL(`./${localFile}`, import.meta.url))
  const url = `${POD}${podPath}`
  const r = await fetch(url, {
    method: 'PUT',
    headers: { ...H, 'Content-Type': 'text/markdown' },
    body: md,
  })
  const txt = await r.text()
  console.log(`[seed] direct PUT ${podPath} -> ${r.status}`)
  if (![200, 201, 204, 205].includes(r.status)) console.error(`  body: ${txt.slice(0, 300)}`)
  return r.status
}

// Step 4: PUT the implementation card through proxy (implementations is unconstrained — base shape only)
await putViaProxy('/alice/implementations/projection-engine.md', 'implementations/projection-engine.md')

// Step 5: PUT progressive-disclosure.md and dual-layer-linking.md through proxy
// (they have wm:implementedBy so they pass ConceptWiringShape)
await putViaProxy('/alice/concepts/progressive-disclosure.md', 'concepts/progressive-disclosure.md')
await putViaProxy('/alice/concepts/dual-layer-linking.md', 'concepts/dual-layer-linking.md')

// Step 6: PUT hierarchical-retrieval.md DIRECT to pod (bypass proxy)
// Through the proxy it would 422 (missing wm:implementedBy). Direct write stores it
// ungoverned — it lands on the worklist as a deliberate demo item.
await putDirect('/alice/concepts/hierarchical-retrieval.md', 'concepts/hierarchical-retrieval.md')

// Step 7: Run projection on both containers
const cliPath = new URL('../../projection/triggers/cli.mjs', import.meta.url).pathname

function runProjection(containerUrl) {
  console.log(`[seed] projecting ${containerUrl}...`)
  try {
    const out = execFileSync('node', [cliPath, containerUrl], {
      env: { ...process.env, TOKEN: token },
      encoding: 'utf8',
    })
    const results = JSON.parse(out.trim())
    for (const r of results) console.log(`  ${r.channel || r.url || '?'} -> ${r.status}`)
    return results
  } catch (e) {
    console.error(`[seed] projection failed: ${e.message}`)
    if (e.stdout) console.error(`  stdout: ${e.stdout.slice(0, 500)}`)
    throw e
  }
}

const conceptsResults = runProjection(`${POD}/alice/concepts/`)
const implsResults    = runProjection(`${POD}/alice/implementations/`)

console.log('[seed] done.')
console.log(`  concepts projection: ${conceptsResults.length} result(s)`)
console.log(`  implementations projection: ${implsResults.length} result(s)`)
