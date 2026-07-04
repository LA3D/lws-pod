---
name: mcp-protocol
description: Model Context Protocol (MCP) 2025-03-26 — the agent protocol the pod's `/mcp` surface speaks. Its primitive CONTROL MODEL is load-bearing — Tools are *model-controlled* (the model invokes them), Resources are *application-driven* (the host stages them into context), Prompts are *user-controlled* — plus the Streamable HTTP transport, lifecycle, and JSON schema. Verbatim spec (Apache-2.0), pinned. Includes the experimental Skills-over-MCP extension (SEP-2640).
when_to_use: When designing or checking the pod's MCP agent surface against the protocol itself — which primitive an agent can autonomously drive (Tools = model-controlled) vs. what the host surfaces (Resources = application-driven); the Streamable HTTP transport (`initialize` → `notifications/initialized`, `Mcp-Session-Id`, POST vs GET-SSE, JSON-RPC batching); capability negotiation and versioning; the machine-readable schema. And the emerging Skills-over-MCP direction (SEP-2640) for serving how-to over a pod. Ground truth only.
upstream: see UPSTREAM.md
license: Apache-2.0 (MCP spec + skills ext); see UPSTREAM.md
---

# Model Context Protocol (MCP) — grounded reference

Verbatim upstream, pinned in `UPSTREAM.md`. Ground truth, not project guidance.

## When to read which

| Question | Read |
|---|---|
| **The primitive control model** — Tools *model-controlled* (the model invokes), Resources *application-driven* (the host stages), Prompts *user-controlled* | `references/mcp-spec-2025-03-26/server-{tools,resources,prompts}.mdx` |
| Server-primitives overview; base-protocol overview; spec index | `references/mcp-spec-2025-03-26/{server-index,basic-index,00-index}.mdx` |
| **Transport** — Streamable HTTP, JSON-RPC, POST / GET-SSE, `Mcp-Session-Id`, batching | `references/mcp-spec-2025-03-26/basic-transports.mdx` |
| **Lifecycle** — `initialize` → `notifications/initialized`, capability negotiation, protocol version | `references/mcp-spec-2025-03-26/basic-lifecycle.mdx` |
| Machine-readable schema (TypeScript + JSON Schema) | `references/schema/schema.{ts,json}` |
| **Skills over MCP (experimental, SEP-2640)** — serving how-to over a pod: problem, approaches, the SEP draft, the `skill://` URI scheme + meta keys (format itself delegated to agentskills.io) | `references/ext-skills/*.md` |

## Key distinction (why this skill exists)

MCP separates **model-controlled** primitives (Tools — the model *autonomously invokes*) from
**application-driven** ones (Resources — the host *surfaces into context*, e.g. as attachable/@-mentionable
content) and **user-controlled** (Prompts). A surface that needs *autonomous* agent navigation belongs in
the model-controlled primitive. The experimental Skills extension serves skills over the **Resources**
primitive — so pod-served how-to is host-staged (`resources/read`), not model-invoked.

## Related skills

`json-ld`, `lws-protocol`, `jss-server` (the server whose `/mcp` implements this), `solid-protocol`.

---
*lws-pod's application (the affordance-surface Resources-vs-Tools consumption finding + the model-driven
read/nav correction): see `docs/superpowers/specs/2026-07-03-mcp-affordance-surface-design.md` +
`docs/design-notes/agent-operating-skills.md`. The arXiv 2606.30317 patterns paper (basis of the v2
refactor) is cited in those specs — informative, not vendored (see UPSTREAM.md). Not in this skill.*
