# Research report: Solid / LWS pod browser landscape (2026-07-15)

> Subagent web-research report commissioned by the 2026-07-15 human-surface brainstorm
> (`docs/design-notes/lws-navigator.md` carries the synthesis). Verbatim as returned;
> maintenance/license claims verified by the researching agent against the linked repos.

---

## Synthesis: what the LWS navigator should take from this

**The field is empty where you're building.** Every pod browser in the ecosystem — Penny, PodOS, mashlib, PodBrowser, solid-cockpit, FilePod — is a client-side SPA or web-component app that fetches raw RDF and reconstructs meaning in the browser. No project renders navigation server-side, and none consumes server-declared self-description (your `.lwstypes` sidecars, `dct:conformsTo` bindings, `altr:` alternates) — they all re-derive types client-side from fetched triples. A server-rendered navigator that trusts the pod's own declarations has no direct precedent and no competitor.

**Patterns to steal:**
1. **PodOS's `selectToolsForTypes` registry** — the single best artifact found. A small, data-driven, priority-scored table mapping `rdf:type` URIs to view elements, with universal fallbacks (`Generic` data view + `Attachments`) and a `?tool=` URL param pinning the user's choice. This maps one-to-one onto your design: compute the tool list server-side from `.lwstypes` + `altr:` instead of client-side from fetched triples, render the winner, expose the rest as tabs.
2. **SolidOS pane-registry semantics** — ask each registered renderer in order whether it wants the subject; most-specific wins; generic fallback last. Twenty years of proof that type-dispatch-with-fallback is the right shape. Concept only; the rdflib codebase stays rejected.
3. **Penny's "server UI" deployment mode** — an npm package a Solid server mounts so the browser-facing face of any resource URL *is* the navigator, while conneg still serves raw data. That's exactly the navigator-in-the-substrate posture; Penny proved the mechanics (experimentally) years ago.
4. **Nextcloud's viewer-handler registry** — default handler per type, user-overridable "open with" (`OCA.Viewer.openWith(handler, filePath)`), pluggable details-sidebar tabs. The mature UX grammar for "type badge → default face → alternate faces."
5. **filebrowser's single-binary self-serving shape** — server that ships its own file UI; closest structural analog to an in-process JSS navigator.

**Reusable code:** essentially one candidate — **PodOS elements (MIT, actively released monthly, Stencil web components)** could progressively enhance server-rendered pages. Everything else is AGPL (Penny, Filestash), archived (PodBrowser), closed (PodPro, Pod Drive), GPL+Flutter (FilePod), or the rejected rdflib paradigm (mashlib).

**Validation:** dokieli (active, Apache-2.0) is long-standing proof of the "per-object declared HTML face" idea — documents that carry their own presentation plus embedded RDF. And the 2026 market signal is real: two brand-new Drive-style Solid file managers appeared this spring (Pod Drive, FilePod), but both are either closed or native-app — neither occupies the neutral-web-navigator slot.

---

## 1. Penny — Vincent Tunru

- **What**: A general pod inspector/browser: view, edit, and add data in any Solid pod; file upload/preview; aimed at developers but usable as a generic browser. Live at penny.vincenttunru.com.
- **Architecture**: Client-side Next.js 15 / React 19 SPA (static export), Inrupt `solid-client` libraries, React Aria components. Notable extra: **experimental "server UI" mode** via the `penny-pod-inspector` npm package — a Solid server serves Penny as the HTML face of its own URLs, "attempting to render the data available at the URL it is running on," while raw data is still served on request.
- **Rendering dispatch**: none by type — a uniform "everything is a Thing" inspector (subject cards, property lists, raw editing, file preview). Deliberately generic, not type-dispatched.
- **Maintenance**: dormant-ish. Last commit 2025-10-22 ("Suggest Solid Community AU Pods"), previous burst April 2025 (React 19 / Next 15 upgrade). Single author, 14 stars. A community fork, `Liquid-Surf/easy-penny` (AGPL), stalled April 2024.
- **License**: **AGPL-3.0-only** (per the npm package).
- **Verdict**: steal the server-mounted-UI-at-the-resource-URL deployment pattern; AGPL + React SPA + no type dispatch means skip the code.
- Sources: https://gitlab.com/vincenttunru/penny · https://penny.vincenttunru.com/ · https://www.npmjs.com/package/penny-pod-inspector

