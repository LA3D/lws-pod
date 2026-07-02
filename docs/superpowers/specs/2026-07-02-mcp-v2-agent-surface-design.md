# MCP v2 — agent-surface redesign (Resource Gateway) — design of record

**Date:** 2026-07-02
**Status:** design of record. **Planning + implementation happen in a NEW session** — this spec is the
sole handoff; it is written to be self-contained (a fresh agent needs no prior conversation).
**Next step:** a new session runs `superpowers:writing-plans` against this spec, then subagent-driven
implementation. Do NOT start implementation from this doc without a plan.

---

## 0. Orientation for a fresh agent (read this first)

**Where the code lives.** Two repos:
- **JSS fork** — `~/dev/git/LA3D/JavaScriptSolidServer`, branch **`la3d/lws`** (the integration branch;
  `la3d/main` is a pristine upstream pin — do NOT touch it). The MCP module is `src/mcp/`
  (`index.js` = transport/route, `tools.js` = the tool registry + handlers, `protocol.js` = JSON-RPC
  helpers + `initialize`/capabilities, `skills.js` = skill discovery). Fork test runner is **serial**:
  `node --test --test-concurrency=1 --test-force-exit` (the suite shares a filesystem pod; the
  force-exit avoids a known post-suite teardown hang). Full-suite total is **noisy** — ~8 external-Solid
  interop tests always fail in-sandbox and ~10 ldp/notifications tests flake under full load but pass in
  isolation; judge regressions by per-file isolation, not the raw total.
- **lws-pod** (this repo) — `~/dev/git/LA3D/agents/lws-pod`. Holds specs/plans (`docs/superpowers/`),
  the live-pod gates (`tests/*.test.mjs`, run via `make test-*`), the fork build (`Dockerfile.fork` +
  `docker-compose.fork-tls.yml`, built from a pinned git ref), and `FOLLOWUP.md` (current state).

