import { neighborhood } from '../graph.js'

const cardUrlOf = iri => { const u = new URL(iri); u.hash = ''; return u.href.replace(/([^/]+)$/, '$1.md') }

class WmGraph extends HTMLElement {
  connectedCallback() { this.attachShadow({ mode: 'open' }).innerHTML = '<div id="cy" style="height:400px"></div>'; this.refresh() }
  get container() { return this.getAttribute('container') }
  get focus() { return this.getAttribute('focus') }
  _els = []
  elements() { return this._els }
  async refresh() {
    if (!this.container || !this.focus) return
    const nb = await neighborhood(`${this.container}graph.ttl`, this.focus)
    this._els = [
      ...nb.nodes.map(n => ({ data: { id: n.id, label: n.label }, classes: n.stub ? 'stub' : '' })),
      ...nb.edges.map(e => ({ data: { id: `${e.source}|${e.label}|${e.target}`, source: e.source, target: e.target, label: e.label } })),
    ]
    const cy = await import('cytoscape').then(m => m.default).catch(() => null)
    if (!cy || !this.shadowRoot.querySelector('#cy')) return
    let inst
    try {
      inst = cy({ container: this.shadowRoot.querySelector('#cy'), elements: this._els,
        style: [{ selector: 'node', style: { label: 'data(label)' } },
                { selector: 'node.stub', style: { 'border-style': 'dashed', 'background-color': '#fff' } },
                { selector: 'edge', style: { label: 'data(label)', 'curve-style': 'bezier', 'target-arrow-shape': 'triangle' } }] })
    } catch { return }
    inst.on('tap', 'node', ev => this.dispatchEvent(new CustomEvent('wm-open-card',
      { bubbles: true, composed: true, detail: { url: cardUrlOf(ev.target.id()) } })))
  }
}
customElements.define('wm-graph', WmGraph)
