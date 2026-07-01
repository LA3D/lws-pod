# LWS Type Index/Search — Deployment Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Make `/types/index` + `/types/search` safe to deploy on a shared (VPN-fronted) CRC container: a read rate limit, a CNF complexity cap → `400`, and a config gate to disable the services per-deployment.

**Architecture:** Three small additive changes to the merged L2.5 code — a bound in the pure filter parser, a per-route `@fastify/rate-limit` override, and a new `lwsTypeIndex` config flag that gates the routes + bypass + service advertisement. No change to the authz filter or the walk.

**Tech Stack:** Node.js ESM, Fastify, `@fastify/rate-limit` (already registered), `node:test`, vitest (lws-pod live gate).

**Design of record:** `docs/superpowers/specs/2026-07-01-lws-typeindex-hardening-design.md`.

## Global Constraints
- **Work in the JSS fork**, branch `la3d/lws-typeindex-harden` off `origin/la3d/lws` (@ `dc770ca`). NOT lws-pod, except Task 5.
- **Additive + gated:** default (non-`--lws`) path unchanged; the config gate defaults **true** so current L2.5 behavior is preserved unless an operator opts out.
- **Rate limit:** `max: 60`, `timeWindow: '1 minute'`, `keyGenerator: (request) => request.webId || request.ip`.
- **Complexity caps:** `MAX_GROUPS = 32`, `MAX_VALUES_PER_GROUP = 64`, `MAX_TOTAL_TERMS = 256`. Over-limit → `FilterError` (`.status = 400`), never narrow. Counted before dedup.
- **Config flag:** `lwsTypeIndex` (default `true`); env `JSS_LWS_TYPE_INDEX`; CLI `--lws-type-index` / `--no-lws-type-index`. Effective gate = `lwsEnabled && lwsTypeIndex`.
- Fork tests: `node --test --test-concurrency=1 'test/*.test.js'`. Commit after every task.

## File Structure
- Modify `src/lws/type-index.js` — complexity caps in `parseTypeFilter`.
- Modify `src/config.js`, `bin/jss.js`, `src/server.js` — the `lwsTypeIndex` flag + gating the routes/bypass/services.
- Modify `src/server.js` — `typeQueryRateLimit` + attach to the `/types/*` routes.
- Tests: `test/lws-type-index-unit.test.js`, `test/lws-type-index.test.js`.
- lws-pod (Task 5): `tests/lws-typeindex.test.mjs`, `Dockerfile.fork`, `docker-compose.fork-tls.yml`, `FOLLOWUP.md`.

---

### Task 1: Branch setup + green baseline

- [ ] **Step 1: Worktree + branch**
```bash
FORK=/Users/cvardema/dev/git/LA3D/agents/JavaScriptSolidServer
git -C "$FORK" fetch origin
git -C "$FORK" worktree add -b la3d/lws-typeindex-harden \
  /Users/cvardema/dev/git/LA3D/agents/lws-pod/.worktree-harden origin/la3d/lws
cd /Users/cvardema/dev/git/LA3D/agents/lws-pod/.worktree-harden && npm ci
```
- [ ] **Step 2: Baseline** — Run: `node --test --test-concurrency=1 'test/*.test.js'` → all pass (1085). If red, STOP.

