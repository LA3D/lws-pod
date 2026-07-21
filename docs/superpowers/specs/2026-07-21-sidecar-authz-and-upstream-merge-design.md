# Sidecar Authorization + Upstream 0.0.219 Merge — Design of Record (2026-07-21)

Two coupled pieces of work, deliberately ordered: close a confirmed privilege-escalation class on
our own write surfaces, **then** merge upstream's 23 commits. Approved by Chuck 2026-07-21.

Decisions of record taken in the design conversation:

1. **Upstream posture = sustainable downstream.** `la3d/*` stays a permanent fork. We integrate
   useful upstream work and reduce merge tax where cheap, but we do not become dependent on
   upstream for features we have implemented and they have not.
2. **Plugin subsystem merges dormant.** Take `src/plugins.js` and the plugin API as-is, wire
   nothing to it. Every plugin-adoption question stays open for a later design informed by
   running the code, not by reading its docs.
3. **Remediation is two-layer** (per-surface guards *and* a choke-point refusal), not either alone.
4. **`.meta` policy = Control-on-create, Write-on-update.**
5. **Remediation lands before the merge**, on its own branch, so the fix is reviewable in
   isolation and attributable to us rather than tangled in a 23-commit merge.

Grounding: upstream `b9b38ed` (PR #580, the WAC sidecar fix) as the reference fix shape;
`.claude/skills/jss-server/` for JSS behaviour; `.claude/skills/solid-protocol/` for WAC
semantics. Verification pins below are at fork `c0bc445` (`la3d/lws` tip) and upstream
`0976f3e` (`gh-pages`, v0.0.219).

---

## 1. Current state (verified 2026-07-21)

**Repository facts.** `la3d/lws` = `c0bc445`, forked from upstream `0f4287f` (v0.0.210,
2026-06-21), 276 commits ahead. `upstream/gh-pages` = `0976f3e` (v0.0.219, 2026-07-19), 23
commits ahead of the same base. `git merge-base --is-ancestor b9b38ed la3d/lws` → **fix absent**.
No `.github/workflows` on the fork: there is no CI, all verification is local.

**Upstream has no LWS resource-server implementation.** `upstream/feature/lws-mode` is a stub —
187 lines / 5 files, last commit 2026-01-14, 2 ahead / 582 behind `gh-pages`, unmerged (draft
PR #88). Its only behavioural change was reverted by its own second commit. Everything upstream
ships under the LWS name is authentication-side (`src/auth/lws-cid.js`, CID controllers, NIP-98)
and already in our base. There is no `src/lws/`, no storage description, no type-index service
anywhere in `upstream/gh-pages`; `storageDescription` appears nowhere in their `src/`. Upstream
issue #535 states intent to build `TypeIndexService`/`TypeSearchService` (tracking
`w3c/lws-protocol#115`) with zero code, zero comments, no branch. Consequence: `src/lws/*` has
**no upstream counterpart and no merge conflict surface**; `src/mcp/*` does, because upstream owns
a base `src/mcp/` (#491) that we rewrote.

### 1.1 The vulnerability class

Upstream `b9b38ed`: an agent holding only `acl:Append` on a container can `POST` with
`Slug: victim.acl` and create an ACL sidecar governing a *sibling* it has no rights over, granting
itself `acl:Control`/`acl:Read`. Root cause: the dedicated ACL guard keys on the **request** URL
suffix, which never matches a container POST — the sidecar filename is synthesised inside
`handlePost` *after* authorization has run.

Generalized: **any path that creates or writes an `.acl`/`.meta` sidecar without first requiring
the appropriate mode on the protected subject** (sidecar path minus suffix).

### 1.2 Guards that exist on `la3d/lws`

| Suffix | Guard | Mode | Pin |
|---|---|---|---|
| `.acl` | `authorizeAclAccess` | CONTROL on subject | `src/auth/middleware.js:95` → `:518-537` |
| `.meta` | `authorizeSidecarAccess`, `--lws`-gated | WRITE on subject | `src/auth/middleware.js:145` |
| `.lwstypes` / `.lwsprov` | read guard, GET/HEAD only | READ on subject | `src/auth/middleware.js:132` |
| `.lwstypes` / `.lwsprov` | write refusal, System-Managed | 405 | `src/lws/write-consistency.js:60-64` |

Both authz guards key on the **request URL suffix**. Neither can fire for a container POST, nor
for an MCP tool call, which is precisely the upstream root cause reproduced twice more below.

### 1.3 Confirmed exposure

| # | Surface | Min. privilege | Origin | Pin |
|---|---|---|---|---|
| 1 | HTTP `handlePost` + `Slug` | Append on container | upstream's bug, unpatched here | `src/handlers/container.js:88-95,106-108,154` |
| 2 | MCP `create_resource` slug | Append on container | **fork-original** | `src/mcp/tools.js:81-95` |
| 3 | MCP `write_resource` path | Write on container | **fork-original** | `src/mcp/tools.js:48-64` |

**Row 1.** Slug validator `/^[a-zA-Z0-9._-]+$/` (`container.js:94`) permits dots, so `victim.acl`
passes. `generateUniqueFilename` performs no suffix check. `authorize()` ran against `/foo/` at
Append; `authorizeAclAccess` never fires because `/foo/` does not end in `.acl`. No Control check
exists on this path. `writeTypeConsistency` accepts `.acl` (maps to `application/ld+json`), and
`AUX_SUFFIX` suppresses type-capture rather than refusing the write.

**Row 2.** `slug` is a raw tool argument with **no pattern constraint at all** — weaker than the
HTTP regex. Authorization is Append-on-container only.

**Row 3 — the worst, and verified directly rather than on report.** `write_resource` rewrites the
auth path for `.meta` but **not** for `.acl`:

```js
// src/mcp/tools.js:62-64
const authPath = (ctx.lwsEnabled && path.endsWith('.meta')) ? sidecarSubject(path).subject : path;
if (!(await wac(ctx, authPath, AccessMode.WRITE))) return toolError(`access denied: write ${path}`);
```

and `wac()` falls back to the parent container for writes to non-existent targets:

```js
// src/mcp/wac.js:28-31
if (isWrite && !path.endsWith('/') && !(await storage.exists(path))) {
  checkPath = parentPath(path); checkIsContainer = true;
}
```

So `write_resource({path: "/foo/victim.acl"})` on a non-existent sidecar authorizes against
**`/foo/` at WRITE**, then `applyLwsWrite` lands the file. If the target *does* exist,
`findApplicableAcl` walks up to `/foo/.acl` and reaches the container default anyway. Either way:
**container Write ⇒ write any sibling's ACL.** The fork has a correct tool — `write_acl` gates on
`AccessMode.CONTROL` (`tools.js:197`) — and `write_resource` bypasses it entirely.

The I1 comment block immediately above (`tools.js:53-61`, dated 2026-07-14) reasons explicitly
about sidecar-authz parity, and describes this exact escalation for `.meta`: *"which
findApplicableAcl walks UP to the container default, letting a delegated container-writer
overwrite a private member's governance."* `.acl` is absent from that analysis. The class was
understood; one suffix was missed.

### 1.4 Surfaces confirmed safe

- **`src/handlers/resource.js` PUT/PATCH** — every write targets `storagePath` derived from the
  request URL, never a synthesised sidecar name (`storage.write` occurs only at `:3073`, `:3202`;
  `applyLwsWrite` at `:2597`, `:2837`, `:3213`). Target always equals request path, so
  `middleware.js:95`/`:145` fire first, including on create.
- **`src/patch/*`** — pure document transforms; no `storage.write`, no sidecar awareness. Caller
  owns the path, which is the request path.
- **`src/handlers/type-index.js`, `src/lws/type-index.js`** — read-only.
- **`src/lws/admission.js`** — performs no writes.

### 1.5 Policy divergence (not a break)

`put_typed_resource` (`src/mcp/tools.js:364-397`) writes `path + '.meta'` from a caller-supplied
`describedby` under a **WRITE** check on `path`. Internally consistent with the fork's `.meta`
policy, but upstream's new guard requires **CONTROL** for POST-created `.meta`. Escalation is
limited to the non-existent-subject case, where `wac()` falls back to the parent. Section 3
resolves this.

### 1.6 Exposure assessment

`pod.vardeman.me` resolves only via `/etc/hosts` → `127.0.0.1` and does **not** resolve in public
DNS. The running rig is not reachable from the internet; this is not incident response. But
`docker-compose.fork-tls.yml` describes that rig as "a rehearsal of the public Caddy rung", so
this must close before any public deployment.

No `PaymentCondition` and no ledger file exist in the pod's `/data` (checked in the running
container). This makes the `noDebit` gap in §4 inert in practice today.

---

## 2. Why the choke point is viable

`applyLwsWrite` (`src/lws/write.js:15-83`) is the single pipeline every write surface funnels
through. Two properties make it the right place:

**It is not `--lws`-gated for the write itself.** Only SHACL admission and type-capture sit behind
`if (lwsEnabled)`. `writeTypeConsistency` and `storage.write(storagePath, content)` run
unconditionally. A guard at the top therefore protects both `--lws` and stock modes — a
`--lws`-gated auth check would be worthless.

**Its own docstring states the case.** *"Request-agnostic so both the HTTP handlers and the MCP
write tools use ONE enforcement path (the drift that let MCP bypass both the gate and admission
becomes impossible — review #2/#10)."* The codebase already learned this lesson once: MCP drifted
and bypassed enforcement, and the remedy was centralization. It recurred on authorization
precisely because authorization was the one concern left outside the choke point.

**Request-agnosticism is preserved** by passing `agentWebId` as a plain string, not `request`.
The function gains a caller-supplied identity parameter, not a transport dependency. `AUX_SUFFIX`
is already imported (`write.js:6`); `sidecarSubject()` already exists for subject derivation.

---

## 3. Fix design

### S1 — per-surface guards (merge-shape parity)

Explicit Control gates on `create_resource` and `write_resource`, matching the pattern
`write_acl` already uses at `tools.js:197`. Rationale: keeps our diff shaped like upstream's, so
future merges reconcile rather than fight, and states the security property at the surface where
a reader looks for it.

### S2 — choke-point refusal (defense in depth)

In `applyLwsWrite`, before any write: if the target matches `AUX_SUFFIX`, resolve the subject and
require the mode from the policy table. **Hard refusal, never a silent skip.** Rationale: bugs of
this class arrive when a *new* write surface is added without knowing it needed a guard. S1 alone
recreates exactly that condition, and this codebase has now demonstrated twice that it does that.

### Per-suffix policy

| Suffix | Required mode | Notes |
|---|---|---|
| `.acl` | CONTROL on subject | Unambiguous; matches upstream and existing `authorizeAclAccess` |
| `.meta` | **CONTROL on create, WRITE on update** | See below |
| `.lwstypes` / `.lwsprov` | unchanged — 405 System-Managed | Already refused at `write-consistency.js:60-64` |

**"Create" is defined as: the sidecar path does not exist at check time**
(`storage.exists(storagePath) === false`). This is the same predicate `wac()` uses to decide its
parent-container fallback (`src/mcp/wac.js:28`), which is deliberate — the guard must key on
exactly the condition that produces the escalation. Note the inherent TOCTOU gap between the
existence check and the write; it is not exploitable *for escalation* here, since losing the race
only means an attacker gets the stricter Control requirement rather than the weaker one.

**`.meta` rationale.** A blanket Control rule would tighten `.meta` beyond the fork's deliberate
I1 policy and break `put_typed_resource`'s contract for legitimate delegated writers. A blanket
Write rule leaves the escalation open. The bug lives specifically in `wac()`'s parent-container
fallback for **non-existent** targets: a `.meta` write against a subject whose ACL you already
satisfy is not an escalation; conjuring one for a name that does not yet exist is. Control-on-create
targets the exploit precisely. Cost: this rule diverges from upstream and needs a comment
explaining itself at each future merge — the I1 block sets that precedent.

### Deliberate exception to the `--lws`-off byte-identity principle

The fork holds a standing decision (dated 2026-07-11, restated in `middleware.js`
`authorizeAclAccess` and in the `tools.js` I1 block) that **the `--lws`-off path stays
byte-identical to upstream** — which is why the existing `.meta` guard is `--lws`-gated. S2 is
deliberately **not** gated, and therefore breaks that principle in stock mode.

This is intentional and should be called out in review rather than discovered. Two reasons: a
`--lws`-gated authorization check is worthless, since an operator running stock mode is exactly
as exposed; and upstream's own `b9b38ed` is unconditional, so post-merge the stock path diverges
from upstream anyway unless we match them. The byte-identity principle is a compatibility
commitment, and it does not survive contact with a privilege-escalation fix. Scope of the
exception is narrow: aux-suffix writes only, refusal only, no change to any allowed path's
response bytes.

### Deliberately excluded: row 1

The `handlePost` guard is **not** written by us. It is upstream's bug with upstream's fix arriving
in Stage 2; writing our own would duplicate `b9b38ed` and manufacture a conflict in
`container.js`, working against decision 1. Row 1 is nonetheless defended from Stage 1 onward,
because `handlePost` calls `applyLwsWrite` (`container.js:154`) and therefore inherits S2.

---

## 4. Sequencing

**Stage 1 — `la3d/lws-sidecar-authz`** (from `la3d/lws` @ `c0bc445`). S1 + S2 + the per-suffix
policy + regression tests. Gate: `npm test` green, and every new test observed failing against the
unpatched tree first. Merge to `la3d/lws`.

**Stage 2 — `la3d/lws-upstream-0.0.219`** (from updated `la3d/lws`). Merge `upstream/gh-pages`.
Two conflicts, both tractable:

| File | Ours | Theirs | Resolution |
|---|---|---|---|
| `bin/jss.js` | `--lws*`, `--mcp-credential-policy` flags | `--plugin` flag | Purely additive both sides; take both, including both `createServer({...})` key additions |
| `src/wac/checker.js` | `aclCache` param + `loadAcl` refactor of `findApplicableAcl` | `noDebit` param threaded to `checkAuthorizations` | Signature takes both; keep our refactor, thread their `noDebit`. Orthogonal in intent — our cache holds *parsed ACLs*, not *decisions*, so it cannot interact with their billing path |

Plugin subsystem merged dormant per decision 2. Gate: `npm test` green. Merge to `la3d/lws`.

**Stage 2a — `noDebit` follow-through (required, exists only because of the chosen ordering).**
Stage 1's guards are secondary checks that will call `checkAccess` without `noDebit`, because the
parameter does not exist yet. Once Stage 2 lands it, thread `noDebit: true` into every Stage 1
guard. Inert today (§1.6: no `PaymentCondition`, no ledger), but a silent double-debit if
forgotten — hence a named step rather than a code comment.

**Stage 3 — rig verification.** Repin `Dockerfile.fork` (`ARG JSS_GIT_REF`) and
`docker-compose.fork-tls.yml` to the merged SHA, rebuild, run live gates: `test-lws`, `test-l3`,
`test-typeindex`, `test-indexed-relation`, `test-mcp`, `test-projection`. **These are the real
acceptance criteria** — with no CI, nothing is verified until it runs in the container.

**Stage 4 — housekeeping.** Fast-forward `la3d/main` to `upstream/gh-pages` (0 ahead / 23 behind).
Resolve the uncommitted `cth.env` WebID edit (`card.jsonld#me`, `bob/#me`) — commit or revert.

---

## 5. Testing

Runner: `node --test --test-concurrency=1 --test-force-exit 'test/*.test.js'`. No CI; local and
manual. Mirrors upstream's own shape for `b9b38ed` (coverage added to `test/auth.test.js` and
`test/wac.test.js`).

**Discipline: every regression test must be observed failing against the unpatched tree before it
is accepted.** A guard test never seen red proves nothing — and this bug survived a review round
that reasoned explicitly about sidecar authorization.

Negative cases (each a confirmed exploit path):

1. MCP `create_resource({container:"/foo/", slug:"victim.acl"})`, Append-only agent → denied
2. MCP `write_resource({path:"/foo/victim.acl"})`, target non-existent, container-Write agent →
   denied (parent-fallback escalation)
3. As (2) against an **existing** `.acl`, container Write without Control on subject → denied
   (`findApplicableAcl` up-walk variant)
4. HTTP `POST /foo/` + `Slug: victim.acl`, Append-only → denied. Written to pass **both**
   pre-merge (via S2) and post-merge (via upstream's `handlePost` guard), so Stage 2 does not
   require rewriting it
5. `applyLwsWrite` unit-level: aux target + insufficient mode → hard refusal, `storage.write` not
   reached
6. `.meta` create by non-Control agent → denied; `.meta` update by Write-holder on their own
   subject → **allowed** (policy verified in both directions)

Positive controls (these catch an over-tightened guard):

7. Control-holder writes `.acl` via `write_acl` **and** via `write_resource` → both succeed
8. Ordinary non-sidecar `create_resource` / POST → still 201
9. `.lwstypes` / `.lwsprov` → still 405

**Primary regression risk: `make test-projection`.** It exercises P2 per-face `.meta` writes
("faces declare themselves default reps"). Control-on-create for `.meta` is exactly the change
that could break a face write currently succeeding under Write. **If that gate goes red, revisit
the `.meta` policy — do not weaken the guard to make the test pass.** Decided now, while
hypothetical.

---

## 6. Risks and open items

- **`.meta` policy divergence from upstream** is accepted and must be re-stated at each merge.
  Revisit if upstream ever generalizes their sidecar guard beyond `handlePost`.
- **`put_typed_resource`** (§1.5) is a policy re-confirm, not a fix, and is resolved by the
  Control-on-create rule for its non-existent-subject case.
- **Stage 2a is load-bearing.** If skipped, the fork carries a silent double-debit path forever.
- **Upstream issue #535** (`TypeIndexService`/`TypeSearchService`) would, if ever implemented,
  collide with our `/types/*` routes. No code, no branch, open since 2026-05-29 — monitored, not
  acted on. `api.reservePath` is the eventual collision-detection mechanism if it becomes real.
- **Plugin adoption remains undesigned.** The evaluation to run later: our merge tax lives
  entirely in ~3,500 lines inside upstream files (`resource.js` +1955, `server.js` +537,
  `mcp/tools.js` +235/-413, `auth/middleware.js` +190, `rdf/conneg.js` +166, `ldp/headers.js`
  +110). `src/lws/*` costs nothing to maintain and should **not** be moved onto the plugin API —
  doing so would trade zero coupling for a dependency on upstream's newest, least-stable surface.
  Any plugin work should target evacuating `server.js` wiring and the MCP surface, not `src/lws/`.

---

## 7. Verification provenance

Personally verified at the code: `middleware.js:95` trigger and `authorizeAclAccess` body;
`container.js:88-95` Slug validator; `mcp/wac.js` parent fallback; `tools.js:48-64`
`write_resource` and the I1 comment; `write.js` `applyLwsWrite` structure and its `lwsEnabled`
gating; both merge conflicts via `git merge-tree`; absence of `PaymentCondition`/ledger in the
running container; `pod.vardeman.me` public-DNS resolution; fork/upstream commit topology.

Reported by subagent audit, spot-checked but not line-by-line re-verified: `tools.js:81-95`
(`create_resource`), `filesystem.js:8` (`AUX_SUFFIX`), `write-consistency.js:60-64`,
`middleware.js:132,145`, `tools.js:197,364-397`, the `resource.js`/`patch`/`type-index` safety
findings, and the upstream-branch inventory. **Stage 1 should re-confirm each pin as it is
touched** rather than trusting this table.
