const SD_REL = 'https://www.w3.org/ns/lws#storageDescription'

function sdUrlFromLink(linkHeader) {
  if (!linkHeader) return null
  for (const part of linkHeader.split(',')) {
    const m = part.match(/<([^>]+)>\s*;[^,]*rel="([^"]*)"/)
    if (m && m[2].split(/\s+/).includes(SD_REL)) return m[1]
  }
  return null
}

// The seam (spec §6): authority is RESOLVED from the pod's real storage
// description, never a config literal. iri-minting.md rule.
export async function resolveStorageAuthority(resourceUrl, { fetchFn = fetch } = {}) {
  let sdUrl = null
  try {
    const head = await fetchFn(resourceUrl, { method: 'HEAD' })
    sdUrl = sdUrlFromLink(head.headers.get('link'))
  } catch { /* fall through to convention */ }
  sdUrl = sdUrl ?? `${new URL(resourceUrl).origin}/.well-known/lws-storage`
  const r = await fetchFn(sdUrl, { headers: { accept: 'application/lws+json, application/json' } })
  if (!r.ok) throw new Error(`storage description ${sdUrl} -> ${r.status}`)
  const sd = await r.json()
  const svc = (sd.service || []).find((s) => s.type === 'ProfileIndexService')
  return { authority: sd.id, profileIndex: svc?.serviceEndpoint ?? null }
}

export async function readProfileIndex(indexUrl, { fetchFn = fetch } = {}) {
  const r = await fetchFn(indexUrl, { headers: { accept: 'application/ld+json, application/json' } })
  if (!r.ok) throw new Error(`profile index ${indexUrl} -> ${r.status}`)
  const doc = await r.json()
  return {
    profiles: (doc.profiles ?? []).map((p) => new URL(p, indexUrl).href),
    defaultProfile: doc.defaultProfile ? new URL(doc.defaultProfile, indexUrl).href : null,
  }
}
