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
# http pod — Phase 2 unreachable (the verifier requires an https kid); Phase 1 still works
cd experiments/headless-cid && npm install
BASE=http://localhost:3838 node run.mjs        # needs: make up

# TLS pod on pod.vardeman.me:8443 (mkcert) WITH the local SSRF-relax patch baked in
# (docker-compose.tls.yml sets PATCH_CID_PRIVATE_IPS=true) — Phase 2 WORKS here.
make cert && make up-tls && make cid-tls
```

## Findings (updated 2026-06-21, JSS v0.0.209)

- **Phase 1 — WORKS (http and https).** Headless GET-merge-PUT lands a `verificationMethod` +
  `authentication` ref in the profile (`PUT … 204`, `If-Match`). **No browser doctor required** —
  the doctor's B.3 flow is fully scriptable with only the owner bearer. Overturns the "doctor
  required" reading of the JSS docs.
- **Phase 2 — WORKS locally on the patched TLS pod (2026-06-21).** Two gates, both now cleared:
  1. **https kid** — satisfied by the TLS pod (`pod.vardeman.me:8443`, mkcert); the WebID/kid is https.
  2. **SSRF private-IP guard** — relaxed by the opt-in `PATCH_CID_PRIVATE_IPS=true` build arg
     (Dockerfile `sed`s `blockPrivateIPs: true → false` in `src/auth/cid-doc-fetch.js`), which the
     TLS compose sets on. The verifier then dereferences the loopback/private WebID and authenticates.

  Full round-trip green: `LWS-CID PUT → 201` authenticated as the WebID, GET-back with the same
  JWT, and all three negative controls reject (`expired → 401`, `sub≠iss → 401`, `unknown kid → 401`).
  This exercises the entire auth pipeline (kid lookup, `sub=iss=client_id` equality, signature
  verification) — everything *except* the SSRF guard itself, which is deliberately relaxed for the
  local proof.

  Original blocker (for the record): `src/auth/cid-doc-fetch.js` hardcodes `blockPrivateIPs: true`
  with no config/env knob; over plain TLS (guard intact) the verifier rejected the WebID with
  `"Hostname pod.vardeman.me resolves to private IP 172.20.0.3"`.

## Conclusion / next step

Headless self-issued LWS-CID identity is **both provisioning- and auth-viable**, now proven
end-to-end on a local pod via the opt-in SSRF-relax patch + TLS. The **only** thing not yet
exercised is JSS's SSRF guard *with the guard on*, which is purely a network-policy check, not
an auth-logic gap. That gets a one-time confirmation whenever the pod first lands on a real
public host (public DNS + TLS, no patch) — a checkbox, not a blocker. Until then, both the
RS256 owner bearer and the self-signed LWS-CID JWT are validated credentials for headless agents.
