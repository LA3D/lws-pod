# Upstream provenance — mcp-protocol

Model Context Protocol, verbatim and unmodified. Two vendored sources (both Apache-2.0) + one cited-only
reference.

## Vendored (verbatim)

| Reference | Document | Source (pinned) |
|---|---|---|
| references/mcp-spec-2025-03-26/ | MCP specification 2025-03-26 — base protocol (index, lifecycle, transports) + server primitives (resources, tools, prompts) | modelcontextprotocol/modelcontextprotocol @ sha 60dc69e9a9723a7bab535ade6c5c5b9695d97dfc, `docs/specification/2025-03-26/` |
| references/schema/ | MCP schema 2025-03-26 (TypeScript source + JSON Schema) | same repo/sha, `schema/2025-03-26/schema.ts`, `schema.json` |
| references/ext-skills/ | Skills-over-MCP extension — experimental (SEP-2640): the full `docs/` set (problem, approaches, SEP draft, `skill://` URI scheme, meta keys, decisions, findings, open questions) | modelcontextprotocol/experimental-ext-skills @ sha f9df63baff2abf4e6212a953579cac5db7a8e322, `docs/` |

Repos: https://github.com/modelcontextprotocol/modelcontextprotocol ,
https://github.com/modelcontextprotocol/experimental-ext-skills
Rendered: https://modelcontextprotocol.io/specification/2025-03-26/
License: Apache-2.0 (MCP specifications + the skills extension; general documentation CC-BY-4.0). Verbatim,
unmodified. The skills extension is EXPERIMENTAL ("does not represent official MCP specifications") — pinned
snapshot. The skill *format* it binds is delegated to the Agent Skills specification
(https://agentskills.io/specification), not vendored here.
Not vendored from the spec repo: `basic/authorization.mdx` and the `*/utilities/` subdirs (out of scope for
the surface grounding); available at the pinned ref.

## Cited only (NOT vendored)

- **arXiv 2606.30317** "MCP Server Architecture Patterns" — https://arxiv.org/abs/2606.30317 . The
  tool-budget / Resource-Gateway / structured-error / sanitization patterns that informed the pod's MCP
  refactor. Under the arXiv non-exclusive distribution license (not third-party redistributable), and it is
  design guidance rather than a normative spec — so it is referenced, not vendored. Its applied use lives in
  `docs/superpowers/specs/2026-07-02-mcp-v2-agent-surface-design.md` and the 2026-07-03 affordance spec.
