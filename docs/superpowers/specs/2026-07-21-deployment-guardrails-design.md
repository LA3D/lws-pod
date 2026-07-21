# Deployment Guardrails — Design of Record (2026-07-21)

Make the deployed state of a pod **explicit to the software-engineering agent that deploys it**.
Approved by Chuck 2026-07-21.

The audience is not the agents that *use* the pod as memory — those attach to `/mcp` and consume
the instructions, tools, and skills exposed there; they neither need nor read startup
configuration. The audience is the coding agent that rebuilds and redeploys the container, and the
failure this design targets is: **a flag that should be on is silently not on, and nothing says
so.**

Decisions of record:

1. **Loud, not fatal.** The boot report never blocks startup. The deploy check never stops a
   deploy. Both report.
2. **Two manifests**, one per rig — the fork-tls LWS rig and the local stock pod have genuinely
   different correct answers.
3. **Fix the self-skip hole properly**, not by layering a parallel check over it.
4. **Test gates may go red.** A deploy is never blocked, but a test suite that silently skips and
   reports green is a broken test suite. This is the one place failure is correct.
5. Robustness is preferred over caution: nothing but Chuck's MacBook Pro consumes this, and any
   rig is rebuildable from a git checkout.

---

## 1. Current state (verified 2026-07-21)

### 1.1 Flag surface is inherited, not self-inflicted

`bin/jss.js` on `la3d/lws` declares **114 flags**; upstream base `0f4287f` declares 105 and
`upstream/gh-pages` 106. Exactly **nine are fork-added**:

```
--lws                     --lws-type-index / --no-lws-type-index
--lws-config <path>       --lws-profile-conneg / --no-lws-profile-conneg
--lws-federation-private  --mcp-credential-policy <policy>
--write-rate-limit-max <n>
```

Consequence: **flag consolidation is not the fix.** Trimming our nine changes nothing, and a
shorter command line does not prevent a flag from being dropped — it only makes the drop less
visible. The problem is not verbosity; it is the absence of any statement of what a given
deployment is *supposed* to expose.

### 1.2 Two rigs, two correct answers

| | `lws-pod-local` | `lws-pod-fork` |
|---|---|---|
| Image | `lws-pod:0.0.209` | `lws-pod:fork-conformance` |
| Source | **npm `javascript-solid-server@0.0.209`** — stock upstream | `Dockerfile.fork`, our fork at pinned `JSS_GIT_REF` |
| Flags | `Dockerfile` CMD: `--idp --mcp --conneg --mashlib-cdn --git --notifications --provision-keys` | compose `command:` override — adds `--idp-issuer`, `--lws`, `--lws-config`; drops `--mashlib-cdn` |
| LWS | **none** | full L1+L2+L3 |
| Exposure | host `:3838`, http, `./data` bind mount | Caddy TLS `https://pod.vardeman.me`, named volume |

A single expected-capability set cannot describe both. Hence two manifests.

### 1.3 Confirmed drift: `Dockerfile.fork` CMD is stale

```
Dockerfile.fork CMD:  … --idp --mcp --conneg --git --notifications --provision-keys --lws
compose  command:     … --idp --mcp --conneg --git --notifications --provision-keys \
                          --idp-issuer https://pod.vardeman.me --lws --lws-config /alice/profiles/pod-config.jsonld
```

The Dockerfile CMD lacks `--idp-issuer` and `--lws-config`. `docker run lws-pod:fork-conformance`
without compose therefore yields a materially different pod than `make up-fork-tls` — and by §1.4,
a missing `--lws-config` means the LWS service pointers are silently off.

**Correction, 2026-07-21 (found during Task 1 execution).** This section originally also claimed
the CMD still carried `--mashlib-cdn`. It does not: that flag was dropped from
`Dockerfile.fork` in the PROF/conneg round pulled into the rig on 2026-07-21, and the drafting read
predated that pull. The error is instructive rather than embarrassing — a previous round updated
**one** of the two flag definitions (removing `--mashlib-cdn` from the CMD) while leaving the CMD
missing `--idp-issuer`/`--lws-config` that compose has carried for rounds. Partial updates to
duplicated configuration are exactly the failure this layer exists to prevent, and the duplication
produced one even in the drafting of its own fix.

