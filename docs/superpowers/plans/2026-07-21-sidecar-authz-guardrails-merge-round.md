# Sidecar Authz + Guardrails + Upstream 0.0.219 Merge — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close three confirmed sidecar privilege-escalation paths, merge upstream's 23 commits
(v0.0.210 → v0.0.219) including their WAC fix, and make a pod's deployed capability state explicit
to the coding agent that deploys it.

**Architecture:** One round across two repos. Rig guardrails land **first** so the live gates
become trustworthy before they are used to verify a security fix — today 37 `skipIf` sites across
20 gate files go green by skipping on a degraded pod. Then the security remediation (fork), then
the upstream merge (fork), then the boot report (fork, sequenced after the merge to stay out of
`server.js`'s conflict surface), then rig verification.

**Tech Stack:** Node 22, Fastify, vitest (rig gates), `node --test` (fork suite), hurl (deploy
check), Docker Compose, Caddy TLS.

**Specs:** `docs/superpowers/specs/2026-07-21-sidecar-authz-and-upstream-merge-design.md`,
`docs/superpowers/specs/2026-07-21-deployment-guardrails-design.md`.

## Global Constraints

- **Two repos.** RIG = `/Users/cvardema/dev/git/LA3D/agents/lws-pod`. FORK =
  `/Users/cvardema/dev/git/LA3D/JavaScriptSolidServer`, branch `la3d/lws` (tip `c0bc445`).
- **Fork commit style:** `[Agent: Claude] type(scope): subject`, trailer
  `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`. Never `git add -A`.
- **Fork test command:** `npm test` = `node --test --test-concurrency=1 --test-force-exit 'test/*.test.js'`.
- **No CI exists** in either repo. All verification is local.
- **Every regression test must be observed FAILING before its fix is written.** A guard test never
  seen red proves nothing (spec §5). Task 5 exists solely to satisfy this for the security fix: it
  reproduces all three exploits and is RED on the branch until Task 6 lands.
- **Three verification layers for the auth boundary**, all required:
  1. Task 5 integration (`startLwsPod` + `callTool` + `request`) — proves the exploit is real and
     that the guard stops it end-to-end. Asserts refusal **and** sidecar absence, because a tool
     can return an error after having already written the file.
  2. Task 6 unit (injected `checkAccessFn`) — proves the mode decision per suffix and
     create-vs-update. Fast inner loop.
  3. Phase E live `test-mcp-v2` — proves the guard survives the real container + TLS stack.
- **Guards fail closed.** Absent WebID + not explicitly internal ⇒ deny.
- **Loud, never fatal** for boot report (L2) and deploy check (L4). The only permitted red is the
  vitest capability gate (Task 4).
- **`--lws`-off byte-identity is deliberately broken** by Task 6 only, scoped to aux-suffix write
  refusals (spec §3).
- Fork base for the merge: `git merge-base la3d/lws upstream/gh-pages` = `0f4287f` (v0.0.210).
  Upstream target: `0976f3e` (v0.0.219).

## File Structure

**RIG (lws-pod)**
- Modify `Dockerfile.fork` — remove stale CMD (Task 1)
- Create `rig/capabilities.fork-tls.json`, `rig/capabilities.local.json` — expected capability sets (Task 2)
- Create `rig/capabilities.hurl` — report-only deploy check (Task 3)
- Modify `Makefile` — wire `capcheck` into `up` / `up-fork-tls` (Task 3)
- Create `tests/capabilities.test.mjs` — manifest-vs-actual, **fails** on mismatch (Task 4)
- Modify `tests/helpers.mjs` — add `loadManifest()`, `probeCapabilities()` (Task 4)
- Modify `Dockerfile.fork`, `docker-compose.fork-tls.yml` — repin (Task 13)

**FORK (JavaScriptSolidServer)**
- Modify `src/lws/write.js` — choke-point guard in `applyLwsWrite` (Task 6)
- Modify `src/mcp/tools.js` — per-surface guards in `write_resource`, `create_resource` (Task 7)
- Modify all 7 `applyLwsWrite` call sites — thread `agentWebId` (Task 6)
- Create `test/sidecar-authz.test.js` — exploit reproduction, RED first (Task 5); unit cases
  appended by Tasks 6 and 10
- Create `src/lws/capability-report.js` — boot ledger (Task 12)
- Modify `src/server.js` — one call site for the report (Task 12)

---

## Phase A — Rig guardrails (RIG only, no fork code)

### Task 1: Remove the stale `Dockerfile.fork` CMD

`Dockerfile.fork`'s CMD lacks `--idp-issuer` and `--lws-config`, so `docker run` without compose
yields a different pod than `make up-fork-tls` — and a missing `--lws-config` means LWS service
pointers are silently off. Compose always supplies `command:`, so the CMD is dead weight. The base
`Dockerfile`'s CMD is **load-bearing** (`docker-compose.local.yml` never overrides `command`) and
must NOT be touched.

**Corrected 2026-07-21:** an earlier draft of this task also claimed the CMD carried
`--mashlib-cdn`. It does not — that was dropped in the PROF/conneg round, and the drafting read
predated the rig pull. Notably, that round updated the CMD's mashlib flag while leaving it missing
`--idp-issuer`/`--lws-config`: a partial update to duplicated config, which is the exact failure
this task removes.

**Files:**
- Modify: `Dockerfile.fork` (final CMD block)

**Interfaces:**
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Confirm the drift before changing anything**

Run:
```bash
cd /Users/cvardema/dev/git/LA3D/agents/lws-pod
grep -A3 '^CMD' Dockerfile.fork
grep -n 'command:' -A6 docker-compose.fork-tls.yml
```
Expected: `Dockerfile.fork`'s CMD has **no** `--lws-config` and **no** `--idp-issuer`, while
compose's `command:` has both. Neither carries `--mashlib-cdn`. That difference is the drift this
task removes. If the two flag sets are identical, STOP and report — the premise is gone.

- [ ] **Step 2: Replace CMD with a loud refusal**

Replace the `CMD [...]` block at the end of `Dockerfile.fork` with:

```dockerfile
# No default CMD by design (2026-07-21 guardrails round). The flag set is defined in exactly ONE
# place — docker-compose.fork-tls.yml `command:`. A default here drifted stale (missing
# --idp-issuer and --lws-config for rounds, so LWS service pointers came up silently off), and
# `docker run` produced a different pod than `make up-fork-tls`. Fail loudly instead.
CMD ["sh", "-c", "echo '[lws-pod] This image has no default command. Start it via: make up-fork-tls (docker-compose.fork-tls.yml supplies the flag set). See docs/superpowers/specs/2026-07-21-deployment-guardrails-design.md' >&2; exit 64"]
```

- [ ] **Step 3: Verify compose still starts the pod**

Run:
```bash
docker compose -f docker-compose.fork-tls.yml up -d --build 2>&1 | tail -5
docker inspect -f '{{.State.Health.Status}}' lws-pod-fork
```
Expected: `healthy` (may take ~15s; re-run the inspect if `starting`).

- [ ] **Step 4: Verify the bare image now refuses loudly**

Run:
```bash
docker run --rm lws-pod:fork-conformance; echo "exit=$?"
```
Expected: the `[lws-pod] This image has no default command…` message on stderr and `exit=64`.

- [ ] **Step 5: Commit**

```bash
git add Dockerfile.fork
git commit -m "$(cat <<'EOF'
[Agent: Claude] fix(rig): single source of truth for the fork pod flag set

Dockerfile.fork's CMD lacked --idp-issuer and --lws-config, so `docker run`
without compose produced a materially different pod than `make up-fork-tls` —
and a missing --lws-config means LWS service pointers come up silently off.
Compose always overrides `command:`, so the CMD was dead weight. Replaced with
a loud exit 64 naming the supported start path.

Notably a prior round updated this CMD (dropping --mashlib-cdn) without adding
the flags compose had carried for rounds — a partial update to duplicated
config, which is the failure this change removes.

Base Dockerfile CMD is load-bearing (docker-compose.local.yml does not
override command) and is deliberately unchanged.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Capability manifests

The artifact that has been missing: a written statement of what each rig is supposed to expose.
Consumed by Task 3 (hurl) and Task 4 (vitest), so exactly one place changes per rig.

**Files:**
- Create: `rig/capabilities.fork-tls.json`
- Create: `rig/capabilities.local.json`

**Interfaces:**
- Produces: JSON with keys `rig`, `base`, `cacert` (optional), `capabilities` (object of
  `string -> boolean`), `storages` (array of string). Task 4's `loadManifest(base)` selects by
  matching `base`.

- [ ] **Step 1: Create the fork-tls manifest**

```json
{
  "rig": "fork-tls",
  "base": "https://pod.vardeman.me",
  "cacert": "certs/rootCA.pem",
  "capabilities": {
    "lwsEnabled": true,
    "serverIndex": true,
    "multiTenant": true,
    "typeIndexService": true,
    "typeSearchService": true,
    "mcpService": true,
    "voidService": true,
    "perStorageServices": true,
    "notifications": true,
    "git": true,
    "mashlibCdn": false
  },
  "storages": ["alice", "bob"]
}
```

- [ ] **Step 2: Create the local manifest**

`lws-pod-local` runs **stock upstream `javascript-solid-server@0.0.209` from npm** — not our fork.
It has no LWS at all, and that is correct, not degraded.

```json
{
  "rig": "local",
  "base": "http://localhost:3838",
  "cacert": null,
  "capabilities": {
    "lwsEnabled": false,
    "serverIndex": false,
    "multiTenant": false,
    "typeIndexService": false,
    "typeSearchService": false,
    "mcpService": true,
    "voidService": false,
    "perStorageServices": false,
    "notifications": true,
    "git": true,
    "mashlibCdn": true
  },
  "storages": []
}
```

- [ ] **Step 3: Validate both parse**

Run:
```bash
cd /Users/cvardema/dev/git/LA3D/agents/lws-pod
for f in rig/capabilities.*.json; do python3 -m json.tool "$f" >/dev/null && echo "OK $f"; done
```
Expected: `OK rig/capabilities.fork-tls.json` and `OK rig/capabilities.local.json`.

- [ ] **Step 4: Commit**

```bash
git add rig/capabilities.fork-tls.json rig/capabilities.local.json
git commit -m "$(cat <<'EOF'
[Agent: Claude] feat(rig): capability manifests for both pod rigs

Declares what each deployment is SUPPOSED to expose — the statement of intent
that was missing, and the reason a degraded pod could not be distinguished
from a correct one. Consumed by the hurl deploy check and the vitest gate.

local rig is stock upstream 0.0.209 from npm (no LWS, correctly); fork-tls is
our fork with the full --lws surface.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Report-only hurl deploy check

Renders a **verdict, not a dump** — expected vs actual, with explicit mismatch lines — so an agent
can act on it without already knowing the right answer. Exits 0 always (spec decision 1).

**Files:**
- Create: `rig/capabilities.hurl`
- Create: `scripts/capcheck.sh`
- Modify: `Makefile` (add `capcheck` target; call it from `up` and `up-fork-tls`)

**Interfaces:**
- Consumes: `rig/capabilities.<rig>.json` from Task 2.
- Produces: `make capcheck RIG=fork-tls|local`, always exit 0.

- [ ] **Step 1: Write the hurl assertions**

Create `rig/capabilities.hurl`. Hurl has no conditional skip — that is the point.

```hurl
# Capability probe for the fork-tls rig. Report-only: run via scripts/capcheck.sh, which
# captures results and never propagates a non-zero exit. Variables come from --variable.
GET {{base}}/.well-known/lws-storage
Accept: application/lws+json
HTTP 200
[Asserts]
jsonpath "$.type" == "ServerIndex"
jsonpath "$.service[?(@.type=='TypeIndexService')]" count == 1
jsonpath "$.service[?(@.type=='TypeSearchService')]" count == 1
jsonpath "$.service[?(@.type=='McpService')]" count == 1

GET {{base}}/alice/lws-storage
Accept: application/lws+json
HTTP 200
[Asserts]
jsonpath "$.service[?(@.type=='TypeIndexService')]" count == 1
jsonpath "$.service[?(@.type=='TypeSearchService')]" count == 1
jsonpath "$.service[?(@.type=='VoidService')]" count == 1

GET {{base}}/mcp
HTTP *
[Asserts]
status < 500
```

- [ ] **Step 2: Write the report wrapper**

Create `scripts/capcheck.sh` (mode 755):

```bash
#!/usr/bin/env bash
# Report-only capability check. NEVER exits non-zero (guardrails spec, decision 1):
# a deploy is never blocked; the agent reads the verdict. The red lives in
# tests/capabilities.test.mjs instead.
set -u
RIG="${RIG:-fork-tls}"
MANIFEST="rig/capabilities.${RIG}.json"
[ -f "$MANIFEST" ] || { echo "[lws-pod] capcheck: no manifest $MANIFEST — skipping"; exit 0; }

BASE=$(python3 -c "import json;print(json.load(open('$MANIFEST'))['base'])")
CACERT=$(python3 -c "import json;print(json.load(open('$MANIFEST')).get('cacert') or '')")
ARGS=(--variable "base=$BASE" --test --no-color)
[ -n "$CACERT" ] && ARGS+=(--cacert "$CACERT")

echo "[lws-pod] ${RIG} capability check  (base=$BASE)"
if ! command -v hurl >/dev/null 2>&1; then
  echo "  hurl not installed — skipping (brew install hurl)"; exit 0
fi
OUT=$(hurl "${ARGS[@]}" rig/capabilities.hurl 2>&1) || true
echo "$OUT" | sed 's/^/  /'
if echo "$OUT" | grep -qE 'error|Failure|failed'; then
  echo "  ← MISMATCH: deployed pod does not match $MANIFEST"
  echo "  ← the deploy SUCCEEDED; this is a report. Run 'make test-capabilities' for the failing gate."
else
  echo "  all expected capabilities present"
fi
exit 0
```

- [ ] **Step 3: Wire into the Makefile**

Add `capcheck` and `test-capabilities` to the `.PHONY` line, then add:

```makefile
# Report-only capability verdict (guardrails round 2026-07-21). Never fails a deploy.
capcheck:
	@RIG=$(RIG) ./scripts/capcheck.sh

# The RED gate: manifest vs actual. Unlike the 37 skipIf sites across the gate suite,
# this one cannot skip its way to green.
test-capabilities:
	BASE=$(CAPBASE) NODE_EXTRA_CA_CERTS=$(CURDIR)/certs/rootCA.pem npx vitest run tests/capabilities.test.mjs
```

with `RIG ?= fork-tls` and `CAPBASE ?= https://pod.vardeman.me` near the top variables, and append
`@$(MAKE) --no-print-directory capcheck RIG=fork-tls` to `up-fork-tls`, and
`@$(MAKE) --no-print-directory capcheck RIG=local` to `up`.

- [ ] **Step 4: Run against the healthy pod**

Run:
```bash
chmod +x scripts/capcheck.sh && make capcheck RIG=fork-tls
```
Expected: `all expected capabilities present`, exit 0.

- [ ] **Step 5: Prove it detects degradation (the acceptance test)**

Run:
```bash
JSS_GIT_REF=$(grep -oE '[0-9a-f]{40}' Dockerfile.fork | head -1) \
  docker compose -f docker-compose.fork-tls.yml run --rm --no-deps -d --name lws-pod-degraded \
  jss jss start -p 3000 -h 0.0.0.0 -r /data --idp --mcp --conneg --git --notifications --provision-keys --lws
```
Then point a temporary manifest at it, or simpler — confirm the mismatch branch by running
`make capcheck RIG=fork-tls` with the pod stopped:
```bash
docker stop lws-pod-fork && make capcheck RIG=fork-tls; echo "exit=$?"
docker start lws-pod-fork
```
Expected: `← MISMATCH: deployed pod does not match rig/capabilities.fork-tls.json` **and**
`exit=0`. Both halves matter — it reports, and it does not block.

- [ ] **Step 6: Commit**

```bash
git add rig/capabilities.hurl scripts/capcheck.sh Makefile
git commit -m "$(cat <<'EOF'
[Agent: Claude] feat(rig): report-only hurl capability check on deploy

Renders expected-vs-actual as a verdict an agent can act on, wired into
`make up` and `make up-fork-tls`. Always exits 0 — a deploy is never blocked
(guardrails spec, decision 1). hurl has no skipIf, so unlike the vitest gates
it structurally cannot skip.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: The red gate — `tests/capabilities.test.mjs`

**Design refinement, flagged for review.** The spec's L5 said "manifest-aware skip predicate,
~20 call sites." The inventory found **37 `skipIf` sites across 20 files keying on 12 distinct
predicate variables** (`lwsEnabled`, `hasConneg`, `hasResources`, `isMultiTenant`, `voidSvc`,
`hasSearch`, `hasReferentCap`, `probe`, `up`, `lws`, `lwsTypeIndex`, `hasGit`). Editing all 37
achieves the same guarantee as **one** dedicated gate that compares manifest to actual and fails —
because a red anywhere in the suite means the suite is red. The one-file version is DRY, has a
far smaller diff, and reports *which capability* is missing rather than *which tests skipped*,
which is the more actionable signal. The 37 skips stay as they are: correct behavior for a stock
pod. If Chuck prefers the full retrofit, add it as a follow-up task — the helper below is written
to support it.

**Files:**
- Create: `tests/capabilities.test.mjs`
- Modify: `tests/helpers.mjs`

**Interfaces:**
- Consumes: `rig/capabilities.*.json` (Task 2).
- Produces: `loadManifest(base)` → manifest object or `null`; `probeCapabilities(base)` →
  `Promise<Record<string, boolean>>` with the same keys as `manifest.capabilities`;
  `expectedCap(manifest, name)` → `boolean` (for the optional future retrofit).

- [ ] **Step 1: Add the helpers**

Append to `tests/helpers.mjs`:

```js
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

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
    return r.json()
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
```

- [ ] **Step 2: Write the failing gate**

Create `tests/capabilities.test.mjs`:

```js
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
```

- [ ] **Step 3: Run it against the healthy pod**

Run:
```bash
cd /Users/cvardema/dev/git/LA3D/agents/lws-pod && make test-capabilities
```
Expected: PASS, 2 tests. If a capability mismatches, the probe or the manifest is wrong — fix
whichever is inaccurate before proceeding. Do **not** relax the manifest to make it pass.

- [ ] **Step 4: Prove it goes RED on a degraded pod (the acceptance test)**

Run:
```bash
docker stop lws-pod-fork
make test-capabilities; echo "exit=$?"
docker start lws-pod-fork && sleep 15
```
Expected: **FAIL**, non-zero exit, with mismatch lines naming the missing capabilities. This is
the exact scenario that reports green today.

- [ ] **Step 5: Confirm it passes again**

Run: `make test-capabilities`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add tests/capabilities.test.mjs tests/helpers.mjs Makefile
git commit -m "$(cat <<'EOF'
[Agent: Claude] test(rig): manifest-vs-actual capability gate that cannot skip

Closes the green-by-skipping hole: 37 skipIf sites across 20 gate files key on
the exact capability a degraded deploy lacks, so a broken pod passed. This gate
compares the pod to its manifest and FAILS. Verified red with the pod stopped.

Refinement vs spec L5: one dedicated gate instead of retrofitting 37 predicates
— same guarantee, DRY, and reports which capability is missing rather than
which tests skipped. expectedCap() is exported for a future retrofit.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Phase B — Sidecar authz remediation (FORK)

Branch first:

```bash
cd /Users/cvardema/dev/git/LA3D/JavaScriptSolidServer
git checkout la3d/lws && git checkout -b la3d/lws-sidecar-authz
```

**Tasks 5-8 land as one unit.** Task 5's tests are RED on the branch until Task 6 lands — that is
the point (they demonstrate the live vulnerability). Do not checkpoint between them.

### Task 5: Reproduce the three exploits against the UNPATCHED tree

Prove the vulnerability exists in our own code with running tests before changing a line of it.
The fork has a working harness for exactly this: `startLwsPod(t)` + `callTool()` + `request()`
(`test/helpers.js`), used by `test/mcp-lws-write.test.js`. `ownerCtx(pod)` is just
`{ webId, origin, federationDepth }`, so an attacker context is hand-buildable.

**Files:**
- Create: `test/sidecar-authz.test.js`

**Interfaces:**
- Consumes: `startLwsPod(t, name?)`, `ownerCtx(pod)`, `putFile(pod, path, content, opts)`,
  `request(urlPath, options)`, `createTestPod(name)` from `test/helpers.js`; `callTool(name, args, ctx)`
  from `src/mcp/tools.js`; `serializeAcl`, `generatePrivateAcl` from `src/wac/parser.js`.
- Produces: `test/sidecar-authz.test.js`, extended by Tasks 6, 7 and 10.

> **CORRECTED DURING EXECUTION (2026-07-21). The code block below has two defects that were
> found and fixed by the implementer; the landed `test/sidecar-authz.test.js` at commit
> `4312e65` is the authoritative version, not this listing.**
>
> 1. **The `probe.status === 404` oracle is invalid** — and it was the assertion this task
>    leaned on hardest. WAC never leaks `.acl` existence through HTTP status: the probe returns
>    401/403 whether or not the sidecar was written. So the check could not distinguish the two
>    states it existed to distinguish, and the suite would have been vacuous in precisely the way
>    the "assert refusal AND absence" rule was written to prevent. Replaced with
>    `await storage.exists(path)`, which is the real oracle.
> 2. **The HTTP POST case was anonymous**, so it would have returned 401 regardless of the bug —
>    a pass for the wrong reason, indistinguishable from a working guard. Fixed by minting an
>    attacker bearer with `createToken(ATTACKER, 3600)`, following `test/idp-export.test.js`.
>
> Both defects are the same meta-error this round keeps surfacing: **an oracle that cannot
> observe the state it claims to check.** Worth remembering when writing the remaining tasks.

- [ ] **Step 1: Confirm the harness shape before writing against it**

Run:
```bash
cd /Users/cvardema/dev/git/LA3D/JavaScriptSolidServer
sed -n '180,215p' test/helpers.js
sed -n '219,240p' test/helpers.js
```
Read what `startLwsPod` returns (`pod.base`, `pod.podName`, `pod.webId`) and what `putFile`
accepts. **Use the real field names — do not assume the ones written below if they differ.**

- [ ] **Step 2: Write the exploit reproduction**

Create `test/sidecar-authz.test.js`. The load-bearing assertion in each case is **that the sidecar
does not exist afterward** — a tool can return an error string having already written the file.

```js
/**
 * Sidecar privilege-escalation regression suite (2026-07-21).
 *
 * Three surfaces could write an `.acl` for a SIBLING resource with only container
 * Append/Write: HTTP POST+Slug (upstream b9b38ed), MCP create_resource, MCP write_resource.
 * Each test asserts BOTH that the call is refused AND that no sidecar was created — an
 * error return after a completed write would pass a naive assertion.
 *
 * These tests are RED against the unpatched tree by design: that is the vetting.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { callTool } from '../src/mcp/tools.js';
import { startLwsPod, ownerCtx, putFile, request } from './helpers.js';

const ATTACKER = 'http://attacker.example/profile/card#me';

// An ACL body that grants the attacker Control+Read over the sibling it names.
const selfGrantingAcl = (base, subject) => JSON.stringify({
  '@context': { acl: 'http://www.w3.org/ns/auth/acl#' },
  '@id': '#grab',
  '@type': 'acl:Authorization',
  'acl:agent': { '@id': ATTACKER },
  'acl:accessTo': { '@id': `${base}${subject}` },
  'acl:mode': [{ '@id': 'acl:Control' }, { '@id': 'acl:Read' }],
});

// Container ACL granting the attacker Append only — the minimum privilege for the exploit.
const appendOnlyAcl = (base, container) => JSON.stringify({
  '@context': { acl: 'http://www.w3.org/ns/auth/acl#' },
  '@id': '#append',
  '@type': 'acl:Authorization',
  'acl:agent': { '@id': ATTACKER },
  'acl:accessTo': { '@id': `${base}${container}` },
  'acl:default': { '@id': `${base}${container}` },
  'acl:mode': [{ '@id': 'acl:Append' }, { '@id': 'acl:Write' }],
});

async function seedInbox(pod) {
  const container = `/${pod.podName}/inbox/`;
  await putFile(pod, `${container}seed.txt`, 'seed');
  await putFile(pod, `${container}victim`, 'victim resource');
  await putFile(pod, `${container}.acl`, appendOnlyAcl(pod.base, container));
  return container;
}

const attackerCtx = (pod) => ({
  webId: ATTACKER, origin: pod.base, federationDepth: 0, lwsEnabled: true,
});

describe('sidecar privilege escalation', () => {
  test('MCP create_resource cannot plant a sibling .acl with only container Append', async (t) => {
    const pod = await startLwsPod(t);
    const container = await seedInbox(pod);

    const res = await callTool('create_resource', {
      container,
      slug: 'victim.acl',
      content: selfGrantingAcl(pod.base, `${container}victim`),
      contentType: 'application/ld+json',
    }, attackerCtx(pod));

    assert.equal(res.isError, true, 'create_resource must refuse a sidecar slug');
    const probe = await request(`${container}victim.acl`);
    assert.equal(probe.status, 404, 'no .acl sidecar may exist after a refused create');
  });

  test('MCP write_resource cannot write a sibling .acl with only container Write', async (t) => {
    const pod = await startLwsPod(t);
    const container = await seedInbox(pod);

    const res = await callTool('write_resource', {
      path: `${container}victim.acl`,
      content: selfGrantingAcl(pod.base, `${container}victim`),
      contentType: 'application/ld+json',
    }, attackerCtx(pod));

    assert.equal(res.isError, true, 'write_resource must refuse an .acl without Control');
    const probe = await request(`${container}victim.acl`);
    assert.equal(probe.status, 404, 'no .acl sidecar may exist after a refused write');
  });

  test('HTTP POST with Slug: victim.acl cannot plant a sibling ACL', async (t) => {
    const pod = await startLwsPod(t);
    const container = await seedInbox(pod);

    const res = await request(container, {
      method: 'POST',
      headers: { Slug: 'victim.acl', 'Content-Type': 'application/ld+json' },
      body: selfGrantingAcl(pod.base, `${container}victim`),
    });

    assert.ok(res.status === 401 || res.status === 403,
      `POST Slug: victim.acl must be refused, got ${res.status}`);
    const probe = await request(`${container}victim.acl`);
    assert.equal(probe.status, 404, 'no .acl sidecar may exist after a refused POST');
  });
});
```

- [ ] **Step 3: Run against the unpatched tree — the vetting step**

Run:
```bash
node --test --test-force-exit test/sidecar-authz.test.js 2>&1 | tail -30
```
Expected: **FAIL — and record exactly how.** Each failure should show either `isError` false or
the probe returning 200 instead of 404, i.e. the sidecar WAS created. Paste the failure output
into the task report; it is the evidence that the vulnerability is real in our code, not merely
inferred from reading it.

If any test passes here, STOP and report: either the exploit does not work as analyzed, or the
test does not exercise it. Do not proceed to write a guard against a vulnerability you could not
demonstrate.

- [ ] **Step 4: Commit the failing suite**

```bash
git add test/sidecar-authz.test.js
git commit -m "$(cat <<'EOF'
[Agent: Claude] test(lws): reproduce three sidecar privilege-escalation paths (RED)

Demonstrates the vulnerability in our own code before fixing it. Each test
asserts refusal AND absence of the sidecar — an error return after a completed
write would pass a naive assertion. RED by design until the guards land.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

### Task 6: Choke-point guard in `applyLwsWrite`

`applyLwsWrite` (`src/lws/write.js:15-83`) is the single pipeline all 7 write surfaces funnel
through, and its `storage.write` runs **unconditionally** (only SHACL admission and type-capture
sit behind `if (lwsEnabled)`), so a guard here covers `--lws` and stock modes alike. Pod
provisioning writes ACLs via `storage.write` directly (`container.js:299` etc.), **not** through
`applyLwsWrite`, so they are unaffected.

**Files:**
- Modify: `src/lws/write.js`
- Modify: `src/handlers/container.js:160`, `src/handlers/resource.js:2597,2837,3213`,
  `src/mcp/tools.js:66,101,386` (thread `agentWebId`)
- Create: `test/sidecar-authz.test.js`

**Interfaces:**
- Consumes: `AUX_SUFFIX` from `src/storage/filesystem.js:8`
  (`/\.(acl|meta|lwstypes|lwsprov)$/`); `sidecarSubject(urlPath)` from `src/utils/url.js:190`
  returning `{ subject, isContainer } | null`; `checkAccess` from `src/wac/checker.js`;
  `AccessMode` from `src/wac/parser.js`.
- Produces: `applyLwsWrite({ …, agentWebId, internal })` — new params. Returns the existing shape
  plus, on refusal, `{ ok: false, problem: { status: 403, title, detail, instance } }`.

- [ ] **Step 1: Write the failing test**

Create `test/sidecar-authz.test.js`:

```js
import { test, describe } from 'node:test';
import assert from 'node:assert';
import { applyLwsWrite } from '../src/lws/write.js';

// Fake storage: records writes, reports nothing pre-existing.
function fakeStorage() {
  const writes = [];
  return {
    writes,
    exists: async () => false,
    read: async () => null,
    write: async (p, c) => { writes.push([p, c]); return true; },
    remove: async () => true,
  };
}

describe('applyLwsWrite sidecar guard', () => {
  test('refuses an .acl write when the caller lacks Control and never touches storage', async () => {
    const storage = fakeStorage();
    const r = await applyLwsWrite({
      storage,
      storagePath: '/foo/victim.acl',
      resourceUrl: 'http://localhost/foo/victim.acl',
      content: Buffer.from('{}', 'utf8'),
      contentType: 'application/ld+json',
      lwsEnabled: true,
      agentWebId: 'http://localhost/attacker/profile/card#me',
      checkAccessFn: async () => ({ allowed: false }),
    });
    assert.equal(r.ok, false);
    assert.equal(r.problem.status, 403);
    assert.equal(storage.writes.length, 0, 'storage.write must not be reached');
  });

  test('fails closed when no agentWebId is supplied and internal is not set', async () => {
    const storage = fakeStorage();
    const r = await applyLwsWrite({
      storage,
      storagePath: '/foo/victim.acl',
      resourceUrl: 'http://localhost/foo/victim.acl',
      content: Buffer.from('{}', 'utf8'),
      contentType: 'application/ld+json',
      lwsEnabled: true,
      checkAccessFn: async () => ({ allowed: true }),
    });
    assert.equal(r.ok, false);
    assert.equal(storage.writes.length, 0);
  });

  test('allows an .acl write when the caller holds Control', async () => {
    const storage = fakeStorage();
    const r = await applyLwsWrite({
      storage,
      storagePath: '/foo/victim.acl',
      resourceUrl: 'http://localhost/foo/victim.acl',
      content: Buffer.from('{}', 'utf8'),
      contentType: 'application/ld+json',
      lwsEnabled: true,
      agentWebId: 'http://localhost/owner/profile/card#me',
      checkAccessFn: async () => ({ allowed: true }),
    });
    assert.equal(r.ok, true);
    assert.equal(storage.writes.length, 1);
  });

  test('non-sidecar writes are unaffected and need no webid', async () => {
    const storage = fakeStorage();
    const r = await applyLwsWrite({
      storage,
      storagePath: '/foo/note.jsonld',
      resourceUrl: 'http://localhost/foo/note.jsonld',
      content: Buffer.from('{}', 'utf8'),
      contentType: 'application/ld+json',
      lwsEnabled: false,
      checkAccessFn: async () => { throw new Error('must not be called'); },
    });
    assert.equal(r.ok, true);
    assert.equal(storage.writes.length, 1);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run:
```bash
cd /Users/cvardema/dev/git/LA3D/JavaScriptSolidServer
node --test --test-force-exit test/sidecar-authz.test.js
```
Expected: FAIL — the first three tests fail because no guard exists (the `.acl` write succeeds and
`storage.writes.length` is 1, not 0).

- [ ] **Step 3: Implement the guard**

In `src/lws/write.js`, extend the imports and the signature, and insert the guard as the **first**
thing in the function body (before `writeTypeConsistency`):

```js
import { AUX_SUFFIX } from '../storage/filesystem.js';
import { sidecarSubject } from '../utils/url.js';
import { checkAccess as defaultCheckAccess } from '../wac/checker.js';
import { AccessMode } from '../wac/parser.js';

export async function applyLwsWrite({
  storage, storagePath, resourceUrl, content, contentType, declaredTypes = [], lwsEnabled,
  agentWebId = null, internal = false, checkAccessFn = defaultCheckAccess,
}) {
  // SIDECAR AUTHZ GUARD (2026-07-21). Every write surface funnels through here, which is why
  // it is the right place: three separate surfaces (HTTP POST+Slug, MCP create_resource, MCP
  // write_resource) each reached storage.write for an `.acl` with only container Append/Write.
  // Deliberately NOT --lws-gated: an auth check that only fires under --lws is worthless, and
  // upstream's own b9b38ed is unconditional. Fails closed — no WebID and not internal = deny.
  if (AUX_SUFFIX.test(storagePath) && !internal) {
    const sc = sidecarSubject(storagePath);
    if (!sc) return refuse(resourceUrl, 'sidecar subject could not be resolved');
    // .acl always needs Control. .meta needs Control to CREATE (the escalation: wac() falls
    // back to the parent container for non-existent targets) but only Write to UPDATE a
    // subject whose ACL you already satisfy. `.lwstypes`/`.lwsprov` are refused downstream
    // by writeTypeConsistency (405, System-Managed) and never reach a mode decision here.
    const isMeta = /\.meta$/.test(storagePath);
    const exists = await storage.exists(storagePath);
    const mode = (!isMeta || !exists) ? AccessMode.CONTROL : AccessMode.WRITE;
    if (!agentWebId) return refuse(resourceUrl, `${mode} required on ${sc.subject} (no authenticated agent)`);
    const subjectUrl = resourceUrl.replace(/\.(acl|meta|lwstypes|lwsprov)$/, '');
    const { allowed } = await checkAccessFn({
      resourceUrl: subjectUrl,
      resourcePath: sc.subject,
      isContainer: sc.isContainer,
      agentWebId,
      requiredMode: mode,
    });
    if (!allowed) return refuse(resourceUrl, `${mode} required on ${sc.subject}`);
  }
  // …existing body continues unchanged: writeTypeConsistency, admit, storage.write, capture…
```

Add near the top of the module:

```js
function refuse(instance, detail) {
  return { ok: false, problem: { status: 403, title: 'Sidecar write requires authorization', detail, instance } };
}
```

- [ ] **Step 4: Run the unit tests to verify they pass**

Run: `node --test --test-force-exit test/sidecar-authz.test.js`
Expected: the 4 unit cases PASS. Task 5's three integration cases may still fail at this point —
they need the call sites threaded in Step 5 before the guard can see a WebID.

- [ ] **Step 5: Thread `agentWebId` through all 7 call sites**

At each site pass the caller's WebID. HTTP handlers have it on the request; MCP has `ctx.webId`.

- `src/handlers/container.js:160` → add `agentWebId: request.webId ?? null,`
- `src/handlers/resource.js:2597`, `:2837`, `:3213` → add `agentWebId: request.webId ?? null,`
- `src/mcp/tools.js:66`, `:101`, `:386` → add `agentWebId: ctx.webId ?? null,`

Verify the request-side field name first:
```bash
git grep -n "request.webId" src/ | head -3
```
If the field is named differently, use the actual name — do not invent one.

- [ ] **Step 6: Task 5's exploit suite must now flip GREEN**

Run: `node --test --test-force-exit test/sidecar-authz.test.js 2>&1 | tail -20`
Expected: PASS, 7/7 (3 integration + 4 unit). **Quote this output in the report** — it is the
before/after pair with Task 5 Step 3 that constitutes the vetting of this fix.

If any integration case still fails, the guard is not reached on that path. Do NOT weaken the test.
Diagnose which call site is not passing `agentWebId`.

- [ ] **Step 7: Run the full fork suite**

Run: `npm test 2>&1 | tail -20`
Expected: no NEW failures vs the pre-change baseline. Capture the baseline first if unknown:
`git stash && npm test 2>&1 | tail -5 && git stash pop`.

- [ ] **Step 8: Commit**

```bash
git add src/lws/write.js src/handlers/container.js src/handlers/resource.js src/mcp/tools.js test/sidecar-authz.test.js
git commit -m "$(cat <<'EOF'
[Agent: Claude] fix(lws): Control gate on sidecar writes at the applyLwsWrite choke point

Three surfaces could write an .acl for a sibling with only container
Append/Write: HTTP POST+Slug (upstream's b9b38ed, unpatched here), MCP
create_resource, MCP write_resource. The last bypassed write_acl's Control
gate entirely via wac()'s parent-container fallback for non-existent targets.

Guard lives at the choke point every write surface shares — the same reasoning
that put writeTypeConsistency here (review #2/#10), applied to authorization,
which was the one concern left outside it. Fails closed. Deliberately NOT
--lws-gated: a gated auth check is worthless and upstream's is unconditional.

.meta keeps Control-on-create / Write-on-update per spec; .lwstypes/.lwsprov
remain 405 downstream.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: Per-surface guards on the MCP tools

Defense in depth per spec decision 3, and it states the security property where a reader looks for
it. Mirrors the pattern `write_acl` already uses at `tools.js:197`.

**Files:**
- Modify: `src/mcp/tools.js` (`write_resource` ~48-64, `create_resource` ~81-95)

**Interfaces:**
- Consumes: `wac(ctx, path, mode)` from `src/mcp/wac.js`; `AccessMode`; `sidecarSubject`;
  `AUX_SUFFIX` from `src/storage/filesystem.js`.
- Produces: no new exports.

**No new tests in this task.** The two MCP surfaces are already covered by Task 5's exploit
reproduction, which must be green at the end of this task. Adding unit tests that pin `AUX_SUFFIX`
and `sidecarSubject` would assert behavior that was never in doubt and would pass on first run,
violating the plan's observed-failing-first constraint.

- [ ] **Step 1: Guard `write_resource`**

In `src/mcp/tools.js`, replace the `authPath` line (~62) with:

```js
  // Sidecar authz (2026-07-21). The pre-existing I1 rule bound `.meta` to its SUBJECT at
  // WRITE; `.acl` was absent from that analysis, so a container-Write agent could write any
  // sibling's ACL — wac() falls back to the parent for non-existent targets, and
  // findApplicableAcl walks up to the container default for existing ones. Both routes now
  // require CONTROL on the subject, matching write_acl (tools.js:197).
  const sc = ctx.lwsEnabled ? sidecarSubject(path) : null;
  const isAcl = /\.acl$/.test(path);
  const isMeta = /\.meta$/.test(path);
  if (isAcl || (isMeta && !(await storage.exists(path)))) {
    const subj = sc ? sc.subject : path.replace(/\.(acl|meta)$/, '');
    if (!(await wac(ctx, subj, AccessMode.CONTROL))) {
      return toolError(`access denied: control ${subj} (required to write ${path})`);
    }
  }
  const authPath = (ctx.lwsEnabled && isMeta) ? sidecarSubject(path).subject : path;
```

- [ ] **Step 2: Guard `create_resource`**

In `create_resource`, immediately after `const childPath = …` (~line 93) insert:

```js
  // A Slug/slug resolving to a sidecar must clear CONTROL on the protected subject — the
  // container Append check above is not sufficient (this is upstream b9b38ed's class, reached
  // through the MCP tool argument, which unlike the HTTP Slug has no character constraint).
  if (AUX_SUFFIX.test(childPath)) {
    const sc2 = sidecarSubject(childPath);
    const subj = sc2 ? sc2.subject : childPath.replace(AUX_SUFFIX, '');
    if (!(await wac(ctx, subj, AccessMode.CONTROL))) {
      return toolError(`access denied: control ${subj} (required to create ${childPath})`);
    }
  }
```

Ensure `AUX_SUFFIX` and `sidecarSubject` are imported at the top of `tools.js`.

- [ ] **Step 3: Task 5's exploit suite must now be fully GREEN**

Run: `node --test --test-force-exit test/sidecar-authz.test.js`
Expected: PASS, 3/3. All three exploit paths refused, no sidecar created in any case. This is the
task's real acceptance criterion — quote the output in the report.

- [ ] **Step 4: Run the full suite**

Run: `npm test 2>&1 | tail -20`
Expected: no new failures.

- [ ] **Step 5: Commit**

```bash
git add src/mcp/tools.js
git commit -m "$(cat <<'EOF'
[Agent: Claude] fix(mcp): Control gate on sidecar targets in write_resource/create_resource

Per-surface guards mirroring write_acl (tools.js:197), in addition to the
choke-point refusal — belt and braces on an auth boundary, and it states the
property where a reader looks for it. create_resource's slug tool argument has
no character constraint at all, unlike the HTTP Slug regex.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: Land Phase B on `la3d/lws`

- [ ] **Step 1: Full suite green**

Run: `npm test 2>&1 | tail -10`
Expected: no new failures vs baseline.

- [ ] **Step 2: Merge to `la3d/lws`**

```bash
git checkout la3d/lws
git merge --no-ff la3d/lws-sidecar-authz -m "$(cat <<'EOF'
[Agent: Claude] merge: sidecar authorization remediation into la3d/lws

Closes three confirmed privilege-escalation paths (HTTP POST+Slug, MCP
create_resource, MCP write_resource). Choke-point guard + per-surface guards.
Row 1 (handlePost) also receives upstream's canonical b9b38ed guard at the
0.0.219 merge; ours defends it in the interim.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Phase C — Upstream 0.0.219 merge (FORK)

### Task 9: Merge `upstream/gh-pages`

**Files:**
- Modify (conflicts): `bin/jss.js`, `src/wac/checker.js`

**Interfaces:**
- Produces: `checkAccess({ …, aclCache, noDebit })` — both params coexist after resolution.

- [ ] **Step 1: Branch and merge**

```bash
git checkout -b la3d/lws-upstream-0.0.219
git merge upstream/gh-pages
```
Expected: `CONFLICT (content)` in exactly `bin/jss.js` and `src/wac/checker.js`.

- [ ] **Step 2: Resolve `bin/jss.js` — purely additive**

Keep **both** sides. Ours contributes `--lws`, `--lws-type-index`/`--no-`,
`--lws-profile-conneg`/`--no-`, `--lws-config`, `--write-rate-limit-max`,
`--mcp-credential-policy`, `--lws-federation-private`. Theirs contributes `--plugin` plus the
`parsePluginFlag` import, the `config.plugins` append block, and `appPaths`/`plugins` keys in the
`createServer({…})` object. No line from either side is dropped.

- [ ] **Step 3: Resolve `src/wac/checker.js` — orthogonal, keep both**

Merged `checkAccess` signature takes both new params:

```js
export async function checkAccess({
  resourceUrl, resourcePath, isContainer, agentWebId, requiredMode,
  aclCache = null,        // ours: per-query memoization of parsed .acl reads
  noDebit = false,        // theirs: guard checks must not charge the ledger
}) {
  const aclResult = await findApplicableAcl(resourceUrl, resourcePath, isContainer, aclCache);
  …
  const result = await checkAuthorizations(
    aclResult.authorizations, resourceUrl, agentWebId, requiredMode, isDefault, noDebit
  );
```

Keep our `loadAcl` refactor of `findApplicableAcl` intact and keep their `noDebit` early-return
inside `checkAuthorizations`. Merge both JSDoc blocks. **These do not interact** — our cache holds
*parsed ACLs*, not *decisions*, so it cannot affect billing.

- [ ] **Step 4: Verify the merge compiles and tests pass**

```bash
git add bin/jss.js src/wac/checker.js
npm test 2>&1 | tail -20
```
Expected: no new failures. Upstream's new `test/wac.test.js` and `test/auth.test.js` cases must
pass — they exercise `noDebit` and the `handlePost` sidecar guard.

- [ ] **Step 5: Confirm the plugin subsystem merged dormant**

Run:
```bash
git log --oneline -1 && ls src/plugins.js && git grep -n "plugins" bin/jss.js | head -5
```
Expected: `src/plugins.js` exists; `bin/jss.js` has the `--plugin` flag. Nothing in our code calls
it. Spec decision 2 — merged, not wired.

- [ ] **Step 6: Commit the merge**

```bash
git commit -m "$(cat <<'EOF'
[Agent: Claude] merge: upstream 0.0.210 -> 0.0.219 (plugins dormant)

23 commits. Conflicts in bin/jss.js (additive both sides) and
src/wac/checker.js (our aclCache + their noDebit, orthogonal — our cache holds
parsed ACLs, not decisions, so it cannot affect their billing path).

Brings upstream's b9b38ed handlePost sidecar guard. Plugin subsystem
(src/plugins.js, --plugin, appPaths, reservePath, mountApp, serverInfo,
getAgent) merged but deliberately unwired.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 10: Thread `noDebit` into the Phase B guards

Exists only because remediation landed before the merge (spec Stage 2a). Inert today — no
`PaymentCondition` and no ledger file in the pod's `/data` — but a silent double-debit if skipped.

**Files:**
- Modify: `src/lws/write.js` (the `checkAccessFn` call from Task 6)
- Modify: `src/mcp/wac.js` (pass through a `noDebit` option)

- [ ] **Step 1: Add the failing test**

Append to `test/sidecar-authz.test.js`:

```js
test('choke-point guard passes noDebit so a guard check never charges the ledger', async () => {
  const storage = fakeStorage();
  let sawNoDebit = null;
  await applyLwsWrite({
    storage,
    storagePath: '/foo/victim.acl',
    resourceUrl: 'http://localhost/foo/victim.acl',
    content: Buffer.from('{}', 'utf8'),
    contentType: 'application/ld+json',
    lwsEnabled: true,
    agentWebId: 'http://localhost/a#me',
    checkAccessFn: async (args) => { sawNoDebit = args.noDebit; return { allowed: true }; },
  });
  assert.equal(sawNoDebit, true, 'guard checks must pass noDebit: true');
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test --test-force-exit test/sidecar-authz.test.js`
Expected: FAIL — `sawNoDebit` is `undefined`.

- [ ] **Step 3: Implement**

In `src/lws/write.js`, add `noDebit: true` to the `checkAccessFn({…})` argument object. In
`src/mcp/wac.js`, add an options parameter and forward it:

```js
export async function wac(ctx, path, mode, { noDebit = false } = {}) {
  …
  const { allowed } = await checkAccess({ …, requiredMode: mode, noDebit });
```

and pass `{ noDebit: true }` from the two Task 7 guard calls (the secondary Control checks only —
**not** the primary Append/Write checks, which stay authoritative).

- [ ] **Step 4: Run to verify it passes**

Run: `node --test --test-force-exit test/sidecar-authz.test.js && npm test 2>&1 | tail -10`
Expected: PASS; no new failures.

- [ ] **Step 5: Commit**

```bash
git add src/lws/write.js src/mcp/wac.js test/sidecar-authz.test.js
git commit -m "$(cat <<'EOF'
[Agent: Claude] fix(wac): pass noDebit through the sidecar guards (spec Stage 2a)

The Phase B guards are secondary checks and landed before upstream's noDebit
param existed. Without it a payment-conditioned Control grant could be charged
inside a guard — a silent double debit. Inert today (no PaymentCondition, no
ledger in the pod) but required by construction.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 6: Land Phase C**

```bash
git checkout la3d/lws && git merge --no-ff la3d/lws-upstream-0.0.219 -m "$(cat <<'EOF'
[Agent: Claude] merge: upstream 0.0.219 round into la3d/lws

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Phase D — Boot capability report (FORK)

### Task 11: `src/lws/capability-report.js`

Sequenced after the merge so its one-line `server.js` edit stays out of the merge's way
(`server.js` is the fork's highest-conflict file at +537).

**Files:**
- Create: `src/lws/capability-report.js`
- Modify: `src/server.js` (one call site)
- Create: `test/capability-report.test.js`

**Interfaces:**
- Produces: `formatCapabilityReport(config, { configResolved }) -> string`.

- [ ] **Step 1: Check whether `--print-config` already suffices**

Run: `git grep -n "printConfig" src/ bin/ | head -5`
If `printConfig` already renders derived state and failed resolutions, extend it instead of adding
a module, and adjust the remaining steps. Spec §4 flags this as unverified.

- [ ] **Step 2: Write the failing test**

Create `test/capability-report.test.js`:

```js
import { test, describe } from 'node:test';
import assert from 'node:assert';
import { formatCapabilityReport } from '../src/lws/capability-report.js';

describe('capability report', () => {
  test('names a missing lws-config and the services it disables', () => {
    const out = formatCapabilityReport(
      { lws: true, lwsTypeIndex: true, lwsProfileConneg: true, lwsConfig: '/alice/profiles/pod-config.jsonld', mcp: true },
      { configResolved: false }
    );
    assert.match(out, /lws-config/);
    assert.match(out, /NOT FOUND/);
    assert.match(out, /profileIndex\/void\/uriSpaces services OFF/);
  });

  test('marks implied sub-features as implied', () => {
    const out = formatCapabilityReport(
      { lws: true, lwsTypeIndex: true, lwsProfileConneg: true, lwsConfig: null, mcp: false },
      { configResolved: true }
    );
    assert.match(out, /type-index\s+ON\s+\(implied by --lws\)/);
  });
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `node --test --test-force-exit test/capability-report.test.js`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement**

```js
// Boot-time capability ledger (guardrails round 2026-07-21). The audience is the coding agent
// that deploys this pod, not the agents that use it — those attach to /mcp and never read
// startup config. LOUD, NEVER FATAL: a wrong deploy must be visible in `docker logs`, but must
// not brick a rebuild. The red lives in the rig's tests/capabilities.test.mjs.
export function formatCapabilityReport(config, { configResolved } = {}) {
  const L = ['[lws-pod] capability report'];
  const on = (v) => (v ? 'ON ' : 'OFF');
  L.push(`  lws                  ${on(config.lws)}`);
  if (config.lws) {
    L.push(`  ├ type-index         ${on(config.lwsTypeIndex)}  (implied by --lws)`);
    L.push(`  └ profile-conneg     ${on(config.lwsProfileConneg)}  (implied by --lws)`);
    if (config.lwsConfig) {
      L.push(`  lws-config           ${config.lwsConfig}`);
      if (!configResolved) {
        L.push('                       ✗ NOT FOUND → profileIndex/void/uriSpaces services OFF');
      }
    } else {
      L.push('  lws-config           (none) → profileIndex/void/uriSpaces services OFF');
    }
  }
  L.push(`  mcp                  ${on(config.mcp)}`);
  return L.join('\n');
}
```

- [ ] **Step 5: Run to verify it passes**

Run: `node --test --test-force-exit test/capability-report.test.js`
Expected: PASS, 2 tests.

- [ ] **Step 6: Wire one call site in `server.js`**

After config resolution and before `listen`, add exactly one call — logic stays in the fork-only
module:

```js
import { formatCapabilityReport } from './lws/capability-report.js';
// …
logger.info('\n' + formatCapabilityReport(config, { configResolved: await podConfigResolves(config) }));
```

Locate the existing logger and the pod-config resolution helper first:
`git grep -n "lwsConfig" src/server.js src/lws/pod-config.js | head`. If no resolution helper is
exported, pass `{ configResolved: true }` and open a follow-up rather than inventing one.

- [ ] **Step 7: Verify in the container and commit**

Run `npm test 2>&1 | tail -10` (no new failures), then commit:

```bash
git add src/lws/capability-report.js src/server.js test/capability-report.test.js
git commit -m "$(cat <<'EOF'
[Agent: Claude] feat(lws): loud non-fatal boot capability report

States what is on and WHY at startup — derived sub-features marked implied,
failed lws-config resolution named along with the services it disables. A
missing --lws-config currently yields a healthy container with services
silently off; this makes that visible in `docker logs`.

Logic in a fork-only module; one call line in server.js to keep merge tax down.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Phase E — Rig verification and housekeeping

### Task 12: Repin, rebuild, run every gate

**Files:**
- Modify: `Dockerfile.fork` (`ARG JSS_GIT_REF`), `docker-compose.fork-tls.yml` (default ref)

- [ ] **Step 1: Get the merged SHA**

```bash
cd /Users/cvardema/dev/git/LA3D/JavaScriptSolidServer && git checkout la3d/lws && git rev-parse HEAD
```

- [ ] **Step 2: Repin both files**

Replace the 40-char SHA in `Dockerfile.fork`'s `ARG JSS_GIT_REF=` and in
`docker-compose.fork-tls.yml`'s `JSS_GIT_REF: "${JSS_GIT_REF:-…}"` with that SHA. Update the
adjacent comment to name this round.

- [ ] **Step 3: Rebuild and confirm the boot report appears**

```bash
cd /Users/cvardema/dev/git/LA3D/agents/lws-pod
docker compose -f docker-compose.fork-tls.yml up -d --build 2>&1 | tail -5
sleep 15 && docker logs lws-pod-fork 2>&1 | grep -A8 'capability report'
```
Expected: the ledger from Task 11, with `lws ON` and `lws-config` resolving.

- [ ] **Step 4: Capability gates**

```bash
make capcheck RIG=fork-tls && make test-capabilities
```
Expected: `all expected capabilities present`; capabilities gate PASSES.

- [ ] **Step 5: Full live gate suite**

```bash
for t in test-lws test-l3 test-typeindex test-indexed-relation test-mcp-v2 test-projection \
         test-services test-conneg test-profneg test-conformance; do
  echo "=== $t ==="; make $t 2>&1 | tail -5
done
```
Expected: all green. **`test-projection` is the primary regression risk** — it exercises P2
per-face `.meta` writes, and Control-on-create for `.meta` is exactly what could break a face
write that currently succeeds under Write. Per spec §5: **if it goes red, revisit the `.meta`
policy — do not weaken the guard to make the test pass.**

- [ ] **Step 6: Commit the repin**

```bash
git add Dockerfile.fork docker-compose.fork-tls.yml
git commit -m "$(cat <<'EOF'
[Agent: Claude] feat(rig): repin fork — sidecar authz + upstream 0.0.219 round

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

### Task 13: Housekeeping

- [ ] **Step 1: Fast-forward `la3d/main`**

```bash
cd /Users/cvardema/dev/git/LA3D/JavaScriptSolidServer
git checkout la3d/main && git merge --ff-only upstream/gh-pages && git checkout la3d/lws
```
Expected: fast-forward to `0976f3e`.

- [ ] **Step 2: Resolve the dirty `cth.env`**

```bash
git diff cth.env
```
It changes `USERS_ALICE_WEBID` to `…/card.jsonld#me` and `USERS_BOB_WEBID` to `…/bob/#me`. Ask
Chuck whether to commit or revert — **do not decide unilaterally**; it has been dirty across
sessions and may be an in-flight experiment.

- [ ] **Step 3: Report state**

Summarize: branches landed, gates green, what was NOT pushed (nothing in this plan pushes to
`origin`).

---

## Self-Review

**Revision 2026-07-21 (post-pre-flight, Chuck-approved).** Task 5 added: reproduce all three
exploits against the unpatched tree before any guard is written, asserting refusal **and** sidecar
absence. Old Tasks 5-12 renumbered to 6-13. Task 7 lost its two helper-pinning unit tests — they
asserted `AUX_SUFFIX`/`sidecarSubject` behavior that was never in doubt and passed on first run,
violating the plan's own observed-failing-first constraint. Rig work proceeds on `main` per repo
convention (Chuck-approved). Task 4's one-gate interpretation of L5 confirmed. `checkAccessFn`
injection kept, with the three-layer verification scheme now stated in Global Constraints.

**Spec coverage.** Sidecar/merge spec: Stage 1 → Tasks 5-8; Stage 2 → Task 9; Stage 2a → Task 10;
Stage 3 → Task 12; Stage 4 → Task 13. Guardrails spec: L1 → Task 1; L3 → Task 2; L4 → Task 3;
L5 → Task 4 (refinement flagged in-task); L2 → Task 11.

**Known gaps, deliberate.** (0) Task 5's suite is RED on `la3d/lws-sidecar-authz` until Task 6
lands — by design, and the reason Tasks 5-8 must land as one unit rather than being checkpointed
apart. (1) Task 4 implements L5 as one gate rather than 37 predicate edits —
flagged in-task for Chuck's rejection if unwanted. (2) Tasks 5 and 10 contain verification steps
(`request.webId` field name, `printConfig` sufficiency, pod-config resolution helper) that instruct
the implementer to check reality and adapt rather than assume — these are spec §5-flagged
unverified pins, not placeholders. (3) The Task 3 Step 5 degradation test uses a stopped pod as the
proxy for a degraded one; a true flag-dropped pod is exercised in Task 12's acceptance.

**Type consistency.** `applyLwsWrite` gains `agentWebId`, `internal`, `checkAccessFn` in Task 6 and
uses all three consistently in Task 10. `wac(ctx, path, mode, opts)` gains its 4th param in Task 10
only, after Task 7 uses the 3-arg form — Task 10 Step 3 defaults `opts` so Task 7's calls stay valid.
`loadManifest`/`probeCapabilities`/`expectedCap` are defined in Task 4 and used only there.
