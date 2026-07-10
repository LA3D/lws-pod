# Content-Negotiation-by-Profile — Phase 2 (instantiation + wiki re-derived) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make profile instantiation real — profiles declare their representations as data, an
instantiate step materializes them + writes the `altr:` facts the Phase-1 fork surface selects on —
and re-derive the RED+fenced wiki-memory family as the first consumer (content rep + links rep),
executing the `projection/` engine demotion along the way.

**Architecture:** A profile descriptor gains `lwspr:representation` resources — data declaring each
representation (`self` canonical / per-member `suffix` artifact / container `target` artifact /
`named_graph` aggregate) with its `dct:format` + `conformsTo`. A **neutral** `instantiate()` in
`projection/prof/` reads a bound container's members, materializes each declared representation
(application-supplied renderers for content transforms; the Phase-A derived-view materializer for
aggregates), and read-merge-writes the `altr:` facts into each member's `.meta` — after which the
Phase-1 fork surface (linkset advertisement, `Accept-Profile` 200/303/406, TypeSearch `conformsTo`)
is live for those memories with **zero fork changes**. The wiki projector becomes application-#1
tooling in `apps/wiki-projector/` (renderers: `links` = frontmatter card → flat `#it` JSON-LD,
SHACL-floor-governed; `index` = the OKF navigation channel); the old engine/channel machinery and
the Plan-1-era `profiles/wiki-memory/` family (semantic-markdown, `wm:` vocab — both dead
conventions) are deleted, not patched.

**Tech Stack:** Node ESM, Vitest (projection + apps unit suites, root live gates), n3 + jsonld +
`@rdfjs` via existing deps, the fork `--lws` TLS pod at `https://pod.vardeman.me` (image
`fork-conneg`, pin `d75a4dd…`).

**Spec:** `docs/superpowers/specs/2026-07-06-profile-conneg-instantiation-design.md` §5–§8 (+§7
iri-minting deliverable). Phase 1 (fork pillar) is DONE + live.

## Global Constraints

- **FORK UNTOUCHED.** Phase 2 is fork-empty (verified: `src/handlers/resource.js` runs profile
  negotiation + linkset `representations` for files AND containers). Final task asserts
  `~/dev/git/LA3D/JavaScriptSolidServer` HEAD `la3d/lws` == `d75a4dd6e807805bd6a16ff6cf04b3fad8ecb123`
  + clean tree. `Dockerfile.fork` / `docker-compose.fork-tls.yml` pins stay unchanged.
- **P13 boundary:** nothing under `projection/prof/` may name any application vocabulary (no okf, no
  wiki, no dcat, no gray-matter). Applications are data + renderers. `docs/foundations/06-code-placement-audit.md`
  is the standing gate — its L4b rows get re-dispositioned in Task 12.
- **Verbatim pins untouched:** `projection/profiles/defs/llm-wiki/{ontology.ttl,context.jsonld,shapes.ttl}`
  are pinned upstream mirrors (`source`/`version` fields) — never edit them. The adoption descriptor
  `llm-wiki/profile.jsonld` is OURS and is edited here.
- **`altr:` namespace (verbatim, matches the fork):** `http://www.w3.org/ns/dx/connegp/altr#` —
  `hasDefaultRepresentation`, `hasRepresentation`; rep nodes carry `dct:format` (string) +
  `dct:conformsTo` (`@id`). Exactly the shape `tests/lws-conneg.test.mjs` proved live.
- **lwspr role namespace:** `https://w3id.org/lws-pod/profile/role/` (existing).
- **Work directly on `main`** (repo convention). Commit format:
  `[Agent: Claude] type(scope): subject` + body bullets +
  `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`. Stage specific files, never `git add -A`.
- **Test invariants per task:** `cd projection && npx vitest run` must end each task with NO NEW
  failures. Baseline before Task 1 (recorded 2026-07-08): 1 unit failure
  (`profiles/wiki-memory/graph-channel.test.mjs`, the RED-by-design `policy.mint` ripple) + 4
  env-dependent e2e failures when no pod runs at `:3838` (`backcompat`, `engine`, `triggers/cli`,
  `triggers/notifications`) + `extract.test.mjs` collect-time failure (RED by design). From Task 9 on,
  ALL unit suites are green with no skips-by-brokenness.
- **The red fence stands until Task 9.** `projection/okf/red-fence.test.mjs` (asserts the
  `TODO(plan-2)` breadcrumb in `profiles/wiki-memory/extract.mjs`) must PASS through Tasks 1–8; it is
  deleted in Task 9 in the same commit that lands the green re-derived suite. Never patch
  `extract.mjs`'s 3-arg call — only its import paths may change (Tasks 1, 7).

## Chuck-visible subtractions (flagged for plan review)

1. **`constrained-container/` is RETIRED (deleted) in Task 8.** The audit row says "retire decision
   at L4b" — this is L4b's remainder. It has been superseded by fork-native L3 admission since
   2026-06-30, and its projection path (`extract.mjs` via 3-arg `cardToQuads`) has been broken since
   Plan 1 — every proxied write would throw. `make test-app-e2e` (which needs the proxy on `:8080`)
   is removed; the console e2e returns when the console targets the fork pod's native floor
   (recorded as carryover in FOLLOWUP). `make test-app` (unit) is unaffected.
2. **`projection/profiles/wiki-memory/` is DELETED in Task 9** (semantic-markdown body annotations +
   `wm:` vocab — conventions dropped by decision of record; the family of record is `llm-wiki`).
   `app/seed/seed.mjs` is repointed at `defs/llm-wiki/shapes.ttl`.
3. **`projection/engine.mjs` + `base-profile.mjs` + `backcompat.test.mjs` are DELETED in Task 7** —
   the neutral `instantiate()` + app renderers replace the channel engine; okf-base behavior lives in
   the published descriptor (data), not a code path.

---

## File Structure (end state)

```
projection/
  prof/                      # NEUTRAL mechanism (was okf/, minus app files) — zero app vocabulary
    resolve.mjs profile-doc.mjs profile-loader.mjs rdf.mjs namespaces.mjs
    jsonld-graph.mjs         # + quadsToFlat
    derived-view.mjs         # + members suffix filter, skip[], graph-name fragment strip
    materialize.mjs
    instantiate.mjs          # NEW — the instantiation step (spec §5)
    *.test.mjs               # colocated unit tests (moved + new)
  publish/                   # Bucket-2 onboarding (stays) — checks.mjs + checkRepresentation,
                             # publish.mjs + --instantiate
  profiles/defs/             # data (stays): lwsp.ttl + representation mint (B7 reword),
                             # llm-wiki/*.rep.jsonld ×4, dcat-catalog/content.rep.jsonld,
                             # descriptor hasResource additions
apps/wiki-projector/         # APPLICATION #1 tooling (new home)
  package.json vitest.config.js
  card.mjs identity.mjs frontmatter.mjs index-channel.mjs engine-profile.mjs (+tests, moved)
  renderers.mjs (+test)      # NEW — links + index renderers
  triggers/cli.mjs triggers/notifications.mjs (+tests, re-derived)
tests/lws-wiki.test.mjs      # NEW live gate (make test-wiki)
Makefile                     # test-wiki, test-projection (both suites), publish-profiles --instantiate,
                             # NPM_DIRS swap, test-app-e2e removed
DELETED: projection/okf/ (emptied), projection/engine.mjs, projection/engine.test.mjs,
         projection/backcompat.test.mjs, projection/profiles/wiki-memory/, projection/triggers/,
         projection/okf/{base-profile,base-shape.ttl,links.mjs,red-fence.test.mjs},
         constrained-container/
```

Import direction: `apps/wiki-projector` → `projection/prof` only, never the reverse. Bare-specifier
deps resolve from each tree's own `node_modules` (Node ESM resolves from the importing file's
location), so cross-tree relative imports are safe.

---

### Task 1: The `projection/prof/` split — move the neutral modules

**Files:**
- Move (git mv, content unchanged except imports): `projection/okf/{resolve,profile-doc,profile-loader,rdf,namespaces,jsonld-graph,derived-view,materialize}.mjs` + their `.test.mjs` → `projection/prof/`
- Modify (import paths only): `projection/publish/{checks.mjs,publish.mjs,defs.test.mjs,checks.test.mjs,publish.test.mjs}`, `projection/okf/{card.mjs,engine-profile.mjs}` (if they import moved files), `projection/profiles/wiki-memory/{extract.mjs,graph-channel.mjs}` (path-only; `TODO(plan-2)` line untouched), `tests/{lws-profiles,lws-dcat,lws-graph}.test.mjs`, `constrained-container/proxy.js` (namespaces path only; dies in Task 8)

**Interfaces:**
- Produces: every neutral export at its new path, e.g. `projection/prof/profile-loader.mjs` →
  `loadProfile(descriptorUrl, {fetchFn})`, `discoverBinding(resourceUrl, {fetchFn, indexUrl})`;
  `projection/prof/resolve.mjs` → `resolveStorageAuthority(resourceUrl, {fetchFn}) → {authority, profileIndex}`.
  Signatures unchanged.

- [ ] **Step 1: Record the baseline**

Run: `cd projection && npx vitest run --reporter=dot 2>&1 | tail -5`
Expected: the baseline failure set from Global Constraints (1 unit fail + env e2e fails). Save the summary line.

- [ ] **Step 2: Move the eight neutral modules + tests**

```bash
cd projection && mkdir prof
git mv okf/resolve.mjs okf/resolve.test.mjs okf/profile-doc.mjs okf/profile-doc.test.mjs \
  okf/profile-loader.mjs okf/profile-loader.test.mjs okf/rdf.mjs okf/rdf.test.mjs \
  okf/namespaces.mjs okf/namespaces.test.mjs okf/jsonld-graph.mjs okf/jsonld-graph.test.mjs \
  okf/derived-view.mjs okf/derived-view.test.mjs okf/materialize.mjs okf/materialize.test.mjs prof/
```

- [ ] **Step 3: Fix every importer**

Run `grep -rn "okf/\(resolve\|profile-doc\|profile-loader\|rdf\|namespaces\|jsonld-graph\|derived-view\|materialize\)" projection/ tests/ constrained-container/ app/` from the repo root and update each hit to `prof/`. Known hits: `publish/checks.mjs` + `publish/publish.mjs` (`../okf/` → `../prof/`), `okf/card.mjs` (imports `./identity.mjs` — same dir, no change), `profiles/wiki-memory/extract.mjs` (`../../okf/namespaces.mjs` → `../../prof/namespaces.mjs`; leave the `cardToQuads` import + TODO line alone), `tests/lws-profiles.test.mjs`, `tests/lws-dcat.test.mjs`, `tests/lws-graph.test.mjs` (incl. its line ~89 file-path list), `constrained-container/proxy.js` line 15.

- [ ] **Step 4: Verify — same failure set, red fence still green**

Run: `cd projection && npx vitest run --reporter=dot 2>&1 | tail -5` and `npx vitest run okf/red-fence.test.mjs`
Expected: identical failure count to Step 1; red-fence PASS.

- [ ] **Step 5: Commit**

