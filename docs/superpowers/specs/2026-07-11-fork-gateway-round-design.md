# Fork gateway round — design of record

**Date:** 2026-07-11. **Status:** approved (Chuck, this date, section-by-section).
**Grounding:** probe #6 + the controller-side seam confirmation (FOLLOWUP, this date); the
serving-path round's carryovers; `.claude/skills/lws-protocol`, `prof-conneg`, `json-ld`,
`mcp-protocol`, `solid-protocol` pins. VoID = W3C Interest Group Note "Describing Linked
Datasets with the VoID Vocabulary" (registered well-known URI `/.well-known/void`).
**Supersedes:** nothing — drains the "next-fork-round batch" + "affordance/steering sub-batch"
recorded in FOLLOWUP 2026-07-11.

---

## 0. Why this exists

Probe #6 confirmed the serving-path flip (Turtle never lies) and, with the controller-side
supplement, confirmed the predicted residual live: a stored plain-`application/json` document
enters the RDF serving arm (`isRdfContentType` counts `application/json`; call sites never pass
`sourceContentType`, so it defaults JSON-LD) and serves **200 empty Turtle** — the probe-#4
signature on a new surface. The same probe showed the affordance meta-pattern across all six
probes: **where the pod teaches, cold agents succeed; where it stays silent, they strand.** The
silent arms left: non-RDF sources 200ing the authored format to specific RDF Accepts (F3), the
root shadow eating every Accept (three probes stranded), the profile-406 without teaching, a
401 wearing a granting `wac-allow`, and OPTIONS dropping the storage-description Link.

The round also completes the **gateway**: the pod root must serve as a cold agent's entry point
— what this is, where things live, how to walk it (Chuck: "like an `llms.txt`"). The storage
description already IS that gateway (five probes found and used it); this round makes its
instructions complete and true, and adds the prior-salient dataset/vocabulary map at the
registered `/.well-known/void`, under a hard rail: **no vocabulary without a pod-served
definition** — proto-knowledge (VoID, DCAT, SKOS) is in model priors, but the OOD vocabularies
(`lwsp`, llm-wiki Edge-Types, `okf`, LWS itself) are only meaningful if the pod itself serves
them (linked-data self-containment; the pinned-mirror discipline extended outward).

## 1. Scope and hard constraints

- Fork work on `la3d/lws`, new branch off the serving-path merge `1783c6a`. lws-pod work on
  `main` (publish/VoID materialization, gates, rig).
- **Every fork arm is `--lws`-gated.** The `--lws`-off path (incl. `--conneg`-only) stays
  byte-identical, held by dedicated negative-control tests per task — the standing invariant.
- The legacy `isRdfContentType` (src/utils/url.js) is **untouched** — `--lws`-off byte-identity.
  The serving arm gets its own narrower source predicate.
- OUT of scope: remote-arm size bound + SSRF guard (the federation-hardening round); host-aware
  `urlToStoragePath`; `/id/` dereference (deferred to L4 read-side, §7); console-on-fork rewire;
  seed hygiene beyond what gates touch.

## 2. The sourceContentType seam (both faces)

**Thread the stored type.** File GET/HEAD call sites (`src/handlers/resource.js` file arms) pass
`sourceContentType: storedContentType` into `serveStoredRdf`/`checkServable`. `toDataset`
already parses Turtle/N3 input, so a stored `.ttl` serves correctly in every negotiated format.
Container arms keep the JSON-LD default (they serve generated membership graphs).

**Narrow the serving gate.** New serving-side predicate (e.g. `isRdfSourceType`): the RDF types
minus `application/json`. Plain JSON is a **non-RDF source** for serving — §3's teaching policy
applies. Under `--lws`, a bare GET of a `.json` resource serves `application/json` (today it
mislabels as `ld+json` via the legacy arm; that arm is unchanged for `--lws`-off).

