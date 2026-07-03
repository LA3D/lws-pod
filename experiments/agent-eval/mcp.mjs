// Thin MCP client for JSS's /mcp. Verified 2026-07-03: JSS speaks a STATELESS
// subset of MCP Streamable HTTP — POST JSON-RPC → application/json (no
// Mcp-Session-Id, no mandatory SSE for non-streaming). So no session tracking
// is needed. TLS to the fork pod (pod.vardeman.me, mkcert CA) is handled by
// NODE_EXTRA_CA_CERTS in the environment (global fetch/undici honors it).

export class JssMcp {
  constructor(base, token) {
    this.base = base.replace(/\/$/, '');
    this.token = token || null;
    this.id = 0;
    this.protocolVersion = null;
    this.capabilities = null;
    this.serverInfo = null;
  }

  #headers() {
    const h = { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' };
    if (this.token) h.Authorization = `Bearer ${this.token}`;
    return h;
  }

  async #rpc(method, params) {
    const r = await fetch(`${this.base}/mcp`, {
      method: 'POST', headers: this.#headers(),
      body: JSON.stringify({ jsonrpc: '2.0', id: ++this.id, method, params }),
    });
    if (r.status === 204) return { status: 204, body: null };
    return { status: r.status, body: await r.json().catch(() => null) };
  }

  async initialize() {
    const r = await this.#rpc('initialize', {
      protocolVersion: '2025-03-26', capabilities: {},
      clientInfo: { name: 'agent-eval', version: '0' },
    });
    const res = r.body?.result ?? {};
    this.protocolVersion = res.protocolVersion;
    this.capabilities = res.capabilities;
    this.serverInfo = res.serverInfo;
    // notification (no id) — JSS answers 204
    await fetch(`${this.base}/mcp`, { method: 'POST', headers: this.#headers(), body: JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) });
    return { protocolVersion: this.protocolVersion, capabilities: this.capabilities, serverInfo: this.serverInfo };
  }

  async listTools() { return (await this.#rpc('tools/list')).body?.result?.tools ?? []; }
  async listResources() { return (await this.#rpc('resources/list')).body?.result?.resources ?? []; }
  async listResourceTemplates() { return (await this.#rpc('resources/templates/list')).body?.result?.resourceTemplates ?? []; }

  // Returns { contents:[...] } on success, { error } on a JSON-RPC error.
  async readResource(uri) {
    const r = await this.#rpc('resources/read', { uri });
    return r.body?.error ? { error: r.body.error } : (r.body?.result ?? null);
  }

  // Returns { content:[...], isError } on success, { error } on a JSON-RPC error.
  async callTool(name, args) {
    const r = await this.#rpc('tools/call', { name, arguments: args });
    return r.body?.error ? { error: r.body.error } : (r.body?.result ?? null);
  }
}
