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

GET {{base}}/mcp
HTTP *
[Asserts]
status < 500
