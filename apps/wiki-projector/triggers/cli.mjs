// Manual / backfill instantiation over a bound container.
// usage: TOKEN=<bearer> node triggers/cli.mjs <containerUrl>
import { runOnce } from './run.mjs'

const container = process.argv[2]
if (!container) { console.error('usage: TOKEN=<bearer> node triggers/cli.mjs <containerUrl>'); process.exit(2) }
const res = await runOnce(container, process.env.TOKEN || null)
console.log(JSON.stringify(res))
if (res.some((r) => r.status && ![200, 201, 204, 205].includes(r.status))) process.exit(1)
