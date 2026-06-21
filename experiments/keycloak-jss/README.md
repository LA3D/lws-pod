# keycloak-jss (P1 spike)

Proves a Keycloak-issued token gates read/write of a JSS-backed resource through a thin
auth-gateway that trusts the token's `webid` claim. Spec:
`docs/superpowers/specs/2026-06-21-keycloak-jss-spike-design.md`.

## Run

```bash
make up            # JSS pod at :3838 (alice pre-created by the test)
make kc-up         # Keycloak at :8080, realm lws
make kc-spike      # starts the gateway, runs the Vitest e2e, stops the gateway
make kc-down       # stop Keycloak
```

## Topology

`client --Keycloak token--> gateway (:3840, host) --owner bearer--> JSS (:3838)`.
Gateway verifies the JWT against Keycloak's JWKS, extracts `webid`, forwards under a JSS
owner bearer (gateway is the policy-enforcement point for the spike).

## Decision note (outcome)

- **Identity path:** approach A confirmed — the direct-grant access token carries
  `webid = http://localhost:3838/alice/profile/card#me` (Keycloak user-attribute mapper). No
  gateway-side mapping table needed (fallback B not used).
- **Downstream credential:** candidate (b) — gateway forwards under a JSS owner bearer it mints
  at startup. WAC implication: JSS authorizes the owner, not per-WebID; the gateway is the PEP.
  To make JSS enforce per-WebID WAC, a later step would make JSS accept the Keycloak token as an
  external IdP (candidate a) — deferred.
- **Grant:** direct-access-grant (password). RFC 8693 token-exchange + the full Solid-OIDC profile
  (lws-keycloak's realm) deferred to Phase 2.
- **Recommendation:** keep the gateway-enforces pattern — it is the auth front of the Phase-1
  sidecar. Promote `gateway.js` into the sidecar when built.
