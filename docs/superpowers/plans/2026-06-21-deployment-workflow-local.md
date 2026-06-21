# Local Deployment Rung Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate the JSS eval scaffolding into the local rung of a base+override deployment workflow, with a Vitest integration suite as the verification gate.

**Architecture:** Approach A — one base compose file (`docker-compose.yml`) holds the env-neutral `jss` service; a local override (`docker-compose.local.yml`) adds the host port + a `./data` bind-mount; per-env values come from `.env.local` (gitignored). Make targets wrap the `-f base -f local --env-file` stack. The bash `smoke.sh` is archived and replaced by a Vitest e2e suite that hits a running pod over HTTP.

**Tech Stack:** Docker Compose, GNU Make, JSS 0.0.209 (pinned), Node 22, Vitest, `fetch`.

## Global Constraints

- JSS version pinned to **0.0.209** (build arg `JSS_VERSION`, default `0.0.209`).
- Base compose carries **no env-specific values** — no `ports`, no host paths, no `container_name`. Those live only in overrides. A reviewer must be able to see `.dev.yml`/`.prod.yml` would only *add*, never *edit*, the base.
- Local stays **http** on host port `${JSS_HOST_PORT:-3838}`. No Caddy, no TLS locally.
- Tests are **black-box e2e** against a running pod via `BASE` (default `http://localhost:3838`). No JSS internals, no testcontainers. `make test` assumes `make up` has run.
- LWS-CID self-signed auth is **out of scope** (blocked locally by `blockPrivateIPs`); the headless RS256 bearer path is the local credential.
- TLS/LWS-CID eval artifacts (`docker-compose.tls.yml`, `cert`/`up-tls`/`down-tls`/`cid-tls`, `experiments/headless-cid/`) stay **unchanged**.
- Git commits: `[Agent: Claude]` prefix; trailer `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`; stage specific files (no `git add -A`).

## File Structure

| File | Responsibility |
|---|---|
| `docker-compose.yml` | base — env-neutral `jss` service (build, image, healthcheck, restart) |
| `docker-compose.local.yml` | local override — host port + `./data` bind-mount + container name |
| `.env.example` | committed template of the knobs (`JSS_VERSION`, `JSS_HOST_PORT`) |
| `.env.local` | real local values (gitignored) |
| `.gitignore` | add `.env.local` |
| `Makefile` | local targets (`up/down/logs/reset/test/shell/build`) over the stack; TLS targets preserved |
| `package.json` | project's first; `type: module`, `test` script, vitest dev-dep |
| `vitest.config.mjs` | include `tests/**/*.test.mjs`, serial files, 30s timeouts |
| `tests/helpers.mjs` | `BASE`, `POD`, `ensurePod()`, `getToken()` |
| `tests/lifecycle.test.mjs` | reachability, pod create, headless bearer, write/read, conneg |
| `tests/agent-surface.test.mjs` | MCP initialize + tools/list, CID-shaped profile, git push |
| `experiments/smoke.sh` | archived bash probe (moved from repo root) |

---

### Task 1: Local stack (base + override + .env + Makefile)

Deliverable: `make up` boots a reachable local pod from the base+override stack; `./data` shows pod files on the host; `make down/logs/reset/shell` work.

**Files:**
- Create: `docker-compose.local.yml`, `.env.example`, `.env.local`
- Modify: `docker-compose.yml` (refactor to base), `.gitignore`, `Makefile`
- Keep: `Dockerfile` (unchanged)

**Interfaces:**
- Produces: a compose stack reachable at `http://localhost:${JSS_HOST_PORT:-3838}`; service name `jss`; make targets `up/down/logs/reset/test/shell/build`.

- [ ] **Step 1: Refactor `docker-compose.yml` to the env-neutral base**

Replace the entire file with:

```yaml
# Base service definition, shared across all environments. Carries nothing
# env-specific — ports, volumes, and container_name live in the per-env override
# (docker-compose.local.yml today; .dev.yml / .prod.yml later). The run flags are
# baked into the image CMD (see Dockerfile).
services:
  jss:
    build:
      context: .
      args:
        JSS_VERSION: "${JSS_VERSION:-0.0.209}"
    image: "lws-pod:${JSS_VERSION:-0.0.209}"
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "node", "-e", "fetch('http://localhost:3000/').then(r=>process.exit(r.status<500?0:1)).catch(()=>process.exit(1))"]
      interval: 10s
      timeout: 5s
      retries: 5
      start_period: 10s
```

- [ ] **Step 2: Create `docker-compose.local.yml`**

```yaml
# Local development override: http on a host port, data bind-mounted to ./data
# so the git-backed pod files (LDP containers + git repos) are inspectable on the host.
services:
  jss:
    container_name: lws-pod-local
    ports:
      - "${JSS_HOST_PORT:-3838}:3000"
    volumes:
      - ./data:/data
```

