# Proxy Auth + HTTP ACL Provisioning (P2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the `constrained-container/` SHACL admission proxy govern protected (owner-only) containers by reading `.meta`/shape under the requester's `Authorization` (b), and add an HTTP-native ACL helper that makes shapes public-read via `PUT .acl` as `application/ld+json` (a).

**Architecture:** Modify `constrained-container/proxy.js` to forward the incoming `Authorization` into its two internal reads, with auth-keyed caching. Add `constrained-container/set-acl.mjs`, a dependency-free HTTP helper that writes a public-read WAC ACL as JSON-LD. Prove both with a Vitest suite against a default owner-only JSS pod.

**Tech Stack:** Node 22, the existing proxy deps (`n3`, `rdf-ext`, `shacl-engine`), `fetch`, Vitest (host).

## Global Constraints

- Spec: `docs/superpowers/specs/2026-06-21-proxy-auth-acl-design.md`.
- **(b)** the proxy reads `<container>/.meta` and the shape under the **requester's `Authorization`**; caches must be **auth-keyed** so one requester's authorized read never serves another (spec criterion 4).
- **(a)** ACL writes are **HTTP-native**: `PUT <resource>.acl` with `Content-Type: application/ld+json` (the 415 was `text/turtle`; JSS stores dotfiles as JSON-LD on disk). **No MCP** dependency.
- Public-read ACL = owner `acl:agent <owner-webid>` (Read/Write/Control) + public `acl:agentClass foaf:Agent` (Read).
- The proxy stays **opt-in / fail-open-to-passthrough**: an unreadable/absent `.meta` → treat as unconstrained → pass through (unchanged posture).
- Tests run against a **default owner-only** JSS pod (`make up`, `http://localhost:3838`); proxy on `:3839`. Owner = `alice` / `alicepassword123`; owner bearer + WebID via `POST /idp/credentials`.
- Git commits: `[Agent: Claude]` prefix; trailer `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`; stage specific files, no `git add -A`.

## File Structure

| File | Responsibility |
|---|---|
| `constrained-container/proxy.js` | (b) thread `Authorization` into `.meta`+shape reads; auth-keyed caches |
| `constrained-container/set-acl.mjs` | (a) HTTP helper: `PUT .acl` as `application/ld+json` → public-read |
| `constrained-container/p2.test.mjs` | Vitest: (b) governs protected container; (a) shape public-read |
| `constrained-container/package.json` | add `vitest` devDep + `test` script |
| `constrained-container/vitest.config.js` | include `*.test.mjs` (Vitest 3.x needs explicit include) |
| `constrained-container/README.md` | record (a)/(b) split, accepted JSON-LD ACL form, HTTP-native principle |

---

### Task 1: (b) Proxy reads `.meta`/shape under the requester's auth

Deliverable: on a default owner-only pod, an owner-authenticated non-conforming write to a constrained container through the proxy is rejected (422) and a conforming write is admitted — proven by Vitest.

**Files:**
- Modify: `constrained-container/proxy.js`
- Create: `constrained-container/package.json` (add test tooling), `constrained-container/vitest.config.js`, `constrained-container/p2.test.mjs`

**Interfaces:**
- Produces: proxy at `:3839` → upstream `:3838`; `constrainedBy(container, auth)` and `validatorFor(shapeUrl, auth)` now take the requester's `Authorization` and cache by it.

- [ ] **Step 1: Add test tooling to `constrained-container/package.json`**

The current file has `dependencies` (`n3`, `rdf-ext`, `shacl-engine`) and `scripts.start`. Add a `test` script and a `vitest` devDependency. The result must be:

```json
{
  "name": "constrained-container",
  "private": true,
  "type": "module",
  "description": "Standalone SHACL admission proxy: enforces ldp:constrainedBy on writes in front of any LDP/Solid server (e.g. JSS). Opt-in — unconstrained containers pass through untouched.",
  "scripts": { "start": "node proxy.js", "test": "vitest run" },
  "dependencies": {
    "n3": "^1.17.4",
    "rdf-ext": "^2.5.1",
    "shacl-engine": "^1.0.2"
  },
  "devDependencies": { "vitest": "^3.2.0" }
}
```

Run: `cd constrained-container && npm install`
Expected: installs `vitest`, updates `package-lock.json`.

- [ ] **Step 2: Create `constrained-container/vitest.config.js`**

```javascript
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: { include: ['**/*.test.mjs'], testTimeout: 30000, hookTimeout: 30000, fileParallelism: false },
})
```

