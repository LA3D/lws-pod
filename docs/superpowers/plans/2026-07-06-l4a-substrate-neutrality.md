# L4a Substrate Neutrality Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prove the substrate is application-neutral: P13 + a durable code-placement audit, manifest-driven publish, plural `conformsTo`, the smalls — and the zero-code DCAT gate (application #2 onboarded as pure data through agentic PUTs, fork untouched).

**Architecture:** All work is lws-pod-side. The publish/checks machinery becomes data-driven off `defs/index.jsonld` + each descriptor's own PROF roles (reusing `descriptorToProfile`). The DCAT family is three data files; its live gate onboards it through plain authenticated HTTP + the MCP `write_acl` tool — never `publish.mjs` — because the primitive path is the claim under test.

**Tech Stack:** Node/vitest (`cd projection && npm test`), root Vitest live gates against the fork TLS pod (`https://pod.vardeman.me`), W3C PROF/SHACL/JSON-LD/DCAT.

**Spec:** `docs/superpowers/specs/2026-07-06-l4a-substrate-neutrality-design.md`.

## Global Constraints

- **THE FORK IS UNTOUCHED.** No file under `~/dev/git/LA3D/JavaScriptSolidServer` changes; no repin of `Dockerfile.fork`/compose. Task 1 records the fork HEAD + clean status; Task 9 re-asserts both. Any task that seems to need a fork edit is BLOCKED — escalate, don't edit.
- All commits in lws-pod, on `main`: `[Agent: Claude] type(scope): subject` + body bullets + trailer `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`. Stage specific files; never `git add -A`.
- Projection unit tests: `cd projection && npm test` (vitest; the wiki-memory suite is RED+fenced by design — `okf/red-fence.test.mjs` must PASS, the wiki-memory failures are expected and unchanged).
- Live gates need the pod up (`make up-fork-tls`, image `fork-arrayform` @ `8b86a870c6…`). Back-to-back `make test-mcp-v2` runs within ~65s fail loudly on the 429 probe — wait, then re-run.
- Vocabulary policy: reuse-first (`docs/design-notes/iri-minting.md`); DCAT terms come from W3C namespaces; anything we mint sits under `https://w3id.org/lws-pod/…`.
- P13's exact text is in the spec §2 — copy it verbatim where the plan says so.

---

### Task 1: P13 into canon + the audit document + fork guard

**Files:**
- Modify: `docs/design-notes/layer-cake-principles.md` (append P13 after P12 in section B)
- Create: `docs/foundations/06-code-placement-audit.md`
- Create: `.superpowers/sdd/l4a-fork-guard.txt` (round-local, gitignored scratch)

**Interfaces:**
- Produces: the audit table rows later tasks flip from `planned` to `done`; the fork-guard file Task 9 re-asserts.

- [ ] **Step 1: Record the fork guard**

```bash
cd ~/dev/git/LA3D/JavaScriptSolidServer && { git rev-parse HEAD; git status --porcelain | wc -l; } > ~/dev/git/LA3D/agents/lws-pod/.superpowers/sdd/l4a-fork-guard.txt
cat ~/dev/git/LA3D/agents/lws-pod/.superpowers/sdd/l4a-fork-guard.txt
```
Expected: the fork HEAD SHA (`8b86a870c6fccaa6be0e3c52217db164ccd81857`) and `0` (clean tree).

- [ ] **Step 2: Append P13 to `docs/design-notes/layer-cake-principles.md`**, after the P12 block, copying §2 of the spec verbatim:

```markdown
**P13 — Code only guards; applications are data.** Code belongs server-side exactly where
(a) enforcement must be independent of the agent being guarded — admission/SHACL, WAC/no-oracle,
sanitization, rate limits — or (b) affordances must exist before any agent arrives — discovery
surfaces, the MCP tool surface, teaching errors. The profile-mechanism tier may be code only if
it dispatches on profile data and contains no application vocabulary (P5). Everything
application-semantic — content models/parsers, derived-view renderers, domain vocabularies — is
profile data plus agent behavior. Onboarding a new application requires zero code anywhere.
(P9 generalized: same courthouse, any law. Added 2026-07-06 by the L4a spec, from the coupling
review.)
```

- [ ] **Step 3: Write `docs/foundations/06-code-placement-audit.md`**

Full initial content (rows seeded from the 2026-07-06 coupling review; `Status` starts `planned`
for L4a rows, `L4b` for deferred rows, `keep` for justified rows):

