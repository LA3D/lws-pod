# Roadmap — memory pods on JSS

Forward plan and **order of operations**. For current between-session state see `FOLLOWUP.md`;
for the substrate evidence see `docs/foundations/`. This doc is the *sequencing* — what to build,
in what order, and what each phase depends on.

Last updated: 2026-06-21.

---

## The target (two halves that meet in the middle)

A **wiki-memory** system: typed, queryable agent/human memory stored as portable knowledge in
per-user **Solid/LWS pods**, with a browser+agent app that installs into a user's pod space.

It has two halves:

1. **Server side — LWS storage enrichment** (a sidecar on JSS). JSS gives us Solid/LDP storage +
   LWS-CID identity but not LWS *storage* (the `application/lws+json` containers, storage
   description, linksets, and Type Index/Search; see `docs/foundations/05-jss-spec-conformance.md`
   and JSS#87). We add those as a server-agnostic sidecar that extends the existing
   `constrained-container/` SHACL admission proxy.
2. **Client side — the wiki-memory Solid app**. A static Solid app (browser + headless/agent
   surface) distributed via **`jss install`** into `{pod}/public/apps/wiki-memory/`. It authors
   and reads concept cards, navigates the OKF `index.md` views, and queries via Comunica. Built on
   standard Solid app patterns ([dev.solidproject.org](https://dev.solidproject.org/), the
   `solid/dev` resource hub).

### Secondary purpose: an agentic-behavior testbed

The wiki-memory pod is not just a product — it's the **experimental apparatus** for the
"structure helps agents" thesis. Because it exposes an agent-facing surface (MCP / headless), the
same `make test` harness that gates the storage layer extends to **agentic-behavior evaluation**:
does typed, authz-filtered, progressively-disclosed memory (TypeIndex → Comunica) produce better
agent task outcomes than flat retrieval? **Porter's flat shared graph is the natural control
group** — same substrate (LWS pods), opposite memory model (untyped dump + SPARQL-the-pile vs
typed edges + progressive disclosure + SHACL admission). This makes the agent surface a
first-class deliverable, not an afterthought, and the evaluation rig a real workstream (Phase 3).

### Layered architecture

```
wiki-memory Solid app  (browser + agent/MCP)        ← jss install into /public/apps/
        │  Tier-1 discovery (TypeIndex/Search)  │  Tier-2 query (Comunica, client-side)
        ▼                                       ▼
LWS-services sidecar  (storage desc · lws+json · linkset · TypeIndex/Search · .graph projection · SHACL admission)
        ▼
JSS  (LDP CRUD · conneg · WAC · Solid Notifications · git versioning · LWS-CID identity)
        ▲
lws-keycloak  (authn + authz-server / token-exchange)
```

**Two-tier retrieval** (progressive disclosure): the **Type Index/Search** narrows to candidate
resources by type + typed-edge relations (server-side, authz-filtered, CNF); **Comunica** then runs
the expressive SPARQL/traversal over that bounded set (client-side, authz "free" via the token).
See `docs/foundations/04-comunica-patterns.md`.

**One write-path, three consumers.** The SHACL admission proxy intercepts every write and feeds:
(a) the **linkset** metadata, (b) the **Type Index** (derive types/relations from `rel="type"` +
typed-edge Link headers), and (c) the per-container **`.graph`** aggregate Comunica queries.

---

## What's already done

**`FOLLOWUP.md` is the single source of current state.** It carries the DONE blocks (substrate
decision, local rung, grounded skills, P1–P3/P5, P4a LWS-CID-local) and the live phase status. This
roadmap does not restate them — it sequences what remains. In one line: the substrate is chosen
(JSS v0.0.209) and the L2 layer + curation app are built on the local rung; **P4 (CRC VM) is the
remaining Phase-0 rung and is deferred to last.**

---

## Prerequisites / open decisions (close these before/early in the build)

These are load-bearing and several gate later phases. **Status lives in `FOLLOWUP.md`** (open items
+ DONE blocks); the table below is the *why-it-gates* reference, with status compressed to a marker.

| # | Item | Why it gates | Status |
|---|------|--------------|--------|
| P1 | **lws-keycloak authz integration** | Solves the LWS authorization-server / token-exchange gap JSS lacks; supplies the per-client identity the Type Index's authz-filter requires, and the app's login. | ✅ spike done — see FOLLOWUP |
| P2 | **Proxy auth on constraint/index reads** (open item 2) | The Type Index MUST authz-filter on *current* access per request; the admission proxy reads `.meta`/shapes unauthenticated today and `.acl` PUT returned 415. | ✅ done — see FOLLOWUP |
| P3 | **Projection-on-write / git-commit-on-write** (open item 3) | Materializes the `.graph` aggregate (Comunica's cheap path) and the derived index. No native JSS write hook → runs in the sidecar. | ✅ done — see FOLLOWUP |
| P4 | **Public-dev rung** (`pod-dev.crc.nd.edu` on a CRC/SAI VM) | Realistic multi-user/app-install + the one-time SSRF-guard-*on* confirmation of LWS-CID auth. **No longer gates "working"** — LWS-CID auth is already proven locally; this is the permanent home, sequenced LAST. Adds `docker-compose.dev.yml` + `.env.dev`. | not started (deferred to last) |
| P5 | **Write-funnel decision** | If agents write directly to JSS bypassing the proxy, the index/`.graph` miss it. | ✅ resolved in P3 — see FOLLOWUP |

---

## Order of operations

**Recommended strategy: thin vertical slice first, standards enrichment second.** Most of the
memory pod is buildable on *current* JSS (cards + `.graph` + SHACL admission + Comunica + the
installable app). The LWS Type Index / `lws+json` layer is an enrichment that replaces a
Comunica-over-`.graph` stopgap for Tier-1. This delivers a working memory pod early and sequences
the heavier, standards-conformance server work last. (Alternative — substrate-first — front-loads
the sidecar before any app value lands; not recommended.)

### Phase 0 — Prerequisites (P1–P3, P5 ✅; P4 deferred to last)
De-risk the assumptions. **Done:** lws-keycloak proven against JSS (P1); the proxy reads
constraints/serves queries under the requester's auth (P2); projection-on-write materializes
`graph.ttl`+`index.md` on each write (P3); the write-funnel is the notifications CDC path (P5);
and LWS-CID self-signed auth is proven locally (the patched TLS pod). **P4 (CRC VM) is
deliberately pushed to the end** — nothing about "working" depends on it now.
**Exit:** met — Phase 1 builds entirely on the local rung.

### Local definition-of-done (the gate before any CRC VM)
Build the L2 layer + app to "mostly working" locally first; only then provision P4. The VM is the
permanent home + the one-time guard-on SSRF confirmation, not a debugging surface. Done = an agent
can author concept cards through the SHACL floor; projection keeps `graph.ttl`/`index.md` in sync
on write (notifications); Comunica answers the "concepts with no implementation" query; `index.md`
navigation works; and the Porter flat-retrieval control is wired for the structure-helps-agents
eval. When that checklist is green, P4 is "put the known-good stack somewhere permanent + flip the
SSRF guard back on for one confirmation."

### Phase 1 — Wiki-memory vertical slice on current JSS
The end-to-end memory pod, no LWS-storage layer yet.
- Implement the dual-projection (cards → `index.md` + `.graph`) as the projection sidecar (P3).
- Wire the SHACL admission floor (`constrained-container/`) into the write path.
- Build the **wiki-memory Solid app** (Solid-OIDC/lws-keycloak login, read/write cards, browse
  `index.md`), distributed via **`jss install`** into `/public/apps/wiki-memory/`.
- Tier-1 discovery = **Comunica-over-`.graph` stopgap** (SPARQL "all of type X"); Tier-2 = the
  richer Comunica queries.
**Exit:** install the app into a pod, author cards, navigate, and query — round-trip working.

### Phase 2 — LWS storage enrichment (the sidecar)
Replace the stopgap with the real LWS contract; make the pod a conformant-ish LWS storage surface.
Build order follows the §5–11 coupling (see `05-jss-spec-conformance.md` sanity check):
1. `application/lws+json` serializer + bundled `lws/v1` JSON-LD context (§10, §11).
2. **Storage Description** resource advertising the services (§5).
3. **Linkset** metadata capture at admission — `rel="type"` + typed edges → linkset (§8).
4. **Type Index / Type Search** services, fed from the captured metadata, authz-filtered per
   request (the `lws10-searchindex` module). No Oxigraph — CNF over a derived `type → {ids}` map.
5. Point the app's Tier-1 at TypeIndex/Search; keep Comunica for Tier-2.
**Exit:** `/types/search?type=…&<edge>=…` returns authz-filtered candidates; app uses it.

### Phase 3 — Hardening & scale-out
- Multi-agent surface (MCP + optionally an AS2 messaging profile — see Porter as prior art).
- Public-prod rung (`pod.crc.nd.edu`); promote `.dev.yml` → `.prod.yml` (named volume, Caddy).
- Conformance hardening (full `lws+json` container representation, merge-patch linkset surface).

---

## Explicitly deferred (YAGNI for now)

- **LWS Access Requests & Grants (§9)** — the ODRL sharing/delegation protocol. `lws-keycloak`
  does *not* cover this (it's authn + token-exchange, not the request/grant protocol). Only needed
  once agents request access to *each other's* pods. WAC + lws-keycloak suffices for owner+agent.
- **Full `lws+json` re-representation of every container** — the Type Index returns a *synthetic*
  `ContainerPage`; we don't need to re-represent all containers to get typed retrieval.
- **Oxigraph / server-side triplestore** — TypeSearch is CNF set-ops; Comunica covers client-side
  SPARQL. No embedded store needed.
- **Forking JSS** — no plugin API (JSS#87 parks storage mode); the sidecar stays server-agnostic.

---

## Prior art to mine

- **Porter** ([chapeaux/porter](https://github.com/chapeaux/porter), MIT) — multi-agent
  orchestration storing agent memory as Turtle in LWS pods (`{pod}/porter/memory/{session}.ttl`),
  ETag writes, Solid-Notifications sync, Keycloak token-exchange, AS2 messaging, pod-per-user on
  OpenShift. Steal the sync loop, the auth flow (`lws-keycloak`), and the AS2 profile. Contrast:
  its memory is a *flat shared graph* (no typed edges / progressive disclosure / SHACL admission) —
  exactly the gap our L2 fills.
- **`jss install`** — the app distribution mechanism (git repo → `/public/apps/<name>/`).
- **solid/dev** ([dev.solidproject.org](https://dev.solidproject.org/)) — Solid app-dev patterns.
- **`linkedwebstorage/lws-server`** ([repo](https://github.com/linkedwebstorage/lws-server)) —
  Melvin Carvalho's (JSS's author) minimal LWS CRUD core *extracted and simplified from JSS*
  (~1000 LOC, AGPL). A clean reference read of the LWS resource core stripped of conneg/auth/
  notifications; implements none of the LWS storage layer (lws+json, storage desc, linkset, type
  index). Reference only — JSS is its superset, not a substrate candidate.

> **Ecosystem note:** four LWS-ish servers checked — JSS, lws-keycloak's storage-server,
> `jeswr/solid-server-rs`, and `lws-server` — and **none implement the LWS storage layer** (lws+json,
> storage description, linkset, Type Index/Search). That layer, and the Type Index especially, is
> unbuilt across the ecosystem — our sidecar is novel work regardless of substrate.

---

## How we build each piece

Each substantial workstream (the sidecar, the wiki-memory app) goes through
**brainstorm → spec → plan → subagent-driven implementation**, as the local rung did
(`docs/superpowers/`). This roadmap sequences them; it does not replace the per-workstream spec.