```bash
git add projection/prof projection/okf projection/publish projection/profiles/wiki-memory tests constrained-container
git commit -m "$(cat <<'EOF'
[Agent: Claude] refactor(projection): split neutral PROF mechanism into projection/prof/

- git mv resolve/profile-doc/profile-loader/rdf/namespaces/jsonld-graph/derived-view/materialize (+tests) okf/ -> prof/
- import-path updates only (publish/, wiki-memory extract path-only, root live gates, proxy)
- red fence intact; zero new test failures

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Neutral graph additions — `quadsToFlat`, graph-name fragment strip, member filter + skip

**Files:**
- Modify: `projection/prof/jsonld-graph.mjs`, `projection/prof/derived-view.mjs`
- Test: `projection/prof/jsonld-graph.test.mjs`, `projection/prof/derived-view.test.mjs` (extend)

**Interfaces:**
- Produces: `quadsToFlat(quads, context) → Promise<object>` — flat node form (spec §3): single-subject
  quads → `{'@context', ...node}` (no `@graph` wrapper); multi-subject → `{'@context', '@graph': nodes}`.
- Produces: `materializeDerivedView(containerUrl, token, declaration, {context, fetchFn, skip = []})`
  — `skip` = absolute URLs excluded from members (RESERVED-as-data carryover); `declaration.members`
  (optional string) = only members whose URL ends with it feed the view.
- Changes: aggregate graph names strip the fragment (`(doc['@id'] || url).split('#')[0]`) —
  iri-minting: the graph name is the *document* IRI; flat links members carry the subject `#it`.

- [ ] **Step 1: Write the failing tests**

