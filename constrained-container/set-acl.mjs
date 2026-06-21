// HTTP-native ACL provisioning. Grants public read (foaf:Agent acl:Read) + owner full control
// on a resource, by PUTting <resource>.acl as application/ld+json. JSS stores dotfiles as
// JSON-LD on disk, so text/turtle returns 415 — this uses JSON-LD. No MCP dependency:
// works from any HTTP client (Claude Code CLI, curl, the app). Needs the owner bearer (Control).
const ACL = 'http://www.w3.org/ns/auth/acl#'
const FOAF = 'http://xmlns.com/foaf/0.1/'

export function publicReadAclDoc(resource, ownerWebId) {
  return {
    '@context': { acl: ACL, foaf: FOAF },
    '@graph': [
      {
        '@id': '#owner', '@type': 'acl:Authorization',
        'acl:agent': { '@id': ownerWebId },
        'acl:accessTo': { '@id': resource },
        'acl:default': { '@id': resource },
        'acl:mode': [{ '@id': 'acl:Read' }, { '@id': 'acl:Write' }, { '@id': 'acl:Control' }],
      },
      {
        '@id': '#public', '@type': 'acl:Authorization',
        'acl:agentClass': { '@id': 'foaf:Agent' },
        'acl:accessTo': { '@id': resource },
        'acl:mode': [{ '@id': 'acl:Read' }],
      },
    ],
  }
}

// Discover the resource's ACL URL from its Link rel="acl" header, falling back to <resource>.acl.
async function aclUrl(resource, token) {
  try {
    const h = await fetch(resource, { method: 'HEAD', headers: { Authorization: `Bearer ${token}` } })
    const link = h.headers.get('link') || ''
    const m = link.match(/<([^>]+)>\s*;\s*rel="acl"/i)
    if (m) return new URL(m[1], resource).href
  } catch { /* fall through */ }
  return `${resource}.acl`
}

export async function setPublicReadAcl({ resource, ownerWebId, token }) {
  const url = await aclUrl(resource, token)
  const r = await fetch(url, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/ld+json' },
    body: JSON.stringify(publicReadAclDoc(resource, ownerWebId)),
  })
  return { status: r.status, aclUrl: url, body: r.ok ? '' : await r.text() }
}
