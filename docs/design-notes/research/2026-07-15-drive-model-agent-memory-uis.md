# Research report: Drive-model + agent-memory-UI interaction patterns (2026-07-15)

> Subagent web-research report commissioned by the 2026-07-15 human-surface brainstorm
> (`docs/design-notes/lws-navigator.md` carries the synthesis). Verbatim as returned;
> claims verified by the researching agent against the linked primary sources.

---

## (a) Distilled interaction patterns to adopt

1. **One canonical hierarchy + an always-adjacent metadata pane.** Drive's legibility comes from a single file list/folder tree with a Details/Activity side panel one click away — metadata is *adjacent to* the listing, never a separate destination. NN/g's mental-model research and Marshall & Tang's cloud-storage study both show users reason in files-and-folders even when the substrate isn't; don't make the container tree secondary to a graph view. (Precedent: Drive details pane; NN/g; Marshall & Tang 2012.)

2. **Dispatch-by-type "open with" registry.** Drive apps register *default* and *secondary* MIME types; on "Open with," Drive routes to the app's Open URL with a `state` param (`ids`/`exportIds`, `resourceKeys`, `action:"open"`, `userId`) and the app fetches content via the API. The LWS analog is direct: `rdf:type` / `dcterms:conformsTo` (profile) plays the MIME-type role, and the pod's type index + profile declarations *are* the registry — the navigator resolves resource type → registered app URL, passing the resource IRI. (Precedent: Drive UI "Open with" integration.)

3. **Type-dispatched inline views, not just external apps.** SolidOS's databrowser already does in-page dispatch-by-type: resources render through type-specific "panes" (contacts, chat, notes, folder), chosen by the resource's RDF type. A navigator wants both tiers: inline pane for viewing, "Open with" hand-off for editing apps. (Precedent: SolidOS/mashlib panes.)

4. **App-created resources stay first-class in the listing even when content lives elsewhere.** Drive's third-party shortcuts are metadata-only stubs (`application/vnd.google-apps.drive-sdk`) that appear in the normal file list; opening one dispatches back to the owning app with the file ID in `state`. This is the pattern for derived views / projections: list them alongside "real" resources, dispatch to their generator. (Precedent: Drive third-party shortcuts.)

5. **Preview-before-open everywhere.** Drive's hover previews and preview modal let users gain context "without having to open the information sidebar." For a memory pod: render the card/content representation inline in the preview pane, cheaply, for every resource. (Precedent: Drive hover preview.)

6. **Memory is a flat, editable, revocable list — one row per item, with lifecycle.** The converged 2025-26 pattern for "human sanity-checks what the agent stored": ChatGPT's Manage memories (row per fact + date, per-row delete, clear-all, conversational "forget X"); mem0's OpenMemory dashboard adds filter-by-app, active/pause/archive states, and per-app access toggles. The navigator's "what agents wrote" view should be this list, backed by per-resource ACL revocation. (Precedent: ChatGPT memory UI; mem0 OpenMemory.)

7. **Show the two memory planes differently: pinned/index vs archival bulk.** Letta's ADE distinguishes core memory blocks (labeled, always-in-context, with visible character-count budgets, expandable and directly editable) from archival memory (out-of-context searchable store). An LWS navigator should visually separate the index/nav plane (OKF channels, type indexes) from bulk typed storage, and show "budget" on the pinned plane. (Precedent: Letta ADE.)

8. **An editable summary as the human control surface, with edits that feed back.** Claude's memory UI centers on a viewable, directly editable memory *summary* (plus export/delete); users correct the synthesis rather than only pruning raw records. Pair the raw-record list (pattern 6) with an editable rollup per container/topic. (Precedent: Claude memory, Aug-Sep 2025 rollout; Willison's ChatGPT-vs-Claude comparison.)

9. **The storage format carries its own human face.** RO-Crate's `ro-crate-preview.html`: an optional sibling HTML rendering that MUST be valid HTML5, MUST embed a copy of the crate's JSON-LD in a `<script>` in `<head>`, and SHOULD render root-entity metadata as *static HTML without scripting*, linking each referenced entity. lws-pod's representation mechanism can materialize exactly this per container — the preview then survives export, mirroring, and offline use. (Precedent: RO-Crate 1.1 §structure; ro-crate-html-js / preview GitHub Action; WorkflowHub's Workflow-RO-Crate examples ship one.)

10. **One identifier, two faces, typed links between them.** DataCite: a PID must resolve to a landing page carrying citation metadata in human-readable *and* machine-readable form (schema.org JSON-LD), with content negotiation on the same URI returning structured metadata directly. FAIR Signposting standardizes the glue: `Link` headers (`describedby`, `cite-as`, `type`, `item`) from the human page to the machine metadata, readable via HEAD. The pod's conneg-by-profile + `describedby` sidecars are already this — the navigator should *display* those links as chrome (a "machine view" affordance on every page). (Precedent: DataCite landing-page best practices; signposting.org FAIR profile.)