## 2. PodOS — Angelo Veltens (pod-os org)

- **What**: "Personal Online Data Operating System" — a Solid-native web-component toolkit (`@pod-os/elements`) over an RDF core (`@pod-os/core`), plus a generic **PodOS Browser** app (browser.pod-os.org) assembled from those components. Also a dashboard app, document/image/PDF viewers, contacts app.
- **Architecture**: **Stencil**-built custom elements styled with Shoelace, `stencil-router`, RxJS; core wraps store/`Thing`/`TypeIndex`/gateway classes with offline support. Entirely client-side; "apps" are literally HTML pages composed of `pos-*` tags — the closest thing Solid has to progressive-enhancement components.
- **Rendering dispatch**: explicit and clean. `pos-type-router` takes `resource.types()` → `selectToolsForTypes(types)` → priority-scored registry: `link#RDFDocument`→`pos-app-rdf-document` ("Things", 20), IANA `application/pdf#Resource`→`pos-app-document-viewer` (30), `link#Document`→document-viewer (10), `dct:Image`→`pos-app-image-viewer` (20), `ldp:Container`→`pos-app-ldp-container` ("Content", 30); universal fallbacks `pos-app-generic` ("Data") and `pos-tool-attachments`. Highest-priority match renders; all matches surface as user-switchable tool tabs; `?tool=` pins the choice.
- **Maintenance**: the most active pod browser in existence — pushed 2026-07-14, monthly-ish releases (2026.05: editing + reactive elements; 2026.03: reactivity; 2026.01: dynamic Solid Data Modules; 2025.12: **type-index discovery on dashboard**; 2025.10: JSON-LD + markdown rendering). 42 stars, one primary author.
- **License**: MIT.
- **Verdict**: the closest living relative and the one real code-reuse candidate — steal the tool-registry model wholesale (recomputed server-side from your declared types), and consider MIT Stencil elements as client-side enhancement on SSR pages.
- Sources: https://github.com/pod-os/PodOS · https://pod-os.org/ · https://github.com/pod-os/PodOS/releases

## 3. SolidOS / mashlib — SolidOS team (TimBL lineage)

- **What**: the classic Solid Data Browser ("databrowser"): mashlib bundles rdflib.js + solid-ui + solid-panes into a generic linked-data browser/editor.
- **Architecture**: rdflib store-centric, framework-less DOM-built widgets, entirely client-side. Aging but organized (Lerna monorepo across rdflib/solid-logic/solid-ui/solid-panes/mashlib).
- **Rendering dispatch — the pane registry**: panes register (statically via `registerPanes.js` or dynamically as npm modules — meeting-pane, contacts-pane, issue-pane, chat-pane, dozens more); for a subject, the registry asks each pane in order whether it wants to render that object, favoring the most specific hand-written pane over generic fallbacks. This is the original type-dispatch registry in the Solid world.
- **Still the default server UI?** Yes: NSS bundles mashlib as its data browser, and JSS serves it via the `--mashlib-cdn` flag (your own rig runs it). It remains the "classic Solid Data Browser" on solidproject.org/apps.
- **Maintenance**: alive, not dead: mashlib pushed 2026-07-13, solid-panes 2026-07-03; weekly team meetings; a **UI refactoring funded by NLnet / NGI0 Entrust** is in progress. But it's maintenance-and-refactor, not a new paradigm.
- **License**: MIT.
- **Verdict**: steal the registry semantics (specificity ordering, ask-each-renderer, user preference hooks); the rdflib paradigm stays rejected as a base.
- Sources: https://github.com/SolidOS/solidos · https://github.com/SolidOS/mashlib · https://github.com/SolidOS/pane-registry · https://solidos.org/

