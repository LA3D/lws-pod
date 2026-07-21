# Capability probe for the fork-tls rig. Report-only: run via scripts/capcheck.sh, which
# captures results and never propagates a non-zero exit. Variables come from --variable.
GET {{base}}/.well-known/lws-storage
Accept: application/lws+json
HTTP 200
[Asserts]
jsonpath "$.type" == "ServerIndex"
jsonpath "$.service[*].type" contains "TypeIndexService"
jsonpath "$.service[*].type" contains "TypeSearchService"
jsonpath "$.service[*].type" contains "McpService"

GET {{base}}/alice/lws-storage
Accept: application/lws+json
HTTP 200
[Asserts]
jsonpath "$.service[*].type" contains "TypeIndexService"
jsonpath "$.service[*].type" contains "TypeSearchService"
jsonpath "$.service[*].type" contains "VoidService"

# A real JSON-RPC `initialize` call, not a bare GET: verified live (2026-07-21 fix round) that
# GET /mcp is answered by Fastify's built-in 405 dispatch BEFORE the route's rate-limit hook
# runs — it carries no x-ratelimit-* headers even while POST /mcp's budget sits at 0/60, so a
# GET-based probe can *structurally never* observe the real 429 this leg exists to catch. POST
# is the actual anon-budget-metered surface (confirmed live: 61st POST in a burst returns 429
# with x-ratelimit-remaining: 0), so probing it is both the correct capability check (McpService
# means "answers JSON-RPC", not "returns 405 to GET") and the only way this leg can genuinely
# distinguish healthy/rate-limited/absent instead of asserting something unfalsifiable.
POST {{base}}/mcp
Content-Type: application/json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "initialize",
  "params": {}
}
HTTP *
[Asserts]
# The prior `status < 500` alone read 429 (rate-limited) and 404 (route genuinely absent) as
# equally "fine", which is exactly the conflation the governing constraint forbids: the
# reviewer observed capcheck print "all expected capabilities present" while /mcp sat in its
# rate-limited window. Split the failure modes so their diagnostic text reaches capcheck.sh's
# branches: `status != 429` feeds the <429> grep -> UNDETERMINED; `status != 404` / `status <
# 500` feed the generic error grep -> MISMATCH (absent route, or a real 5xx, are genuine
# "does not expose this").
status != 429
status != 404
status < 500
