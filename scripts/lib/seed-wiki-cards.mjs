// Seed two demo wiki cards into a tenant's bound wiki container + run the
// projector once to materialize faces (content/links/html/index/graph/viz).
// Shared by scripts/seed-multitenant.sh for every tenant (alice, bob, ...) —
// same demo shape each time, only base/container/token vary.
//
// Usage: node seed-wiki-cards.mjs <base> <wikiContainer> <token>
//   e.g. node seed-wiki-cards.mjs https://pod.vardeman.me /bob/wiki/ $BOB_TOKEN
import { runOnce } from '../../apps/wiki-projector/triggers/run.mjs'

const [, , BASE, WIKI, TOKEN] = process.argv
if (!BASE || !WIKI || !TOKEN) { console.error('usage: seed-wiki-cards.mjs <base> <wikiContainer> <token>'); process.exit(1) }
const auth = { Authorization: `Bearer ${TOKEN}` }

const CARD_A = `---
type: llm-wiki-colab:Project
title: Alpha
up: b.md
---
Alpha prose — content the graph never sees.`
const CARD_B = `---
type: llm-wiki-colab:MOC
title: Beta
---
Beta prose.`

for (const [name, body] of [['a.md', CARD_A], ['b.md', CARD_B]]) {
  const r = await fetch(`${BASE}${WIKI}${name}`, { method: 'PUT', headers: { 'Content-Type': 'text/markdown', ...auth }, body })
  console.log(`PUT ${WIKI}${name} -> ${r.status}`)
  if (![200, 201, 204, 205].includes(r.status)) { console.error(`  body: ${await r.text()}`); process.exit(1) }
}
const res = await runOnce(`${BASE}${WIKI}`, TOKEN)
console.log(`runOnce ${WIKI}: ${JSON.stringify(res)?.slice(0, 200)}`)
