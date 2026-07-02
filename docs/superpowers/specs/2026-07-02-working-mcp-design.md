# Working MCP — design

**Date:** 2026-07-02
**Status:** design of record (brainstorm → this spec → plan → implementation)
**Depends on:** `la3d/lws` at `21d9999` (L1–L2.5 + hardening + indexed-relation, all shipped)
**Precedes:** Plan 2 / L4 (OKF) — this lands **first**, per the 2026-07-02 sequencing decision.

## Motivation

JSS ships an MCP surface (`POST /mcp`, `--mcp`), but it predates our LWS layer and is a faithful
surface over **LDP only**, not over the LWS storage layer we added. Grounding the current fork
(`la3d/lws`) surfaced four concrete gaps:

1. **Write bypasses the governance floor.** `mcp/tools.js` `write_resource`/`create_resource` call
   `storage.write()` **directly** after a WAC check — they never enter `handlePut`/`handlePost`,
   which is where **L3 SHACL admission** and **L2.5 `type`-capture** are wired. So an agent with WAC
   `Write` that writes over MCP **skips admission entirely**. This is a data-**integrity** hole, not
   an access hole (WAC still gates *who* can write) — but it makes L3's guarantee conditional on
   "the agent used the HTTP path."
2. **No LWS surface is exposed.** The tool registry is LDP CRUD + skills + docs + ACL + notifications
   + federation. There is **no** `type-search`, `linkset`, or `storage-description` tool — so an MCP
   agent literally cannot reach the type index or the LWS discovery surfaces.
3. **`/mcp` is not rate-limited.** `mcp/index.js` registers `fastify.post('/mcp')` with **no
   `config.rateLimit`**; it appears only in the WAC-preHandler *bypass* list (`server.js`). The L2.5
   hardening capped writes + `/types/*` but never `/mcp` — so anonymous MCP calls are unbounded, and
   a type-search-over-MCP tool would be an *uncapped* full-tree walk (worse than the HTTP `/types/*`
   we deliberately hardened).
4. **Skill reads are an unauthenticated arbitrary-file read.** `skills.js` `readSkill(path)` reads
   **any** pod path (`storage.read(path)`, no location restriction), and the `read_skill`/
   `read_pod_skill`/`list_skills` tools **do not call `wac()`**. So an anonymous caller can read any
   resource through the skill tool.

**Goal.** Make the pod's own MCP a **faithful, governed, discoverable** surface over the shipped LWS
layer. Everything here is **OKF-independent** and **trusted-local** — it lands before Plan 2 / L4.

**Non-goal.** This is not the "ask the memory" query surface (SPARQL / Comunica link-traversal) and
not untrusted/networked-agent auth. Those are deferred (see Out of Scope) — they depend on published
vocabulary (OKF) and the public-IP rung respectively.

## Security model (the frame everything sits in)

MCP is **not a separate security domain.** `mcp/index.js` resolves the `Authorization` header to a
WebID via the **same** `getWebIdFromRequestAsync` dispatch (`auth/token.js`) that the HTTP write path
and the `/types/*` handlers use, and every data tool calls the **same** `checkAccess`
(`wac/checker.js`). So three concentric layers, all reused — not reinvented:

- **Credential (who):** `Authorization` → WebID. The dispatch already accepts Solid-OIDC (DPoP),
  LWS-CID, Nostr NIP-98, Bearer (RS256/IdP-JWT), and WebID-TLS.
- **Authorization (what) = WAC:** per tool call, same engine + ACLs as HTTP. MCP grants nothing HTTP
  wouldn't. **WAC is the sole access boundary.**
- **Governance (shape):** L3 admission on write (integrity), no-oracle on discovery. This is the
  layer with the gaps above.

**Spec grounding (LWS core §Token Security, `lws10-core/Security-Considerations.html`):** bearer
tokens are replay-vulnerable; the mandated mitigations are **audience-binding (`aud`) + short
lifetime**, under RFC 9700, with **RFC 8693 token-exchange** for cross-security-domain credentials.
All four LWS auth suites require the ID Token's `aud` + `exp`/`iat`.

