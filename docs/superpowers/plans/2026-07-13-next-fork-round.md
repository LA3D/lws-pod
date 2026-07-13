# Next-fork Round Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Drain the recorded fork seeds in one branch — complete the sidecar-authz family, route PATCH through the write choke point (SHACL + type maintenance), finish the federation SSRF guard, and add structured `uriSpace` to the ReferentResolution capability — then merge/repin/rebuild once.

**Architecture:** All work is on the `la3d/lws` fork (`~/dev/git/LA3D/JavaScriptSolidServer`), on one branch `la3d/lws-nextfork` off `16530a1`, task-ordered security-first (Cluster 1 authz → Cluster 3 SSRF → Cluster 2 PATCH → Cluster 4 capability). The write path already funnels every surface through `applyLwsWrite` (`src/lws/write.js`); this round makes PATCH the fifth caller and makes the write-consistency gate reject System-Managed sidecar writes. Sidecar authz already has a `authorizeSidecarAccess` choke point (`src/auth/middleware.js`); this round extends it to writes and to the listing filter. The lws-pod repo (`~/dev/git/LA3D/agents/lws-pod`) gets the rig repin + grown live gates after merge.

**Tech Stack:** Node.js ESM, Fastify, `node:test` (fork unit/integration), Vitest (lws-pod live gates), rdf-ext/n3/jsonld, Docker + Caddy TLS rig.

## Global Constraints

- **Fork test runner:** `npm test` = `node --test --test-concurrency=1 --test-force-exit 'test/*.test.js'`. Single test file: `node --test --test-force-exit test/<file>.test.js`.
- **Baseline suite:** `1587 pass / 0 fail` at `16530a1` (1 pre-existing skip; the isolated `mcp-lws-read` open-handle file runs alone). Every task keeps the suite green.
- **P13 neutrality:** no application-specific (wiki/dcat) logic enters the fork. All fixtures use neutral `ex:`/`http://ex/` vocabulary.
- **Legacy byte-identity:** with `--lws` OFF (`request.lwsEnabled` falsy), every changed handler path stays byte-identical to `16530a1`. Every new behavior is gated on `request.lwsEnabled` (or `ctx.lwsEnabled`).
- **No-oracle:** listing-filter denials HIDE entries (never 401); direct-GET sidecar denials keep the existing `db9cdaa`/`16530a1` response shape.
- **Teaching surface:** new rejections carry `application/problem+json` with an actionable `detail`; 405s carry an `Allow` header; gate rejections set `instance` = the resource URL.
- **Choke-point discipline:** write-path rules live in `applyLwsWrite`/`writeTypeConsistency`, shared by ALL five write surfaces (HTTP PUT `resource.js:2054`, HTTP POST `container.js:160`, MCP `write_resource`/`create_resource`/`put_typed_resource` `tools.js:54,:89,:371`, and PATCH after Task 6). No middleware-only write guard that MCP bypasses.
- **Commit style:** `[Agent: Claude] type(scope): subject` … `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`. Stage specific files, never `git add -A`, never force-push.
- **Spec of record:** `docs/superpowers/specs/2026-07-13-next-fork-round-design.md` (in the lws-pod repo).

---

## Task 0: Branch off the fork

**Files:** none (git only), in `~/dev/git/LA3D/JavaScriptSolidServer`.

- [ ] **Step 1: Confirm clean tree on `la3d/lws @ 16530a1`**

Run: `cd ~/dev/git/LA3D/JavaScriptSolidServer && git status --short && git rev-parse HEAD`
Expected: no output from status; HEAD = `16530a121098d97790c5f7b07b733432dfccfedf`.

- [ ] **Step 2: Create the round branch**

Run: `git checkout -b la3d/lws-nextfork`
Expected: `Switched to a new branch 'la3d/lws-nextfork'`

- [ ] **Step 3: Baseline the suite (bounded, to confirm the starting count)**

Run: `npm test 2>&1 | tail -20`
Expected: `pass 1587` / `fail 0` (1 skip). Record the exact numbers in the task notes; every later task compares against this.

---

## CLUSTER 1 — Sidecar authz completion

### Task 1: Member `.meta` writes require WRITE on the stripped subject

**Files:**
- Modify: `src/auth/middleware.js` (the `.meta` dispatch branch ~`:134`; `authorizeSidecarAccess` ~`:577-608`)
- Test: `test/lws-sidecar-authz.test.js` (extend the existing C1 suite)

**Interfaces:**
- Consumes: `checkAccess` (`src/wac/checker.js`), `AccessMode` (`src/wac/parser.js`), `getWebIdFromRequestAsync`, `buildResourceUrl`, `getEffectiveUrlPath` (all already imported in `middleware.js`).
- Produces: `authorizeSidecarAccess(request, urlPath, webId, authError, mode = AccessMode.READ)` — new optional 5th param; when omitted, byte-identical to today (READ).

- [ ] **Step 1: Write the failing test**

Add to `test/lws-sidecar-authz.test.js` (inside the existing `describe`, reusing its `alice`/`base`/`PRIV` fixtures — `PRIV` has a tighter own `.acl`). A delegated writer (`bob`) with container-write but not member-write must be refused a member `.meta` write, while `alice` (owner) succeeds:

```js
it('member .meta WRITE requires WRITE on the stripped subject, not the container', async () => {
  // alice (owner) can write the private member's .meta
  const ownerPut = await request(`${PRIV}.meta`, {
    method: 'PUT', headers: { 'Content-Type': 'application/ld+json' }, auth: 'alice',
    body: JSON.stringify({ '@id': `${base}${PRIV}`, [DCT_CONFORMS]: { '@id': PROFILE_URI } }),
  });
  assert.ok([200, 201, 204].includes(ownerPut.status), `owner .meta PUT ${ownerPut.status}`);

  // anonymous cannot write the private member's .meta (subject is READ-private,
  // so WRITE is certainly denied) — must be 401/403, NOT 2xx
  const anonPut = await request(`${PRIV}.meta`, {
    method: 'PUT', headers: { 'Content-Type': 'application/ld+json' },
    body: JSON.stringify({ '@id': `${base}${PRIV}`, [DCT_CONFORMS]: { '@id': PROFILE_URI } }),
  });
  assert.ok([401, 403].includes(anonPut.status), `anon .meta PUT should deny, got ${anonPut.status}`);
});

it('a CONTAINER bare .meta write still checks the container (governance up-walk preserved)', async () => {
  // alice controls /alice/public/ so she can write its bare .meta
  const put = await request('/alice/public/.meta', {
    method: 'PUT', headers: { 'Content-Type': 'application/ld+json' }, auth: 'alice',
    body: JSON.stringify({ '@id': `${base}/alice/public/`, [DCT_CONFORMS]: { '@id': PROFILE_URI } }),
  });
  assert.ok([200, 201, 204].includes(put.status), `container .meta PUT ${put.status}`);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test --test-force-exit test/lws-sidecar-authz.test.js`
Expected: the anon-`.meta`-PUT assertion FAILS — the write falls through to the blanket check, resolves the container-default ACL (public container), and is allowed (2xx) instead of denied.

- [ ] **Step 3: Add the `mode` parameter to `authorizeSidecarAccess`**

In `src/auth/middleware.js`, change the signature (~`:577`) and the `checkAccess` mode (~`:596`):

```js
async function authorizeSidecarAccess(request, urlPath, webId, authError, mode = AccessMode.READ) {
```

```js
  // mode is READ for GET/HEAD (the subject's own read gate) and WRITE for
  // PUT/PATCH/DELETE of a client-managed `.meta` (the subject's own write gate)
  // — never the container-default the blanket check would resolve for the
  // sidecar's own path.
  const { allowed, wacAllow } = await checkAccess({
    resourceUrl: subjectUrl,
    resourcePath: storagePath,
    isContainer: isSubjectContainer,
    agentWebId: webId,
    requiredMode: mode
  });
```

The WAC-Allow narrowing (`readOnly`, ~`:603-605`) must stay READ-only for the header regardless of `mode` — a `.meta` sidecar only ever supports GET/HEAD/PUT/PATCH/DELETE on itself, but the WAC-Allow header describes read visibility. Leave `readOnly()` as-is.

- [ ] **Step 4: Widen the `.meta` dispatch branch to all methods**

Replace the GET/HEAD-only `.meta` branch (~`:134`) with a method-aware dispatch:

```js
  if (request.lwsEnabled && urlPath.endsWith('.meta')) {
    const mode = (method === 'GET' || method === 'HEAD') ? AccessMode.READ : AccessMode.WRITE;
    return authorizeSidecarAccess(request, urlPath, webId, authError, mode);
  }
```

Update the block comment above it: reads AND writes now resolve on the stripped subject (reads = READ, writes = WRITE); the trailing-slash derivation still maps a container's bare `/foo/.meta` → `/foo/` so container governance stays writable by container controllers, while a member `/foo/bar.meta` → `/foo/bar` binds the member. Remove the now-stale "GET/HEAD ONLY … must keep requiring WRITE via the unmodified blanket check" wording.

