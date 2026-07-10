// The query disclosure channel: the union of every card's typed triples, as one
// Turtle resource — the single Comunica source + the surface the SHACL floor reasons over.
import { readFileSync } from 'node:fs'
import { extractCard, quadsToTurtle } from './extract.mjs'
import { materializeInverses } from '../../prof/materialize.mjs'

const EDGES = readFileSync(new URL('./edges.ttl', import.meta.url), 'utf8')

export const graphChannel = {
  name: 'graph',
  mediaType: 'text/turtle',
  target: containerUrl => `${containerUrl}graph.ttl`,
  render: async (containerUrl, cards, _members) =>
    quadsToTurtle(materializeInverses(cards.flatMap(c => extractCard(c.body, c.url)), EDGES)),
}
