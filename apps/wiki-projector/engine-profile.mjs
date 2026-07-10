import { makeIdentityPolicy } from './identity.mjs'

// Merge stacked contexts into one @context object, base-first (later layers
// win on key collision — JSON-LD array-context semantics for our flat reader),
// then inject the runtime proto @vocab layer (spec §8: {authority}proto#).
function stackContexts(contexts, authority) {
  const merged = {}
  for (const c of contexts) Object.assign(merged, c['@context'] || {})
  merged['@vocab'] = authority + 'proto#'
  return { '@context': merged }
}

// Bridge: Loaded (profile-loader) -> the app profile shape. Mint base = resolved
// authority + policy pathPrefix (spec §7); policy config never carries an
// authority literal (iri-minting.md). B1 fixed: no channel is force-fit —
// representations are the profile's own declared data.
export function makeEngineProfile(loaded, authority) {
  const cfg = loaded.identityPolicy ?? {}
  return {
    application: loaded.token ?? loaded.id,
    context: stackContexts(loaded.contexts, authority),
    identityPolicy: makeIdentityPolicy({ base: authority + (cfg.pathPrefix ?? ''), fragment: cfg.fragment ?? '#it' }),
    representations: loaded.representations ?? [],
    validation: loaded.validation,
    planeMapping: loaded.planeMapping,
  }
}