- [ ] **Step 3: Create `.env.example`**

```bash
# Copy to .env.local and adjust. The make targets read it via --env-file .env.local.
JSS_VERSION=0.0.209
JSS_HOST_PORT=3838
```

- [ ] **Step 4: Create `.env.local`** (same contents as `.env.example` for now)

```bash
JSS_VERSION=0.0.209
JSS_HOST_PORT=3838
```

- [ ] **Step 5: Add `.env.local` to `.gitignore`**

Append this line to `.gitignore` (it currently has `data/`, `node_modules/`, `render/out/`, `*.log`, `.DS_Store`, `certs/`):

```
.env.local
```

- [ ] **Step 6: Refactor the `Makefile`**

Replace the top section (everything from the first line through the `shell:` target) with the block below. **Keep the existing TLS section** (`TLS_HOST ?= ...` through `cid-tls:`) verbatim after it.

```makefile
ENV  ?= local
BASE ?= http://localhost:3838
COMPOSE = docker compose --env-file .env.$(ENV) -f docker-compose.yml -f docker-compose.$(ENV).yml

.PHONY: build up down logs reset test shell cert up-tls down-tls cid-tls

build:
	$(COMPOSE) build

up:
	$(COMPOSE) up -d --build
	@echo "JSS ($(ENV)) up at $(BASE)  (logs: make logs)"

down:
	$(COMPOSE) down

logs:
	$(COMPOSE) logs -f

# Fresh pod: stop, wipe the bind-mounted ./data, rebuild, restart.
# (On Linux, ./data may be root-owned by the container — use sudo if rm fails.)
reset:
	$(COMPOSE) down
	rm -rf ./data
	$(COMPOSE) up -d --build
	@echo "JSS ($(ENV)) reset + up at $(BASE)"

# The local verification gate — Vitest e2e against the running pod (Task 2-3).
test:
	BASE=$(BASE) npm test

shell:
	$(COMPOSE) exec jss bash
```

- [ ] **Step 7: Bring the stack up**

Run: `make up`
Expected: builds the image and prints `JSS (local) up at http://localhost:3838`.

- [ ] **Step 8: Verify the pod is reachable and data is on disk**

Run: `curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3838/`
Expected: a non-`000` HTTP code (e.g. `200`).

Run: `ls data/`
Expected: JSS pod scaffolding present on the host (non-empty directory).

- [ ] **Step 9: Verify `down` and re-`up` keep data (bind-mount persistence)**

Run: `make down && make up && ls data/`
Expected: `data/` still populated (bind-mount survives a down/up).

- [ ] **Step 10: Commit**

```bash
git add docker-compose.yml docker-compose.local.yml .env.example .gitignore Makefile
git commit -m "$(cat <<'EOF'
[Agent: Claude] deploy(local): base+override compose stack + make targets

Approach A local rung: env-neutral base + docker-compose.local.yml (http,
./data bind-mount). Make targets wrap the -f stack + --env-file .env.local.
TLS/LWS-CID eval targets preserved.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

(`.env.local` is intentionally not staged — it's gitignored.)

---

### Task 2: Vitest harness + lifecycle suite

Deliverable: `make test` runs Vitest green for reachability, pod-create, headless bearer, write/read, and conneg against the running local pod.

**Files:**
- Create: `package.json`, `vitest.config.mjs`, `tests/helpers.mjs`, `tests/lifecycle.test.mjs`

**Interfaces:**
- Consumes: a running pod at `BASE` (from Task 1).
- Produces: `tests/helpers.mjs` exporting `BASE` (string), `POD` (`{name,email,password}`), `ensurePod(pod?) -> Promise<number>` (HTTP status), `getToken(pod?) -> Promise<{token,webid}>`. Task 3 imports these.

Note: these are characterization tests of a known-working server — the meaningful red phase is the harness bootstrap (vitest not yet installed), not endpoint failure.

- [ ] **Step 1: Write `tests/helpers.mjs`**

```javascript
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
```

- [ ] **Step 2: Write `tests/lifecycle.test.mjs`**

```javascript
import { describe, it, beforeAll, expect } from 'vitest'
import { BASE, ensurePod, getToken } from './helpers.mjs'

