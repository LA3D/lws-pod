// Publish the defs tree to the pod + bind containers. Checks run FIRST; any
// failure exits 1 with nothing written (spec §9 — declaration-time, loud).
// MANIFEST-DRIVEN (L4a, coupling B4/B5): the descriptor set comes from
// defs/index.jsonld and each descriptor's own PROF roles drive its checks —
// adding a profile family is a manifest entry + files, never a code edit.
// Usage: node publish/publish.mjs --base https://pod.example [--container /alice/profiles/]
//        [--bind /alice/concepts/=llm-wiki] [--token <bearer>] [--check]
import { readFile, readdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join, relative } from 'node:path'
import { checkDescriptor, checkShapes, checkContext, checkVocabulary, usedTermsFromContext, checkRepresentation, makeDefsLoader } from './checks.mjs'
import { descriptorToProfile } from '../prof/profile-doc.mjs'
import { loadProfile } from '../prof/profile-loader.mjs'

const DEFS = join(dirname(fileURLToPath(import.meta.url)), '..', 'profiles', 'defs')
const TYPES = { '.jsonld': 'application/ld+json', '.ttl': 'text/turtle' }
const LWSPR = 'https://w3id.org/lws-pod/profile/role/'
const ROLE = 'http://www.w3.org/ns/dx/prof/role/'

function arg(name, dflt = null) {
  const i = process.argv.indexOf(`--${name}`)
  return i > -1 ? process.argv[i + 1] : dflt
}
const binds = process.argv.flatMap((a, i) => (process.argv[i - 1] === '--bind' ? [a] : []))
const checkOnly = process.argv.includes('--check')

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
const loader = makeDefsLoader(root)

// 0. The manifest is the single source of the profile set.
const manifest = JSON.parse(await readFile(join(DEFS, 'index.jsonld'), 'utf8'))
const DESCRIPTORS = manifest.profiles ?? []
const KNOWN_VOCAB_GAPS = manifest.knownVocabGaps ?? []
const localPath = (absUrl) => join(DEFS, ...absUrl.slice(root.length).split('/'))

// 1. Checks — all of them, per descriptor, driven by its own roles.
const failures = []
const profilesByToken = {}
for (const d of DESCRIPTORS) {
  const dUrl = new URL(d, root).href
  const dText = await readFile(join(DEFS, ...d.split('/')), 'utf8')
  failures.push(...await checkDescriptor(dText, dUrl, loader))
  let prof
  try { prof = await descriptorToProfile(dText, dUrl, { documentLoader: loader }) } catch (e) { failures.push(`descriptor ${d}: ${e.message}`); continue }
  if (prof.token) profilesByToken[prof.token] = dUrl

  const ctxRes = prof.resources.find((r) => r.roles.includes(LWSPR + 'context'))
  const ctxObj = ctxRes ? (JSON.parse(await readFile(localPath(ctxRes.artifact), 'utf8'))['@context'] ?? {}) : {}
  const curatedBases = Object.values(ctxObj).filter((v) => typeof v === 'string' && /[#/]$/.test(v))

  const repsSeen = []
  for (const r of prof.resources) {
    const art = () => readFile(localPath(r.artifact), 'utf8')
    if (r.roles.includes(ROLE + 'validation')) failures.push(...await checkShapes(await art(), `${d}:${r.artifact.split('/').pop()}`))
    if (r.roles.includes(LWSPR + 'context')) failures.push(...checkContext(await art(), `${d}:${r.artifact.split('/').pop()}`, curatedBases))
    if (r.roles.includes(ROLE + 'vocabulary')) {
      const used = usedTermsFromContext({ '@context': ctxObj })
      const all = await checkVocabulary(await art(), used)
      const gated = await checkVocabulary(await art(), used, KNOWN_VOCAB_GAPS)
      failures.push(...gated)
      const noted = KNOWN_VOCAB_GAPS.filter((g) => all.some((f) => f.endsWith(g)))
      if (noted.length) console.log(`known upstream vocab gaps in ${d} (recorded, not patched): ${noted.join(', ')}`)
    }
    if (r.roles.includes(LWSPR + 'representation')) {
      const txt = await art()
      failures.push(...checkRepresentation(txt, `${d}:${r.artifact.split('/').pop()}`))
      try { repsSeen.push(JSON.parse(txt)) } catch { /* already failed above */ }
    }
  }
  if (repsSeen.filter((x) => x.default).length > 1) failures.push(`${d}: more than one default representation`)
}
if (failures.length) { console.error('DECLARATION CHECKS FAILED:\n' + failures.map((f) => ' - ' + f).join('\n')); process.exit(1) }
if (checkOnly) { console.log(`checks passed for ${DESCRIPTORS.length} profile(s)`); process.exit(0) }

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
// Token → descriptor via the manifest (hasToken match) — no name special-cases.
for (const b of binds) {
  const [path, tokenName] = b.split('=')
  const descriptor = profilesByToken[tokenName]
    ?? (() => { console.error(`--bind: no profile in the manifest has token '${tokenName}'`); process.exit(1) })()
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