- [ ] **Step 3: Write the failing test**

Create `constrained-container/p2.test.mjs`. It sets up a constrained container as the owner (so `.meta` and shape are owner-only by default), then writes through the proxy:

```javascript
import { describe, it, beforeAll, expect } from 'vitest'

const JSS = 'http://localhost:3838'
const PROXY = 'http://localhost:3839'
const POD = { name: 'alice', email: 'alice@example.com', password: 'alicepassword123' }

const SHAPE = `@prefix sh: <http://www.w3.org/ns/shacl#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
@prefix ex: <http://example.org/> .
ex:NoteShape a sh:NodeShape ; sh:targetClass ex:Note ;
  sh:property [ sh:path rdfs:label ; sh:minCount 1 ] .`

const CONFORMING = `@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
@prefix ex: <http://example.org/> .
<#it> a ex:Note ; rdfs:label "ok" .`
const NONCONFORMING = `@prefix ex: <http://example.org/> .
<#it> a ex:Note .`

async function owner() {
  await fetch(`${JSS}/.pods`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(POD) })
  const r = await fetch(`${JSS}/idp/credentials`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: POD.email, password: POD.password }),
  })
  const j = await r.json()
  return { token: j.access_token, webid: j.webid }
}
const auth = t => ({ Authorization: `Bearer ${t}` })