**Precision, corrected during design:** only `Dockerfile.fork`'s CMD is dead weight, because
`docker-compose.fork-tls.yml` always overrides `command`. The base `Dockerfile`'s CMD is
**load-bearing** — `docker-compose.local.yml` overrides only `container_name`, `ports`, and
`volumes`, never `command` — so `make up` depends on it. Layer 1 applies to `Dockerfile.fork` only.

### 1.4 Silent degradation is designed in

From `docker-compose.fork-tls.yml`, describing `--lws-config`:

> Read lazily + mtime-cached: **absent before publish = services off (no crash)**, no restart.

A missing or unresolvable `--lws-config` does not fail. The pod boots, reports healthy, passes its
healthcheck (`fetch('/') → status < 500`), and serves requests with the LWS service pointers off.

### 1.5 The gates cannot detect it — 20 of 21 self-skip

```js
// tests/lws-services.test.mjs:11-14
const idx = await fetch(`${BASE}/.well-known/lws-storage`, { headers: lws })
  .then((r) => (r.ok ? r.json() : {})).catch(() => ({}))
const isMultiTenant = idx.type === 'ServerIndex'
describe.skipIf(!isMultiTenant)('per-storage services (spec 2026-07-18 R7-R11)', () => {
```

`grep -l skipIf tests/*.mjs` → **20 of 21** test files. Every predicate probes the very capability
a degraded deploy would lack: `!lwsEnabled`, `!lwsTypeIndex`, `!isMultiTenant`, `!probe`,
`!voidSvc`, `!up`, `!hasGit`. The `.catch(() => ({}))` means even a total connection failure
resolves to *skip*, not *fail*.

**Net effect today: drop a flag → pod boots healthy → every gate skips → vitest reports green.**

The self-skip is not itself a bug. It is correct for a stock pod where those services legitimately
do not exist — which is exactly the `lws-pod-local` rig. What is missing is any declaration of
which pod this is.

---

## 2. Design

### L1 — single source of truth

Delete the `CMD` from `Dockerfile.fork`. `docker-compose.fork-tls.yml` becomes the only definition
of the fork rig's flag set, removing §1.3 drift by construction. The base `Dockerfile` CMD stays
(§1.3). Zero code, zero merge tax.

### L2 — loud boot capability report (non-fatal)

New fork-only module `src/lws/capability-report.js`, invoked from one call site in `src/server.js`.
Emits a ledger at startup stating each capability, its state, and **why** — with derived values and
failed resolutions named explicitly:

```
[lws-pod] capability report
  lws                  ON
  ├ type-index         ON   (implied by --lws)
  ├ profile-conneg     ON   (implied by --lws)
  └ lws-config         /alice/profiles/pod-config.jsonld
                       ✗ NOT FOUND → profileIndex/void/uriSpaces services OFF
  mcp                  ON   (credential policy: trusted-local)
  idp-issuer           https://pod.vardeman.me
  conneg, git, notifications, provision-keys   ON
```

Never blocks startup. Merge-tax shape is deliberate: logic in a fork-only file upstream never
touches, **one line** added to `server.js` (already a conflict file at +537).

### L3 — capability manifests

Two files in `rig/`, each declaring what that deployment must expose:

```jsonc
// rig/capabilities.fork-tls.json
{
  "rig": "fork-tls",
  "base": "https://pod.vardeman.me",
  "cacert": "certs/rootCA.pem",
  "capabilities": {
    "lwsEnabled": true, "serverIndex": true, "multiTenant": true,
    "typeIndexService": true, "typeSearchService": true,
    "mcpService": true, "voidService": true, "perStorageServices": true,
    "notifications": true, "git": true, "mashlibCdn": false
  },
  "storages": ["alice", "bob"]
}
```

```jsonc
// rig/capabilities.local.json  — stock upstream 0.0.209, no LWS
{
  "rig": "local",
  "base": "http://localhost:3838",
  "capabilities": {
    "lwsEnabled": false, "serverIndex": false, "multiTenant": false,
    "typeIndexService": false, "typeSearchService": false,
    "mcpService": true, "voidService": false, "perStorageServices": false,
    "notifications": true, "git": true, "mashlibCdn": true
  },
  "storages": []
}
```

The manifest is the artifact that has been missing: a written statement of intent a probe can be
compared against. It is consumed by **both** L4 and L5, so there is exactly one place to update
when a rig's shape changes.

### L4 — deploy-time report (report-only, never stops)

