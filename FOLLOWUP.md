# Follow-ups

Between-session state for lws-pod. Open items only; closed work lives in commit history and
`docs/foundations/05-jss-spec-conformance.md`. **Read this first when resuming.**

---

## ▶▶ DONE — JSS substrate evaluation (2026-06-21)

**Verdict: JSS is a good replacement for CSS — proceed to build the L2 memory layer on it.**
Eval pinned to JSS **v0.0.209**. Full evidence: `README.md` checklist (all checked) +
`docs/foundations/05-jss-spec-conformance.md` (per-axis CONFORMS/EXTENDS/DIVERGES/GAP, every
claim cited). Live probes: `experiments/smoke.sh` (steps 7-11) and `experiments/headless-cid/`.

What shipped this eval (all on `main`):
- **7 grounded skills** in `.claude/skills/` — verbatim, source-pinned, contamination-free
  (`scripts/check-skill-grounding.sh` enforces). Spec: lws-protocol, solid-protocol,
  shacl-constraints, comunica-sparql, okf, semantic-markdown. Implementation: jss-server.
- **Conformance map** `docs/foundations/05-jss-spec-conformance.md`.
- **`experiments/smoke.sh`** (archived) carried the 5 live tests; now ported to the Vitest suite (`make test`).
- **`experiments/headless-cid/`** — headless LWS-CID provisioning + auth probe (Node + jose).
- **TLS variant** — `make cert` / `up-tls` / `cid-tls`, `docker-compose.tls.yml` (mkcert,
  `pod.vardeman.me:8443`), reusing cogitarelink-solid's approach. `certs/` gitignored.

Live-verified: persistence (down/up), RS256-JWT headless bearer, MCP=WAC CRUD/ACL, Solid conneg,
git push → `ldp:contains` member, CID-shaped profile, **headless key provisioning works**,
JSS serves `.meta`+`ldp:constrainedBy` (admission proxy ports).

---

## ▶ OPEN — when building the L2 layer (none block the substrate decision)

1. **LWS-CID auth on a PUBLIC deployment** (axis 6, DEFERRED by decision). Self-signed-JWT auth
   is blocked locally: JSS hardcodes `blockPrivateIPs: true` in `src/auth/cid-doc-fetch.js`, so
   the verifier refuses a WebID on a loopback/private IP. To close axis-2's **bearer-replay**
   concern: deploy JSS to a public host + domain and re-run `experiments/headless-cid/` (Phase 1
   provisioning already works; only Phase 2 auth is unproven). Until then the practical headless
   credential is the **replayable RS256 bearer** — weigh that for any agent-trust design.
2. **L2 admission floor harness** (axis 7). The `constrained-container/` proxy reads `.meta`+shape
   **unauthenticated**; on JSS those are owner-only and `.acl` PUT returned **415** in testing.
   Settle either (a) public-read ACL provisioning (find JSS's accepted `.acl` write form), or
   (b) have the proxy forward the requester's `Authorization` on its constraint reads (the
   cleaner fix — lets it govern protected containers). Mechanism itself is confirmed working.
3. **In-process projection / auto-commit** (axis 7). No native JSS write hook (no plugin API,
   docs-confirmed). Projection-on-write and git-commit-on-write run as the sidecar proxy, not
   in-process, unless JSS exposes `storage.write()`. The proxy is server-agnostic, so this is
   acceptable — note it in the L2 design.

---

## 📍 Navigation (resume order)

1. This file → the verdict + open items.
2. `docs/foundations/README.md` → the four canon docs + the conformance map.
3. `docs/foundations/05-jss-spec-conformance.md` → per-axis spec-vs-JSS, "Live test results".
4. `.claude/skills/` (auto-loaded) → ground truth on specs + JSS; `jss-server` = what the server
   does, `solid-protocol`/`lws-protocol` = what the standard says.
5. The L2 IP to port: `constrained-container/` (admission), `docs/wiki-memory-dual-projection.md`
   (content model), `docs/foundations/04-comunica-patterns.md` (query path).

## Eval pods (still running as of 2026-06-21)

`lws-pod` (http :3838), `lws-pod-tls` (https :8443). `make down` / `make down-tls` to stop.
Test cruft left on the http pod (alice/notes, alice/gitq, alice/concepts, gitprobe-* repos) —
harmless; `make reset` clears it.

## Next session

Brainstorm phase 1 of the L2 build — likely `constrained-container` hardening (open item 2) +
the projection-on-write path. Start with `/brainstorming`, scope, then plan.
