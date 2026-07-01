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

**Rate-limit philosophy (revised 2026-07-01).** The abuse vector is **anonymous crawlers / brute-force
of the open pod**, NOT authenticated agents doing work. So rate limits are **trust-aware**: anonymous
callers are limited; authenticated callers run on a *generous per-agent budget* (a runaway-loop
backstop, not a throttle), with real authenticated write-abuse bounded by **WAC + the storage quota**
JSS already enforces. **Pre-authentication** endpoints (login, signup, OAuth token) are the exception —
there is no authenticated user yet, so they stay purely IP-limited abuse guards.

**In (this spec):**
1. **Trust-aware rate limiting on resource endpoints** — `/types/index`, `/types/search`, and the write
   routes (`PUT/POST/PATCH/DELETE /*`): **anonymous → strict per-IP cap** (crawler/flood protection);
   **authenticated → generous per-`webId` cap** (runaway backstop). A write-flood from an anonymous
   crawler is already `401` (WAC) — the anon write cap just cheaply bounds the attempt; legitimate
   authenticated bulk writes (projection engine, git imports, MCP tool bursts) must NOT be throttled.
2. **CNF complexity cap → `400`** (the spec §7 conformance gap). *(Done — Task 2.)*
3. **Config gate** to disable the type services per-deployment. *(Done — Task 3.)*
4. **Keep the pre-auth abuse guards armed** — the plugin-boot ordering fix (Task 4b) that re-armed the
   globally-inert limits STANDS for the **pre-authentication** endpoints: `/idp/credentials` (login
   brute-force), `/.pods` (signup, 1/IP/day), `/oauth/token` + `/oauth/authorize` (token brute-force).
   These are correct IP-limited guards and are unchanged. *(Root cause + fix documented under Task 4b:
   the rate-limit plugin's `onRoute` hook booted after the idp/ap/write routes registered, so every
   route-level limit was a no-op; fixed by reordering the plugin ahead of idp/ap + `fastify.after()`
   wrapping + correcting `errorResponseBuilder` to throw a real `429`.)*

**Out — deferred (kept in FOLLOWUP; not a regression to defer under the VPN threat model):**
- **Pagination + page-size cap** — the true bound on the per-request walk; required only when pods grow
  large or the pod goes internet-facing.
- **In-memory derivation cache** — performance, not safety.

## 1. Trust-aware rate limiting (resource endpoints)
Applies to `/types/index`, `/types/search`, and the write routes (`PUT/POST/PATCH/DELETE /*`). Two
tiers in one `@fastify/rate-limit` config, chosen per request by trust level:

- **Authenticated → generous per-`webId` cap** (default `600 / 1 minute`, tunable via a
  `writeRateLimitMax` config option for the write routes): a runaway-agent backstop, well above any
  legitimate bulk workload (projection engine, git imports, MCP bursts). Real authenticated write abuse
  is bounded by **WAC + the storage quota** JSS already enforces, not by this cap.
- **Anonymous → strict per-IP cap** (`60 / 1 minute`): crawler / flood protection on the open surface.
  An anonymous write is `401` regardless (WAC); the anon cap just cheaply bounds the attempt.

Mechanism: `@fastify/rate-limit` v9 supports function-form `max: (request) => number` and a custom
`keyGenerator: (request) => key` — so one config expresses both tiers:
`keyGenerator` → `wid:<webId>` when authenticated else `ip:<ip>`; `max` → generous when authenticated
else strict. **The implementation question this design leaves to the plan:** the rate-limit hook is
`onRequest`, which runs *before* the auth `preHandler`, so `request.webId` is not yet set at limit time.
The plan must resolve the requester's credential/`webId` at limit time for these routes (reuse
`getWebIdFromRequestAsync`) — accepting a lightweight credential check in the hook, or resolving
identity in an `onRequest` step ahead of the limit — and verify it does not double-run expensive token
verification on the hot path. Behind the Caddy TLS proxy, `request.ip` must be the forwarded client IP
(Fastify `trustProxy`, already enabled on the fork-tls rig).

This **replaces** Task 4b's flat `60/min` IP-keyed write limit (which throttled authenticated workers —
exactly the wrong population) with the trust-aware model. The pre-auth guards in §4 (login/signup/oauth)
are separate and unchanged.

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