**The live-pod rig.** The fork runs `--lws` behind a TLS Caddy proxy at `https://pod.vardeman.me`
(`make up-fork-tls`, needs `make cert`'s mkcert CA). `Dockerfile.fork` builds JSS from a pinned
`JSS_GIT_REF` (a pushed `la3d/lws` SHA — the build fetches `git+https://…#<SHA>`, so the SHA must be
pushed to `origin` first). Live gates: `make test-mcp` / `test-l3` / `test-typeindex` /
`test-indexed-relation` / `test-lws`. As of this spec, `la3d/lws` HEAD is the working-MCP merge
`fbafd13` (image `fork-mcp`).

**What JSS's MCP is today (the thing being redesigned).** `POST /mcp`, JSON-RPC 2.0 over MCP's
**Streamable HTTP transport, protocol `2025-03-26`**. Auth = the `Authorization` header resolved to a
WebID by JSS's normal auth chain (bearer / Solid-OIDC-DPoP / LWS-CID / NIP-98 / WebID-TLS); every
operation is WAC-checked against that WebID on the path it touches — there is **no separate MCP auth
layer**. The server advertises **only** `capabilities: { tools: { listChanged: false } }` — **JSS has NO
MCP Resources primitive** (no `resources/list`, `resources/read`, or resource templates). It exposes
**19 flat tools**: `list_resources`, `read_resource`, `write_resource`, `create_resource`,
`delete_resource`, `head_resource`, `list_skills`, `get_skill`, `get_pod_skill`, `list_docs`,
`read_docs`, `pod_info`, `read_acl`, `write_acl`, `subscribe`, `call_remote_pod`, `lws_type_search`,
`lws_linkset`, `lws_storage_description`.

**The governance already shipped (working-MCP layer, merge `fbafd13`; carry it FORWARD, do not redo).**
See `docs/superpowers/specs/2026-07-02-working-mcp-design.md` +
`docs/superpowers/plans/2026-07-02-working-mcp.md`. It delivered, all `--lws`-gated + additive:
- **`src/lws/write.js#applyLwsWrite`** — the shared write pipeline (SHACL admission → `storage.write` →
  type-capture); both HTTP `handlePut`/`handlePost` and the MCP write tools call it. **v2 write ops MUST
  keep routing through it.**
- **`src/lws/authorized-resources.js#collectAuthorizedResources({ agentWebId, origin, needDescribedby, buildId? })**
  — the WAC-filtered walk (per-resource `checkAccess`-and-drop) behind `lws_type_search`. The **no-oracle**
  property (a caller never learns of resources it can't read). **v2 discovery MUST reuse it.**
- **`src/lws/storage-description.js#buildStorageDescription(origin, { typeIndexEnabled, notificationsEnabled })`.**
- **`mcpCredentialPolicy`** seam (default `'trusted-local'`; `'audience-bound'` fails closed, requiring
  LWS-CID / Solid-OIDC-DPoP; guard runs before single/batch/streaming dispatch in `src/mcp/index.js`).
- **`/mcp` trust-aware rate limit** (anon 60/min per-IP, authed per-webId).
- **Skill tools + `pod_info` WAC-gated** (closed an arbitrary-file read + a metadata oracle).

**Why redesign (motivation).** Grounded in the MCP-architecture-patterns paper
(**arXiv 2606.30317v1**, "MCP Server Architecture Patterns"). Three findings apply directly:
1. **Tool budget** — selection accuracy falls past ~10–15 tools per context (Haiku <90% by 15; Sonnet
   holds to ~20, falls by 30). **19 tools is over budget.**
2. **Structured error content** — errors should be content the model reads so it can reason/retry, not
   exceptions or side-channel `data`. **Observed live (2026-07-02):** an MCP admission reject surfaced only
   `admission rejected /path`; the SHACL `sh:message`/`violations[]`/`describedby` sat in a `data` field
   the client never rendered — **the L3 "teaching channel" is silently dropped over MCP** (over HTTP it's
   the `400 + problem+json` body).
3. **Resource Gateway** — expose reads as **Resources**, parameterized queries + mutations as **Tools**;
   and **sanitize externally-sourced content** before it enters a response ("Unsanitized Resource
   Content" anti-pattern = cross-agent prompt-injection, load-bearing for a shared memory pod).

**Also relevant:** **SEP-2640** (experimental MCP extension "skills over the Resources primitive") — v2's
Resource model subsumes it (skills become Resources). The original JSS MCP was a first-pass
Claude-Code-authored tool dump; this redesign treats today's 19 tools as an **inventory, not a spec**.

---

## 1. Decisions of record (from the 2026-07-02 brainstorm — do not re-litigate)

1. **Scope = full redesign of the agent surface.** Rethink what the pod exposes; higher-level operations
   allowed; current tools are a starting inventory.
2. **Home = a clean, self-contained, profile-neutral module in the fork (`la3d/lws`), written
   upstream-shaped** so it *could* be PR'd to JSS later. Audience = any JSS `--lws` pod; **no
   OKF/memory-profile assumptions** may leak into the core. (The LWS surfaces — type-search, linkset,
   storage-description — are LWS-*spec* general, which is fine; "profile-neutral" bars OKF/wiki-memory
   semantics, not LWS itself.)
3. **Altitude = layered (Approach C):** a **faithful Resources+Tools core** (fully general, upstreamable)
   + a **thin, separately-registered composed-convenience layer** (the opinionated ergonomics; gate-able).
4. **Migration = hard clean break (no shims).** There are no external consumers; v2 replaces v1 outright.
   Removed tool names simply cease to exist.
5. **Convenience layer = exactly two tools** for now: `put_typed_resource`, `describe_resource` (YAGNI —
   add more only when a real flow demands it).
6. **One spec (this), phased implementation.** The Resources primitive is foundational; everything rides
   on it.

---

## 2. Target architecture (module units)

A decomposed `src/mcp/` v2. Each unit has one responsibility, a defined interface, and is testable in
isolation. Suggested files (the plan may refine names):

- **`transport`** (`index.js`) — the `POST /mcp` route + JSON-RPC dispatch; advertises `capabilities:
  { tools: {...}, resources: {...} }` in `initialize`; applies the credential-policy guard + rate-limit
  (carried from working-MCP); routes `resources/*` to the resource registry and `tools/*` to the tool
  registry. Handles single, batch, and streaming (SSE) requests as today.
- **`resource-registry`** — a declarative table of **resource templates** and **fixed resources**, each:
  `{ uriTemplate | uri, name, description, mimeType, resolve(uriParams, ctx) }`. Serves
  `resources/templates/list`, `resources/list`, `resources/read`. Every `resolve` **WAC-checks** the
  target path (reuse the existing `wac(ctx, path, READ)` helper) and returns sanitized content.
- **`tool-registry`** — the mutation/query tools: `{ name, description, inputSchema, handler(args, ctx) }`.
  Core tools + (separately registered) convenience tools.
- **`errors`** — one `structuredError({ code, message, detail? })` builder producing MCP error **content**
  (see §5). Used by BOTH registries.
- **`sanitize`** — one `sanitize(text|obj)` pass (see §6) applied to all externally-sourced content
  before it enters any response.
- **`ctx`** — unchanged shape from working-MCP: `{ webId, origin, federationDepth, lwsEnabled,
  credentialPolicy }`, built in transport from the inbound request.

Profile-neutrality rule: the core registries and their handlers may depend on JSS core + the `--lws`
modules (`src/lws/*`), but **not** on any OKF/wiki-memory code. The convenience layer likewise stays
LWS-general.

---

## 3. Surface taxonomy (the concrete inventory)

### 3a. Resources (read-only, URI-addressed, WAC-checked, sanitized)

A **URI scheme** identifies pod resources to MCP clients; the resolver maps it back to a pod path and
WAC-checks. Proposed scheme (`{+path}` = RFC 6570 reserved expansion, allows `/`):

| URI (template or fixed) | Returns | Maps to today's tool |
|---|---|---|
| `lws://resource/{+path}` | resource body (any content type) | `read_resource` |
| `lws://container/{+path}` | container listing (`ldp:contains` children) | `list_resources` |
| `lws://linkset/{+path}` | RFC 9264 linkset (`anchor`/`up`/`type`/`describedby`) | `lws_linkset` |
| `lws://meta/{+path}` | resource metadata (size/modified/etag) | `head_resource` |
| `lws://acl/{+path}` | structured ACL (requires `acl:Control`) | `read_acl` |
| `lws://skill/{+path}` | a skill file body | `get_skill` |
| `lws://storage-description` (fixed) | the LWS storage description | `lws_storage_description` |
| `lws://pod-info` (fixed) | pod identity + capabilities | `pod_info` |
| `lws://skills` (fixed) | skill index (SEP-2640-aligned) | `list_skills` / `get_pod_skill` |
| `lws://docs` + `lws://doc/{name}` (fixed + template) | JSS built-in docs | `list_docs` / `read_docs` |

`resources/templates/list` advertises the templated URIs; `resources/list` enumerates the fixed ones
(and MAY enumerate WAC-readable container children as concrete resources — decide in the plan; the
no-oracle rule applies: never list a child the caller can't read).

### 3b. Tools (parameterized queries + mutations — stay Tools)

| Tool | Effect | Governance |
|---|---|---|
| `write_resource` | PUT a resource (overwrite) | via `applyLwsWrite` (admission + type-capture); `Write` WAC |
| `create_resource` | POST to a container (server mints name) | via `applyLwsWrite`; `Append` WAC |
| `delete_resource` | DELETE a resource/empty container | `Write` WAC |
| `write_acl` | write a structured ACL | `Control` WAC + anti-lockout (as today) |
| `lws_type_search` | CNF `type` (+`describedby`) query, WAC-filtered | reuse `collectAuthorizedResources` (no-oracle) |
| `subscribe` | SSE change stream, WAC-filtered per event | as today |
| `call_remote_pod` | proxy an MCP tool on another pod | federation gate + depth cap (as today) |

Core tool count = **7** (well under budget).

### 3c. Convenience layer (composed, separately registered, gate-able)

| Tool | Composes | Notes |
|---|---|---|
| `put_typed_resource` | `write_resource` body + `Link: rel="type"` capture + optional `describedby` shape-declare into the target `.meta`, in one call | the common "store a typed thing" flow; still LWS-general |
| `describe_resource` | one read returning body + linkset + declared types together | saves an agent 2–3 round-trips to orient on a resource |

Total surface: **7 core tools + 2 convenience = 9 tools** + the Resource set. Under the ~15 budget with
headroom.

---

## 4. MCP Resources primitive (transport-level — the foundational piece)

JSS has none; v2 implements it per the MCP `2025-03-26` spec:
- **Advertise** `resources: { subscribe: false, listChanged: false }` in the `initialize` result
  (alongside `tools`).
- **`resources/templates/list`** → `{ resourceTemplates: [{ uriTemplate, name, description, mimeType }] }`
  for the §3a templates.
- **`resources/list`** → `{ resources: [{ uri, name, description, mimeType }] }` for fixed resources
  (+ optionally WAC-readable enumerations, no-oracle).
- **`resources/read`** `{ uri }` → `{ contents: [{ uri, mimeType, text | blob }] }`. The handler parses
  the `lws://…` URI, WAC-checks, resolves via `src/lws/*` / storage, sanitizes, and returns. An
  unreadable/denied URI returns a structured error (see §5) — and, per no-oracle, a *denied* read is
  indistinguishable from *not-found* where existence itself is privileged (mirror the current
  `lws_linkset` behaviour: WAC-check BEFORE `storage.exists`).

---

## 5. Error / teaching model

One builder; **all** failures (tool and resource) return **structured content the model reads**:
- Shape: an error result carrying `isError: true` and a `content[]` whose text includes a human/agent
  readable message AND the machine detail. For an **admission reject**, the content MUST include the
  SHACL **`sh:message`(s)** and the `violations[]` + the `describedby` shape URI — this is the L3
  **teaching channel** the current MCP path drops. (Keep any structured `data` too, but the content text
  is authoritative for the model.)
- Never throw to the transport where a structured error is possible (paper: let the LLM see it, reason,
  retry, escalate).
- Consistency: `write_resource`, `put_typed_resource`, and a `resources/read` of a constrained-but-
  malformed target all surface the same teaching shape.

---

## 6. Security

- **Sanitization (new, load-bearing).** All externally-sourced content — resource bodies, skill text,
  container/child names, ACL agent strings — passes through `sanitize()` before entering an MCP
  response. Goal: neutralize prompt-injection payloads that one agent's stored content could carry into
  another agent's context (paper's "Unsanitized Resource Content"). The plan defines the concrete
  transform (e.g., wrap untrusted bodies in a clearly-delimited, non-instruction-framed envelope; strip
  or escape control/hidden characters). **Decide the exact transform in planning**; the spec-level
  requirement is: *no untrusted pod content reaches the model as if it were trusted instruction.*
- **WAC is the sole access boundary.** Resource reads WAC-check identically to today's tools —
  a Resource is not a bypass. `lws_type_search` and any enumerating `resources/list` stay **no-oracle**
  (reuse `collectAuthorizedResources`).
- **Credential policy + rate-limit** carried from working-MCP unchanged.

---

## 7. What is carried forward vs rebuilt

- **Carried (reused as-is):** `applyLwsWrite`, `collectAuthorizedResources`, `buildStorageDescription`,
  `generateLinkset`, the WAC helper, `mcpCredentialPolicy`, the `/mcp` rate-limit, the auth/WebID chain.
- **Rebuilt:** the *surface* — `src/mcp/tools.js`/`index.js`/`protocol.js`/`skills.js` are restructured
  into the §2 units; reads move from tools to Resources; the flat 19-tool registry becomes the §3
  taxonomy; the error path becomes §5; the sanitizer (§6) is new.
- **Removed (hard break):** the read *tools* `read_resource`, `list_resources`, `head_resource`,
  `read_acl`, `get_skill`, `get_pod_skill`, `list_skills`, `list_docs`, `read_docs`, `lws_linkset`,
  `lws_storage_description`, `pod_info` — their capability re-appears as Resources.

---

## 8. Testing strategy

- **Fork unit tests** (`node --test --test-concurrency=1 --test-force-exit`): resource-registry
  resolution + WAC gating; `resources/read` for each template/fixed URI; the structured-error builder
  (admission reject content carries `sh:message`); the sanitizer (an injection payload is neutralized);
  the tool registry incl. `put_typed_resource`/`describe_resource`; capability advertisement includes
  `resources`. Reuse the working-MCP test helpers in `test/helpers.js` (`startLwsPod`, `ownerCtx`,
  shape/`.meta` provisioning).
- **Live-pod gate** (lws-pod `tests/mcp-v2.test.mjs` + `make test-mcp-v2`, against the fork `--lws` TLS
  pod): the MCP `initialize` advertises `resources`; `resources/templates/list` + `resources/read` round-
  trip a resource body and a linkset; a `resources/read` of a protected path as anonymous is denied
  (no-oracle); a `write_resource` violating a shape returns the **teaching content** (`sh:message`
  visible); `put_typed_resource` writes + captures type + is findable via `lws_type_search`;
  `describe_resource` returns body+linkset+types. Repin `Dockerfile.fork` to the v2 merge SHA
  (image e.g. `fork-mcp-v2`).
- **Regression:** the existing live gates (`test-l3`, `test-typeindex`, `test-indexed-relation`,
  `test-lws`) stay green (governance unchanged). The existing `tests/mcp.test.mjs` (v1) is **replaced**
  by the v2 gate (hard break) — remove or rewrite it.

---

## 9. Phased implementation (for the next-session plan — outline, not the plan itself)

Each phase ends with an independently testable deliverable; build on `la3d/lws` on a new
`la3d/mcp-v2` branch, `git merge --no-ff` into `la3d/lws` after a whole-branch review (solo-dev model,
as with working-MCP).

1. **Resources primitive + capability** — `resources/list`/`read`/`templates/list` dispatch in transport;
   advertise `resources`; a resource-registry with ONE trivial fixed resource (`lws://pod-info`) to prove
   the path end-to-end. (No behavior removed yet.)
2. **Migrate reads → Resources** — implement the §3a templates/fixed resources (each reusing the existing
   read logic + WAC), and **remove the corresponding read tools** (hard break).
3. **Restructure tools + convenience layer** — reorganize the tool registry to the §3b set; add
   `put_typed_resource` + `describe_resource` (§3c), separately registered.
4. **Error/teaching model** — the §5 structured-error builder; route admission rejects + all failures
   through it (this fixes the observed teaching-channel drop).
5. **Sanitizer** — the §6 pass on all externally-sourced content in resource/tool responses.
6. **Live gate + repin + docs** — `tests/mcp-v2.test.mjs` + `make test-mcp-v2`; repin the container;
   update `docs/mcp.md` (fork) + `FOLLOWUP.md`; replace the v1 live gate.

Ordering note: phases 1→2 are the risky core (the primitive + the break); 3–5 are additive on top; 6
proves it live. The plan may split phase 2 per-URI-family if it's large.

---

## 10. Open questions to resolve during planning (not blockers)

- **Sanitizer transform** — the exact neutralization (envelope vs strip/escape); pick one, test an
  injection payload.
- **`resources/list` enumeration** — does it enumerate WAC-readable container children as concrete
  resources, or only fixed resources + templates? (Enumeration is nicer for clients but must stay
  no-oracle and bounded — tie to the existing `/types/*` pagination caveat.)
- **URI scheme spelling** — `lws://resource/{+path}` vs a single `lws://{+path}` with a `kind` query
  param, etc. Pick the one that reads clearest in a client's resource list.
- **Convenience `put_typed_resource` shape-declare** — whether it writes the `describedby` into the
  target `.meta` (needs `Write` on `.meta`) or is body-only + `rel=type`; keep minimal.
- **`docs` tools** — are JSS built-in docs worth keeping at all (low agent value)? Candidate to drop
  rather than port.

---

## 11. References / grounding

- Patterns paper: **arXiv 2606.30317v1** "MCP Server Architecture Patterns" (tool budget, Resource
  Gateway, structured error content, Unsanitized Resource Content).
- MCP spec: Streamable HTTP transport + Resources primitive, protocol version `2025-03-26`
  (`modelcontextprotocol.io`).
- SEP-2640 (experimental): skills over the Resources primitive.
- Working-MCP (the governance carried forward): `docs/superpowers/specs/2026-07-02-working-mcp-design.md`,
  `docs/superpowers/plans/2026-07-02-working-mcp.md`.
- Fork MCP docs: `~/dev/git/LA3D/JavaScriptSolidServer/docs/mcp.md`.
- Conformance map (auth/CID divergence): `docs/foundations/05-jss-spec-conformance.md`.
- Current state: `FOLLOWUP.md` (read first when resuming).
- Substrate direction / where MCP fits: FOLLOWUP "working-MCP" block; Plan 2 / L4 (OKF) remain the
  separate next feature track — v2 is the *interface*, not the memory model.
