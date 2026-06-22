# wiki-memory app

A static Solid/LWS **curation console**: a human browses agent-written concept cards, traverses
their typed graph across containers, and corrects them through the SHACL admission floor (the 422
`sh:message` is the teaching channel). Vanilla custom elements, no build step; heavy deps load from
esm.sh at runtime.

See the design (`docs/superpowers/specs/2026-06-22-wiki-memory-app-design.md`) and plan
(`docs/superpowers/plans/2026-06-22-wiki-memory-app.md`) — including the recorded deviations.

## Components

- `src/pod.js` — data-access core (auth + CRUD); the only module that talks to the pod/proxy.
- `src/parse.js` — frontmatter, Semantic-Markdown body render, OKF `index.md` parse.
- `src/graph.js` — N3 over explicitly-derived container `graph.ttl` sources (worklist + neighborhood).
- `src/components/` — `wm-login`, `wm-index`, `wm-card`, `wm-editor`, `wm-graph`, `wm-app` (shell + routing).

## Run it (dev — the v1 path)

The app is plain static files; serve `app/` with any static server and point it at a running pod +
SHACL proxy.

```bash
# 1. Pod (JSS, must run with --idp --conneg — the repo's `make up` does):
make up                                    # http://localhost:3838

# 2. SHACL admission proxy with CORS (the browser write path):
cd constrained-container && PORT=8080 UPSTREAM=http://localhost:3838 node proxy.js

# 3. Seed demo content (creates /alice/concepts/ + /alice/implementations/, projects them):
node app/seed/seed.mjs

# 4. Serve the app:
cd app && python3 -m http.server 5173      # http://localhost:5173
```

Open `http://localhost:5173/`, log in (pod `http://localhost:3838`, proxy `http://localhost:8080`,
`alice@example.com` / `alicepassword123`).

- Deps (`marked`, `js-yaml`, `n3`, `cytoscape`) load from esm.sh via the import map in `index.html` —
  no bundler.
- The pod must run with `--idp` (headless `POST /idp/credentials` bearer) and `--conneg`.
- The proxy must send CORS (it does — it exposes `link`/`warning` so the browser can read the 422
  `constrainedBy` Link and advisory Warning).

## Content lives in the user's pod space

Content is under the authenticated user's space — `/alice/concepts/`, `/alice/implementations/` —
not server-root `/concepts/`. The JSS pod's root container is read-only for all agents (alice writes
only under `/alice/`), matching Solid's per-user storage model. `wm-app` derives the content base
from the login WebID (`…/alice/profile/card.jsonld#me` → base `…/alice/`).

`/alice/concepts/` is a **constrained container**: the seed PUTs the `wm:ConceptWiringShape`
(`projection/profiles/wiki-memory/shapes.ttl`) as `shape.ttl` and a `.meta` declaring
`ldp:constrainedBy`, so a Concept card written through the proxy without `wm:implementedBy` is
rejected 422. `hierarchical-retrieval` is seeded **direct to the pod** (bypassing the proxy) so it
lands ungoverned on the worklist — the demo is correcting it through the proxy until the floor goes
green.

Derived `index.md` + `graph.ttl` are not auto-generated; the seed runs the projection CLI
(`projection/triggers/cli.mjs`) per container. (A live CDC watcher is `projection/triggers/notifications.mjs`.)

## Tests

```bash
make test-app        # unit (jsdom/node), e2e excluded — no pod needed
make test-app-e2e    # e2e against a running, seeded pod + proxy
```

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
- Comunica link-traversal (the original design's graph engine) is deferred to the Phase-2 agent layer;
  v1 uses N3 over explicitly-derived sources (`@comunica/query-sparql-link-traversal@0.8.0` is broken
  in Node ESM). See the design's deviation notes.
- **Backlinks** are resolved from the card's own container `graph.ttl`, so concept→concept backlinks
  (all in `/alice/concepts/`) show correctly, but a card whose incoming edges live in another container
  (e.g. an implementation pointed at by concepts) shows none. Cross-container backlinks need either a
  global index or inverse-edge materialization into the target's container — a follow-up.
- N3's `Store.match()` throws in the esm.sh browser build; `graph.js` uses `getObjects`/`getSubjects`
  instead, guarded by `test/browser-safe.test.mjs`.
