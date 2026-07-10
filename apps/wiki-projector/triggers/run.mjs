// Runtime adoption of the profile mechanism (the Plan-2 chain goes under the
// running system): discover the container's bound profile, load it, resolve the
// storage authority, and run the neutral instantiate step with the wiki renderers.
import { discoverBinding, loadProfile } from '../../../projection/prof/profile-loader.mjs'
import { resolveStorageAuthority } from '../../../projection/prof/resolve.mjs'
import { instantiate } from '../../../projection/prof/instantiate.mjs'
import { makeRenderers } from '../renderers.mjs'

export async function runOnce(containerUrl, token) {
  const authed = (url, init = {}) => fetch(url, { ...init,
    headers: { ...(init.headers ?? {}), ...(token ? { authorization: `Bearer ${token}` } : {}) } })
  // First declared binding governs the projection; plural bindings AND-compose on
  // validation, most-specific selection is a conneg/read concern (spec §6 leanings).
  const [descriptor] = await discoverBinding(containerUrl, { fetchFn: authed })
  if (!descriptor) throw new Error(`no profile bound at ${containerUrl}`)
  const loaded = await loadProfile(descriptor, { fetchFn: authed })
  const { authority } = await resolveStorageAuthority(containerUrl, { fetchFn: authed })
  const { profile, renderers } = makeRenderers(loaded, authority)
  return instantiate(containerUrl, token,
    { representations: profile.representations, context: profile.context['@context'] }, { renderers, fetchFn: authed })
}
