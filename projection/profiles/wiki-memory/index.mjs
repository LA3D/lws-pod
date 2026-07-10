import { readFileSync } from 'node:fs'
import { indexChannel } from '../../../apps/wiki-projector/index-channel.mjs'
import { graphChannel } from './graph-channel.mjs'
import { wmConceptWiringShape } from './shape.mjs'

const context = JSON.parse(readFileSync(new URL('./context.jsonld', import.meta.url)))

// The first concrete OKF application profile. The engine reads this; it never names skos/wm.
export const wikiMemoryProfile = {
  application: 'wiki-memory',
  types: ['Concept', 'Implementation'],
  channels: [indexChannel, graphChannel],
  floorShape: wmConceptWiringShape,
  context,
}