- [ ] **Step 5: Run the test to verify it passes**

Run: `node --test --test-force-exit test/lws-sidecar-authz.test.js`
Expected: PASS (all cases, including the pre-existing C1 GET/HEAD cases — unchanged because `mode` defaults to READ for GET/HEAD).

- [ ] **Step 6: Run the auth + related suites for regressions**

Run: `node --test --test-force-exit test/auth.test.js test/lws-sidecar-authz.test.js test/lws-sidecar-listing.test.js test/lws-listing-authz.test.js`
Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add src/auth/middleware.js test/lws-sidecar-authz.test.js
git commit -m "$(cat <<'EOF'
[Agent: Claude] fix(lws): member .meta writes require WRITE on the stripped subject

- authorizeSidecarAccess gains a mode param (default READ, byte-identical for
  GET/HEAD); .meta dispatch now covers all methods — WRITE for
  PUT/PATCH/DELETE, checked on the stripped subject
- container bare .meta still maps to the container (governance up-walk kept);
  only a private member's .meta write tightens from container-ACL to member-ACL

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

### Task 2: Listing filter resolves sidecar entries via the stripped subject

**Files:**
- Modify: `src/lws/authorized-listing.js` (`filterReadableEntries`, the `else` branch ~`:35-43`)
- Test: `test/lws-sidecar-listing.test.js` (extend) or `test/lws-listing-authz.test.js`

**Interfaces:**
- Consumes: `checkAccess`, `AccessMode` (already imported). `AUX_SUFFIX` from `src/storage/filesystem.js` (`/\.(acl|meta|lwstypes|lwsprov)$/`).
- Produces: no signature change — `filterReadableEntries` behavior only.

- [ ] **Step 1: Write the failing test**

Add a case asserting a private member's `.meta` name does NOT appear in an anonymous listing but DOES for the owner. Reuse the existing sidecar-listing fixtures (a public container with a private member carrying a tighter `.acl` and a `.meta`):

```js
it('a private member .meta is hidden from an anonymous listing, shown to the owner', async () => {
  // PRIV = private member with a tighter own .acl; write its .meta as owner
  await request(`${PRIV}.meta`, {
    method: 'PUT', headers: { 'Content-Type': 'application/ld+json' }, auth: 'alice',
    body: JSON.stringify({ '@id': `${base}${PRIV}`,
      'http://purl.org/dc/terms/conformsTo': { '@id': 'https://example.org/prof/ex' } }),
  });
  const metaName = PRIV.split('/').pop() + '.meta';

  const anon = await request('/alice/public/', { headers: { Accept: 'application/lws+json' } });
  const anonBody = JSON.parse(anon.body);
  assert.ok(!anonBody.items.some(i => i.id.endsWith(metaName)),
    `anon listing must not contain ${metaName}`);

  const owner = await request('/alice/public/', { headers: { Accept: 'application/lws+json' }, auth: 'alice' });
  const ownerBody = JSON.parse(owner.body);
  assert.ok(ownerBody.items.some(i => i.id.endsWith(metaName)),
    `owner listing must contain ${metaName} (DT7)`);
});
```

