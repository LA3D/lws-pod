# MCP model-driven read path — the affordance-spec consumption correction — design of record

**Date:** 2026-07-06
**Status:** design of record. **Amends** `2026-07-03-mcp-affordance-surface-design.md` (which stays
design of record for everything else): its §1 cold-agent invariant requires the read/follow loop to be
**model-controlled**, but its §4 put local reads in the MCP **Resources** primitive, which the
`mcp-protocol` grounding establishes is **application-driven** (host-staged). A stock client (Claude
Code) and the raw API loop therefore cannot drive the affordance loop autonomously — the
`experiments/agent-eval` harness had to bridge `resources/read` into synthetic tools to run at all.
This spec adds the model-driven tool path alongside Resources, plus the steering + affordance defects
the 2026-07-04 cold-agent probe and priming ablation surfaced. **Next step:** a new session runs
`superpowers:writing-plans` against this spec, then subagent-driven implementation. Do NOT start
implementation from this doc without a plan.

---

## 1. The defect and the evidence (why this round exists)

- **MCP control model (grounded, `.claude/skills/mcp-protocol`):** Tools are *model-controlled*;
  Resources are *application-driven*. The affordance surface's read loop lives in Resources, so the
  model cannot invoke it — the invariant (§1 of the affordance spec) and the mechanism contradict.
- **Empirical:** the cold-agent harness (`experiments/agent-eval`) could only run by exposing two
  synthetic tools, `list_resources` + `read_resource({uri})`, bridged onto `resources/list|read`.
  With exactly that shape the cold agent passed the dry battery (handshake, read surface, no-oracle).
  The bridge IS the missing surface, proven.
- **Cold-agent probe findings folded in (2026-07-04, FOLLOWUP):** (a) RFC 9264 linkset salience is
  prior-dependent — the unprimed agent saw `rel="linkset"` everywhere and never dereferenced it; one
  priming sentence naming the RFC flipped the behavior (ablation confirmed). (b) `GET /mcp` 404s with
  an `Allow` header omitting `POST` — a misleading affordance on the MCP endpoint itself. (c) the pod
  root advertises `rel="linkset"` but index-shadowing ignores `Accept` — an advertised affordance that
  is never honored.

**Scope decision (this round):** the full correction — model-driven read/nav tools + RFC 9264 steering
+ the two probe defects. The **ld+json-500 L3 admission bug** (JSON-LD body hits a Turtle parse path in
describedby-bound containers) is a **separate micro-round immediately after** — different subsystem,
keeps reviews clean — and must precede L4.

---

## 2. Decisions of record

1. **One-Web read tool.** A single **`read_resource({uri})`** reads *any* resource by its real
   `https://` URL — this pod's or another's. Locality is dispatched internally: it is the pod's
   governance topology, not an affordance the agent should have to select on. **`read_remote_resource`
   is retired** (absorbed — its handler moves verbatim into the remote arm).
2. **Model-reachable discovery.** **`list_resources({})`** returns the fixed entry resources + the URI
   template, derived from the same `surface.js` table as `resources/list` — the model-controlled twin
   of the primitive's advertisement.
3. **The Resources primitive stays** (host/@-mention view), unchanged. Both surfaces derive from the
   single registry (`surface.js`) and the single resolver (`resources.js#readResource`) — the v2
   review-fix #11 single-registry discipline extends to the tool path; no drift by construction.
4. **Names match the harness bridge** (`read_resource`, `list_resources`) — the proven cold-agent
   trajectories and task scoring transfer with minimal churn.
5. **Tool budget:** registry 9 → **10** (−`read_remote_resource`, +2). Under the ~10–15
   selection-accuracy budget (arXiv 2606.30317).
6. **RFC 9264 is named on the surface** (§5) — the priming ablation makes salience a design
   obligation, not documentation.
7. **Harness goes native** (§7): the bridge is deleted; `experiments/agent-eval` drives the pod's own
   tools via `tools/call` only. The pod surface now *is* what the harness proved.

---

## 3. `read_resource({uri})` — the one-Web read

**Input:** `{ uri: string }` — a real `http(s)://` URL.

**Local arm** (URL origin matches the pod): delegate to the existing `readResource(uri, ctx)`
resolver — the *same* function `resources/read` uses. Everything is inherited, not reimplemented:
container/ACL/meta/body dispatch on the resource itself; WAC-before-exists (no-oracle) per branch;
trust-typed sanitization (pod JSON-LD structure + `@context` preserved with leaf-stripping;
free-text enveloped; `readBounded` truncation signal). The tool layer only adapts shape: the
`contents[]` resource result becomes the `content[]` tool result; a `ResourceError` becomes the
standard `isError` + teaching `content[]` (same shape tool errors already carry).

**Remote arm** (any other origin): the current `read_remote_resource` handler **verbatim** —
federation WAC gate, depth cap, `sanitizeDeep` on the remote body. Only the tool boundary moves.
The response remains visibly sanitized/enveloped, so "you crossed a pod boundary" stays legible in
the result even though it is no longer a separate tool selection.

**Description (steering, §5):** read → follow the typed links (`rel="up"`, `describedby`, edges in
the body) → resolve terms via `@context`; remote pods are read by the same tool from their own
affordances.

**Ride-alongs:**
- `describe_resource` accepts **`uri` or `path`** (one normalizer; local-only — a remote URI returns
  a teaching error pointing at `read_resource`). Removes the "read by URI, write by path" asymmetry
  at the orientation tool.
