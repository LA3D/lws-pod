# The LWS navigator — deliberation record + research synthesis

**Status:** deliberation RESOLVED 2026-07-15 (Chuck-approved); the design of record is
`docs/superpowers/specs/2026-07-15-human-viewing-surface-design.md` (revised same day to the
two-layer framing this note grounds). This note carries the *why* and the research grounding —
exploratory per `docs/design-notes/` convention, but its decisions are recorded in the spec.
Full research reports (verbatim, source-verified): `research/2026-07-15-pod-browser-landscape.md`,
`research/2026-07-15-js-rdf-rendering-libraries.md`,
`research/2026-07-15-drive-model-agent-memory-uis.md`.

---

## 1. The framing (Chuck, 2026-07-15)

> Linked Web Storage is essentially a version of Google Drive that's standards-compliant, but
> also enables agents to have extended information, to treat the storage as a memory
> structure, and to store metadata about the data.

The human surface for the pod should therefore look like Drive, not like a bespoke wiki app:
a **storage-space navigator** (container hierarchy, member list, metadata plane) with
**integrated applications** dispatched per resource type — where "installed app" = a bound
PROF profile that declares HTML representations for its types. The wiki-memory rendering is
**application #1 registered with the navigator**, not the product. This *inverted* the first
draft of the 2026-07-15 spec (wiki faces first, navigator as seed) into navigator-shell +
plug-in faces, one round, thin vertical slice of both.

## 2. What the research found (three subagent sweeps, 2026-07-15)

1. **The slot is empty.** Every existing pod UI — Penny, PodOS, SolidOS/mashlib, Inrupt's
   archived PodBrowser, solid-cockpit, FilePod — is client-side; none renders server-side and
   none consumes server-declared self-description (`.lwstypes`, `dct:conformsTo`, `altr:`) —
   all re-derive types client-side from fetched triples. No "JSON-LD → HTML page" library
   exists on npm. Nothing agent-era renders graph data to human pages (agents render to
   context windows). The W3C LWS WG is protocol-only. Meanwhile two Drive-style Solid file
   managers launched spring 2026 (Pod Drive — closed; FilePod — Flutter/GPL): real demand, and
   the neutral-web-navigator slot is unoccupied.
2. **The dispatch registry is the convergent pattern**, in four independent lineages:
   Google Drive "open with" (app ↔ MIME types, default + secondary, `state` handoff);
   PodOS `selectToolsForTypes` (priority-scored type→view table, generic fallback, `?tool=`
   pin); SolidOS pane registry (ask-each-renderer, most-specific wins); Nextcloud Viewer
   (default handler per type + `openWith()` + pluggable details sidebar). **Our substrate
   already has this registry, declaratively and server-side**: a declared `text/html`
   representation IS a registration; `altr:` alternates ARE the tool list; `conformsTo` is the
   app binding. The navigator renders what the pod already asserts — zero client discovery,
   which no surveyed project does.
3. **Deployment posture precedent:** Penny's experimental "server UI" mode (the server mounts
   the browser UI as the HTML face of its own resource URLs, conneg untouched) and
   `filebrowser` (35k-star single binary serving its own file UI) — the
   navigator-in-the-substrate shape is proven.
4. **Interaction grammar** (Drive + agent-memory-UI sweep): one canonical hierarchy with the
   metadata pane *adjacent* (never a separate destination); preview-before-open; type badges;
   provenance visible per item (the `.lwsprov` sidecar has this); Signposting-style "machine
   view" affordance on every page (one URI, two faces); memory-inspection patterns for later
   (row-per-memory lifecycle lists — ChatGPT/mem0; pinned-vs-archival plane split — Letta).
5. **Rendering tech** (all Node-native, rdflib rejected): Zazuko **Trifid entity-renderer**
   v2.0.0 (Apache-2.0, active, lit-SSR of the small vendorable MIT `rdf-entity-webcomponent`)
   is the proven server-side RDF-entity-page pattern; **`ro-crate-html-lite`** (active, GPL →
   pattern-only) is the reference architecture for zero-CDN self-contained previews — it
   exists because its community rejected the CDN-dependent predecessor, independently
   validating our no-CDN rule; **`@ulb-darmstadt/shacl-form`** (MIT, very active) + the
   **W3C SHACL 1.2 UI draft** are the shapes-driven-views track our SHACL-carrying substrate
   should watch; **PodOS elements** (MIT, Stencil) are the only ecosystem code worth importing
   if client enhancement is ever wanted. **RO-Crate `ro-crate-preview.html`** is the external
   standard for "the storage format carries its own human face" — homologous to our declared
   html reps and directly relevant when research objects land in pods.

## 3. The resolved architecture (recorded in the spec; here for the why)

Two layers with different rendering economics:

- **Navigator (the Drive shell) — neutral, fork-level, request-time.** Container listings are
  **WAC-filtered per requester**, so the navigator MUST render at request time in the fork —
  a materialized listing would leak private member names or freeze the anonymous view. It is
  the HTML face of the LWS API itself (`items[]`, sidecars, storage description), and it
  reads only self-description — never profile semantics (P13).
- **Profile faces (the apps) — materialized, projector-level.** Card content is not
  per-requester, so faces materialize at instantiate/CDC time like every derived rep, gated
  by normal resource ACLs at fetch time.

Locked decisions (Chuck, 2026-07-15): profile-bound containers default to their declared
index face with the navigator reachable as tab/param (Drive default-handler grammar);
**mashlib retires under `--lws`** (dispatch = declared face → navigator; upstream
byte-identical with `--lws` off); **v1 is public-only** (browser login = seed); v1 navigator
scope = **container view + generic entity face + root/storage view** (type-first collections
view = seed).

## 4. Seeds this note parks

- **Type-first navigation** ("pod as typed collections" — PodOS dashboard pattern over the
  `.lwstypes` type search; the LWS search/type-index module is the standards hook).
- **Browser login** (cookie session, or free via the MCP-Apps rung where the host holds
  credentials).
- **Memory-inspection views** (row-per-memory lifecycle list; pinned-index vs archival-bulk
  plane distinction; provenance timeline from `.lwsprov`) — natural navigator extensions once
  the curator round defines the workflows they serve.
- **MCP-Apps `ui://` rung** — the self-contained viewer doubles as an Apps template.
- **shacl-form / SHACL 1.2 UI** — shapes-driven read-only views as a generic face upgrade.
- **PodOS elements** as progressive enhancement on server-rendered pages.

## 5. What was evaluated and declined

- **Extending mashlib** — its pane registry is the right *idea* (and SolidOS is alive, with
  NLnet-funded refactoring), but it is client-side, rdflib-centric, and re-derives what our
  substrate already declares. We keep the registry semantics, server-side.
- **Client-side rendering SPA** (the old `app/` posture) — invisible to agent harnesses
  (Claude Code / Desktop / Science attach via MCP; harnesses render fetched HTML, they don't
  run our SPA), one channel instead of every channel.
- **Adopting Penny / PodOS / any surveyed codebase as base** — AGPL (Penny), or client-side
  paradigm mismatch; PodOS elements noted as the one importable exception, later.
