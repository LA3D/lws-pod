// ACL payload for the MCP write_acl tool (spec §7): public-read (foaf:Agent) + owner
// Read/Write/Control, both isDefault (inherited by container contents). Pure — the caller
// wraps this in the JSON-RPC tools/call envelope and POSTs it to /mcp. Kept separate from
// publish.mjs (which throws at import-time without --base) so it's directly unit-testable,
// same split as buildVoid/void.mjs.
// Owner WebID from the bearer's own `webid` claim (review #11): /idp/credentials
// mints JWTs carrying it, so publish stays pod-agnostic — no hardcoded pod name.
// Null when the token is opaque or the claim isn't an absolute http(s) URL;
// the caller falls back to --owner or fails loud before any write.
export function ownerFromToken(token) {
  try {
    const claims = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'))
    return /^https?:\/\//.test(claims.webid ?? '') ? claims.webid : null
  } catch { return null }
}

export function buildAclPayload(path, ownerWebId) {
  return {
    path,
    authorizations: [
      { agentClasses: ['foaf:Agent'], modes: ['Read'], isDefault: true },
      { agents: [ownerWebId], modes: ['Read', 'Write', 'Control'], isDefault: true },
    ],
  }
}

// Provision default ACLs via the pod's own MCP write_acl — but probe <target>.acl
// FIRST and leave any existing doc untouched (review #1: write_acl fully overwrites,
// so re-running publish/reinstantiate over a hand-tightened ACL would silently
// re-open it to public read). 404 = fresh, write; 2xx = exists, skip; anything
// else = fail loud — neither clobber nor skip on a probe we can't interpret.
export async function provisionAcls({ base, targets, ownerWebId, headers = {}, fetchFn = fetch, log = console.log }) {
  let rpcId = 1
  for (const path of targets) {
    const aclUrl = new URL(path + '.acl', base).href
    const probe = await fetchFn(aclUrl, { headers: { ...headers, accept: 'application/ld+json' } })
    if (probe.ok) { log(`ACL ${path} -> exists, left untouched`); continue }
    if (probe.status !== 404) throw new Error(`ACL probe ${aclUrl} -> ${probe.status} (refusing to guess — fix access or pass --no-acl)`)
    const rpcBody = { jsonrpc: '2.0', id: rpcId++, method: 'tools/call', params: { name: 'write_acl', arguments: buildAclPayload(path, ownerWebId) } }
    const r = await fetchFn(new URL('/mcp', base).href, { method: 'POST', headers: { ...headers, 'content-type': 'application/json' }, body: JSON.stringify(rpcBody) })
    const rj = await r.json().catch(() => ({}))
    if (!r.ok || rj.error || rj.result?.isError) throw new Error(`ACL ${path} -> ${r.status} ${JSON.stringify(rj.error ?? rj.result ?? rj)}`)
    log(`ACL ${path} -> public-read + owner-control`)
  }
}
