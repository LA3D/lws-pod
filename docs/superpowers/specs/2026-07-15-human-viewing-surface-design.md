# Human surface for the pod — LWS navigator (Drive shell) + profile-declared HTML faces

**Date:** 2026-07-15 (revised same day — see §0b)
**Status:** design of record (brainstormed 2026-07-15 from the grounded scoping note
`docs/design-notes/console-on-fork-rewire.md`, approved section-by-section; **reframed and
re-approved same day** after the navigator research — deliberation record + research grounding
in `docs/design-notes/lws-navigator.md`; pending implementation plan). Governed by
`docs/foundations/06-code-placement-audit.md` (P13 — the standing neutrality gate).
**Next step:** `superpowers:writing-plans` against this spec, then subagent-driven
implementation. Do NOT start implementation from this doc without a plan.

This spec **supersedes the console rewire as scoped** — the brainstorm resolved the scoping
note's §4 questions by *reframing the round twice*, not by fixing the SPA. The 2026-06-22
wiki-memory app design (`docs/superpowers/specs/2026-06-22-wiki-memory-app-design.md`) remains
as history; its editor-centric premise is explicitly retired here.

---

## 0a. First reframe: viewing surface vs curator (and why the SPA dies)

The curation console (`app/`) is broken against the live fork on six verified axes (scoping
note §2). The brainstorm asked *what the console was for* before fixing it, and three
groundings converged:

1. **Chuck's decomposition (2026-07-15):** two separate needs — (a) a human must be able to
   **see memories as properly rendered HTML**, visualize the typed graph, and navigate the
   hierarchy (sanity-checking); (b) a **curator** corrects errors and enriches links — and the
   curator is an *agentic skill with rules*, not a GUI (exactly how the Obsidian vault curates
   today: `/curator` harvest→adjudicate→evolve, `/audit`, `/review-note` — agents propose, the
   human adjudicates in dialogue, git is the diff channel).
2. **OKF's practice** (GoogleCloudPlatform/knowledge-catalog): agents produce and enrich
   bundles; humans review `git diff` and browse a generated self-contained read-only viewer
   (`viz.html`). No curation GUI exists; the repo's skills teach *agents* to consume the
   knowledge.
3. **How this pod is actually attached:** through agent harnesses — Claude Code, Claude
   Desktop/Cowork, **Claude Science** (2026-06-30: coordinating agent over curated *skills
   and connectors*; artifacts rendered natively in the harness) — all via MCP. **MCP Apps**
   (`io.modelcontextprotocol/ui`, first official MCP extension, shipped in Claude/ChatGPT/
   Goose/VS Code) sets the direction: servers ship self-contained HTML UI that hosts render.
   Client-side rendering in our SPA would exist in one channel and zero harnesses;
   **server-side rendering exists in every channel**: browser (no install), harness (fetch +
   display), curl.

## 0b. Second reframe: the Drive inversion (2026-07-15, after research)

Chuck: *"LWS is essentially a standards-compliant Google Drive that also lets agents treat the
storage as a memory structure and store metadata about the data"* — so the human surface
should be a **general storage navigator with per-type integrated apps**, not a bespoke wiki
app. Three parallel research sweeps (full reports under `docs/design-notes/research/`,
synthesis in `docs/design-notes/lws-navigator.md`) confirmed:

- **The slot is empty**: every existing pod UI is client-side and re-derives types from
  fetched triples; none consumes server-declared self-description; no JSON-LD→HTML library
  exists; the LWS WG is protocol-only. Fresh 2026 Drive-style Solid file managers (Pod Drive,
  FilePod) prove demand but don't occupy the neutral-web slot.
- **The dispatch registry is the convergent pattern** (Drive "open with", PodOS
  `selectToolsForTypes`, SolidOS panes, Nextcloud Viewer) — and our substrate already has it,
  declaratively and server-side: a declared `text/html` representation IS a registration,
  `altr:` alternates ARE the tool list, `conformsTo` is the app binding.
