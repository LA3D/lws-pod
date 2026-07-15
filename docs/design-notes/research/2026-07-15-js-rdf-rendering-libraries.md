# Research report: JS/TS ecosystem for rendering linked data as HTML (2026-07-15)

> Subagent web-research report commissioned by the 2026-07-15 human-surface brainstorm
> (`docs/design-notes/lws-navigator.md` carries the synthesis). Verbatim as returned;
> versions/dates/licenses verified by the researching agent against npm + GitHub APIs.

---

## Synthesis — what deserves a closer look

1. **Zazuko Trifid `@zazuko/trifid-entity-renderer` v2.0.0 (Jun 2026)** is the closest existing implementation of exactly your pattern: it server-side-renders an RDF dataset to an HTML entity page **in Node, via `@lit-labs/ssr`**, rendering the `@zazuko/rdf-entity-webcomponent` (a lit component that turns an RDF/JS dataset into a readable table) to a string, wrapped in Handlebars page chrome from `trifid-core`. TypeScript, Apache-2.0, released monthly, usable as a Fastify plugin/library rather than a full server. Even if you don't adopt Trifid itself, the SSR-a-lit-component-over-a-dataset pattern (and the small MIT webcomponent, vendorable) maps directly onto your projection engine's "materialize an HTML face" step. Caveat: the webcomponent itself hasn't moved since Sep 2023 — it's stable-dormant, kept alive by the actively maintained SSR wrapper.

2. **`@ulb-darmstadt/shacl-form` v3.1.1 (released 2026-07-14, literally this week)** is the strongest SHACL-driven view/edit component: a plain HTML5 web component (no framework), MIT, that takes a shapes graph + data graph and renders either an editor or a **read-only view** (`data-view`), with a plugin system per datatype/predicate. Since your substrate already carries SHACL admission shapes, this is the natural candidate for the *self-contained single-file viewer* side — inline its dist bundle (no CDN) and feed it the shapes + JSON-LD already in the page. Browser-only; not a server-side renderer.

3. **`ro-crate-html-lite` (Language Research Technology, pushed 2026-07-15)** is the best architectural reference for the self-contained artifact: Node CLI, **nunjucks + markdown-it over a JSON-LD entity graph → one fully static `ro-crate-preview.html`, zero CDN, zero runtime JS**. It exists precisely because the older CDN-dependent `ro-crate-html-js` approach was rejected by its own community — independent validation of your no-CDN constraint. It's GPL-3.0, so borrow the pattern (it's ~4 small deps) rather than vendor the code, unless GPL is acceptable for internal tooling.

Worth tracking but not adopting: **LDO** (active, MIT, TS-native, but a data layer with only React hooks — no HTML generation story), and the **W3C SHACL 1.2 User Interfaces** Working Draft (Data Shapes WG), which signals that shapes-driven form/view generation is becoming a standards track — your PROF/SHACL substrate is well-positioned for it. Notable negative finding: "render JSON-LD as HTML" barely exists as a library category — the JSON-LD ecosystem points the other way (embedding JSON-LD *into* HTML for SEO), and nothing MCP/agent-era has emerged that renders graph data to HTML documents (the MCP-era tools are canvas/graph-viz or query surfaces).

---

## 1. Zazuko ecosystem

### Trifid (zazuko/trifid)
- **Org**: Zazuko GmbH. Monorepo, 15+ packages, pnpm + changesets.
- **What**: Lightweight Linked Data server/proxy — dereferences entities with conneg, HTML rendering, SPARQL proxy, YASGUI, Graph Explorer, SPEX plugins.
- **Rendering approach**: Fastify-based `trifid-core` with a built-in Handlebars template layer (layout/header/footer/partials, configurable styles/scripts); plugins render content into it. Server-side Node, TypeScript.
- **Library use**: Yes — runs standalone (`npx trifid`) *or* as a Node library; plugins are importable modules against `trifid-core`.
- **Maintenance**: Very active — `trifid`/`trifid-core` 6.0.1 published 2026-06-17; repo pushed 2026-07-10; 197 releases.
- **License**: Apache-2.0.
- **Verdict**: Best-in-class donor for server-side HTML face generation — take `@zazuko/trifid-entity-renderer` (or its pattern) without the server.