describe('(b) proxy governs a protected constrained container', () => {
  let token
  beforeAll(async () => {
    ;({ token } = await owner())
    // Owner-only constrained container: container, shape, then .meta -> constrainedBy.
    await fetch(`${JSS}/alice/p2/`, { method: 'PUT', headers: { ...auth(token), 'Content-Type': 'text/turtle' }, body: '' })
    await fetch(`${JSS}/alice/p2/shape.ttl`, { method: 'PUT', headers: { ...auth(token), 'Content-Type': 'text/turtle' }, body: SHAPE })
    await fetch(`${JSS}/alice/p2/.meta`, {
      method: 'PUT', headers: { ...auth(token), 'Content-Type': 'text/turtle' },
      body: `<${JSS}/alice/p2/> <http://www.w3.org/ns/ldp#constrainedBy> <${JSS}/alice/p2/shape.ttl> .`,
    })
  })

  it('rejects a non-conforming write (422) through the proxy', async () => {
    const r = await fetch(`${PROXY}/alice/p2/bad.ttl`, {
      method: 'PUT', headers: { ...auth(token), 'Content-Type': 'text/turtle' }, body: NONCONFORMING,
    })
    expect(r.status).toBe(422)
    expect(r.headers.get('link') || '').toContain('constrainedBy')
  })

  it('admits a conforming write through the proxy', async () => {
    const r = await fetch(`${PROXY}/alice/p2/good.ttl`, {
      method: 'PUT', headers: { ...auth(token), 'Content-Type': 'text/turtle' }, body: CONFORMING,
    })
    expect([200, 201, 204, 205]).toContain(r.status)
  })
})
```

- [ ] **Step 4: Run the test — expect failure (proxy still reads unauthenticated)**

Run: `make up` (JSS), then start the CURRENT proxy: `cd constrained-container && (UPSTREAM=http://localhost:3838 PORT=3839 node proxy.js & echo $! > /tmp/cc.pid); sleep 1`
Run: `cd constrained-container && npx vitest run`
Expected: the 422 test FAILS — the proxy's unauthenticated `.meta` read gets 401 on the owner-only container → treats it as unconstrained → the non-conforming write passes through (status 201/205, not 422).
Then: `kill "$(cat /tmp/cc.pid)"`

- [ ] **Step 5: Modify `proxy.js` to forward the requester's `Authorization`**

Make these changes to `constrained-container/proxy.js`:

(i) `constrainedBy` takes `auth`, keys the cache by `(auth, container)`, and sends the header:

```javascript
async function constrainedBy(container, auth) {
  const key = `${auth || ''} ${container}`;
  if (shapeCache.has(key)) return shapeCache.get(key);
  let shape = null;
  try {
    const r = await fetch(`${UPSTREAM}${container}.meta`, {
      headers: { Accept: 'text/turtle', ...(auth ? { Authorization: auth } : {}) },
    });
    if (r.ok) for (const q of dataset(await r.text(), `${UPSTREAM}${container}`))
      if (q.predicate.value === CB) { shape = q.object.value; break; }
  } catch { /* no .meta / unreadable -> unconstrained */ }
  shapeCache.set(key, shape);
  return shape;
}
```

(ii) `validatorFor` takes `auth`, keys the cache by `(auth, shapeUrl)`, and sends the header:

```javascript
async function validatorFor(shapeUrl, auth) {
  const key = `${auth || ''} ${shapeUrl}`;
  if (shapeDsCache.has(key)) return shapeDsCache.get(key);
  const r = await fetch(shapeUrl, {
    headers: { Accept: 'text/turtle', ...(auth ? { Authorization: auth } : {}) },
  });
  const v = new Validator(dataset(await r.text(), shapeUrl), { factory: rdf });
  shapeDsCache.set(key, v);
  return v;
}
```

(iii) In the request handler, capture the incoming auth once and pass it through both call sites:

```javascript
  const isWrite = method === 'PUT' || method === 'POST' || method === 'PATCH';
  const auth = req.headers['authorization'];

  if (isWrite) {
    const shapeUrl = await constrainedBy(containerOf(url, method), auth);
    if (shapeUrl) {
      try {
        const validator = await validatorFor(shapeUrl, auth);
```

(iv) And the container-read advertisement call site:

```javascript
  if (!isWrite && url.endsWith('/')) {
    const sh = await constrainedBy(url, auth);
    if (sh) out['link'] = (out['link'] ? out['link'] + ', ' : '') + `<${sh}>; rel="${CB}"`;
  }
```

- [ ] **Step 6: Run the test — expect pass**

Run: restart the proxy (`cd constrained-container && (UPSTREAM=http://localhost:3838 PORT=3839 node proxy.js & echo $! > /tmp/cc.pid); sleep 1`), then `cd constrained-container && npx vitest run`
Expected: both `(b)` tests PASS — non-conforming → 422 (+ constrainedBy Link), conforming → admitted.
Then: `kill "$(cat /tmp/cc.pid)"`

- [ ] **Step 7: Commit**

```bash
git add constrained-container/proxy.js constrained-container/package.json constrained-container/package-lock.json constrained-container/vitest.config.js constrained-container/p2.test.mjs
git commit -m "$(cat <<'EOF'
[Agent: Claude] p2(b): proxy reads .meta/shape under requester auth

Thread incoming Authorization into constrainedBy()/validatorFor(), auth-keyed
caches (no cross-requester leak). Now governs protected owner-only constrained
containers: non-conforming write -> 422, conforming -> admitted. Vitest proof.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: (a) HTTP ACL provisioning — public-read shapes

Deliverable: a dependency-free helper writes a public-read `.acl` via HTTP `application/ld+json` (no MCP); after running it on the shape, `GET <shape>` with no auth returns 200. The exact accepted JSON-LD ACL form is grounded in JSS's own output.

**Files:**
- Create: `constrained-container/set-acl.mjs`
- Modify: `constrained-container/p2.test.mjs` (add the (a) case)

**Interfaces:**
- Consumes: owner bearer + WebID (Task 1's `owner()` helper pattern).
- Produces: `setPublicReadAcl({ base, resource, ownerWebId, token }) -> Promise<{status, aclUrl}>`.

- [ ] **Step 1: Learn JSS's accepted on-disk ACL JSON-LD (grounding the unknown)**

JSS creates `.acl` files at pod provisioning. Read one to see the exact JSON-LD shape JSS stores, so our write mirrors a form it accepts.

Run (owner token in `$TOK`):
```bash
TOK=$(curl -s -X POST http://localhost:3838/idp/credentials -H 'Content-Type: application/json' \
  -d '{"email":"alice@example.com","password":"alicepassword123"}' | sed -n 's/.*"access_token":"\([^"]*\)".*/\1/p')
curl -s http://localhost:3838/alice/.acl -H "Authorization: Bearer $TOK" -H 'Accept: application/ld+json'; echo
```
Expected: a JSON-LD document with `acl:Authorization` node(s). Note its `@context` form and how `acl:agent`/`acl:mode`/`acl:accessTo` are expressed — the helper's body mirrors this.

- [ ] **Step 2: Write `set-acl.mjs`**

```javascript
// HTTP-native ACL provisioning. Grants public read (foaf:Agent acl:Read) + owner full control
// on a resource, by PUTting <resource>.acl as application/ld+json. JSS stores dotfiles as
// JSON-LD on disk, so text/turtle returns 415 — this uses JSON-LD. No MCP dependency:
// works from any HTTP client (Claude Code CLI, curl, the app). Needs the owner bearer (Control).
const ACL = 'http://www.w3.org/ns/auth/acl#'
const FOAF = 'http://xmlns.com/foaf/0.1/'

export function publicReadAclDoc(resource, ownerWebId) {
  return {
    '@context': { acl: ACL, foaf: FOAF },
    '@graph': [
      {
        '@id': '#owner', '@type': 'acl:Authorization',
        'acl:agent': { '@id': ownerWebId },
        'acl:accessTo': { '@id': resource },
        'acl:default': { '@id': resource },
        'acl:mode': [{ '@id': 'acl:Read' }, { '@id': 'acl:Write' }, { '@id': 'acl:Control' }],
      },
      {
        '@id': '#public', '@type': 'acl:Authorization',
        'acl:agentClass': { '@id': 'foaf:Agent' },
        'acl:accessTo': { '@id': resource },
        'acl:mode': { '@id': 'acl:Read' },
      },
    ],
  }
}

// Discover the resource's ACL URL from its Link rel="acl" header, falling back to <resource>.acl.
async function aclUrl(resource, token) {
  try {
    const h = await fetch(resource, { method: 'HEAD', headers: { Authorization: `Bearer ${token}` } })
    const link = h.headers.get('link') || ''
    const m = link.match(/<([^>]+)>\s*;\s*rel="acl"/i)
    if (m) return new URL(m[1], resource).href
  } catch { /* fall through */ }
  return `${resource}.acl`
}

export async function setPublicReadAcl({ resource, ownerWebId, token }) {
  const url = await aclUrl(resource, token)
  const r = await fetch(url, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/ld+json' },
    body: JSON.stringify(publicReadAclDoc(resource, ownerWebId)),
  })
  return { status: r.status, aclUrl: url, body: r.ok ? '' : await r.text() }
}
```

- [ ] **Step 3: Add the (a) test case to `p2.test.mjs`**

Append this describe block (it reuses `owner`, `JSS`, `auth`, and the `SHAPE` setup written in the same beforeAll — move shape creation into a shared `beforeAll` if needed, or re-create the shape here under a distinct path). Use a dedicated resource to avoid coupling to Task 1's container:

```javascript
import { setPublicReadAcl } from './set-acl.mjs'

