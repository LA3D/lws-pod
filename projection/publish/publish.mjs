// Publish the defs tree to the pod + bind containers. Checks run FIRST; any
// failure exits 1 with nothing written (spec §9 — declaration-time, loud).
// Usage: node publish/publish.mjs --base https://pod.example [--container /alice/profiles/]
//        [--bind /alice/concepts/=llm-wiki] [--token <bearer>]
import { readFile, readdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join, relative } from 'node:path'
import { checkDescriptor, checkShapes, checkContext, checkVocabulary, usedTermsFromContext } from './checks.mjs'
import { loadProfile } from '../okf/profile-loader.mjs'

const DEFS = join(dirname(fileURLToPath(import.meta.url)), '..', 'profiles', 'defs')
const TYPES = { '.jsonld': 'application/ld+json', '.ttl': 'text/turtle' }
const DESCRIPTORS = ['substrate-floor.jsonld', 'okf-base.jsonld', 'llm-wiki/profile.jsonld']

// Known upstream vocabulary gaps, verified against the recorded pin — the
// completeness check CAUGHT these; we record rather than patch the verbatim
// mirror. Flag-upstream list (see FOLLOWUP): mentions is declared in
// context.jsonld but undefined in ontology.ttl at pin 2026-07-04/c91b7a1.
export const KNOWN_VOCAB_GAPS = ['https://la3d.github.io/llm-wiki-colab/ontology#mentions']

function arg(name, dflt = null) {
  const i = process.argv.indexOf(`--${name}`)
  return i > -1 ? process.argv[i + 1] : dflt
}
const binds = process.argv.flatMap((a, i) => (process.argv[i - 1] === '--bind' ? [a] : []))

async function* files(dir) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name)
    if (e.isDirectory()) yield* files(p)
    else yield p
  }
}

const base = arg('base') ?? (() => { throw new Error('--base required') })()
const container = arg('container', '/profiles/')
const token = arg('token', process.env.POD_TOKEN)
const root = new URL(container, base).href

// 1. Checks — all of them, before any write.
const failures = []
const curatedBases = []   // filled from llm-wiki context prefixes below
const wikiCtx = JSON.parse(await readFile(join(DEFS, 'llm-wiki/context.jsonld'), 'utf8'))['@context'] ?? {}
for (const v of Object.values(wikiCtx)) if (typeof v === 'string' && /[#/]$/.test(v)) curatedBases.push(v)
for (const d of DESCRIPTORS) failures.push(...await checkDescriptor(await readFile(join(DEFS, d), 'utf8'), new URL(d, root).href))
for (const s of ['okf-base.shape.ttl', 'llm-wiki/shapes.ttl']) failures.push(...await checkShapes(await readFile(join(DEFS, s), 'utf8'), s))
for (const c of ['okf-base.context.jsonld', 'llm-wiki/context.jsonld']) failures.push(...checkContext(await readFile(join(DEFS, c), 'utf8'), c, curatedBases))
const used = usedTermsFromContext(wikiCtx)
const ontologyTtl = await readFile(join(DEFS, 'llm-wiki/ontology.ttl'), 'utf8')
const allVocabFindings = await checkVocabulary(ontologyTtl, used)
const gatedVocabFindings = await checkVocabulary(ontologyTtl, used, KNOWN_VOCAB_GAPS)
failures.push(...gatedVocabFindings)
const filteredGaps = KNOWN_VOCAB_GAPS.filter((g) => allVocabFindings.some((f) => f.endsWith(g)))
if (filteredGaps.length) console.log(`known upstream vocab gaps (recorded, not patched): ${filteredGaps.join(', ')}`)
if (failures.length) { console.error('DECLARATION CHECKS FAILED:\n' + failures.map((f) => ' - ' + f).join('\n')); process.exit(1) }

// 2. Publish the tree.
const headers = token ? { authorization: `Bearer ${token}` } : {}
for await (const f of files(DEFS)) {
  const rel = relative(DEFS, f).split(sepEscape()).join('/')
  const url = new URL(rel, root).href
  const ct = TYPES[f.slice(f.lastIndexOf('.'))] ?? 'application/octet-stream'
  const r = await fetch(url, { method: 'PUT', headers: { ...headers, 'content-type': ct }, body: await readFile(f) })
  if (!r.ok && r.status !== 201 && r.status !== 205) { console.error(`PUT ${url} -> ${r.status}`); process.exit(1) }
  console.log(`PUT ${url} -> ${r.status}`)
}
function sepEscape() { return process.platform === 'win32' ? '\\' : '/' }

// 3. Bind containers: conformsTo (the index) + describedby (the enforcement
// cache, materialized from the profile's validation artifacts). Read-merge-write.
for (const b of binds) {
  const [path, tokenName] = b.split('=')
  const descriptor = tokenName === 'llm-wiki' ? new URL('llm-wiki/profile.jsonld', root).href
    : new URL(`${tokenName}.jsonld`, root).href
  const loaded = await loadProfile(descriptor)
  const metaUrl = new URL(path + '.meta', base).href
  let meta = {}
  const r0 = await fetch(metaUrl, { headers: { ...headers, accept: 'application/ld+json' } })
  if (r0.ok) { try { meta = await r0.json() } catch { meta = {} } }
  meta['@context'] = { ...(typeof meta['@context'] === 'object' ? meta['@context'] : {}),
    dct: 'http://purl.org/dc/terms/', powder: 'http://www.w3.org/2007/05/powder-s#' }
  meta['@id'] = meta['@id'] ?? ''
  meta['dct:conformsTo'] = { '@id': descriptor }
  meta['powder:describedby'] = loaded.validation.map((v) => ({ '@id': v }))
  const r = await fetch(metaUrl, { method: 'PUT', headers: { ...headers, 'content-type': 'application/ld+json' }, body: JSON.stringify(meta, null, 2) })
  if (!r.ok && r.status !== 201 && r.status !== 205) { console.error(`BIND ${metaUrl} -> ${r.status}`); process.exit(1) }
  console.log(`BIND ${path} conformsTo ${descriptor} (+${loaded.validation.length} describedby) -> ${r.status}`)
}
console.log('publish complete')
