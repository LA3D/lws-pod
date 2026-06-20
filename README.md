# lws-pod

Evaluation spike: **is [JavaScriptSolidServer](https://github.com/JavaScriptSolidServer/JavaScriptSolidServer) (JSS) a good substrate to move the memory pods onto, replacing CSS?**

A containerized, pinned JSS instance configured to exercise the things CSS does *not*
give us and we'd otherwise have to build ourselves: a self-issued agent-identity stack
(LWS-CID / did:nostr), headless agent auth, an MCP agent surface, and git-backed
versioning. Our L2 memory layer (governed projection, write contract, SHACL admission,
curation) is portable IP that rides on top of any Solid server — so this evaluates the
*substrate*, not the memory semantics.

## Run

```bash
make up        # build + start  (http://localhost:3838)
make logs      # tail
make smoke     # boot -> create pod -> headless token -> write/read -> MCP -> git
make reset     # wipe volume, rebuild, restart
make down
```

No official JSS image exists; the `Dockerfile` pins `javascript-solid-server@0.0.209`
from npm and adds `git` (required by the `--git` backend). Pinned deliberately — JSS is a
single-maintainer v0.0.x; we bump when we choose to.

Port `3838` (host) → `3000` (container), leaving `3000` free for a side-by-side CSS pod.

## What's enabled (and why)

| Flag | Evaluates |
|---|---|
| `--idp` | Built-in Solid-OIDC IdP + **headless** `POST /idp/credentials` — agents auth with no browser |
| `--mcp` | MCP server at `/mcp` — the agent consumption surface (CRUD, ACL, skills, subscribe, federation) |
| `--conneg` | Turtle ↔ JSON-LD content negotiation (Comunica compatibility) |
| `--git` | `git clone`/`push` backend — the versioning angle (a git working tree as storage) |
| `--notifications` | WebSocket change notifications |
| `--provision-keys` | Auto-generate a W3C CID v1 owner key per pod — the LWS-CID identity primitive |

Kitchen-sink surfaces (Nostr relay, WebRTC, tunnel, ActivityPub, terminal) stay **off** to
keep the evaluation focused on the substrate.

## Evaluation checklist (what "good" looks like)

- [ ] Boots clean in a container; survives `make reset` with a persistent volume.
- [ ] **Headless agent auth**: `POST /idp/credentials` returns a usable Bearer/DPoP token. ← the main draw
- [ ] **Agent surface**: `/mcp` lists tools; CRUD + ACL tools work under WAC.
- [ ] **Conneg**: a resource round-trips as both `application/ld+json` and `text/turtle`
      (and the container `ldp:contains` is Comunica-traversable).
- [ ] **Git**: a container is `git clone`-able; a push materializes files as resources.
- [ ] **LWS-CID identity**: the pod profile is CID-shaped with `verificationMethod`.
- [ ] Sketch where the **L2 port** lands: SHACL-admission as a write hook, projection on
      the write path, git-auto-commit-on-write as versioning (QuitStore-style).

## Context

Source clone read at `~/dev/git/JavaScriptSolidServer/JavaScriptSolidServer`. JSS is a
CTH-conformant, JSON-LD-native Solid server that already ships the LWS *authentication*
suite (not LWS storage — that stays Solid/LDP). The CSS-vs-JSS decision and the L2-port
analysis live in the `cogitarelink-solid` notes.