describe('(a) HTTP ACL provisioning makes a shape public-read', () => {
  let token, webid
  const shape = `${JSS}/alice/p2/shape.ttl`
  beforeAll(async () => {
    ;({ token, webid } = await owner())
    await fetch(`${JSS}/alice/p2/`, { method: 'PUT', headers: { ...auth(token), 'Content-Type': 'text/turtle' }, body: '' })
    await fetch(shape, { method: 'PUT', headers: { ...auth(token), 'Content-Type': 'text/turtle' }, body: SHAPE })
  })

  it('shape is owner-only before provisioning (unauth GET != 200)', async () => {
    const r = await fetch(shape)
    expect(r.status).not.toBe(200)
  })

  it('writes a public-read .acl via HTTP application/ld+json (no MCP)', async () => {
    const { status, body } = await setPublicReadAcl({ resource: shape, ownerWebId: webid, token })
    expect([200, 201, 204, 205], `acl PUT body: ${body}`).toContain(status)
  })

  it('shape is GET-able unauthenticated after provisioning (200)', async () => {
    const r = await fetch(shape)
    expect(r.status).toBe(200)
  })
})
```

- [ ] **Step 4: Run the (a) suite**

Run: `make up`, then `cd constrained-container && npx vitest run` (the proxy need not be running for the (a) cases — they hit JSS directly).
Expected: all three (a) cases PASS — owner-only before, ACL PUT accepted (2xx), public GET 200 after.
If the ACL PUT is rejected (4xx), read the failing `body` (surfaced in the assertion message) and the Step-1 reference doc, adjust `publicReadAclDoc`'s JSON-LD to match JSS's accepted form, and re-run. Do not commit until the three (a) cases are green.

- [ ] **Step 5: Commit**

```bash
git add constrained-container/set-acl.mjs constrained-container/p2.test.mjs
git commit -m "$(cat <<'EOF'
[Agent: Claude] p2(a): HTTP-native ACL provisioning for public-read shapes

set-acl.mjs PUTs <resource>.acl as application/ld+json (no MCP) granting
foaf:Agent acl:Read + owner control; Link rel=acl discovery with <resource>.acl
fallback. Proven: owner-only shape -> public GET 200 after provisioning.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: README + FOLLOWUP

Deliverable: `constrained-container/README.md` records the (a)/(b) resolution and the accepted JSON-LD ACL form; `FOLLOWUP.md` open item 2 is marked resolved.

**Files:**
- Modify: `constrained-container/README.md`, `FOLLOWUP.md`

