# Human Viewing Surface (LWS Navigator + Profile Faces) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the pod human-usable in a browser: llm-wiki cards/index/graph render as server-materialized HTML faces, and the fork serves a neutral navigator (container / entity / root views) as the `text/html` fallback under `--lws`, retiring mashlib there.

**Architecture:** Two layers. Layer F (projector, lws-pod repo): three new llm-wiki representations — `html` (suffix `.html`, per-card page), `index-html` (target `index.html`, container navigation face — served by the fork's EXISTING A2 shadow, so bound-container dispatch is free), `viz` (target `viz.html`, self-contained graph viewer). Layer N (fork repo `~/dev/git/LA3D/JavaScriptSolidServer`, branch `la3d/lws-navigator` off `la3d/lws @ 32398c1`): one dispatch rule (browser Accept + declared `text/html` alternate → **303 to the face**, before the mashlib intercept) plus server-rendered navigator views replacing the mashlib branches under `--lws`. Spec: `docs/superpowers/specs/2026-07-15-human-viewing-surface-design.md` (incl. its grounded-deviations block).

**Tech Stack:** Node ESM. Projector: `markdown-it` (pinned, `html:false`), `cytoscape` (pinned, inlined into viz.html — no CDN), existing `gray-matter`/`n3`. Fork: hand-rolled template literals, no new deps. Tests: vitest (lws-pod), `node --test` (fork).

## Global Constraints

- **Byte-identical when `--lws` is off** — every fork change gated on `request.lwsEnabled` (house discipline, see `src/rdf/conneg.js:312-323` precedent).
- **No CDN, no client framework, no build step anywhere.** viz.html inlines its JS; faces inline their CSS.
- **Markdown renders with raw inline HTML disabled** (`markdown-it` default `html:false`) and **every substrate-derived string is escaped** before HTML interpolation.
- **Renderers never throw** — a failed face render returns `null` (a throw aborts the whole `instantiate()` pass, `projection/prof/instantiate.mjs:77/101` has no try/catch).
- **Rep def + renderer ship in the same commit** — a declared rep with no renderer throws in the trigger path (`instantiate.mjs need()`, default `'throw'`).
- **Face naming is mechanism-verbatim**: member `a.md` + suffix `.html` → `a.md.html`; targets resolve against the container (`index.html`, `viz.html`).
- **v1 is public-only**: navigator serves the anonymous WAC view; no login.
- **Type→color consistency**: card badge, index badge, and viz node color use the same `hueOf(localName)` algorithm (defined Task 1, duplicated verbatim in the viz client JS).
- **Commits**: `[Agent: Claude] type(scope): subject` + `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`; stage specific files, never `git add -A`.
- Live-gate gotcha: anon rate limit (~60/min) trips on back-to-back live gates — space runs ~40s.

**File structure (all new/modified files):**

```
lws-pod repo (/Users/cvardema/dev/git/LA3D/agents/lws-pod):
  projection/profiles/defs/llm-wiki/html.rep.jsonld          NEW  (Task 1)
  projection/profiles/defs/llm-wiki/index-html.rep.jsonld    NEW  (Task 2)
  projection/profiles/defs/llm-wiki/viz.rep.jsonld           NEW  (Task 3)
  projection/profiles/defs/llm-wiki/profile.jsonld           MOD  (Tasks 1-3, one hasResource entry each)
  apps/wiki-projector/package.json                           MOD  (Task 1: markdown-it; Task 3: cytoscape)
  apps/wiki-projector/html-face.mjs                          NEW  (Task 1: esc, hueOf, card page; Task 2: index page)
  apps/wiki-projector/viewer/viz-template.mjs                NEW  (Task 3)
  apps/wiki-projector/renderers.mjs                          MOD  (Tasks 1-3: wire html/index-html/viz)
  apps/wiki-projector/html-face.test.mjs                     NEW  (Tasks 1-2)
  apps/wiki-projector/viz.test.mjs                           NEW  (Task 3)
  app/                                                       DELETED (Task 9)
  Makefile                                                   MOD  (Task 9: drop test-app; Task 10: add test-viewer)
  CLAUDE.md, README.md, docs/ROADMAP.md                      MOD  (Task 9/11)
  Dockerfile.fork                                            MOD  (Task 10: repin, drop --mashlib-cdn)
  tests/viewer.test.mjs                                      NEW  (Task 10)
  tests/lws-conneg.test.mjs                                  MOD  (Task 10: re-derive mashlib pin)
  FOLLOWUP.md                                                MOD  (Task 11)

fork repo (~/dev/git/LA3D/JavaScriptSolidServer, branch la3d/lws-navigator):
  src/utils/html.js                                          NEW  (Task 4: shared escapeHtml)
  src/mashlib/index.js                                       MOD  (Task 4: export browserWantsHtml)
  src/navigator/views.js                                     NEW  (Tasks 5-7: container/entity/root views)
  src/handlers/resource.js                                   MOD  (Tasks 4-6: dispatch + replace mashlib branches)
  src/rdf/conneg.js                                          MOD  (Task 8: Vary: Accept under --lws)
  test/lws-html-dispatch.test.js                             NEW  (Task 4)
  test/lws-navigator-container.test.js                       NEW  (Task 5)
  test/lws-navigator-entity.test.js                          NEW  (Task 6)
  test/lws-navigator-root.test.js                            NEW  (Task 7)
  test/lws-navigator-parity.test.js                          NEW  (Task 8)
```

---

### Task 1: `html` card face (projector)

**Files:**
- Create: `projection/profiles/defs/llm-wiki/html.rep.jsonld`
- Create: `apps/wiki-projector/html-face.mjs`
- Modify: `projection/profiles/defs/llm-wiki/profile.jsonld` (hasResource list, after the `#rep-graph` entry)
- Modify: `apps/wiki-projector/renderers.mjs:31-43` (add `html` renderer)
- Modify: `apps/wiki-projector/package.json` (add `"markdown-it": "^14.1.0"` to dependencies)
- Test: `apps/wiki-projector/html-face.test.mjs`

**Interfaces:**
- Consumes: `parseFrontmatter(text) → {frontmatter, body}`, `isConformant(fm)` (`frontmatter.mjs`); `subjectIri(fm, url, policy)`, `slugFromUrl(url)` (`identity.mjs`); `ns.term[key]` context terms (`loadNamespaces`, already built in `makeRenderers` at `renderers.mjs:20-24`).
- Produces: `esc(s) → string`, `hueOf(name) → number(0-359)`, `localName(t) → string`, `renderCardHtml({url, body, contentType}, ns, policy) → string|null` — Task 2 reuses `esc`/`hueOf`/`localName` and adds `renderIndexHtml` to this same module; Task 3's viz template duplicates `hueOf` verbatim client-side.

- [ ] **Step 1: Add markdown-it and write the failing test**

Run: `cd /Users/cvardema/dev/git/LA3D/agents/lws-pod/apps/wiki-projector && npm install markdown-it@^14.1.0`

Create `apps/wiki-projector/html-face.test.mjs` (fixture pattern copied from `renderers.test.mjs:6-18`):

```js
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { makeRenderers } from './renderers.mjs'

const ctx = JSON.parse(readFileSync(new URL('../../projection/profiles/defs/llm-wiki/context.jsonld', import.meta.url)))
const loaded = { id: 'https://pod.example/alice/profiles/llm-wiki/profile.jsonld', token: 'llm-wiki',
  contexts: [ctx], identityPolicy: { pathPrefix: 'id/', fragment: '#it' }, representations: [], validation: [] }
const AUTH = 'https://pod.example/'
const C = 'https://pod.example/alice/wiki/'
const CARD = `---\ntype: llm-wiki-colab:Concept\ntitle: Alpha\nstatus: draft\ntags: [memory, lws]\nup: b.md\n---\nAlpha prose with a [link](b.md).\n\n<script>alert(1)</script>`

const { renderers } = makeRenderers(loaded, AUTH)

describe('html card face', () => {
  it('renders title, type badge, metadata block, body', async () => {
    const html = await renderers.html({ url: `${C}a.md`, body: CARD, contentType: 'text/markdown' })
    expect(html).toContain('<h1>Alpha</h1>')
    expect(html).toContain('Concept')                       // type badge (localName)
    expect(html).toContain('<dt>up</dt>')                   // edge key in metadata block
    expect(html).toContain('href="b.md.html"')              // edge target -> face link
    expect(html).toContain('<dt>status</dt>')               // scalar row
    expect(html).toContain('draft')
    expect(html).toContain(`${C}a.md`)                      // canonical source URI shown
    expect(html).toContain('viz.html#focus=')               // graph footer link
  })
  it('does NOT pass raw script through', async () => {
    const html = await renderers.html({ url: `${C}a.md`, body: CARD, contentType: 'text/markdown' })
    expect(html).not.toContain('<script>alert(1)</script>')
  })
  it('returns null for non-conformant and non-markdown sources', async () => {
    expect(await renderers.html({ url: `${C}x.md`, body: 'no frontmatter', contentType: 'text/markdown' })).toBeNull()
    expect(await renderers.html({ url: `${C}x.jsonld`, body: '{}', contentType: 'application/ld+json' })).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/wiki-projector && npx vitest run html-face.test.mjs`
Expected: FAIL — `renderers.html is not a function`.

- [ ] **Step 3: Create `html.rep.jsonld` and register it in `profile.jsonld`**

`projection/profiles/defs/llm-wiki/html.rep.jsonld` (whole file):

```json
{ "id": "html", "suffix": ".html", "format": "text/html", "conformsTo": "../okf-base.jsonld" }
```

In `profile.jsonld`, append to `hasResource` after the `#rep-graph` entry:

```json
    { "@id": "#rep-html",  "hasRole": "lwspr:representation", "hasArtifact": "html.rep.jsonld",  "format": "application/ld+json" }
```

- [ ] **Step 4: Write `apps/wiki-projector/html-face.mjs`**

```js
// html-face.mjs — the wiki family's human faces (spec 2026-07-15 §3/§6).
// Renderers must never throw: a throw aborts the whole instantiate() pass.
import MarkdownIt from 'markdown-it'
import { parseFrontmatter, isConformant } from './frontmatter.mjs'
import { subjectIri } from './identity.mjs'

const md = new MarkdownIt({ html: false, linkify: true })

export const esc = (s) => String(s).replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
export const localName = (t) => { const s = String(t); return s.includes(':') ? s.slice(s.lastIndexOf(':') + 1).replace(/^.*[#/]/, '') : s }
// Deterministic type->hue; duplicated verbatim in the viz client JS (Task 3) — keep in sync.
export const hueOf = (name) => { let h = 0; for (const c of String(name)) h = (h * 31 + c.charCodeAt(0)) % 360; return h }

const isEdge = (ns, key) => { const t = ns.term[key]; return typeof t === 'object' && t !== null && t['@type'] === '@id' }
const isAbsolute = (v) => /^[a-z][a-z0-9+.-]*:\S*$/i.test(String(v))
// In-bundle edge target ("b.md") -> its face; absolute IRIs pass through.
const edgeHref = (v) => isAbsolute(v) ? String(v) : `${String(v)}.html`

const badge = (type) => `<span class="badge" style="--h:${hueOf(localName(type))}">${esc(localName(type))}</span>`

export const PAGE_CSS = `
:root{color-scheme:light dark;--fg:#1a1a1a;--bg:#fff;--muted:#666;--line:#ddd}
@media(prefers-color-scheme:dark){:root{--fg:#e8e8e8;--bg:#121212;--muted:#999;--line:#333}}
body{color:var(--fg);background:var(--bg);font:16px/1.6 system-ui,sans-serif;max-width:70ch;margin:2rem auto;padding:0 1rem}
a{color:hsl(210 70% 45%)}nav.crumb{font-size:.85rem;color:var(--muted)}nav.crumb a{color:inherit}
h1{margin:.3rem 0}
.badge{display:inline-block;padding:.05rem .5rem;border-radius:1rem;font-size:.75rem;
 background:hsl(var(--h) 60% 88%);color:hsl(var(--h) 60% 25%)}
@media(prefers-color-scheme:dark){.badge{background:hsl(var(--h) 40% 25%);color:hsl(var(--h) 60% 85%)}}
dl.meta{border:1px solid var(--line);border-radius:.5rem;padding:.75rem 1rem;font-size:.9rem}
dl.meta dt{float:left;clear:left;width:9rem;color:var(--muted)}dl.meta dd{margin:0 0 .25rem 9.5rem}
.chip{display:inline-block;background:var(--line);border-radius:1rem;padding:0 .5rem;font-size:.8rem;margin-right:.25rem}
footer{margin-top:2rem;border-top:1px solid var(--line);padding-top:.5rem;font-size:.9rem}
article{margin-top:1.5rem}`

const page = (title, crumb, main) => `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title><style>${PAGE_CSS}</style></head>
<body><nav class="crumb">${crumb}</nav>\n${main}\n</body></html>`

const crumbFor = (url) => {
  const u = new URL(url)
  const segs = u.pathname.split('/').filter(Boolean)
  const parts = [`<a href="${esc(u.origin)}/?view=nav">pod</a>`]
  let path = ''
  for (let i = 0; i < segs.length - 1; i++) { path += `/${segs[i]}`; parts.push(`<a href="${esc(u.origin + path)}/">${esc(segs[i])}</a>`) }
  if (segs.length) parts.push(esc(segs[segs.length - 1]))
  return parts.join(' › ')
}

const metaRows = (fm, ns) => Object.entries(fm).filter(([k]) => k !== 'title').map(([k, v]) => {
  const vals = Array.isArray(v) ? v : [v]
  if (k === 'type') return `<dt>type</dt><dd>${vals.map(badge).join(' ')}</dd>`
  if (isEdge(ns, k)) return `<dt>${esc(k)}</dt><dd>${vals.map((t) => `<a href="${esc(edgeHref(t))}">${esc(t)}</a>`).join(', ')}</dd>`
  if (k === 'tags') return `<dt>tags</dt><dd>${vals.map((t) => `<span class="chip">${esc(t)}</span>`).join('')}</dd>`
  return `<dt>${esc(k)}</dt><dd>${vals.map((x) => esc(x)).join(', ')}</dd>`
}).join('\n')

export function renderCardHtml(src, ns, policy) {
  try {
    if (!(src.contentType?.startsWith('text/markdown') || /\.md$/.test(src.url))) return null
    const { frontmatter: fm, body } = parseFrontmatter(src.body)
    if (!isConformant(fm)) return null
    const subject = subjectIri(fm, src.url, policy)
    const title = fm.title ?? src.url.split('/').pop()
    const main = `<header><h1>${esc(title)}</h1>${(Array.isArray(fm.type) ? fm.type : [fm.type]).map(badge).join(' ')}</header>
<dl class="meta">${metaRows(fm, ns)}\n<dt>source</dt><dd><a href="${esc(src.url)}?view=nav">${esc(src.url)}</a> · <a href="${esc(subject)}">${esc(subject)}</a></dd></dl>
<article>${md.render(body)}</article>
<footer><a href="index.html">↑ index</a> · <a href="viz.html#focus=${encodeURIComponent(subject)}">⚯ graph</a></footer>`
    return page(title, crumbFor(src.url), main)
  } catch (e) { console.warn(`[html-face] card render failed for ${src.url}: ${e.message}`); return null }
}
```

- [ ] **Step 5: Wire the renderer in `renderers.mjs`**

In `apps/wiki-projector/renderers.mjs`, import at top: `import { renderCardHtml } from './html-face.mjs'`, and inside the returned `renderers` object (after the `links` entry):

```js
    html: async (src) => renderCardHtml(src, ns, policy),
```

(`ns` and `policy` are already in scope in `makeRenderers` — same values the `links` renderer uses.)

- [ ] **Step 6: Run test to verify it passes**

Run: `cd apps/wiki-projector && npx vitest run html-face.test.mjs`
Expected: PASS (3 tests).

- [ ] **Step 7: Run the rest of the projector suites (no regressions)**

Run: `cd /Users/cvardema/dev/git/LA3D/agents/lws-pod && make test-projection`
Expected: all green (projection + wiki-projector).

- [ ] **Step 8: Commit**

```bash
git add projection/profiles/defs/llm-wiki/html.rep.jsonld projection/profiles/defs/llm-wiki/profile.jsonld \
  apps/wiki-projector/html-face.mjs apps/wiki-projector/html-face.test.mjs apps/wiki-projector/renderers.mjs \
  apps/wiki-projector/package.json apps/wiki-projector/package-lock.json
git commit -m "[Agent: Claude] feat(wiki-projector): html card face — declared rep + renderer

- html.rep.jsonld (suffix .html -> a.md.html) registered in profile.jsonld
- renderCardHtml: breadcrumb, type badge, full-frontmatter metadata block
  (edges as face links, scalars/tags), markdown-it html:false body, footer nav
- renderer catches internally and returns null (never aborts instantiate)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: `index-html` container face (projector)

**Files:**
- Create: `projection/profiles/defs/llm-wiki/index-html.rep.jsonld`
- Modify: `projection/profiles/defs/llm-wiki/profile.jsonld` (one hasResource entry)
- Modify: `apps/wiki-projector/html-face.mjs` (add `renderIndexHtml`)
- Modify: `apps/wiki-projector/renderers.mjs` (add `'index-html'` renderer)
- Test: `apps/wiki-projector/html-face.test.mjs` (extend)

**Interfaces:**
- Consumes: `esc`, `localName`, `hueOf`, `PAGE_CSS`/page chrome from Task 1; the `cards` adaptation the `index` renderer already builds (`renderers.mjs:36-40`: `sources.map(cardOf).filter(Boolean)` shape `{url, frontmatter, body}` and `members` `[{url, type:'container'|'data'}]`).
- Produces: `renderIndexHtml(containerUrl, cards, members) → string`. **The produced resource is literally `index.html` in the container — the fork's A2 shadow (resource.js:443) serves it to browser Accepts; that IS bound-container dispatch** (spec deviations block).

- [ ] **Step 1: Write the failing test** (append to `html-face.test.mjs`)

```js
describe('index-html container face', () => {
  const CARD_B = `---\ntype: llm-wiki-colab:MOC\ntitle: Beta\n---\nBeta.`
  it('renders grouped cards with face links and child containers', async () => {
    const html = await renderers['index-html'](C,
      [{ url: `${C}a.md`, body: CARD, contentType: 'text/markdown' },
       { url: `${C}b.md`, body: CARD_B, contentType: 'text/markdown' }],
      [{ url: `${C}sub/`, isContainer: true }])
    expect(html).toContain('href="a.md.html"')
    expect(html).toContain('Alpha')
    expect(html).toContain('href="sub/"')                    // child container -> its default view
    expect(html).toContain('viz.html')                       // graph link in chrome
    expect(html).toContain('?view=nav')                      // navigator escape hatch
    expect(html).toContain('MOC')                            // type badge
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/wiki-projector && npx vitest run html-face.test.mjs`
Expected: FAIL — `renderers['index-html'] is not a function`.

- [ ] **Step 3: Rep def + registration**

`projection/profiles/defs/llm-wiki/index-html.rep.jsonld` (whole file):

```json
{ "id": "index-html", "target": "index.html", "format": "text/html", "conformsTo": "../okf-base.jsonld" }
```

`profile.jsonld` hasResource, after `#rep-html`:

```json
    { "@id": "#rep-index-html", "hasRole": "lwspr:representation", "hasArtifact": "index-html.rep.jsonld", "format": "application/ld+json" }
```

- [ ] **Step 4: Implement `renderIndexHtml` in `html-face.mjs`**

```js
export function renderIndexHtml(containerUrl, cards, members) {
  try {
    const name = new URL(containerUrl).pathname.split('/').filter(Boolean).pop() ?? 'pod'
    const rel = (u) => u.startsWith(containerUrl) ? u.slice(containerUrl.length) : u
    const byType = new Map()
    for (const c of cards) {
      const t = localName(Array.isArray(c.frontmatter.type) ? c.frontmatter.type[0] : c.frontmatter.type)
      if (!byType.has(t)) byType.set(t, [])
      byType.get(t).push(c)
    }
    const groups = [...byType.entries()].map(([t, cs]) => `<h2>${esc(t)}s</h2><ul>` + cs.map((c) =>
      `<li><a href="${esc(rel(c.url))}.html">${esc(c.frontmatter.title ?? rel(c.url))}</a> ${badgeHtml(t)}` +
      (c.frontmatter.description ? ` — ${esc(c.frontmatter.description)}` : '') + '</li>').join('') + '</ul>').join('\n')
    const subs = members.filter((m) => m.isContainer || m.type === 'container')
    const subsHtml = subs.length ? `<h2>Subdirectories</h2><ul>` + subs.map((m) =>
      `<li><a href="${esc(rel(m.url))}">${esc(rel(m.url))}</a></li>`).join('') + '</ul>' : ''
    const main = `<header><h1>${esc(name)}</h1></header>\n${subsHtml}\n${groups}
<footer><a href="viz.html">⚯ graph</a> · <a href="?view=nav">navigator view</a></footer>`
    return pageHtml(name, crumbHtml(containerUrl), main)
  } catch (e) { console.warn(`[html-face] index render failed for ${containerUrl}: ${e.message}`); return null }
}
```

(Refactor note: rename the module-private `page`→`pageHtml`, `crumbFor`→`crumbHtml`, and extract `badgeHtml(t)` = the Task-1 `badge` on a pre-localName'd string — adjust Task 1 call sites in the same edit; keep exports `esc/localName/hueOf/renderCardHtml/renderIndexHtml`.)

- [ ] **Step 5: Wire renderer** — in `renderers.mjs`, import `renderIndexHtml`; the adaptation mirrors the existing `index` renderer at `:36-40` (same `cardOf` mapping):

```js
    'index-html': async (containerUrl, sources, members) =>
      renderIndexHtml(containerUrl, sources.map(cardOf).filter(Boolean),
        members.map((m) => ({ url: m.url, isContainer: m.isContainer }))),
```

(Match the actual `cardOf`/member adaptation shape used by the `index` renderer in the current file — reuse its local helpers rather than duplicating.)

- [ ] **Step 6: Run tests** — `npx vitest run html-face.test.mjs` → PASS; then `make test-projection` → green.

- [ ] **Step 7: Commit**

```bash
git add projection/profiles/defs/llm-wiki/index-html.rep.jsonld projection/profiles/defs/llm-wiki/profile.jsonld \
  apps/wiki-projector/html-face.mjs apps/wiki-projector/html-face.test.mjs apps/wiki-projector/renderers.mjs
git commit -m "[Agent: Claude] feat(wiki-projector): index-html container face (A2-shadow dispatch)

- target index.html: the fork's existing index.html shadow serves it to
  browser Accepts under --lws — bound-container dispatch with zero fork code
- grouped card list w/ face links + type badges, subdirectories, viz/nav chrome

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: `viz` self-contained graph viewer (projector)

**Files:**
- Create: `projection/profiles/defs/llm-wiki/viz.rep.jsonld`
- Create: `apps/wiki-projector/viewer/viz-template.mjs`
- Modify: `projection/profiles/defs/llm-wiki/profile.jsonld`; `apps/wiki-projector/renderers.mjs`; `apps/wiki-projector/package.json` (add `"cytoscape": "^3.30.0"`)
- Test: `apps/wiki-projector/viz.test.mjs`

**Interfaces:**
- Consumes: `hueOf` algorithm (duplicated verbatim in client JS — comment both sides); the edge-key list derived from the profile context: `edgeKeys = Object.entries(ns.term).filter(([,t]) => typeof t==='object' && t?.['@type']==='@id').map(([k]) => k)`; `graph.jsonld` dataset shape (`{"@context":…,"@graph":[{"@id":"<docIri>","@graph":[{…entity, compact keys…}]}]}` — `projection/prof/derived-view.mjs` mode `dataset`).
- Produces: `renderViz({ edgeKeys }) → string` (data-independent; fetches `graph.jsonld` relative at runtime).

- [ ] **Step 1: Failing test** — `apps/wiki-projector/viz.test.mjs`:

```js
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { makeRenderers } from './renderers.mjs'

const ctx = JSON.parse(readFileSync(new URL('../../projection/profiles/defs/llm-wiki/context.jsonld', import.meta.url)))
const loaded = { id: 'https://pod.example/p.jsonld', token: 'llm-wiki', contexts: [ctx],
  identityPolicy: { pathPrefix: 'id/', fragment: '#it' }, representations: [], validation: [] }
const { renderers } = makeRenderers(loaded, 'https://pod.example/')

describe('viz face', () => {
  it('is one self-contained file: inlined cytoscape, relative graph fetch, no external URLs', async () => {
    const html = await renderers.viz('https://pod.example/alice/wiki/', [], [])
    expect(html).toContain('cytoscape')                       // lib inlined
    expect(html).toContain("fetch('graph.jsonld')")           // relative, live
    expect(html).toContain('up')                              // edge keys baked in
    expect(html).not.toMatch(/src="https?:/)                  // no CDN
    expect(html).not.toMatch(/href="https?:\/\/(?!pod\.example)/)
    expect(html.length).toBeGreaterThan(100_000)              // cytoscape actually embedded
  })
})
```

- [ ] **Step 2: Run to fail** — `npx vitest run viz.test.mjs` → FAIL (`renderers.viz` undefined). Then `npm install cytoscape@^3.30.0`.

- [ ] **Step 3: Rep def + registration**

`viz.rep.jsonld`: `{ "id": "viz", "target": "viz.html", "format": "text/html", "conformsTo": "profile.jsonld" }`
`profile.jsonld` hasResource: `{ "@id": "#rep-viz", "hasRole": "lwspr:representation", "hasArtifact": "viz.rep.jsonld", "format": "application/ld+json" }`

- [ ] **Step 4: Write `viewer/viz-template.mjs`**

```js
// viz-template.mjs — self-contained graph viewer (spec §3). No CDN: cytoscape is
// inlined from the pinned npm dep at materialize time. Fetches ./graph.jsonld live.
import { readFileSync } from 'node:fs'

const CYTOSCAPE = readFileSync(new URL('../node_modules/cytoscape/dist/cytoscape.min.js', import.meta.url), 'utf8')

export function renderViz({ edgeKeys }) {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>graph</title><style>
:root{color-scheme:light dark}body{margin:0;font:14px system-ui,sans-serif;display:grid;grid-template-columns:1fr 22rem;height:100vh}
#cy{width:100%;height:100%}#panel{border-left:1px solid #8884;padding:1rem;overflow:auto}
#bar{position:fixed;top:.5rem;left:.5rem;display:flex;gap:.5rem;z-index:2}
input,select{font:inherit;padding:.2rem .4rem}#err{color:#c00;padding:1rem}</style>
<script>${CYTOSCAPE}</script></head>
<body><div id="cy"></div><aside id="panel"><p>Select a node.</p></aside>
<div id="bar"><input id="q" placeholder="search"><select id="tf"><option value="">all types</option></select></div>
<script>
const EDGE_KEYS = ${JSON.stringify(edgeKeys)};
const hueOf = (n) => { let h = 0; for (const c of String(n)) h = (h*31 + c.charCodeAt(0)) % 360; return h }; // = html-face.mjs hueOf
const localName = (t) => String(t).replace(/^.*[#/:]/, '');
const asArr = (v) => v == null ? [] : (Array.isArray(v) ? v : [v]);
fetch('graph.jsonld').then((r) => { if (!r.ok) throw new Error('graph.jsonld ' + r.status); return r.json() })
.then((ds) => {
  const nodes = new Map(), edges = [], docOf = new Map();
  for (const doc of asArr(ds['@graph'])) for (const e of asArr(doc['@graph'])) {
    if (!e['@id']) continue;
    const ty = localName(asArr(e.type ?? e['@type'])[0] ?? 'Thing');
    nodes.set(e['@id'], { id: e['@id'], label: e.title ?? localName(e['@id']), type: ty });
    docOf.set(e['@id'], doc['@id']);
    for (const k of EDGE_KEYS) for (const t of asArr(e[k]))
      edges.push({ source: e['@id'], target: typeof t === 'object' ? t['@id'] : t, label: k });
  }
  const real = edges.filter((e) => nodes.has(e.target));
  const types = [...new Set([...nodes.values()].map((n) => n.type))].sort();
  for (const t of types) tf.add(new Option(t, t));
  const cy = cytoscape({ container: document.getElementById('cy'),
    elements: [...[...nodes.values()].map((n) => ({ data: n })),
               ...real.map((e, i) => ({ data: { id: 'e' + i, ...e } }))],
    style: [
      { selector: 'node', style: { label: 'data(label)', 'font-size': 9, width: 18, height: 18,
        'background-color': (el) => \`hsl(\${hueOf(el.data('type'))} 60% 55%)\` } },
      { selector: 'edge', style: { label: 'data(label)', 'font-size': 7, 'curve-style': 'bezier',
        'target-arrow-shape': 'triangle', width: 1, 'arrow-scale': .7 } },
      { selector: '.dim', style: { opacity: .12 } }],
    layout: { name: 'cose', animate: false } });
  const backlinksOf = (id) => real.filter((e) => e.target === id);
  const show = (n) => {
    const bl = backlinksOf(n.id).map((e) =>
      \`<li>\${nodes.get(e.source)?.label ?? e.source} <em>\${e.label}</em></li>\`).join('');
    panel.innerHTML = \`<h2>\${n.label}</h2><p><span style="background:hsl(\${hueOf(n.type)} 60% 88%);border-radius:1rem;padding:0 .5rem">\${n.type}</span></p>
      <p><a href="\${n.id}">open card</a></p><h3>Cited by</h3><ul>\${bl || '<li>—</li>'}</ul><div id="prev">…</div>\`;
    fetch(docOf.get(n.id) ?? n.id, { headers: { Accept: 'text/html' } }).then((r) => r.ok ? r.text() : '')
      .then((t) => { const m = t.match(/<article>([\\s\\S]*?)<\\/article>/); if (m) document.getElementById('prev').innerHTML = m[1]; })
      .catch(() => {});
  };
  cy.on('tap', 'node', (ev) => show(ev.target.data()));
  q.oninput = () => { const s = q.value.toLowerCase();
    cy.nodes().forEach((n) => n.toggleClass('dim', !!s && !n.data('label').toLowerCase().includes(s))); };
  tf.onchange = () => cy.nodes().forEach((n) => n.toggleClass('dim', !!tf.value && n.data('type') !== tf.value));
  const focus = decodeURIComponent((location.hash.match(/focus=([^&]+)/) || [])[1] ?? '');
  if (focus && nodes.has(focus)) { const n = cy.getElementById(focus); n.select(); cy.center(n); show(nodes.get(focus)); }
}).catch((e) => { document.body.innerHTML = '<p id="err">graph unavailable: ' + e.message + '</p>'; });
</script></body></html>`
}
```

- [ ] **Step 5: Wire renderer** — `renderers.mjs`: import `renderViz` and derive edge keys once in `makeRenderers`:

```js
    viz: async () => { try { return renderViz({ edgeKeys }) } catch (e) { console.warn(`[viz] ${e.message}`); return null } },
```

with `const edgeKeys = Object.entries(ns.term).filter(([, t]) => typeof t === 'object' && t?.['@type'] === '@id').map(([k]) => k)` alongside the existing `ns` setup.

- [ ] **Step 6: Run tests** — `npx vitest run viz.test.mjs` → PASS; `make test-projection` → green.

- [ ] **Step 7: Commit** (same message discipline; files: viz.rep.jsonld, profile.jsonld, viewer/viz-template.mjs, viz.test.mjs, renderers.mjs, package.json, package-lock.json; subject `feat(wiki-projector): viz self-contained graph viewer face`).

---

### Task 4 (fork): `text/html` face dispatch (303) + `?view=nav` + shared escape

**Repo:** `~/dev/git/LA3D/JavaScriptSolidServer`. First: `git checkout la3d/lws && git pull && git checkout -b la3d/lws-navigator 32398c1`.

**Files:**
- Create: `src/utils/html.js`
- Modify: `src/mashlib/index.js:326-381` (extract + export `browserWantsHtml(request)` — the Accept/sec-fetch portion of `shouldServeMashlib`, which then calls it; NO behavior change)
- Modify: `src/handlers/resource.js` (insert dispatch between `:968` — where `advertisedReps` is populated — and the mashlib intercept at `:972`)
- Test: `test/lws-html-dispatch.test.js`

**Interfaces:**
- Consumes: `advertisedReps` = `{ default, alternates:[{href, format, profile}] }` from `authorizedRepresentations` (`resource.js:102-109`, WAC-filtered — an anon-unreadable alternate is already dropped); `request.lwsEnabled`, `request.query`.
- Produces: `escapeHtml(s)` in `src/utils/html.js` (Tasks 5-7 import it); `browserWantsHtml(request) → boolean` exported from `src/mashlib/index.js` (Tasks 5-6 reuse); the dispatch behavior later tasks' tests assume: **bare name + browser Accept + declared text/html alternate → 303 `Location: <face>`**.

- [ ] **Step 1: Failing test** — `test/lws-html-dispatch.test.js`, pattern-matching `test/lws-bare-alternates.test.js` (reuse its `repMeta(id, alt)` `.meta` fixture builder verbatim, with `dct:format` `text/html` on the alternate):

```js
const BROWSER = { accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8' }
// 1. PUT /alice/wiki/a.md (text/markdown) + PUT a.md.html (text/html) + repMeta .meta
//    declaring a.md.html as altr:hasRepresentation with dct:format "text/html".
// 2. GET a.md with BROWSER accept, redirect: 'manual'  -> 303, Location ends /a.md.html
// 3. GET a.md with BROWSER accept + ?view=nav          -> NOT 303 (navigator/entity path; until Task 6: current behavior)
// 4. GET a.md with Accept: application/ld+json          -> unchanged (no 303; RDF conneg)
// 5. HEAD a.md with BROWSER accept                      -> 303 (HEAD parity)
// 6. Server WITHOUT lws: GET a.md BROWSER               -> 200 mashlib wrapper (byte-identical legacy)
// 7. Private face: tighten a.md.html ACL to owner-only; anon GET a.md BROWSER -> no 303 (alternate WAC-filtered)
```

Write these as real `node:test` cases with `startTestServer({ lws: true, conneg: true, mashlib: true })` / `startTestServer({ conneg: true, mashlib: true })` from `test/helpers.js`.

- [ ] **Step 2: Run to fail** — `node --test --test-concurrency=1 --test-force-exit test/lws-html-dispatch.test.js` → cases 2/5/7 FAIL (mashlib 200 where 303 expected).

- [ ] **Step 3: Implement.** `src/utils/html.js`:

```js
'use strict'
// Shared HTML escaping for server-rendered views (navigator + dispatch).
function escapeHtml (s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
}
module.exports = { escapeHtml }
```

In `src/mashlib/index.js`: extract the Accept/sec-fetch check (accept contains `text/html` with no RDF type preceding it; `sec-fetch-dest` empty or `document`) from `shouldServeMashlib:326-381` into exported `browserWantsHtml(request)`; `shouldServeMashlib` calls it (assert existing mashlib tests still green).

In `src/handlers/resource.js`, immediately after the `advertisedReps` population (`:966-968`), before `shouldServeMashlib` (`:972`):

```js
  // Face dispatch (spec 2026-07-15): a declared text/html alternate is the resource's
  // human face — browsers 303 there (the fork's alternates are separate resources reached
  // by redirect, mirroring profile-conneg). ?view=nav opts out. --lws only.
  if (request.lwsEnabled && browserWantsHtml(request) && request.query?.view !== 'nav') {
    const face = advertisedReps?.alternates?.find(
      (r) => (r.format || '').split(';')[0].trim() === 'text/html')
    if (face) return reply.code(303).header('Location', face.href).send()
  }
```

Mirror in the HEAD path (the report's `:1614` shadow area — locate the HEAD equivalent of the file serve and apply the same guard; HEAD 303 carries no body).

- [ ] **Step 4: Run to pass** — dispatch test file green; then targeted neighbors: `node --test --test-concurrency=1 --test-force-exit test/lws-bare-alternates.test.js test/lws-shadow-conneg.test.js test/lws-profile-conneg-get.test.js` → green.

- [ ] **Step 5: Commit** (fork repo, same message format; subject `feat(lws): text/html face dispatch — 303 to declared html alternate before mashlib`).

---

### Task 5 (fork): navigator container view (replaces mashlib for containers under `--lws`)

**Files:**
- Create: `src/navigator/views.js`
- Modify: `src/handlers/resource.js:600,645` (the `willMashlib` container branch)
- Test: `test/lws-navigator-container.test.js`

**Interfaces:**
- Consumes: `filterReadableEntries` (`src/lws/authorized-listing.js:11`) — already applied at `resource.js:580`; `generateLwsContainer(url, entries)` (`src/ldp/container.js:107`); `readDeclaredTypes(storage, path)` (`src/lws/type-metadata.js:39`); `conformsToTargets` (`src/lws/constraint.js:27`); `escapeHtml` (Task 4).
- Produces: `renderContainerView({ url, items, conformsTo }) → string` and the shared page chrome `navPage(title, crumbHtml, bodyHtml) → string` in `src/navigator/views.js` — Tasks 6-7 reuse `navPage` and its breadcrumb builder `crumbHtml(url)` (root segment links `/?view=nav`).

- [ ] **Step 1: Failing test** — `test/lws-navigator-container.test.js` (`startTestServer({ lws: true, conneg: true, mashlib: true })`):

```js
// Fixture: pod with /alice/stuff/ (NO index.html member) containing pub.md (public)
// and priv.md (owner-only ACL); write priv.md/pub.md .lwstypes via a normal typed PUT
// (Link: rel=type or typed body) so readDeclaredTypes returns a type for pub.md.
// 1. GET /alice/stuff/ BROWSER accept (anon)   -> 200 text/html; body contains 'pub.md',
//    contains the declared type localName badge, does NOT contain 'priv.md',
//    does NOT contain 'databrowser' (mashlib marker), contains '?view=nav' chrome.
// 2. GET /alice/stuff/ Accept: application/lws+json -> items[] JSON unchanged (agents unaffected).
// 3. Container WITH an index.html member + BROWSER accept -> 200 = the index.html bytes
//    (A2 shadow untouched); with ?view=nav -> the navigator view instead (shadow bypassed).
// 4. Server without lws: BROWSER accept -> mashlib wrapper (unchanged).
// 5. ETag: response carries an ETag distinct from the lws+json listing ETag (variant suffix).
```

- [ ] **Step 2: Run to fail.**

- [ ] **Step 3: Implement.** `src/navigator/views.js` — chrome + container view (CSS mirrors the projector `PAGE_CSS` look; list layout):

```js
'use strict'
const { escapeHtml: esc } = require('../utils/html')

const CSS = `:root{color-scheme:light dark;--fg:#1a1a1a;--bg:#fff;--muted:#666;--line:#ddd}
@media(prefers-color-scheme:dark){:root{--fg:#e8e8e8;--bg:#121212;--muted:#999;--line:#333}}
body{color:var(--fg);background:var(--bg);font:15px/1.5 system-ui,sans-serif;max-width:72ch;margin:2rem auto;padding:0 1rem}
a{color:hsl(210 70% 45%)}nav.crumb{font-size:.85rem;color:var(--muted)}nav.crumb a{color:inherit}
table{border-collapse:collapse;width:100%}td,th{padding:.35rem .5rem;border-bottom:1px solid var(--line);text-align:left}
.badge{display:inline-block;padding:0 .5rem;border-radius:1rem;font-size:.75rem;background:hsl(var(--h) 60% 88%);color:hsl(var(--h) 60% 25%)}
@media(prefers-color-scheme:dark){.badge{background:hsl(var(--h) 40% 25%);color:hsl(var(--h) 60% 85%)}}
.muted{color:var(--muted);font-size:.85rem}`

const hueOf = (n) => { let h = 0; for (const c of String(n)) h = (h * 31 + c.charCodeAt(0)) % 360; return h }
const localName = (t) => String(t).replace(/^.*[#/:]/, '')
const badge = (t) => `<span class="badge" style="--h:${hueOf(localName(t))}">${esc(localName(t))}</span>`

function crumbHtml (url) {
  const u = new URL(url)
  const segs = u.pathname.split('/').filter(Boolean)
  const parts = [`<a href="/?view=nav">pod</a>`]
  let p = ''
  for (let i = 0; i < segs.length; i++) {
    p += `/${segs[i]}`
    parts.push(i === segs.length - 1 ? esc(segs[i]) : `<a href="${esc(p)}/">${esc(segs[i])}</a>`)
  }
  return parts.join(' › ')
}

function navPage (title, crumb, body) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">` +
    `<meta name="viewport" content="width=device-width,initial-scale=1">` +
    `<title>${esc(title)}</title><style>${CSS}</style></head>` +
    `<body><nav class="crumb">${crumb}</nav>\n${body}\n</body></html>`
}

// items: [{ id, type:'Container'|'DataResource', mediaType?, size?, modified?, rdfTypes?:[], faces?:[{href,format}] }]
function renderContainerView ({ url, items, conformsTo = [] }) {
  const name = new URL(url).pathname.split('/').filter(Boolean).pop() ?? '/'
  const prof = conformsTo.length
    ? `<p class="muted">profile: ${conformsTo.map((c) => `<a href="${esc(c)}">${esc(localName(c))}</a>`).join(', ')}</p>` : ''
  const rows = items.map((it) => {
    const label = it.type === 'Container' ? `${esc(it.id)}` : esc(it.id)
    const badges = (it.rdfTypes ?? []).map(badge).join(' ')
    const faces = (it.faces ?? []).map((f) => `<a href="${esc(f.href)}">${esc(f.format)}</a>`).join(' · ')
    const meta = [it.mediaType, it.size, it.modified].filter(Boolean).map(esc).join(' · ')
    return `<tr><td><a href="${esc(it.id)}">${label}</a></td><td>${badges}</td><td>${faces}</td><td class="muted">${meta}</td></tr>`
  }).join('\n')
  return navPage(name, crumbHtml(url),
    `<h1>${esc(name)}/</h1>${prof}<table><tr><th>name</th><th>types</th><th>open with</th><th></th></tr>${rows}</table>` +
    `<p class="muted"><a href="${esc(url)}">machine view</a></p>`)
}

module.exports = { navPage, crumbHtml, renderContainerView, badge, localName, hueOf, esc }
```

In `resource.js`: in the container branch, replace the `willMashlib` consumption (`:645`) with an `request.lwsEnabled && browserWantsHtml(request)` arm that (a) is skipped when the A2 shadow already returned (shadow stays first, EXCEPT when `request.query?.view === 'nav'`, which now bypasses the shadow gate at `:443` — add `&& request.query?.view !== 'nav'` there); (b) builds items from the already-WAC-filtered entries (the `:580` result): fold in per-member `readDeclaredTypes(storage, memberPath)` (→ `rdfTypes`) and per-member `readAuthorizedRepresentations` alternates with `format: 'text/html'` first (→ `faces`); (c) reads container `conformsToTargets`; (d) sends `renderContainerView(...)` as `text/html` with the listing ETag suffixed `-nav` (mirror `getMashlibEtag`, `resource.js:223-231`, on `containerListingEtag`). The legacy mashlib arm remains for `!request.lwsEnabled`.

- [ ] **Step 4: Run to pass** — new file green + `test/lws-container.test.js`, `test/lws-shadow-conneg.test.js`, `test/lws-items-mediatype.test.js`, `test/server-root.test.js` green.

- [ ] **Step 5: Commit** (subject `feat(lws): navigator container view — typed, WAC-filtered, replaces mashlib under --lws`).

---

### Task 6 (fork): generic entity face (replaces mashlib for files under `--lws`)

**Files:**
- Modify: `src/navigator/views.js` (add `renderEntityView`)
- Modify: `src/handlers/resource.js:972` (the file mashlib intercept)
- Test: `test/lws-navigator-entity.test.js`

**Interfaces:**
- Consumes: the `describe_resource` aggregation shape (`src/mcp/tools.js:448-469`): `readDeclaredTypes`, `describedbyTargets`, `conformsToTargets`, `readAuthorizedRepresentations`; stored bytes + `storedContentType` (in scope at the `:972` seam); `navPage`/`crumbHtml`/`badge` (Task 5).
- Produces: `renderEntityView({ url, types, conformsTo, describedby, provenance, reps, mediaType, excerpt }) → string`.

- [ ] **Step 1: Failing test** — `test/lws-navigator-entity.test.js`:

```js
// Fixture: /alice/notes/x.md (markdown, typed via Link rel=type so .lwstypes exists),
// NO text/html alternate declared.
// 1. GET x.md BROWSER accept (lws) -> 200 text/html: contains type badge, 'machine view'
//    links incl. the raw URL, an escaped excerpt of the markdown in <pre>, no 'databrowser'.
// 2. GET x.md BROWSER accept + a declared text/html alternate + ?view=nav -> entity view
//    (dispatch override), NOT 303.
// 3. GET x.md Accept: text/markdown -> raw bytes unchanged.
// 4. Excerpt escaping: body containing '<script>' renders as '&lt;script&gt;' inside <pre>.
// 5. Server without lws -> mashlib wrapper unchanged.
// 6. ETag differs from the raw-bytes ETag (variant '-nav' suffix).
```

- [ ] **Step 2: Run to fail.**

- [ ] **Step 3: Implement.** `renderEntityView` in `views.js`:

```js
function renderEntityView ({ url, types = [], conformsTo = [], describedby = [], provenance = [], reps = { alternates: [] }, mediaType = '', excerpt = '' }) {
  const name = new URL(url).pathname.split('/').pop()
  const rows = [
    types.length ? `<dt>types</dt><dd>${types.map(badge).join(' ')}</dd>` : '',
    conformsTo.length ? `<dt>conformsTo</dt><dd>${conformsTo.map((c) => `<a href="${esc(c)}">${esc(c)}</a>`).join('<br>')}</dd>` : '',
    provenance.length ? `<dt>earned</dt><dd>${provenance.map((p) => esc(p)).join('<br>')}</dd>` : '',
    describedby.length ? `<dt>shapes</dt><dd>${describedby.map((d) => `<a href="${esc(d)}">${esc(d)}</a>`).join('<br>')}</dd>` : '',
    `<dt>media type</dt><dd>${esc(mediaType)}</dd>`,
    `<dt>machine views</dt><dd><a href="${esc(url)}">raw</a>${(reps.alternates ?? []).map((r) =>
      ` · <a href="${esc(r.href)}">${esc(r.format || r.href)}</a>`).join('')}</dd>`
  ].filter(Boolean).join('\n')
  const prev = excerpt ? `<h2>preview</h2><pre style="white-space:pre-wrap;border:1px solid var(--line);padding:.5rem">${esc(excerpt)}</pre>` : ''
  return navPage(name, crumbHtml(url), `<h1>${esc(name)}</h1><dl class="meta">${rows}</dl>${prev}`)
}
module.exports.renderEntityView = renderEntityView
```

In `resource.js`, replace the `:972` mashlib intercept with: `if (request.lwsEnabled && browserWantsHtml(request))` → aggregate (types/conformsTo/describedby/provenance/reps already computed or one call each per §4 of the recon), `excerpt` = first 2000 chars of stored bytes when `storedContentType` starts `text/`, send `renderEntityView` as `text/html` with `predictFileEtag`-based `-nav` variant ETag; `else if (shouldServeMashlib(...))` keeps the legacy arm (now reachable only when `!request.lwsEnabled`).

- [ ] **Step 4: Run to pass** + neighbors: `test/lws-nonrdf-teaching.test.js`, `test/rdf-serve.test.js`, `test/lws-serving-path.test.js`, `test/lws-etag-variant.test.js` green.

- [ ] **Step 5: Commit** (subject `feat(lws): navigator generic entity face — sidecar metadata + machine views + escaped preview`).

---

### Task 7 (fork): root/storage view (`/?view=nav`)

**Files:**
- Modify: `src/navigator/views.js` (add `renderRootView`)
- Modify: `src/handlers/resource.js` (root container + `view=nav` → root view)
- Test: `test/lws-navigator-root.test.js`

**Interfaces:**
- Consumes: `buildStorageDescription(origin, flags)` (`src/lws/storage-description.js:62` — the same call the `/.well-known/lws-storage` route makes at `src/server.js:1063-1088`, flags from `request.podConfig.get()`); the Task-5 container items for `/`.
- Produces: `renderRootView({ origin, sd, items }) → string`.

- [ ] **Step 1: Failing test** — `test/lws-navigator-root.test.js`:

```js
// 1. GET /?view=nav BROWSER accept (lws) -> 200 text/html: contains 'Storage',
//    a service name (e.g. TypeIndexService), the uriSpace prefix when configured,
//    and top-level container names (WAC-filtered).
// 2. GET / BROWSER accept -> the seeded index.html landing (unchanged; deviation (4)).
// 3. Server without lws: /?view=nav -> unchanged legacy behavior (query param ignored).
```

- [ ] **Step 2: Run to fail.**

- [ ] **Step 3: Implement.**

```js
function renderRootView ({ origin, sd, items }) {
  const cap = (sd.capability ?? []).map((c) => `<li>${esc(c.type ?? c.id ?? '')}${
    c.uriSpace ? ` — uriSpace: ${[].concat(c.uriSpace).map(esc).join(', ')}` : ''}</li>`).join('')
  const svc = (sd.service ?? []).map((s) => `<li><a href="${esc(s.id ?? '#')}">${esc(s.type ?? s.id)}</a></li>`).join('')
  const list = items.map((it) => `<li><a href="${esc(it.id)}">${esc(it.id)}</a></li>`).join('')
  return navPage('pod', `<a href="/?view=nav">pod</a>`,
    `<h1>${esc(origin)}</h1><h2>Storage</h2><ul>${svc}</ul>` +
    (cap ? `<h2>Capabilities</h2><ul>${cap}</ul>` : '') +
    `<h2>Containers</h2><ul>${list}</ul>` +
    `<p class="muted"><a href="/.well-known/lws-storage">machine view</a></p>`)
}
module.exports.renderRootView = renderRootView
```

Wire in the container branch: when the container is `/` AND `request.query?.view === 'nav'` AND lws + browser Accept → build `sd` exactly as the well-known route does (reuse its uriSpacePrefixes computation — factor a small helper in `src/lws/storage-description.js` if needed to avoid drift) + the WAC-filtered root items → `renderRootView`. The seeded `index.html` shadow keeps `GET /` (deviation (4)).

- [ ] **Step 4: Run to pass** + `test/server-root.test.js`, the storage-description tests green.

- [ ] **Step 5: Commit** (subject `feat(lws): navigator root/storage view at /?view=nav`).

---

### Task 8 (fork): Vary, parity pins, full suite

**Files:**
- Modify: `src/rdf/conneg.js:312-323` (`getVaryHeader`: under lws, when the resource path can dispatch on media type, include `Accept` — gate so non-lws Vary is byte-identical)
- Test: `test/lws-navigator-parity.test.js`
- Run: full fork suite

**Interfaces:** none new — this task pins behavior.

- [ ] **Step 1: Failing pins** — `test/lws-navigator-parity.test.js`:

```js
// 1. lws on: GET md resource BROWSER accept -> response has Vary containing 'Accept'.
// 2. lws on: NOTHING serves the mashlib wrapper: md file, container, root with browser
//    Accept -> no 'databrowser'/'mashlib' marker in any body.
// 3. lws OFF: md file browser Accept -> mashlib wrapper served (marker present);
//    Vary does NOT contain Accept-Profile (existing pin) — legacy byte-identity.
// 4. 304-never-beats-406 and etag-variant suites still green (no new assertions here;
//    covered by running the full suite in Step 3).
```

- [ ] **Step 2: Implement the Vary change; run the new file to pass.**

- [ ] **Step 3: Full fork suite**

Run: `cd ~/dev/git/LA3D/JavaScriptSolidServer && npm test`
Expected: all green (was 1626/0/1 at 32398c1; new count higher, 0 fail). Fix regressions before proceeding.

- [ ] **Step 4: Commit** (subject `test(lws): navigator parity pins + Vary: Accept under --lws`).

---

### Task 9 (lws-pod): retire `app/` + Makefile/doc plumbing

**Files:**
- Delete: `app/` (entire tree — src, seed, test, vendor, fixtures, README, package files)
- Modify: `Makefile` (remove `test-app` target at `:234` and from the `.PHONY` line at `:9`)
- Modify: `CLAUDE.md` (Commands section: drop `make test-app`; adjust the `app/` line in Architecture)
- Modify: `README.md` (repo layout + run instructions: `app/` gone, faces + navigator are the human surface)
- Modify: `docs/ROADMAP.md` (console line → this round's framing)

**Interfaces:** none.

- [ ] **Step 1: Delete + strip plumbing**

```bash
cd /Users/cvardema/dev/git/LA3D/agents/lws-pod
git rm -r app
# Edit Makefile: remove test-app from .PHONY (line 9) and the test-app target block (line 234).
# Edit CLAUDE.md / README.md / docs/ROADMAP.md per the file list above.
```

- [ ] **Step 2: Verify nothing references the corpse**

Run: `grep -rn "test-app\|app/src\|app/seed" Makefile README.md CLAUDE.md docs/ROADMAP.md tests/ scripts/ 2>/dev/null`
Expected: no hits (docs/design-notes + specs may still mention it historically — those stay).

- [ ] **Step 3: Root suite still green** — `make test-projection` (and `make test` if the pod is up).

- [ ] **Step 4: Commit** (subject `chore: retire the app/ SPA — superseded by server-side faces + navigator (spec 2026-07-15)`).

---

### Task 10 (both repos): merge, repin, reseed, live gate `make test-viewer`

**Files:**
- Fork: merge `la3d/lws-navigator` → `la3d/lws` (`--no-ff`), push, record merge SHA.
- Modify: `Dockerfile.fork:22` (`ARG JSS_GIT_REF=<merge SHA>`) and `:41` (CMD: **remove `"--mashlib-cdn"`**)
- Create: `tests/viewer.test.mjs`
- Modify: `Makefile` (add `test-viewer` target + `.PHONY`, pattern: the `test-wiki` block at `:197-204`)
- Modify: `tests/lws-conneg.test.mjs:211-219` (re-derive the browser-Accept pin: mashlib is gone on the rig; a card with a face → 303; without → navigator entity view)

**Interfaces:**
- Consumes: everything above; `make up-fork-tls`, `make publish-profiles`, `TOKEN=<bearer> node apps/wiki-projector/triggers/cli.mjs https://pod.vardeman.me/alice/wiki/` (the materialization path — `make reinstantiate` covers publish+instantiate for bound containers; use it).
- Produces: the live gate the FOLLOWUP close-out cites.

- [ ] **Step 1: Fork merge + push + repin + rebuild**

```bash
cd ~/dev/git/LA3D/JavaScriptSolidServer
git checkout la3d/lws && git merge --no-ff la3d/lws-navigator -m "merge: navigator round — text/html face dispatch + container/entity/root views, mashlib retired under --lws" && git push
git rev-parse HEAD   # -> <MERGE_SHA>
cd /Users/cvardema/dev/git/LA3D/agents/lws-pod
# Dockerfile.fork: JSS_GIT_REF=<MERGE_SHA>; CMD loses "--mashlib-cdn"; comment block updated.
make down-fork-tls; make up-fork-tls   # rebuild image (tag note in Dockerfile comments: fork-navigator)
make publish-profiles && make reinstantiate
```

- [ ] **Step 2: Write `tests/viewer.test.mjs`** (pattern: `tests/lws-wiki.test.mjs` — `BASE`, `getToken`, `describe.skipIf(!hasConneg)`, the bind+instantiate `beforeAll` recipe, cards `a.md`/`b.md`):

```js
// Assertions (spec §7 live gate), against https://pod.vardeman.me:
// 1. GET /alice/wiki/a.md.html            -> 200 text/html, contains '<h1>Alpha</h1>' and 'b.md.html'
// 2. GET /alice/wiki/index.html           -> 200 text/html, contains 'a.md.html'
// 3. GET /alice/wiki/viz.html             -> 200 text/html, contains 'cytoscape' and "fetch('graph.jsonld')"
// 4. GET /alice/wiki/a.md  BROWSER accept, redirect:'manual' -> 303, Location ends a.md.html
// 5. GET /alice/wiki/      BROWSER accept -> 200, = index.html bytes (A2 shadow)
// 6. GET /id/a             BROWSER accept, follow redirects  -> final 200 text/html w/ '<h1>Alpha</h1>'
// 7. GET /alice/           BROWSER accept -> 200 text/html navigator view, contains 'wiki'
// 8. GET /?view=nav        BROWSER accept -> 200 text/html, contains 'Storage'
// 9. anon: PUT private card via owner + owner-only ACL in a scratch container ->
//    anon container view omits it; anon GET its .html face -> 401/403
// 10. GET /alice/wiki/graph.jsonld (anon)  -> 200 application/ld+json
```

Makefile target (mirror `test-wiki`):

```make
test-viewer:
	@echo "== viewer live gate (needs up-fork-tls + publish-profiles + reinstantiate) =="
	NODE_EXTRA_CA_CERTS=certs/rootCA.pem POD_BASE=https://pod.vardeman.me npx vitest run tests/viewer.test.mjs
```

- [ ] **Step 3: Re-derive `tests/lws-conneg.test.mjs:211-219`** — the "browser Accept → mashlib" pin becomes: browser Accept on the seeded card → 303 to its face (or, for a face-less md fixture, 200 navigator entity view, no mashlib marker). Keep the F3-no-406 intent: browser Accept never 406s.

- [ ] **Step 4: Run the full live sweep** (spaced ~40s where anon-heavy): `make test-lws test-l3 test-typeindex test-indexed-relation test-graph test-conneg test-void test-preservation test-mcp-v2 test-referent test-nextfork test-dcat test-profiles test-wiki test-projection test-viewer`
Expected: ALL green. The live sweep exists to catch cross-repo consequences the fork suite structurally can't (precedent: the Task-5 mcp-v2 catch last round) — investigate any failure before touching assertions.

- [ ] **Step 5: Human verification (Chuck or agent-driven browser):** the §7 browser walk — root → orient → `/alice/wiki/` → card → metadata block → edge → graph → backlink; paste `https://pod.vardeman.me/id/a`. Record the outcome in the round notes.

- [ ] **Step 6: Commit** (lws-pod: Dockerfile.fork, tests/viewer.test.mjs, Makefile, tests/lws-conneg.test.mjs; subject `feat(rig): repin fork-navigator + test-viewer live gate; mashlib off the rig`).

---

### Task 11 (lws-pod): FOLLOWUP + docs close-out

**Files:**
- Modify: `FOLLOWUP.md` (new top block: round DONE + live-verified, headline behaviors, seeds carried — incl. the curator round as NEXT)
- Modify: `docs/foundations/05-jss-spec-conformance.md` (add the text/html dispatch + navigator behavior to the conneg §)
- Modify: `docs/ROADMAP.md` (advance)

**Interfaces:** none.

- [ ] **Step 1: Write the FOLLOWUP top block** — pattern: the 2026-07-14 block; must record: fork merge SHA + image tag, suite counts, live-gate list incl. `test-viewer` NEW, the four locked decisions, the grounded deviations (303 dispatch; index.html-shadow dispatch; `a.md.html` naming; seeded root landing kept), seeds (type-first view, browser login, memory-inspection views w/ curator, MCP-Apps rung, PodOS elements, embedded-snapshot viz), and **NEXT = the curator-skill round** (own brainstorm).
- [ ] **Step 2: Conformance + roadmap edits.**
- [ ] **Step 3: Commit** (subject `docs: record the navigator round DONE + live-verified; NEXT = curator round`).

---

## Self-review (done at write time)

- **Spec coverage:** §1 dispatch rule → T4 + A2 shadow (T2) + T5/T6 fallbacks; §2 three navigator views → T5/T6/T7; §3 three faces → T1/T2/T3; §4 write/read paths → T1-T4; §5 auth/security/errors → per-task (escape/html:false/null-render/WAC tests); §6 page design → T1/T2/T5 templates; §7 testing incl. human walk → per-task + T10; §8 retirement/docs/seeds → T9/T11; §9 non-goals respected (no editor, no login, no MCP changes, no type-first view).
- **Placeholder scan:** all code steps carry code; test steps carry either code or exact case lists with fixtures named; no TBDs.
- **Type consistency:** `renderers.html(src)`, `renderers['index-html'](containerUrl, sources, members)`, `renderers.viz(...)` match instantiate's member/target call shapes (`instantiate.mjs:77,:101`); fork views consume the exact recon return shapes (`generateLwsContainer` items, `readRepresentations` `{href,format,profile}`); `esc`/`hueOf` duplicated deliberately (projector ESM vs fork CJS — noted, not shared across repos).
- **Known judgment calls (flag to reviewer, not blockers):** 303-vs-inline (grounded deviation, spec updated); per-member sidecar reads in the container view are N+1 filesystem reads (fine for v1 scale); the viz `<article>` extraction couples loosely to the card template (both in this repo, tested together in T10).
