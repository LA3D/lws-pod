// projection/okf/base-profile.mjs
import { indexChannel } from './index-channel.mjs'
import { makeIdentityPolicy } from './identity.mjs'

// The OKF floor: any OKF bundle projects under this. `base` is a placeholder, overridden
// per-pod at deploy (Plan 3 wires the pod's storage IRI authority). No class vocabulary —
// a bare `type:` string maps into skos: by the card extractor's W1 convention.
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
