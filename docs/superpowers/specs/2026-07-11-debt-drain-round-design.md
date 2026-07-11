# Debt-drain round — design of record

**Date:** 2026-07-11. **Status:** approved (Chuck, this date, section-by-section).
**Grounding:** probe #7 (both arms) + the accumulated FOLLOWUP carryover ledger;
`.claude/skills/lws-protocol` (the normative anchors below), `mcp-protocol`, `solid-protocol` pins.
**The rule this round runs under (Chuck, 2026-07-11):** every open item gets exactly one
disposition — **FIX** (this round), **WON'T-FIX** (explicit decision, rationale recorded, item
deleted), or **DESIGN** (routed to the L4 read-side design round). FOLLOWUP's carryover section
ends this round **empty** except the single L4 pointer. No item is swept forward.

---

## 0. Why this exists

The carryover queue has been compounding across rounds: `publish.mjs`-should-learn-ACLs recorded
three times, federation hardening deferred twice, `suppressLinkset` flagged three times before
deletion. The gateway round validated the built surface (probes #6/#7 both passed); this round
drains the debt instead of building new surface.

Probe #7 also exposed one defect that is not debt but a **spec conformance gap**: `.ttl`-named
artifacts serve JSON-LD bytes labeled `text/turtle`, because the write path converts non-JSON-LD
RDF to the JSON-LD envelope while the name keeps its extension. The LWS read binding is explicit:

> *"Respond with 200 OK, body containing the data, and **Content-Type matching the stored media
> type**."* … *"The content is **exactly the stored data** in the file."*
> — lws10-core, read-resource binding

and container listings MUST carry each member's `mediaType` (advertisement must equal response).
The root cause is the write-side conversion, not the serving arm — fixed at the root in §2.

## 1. Scope and hard constraints

- Fork work on `la3d/lws`, new branch off `be2ddba`. lws-pod work on `main`.
- **`--lws`-off byte-identity** holds for every change: the off path (incl. `--conneg`-only pods)
  stays byte-identical, pinned per task by negative controls — the standing invariant.
- **`--lws` + `--conneg`-off pods change BY DESIGN this round** (§4: `--lws` implies the
  LWS-mandated negotiation surface — the previous half-negotiating combination was
  spec-nonconformant). The new behavior is pinned by tests; this is the one deliberate
  behavior change outside the `--lws`+`--conneg` pairing.
- No new npm dependencies. P13 throughout: code guards, applications are data.
- OUT of scope: the L4 read-side design cluster (§8), the operating-skills layer, the console
  rewire (rides on L4), CDC/watcher runtime (freshness story documented instead, §7).

## 2. Representation preservation (B1 root fix, fork)

**The rule: the pod stores what the client submitted; every surface tells the same truth.**

- Under `--lws`, the write path **stops converting** non-JSON-LD RDF bodies (Turtle/N3/
  N-Triples/N-Quads): the submitted bytes are stored exactly. JSON-LD writes keep the
  self-describing `{@context,@graph}` envelope (a Turtle document is already self-describing as
  Turtle; the envelope solved a JSON-LD-array problem, not a Turtle problem).
- **Write-time consistency gate (teaching 400), PUT and POST-create:** under `--lws`, if the
  target name's extension-derived type contradicts the submitted RDF `Content-Type` (e.g. PUT
  `text/turtle` to `x.jsonld`), or an RDF body targets an extension-less name (would serve as
  octet-stream — T11's face), the write answers a teaching 400 naming the mismatch and the fix
  ("name the resource `.ttl`, or submit as application/ld+json"). The `.meta`/`.acl`/`.lwstypes`
  sidecar overrides count as their mapped types (a JSON-LD `.meta` bind is consistent). Truthful-by-construction: the
  extension-derived stored type is then always correct.
- Serving needs no new mechanism: T1's threading already parses Turtle-at-rest through the
  dataset seam for conversions; own-format = bytes-are-bytes now serves genuinely-Turtle bytes.
  Admission validates Turtle bodies directly (`datasetFromTurtle` — already in the seam).
- Consistency by construction: served `Content-Type` = stored type; `items[].mediaType` = stored
  type; profile descriptors' `format:` claims match what a GET returns.
- **No migration.** Artifacts converted before this round heal on the next
  `make publish-profiles` re-PUT (stored as true Turtle); `make reset` is the fallback story —
  the same no-migration stance as the store-form shim retirement. Stale unhealed files may still
  mislabel until republished; the rig step in §9 republishes.
- `--lws`-off: the upstream conversion behavior is unchanged, byte-identical.
- Tests: round-trip pin (PUT Turtle → GET returns the exact bytes, `text/turtle`); mismatch-400
  teaching cases; T11's envelope pin **narrowed** to JSON-LD-submitted multi-subject shapes +
  a new Turtle-at-rest pin (shape stored as Turtle → admission still rejects non-conforming
  writes; the N3-exclusion guard gets its missing test here too).

## 3. Conditional-request correctness (fork)

**406 wins.** Preconditions apply only to requests that would otherwise succeed (RFC 9110
§13.2.2): the file GET/HEAD If-None-Match evaluation moves after the negotiation outcome is
known — a request that would 406 (media F3 arm OR profile arm) answers the teaching 406, never
a 304, regardless of presented ETags. The file-304 `Vary` gains `Accept-Profile` in the same
pass (parity with the 200's Vary). This closes the whole conditional family: the Range+linkset
nuance and the HTML-island residual become moot or explicitly pinned by the new ordering tests.
GET/HEAD parity throughout.

## 4. Flag consolidation (fork)

**End state: `--lws` alone = the full conformant surface.**

- **`--lws` implies the LWS-mandated negotiation surface.** LWS core: *"Servers MUST support
  content negotiation for `application/lws+json`, `application/ld+json`, and `application/json`
  for container representations"* (+ Turtle as the sanctioned MAY). The `connegEnabled` guards
  inside `--lws` arms become unconditional under `--lws`; `--conneg` remains the upstream flag
  governing `--lws`-off pods only. The F3-nesting asymmetry stops existing.
- **`--lws-profile-index` and `--lws-void` are REPLACED (no aliases)** by
  `--lws-config <pod-path>` / `JSS_LWS_CONFIG`: one pod resource declaring service pointers as
  data: `{ "profileIndex": "<pod-path>", "void": "<pod-path>" }` — both entries optional; an
  absent entry = that service off, exactly like the old flags' defaults. **Read lazily with
  mtime-based caching** (a fresh pod boots before its first publish creates the resource —
  startup-read would crash-loop): file absent = services off, warned once; file present but
  malformed = error logged loudly, services off (the pod itself keeps serving). Publish creates
  the resource, and the next request picks it up — no restart needed. Future service rungs add
  a key, never a flag.
- **Flags-object threading:** one resolved `lwsConfig` object flows bin → config → server →
  storage-description builder → MCP ctx, replacing per-flag threading (T7's 6-touch-points note,
  raised three times, closed).
- `--no-lws-type-index` / `--no-lws-profile-conneg` stay as default-on safety valves.
- Rig compose and docs move to `--lws-config /alice/profiles/pod-config.jsonld`; the
  `pod-config.jsonld` resource is data in the publish tree (§7).

## 5. MCP affordance batch (fork)

- **Guard parity:** MCP-native `resources/read` wraps pod content in the same untrusted-content
  fence as `read_resource`/`describe_resource` — one guard, both read paths (probe-#7 A1).
- **Alternates in the links carrier:** `read_resource` and `describe_resource` surface the
  authz-filtered `rel="canonical"/"alternate"` representations alongside the existing
  governance links, plus the teaching sentence in `describe_resource`'s output: *"representations
  are negotiable via `Accept-Profile: <conformsTo-uri>`; alternates are listed as
  `rel=alternate`"* (A2 — conneg-by-profile becomes discoverable without dropping to HTTP).
- Smalls: `read_resource` links-block mimeType reports the real stored type (A5); the no-oracle
  denial reads "not found or not authorized" (A8); `lws_type_search`'s description states that
  empty arguments return the full inventory (A9); the container `items[]` mediaType derivation
  routes through `getContentType` so suffixed sidecars report `application/ld+json`
  (controller-verified defect); the McpService hint gains one sentence naming the anonymous
  budget, rendered from the configured `anonRateLimitMax` ("anonymous callers: 60 requests/
  minute — authenticate for more; the x-ratelimit headers carry your remaining budget").

## 6. Federation hardening (fork)

The `read_resource` remote arm (deferred twice, closed now): a **response-size bound** (the
`readBounded` cap family — oversized remote bodies are truncated-with-flag or refused, never
buffered unbounded) and an **SSRF guard** — deny loopback, RFC 1918, link-local, and
metadata-service ranges after DNS resolution, default on; `--lws-federation-private` opt-in
re-enables private targets for the local rig (the "may be a feature" question now decided:
opt-in, default off). Teaching error bodies on both refusals.

## 7. lws-pod side

- **`publish.mjs` provisions ACLs by default** (the OPS gap recorded 3×, closed): public-read +
  owner-control (`isDefault: true` both) via the pod's own MCP `write_acl`, on the profiles
  container and every `--bind`/`--instantiate` target; idempotent; `--no-acl` opts out. The
  reseed runbook becomes `POD_TOKEN=… make publish-profiles`, one command.
- **`pod-config.jsonld`** joins the publish tree + manifest (the §4 resource) — data, checked
  by a small declaration check (paths resolve to manifest-known resources).
- **mcp-v2 gate gets `afterAll` cleanups** — the residue pile stops regrowing.
- **`make reinstantiate`** target (re-runs bind+instantiate for every manifest family) + the
  derived-view freshness story documented in README/FOLLOWUP: aggregates are build products;
  deletion does not auto-refresh them; `make reinstantiate` is the refresh; the CDC watcher
  remains a deliberate non-goal until an application needs it.
- Smalls: `void:rootResource`/`uriSpace` shape consistency in `buildVoid`; gates grown per §9.

## 8. Dispositions: WON'T-FIX (deleted, rationale recorded) and DESIGN (routed)

**WON'T-FIX:** host-aware `urlToStoragePath` under `--subdomains` (the S6 startup refusal IS the
guard until subdomains are actually wanted); cost-weighted/token-bucket rate limiting (the
x-ratelimit headers advertise the budget; two probes never approached the wall — revisit only on
probe evidence); `authorize()` public-mode `.acl` short-circuit (upstream behavior in the no-WAC
dev mode neither rig runs); phantom `X-Cost`/`X-Balance` CORS headers (baseline JSS payment
surface, dormant by design); the thin root linkset (correct — an unbound container has no
governance edges; the storage description is the root's map, as probe #7 itself concluded).

**DESIGN → the L4 read-side round (immediately after this one, its own brainstorm→spec):**
`/id/` dereference (now with live evidence: declared uriSpace 401s to anonymous), referent-type
indexing (typed `#it` subjects invisible to type search), earned-at-admission `conformsTo`,
defaultProfile precedence, B7 identity-policy vocabulary. Probe #6/#7 findings attach as inputs.

## 9. Testing, verification, rollout

- **Gates (lws-pod):** `test-conneg` grows — Turtle round-trip (exact bytes), mismatch-400
  teaching, 304-never-beats-406 (both dimensions), Vary parity; `test-void` unchanged;
  `test-mcp-v2` grows — fenced `resources/read`, alternates in the links carrier, budget hint
  presence; a `test-config` case (storage description reflects pod-config entries; missing
  config = services absent). Fork suite: per-task negative controls + the §2 pins.
- **Rig:** compose moves to `--lws-config`; `make publish-profiles` (now ACL-provisioning)
  republishes — healing the converted artifacts; repin to the round's merge SHA, new image tag.
- **Close-out:** full sweep; then a **targeted controller-run verification** of the two changed
  cold surfaces (representation round-trip incl. a re-run of Arm B's `.ttl` checks; the MCP
  alternates/fence via a short Arm-A-style walk) — a full cold probe #8 waits for the L4 round.
  FOLLOWUP's carryover section is rewritten to **empty except the L4 pointer**; the ledger and
  foundations/05 rows update accordingly.

## 10. Decision log (2026-07-11, Chuck)

1. **B1 = preserve the representation** (over normalize-and-advertise and serve-side sniff):
   grounded in the LWS read binding ("exactly the stored data", "Content-Type matching the
   stored media type") + the advertisement-consistency requirement Chuck set. Write-time
   teaching 400 keeps extensions truthful; no migration (republish heals; reset is the story).
2. **406 wins over 304** (RFC 9110 §13.2.2); the conditional family closes rather than carries.
3. **Full flag consolidation**: `--lws` implies LWS-mandated conneg (the half-negotiating
   combination was spec-nonconformant); path flags collapse into `--lws-config` (config-as-data,
   replaced outright, no deprecation aliases — experimental substrate); flags-object refactor
   rides along. Raised by Chuck: "shouldn't this eventually just be the --lws flag?"
4. **publish ACLs default-on** via MCP `write_acl` + `--no-acl` (the 3×-recorded OPS gap dies).
5. **The drain rule**: FIX / WON'T-FIX / DESIGN — nothing swept forward; carryovers end empty
   except the L4 pointer.
