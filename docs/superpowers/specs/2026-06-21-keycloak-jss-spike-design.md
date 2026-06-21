# Keycloak-in-front-of-JSS spike (P1) — design

Date: 2026-06-21
Status: approved
Roadmap: Phase 0 / P1 (`docs/ROADMAP.md`). A spike — optimize for learning, written cleanly enough
to seed the Phase-1 sidecar's auth front.

## Goal (what we prove)

A client/agent obtains a token from **Keycloak** (OAuth2 token-exchange, RFC 8693) and uses it to
read/write a resource stored in **JSS**, with a thin **auth-gateway** enforcing the token. The
gateway trusts the **`webid` claim** the token asserts; **WAC** on the pod governs the rest. A
missing/invalid token gets `401`.

This de-risks the roadmap assumption that "lws-keycloak solves the authorization gap" — by adopting
its Keycloak component in front of JSS rather than running its storage-server.

## Topology

```
client ──Keycloak access token──▶  auth-gateway  ──JSS credential──▶  JSS pod (storage)
                                   verify JWKS,                        WAC on /alice/
                                   read `webid` claim,
                                   proxy to JSS
   Keycloak (authz server): realm + RFC 8693 token-exchange + /.well-known/lws-configuration
            (reuse jeswr/lws-keycloak's keycloak/ config; NOT its storage-server)
```

## Decisions (settled in brainstorming)

1. **The gateway enforces, not JSS.** JSS natively validates only its own RS256 bearers /
   DPoP-Solid-OIDC / NIP-98 / LWS-CID. Rather than fight JSS's Solid-OIDC-profile expectations, a
   gateway validates the Keycloak token (JWKS) and proxies to JSS. Same `constrained-container/`
   proxy lineage → seeds the real sidecar, not throwaway.
2. **Identity mapping = approach A (token carries the WebID).** Keycloak's exchanged access token
   asserts `webid` = the JSS WebID (e.g. `http://<pod>/alice/profile/card#me`). The gateway reads
   the claim — stateless, no mapping table, no path-convention coupling. **Fallback B:** if the
   token does not carry a usable `webid` claim, the gateway maps Keycloak `sub` → WebID via a thin
   in-gateway table. The spike determines which path is real (see Unknowns).
3. **Pod pre-created.** The WebID's pod user-space (`/alice/`) is created in JSS test setup
   (`POST /.pods`) before any Keycloak token is used. Gateway auto-provisioning on first login is a
   Phase-1 concern, out of scope here.
4. **Reuse lws-keycloak's Keycloak config** (realm import + token-exchange extensions +
   `/.well-known/lws-configuration`) via Docker. We do not hand-roll Solid-OIDC Keycloak config and
   do not run its storage-server, cid-resolver, Postgres-for-its-app, or Redis beyond what Keycloak
   itself needs.

## Components

| Component | Responsibility | Source |
|---|---|---|
| Keycloak | Authz server: authenticate a principal, issue an access token via RFC 8693 token-exchange whose `webid` claim is the JSS WebID. Exposes JWKS + `/.well-known/lws-configuration`. | `jeswr/lws-keycloak` `keycloak/` config, run via Docker |
| auth-gateway | Verify the Keycloak token against Keycloak's JWKS (issuer, audience, expiry, signature); extract `webid`; proxy the HTTP request to JSS as that WebID; pass through JSS status/body. Reject missing/invalid token with `401`. | new, `experiments/keycloak-jss/` (constrained-container lineage) |
| JSS pod | Storage. Pre-created `alice` user-space; WAC governs access. | existing local stack |

### Identity flow (approach A)
```
Keycloak token ─▶ gateway: verify(JWKS) ─▶ read `webid` claim ─▶ proxy to JSS as WebID ─▶ WAC decides
```
"Mapping" collapses to: trust the asserted WebID, let WAC do the rest.

### How the gateway acts "as that WebID" against JSS
The spike's downstream credential to JSS is the open mechanism the experiment settles. Candidate,
in order of preference: (a) forward the Keycloak token if JSS can be configured to accept it as an
external IdP for that WebID; (b) the gateway holds a JSS credential for the test WebID (owner
bearer from `/idp/credentials`) and proxies under it; (c) `--public`-mode JSS with the gateway as
the sole policy-enforcement point for the spike. The spike records which is used and the WAC
implication.

## Unknowns the spike resolves (the point of it)

- Does lws-keycloak's token-exchange emit a token carrying a `webid` claim we can set to a JSS
  WebID? (Determines A vs. fallback B.)
- Does its `keycloak/` realm config run standalone (just Keycloak + its DB), separable from the
  rest of the stack?
- What is the cleanest downstream credential for the gateway → JSS hop (a/b/c above)?

## Testing

Extends the existing harness. A `docker-compose` (spike-scoped) brings up Keycloak + the gateway
alongside the JSS pod. A Vitest case:

1. mint a Keycloak access token (token-exchange or, if simpler for the spike, a direct grant);
2. call the gateway with `Authorization: Bearer <keycloak-token>`; PUT then GET a resource under
   `/alice/...`; assert the CRUD round-trip succeeds and the served content matches;
3. call the gateway with no token and with a tampered token; assert `401` both times.

## Acceptance criteria

1. A Keycloak-issued token drives a successful read+write of a JSS-backed resource through the
   gateway.
2. Missing/invalid token → `401` at the gateway.
3. The identity path used (A or fallback B) is recorded, with the `webid` claim shown.
4. A short **decision note** captures: keep the gateway-enforces pattern vs. invest later in native
   JSS acceptance of Keycloak tokens; and the chosen gateway→JSS downstream credential.

## Out of scope

- The `cid-resolver` / public-IP LWS-CID fix (separate P-thread).
- Type Index/Search, `lws+json`, storage description, any Phase-1 app work.
- Gateway auto-provisioning of pods on first login.
- Production Keycloak hardening (realm security, HTTPS, secret management).
- Running lws-keycloak's storage-server (we use JSS).

## Exit

Token round-trip works; bad token → 401; decision note written. Feeds the Phase-1 sidecar auth
front and updates `FOLLOWUP.md` open item P1.
