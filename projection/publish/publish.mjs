// Publish the defs tree to the pod + bind containers. Checks run FIRST; any
// failure exits 1 with nothing written (spec §9 — declaration-time, loud).
// MANIFEST-DRIVEN (L4a, coupling B4/B5): the descriptor set comes from
// defs/index.jsonld and each descriptor's own PROF roles drive its checks —
// adding a profile family is a manifest entry + files, never a code edit.
// Usage: node publish/publish.mjs --base https://pod.example [--container /alice/profiles/]
//        [--bind /alice/concepts/=llm-wiki] [--instantiate <path>=<token>] [--token <bearer>]
//        [--owner <webid>] [--check] [--no-acl]
import { readFile, readdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, relative } from 'node:path'
import { checkDescriptor, checkShapes, checkContext, checkVocabulary, usedTermsFromContext, checkRepresentation, checkPodConfig, makeDefsLoader } from './checks.mjs'
import { buildVoid, checkVoid } from './void.mjs'
import { ownerFromToken, provisionAcls } from './acl.mjs'
import { descriptorToProfile } from '../prof/profile-doc.mjs'
import { loadProfile } from '../prof/profile-loader.mjs'
import { instantiate, mergeContexts } from '../prof/instantiate.mjs'

const DEFS = join(dirname(fileURLToPath(import.meta.url)), '..', 'profiles', 'defs')
const TYPES = { '.jsonld': 'application/ld+json', '.ttl': 'text/turtle' }
const LWSPR = 'https://w3id.org/lws-pod/profile/role/'
const ROLE = 'http://www.w3.org/ns/dx/prof/role/'

function arg(name, dflt = null) {
  const i = process.argv.indexOf(`--${name}`)
  return i > -1 ? process.argv[i + 1] : dflt
}
const binds = process.argv.flatMap((a, i) => (process.argv[i - 1] === '--bind' ? [a] : []))
const insts = process.argv.flatMap((a, i) => (process.argv[i - 1] === '--instantiate' ? [a] : []))
const checkOnly = process.argv.includes('--check')
const noAcl = process.argv.includes('--no-acl')

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
const existsRel = (rel) => existsSync(join(DEFS, ...rel.split('/')))
failures.push(...checkVoid(manifest, existsRel))
try {
  failures.push(...checkPodConfig(await readFile(join(DEFS, 'pod-config.jsonld'), 'utf8'), manifest, existsRel, container))
} catch (e) { failures.push(`pod-config: unreadable (${e.message})`) }
if (manifest.void?.knownUndumped?.length) console.log(`void: known undumped vocab (recorded, not patched): ${manifest.void.knownUndumped.join(', ')}`)
if (failures.length) { console.error('DECLARATION CHECKS FAILED:\n' + failures.map((f) => ' - ' + f).join('\n')); process.exit(1) }
if (checkOnly) { console.log(`checks passed for ${DESCRIPTORS.length} profile(s)`); process.exit(0) }

// 1b. Owner resolution (review #11) — BEFORE any write, so an underivable owner
// fails loud with nothing half-provisioned. --owner wins; else the bearer's own
// webid claim. No hardcoded pod name.
const ownerArg = arg('owner')
if (ownerArg && !/^https?:\/\//.test(ownerArg)) { console.error(`--owner must be an absolute WebID URL, got '${ownerArg}'`); process.exit(1) }
const ownerWebId = ownerArg ?? (token ? ownerFromToken(token) : null)
if (!noAcl && !ownerWebId) {
  console.error('cannot determine the owner WebID for ACL provisioning: pass --owner <webid>, use a bearer whose JWT carries a webid claim, or opt out with --no-acl')
  process.exit(1)
}

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

// 2b. Materialize VoID (spec §5/§16): built in-memory from the manifest, PUT
// to the profiles container root — the doc itself never lives in the defs
// source tree (it isn't hand-authored; it's derived).
if (manifest.void && !checkOnly) {
  const voidDoc = buildVoid(manifest, { root, base })
  const rv = await fetch(new URL('void.jsonld', root).href, { method: 'PUT',
    headers: { ...headers, 'content-type': 'application/ld+json' }, body: JSON.stringify(voidDoc, null, 2) })
  if (!rv.ok && rv.status !== 201 && rv.status !== 205) { console.error(`PUT void.jsonld -> ${rv.status}`); process.exit(1) }
  console.log(`PUT ${new URL('void.jsonld', root).href} -> ${rv.status}`)
}

// 2c. ACLs (spec §7 — the OPS gap recorded 3x, closed): public-read + owner-control
// (isDefault both) on the profiles container and every --bind/--instantiate target, via
// the pod's own MCP write_acl tool. NOT a blind re-PUT (review #1): an existing .acl is
// left untouched, so an owner's hand-tightened ACL survives `make reinstantiate`.
// --no-acl opts out; --check already exited above, so a dry run never gets here.
if (!checkOnly && !noAcl) {
  const aclTargets = [...new Set([container, ...binds.map((b) => b.split('=')[0]), ...insts.map((s) => s.split('=')[0])])]
  try { await provisionAcls({ base, targets: aclTargets, ownerWebId, headers }) }
  catch (e) { console.error(e.message); process.exit(1) }
}

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

// 4. Instantiate (spec §5, renderer-free arm): materialize self/aggregate
// representations + advertise altr: for the container's current members.
// Renderer-backed representations are the application CLI's job — reported, skipped.
for (const s of insts) {
  const [path, tokenName] = s.split('=')
  const descriptor = profilesByToken[tokenName]
    ?? (() => { console.error(`--instantiate: no profile in the manifest has token '${tokenName}'`); process.exit(1) })()
  const loaded = await loadProfile(descriptor)
  let res
  try {
    res = await instantiate(new URL(path, base).href, token,
      { representations: loaded.representations, context: mergeContexts(loaded.contexts) },
      { onMissingRenderer: 'skip' })
  } catch (e) {
    // A profile can be published before its first container exists (fresh pod).
    if (/-> 404/.test(e.message)) { console.log(`INSTANTIATE ${path}: container absent (404) — skipped`); continue }
    throw e
  }
  const skipped = res.filter((r) => r.rep.startsWith('skipped:')).map((r) => r.rep.slice(8))
  if (skipped.length) console.log(`INSTANTIATE ${path}: skipped renderer-backed reps [${[...new Set(skipped)].join(', ')}] — app tooling owns them`)
  const bad = res.filter((r) => r.status && ![200, 201, 204, 205].includes(r.status))
  if (bad.length) { console.error(`INSTANTIATE ${path} failures: ${JSON.stringify(bad)}`); process.exit(1) }
  console.log(`INSTANTIATE ${path} ${tokenName} -> ${res.length} writes`)
}
console.log('publish complete')
