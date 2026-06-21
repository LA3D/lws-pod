---
name: jss-server
description: JavaScriptSolidServer (JSS) published documentation — how the actual server lws-pod evaluates implements Solid/LWS — getting-started, core concepts, features, guides, and API/CLI/config reference. Verbatim docs site, pinned.
when_to_use: When checking how JSS actually behaves (vs the Solid/LWS spec) — headless auth, MCP agent surface, git-backed storage, websocket notifications, LWS-CID identity, conneg, LDP CRUD, access control, plus install/config/CLI/API reference. Implementation ground truth; for how lws-pod applies it see the pointer below.
upstream: see UPSTREAM.md
license: AGPL-3.0-only
---

# JavaScriptSolidServer (JSS) — grounded implementation reference

Verbatim of the published JSS docs site (`javascriptsolidserver.github.io/docs/`), pinned in `UPSTREAM.md`. Ground truth about the server, not project guidance. The implementation counterpart to the `solid-protocol` and `lws-protocol` spec skills — read those for what the standard says, this for what JSS does.

## Where to read

| Need | Read under `references/` |
|---|---|
| Install, first run, quick start | `getting-started/` |
| Conneg, JSON-LD-first model, pods & resources | `core-concepts/` |
| Deploy, git-on-Solid, building Solid apps | `guides/` |
| HTTP API, CLI flags, config keys, pod layout | `reference/api.md`, `cli.md`, `configuration.md`, `pod-structure.md` |

## Features enabled in the lws-pod eval

`features/`: `lws.md` (LWS-CID identity), `authentication.md` (headless/IdP), `mcp.md` (agent surface), `git-integration.md` (`--git`), `websocket-notifications.md`, `ldp-crud.md`, `access-control.md`, `mashlib-ui.md`, `patching.md`, `account-management.md`, `quotas-and-invites.md` (quotas).

## Features OFF in this eval (documented, not enabled)

`features/`: `activitypub.md`, `nostr.md`, `payments.md`, `e2ee.md`, `charlie.md`, `multi-user-pods.md`, `app-install.md`, `inbox-and-spam-mitigation.md`, `live-reload.md`. Present for reference only.

## Related skills

`solid-protocol`, `lws-protocol` (the specs JSS implements), `comunica-sparql`.

---
*lws-pod's application: the eval checklist in `README.md` and `docs/foundations/`. Not in this skill.*
