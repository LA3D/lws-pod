# agent-eval — the cold-agent affordance harness

Puts a **real LLM agent** in front of the pod's MCP surface with **no out-of-band
knowledge** of the pod, and measures whether it can discover and use the surface
from **affordances alone** — the invariant the affordance-surface redesign is built
around (`docs/superpowers/specs/2026-07-03-mcp-affordance-surface-design.md` §1).

This is the *behavioral* test. `make test-mcp-v2` checks the mechanism (scripted MCP
calls); this checks whether an agent can actually *navigate* it.

## What it is

- **`mcp.mjs`** — a thin MCP client for JSS's `/mcp`. Verified 2026-07-03: JSS speaks a
  **stateless** subset of MCP Streamable HTTP (`2025-03-26`) — POST JSON-RPC →
  `application/json`, no `Mcp-Session-Id`, no mandatory SSE. So no session tracking.
- **`seed.mjs`** — provisions the fixtures the battery needs (a JSON-LD note, a SHACL
  shape + container member-rule, an injection-laced text resource).
- **`agent.mjs`** — the cold agent: a Claude tool-use loop bridged onto the MCP surface.
  Reads are exposed as `list_resources`/`read_resource` tools (a Claude API loop doesn't
  natively consume MCP Resources); the pod's own tools are passed through (their JSON
  Schemas are adopted verbatim from `tools/list`). The system prompt gives it the pod
  **root URL and nothing else** — no paths, no schema, no vocabulary.
- **`tasks.mjs`** — the task battery. Each task exercises one affordance and scores
  heuristically; the real output is the **trajectory + observations** (did it *discover*
  what it needed?).
- **`run.mjs`** — orchestrator: seed → run → score → write `out/<stamp>.json`.

## Run

Needs the fork TLS pod up (`make cert && make up-fork-tls`) and the mkcert CA.

```bash
# plumbing smoke — verifies the MCP handshake + read surface; NO api key needed
make test-agent-eval-dry

# full battery — needs an Anthropic key
ANTHROPIC_API_KEY=sk-... make test-agent-eval
# one task:  cd experiments/agent-eval && … node run.mjs --task=orient
# model:     AGENT_MODEL=claude-haiku-4-5-20251001  (floor)  |  claude-sonnet-5 (default)
```

The cert is handled by `NODE_EXTRA_CA_CERTS=certs/rootCA.pem` (the make targets set it;
Node's global `fetch`/undici honors it) — no `--insecure`.

## The battery (system layer)

`orient` · `read-interpret` · `navigate` · `write-recover` (SHACL teaching-error recovery)
· `federate-gate` · `injection` (envelope/sanitize vs a real model) · `resolve-term`
(dereference the `@context`/vocab to expand `lws:items`).

## Two caveats baked in

1. **Domain vocabulary is deliberately unpublished** (deferred to Plan 2). Every task
   here targets the **system** layer (LWS vocab, container structure, shapes), which *is*
   resolvable. `resolve-term` is the forcing function: once a profile vocab exists, a
   domain-term variant will show exactly where a cold agent **stalls** without it — that
   stall is the evidence for Plan 2, so keep it observable rather than papering over it.
2. **The pod cannot fetch its own external HTTPS URL from inside the container** (no
   in-container DNS/CA), so `federate-gate` scores on tool-use + owner gate-pass, not
   fetch success (the happy-path fetch is covered by the fork unit test).

## The ablation (the actual experiment)

The harness is the rig for "structure helps agents" applied to the surface itself. Run the
same battery against pod variants and compare trajectories/turns/pass-rate:

- **affordances on** (current) vs **`@context` 404ing** (no mirror) vs **`pod-info` without
  the steering hint** vs the **old `lws://` surface**.

Variants that change pod behavior need a rebuilt pod (a `JSS_GIT_REF` / config toggle);
the harness takes `BASE` + model as inputs so it can be pointed at each. Wiring the
ablation variants is the next step.
