# LWS core requirement matrix — Discovery + Read Resource (round 1 scope)

Pinned normative rows for the 2026-07-18 resource-server conformance closeout. Quotes verbatim
from `.claude/skills/lws-protocol/references/lws10-core/`. Status column = live state on fork
`7de911d` before this round; every MISSING row gets a gate + fix in this round; deferred rows say
so explicitly.

| # | Requirement (verbatim source) | Source | Surface | Status @7de911d |
|---|---|---|---|---|
| R1 | "All responses MUST integrate with metadata as defined in Section 8.1, including Link headers for key relations such as `rel=\"linkset\"`, `rel=\"up\"`, and `rel=\"type\"`." | Operations/read-resource.md L9 | every `--lws` GET/HEAD | `linkset` ✅ · `up`/`type` MISSING (header) |
| R2 | "**Containment**: Servers MUST include a Link header with `rel=\"up\"` pointing to the parent container for any non-root resource." | Operations/metadata.md L22 | every non-root resource | MISSING on data resources; container lws+json arm only |
| R3 | "Responses MUST include an ETag header for concurrency control and caching." / "ETags MUST be provided in all GET/HEAD responses" | Operations/read-resource.md L12, L89 | ALL GET/HEAD incl. generated docs (`/:pod/lws-storage`, `/.well-known/lws-storage`, `/types/index`, `/types/search` GET) | ordinary resources ✅ · generated docs MISSING |
| R4 | "Servers MUST support conditional requests via If-None-Match (with ETags) or If-Modified-Since headers. If the resource or container listing has not changed, respond with 304 Not Modified" | Operations/read-resource.md L89 | same as R3 | ordinary ✅ · generated docs MISSING |
| R5 | "A server MUST include an Etag header in its responses to GET and HEAD requests for a linkset resource." | Operations/update-resource.md L45 | `Accept: application/linkset+json` GET/HEAD | believed ✅ (variant key `ls`) — LOCK with a gate |
| R6 | Storage discovery: every resource response carries `Link rel="https://www.w3.org/ns/lws#storageDescription"` to its owning storage description | Discovery.html | root-pod deployments | ✅ named pods · BROKEN root-pod (`storageRootFor` has no `/` fallback → points at ServerIndex) |

Scope notes (calibrations from the verified 2026-07-18 review, FOLLOWUP top block):
- "ServerIndex" is JSS's well-known surface, not an LWS-spec object. Its ETag obligation comes
  from R3's blanket clause only.
- `rel="type"` sits under R1's "such as" umbrella (illustrative list); `rel="up"` has its own
  standalone MUST (R2). We emit both, derived identically to the linkset body
  (`parentContainerUrl` / `lws#DataResource`-vs-`lws#Container`).
- `/.well-known/void` is a 303 redirect, not a representation — no ETag obligation.
- `WWW-Authenticate` / `/.well-known/lws-configuration` (Authorization.html) = round 4, NOT here.
- Per-storage VoID/type-index/search *scoping* = round 2, NOT here (R3/R4 only add ETags to the
  existing server-scoped surfaces; they do not re-scope them).
- Storage-root `up`: linkset body already emits `up` for a storage root (→ origin `/`); the header
  mirrors the linkset for parity. metadata.md requires `up` only for non-root resources; emitting
  it on the storage root too is benign surplus, recorded here deliberately.
