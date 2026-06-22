# Wiki-memory app — design (Phase 1)

Status: design approved 2026-06-22.

The client half of the wiki-memory system (`docs/ROADMAP.md` §"two halves"): an installable
Solid/LWS app that lets a human **curate** agent-written memory. Builds on the projection engine
(P3, `projection/`), the SHACL admission floor (P2, `constrained-container/`), and the credentials
→ bearer auth proven on the local rung. The server-side LWS storage enrichment (Type Index /
`lws+json`) is Phase 2 and out of scope here.

---

## 1. Problem

Agents author concept cards into a pod through the SHACL floor; projection regenerates `index.md`
and `.graph` on write. There is no human surface over that memory. The human use case is **not
authoring** — it is **review, sanity-check, and correction** of what the agents wrote (the curator
opens a card the way one opens a generated spec in VS Code: read it, catch what's wrong, fix it).
Write volume is the agents'; the human is low-volume and correction-shaped.

JSS's built-in surfaces don't cover this. `--mashlib-cdn` renders RDF as a *data browser* (triples,
not documents); it shows a card's triples, not its prose as a readable page (decided 2026-06-20,
`docs/wiki-memory-dual-projection.md`). The curation experience is ours to build.

## 2. Principles

1. **Curation console, not an authoring tool.** v1 optimizes the loop: browse what agents wrote →
   see the typed graph → spot what's wrong → correct it in place → watch the floor re-validate.
2. **The structure is a graph, the hierarchy is a navigation overlay.** Containers + `index.md`
   give bounded-branching progressive disclosure for *orientation* (route in, VAULT-INDEX style).
   Typed edges are the real structure and **cross container boundaries** — relationships are
   resolved by graph traversal, not by the container tree.
3. **One client render path.** Because corrections happen in the app (tight view→edit→save loop)
   the app renders cards client-side; we do not also build static HTML projection channels for v1
   (they remain a deferred additive). `.graph` stays the shared data surface — the app's graph view
   reads it; agents will query it through the Phase-2 search/agent layer.
4. **Static, no-build, small.** Vanilla custom elements, runtime ESM/CDN deps, no bundler — it must
   fit the `jss install` 10 MB body limit and be served as plain static resources.
5. **The floor is the curation instrument.** The SHACL 422 `sh:message` is the teaching channel;
   the editor surfaces it verbatim. "Concepts with no implementation" (the floor's rule) is the
   curator's worklist.

## 3. Architecture

A static client app installed at `/public/apps/wiki-memory/`. Vanilla custom elements over one
shared data-access module; Comunica (loaded at runtime) resolves the graph across containers.

```
<wm-app>  shell · hash routing (#/concepts, #/concepts/<id>) · holds session
  ├── <wm-login>    credentials → bearer (stored)            ── auth
  ├── <wm-index>    renders ONE container's index.md          ── navigation (progressive disclosure)
  │                 cards + child-container drill-downs; flags >12 children
  ├── <wm-card>     frontmatter → header · Sem-MD body → prose ── read
  │                 Relates/Implements panel from graph traversal · Edit toggle
  ├── <wm-editor>   raw markdown → Save → PUT through floor    ── correct
  │                 422 → inline sh:message · 2xx → re-validate + refresh
  └── <wm-graph>    scoped typed neighborhood (Comunica)       ── sanity-check
                    cross-container · dashed stubs · hub-avoid · click = navigate

pod.js  login() · podFetch() · getCard() · putCard() · getGraph() · listContainer()
graph.js  Comunica link-traversal over .graph sources (neighborhood + sanity queries)
```

The engine layers map to the two axes: `<wm-index>` is the **hierarchy/orientation** axis (one
bounded container at a time); `<wm-graph>` + the Relates panel are the **graph/relationship** axis
(typed edges traversed across containers).

## 4. Data model — graph over hierarchy

- **Hierarchy (orientation).** A bundle is a tree of LDP/LWS containers, each with its own derived
  `index.md` and `.graph`. `<wm-index>` renders one container's `index.md`: concept entries
  *and* child-container drill-downs (OKF §6 `* [Subdir](subdir/) - desc`). The root index is a
  router (sub-containers + counts), not a flat catalog — the VAULT-INDEX pattern. Bounded branching
  (≤12 direct children, the Fano bound) is the guardrail; a container exceeding it is flagged as a
  refactor signal (mirrors the vault `/audit` Check F).
- **Graph (relationships).** Edge targets are pod-absolute IRIs (`</implementations/index-view#it>`)
  whose path encodes their container. The graph view and Relates panel **traverse these across
  containers** via Comunica link-traversal: a container's `.graph` is the seed; traversal follows
  typed edges into the target containers' `.graph`, bounded by hop-count + hub-avoidance (the vault
  Retrieval Expansion Protocol — expand ≤N, skip hubs >12). Never the global pod graph at once.
- **Dangling targets are valid.** A `wm:implementedBy` to a not-yet-written card renders as a dashed
  stub node (OKF "not-yet-written knowledge"); the floor permits it (`nodeKind IRI`, no target
  resolution). Missing the *edge entirely* is the violation.

