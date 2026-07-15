# Human viewing surface — server-side HTML representations + graph viewer (the console-on-fork round, reframed)

**Date:** 2026-07-15
**Status:** design of record (brainstormed 2026-07-15 from the grounded scoping note
`docs/design-notes/console-on-fork-rewire.md`, approved section-by-section; pending
implementation plan). Governed by `docs/foundations/06-code-placement-audit.md` (P13 — the
standing neutrality gate). **Next step:** `superpowers:writing-plans` against this spec, then
subagent-driven implementation. Do NOT start implementation from this doc without a plan.

This spec **supersedes the console rewire as scoped** — the brainstorm resolved the scoping
note's §4 questions by *reframing the round*, not by fixing the SPA. The 2026-06-22 wiki-memory
app design (`docs/superpowers/specs/2026-06-22-wiki-memory-app-design.md`) remains as history;
its editor-centric premise is explicitly retired here.

---

## 0. Why this exists (and why the SPA dies instead of getting fixed)

The curation console (`app/`) is broken against the live fork on six verified axes (scoping
note §2). The brainstorm asked *what the console was for* before fixing it, and three
groundings converged on a different answer:

1. **Chuck's decomposition (2026-07-15, the round's pivot):** there are two separate needs —
   (a) a human must be able to **see memories as properly rendered HTML**, visualize the typed
   graph, and navigate the hierarchy (sanity-checking); (b) a **curator** corrects errors and
   enriches links — and the curator is an *agentic skill with rules*, not a GUI (exactly how
   the Obsidian vault curates today: `/curator` harvest→adjudicate→evolve, `/audit`,
   `/review-note` — agents propose, the human adjudicates in dialogue, git is the diff channel).
2. **OKF's practice** (GoogleCloudPlatform/knowledge-catalog): agents produce and enrich
   bundles; humans review `git diff` and browse a **generated self-contained read-only viewer**
   (`viz.html` — Cytoscape graph, detail panel, backlinks, search). No curation GUI exists.
   The repo's skills (discovery, kb-search, enrichment config) all teach *agents* to consume
   the knowledge.
3. **How this pod will actually be attached (Chuck, 2026-07-15):** through agent harnesses —
   Claude Code, Claude Desktop/Cowork, and **Claude Science** (launched 2026-06-30: a
   coordinating agent over ~60 curated *skills and connectors*; artifacts rendered natively in
   the harness) — all via MCP. **MCP Apps** (`io.modelcontextprotocol/ui`, spec 2026-01-26, the
   first official MCP extension, shipped in Claude/ChatGPT/Goose/VS Code) establishes the
   direction: servers ship self-contained HTML UI as `ui://` resources that hosts render. If
   rendering is client-side in our SPA, the human view exists in exactly one channel (a browser
   running our app) and zero harnesses. If the pod renders **server-side**, every channel gets
   it: browser (no install), harness (fetch + display), curl.

**Chuck's approved decisions (2026-07-15, recorded so they are not re-litigated):**

- **Server-side rendering is the move.** HTML is a *declared profile representation*,
  materialized by the projector like every other derived face.
- **No editor.** Correction is conversational-through-the-agent: the curator skill executes
  governed writes; the SHACL 400 problem+json teaches *the agent*. The GUI is view/navigate
  only. The curator is **its own next round** (own brainstorm: rules, worklist sources,
  adjudication flow).
- **Approach B:** html rep + viewer (pure lws-pod work) **plus** the narrow fork rung —
  `Accept: text/html` on a bare canonical name that has a declared `text/html` alternate serves
  it, preempting mashlib for exactly those resources. Sequenced A-then-rung; if the rung
  balloons it becomes a seed and the round still ships.
- **MCP Apps `ui://` rung: recorded seed, not built.** The viewer is designed self-contained
  (no CDN) so it is already conformant-shaped as a future Apps template.
- **Readability is a requirement**: clear links, visible structure, and the card's **full
  frontmatter rendered as a metadata block** so the human sanity-checks the actual stored
  metadata.
- **`app/` is deleted**, not fixed. The scoping note's six breakages dissolve with it; what
  survives is the e2e-gate idea (re-derived against the html faces) and `make test-wiki` as the
  fixture source (the hand-rolled seed dies too).

---

## 1. Scope & architecture

The round delivers the **human viewing surface, server-side**. The llm-wiki family gains two
derived representations (`html` per card, rendered `index.html` per container) plus a
self-contained graph viewer (`viz.html`), all materialized by the existing projector at
instantiate/CDC time; one narrow fork rung serves the html alternate on canonical names.

No new machinery in `projection/prof/` — the neutral substrate already materializes non-RDF
representations (existence proof: `index.rep.jsonld` = `{ id: "index", target: "index.md",
format: "text/markdown" }`). Everything wiki-specific lands in `apps/wiki-projector/` and the
profile defs (P13-clean). The rung generalizes: any profile family that later declares an html
rep (dcat-catalog, …) becomes browser-viewable with zero substrate change.

