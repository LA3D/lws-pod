# OKF projection app — design (P3)

Status: design approved 2026-06-21. Supersedes the framing in
`docs/wiki-memory-dual-projection.md` (which described two fixed outputs); this design
generalizes that to a channel-driven projection engine and an OKF/LWS-grounded profile seam.

P3 of Phase 0. Builds on P1 (Keycloak auth-plane) and P2 (admission proxy + HTTP ACL
provisioning, `constrained-container/`). See `FOLLOWUP.md` → "Next session — P3".

---

## 1. Problem

On each concept-card write, derived views must regenerate from the cards (the source of truth):
a navigation surface for browsing agents and an RDF query surface for Comunica + the SHACL floor.
JSS has no in-process write hook (no plugin API — docs-confirmed), so this runs as a **sidecar**,
and it must interact with the pod as a **Linked Web Storage application** — authenticated HTTP
CRUD over the LWS/Solid protocol (LDP membership, conneg, WAC), never the `./data` bind-mount.

The existing `render/generate.js` is a filesystem prototype (`readdirSync` cards → `writeFileSync`
HTML). It is retired by this work; it never speaks to the pod and is the anti-pattern this design
exists to replace.

## 2. Principles

1. **Source of truth = the cards.** Every derived surface rebuilds from the member concept docs;
   nothing downstream is hand-authored.
