// projection/okf/base-profile.mjs
import { indexChannel } from './index-channel.mjs'
import { makeIdentityPolicy } from './identity.mjs'

// The OKF floor context: type→@type, title/description→dcterms — nothing else.
// Type-scheme resolution happens through the profile context (+ proto @vocab);
// the old asTypeCurie 'skos:' engine-vocabulary debt is gone (Plan-1 #4 fixed).
const baseContext = {
  dcterms: 'http://purl.org/dc/terms/',
  type: '@type',
  title: { '@id': 'dcterms:title' },
  description: { '@id': 'dcterms:description' },
}

// The running path: authority is RESOLVED (resolveStorageAuthority), never a
// config literal. The proto @vocab layer implements P6 (mint, don't drop).
export function makeBaseProfile(authority) {
  return {
    application: 'okf-base',
    types: null,
    channels: [indexChannel],
    context: { '@context': { ...baseContext, '@vocab': authority + 'proto#' } },
    identityPolicy: makeIdentityPolicy({ base: authority }),
  }
}

// Legacy placeholder export — unit-test fixture ONLY. Not reachable from any
// running path (acceptance #2). Kept so pre-Plan-2 okf unit tests still compile.
export const baseProfile = {
  application: 'okf-base',
  types: null,
  channels: [indexChannel],
  context: { '@context': baseContext },
  identityPolicy: makeIdentityPolicy({ base: 'urn:okf:base/' }),
}