```markdown
# 06 — Code-placement audit (P13)

The standing gate on application-neutrality. Every extension point runs through the three-bucket
test (spec `2026-07-06-l4a-substrate-neutrality-design.md` §2). Re-run this audit whenever a round
adds machinery. Buckets: **1** guardrails/affordances (code, deliberately) — **2** profile
mechanism/onboarding (code iff data-driven, zero app vocabulary) — **3** application semantics
(data + agent behavior).

| Item | Bucket | Verdict | Status |
|---|---|---|---|
| Fork `src/lws/*` (admission, linkset, storage-description, type-index, constraint) | 1 | keep — P13(a)/(b), verified neutral (coupling review Tier A) | keep |
| Fork `src/mcp/*` (10 tools, Resources, sanitize, teaching errors, federation gate) | 1 | keep — the minimum viable agent surface | keep |
| Fork `src/mcp/skills.js` pod-layout convention (`/public/apps`, `/private/bots`) | 1 | keep — layout convention, not app semantics (review A3); revisit with SEP-2640 | keep |
| Fork admission fixtures use notes-with-titles only (review A2) | 1 | test-diversity nit — next fork round adds one non-document fixture | fork-queue |
| Fork `test/lws-profiles-linkset.test.js` names llm-wiki URLs (review A1) | 1 | cosmetic — rename fixtures on next touch | fork-queue |
| `projection/okf/{resolve,profile-doc,rdf,namespaces,materialize}.mjs` | 2 | keep — verified neutral (coupling review "explicitly clean") | keep |
| `projection/okf/profile-loader.mjs` `discoverBinding` collapses plural conformsTo (B6) | 2 | fix — return every declared target | planned (Task 2) |
| `projection/publish/publish.mjs` hardcoded family wiring (B4) | 2 | fix — manifest-driven off `defs/index.jsonld` + descriptor roles | planned (Task 4) |
| `projection/publish/checks.mjs` `defsLoader` flat-basename (B5) | 2 | fix — path-aware loader | planned (Task 4) |
| `KNOWN_VOCAB_GAPS` constant in publish code | 2 | fix — becomes manifest data | planned (Task 4) |
| `defs/lwsp.ttl` `plane-mapping` definition says "knowledge bundles" (B3) | 2 | fix — reword neutral + republish | planned (Task 3) |
| `projection/okf/profile-select.mjs` (B8) | 3 | delete — dead, superseded by `discoverBinding` | planned (Task 3) |
| `projection/okf/links.mjs` `skos:` fallback + `implementedBy`/`broader` defaults (B9) | 3→2 | fix — no engine vocabulary; rels become caller parameters | planned (Task 3) |
| `projection/engine.mjs` (markdown-shaped core, wiki RESERVED list — B2) | 3 | app-tooling — application #1's client projector; move at L4b | L4b |
| `projection/okf/engine-profile.mjs` (force-fits index channel — B1) | 3 | app-tooling — channel wiring moves with the engine at L4b | L4b |
| `projection/okf/{card,identity,frontmatter,index-channel,base-profile}.mjs` + gray-matter | 3 | app-tooling — OKF family engine; move at L4b | L4b |
| `projection/profiles/wiki-memory/*` (channels, shapes, RED suite) | 3 | app profile + tooling; re-derived at L4b | L4b |
| `constrained-container/` proxy (legacy L2 floor) | 3 | app-tooling, superseded by L3 — retire decision at L4b | L4b |
| `projection/okf/base-shape.ttl` "universal" comment vs dcterms:title gate | 3 | comment fix rides L4b re-derivation | L4b |
| Identity-policy config vocabulary is document-shaped (one referent/doc — B7) | 2 | design input — L4b read-side | L4b |
| Derived-view declaration vocabulary (fixes RESERVED as data) | 2 | mint at L4b when wiki needs it (YAGNI — DCAT needs none) | L4b |
| `app/` curation console | 3 | app client, correctly outside the machinery | keep |
| `experiments/agent-eval/` | 3 | eval harness (R&D for operating skills) | keep |

## Zero-code onboarding recipe

(Filled by Task 6 — the exact agentic request sequence that onboards a profile family.)
```

- [ ] **Step 4: Commit**

```bash
cd ~/dev/git/LA3D/agents/lws-pod
git add docs/design-notes/layer-cake-principles.md docs/foundations/06-code-placement-audit.md
git commit -m "$(cat <<'EOF'
[Agent: Claude] docs(foundations): P13 code-placement test + the durable audit (L4a task 1)

- P13 appended to layer-cake principles (code only guards; applications are data)
- foundations/06: three-bucket audit, all rows dispositioned (seeded from the
  2026-07-06 coupling review)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: `discoverBinding` returns plural `conformsTo` (B6)

**Files:**
- Modify: `projection/okf/profile-loader.mjs` (`conformsToFromMeta` ~line 62, `discoverBinding` ~line 72)
- Modify: `projection/okf/profile-loader.test.mjs` (expectations)
- Modify: `tests/lws-profiles.test.mjs` (the loader e2e test asserts `discoverBinding(...)` — becomes array)

**Interfaces:**
- Produces: `discoverBinding(resourceUrl, opts) -> Promise<string[]>` — every `dct:conformsTo` target at the FIRST level (own `.meta`, else nearest container `.meta`, else `[indexDefault]`, else `[]`). Never `null`; empty array = unbound.

- [ ] **Step 1: Update the unit tests (RED).** In `projection/okf/profile-loader.test.mjs`, find every `discoverBinding` expectation (currently string/null) and change to arrays, and ADD a multi-target case. New test to append:

```js
it('discoverBinding returns EVERY conformsTo target at the winning level (plural, B6)', async () => {
  const meta = JSON.stringify({
    '@context': { dct: 'http://purl.org/dc/terms/' },
    '@id': '',
    'dct:conformsTo': [{ '@id': 'https://pod.example/p/a.jsonld' }, { '@id': 'https://pod.example/p/b.jsonld' }],
  })
  const fetchFn = async (url) => url.endsWith('/x.meta')
    ? new Response(meta, { status: 200, headers: { 'content-type': 'application/ld+json' } })
    : new Response('', { status: 404 })
  const out = await discoverBinding('https://pod.example/c/x', { fetchFn })
  expect(out.sort()).toEqual(['https://pod.example/p/a.jsonld', 'https://pod.example/p/b.jsonld'])
})
```

Existing single-target expectations become e.g. `expect(out).toEqual(['<descriptor>'])`; the
unbound case becomes `expect(out).toEqual([])`.

- [ ] **Step 2: Run to verify RED**

Run: `cd projection && npx vitest run okf/profile-loader.test.mjs`
Expected: FAIL — string vs array mismatches + the new test.

- [ ] **Step 3: Implement.** In `projection/okf/profile-loader.mjs`:

```js
async function conformsToFromMeta(metaUrl, fetchFn) {
  let r
  try { r = await fetchFn(metaUrl, { headers: { accept: 'application/ld+json, application/json' } }) } catch { return [] }
  if (!r.ok) return []
  let quads
  try { quads = await jsonldToQuads(await r.text(), metaUrl) } catch { return [] }
  // Plural on purpose (B6): a resource may conform to several profiles; the
  // substrate's linkset layer is plural (conformsToTargets) and this API must
  // not collapse it. Which profile GOVERNS a read is an L4b read-side question.
  return quads.filter((q) => q.predicate.value === DCT_CONFORMS).map((q) => q.object.value)
}
```

and in `discoverBinding`: each `if (own) return own` / `if (found) return found` becomes
`if (own.length) return own` / `if (found.length) return found`; the index fallback returns
`[ (await readProfileIndex(indexUrl, { fetchFn })).defaultProfile ]` (catch → `[]`); the final
return is `[]`. Update the function's doc comment to state the plural contract.

- [ ] **Step 4: Update the live-gate caller.** In `tests/lws-profiles.test.mjs`, the loader-e2e test:

```js
const bindings = await discoverBinding(`${BASE}/alice/concepts/anything.md`)
expect(bindings).toEqual([`${BASE}/alice/profiles/llm-wiki/profile.jsonld`])
const p = await loadProfile(bindings[0])
```

- [ ] **Step 5: Run to verify GREEN**

Run: `cd projection && npx vitest run okf/profile-loader.test.mjs` → PASS.
Run: `cd projection && npm test` → same pass/fail profile as before this task except the loader suite (wiki-memory stays RED, `red-fence` PASSES).

- [ ] **Step 6: Commit**

```bash
git add projection/okf/profile-loader.mjs projection/okf/profile-loader.test.mjs tests/lws-profiles.test.mjs
git commit -m "$(cat <<'EOF'
[Agent: Claude] fix(prof): discoverBinding returns plural conformsTo (coupling B6)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: the smalls — B3 reword, B8 delete, B9 de-vocabulary

**Files:**
- Modify: `projection/profiles/defs/lwsp.ttl` (plane-mapping definition, ~line 23)
- Delete: `projection/okf/profile-select.mjs`, `projection/okf/profile-select.test.mjs`
- Modify: `projection/okf/links.mjs`, `projection/okf/links.test.mjs`
- Modify: `constrained-container/proxy.js:116` (the one production caller)

**Interfaces:**
- Produces: `typeLinkHeaders(frontmatter, ns, indexedRels)` — `indexedRels` REQUIRED (throws if absent); no `skos:` fallback (a bare `type:` resolves via `ns.term` alias like `card.mjs#resolveType`, else no `rel="type"` emitted).

- [ ] **Step 1: B3 — reword `lwsp.ttl`.** Replace the plane-mapping `skos:definition` line with:

```turtle
  skos:definition "Config consumed by a projection client: how a profile's content units map onto storage containers."@en ;
```

(Republish happens in Task 7 — the pod copy updates then.)

- [ ] **Step 2: B8 — delete dead selection.**

```bash
grep -rn "selectProfile\|profile-select" projection constrained-container app tests --include="*.mjs" --include="*.js" | grep -v profile-select.test
```
Expected: only `profile-select.mjs` itself. Then `git rm projection/okf/profile-select.mjs projection/okf/profile-select.test.mjs`. (If the grep finds a live caller, STOP — report BLOCKED with the call site.)

- [ ] **Step 3: B9 — update `links.test.mjs` (RED).** Change existing tests to pass `indexedRels` explicitly and assert the new no-fallback behavior; add:

```js
it('bare type with no ns alias emits NO rel="type" (no engine vocabulary — P5)', () => {
  const ns = { resolveCurie: (c) => 'http://x/' + c.split(':')[1], term: {} }
  expect(typeLinkHeaders({ type: 'Concept' }, ns, [])).toBe('')
})
it('bare type resolves through a ns term alias when one exists', () => {
  const ns = { resolveCurie: (c) => 'http://vocab/' + c.split(':')[1], term: { Concept: 'wm:Concept' } }
  expect(typeLinkHeaders({ type: 'Concept' }, ns, [])).toContain('rel="type"')
})
it('indexedRels is required', () => {
  expect(() => typeLinkHeaders({ type: 'a:B' }, { resolveCurie: (c) => c, term: {} })).toThrow(/indexedRels/)
})
```

- [ ] **Step 4: Implement `links.mjs`:**

```js
// projection/okf/links.mjs
// No engine vocabulary (P5/P13): a bare frontmatter type resolves only through
// the profile context's term aliases; indexed rels are the CALLER's choice.
export function typeLinkHeaders(frontmatter, ns, indexedRels) {
  if (!Array.isArray(indexedRels)) throw new Error('typeLinkHeaders: indexedRels is required (no engine defaults)')
  const parts = []
  if (frontmatter?.type) {
    const s = String(frontmatter.type)
    const curie = s.includes(':') ? s : (typeof ns.term[s] === 'string' ? ns.term[s] : null)
    if (curie) parts.push(`<${ns.resolveCurie(curie)}>; rel="type"`)
  }
  for (const rel of indexedRels) {
    if (frontmatter?.[rel] == null) continue
    const mapped = ns.term[rel] && ns.term[rel]['@id']
    if (!mapped) continue
    const relIri = ns.resolveCurie(mapped)
    if (!/^[a-z][a-z0-9+.-]*:/i.test(relIri)) continue
    const targets = Array.isArray(frontmatter[rel]) ? frontmatter[rel] : [frontmatter[rel]]
    for (const t of targets) parts.push(`<${encodeURI(String(t))}>; rel="${relIri}"`)
  }
  return parts.join(', ')
}
```

Update the caller `constrained-container/proxy.js:116`:
`req.__linkHeader = typeLinkHeaders(fm, NS, ['implementedBy', 'broader']);` — the wiki edge choice
moves to the wiki-facing proxy, where it belongs.

- [ ] **Step 5: Run to verify GREEN**

Run: `cd projection && npx vitest run okf/links.test.mjs` → PASS.
Run: `cd constrained-container && npm test 2>/dev/null || echo "no suite — run: node --check proxy.js"` — at minimum syntax-check the proxy.

- [ ] **Step 6: Commit**

```bash
git add projection/profiles/defs/lwsp.ttl projection/okf/links.mjs projection/okf/links.test.mjs constrained-container/proxy.js
git rm -q --cached projection/okf/profile-select.mjs projection/okf/profile-select.test.mjs 2>/dev/null; true
git commit -m "$(cat <<'EOF'
[Agent: Claude] fix(prof): smalls — neutral plane-mapping wording (B3), dead selector deleted (B8), links.mjs loses engine vocabulary (B9)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: manifest-driven publish (B4/B5)

**Files:**
- Modify: `projection/profiles/defs/index.jsonld` (adds `knownVocabGaps`; dcat entry comes in Task 5)
- Modify: `projection/publish/checks.mjs` (add `makeDefsLoader`; keep old `defsLoader` as its basename-fallback default)
- Rewrite: `projection/publish/publish.mjs`
- Modify: `projection/publish/publish.test.mjs` (+ keep `checks.test.mjs` green unchanged)

**Interfaces:**
- Consumes: `descriptorToProfile(docText, url) -> {id, token, parents, resources:[{roles, artifact, format, source, version}]}` (`projection/okf/profile-doc.mjs`; `artifact` comes back ABSOLUTE, resolved against the descriptor URL).
- Produces: `publish.mjs` CLI unchanged (`--base --container --bind path=token --token`) plus **`--check`** (run declaration checks only, exit 0/1, write nothing). Manifest contract: `defs/index.jsonld` `profiles[]` (relative descriptor paths) + `knownVocabGaps[]`. Roles drive checks: `role:validation`→`checkShapes`, `lwspr:context`→`checkContext`, `role:vocabulary`→`checkVocabulary`. `--bind` resolves a token by matching `hasToken` across manifest descriptors — no name special-cases.

- [ ] **Step 1: Manifest gains the gaps.** `projection/profiles/defs/index.jsonld` becomes:

```json
{
  "@context": { "profiles": { "@id": "https://w3id.org/lws-pod/profile#profiles", "@type": "@id", "@container": "@list" },
                "defaultProfile": { "@id": "https://w3id.org/lws-pod/profile#defaultProfile", "@type": "@id" },
                "knownVocabGaps": { "@id": "https://w3id.org/lws-pod/profile#knownVocabGaps", "@type": "@id", "@container": "@set" } },
  "@id": "",
  "profiles": ["substrate-floor.jsonld", "okf-base.jsonld", "llm-wiki/profile.jsonld"],
  "defaultProfile": "okf-base.jsonld",
  "knownVocabGaps": ["https://la3d.github.io/llm-wiki-colab/ontology#mentions"]
}
```

- [ ] **Step 2: Path-aware loader in `checks.mjs`.** Add (keeping the existing `defsLoader` and default parameter untouched so `checks.test.mjs` stays green):

```js
// Path-aware defs loader (B5): resolves a published URL back to its local defs
// path by stripping the publish root, preserving subdirectories. Falls back to
// basename for URLs outside the root (e.g. the shared compact context).
export function makeDefsLoader(rootHref) {
  return async function pathAwareDefsLoader(url) {
    const rel = url.startsWith(rootHref) ? url.slice(rootHref.length) : new URL(url).pathname.split('/').pop()
    const doc = JSON.parse(await readFile(join(DEFS, ...rel.split('/')), 'utf8'))
    return { contextUrl: null, document: doc, documentUrl: url }
  }
}
```

And give `checkDescriptor` an optional loader: `export async function checkDescriptor(jsonText, url, loader = defsLoader)` — pass `{ documentLoader: loader }` through to `jsonldToQuads`.

- [ ] **Step 3: Rewrite `publish.mjs`** (complete file):

```js
// Publish the defs tree to the pod + bind containers. Checks run FIRST; any
// failure exits 1 with nothing written (spec §9 — declaration-time, loud).
// MANIFEST-DRIVEN (L4a, coupling B4/B5): the descriptor set comes from
// defs/index.jsonld and each descriptor's own PROF roles drive its checks —
// adding a profile family is a manifest entry + files, never a code edit.
// Usage: node publish/publish.mjs --base https://pod.example [--container /alice/profiles/]
//        [--bind /alice/concepts/=llm-wiki] [--token <bearer>] [--check]
import { readFile, readdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join, relative } from 'node:path'
import { checkDescriptor, checkShapes, checkContext, checkVocabulary, usedTermsFromContext, makeDefsLoader } from './checks.mjs'
import { descriptorToProfile } from '../okf/profile-doc.mjs'
import { loadProfile } from '../okf/profile-loader.mjs'

const DEFS = join(dirname(fileURLToPath(import.meta.url)), '..', 'profiles', 'defs')
const TYPES = { '.jsonld': 'application/ld+json', '.ttl': 'text/turtle' }
const LWSPR = 'https://w3id.org/lws-pod/profile/role/'
const ROLE = 'http://www.w3.org/ns/dx/prof/role/'

function arg(name, dflt = null) {
  const i = process.argv.indexOf(`--${name}`)
  return i > -1 ? process.argv[i + 1] : dflt
}
const binds = process.argv.flatMap((a, i) => (process.argv[i - 1] === '--bind' ? [a] : []))
const checkOnly = process.argv.includes('--check')

async function* files(dir) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name)
    if (e.isDirectory()) yield* files(p)
    else yield p
  }
}

const base = arg('base') ?? (() => { throw new Error('--base required') })()
const container = arg('container', '/profiles/')
const token = arg('token', process.env.POD_TOKEN)
const root = new URL(container, base).href
const loader = makeDefsLoader(root)

// 0. The manifest is the single source of the profile set.
const manifest = JSON.parse(await readFile(join(DEFS, 'index.jsonld'), 'utf8'))
const DESCRIPTORS = manifest.profiles ?? []
const KNOWN_VOCAB_GAPS = manifest.knownVocabGaps ?? []
const localPath = (absUrl) => join(DEFS, ...absUrl.slice(root.length).split('/'))

// 1. Checks — all of them, per descriptor, driven by its own roles.
const failures = []
const profilesByToken = {}
for (const d of DESCRIPTORS) {
  const dUrl = new URL(d, root).href
  const dText = await readFile(join(DEFS, ...d.split('/')), 'utf8')
  failures.push(...await checkDescriptor(dText, dUrl, loader))
  let prof
  try { prof = await descriptorToProfile(dText, dUrl) } catch (e) { failures.push(`descriptor ${d}: ${e.message}`); continue }
  if (prof.token) profilesByToken[prof.token] = dUrl

  const ctxRes = prof.resources.find((r) => r.roles.includes(LWSPR + 'context'))
  const ctxObj = ctxRes ? (JSON.parse(await readFile(localPath(ctxRes.artifact), 'utf8'))['@context'] ?? {}) : {}
  const curatedBases = Object.values(ctxObj).filter((v) => typeof v === 'string' && /[#/]$/.test(v))

  for (const r of prof.resources) {
    const art = () => readFile(localPath(r.artifact), 'utf8')
    if (r.roles.includes(ROLE + 'validation')) failures.push(...await checkShapes(await art(), `${d}:${r.artifact.split('/').pop()}`))
    if (r.roles.includes(LWSPR + 'context')) failures.push(...checkContext(await art(), `${d}:${r.artifact.split('/').pop()}`, curatedBases))
    if (r.roles.includes(ROLE + 'vocabulary')) {
      const used = usedTermsFromContext({ '@context': ctxObj })
      const all = await checkVocabulary(await art(), used)
      const gated = await checkVocabulary(await art(), used, KNOWN_VOCAB_GAPS)
      failures.push(...gated)
      const noted = KNOWN_VOCAB_GAPS.filter((g) => all.some((f) => f.endsWith(g)))
      if (noted.length) console.log(`known upstream vocab gaps in ${d} (recorded, not patched): ${noted.join(', ')}`)
    }
  }
}
if (failures.length) { console.error('DECLARATION CHECKS FAILED:\n' + failures.map((f) => ' - ' + f).join('\n')); process.exit(1) }
if (checkOnly) { console.log(`checks passed for ${DESCRIPTORS.length} profile(s)`); process.exit(0) }

// 2. Publish the tree.
const headers = token ? { authorization: `Bearer ${token}` } : {}
for await (const f of files(DEFS)) {
  const rel = relative(DEFS, f).split(sepEscape()).join('/')
  const url = new URL(rel, root).href
  const ct = TYPES[f.slice(f.lastIndexOf('.'))] ?? 'application/octet-stream'
  const r = await fetch(url, { method: 'PUT', headers: { ...headers, 'content-type': ct }, body: await readFile(f) })
  if (!r.ok && r.status !== 201 && r.status !== 205) { console.error(`PUT ${url} -> ${r.status}`); process.exit(1) }
  console.log(`PUT ${url} -> ${r.status}`)
}
function sepEscape() { return process.platform === 'win32' ? '\\' : '/' }

// 3. Bind containers: conformsTo (the index) + describedby (the enforcement
// cache, materialized from the profile's validation artifacts). Read-merge-write.
// Token → descriptor via the manifest (hasToken match) — no name special-cases.
for (const b of binds) {
  const [path, tokenName] = b.split('=')
  const descriptor = profilesByToken[tokenName]
    ?? (() => { console.error(`--bind: no profile in the manifest has token '${tokenName}'`); process.exit(1) })()
  const loaded = await loadProfile(descriptor)
  const metaUrl = new URL(path + '.meta', base).href
  let meta = {}
  const r0 = await fetch(metaUrl, { headers: { ...headers, accept: 'application/ld+json' } })
  if (r0.ok) { try { meta = await r0.json() } catch { meta = {} } }
  meta['@context'] = { ...(typeof meta['@context'] === 'object' ? meta['@context'] : {}),
    dct: 'http://purl.org/dc/terms/', powder: 'http://www.w3.org/2007/05/powder-s#' }
  meta['@id'] = meta['@id'] ?? ''
  meta['dct:conformsTo'] = { '@id': descriptor }
  meta['powder:describedby'] = loaded.validation.map((v) => ({ '@id': v }))
  const r = await fetch(metaUrl, { method: 'PUT', headers: { ...headers, 'content-type': 'application/ld+json' }, body: JSON.stringify(meta, null, 2) })
  if (!r.ok && r.status !== 201 && r.status !== 205) { console.error(`BIND ${metaUrl} -> ${r.status}`); process.exit(1) }
  console.log(`BIND ${path} conformsTo ${descriptor} (+${loaded.validation.length} describedby) -> ${r.status}`)
}
console.log('publish complete')
```

Note: `export const KNOWN_VOCAB_GAPS` disappears from the module. Grep for importers first:
`grep -rn "KNOWN_VOCAB_GAPS" projection tests` — if a test imports it, update the test to read the
manifest instead.

- [ ] **Step 4: Update `publish.test.mjs`.** Adapt existing tests to the manifest-driven flow (the
suite runs publish logic pieces — check how it imports; if it executes the CLI, add a `--check`
mode test):

```js
it('--check validates every manifest profile and writes nothing', async () => {
  const out = execSync(`node publish/publish.mjs --base https://example.invalid --check`, { cwd: projectionRoot }).toString()
  expect(out).toMatch(/checks passed for \d+ profile\(s\)/)
})
it('token→descriptor resolution comes from the manifest, subdirectory layout included', async () => {
  // llm-wiki lives in a subdirectory; resolution must come from hasToken, not name convention
  const manifest = JSON.parse(readFileSync(defsPath('index.jsonld'), 'utf8'))
  expect(manifest.profiles).toContain('llm-wiki/profile.jsonld')
})
```

(Adapt import/exec style to the existing `publish.test.mjs` conventions — read it first; keep every
existing behavioral assertion alive in the new shape.)

- [ ] **Step 5: Run to verify**

Run: `cd projection && npx vitest run publish/` → PASS (checks suite untouched + publish suite green).
Run: `cd projection && node publish/publish.mjs --base https://example.invalid --check` → `checks passed for 3 profile(s)`, exit 0.

- [ ] **Step 6: Commit**

```bash
git add projection/profiles/defs/index.jsonld projection/publish/checks.mjs projection/publish/publish.mjs projection/publish/publish.test.mjs
git commit -m "$(cat <<'EOF'
[Agent: Claude] feat(publish): manifest-driven publish + path-aware loader (coupling B4/B5)

- descriptor set + vocab gaps from defs/index.jsonld; per-descriptor checks
  driven by its own PROF roles; --bind resolves tokens via hasToken
- --check mode (checks only, no writes); makeDefsLoader path-aware

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: the DCAT family as pure data

**Files:**
- Create: `projection/profiles/defs/dcat-catalog/profile.jsonld`
- Create: `projection/profiles/defs/dcat-catalog/context.jsonld`
- Create: `projection/profiles/defs/dcat-catalog/shapes.ttl`
- Modify: `projection/profiles/defs/index.jsonld` (add the manifest entry)
- Modify: `projection/okf/profile-loader.test.mjs` (local walk test for the new family)

**Interfaces:**
- Produces: profile token `dcat-catalog`, descriptor at `dcat-catalog/profile.jsonld`, `isProfileOf` → `substrate-floor` (identity policy inherited: `{fragment:'#it'}`).

- [ ] **Step 1: `dcat-catalog/profile.jsonld`**

```json
{
  "@context": "../profiles-compact.context.jsonld",
  "@id": "",
  "@type": "Profile",
  "hasToken": "dcat-catalog",
  "isProfileOf": "../substrate-floor.jsonld",
  "dct:title": "DCAT catalog family — datasets as pure JSON-LD data (application #2; W3C DCAT reused, nothing minted)",
  "hasResource": [
    { "@id": "#ctx", "hasRole": "lwspr:context", "hasArtifact": "context.jsonld", "format": "application/ld+json" },
    { "@id": "#shape", "hasRole": "role:validation", "hasArtifact": "shapes.ttl", "format": "text/turtle" }
  ]
}
```

- [ ] **Step 2: `dcat-catalog/context.jsonld`**

```json
{
  "@context": {
    "dcat": "http://www.w3.org/ns/dcat#",
    "dct": "http://purl.org/dc/terms/",
    "Dataset": "dcat:Dataset",
    "Catalog": "dcat:Catalog",
    "title": "dct:title",
    "description": "dct:description",
    "distribution": { "@id": "dcat:distribution", "@type": "@id" },
    "downloadURL": { "@id": "dcat:downloadURL", "@type": "@id" }
  }
}
```

- [ ] **Step 3: `dcat-catalog/shapes.ttl`** (Turtle on purpose — republished through the pod it
exercises the array-form-JSON-LD admission path the ld+json-500 fix covers):

```turtle
@prefix sh: <http://www.w3.org/ns/shacl#> .
@prefix dcat: <http://www.w3.org/ns/dcat#> .
@prefix dct: <http://purl.org/dc/terms/> .
@prefix lwss: <https://w3id.org/lws-pod/shapes/dcat#> .

lwss:DatasetShape a sh:NodeShape ;
  sh:targetClass dcat:Dataset ;
  sh:property [ sh:path dct:title ; sh:minCount 1 ; sh:maxCount 1 ; sh:severity sh:Violation ;
    sh:message "Every dcat:Dataset must declare exactly one dct:title." ] ;
  sh:property [ sh:path dct:description ; sh:minCount 1 ; sh:severity sh:Info ;
    sh:message "Consider adding a dct:description for catalog disclosure." ] .
```

- [ ] **Step 4: Manifest entry.** In `defs/index.jsonld`, `profiles` becomes
`["substrate-floor.jsonld", "okf-base.jsonld", "llm-wiki/profile.jsonld", "dcat-catalog/profile.jsonld"]`
(`defaultProfile` unchanged).

- [ ] **Step 5: Checks pass with ZERO publish-code edits (the B4 acceptance):**

Run: `cd projection && node publish/publish.mjs --base https://example.invalid --check`
Expected: `checks passed for 4 profile(s)` — no JS changed in this task (verify: `git diff --stat` shows only `defs/` + tests).

- [ ] **Step 6: Local walk test (append to `profile-loader.test.mjs`):**

```js
it('dcat-catalog loads end-to-end: walk reaches substrate-floor, identity inherited, roles dispatch', async () => {
  const defs = (rel) => new URL(`../profiles/defs/${rel}`, import.meta.url)
  const fileFetch = async (url) => {
    const rel = String(url).split('/defs/')[1]
    return new Response(readFileSync(defs(rel)), { status: 200 })
  }
  const p = await loadProfile(String(defs('dcat-catalog/profile.jsonld')), { fetchFn: fileFetch })
  expect(p.token).toBe('dcat-catalog')
  expect(p.validation.some((v) => v.endsWith('dcat-catalog/shapes.ttl'))).toBe(true)
  expect(p.identityPolicy).toEqual({ fragment: '#it' })
  expect(p.conformance.some((c) => c.iri.endsWith('substrate-floor.jsonld') && c.resolved)).toBe(true)
})
```

(Match the fetch-stub style already used in that file — adapt the URL plumbing to the existing
local-fixture pattern if one exists; the assertions are the contract.)

- [ ] **Step 7: Run + commit**

Run: `cd projection && npx vitest run okf/profile-loader.test.mjs publish/` → PASS.

```bash
git add projection/profiles/defs/dcat-catalog projection/profiles/defs/index.jsonld projection/okf/profile-loader.test.mjs
git commit -m "$(cat <<'EOF'
[Agent: Claude] feat(profiles): dcat-catalog family as pure data — application #2

- descriptor (isProfileOf substrate-floor), DCAT/DCTERMS context (reuse-first),
  SHACL shapes w/ teaching messages; manifest entry only — zero code edits

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: the zero-code onboarding recipe + `make test-dcat` live gate

**Files:**
- Create: `tests/lws-dcat.test.mjs`
- Modify: `Makefile` (add `test-dcat` target + `.PHONY` entry)
- Modify: `docs/foundations/06-code-placement-audit.md` (fill the recipe section)

**Interfaces:**
- Consumes: `BASE`/`ensurePod`/`getToken` from `tests/helpers.mjs`; `discoverBinding`/`loadProfile` (plural API from Task 2); the pod up at `https://pod.vardeman.me`.
- Produces: the live proof that onboarding = agentic requests. **The gate's `beforeAll` IS the recipe** — plain fetch PUTs + one MCP `write_acl` call; it must NOT import or invoke `publish.mjs`.

- [ ] **Step 1: Write `tests/lws-dcat.test.mjs`**

```js
import { describe, it, beforeAll, expect } from 'vitest'
import { BASE, ensurePod, getToken } from './helpers.mjs'
import { discoverBinding, loadProfile } from '../projection/okf/profile-loader.mjs'

// The zero-code DCAT gate (spec L4a §5): application #2 onboards as PURE DATA
// through agentic requests — this beforeAll IS the onboarding recipe (also
// documented in docs/foundations/06). publish.mjs is deliberately NOT used.
const DIR = '/alice/profiles/dcat-catalog/'
const DATASETS = '/alice/datasets/'
const DCT = 'http://purl.org/dc/terms/'
const POWDER = 'http://www.w3.org/2007/05/powder-s#'
const defs = (rel) => new URL(`../projection/profiles/defs/dcat-catalog/${rel}`, import.meta.url)
const { readFileSync } = await import('node:fs')

const probe = await fetch(`${BASE}/.well-known/lws-storage`).catch(() => null)
const up = !!probe?.ok

describe.skipIf(!up)('zero-code DCAT onboarding (L4a gate)', () => {
  let token
  beforeAll(async () => {
    await ensurePod()
    ;({ token } = await getToken())
    const H = { authorization: `Bearer ${token}` }

    // RECIPE step 1 — publish the three profile artifacts (plain PUTs of data).
    for (const [name, ct] of [['profile.jsonld', 'application/ld+json'], ['context.jsonld', 'application/ld+json'], ['shapes.ttl', 'text/turtle']]) {
      const r = await fetch(`${BASE}${DIR}${name}`, { method: 'PUT',
        headers: { ...H, 'content-type': ct }, body: readFileSync(defs(name)) })
      expect([200, 201, 205]).toContain(r.status)
    }

    // RECIPE step 2 — public-read ACL via the MCP write_acl tool (agentic guardrail
    // surface, still zero code) so unauthenticated profile resolution works.
    const acl = await fetch(`${BASE}/mcp`, { method: 'POST', headers: { ...H, 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'write_acl', arguments: {
        path: DIR, authorizations: [
          { agentClasses: ['foaf:Agent'], modes: ['Read'], isDefault: true },
          { agents: [`${BASE}/alice/profile/card.jsonld#me`], modes: ['Read', 'Write', 'Control'], isDefault: true },
        ] } } }) })
    expect((await acl.json()).result?.isError ?? false).toBe(false)

    // RECIPE step 3 — bind the container: .meta read-merge-write (conformsTo + describedby).
    const metaUrl = `${BASE}${DATASETS}.meta`
    let meta = {}
    const r0 = await fetch(metaUrl, { headers: { ...H, accept: 'application/ld+json' } })
    if (r0.ok) { try { meta = await r0.json() } catch { meta = {} } }
    meta['@context'] = { ...(typeof meta['@context'] === 'object' ? meta['@context'] : {}), dct: DCT, powder: POWDER }
    meta['@id'] = meta['@id'] ?? ''
    meta['dct:conformsTo'] = { '@id': `${BASE}${DIR}profile.jsonld` }
    meta['powder:describedby'] = [{ '@id': `${BASE}${DIR}shapes.ttl` }]
    const rb = await fetch(metaUrl, { method: 'PUT', headers: { ...H, 'content-type': 'application/ld+json' }, body: JSON.stringify(meta) })
    expect([200, 201, 205]).toContain(rb.status)
  })

  it('gate 1: non-conformant dcat:Dataset → 400 + teaching violations through the UNCHANGED admission engine', async () => {
    const bad = { '@context': { dcat: 'http://www.w3.org/ns/dcat#', dct: DCT }, '@id': '#it', '@type': 'dcat:Dataset' }
    const r = await fetch(`${BASE}${DATASETS}bad.jsonld`, { method: 'PUT',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/ld+json' }, body: JSON.stringify(bad) })
    expect(r.status).toBe(400)
    const problem = await r.json()
    expect(JSON.stringify(problem.violations)).toMatch(/dct:title|title/i)
  })

  it('gate 2: conformant dataset admits (201/200, Info advisory when description absent)', async () => {
    const good = { '@context': { dcat: 'http://www.w3.org/ns/dcat#', dct: DCT }, '@id': '#it', '@type': 'dcat:Dataset', 'dct:title': 'Seed dataset' }
    const r = await fetch(`${BASE}${DATASETS}seed.jsonld`, { method: 'PUT',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/ld+json',
        link: '<http://www.w3.org/ns/dcat#Dataset>; rel="type"' }, body: JSON.stringify(good) })
    expect([200, 201]).toContain(r.status)
    expect(JSON.stringify(await r.json())).toMatch(/advisories/)
  })

  it('gate 3: handoff edges — container linkset carries describedby + conformsTo; member carries up/type', async () => {
    const c = (await (await fetch(`${BASE}${DATASETS}`, { headers: { accept: 'application/linkset+json', authorization: `Bearer ${token}` } })).json()).linkset[0]
    expect(c.describedby.map((x) => x.href)).toContain(`${BASE}${DIR}shapes.ttl`)
    expect(c[`${DCT}conformsTo`][0].href).toBe(`${BASE}${DIR}profile.jsonld`)
    const m = (await (await fetch(`${BASE}${DATASETS}seed.jsonld`, { headers: { accept: 'application/linkset+json', authorization: `Bearer ${token}` } })).json()).linkset[0]
    expect(m.up[0].href).toBe(`${BASE}${DATASETS}`)
    expect('describedby' in m).toBe(false)
  })

  it('gate 4: loadProfile walks dcat-catalog → substrate-floor over the LIVE pod (unauthenticated)', async () => {
    const bindings = await discoverBinding(`${BASE}${DATASETS}anything.jsonld`)
    expect(bindings).toEqual([`${BASE}${DIR}profile.jsonld`])
    const p = await loadProfile(bindings[0])
    expect(p.token).toBe('dcat-catalog')
    expect(p.identityPolicy).toEqual({ fragment: '#it' })
    expect(p.conformance.some((c) => c.iri.endsWith('substrate-floor.jsonld') && c.resolved)).toBe(true)
  })

  it('gate 5: type search finds the dcat-typed member', async () => {
    const r = await fetch(`${BASE}/types/search?type=${encodeURIComponent('http://www.w3.org/ns/dcat#Dataset')}`,
      { headers: { authorization: `Bearer ${token}` } })
    const page = await r.json()
    expect(page.items.map((i) => i.id)).toContain(`${BASE}${DATASETS}seed.jsonld`)
  })
})
```

(Two adapt-on-contact notes for the implementer: (a) the owner WebID in the ACL call — read the
real one from `getToken()`/helpers or `${BASE}/alice/profile/card.jsonld#me`, matching what
`tests/helpers.mjs` uses; (b) gate 5's query-string shape — check `tests/lws-typeindex.test.mjs`
for the exact `/types/search` request format and reuse it verbatim.)

- [ ] **Step 2: Makefile target** (mirror `test-profiles`, lines 123–125):

```makefile
test-dcat:
	@[ -f certs/rootCA.pem ] || { echo "run 'make cert && make up-fork-tls' first"; exit 1; }
	BASE=https://pod.vardeman.me NODE_EXTRA_CA_CERTS=$(CURDIR)/certs/rootCA.pem npx vitest run tests/lws-dcat.test.mjs
```

Add `test-dcat` to the `.PHONY` line.

- [ ] **Step 3: Run the gate live**

Run: `make test-dcat`
Expected: 5/5. Iterate on adapt-on-contact details until green; if anything fails in a way that
seems to need a FORK change, STOP and report BLOCKED (Global Constraints).

- [ ] **Step 4: Document the recipe.** Fill the audit doc's "Zero-code onboarding recipe" section
with the literal request sequence (PUT ×3 artifacts → `write_acl` → `.meta` read-merge-write →
done), each with method/URL/content-type and one-line purpose, and note: "executed verbatim by
`tests/lws-dcat.test.mjs` `beforeAll` — the gate IS the recipe."

- [ ] **Step 5: Commit**

```bash
git add tests/lws-dcat.test.mjs Makefile docs/foundations/06-code-placement-audit.md
git commit -m "$(cat <<'EOF'
[Agent: Claude] test(dcat): zero-code onboarding gate — application #2 as pure data (L4a §5)

- beforeAll IS the recipe: 3 artifact PUTs + write_acl + .meta bind; no publish.mjs
- gates: teaching 400 / admit+advisory / handoff edges / live profile walk / type search
- recipe documented in foundations/06

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: manifest publish live + full sweep

**Files:**
- Modify: `Makefile` (`publish-profiles` gains `--bind /alice/datasets/=dcat-catalog`)

- [ ] **Step 1: Extend the publish bind** (Makefile lines 147–151): append
` \\\n\t  --bind /alice/datasets/=dcat-catalog` after the llm-wiki bind. This proves generic token
resolution (no llm-wiki special case) and is idempotent over the gate's primitive bind.

- [ ] **Step 2: Run it** (needs `POD_TOKEN` — check how the target obtains it; `tests/helpers.mjs`
mints one, and prior rounds ran this target — follow the same invocation):

Run: `make publish-profiles`
Expected: checks pass for 4 profiles (known-gaps notice for llm-wiki only), full tree PUT
(including `dcat-catalog/` and the reworded `lwsp.ttl`), both binds succeed.

- [ ] **Step 3: Full live sweep — zero regression**

```bash
make test-profiles          # 6/6
make test-dcat              # 5/5 (idempotent re-run over the publish)
make test-l3                # 2/2
make test-lws               # 6/6
make test-typeindex         # 7/7
make test-indexed-relation  # 4/4
make test-mcp-v2            # 16/16 (mind the 65s cooldown)
cd projection && npm test   # unit suites; red-fence PASSES; wiki-memory RED unchanged
```

- [ ] **Step 4: Commit**

```bash
git add Makefile
git commit -m "$(cat <<'EOF'
[Agent: Claude] feat(publish): dcat-catalog bind in publish-profiles — generic token resolution live

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: cold-agent probe #3 (CONTROLLER-RUN — not a subagent implementer task)

The controller dispatches the same unprimed probe protocol as the two 2026-07-06 runs (fresh
agent, pod URL + CA cert only, read-only, no LWS/DCAT/profile vocabulary in the prompt, governance
walkthrough on a resource of ITS choosing). **Scoring:** the agent reconstructs the DCAT family by
the same walk that reconstructed llm-wiki (container `conformsTo` → descriptor → `isProfileOf` →
floor; shapes + context roles identified), and reports the profile index now listing 4 profiles.
Findings → FOLLOWUP via Task 9.

---

### Task 9: fork-guard assertion + audit close-out + FOLLOWUP + CLAUDE.md pointer

**Files:**
- Modify: `docs/foundations/06-code-placement-audit.md` (flip `planned (Task N)` rows to `done`)
- Modify: `FOLLOWUP.md` (L4a DONE block; NEXT = L4b)
- Modify: `CLAUDE.md` (the identity paragraph's standing-gate sentence points at `docs/foundations/06-code-placement-audit.md` instead of just "FOLLOWUP")

- [ ] **Step 1: Assert the fork guard**

```bash
cd ~/dev/git/LA3D/JavaScriptSolidServer && { git rev-parse HEAD; git status --porcelain | wc -l; } | diff - ~/dev/git/LA3D/agents/lws-pod/.superpowers/sdd/l4a-fork-guard.txt && echo "FORK UNTOUCHED"
```
Expected: `FORK UNTOUCHED`. If not — the round has violated its hard constraint; STOP and escalate.

- [ ] **Step 2: Flip the audit rows** touched by Tasks 2–7 from `planned (Task N)` to `done (L4a)`.

- [ ] **Step 3: FOLLOWUP block.** Append an `▶ L4a — DONE` block to the 2026-06-29/07-06 section
covering: spec+plan paths; P13 + audit doc; manifest publish (+`--check`); plural conformsTo;
smalls (B3/B8/B9); the dcat-catalog family + zero-code recipe + gate counts; the fork-guard
assertion result; probe #3 outcome + any new friction; deferred = L4b list (engine move,
wiki-memory green, derived-view vocabulary, B7 identity vocabulary, read-side semantics,
constrained-container retirement decision). Update the section header's shipped-list and the
`▶▶ NEXT` pointer to **L4b**.

- [ ] **Step 4: Commit**

```bash
git add docs/foundations/06-code-placement-audit.md FOLLOWUP.md CLAUDE.md
git commit -m "$(cat <<'EOF'
[Agent: Claude] docs(followup): L4a DONE — substrate neutrality proven; NEXT = L4b

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Self-Review (done at write time)

- **Spec coverage:** §1 fork-empty → Task 1 guard + Task 9 assertion + Global Constraints; §2 P13 →
  Task 1; §3 audit → Tasks 1+9; §4.1 manifest publish → Task 4 (+Task 5 Step 5 proves
  zero-code-edit onboarding, +Task 7 proves generic bind); §4.2 plural conformsTo → Task 2; §4.3
  smalls → Task 3; §5 family+recipe+gate → Tasks 5+6 (assertions 1–5 = gate tests 1–5; assertion 6
  = Task 9 Step 1); §5 probe #3 → Task 8; §6 demotion recorded → audit rows (L4b) + FOLLOWUP; §7
  acceptance 1–7 → Tasks 9/6/1+9/5+7/2+3/8/7 respectively.
- **Placeholder scan:** adapt-on-contact notes (helpers' WebID form, `/types/search` query shape,
  publish.test.mjs conventions) name exactly where the ground truth lives — intentional, not TBDs.
- **Type consistency:** `discoverBinding -> string[]` used identically in Task 2 (unit+gate) and
  Task 6 gate 4; `makeDefsLoader(rootHref)` defined Task 4 Step 2, consumed Task 4 Step 3;
  `typeLinkHeaders(fm, ns, indexedRels)` required-param contract consistent between Task 3 test and
  proxy caller; manifest keys (`profiles`, `defaultProfile`, `knownVocabGaps`) identical in Tasks
  4/5; DCAT file names/paths identical across Tasks 5/6.