- `readResource()`'s not-local rejection message (fires only via the Resources primitive now) updates
  to point at `read_resource` (the old pointer names a tool that no longer exists).

**Governance untouched:** `mcpCredentialPolicy` and the `/mcp` rate-limit sit at dispatch and cover
the new tools automatically; no new authz path is introduced anywhere.

---

## 4. `list_resources({})` — the discovery entry

Returns `{ resources, templates }`: the fixed entry resources (storage description, pod-info, skills,
lws-context, lws-vocab — from `listFixed(origin)`) and the real-URI template (`RESOURCE_TEMPLATE`).
Exactly what `resources/list` + `resources/templates/list` advertise, as one model-callable tool.
The probe scored `started_with_list` — this is the cold agent's actual observed entry behavior, kept
enumerable rather than demoted into a description.

---

## 5. RFC 9264 steering (the priming-ablation consequence)

Salience is prior-dependent: RFC 9264-as-storage-metadata is LWS-new and outside model priors
(Solid's `ldp:constrainedBy` is in them). Three placements name it:

1. **MCP `pod-info` `hint`** gains the priming sentence: *this substrate speaks RFC 9264 linksets —
   get a resource's linkset via `describe_resource`, or negotiate `application/linkset+json` over
   HTTP.* (`describe_resource`'s description already names RFC 9264 — kept.)
2. **HTTP storage description** (`buildStorageDescription`) names the mechanism: an additive entry
   carrying `application/linkset+json` + the RFC 9264 reference, so the "strategy guide" teaches
   linkset negotiation to HTTP-only cold agents. *Planning decision:* the exact key/shape — additive
   and spec-plausible next to `service[]`.
3. The **`linked-web-memory` operating skill** opening with the same sentence is recorded for the
   operating-skills round (distilled last, per `docs/design-notes/agent-operating-skills.md`) — not
   built here.

---

## 6. The two probe defects (small fork fixes)

1. **`GET /mcp` → 405 + `Allow: POST`** with a small JSON body naming the endpoint ("MCP endpoint —
   POST JSON-RPC 2.0, protocol 2025-03-26"). This is what MCP Streamable HTTP prescribes for servers
   that do not offer the GET-SSE stream — spec-aligned, replaces the misleading 404 whose `Allow`
   omitted `POST`.
2. **Suppress `rel="linkset"` under index-shadowing:** where a container has an `index.html`
   (baseline JSS serves `text/html` for every `Accept`), omit `rel="linkset"` from its Link headers —
   never advertise conneg that will not be honored. `rel="…#storageDescription"` stays (different
   URL, unaffected). The baseline shadowing behavior itself is NOT changed (upstream divergence, out
   of scope).

---

## 7. Harness goes native + acceptance

**Harness:** `experiments/agent-eval` deletes the bridge — `agent.mjs` exposes the pod's own
`tools/list` to the Claude loop and dispatches `tools/call`; the synthetic tool definitions go away.
Tool names match (§2.4), so `tasks.mjs` scoring carries over nearly unchanged.

**Acceptance:**
1. **Dry battery passes bridge-less** (`make test-agent-eval-dry` against the repinned pod).
2. **`make test-mcp-v2` extended:** `read_resource` local read returns JSON-LD with `@context`
   intact; no-oracle denial (denied read indistinguishable from not-found); remote-arm federation
   gate; `list_resources` entries; `GET /mcp` 405 + `Allow: POST`; shadowed-container linkset
   suppression; RFC 9264 named in the storage description.
3. **Full live sweep no regression:** `test-lws` / `test-l3` / `test-typeindex` /
   `test-indexed-relation`.
4. **Fork suite green**; `Dockerfile.fork` + `docker-compose.fork-tls.yml` repinned to the merge SHA
   (new image tag).

**Merge model (unchanged):** fork branch `la3d/mcp-read-tools` off `la3d/lws`, subagent-driven with
per-task spec+quality reviews + a whole-branch review, then `git merge --no-ff` into `la3d/lws`.

---

## 8. Out of scope

- **ld+json-500 L3 admission bug** — own micro-round immediately after; precedes L4.
- **Pod-served operating skills / SEP-2640** — this round *satisfies their gate* (skills become
  model-driven-reachable via `read_resource`), but the skill layer itself is distilled last.
- **Expressive query pillar** — the affordance spec §8 deferral stands.
- **`resources/list` child enumeration page-bound** — still deferred.
- **Baseline index-shadowing conneg** — only the misleading advertisement is fixed (§6.2).

---

## 9. Grounding

- `.claude/skills/mcp-protocol` — primitive control model (Tools model-controlled / Resources
  application-driven), Streamable HTTP GET → 405 for non-SSE servers; SEP-2640 status.
- `experiments/agent-eval` — the bridge shape + dry-battery pass; `tasks.mjs` `started_with_list`.
- FOLLOWUP 2026-07-04 — cold-agent probe findings (a)/(b)/(c) + the priming ablation (RFC 9264
  salience is prior-dependent).
- `docs/superpowers/specs/2026-07-03-mcp-affordance-surface-design.md` — the amended design of
  record (§1 invariant, §4 read surface, §7 promote-the-behavior, §11 evidence).
- `docs/design-notes/agent-operating-skills.md` — the model-driven-reachable gate this round
  satisfies.
