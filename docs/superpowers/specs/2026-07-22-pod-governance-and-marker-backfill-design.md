# Pod governance layer + lws:Storage marker/owner backfill — design

**Date:** 2026-07-22
**Status:** approved (brainstorm with Chuck, this date)
**Grounds:** `.claude/skills/lws-protocol` (LWS 1.0 core/vocab/UCS), `.claude/skills/solid-protocol`
(Solid Protocol owner + WAC), CDIF handbook (schema.org implementation, ODRL chapters), W3C ODRL
Vocabulary 2.2. Fork state as of `la3d/lws` @ `4d01f41`.

## 1. Problem

Two gaps, resolved together because the same migration walk closes both:

1. **Marker migration gap (the FOLLOWUP ticket).** The `lws:Storage` marker in a pod root's
   `.lwstypes` is written only at provisioning (fork `a8e0c47`, 2026-07-15). The boot path skips
   provisioning when `profile/card(.jsonld)` exists, so pods provisioned earlier never get the
   marker and silently lose storage discovery on upgrade: `storageRootFor()` treats them as
   non-storages — per-storage `lws-storage` 404s, ServerIndex omits them, referent 303s and
   navigator views never arm. No crash, no warning.
2. **No governance record.** Solid Protocol: *"Servers MUST keep track of at least one owner of a
   storage in an implementation defined way."* Today the fork tracks owners only implicitly (root
   `.acl` Control grants, IDP account webId, profile `pim:storage`). There is no canonical
   per-storage owner record, no operator identity for the deployment (in multi-tenant mode the
   server root has no identity at all), and no `solid:owner` advertisement.

The backfill walk visits every storage root with provisioning knowledge in hand — it is the one
moment to record both facts without a second migration later.

## 2. Model

Three layers. Every party is a dereferenceable URI; nothing assumes locality — the operator may be
an external organizational pod's WebID, a storage owner's WebID may be hosted elsewhere. This is an
ecosystem of interoperating pod deployments; ownership is a relation between URIs.

| Relation | Term | Scope | Source of truth |
|---|---|---|---|
| deployment → operator | `schema:provider` | deployment | config (env/flag), surfaced only |
| storage → owner(s) | `solid:owner` (≥1) | storage | System-Managed `.lwsowner` sidecar on the storage root |
| owner → storage | `pim:storage` | agent profile | owner's WebID profile (already emitted for local profiles) |

**Why the split (migration semantics):** a copied/re-homed storage (S3 bucket, rsync, git clone)
keeps its owner — the fact travels with the data, so it lives in a sidecar inside the storage. The
operator legitimately *changes* on re-homing — the fact describes the current deployment, so it
lives in config and is only surfaced into generated resources. A sidecar-held operator would arrive
stale after every migration. Rule of thumb: facts that survive re-homing live in the storage; facts
that describe the current deployment live in config.

**Vocabulary rationale (CDIF/ODRL compatibility, decided 2026-07-22):**

- `solid:owner` + `pim:storage` are the normative Solid pair; neither CDIF nor ODRL competes at the
  storage layer.
- `schema:provider` for the operator: schema.org defines provider as *"the service provider,
  service operator, or service performer"* — exactly this relation; the `schema:` prefix is already
  in the LWS storage `@context`; CDIF's implementation layer is schema.org JSON-LD, so CDIF
  harvesters read it natively. `dct:publisher` MAY alias the provider on DCAT-catalog profile
  surfaces where DCAT-AP expects it; `schema:provider` is canonical.
- ODRL has **no owner term** — parties enter policies via functions (`odrl:assigner` = issuer of a
  rule). Forward-compatibility is structural, not lexical: parties stay URIs (a future policy names
  the owner as `odrl:assigner`), and the storage description keeps room for a future
  `odrl:hasPolicy` (LWS: "additional properties MAY be present"). Nothing built now, nothing to
  migrate later.

**Descriptive-only (this round).** The governance record never feeds the WAC checker; ACLs remain
the sole authorization source. This diverges from Solid's "an owner implicitly has control over all
resources in a storage" — recorded as a deliberate, documented gap. Implicit owner Control is an
explicit agenda item for the authorization-server round (FOLLOWUP order-of-work item 4), where it
would get its own adversarial review; it would also close the owner-lockout class and the SEC-1 F3
residual (bare root fails closed for its own owner).

## 3. Records

**`.lwsowner` sidecar** — one per storage root, sibling to `.lwstypes`: a JSON array of owner URIs,
≥1 entry, order irrelevant, no other structure. System-Managed: joins the reserved-sidecar class at
**every existing choke point** — the shared `auxSubject` classifier (SEC-1), `AUX_SUFFIX_RE` /
`AUX_SUFFIX_CI_RE` (case-insensitive, F1 hardening inherited), `SIDECAR_SUFFIX`, write-consistency
refusal, remoteStorage skip-list + listing-hiding. Client writes refused on all three surfaces
(HTTP, MCP, remoteStorage); reads READ-gated on the subject storage root like `.lwstypes`.
Owner change is an operator action on the sidecar (out-of-band for now); the format supports
multiple owners and replacement without change.

**Operator config** — a new option (flag + env var) holding the provider URI. Optional: when
absent, no provider is emitted anywhere. The value is opaque to the server (no fetch, no
validation beyond absolute-URI); it may point at another deployment entirely.