```
projection/profiles/defs/llm-wiki/
  profile.jsonld          + #rep-html, #rep-viz entries (lwspr:representation)
  html.rep.jsonld         { id: "html", suffix: ".html", format: "text/html", conformsTo: … }
  viz.rep.jsonld          { id: "viz",  target: "viz.html", format: "text/html", conformsTo: … }

apps/wiki-projector/
  renderers.mjs           + card→page renderer, + viz renderer (template + wiring)
  viewer/                 NEW: viz template + vendored pinned JS (no CDN, no build step)

fork (la3d/lws, one rung)
  format-driven alternate selection: Accept: text/html on a bare name that HAS a declared
  text/html alternate serves it — ahead of the mashlib intercept, only there
```

**Human entry points:** paste any canonical URI (`/id/a` → 303 → rendered card), or start at
`/alice/wiki/index.html` and browse; every card links up to its index and into the graph
viewer.

## 2. The three surfaces

**`<card>.html`** — rendered at materialize time from the card alone: breadcrumb, header
(title + type badge), **metadata block** (§5), rendered markdown body, footer nav. **No baked
backlinks** — backlinks need aggregate knowledge and would make every card's render depend on
every other card's write (re-render cascades). Backlinks live in the viewer, computed
client-side from `graph.jsonld`; the card page links to `viz.html#focus=<card-id>`. Renders
stay local: card in → page out. Face naming follows the existing suffix mechanism exactly as
`.links.jsonld` does (`html.rep.jsonld` declares `suffix: ".html"`); the concrete produced name
is grounded at plan time and used consistently by all internal links.

**`index.html`** — the derived OKF `index.md` rendered per container: the hierarchical
navigation face. Entries link to card `.html` faces and child containers' `index.html`.

**`viz.html`** — one self-contained file (OKF-viewer-shaped): typed force-directed graph over
`graph.jsonld` (live-fetched, relative URL, same container), nodes colored by `type`, edges
labeled with the llm-wiki predicate, detail panel (frontmatter facts + typed edges + computed
backlinks + body preview via `<article>` extraction from the card's server-rendered `.html`
face), search + type filter, click-through to card pages. Vendored pinned libs **inlined** in
the artifact — no CDN (keeps it valid as a future MCP-Apps template and honest under strict
CSP). Declared with `target: viz.html`, so it materializes next to `graph.jsonld` like OKF's
per-bundle viewer.

Markdown→HTML uses a pinned renderer dependency in the projector with **raw inline HTML
disabled** (§4).

## 3. Data flow & the fork rung

**Write path (unchanged mechanism, two more faces).** Agent writes `card.md` → `applyLwsWrite`
(admission on the links rep, as today) → CDC trigger / CLI one-shot → `instantiate()` →
materialize also emits `card.html` + `index.html` alongside `card.links.jsonld`, `index.md`,
`graph.jsonld`. `viz.html` is data-independent (live-fetch), so it materializes once at
bind/instantiate, idempotent thereafter. All faces are ordinary pod resources written through
the governed path — git-versioned, WAC-inherited like every derived rep.

**Read path, browser.** `GET /id/a` (browser Accept) → 303 → `/alice/wiki/a.md` with
`Accept: text/html` → rung selects the declared `text/html` alternate → 200 rendered card. Rung
semantics mirror the shipped alternates gateway: bare-200 alternate serving, `Content-Location`,
**variant-aware ETags** (the gateway round's ETag-variant machinery applies to the html face
like any other variant), HEAD parity. The 406 teaching surface and `altr:` advertisement pick
up the html rep automatically — it is just another declared representation.

**The rung, precisely scoped:** in the serving path *before* `shouldServeMashlib`, if the
resource has a declared alternate with `format: text/html`, serve it. No declared html
alternate → byte-identical current behavior (mashlib wrap, 406 teaching, all of it). Strictly
additive.

**Read path, agents/harnesses:** untouched. Agents keep negotiating JSON-LD/profile reps; the
MCP surface is unchanged this round.

## 4. Auth, security, error handling

**Auth (v1):** assumes the wiki container is public-read (true on the rig; consistent with
graph reads today). Private-memory browsing from a bare browser (no bearer) is out of scope —
recorded seed (session shim, or free with the MCP-Apps rung where the host holds credentials).
`.html` faces are regular resources under WAC: a private member's html face 401s for anon
exactly like the member — no new leak class (live gate asserts this).

**Rendering security:** markdown→HTML with raw inline HTML disabled (pinned renderer,
`html: false`) and frontmatter values escaped — agent-written cards cannot inject script into
pod-origin pages. The viz detail panel reuses the same policy by fetching the server-rendered
`.html` face and extracting `<article>` — one renderer, one sanitization policy, no second
client-side markdown path.

