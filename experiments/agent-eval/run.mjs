// Orchestrator: seed the pod, run the cold-agent task battery, log trajectories,
// score, emit a JSON report. Without ANTHROPIC_API_KEY (or with --dry) it runs a
// plumbing smoke only (handshake + read surface) so the harness is useful — and
// the MCP handshake is verifiable — without a key or a model.
//
//   BASE=https://pod.vardeman.me NODE_EXTRA_CA_CERTS=certs/rootCA.pem \
//     ANTHROPIC_API_KEY=... AGENT_MODEL=claude-sonnet-5 node run.mjs [--dry] [--task=NAME]
import fs from 'node:fs';
import { seed } from './seed.mjs';
import { runAgent } from './agent.mjs';
import { tasks, coldSystem } from './tasks.mjs';
import { JssMcp } from './mcp.mjs';

const BASE = process.env.BASE || 'https://pod.vardeman.me';
const MODEL = process.env.AGENT_MODEL || 'claude-sonnet-5';
const argv = process.argv.slice(2);
const dry = argv.includes('--dry');
const only = (argv.find(a => a.startsWith('--task=')) || '').split('=')[1];
const log = (m) => process.stdout.write(m + '\n');

const { token, webId } = await seed(BASE);
log(`seeded pod at ${BASE} (webId ${webId})`);

if (dry || !process.env.ANTHROPIC_API_KEY) {
  const mcp = new JssMcp(BASE, token);
  const init = await mcp.initialize();
  log(`handshake: protocolVersion=${init.protocolVersion} server=${init.serverInfo?.name} caps=[${Object.keys(init.capabilities || {}).join(', ')}]`);
  log(`tools: ${(await mcp.listTools()).map(t => t.name).join(', ')}`);
  const info = await mcp.readResource(`${BASE}/.well-known/mcp/pod-info`);
  log(`pod-info steering hint present: ${/follow/i.test(info?.contents?.[0]?.text || '')}`);
  const ctx = await mcp.readResource(`${BASE}/.well-known/lws/context`);
  log(`lws @context resolves (items→lws:items): ${JSON.parse(ctx.contents[0].text)['@context'].items === 'lws:items'}`);
  const anon = await new JssMcp(BASE, null).readResource(`${BASE}/alice/notes/n1`);
  log(`no-oracle (anon read of owner-private note denied): ${!!anon?.error}`);
  if (!process.env.ANTHROPIC_API_KEY) log('\nANTHROPIC_API_KEY not set — ran plumbing smoke only. Set it to run the agent battery.');
  process.exit(0);
}

const system = coldSystem(BASE);
const battery = tasks(BASE).filter(t => !only || t.name === only);
const results = [];
for (const t of battery) {
  log(`\n=== TASK: ${t.name} ===`);
  const { finalText, trajectory } = await runAgent({ base: BASE, token, model: MODEL, system, task: t.prompt, log });
  const score = t.score(finalText, trajectory);
  const toolCalls = trajectory.filter(s => s.type === 'tool').length;
  log(`  final: ${finalText.replace(/\s+/g, ' ').slice(0, 160)}`);
  log(`  ${score.pass ? 'PASS' : 'FAIL'} ${JSON.stringify(score)} (${toolCalls} tool calls)`);
  results.push({ task: t.name, model: MODEL, pass: !!score.pass, score, finalText, trajectory });
}

fs.mkdirSync('out', { recursive: true });
const stamp = process.env.STAMP || `run-${MODEL}`;
fs.writeFileSync(`out/${stamp}.json`, JSON.stringify({ base: BASE, model: MODEL, results }, null, 2));
const passed = results.filter(r => r.pass).length;
log(`\n${passed}/${results.length} tasks passed (model ${MODEL}). Full trajectories → experiments/agent-eval/out/${stamp}.json`);
