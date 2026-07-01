# LWS Type Index/Search — deployment hardening (design)

**Status: design of record.** Captured 2026-07-01. A short follow-up to the L2.5 feature
(`2026-07-01-lws-typeindex-search-design.md`) that makes `/types/index` + `/types/search` **safe to
deploy on a shared CRC container**. Closes the FOLLOWUP-deferred spec §7/§8 `400`-over-limit gap and
the DoS-amplification surface (unauthenticated, unbounded full-tree walk, no read rate limit). Small,
additive, `--lws`-gated.

## Threat model
The pod **starts behind an institutional VPN** (trusted internal network), so the bar is "safe on a
shared research-computing host reachable by semi-trusted traffic" — defend against careless load,
accidental amplification, and basic abuse — **not** a hardened internet-facing service. This justifies
doing rate-limit + complexity-cap + config-gate now and **deferring** pagination and the in-memory
cache. If the pod later goes internet-facing, pagination (bounding the per-request walk) becomes
required — recorded as the trigger, not built now.

## Scope

**In (this spec):**
1. **Read rate limit** on both endpoints.
2. **CNF complexity cap → `400`** (the spec §7 conformance gap).
3. **Config gate** to disable the type services per-deployment.
4. **Re-arm the server's globally-inert route-level rate limits** (folded in 2026-07-01). Implementing
   (1) surfaced — and an opus review independently reproduced at the library level — that **every**
   route-level `@fastify/rate-limit` config in JSS is currently a no-op: the plugin's `onRoute` hook is
   installed only when the plugin boots, but the idp/ap/write routes are registered *before* that (the
   IdP plugin is even registered before the rate-limit plugin), so the hook never wires them. Result:
   **IdP brute-force limits** (`/idp/credentials` login, account delete, export) and **write-flood
   limits** (`PUT/POST/PATCH/DELETE /*`, `POST /.pods`) have **never actually been enforced**. This is
   a pre-existing substrate security gap, not introduced here; folded into this round because it is the
   same DoS/abuse concern for the same CRC deployment. Fix: make the rate-limit plugin's `onRoute` hook
   present before the rate-limited routes register (reorder registration / wrap uniformly), and correct
   the shared `errorResponseBuilder` to return a real `Error` with `.statusCode` (its plain-object form
   never yields a `429`). Prove with tests that a write limit and an IdP limit now return `429`.

**Out — deferred (kept in FOLLOWUP; not a regression to defer under the VPN threat model):**
- **Pagination + page-size cap** — the true bound on the per-request walk; required only when pods grow
  large or the pod goes internet-facing.
- **In-memory derivation cache** — performance, not safety.

## 1. Read rate limit
Reuse the already-registered `@fastify/rate-limit` plugin (`src/server.js:463`, `global:false`) via a
per-route `config.rateLimit` override, mirroring `writeRateLimit` (`src/server.js:797`):
```js
const typeQueryRateLimit = { config: { rateLimit: {
  max: 60, timeWindow: '1 minute',
  keyGenerator: (request) => request.webId || request.ip,
} } };
```
Attach it to the `/types/index` and `/types/search` GET+POST registrations inside the existing
`if (lwsEnabled)` block. Keyed by `webId` when authenticated, else client IP — so an authenticated
agent isn't throttled by anonymous traffic and vice-versa. Behind the Caddy TLS proxy, `request.ip`
must be the forwarded client IP (Fastify `trustProxy`, already enabled on the fork-tls rig for the
scheme fix). Over-limit → the plugin's standard `429`.

## 2. CNF complexity cap → `400`
The searchindex spec (§Request-Equivalence-Errors) requires an over-complex filter be rejected with
`400`, **never silently narrowed**. Add bounds to `parseTypeFilter` (`src/lws/type-index.js`) with
module constants (starting values, tune later):
- `MAX_GROUPS = 32` (repeated `type=` params / outer body-array length)
- `MAX_VALUES_PER_GROUP = 64` (comma list / inner OR-array length)
- `MAX_TOTAL_TERMS = 256`

Exceeding any bound throws `FilterError` (`.status = 400`) — the same path the invalid-URI case already
uses, so the handlers' existing `catch → 400 application/problem+json` needs no change. Counts are taken
before dedup so a pathological input can't slip under the cap. `/types/index` takes no filter, so this
applies to `/types/search` only.

## 3. Config gate
A new boolean config **`lwsTypeIndex`** (default **`true`**), following the `lws` flag pattern:
`config.js` default + `JSS_LWS_TYPE_INDEX` env map + `BOOLEAN_KEYS` coercion + a `--lws-type-index` /
`--no-lws-type-index` CLI flag in `bin/jss.js`, threaded to `request`/server scope like `lwsEnabled`.
When **false** (and even when `--lws` is on):
- the `/types/index` + `/types/search` routes are **not registered** (a request → the normal `404`/LDP
  path);
- the `TypeIndexService` + `TypeSearchService` entries are **not advertised** in the storage
  description.
Default-true preserves current L2.5 behavior; a CRC deploy sets `--no-lws-type-index` to turn discovery
off without disabling the rest of `--lws`. Gate is `lwsEnabled && lwsTypeIndex`.

## Testing
- **Fork unit** (`test/lws-type-index-unit.test.js`): `parseTypeFilter` throws `FilterError`/`400` at
  each bound (groups, values/group, total terms); a filter just under the bound passes.
- **Fork integration** (`test/lws-type-index.test.js`): over-limit search → `400`; `lwsTypeIndex:false`
  server → `/types/index` and `/types/search` return the non-lws path (not the handler) **and** the
  storage description omits both services; rate-limit → the (N+1)th request in a window returns `429`
  (small `max` override in the test, or assert the route carries the rateLimit config).
- **Live gate** (`tests/lws-typeindex.test.mjs`, vitest): an over-limit filter → `400` against the pod.
- Full fork suite green; no L2.5 regression.

## Delivery
Branch `la3d/lws-typeindex-harden` off `la3d/lws`; per-task + whole-branch review; `git merge --no-ff`
into `la3d/lws`; repin `Dockerfile.fork`/compose to the merge SHA; live-verify `make test-typeindex` +
`test-l3` + `test-lws`. Update FOLLOWUP (§7/§8 gap closed; pagination remains the internet-facing
trigger).

## Source references (la3d/lws @ dc770ca)
- Rate limit: `src/server.js:463` (plugin), `:797` (`writeRateLimit` shape), `:906`/`:913` (the
  `/types/*` route registrations to wrap).
- Filter: `src/lws/type-index.js` (`parseTypeFilter`, `FilterError`).
- Config-flag pattern: `src/config.js:37,161,239` (`lws`); `bin/jss.js:95,220` (`--lws`);
  `src/server.js:72,332` (`lwsEnabled` threading). Service advertisement: `src/server.js:883-888`.