**Credential tiers** (this design's policy, spec-grounded):

| Credential | Spec posture | Role in this design |
|---|---|---|
| RS256 owner bearer (2-part / IdP-JWT) | No `aud` binding to origin, long-lived → the replayable bearer Token Security warns against | **Trusted-local only** |
| **LWS-CID** (self-signed) | `aud`+`exp` MUSTs — and **JSS already enforces them**: `aud` matched to the pod's own origin (fail-closed), `exp`/`iat` required, lifetime capped (`auth/lws-cid.js:206-259`) | **Sanctioned untrusted-agent credential** |
| did:key / Solid-OIDC-DPoP | Same `aud`+`exp`; DPoP adds per-request PoP (not mandated for CID) | Optional stronger variants |
| RFC 8693 / OAuth-AS (Keycloak) | The spec's **cross-domain** mechanism | **Deferred** — federation / A2A track |

**Divergence (recorded in `docs/foundations/05-jss-spec-conformance.md` axis 6):** the LWS auth suites
are AS-mediated (`aud` = target authorization server); JSS is an **RS-direct profile** (`aud` = the
pod's own origin, verified by the resource server, no AS). Coherent and more decentralized; satisfies
core Token Security; diverges from the letter of the suites.

## In scope

### ① Governed write path — shared `applyLwsWrite` core

Extract the LWS write pipeline out of `handlePut`/`handlePost` into a **request-agnostic** function:

```
applyLwsWrite({ storage, storagePath, resourceUrl, content, contentType,
                declaredTypes, connegEnabled, lwsEnabled, ... })
  -> { ok: true,  shapeUrl? }            // admitted (+ types captured)
   | { ok: false, violation }            // SHACL Violation → caller renders 400 / problem+json
```

It performs, in order: **L3 admission** (`admit(...)`), **`storage.write`**, **L2.5 type-capture**
(`captureDeclaredTypes` / remove the `.lwstypes` sidecar when none). It returns data, not an HTTP
reply — the HTTP handler keeps its reply/quota/git/notification framing around it; MCP wraps its own.

- **HTTP handlers** (`handlers/resource.js`, `handlers/container.js`) refactor to call it — behavior
  unchanged, proven by the existing suite staying green.
- **MCP `write_resource`/`create_resource`** call it after the existing `wac()` check. They gain an
  optional **`types: string[]`** param (MCP has no `Link: rel="type"` header) → `declaredTypes`.
- On `{ ok: false }`, the MCP tool returns a `toolError` carrying the SHACL `violations[]` +
  `describedby` shape URL (the MCP analogue of the HTTP `400` + `problem+json`).

**Why A (shared core), not duplication:** the finding exists *because* there are two write paths. One
function with two entry points makes the drift structurally impossible; copying `admit()`+capture into
the MCP tool would recreate it.

### ② LWS-aware read tools

Three tools, each a thin wrapper over the **same** function the HTTP conneg path already calls,
passed `ctx.webId`:

| Tool | Wraps | Notes |
|---|---|---|
| `lws_storage_description` | the `/.well-known/lws-storage` generator | static-ish; advertises the service set |
| `lws_linkset` | `generateLinkset` (`lws/linkset.js`) | a resource's `anchor`/`up`/`type`/`describedby` |
| `lws_type_search` | the `/types/search` **authz-filtered walk** | CNF `type` + `describedby` filter |

**No-oracle by construction:** `lws_type_search` MUST call the existing `checkAccess`-filtered walk
(the filter *is* the GET predicate), never a raw index — so it inherits the property that it never
reveals the existence of resources the caller can't read. This is the same "one function, two entry
points" discipline as ①.

### ③ Rate-limit `/mcp`

Attach the existing **trust-aware limiter** (anonymous → strict per-IP `60/min`; authenticated →
generous per-`webId`) to the `/mcp` route, matching `/types/*`. Reuse the per-request identity memo
(`getWebIdFromRequestAsync`) so no extra token-verify on the hot path. Spec-endorsed: core §Access
Requests and Grants ("rate limiting, payload size restrictions… before accepting submissions").

### ④ Skill reads honor WAC; public-by-ACL

- **Fix the hole:** `list_skills`/`read_skill`/`read_pod_skill` call `wac(ctx, path, READ)` like every
  other read. This closes the arbitrary-file read and makes **WAC the sole access boundary** (§security
  model) with no special-cased second auth path.
- **Public by convention = ACL, not bypass:** skill files are provisioned with a public-read ACL
  (`acl:agentClass foaf:Agent`). "Skills are public" becomes an ACL fact the owner controls per file
  (a sensitive `/private/bots/*` skill can simply omit public-read). SEP-2640 leaves auth out of
  scope, so this fills its gap without conflict.
- **Shape unchanged in v1:** skills stay bespoke *tools*. The SEP-2640 "skills over the Resources
  primitive" migration is deferred (JSS implements no Resources primitive; the SEP is experimental) —
  see Out of Scope.

### ⑤ Credential-tier seam (do-now half of the untrusted-agent hardening)

The decision (§security model credential tiers) is **recorded now**, and the **seam** is built now so
it can't get lost — the antidote to a naked "harden later" TODO:

- A per-surface credential-policy value, e.g. `mcpCredentialPolicy: 'trusted-local' | 'audience-bound'`,
  **default `trusted-local`** (behavior unchanged for the local rung).
- In `'audience-bound'` mode, `/mcp` **refuses the replayable owner bearer** and requires an
  `aud`-bound short-lived credential (CID / did:key / DPoP).
- **Unit test for the reject path** — pure token-policy logic, runs today (no CID doc-fetch, so the
  SSRF guard is irrelevant to this test).
- **A skipped `@public-rung` e2e** for the full CID-over-MCP *accept* — the visible forcing function
  that turns "remember to harden" into "un-skip a test that already exists."

## Out of scope (deferred, recorded — not dropped)

| Deferred item | Gated on | Forcing function |
|---|---|---|
| Strict credential **default** + end-to-end CID-over-MCP accept | **Public-IP rung** (SSRF guard blocks CID doc-fetch on a private IP) | Skipped `@public-rung` e2e (⑤); public compose can default to `audience-bound` |
| "Ask the memory" **query surface** (SPARQL / Comunica link-traversal MCP) | **OKF** (a cold agent needs published vocabulary/`@context` to interpret raw triples) | Recorded here + FOLLOWUP; lands after Plan 2 |
| **Skills over the Resources primitive** (SEP-2640) | MCP Resources primitive (JSS has none) + SEP stabilizing | align-when-stable, adapter discipline (as with the Type Index PR) |
| **A2A Agent Card** / federation-as-A2A / RFC 8693 token-exchange | Federation / cross-domain track | Recorded; the pod's `call_remote` is the current home-grown stand-in |
| DPoP per-request PoP for MCP | Optional belt-and-suspenders (not spec-mandated for CID) | Recorded |

## Error handling

- MCP write violation → `toolError` with `violations[]` + `describedby` (analogue of HTTP `400` +
  `application/problem+json`).
- MCP read denied by WAC → existing `access denied` `toolError` (unchanged shape).
- Rate-limit exceeded on `/mcp` → JSON-RPC error mapped from the limiter's `429` (the limiter's
  `errorResponseBuilder` already throws a real `429`; the MCP layer surfaces it as a JSON-RPC error).
- `mcpCredentialPolicy: 'audience-bound'` refusal → `toolError` (or pre-dispatch auth error) naming
  the required credential class; never silently downgrades.

## Testing

- **Unit:** `applyLwsWrite` (admission Violation → `{ok:false}`; clean → capture types); HTTP handlers
  still call it (regression); `wac()` now gates skill reads; credential-seam reject path.
- **Fork suite:** stays green (the write refactor is behavior-preserving on the HTTP path — negative
  controls prove the default LDP path unchanged).
- **New live-pod gate `make test-mcp`** (fork `--lws` TLS pod), asserting through the MCP JSON-RPC:
  non-conforming MCP write → error + `violations[]`; conforming write → ok + type captured + surfaced
  in `lws_type_search`; `lws_type_search` returns only WAC-readable resources (no-oracle: a protected
  resource is invisible to an anonymous caller); `/mcp` over the anon cap → `429`; skill read denied
  without a public-read ACL, allowed with one.
- **Skipped `@public-rung`:** CID-over-MCP accept.

## Build discipline

Rides `la3d/lws` on its own `la3d/mcp-working` feature branch, `git merge --no-ff` into `la3d/lws`
(solo-dev model). All changes `--lws`-gated + additive; default LDP + non-`--lws` paths provably
unchanged via negative controls. Container repinned (`Dockerfile.fork` + `docker-compose.fork-tls.yml`)
to the merge SHA; `make test-mcp` added as the live gate. Subagent-driven per-task reviews + an opus
whole-branch review are the gate.

## Open questions carried to the plan

- Exact seam surface for ⑤ (`mcpCredentialPolicy` as a `createServer` option vs CLI/env-threaded flag —
  keep minimal; the reject path is what matters).
- Whether `lws_storage_description` is worth a dedicated tool or folds into `server_info` (lean:
  dedicated, to keep `server_info` about identity/capabilities).
- `/mcp` payload-size cap (core §Access Requests and Grants also mentions payload limits) — likely a
  small add alongside ③.
