# wiki-memory app

A static Solid/LWS **curation console**: a human browses agent-written knowledge cards, traverses
their typed graph across containers, and corrects them through the SHACL admission floor (the 422
`sh:message` is the teaching channel). Vanilla custom elements, no build step, no runtime CDN — the
runtime deps are vendored as static files.

See the design (`docs/superpowers/specs/2026-06-22-wiki-memory-app-design.md`) and plan
(`docs/superpowers/plans/2026-06-22-wiki-memory-app.md`) — including the recorded deviations.

## Modules

- `src/pod.js` — data-access core (auth + CRUD); the only module that talks to the pod/proxy. The
  session (pod URL, bearer, proxy URL, WebID) is **persisted to `localStorage`**, so a reload keeps
  you logged in (`setSession`/`getSession`/`clearSession`).
- `src/parse.js` — frontmatter split, Semantic-Markdown body render (strips the `{…}` RDF
  annotations), and OKF `index.md` parse.
- `src/graph.js` — N3 over explicitly-derived container `graph.ttl` sources. `worklist`,
  `neighborhood`, and `backlinks`. Traversal is **generic**: any predicate that isn't a describing
  one (`rdf:type`, `skos:prefLabel`, `dcterms:title/description`, …) is a navigable edge, labelled by
  its localname — so the graph lights up for *any* profile, not just the wiki-memory vocabulary.
- `src/esc.js` — one shared quote-safe HTML escape used by every component that builds markup.
- `src/components/` — `wm-login`, `wm-app` (shell + routing), `wm-index`, `wm-card`, `wm-editor`,
  `wm-graph`.

## Navigation & session

- **Hash routing.** The URL hash is the source of truth (`#container=<url>`, `#card=<url>`,
  `#edit=<url>`), so the browser **Back/Forward buttons work** and any view is deep-linkable. A
  "Concepts" home link and "log out" sit in the header.
- **Persistence.** A restored session skips the login screen; "log out" clears it.
- **In-app links.** Clicking a wikilink in a card body, or an entry in the Relates/Backlinks panel,
  opens that card *in the app* (no raw browser navigation).
- **Two graph panels on each card.** *Relates* shows the card's outgoing typed edges; *Backlinks*
  shows incoming ones. `wm-graph` renders the same neighborhood with Cytoscape.

## Run it (dev)

The app is plain static files; serve `app/` with any static server and point it at a running pod.
The SHACL admission floor is fork-native (L3) since 2026-06-30 — the standalone `constrained-container/`
proxy is retired; console e2e returns once the console targets the fork pod (FOLLOWUP carryover).

```bash
# 1. Pod (JSS, must run with --idp --conneg — the repo's `make up` does):
make up                                    # http://localhost:3838

# 2. Seed demo content (creates /alice/concepts/ + /alice/implementations/, projects them):
node app/seed/seed.mjs

# 3. Serve the app:
cd app && python3 -m http.server 5173      # http://localhost:5173
```

Open `http://localhost:5173/`, log in (pod `http://localhost:3838`, `alice@example.com` /
`alicepassword123`).

- Deps (`marked`, `js-yaml`, `n3`, `cytoscape`) are **vendored** in `vendor/` and served as static
  files via the import map in `index.html` — no bundler, and no runtime dependency on any CDN. See
  `vendor/README.md` for provenance and the re-vendor recipe.
- The pod must run with `--idp` (headless `POST /idp/credentials` bearer) and `--conneg`.

## Content lives in the user's pod space

Content is under the authenticated user's space — `/alice/concepts/`, `/alice/implementations/` —
not server-root `/concepts/`. The JSS pod's root container is read-only for all agents (alice writes
only under `/alice/`), matching Solid's per-user storage model. `wm-app` derives the content base
from the login WebID (`…/alice/profile/card.jsonld#me` → base `…/alice/`).

Cards are typed: **Concepts** (`/alice/concepts/`) and **Implementations** (`/alice/implementations/`,
typed `wm:Implementation` — what a concept's `wm:implementedBy` points at). The derived `index.md`
groups entries into a section per type ("Concepts", "Implementations").

`/alice/concepts/` is a **constrained container**: the seed PUTs the `wm:ConceptWiringShape`
(`projection/profiles/wiki-memory/shapes.ttl`) as `shape.ttl` and a `.meta` declaring
`ldp:constrainedBy`, so a Concept card written through the proxy without `wm:implementedBy` is
rejected 422. `hierarchical-retrieval` is seeded **direct to the pod** (bypassing the proxy) so it
lands ungoverned on the worklist — the demo is correcting it through the proxy until the floor goes
green.

Derived `index.md` + `graph.ttl` are not auto-generated; the seed runs the projection CLI
(`projection/triggers/cli.mjs`) per container. (A live CDC watcher is `projection/triggers/notifications.mjs`.)

## Browsing any OKF bundle

Because cards are just frontmatter + markdown and `index.md` uses the OKF `* [Title](href) - desc`
convention, the app renders **any [OKF](https://github.com/GoogleCloudPlatform/knowledge-catalog/tree/main/okf)
bundle** — upload its directory tree as LDP containers under `/alice/<bundle>/` and deep-link
`#container=…/alice/<bundle>/`. Base OKF bundles carry prose + `resource`/`tags` but no typed edges,
so the Relates/Backlinks/graph stay empty until edges are added. Synthesizing typed edges
(e.g. `wm:partOf` / `wm:derivedFrom`) into per-container `graph.ttl` lights the graph up via the
generic traversal above — demonstrated with Google's GA4 e-commerce bundle (dataset → table →
metrics lineage).

## Tests

```bash
make test-app        # unit (jsdom/node), e2e excluded — no pod needed
```

`make test-app-e2e` is retired with the proxy; console e2e returns once the console targets the
fork pod (FOLLOWUP carryover).

`test/browser-safe.test.mjs` guards two browser-only hazards the node suite can't see: no top-level
`node:` imports in browser modules, and no N3 `Store.match()` in `graph.js` (it throws in the
browser build — `graph.js` uses `getPredicates`/`getObjects`/`getSubjects` instead).

## Installing into the pod (deferred)

`jss install` is **blocked on this pod** (see `docs/superpowers/findings/2026-06-22-jss-install-spike.md`):
it (and the documented manual git dual-push fallback) push to `/public/apps/<name>/` at the server
root, which the root ACL leaves unwritable for every agent (403). In-pod hosting therefore requires
either granting write at the target (edit the host-mounted `data/.acl`) or pushing the static tree
into the user's writable space (`/alice/apps/wiki-memory/`) and serving from there. For v1, dev-serve
(above) is the supported path; in-pod install is deferred.

## Known limitations

- `graph.js` reads `graph.ttl` with an unauthenticated `fetch`, so the graph view/worklist needs the
  content **publicly readable** (the seed grants `/alice/` public-read via `acl:default`). Authenticated
  reads for private pods are a follow-up (attach the session bearer in `loadStore`).
- **Backlinks** are resolved from the card's own container `graph.ttl`, so backlinks show only when the
  incoming edge lives in (or is materialized into) that container — concept→concept backlinks within
  `/alice/concepts/` work; a card pointed at from another container shows none unless an inverse edge is
  materialized next to it. Cross-container backlinks need a global index or such materialization.
- Comunica link-traversal (the original design's graph engine) is deferred to the Phase-2 agent layer;
  v1 uses N3 over explicitly-derived sources (`@comunica/query-sparql-link-traversal@0.8.0` is broken
  in Node ESM). See the design's deviation notes.
