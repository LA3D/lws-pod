// projection/okf/base-profile.mjs
import { indexChannel } from './index-channel.mjs'
import { makeIdentityPolicy } from './identity.mjs'

// The OKF floor: any OKF bundle projects under this. `base` is a placeholder, overridden
// per-pod at deploy (Plan 3 wires the pod's storage IRI authority). Maps `type`→@type and
// `title`/`description`→dcterms — nothing else. A bare `type:` value is NOT resolved to an
// absolute class IRI: asTypeCurie() hardcodes `skos:` prefix which is absent here, so the
// emitted rdf:type object is an unresolved curie ('skos:Reference'). Engine-vocabulary debt
// violating the no-vocab-in-engine rule; real type-scheme resolution is deferred to Plan 2.
// Bundles that rely on the type triple must wait for Plan 2.
const context = {
  '@context': {
    dcterms: 'http://purl.org/dc/terms/',
    type: '@type',
    title: { '@id': 'dcterms:title' },
    description: { '@id': 'dcterms:description' },
  },
}

export const baseProfile = {
  application: 'okf-base',
  types: null,
  channels: [indexChannel],
  context,
  identityPolicy: makeIdentityPolicy({ base: 'urn:okf:base/' }),
}