describe('pod lifecycle', () => {
  let token, webid
  beforeAll(async () => {
    await ensurePod()
    ;({ token, webid } = await getToken())
  })

  it('server is reachable', async () => {
    const r = await fetch(`${BASE}/`)
    expect(r.status).toBeLessThan(500)
  })

  it('creates the pod (or it already exists)', async () => {
    const status = await ensurePod()
    expect([200, 201, 409]).toContain(status)
  })

  it('issues a headless bearer + webid', async () => {
    expect(token).toBeTruthy()
    expect(webid).toMatch(/^https?:\/\//)
  })

  it('writes and reads a resource as the agent', async () => {
    const url = `${BASE}/alice/notes/hello.ttl`
    const put = await fetch(url, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'text/turtle' },
      body: '<#it> <http://www.w3.org/2000/01/rdf-schema#label> "hello from an agent" .',
    })
    expect([200, 201, 204, 205]).toContain(put.status)

    const get = await fetch(url, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/ld+json' },
    })
    expect(get.status).toBe(200)
    expect(await get.text()).toContain('hello from an agent')
  })

  it('content-negotiates to turtle', async () => {
    const r = await fetch(`${BASE}/alice/notes/hello.ttl`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'text/turtle' },
    })
    expect(r.status).toBe(200)
    expect(r.headers.get('content-type')).toMatch(/text\/turtle/)
  })
})
```

- [ ] **Step 3: Create `vitest.config.mjs`**

```javascript
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['tests/**/*.test.mjs'],
    testTimeout: 30000,
    hookTimeout: 30000,
    fileParallelism: false, // shared pod state — run test files serially
  },
})
```

- [ ] **Step 4: Create `package.json` and install vitest**

Create `package.json`:

```json
{
  "name": "lws-pod",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "vitest run"
  }
}
```

Then run: `npm install -D vitest`
Expected: populates `devDependencies.vitest`, writes `package-lock.json`, creates `node_modules/` (already gitignored).

- [ ] **Step 5: Run the suite — expect green against the running pod**

Run: `make up` (ensure the pod is up), then `make test`
Expected: all `pod lifecycle` tests PASS. (If vitest were missing, `npm test` would fail at Step 4 — that is the harness red phase.)

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json vitest.config.mjs tests/helpers.mjs tests/lifecycle.test.mjs
git commit -m "$(cat <<'EOF'
[Agent: Claude] test(local): Vitest harness + pod lifecycle suite

Black-box e2e against a running pod: reachability, pod create, headless RS256
bearer, authenticated write/read, turtle conneg. make test is the local gate.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Agent-surface suite (MCP, profile, git push)

Deliverable: the full Vitest suite (lifecycle + agent surfaces) is green; `make test` covers MCP, CID-shaped profile, and the git-push → retrievable-resource path.

**Files:**
- Create: `tests/agent-surface.test.mjs`

**Interfaces:**
- Consumes: `BASE`, `ensurePod`, `getToken` from `tests/helpers.mjs` (Task 2).

- [ ] **Step 1: Write `tests/agent-surface.test.mjs`**

```javascript
import { describe, it, beforeAll, expect } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { BASE, ensurePod, getToken } from './helpers.mjs'

const hasGit = (() => {
  try { execFileSync('git', ['--version'], { stdio: 'ignore' }); return true } catch { return false }
})()

