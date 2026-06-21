# headless-cid

Does an agent need the browser [doctor](https://github.com/JavaScriptSolidServer/doctor) to get
a self-issued identity on JSS, or can it do the whole LWS-CID dance headlessly? This answers the
axis-6 open question in [`docs/foundations/05-jss-spec-conformance.md`](../../docs/foundations/05-jss-spec-conformance.md).

## What it does

**Phase 1 — provision a key headlessly** (the doctor's recipe, no browser):
1. get an owner bearer from `POST /idp/credentials`
2. generate an ES256 (P-256) keypair (`jose`)
3. authenticated **GET-merge-PUT with `If-Match`** of `profile/card.jsonld`, splicing in a
   `JsonWebKey` `verificationMethod` + an `authentication` reference, preserving the inline `@context`
4. re-GET to confirm the VM landed

**Phase 2 — prove the self-signed auth round-trip:**
5. control: an unauthenticated write is 401
6. mint a self-signed LWS-CID JWT (`alg ES256`, `kid` = the VM id, `iss=sub=client_id=WebID`,
   `aud` = origin) and use it as the only credential
7. negative controls (expired, `sub≠iss`, unknown `kid`) — only meaningful once Phase 2 is reachable

## Run

```bash
# http pod (Phase 2 will be blocked at the https gate)
cd experiments/headless-cid && npm install
BASE=http://localhost:3838 node run.mjs        # needs: make up

# TLS pod on pod.vardeman.me:8443 (mkcert; reuses cogitarelink-solid's approach)
make cert && make up-tls && make cid-tls
```

## Findings (2026-06-20, JSS v0.0.209)

- **Phase 1 — WORKS (http and https).** Headless GET-merge-PUT lands a `verificationMethod` +
  `authentication` ref in the profile (`PUT … 204`, `If-Match`). **No browser doctor required** —
  the doctor's B.3 flow is fully scriptable with only the owner bearer. Overturns the "doctor
  required" reading of the JSS docs.
- **Phase 2 — BLOCKED, by design, even over TLS.** Two gates, peeled in order:
  1. http pod → `"kid must use https"` (the kid scheme check).
  2. https pod (`pod.vardeman.me:8443`, mkcert, docker network alias) → the verifier now
     dereferences the WebID but the **SSRF guard** rejects it:
     `"Hostname pod.vardeman.me resolves to private IP 172.20.0.3"`.

  Root cause in source: `src/auth/cid-doc-fetch.js` hardcodes `blockPrivateIPs: true` (no
  config/env knob). JSS refuses to fetch a CID document whose WebID resolves to a
  loopback/private IP. **LWS-CID self-signed auth cannot be exercised on any local/private
  deployment** — it requires a WebID that resolves to a **public IP** (public DNS + TLS).

## Conclusion / next step

Headless self-issued identity is **provisioning-viable today** but its auth round-trip is
**only verifiable on a public deployment** — the blocker is JSS's SSRF policy, not a missing
capability. To finish Phase 2: either (a) deploy JSS to a public host + domain and re-run, or
(b) for a local proof, fork/patch `src/auth/cid-doc-fetch.js` to relax `blockPrivateIPs` in a
clearly-labeled test build (changes the SUT). Until then, axis-2's bearer-replay concern stays
open: the practical headless credential remains the replayable RS256 bearer.
