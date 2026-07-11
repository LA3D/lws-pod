// VoID materialization (spec 2026-07-11 §5): the /.well-known/void document is DATA,
// built from the manifest — every declared vocabulary carries a pod-served dataDump
// (the pinned mirror), never a bare external URI, unless deliberately declaredExternal
// (proto-knowledge in model priors: DCAT, DCTERMS, SKOS...). checkVoid is the rail.
const CTX = {
  void: 'http://rdfs.org/ns/void#', dcterms: 'http://purl.org/dc/terms/',
  'void:rootResource': { '@type': '@id' }, 'void:uriSpace': { '@type': '@id' },
}

export function buildVoid(manifest, { root, base }) {
  const v = manifest.void
  const abs = (p, against = base) => new URL(p, against).href
  const vocab = [
    ...v.vocabularies.map((x) => ({ '@id': x.namespace, '@type': 'void:Dataset', 'void:dataDump': { '@id': abs(x.dataDump, root) } })),
    ...(v.declaredExternal ?? []).map((ns) => ({ '@id': ns })),
  ]
  return {
    '@context': CTX,
    '@id': abs('void.jsonld', root),
    '@type': 'void:Dataset',
    'void:rootResource': { '@id': abs(v.rootResource) },
    'void:uriSpace': abs(v.uriSpace),
    'void:vocabulary': vocab,
    'void:subset': (v.subsets ?? []).map((s) => ({
      '@id': abs(`void.jsonld#${s.name}`, root), '@type': 'void:Dataset',
      'void:rootResource': { '@id': abs(s.rootResource) },
      'dcterms:conformsTo': { '@id': abs(s.conformsTo, root) },
    })),
  }
}

export function checkVoid(manifest, existsRel) {
  const v = manifest.void
  if (!v) return []
  const fails = []
  const dumped = new Set()
  for (const x of v.vocabularies ?? []) {
    dumped.add(x.namespace)
    if (!existsRel(x.dataDump)) fails.push(`void: vocabulary ${x.namespace} declares dataDump ${x.dataDump} — not in the defs tree (the deref rail: no vocabulary without a pod-served definition)`)
  }
  for (const ns of v.declaredExternal ?? [])
    if (dumped.has(ns)) fails.push(`void: ${ns} is both dumped and declaredExternal — pick one`)
  for (const s of v.subsets ?? [])
    if (!(manifest.profiles ?? []).includes(s.conformsTo)) fails.push(`void: subset ${s.name} conformsTo ${s.conformsTo} — not a manifest profile`)
  return fails
}