describe('agent surfaces', () => {
  let token
  beforeAll(async () => {
    await ensurePod()
    ;({ token } = await getToken())
  })

  async function mcp(body) {
    const r = await fetch(`${BASE}/mcp`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    return r.json()
  }

  it('MCP initialize returns a jsonrpc result', async () => {
    const j = await mcp({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} })
    expect(j.jsonrpc).toBe('2.0')
    expect(j.error).toBeUndefined()
    expect(j.result).toBeTruthy()
  })

  it('MCP tools/list returns a non-empty tool set', async () => {
    const j = await mcp({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} })
    expect(Array.isArray(j.result?.tools)).toBe(true)
    expect(j.result.tools.length).toBeGreaterThan(0)
  })

  it('serves a CID-shaped profile', async () => {
    const r = await fetch(`${BASE}/alice/profile/card`, { headers: { Accept: 'application/ld+json' } })
    expect(r.status).toBe(200)
    expect(await r.text()).toMatch(/cid|controller/i)
  })

  it.skipIf(!hasGit)('git push materializes a retrievable resource', async () => {
    const repo = `alice/gitprobe-${process.pid}-${Date.now()}`
    const dir = mkdtempSync(join(tmpdir(), 'gitprobe-'))
    try {
      const git = (...a) => execFileSync('git', a, { cwd: dir, stdio: 'pipe' })
      git('init', '-q')
      git('config', 'user.email', 'a@b.c')
      git('config', 'user.name', 'probe')
      writeFileSync(join(dir, 'pushed.ttl'),
        '<#g> <http://www.w3.org/2000/01/rdf-schema#label> "from git push" .\n')
      git('add', 'pushed.ttl')
      git('commit', '-qm', 'probe')
      git('-c', `http.extraHeader=Authorization: Bearer ${token}`,
          'push', `${BASE}/${repo}`, 'HEAD:refs/heads/main')

      const got = await fetch(`${BASE}/${repo}/pushed.ttl`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      expect(got.status).toBe(200)
      expect((await got.text()).length).toBeGreaterThan(0)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
```

- [ ] **Step 2: Run the full suite**

Run: `make test`
Expected: both files green — `pod lifecycle` + `agent surfaces`. The git test runs if `git` is on PATH (it is on the host), otherwise it is skipped (reported, not failed).

- [ ] **Step 3: Commit**

```bash
git add tests/agent-surface.test.mjs
git commit -m "$(cat <<'EOF'
[Agent: Claude] test(local): agent-surface suite (MCP, profile, git push)

MCP initialize + tools/list, CID-shaped profile, git push -> retrievable
resource. Completes the smoke.sh -> Vitest port for the local gate.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Archive `smoke.sh` + refresh docs

Deliverable: `smoke.sh` lives under `experiments/`, no `make` target references it, and the active docs point at `make test` / the new location.

**Files:**
- Move: `smoke.sh` → `experiments/smoke.sh`
- Modify: `README.md`, `FOLLOWUP.md`, `docs/foundations/05-jss-spec-conformance.md`

**Interfaces:**
- Consumes: the `make test` gate from Tasks 2-3.

- [ ] **Step 1: Move the script (preserve history)**

```bash
git mv smoke.sh experiments/smoke.sh
```

- [ ] **Step 2: Confirm no `make` target references it**

Run: `grep -n smoke Makefile`
Expected: no output (the `smoke` target was removed in Task 1; only `test` remains).

- [ ] **Step 3: Update `README.md`**

- Line ~17: change `make smoke     # boot -> pod ...` to:
  `make test      # Vitest e2e: pod create -> headless token -> write/read -> MCP -> git`
- Line ~38: change the `smoke.sh` bullet to:
  `` - `tests/` — Vitest integration suite (the local verification gate; `make test`). ``
  `` - `experiments/smoke.sh` — archived eval probe (superseded; evidence in the conformance map). ``
- Line ~59: change `live probes in `smoke.sh` and ...` to `live probes in `experiments/smoke.sh` and `experiments/headless-cid/`.`

- [ ] **Step 4: Update `FOLLOWUP.md`**

- Line ~13: `smoke.sh` (steps 7-11) → `experiments/smoke.sh` (steps 7-11)
- Line ~20: `**`smoke.sh`** extended with the 5 live tests.` → `**`experiments/smoke.sh`** (archived) carried the 5 live tests; now ported to the Vitest suite (`make test`).`

- [ ] **Step 5: Update the forward-looking line in the conformance map**

In `docs/foundations/05-jss-spec-conformance.md`, line ~214: change `Run `make smoke` (`smoke.sh` steps 7-11) and ...` to:
`Run `make test` (Vitest suite) and `bash experiments/smoke.sh` (the archived probe, steps 7-11) and `experiments/headless-cid/` against a booted pod.`

Leave the dated provenance citations ("Verified live (2026-06-20, `smoke.sh` step N)") unchanged — they record what was run on that date.

- [ ] **Step 6: Sanity-check the archived script still runs**

Run: `make up && BASE=http://localhost:3838 bash experiments/smoke.sh | tail -3`
Expected: it prints its probe output and the final `done — ...` line (still works from the new path).

- [ ] **Step 7: Commit**

```bash
git add experiments/smoke.sh README.md FOLLOWUP.md docs/foundations/05-jss-spec-conformance.md
git commit -m "$(cat <<'EOF'
[Agent: Claude] docs: archive smoke.sh -> experiments/, point docs at make test

Eval probe retired as the verification path (job done; evidence in the
conformance map). Vitest is the local gate now. Dated provenance citations left
intact.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Self-Review

**Spec coverage:**
- Base+override compose, `.env`, bind-mount, http:3838 → Task 1 ✓
- Make targets (`up/down/logs/reset/test/shell`) → Task 1 ✓
- Vitest suite, ported coverage (lifecycle, conneg, MCP, git, profile) → Tasks 2-3 ✓
- smoke.sh archived, no make ref, docs refreshed → Task 4 ✓
- TLS/LWS-CID eval artifacts untouched → preserved in Task 1 Step 6 (TLS section kept) ✓
- Acceptance criteria 1-7 → covered across Tasks 1-4 ✓

**Placeholder scan:** none — every step has concrete file content or an exact command.

**Type consistency:** `ensurePod()`/`getToken()`/`BASE`/`POD` defined in Task 2 Step 1 and consumed identically in Task 3 Step 1; `getToken` returns `{token, webid}` and both consumers destructure those names. Compose service name `jss` used consistently in base, override, and `make shell`.

**Note on persistence test:** smoke.sh step 10 (survives-restart) is not ported — it requires a down/up cycle mid-test, which doesn't fit a single e2e run. The bind-mount persistence check lives in Task 1 Step 9 (manual) instead. Acceptable; flagged in the spec.
