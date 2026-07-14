# Console-on-fork rewire — scoping note

**Status:** pre-brainstorm grounding (2026-07-14). NOT a spec — this is the file:line-grounded
breakage map + work-areas + open questions the rewire round's `brainstorming` skill should start
from, so the next session doesn't re-explore. Exploratory per `docs/design-notes/` convention (not
canon). **Next step:** brainstorm → spec → plan → subagent implementation, as with every substantial
workstream.

**Why now.** The recorded fork seeds are drained (next-fork round, merge `32398c1`), so the
Chuck-approved order routes here next: making the pod **human-usable**. The curation console
(`app/`) is the human half of the wiki-memory system — but it was written against the pre-refactor
substrate and is now **broken against the live fork pod** on several independent axes. This is a real
round, not the "droppable one-line rider" earlier FOLLOWUPs called it.

---

## 0. What moved underneath the console (two rounds it never saw)

The console (`app/`, design `docs/superpowers/specs/2026-06-22-wiki-memory-app-design.md`) targets the
**old two-container + external-proxy** model. Two rounds rewrote the substrate under it:

- **conneg-by-profile Phase 2 (2026-07-10).** Projector tooling moved `projection/triggers/` →
  `apps/wiki-projector/triggers/`; the standalone `constrained-container/` proxy was **RETIRED** (SHACL
  admission is now fork-native, L3); the wiki family was re-derived onto the **llm-wiki profile** under a
  single **`/alice/wiki/`** container with per-card `.links.jsonld` + a `graph.jsonld` dataset aggregate;
  the floor now teaches **400** (not 422) and governs the **links** representation, not the markdown
  **content** ("content ungoverned, links governed").
- **fork-nextfork (2026-07-14, this round).** Sidecar authz (`.lwstypes`/`.lwsprov` writes → 405; `.meta`
  writes bind the subject ACL); PATCH → `applyLwsWrite` (shape-violating PATCH → 400); the write-consistency
  gate 400s an extension-less RDF write; bind confirmed `/alice/wiki/`.

The console knows none of this. It still targets a `:8080` proxy, `/alice/concepts/`, `graph.ttl`, and
expects 422.

---

## 1. The console as it stands (accurate architecture)

Static Solid/LWS **curation console** — a human browses agent-written cards, traverses their typed graph,
and corrects them. No build step, vanilla custom elements, deps vendored in `app/vendor/`, served static.

- `app/src/pod.js` — the ONLY module that talks to the pod (auth + LDP CRUD). Session (pod URL, bearer,
  **proxy URL**, WebID) persisted to `localStorage`. Writes go through `proxyUrl` if set, else direct.
- `app/src/graph.js` — N3-Turtle traversal over container `graph.ttl` (`worklist`/`neighborhood`/`backlinks`);
  traversal is generic (any non-describing predicate is a navigable edge).
- `app/src/parse.js` — frontmatter split + Semantic-Markdown body render + OKF `index.md` parse.
- `app/src/components/` — `wm-login`, `wm-app` (hash-routed shell), `wm-index`, `wm-card`, `wm-editor`, `wm-graph`.
- Auth: `POST {pod}/idp/credentials` (email/password) → bearer. Reads carry the bearer via `podFetch`
  **except graph reads, which are unauthenticated** (needs public-read).
- `app/seed/seed.mjs` — demo seeder (governed PUTs via proxy + one ungoverned direct PUT to seed the worklist).
- Tests: `make test-app` = unit only (`--exclude '**/e2e.test.mjs'`). `app/test/e2e.test.mjs` exists but is
  **orphaned** — no Makefile target since `test-app-e2e` was removed with the retired proxy.

---

## 2. The breakage map (verified file:line, 2026-07-14)

**App runtime (`app/src/`):**
- `pod.js:43-44` — writes go to the retired `:8080` proxy when `proxyUrl` is set → connection refused (nothing listens).
- `pod.js:39-41`, `graph.js:26-41`, `components/wm-card.js:19` — fetch **`graph.ttl`** with `Accept: text/turtle`; the
  fork's llm-wiki graph representation is **`graph.jsonld`** / `application/ld+json` (aggregated from `.links.jsonld`
  members). → 404 / wrong format → silently kills worklist, Relates, Backlinks, and `wm-graph`. (`index.md` and card
  `.md` GETs survive — okf-base default serves markdown.)
- `components/wm-login.js:7-8` — hardcoded `pod=http://localhost:3838`, `proxy=http://localhost:8080`.
- `components/wm-app.js:32,48,55` — hardcoded home container `…/alice/concepts/`.
- `components/wm-editor.js:19-21` — surfaces `r.message` on a **422** teaching channel; the fork teaches **400**.
- `graph.js:41` — unauthenticated graph fetch (public-read dependency); reads now hit conneg surfaces.

**Seed (`app/seed/seed.mjs`):**
- `:145` — dead `../../projection/triggers/cli.mjs` (VERIFIED gone; the real path is
  `apps/wiki-projector/triggers/cli.mjs`, VERIFIED exists) → the projection step throws.
