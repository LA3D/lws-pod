# Upstream provenance — jss-server

The published JavaScriptSolidServer documentation site (`javascriptsolidserver.github.io/docs/`),
verbatim, unmodified — all 38 `docs/**/*.md` files.

| Reference | Source | Snapshot |
|---|---|---|
| references/** | https://github.com/JavaScriptSolidServer/docs (`docs/`) — rendered: https://javascriptsolidserver.github.io/docs/ | sha 9787f45b830a7f1f6171eb1a09cb6e9adb613ddd (2026-06-07) |

This is the authoritative published JSS documentation (a Docusaurus site), pinned by the docs
repo's own sha. The docs repo is NOT versioned in lockstep with the server release — lws-pod
runs server v0.0.209 (`Dockerfile`), while these docs track the project generally as of
2026-06-07. For version-exact, code-colocated notes, the server repo also carries in-tree
`docs/*.md` at the 0.0.209 commit (sha 45d34bd) — not vendored here; this skill grounds the
published site.
License: AGPL-3.0-only (JSS project). Implementation documentation, not a W3C specification.
