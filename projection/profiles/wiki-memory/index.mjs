import { indexChannel } from '../../okf/index-channel.mjs'
import { graphChannel } from './graph-channel.mjs'
import { wmConceptWiringShape } from './shape.mjs'

// The first concrete OKF application profile. The engine reads this; it never names skos/wm.
export const wikiMemoryProfile = {
  application: 'wiki-memory',
  types: ['Concept'],
  channels: [indexChannel, graphChannel],
  floorShape: wmConceptWiringShape,
}