**The rule, stated once and implemented everywhere:** *own format = bytes-are-bytes (200);
conversions = parse or teach (406).* This generalizes the existing JSON-LD precedent ("bytes are
bytes") symmetrically: a stored `.ttl` requested as Turtle serves its bytes; requested as
N-Quads it parses + serializes; unparseable + conversion requested → teaching 406.

`.lwstypes` note: HTTP GET of dotfiles is blocked wholesale (403 "Dotfile access is not
allowed", any auth) — the sidecar face of the seam is moot on HTTP; the MCP read path already
serves them `application/json` (S3). No HTTP change; recorded.

## 3. Teaching policy on non-RDF sources (F3) + one error shape (F5)

**F3.** Under `--lws`, a non-RDF source (markdown, plain JSON, any non-RDF stored type)
receiving a **specific, unsatisfiable** Accept (no wildcard match, q-aware) answers the teaching
406: authored format, the declared alternate representations from the `altr:` data (media +
profile pairs), and the Accept-Profile route. `*/*`, `text/*`-matching, or absent Accept →
authored format 200, unchanged — browsers and naive clients see nothing new.

**F5.** The profile-406 ("no representation conforms…") moves onto the same RFC 9457
problem+json builder as the media-406 and **lists the profiles that would conform** (from the
`.meta` alternates, authz-filtered). One 406 grammar across both conneg dimensions; clients need
one error parser.

## 4. The gateway

**A1 — alternates on the bare 200.** The header builder already receives `advertisedReps`; emit
`rel="canonical"/"alternate"` Links (`type`=media, `formats`=profile) on **un-negotiated**
GET/HEAD 200s too, through the existing per-client no-oracle authz filter. One request reveals
the representation graph; kills the "three-request entry cost."

**A2 — shadow honors non-HTML Accepts.** Under `--lws`, index.html shadowing applies only when
the request accepts HTML (explicitly or via wildcard). A specific non-HTML Accept
(`application/lws+json`, Turtle, linkset, …) negotiates the real container. Root enumeration
works by plain conneg — the acceptance criterion. The serving-path linkset-rel suppression on
shadowed containers is **reverted** (the rel is honorable again). Browsers unchanged.

**A3 + nav hints.** Storage description gains: (a) the navigation hint — data lives under
top-level containers; list them by GETting `/` with `Accept: application/lws+json` (true once
A2 lands); (b) the TypeSearch syntax hint (`?type=<uri>` + the CNF filter form) on the search
service entry — recorded at probes #3/#5/#6; (c) the VoID advertisement (§5).

## 5. VoID at the registered well-known (fork rung + data)

**Fork rung:** `--lws-void <path>` / `JSS_LWS_VOID` (default off — the `--lws-profile-index`
precedent exactly). `/.well-known/void` → **303** to the configured pod resource (the VoID note
blesses redirect discovery). Storage description advertises it as a service entry. The fork
never generates VoID content — the document is **data** (P13).

**Materialization (lws-pod, publish):** a manifest-driven `void` step in `projection/publish/`
builds `void.jsonld` from `defs/index.jsonld`: one `void:Dataset` for the pod —
`void:rootResource` (top-level data container), `void:uriSpace` for the `/id/` namespace, a
`void:subset` per bound application family with `dcterms:conformsTo` → its profile descriptor —
and **every vocabulary as a described resource with `void:dataDump` → the pod-served pinned
mirror artifact**, never a bare external URI. The manifest (`defs/index.jsonld`) gains the void
configuration — root container, `uriSpace` — as data, not code. Published to the profiles
container; the rig points `--lws-void` at it.

**The deref rail (declaration check):** every vocabulary the VoID doc declares must resolve to
a pod-served artifact declared in the manifest, or appear in an explicit `declaredExternal`
list (the `knownVocabGaps` pattern — deliberate, visible, checked). Publish fails loud
otherwise. "No vocabulary without a pod-served definition" is mechanical, not aspirational.

**Rationale (priming-ablation lesson):** VoID/DCAT/SKOS are in model priors — a
semantic-web-literate cold agent probes `/.well-known/void` unprompted (like it expected
`ldp:constrainedBy`). The OOD vocabularies are exactly where the link must dereference
in-pod. `void:uriSpace` also ships the `/id/` signpost (§7).

## 6. Correctness smalls

- **F1:** a 401/403 never carries a granting `wac-allow` — compute the client's real modes;
  empty grants on denial (`/alice/settings/` already behaves; `/.acl` doesn't).
- **F7:** OPTIONS carries the storageDescription Link, parity with GET/HEAD.
- **ETag-per-variant:** variant-keyed strong ETags — served-content-type suffix, plus the
  auth-visibility key on WAC-filtered listings (closes the recorded S1 stale-variant note).
  Format-switching clients revalidate correctly; shared caches stop cross-serving variants.
- **Container-HEAD quads parity:** HEAD's directory branch calls `selectContentType` with the
  lws 3-arg form (today GET can serve n-quads where HEAD reports ld+json).
- **Envelope-admission e2e pin:** fork test — Turtle-PUT shape → non-conforming write still
  rejects through the `{@context,@graph}` store form (closure held by composition since the
  serving-path round; now pinned).
- **Hygiene:** bare-`.acl` listing-filter test; `e.message` hardening in serve.js;
  extractCertKeys-JSDoc + url.js comment nits (recorded minors).

## 7. A4 — the /id/ namespace

`void:uriSpace` ships the signpost: the subject namespace is declared and attributed to the
pod. The **dereference decision** (303-to-storage vs documented non-deref) is **deferred to the
L4 read-side identity design** — recorded here so probe findings about `/id/` route there
instead of re-opening it ad hoc.

## 8. MCP batch

- `readContainerView` (src/mcp/resources.js) runs the per-member WAC checkAccess-and-drop loop
  — S1 parity on the MCP surface (probe-#3 class, T6 finding).
- Folded minors (same files, affordance-class): origin-normalization dedup at the tool
  boundary; `localLinks` stops emitting a 404ing `up` for fixed `.well-known` resources;
  bare-origin (`uri === ctx.origin`) normalization + test; `describe_resource` path-wins
  precedence documented.
- Remote-arm hardening (size bound + SSRF) explicitly **stays out** — federation round.

## 9. Testing, verification, rollout

**Gates (lws-pod):** `make test-conneg` grows the round's live cases — F3 teaching-406 on
markdown AND plain JSON + wildcard-unchanged negative; A1 alternates on the bare 200; A2 root
listing by conneg (+ browser-Accept unchanged); ETag-variant; F1 wac-allow; F7 OPTIONS; unified
profile-406 shape. New `make test-void` (or a `test-profiles` extension — implementer's call):
publish → `/.well-known/void` 303 → doc parses as RDF → every `void:dataDump` GETs 200 from the
pod → deref-rail check fails loud on an undeclared external. MCP cases into `test-mcp-v2`.
Envelope pin in the fork suite. Negative controls per task. Full sweep before close.

**Rig:** repin to the merge SHA (new image tag), `--lws-void` in `docker-compose.fork-tls.yml`,
runbook re-seed list updated (gained `/alice/graphs/` 2026-07-11).

**Probe #7 — two arms, one close-out, separate session per the probe protocol:**
- **Arm A (MCP-cold, main):** fresh agent given ONLY `https://pod.vardeman.me/mcp` + the CA. It
  bootstraps entirely through MCP: initialize → `tools/list` → navigate via
  `read_resource`/`list_resources` + the links carrier. Read-only tools only. Battery:
  reconstruct pod structure, walk a profile chain and the VoID doc through MCP reads, report
  affordance gaps.
- **Arm B (HTTP-cold, small):** a second fresh agent given only the pod root, NO battery — the
  prior-salience test: does it probe `/.well-known/void` unprompted; can it walk the OOD
  vocabularies without leaving the pod?
Findings recorded in FOLLOWUP before further fork work.

## 10. Decision log (2026-07-11, Chuck)

1. **F3 = 406-teach + A1 alternates** (over keep-200-only and media-303): wildcards unaffected;
   symmetric with the dataset teaching; RFC 9110 blesses listing representations on 406.
   Media-303 rejected — couples the media dimension to profile machinery and can't disambiguate
   multiple profiles sharing a media type.
2. **Root = gateway** ("like an llms.txt"): the storage description is the canonical entry —
   already proven by five probes — made complete (nav hint) and true at root (A2). No separate
   hand-prose gateway doc (would front-run the pod-served operating-skills layer). `/llms.txt`
   alias not taken this round.
3. **VoID this round, with the deref rail**: `/.well-known/void` is a registered well-known and
   deep in model priors; bare external vocabulary links rejected as the OOD dead-end failure
   mode. Every declared vocabulary carries a pod-served `void:dataDump`, enforced at publish.
4. **MCP minors folded in** (probe #7 walks that surface); federation hardening stays out.
5. **/id/ deref deferred to L4 read-side**; `void:uriSpace` ships the signpost now.