**Error handling:**
- A failed html/index render **never blocks the write or the governed faces** — content is
  canonical, html is derived; render errors log at the trigger and skip that face (matches
  existing derived-view behavior — verify exact pattern at plan time).
- viz.html: `graph.jsonld` fetch failure → visible inline message (never a blank canvas);
  unknown/missing types render in a fallback style rather than dropping nodes.
- Fork rung: any doubt about the alternate (missing file, unreadable) → fall through to current
  behavior, never a new 5xx.

## 5. Page design (readability is a requirement)

Single-column article layout (~70ch measure, comfortable line height, real heading hierarchy,
`prefers-color-scheme` light/dark), small CSS block inlined by the renderer template — pages
self-contained, no stylesheet fetch, save-as works.

**Card page, top to bottom:**
1. **Breadcrumb** — `pod › wiki › card`; each segment a link, container segment → its
   `index.html`. The hierarchy is always visible.
2. **Header** — title (h1) + type badge (the `skos:notation` value), colored by type — same
   palette as the viz, so type-color is consistent across pages and graph.
3. **Metadata block** — the card's **full frontmatter** as a definition-list panel
   (Obsidian-properties-style), two visually distinct kinds:
   - **Typed edges** (`up`, `concept`, `extends`, `supports`, …) — *navigable links* to the
     target card's `.html` face, labeled with the predicate name. An edge in the data is a
     link on the page, named for what it means.
   - **Scalar metadata** (`status`, `tags`, timestamps, `maturity`, …) — plain values, tags as
     chips.
   Nothing hidden: what the frontmatter holds is what the block shows — the human
   sanity-checks the actual stored metadata, not a curated subset.
4. **Body** — rendered markdown prose.
5. **Footer nav** — `↑ index` · `⚯ graph` (`viz.html#focus=<this-card>`).

**Index page:** breadcrumb, container title/description, then two clearly separated groups —
**cards** (title + type badge + one-line description) and **child containers** (name + entry
count). Bounded branching keeps it legible because the OKF index it renders is already bounded.

**Link clarity rule:** internal wiki links navigate between `.html` faces; the canonical data
URI (`…/a.md`, `/id/a`) appears in the metadata block as "source" so the human always knows
which resource they are looking at. External links get a visible affordance.

## 6. Testing

- **Projector unit tests** (`apps/wiki-projector`): card renderer (title/badge/metadata block;
  edge fields become links; raw `<script>` in a body does NOT pass through; frontmatter
  escaped), index renderer, viz materialization.
- **Fork suite** (fork repo): the rung — `Accept: text/html` with a declared html alternate →
  200 rendered face (+ HEAD parity + variant ETag); without → byte-identical current behavior.
- **lws-pod live pins:** the existing mashlib pin (`tests/lws-conneg.test.mjs:211`) stays for
  the no-alternate case and gets a sibling pin for the with-alternate case — the seeded wiki
  card now HAS an html face, so the old pin's resource choice is re-grounded carefully.
- **Live gate** — new `make test-viewer` against the fork-tls rig, seeded via the
  `make test-wiki` pipeline: card/index/viz faces 200 `text/html`; bare-name browser-Accept →
  rendered card; `/id/a` browser 303 chain ends in rendered HTML; anon GET of a private
  member's `.html` face → 401; viz's `graph.jsonld` fetch works anon on the public container.
- **Human verification (the round's acceptance):** paste `https://pod.vardeman.me/id/<name>`
  into a real browser → readable card; navigate breadcrumb → index → another card → graph view
  → back. That is the "pod is human-usable" bar.

## 7. Retirement, docs, seeds

**Retired:** `app/` deleted wholesale (src, seed, test, vendor, README) — git history keeps
it; `make test-app` and its Makefile plumbing removed; FOLLOWUP records the supersession
(editor dropped → curator round; rendering moved server-side).

**Docs touched:** root `README.md` (layout + run instructions), `docs/ROADMAP.md`, FOLLOWUP
top block at round end.

**Seeds recorded, not built:**
- **MCP-Apps `ui://` rung** — register the viewer as an Apps template on the fork's MCP
  surface (extension `io.modelcontextprotocol/ui`); the self-contained viewer is already the
  right shape.
- **Private-memory browser auth** — session shim, or arrives free with the Apps rung.
- **Curator skill = the next round** — its own brainstorm: rules, worklist sources (SHACL
  Warnings, `curator_status:`-style observations), enrichment, adjudication flow, git-diff
  channel over the pod's `--git` versioning.
- **Embedded-snapshot viz** for offline sharing (v1 live-fetches only).

## 8. Non-goals (this round)

No editor. No curator. No MCP surface changes. No private-read browser auth. No new
`projection/prof/` mechanism. No mashlib behavior change where no html alternate is declared.
No wm:/Semantic-Markdown revival — the wm: model retires with the SPA; the llm-wiki family is
the data model, defined by its profile, rendered as-is.