- `:93-99` — PUTs `/alice/concepts/.meta` as `Content-Type: text/turtle` (extension-less RDF name) → the fork's
  **write-consistency gate 400s** it → the constrained-container demo silently degrades to ungoverned. (The
  sidecar-authz change alone does NOT block this — alice owns `/alice/`; it's the write-consistency gate.)
- `:102-114` `putViaProxy` + `:132,136-137` callers — PUT to the dead `:8080` proxy; the governed/ungoverned seed
  split is moot now that admission is fork-native.
- `:42-43,84,93-94,142` — hardcode `/alice/concepts/` + `/alice/implementations/`, not the corrected `/alice/wiki/`.

**E2e (`app/test/e2e.test.mjs`):**
- `:7,9,16` — assumes a `:8080` proxy; `:29,43` — asserts **422** on a no-`wm:implementedBy` card. Orphaned (no
  Makefile target).

**Docs (`app/README.md`):**
- `:40-41,73-78,80-81,100-101` — stale prose (proxy, 422 teaching, `projection/triggers` path, `graph.ttl`, retired e2e).

---

## 3. What the rewire must change (work-areas — NOT pre-decided design)

1. **Retarget the pod.** Point the console at a live `--lws --conneg --idp` **fork** pod (the `make up-fork-tls`
   rig at `https://pod.vardeman.me`, or a local `--lws` pod), container **`/alice/wiki/`** (VoID-consistent with
   pod-config `uriSpaces` `id/`→`/alice/wiki/`). Replace the hardcoded `/alice/concepts/` home.
2. **Drop the proxy concept.** Remove `proxyUrl` from `pod.js`/`wm-login.js`/the session; PUT direct to the pod —
   the fork enforces SHACL at L3. The `putViaProxy`/`putDirect` split in the seed collapses to direct writes.
3. **Graph representation.** Switch graph reads from `graph.ttl`/Turtle to the fork's derived
   `graph.jsonld`/`application/ld+json` (or negotiate it via `Accept-Profile` llm-wiki 303 → `.links.jsonld`), and
   give `graph.js` a JSON-LD-capable loader. Attach the bearer to graph reads (drop the public-read dependency).
4. **Teaching channel 422 → 400.** The admission floor now returns 400 problem+json (`sh:message` in the body).
   Update `wm-editor` + the e2e assertion. Recognize the **content-ungoverned / links-governed** split — the reject
   fires on the derived links representation, not the `.md` content PUT, so the UX narrative ("correct the card
   through the floor") needs re-grounding on what actually gets governed.
5. **Seed fixups.** Repoint the projection CLI to `apps/wiki-projector/triggers/cli.mjs`; write to `/alice/wiki/`;
   fix the `.meta`/`shape.ttl` bind to clear the write-consistency gate (or replace the hand-rolled seed with the
   `make test-wiki` bind→instantiate pipeline). Drop the proxy split.
6. **Data model.** Decide whether the console keeps its `Concepts`/`Implementations` + `wm:implementedBy` model or
   adopts the llm-wiki profile's types/edges (llm-wiki-colab ontology). This is the deepest question (below).
7. **E2e restore.** Re-home `e2e.test.mjs` under a real `test-app-e2e` target against a seeded fork pod; assert on
   `index.md` (survives), the fork-derived graph rep, and a 400 teaching message. No proxy.

---

## 4. Open design questions (for the brainstorm to decide — do NOT pre-commit here)

- **Data-model question (the big one).** The console curates a bespoke `Concepts`/`Implementations` +
  `wm:implementedBy`/`wm:ConceptWiringShape` model. Phase 2 re-derived the wiki family onto the **llm-wiki
  profile** (llm-wiki-colab ontology, `/alice/wiki/`). Does the console (a) adopt the llm-wiki types/edges and
  become a generic profile-driven curator, (b) keep its own model as a *second* profile bound alongside, or (c)
  stay wiki-specific but retargeted? P13 says the substrate is neutral — but the console is application #1's UI, so
  it MAY be app-specific. This decision drives most of the rewire's size.
- **Graph read path:** fetch `graph.jsonld` directly, or negotiate via `Accept-Profile` (exercising conneg-by-profile
  from the UI — arguably the better demo)? The latter also needs the console to understand the linkset/altr affordances.
- **Seed vs pipeline:** keep a hand-rolled `seed.mjs`, or make the console consume the `make test-wiki`
  bind→instantiate output as its fixture (less duplication, one source of truth for the wiki family)?
- **Target rig:** dev-serve against `pod.vardeman.me` (TLS, needs the CA in the browser), or a plain `--lws`
  localhost pod? And does in-pod install (`/alice/apps/wiki-memory/`, currently deferred) come into scope?
- **Auth for reads:** now that reads hit conneg + possibly-private resources, attach the bearer everywhere (drop the
  public-read `acl:default` the graph view depended on)?

---

## 5. What a working console-on-fork needs (acceptance shape)

- **Target:** a live `--lws --conneg --idp` fork pod, container `/alice/wiki/`.
- **Auth:** `POST /idp/credentials` bearer, attached to ALL reads (incl. graph).
- **Seed:** projection CLI → `apps/wiki-projector/triggers/cli.mjs`; writes to `/alice/wiki/`; `.meta` bind clears the
  write-consistency gate; no proxy. (Or: reuse the `make test-wiki` pipeline as the fixture.)
- **E2e:** a real `test-app-e2e` target, seeded fork pod, assertions on `index.md` + the derived graph rep + a 400
  admission-floor teaching message — no `:8080`.
- **Live-verify:** a human can log in, browse a card, follow a typed edge across the graph, edit a card, and see the
  400 `sh:message` teaching when the edit violates the floor — through the real TLS/Caddy stack.

---

## Pointers

- Console: `app/README.md`, `app/src/`, `app/seed/seed.mjs`, `app/test/e2e.test.mjs`. Design of record
  `docs/superpowers/specs/2026-06-22-wiki-memory-app-design.md`.
- Substrate it must ride: the llm-wiki profile family (`projection/profiles/defs/llm-wiki/`), the projector
  (`apps/wiki-projector/`), the `make test-wiki` live pipeline, the fork-nextfork behaviors
  (`docs/foundations/05-jss-spec-conformance.md` §4, FOLLOWUP top block).
- Neutrality gate: `docs/foundations/06-code-placement-audit.md` (P13) — the console is application #1's UI; keep any
  wiki-specific logic out of the neutral substrate, but the console itself MAY be app-specific.
