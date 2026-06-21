// Keycloak auth-gateway (spike). Same lineage as constrained-container/proxy.js:
// a host-run http proxy in front of JSS. Verifies the incoming Keycloak JWT against
// Keycloak's JWKS, extracts the `webid` claim (approach A), then forwards to JSS under
// a JSS owner bearer (downstream credential = spike candidate b; gateway is the PEP).
import http from 'node:http'
import { createRemoteJWKSet, jwtVerify } from 'jose'

const UPSTREAM = process.env.UPSTREAM || 'http://localhost:3838'
const PORT = Number(process.env.PORT || 3840)
const ISSUER = process.env.KC_ISSUER || 'http://localhost:8080/realms/lws'
const JWKS = createRemoteJWKSet(new URL(`${ISSUER}/protocol/openid-connect/certs`))

let JSS_BEARER = ''
async function refreshBearer() {
  const r = await fetch(`${UPSTREAM}/idp/credentials`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: process.env.JSS_EMAIL || 'alice@example.com',
      password: process.env.JSS_PASSWORD || 'alicepassword123',
    }),
  })
  if (r.ok) JSS_BEARER = (await r.json()).access_token
  else console.error(`[gw] could not mint JSS bearer: ${r.status}`)
}

const readBody = req => new Promise(r => {
  const c = []; req.on('data', d => c.push(d)); req.on('end', () => r(Buffer.concat(c)))
})
const unauthorized = (res, msg) => { res.writeHead(401, { 'content-type': 'text/plain' }); res.end(`401: ${msg}\n`) }

const server = http.createServer(async (req, res) => {
  const m = (req.headers['authorization'] || '').match(/^Bearer (.+)$/i)
  if (!m) return unauthorized(res, 'no bearer token')

  let webid
  try {
    const { payload } = await jwtVerify(m[1], JWKS, { issuer: ISSUER })
    webid = payload.webid
    if (!webid) return unauthorized(res, 'token has no webid claim')
  } catch (e) {
    return unauthorized(res, `invalid token (${e.code || e.message})`)
  }

  const isWrite = req.method === 'PUT' || req.method === 'POST' || req.method === 'PATCH'
  const body = isWrite ? await readBody(req) : undefined
  const headers = { ...req.headers }
  delete headers.host; delete headers['content-length']
  headers['authorization'] = `Bearer ${JSS_BEARER}`   // act as the pod owner (spike cred b)
  headers['x-webid'] = webid                            // record the asserted identity

  const up = await fetch(`${UPSTREAM}${req.url}`, { method: req.method, headers, body, redirect: 'manual' })
  const out = {}; up.headers.forEach((v, k) => { if (k !== 'content-length') out[k] = v })
  const buf = Buffer.from(await up.arrayBuffer())
  res.writeHead(up.status, out); res.end(buf)
  console.log(`[gw] ${req.method} ${req.url} as ${webid} -> ${up.status}`)
})

await refreshBearer()
server.listen(PORT, () => console.log(`keycloak auth-gateway :${PORT} -> ${UPSTREAM} (issuer ${ISSUER})`))
