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
cd experiments/headless-cid && npm install
node run.mjs                 # BASE=http://localhost:3838 (needs a pod up: make up)
BASE=https://pod.example node run.mjs
```

## Findings (2026-06-20, against JSS v0.0.209 on http://localhost:3838)

- **Phase 1 — WORKS.** Headless GET-merge-PUT lands a `verificationMethod` and `authentication`
  ref in the profile (`PUT … 204` with `If-Match`). **No browser doctor is required** — the
  doctor's B.3 flow is reproducible from a script with only the owner bearer. This overturns the
  "browser doctor required" reading of the JSS docs.
- **Phase 2 — BLOCKED on http.** The verifier (`src/auth/lws-cid.js`) rejects the JWT with
  `"kid must use https"`. The LWS-CID path requires an **https WebID/kid**; a localhost http pod
  cannot exercise it. The negative controls fail at this same gate, so they prove nothing over
  http and are skipped.

## Next step

Stand up JSS over **TLS** (see the `jss-server` skill: `guides/deploy-production.md`,
`reference/configuration.md`) so the WebID is `https://…`, then re-run — Phase 2 should complete
and the negative controls become meaningful. That confirms whether headless self-issued identity
is fully viable (closing the axis-2 bearer-replay concern).
