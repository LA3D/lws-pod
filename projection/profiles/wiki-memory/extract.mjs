// Semantic-Markdown → RDF extractor for wiki-memory concept cards. Pure.
import { readFileSync } from 'node:fs'
import { Writer } from 'n3'
import { loadNamespaces } from '../../prof/namespaces.mjs'
import { cardToQuads } from '../../../apps/wiki-projector/card.mjs'

const context = JSON.parse(readFileSync(new URL('./context.jsonld', import.meta.url)))
const ns = loadNamespaces(context)
export const PREFIXES = ns.prefixes

export function extractCard(markdown, cardUrl) {
  // TODO(plan-2): cardToQuads now requires a 4th `policy` arg — thread the profile's identityPolicy through here (this 3-arg call is why the wiki-memory suite is red).
  return cardToQuads(markdown, cardUrl, ns)
}

export function quadsToTurtle(quads) {
  return new Promise((resolve, reject) => {
    const w = new Writer({ prefixes: PREFIXES })
    w.addQuads(quads)
    w.end((err, result) => (err ? reject(err) : resolve(result)))
  })
}