A `.hurl` suite run by `make up` and `make up-fork-tls` after the health check, printing
**expected vs actual with explicit mismatch lines**:

```
[lws-pod] fork-tls capability check
  ServerIndex          expected ✓   actual ✓
  TypeIndexService     expected ✓   actual ✓
  TypeSearchService    expected ✓   actual ✓
  McpService           expected ✓   actual ✓
  VoidService (alice)  expected ✓   actual ✗   ← MISMATCH
  storages seeded      expected 2   actual 1   ← MISMATCH
```

Exits 0 regardless, per decision 1. The design point is that it renders a **verdict, not a dump** —
an agent can act on it without already knowing the right answer. `hurl` is installed
(`/opt/homebrew/bin/hurl`); no `.hurl` files exist in the repo yet, so this is new but
self-contained. TLS rig passes `--cacert certs/rootCA.pem`.

### L5 — manifest-aware test gates (the "fix it properly" part)

A helper in `tests/helpers.mjs` loads the manifest matching the current `BASE` and exposes a
predicate replacing bare `skipIf`:

| Capability expected? | Present? | Outcome |
|---|---|---|
| no | no | **skip** — correct for a stock pod |
| yes | yes | run |
| yes | **no** | **fail** — the deploy is wrong |
| no | yes | run, and warn (unexpected surface) |

~20 call sites change mechanically. This closes the green-by-skipping hole at its source rather
than layering a parallel check above it (decision 3). Per decision 4 this is the one place a red
is correct: a deploy is never blocked, but a test suite must not report green on a degraded pod.

**Explicitly not doing:** rewriting the 20 gates' logic. Only their skip *predicate* changes.

---

## 3. Sequencing

1. **L1** — delete `Dockerfile.fork` CMD. Independent, immediate.
2. **L3** — write both manifests against the verified state in §1.2. No behaviour change; must
   land before L4/L5 since both consume it.
3. **L4** — hurl suite + `make` wiring. Verify by deliberately deploying a pod with `--lws-config`
   omitted and confirming the report shows the mismatch.
4. **L5** — helper + mechanical call-site update. Verify by the same deliberate-degradation run:
   gates must go **red**, where today they go green.
5. **L2** — capability report. Last because it is the only item touching fork code, so it can be
   sequenced around the merge work in `2026-07-21-sidecar-authz-and-upstream-merge-design.md`.

**Acceptance test for the whole design:** deploy the fork rig with `--lws-config` removed. Today
that yields a healthy container and a green suite. Afterwards it must yield an explicit boot-report
line, an explicit deploy-report mismatch, and a red test suite — with the deploy itself still
having succeeded.

---

## 4. Risks and open items

- **Manifest drift.** The manifests become a second thing to update when a rig changes. Mitigated
  by their being consumed by both L4 and L5 — a stale manifest surfaces as a mismatch rather than
  going quiet.
- **L2 merge tax** is one line in `server.js`, but `server.js` is the highest-conflict file in the
  fork. Sequencing it last (§3) keeps it out of the merge's way.
- **Report fatigue.** A report that always prints can stop being read. This is the accepted cost of
  decision 1; the mismatch-line format is the mitigation, and L5's red is the backstop.
- **`--print-config` already exists** upstream and is unconsumed. L2 should check whether it can be
  extended rather than duplicated before writing a new module.
- Not addressed here: flag consolidation as an ergonomic goal (presets, an own entrypoint,
  pod-resident capability declaration). §1.1 shows it does not serve the guardrail objective. If it
  is ever wanted for its own sake, an own entrypoint (`lws start`) is the zero-merge-tax option and
  composes with the deferred plugin question.

---

## 5. Verification provenance

Personally verified at the code: the 114/105/106 flag counts and the nine fork-added flags;
`Dockerfile` and `Dockerfile.fork` CMD lines; `docker-compose.local.yml` and
`docker-compose.fork-tls.yml` contents; `tests/lws-services.test.mjs:11-14`; the
`grep -l skipIf tests/*.mjs` count of 20 of 21 and the distinct skip predicates; `hurl` present at
`/opt/homebrew/bin/hurl` with no `.hurl` files in the repo; `make` target names in the Makefile.

Not yet verified, to confirm during implementation: whether `--print-config` output is sufficient
for L2; the exact per-storage service shape asserted by L4 (derive from
`tests/lws-services.test.mjs` S1-S3 rather than restating it here).
