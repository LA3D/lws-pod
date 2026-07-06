// The cold agent under test: a Claude tool-use loop over the pod's native MCP
// tools. Since spec 2026-07-06, the pod serves read_resource/list_resources as
// its own tools (no local bridge needed). The agent consumes the pod's tool list
// directly (minus `subscribe`, which streams). The agent is given NO pod-structure
// knowledge — everything must be discovered through the tools. Every step is
// captured in a trajectory for scoring/inspection.
import Anthropic from '@anthropic-ai/sdk';
import { JssMcp } from './mcp.mjs';

function renderResult(out) {
  if (out == null) return 'null';
  if (out.error) return `ERROR ${out.error.code ?? ''}: ${out.error.message ?? JSON.stringify(out.error)}`;
  if (out.content) return out.content.map(c => c.text ?? JSON.stringify(c)).join('\n'); // tools/call
  return JSON.stringify(out);
}

export async function runAgent({ base, token, model, system, task, maxTurns = 12, log }) {
  const anthropic = new Anthropic();               // reads ANTHROPIC_API_KEY
  const mcp = new JssMcp(base, token);
  await mcp.initialize();
  // The pod's OWN tools drive the whole loop — reads included (read_resource /
  // list_resources are served by the pod since spec 2026-07-06; the local
  // Resources->tools bridge this file used to carry is gone). `subscribe`
  // streams, which this single-shot loop doesn't consume.
  const tools = (await mcp.listTools())
    .filter(t => t.name !== 'subscribe')
    .map(t => ({ name: t.name, description: t.description, input_schema: t.inputSchema }));

  const messages = [{ role: 'user', content: task }];
  const trajectory = [];
  for (let turn = 0; turn < maxTurns; turn++) {
    const resp = await anthropic.messages.create({ model, max_tokens: 2048, system, tools, messages });
    messages.push({ role: 'assistant', content: resp.content });
    const text = resp.content.filter(b => b.type === 'text').map(b => b.text).join('\n').trim();
    if (text) trajectory.push({ type: 'thought', text });
    const toolUses = resp.content.filter(b => b.type === 'tool_use');
    if (resp.stop_reason !== 'tool_use') return { finalText: text, trajectory };

    const results = [];
    for (const tu of toolUses) {
      const out = await mcp.callTool(tu.name, tu.input);
      const rendered = renderResult(out);
      trajectory.push({ type: 'tool', name: tu.name, input: tu.input, result: rendered.slice(0, 4000) });
      log?.(`  → ${tu.name} ${JSON.stringify(tu.input).slice(0, 90)}`);
      results.push({ type: 'tool_result', tool_use_id: tu.id, content: rendered.slice(0, 12000) });
    }
    messages.push({ role: 'user', content: results });
  }
  return { finalText: '(max turns reached)', trajectory };
}