- **Deployment posture is proven** (Penny's server-UI mode; `filebrowser`): the server ships
  its own navigation UI at its own resource URLs; conneg untouched.

**The inversion (Chuck-approved):** the **navigator is the neutral Drive shell** (fork-level,
request-time, self-description-driven); the **wiki faces are application #1 registered with
it** (projector-level, materialized). One round, thin vertical slice of both.

**Chuck's approved decisions (2026-07-15, recorded so they are not re-litigated):**

- **Server-side rendering.** HTML faces are declared profile representations, materialized by
  the projector; the navigator renders at request time in the fork.
- **No editor.** Correction is conversational-through-the-agent; the SHACL 400 problem+json
  teaches *the agent*. The curator is **its own next round**.
- **The inversion**: navigator shell + profile-face plug-ins, one round, thin slice of both.
- **Dispatch/default:** a profile-bound container defaults to its declared index face; the
  navigator view is always reachable (tab/`?view=nav` — Drive default-handler grammar).
- **mashlib retires under `--lws`**: `text/html` dispatch = declared face → navigator.
  Upstream behavior byte-identical when `--lws` is off.
- **v1 is public-only** (anon WAC view); browser login is a recorded seed.
- **Navigator v1 scope:** container view + generic entity face + root/storage view.
  Type-first collections view is a seed.
- **MCP Apps `ui://` rung: seed, not built** — the viewer is designed self-contained (no CDN)
  so it is already conformant-shaped as a future Apps template.
- **Readability is a requirement**: clear links, visible structure, the card's **full
  frontmatter rendered as a metadata block**.
- **`app/` is deleted**, not fixed; `make test-wiki` becomes the fixture source.

---

## 1. Scope & architecture — two layers

**Layer N — the navigator (neutral, fork-level, request-time).** The HTML face of the LWS API
itself. It reads ONLY self-description — `items[]`, `.lwstypes`, `.lwsprov`, `.meta`
(`dct:conformsTo`), `altr:` alternates, the storage description — never profile semantics
(P13). It must render at request time because **listings are WAC-filtered per requester**: a
materialized listing would either leak private member names or freeze the anonymous view.
Part of `--lws` serving (no new flag); when `--lws` is off, nothing changes.

**Layer F — profile faces (the "apps", materialized, projector-level).** The llm-wiki family
declares HTML representations rendered by `apps/wiki-projector` at instantiate/CDC time, like
every derived rep. Content is not per-requester, so materialization is correct; resource ACLs
gate fetch. Any profile family onboards the same way (dcat-catalog, RO-Crate-style research
objects — cf. `ro-crate-preview.html`, the external standard for storage carrying its own
human face) with zero substrate change.

**The dispatch rule (one rule, both layers):** for `Accept: text/html` under `--lws`:
1. resource has a declared `text/html` alternate → serve it (the registered default face);
2. else → navigator view (container view for containers, generic entity face for resources);
3. `?view=nav` forces the navigator view even where a declared face exists (the "open with"
   override; also surfaced as a link in face chrome where the face opts in — the wiki faces
   do).
mashlib no longer serves on our rig; the `--mashlib-cdn` flag keeps working for non-`--lws`
deployments.

```
fork (la3d/lws)
  navigator: request-time HTML rendering of container / generic entity / root views
  dispatch:  Accept: text/html → declared alternate → navigator (mashlib retired under --lws)

projection/profiles/defs/llm-wiki/
  profile.jsonld          + #rep-html, #rep-viz entries (lwspr:representation)
  html.rep.jsonld         { id: "html", suffix: ".html", format: "text/html", conformsTo: … }
  viz.rep.jsonld          { id: "viz",  target: "viz.html", format: "text/html", conformsTo: … }

apps/wiki-projector/
  renderers.mjs           + card→page renderer, + viz renderer (template + wiring)
  viewer/                 NEW: viz template + vendored pinned JS (no CDN, no build step)
```

**Human entry points:** paste any canonical URI (`/id/a` → 303 → rendered card), start at the
pod root (navigator root view), or at `/alice/wiki/` (defaults to the wiki's index face).

## 2. The navigator's three views (Layer N)

All three share the Drive grammar from the research: one canonical hierarchy; metadata
**adjacent** to the listing, never a separate destination; preview-before-open; a
Signposting-style "machine view" affordance (the same URI's data faces, from `altr:`) in the
chrome of every page.

**Container view.** Breadcrumb; the container's own metadata strip (bound profile badge from
`conformsTo`, governance links from `.meta`); then the member list — one row per member: name,
**type badge** (from `.lwstypes`, colored by the shared palette), one-line provenance hint
(from `.lwsprov` where present), and the face links ("open with"): default face first, other
alternates as secondary. Members the requester cannot READ simply aren't in `items[]` — the
navigator inherits WAC filtering, it never re-implements it. Child containers navigate to
their default view (declared index face if bound, else navigator container view).

**Generic entity face** — for resources with no declared `text/html` alternate: breadcrumb;
title/name; type badges; the sidecar metadata pane (`.lwstypes` types, `.lwsprov` earned
conformance, `.meta` descriptions); machine-view links (each `altr:` alternate + the raw
resource); a bounded content preview where the media type is presentable (markdown/text
excerpt), else size/type facts. PodOS's generic "Data" view is the shape; ours is
server-rendered from declarations.

**Root/storage view** — orientation: the storage description rendered for humans — uriSpaces
(the `id/` minting rule), published profiles (the installed-apps list), capabilities, top-level
containers. This is where a cold human starts the way a cold agent starts at
`/.well-known/lws-storage`.

**Implementation posture:** small server-side templates in the fork (hand-rolled; the data is
already assembled JSON — rendering is a template pass), no client framework, no build step;
progressive enhancement (e.g. PodOS MIT elements) is a seed, not v1. Rendering must add no new
authz logic: every fact shown comes from an already-authorized read on the requester's own
credentials.

## 3. The wiki family's faces (Layer F, application #1)

**`<card>.html`** — rendered at materialize time from the card alone: breadcrumb, header
(title + type badge), **metadata block** (§6), rendered markdown body, footer nav. **No baked
backlinks** — backlinks need aggregate knowledge and would make every card's render depend on
every other card's write. Backlinks live in the viewer, computed client-side from
`graph.jsonld`; the card page links to `viz.html#focus=<card-id>`. Renders stay local: card in
→ page out. Face naming follows the existing suffix mechanism exactly as `.links.jsonld` does
(`html.rep.jsonld` declares `suffix: ".html"`); the concrete produced name is grounded at plan
time and used consistently by all internal links.

**`index.html`** — the derived OKF `index.md` rendered per container: the wiki's curated
navigation face, and the **default view** of the bound container (locked decision). Entries
link to card faces and child containers; chrome links to the navigator view (`?view=nav`) and
`viz.html`.

**`viz.html`** — one self-contained file (OKF-viewer-shaped): typed force-directed graph over
`graph.jsonld` (live-fetched, relative URL), nodes colored by `type`, edges labeled with the
llm-wiki predicate, detail panel (frontmatter facts + typed edges + computed backlinks + body
preview via `<article>` extraction from the card's server-rendered `.html` face), search +
type filter, click-through to card pages. Vendored pinned libs **inlined** — no CDN (keeps it
valid as a future MCP-Apps template and honest under strict CSP; `ro-crate-html-lite` is the
architectural reference — pattern only, it is GPL). Declared with `target: viz.html`, so it
materializes next to `graph.jsonld`.

Markdown→HTML uses a pinned renderer dependency in the projector with **raw inline HTML
disabled** (§5).

## 4. Data flow & dispatch

**Write path (unchanged mechanism, two more faces).** Agent writes `card.md` → `applyLwsWrite`
(admission on the links rep, as today) → CDC trigger / CLI one-shot → `instantiate()` →
materialize also emits `card.html` + `index.html` alongside `card.links.jsonld`, `index.md`,
`graph.jsonld`. `viz.html` is data-independent (live-fetch), so it materializes once at
bind/instantiate, idempotent thereafter. All faces are ordinary pod resources written through
the governed path — git-versioned, WAC-inherited like every derived rep.

**Read path, browser.** `GET /id/a` (browser Accept) → 303 → `/alice/wiki/a.md` with
`Accept: text/html` → dispatch rule step 1 → 200 rendered card. `GET /alice/wiki/` → step 1
(the declared index face). `GET /alice/` (no bound face) → step 2, navigator container view.
`GET /` → root view. Serving semantics mirror the shipped alternates gateway: bare-200
alternate serving, `Content-Location`, **variant-aware ETags** (the gateway round's
ETag-variant machinery applies to html faces like any other variant), HEAD parity. The 406
teaching surface and `altr:` advertisement pick up html reps automatically. Navigator-rendered
views are dynamic responses (no ETag reuse across requesters' WAC views — plan grounds the
caching posture).

**Read path, agents/harnesses:** untouched. Agents keep negotiating JSON-LD/profile reps; the
MCP surface is unchanged this round.

## 5. Auth, security, error handling

**Auth (v1): public-only.** The navigator serves the anonymous WAC view; browser login is a
recorded seed (cookie session, or free with the MCP-Apps rung where the host holds
credentials). `.html` faces are regular resources under WAC: a private member's face 401s for
anon exactly like the member; a private member never appears in the anon navigator listing
because `items[]` is already WAC-filtered — no new leak class (live gate asserts both).

**Rendering security:** markdown→HTML with raw inline HTML disabled (pinned renderer,
`html: false`) and frontmatter values escaped — agent-written cards cannot inject script into
pod-origin pages. The navigator escapes ALL substrate-derived strings (names, titles, type
IRIs, meta descriptions) — same reason. The viz detail panel reuses the face policy by
fetching the server-rendered `.html` face and extracting `<article>` — one renderer, one
sanitization policy, no second client-side markdown path.

**Error handling:**
- A failed html/index render **never blocks the write or the governed faces** — content is
  canonical, html is derived; render errors log at the trigger and skip that face (matches
  existing derived-view behavior — verify exact pattern at plan time).
- Navigator: a missing/unreadable sidecar degrades that row/pane (name-only row, empty pane) —
  never a 5xx; dispatch step-1 doubt (declared alternate missing/unreadable) falls through to
  step 2.
- viz.html: `graph.jsonld` fetch failure → visible inline message (never a blank canvas);
  unknown/missing types render in a fallback style rather than dropping nodes.

## 6. Page design (readability is a requirement)

Single-column article layout for faces, list layout for navigator views (~70ch measure,
comfortable line height, real heading hierarchy, `prefers-color-scheme` light/dark), a small
CSS block inlined by each template — pages self-contained, no stylesheet fetch, save-as works.
**One design language across both layers**: shared breadcrumb grammar, shared type-badge
palette (navigator rows, card headers, and viz nodes all color a type identically).

**Card page, top to bottom:**
1. **Breadcrumb** — `pod › wiki › card`; each segment a link; container segment → the
   container's default view; the root segment → the navigator root view.
2. **Header** — title (h1) + type badge (the `skos:notation` value).
3. **Metadata block** — the card's **full frontmatter** as a definition-list panel
   (Obsidian-properties-style), two visually distinct kinds:
   - **Typed edges** (`up`, `concept`, `extends`, `supports`, …) — *navigable links* to the
     target card's face, labeled with the predicate name. An edge in the data is a link on
     the page, named for what it means.
   - **Scalar metadata** (`status`, `tags`, timestamps, `maturity`, …) — plain values, tags
     as chips.
   Nothing hidden: what the frontmatter holds is what the block shows — the human
   sanity-checks the actual stored metadata, not a curated subset.
4. **Body** — rendered markdown prose.
5. **Footer nav** — `↑ index` · `⚯ graph` (`viz.html#focus=<this-card>`) · navigator view.

**Index page:** breadcrumb, container title/description, then two clearly separated groups —
**cards** (title + type badge + one-line description) and **child containers** (name + entry
count). Bounded branching keeps it legible because the OKF index it renders is already bounded.

**Navigator views:** per §2 — member rows with type badges and face links; metadata adjacent;
"machine view" links in the chrome of every page.

**Link clarity rule:** internal wiki links navigate between faces; the canonical data URI
(`…/a.md`, `/id/a`) appears in the metadata block as "source" so the human always knows which
resource they are looking at. External links get a visible affordance.

## 7. Testing

- **Projector unit tests** (`apps/wiki-projector`): card renderer (title/badge/metadata block;
  edge fields become links; raw `<script>` in a body does NOT pass through; frontmatter
  escaped), index renderer, viz materialization.
- **Fork suite** (fork repo): dispatch — `Accept: text/html` with a declared html alternate →
  200 rendered face (+ HEAD parity + variant ETag); container without a bound face → navigator
  container view; resource without a face → generic entity face; root view; `?view=nav`
  override; **WAC assertions** — anon navigator listing contains no private member rows, anon
  GET of a private member's face → 401; `--lws` off → byte-identical current behavior
  (mashlib intact).
- **lws-pod live pins:** the existing mashlib pin (`tests/lws-conneg.test.mjs:211`) is
  re-derived — under `--lws` on the rig, browser Accept now yields navigator/face output, and
  the no-`--lws` mashlib behavior stays pinned in the fork suite.
- **Live gate** — new `make test-viewer` against the fork-tls rig, seeded via the
  `make test-wiki` pipeline: card/index/viz faces 200 `text/html`; bare-name browser-Accept →
  rendered card; `/id/a` browser 303 chain ends in rendered HTML; navigator container view on
  an unbound container; root view; anon leak checks (above); viz's `graph.jsonld` fetch works
  anon on the public container.
- **Human verification (the round's acceptance):** in a real browser — start at the pod root,
  orient via the root view, descend into `/alice/wiki/` (lands on the wiki's index face),
  open a card, read the metadata block, follow a typed edge, open the graph view, follow a
  backlink; separately paste `https://pod.vardeman.me/id/<name>` and land on the rendered
  card. That is the "pod is human-usable" bar.

## 8. Retirement, docs, seeds

**Retired:** `app/` deleted wholesale (src, seed, test, vendor, README) — git history keeps
it; `make test-app` and its Makefile plumbing removed; FOLLOWUP records the supersession
(editor dropped → curator round; rendering moved server-side; navigator inversion). mashlib
retired from the rig config (flag remains functional upstream / non-`--lws`).

**Docs touched:** root `README.md` (layout + run instructions), `docs/ROADMAP.md`, FOLLOWUP
top block at round end; `docs/foundations/05-jss-spec-conformance.md` if the dispatch rule
warrants a §.

**Seeds recorded, not built** (detail in `docs/design-notes/lws-navigator.md` §4):
- **Type-first navigation** — "pod as typed collections" over the `.lwstypes` type search.
- **Browser login** — cookie session, or free with the Apps rung.
- **Memory-inspection views** — row-per-memory lifecycle list, pinned-vs-archival plane
  split, provenance timeline from `.lwsprov`; design them WITH the curator round.
- **MCP-Apps `ui://` rung** — the self-contained viewer doubles as the Apps template.
- **shacl-form / W3C SHACL 1.2 UI** — shapes-driven generic-face upgrade.
- **PodOS elements** as progressive enhancement on server-rendered pages.
- **Curator skill = the next round** — its own brainstorm: rules, worklist sources,
  enrichment, adjudication flow, git-diff channel over the pod's `--git` versioning.
- **Embedded-snapshot viz** for offline sharing (v1 live-fetches only).

## 9. Non-goals (this round)

No editor. No curator. No MCP surface changes. No browser login. No new `projection/prof/`
mechanism. No type-first view. No client framework or build step anywhere. No mashlib changes
outside `--lws`. No wm:/Semantic-Markdown revival — the wm: model retires with the SPA; the
llm-wiki family is the data model, defined by its profile, rendered as-is.