## 5. Data flow

- **Read.** `login()` → `GET <container>/index.md` → `<wm-index>` → select → `GET <id>.md` (raw) +
  graph traversal seeded at `<container>/.graph` → `<wm-card>` renders prose + a Relates/Implements
  panel with resolved (labeled) cross-container targets.
- **Graph / sanity.** Comunica over `.graph` sources: the scoped neighborhood for `<wm-graph>`, and
  the worklist query `?c a skos:Concept . FILTER NOT EXISTS { ?c wm:implementedBy ?i }` →
  to-correct queue; clicking an item jumps into its edit.
- **Correct.** `<wm-card>` Edit → `<wm-editor>` raw markdown → Save → `PUT` **through the SHACL
  proxy** → on 422 show `sh:message` inline; on 2xx re-`GET` card + re-traverse graph, re-render,
  show floor now green.

## 6. Auth

Credentials → bearer (the proven local-rung flow, geoff-solid-auth's shape): `<wm-login>` POSTs
pod URL + user/password to `<pod>/idp/credentials`, stores the bearer (localStorage), and `podFetch`
attaches it. Requires the pod run with `--idp` and `--conneg`. Solid-OIDC / lws-keycloak (P1) and
agent identity (LWS-CID) are later; the bearer is the v1 human credential.

## 7. Write target

The editor PUTs through the **`constrained-container` SHACL proxy**, not JSS directly, so the
curator gets the synchronous floor verdict (the 422 teaching message) at save time — the whole point
of a correction tool. This requires **CORS on the proxy** for the browser origin (a v1 task).
Direct-to-JSS still works (projection catches it via the notifications CDC, P5) but loses the
immediate verdict, so it is a fallback, not the default.

## 8. Dependencies (load at runtime, not bundled)

`marked` (markdown → HTML), `js-yaml` (frontmatter), `N3` (Turtle parse), `cytoscape` (graph),
`@comunica/query-sparql-link-traversal` (cross-container traversal). Comunica's browser build is
heavy against the 10 MB install limit, so deps load from CDN/ESM at runtime; the installed app is
HTML + our small modules.

## 9. Projection dependency

The index channel must emit **child-container drill-down entries** (not only local cards) so
`<wm-index>` can route hierarchically. Confirm or add this to `projection/okf/index-channel.mjs`.
No other engine change: per-container `index.md` + `.graph` already exist (P3).

## 10. Seed / demo content

A `/concepts/` (and `/implementations/`) container seeded with the dual-projection examples —
`progressive-disclosure`, `hierarchical-retrieval`, `dual-layer-linking`, `index-view`,
`type-index`. `hierarchical-retrieval` intentionally lacks its implementation edge: it renders red
on the graph + appears on the worklist, and the demo is correcting it until the floor goes green.
Seeded via the projection CLI or the app (implementation detail).

## 11. Distribution

- **Spike first (gates everything):** verify `jss install` works on pinned **v0.0.209** — it is
  documented but listed OFF in the eval (`features/app-install.md`). First task in the plan.
- **Dev:** serve the static app dir against the local http pod (:3838).
- **Ship:** `jss install <repo>` → `/public/apps/wiki-memory/` (dual-push, `updateInstead`).

## 12. Testing

Vitest gate `make test-app`, mirroring `projection/`'s harness:
- **Unit:** `pod.js` (auth/fetch/CRUD), frontmatter + markdown parsing, `graph.js` traversal +
  worklist query (against fixture `.graph` sources).
- **e2e (local pod):** login → GET index/card → graph traversal resolves a cross-container target →
  correction loop (PUT a card missing its edge → assert 422 + message → fix → assert 2xx → assert
  worklist/graph update).

## 13. Out of scope (sequenced, not dropped)

- **Phase-2 agent/search layer** — faceted search, the agent query surface (Comunica vs
  Oxigraph-WASM vs MCP manifest). Its own design conversation. v1 shares only the traversal engine.
- **Static `<card>.html` / `viz.html` channels** — deferred additive for shareable/agent-readable
  pages; consciously revises the 2026-06-20 "render as static channels" decision now that a client
  app exists.
- **Net-new-concept authoring wizard** — agents author; v1 is correction-shaped.
- **Solid-OIDC / LWS-CID agent identity in the app** — bearer is the v1 human credential.

## 14. Reuse posture (geoff)

Build our own; mine geoff (MIT) as reference, not a dependency. Its data model is build-time-SSG-
specific (`urn:geoff:*`, `mappings.toml`, N-Triples export) and mismatched to our live-pod OKF
model. Lift patterns only — chiefly `geoff-solid-auth`'s bearer/`_solidFetch`/event shape for
`<wm-login>`. The genuinely reusable machinery (Oxigraph-WASM search, faceted partitioning, the
`.well-known/mcp.json` agent manifest) belongs to the deferred Phase-2 agent layer, not v1.
