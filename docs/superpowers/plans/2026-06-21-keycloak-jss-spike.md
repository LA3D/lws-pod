# Keycloak-in-front-of-JSS Spike Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prove a Keycloak-issued token gates read/write access to a JSS-backed resource through a thin auth-gateway that trusts the token's `webid` claim.

**Architecture:** Keycloak (Docker) issues an access token carrying a `webid` claim. A host-run Node auth-gateway (same lineage as `constrained-container/proxy.js`) verifies the token against Keycloak's JWKS, extracts `webid`, and transparently forwards the request to the local JSS pod under a JSS owner bearer. Missing/invalid token → 401.

**Tech Stack:** Docker (Keycloak), Node 22 + `jose` (gateway, host-run), the existing JSS local pod, Vitest (host) for the e2e test.

## Global Constraints

- Spike — lives in `experiments/keycloak-jss/`; optimize for learning; gateway written cleanly enough to seed the Phase-1 sidecar auth front. ESM throughout.
- **Identity = approach A**: the gateway trusts the `webid` claim the token asserts. (Spec fallback B — gateway-held `sub`→WebID map — is NOT implemented; Task 1 confirms A is reachable.)
- **Auth grant = direct-access-grant** (OAuth2 password grant) to mint the Keycloak token. This is the spec-sanctioned simpler path ("token-exchange or, if simpler, a direct grant"). It narrows spec decision #4: instead of importing lws-keycloak's full realm, we stand up a **minimal realm with a `webid` protocol mapper**; lws-keycloak stays the *reference* for the RFC 8693 token-exchange / Solid-OIDC profile (a Phase-2 concern). This keeps the spike deterministic and unblocked by lws-keycloak's AI-generated config.
- **Downstream credential = candidate (b)**: after validating the Keycloak token, the gateway forwards to JSS under a **JSS owner bearer** it mints at startup (`POST /idp/credentials`). The gateway is therefore the policy-enforcement point for the spike; JSS sees the owner bearer. Record this WAC implication in the decision note.
- Gateway runs on the **host** (`node gateway.js`), like `constrained-container/proxy.js` — avoids Keycloak token-issuer hostname mismatch inside Docker.
- The JSS pod is the existing local stack (`make up`, `http://localhost:3838`), with `alice` pre-created. Alice's WebID: `http://localhost:3838/alice/profile/card#me`.
- Git commits: `[Agent: Claude]` prefix; trailer `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`; stage specific files, no `git add -A`.

## File Structure

| File | Responsibility |
|---|---|
| `experiments/keycloak-jss/docker-compose.yml` | Keycloak service (dev mode) + realm import mount |
| `experiments/keycloak-jss/realm-lws.json` | Minimal realm: client `gateway`, user `alice` (password + `webid` attribute), `webid` protocol mapper |
| `experiments/keycloak-jss/gateway.js` | Host-run auth-gateway: verify Keycloak JWT (JWKS), extract `webid`, 401 on bad, forward to JSS under owner bearer |
| `experiments/keycloak-jss/package.json` | `jose` dep + start/test scripts |
| `experiments/keycloak-jss/tokens.test.mjs` | Vitest e2e: Keycloak token → gateway → JSS CRUD; bad token → 401 |
| `experiments/keycloak-jss/README.md` | How to run + the decision note (spike outcome) |
| `Makefile` | add `kc-up` / `kc-down` / `kc-spike` targets |

---

### Task 1: Keycloak issuing a `webid`-bearing token

Deliverable: a direct-grant request to Keycloak returns an access token whose decoded payload contains `webid` = alice's JSS WebID. This confirms approach A is reachable.

**Files:**
- Create: `experiments/keycloak-jss/docker-compose.yml`, `experiments/keycloak-jss/realm-lws.json`

**Interfaces:**
- Produces: a Keycloak realm at issuer `http://localhost:8080/realms/lws`; token endpoint `http://localhost:8080/realms/lws/protocol/openid-connect/token`; JWKS at `.../protocol/openid-connect/certs`; client_id `gateway` (public, direct-access-grants on); user `alice` / password `alicepassword123` with `webid` claim.

- [ ] **Step 1: Write the realm import**

Create `experiments/keycloak-jss/realm-lws.json`:

```json
{
  "realm": "lws",
  "enabled": true,
  "clients": [
    {
      "clientId": "gateway",
      "enabled": true,
      "publicClient": true,
      "directAccessGrantsEnabled": true,
      "standardFlowEnabled": false,
      "protocolMappers": [
        {
          "name": "webid",
          "protocol": "openid-connect",
          "protocolMapper": "oidc-usermodel-attribute-mapper",
          "config": {
            "user.attribute": "webid",
            "claim.name": "webid",
            "jsonType.label": "String",
            "id.token.claim": "true",
            "access.token.claim": "true",
            "userinfo.token.claim": "true"
          }
        }
      ]
    }
  ],
  "users": [
    {
      "username": "alice",
      "enabled": true,
      "email": "alice@example.com",
      "attributes": { "webid": ["http://localhost:3838/alice/profile/card#me"] },
      "credentials": [
        { "type": "password", "value": "alicepassword123", "temporary": false }
      ]
    }
  ]
}
```

- [ ] **Step 2: Write the compose file**

Create `experiments/keycloak-jss/docker-compose.yml`:

```yaml
# Keycloak for the P1 spike. Dev mode, in-memory, realm imported at boot.
# Issuer: http://localhost:8080/realms/lws
services:
  keycloak:
    image: quay.io/keycloak/keycloak:26.0
    container_name: lws-keycloak-spike
    command: ["start-dev", "--import-realm"]
    environment:
      KC_BOOTSTRAP_ADMIN_USERNAME: admin
      KC_BOOTSTRAP_ADMIN_PASSWORD: admin
    ports:
      - "8080:8080"
    volumes:
      - ./realm-lws.json:/opt/keycloak/data/import/realm-lws.json:ro
```

- [ ] **Step 3: Bring Keycloak up**

Run: `docker compose -f experiments/keycloak-jss/docker-compose.yml up -d`
Then wait for readiness:
Run: `until curl -sf http://localhost:8080/realms/lws/.well-known/openid-configuration >/dev/null; do sleep 2; done; echo ready`
Expected: prints `ready` within ~30-60s.

- [ ] **Step 4: Mint a token and confirm the `webid` claim (resolves the A/B unknown)**

Run:
```bash
TOK=$(curl -s -d client_id=gateway -d username=alice -d password=alicepassword123 \
  -d grant_type=password \
  http://localhost:8080/realms/lws/protocol/openid-connect/token | sed -n 's/.*"access_token":"\([^"]*\)".*/\1/p')
echo "$TOK" | cut -d. -f2 | tr '_-' '/+' | base64 -d 2>/dev/null | python3 -m json.tool | grep -i webid
```
Expected: a line `"webid": "http://localhost:3838/alice/profile/card#me"`. This confirms approach A.

- [ ] **Step 5: Commit**

```bash
git add experiments/keycloak-jss/docker-compose.yml experiments/keycloak-jss/realm-lws.json
git commit -m "$(cat <<'EOF'
[Agent: Claude] spike(kc): Keycloak realm emitting a webid claim

Minimal lws realm (client gateway, user alice, webid attribute->claim mapper),
dev-mode compose. Direct-grant token carries webid = alice's JSS WebID (approach A).

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: auth-gateway + e2e round-trip

Deliverable: the gateway verifies a Keycloak token, forwards an authorized request to JSS (read+write succeed), and returns 401 for missing/invalid tokens — proven by a green Vitest e2e.

**Files:**
- Create: `experiments/keycloak-jss/gateway.js`, `experiments/keycloak-jss/package.json`, `experiments/keycloak-jss/tokens.test.mjs`

**Interfaces:**
- Consumes: Keycloak from Task 1 (issuer `http://localhost:8080/realms/lws`); the JSS pod at `http://localhost:3838` with `alice` pre-created.
- Produces: a gateway listening on `http://localhost:3840` that maps `Bearer <keycloak-jwt>` → forwarded JSS request under an owner bearer.

- [ ] **Step 1: Write `package.json`**

```json
{
  "name": "keycloak-jss-spike",
  "private": true,
  "type": "module",
  "scripts": {
    "start": "node gateway.js",
    "test": "vitest run"
  },
  "dependencies": { "jose": "^5.9.0" },
  "devDependencies": { "vitest": "^3.2.0" }
}
```

Run: `cd experiments/keycloak-jss && npm install`
Expected: installs `jose` + `vitest`, writes `package-lock.json`.

- [ ] **Step 2: Write the failing e2e test**

Create `experiments/keycloak-jss/tokens.test.mjs`:

```javascript
import { describe, it, beforeAll, expect } from 'vitest'

const KC = 'http://localhost:8080/realms/lws'
const GW = 'http://localhost:3840'
const POD = { name: 'alice', email: 'alice@example.com', password: 'alicepassword123' }

async function ensurePod() {
  await fetch('http://localhost:3838/.pods', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(POD),
  })
}
async function kcToken() {
  const r = await fetch(`${KC}/protocol/openid-connect/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: 'gateway', username: 'alice',
      password: 'alicepassword123', grant_type: 'password',
    }),
  })
  if (!r.ok) throw new Error(`kc token -> ${r.status}`)
  return (await r.json()).access_token
}

describe('keycloak token gates JSS via the gateway', () => {
  let token
  beforeAll(async () => { await ensurePod(); token = await kcToken() })

  it('rejects a request with no token (401)', async () => {
    const r = await fetch(`${GW}/alice/notes/kc.ttl`)
    expect(r.status).toBe(401)
  })

  it('rejects a tampered token (401)', async () => {
    const r = await fetch(`${GW}/alice/notes/kc.ttl`, {
      headers: { Authorization: `Bearer ${token}tampered` },
    })
    expect(r.status).toBe(401)
  })

  it('allows write+read with a valid keycloak token', async () => {
    const url = `${GW}/alice/notes/kc.ttl`
    const put = await fetch(url, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'text/turtle' },
      body: '<#it> <http://www.w3.org/2000/01/rdf-schema#label> "via keycloak" .',
    })
    expect([200, 201, 204, 205]).toContain(put.status)

    const get = await fetch(url, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/ld+json' },
    })
    expect(get.status).toBe(200)
    expect(await get.text()).toContain('via keycloak')
  })
})
```

- [ ] **Step 3: Run the test — expect failure (no gateway yet)**

Run: `cd experiments/keycloak-jss && npx vitest run`
Expected: FAIL — connection refused / non-401 on `:3840` (the gateway isn't running).

- [ ] **Step 4: Write the gateway**

Create `experiments/keycloak-jss/gateway.js`:

```javascript
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
```

- [ ] **Step 5: Start JSS, start the gateway, run the test**

Run (JSS pod): `make up`
Run (gateway, background): `cd experiments/keycloak-jss && node gateway.js & echo $! > /tmp/gw.pid; sleep 2`
Run (test): `cd experiments/keycloak-jss && npx vitest run`
Expected: PASS — all three cases (no-token 401, tampered 401, valid write+read).
Then stop the gateway: `kill "$(cat /tmp/gw.pid)"`

- [ ] **Step 6: Commit**

```bash
git add experiments/keycloak-jss/gateway.js experiments/keycloak-jss/package.json experiments/keycloak-jss/package-lock.json experiments/keycloak-jss/tokens.test.mjs
git commit -m "$(cat <<'EOF'
[Agent: Claude] spike(kc): auth-gateway verifies keycloak token -> JSS

Host-run proxy (constrained-container lineage): jose JWKS verify, extract webid
(approach A), 401 on missing/invalid, forward to JSS under an owner bearer
(downstream cred b). Vitest e2e green: no-token/tampered 401, valid write+read.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Make targets, README, and the decision note

Deliverable: `make kc-up` / `kc-down` run the spike; the README records the outcome and the decision note; `FOLLOWUP.md` P1 is updated.

**Files:**
- Modify: `Makefile`
- Create: `experiments/keycloak-jss/README.md`
- Modify: `FOLLOWUP.md`

**Interfaces:**
- Consumes: Tasks 1-2 (Keycloak compose + gateway + test).

- [ ] **Step 1: Add make targets**

Append to `Makefile` (after the existing TLS section):

```makefile

# --- P1 spike: Keycloak in front of JSS (experiments/keycloak-jss) ---
KC = docker compose -f experiments/keycloak-jss/docker-compose.yml

kc-up:
	$(KC) up -d
	@echo "Keycloak (spike) at http://localhost:8080 (realm: lws). Start gateway: cd experiments/keycloak-jss && node gateway.js"

kc-down:
	$(KC) down

# Full spike check: assumes `make up` (JSS) and `make kc-up` (Keycloak) are running.
kc-spike:
	cd experiments/keycloak-jss && npm install --silent && (node gateway.js & echo $$! > /tmp/kc-gw.pid; sleep 2; npx vitest run; kill $$(cat /tmp/kc-gw.pid))
```

- [ ] **Step 2: Write the README + decision note**

Create `experiments/keycloak-jss/README.md`:

```markdown
# keycloak-jss (P1 spike)

Proves a Keycloak-issued token gates read/write of a JSS-backed resource through a thin
auth-gateway that trusts the token's `webid` claim. Spec:
`docs/superpowers/specs/2026-06-21-keycloak-jss-spike-design.md`.

## Run

```bash
make up            # JSS pod at :3838 (alice pre-created by the test)
make kc-up         # Keycloak at :8080, realm lws
make kc-spike      # starts the gateway, runs the Vitest e2e, stops the gateway
make kc-down       # stop Keycloak
```

## Topology

`client --Keycloak token--> gateway (:3840, host) --owner bearer--> JSS (:3838)`.
Gateway verifies the JWT against Keycloak's JWKS, extracts `webid`, forwards under a JSS
owner bearer (gateway is the policy-enforcement point for the spike).

## Decision note (outcome)

- **Identity path:** approach A confirmed — the direct-grant access token carries
  `webid = http://localhost:3838/alice/profile/card#me` (Keycloak user-attribute mapper). No
  gateway-side mapping table needed (fallback B not used).
- **Downstream credential:** candidate (b) — gateway forwards under a JSS owner bearer it mints
  at startup. WAC implication: JSS authorizes the owner, not per-WebID; the gateway is the PEP.
  To make JSS enforce per-WebID WAC, a later step would make JSS accept the Keycloak token as an
  external IdP (candidate a) — deferred.
- **Grant:** direct-access-grant (password). RFC 8693 token-exchange + the full Solid-OIDC profile
  (lws-keycloak's realm) deferred to Phase 2.
- **Recommendation:** keep the gateway-enforces pattern — it is the auth front of the Phase-1
  sidecar. Promote `gateway.js` into the sidecar when built.
```

- [ ] **Step 3: Update FOLLOWUP.md P1**

In `FOLLOWUP.md`, under the local-deployment-rung DONE section's follow-ups OR the open items, append a line noting P1 progress. Find the open-items list and add:

```
4. **P1 spike done (2026-06-21):** Keycloak-in-front-of-JSS proven — `experiments/keycloak-jss/`.
   Approach A (token `webid` claim) confirmed; gateway-enforces pattern kept; token-exchange /
   native-JSS-acceptance deferred. See the experiment README's decision note.
```

- [ ] **Step 4: Verify the spike end-to-end from the make targets**

Run: `make up && make kc-up`
Run: `until curl -sf http://localhost:8080/realms/lws/.well-known/openid-configuration >/dev/null; do sleep 2; done; make kc-spike`
Expected: Vitest reports all tests passing.

- [ ] **Step 5: Commit**

```bash
git add Makefile experiments/keycloak-jss/README.md FOLLOWUP.md
git commit -m "$(cat <<'EOF'
[Agent: Claude] spike(kc): make targets, README + decision note, FOLLOWUP

kc-up/kc-down/kc-spike targets; README records the outcome (approach A confirmed,
gateway-enforces kept, token-exchange deferred); FOLLOWUP P1 marked done.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Self-Review

**Spec coverage:**
- Goal (Keycloak token → gateway → JSS, bad token 401) → Tasks 1-2 ✓
- Topology (Keycloak + gateway + JSS) → Tasks 1-2, compose + host gateway ✓
- Decision 1 (gateway enforces) → Task 2 ✓
- Decision 2 (approach A, fallback B) → Task 1 Step 4 confirms A; B explicitly not implemented per Global Constraints ✓
- Decision 3 (pod pre-created) → test `ensurePod()` ✓
- Decision 4 (reuse lws-keycloak config) → **narrowed**: minimal realm + direct grant instead, lws-keycloak kept as reference (flagged in Global Constraints; spec allowed direct grant). ✓ (deliberate, documented)
- Gateway→JSS downstream credential → candidate (b), chosen and recorded (Task 3 decision note) ✓
- Testing (compose + Vitest, round-trip + 401) → Task 2 ✓
- Acceptance criteria 1-4 → Tasks 2 (1-2), Task 1 Step 4 (3), Task 3 README (4) ✓
- Out of scope (cid-resolver, Type Index, lws+json, auto-provisioning, prod hardening, lws-keycloak storage-server) → none introduced ✓

**Placeholder scan:** none — realm JSON, compose, gateway, test, and commands are all concrete.

**Type consistency:** issuer `http://localhost:8080/realms/lws`, client_id `gateway`, claim `webid`, gateway port `3840`, JSS `:3838`, alice creds `alice@example.com`/`alicepassword123` used identically across realm, gateway, and test.

**Note:** Task 1 Step 4 uses `python3` to decode the JWT payload (present on macOS); if absent, decode via `node -e`. The gateway and test do not depend on python3.