Append to `projection/prof/jsonld-graph.test.mjs` (reuse the file's existing quad-building helpers/imports):

```js
import { quadsToFlat } from './jsonld-graph.mjs'
import { DataFactory } from 'n3'
const { namedNode, literal, quad } = DataFactory

describe('quadsToFlat', () => {
  const ctx = { dcterms: 'http://purl.org/dc/terms/', title: { '@id': 'dcterms:title' } }
  it('single subject -> flat node, no @graph wrapper', async () => {
    const q = [quad(namedNode('https://p.example/id/a#it'), namedNode('http://purl.org/dc/terms/title'), literal('Alpha'))]
    const doc = await quadsToFlat(q, ctx)
    expect(doc['@id']).toBe('https://p.example/id/a#it')
    expect(doc.title).toBe('Alpha')
    expect(doc['@graph']).toBeUndefined()
  })
  it('multi subject -> @graph fallback', async () => {
    const q = [
      quad(namedNode('https://p.example/id/a#it'), namedNode('http://purl.org/dc/terms/title'), literal('A')),
      quad(namedNode('https://p.example/id/b#it'), namedNode('http://purl.org/dc/terms/title'), literal('B')),
    ]
    const doc = await quadsToFlat(q, ctx)
    expect(doc['@graph']).toHaveLength(2)
  })
})
```

Append to `projection/prof/derived-view.test.mjs` — the file already has the `fakePod()` idiom
(`{fetchFn, puts}` over a Turtle listing + JSON-LD members); add one more fake pod + three cases:

```js
const mixListing = `@prefix ldp: <http://www.w3.org/ns/ldp#> .
<${CONTAINER}> ldp:contains <${CONTAINER}a.md>, <${CONTAINER}a.md.links.jsonld>, <${CONTAINER}other.jsonld>, <${CONTAINER}g.jsonld> .`
const flatLinks = { '@context': CTX, '@id': 'https://authority.example/kb/a#it', label: 'A' }
const otherDoc = { '@context': CTX, '@id': 'https://authority.example/kb/o', '@graph': [{ '@id': 'https://authority.example/kb/o#it', label: 'O' }] }

function fakeMixedPod() {
  const puts = [], fetched = []
  const fetchFn = async (url, opts = {}) => {
    const u = String(url)
    if (opts.method === 'PUT') { puts.push({ url: u, body: JSON.parse(opts.body) }); return { ok: true, status: 201 } }
    fetched.push(u)
    if (u === CONTAINER) return { ok: true, text: async () => mixListing }
    if (u.endsWith('a.md.links.jsonld')) return { ok: true, json: async () => flatLinks, text: async () => JSON.stringify(flatLinks) }
    if (u.endsWith('other.jsonld')) return { ok: true, json: async () => otherDoc, text: async () => JSON.stringify(otherDoc) }
    if (u.endsWith('a.md')) return { ok: true, json: async () => { throw new Error('markdown is not JSON') }, text: async () => '# md' }
    return { ok: false, status: 404 }
  }
  return { fetchFn, puts, fetched }
}

describe('member selection', () => {
  it('declaration.members suffix filter feeds only matching members (markdown never fetched as a graph)', async () => {
    const { fetchFn, puts, fetched } = fakeMixedPod()
    await materializeDerivedView(CONTAINER, null, { named_graph: 'g.jsonld', push_mode: 'replace', mode: 'union', members: '.links.jsonld' }, { context: CTX, fetchFn })
    expect(puts[0].url).toBe(CONTAINER + 'g.jsonld')
    expect(JSON.stringify(puts[0].body)).toContain('A')
    expect(JSON.stringify(puts[0].body)).not.toContain('"O"')
    expect(fetched.filter((u) => u.endsWith('a.md'))).toEqual([])
  })
  it('skip[] excludes sibling declared targets from the member set', async () => {
    const { fetchFn, puts } = fakeMixedPod()
    await materializeDerivedView(CONTAINER, null, { named_graph: 'g.jsonld', push_mode: 'replace', mode: 'union' },
      { context: CTX, fetchFn, skip: [CONTAINER + 'a.md', CONTAINER + 'a.md.links.jsonld'] })
    expect(JSON.stringify(puts[0].body)).toContain('"O"')
    expect(JSON.stringify(puts[0].body)).not.toContain('"A"')
  })
  it('dataset graph names strip the subject fragment (doc IRI, not #it)', async () => {
    const { fetchFn, puts } = fakeMixedPod()
    await materializeDerivedView(CONTAINER, null, { named_graph: 'g.jsonld', push_mode: 'replace', mode: 'dataset', members: '.links.jsonld' }, { context: CTX, fetchFn })
    expect(puts[0].body['@graph'].map((g) => g['@id'])).toEqual(['https://authority.example/kb/a'])
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `cd projection && npx vitest run prof/jsonld-graph.test.mjs prof/derived-view.test.mjs`
Expected: FAIL (`quadsToFlat` not exported; filter/skip/fragment behaviors absent).

- [ ] **Step 3: Implement**

`projection/prof/jsonld-graph.mjs` — append:

```js
// Flat node form (spec §3): the memory's links representation — subject-first,
// no top-level @graph when the quads describe one subject. Multi-subject falls
// back to @graph (the fork admission parser handles both since the toDataset swap).
export async function quadsToFlat(quads, context) {
  const nodes = await nodesFor(quads, context)
  if (nodes.length === 1) return { '@context': context, ...nodes[0] }
  return { '@context': context, '@graph': nodes }
}
```

`projection/prof/derived-view.mjs` — in `memberGraph`, replace the name line:

```js
  const name = (doc['@id'] || url).split('#')[0]                  // graph name = doc IRI; flat members carry #it — strip to the document
```

In `materializeDerivedView`, change the signature + member selection:

```js
export async function materializeDerivedView(containerUrl, token, declaration, { context = {}, fetchFn = fetch, skip = [] } = {}) {
```

```js
  let members = (await readMembers(containerUrl, token, fetchFn)).filter(u => u !== target && !skip.includes(u))
  if (declaration.members) members = members.filter(u => u.endsWith(declaration.members))
```

- [ ] **Step 4: Run tests — pass; then whole projection suite — no new failures**

Run: `cd projection && npx vitest run prof/ && npx vitest run --reporter=dot 2>&1 | tail -3`

Also re-run the live graph gate later in Task 11's sweep — the fragment-strip must not disturb
`make test-graph` (ex-graph members carry fragment-less doc IRIs, so names are unchanged).

- [ ] **Step 5: Commit**

```bash
git add projection/prof/jsonld-graph.mjs projection/prof/jsonld-graph.test.mjs projection/prof/derived-view.mjs projection/prof/derived-view.test.mjs
git commit -m "$(cat <<'EOF'
[Agent: Claude] feat(prof): quadsToFlat + derived-view members filter, skip set, doc-IRI graph names

- quadsToFlat: flat #it node form for links representations (spec §3)
- materializeDerivedView: declaration.members suffix filter + skip[] (RESERVED-as-data)
- aggregate graph names fragment-stripped to the document IRI (iri-minting Plane 1)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Representation roles as data — vocabulary mint, rep artifacts, descriptor edits, declaration checks

**Files:**
- Modify: `projection/profiles/defs/lwsp.ttl`, `projection/profiles/defs/llm-wiki/profile.jsonld`, `projection/profiles/defs/dcat-catalog/profile.jsonld`, `projection/publish/checks.mjs`, `projection/publish/publish.mjs`, `projection/publish/defs.test.mjs`
- Create: `projection/profiles/defs/llm-wiki/{content,links,index,graph}.rep.jsonld`, `projection/profiles/defs/dcat-catalog/content.rep.jsonld`
- Test: `projection/publish/checks.test.mjs` (extend)

**Interfaces:**
- Produces: `checkRepresentation(jsonText, name) → string[]` (failures; empty = pass).
- Produces (data contract consumed by Tasks 4–5): a rep config JSON has `id`, `format`,
  `conformsTo` (resolved by the loader against the artifact URL), and EXACTLY ONE of:
  `self: true` (the canonical resource), `suffix: "<s>"` (per-member artifact at `memberUrl + s`),
  `target: "<rel>"` (container artifact, app renderer), `named_graph: "<rel>"` (+ `push_mode`,
  `mode`, optional `members`) (container aggregate, neutral materializer). Optional `default: true`
  (≤1 per profile).

- [ ] **Step 1: Write the failing check tests**

Append to `projection/publish/checks.test.mjs`:

```js
import { checkRepresentation } from './checks.mjs'

describe('checkRepresentation', () => {
  const ok = { id: 'links', suffix: '.links.jsonld', format: 'application/ld+json', conformsTo: 'profile.jsonld' }
  it('passes a well-formed member rep', () => expect(checkRepresentation(JSON.stringify(ok), 'x')).toEqual([]))
  it('fails on missing id/format/conformsTo', () =>
    expect(checkRepresentation(JSON.stringify({ suffix: '.x' }), 'x').length).toBeGreaterThanOrEqual(3))
  it('fails when zero or two kinds are declared', () => {
    expect(checkRepresentation(JSON.stringify({ id: 'a', format: 'f', conformsTo: 'c' }), 'x')).not.toEqual([])
    expect(checkRepresentation(JSON.stringify({ ...ok, self: true }), 'x')).not.toEqual([])
  })
  it('fails named_graph without a valid mode', () =>
    expect(checkRepresentation(JSON.stringify({ id: 'g', format: 'f', conformsTo: 'c', named_graph: 'g.jsonld' }), 'x')).not.toEqual([]))
  it('fails on non-JSON', () => expect(checkRepresentation('nope', 'x')).not.toEqual([]))
})
```

- [ ] **Step 2: Run to verify failure**

Run: `cd projection && npx vitest run publish/checks.test.mjs` — Expected: FAIL (no export).

- [ ] **Step 3: Implement `checkRepresentation`** (append to `projection/publish/checks.mjs`)

```js
const REP_KINDS = ['self', 'suffix', 'target', 'named_graph']
// Declaration-time check for lwspr:representation artifacts (spec §5) — loud, pre-write.
export function checkRepresentation(jsonText, name) {
  let rep
  try { rep = JSON.parse(jsonText) } catch (e) { return [`${name}: not JSON (${e.message})`] }
  const out = []
  for (const k of ['id', 'format', 'conformsTo']) if (typeof rep[k] !== 'string' || !rep[k]) out.push(`${name}: missing '${k}'`)
  const kinds = REP_KINDS.filter((k) => rep[k] !== undefined)
  if (kinds.length !== 1) out.push(`${name}: exactly one of ${REP_KINDS.join('/')} required (got ${kinds.join(',') || 'none'})`)
  if (rep.named_graph !== undefined && !['union', 'dataset'].includes(rep.mode)) out.push(`${name}: named_graph requires mode union|dataset`)
  return out
}
```

- [ ] **Step 4: Wire into `publish.mjs`'s per-resource check loop**

Import `checkRepresentation` alongside the other checks. Inside `for (const r of prof.resources)` add
(and collect for the ≤1-default rule):

```js
    if (r.roles.includes(LWSPR + 'representation')) {
      const txt = await art()
      failures.push(...checkRepresentation(txt, `${d}:${r.artifact.split('/').pop()}`))
      try { repsSeen.push(JSON.parse(txt)) } catch { /* already failed above */ }
    }
```

with `const repsSeen = []` declared just above that loop (per-descriptor), and after the loop:

```js
  if (repsSeen.filter((x) => x.default).length > 1) failures.push(`${d}: more than one default representation`)
```

- [ ] **Step 5: Mint the role + B7 reword in `lwsp.ttl`**

Append:

```ttl
lwspr:representation a prof:ResourceRole, skos:Concept ;
  skos:prefLabel "Profile representation"@en ;
  skos:definition "Config consumed by the instantiation step: one representation the application offers for content negotiation by profile (DX-PROF-CONNEG). Fields: conformsTo (the representation's profile IRI, resolved against the artifact URL) and format (media type), plus exactly one of — self (the canonical resource itself), suffix (a per-member materialized artifact at member URL + suffix), target (a container-level artifact an application renderer materializes), or named_graph/push_mode/mode with optional members (a container-level aggregate the neutral derived-view materializer builds). Instantiation materializes each declared representation and writes the altr: facts the server advertises and selects on. It carries no application vocabulary."@en ;
  skos:inScheme lwsp: .
```

Replace `lwspr:identity-policy`'s `skos:definition` (B7 — graph-shaped, not one-referent-per-document):

```ttl
  skos:definition "Config consumed by the identity minter: slug strategy, path prefix, fragment, versioning, DID-anchoring. Combined at runtime with the pod's resolved storage authority; never carries an authority literal. Graph-shaped: a stored document carries one named graph whose name is the document IRI ({authority}{pathPrefix}{slug}); the primary subject is the declared fragment (default #it) within it, and the document's graph may carry further subjects."@en ;
```

- [ ] **Step 6: Write the five rep artifacts**

`projection/profiles/defs/llm-wiki/content.rep.jsonld`:
```json
{ "id": "content", "self": true, "default": true, "format": "text/markdown", "conformsTo": "../okf-base.jsonld" }
```
`projection/profiles/defs/llm-wiki/links.rep.jsonld`:
```json
{ "id": "links", "suffix": ".links.jsonld", "format": "application/ld+json", "conformsTo": "profile.jsonld" }
```
`projection/profiles/defs/llm-wiki/index.rep.jsonld`:
```json
{ "id": "index", "target": "index.md", "format": "text/markdown", "conformsTo": "../okf-base.jsonld" }
```
`projection/profiles/defs/llm-wiki/graph.rep.jsonld`:
```json
{ "id": "graph", "named_graph": "graph.jsonld", "push_mode": "replace", "mode": "dataset", "members": ".links.jsonld", "format": "application/ld+json", "conformsTo": "profile.jsonld" }
```
`projection/profiles/defs/dcat-catalog/content.rep.jsonld`:
```json
{ "id": "content", "self": true, "default": true, "format": "application/ld+json", "conformsTo": "profile.jsonld" }
```

(`.jsonld` extension keeps publish's media-type map serving them `application/ld+json` — the
`derived-view.jsonld` precedent. Relative `conformsTo` resolves against the artifact URL, so
`profile.jsonld` = the family's own descriptor, `../okf-base.jsonld` = the content-shape profile.)

- [ ] **Step 7: Add the resources to both OUR descriptors**

`llm-wiki/profile.jsonld` — extend `hasResource` with:
```json
    { "@id": "#rep-content", "hasRole": "lwspr:representation", "hasArtifact": "content.rep.jsonld", "format": "application/ld+json" },
    { "@id": "#rep-links",   "hasRole": "lwspr:representation", "hasArtifact": "links.rep.jsonld",   "format": "application/ld+json" },
    { "@id": "#rep-index",   "hasRole": "lwspr:representation", "hasArtifact": "index.rep.jsonld",   "format": "application/ld+json" },
    { "@id": "#rep-graph",   "hasRole": "lwspr:representation", "hasArtifact": "graph.rep.jsonld",   "format": "application/ld+json" }
```
`dcat-catalog/profile.jsonld` — extend `hasResource` with:
```json
    { "@id": "#rep-content", "hasRole": "lwspr:representation", "hasArtifact": "content.rep.jsonld", "format": "application/ld+json" }
```

- [ ] **Step 8: Update `defs.test.mjs`** — add the five new artifact filenames to its per-family file
  lists (read the file; extend the llm-wiki and dcat-catalog arrays). Run the publish check offline:

Run: `cd projection && npx vitest run publish/ && node publish/publish.mjs --base https://pod.vardeman.me --check`
Expected: unit suites PASS; `checks passed for 4 profile(s)`.

- [ ] **Step 9: Commit**

```bash
git add projection/profiles/defs projection/publish
git commit -m "$(cat <<'EOF'
[Agent: Claude] feat(profiles): lwspr:representation role as data + declaration checks

- mint lwspr:representation (self/suffix/target/named_graph kinds) in lwsp.ttl; B7 identity-policy reworded graph-shaped
- llm-wiki declares content(default,self)/links(suffix)/index(target)/graph(named_graph dataset) reps; dcat-catalog declares its single self rep
- checkRepresentation + <=1-default rule wired into publish's role-driven check loop

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Loader — the `representations` dispatch branch

**Files:**
- Modify: `projection/prof/profile-loader.mjs`
- Test: `projection/prof/profile-loader.test.mjs` (extend)

**Interfaces:**
- Produces: `loadProfile(...)` result gains `representations: object[]` — each rep config fetched,
  with `conformsTo` resolved absolute against the artifact URL. Parents-first accumulation (a child
  family may add reps to an inherited set).

- [ ] **Step 1: Write the failing test** (extend the file's existing mock-fetch idiom — it already
  builds descriptor fixtures for role dispatch; add):

```js
it('dispatches lwspr:representation — config fetched, conformsTo resolved vs the artifact URL', async () => {
  // fixture descriptor at https://p.example/fam/profile.jsonld with
  //   { "@id": "#rep", "hasRole": "lwspr:representation", "hasArtifact": "links.rep.jsonld", "format": "application/ld+json" }
  // fixture artifact at https://p.example/fam/links.rep.jsonld:
  //   { "id": "links", "suffix": ".links.jsonld", "format": "application/ld+json", "conformsTo": "profile.jsonld" }
  const loaded = await loadProfile('https://p.example/fam/profile.jsonld', { fetchFn })
  expect(loaded.representations).toHaveLength(1)
  expect(loaded.representations[0].id).toBe('links')
  expect(loaded.representations[0].conformsTo).toBe('https://p.example/fam/profile.jsonld')
})
```

- [ ] **Step 2: Run to verify failure** — `npx vitest run prof/profile-loader.test.mjs` → FAIL
  (`representations` undefined).

- [ ] **Step 3: Implement** — in `dispatch()`, add before the `unknownRoles` fallback:

```js
      else if (role === LWSP_ROLE + 'representation') {
        const rep = await fetchJson(r.artifact, fetchFn)
        if (rep.conformsTo) rep.conformsTo = new URL(rep.conformsTo, r.artifact).href
        acc.representations.push(rep)
      }
```

and add `representations: []` to the `acc` literal in `loadProfile`.

- [ ] **Step 4: Run tests** — `npx vitest run prof/` → PASS, no new failures elsewhere.

- [ ] **Step 5: Commit**

```bash
git add projection/prof/profile-loader.mjs projection/prof/profile-loader.test.mjs
git commit -m "$(cat <<'EOF'
[Agent: Claude] feat(prof): loadProfile surfaces lwspr:representation declarations

- representations[] accumulated parents-first; conformsTo resolved against the artifact URL

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: `instantiate()` — the neutral instantiation step

**Files:**
- Create: `projection/prof/instantiate.mjs`
- Test: `projection/prof/instantiate.test.mjs`

**Interfaces:**
- Produces: `instantiate(containerUrl, token, profile, opts) → Promise<Array<{rep, target, status}>>`
  where `profile = { representations: object[], context: object /* plain @context */ }` and
  `opts = { renderers = {}, fetchFn = fetch, onMissingRenderer = 'throw'|'skip' }`.
- Produces: `mergeContexts(contexts) → object` — flatten `loadProfile().contexts` into one plain
  `@context` object (base-first, later wins).
- Renderer contracts (consumed by Task 9's app):
  - member rep (`suffix`): `async ({url, body, contentType}) → string|null` (null = skip member)
  - container rep (`target`): `async (containerUrl, sources, members) → string` where
    `sources = [{url, body, contentType}]` (fetched non-target data members) and
    `members = [{url, isContainer}]` (all).

- [ ] **Step 1: Write the failing tests**

`projection/prof/instantiate.test.mjs`:

```js
import { describe, it, expect } from 'vitest'
import { instantiate, mergeContexts } from './instantiate.mjs'

const C = 'https://pod.example/alice/wiki/'
const TTL = `<${C}> <http://www.w3.org/ns/ldp#contains> <${C}a.md>, <${C}b.md>, <${C}index.md>, <${C}sub/> .`

function podMock(extra = {}) {
  const store = new Map(Object.entries({
    [C]: { body: TTL, ct: 'text/turtle' },
    [`${C}a.md`]: { body: '---\ntitle: A\n---\nalpha', ct: 'text/markdown' },
    [`${C}b.md`]: { body: '---\ntitle: B\n---\nbeta', ct: 'text/markdown' },
    [`${C}index.md`]: { body: 'old index', ct: 'text/markdown' },
    ...extra,
  }))
  const fetchFn = async (url, init = {}) => {
    if ((init.method ?? 'GET') === 'PUT') {
      store.set(url, { body: init.body, ct: init.headers['content-type'], link: init.headers.link })
      return { ok: true, status: 201, headers: { get: () => null } }
    }
    const e = store.get(url)
    if (!e) return { ok: false, status: 404, headers: { get: () => null }, text: async () => '', json: async () => ({}) }
    return { ok: true, status: 200, headers: { get: (k) => (k === 'content-type' ? e.ct : null) },
      text: async () => e.body, json: async () => JSON.parse(e.body) }
  }
  return { store, fetchFn }
}

const SELF = { id: 'content', self: true, default: true, format: 'text/markdown', conformsTo: 'https://p.example/base' }
const LINKS = { id: 'links', suffix: '.links.jsonld', format: 'application/ld+json', conformsTo: 'https://p.example/fam' }
const INDEX = { id: 'index', target: 'index.md', format: 'text/markdown', conformsTo: 'https://p.example/base' }

describe('instantiate', () => {
  it('self-only profile: advertises altr default on every source member, materializes nothing', async () => {
    const { store, fetchFn } = podMock()
    const res = await instantiate(C, 't', { representations: [SELF], context: {} }, { fetchFn })
    const meta = JSON.parse(store.get(`${C}a.md.meta`).body)
    expect(meta['altr:hasDefaultRepresentation']['@id']).toBe(`${C}a.md`)
    expect(meta['altr:hasDefaultRepresentation']['dct:format']).toBe('text/markdown')
    expect(store.has(`${C}a.md.links.jsonld`)).toBe(false)
    expect(res.every((r) => [200, 201].includes(r.status))).toBe(true)
  })

  it('member rep: renderer output PUT at member+suffix with a write-side profile Link; null skips', async () => {
    const { store, fetchFn } = podMock()
    const renderers = { links: async (src) => (src.url.endsWith('a.md') ? '{"@id":"x"}' : null) }
    await instantiate(C, 't', { representations: [SELF, LINKS], context: {} }, { fetchFn, renderers })
    expect(store.get(`${C}a.md.links.jsonld`).link).toBe('<https://p.example/fam>; rel="profile"')
    expect(store.has(`${C}b.md.links.jsonld`)).toBe(false)
    const metaA = JSON.parse(store.get(`${C}a.md.meta`).body)
    expect(metaA['altr:hasRepresentation'][0]['@id']).toBe(`${C}a.md.links.jsonld`)
    const metaB = JSON.parse(store.get(`${C}b.md.meta`).body)
    expect(metaB['altr:hasRepresentation']).toBeUndefined()
  })

  it('read-merge-write preserves the bind (conformsTo/describedby) in an existing .meta', async () => {
    const bind = JSON.stringify({ '@context': { dct: 'http://purl.org/dc/terms/' }, '@id': '', 'dct:conformsTo': { '@id': 'https://p.example/fam' } })
    const { store, fetchFn } = podMock({ [`${C}a.md.meta`]: { body: bind, ct: 'application/ld+json' } })
    await instantiate(C, 't', { representations: [SELF], context: {} }, { fetchFn })
    const meta = JSON.parse(store.get(`${C}a.md.meta`).body)
    expect(meta['dct:conformsTo']['@id']).toBe('https://p.example/fam')
    expect(meta['altr:hasDefaultRepresentation']).toBeDefined()
  })

  it('container rep with renderer: PUT at target + container .meta altr alternate; targets/dotfiles/containers excluded from sources', async () => {
    const { store, fetchFn } = podMock()
    const seen = []
    const renderers = { index: async (_c, sources) => { seen.push(...sources.map((s) => s.url)); return '# fresh' } }
    await instantiate(C, 't', { representations: [INDEX], context: {} }, { fetchFn, renderers })
    expect(store.get(`${C}index.md`).body).toBe('# fresh')
    expect(seen.sort()).toEqual([`${C}a.md`, `${C}b.md`])          // not index.md (target), not sub/ (container)
    const cmeta = JSON.parse(store.get(`${C}.meta`).body)
    expect(cmeta['altr:hasRepresentation'][0]['@id']).toBe(`${C}index.md`)
  })

  it('missing renderer: throws by default, skips + reports when onMissingRenderer=skip', async () => {
    const { fetchFn } = podMock()
    await expect(instantiate(C, 't', { representations: [LINKS], context: {} }, { fetchFn })).rejects.toThrow(/links/)
    const res = await instantiate(C, 't', { representations: [LINKS], context: {} }, { fetchFn, onMissingRenderer: 'skip' })
    expect(res.some((r) => r.rep === 'skipped:links')).toBe(true)
  })
})

describe('mergeContexts', () => {
  it('flattens base-first, later wins', () =>
    expect(mergeContexts([{ '@context': { a: 'x', b: 'y' } }, { '@context': { b: 'z' } }])).toEqual({ a: 'x', b: 'z' }))
})
```

- [ ] **Step 2: Run to verify failure** — `npx vitest run prof/instantiate.test.mjs` → FAIL (no module).

- [ ] **Step 3: Implement `projection/prof/instantiate.mjs`**

```js
// Neutral instantiation (spec §5): materialize a profile's declared representations
// over a bound container + advertise the altr: facts the Phase-1 conneg surface
// selects on. Applications supply renderers; this module never interprets content
// (P13 — the server selects and serves, the application materializes).
import { Parser } from 'n3'
import { materializeDerivedView } from './derived-view.mjs'

const LDP_CONTAINS = 'http://www.w3.org/ns/ldp#contains'
const ALTR = 'http://www.w3.org/ns/dx/connegp/altr#'
const authH = (token) => (token ? { authorization: `Bearer ${token}` } : {})
const lastSeg = (url) => { const u = url.endsWith('/') ? url.slice(0, -1) : url; return u.slice(u.lastIndexOf('/') + 1) }
const metaUrlOf = (url) => url + '.meta'                            // JSS convention: file -> <url>.meta, container -> <url>/.meta

export const mergeContexts = (contexts) => contexts.reduce((m, c) => Object.assign(m, c['@context'] ?? {}), {})

async function readMembers(containerUrl, token, fetchFn) {
  const r = await fetchFn(containerUrl, { headers: { accept: 'text/turtle', ...authH(token) } })
  if (!r.ok) throw new Error(`container ${containerUrl} -> ${r.status}`)
  return new Parser().parse(await r.text())
    .filter((q) => q.predicate.value === LDP_CONTAINS)
    .map((q) => ({ url: q.object.value, isContainer: q.object.value.endsWith('/') }))
}

const repEntry = (href, rep) => ({ '@id': href, 'dct:format': rep.format, 'dct:conformsTo': { '@id': rep.conformsTo } })

// Read-merge-write the altr: facts into a client-managed .meta; the bind's
// conformsTo/describedby members are preserved.
async function advertise(resourceUrl, token, dflt, alternates, fetchFn) {
  const metaUrl = metaUrlOf(resourceUrl)
  let meta = {}
  const r0 = await fetchFn(metaUrl, { headers: { accept: 'application/ld+json', ...authH(token) } })
  if (r0.ok) { try { meta = await r0.json() } catch { meta = {} } }
  meta['@context'] = { ...(typeof meta['@context'] === 'object' && !Array.isArray(meta['@context']) ? meta['@context'] : {}),
    altr: ALTR, dct: 'http://purl.org/dc/terms/' }
  meta['@id'] = meta['@id'] ?? ''
  if (dflt) meta['altr:hasDefaultRepresentation'] = dflt
  if (alternates.length) meta['altr:hasRepresentation'] = alternates
  const r = await fetchFn(metaUrl, { method: 'PUT', headers: { 'content-type': 'application/ld+json', ...authH(token) }, body: JSON.stringify(meta, null, 2) })
  return { rep: 'altr', target: metaUrl, status: r.status }
}

export async function instantiate(containerUrl, token, profile, { renderers = {}, fetchFn = fetch, onMissingRenderer = 'throw' } = {}) {
  const reps = profile.representations ?? []
  if (!reps.length) return []
  const selfRep = reps.find((r) => r.self)
  const memberReps = reps.filter((r) => r.suffix)
  const containerReps = reps.filter((r) => r.target || r.named_graph)
  const results = []

  const need = (rep) => {
    if (rep.named_graph || renderers[rep.id]) return true
    if (onMissingRenderer === 'throw') throw new Error(`representation '${rep.id}' declared but no renderer supplied`)
    results.push({ rep: `skipped:${rep.id}`, target: null, status: 0 })
    return false
  }

  const members = await readMembers(containerUrl, token, fetchFn)
  const containerTargets = containerReps.map((r) => new URL(r.target ?? r.named_graph, containerUrl).href)
  const isTarget = (url) => containerTargets.includes(url) || memberReps.some((r) => url.endsWith(r.suffix))
  const sourceMembers = members.filter((m) => !m.isContainer && !isTarget(m.url) && !lastSeg(m.url).startsWith('.'))

  // Fetch each source once; renderers parse what they understand.
  const sources = []
  for (const m of sourceMembers) {
    const r = await fetchFn(m.url, { headers: { accept: '*/*', ...authH(token) } })
    if (!r.ok) { console.warn(`[instantiate] skip ${m.url} -> ${r.status}`); continue }
    sources.push({ url: m.url, body: await r.text(), contentType: r.headers.get('content-type') ?? '' })
  }

  // Per-member representations: materialize + advertise.
  for (const src of sources) {
    const alternates = []
    for (const rep of memberReps) {
      if (!need(rep)) continue
      const body = await renderers[rep.id](src)
      if (body == null) continue
      const target = src.url + rep.suffix
      const put = await fetchFn(target, { method: 'PUT',
        headers: { 'content-type': rep.format, link: `<${rep.conformsTo}>; rel="profile"`, ...authH(token) }, body })
      results.push({ rep: rep.id, target, status: put.status })
      alternates.push(repEntry(target, rep))
    }
    if (selfRep || alternates.length)
      results.push(await advertise(src.url, token, selfRep ? repEntry(src.url, selfRep) : null, alternates, fetchFn))
  }

  // Container-level representations: neutral aggregates + renderer-backed artifacts.
  const containerAlts = []
  for (const rep of containerReps) {
    if (rep.mode) {
      const out = await materializeDerivedView(containerUrl, token, rep, { context: profile.context ?? {}, fetchFn, skip: containerTargets })
      results.push({ rep: rep.id, target: out.target, status: out.status })
      containerAlts.push(repEntry(out.target, rep))
    } else {
      if (!need(rep)) continue
      const target = new URL(rep.target, containerUrl).href
      const body = await renderers[rep.id](containerUrl, sources, members)
      const put = await fetchFn(target, { method: 'PUT',
        headers: { 'content-type': rep.format, link: `<${rep.conformsTo}>; rel="profile"`, ...authH(token) }, body })
      results.push({ rep: rep.id, target, status: put.status })
      containerAlts.push(repEntry(target, rep))
    }
  }
  if (containerAlts.length) results.push(await advertise(containerUrl, token, null, containerAlts, fetchFn))
  return results
}
```

- [ ] **Step 4: Run tests** — `npx vitest run prof/instantiate.test.mjs` → PASS; whole projection
  suite → no new failures.

- [ ] **Step 5: Commit**

```bash
git add projection/prof/instantiate.mjs projection/prof/instantiate.test.mjs
git commit -m "$(cat <<'EOF'
[Agent: Claude] feat(prof): neutral instantiate() — materialize declared representations + advertise altr:

- self/suffix/target/named_graph kinds; renderer seam for app transforms (P13)
- altr: read-merge-write preserves the bind; skip-set from declared targets (RESERVED-as-data)
- mergeContexts helper for renderer-free callers (publish)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: `publish.mjs --instantiate` (the onboarding step, renderer-free arm)

**Files:**
- Modify: `projection/publish/publish.mjs`, `Makefile` (publish-profiles target)

**Interfaces:**
- Produces: `--instantiate <path>=<token>` (repeatable) — after binds, loads the profile and runs
  `instantiate(..., { onMissingRenderer: 'skip' })`: self reps + neutral aggregates are fully
  onboarded from data; renderer-backed reps are reported skipped (the app CLI owns those).

- [ ] **Step 1: Implement** — in `publish.mjs`, next to the `binds` parsing add:

```js
const insts = process.argv.flatMap((a, i) => (process.argv[i - 1] === '--instantiate' ? [a] : []))
```

Import `instantiate, mergeContexts` from `../prof/instantiate.mjs`. After the bind loop, before the
final `console.log`:

```js
// 4. Instantiate (spec §5, renderer-free arm): materialize self/aggregate
// representations + advertise altr: for the container's current members.
// Renderer-backed representations are the application CLI's job — reported, skipped.
for (const s of insts) {
  const [path, tokenName] = s.split('=')
  const descriptor = profilesByToken[tokenName]
    ?? (() => { console.error(`--instantiate: no profile in the manifest has token '${tokenName}'`); process.exit(1) })()
  const loaded = await loadProfile(descriptor)
  let res
  try {
    res = await instantiate(new URL(path, base).href, token,
      { representations: loaded.representations, context: mergeContexts(loaded.contexts) },
      { onMissingRenderer: 'skip' })
  } catch (e) {
    // A profile can be published before its first container exists (fresh pod).
    if (/-> 404/.test(e.message)) { console.log(`INSTANTIATE ${path}: container absent (404) — skipped`); continue }
    throw e
  }
  const skipped = res.filter((r) => r.rep.startsWith('skipped:')).map((r) => r.rep.slice(8))
  if (skipped.length) console.log(`INSTANTIATE ${path}: skipped renderer-backed reps [${[...new Set(skipped)].join(', ')}] — app tooling owns them`)
  const bad = res.filter((r) => r.status && ![200, 201, 204, 205].includes(r.status))
  if (bad.length) { console.error(`INSTANTIATE ${path} failures: ${JSON.stringify(bad)}`); process.exit(1) }
  console.log(`INSTANTIATE ${path} ${tokenName} -> ${res.length} writes`)
}
```

- [ ] **Step 2: Makefile** — extend `publish-profiles`'s command with dcat's renderer-free instantiation:

```make
	  --bind /alice/datasets/=dcat-catalog --instantiate /alice/datasets/=dcat-catalog --token $${POD_TOKEN}
```

- [ ] **Step 3: Verify offline** — `node publish/publish.mjs --base https://pod.example --check`
  still exits 0 (`--check` returns before publish/bind/instantiate). Live proof rides Task 11.

- [ ] **Step 4: Commit**

```bash
git add projection/publish/publish.mjs Makefile
git commit -m "$(cat <<'EOF'
[Agent: Claude] feat(publish): --instantiate onboarding step (renderer-free arm)

- self + aggregate representations materialized/advertised from manifest data; renderer reps reported to the app CLI
- publish-profiles instantiates dcat-catalog (acceptance #3 zero-code baseline)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: Engine demotion — `apps/wiki-projector/` scaffold + app-module move + B1 fix

**Files:**
- Create: `apps/wiki-projector/package.json`, `apps/wiki-projector/vitest.config.js`
- Move: `projection/okf/{card,identity,frontmatter,index-channel,engine-profile}.mjs` + their `.test.mjs` → `apps/wiki-projector/`
- Modify: `apps/wiki-projector/engine-profile.mjs` (B1: drop the force-fit channels), `apps/wiki-projector/engine-profile.test.mjs`, `projection/profiles/wiki-memory/extract.mjs` (import path ONLY)
- Delete: `projection/engine.mjs`, `projection/engine.test.mjs`, `projection/backcompat.test.mjs`, `projection/okf/base-profile.mjs`, `projection/okf/base-profile.test.mjs`, `projection/triggers/` moves in Task 10 — NOT here

**Interfaces:**
- Produces: `apps/wiki-projector/engine-profile.mjs` →
  `makeEngineProfile(loaded, authority) → { application, context: {'@context': …}, identityPolicy, representations, validation, planeMapping }`
  (B1: no `channels`, no `types` — representations are profile data now).
- Consumes: `projection/prof/{namespaces,jsonld-graph}.mjs` (relative `../../projection/prof/…`).

- [ ] **Step 1: Scaffold**

`apps/wiki-projector/package.json`:
```json
{
  "name": "wiki-projector",
  "private": true,
  "type": "module",
  "description": "Application #1: the wiki-memory projector — OKF-family card tooling + renderers + triggers over the neutral projection/prof mechanism.",
  "scripts": { "start": "node triggers/notifications.mjs", "test": "vitest run" },
  "dependencies": { "gray-matter": "^4.0.3", "n3": "^1.17.4", "ws": "^8.18.0" },
  "devDependencies": { "vitest": "^3.2.0" },
  "allowScripts": { "esbuild@0.27.7": true, "fsevents@2.3.3": true }
}
```
`apps/wiki-projector/vitest.config.js`: copy `projection/vitest.config.js` verbatim.
Run `cd apps/wiki-projector && npm install` (creates the lockfile; `node_modules` is gitignored —
verify `.gitignore` covers `apps/**/node_modules` or uses a global `node_modules/` pattern; add if not).

- [ ] **Step 2: Move the five app modules + tests**

```bash
git mv projection/okf/card.mjs projection/okf/card.test.mjs projection/okf/identity.mjs projection/okf/identity.test.mjs \
  projection/okf/frontmatter.mjs projection/okf/frontmatter.test.mjs projection/okf/index-channel.mjs \
  projection/okf/index-channel.test.mjs projection/okf/engine-profile.mjs projection/okf/engine-profile.test.mjs \
  apps/wiki-projector/
```

Fix imports inside the moved files: same-directory imports (`./identity.mjs` etc.) are unchanged;
anything importing `prof/` becomes `../../projection/prof/…`.

- [ ] **Step 3: B1 — engine-profile drops the channel force-fit**

Replace `apps/wiki-projector/engine-profile.mjs`'s import of `indexChannel` and the profile shape:

```js
import { makeIdentityPolicy } from './identity.mjs'

// Merge stacked contexts into one @context object, base-first (later layers
// win on key collision — JSON-LD array-context semantics for our flat reader),
// then inject the runtime proto @vocab layer (spec §8: {authority}proto#).
function stackContexts(contexts, authority) {
  const merged = {}
  for (const c of contexts) Object.assign(merged, c['@context'] || {})
  merged['@vocab'] = authority + 'proto#'
  return { '@context': merged }
}

// Bridge: Loaded (profile-loader) -> the app profile shape. Mint base = resolved
// authority + policy pathPrefix (spec §7); policy config never carries an
// authority literal (iri-minting.md). B1 fixed: no channel is force-fit —
// representations are the profile's own declared data.
export function makeEngineProfile(loaded, authority) {
  const cfg = loaded.identityPolicy ?? {}
  return {
    application: loaded.token ?? loaded.id,
    context: stackContexts(loaded.contexts, authority),
    identityPolicy: makeIdentityPolicy({ base: authority + (cfg.pathPrefix ?? ''), fragment: cfg.fragment ?? '#it' }),
    representations: loaded.representations ?? [],
    validation: loaded.validation,
    planeMapping: loaded.planeMapping,
  }
}
```

Update `engine-profile.test.mjs`: drop channel assertions; add
`expect(profile.channels).toBeUndefined()` (the B1 regression pin) and
`expect(profile.representations).toEqual(loaded.representations)`.

- [ ] **Step 4: Delete the superseded engine path**

```bash
git rm projection/engine.mjs projection/engine.test.mjs projection/backcompat.test.mjs \
  projection/okf/base-profile.mjs projection/okf/base-profile.test.mjs
```

First `grep -rn "base-profile\|from './engine.mjs'\|engine.mjs'" projection/ apps/ tests/` — the only
remaining engine importers must be `projection/triggers/*` (re-derived in Task 10; they are broken
between Tasks 7–10, which is acceptable: their tests were env-dependent e2e and Task 10 replaces
them — delete `projection/triggers/cli.test.mjs` + `notifications.test.mjs` NOW to keep the suite
honest, keep the two `.mjs` sources for Task 10's rewrite reference).

`projection/profiles/wiki-memory/extract.mjs`: update the card import ONLY —
`import { cardToQuads } from '../../../apps/wiki-projector/card.mjs'` (TODO line untouched).
`projection/profiles/wiki-memory/index.mjs`: update `indexChannel` import to
`'../../../apps/wiki-projector/index-channel.mjs'`.

- [ ] **Step 5: Verify**

Run: `cd apps/wiki-projector && npx vitest run` → all moved unit tests PASS.
Run: `cd projection && npx vitest run --reporter=dot 2>&1 | tail -3` → remaining failures = the two
RED-by-design wiki files only (extract collect fail + graph-channel policy.mint). Red fence PASS.

- [ ] **Step 6: Commit**

```bash
git add -A apps/wiki-projector
git add projection/okf projection/profiles/wiki-memory projection/engine.mjs projection/engine.test.mjs projection/backcompat.test.mjs projection/triggers
git commit -m "$(cat <<'EOF'
[Agent: Claude] refactor(apps): engine demotion — wiki app tooling moves to apps/wiki-projector/

- card/identity/frontmatter/index-channel/engine-profile (+tests) out of projection/
- B1 fixed: makeEngineProfile no longer force-fits the index channel; representations are data
- channel engine deleted (engine.mjs/backcompat + legacy base-profile) — instantiate() replaces it
- wiki-memory extract/index import paths only; red fence intact

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: Retire `constrained-container/` (the audit's L4b decision)

**Files:**
- Delete: `constrained-container/` (all), `projection/okf/links.mjs`, `projection/okf/links.test.mjs`, `projection/okf/base-shape.ttl`
- Modify: `app/seed/seed.mjs` (shape source repoint), `Makefile` (NPM_DIRS, remove `test-app-e2e`), `app/README.md` (proxy instructions → retirement note), `README.md` (layout row if present)

- [ ] **Step 1: Verify sole-consumer claims**

Run: `grep -rn "constrained-container\|okf/links\|base-shape" --include="*.mjs" --include="*.js" --include="Makefile" . | grep -v node_modules | grep -v docs/`
Expected consumers only: the proxy itself, seed.mjs (wiki-memory shapes path), Makefile NPM_DIRS +
test-app-e2e, READMEs. Anything else → STOP and reassess before deleting.

- [ ] **Step 2: Delete**

```bash
git rm -r constrained-container
git rm projection/okf/links.mjs projection/okf/links.test.mjs projection/okf/base-shape.ttl
```

- [ ] **Step 3: Repoint the console seed** — in `app/seed/seed.mjs` (~line 80):

```js
const shapePath = new URL('../../projection/profiles/defs/llm-wiki/shapes.ttl', import.meta.url)
```

- [ ] **Step 4: Makefile** — in `NPM_DIRS` replace `constrained-container` with
  `apps/wiki-projector`; delete the `test-app-e2e` target + its comment + its `.PHONY` entry.
  `app/README.md`: replace the proxy run instructions with one line — the SHACL floor is fork-native
  (L3) since 2026-06-30; the proxy is retired; console e2e returns when the console targets the fork
  pod (FOLLOWUP carryover).

- [ ] **Step 5: Verify**

Run: `cd projection && npx vitest run --reporter=dot 2>&1 | tail -3` (unchanged failure set) and
`make test-app` (console unit suite still green — it never imported the proxy).

- [ ] **Step 6: Commit**

```bash
git add -A constrained-container projection/okf app/seed/seed.mjs app/README.md Makefile README.md
git commit -m "$(cat <<'EOF'
[Agent: Claude] chore(l2): retire constrained-container proxy (audit L4b decision)

- superseded by fork-native L3 admission since 2026-06-30; its extract path has thrown since Plan 1
- okf/links.mjs + base-shape.ttl die with their sole consumer (B9 closure)
- seed repointed to defs/llm-wiki/shapes.ttl; test-app-e2e removed pending console-on-fork rewire (FOLLOWUP)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 9: The re-derived wiki family — renderers, green suite, fence retired

**Files:**
- Create: `apps/wiki-projector/renderers.mjs`, `apps/wiki-projector/renderers.test.mjs`
- Delete: `projection/profiles/wiki-memory/` (all 12 files), `projection/okf/red-fence.test.mjs`, `projection/okf/` (now empty)

**Interfaces:**
- Produces: `makeRenderers(loaded, authority) → { profile, renderers }` — `profile` =
  `makeEngineProfile(loaded, authority)`; `renderers.links` (member: markdown card → flat `#it`
  JSON-LD string, `null` for non-cards), `renderers.index` (container: OKF navigation markdown).
- Consumes: `cardToQuads(markdown, cardUrl, ns, policy) → {quads, protoTerms}`,
  `loadNamespaces(contextObj)`, `quadsToFlat(quads, context)`, `renderIndex(containerUrl, cards, members)`,
  `parseFrontmatter`, `isConformant`, `makeEngineProfile`.

- [ ] **Step 1: Write the failing tests**

`apps/wiki-projector/renderers.test.mjs`:

```js
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { makeRenderers } from './renderers.mjs'

const AUTH = 'https://pod.example/'
const ctx = JSON.parse(readFileSync(new URL('../../projection/profiles/defs/llm-wiki/context.jsonld', import.meta.url)))
const loaded = {
  id: 'https://pod.example/alice/profiles/llm-wiki/profile.jsonld', token: 'llm-wiki',
  contexts: [ctx], identityPolicy: { pathPrefix: 'id/', fragment: '#it' },
  representations: [], validation: [], planeMapping: null, conformance: [], vocabulary: [], derivedViews: [], unknownRoles: [],
}

const CARD_A = `---
type: llm-wiki-colab:Project
title: Alpha
up: b.md
---
Alpha prose the graph never sees.`

describe('links renderer', () => {
  const { renderers } = makeRenderers(loaded, AUTH)
  it('frontmatter card -> flat #it JSON-LD: minted subject, title literal, typed edge', async () => {
    const out = JSON.parse(await renderers.links({ url: 'https://pod.example/alice/wiki/a.md', body: CARD_A, contentType: 'text/markdown' }))
    expect(out['@id']).toBe('https://pod.example/id/a#it')
    expect(out['@graph']).toBeUndefined()                          // flat node form (spec §3)
    expect(JSON.stringify(out)).toContain('Alpha')
    expect(JSON.stringify(out)).toContain('https://pod.example/id/b#it')   // up: b.md minted
  })
  it('non-markdown and non-conformant members -> null', async () => {
    expect(await renderers.links({ url: 'x/graph.jsonld', body: '{}', contentType: 'application/ld+json' })).toBeNull()
    expect(await renderers.links({ url: 'x/loose.md', body: 'no frontmatter', contentType: 'text/markdown' })).toBeNull()
  })
})

describe('index renderer', () => {
  const { renderers } = makeRenderers(loaded, AUTH)
  it('groups cards by local-name type and lists subdirectories', async () => {
    const C = 'https://pod.example/alice/wiki/'
    const sources = [{ url: C + 'a.md', body: CARD_A, contentType: 'text/markdown' }]
    const members = [{ url: C + 'a.md', isContainer: false }, { url: C + 'sub/', isContainer: true }]
    const md = await renderers.index(C, sources, members)
    expect(md).toContain('# Projects')                             // local name, not the CURIE
    expect(md).toContain('[Alpha](a.md)')
    expect(md).toContain('# Subdirectories')
    expect(md).toContain('[sub](sub/)')
  })
})
```

- [ ] **Step 2: Run to verify failure** — `cd apps/wiki-projector && npx vitest run renderers.test.mjs` → FAIL.

- [ ] **Step 3: Implement `apps/wiki-projector/renderers.mjs`**

```js
// Application-#1 renderers: what the wiki family materializes per declared
// representation. links = the memory's typed edges as flat #it JSON-LD (the
// SHACL-governed face); index = the OKF navigation channel. The neutral
// instantiate() step drives these; content (markdown) is the canonical
// resource itself and is never transformed.
import { parseFrontmatter, isConformant } from './frontmatter.mjs'
import { cardToQuads } from './card.mjs'
import { makeEngineProfile } from './engine-profile.mjs'
import { renderIndex } from './index-channel.mjs'
import { loadNamespaces } from '../../projection/prof/namespaces.mjs'
import { quadsToFlat } from '../../projection/prof/jsonld-graph.mjs'

const isMarkdown = (src) => src.contentType.startsWith('text/markdown') || /\.md$/.test(src.url)
const localName = (t) => { const s = String(t); return s.includes(':') ? s.slice(s.lastIndexOf(':') + 1) : s }

export function makeRenderers(loaded, authority) {
  const profile = makeEngineProfile(loaded, authority)
  const ns = loadNamespaces(profile.context)
  const policy = profile.identityPolicy
  const ctx = profile.context['@context']

  const cardOf = (src) => {
    if (!isMarkdown(src)) return null
    const { frontmatter, body } = parseFrontmatter(src.body)
    return isConformant(frontmatter) ? { url: src.url, frontmatter, body } : null
  }

  return {
    profile,
    renderers: {
      links: async (src) => {
        if (!cardOf(src)) return null
        const { quads } = cardToQuads(src.body, src.url, ns, policy)
        return quads.length ? JSON.stringify(await quadsToFlat(quads, ctx), null, 2) : null
      },
      index: async (containerUrl, sources, members) => {
        const cards = sources.map(cardOf).filter(Boolean)
          .map((c) => ({ ...c, frontmatter: { ...c.frontmatter, type: localName(c.frontmatter.type ?? 'Concept') } }))
        return renderIndex(containerUrl, cards, members.map((m) => ({ ...m, type: m.isContainer ? 'container' : 'data' })))
      },
    },
  }
}
```

- [ ] **Step 4: Run tests** — `npx vitest run` in `apps/wiki-projector` → PASS. If the `up:` edge
  assertion fails on compaction detail, assert against the expanded IRI string in the serialized JSON
  (the minted target `https://pod.example/id/b#it` must appear either as a term value or an `@id`) —
  do not weaken the minted-subject or flat-form assertions.

- [ ] **Step 5: Delete the old family + retire the fence (same commit — the suite is green on the decoupled floor)**

```bash
git rm -r projection/profiles/wiki-memory
git rm projection/okf/red-fence.test.mjs
rmdir projection/okf
```

Run: `cd projection && npx vitest run` → **ALL GREEN** (prof + publish; no RED files remain).
Run: `cd apps/wiki-projector && npx vitest run` → ALL GREEN.
Run: `grep -rn "wiki-memory\|okf/" projection/ apps/ tests/ --include="*.mjs" | grep -v node_modules` →
no stale imports (docs references are Task 12's).

- [ ] **Step 6: Commit**

```bash
git add -A projection/profiles/wiki-memory projection/okf apps/wiki-projector
git commit -m "$(cat <<'EOF'
[Agent: Claude] feat(wiki): re-derive wiki-memory as content-rep + links-rep renderers; retire the red fence

- links renderer: frontmatter card -> flat #it JSON-LD via cardToQuads + identity policy (closes the TODO(plan-2) ripple by re-derivation, not patching)
- index renderer: OKF navigation channel over parsed cards (local-name type groups)
- Plan-1-era profiles/wiki-memory (semantic-markdown, wm: vocab) deleted; projection unit suite fully green

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 10: Triggers re-derived — the mechanism goes under the running system

**Files:**
- Create: `apps/wiki-projector/triggers/run.mjs`, `apps/wiki-projector/triggers/cli.mjs`, `apps/wiki-projector/triggers/notifications.mjs`, `apps/wiki-projector/triggers/cli.test.mjs`
- Delete: `projection/triggers/` (both sources; their tests died in Task 7)

**Interfaces:**
- Consumes: `discoverBinding`, `loadProfile` (`projection/prof/profile-loader.mjs`),
  `resolveStorageAuthority` (`projection/prof/resolve.mjs`), `instantiate`
  (`projection/prof/instantiate.mjs`), `makeRenderers`.
- Produces: `runOnce(containerUrl, token) → Promise<results>` (exported for the live gate + both triggers).

- [ ] **Step 1: Write the failing test**

`apps/wiki-projector/triggers/cli.test.mjs`:

```js
import { describe, it, expect } from 'vitest'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

describe('cli trigger', () => {
  it('exits 2 with usage when no container URL is given', () => {
    try { execFileSync('node', [fileURLToPath(new URL('./cli.mjs', import.meta.url))], { stdio: 'pipe' }); expect.unreachable() }
    catch (e) { expect(e.status).toBe(2); expect(String(e.stderr)).toContain('usage:') }
  })
})
```

- [ ] **Step 2: Implement `apps/wiki-projector/triggers/run.mjs`** (shared core both triggers use)

```js
// Runtime adoption of the profile mechanism (the Plan-2 chain goes under the
// running system): discover the container's bound profile, load it, resolve the
// storage authority, and run the neutral instantiate step with the wiki renderers.
import { discoverBinding, loadProfile } from '../../../projection/prof/profile-loader.mjs'
import { resolveStorageAuthority } from '../../../projection/prof/resolve.mjs'
import { instantiate } from '../../../projection/prof/instantiate.mjs'
import { makeRenderers } from '../renderers.mjs'

export async function runOnce(containerUrl, token) {
  const authed = (url, init = {}) => fetch(url, { ...init,
    headers: { ...(init.headers ?? {}), ...(token ? { authorization: `Bearer ${token}` } : {}) } })
  // First declared binding governs the projection; plural bindings AND-compose on
  // validation, most-specific selection is a conneg/read concern (spec §6 leanings).
  const [descriptor] = await discoverBinding(containerUrl, { fetchFn: authed })
  if (!descriptor) throw new Error(`no profile bound at ${containerUrl}`)
  const loaded = await loadProfile(descriptor, { fetchFn: authed })
  const { authority } = await resolveStorageAuthority(containerUrl, { fetchFn: authed })
  const { profile, renderers } = makeRenderers(loaded, authority)
  return instantiate(containerUrl, token,
    { representations: profile.representations, context: profile.context['@context'] }, { renderers, fetchFn: authed })
}
```

`apps/wiki-projector/triggers/cli.mjs`:

```js
// Manual / backfill instantiation over a bound container.
// usage: TOKEN=<bearer> node triggers/cli.mjs <containerUrl>
import { runOnce } from './run.mjs'

const container = process.argv[2]
if (!container) { console.error('usage: TOKEN=<bearer> node triggers/cli.mjs <containerUrl>'); process.exit(2) }
const res = await runOnce(container, process.env.TOKEN || null)
console.log(JSON.stringify(res))
if (res.some((r) => r.status && ![200, 201, 204, 205].includes(r.status))) process.exit(1)
```

`apps/wiki-projector/triggers/notifications.mjs`: copy the old `projection/triggers/notifications.mjs`
CDC watcher verbatim EXCEPT: drop the `project`/`wikiMemoryProfile` imports and the `profile` opt;
the debounced callback becomes `onProject?.(await runOnce(containerUrl, token))` (import `runOnce`
from `./run.mjs`). Keep socket/debounce/ack handling byte-identical otherwise.

Then `git rm -r projection/triggers`.

- [ ] **Step 3: Run tests** — `cd apps/wiki-projector && npx vitest run` → PASS (live behavior is
  Task 11's gate; these triggers are exercised there via `runOnce`).

- [ ] **Step 4: Commit**

```bash
git add -A apps/wiki-projector/triggers projection/triggers
git commit -m "$(cat <<'EOF'
[Agent: Claude] feat(wiki): triggers re-derived on discoverBinding + loadProfile + instantiate

- runOnce(): binding discovery -> profile load -> authority resolve -> instantiate with wiki renderers
- CDC watcher keeps its socket/debounce; the projection engine call is gone
- the Plan-2 PROF chain now has production callers (coupling-review closure)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 11: The live gate — `tests/lws-wiki.test.mjs` + Makefile wiring

**Files:**
- Create: `tests/lws-wiki.test.mjs`
- Modify: `Makefile` (`test-wiki` target, `test-projection` runs both suites, `.PHONY`)

Precondition (documented in the target comment): `make up-fork-tls` running + `make cert` +
`make publish-profiles` run (publishes the rep artifacts + descriptors this gate resolves).

- [ ] **Step 1: Write the gate**

```js
import { describe, it, beforeAll, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { BASE, ensurePod, getToken } from './helpers.mjs'
import { runOnce } from '../apps/wiki-projector/triggers/run.mjs'

// Phase-2 wiki gate (spec §6/§10 #2): the re-derived family live — content is
// canonical + ungoverned, links are materialized + SHACL-floor-governed, the
// Phase-1 conneg surface selects between them. beforeAll is the app onboarding
// recipe (bind + ACL + instantiate); profiles come from `make publish-profiles`.
const WIKI = '/alice/wiki/'
const LLM_WIKI = `${BASE}/alice/profiles/llm-wiki/profile.jsonld`
const OKF_BASE = `${BASE}/alice/profiles/okf-base.jsonld`
const DCT = 'http://purl.org/dc/terms/'
const POWDER = 'http://www.w3.org/2007/05/powder-s#'

const sd = await fetch(`${BASE}/.well-known/lws-storage`, { headers: { Accept: 'application/lws+json' } })
  .then((r) => (r.ok ? r.json() : {})).catch(() => ({}))
const hasConneg = JSON.stringify(sd.capability || []).includes('connegp/profile/http')

const CARD_A = `---
type: llm-wiki-colab:Project
title: Alpha
up: b.md
---
Alpha prose — content the graph never sees.`
const CARD_B = `---
type: llm-wiki-colab:MOC
title: Beta
---
Beta prose.`

describe.skipIf(!hasConneg)('LWS wiki family — instantiation + conneg-by-profile (probe-#5 surface)', () => {
  let token, auth
  beforeAll(async () => {
    await ensurePod()
    ;({ token } = await getToken())
    auth = { Authorization: `Bearer ${token}` }
    // Profiles must be published — fail loud with the fix, never skip (mcp-v2 lesson).
    const prof = await fetch(LLM_WIKI)
    if (!prof.ok) throw new Error(`llm-wiki descriptor unreachable (${prof.status}) — run 'make publish-profiles' first`)
    if (!JSON.stringify(await prof.json()).includes('representation')) throw new Error('llm-wiki descriptor has no representation resources — re-run make publish-profiles')

    // Recipe: cards -> public-read ACL -> bind -> instantiate.
    for (const [name, body] of [['a.md', CARD_A], ['b.md', CARD_B]]) {
      const r = await fetch(`${BASE}${WIKI}${name}`, { method: 'PUT', headers: { 'Content-Type': 'text/markdown', ...auth }, body })
      expect([200, 201, 204, 205]).toContain(r.status)
    }
    const acl = await fetch(`${BASE}/mcp`, { method: 'POST', headers: { ...auth, 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'write_acl', arguments: {
        path: WIKI, authorizations: [
          { agentClasses: ['foaf:Agent'], modes: ['Read'], isDefault: true },
          { agents: [`${BASE}/alice/profile/card.jsonld#me`], modes: ['Read', 'Write', 'Control'], isDefault: true },
        ] } } }) })
    expect((await acl.json()).result?.isError ?? false).toBe(false)

    // Bind BEFORE instantiate: read-merge-write conformsTo + describedby (the dcat recipe).
    const metaUrl = `${BASE}${WIKI}.meta`
    let meta = {}
    const r0 = await fetch(metaUrl, { headers: { ...auth, accept: 'application/ld+json' } })
    if (r0.ok) { try { meta = await r0.json() } catch { meta = {} } }
    meta['@context'] = { ...(typeof meta['@context'] === 'object' && !Array.isArray(meta['@context']) ? meta['@context'] : {}), dct: DCT, powder: POWDER }
    meta['@id'] = meta['@id'] ?? ''
    meta['dct:conformsTo'] = { '@id': LLM_WIKI }
    // describedby = the profile's own walked validation artifacts — exactly what publish's bind writes.
    const { loadProfile } = await import('../projection/prof/profile-loader.mjs')
    meta['powder:describedby'] = (await loadProfile(LLM_WIKI)).validation.map((v) => ({ '@id': v }))
    const rb = await fetch(metaUrl, { method: 'PUT', headers: { ...auth, 'content-type': 'application/ld+json' }, body: JSON.stringify(meta) })
    expect([200, 201, 204, 205]).toContain(rb.status)

    const res = await runOnce(`${BASE}${WIKI}`, token)
    const bad = res.filter((r) => r.status && ![200, 201, 204, 205].includes(r.status))
    expect(bad, JSON.stringify(bad)).toEqual([])
  }, 120000)

  it('links rep materialized: flat #it JSON-LD, minted subject + typed edge, floor-admitted', async () => {
    const r = await fetch(`${BASE}${WIKI}a.md.links.jsonld`, { headers: auth })
    expect(r.status).toBe(200)
    const doc = await r.json()
    expect(doc['@id']).toMatch(/id\/a#it$/)
    expect(JSON.stringify(doc)).toMatch(/id\/b#it/)                 // up: b.md
  })

  it('content is canonical + ungoverned; links are governed (spec §3 jurisdiction)', async () => {
    // markdown w/o title admits — SHACL is not content's business
    const md = await fetch(`${BASE}${WIKI}loose.md`, { method: 'PUT', headers: { 'Content-Type': 'text/markdown', ...auth }, body: 'no frontmatter at all' })
    expect([200, 201, 204, 205]).toContain(md.status)
    // a typed links doc without dcterms:title violates the floor: teaching 400
    const bad = await fetch(`${BASE}${WIKI}bad.links.jsonld`, { method: 'PUT', headers: { 'Content-Type': 'application/ld+json', ...auth },
      body: JSON.stringify({ '@context': { 'llm-wiki-colab': 'https://la3d.github.io/llm-wiki-colab/ontology#' }, '@id': `${BASE}${WIKI}bad#it`, '@type': 'llm-wiki-colab:Project' }) })
    expect(bad.status).toBe(400)
    const problem = await bad.json()
    expect(JSON.stringify(problem.violations)).toContain('title')
    // a valid links doc admits
    const good = await fetch(`${BASE}${WIKI}good.links.jsonld`, { method: 'PUT', headers: { 'Content-Type': 'application/ld+json', ...auth },
      body: JSON.stringify({ '@context': { 'llm-wiki-colab': 'https://la3d.github.io/llm-wiki-colab/ontology#', dct: DCT }, '@id': `${BASE}${WIKI}good#it`, '@type': 'llm-wiki-colab:Project', 'dct:title': 'Good' }) })
    expect([200, 201]).toContain(good.status)
  })

  it('member linkset advertises canonical(content/okf-base) + alternate(links/llm-wiki)', async () => {
    const r = await fetch(`${BASE}${WIKI}a.md`, { headers: { Accept: 'application/linkset+json', ...auth } })
    expect(r.status).toBe(200)
    const link = (await r.json()).linkset[0]
    expect(link.canonical).toEqual([{ href: `${BASE}${WIKI}a.md`, type: 'text/markdown', formats: OKF_BASE }])
    expect(link.alternate).toEqual([{ href: `${BASE}${WIKI}a.md.links.jsonld`, type: 'application/ld+json', formats: LLM_WIKI }])
  })

  it('Accept-Profile selects: okf-base -> 200 markdown self; llm-wiki -> 303 to links', async () => {
    const self = await fetch(`${BASE}${WIKI}a.md`, { headers: { 'Accept-Profile': `<${OKF_BASE}>`, ...auth }, redirect: 'manual' })
    expect(self.status).toBe(200)
    expect(self.headers.get('content-profile')).toBe(`<${OKF_BASE}>`)
    expect(await self.text()).toContain('Alpha prose')
    const links = await fetch(`${BASE}${WIKI}a.md`, { headers: { 'Accept-Profile': `<${LLM_WIKI}>`, ...auth }, redirect: 'manual' })
    expect(links.status).toBe(303)
    expect(links.headers.get('location')).toBe(`${BASE}${WIKI}a.md.links.jsonld`)
  })

  it('bare GET unchanged (additivity)', async () => {
    const r = await fetch(`${BASE}${WIKI}a.md`, { headers: auth })
    expect(r.status).toBe(200)
    expect(r.headers.get('content-profile')).toBeNull()
    expect(await r.text()).toContain('Alpha prose')
  })

  it('aggregate graph.jsonld: dataset form, one named graph per card, doc-IRI names', async () => {
    const r = await fetch(`${BASE}${WIKI}graph.jsonld`, { headers: auth })
    expect(r.status).toBe(200)
    const doc = await r.json()
    const names = doc['@graph'].map((g) => g['@id'])
    expect(names.some((n) => /id\/a$/.test(n))).toBe(true)          // fragment-stripped doc IRI
    expect(names.every((n) => !n.includes('#'))).toBe(true)
  })

  it('index.md rendered: OKF navigation channel lists the cards', async () => {
    const r = await fetch(`${BASE}${WIKI}index.md`, { headers: auth })
    expect(r.status).toBe(200)
    const md = await r.text()
    expect(md).toContain('[Alpha](a.md)')
    expect(md).toContain('# Projects')
  })

  it('container linkset advertises the container-level alternates (index + graph)', async () => {
    const r = await fetch(`${BASE}${WIKI}`, { headers: { Accept: 'application/linkset+json', ...auth } })
    expect(r.status).toBe(200)
    const link = (await r.json()).linkset[0]
    const alts = (link.alternate ?? []).map((a) => a.href)
    expect(alts).toContain(`${BASE}${WIKI}graph.jsonld`)
    expect(alts).toContain(`${BASE}${WIKI}index.md`)
  })

  it('TypeSearch conformsTo=llm-wiki finds the bound container (indexed-relation seam)', async () => {
    const r = await fetch(`${BASE}/types/search?conformsTo=${encodeURIComponent(LLM_WIKI)}`, { headers: auth })
    expect(r.status).toBe(200)
    expect((await r.json()).items.map((i) => i.id ?? i['@id'] ?? i.url ?? '').join(' ')).toContain('/alice/wiki/')
  })
})
```

Note for the implementer: the instantiated `a.md.links.jsonld` must itself pass the floor (the
container is bound BEFORE `runOnce` — that ordering is the point: materialization writes through the
governed path). If admission rejects it, the RENDERER output is wrong — fix the renderer/fixture,
never loosen the bind. The TypeSearch item shape: read one item from the existing
`tests/lws-typeindex.test.mjs` assertions and match its accessor.

- [ ] **Step 2: Makefile**

```make
# Phase-2 wiki gate — the re-derived family live (instantiate + conneg-by-profile).
# Needs up-fork-tls + make cert + `make publish-profiles` (publishes the rep artifacts).
test-wiki:
	@[ -f certs/rootCA.pem ] || { echo "run 'make cert && make up-fork-tls' first"; exit 1; }
	@[ -d projection/node_modules ] || ( cd projection && npm ci )
	@[ -d apps/wiki-projector/node_modules ] || ( cd apps/wiki-projector && npm ci )
	BASE=https://pod.vardeman.me NODE_EXTRA_CA_CERTS=$(CURDIR)/certs/rootCA.pem npx vitest run tests/lws-wiki.test.mjs
```

`test-projection` becomes both unit suites:

```make
test-projection:
	@[ -d projection/node_modules ] || ( cd projection && npm ci )
	@[ -d apps/wiki-projector/node_modules ] || ( cd apps/wiki-projector && npm ci )
	cd projection && npm test
	cd apps/wiki-projector && npm test
```

Add `test-wiki` to `.PHONY`.

- [ ] **Step 3: Run live**

```bash
make up-fork-tls   # if not already running
make publish-profiles   # POD_TOKEN via the helpers flow (see target comment)
make test-wiki
```
Expected: all gate cases PASS. Then `make test-conneg test-profiles test-dcat test-graph` → no
regression from the republished defs (the new hasResource entries are additive; dcat's gate loads the
descriptor live — its `loadProfile` now returns a `representations` array, which its assertions
ignore).

- [ ] **Step 4: Commit**

```bash
git add tests/lws-wiki.test.mjs Makefile
git commit -m "$(cat <<'EOF'
[Agent: Claude] test(wiki): live gate — instantiation + conneg-by-profile over the re-derived family

- bind -> instantiate -> content ungoverned / links floor-governed / linkset+Accept-Profile selection
- aggregate dataset view + index channel as declared container representations
- make test-wiki; test-projection runs both unit suites

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 12: Docs — iri-minting §7 deliverable, audit re-disposition, CLAUDE.md/README/FOLLOWUP

**Files:**
- Modify: `docs/design-notes/iri-minting.md`, `docs/foundations/06-code-placement-audit.md`, `CLAUDE.md`, `README.md`, `FOLLOWUP.md`, `docs/ROADMAP.md`, `~/.claude/projects/-Users-cvardema-dev-git-LA3D-agents-lws-pod/memory/general-substrate-design.md` (+ MEMORY.md hook line if changed)

- [ ] **Step 1: iri-minting.md** — append under "Plane 1 — graph semantics" a subsection
  **"Plane 1 — read-side plane mapping (RESOLVED, conneg-by-profile)"** covering exactly: (a) §11 #4
  is realized in-band — a client resolves a memory by GETting its canonical URL and negotiating the
  profile (`Accept-Profile` → 200 self / 303 to the materialized representation); (b) membership
  steering — linkset-only agents enumerate members via `items[]`/TypeSearch, never the linkset;
  (c) the read-side leanings now design of record: the `up`-walk contract stands (governance edges on
  the container), container `conformsTo` beats the pod-wide `defaultProfile`, plural bindings
  AND-compose for validation with most-specific selection a client/conneg concern, and
  earned-at-admission member `conformsTo` stays an open option (not asserted). Update the "Deferred
  (named)" list: §11 #4 → resolved, pointer to this subsection + the conneg spec.

- [ ] **Step 2: 06-code-placement-audit.md** — re-disposition the L4b rows: engine/engine-profile/
  card-family rows → `done (conneg-P2)` with new locations (`apps/wiki-projector/`); wiki-memory row →
  `done — re-derived (renderers as app tooling, representations as data)`; constrained-container →
  `done — retired`; base-shape comment row → `done — deleted with the legacy floor`; B7 row →
  `done — vocabulary reworded graph-shaped`; derived-view-vocabulary row → `done — lwspr:representation
  minted`. Add rows: `projection/prof/instantiate.mjs` (Bucket 2 — data-driven, renderer seam) and
  `apps/wiki-projector/renderers.mjs` (Bucket 3 — application tooling).

- [ ] **Step 3: CLAUDE.md** — update the Architecture bullet for `projection/` (now: neutral PROF
  mechanism `projection/prof/` + onboarding `projection/publish/` + profile data `profiles/defs/`),
  add `apps/wiki-projector/`, delete the `constrained-container/` bullet, and REMOVE the "wiki-memory
  suite is RED by design" gotcha (replace with one line: suite re-derived green 2026-07-08, see
  FOLLOWUP). Update the `make test-app-e2e` command row (removed) + add `make test-wiki`. README.md:
  same layout/commands updates.

- [ ] **Step 4: FOLLOWUP.md** — new `▶` block at the top of the START-HERE section: conneg Phase 2
  DONE (what shipped: representation roles, instantiate, split, re-derived family, retirements,
  gates), the fork-untouched assertion, and **NEXT = the fork-queue serving-path round** (already
  queued: retire `jsonLdToQuads`/`toJsonLd` on the serving path, container-listing WAC filtering,
  sidecar mediaTypes, hint wording, MCP gateway advertisement) **+ console-on-fork rewire carryover**
  (test-app-e2e returns then). Update the heading line + the `▶▶ NEXT` pointer. ROADMAP: mark the
  Phase-2 milestone done, same NEXT.

- [ ] **Step 5: Memory** — update `general-substrate-design.md` (and its MEMORY.md hook line):
  Phase 2 done 2026-07-08 — representations as data + instantiate; `projection/` split executed
  (`prof/` + `apps/wiki-projector/`); wiki re-derived GREEN (fence retired); constrained-container
  retired; next = fork serving-path round.

- [ ] **Step 6: Commit**

```bash
git add docs/design-notes/iri-minting.md docs/foundations/06-code-placement-audit.md CLAUDE.md README.md FOLLOWUP.md docs/ROADMAP.md
git commit -m "$(cat <<'EOF'
[Agent: Claude] docs(conneg): Phase 2 close-out — read-side plane mapping resolved, audit L4b rows re-dispositioned

- iri-minting: §11 #4 realized by conneg-by-profile + 303 (read-side leanings now of record)
- placement audit: L4b rows done; instantiate (B2) + renderers (B3) added
- CLAUDE.md/README/FOLLOWUP/ROADMAP: split + retirements + green wiki suite; NEXT = fork serving-path round

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 13: Zero-regression sweep, fork-untouched assertion, probe #5

- [ ] **Step 1: Full live sweep** (pod `fork-conneg` up via `make up-fork-tls`; run serially):

```bash
make test-lws test-l3 test-typeindex test-indexed-relation test-profiles test-dcat test-graph test-conneg test-wiki test-projection test-app
sleep 70 && make test-mcp-v2    # the 65s anon-rate-limit gotcha (FOLLOWUP OPS)
```
Expected: every gate green — lws 6, l3 2, typeindex 7, indexed-relation 4, profiles 6, dcat 5,
graph 6, conneg 7, wiki (new), mcp-v2 16; both unit suites green. Any failure: fix forward within the
owning task's scope before proceeding.

- [ ] **Step 2: Fork untouched — assert**

```bash
cd ~/dev/git/LA3D/JavaScriptSolidServer && git rev-parse la3d/lws && git status --porcelain
```
Expected: `d75a4dd6e807805bd6a16ff6cf04b3fad8ecb123` + empty status. Record in FOLLOWUP's Phase-2 block.

- [ ] **Step 3: Probe #5 (spec §8)** — dispatch a FRESH subagent with ONLY: the pod URL
  `https://pod.vardeman.me`, the CA cert path `certs/rootCA.pem`, read-only instruction, and the
  standing protocol sentence ("You know nothing about this server. Explore it over HTTP and report
  what it is, what it stores, and how you would read and write it correctly.") — zero project
  context, no RFC 9264 priming. PASS criteria: the agent (a) discovers the ContentNegotiation
  capability + the wiki container, (b) consumes the markdown content, (c) negotiates or dereferences
  the links representation and traverses a typed edge, (d) states that the floor governs the links,
  not the content. Record findings verbatim; frictions → FOLLOWUP (fork-queue or app items), fix +
  re-probe only for cheap surface wording per the probe→fix→re-probe loop.

- [ ] **Step 4: Final commit** (probe artifacts cleanup + FOLLOWUP findings appended), then report:
  suite counts, probe verdict, the acceptance checklist (spec §10 items 2–6, 8) each with its
  verifying gate.

---

## Acceptance mapping (spec §10)

| # | Criterion | Verified by |
|---|---|---|
| 2 | wiki re-derived green; floor rejects malformed links / admits valid; markdown ungoverned | Task 9 (unit) + Task 11 gate cases 1–2 |
| 3 | representation roles as data; instantiate materializes + advertises; publish manifest-driven | Tasks 3–6; dcat = zero-code baseline (Task 6) |
| 4 | `projection/` split; audit rows re-dispositioned; no app vocabulary in `prof/` | Tasks 1, 7–9, 12 (grep gate in Task 9 Step 5) |
| 5 | iri-minting read-side update | Task 12 |
| 6 | probes reconstruct cold (Phase-2 wiki #5) | Task 13 |
| 8 | zero regression across all gates | Task 13 Step 1 |

(#1/#7 were Phase 1, shipped at `d75a4dd`.)
