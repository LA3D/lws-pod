import { Parser, DataFactory } from 'n3'
const { namedNode, quad } = DataFactory
const INVERSE_OF = 'http://www.w3.org/2002/07/owl#inverseOf'

export function materializeInverses(quads, edgesTtl) {
  const inv = new Map()
  for (const q of new Parser().parse(edgesTtl)) if (q.predicate.value === INVERSE_OF) inv.set(q.subject.value, q.object.value)

  const out = [...quads]
  for (const q of quads) {
    const p = inv.get(q.predicate.value)
    if (p && q.object.termType === 'NamedNode') out.push(quad(q.object, namedNode(p), q.subject))
  }
  return out
}