2. **HTTP-native LWS application.** All pod contact is authenticated `fetch` against the LWS/Solid
   protocol. Membership comes from the **container representation** (`items` / `ldp:contains`),
   never from filesystem paths (LWS: "clients SHOULD NOT assume URI structure reflects
   containment").
3. **Generic OKF substrate, application as a layer on top.** OKF v0.1 deliberately defines no
   bundle/application types — type is per-concept, producer-defined, and consumers must be
   permissive. So the generic layer stays pure OKF (type-agnostic); wiki-memory is *our* layer
   above it.
4. **Progressive disclosure is multi-channel.** A derived view is a *disclosure channel* tuned to
   a consumer + disclosure pattern. `index.md` (navigation) and `.graph` (query) are the first two;
   richer applications declare more channels. Channel multiplicity is the extensibility mechanism.
5. **Pure libraries vs. the app.** Parsing/rendering/extraction are pure, I/O-free, unit-testable
   libraries. "The LWS application" is the engine that does auth + CRUD and calls them.

## 3. Architecture

Three layers. The engine never names `skos`/`wm`; those live only in the wiki-memory profile.

### 3.1 Layer A — generic OKF (pure libraries)

- **`okf/frontmatter`** — parse YAML frontmatter (`type` required per §9 conformance; `title`,
  `description`, `resource`, `tags`, `timestamp`, plus arbitrary extension keys preserved). Pure.
- **`okf/index`** — render an OKF `index.md` from a container's members: a `# Subdirectories`
  section linking child containers and a concept section listing child docs as
  `* [Title](url) - description`, descriptions drawn from each card's frontmatter. Handles the
  nested shape seen in the GA4 reference bundle. No frontmatter in the output (OKF §6). Pure.

These are type-agnostic: they work for a GA4-style catalog bundle or a wiki-memory bundle alike.

### 3.2 Layer B — the projection engine (the LWS application)

`project(containerUrl, auth, profile)`:

1. GET the container representation; read members from `items` / `ldp:contains`. Follow LWS
   pagination (`ContainerPage` `first`/`next`/`prev`/`last`) — full re-projection per container
   now; incremental is future work.
2. Partition members into child containers, concept docs, and **reserved names**
   (`index.md`, `log.md`, `.graph`, `.acl`, `.meta`) — reserved names are skipped as projection
   input so a derived view is never re-ingested as a concept.
3. GET each concept doc over HTTP with conneg (`Accept: text/markdown`).
4. For each channel the profile declares, run `channel.render(cards, members)` → bytes.
5. PUT each channel output to its target as an authenticated LWS create/update.

All pod I/O is authenticated `fetch`. Reuses the P2 auth approach (locally the proven RS256
bearer; a proper app/agent identity via LWS-CID/did:key is the P4 public-deploy concern — see
`FOLLOWUP.md` open-item 1).

A **channel** is `{ name, mediaType, target(containerUrl), render(cards, members) → string }`.
The engine is channel-driven: it has no hardcoded knowledge of `index.md` or `.graph`.

### 3.3 Layer C — the wiki-memory profile (first and only profile built now)

```
{ application: 'wiki-memory',
  types:    ['Concept'],
  channels: [ indexChannel,          // Layer A okf/index — the navigation channel
              graphChannel ],        // uses extractCard — the query channel
  floorShape: wmConceptWiringShape } // SHACL; shared into the P2 proxy
```

- **`extractCard(markdown, cardUrl) → quads[]`** — the load-bearing library. Parses frontmatter
  + the Semantic-Markdown subset the cards actually use:
  - `{=<#it> .skos:Concept}` — block hint: sets the card's subject IRI (`<cardUrl#it>`) and type.
  - `[label]{skos:prefLabel}` — span property → literal object.
  - `[text](url){predicate}` — link with a hint → typed edge whose object is the target IRI
    (resolved against `cardUrl`; dangling targets are allowed — not-yet-written knowledge).

  Pure, no I/O. **Deliberately scoped to this subset** — the full SemMD spec's other scopes
  (block-tree, sibling, cluster, indented-list-as-JSON-LD, link-definition, prefix declarations)
  are out of scope until a card needs them (YAGNI). CURIE prefixes (`skos:`, `wm:`) resolved from
  a fixed prefix map in the profile.

- **`graphChannel`** — `render` = union every card's `extractCard` quads → serialize Turtle →
  PUT `<container>.graph`.

- **`wmConceptWiringShape`** — the SHACL node shape (`sh:targetClass skos:Concept`,
  `sh:property [ sh:path wm:implementedBy ; sh:minCount 1 ; sh:nodeKind sh:IRI ]`) with the laden
  `sh:message`. Per-node — needs only one card's own triples, not the aggregate.

A GA4-style catalog profile (not built) would be `{ types:['BigQuery Table',…],
channels:[indexChannel], floorShape:null }` — same engine, same `okf/index`, no extraction, no
floor.

## 4. The four decisions

| # | Decision | Choice | Rationale |
|---|---|---|---|
| 1 | **Trigger** | Notifications-driven (CDC), engine decoupled, plus a CLI trigger for tests/backfill | Design-doc intent ("rides resourceEvents"); LWS-native; bypass-safe (catches MCP + direct writes, not only proxied ones); decouples projection from write latency. This is the P5 write-funnel answer. |
| 2 | **Channel scope** | `index.md` + `.graph` | Unblocks agent navigation + Comunica + the floor. `<card>.html` / `viz.html` reading-experience renders deferred to Phase-1 app work. |
| 3 | **Floor location** | Synchronous in the P2 proxy; proxy runs `extractCard` on the markdown body before SHACL | `wmConceptWiringShape` is per-node (needs one card), so synchronous per-card validation is correct and keeps the **422 teaching channel**. The card body is Semantic-Markdown, not Turtle — so the floor must extract first, which is why `extractCard` is a **shared library** used by both the proxy (floor) and the engine (`.graph` channel). Aggregate-`.graph` validation deferred until a genuinely cross-card constraint exists. |
| 4 | **git-commit** | Rely on JSS `--git` auto-checkout | PUTs land as git-tracked resources; no separate commit step. |

### 4.1 Trigger detail (notifications)

JSS ships `solid-0.1`: one WebSocket per server (`Updates-Via` header → `ws://…/.notifications`),
`sub <container-url>`, receive `pub <url>` on any child create/update/delete. Auth (ACL `Read`)
checked at subscribe time. No protocol dedup — rapid writes produce one frame each, so the
subscriber **debounces** per container before calling `project()`. Reconnect with backoff +
re-subscribe (no resume token).

The CLI trigger (`project <container>`) drives the same `project()` for the Vitest gate and for
backfill/initial projection.

### 4.2 Consistency model

Floor = synchronous gate (proxy, per write). Projection = eventually-consistent derive
(notifications, post-write, debounced). For a memory pod, a SPARQL read landing milliseconds
before the `.graph` refresh is acceptable.

## 5. LWS sanity check

Examined against the LWS 1.0 container model even though we are not building LWS-native
representations yet. Conclusions — respect these now so an LWS-native step later is additive:

1. **Membership from the representation, not paths.** LWS containment is `items` + `rel="up"`
   metadata; URI structure need not reflect it. The engine reads members from the listing
   (already specified). OKF's path-relative links stay a content-layer convention that aligns on
   JSS (git/fs-backed) but is not depended on for membership.
2. **`index.md` is a disclosure channel, not redundant with `items`.** `items` is mechanical
   membership (ids/types/sizes, no descriptions). `index.md` is the *semantic progressive-
   disclosure* projection (titles + curated descriptions + groupings) tuned for a browsing agent.
   They sit at different layers and coexist; `items` stays the authoritative membership.
3. **`.graph` is an application convention, not an LWS metadata slot.** LWS defines no per-
   container metadata facility beyond the representation + ACL + (on JSS) `.meta`/`constrainedBy`.
   `.graph` is our DataResource at `<container>.graph` by naming convention. Build the path
   convention now; the LWS-native evolution is to advertise each channel via a `Link` rel from the
   container (as the P2 proxy already advertises `constrainedBy`) so a client *discovers* the
   disclosure surfaces. The design must not depend on path-guessing in a way that blocks
   Link-discovery later.
4. **Container types — the profile selector has a dual.** "Which application is this container?"
   has two registries for the same fact: the OKF way (an `okf_application` extension key in the
   root `index.md` frontmatter — the only place OKF permits index frontmatter, alongside
   `okf_version`) and the LWS-native way (a user-defined container **type URI** in the container
   representation, which LWS explicitly allows: `type: ["Container", "…#ConceptContainer"]`). The
   engine reads the selector as "the container's declared type," realized today via the OKF
   frontmatter key and evolvable to the LWS container-type URI with no logic change. **Absent any
   selector, the engine defaults to generic OKF behavior** (the `index.md` channel only, no
   extraction, no floor).
5. **Convergence:** `ldp:constrainedBy` already makes a *typed (constrained) container*. The
   wiki-memory concepts container is a constrained container. So the profile ≡ {container-type
   marker, its SHACL shape, its channel set} — the profile and the constrained-container are the
   same concept at two layers, confirming the seam.

## 6. Components & files (proposed)

A standalone package (sibling to `constrained-container/`), Node ESM, Vitest — matching repo
convention.

```
projection/
├── okf/
│   ├── frontmatter.mjs      # Layer A — parse (pure)
│   └── index-channel.mjs    # Layer A — index.md render (pure)
├── profiles/
│   └── wiki-memory/
│       ├── extract.mjs      # extractCard: SemMD → quads (pure, load-bearing)
│       ├── graph-channel.mjs# .graph render via extract (pure)
│       └── shape.mjs        # wmConceptWiringShape (the floor shape)
├── engine.mjs               # project(containerUrl, auth, profile) — the LWS app (I/O)
├── triggers/
│   ├── cli.mjs              # project <container> — tests/backfill
│   └── notifications.mjs    # solid-0.1 subscriber → debounce → project()
└── projection.test.mjs      # unit (extract/index/graph) + e2e (live local pod)
```

The P2 proxy (`constrained-container/proxy.js`) gains: import `extractCard` + `wmConceptWiringShape`;
when a constrained container receives a markdown-bodied write, extract → SHACL-validate the
extracted triples (today it parses the body as Turtle, which a card body is not).

## 7. Testing

- **Unit (pure):** `extractCard` against the three example cards in
  `docs/wiki-memory-dual-projection.md` (resolving-target, dangling-target, no-edge); `okf/index`
  against a fixture with sub-containers + concepts; `graphChannel` Turtle output; the shape's
  pass/pass/422 verdicts.
- **e2e (live local pod, `make up`):** CLI `project` a seeded concepts container → assert
  `.graph` and `index.md` appear via authenticated GET and have expected triples/entries;
  notifications path: write a card, assert the channels refresh after debounce; floor: a card
  with no `implementedBy` PUT through the proxy → 422 with the laden message.
- Wire into `make test` (the Vitest gate).

## 8. Out of scope (named, not silently dropped)

- `<card>.html` / `viz.html` reading-experience renders (Phase-1 app work).
- Aggregate-`.graph` SHACL validation (only when a cross-card constraint appears).
- Incremental projection (full re-projection per container for now).
- Link-rel channel discovery and LWS-native container-type URIs (path/frontmatter conventions
  now; both are additive later).
- A proper app/agent identity (LWS-CID/did:key) — local rung uses the RS256 bearer; public
  identity is P4 / open-item 1.
- A second profile (GA4-style catalog) — the seam is proven by structure, not by building two.

## 9. References

- `docs/wiki-memory-dual-projection.md` — the originating dual-projection sketch + the 3 example
  cards + the SHACL shape.
- `docs/foundations/04-comunica-patterns.md` — `.graph`-as-single-source query (verified on JSS).
- `constrained-container/` (P2) — the proxy + HTTP ACL provisioning this extends.
- Skills (ground truth): `okf` (§6 index, §9 conformance, §11 root frontmatter),
  `semantic-markdown` (annotation subset), `lws-protocol` (container model, `items`, pagination,
  container type URIs), `jss-server` (websocket-notifications, ldp-crud, git-integration),
  `shacl-constraints`, `comunica-sparql`.
</content>
</invoke>