### @zazuko/trifid-entity-renderer
- **What**: The Trifid plugin that turns an RDF entity (fetched via SPARQL or handler) into an HTML page.
- **Rendering approach** (verified in `packages/entity-renderer/package.json` v2.0.0): **`@lit-labs/ssr` + `lit` render `@zazuko/rdf-entity-webcomponent` server-side to HTML**; Handlebars for the page template; `@zazuko/env` for RDF plumbing. Options: compact mode, technical cues, embed named nodes, custom templates/CSS.
- **Maintenance**: v2.0.0 published 2026-06-15 (TypeScript rewrite). **License**: Apache-2.0.
- **Verdict**: The proven Node-SSR-of-RDF-entities implementation; directly reusable or pattern-liftable into a projection engine.

### @zazuko/rdf-entity-webcomponent
- **What**: Web component rendering an RDF/JS dataset (or inline Turtle) as simple tabular entity views; display-priority terms, language prefs, compact/embed options.
- **Rendering approach**: lit web component; works browser-side *and* server-side via lit SSR (that's how Trifid uses it).
- **Maintenance**: Dormant — last release 0.7.7, 2023-09-18; repo unpushed since then. Not archived; consumed by the active entity-renderer. **License**: MIT (npm metadata; no LICENSE file surfaced in the repo API — verify before vendoring).
- **Verdict**: Small, MIT, vendorable core for both SSR faces and self-contained viewers; treat as frozen code you own.

### rdf-ext / @zazuko/env / @zazuko/env-node
- **What**: RDF/JS environment SDKs (data factory, datasets, parsers/serializers, clownface, fs utils). Plumbing, not rendering.
- **Maintenance**: rdf-ext 2.6.0 (2025-08-31); @zazuko/env 3.0.1 (2025-05-15); @zazuko/env-node 3.1.0 (2026-06-23). All MIT, maintained.
- **Verdict**: Healthy substrate deps if you adopt the Zazuko renderer stack; no rendering role of their own.

### zazuko/rdfjs-elements
- **What**: Web components: `rdf-editor` (CodeMirror RDF editing), `rdf-snippet` (serialization-switching viewer), `sparql-editor`, plus `formats-pretty`, `lit-helpers`.
- **Rendering approach**: lit web components, browser-side; shows *serializations*, not human-readable entity pages.
- **Maintenance**: Active — repo pushed 2026-06-16; `@rdfjs-elements/rdf-snippet` 0.4.5 (2024-11-25). **License**: MIT.
- **Verdict**: Useful garnish (a "view as Turtle/JSON-LD" widget on a face), not a renderer.

### CubeViewer (zazuko/cube-viewer)
- **What**: App + reusable component visualizing RDF data cubes (rdf-cube-schema) from SPARQL endpoints.
- **Rendering approach**: Vue 3 (77% Vue), buildable as a web component; browser-side, cube-specific tables/charts.
- **Maintenance**: pushed 2026-02-02; not on npm under an obvious name; no license file detected by the GitHub API.
- **Verdict**: Wrong shape — cube/statistics-specific, Vue build step, unclear license. Skip.

### SHACL in Zazuko orbit: shacl-engine, shacl-play, historical rdf2h
- Zazuko/bergos maintain `shacl-engine` (validation, used by shacl-form below) but no SHACL→HTML view generator of their own. The old `zazukoians/trifid-renderer-rdf2h` (Mustache/RDF2h) is abandoned pre-2020 — historical only.

## 2. LDO (Linked Data Objects)

- **Org**: o-development (Jackson Morgan). ldo.js.org.
- **What**: Shapes-to-TypeScript devtool — `@ldo/cli` compiles ShEx (ShEx-first; SHACL not the input language) into TS types + JSON-LD context; a Proxy lets you mutate an RDF/JS dataset as if it were a typed object literal. New `@ldo/connected` framework abstracts backends (Solid via `@ldo/connected-solid`, plus NextGraph support).
- **Rendering story**: **None.** UI layer is `@ldo/solid-react` hooks (`useResource`, `useSubject`) for client-side React; no HTML generation, no templates, no SSR story documented.
- **Maintenance**: Active — repo pushed 2026-07-09; `@ldo/ldo` 1.0.0-alpha.51 published 2026-05-10 (still alpha-versioned after 50+ alphas). **License**: MIT.
- **Verdict**: Complementary typed data access (and a Node-native, non-rdflib Solid client), but contributes nothing to HTML face generation; alpha versioning argues against pinning it into the substrate now.

## 3. Other RDF-to-HTML / linked-data UI libraries

### @ulb-darmstadt/shacl-form
- **Org**: ULB Darmstadt (university library).
- **What**: HTML5 web component to **edit and view** RDF data conforming to SHACL shapes; shapes graph in → form or read-only view out; RDF data out (editor mode). Themes (default/bootstrap/material), plugin system (e.g. Leaflet for `wktLiteral`), uses `shacl-engine` for validation.
- **Rendering approach**: Framework-free web component, browser-side; distributed bundles (deps are peer/bundled — jsonld, n3, shacl-engine); no server story.
- **Maintenance**: Very active — v3.1.1 published **2026-07-14**, repo pushed 2026-07-14/15. **License**: MIT.
- **Verdict**: Top candidate for the self-contained viewer arm: inline the bundle + your admission shapes + the card's JSON-LD into one file and get a shapes-driven read-only view for free.

### hypermedia-app/shaperone
- **Org**: Tomasz Pluskiewicz (hypermedia.app / Zazuko-adjacent).
- **What**: SHACL-driven form web components (`@hydrofoil/shaperone-wc` + core processor), DASH widget vocabulary, Hydra integration.
- **Rendering approach**: lit web components, browser-side; form/edit-centric (viewing is secondary).
- **Maintenance**: Winding down — last npm release 0.8.1 / core 0.12.1 on 2024-04-29; repo last pushed 2025-05-26. **License**: MIT.
- **Verdict**: Losing to shacl-form on momentum; only interesting for its DASH/SHACL-UI vocabulary alignment.

### shacl-vue (psychoinformatics-de)
- **What**: Auto-generates entry/edit/view UIs from SHACL, inspired by the W3C form-generation draft; Vue 3 + Vuetify + Vite app.
- **Maintenance**: npm 0.0.7 (2025-09-08), repo pushed 2026-01-15. **License**: MIT.
- **Verdict**: App-shaped, Vue build step, pre-0.1 — watch, don't adopt.

### the-qa-company/rdf-entity-viewer
- **What**: React/MUI component to visualize and expand RDF entities (Wikidata-style).
- **Maintenance**: 0.0.41, 2024-10-15; quiet since. **License**: MIT.
- **Verdict**: React+MUI dependency chain and browser-only — poor fit.

### ldkit (karelklima/ldkit)
- **What**: "Linked Data query toolkit for TypeScript" — schema-first typed access over SPARQL/RDF, Deno/Node. LDO's closest competitor; no UI/rendering.
- **Maintenance**: 2.7.1, 2026-05-20. **License**: MIT.
- **Verdict**: Data layer only; noted for completeness.

### @nanopub/display
- **What**: Web component rendering nanopublications for humans (Vemonet/KnowledgePixels orbit).
- **Maintenance**: 0.0.7, 2023-06-15 — dormant. **License**: MIT.
- **Verdict**: Niche and stale; only the "render a small named-graph bundle as HTML" idea is relevant.

### JSON-LD rendering components (category finding)
Searching this space returns SEO tooling (embed JSON-LD *in* pages — jsonld.js, Next.js guides) rather than renderers *of* JSON-LD. digitalbazaar's jsonld.js remains the processor; no maintained "JSON-LD document → HTML page" library exists on npm as of mid-2026. Your projection engine is filling a real gap.

## 4. RO-Crate preview tooling

### ro-crate-html-js / ro-crate-html (rochtml)
- **Org**: UTS eResearch / Arkisto Platform (Sefton et al.).
- **What**: Generates `ro-crate-preview.html` summarizing the crate's root Dataset and entities.
- **Architecture**: Embeds the full JSON-LD in a `<script>` in `<head>`, then **client-side JS renders the views dynamically — loaded from the unpkg CDN** (`ro-crate-dynamic.js`). Node CLI (`rochtml`), ejs + jquery + commonmark under the hood.
- **Maintenance**: `ro-crate-html-js` frozen at 1.4.19 (2021-11-24); renamed continuation `ro-crate-html` 0.1.6 (2025-05-02) — slow. **License**: GPL-3.0-or-later.
- **Verdict**: Its CDN dependence is exactly what you're avoiding; superseded within its own community by:

### ro-crate-html-lite
- **Org**: Language Research Technology (LDaCA).
- **What**: "Complete, completely static `ro-crate-preview.html` … without any dependence on online resources or JavaScript (except small helpers)."
- **Architecture**: Node CLI (`roc-html`); **nunjucks** template (`previewer-template.html`) precompiled with styling and helpers embedded; **markdown-it** for text; `ro-crate` lib for the entity graph. Output is a single self-contained file.
- **Maintenance**: Active — npm 0.0.8 (2026-05-27), repo pushed **2026-07-15**. **License**: GPL-3.0.
- **Verdict**: The reference architecture for your single-file viewer; GPL means pattern-borrow (the recipe is: entity graph → nunjucks partials per type → inline everything) or confine to internal tooling.

## 5. Newer (2025–2026) and the MCP/agent era

- **W3C SHACL 1.2 User Interfaces** (Data Shapes WG, Working Draft) — vocabulary + rendering model for generating forms/views from SHACL shapes (widget selection, labels, grouping, ordering). Plus the older RDF/JS Community Group **SHACL-UI** draft (Bergwinkl, 2023) extending DASH. This is the standards track your SHACL-carrying substrate should watch; shacl-form and shacl-vue both cite this lineage.
- **Ontosphere (ThHanke/ontosphere)** — browser-based RDF/ontology KG *editor* (canvas graph, OWL-RL reasoning), explicitly **AI-native via an MCP tool surface**; fully client-side. Pushed 2026-06-30, 156 stars, **no license declared (NOASSERTION)** — unusable until that's fixed, and it's graph-canvas visualization, not HTML document rendering.
- **MCP-era generally**: what has emerged is agent-facing *query/exploration* surfaces (RDF Explorer MCP, Mobi MCP, codebase-memory KGs), not human-facing HTML rendering of graph data. No library "born in the MCP era" for rendering knowledge to humans was found — the agent world renders to context windows, not to pages. The nearest activity is the SHACL-UI standards push and Zazuko's steady Trifid work.

## Fit summary (one line each)

| Candidate | Server-side Node HTML | Self-contained viewer | License | Alive (mid-2026) |
|---|---|---|---|---|
| Trifid entity-renderer (+ rdf-entity-webcomponent) | **Yes — lit SSR, proven** | Component vendorable | Apache-2.0 / MIT | Yes (Jun–Jul 2026) |
| shacl-form (ULB Darmstadt) | No | **Yes — inline bundle + shapes** | MIT | Yes (Jul 2026) |
| ro-crate-html-lite | Yes (nunjucks pipeline) | **Yes — that's its whole point** | GPL-3.0 | Yes (Jul 2026) |
| LDO | No rendering | No | MIT | Yes (alpha) |
| shaperone | No | Forms only | MIT | Fading (2024/25) |
| rdfjs-elements | No | Serialization widget only | MIT | Yes |
| rdf-entity-viewer / shacl-vue / CubeViewer | No | Framework-heavy | MIT / MIT / none | Mixed |
| ro-crate-html-js (rochtml) | Partial | **No — CDN-dependent** | GPL-3.0+ | Legacy |

## Sources

- https://github.com/zazuko/trifid (+ `packages/entity-renderer/package.json`, `packages/core/package.json` on raw.githubusercontent.com)
- https://zazuko.com/products/trifid/ · https://zazuko.com/community/open-source/
- https://github.com/zazuko/rdf-entity-webcomponent · https://github.com/zazuko/rdfjs-elements · https://github.com/zazuko/cube-viewer
- https://github.com/ULB-Darmstadt/shacl-form · https://ulb-darmstadt.github.io/shacl-form/
- https://github.com/hypermedia-app/shaperone · https://forms.hypermedia.app/
- https://github.com/o-development/ldo · https://ldo.js.org/latest/
- https://github.com/UTS-eResearch/ro-crate-html-js · https://github.com/Language-Research-Technology/ro-crate-html-lite
- https://www.researchobject.org/packaging_data_with_ro-crate/12-html-preview.html
- https://w3c.github.io/data-shapes/shacl12-ui/ · https://rdf.js.org/shacl-ui/
- https://github.com/psychoinformatics-de/shacl-vue · https://github.com/the-qa-company/rdf-entity-viewer · https://github.com/karelklima/ldkit · https://github.com/ThHanke/ontosphere
- https://github.com/rdf-ext/rdf-ext · https://rdfjs.dev/ldo
- npm registry API (registry.npmjs.org) for all version/date/license claims; GitHub API (api.github.com/repos) for pushed-at/archived/stars/license.