## 4. Inrupt PodBrowser / PodSpaces UI — Inrupt

- **What**: Inrupt's commercial pod browser (view/manage/control access). **Sunset March 19, 2024**; the repo was transferred to `solid-contrib/pod-browser` and **archived Sep 23, 2025** (last push Aug 2025). Next.js/React, MIT. Its access-management piece moved to amc.inrupt.com (Access Grants). inrupt.net itself was shut down March 31, 2025. PodSpaces persists as a Developer Preview whose docs point users at *community* browsers (Penny, PodPro) — Inrupt no longer ships a browsing UI.
- **Verdict**: dead; the lesson is that a vendor generic browser with no type-aware rendering and no self-hosting story didn't survive. Skip.
- Sources: https://www.inrupt.com/blog/podbrowser-sunset · https://github.com/solid-contrib/pod-browser · https://docs.inrupt.com/pod-spaces/

## 5. Other pod / storage UIs

- **PodPro** (podpro.dev, author "Jasminel", announced Jan 2022): developer tool — pod tree, Monaco editor with RDF syntax highlighting, multi-pod, raw response inspector. **Closed source**; Phoenix (Elixir) + RDF.ex backend — ironically the only server-side pod tool found. Patterns only (tree + raw editor + response pane); no visible activity since ~2022. https://podpro.dev/
- **solid-cockpit** (KNoWS, Ghent University / IDLab; Elias Crum, CHIST-ERA TRIPLE project): Vue 3 + Vuetify pod "cockpit" — upload **to typed container destinations**, ACL/privacy editing, **federated SPARQL via Comunica** with query caching. MIT (per README), pushed June 2026, 6 stars. Alive, academic, small. The typed-destination upload and Comunica query panel are worth a look; not a base. https://github.com/KNowledgeOnWebScale/solid-cockpit
- **solid-filemanager** (Otto-AA): React SPA file manager from the 2019 era; no license file; last push March 2025 but effectively legacy. The similar ODI solid-file-manager (github.com/solid/solid-file-manager) is older still. Skip both. https://github.com/Otto-AA/solid-filemanager
- **FilePod** (ANU Software Innovation Institute, `anusii`): brand-new (created March 2026, pushed 2026-07-13) **Flutter** cross-platform Solid file browser on the solidcommunity.au stack, GPL-3.0. Evidence of fresh 2026 investment in Drive-style Solid UX, but native-app + GPL → skip for code. https://github.com/anusii/filepod
- **Pod Drive** (PrivateDataPod, launched ~March 2026): explicitly "a Google-Drive-style file manager for your Solid Pod," on a hosted CSS provider with pod-native app hosting. **Closed source.** Market-signal only. https://privatedatapod.com/
- **W3C LWS WG**: no browsing-UI deliverable exists or is chartered — the WG (through Sep 2026; LWS Protocol 1.0 FPWD, Auth Suite FPWD Apr 2026) is protocol-only, split producer/consumer. Nothing in the community occupies the "LWS navigator" slot yet. The spec family's search/type-index module is the standards hook a navigator should read. https://www.w3.org/groups/wg/lws/
- **dokieli** (Sarven Capadisli): clientside editor for decentralized article publishing, annotation, and social interaction — HTML+RDFa documents that carry their own presentation. Apache-2.0, 888 stars, **active (pushed 2026-07-11)**. Not a browser, but the standing proof-of-concept for per-object self-describing HTML faces. https://github.com/dokieli/dokieli

## 6. Google-Drive-like open-source storage UIs (patterns)