*(Add `.worktree-harden/` to lws-pod's `.gitignore` if not already covered.)*

---

### Task 2: CNF complexity cap → `400`

**Files:** Modify `src/lws/type-index.js`; Test `test/lws-type-index-unit.test.js`

**Interfaces:** `parseTypeFilter` unchanged signature; now throws `FilterError` (`.status=400`) when a filter exceeds `MAX_GROUPS`, `MAX_VALUES_PER_GROUP`, or `MAX_TOTAL_TERMS`.

- [ ] **Step 1: Failing tests**
```js
// append to test/lws-type-index-unit.test.js
import { MAX_GROUPS, MAX_VALUES_PER_GROUP, MAX_TOTAL_TERMS } from '../src/lws/type-index.js';
const uri = (n) => `https://ex.org/T${n}`;
describe('CNF complexity caps', () => {
  it('rejects too many groups with 400', () => {
    const q = new URLSearchParams();
    for (let i = 0; i <= MAX_GROUPS; i++) q.append('type', uri(i));
    assert.throws(() => parseTypeFilter({ query: q }), (e) => e instanceof FilterError && e.status === 400);
  });
  it('rejects too many values in one group with 400', () => {
    const g = Array.from({ length: MAX_VALUES_PER_GROUP + 1 }, (_, i) => uri(i)).join(',');
    const q = new URLSearchParams(); q.append('type', g);
    assert.throws(() => parseTypeFilter({ query: q }), (e) => e instanceof FilterError && e.status === 400);
  });
  it('rejects too many total terms with 400', () => {
    // groups within MAX_GROUPS but total terms over MAX_TOTAL_TERMS
    const per = Math.ceil((MAX_TOTAL_TERMS + 1) / MAX_GROUPS);
    const q = new URLSearchParams();
    for (let g = 0; g < MAX_GROUPS; g++)
      q.append('type', Array.from({ length: per }, (_, i) => uri(g * 100 + i)).join(','));
    assert.throws(() => parseTypeFilter({ query: q }), (e) => e instanceof FilterError && e.status === 400);
  });
  it('accepts a filter just under the bounds', () => {
    const q = new URLSearchParams();
    for (let i = 0; i < MAX_GROUPS; i++) q.append('type', uri(i));
    assert.equal(parseTypeFilter({ query: q }).length, MAX_GROUPS);
  });
});
```
- [ ] **Step 2: Run — expect FAIL** (`MAX_GROUPS` not exported). `node --test test/lws-type-index-unit.test.js`
- [ ] **Step 3: Implement** — in `src/lws/type-index.js`, add the constants near the top and enforce them in `parseTypeFilter` (count as groups are built, before dedup):
```js
export const MAX_GROUPS = 32;
export const MAX_VALUES_PER_GROUP = 64;
export const MAX_TOTAL_TERMS = 256;
```
In `parseTypeFilter`, after building each group and before pushing, enforce per-group size; track a running total; enforce group-count. Concretely, in both the GET and POST branches: before `group(...)`, if the raw value list length `> MAX_VALUES_PER_GROUP` → `throw new FilterError('too many type values in one group')`; after building the CNF-so-far, if `cnf.length >= MAX_GROUPS` when about to push another → `throw new FilterError('too many type groups')`; maintain `total += g.length` and if `total > MAX_TOTAL_TERMS` → `throw new FilterError('too many type terms')`. (Count on the raw split length for values, and on accumulated group sizes for the total, so the cap can't be evaded by duplicates that dedup away.)
- [ ] **Step 4: Run — expect PASS** (new + existing). `node --test test/lws-type-index-unit.test.js`
- [ ] **Step 5: Commit** — `git add src/lws/type-index.js test/lws-type-index-unit.test.js && git commit -m "feat(lws): CNF complexity caps → 400 (searchindex §Request-Equivalence-Errors)"`

---

### Task 3: `lwsTypeIndex` config gate

**Files:** Modify `src/config.js`, `bin/jss.js`, `src/server.js`; Test `test/lws-type-index.test.js`

**Interfaces:** new `options.lwsTypeIndex` (default true) → `server.js` computes `const typeIndexEnabled = lwsEnabled && (options.lwsTypeIndex ?? true);` and gates routes (`:908-917`), bypass (`:722-723`), and service pushes (`:887-888`) on it.

- [ ] **Step 1: Failing test**
```js
// append to test/lws-type-index.test.js
describe('lwsTypeIndex config gate', () => {
  before(async () => { await stopTestServer(); await startTestServer({ lws: true, lwsTypeIndex: false }); });
  after(async () => { await stopTestServer(); });
  it('when disabled, services are not advertised and endpoints are not the type handler', async () => {
    const sd = await (await fetch(`${getBaseUrl()}/.well-known/lws-storage`)).json();
    const types = sd.service.map((s) => s.type);
    assert.ok(!types.includes('TypeIndexService'));
    assert.ok(!types.includes('TypeSearchService'));
    // /types/index is no longer the aggregate handler → not a 200 TypeIndex
    const r = await fetch(`${getBaseUrl()}/types/index`);
    assert.notEqual(r.status, 200);
  });
});
```
- [ ] **Step 2: Run — expect FAIL** (services still present; `/types/index` still 200). `node --test test/lws-type-index.test.js`
- [ ] **Step 3: Implement the flag** (mirror `lws` exactly):
  - `src/config.js`: add `lwsTypeIndex: true,` beside `lws: false` (~:37); add `JSS_LWS_TYPE_INDEX: 'lwsTypeIndex',` to the env map (~:161); add `'lwsTypeIndex',` to `BOOLEAN_KEYS` (~:239).
  - `bin/jss.js`: add `.option('--lws-type-index', 'Enable the LWS Type Index/Search services (default on when --lws)')` and rely on commander's `--no-` negation, OR add explicit `.option('--no-lws-type-index', 'Disable the LWS Type Index/Search services')`; pass `lwsTypeIndex: config.lwsTypeIndex,` in the `createServer({...})` call (~:220).
- [ ] **Step 4: Gate the three sites in `src/server.js`:**
  - Near `const lwsEnabled = options.lws ?? false;` (~:72) add: `const typeIndexEnabled = lwsEnabled && (options.lwsTypeIndex ?? true);`
  - Bypass (`:722-723`): change both `lwsEnabled && (...)` to `typeIndexEnabled && (...)`.
  - Service pushes (`:887-888`): wrap in `if (typeIndexEnabled) { services.push(TypeIndexService); services.push(TypeSearchService); }`.
  - Route registrations (`:908-917`): wrap the two GET/POST + method-not-allowed registrations in `if (typeIndexEnabled) { ... }` (nested inside the existing `if (lwsEnabled)` block).
- [ ] **Step 5: Run — expect PASS**, and confirm default-on unchanged: `node --test test/lws-type-index.test.js` (the gate-off test passes; the existing default-on tests still pass because `lwsTypeIndex` defaults true).
- [ ] **Step 6: Full suite** — `node --test --test-concurrency=1 'test/*.test.js'` → no regressions.
- [ ] **Step 7: Commit** — `git add src/config.js bin/jss.js src/server.js test/lws-type-index.test.js && git commit -m "feat(lws): lwsTypeIndex config gate (disable type services per-deployment)"`

---

### Task 4: Read rate limit on `/types/*`

**Files:** Modify `src/server.js`; Test `test/lws-type-index.test.js`

**Interfaces:** a `typeQueryRateLimit` route-options object attached to the `/types/index` + `/types/search` GET/POST registrations.

- [ ] **Step 1: Failing test**
```js
// append to test/lws-type-index.test.js
describe('type endpoints are rate limited', () => {
  before(async () => { await stopTestServer(); await startTestServer({ lws: true }); });
  after(async () => { await stopTestServer(); });
  it('returns 429 after exceeding the per-window limit', async () => {
    let got429 = false;
    for (let i = 0; i < 62; i++) {                      // max is 60/min
      const r = await fetch(`${getBaseUrl()}/types/index`);
      if (r.status === 429) { got429 = true; break; }
    }
    assert.ok(got429, 'expected a 429 within 62 requests');
  });
});
```
- [ ] **Step 2: Run — expect FAIL** (no limit; never 429). `node --test test/lws-type-index.test.js`
- [ ] **Step 3: Implement** — in `src/server.js`, near `writeRateLimit` (~:797) add:
```js
  // Read rate limit for the LWS type-discovery aggregate endpoints (unauth-reachable,
  // each does a full-tree walk). Keyed by webId when authenticated, else client IP.
  const typeQueryRateLimit = { config: { rateLimit: {
    max: 60, timeWindow: '1 minute',
    keyGenerator: (request) => request.webId || request.ip,
  } } };
```
Then attach it as the route options on the type routes (Fastify `(path, opts, handler)`):
```js
    fastify.get('/types/index', typeQueryRateLimit, handleTypeIndex);
    ...
    fastify.get('/types/search', typeQueryRateLimit, handleTypeSearch);
    fastify.post('/types/search', typeQueryRateLimit, handleTypeSearch);
```
(Leave the `methodNotAllowed` registrations as-is.)
- [ ] **Step 4: Run — expect PASS.** `node --test test/lws-type-index.test.js`
- [ ] **Step 5: Full suite** — `node --test --test-concurrency=1 'test/*.test.js'` → no regressions.
- [ ] **Step 6: Commit** — `git add src/server.js test/lws-type-index.test.js && git commit -m "feat(lws): read rate limit on /types/index + /types/search (DoS bound)"`

---

### Task 4b: Re-arm the server's globally-inert route-level rate limits

**Files:** Modify `src/server.js` (rate-limit plugin registration ordering + shared `errorResponseBuilder`); possibly `src/idp/index.js` / `src/ap/index.js` if their limits need the plugin registered earlier. Test: `test/` (a rate-limit integration test proving a write limit and an IdP limit now `429`).

**Confirmed root cause (opus review, reproduced against `fastify@4.29.1` + `@fastify/rate-limit@9.1.0`):** the plugin wires per-route limits via an `onRoute` hook added inside the plugin body, which only fires for routes registered *after* the plugin boots. In `createServer()`: the IdP plugin (`~:409`) and AP plugin (`~:441`) register **before** the rate-limit plugin (`~:467`), and the write/`.pods` routes register synchronously — so none of their `config.rateLimit` overrides ever wire. The `/types/*` routes were already fixed in Task 4 via `fastify.after()`. Also the shared `errorResponseBuilder` returns a plain object with no `.statusCode`, so even a tripped counter never yields `429`.

**Goal:** every route-level rate limit in the server actually fires — specifically the **IdP brute-force** limits (`/idp/credentials`, account delete, export) and the **write-flood** limits (`PUT/POST/PATCH/DELETE /*`, `POST /.pods`) — and returns a proper `429`.

- [ ] **Step 1: Write failing integration tests** proving the limits are inert today: e.g. fire `POST /.pods` (or a write) past its limit and assert a `429` appears; fire `POST /idp/credentials` past its limit and assert `429`. (Use small dedicated servers / fresh state per test; the IdP credentials limit is nominally 10/min — confirm the exact configured max and fire max+1.) These MUST fail first (no `429` today).
- [ ] **Step 2: Run — expect FAIL** (never `429` — the bug). Name the exact commands.
- [ ] **Step 3: Fix the ordering** — make the rate-limit plugin's `onRoute` hook present before the rate-limited routes register. Investigate and choose the minimal robust mechanism, then VERIFY it actually arms each limit (don't assume):
  - Register `@fastify/rate-limit` **before** the idp/ap plugins and before the write/`.pods` route registrations, and/or wrap the synchronous rate-limited route registrations in `fastify.after(...)` (the pattern Task 4 proved for `/types/*`), so the hook wires them.
  - For the idp/ap limits (registered *inside* their plugins), the plugin must boot after rate-limit's hook exists — i.e. register rate-limit ahead of them.
- [ ] **Step 4: Correct the shared `errorResponseBuilder`** in the `fastify.register(rateLimit, {...})` block to return a real `Error` with `.statusCode = 429` (preserving a helpful message / `Retry-After`). Now that limits fire server-wide, this is the correct global behavior; the Task-4 per-route builder on `typeQueryRateLimit` may then be removed (type routes ride the fixed global builder) OR left (harmless) — pick one and state it.
- [ ] **Step 5: Run — expect PASS** (write + IdP limits now `429`); re-run the `/types/*` `429` test (still green); full suite `node --test --test-concurrency=1 'test/*.test.js'` — **investigate any newly-failing test**: a test that previously passed *because* a limit was inert may now legitimately hit `429`; fix such tests to respect the now-armed limit rather than masking the fix.
- [ ] **Step 6: Commit** — `git add -A && git commit -m "fix(security): arm the globally-inert route-level rate limits (plugin-boot ordering + errorResponseBuilder)"`

---

### Task 4c: Trust-aware rate limiting on resource endpoints

**Files:** Modify `src/server.js` (the `/types/*` + write-route rate-limit config), `src/config.js` (+ `writeRateLimitMax`), possibly a small identity-resolution step; Test: `test/` (trust-aware behavior).

**Goal:** the resource-endpoint limits (writes `PUT/POST/PATCH/DELETE /*` and `/types/index` + `/types/search`) become **two-tier by trust level**, replacing Task 4b's flat `60/min` IP write limit and Task 4's flat `/types/*` limit:
- **Authenticated → generous per-`webId` cap**, default **600 / 1 minute**, tunable via a new `writeRateLimitMax` config option (mirror the `podCreateRateLimitMax`/`idpRateLimitMax` pattern from Task 4b: `config.js` default + env + BOOLEAN/size handling + pass-through). A runaway-agent backstop; real write abuse is bounded by WAC + storage quota.
- **Anonymous → strict per-IP cap**, `60 / 1 minute` (crawler/flood defense-in-depth; anon writes `401` anyway via WAC).

**KEEP UNCHANGED** (Task 4b): the pre-auth IP guards on `/idp/credentials`, `/.pods`, `/oauth/token`, `/oauth/authorize`. Do NOT make those trust-aware — they are pre-authentication abuse guards.

**Mechanism (investigate + VERIFY — this is the crux):** `@fastify/rate-limit` v9 supports function-form `max: (request) => number` and a custom `keyGenerator: (request) => string`. Use them to express both tiers in one config: `keyGenerator` → `wid:<webId>` when the caller is authenticated, else `ip:<ip>`; `max` → 600 (or `writeRateLimitMax`) when authenticated, else 60. **The wrinkle:** the rate-limit hook is `onRequest`, which runs BEFORE the auth `preHandler`, so `request.webId` is not set at limit time. Resolve the requester's `webId` at limit time — reuse `getWebIdFromRequestAsync` (`src/auth/token.js`). Strongly prefer resolving identity ONCE in an `onRequest` step (or a shared helper) that stashes `request.webId`, so the auth `preHandler` (writes) and the in-handler resolution (`/types/*` is preHandler-bypassed and already calls `getWebIdFromRequestAsync`) REUSE it rather than verifying the token twice on the hot path. If a clean single-resolution path isn't feasible and you'd be double-verifying tokens on every write, STOP and report the cost + options rather than shipping a hidden per-write double-verify.

- [ ] **Step 1: Failing tests** in a dedicated `test/` file:
  - Authenticated caller (bearer): fire 61 `/types/index` requests → all succeed (NOT 429; under the 600 authenticated cap). *(This fails today — the flat 60/min limit 429s the 61st.)*
  - Anonymous caller: fire 61 `/types/index` requests (no auth) → a 429 appears (60/min anon cap).
  - Authenticated write backstop (optional but preferred): with a low `writeRateLimitMax` test override, fire past it with a bearer → 429 keyed by webId; a different webId is unaffected (per-agent, not shared).
- [ ] **Step 2: Run — expect FAIL** (authenticated 61st is 429 under the flat limit). Name commands.
- [ ] **Step 3: Implement** the trust-aware config + `writeRateLimitMax` + the single identity-resolution path. Apply to the write routes and `/types/*`; leave idp/pods/oauth as-is.
- [ ] **Step 4: Run — expect PASS**; re-run the Task-4b arming tests (`test/rate-limit-arming.test.js`) — the pre-auth guards must still fire. Full suite `node --test --test-concurrency=1 'test/*.test.js'` — fix any test that assumed the old flat behavior (respect the new tiers; do not weaken a limit).
- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat(security): trust-aware rate limits on resource endpoints (anon strict / authenticated generous per-agent)"`

---

### Task 5: lws-pod live gate + repin + FOLLOWUP (after Task 6 merge)

**Files (lws-pod):** `tests/lws-typeindex.test.mjs`, `Dockerfile.fork`, `docker-compose.fork-tls.yml`, `FOLLOWUP.md`

- [ ] **Step 1: Add a live over-limit assertion** to `tests/lws-typeindex.test.mjs` (inside the existing `describe.skipIf` block):
```js
  it('an over-limit CNF filter is rejected with 400', async () => {
    const params = Array.from({ length: 40 }, (_, i) => `type=${encodeURIComponent('https://ex.org/T' + i)}`).join('&')
    const r = await fetch(`${BASE}/types/search?${params}`, { headers: { Authorization: `Bearer ${token}` } })
    expect(r.status).toBe(400)  // > MAX_GROUPS (32)
  })
```
- [ ] **Step 2: Repin** `Dockerfile.fork` + `docker-compose.fork-tls.yml` `JSS_GIT_REF` to the Task-6 merge SHA (keep image tag `fork-l2_5` or bump to `fork-l2_5h`).
- [ ] **Step 3: Rebuild + verify** — `make up-fork-tls && make test-typeindex && make test-l3 && make test-lws` → all green (test-typeindex now includes the 400 case).
- [ ] **Step 4: FOLLOWUP** — record: §7/§8 `400`-over-limit **closed**; rate limit + config gate added; pagination remains the **internet-facing** trigger. Commit lws-pod changes.

---

### Task 6: Whole-branch review + merge

- [ ] **Step 1:** Full suite green (in `.worktree-harden`): `node --test --test-concurrency=1 'test/*.test.js'`.
- [ ] **Step 2:** Opus whole-branch review (rate-limit correctness under the proxy `trustProxy`/`request.ip`; the gate covers all three sites incl. the bypass; complexity cap can't be evaded by dedup).
- [ ] **Step 3:** Fix any Critical/Important; re-run.
- [ ] **Step 4: Merge + push**
```bash
FORK=/Users/cvardema/dev/git/LA3D/agents/JavaScriptSolidServer
git -C "$FORK" checkout la3d/lws
git -C "$FORK" merge --no-ff la3d/lws-typeindex-harden -m "merge: L2.5 deployment hardening into la3d/lws"
git -C "$FORK" push origin la3d/lws la3d/lws-typeindex-harden
```
- [ ] **Step 5:** Do Task 5 (repin to this merge SHA + live verify).
- [ ] **Step 6:** `git -C "$FORK" worktree remove /Users/cvardema/dev/git/LA3D/agents/lws-pod/.worktree-harden`.

---

## Self-Review
**Spec coverage:** rate limit → Task 4; complexity cap → Task 2; config gate → Task 3; live 400 + repin + FOLLOWUP → Task 5; deferred pagination/cache → untouched (correct). **Type consistency:** `MAX_GROUPS`/`MAX_VALUES_PER_GROUP`/`MAX_TOTAL_TERMS`/`FilterError` (Task 2) reused in Task 5's live test; `typeIndexEnabled` gates the exact three sites Task 3 names; `typeQueryRateLimit` shape matches `writeRateLimit`. **Placeholder scan:** all steps carry real code/edits with file:line anchors. **Note:** Task 3 Step 3's commander `--no-lws-type-index` negation must be verified against the repo's commander version — the implementer confirms which form registers the boolean and adapts.
