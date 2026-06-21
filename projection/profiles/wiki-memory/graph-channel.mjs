// The query disclosure channel: the union of every card's typed triples, as one
// Turtle resource — the single Comunica source + the surface the SHACL floor reasons over.
import { extractCard, quadsToTurtle } from './extract.mjs'

export const graphChannel = {
  name: 'graph',
  mediaType: 'text/turtle',
  target: containerUrl => `${containerUrl}graph.ttl`,
  render: async (containerUrl, cards, _members) =>
    quadsToTurtle(cards.flatMap(c => extractCard(c.body, c.url))),
}