## 4. Surfacing

- **Per-storage description** (`GET /:pod/lws-storage`, `application/lws+json`): new `owner`
  property, context-mapped to `solid:owner`, value = array of URIs. Context addition: `solid`
  prefix + `owner` term in the LWS context object.
- **Storage root** (`GET`/`HEAD /:pod/` and `/` in root-pod mode): `Link
  rel="http://www.w3.org/ns/solid/terms#owner"` targeting each owner URI — the exact header Solid
  mandates when a server advertises the owner.
- **Deployment**: `schema:provider` on the well-known ServerIndex and on the root storage
  description in root-pod mode. Deployment-public by design (same visibility class as the server
  banner); no gating.
- **Privacy: READ-gated owner, by inheritance not new logic.** Both owner surfaces already require
  READ before a 200 exists (per-storage description is WAC-gated since the multi-tenant round; the
  root container response implies READ passed). The ServerIndex stays roots-only — no owner column
  — so no new identity oracle opens. Explicitly NOT weakening: the 404-unmarked vs 401-private
  distinction stays as reviewed.

## 5. Provisioning + boot self-heal (the backfill)

**New pods:** `createPodStructure` and `createRootPodStructure` write `.lwsowner` (owner = the
provisioning WebID) alongside the existing marker stamp. Same choke points as `a8e0c47`.

**Existing pods — boot-time self-heal**, gated on `--lws`, after storage init:

1. **Roster assembly (roster-only, no structural heuristics):**
   - named pods: IDP username index (`.idp/accounts/_username_index.json`) → account → pod path +
     WebID;
   - single-user named pod: boot config (`singleUserName`) → computed WebID;
   - root pod: the same `profile/card(.jsonld)` existence check the boot path already uses; owner =
     `<podUri>profile/card#me` against whichever card variant exists (legacy-layout aware).
   - A pod-shaped tree that is in none of these (copied in out-of-band) stays unstamped —
     documented operator remedy (drop the marker + sidecar manually), because a wrong guess in a
     root-pod deployment carves a false tenant boundary that shadows the root storage
     (`storageRootFor` checks named candidates first).
2. **Stamp:** for each roster entry whose root exists: add `lws:Storage` to `.lwstypes` by
   **read-merge-write** (never `captureDeclaredTypes` blind — it overwrites, and a root may carry
   other declared types); write `.lwsowner` if missing (never overwrite an existing one — an
   operator may have edited it).
3. **Discipline:** each repair logged loudly (`pod`, what was stamped); never fatal (Phase D
   discipline — a read-only data dir degrades to the pre-backfill state with a warning, it does not
   stop boot); idempotent no-op on healthy deployments; one line in the boot capability report
   (`src/lws/capability-report.js`) summarizing `backfill: n markers, m owner records` or `clean`.
   The storage-resolver positive-only cache needs no invalidation (marker status is monotonic).

## 6. Testing

**Fork (node:test, mirroring existing suites):**

- Legacy-tree fixture: provision → strip marker + `.lwsowner` → reboot server → both healed;
  pre-existing extra types in `.lwstypes` preserved; healthy boot = byte-identical no-op; second
  boot after heal = no-op (idempotence).
- `.lwsowner` write/delete refusal on HTTP, MCP, remoteStorage, including mid-name and
  case-variant suffix tricks — mirror `test/sidecar-authz.test.js` +
  `test/remotestorage-sidecar-authz.test.js` style (`storage.exists` oracle).
- Surfacing: owner property + Link on a readable storage; unreadable storage's responses carry
  nothing new (401/404 unchanged); ServerIndex unchanged; provider emitted iff configured;
  root-pod mode surfaces both.
- Read-only data dir: boot completes, loud warning, no crash.
- Negative control: `--lws`-off responses byte-identical; no sidecar writes.

**Rig (lws-pod):** new `make test-governance` live gate on the fork-tls rig (owner Link +
description property for alice, provider on ServerIndex, backfill verified by stripping a marker in
`./data` and restarting); capability manifests updated; existing 21-gate sweep stays green.

## 7. Out of scope (recorded, deliberate)

- Implicit owner Control in WAC (authorization-server round, item 4).
- ODRL policy documents / `odrl:hasPolicy` emission (future; structure kept compatible).
- Owner-change admin API/surface (operator edits the sidecar; format already supports it).
- Adopting out-of-roster pod-shaped trees (documented manual remedy only).
- `dct:publisher` aliasing on DCAT-catalog surfaces (note for the dcat-catalog profile family, not
  this round).

## 8. Decision log (this brainstorm)

1. Governance-first: backfill folded into the governance round as its migration (Chuck).
2. Unified operator model; operator URI may be external — linked-data principles are load-bearing
   (Chuck).
3. Vocabulary: `solid:owner` + `pim:storage` + `schema:provider`, chosen after CDIF/ODRL review;
   `dct:publisher` demoted to DCAT-surface alias (Chuck approved).
4. Record home: owner sidecar in-storage, operator in config — migration-semantics argument
   (Chuck approved, after the S3/git backend discussion).
5. Owner advertisement READ-gated (Chuck).
6. Descriptive-only this round (Chuck).
7. Boot-time self-heal, roster-only detection (Chuck).
