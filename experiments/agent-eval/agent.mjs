// The cold agent under test: a Claude tool-use loop bridged onto the pod's MCP
// surface. Reads are exposed as list_resources/read_resource tools (a Claude
// API loop doesn't natively consume MCP Resources), plus the pod's own tools
// (minus `subscribe`, which streams). The agent is given NO pod-structure
// knowledge — everything must be discovered through the tools. Every step is
// captured in a trajectory for scoring/inspection.
import Anthropic from '@anthropic-ai/sdk';
import { JssMcp } from './mcp.mjs';

function renderResult(out) {
  if (out == null) return 'null';
  if (out.error) return `ERROR ${out.error.code ?? ''}: ${out.error.message ?? JSON.stringify(out.error)}`;
  if (out.contents) return out.contents.map(c => c.text ?? '').join('\n');            // resources/read
  if (out.content) return out.content.map(c => c.text ?? JSON.stringify(c)).join('\n'); // tools/call
  return JSON.stringify(out);
}

export async function runAgent({ base, token, model, system, task, maxTurns = 12, log }) {
  const anthropic = new Anthropic();               // reads ANTHROPIC_API_KEY
  const mcp = new JssMcp(base, token);
  await mcp.initialize();
  const podTools = (await mcp.listTools()).filter(t => t.name !== 'subscribe');
  const tools = [
    { name: 'list_resources', description: 'List the MCP resources this pod exposes (fixed resources + URI templates). Start here to discover the pod.', input_schema: { type: 'object', properties: {} } },
    { name: 'read_resource', description: 'Read a resource by its URI — a real https:// pod URL, or one of the fixed URIs from list_resources. Returns its representation (usually JSON-LD).', input_schema: { type: 'object', properties: { uri: { type: 'string' } }, required: ['uri'] } },
    ...podTools.map(t => ({ name: t.name, description: t.description, input_schema: t.inputSchema })),
  ];

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
      let out;
      if (tu.name === 'list_resources') out = { resources: await mcp.listResources(), templates: await mcp.listResourceTemplates() };
      else if (tu.name === 'read_resource') out = await mcp.readResource(tu.input.uri);
      else out = await mcp.callTool(tu.name, tu.input);
      const rendered = tu.name === 'list_resources' ? JSON.stringify(out) : renderResult(out);
      trajectory.push({ type: 'tool', name: tu.name, input: tu.input, result: rendered.slice(0, 4000) });
      log?.(`  → ${tu.name} ${JSON.stringify(tu.input).slice(0, 90)}`);
      results.push({ type: 'tool_result', tool_use_id: tu.id, content: rendered.slice(0, 12000) });
    }
    messages.push({ role: 'user', content: results });
  }
  return { finalText: '(max turns reached)', trajectory };
}