11. **Every agent-derived item cites its source with a link back.** Notion Enterprise Search/AI connectors answer only from chosen sources and always cite, linking back to the original Slack message/Doc/ticket. For memory: every stored card should surface its provenance edge (session, agent identity, source resource) as a clickable citation — this is what makes sanity-checking cheap. (Precedent: Notion AI; mem0 access logs; Drive Activity pane's "who did what when.")

## (b) Notable products/projects per angle

**Angle 1 — Drive model:**
- **Google Drive UI integration ("Open with")** — the reference dispatch-by-type mechanism: MIME-type registry, Open URL, `state` parameter contract, `files.get`/`files.export` follow-up.
- **Drive third-party shortcuts** — metadata-only stubs for externally-stored app content; the listing stays unified.
- **Marshall & Tang, "That syncing feeling" (DIS 2012)** + **NN/g cloud-storage mental models** — the HCI grounding: users' file/folder mental model persists in the cloud and mismatched models cause errors.
- **Penny** (Vincent Tunru) — explicitly a Drive-style file manager for Solid pods; the closest existing LWS-navigator analog. **SolidOS databrowser** — folder tree + type-dispatched panes over any pod.

**Angle 2 — Agent-era memory UIs:**
- **ChatGPT Manage memories** — row-per-fact list, per-row delete, clear-all, on/off toggle, conversational forget.
- **Claude memory** (Max/Team/Enterprise, 2025) — editable memory summary, view/edit/export/delete, project-scoped export, incognito; admin controls.
- **Letta ADE** — the most complete "agent memory inspector": context-window visibility, labeled core-memory blocks with char budgets, editable in place; archival store browsable/searchable.
- **mem0 OpenMemory / Mem0 server dashboard** — memory CRUD + filter by app/category/date, access logs per memory, app-level access toggles, live request audit log. (OpenMemory itself being sunset in favor of the self-hosted Mem0 dashboard.)
- **MCP Inspector** — the de-facto MCP resource browser: Resources tab lists server resources and templates, read-by-URI; note MCP's control model makes Resources *application-driven* (the host stages them), so a pod navigator is precisely the "host UI" role.
- **Notion AI connectors / Enterprise Search** — cited-sources answer UI over connected knowledge, links back to originals.
- **Claude Projects** — knowledge base as a right-side file panel scoped to a workspace; simple but the pattern (workspace + visible knowledge shelf) is what users now expect.

**Angle 3 — Standards-based storage with a human face:**
- **RO-Crate `ro-crate-preview.html`** — spec'd sibling HTML preview; embedded JSON-LD copy; static-first. Tooling: `ro-crate-html-js` (rochtml) and the **ResearchObject/ro-crate-preview-action** (builds preview → gh-pages).
- **WorkflowHub** — uses Workflow RO-Crate as its import/export exchange format (with CWL, Bioschemas, TRS); its published crate examples include the preview HTML.
- **DataCite landing pages + content negotiation** — DOI → landing page with human + schema.org JSON-LD metadata; Accept-header conneg on doi.org returns machine metadata directly.
- **FAIR Signposting** (signposting.org; implemented by InvenioRDM/Zenodo-stack and DSpace 7) — `Link`-header `describedby`/`cite-as`/`type`/`item` relations from landing page to metadata/content, HEAD-accessible.

**Cross-cutting note for the console-on-fork rewire:** the pod already produces most of the raw material these patterns need (typed sidecars `.lwstypes`/`.lwsprov`, `describedby`, conneg-by-profile alternates, VoID, provenance). The gap the precedents point at is pure presentation: a container tree with an adjacent metadata pane (1), type→pane/app dispatch driven by the existing profile registry (2/3), a per-resource provenance timeline from `.lwsprov` (11), and a materialized static HTML representation per container as a first-class declared representation (9).

## (c) Sources

**Angle 1:**
- https://developers.google.com/workspace/drive/api/guides/integrate-open
- https://developers.google.com/workspace/drive/api/guides/enable-sdk
- https://developers.google.com/workspace/drive/api/guides/third-party-shortcuts
- https://www.nngroup.com/articles/cloud-storage/
- https://www.microsoft.com/en-us/research/wp-content/uploads/2016/02/DISCamReadyFix.pdf (Marshall & Tang 2012)
- https://www.howtogeek.com/google-drive-has-a-cool-new-preview-feature/
- https://alicekeeler.com/2017/05/20/google-drive-use-activity-pane/
- https://penny.vincenttunru.com/ ; https://solidos.org/ ; https://solidproject.org/apps

**Angle 2:**
- https://help.openai.com/en/articles/8590148-memory-faq ; https://openai.com/index/memory-and-new-controls-for-chatgpt/
- https://simonwillison.net/2025/Sep/12/claude-memory/
- https://venturebeat.com/ai/anthropic-adds-memory-to-claude-team-and-enterprise-incognito-for-all
- https://docs.letta.com/guides/ade/overview ; https://docs.letta.com/guides/agents/memory-blocks/ ; https://docs.letta.com/guides/ade/archival-memory/
- https://github.com/mem0ai/mem0/tree/main/openmemory ; https://deepwiki.com/mem0ai/mem0/12.3-server-dashboard
- https://www.stainless.com/mcp/mcp-inspector-testing-and-debugging-mcp-servers/ ; https://modelcontextprotocol.io (Resources = application-driven)
- https://www.notion.com/help/notion-ai-connectors ; https://www.notion.com/product/enterprise-search
- https://support.claude.com/en/articles/9517075-what-are-projects

**Angle 3:**
- https://www.researchobject.org/ro-crate/specification/1.1/structure.html
- https://www.researchobject.org/packaging_data_with_ro-crate/12-html-preview.html
- https://github.com/ResearchObject/ro-crate-preview-action
- https://www.researchobject.org/ro-crate/workflowhub ; https://about.workflowhub.eu/Workflow-RO-Crate/example/ro-crate-preview.html
- https://support.datacite.org/docs/landing-pages ; https://support.datacite.org/docs/datacite-content-resolver ; https://support.datacite.org/docs/schemaorg
- https://signposting.org/FAIR/ ; https://signposting.org/patterns/metadata_resources/ ; https://inveniordm.docs.cern.ch/operate/customize/FAIR-signposting/