Note: verify the fixture container serves `application/lws+json` (`items[]`) and that `.meta` is listed there today — `generateLwsContainer` lists `.meta` (only `SYS_SIDECAR` = `.lwstypes`/`.lwsprov` are hidden). If the existing fixture uses `ldp:contains` instead, mirror the check against `contains[].@id`.

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test --test-force-exit test/lws-sidecar-listing.test.js`
Expected: the anon assertion FAILS — the `else` branch checks READ on `<member>.meta`'s own path → container default (public) → allowed → the name leaks.

- [ ] **Step 3: Add a stripped-subject branch for sidecars in the filter**

In `src/lws/authorized-listing.js`, add a branch between the `name.acl` branch (`:28-34`) and the `else` (`:35`). Import `AUX_SUFFIX`:

```js
import { AUX_SUFFIX } from '../storage/filesystem.js';
```

```js
    } else if (e.name !== '.meta' && AUX_SUFFIX.test(e.name)) {
      // A suffixed sidecar (`name.meta`, and defensively `name.lwstypes`/
      // `name.lwsprov`) is Read-gated on the SUBJECT it describes, not on the
      // sidecar's own path — else its bare presence in the listing is the
      // existence oracle this filter exists to close (same findApplicableAcl
      // gap direct-GET closed in db9cdaa/16530a1). `.acl` is handled above;
      // bare `.meta` (the container's own governance sidecar) is excluded here
      // so it keeps resolving against the container via the else branch.
      const subjectName = e.name.replace(AUX_SUFFIX, '');
      ({ allowed } = await checkAccess({
        resourceUrl: baseUrl + subjectName, resourcePath: basePath + subjectName,
        isContainer: false, agentWebId, requiredMode: AccessMode.READ, aclCache,
      }));
    } else {
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test --test-force-exit test/lws-sidecar-listing.test.js`
Expected: PASS (anon hides the member `.meta`, owner shows it).

- [ ] **Step 5: Run the listing + MCP-listing suites for regressions**

Run: `node --test --test-force-exit test/lws-sidecar-listing.test.js test/lws-listing-authz.test.js test/lws-listing-authz-negative.test.js test/mcp-listing-authz.test.js test/lws-items-mediatype.test.js`
Expected: all pass (DT7 mediaType pins for `.acl`/`.meta` still hold — we changed which ACL filters them, not whether they list).

- [ ] **Step 6: Commit**

```bash
git add src/lws/authorized-listing.js test/lws-sidecar-listing.test.js
git commit -m "$(cat <<'EOF'
[Agent: Claude] fix(lws): listing filter resolves member sidecars via the stripped subject

- filterReadableEntries: name.meta (and defensively name.lwstypes/.lwsprov)
  now WAC-filtered by READ on the SUBJECT, not the sidecar's own path — closes
  the private-member-.meta name leak into anonymous items[]/ldp:contains
  (same findApplicableAcl gap direct-GET closed in db9cdaa/16530a1)
- bare container .meta unchanged (resolves against the container); DT7 listing
  of .acl/.meta with correct mediaTypes preserved

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

### Task 3: Reject client writes to System-Managed sidecars at the choke point

**Files:**
- Modify: `src/lws/write-consistency.js` (add a reserved-suffix rejection)
- Modify: `src/handlers/resource.js` (`handleDelete` ~`:2110`) — mirror the rejection for DELETE (which bypasses `applyLwsWrite`)
- Modify: `src/mcp/tools.js` (`delete_resource` ~`:104`) — mirror for the MCP DELETE surface
- Modify: `src/auth/middleware.js` (the `:107` branch) — GET/HEAD-scope it to match `.meta`
- Test: `test/lws-sidecar-authz.test.js` (HTTP + MCP write rejection) and `test/write-consistency.test.js` if present (else the sidecar-authz file)

**Interfaces:**
- Consumes: `writeTypeConsistency({ urlPath, submittedType, lwsEnabled })` returning `{ ok: true }` or `{ ok: false, problem }` (unchanged shape). `AUX_SUFFIX`-style suffix knowledge (use a local `SYS_SIDECAR = /\.(lwstypes|lwsprov)$/` — do NOT reuse storage's `AUX_SUFFIX`, which includes `.acl`/`.meta` that ARE client-writable).
- Produces: for a `*.lwstypes`/`*.lwsprov` write under `--lws`, `writeTypeConsistency` returns `{ ok: false, problem: { status: 405, title: 'Method Not Allowed', detail, instance } }`. HTTP callers map `problem.status` to the reply code (today they hardcode 400 — see Step 4).

- [ ] **Step 1: Write the failing tests**

Add to `test/lws-sidecar-authz.test.js`:

```js
it('a client cannot PUT a System-Managed .lwstypes sidecar (405)', async () => {
  const put = await request(`${OPEN}.lwstypes`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, auth: 'alice',
    body: JSON.stringify(['https://example.org/ex#Injected']),
  });
  assert.equal(put.status, 405, `expected 405, got ${put.status}`);
  assert.match(put.headers['allow'] || '', /GET/, 'Allow header names GET');
});

it('a client cannot PUT a System-Managed .lwsprov sidecar (405)', async () => {
  const put = await request(`${OPEN}.lwsprov`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, auth: 'alice',
    body: JSON.stringify(['https://example.org/prof/injected']),
  });
  assert.equal(put.status, 405, `expected 405, got ${put.status}`);
});
```

For the MCP surface, add to `test/mcp-v2.test.js` (or the fork's MCP write test file — confirm the harness) a `write_resource` call targeting `<subject>.lwstypes` and assert it returns a toolError mentioning "System-Managed". (If the MCP harness lives elsewhere, place it beside the existing `write_resource` tests.)

- [ ] **Step 2: Run to verify they fail**

Run: `node --test --test-force-exit test/lws-sidecar-authz.test.js`
Expected: the 405 cases FAIL — today the write is authorized on READ-of-subject (owner has READ) and `applyLwsWrite` stores the bytes → 200/201/204.

- [ ] **Step 3: Add the reserved-suffix rejection to the gate**

In `src/lws/write-consistency.js`, at the top of `writeTypeConsistency` (after the `if (!lwsEnabled) return { ok: true };` line):

```js
  // System-Managed sidecars (.lwstypes = derived type index, .lwsprov = earned
  // conformsTo provenance) are written ONLY by the server (storage.write direct,
  // src/lws/write.js). A client PUT/POST/PATCH here would overwrite server-derived
  // data — and was only READ-gated (src/auth/middleware.js :107 was method-
  // agnostic). Refuse at the choke point every write surface shares, so MCP
  // write tools can't bypass it (the bug class review #2/#10 closed). READ of
  // these sidecars stays allowed (authorizeSidecarAccess).
  if (/\.(lwstypes|lwsprov)$/.test(urlPath)) {
    return { ok: false, problem: {
      type: 'about:blank', title: 'Method Not Allowed', status: 405,
      detail: 'This is a System-Managed sidecar (server-derived type/provenance metadata); it is read-only to clients — GET/HEAD it, do not write it.',
    } };
  }
```

(`instance` is stamped by `applyLwsWrite` at `:22`, same as the existing gate problem.)

- [ ] **Step 4: Map `problem.status` at the HTTP write callers**

The PUT (`resource.js:2062-2065`) and POST (`container.js:166-169`) callers currently hardcode `reply.code(400)` for `w.problem`. Change both to honor the problem's status and Allow:

```js
  if (!w.ok) {
    if (w.problem) {
      const reply2 = reply.code(w.problem.status || 400).type('application/problem+json');
      if (w.problem.status === 405) reply2.header('Allow', 'GET, HEAD');
      return reply2.send(JSON.stringify(w.problem, null, 2));
    }
    // …existing constraint-violation branch unchanged…
```

Apply the identical change at both call sites. (MCP `write_resource`/`create_resource` already surface `w.problem.detail` via `toolError` — the 405 detail flows through unchanged, no code change there.)

- [ ] **Step 5: Mirror the rejection for DELETE (HTTP + MCP)**

DELETE does not flow through `applyLwsWrite`. In `handleDelete` (`src/handlers/resource.js`, after `getRequestPaths` ~`:2116`):

```js
  if (request.lwsEnabled && /\.(lwstypes|lwsprov)$/.test(storagePath)) {
    reply.header('Allow', 'GET, HEAD');
    return reply.code(405).type('application/problem+json').send(JSON.stringify({
      type: 'about:blank', title: 'Method Not Allowed', status: 405,
      detail: 'This is a System-Managed sidecar; it is read-only to clients.',
      instance: resourceUrl,
    }, null, 2));
  }
```

In `delete_resource` (`src/mcp/tools.js:104`, after the `path` guard):

```js
  if (ctx.lwsEnabled && /\.(lwstypes|lwsprov)$/.test(path)) {
    return toolError(`cannot delete ${path}: System-Managed sidecar (read-only to clients)`);
  }
```

- [ ] **Step 6: GET/HEAD-scope the middleware `.lwstypes`/`.lwsprov` branch**

In `src/auth/middleware.js`, the `:107` branch is method-agnostic. Scope it to reads (writes now fall through to the blanket check and are then refused by the gate/DELETE-guard, so no write can be READ-gated any more):

```js
  if (request.lwsEnabled && (method === 'GET' || method === 'HEAD') && /\.(lwstypes|lwsprov)$/.test(urlPath)) {
    return authorizeSidecarAccess(request, urlPath, webId, authError);
  }
```

Update the block comment to note the method scoping and that writes are refused downstream (gate for PUT/POST/PATCH, `handleDelete` guard for DELETE).

- [ ] **Step 7: Run the tests to verify they pass**

Run: `node --test --test-force-exit test/lws-sidecar-authz.test.js`
Expected: PASS (405 on `.lwstypes`/`.lwsprov` PUT with `Allow: GET, HEAD`).

- [ ] **Step 8: Run the write-path + gate + type-metadata suites for regressions**

Run: `node --test --test-force-exit test/lws-admission-put.test.js test/lws-admission-post.test.js test/lws-type-metadata.test.js test/lws-sidecar-authz.test.js`
Expected: all pass — server-side `.lwstypes`/`.lwsprov` writes go through `storage.write` direct (not the gate) so type-capture is unaffected.

- [ ] **Step 9: Commit**

```bash
git add src/lws/write-consistency.js src/handlers/resource.js src/handlers/container.js src/mcp/tools.js src/auth/middleware.js test/lws-sidecar-authz.test.js test/mcp-v2.test.js
git commit -m "$(cat <<'EOF'
[Agent: Claude] fix(lws): System-Managed sidecars are read-only to clients (405)

- writeTypeConsistency refuses client PUT/POST/PATCH of *.lwstypes/*.lwsprov at
  the applyLwsWrite choke point (HTTP + all MCP write tools) with a teaching 405
- handleDelete + MCP delete_resource mirror the rejection (DELETE bypasses the
  gate); HTTP PUT/POST callers now honor problem.status + emit Allow: GET, HEAD
- middleware .lwstypes/.lwsprov branch GET/HEAD-scoped to match .meta — writes
  are no longer READ-gated (they fall through and are refused downstream);
  closes the "cosmetic" method-scope asymmetry as an integrity fix

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## CLUSTER 3 — Federation guard completion

### Task 4: Widen the IPv6 link-local and multicast ranges

**Files:**
- Modify: `src/utils/ssrf.js` (`ipv6Private` ~`:60-67`)
- Test: `test/mcp-federation-hardening.test.js`

**Interfaces:**
- Consumes: `isPrivateIP(ip)` (unchanged signature).
- Produces: `isPrivateIP` now returns true for the full `fe80::/10` and `ff00::/8`.

- [ ] **Step 1: Write the failing tests**

Add to `test/mcp-federation-hardening.test.js` (beside the existing `isPrivateIP`/`isBlockedHost` unit cases — match the file's assertion style):

```js
// fe80::/10 link-local (first hextet fe80–febf), not just literal fe80
for (const ip of ['fe80::1', 'fe81::1', 'fe9f::1', 'feaf::1', 'febf::1']) {
  assert.equal(isPrivateIP(ip), true, `${ip} is link-local (fe80::/10)`);
}
// fec0:: is site-local-deprecated, OUTSIDE fe80::/10 — must stay unblocked here
assert.equal(isPrivateIP('fec0::1'), false, 'fec0:: is not in fe80::/10');

// ff00::/8 multicast (first hextet ff00–ffff), not just literal ff00
for (const ip of ['ff00::1', 'ff02::1', 'ff02::2', 'ff05::1', 'ff0e::1', 'ffff::1']) {
  assert.equal(isPrivateIP(ip), true, `${ip} is multicast (ff00::/8)`);
}
```

- [ ] **Step 2: Run to verify they fail**

Run: `node --test --test-force-exit test/mcp-federation-hardening.test.js`
Expected: the `fe81`/`fe9f`/`feaf`/`febf` and all `ff02`/`ff05`/`ff0e`/`ffff` cases FAIL (literal `/^fe80:/`/`/^ff00:/` don't match them).

- [ ] **Step 3: Widen the regexes**

In `src/utils/ssrf.js`, edit the two lines (~`:64,:66`):

```js
    /^fe[89ab]/i, // Link-local fe80::/10 (first hextet fe80–febf; widened from the fe80: literal)
    /^f[cd]/i, // Unique local (fc00::/7)
    /^ff/i, // Multicast ff00::/8 (first hextet ff00–ffff; widened from the ff00: literal)
```

Note ordering: `/^f[cd]/i` stays; the `fe[89ab]` and `ff` widenings do not overlap it (`fc`/`fd` vs `fe`/`ff`). `fec0::` correctly falls outside all three.

- [ ] **Step 4: Run to verify they pass**

Run: `node --test --test-force-exit test/mcp-federation-hardening.test.js`
Expected: PASS (all link-local/multicast cases + the `fec0::` negative).

- [ ] **Step 5: Commit**

```bash
git add src/utils/ssrf.js test/mcp-federation-hardening.test.js
git commit -m "$(cat <<'EOF'
[Agent: Claude] fix(ssrf): widen IPv6 link-local + multicast to full ranges

- fe80: literal → fe[89ab] (full fe80::/10); ff00: literal → ff (full ff00::/8)
- closes the escape where fe81::/fe9f::/febf:: (link-local) and every real
  multicast form (ff02::1 all-nodes, ff05::, ff0e::) slipped the guard
- both consumer families (validateExternalUrl + isBlockedHost) inherit the
  one shared table

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

### Task 5: DNS pre-check on the MCP federation read arm

**Files:**
- Modify: `src/mcp/read-tools.js` (`readRemote` hop loop ~`:138-166`)
- Modify: `src/mcp/ssrf.js` (add a resolving check helper; update the scope comment ~`:8-17`)
- Test: `test/mcp-federation-hardening.test.js`

**Interfaces:**
- Consumes: `isPrivateIP`, `embeddedV4` (already imported in `src/mcp/ssrf.js`); `dns` from `node:dns/promises`; existing `isBlockedHost(hostname, { allowPrivate })`.
- Produces: `resolvesToBlockedHost(hostname, { allowPrivate }) => Promise<boolean>` in `src/mcp/ssrf.js` — resolves A/AAAA and returns true if ANY address is private (or resolution fails, fail-closed); returns false when `allowPrivate` is true or the hostname is an IP literal.

- [ ] **Step 1: Write the failing test**

Add a `readRemote`-level test that a hostname resolving to a private IP is blocked even though its literal form is a public-looking name. The file already tests `read_resource` end-to-end; use its harness. Use a hostname that resolves to loopback — the cleanest is a name under the test's control, or assert at the `resolvesToBlockedHost` unit level:

```js
import { resolvesToBlockedHost } from '../src/mcp/ssrf.js';

it('resolvesToBlockedHost blocks a name that resolves to a private IP', async () => {
  // localhost resolves to 127.0.0.1 / ::1 — both private
  assert.equal(await resolvesToBlockedHost('localhost', {}), true);
});
it('resolvesToBlockedHost allows a name that resolves to a public IP', async () => {
  // example.com resolves to public addresses (network-dependent; skip if offline)
  const blocked = await resolvesToBlockedHost('example.com', {});
  assert.equal(blocked, false);
});
it('resolvesToBlockedHost is a no-op when allowPrivate', async () => {
  assert.equal(await resolvesToBlockedHost('localhost', { allowPrivate: true }), false);
});
it('resolvesToBlockedHost skips IP literals (handled by isBlockedHost)', async () => {
  assert.equal(await resolvesToBlockedHost('93.184.216.34', {}), false);
});
```

(If the CI/offline environment can't resolve `example.com`, guard that one case with a try/skip — note it in the task. The `localhost` and literal cases are deterministic.)

- [ ] **Step 2: Run to verify it fails**

Run: `node --test --test-force-exit test/mcp-federation-hardening.test.js`
Expected: FAIL — `resolvesToBlockedHost` is not exported yet ("not a function").

- [ ] **Step 3: Add `resolvesToBlockedHost` to `src/mcp/ssrf.js`**

```js
import dns from 'node:dns/promises';
```

```js
// Resolve a hostname and block if ANY A/AAAA answer is a private/internal
// address — shrinks the literal-only window (isBlockedHost checks only the
// literal hostname) to a per-request resolve-and-check on the federation arm.
// Fail-closed: a name that won't resolve can't be fetched anyway, so treat a
// resolution error as blocked. No-op under allowPrivate or for IP literals
// (isBlockedHost already covers literals).
export async function resolvesToBlockedHost(hostname, { allowPrivate = false } = {}) {
  if (allowPrivate) return false;
  const h = (hostname || '').toLowerCase().replace(/^\[|\]$/g, '');
  if (net.isIP(h)) return false;               // literal — isBlockedHost handled it
  try {
    const [v4, v6] = await Promise.all([
      dns.resolve4(h).catch(() => []),
      dns.resolve6(h).catch(() => []),
    ]);
    const all = [...v4, ...v6];
    if (all.length === 0) return true;         // fail-closed: no address = block
    return all.some(ip => {
      const mapped = embeddedV4(ip);
      return isPrivateIP(mapped || ip);
    });
  } catch {
    return true;                               // fail-closed
  }
}
```

- [ ] **Step 4: Wire it into the `readRemote` hop loop**

In `src/mcp/read-tools.js`, import it (`:25` area, beside `isBlockedHost`):

```js
import { isBlockedHost, resolvesToBlockedHost } from './ssrf.js';
```

Inside the hop loop, right after the literal `isBlockedHost` check (~`:139-143`) and before `fetch`:

```js
    if (await resolvesToBlockedHost(target.hostname, { allowPrivate: ctx.federationPrivate })) {
      return toolError(
        `federation blocked: ${target.href} resolves to a private/internal address (set --lws-federation-private to allow)`
      );
    }
```

Because the loop re-enters on every redirect (`target = new URL(loc, target)`), each hop is resolve-checked.

- [ ] **Step 5: Update the scope comment**

In `src/mcp/ssrf.js` (~`:8-17`), change the "DNS rebinding … OUT of scope" wording: DNS-name-to-private-IP is now resolved and blocked per hop at request time; only connect-time TOCTOU rebinding (a name that resolves public at check time and private at connect time) remains out of scope, needing an undici dispatcher with a pinned-lookup `connect` that the global `fetch` here doesn't take.

- [ ] **Step 6: Run to verify pass + the rig opt-out still works**

Run: `node --test --test-force-exit test/mcp-federation-hardening.test.js`
Expected: PASS. Confirm a `federationPrivate: true` case (already in the file, or add one) still allows a private target — the local rig depends on it.

- [ ] **Step 7: Commit**

```bash
git add src/mcp/ssrf.js src/mcp/read-tools.js test/mcp-federation-hardening.test.js
git commit -m "$(cat <<'EOF'
[Agent: Claude] fix(ssrf): resolve-and-check the MCP federation arm per hop

- resolvesToBlockedHost resolves A/AAAA and blocks any private answer
  (fail-closed on resolution failure); wired into readRemote's hop loop after
  the literal isBlockedHost gate, so every redirect hop is DNS-checked
- reuses the resolve capability validateExternalUrl already had but the
  federation arm never called; honors --lws-federation-private (rig opt-out)
- narrows the recorded out-of-scope from "DNS rebinding" to connect-time TOCTOU
  only (needs an undici dispatcher the global fetch here doesn't take)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## CLUSTER 2 — PATCH at the choke point + patch-family conformance

### Task 6: Route all PATCH write branches through `applyLwsWrite`

**Files:**
- Modify: `src/handlers/resource.js` (`patchTurtleFamilyResource` ~`:2274-2336`; legacy-SPARQL branch write ~`:2515`; JSON-LD-document branch write ~`:2616`)
- Test: `test/lws-admission-put.test.js`-style new file `test/lws-patch-admission.test.js`

**Interfaces:**
- Consumes: `applyLwsWrite({ storage, storagePath, resourceUrl, content, contentType, declaredTypes, lwsEnabled })` → `{ ok, wrote, shapeUrl, advisories }` | `{ ok:false, problem }` | `{ ok:false, shapeUrl, violations }` (already imported in `resource.js`).
- Produces: PATCH success unchanged (200/204); a PATCH whose RESULT violates the container SHACL shape → 400 problem+json (new); `.lwstypes`/`.lwsprov` re-derived from the patched bytes.
- **contentType rule:** pass the RESOURCE's stored/effective content type, never the patch media type. Turtle-family branch: the stored RDF type (`storedType`). JSON-LD-document + legacy-SPARQL branches: `application/ld+json` (the document is JSON-LD by then). This keeps `subjectTypesFromBody`/the gate reading the right serialization.

- [ ] **Step 1: Write the failing test**

Create `test/lws-patch-admission.test.js` (neutral `ex:` fixtures; a governed container whose shape requires `dct:title`):

```js
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startTestServer, stopTestServer, request, createTestPod, getBaseUrl } from './helpers.js';

// A container governed by a shape that requires dct:title on ex:Thing.
// A PATCH that deletes the title must be refused (400) — admission holds on the
// PATCH surface, not just PUT/POST. A type-mutating PATCH must refresh .lwstypes.
describe('PATCH routes through applyLwsWrite (admission + type reindex)', () => {
  let base;
  before(async () => {
    await startTestServer({ lws: true, conneg: true });
    await createTestPod('alice');
    base = getBaseUrl();
    // (fixture setup: PUT a container .meta pointing at a title-required shape,
    //  PUT a member ex:Thing with a dct:title — see lws-admission-put.test.js
    //  for the shape/.meta wiring pattern; reuse it verbatim with ex: terms.)
  });
  after(async () => { await stopTestServer(); });

  it('a PATCH that violates the container shape is rejected 400', async () => {
    // N3 Patch deleting the required dct:title
    const patch = `@prefix solid: <http://www.w3.org/ns/solid/terms#>.
_:p a solid:InsertDeletePatch;
  solid:deletes { <${base}/alice/governed/thing.ttl#it> <http://purl.org/dc/terms/title> "T" }.`;
    const res = await request('/alice/governed/thing.ttl', {
      method: 'PATCH', headers: { 'Content-Type': 'text/n3' }, auth: 'alice', body: patch,
    });
    assert.equal(res.status, 400, `shape-violating PATCH must 400, got ${res.status}`);
  });

  it('a PATCH mutating rdf:type refreshes .lwstypes', async () => {
    // insert a second rdf:type, then GET the .lwstypes sidecar (owner) and
    // assert the new type is present
    const patch = `@prefix solid: <http://www.w3.org/ns/solid/terms#>.
_:p a solid:InsertDeletePatch;
  solid:inserts { <${base}/alice/governed/thing.ttl#it> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <https://example.org/ex#Extra> }.`;
    const res = await request('/alice/governed/thing.ttl', {
      method: 'PATCH', headers: { 'Content-Type': 'text/n3' }, auth: 'alice', body: patch,
    });
    assert.ok([200, 204].includes(res.status), `type-add PATCH ${res.status}`);
    const types = await request('/alice/governed/thing.ttl.lwstypes', { auth: 'alice' });
    assert.match(types.body, /example\.org\/ex#Extra/, '.lwstypes has the new type');
  });
});
```

(The fixture wiring — governed container `.meta` + shape resource — must mirror `test/lws-admission-put.test.js`. The implementer reads that file for the exact shape/`.meta` PUT sequence and adapts it to `ex:` terms; do not invent a new admission-setup path.)

- [ ] **Step 2: Run to verify it fails**

Run: `node --test --test-force-exit test/lws-patch-admission.test.js`
Expected: FAIL — today PATCH calls `storage.write` directly, so the shape-violating delete succeeds (204) and `.lwstypes` is untouched (no new type).

- [ ] **Step 3: Route `patchTurtleFamilyResource`'s write through `applyLwsWrite`**

Replace the direct `storage.write` (~`:2321`) with:

```js
  const updatedContent = await datasetToFormat(dataset, QUADS_OUTPUTS[storedType] || RDF_TYPES.NQUADS);

  const w = await applyLwsWrite({
    storage, storagePath, resourceUrl,
    content: Buffer.from(updatedContent),
    contentType: storedType,        // the resource's own type, NOT the patch media type
    declaredTypes: [],
    lwsEnabled: request.lwsEnabled,
  });
  if (!w.ok) {
    if (w.problem) {
      const r = reply.code(w.problem.status || 400).type('application/problem+json');
      if (w.problem.status === 405) r.header('Allow', 'GET, HEAD');
      return r.send(JSON.stringify(w.problem, null, 2));
    }
    reply.header('content-type', 'application/problem+json');
    if (w.shapeUrl) reply.header('Link', `<${w.shapeUrl}>; rel="describedby"`);
    return reply.code(400).send(constraintProblem({ shapeUrl: w.shapeUrl, violations: w.violations, instance: resourceUrl }));
  }
  if (!w.wrote) return reply.code(500).send({ error: 'Write failed' });
```

Keep the header/notification/204 tail. (`constraintProblem` is already imported in `resource.js` — confirm; if not, import it from where `handlePut` gets it.)

- [ ] **Step 4: Route the JSON-LD-document branch write through `applyLwsWrite`**

Replace the direct `storage.write` (~`:2616`) with the same `applyLwsWrite` call, but `contentType: RDF_TYPES.JSON_LD` and preserving the `htmlWrapper` re-embedding for the CONTENT only:

```js
  let updatedContent;
  if (htmlWrapper) {
    const jsonLdStr = JSON.stringify(updatedDocument, null, 2);
    updatedContent = htmlWrapper.before + '\n' + jsonLdStr + '\n  ' + htmlWrapper.after;
  } else {
    updatedContent = JSON.stringify(updatedDocument, null, 2);
  }
  const w = await applyLwsWrite({
    storage, storagePath, resourceUrl,
    content: Buffer.from(updatedContent),
    contentType: RDF_TYPES.JSON_LD,
    declaredTypes: [],
    lwsEnabled: request.lwsEnabled,
  });
  // …same !w.ok / !w.wrote handling as Step 3…
```

Note: when `htmlWrapper` is set, the stored bytes are HTML, not JSON-LD — passing `RDF_TYPES.JSON_LD` would make the gate/admission misread it. Guard: if `htmlWrapper`, keep the direct `storage.write` (HTML data-island documents are not governed RDF sources on the write surface) and only route the pure-JSON-LD case through `applyLwsWrite`. Add an inline comment explaining the split.

- [ ] **Step 5: Route the legacy-SPARQL Turtle-fallback branch (~`:2515`)**

This branch (inside the `catch` when the stored bytes aren't JSON — reached only under `--lws`-off or a non-Turtle-family stored doc) writes Turtle. Under `--lws` this branch is not reached (Turtle-family goes through `patchTurtleFamilyResource`). Leave it as a direct `storage.write` but confirm via a comment that it's the `--lws`-off / non-verbatim path (byte-identity constraint). If a test shows it reachable under `--lws`, route it through `applyLwsWrite` with `contentType: RDF_TYPES.TURTLE`.

- [ ] **Step 6: Pin legacy (`--lws`-off) PATCH byte-identity**

Run the existing PATCH suite with `--lws` off to confirm no behavior change:

Run: `node --test --test-force-exit test/ldp.test.js test/conditional.test.js` (whichever cover PATCH without `--lws` — confirm by grep for `handlePatch`/`PATCH` in the test dir).
Expected: all pass, byte-identical.

- [ ] **Step 7: Run the new admission test + full PATCH-related suites**

Run: `node --test --test-force-exit test/lws-patch-admission.test.js test/lws-conneg.test.js test/lws-preservation.test.js`
Expected: PASS (shape-violating PATCH 400s; type-mutating PATCH refreshes `.lwstypes`; Turtle round-trip preservation still byte-exact).

- [ ] **Step 8: Commit**

```bash
git add src/handlers/resource.js test/lws-patch-admission.test.js
git commit -m "$(cat <<'EOF'
[Agent: Claude] fix(lws): PATCH routes through applyLwsWrite (admission + type reindex)

- all --lws PATCH write branches (Turtle-family, JSON-LD document) now go
  through the shared write choke point: SHACL admission holds on PATCH (a
  shape-violating patch 400s, not silently succeeds), .lwstypes/.lwsprov
  re-derive from the patched bytes (closes the stale-type seed)
- contentType passed is the RESOURCE's stored type, never the patch media type;
  HTML data-island writes stay direct (not a governed RDF source on write);
  legacy --lws-off PATCH byte-identical

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

### Task 7: Rehome the dataset-patch helpers to `src/patch/dataset-patch.js`

**Files:**
- Create: `src/patch/dataset-patch.js`
- Modify: `src/handlers/resource.js` (remove the helpers ~`:2192-2263`, import them instead)
- Test: existing PATCH suites pin behavior (no new test — pure move)

**Interfaces:**
- Produces: `src/patch/dataset-patch.js` exports `termFromId(value)`, `termFromPatchObject(object, ambiguous)`, `applyPatchToDataset(dataset, { deletes, inserts }, ambiguous)`.
- Consumes (threaded as imports into the new module): `DataFactory` from `n3` (the module already imports n3 elsewhere — the new file imports its own `{ DataFactory }`).

- [ ] **Step 1: Create the new module**

Move the lead comment (`:2192-2208`), the `N3DataFactory` destructure (`:2209-2210`), `termFromId`, `termFromPatchObject`, and `applyPatchToDataset` into `src/patch/dataset-patch.js`. The new file imports its own factory:

```js
// src/patch/dataset-patch.js
// Term-level dataset patch helpers — apply parsed {deletes, inserts} directly
// on an rdf-ext dataset (default graph only). Extracted from handlers/resource.js
// (next-fork round): the orchestration (patchTurtleFamilyResource) stays in the
// handler; these pure term builders live beside n3-patch.js / merge-patch.js.
import { DataFactory as N3DataFactory } from 'n3';

const { namedNode: patchNamedNode, literal: patchLiteral, blankNode: patchBlankNode,
  quad: patchQuad, defaultGraph: patchDefaultGraph } = N3DataFactory;

export function termFromId(value) { /* …verbatim… */ }
export function termFromPatchObject(object, ambiguous) { /* …verbatim… */ }
export function applyPatchToDataset(dataset, { deletes = [], inserts = [] }, ambiguous) { /* …verbatim… */ }
```

Copy the three function bodies exactly as they are at `resource.js:2212-2263` (including the `ambiguous`-flag comments).

- [ ] **Step 2: Import them in `resource.js`**

Remove `:2192-2263` from `resource.js` and add near the other `src/patch/` imports (`:10-12`):

```js
import { termFromId, termFromPatchObject, applyPatchToDataset } from '../patch/dataset-patch.js';
```

Confirm `resource.js` no longer references `N3DataFactory` elsewhere; if it does, leave that destructure. `patchTurtleFamilyResource` keeps calling `applyPatchToDataset` (now imported).

- [ ] **Step 3: Run the PATCH suites (behavior must be byte-identical)**

Run: `node --test --test-force-exit test/lws-conneg.test.js test/lws-preservation.test.js test/lws-patch-admission.test.js`
Expected: all pass unchanged.

- [ ] **Step 4: Commit**

```bash
git add src/patch/dataset-patch.js src/handlers/resource.js
git commit -m "$(cat <<'EOF'
[Agent: Claude] refactor(patch): rehome dataset-patch helpers to src/patch/

- termFromId / termFromPatchObject / applyPatchToDataset moved verbatim out of
  handlers/resource.js into src/patch/dataset-patch.js, beside n3-patch.js and
  merge-patch.js; orchestration stays in the handler. Pure move, no behavior
  change (PATCH suites pin it).

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

### Task 8: N3-Patch conformance — wire `validatePatch`, implement `solid:where`, fix blank-node subjects

**Files:**
- Modify: `src/patch/n3-patch.js` (`applyN3Patch` ~`:274`; `insertTriple`/`deleteTriple`; export/wire `validatePatch`)
- Modify: `src/patch/dataset-patch.js` (existence check for the dataset path, to match)
- Modify: `src/handlers/resource.js` (call the validation before applying, in both PATCH paths)
- Test: `test/n3-patch.test.js` (if present; else new `test/lws-patch-n3-conformance.test.js`)

**Interfaces:**
- Consumes: `parseN3Patch` → `{ inserts, deletes, where }`; `validatePatch(document, patch, baseUri)` → `{ valid, error }` (already exists, `:500`).
- Produces: a delete of a non-existent triple → 409; a `solid:where` with != 1 solution → 409; blank-node subjects insert/delete correctly.

- [ ] **Step 1: Write the failing tests**

Create `test/lws-patch-n3-conformance.test.js`:

```js
// (a) delete-of-nonexistent → 409
it('N3 Patch delete of a non-existent triple is a 409, not a silent no-op', async () => {
  const patch = `@prefix solid: <http://www.w3.org/ns/solid/terms#>.
_:p a solid:InsertDeletePatch;
  solid:deletes { <${base}/alice/pub/doc.ttl#it> <http://purl.org/dc/terms/title> "NOT THERE" }.`;
  const res = await request('/alice/pub/doc.ttl', {
    method: 'PATCH', headers: { 'Content-Type': 'text/n3' }, auth: 'alice', body: patch });
  assert.equal(res.status, 409, `delete-of-nonexistent must 409, got ${res.status}`);
});

// (b) solid:where matching a single solution applies; zero/multiple → 409
it('N3 Patch solid:where with one solution applies', async () => {
  // fixture doc has <#it> dct:title "Old" ; where binds ?t=Old, delete ?t, insert "New"
  const patch = `@prefix solid: <http://www.w3.org/ns/solid/terms#>.
@prefix dct: <http://purl.org/dc/terms/>.
_:p a solid:InsertDeletePatch;
  solid:where   { <${base}/alice/pub/doc.ttl#it> dct:title ?t };
  solid:deletes { <${base}/alice/pub/doc.ttl#it> dct:title ?t };
  solid:inserts { <${base}/alice/pub/doc.ttl#it> dct:title "New" }.`;
  const res = await request('/alice/pub/doc.ttl', {
    method: 'PATCH', headers: { 'Content-Type': 'text/n3' }, auth: 'alice', body: patch });
  assert.ok([200, 204].includes(res.status), `where-single-solution ${res.status}`);
});
```

(The implementer sets up the `doc.ttl` fixture with a known `dct:title` in `before`.)

- [ ] **Step 2: Run to verify they fail**

Run: `node --test --test-force-exit test/lws-patch-n3-conformance.test.js`
Expected: (a) FAILS (delete-of-nonexistent returns 204 — silent no-op); (b) may pass-by-accident (unconditional apply) — strengthen it in Step 5 with a multi-solution 409 case that today wrongly succeeds.

- [ ] **Step 3: Wire `validatePatch` into the JSON-LD-document path**

In `src/handlers/resource.js`, in the N3-Patch branch (~`:2585-2604`), before `applyN3Patch`:

```js
    const check = validatePatch(document, patch, resourceUrl);
    if (!check.valid) {
      return reply.code(409).type('application/problem+json').send(JSON.stringify({
        type: 'about:blank', title: 'Conflict', status: 409,
        detail: check.error, instance: resourceUrl,
      }, null, 2));
    }
```

Import `validatePatch` (already imported at `resource.js:10` — confirm it's in the import list; if only `parseN3Patch`/`applyN3Patch` are named, add it).

- [ ] **Step 4: Add an existence check to the dataset (Turtle-family) path**

In `patchTurtleFamilyResource` (N3-Patch branch), before `applyPatchToDataset(dataset, patch, true)`, check every delete triple exists in the dataset (rdf-ext `dataset.match(...)` with the built terms) and 409 if any is absent — mirroring `validatePatch`'s contract on the dataset representation. Add a helper `patchDeletesExist(dataset, patch, ambiguous)` in `src/patch/dataset-patch.js`:

```js
export function patchDeletesExist(dataset, { deletes = [] }, ambiguous) {
  for (const t of deletes) {
    const match = dataset.match(
      termFromId(t.subject), patchNamedNode(t.predicate),
      termFromPatchObject(t.object, ambiguous), patchDefaultGraph());
    if (match.size === 0) return { ok: false, missing: t };
  }
  return { ok: true };
}
```

Call it in the handler; 409 with a teaching detail if `!ok`. (SPARQL Update deletes stay best-effort no-op — SPARQL has no MUST-exist contract; only the N3-Patch path validates.)

- [ ] **Step 5: Implement `solid:where` single-solution matching**

In `src/patch/n3-patch.js`, add where-binding to `applyN3Patch` (and a dataset-path equivalent). Minimal single-triple-pattern support (the parser already yields `{ variable }` markers via `resolveValue`):
- If `patch.where` is non-empty: match each where triple against the document/dataset, collect variable bindings; require exactly one consistent solution across all where triples. Zero or multiple → throw a `PatchConflict` the handler maps to 409.
- Substitute the single solution's bindings into `deletes` and `inserts` before applying.
- **Floor (if full binding proves large):** if `patch.where` is non-empty and multi-pattern/complex, reject with a 409 "conditional patch not supported for this where clause" rather than applying unconditionally — the one outcome forbidden is silent unconditional application. Document the chosen extent in a comment.

Add tests for zero-solution and multi-solution → 409.

- [ ] **Step 6: Fix blank-node subjects in `insertTriple`/`deleteTriple`**

In `src/patch/n3-patch.js`, `insertTriple` (~`:341`) uses `subject` directly as `@id`; when `subject` is a `{ blankNode }` marker (from `resolveValue`), mint/reuse a `_:`-prefixed id. `deleteTriple` (~`:305`) string-compares `resolvedNodeId === subject` — handle the blank-node marker by structural match. Add a test inserting and deleting a triple with a blank-node subject.

- [ ] **Step 7: Run the conformance suite + full N3/SPARQL PATCH suites**

Run: `node --test --test-force-exit test/lws-patch-n3-conformance.test.js test/lws-conneg.test.js`
Expected: PASS. Also run any `test/*n3*` / `test/*sparql*` / `test/*patch*` files present.

- [ ] **Step 8: Commit**

```bash
git add src/patch/n3-patch.js src/patch/dataset-patch.js src/handlers/resource.js test/lws-patch-n3-conformance.test.js
git commit -m "$(cat <<'EOF'
[Agent: Claude] fix(patch): N3-Patch conformance — validate deletes, apply where, blank-node subjects

- wire validatePatch (JSON-LD path) + patchDeletesExist (dataset path): a
  delete of a non-existent triple is a 409, not a silent no-op (Solid N3-Patch)
- implement solid:where single-solution matching (zero/multiple → 409); a
  conditional patch never applies unconditionally again
- fix blank-node SUBJECTS in insertTriple/deleteTriple (JSON-LD path); aligns
  with the dataset path's termFromId handling

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

### Task 9: 404 `Accept-Patch` parity under `--lws`

**Files:**
- Modify: `src/ldp/headers.js` (`getNotFoundHeaders` ~`:177-199`)
- Modify: `src/handlers/resource.js` (the three 404 call sites: `:363`, `:1584`, `:2123`)
- Test: `test/lws-conneg.test.js` or `test/conneg.test.js` (a 404 GET under `--lws` advertises merge-patch)

**Interfaces:**
- Consumes: `getAcceptHeaders(connegEnabled, isContainer, lwsEnabled)` (already used by the 200 path).
- Produces: `getNotFoundHeaders({ resourceUrl, origin, connegEnabled, mashlibEnabled, lwsEnabled })` — new optional `lwsEnabled`; when falsy, byte-identical to today.

- [ ] **Step 1: Write the failing test**

```js
it('a 404 under --lws advertises merge-patch in Accept-Patch', async () => {
  const res = await request('/alice/nonexistent.ttl', { method: 'GET', auth: 'alice' });
  assert.equal(res.status, 404);
  assert.match(res.headers['accept-patch'] || '', /merge-patch\+json/, '404 Accept-Patch names merge-patch');
});
```

(Confirm the request path actually reaches a `getNotFoundHeaders` 404 branch and not the referent 303 — use a plain `.ttl` name not covered by any uriSpace.)

- [ ] **Step 2: Run to verify it fails**

Run: `node --test --test-force-exit test/lws-conneg.test.js`
Expected: FAIL — 404 `Accept-Patch` is the hardcoded narrow `text/n3, application/sparql-update`.

- [ ] **Step 3: Add `lwsEnabled` to `getNotFoundHeaders`**

In `src/ldp/headers.js`:

```js
export function getNotFoundHeaders({ resourceUrl = null, origin = null, connegEnabled = false, mashlibEnabled = false, lwsEnabled = false }) {
  const isContainer = resourceUrl?.endsWith('/') || false;
  const aclUrl = resourceUrl ? getAclUrl(resourceUrl, isContainer) : null;
  const acceptHeaders = getAcceptHeaders(connegEnabled, isContainer, lwsEnabled);

  const headers = {
    ...getCorsHeaders(origin),
    'Link': aclUrl ? `<${aclUrl}>; rel="acl"` : '',
    'Accept-Patch': acceptHeaders['Accept-Patch'],   // lws-aware (adds merge-patch under --lws)
    'Accept-Put': acceptHeaders['Accept-Put'] || 'application/ld+json, */*',
    'Allow': 'GET, HEAD, PUT, PATCH, OPTIONS' + (isContainer ? ', POST' : ''),
    'Vary': getVaryHeader(connegEnabled, mashlibEnabled)
  };
  if (isContainer && acceptHeaders['Accept-Post']) headers['Accept-Post'] = acceptHeaders['Accept-Post'];
  return headers;
}
```

- [ ] **Step 4: Thread `lwsEnabled` from the three call sites**

At `resource.js:363`, `:1584`, `:2123` (the DELETE 404), add `lwsEnabled: request.lwsEnabled` to each `getNotFoundHeaders({...})` call. Verify all three by grepping:

Run: `grep -n "getNotFoundHeaders(" src/handlers/resource.js`
Expected: three call sites; each now passes `lwsEnabled`.

- [ ] **Step 5: Run to verify pass + `--lws`-off byte-identity**

Run: `node --test --test-force-exit test/lws-conneg.test.js test/conneg.test.js`
Expected: PASS; the non-`--lws` conneg tests unchanged (truthy check).

- [ ] **Step 6: Commit**

```bash
git add src/ldp/headers.js src/handlers/resource.js test/lws-conneg.test.js
git commit -m "$(cat <<'EOF'
[Agent: Claude] fix(lws): 404 Accept-Patch advertises merge-patch under --lws

- getNotFoundHeaders gains lwsEnabled, reuses getAcceptHeaders' lws-aware
  Accept-Patch (the 200 path already had it); threaded through all three 404
  call sites. --lws-off byte-identical.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## CLUSTER 4 — Structured uriSpace on the capability

### Task 10: Add `uriSpace` recognition prefixes to the ReferentResolution capability

**Files:**
- Modify: `src/lws/storage-description.js` (`buildStorageDescription` signature + the ReferentResolution capability ~`:141-148`)
- Modify: `src/server.js` (the HTTP builder call ~`:1077-1079`)
- Modify: `src/mcp/resources.js` (the MCP builder call ~`:71-78`) and `src/mcp/index.js` (ctx ~`:247-260`)
- Test: `test/lws-referent-capability.test.js` (extend)

**Interfaces:**
- Consumes: pod-config `uriSpaces` array of `{ pathPrefix, container, suffix? }` (already read at both call sites); `origin`.
- Produces: `buildStorageDescription(origin, { …, referentResolutionEnabled, uriSpacePrefixes })` — new optional `uriSpacePrefixes: string[]` (absolute URIs). When present and non-empty, the ReferentResolution capability gains `uriSpace: [...]`. Absent/empty → capability shape byte-identical to today.

- [ ] **Step 1: Write the failing test**

Extend `test/lws-referent-capability.test.js` (it already asserts the capability `type`/`hint` shape — read it first for its harness). Add:

```js
it('the ReferentResolution capability carries structured uriSpace prefixes', async () => {
  // built with uriSpaces = [{ pathPrefix: 'id/', container: '/alice/wiki/' }]
  const cap = sd.capability.find(c => c.type === REFERENT_CAP);
  assert.ok(Array.isArray(cap.uriSpace), 'uriSpace is an array');
  assert.ok(cap.uriSpace.some(u => u.endsWith('/id/')), 'uriSpace names the minted prefix');
});
```

(If the test file builds `buildStorageDescription` directly with flags, add `uriSpacePrefixes: [`${origin}/id/`]` to that call. Match the file's existing construction.)

- [ ] **Step 2: Run to verify it fails**

Run: `node --test --test-force-exit test/lws-referent-capability.test.js`
Expected: FAIL — `cap.uriSpace` is undefined (capability is `{type, hint}` only).

- [ ] **Step 3: Add the field to the builder**

In `src/lws/storage-description.js`, add `uriSpacePrefixes = []` to the destructured options (`:62`) and update the ReferentResolution push (`:141-148`):

```js
  if (referentResolutionEnabled) {
    const cap = {
      type: 'https://w3id.org/lws-pod/capability/ReferentResolution',
      hint: 'This storage dereferences minted subject-IRI names by 303 redirect to their backing resource. A name under one of the uriSpace prefixes below resolves via GET; the referent is the #it fragment. Discover typed referents via the Type Search service.',
    };
    // Recognition prefixes (steering, unmapped like the sibling hints): the
    // void:uriSpace values, so a cold agent recognizes a minted IRI on its
    // FIRST read of the storage description instead of confirming the prefix
    // from the VoID document two hops later (probe #2). Prefixes only — the
    // container/suffix mapping stays internal; the 303 is the resolver.
    if (uriSpacePrefixes.length) cap.uriSpace = uriSpacePrefixes;
    capability.push(cap);
  }
```

- [ ] **Step 4: Compute + thread the prefixes at the HTTP call site**

In `src/server.js` (~`:1077`), derive absolute prefixes from `uriSpaces` (skip malformed entries with the same rule `resolveReferent` applies — `pathPrefix` present and ending in `/`):

```js
  const { profileIndex, void: voidPath, uriSpaces } = await podConfig.get();
  const referentResolutionEnabled = lwsEnabled && Array.isArray(uriSpaces) && uriSpaces.length > 0;
  const uriSpacePrefixes = referentResolutionEnabled
    ? uriSpaces.filter(u => u && typeof u.pathPrefix === 'string' && u.pathPrefix.endsWith('/'))
        .map(u => `${origin}/${u.pathPrefix.replace(/^\//, '')}`)
    : [];
  return buildStorageDescription(origin, { …, referentResolutionEnabled, uriSpacePrefixes, mcpEnabled, anonRateLimitMax });
```

Confirm the prefix form matches the pod's VoID `void:uriSpace` byte-for-byte (the referent round pinned `{authority}/id/`). Verify against `iri-minting.md` / the live VoID doc — adjust the join if VoID uses a different absolute form.

- [ ] **Step 5: Thread the prefixes through the MCP surface**

In `src/mcp/index.js` (~`:247-260`), compute `uriSpacePrefixes` the same way and add it to `ctx`. In `src/mcp/resources.js` `readStorageDescription` (~`:71`), pass `uriSpacePrefixes: ctx.uriSpacePrefixes` to `buildStorageDescription`. The two surfaces must produce identical `uriSpace` arrays.

- [ ] **Step 6: Run the capability test + storage-description regressions**

Run: `node --test --test-force-exit test/lws-referent-capability.test.js test/lws-discovery-conformance.test.js test/lws-conformance.test.js`
Expected: PASS; the flag-off document stays byte-identical (no `uriSpace` key when `uriSpacePrefixes` empty).

- [ ] **Step 7: Commit**

```bash
git add src/lws/storage-description.js src/server.js src/mcp/index.js src/mcp/resources.js test/lws-referent-capability.test.js
git commit -m "$(cat <<'EOF'
[Agent: Claude] feat(lws): structured uriSpace prefixes on the ReferentResolution capability

- buildStorageDescription gains uriSpacePrefixes; the capability carries
  uriSpace: [<absolute prefix>...] (the void:uriSpace values) so a cold agent
  recognizes minted IRIs on its first storage-description read (probe #2)
- prefixes only (container/suffix mapping stays internal; 303 is the resolver);
  threaded identically to HTTP + MCP; flag-off document byte-identical

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 11: Full fork suite + adversarial reviews + merge

**Files:** none (verification + git), in the fork repo.

- [ ] **Step 1: Run the full fork suite**

Run: `npm test 2>&1 | tail -25`
Expected: `pass ≥ 1587 + new tests` / `fail 0` (the pre-existing 1 skip; run `mcp-lws-read` alone if it flags the open-handle). Record the count.

- [ ] **Step 2: Adversarial review of Cluster 1 (authz) and Task 6 (the behavior change)**

Dispatch an opus adversarial review over the authz changes (Tasks 1-3) and the PATCH-admission routing (Task 6): hunt for a write path that still binds the wrong ACL, a listing entry that still leaks, a sidecar write that still lands, and any PATCH path that bypasses admission or breaks legacy byte-identity. Fix anything confirmed; re-run the affected suites.

- [ ] **Step 3: Final whole-branch review**

Dispatch a whole-branch opus review (`16530a1..HEAD`) for correctness, spec-conformance, and the Global Constraints. Address findings.

- [ ] **Step 4: Merge `--no-ff` into `la3d/lws` and push**

```bash
git checkout la3d/lws
git merge --no-ff la3d/lws-nextfork -m "$(cat <<'EOF'
merge: next-fork round — sidecar authz, PATCH choke point, SSRF, structured uriSpace

Completes the recorded fork seeds: member .meta write authz + listing leak +
System-Managed sidecar write protection; PATCH through applyLwsWrite (SHACL
admission + .lwstypes/.lwsprov reindex); N3-Patch conformance (validate deletes,
solid:where, blank-node subjects); 404 Accept-Patch parity; IPv6 SSRF widening +
federation DNS pre-check; structured uriSpace on the ReferentResolution capability.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
git rev-parse HEAD   # record the merge SHA for the repin
git push origin la3d/lws
```

- [ ] **Step 5: Record the merge SHA**

Note the merge SHA — Task 12 pins the rig to it.

---

## Task 12: Rig repin, Makefile bind fix, grown live gates (lws-pod)

**Files (in `~/dev/git/LA3D/agents/lws-pod`):**
- Modify: `Dockerfile.fork` (`JSS_GIT_REF` ~`:20`), `docker-compose.fork-tls.yml` (`JSS_GIT_REF` ~`:20`)
- Modify: `Makefile` (`--bind /alice/concepts/` ~`:212` → `/alice/wiki/`)
- Modify/extend: `tests/lws-referent.test.mjs`, `tests/lws-conneg.test.mjs`, `tests/lws-sidecar-*.test.mjs` (grow the gates)

**Interfaces:**
- Consumes: the merge SHA from Task 11.
- Produces: image `lws-pod:fork-nextfork`; live gates asserting the round's cold-relevant surfaces.

- [ ] **Step 1: Repin the fork ref**

Edit `Dockerfile.fork:20` (`ARG JSS_GIT_REF=<merge-SHA>`) and `docker-compose.fork-tls.yml:20` (`JSS_GIT_REF: "${JSS_GIT_REF:-<merge-SHA>}"`) to the Task 11 merge SHA. Update the "referent identity & discovery round" comment to "next-fork round".

- [ ] **Step 2: Fix the Makefile bind target**

In `Makefile:212`, change `--bind /alice/concepts/=llm-wiki` to `--bind /alice/wiki/=llm-wiki` (VoID-consistent plane the referent round pinned). Confirm the `--instantiate` target (if any) matches.

- [ ] **Step 3: Rebuild + reseed the rig**

Run: `cd ~/dev/git/LA3D/agents/lws-pod && make doctor-tls && make cert && make up-fork-tls`
Then reseed: `POD_TOKEN=$(…) make publish-profiles` (auto-provisions ACLs, DT10).
Expected: pod healthy at `https://pod.vardeman.me/`; `curl --cacert certs/rootCA.pem https://pod.vardeman.me/.well-known/lws-storage` returns the storage description with `capability[].uriSpace`.

- [ ] **Step 4: Add the new live-gate cases**

Grow the existing gates (space runs ~40s for the anon rate limiter):
- `tests/lws-referent.test.mjs`: the `ReferentResolution` capability has `uriSpace` equal to the VoID `void:uriSpace` values.
- `tests/lws-sidecar-*.test.mjs` (or a new `tests/lws-sidecar-authz.test.mjs`): anon `application/lws+json` listing of a public container does NOT include a private member's `.meta`; owner listing DOES. Member `.meta` write without member-write → denied; container `.meta` write by owner → allowed. `PUT <x>.lwstypes` → 405 `Allow: GET, HEAD`.
- `tests/lws-conneg.test.mjs` (or a new `tests/lws-patch.test.mjs`): a shape-violating PATCH on a governed member → 400; a `rdf:type`-adding PATCH → the new type appears in `lws_type_search` / the `.lwstypes` sidecar; an N3-Patch delete-of-nonexistent → 409.

- [ ] **Step 5: Run the full live sweep**

Run each gate (spaced): `make test`, `make test-lws`, `make test-l3`, `make test-typeindex`, `make test-indexed-relation`, `make test-graph`, `make test-conneg`, `make test-void`, `make test-preservation`, `make test-mcp-v2`, `make test-projection`, `make test-app`, `make test-wiki`, `make test-referent`, `make test-dcat`, `make test-profiles`.
Expected: all green (new cases included). Record counts.

- [ ] **Step 6: Commit the rig changes**

```bash
cd ~/dev/git/LA3D/agents/lws-pod
git add Dockerfile.fork docker-compose.fork-tls.yml Makefile tests/
git commit -m "$(cat <<'EOF'
[Agent: Claude] chore(rig): repin fork to the next-fork merge SHA + grow live gates

- Dockerfile.fork/docker-compose.fork-tls.yml → <merge-SHA>, image fork-nextfork
- Makefile publish --bind /alice/concepts/ → /alice/wiki/ (VoID-consistent plane)
- live gates: capability uriSpace; anon listing hides private member .meta;
  member .meta write authz; .lwstypes write 405; shape-violating PATCH 400;
  type-mutating PATCH reindex; N3-Patch delete-of-nonexistent 409

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 13: Update FOLLOWUP + conformance doc + memory

**Files (in `~/dev/git/LA3D/agents/lws-pod`):**
- Modify: `FOLLOWUP.md` (new top block; drain the drained seeds)
- Modify: `docs/foundations/05-jss-spec-conformance.md` (N3-Patch conformance now tracked: `solid:where`, delete-existence; the 404 Accept-Patch parity)
- Modify: the auto-memory `general-substrate-design.md` + `MEMORY.md` pointer

- [ ] **Step 1: Write the FOLLOWUP top block**

Record: round DONE + live-verified; the merge SHA + image; what shipped per cluster; the two behavior changes (shape-violating PATCH 400s, N3-Patch delete-of-nonexistent 409s); the drained seeds; what REMAINS (leaf-vs-edge round; connect-time DNS pinning; console-on-fork rewire next; plural-binding fixture; the member `.meta`-write / DT7-listing residuals now CLOSED). Follow the existing top-block style.

- [ ] **Step 2: Update the conformance doc**

Add PATCH-family conformance to `05-jss-spec-conformance.md` (§4 or a new PATCH section): JSON Merge Patch (already P1), N3-Patch `#server-patch-n3-accept` now including delete-existence (409) and `solid:where`; the 404 `Accept-Patch` parity.

- [ ] **Step 3: Update memory**

Append the round to `~/.claude/projects/-Users-cvardema-dev-git-LA3D-agents-lws-pod/memory/general-substrate-design.md` and refresh its `MEMORY.md` one-liner. Convert relative dates to absolute.

- [ ] **Step 4: Commit the docs**

```bash
git add FOLLOWUP.md docs/foundations/05-jss-spec-conformance.md
git commit -m "$(cat <<'EOF'
[Agent: Claude] docs: record the next-fork round (sidecar authz, PATCH gate, SSRF, uriSpace)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Self-Review Notes

- **Spec coverage:** §2a→Task 1, §2b→Task 2, §2c→Task 3, §3a→Task 6, §3b→Task 7, §3c→Task 8, §3d→Task 9, §4a→Task 4, §4b→Task 5, §5a→Task 10, §5b→Task 12, §6 (error handling) folded into each task's teaching-body steps, §7 (verification)→Tasks 11-12, §8 (out of scope)→Task 13's "what remains."
- **Ordering:** security-first (Cluster 1 Tasks 1-3 → Cluster 3 Tasks 4-5 → Cluster 2 Tasks 6-9 → Cluster 4 Task 10), per approved Approach A. Task 7 (helpers rehome) sits after Task 6 so the move happens on the just-modified handler; Task 8 depends on Task 7's `dataset-patch.js` for `patchDeletesExist`.
- **Type consistency:** `authorizeSidecarAccess(…, mode)` (Task 1) reused GET/HEAD-scoped in Task 3; `SYS_SIDECAR = /\.(lwstypes|lwsprov)$/` used consistently (NOT storage's `AUX_SUFFIX`, which includes client-writable `.acl`/`.meta`); `resolvesToBlockedHost` (Task 5) signature matches its call; `uriSpacePrefixes` (Task 10) computed identically at both builder call sites; `applyLwsWrite` problem-status mapping (Task 3 Step 4) reused in Task 6.
- **Known follow-through:** Task 6 Step 4 splits HTML-data-island writes (stay direct) from pure JSON-LD (routed) — flagged inline; Task 8 Step 5 carries an explicit floor (reject `solid:where` rather than apply unconditionally) if full binding is large.
