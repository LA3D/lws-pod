// ACL payload for the MCP write_acl tool (spec §7): public-read (foaf:Agent) + owner
// Read/Write/Control, both isDefault (inherited by container contents). Pure — the caller
// wraps this in the JSON-RPC tools/call envelope and POSTs it to /mcp. Kept separate from
// publish.mjs (which throws at import-time without --base) so it's directly unit-testable,
// same split as buildVoid/void.mjs.
export function buildAclPayload(path, ownerWebId) {
  return {
    path,
    authorizations: [
      { agentClasses: ['foaf:Agent'], modes: ['Read'], isDefault: true },
      { agents: [ownerWebId], modes: ['Read', 'Write', 'Control'], isDefault: true },
    ],
  }
}