- [ ] **Step 1: Update `constrained-container/README.md`**

Replace the "Note on JSS (2026-06-21)" section with a resolved note:

```markdown
## Note on JSS (2026-06-21, resolved P2)

The proxy now reads `.meta` and the shape under the **requester's `Authorization`** (auth-keyed
caches), so it governs **protected owner-only constrained containers** — not just public ones.
Shapes are made **public-read** via `set-acl.mjs`, an HTTP-native helper that `PUT`s
`<resource>.acl` as **`application/ld+json`** (the earlier 415 was `text/turtle`; JSS stores
dotfiles as JSON-LD on disk). No MCP dependency — works from any HTTP client (Claude Code CLI,
curl, the app). Accepted ACL form: WAC in JSON-LD with `acl:agent`/`acl:agentClass foaf:Agent`,
`acl:mode acl:Read|Write|Control`, `acl:accessTo`/`acl:default`; the `.acl` URL is discovered via
`Link: rel="acl"` (falls back to `<resource>.acl`).

**Edge case:** an agent with write-but-not-read on a container's `.meta` cannot have the constraint
discovered under its own auth (the `.meta` stays owner-only by design). Acceptable for the
owner-centric memory-pod model.
```

- [ ] **Step 2: Update `FOLLOWUP.md` open item 2**

In `FOLLOWUP.md`, find open item 2 (the `L2 admission floor harness` / constraint-read auth item) and append a resolution line to it:

```
   **Resolved (P2, 2026-06-21):** proxy forwards the requester's Authorization on `.meta`/shape
   reads (governs protected containers); `constrained-container/set-acl.mjs` provisions public-read
   shapes via HTTP `application/ld+json` `.acl` PUT (no MCP). See `constrained-container/README.md`.
```

- [ ] **Step 3: Verify the full P2 suite green from a clean start**

Run: `make up`, start the proxy (`cd constrained-container && (UPSTREAM=http://localhost:3838 PORT=3839 node proxy.js & echo $! > /tmp/cc.pid); sleep 1`), then `cd constrained-container && npx vitest run`; finally `kill "$(cat /tmp/cc.pid)"`.
Expected: all (b) and (a) cases pass.

- [ ] **Step 4: Commit**

```bash
git add constrained-container/README.md FOLLOWUP.md
git commit -m "$(cat <<'EOF'
[Agent: Claude] p2: docs — resolved note + FOLLOWUP open item 2

README records the (a)/(b) resolution, accepted JSON-LD ACL form, HTTP-native
principle, and the write-but-not-read .meta edge case. FOLLOWUP item 2 resolved.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Self-Review

**Spec coverage:**
- (b) requester-auth on `.meta`+shape reads, governs protected containers → Task 1 ✓
- (b) auth-keyed caches (criterion 4) → Task 1 Step 5 (i)/(ii) cache keys include `auth` ✓
- (a) HTTP `ld+json` `.acl` PUT, public-read shapes, no MCP → Task 2 ✓
- (a) accepted JSON-LD ACL form recorded (criterion 3) → Task 2 Step 1 grounding + README (Task 3) ✓
- `Link: rel="acl"` fallback → `set-acl.mjs` `aclUrl()` ✓
- fail-open-to-passthrough retained → `constrainedBy` still returns null on unreadable `.meta` ✓
- edge case (write-but-not-read `.meta`) documented → Task 3 README ✓
- Acceptance criteria 1-4 → Tasks 1 (1), 2 (2,3), 1-Step5 (4) ✓
- Out of scope (Type Index, MCP write_acl, sidecar merge) → none introduced ✓

**Placeholder scan:** none. Task 2 Step 4 has an investigative branch (adjust JSON-LD if JSS rejects it) — this is the spec's named (a) unknown, with concrete grounding (Step 1 reads JSS's own `.acl`) and a concrete failure surface (the assertion prints the rejection body), not a placeholder.

**Type consistency:** `setPublicReadAcl({ resource, ownerWebId, token })` defined in Task 2 Step 2 and called with those exact keys in Step 3; `owner()` returns `{ token, webid }` used consistently; `constrainedBy(container, auth)` / `validatorFor(shapeUrl, auth)` signatures match their call sites in Step 5 (iii)/(iv). Proxy `:3839`, JSS `:3838` consistent throughout.

**Note:** Task 2's (a) tests hit JSS directly (no proxy needed); Task 1's (b) tests need the proxy running. The Task 3 Step 3 full-suite run starts the proxy so both pass together.