- **Nextcloud Files + Viewer** (AGPL, PHP + Vue): the pattern to copy is the **client-side handler registry keyed by mimetype** — each viewer app registers itself; a default handler renders on open; `OCA.Viewer.openWith(handler, filePath)` powers a user-facing "open with" menu when the default isn't wanted (e.g., Collabora vs. PDF viewer); plus a details sidebar with pluggable tabs (activity, sharing, versions). Substitute rdf:type/profile for mimetype and this is your dispatch UX. https://github.com/nextcloud/viewer/pull/1273
- **Filestash** (mickael-kerjean; AGPL-3.0, pushed 2026-07-14, 14.4k stars): "universal file storage client" — one UI over many backends, opener selection by file type, org-configurable. Good study for backend-agnostic navigation chrome; AGPL → patterns only. https://github.com/mickael-kerjean/filestash
- **filebrowser** (Apache-2.0, pushed 2026-07-15, 35.5k stars): Go single binary serving its own Vue file UI — list + breadcrumb + preview + share, per-user scopes. Structurally the closest analog to "the pod serves its own navigator"; permissively licensed, though Go+Vue makes it patterns-not-code for you. https://github.com/filebrowser/filebrowser

## 7. Type-index / app-registry navigation precedents

- **Solid Type Indexes spec** (solid.github.io/type-indexes; grew from the solid/solid `data-discovery` proposal): WebID → profile → public/private type index; `solid:TypeRegistration` maps `solid:forClass` → `solid:instance` (a resource) or `solid:instanceContainer` (a container). The canonical "find data of class X without scanning the pod" mechanism — apps dispatch by class, in reverse of your navigator (which dispatches views by class). https://solid.github.io/type-indexes/
- **PodOS is the living implementation**: a `TypeIndex` class in core, **type-index discovery on the dashboard** (release 2025.12), and `pos-list` for type-based listing — i.e., "your pod as a set of typed collections" rather than a folder tree. This is the strongest existing precedent for type-first (rather than container-first) navigation.
- **SolidOS** uses the type registry in its creation flow (the "+" button offers what can be created here and where instances of a class live) — the write-side complement.
- **Gap you fill**: all of these resolve types *client-side from the profile*. Your substrate already asserts types and profile conformance *server-side per resource/container* (`.lwstypes`, `dct:conformsTo`, `altr:`, VoID) — so the navigator can render type badges and pick faces at response time with zero client discovery, something no surveyed project does.

---

### Bottom line for the navigator design

Build server-rendered (greenfield — nobody else is there), with a **declarative type→face registry in the PodOS shape** (priority-scored table, generic-data + raw fallbacks, URL-pinnable tool choice) fed by your own sidecars/`altr:` instead of client fetching; wrap it in **Nextcloud's default-handler/open-with UX grammar**; deploy it in **Penny's server-UI posture** (the navigator is the HTML face of every resource URL, conneg untouched). If client enhancement is wanted later, PodOS's MIT Stencil elements are the only ecosystem code worth importing.

### Key sources

- Penny: https://gitlab.com/vincenttunru/penny · https://www.npmjs.com/package/penny-pod-inspector
- PodOS: https://github.com/pod-os/PodOS · https://pod-os.org/ · https://browser.pod-os.org/
- SolidOS: https://github.com/SolidOS/solidos · https://github.com/SolidOS/mashlib · https://github.com/SolidOS/pane-registry
- Inrupt: https://www.inrupt.com/blog/podbrowser-sunset · https://github.com/solid-contrib/pod-browser · https://docs.inrupt.com/pod-spaces/
- Others: https://podpro.dev/ · https://github.com/KNowledgeOnWebScale/solid-cockpit · https://github.com/Otto-AA/solid-filemanager · https://github.com/anusii/filepod · https://privatedatapod.com/ · https://github.com/dokieli/dokieli · https://solidproject.org/apps
- LWS WG: https://www.w3.org/groups/wg/lws/ · https://www.w3.org/news/2026/first-public-working-draft-linked-web-storage-protocol-1-0/
- Drive-likes: https://github.com/filebrowser/filebrowser · https://github.com/mickael-kerjean/filestash · https://github.com/nextcloud/viewer/pull/1273
- Type indexes: https://solid.github.io/type-indexes/ · https://github.com/solid/solid/blob/main/proposals/data-discovery.md
