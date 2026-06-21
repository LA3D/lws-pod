// Manual / backfill trigger. Drives the same project() the notifications trigger uses.
// Usage: TOKEN=<bearer> node triggers/cli.mjs <containerUrl>
import { project } from '../engine.mjs'
import { wikiMemoryProfile } from '../profiles/wiki-memory/index.mjs'

const container = process.argv[2]
if (!container) {
  console.error('usage: TOKEN=<bearer> node triggers/cli.mjs <containerUrl>')
  process.exit(2)
}
const res = await project(container, process.env.TOKEN || null, wikiMemoryProfile)
console.log(JSON.stringify(res))
if (res.some(r => ![200, 201, 204, 205].includes(r.status))) process.exit(1)
