// viz-template.mjs — self-contained graph viewer (spec §3). No CDN: cytoscape is
// inlined from the pinned npm dep at materialize time. Fetches ./graph.jsonld live.
import { readFileSync } from 'node:fs'

const CYTOSCAPE = readFileSync(new URL('../node_modules/cytoscape/dist/cytoscape.min.js', import.meta.url), 'utf8')

export function renderViz({ edgeKeys }) {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>graph</title><style>
:root{color-scheme:light dark}body{margin:0;font:14px system-ui,sans-serif;display:grid;grid-template-columns:1fr 22rem;height:100vh}
#cy{width:100%;height:100%}#panel{border-left:1px solid #8884;padding:1rem;overflow:auto}
#bar{position:fixed;top:.5rem;left:.5rem;display:flex;gap:.5rem;z-index:2}
input,select{font:inherit;padding:.2rem .4rem}#err{color:#c00;padding:1rem}</style>
<script>${CYTOSCAPE}</script></head>
<body><div id="cy"></div><aside id="panel"><p>Select a node.</p></aside>
<div id="bar"><input id="q" placeholder="search"><select id="tf"><option value="">all types</option></select></div>
<script>
const EDGE_KEYS = ${JSON.stringify(edgeKeys)};
const hueOf = (n) => { let h = 0; for (const c of String(n)) h = (h*31 + c.charCodeAt(0)) % 360; return h }; // = html-face.mjs hueOf
const localName = (t) => String(t).replace(/^.*[#/:]/, '');
const asArr = (v) => v == null ? [] : (Array.isArray(v) ? v : [v]);
fetch('graph.jsonld').then((r) => { if (!r.ok) throw new Error('graph.jsonld ' + r.status); return r.json() })
.then((ds) => {
  const nodes = new Map(), edges = [], docOf = new Map();
  for (const doc of asArr(ds['@graph'])) for (const e of asArr(doc['@graph'])) {
    if (!e['@id']) continue;
    const ty = localName(asArr(e.type ?? e['@type'])[0] ?? 'Thing');
    nodes.set(e['@id'], { id: e['@id'], label: e.title ?? localName(e['@id']), type: ty });
    docOf.set(e['@id'], doc['@id']);
    for (const k of EDGE_KEYS) for (const t of asArr(e[k]))
      edges.push({ source: e['@id'], target: typeof t === 'object' ? t['@id'] : t, label: k });
  }
  const real = edges.filter((e) => nodes.has(e.target));
  const types = [...new Set([...nodes.values()].map((n) => n.type))].sort();
  for (const t of types) tf.add(new Option(t, t));
  const cy = cytoscape({ container: document.getElementById('cy'),
    elements: [...[...nodes.values()].map((n) => ({ data: n })),
               ...real.map((e, i) => ({ data: { id: 'e' + i, ...e } }))],
    style: [
      { selector: 'node', style: { label: 'data(label)', 'font-size': 9, width: 18, height: 18,
        'background-color': (el) => \`hsl(\${hueOf(el.data('type'))} 60% 55%)\` } },
      { selector: 'edge', style: { label: 'data(label)', 'font-size': 7, 'curve-style': 'bezier',
        'target-arrow-shape': 'triangle', width: 1, 'arrow-scale': .7 } },
      { selector: '.dim', style: { opacity: .12 } }],
    layout: { name: 'cose', animate: false } });
  const backlinksOf = (id) => real.filter((e) => e.target === id);
  const show = (n) => {
    const bl = backlinksOf(n.id).map((e) =>
      \`<li>\${nodes.get(e.source)?.label ?? e.source} <em>\${e.label}</em></li>\`).join('');
    panel.innerHTML = \`<h2>\${n.label}</h2><p><span style="background:hsl(\${hueOf(n.type)} 60% 88%);border-radius:1rem;padding:0 .5rem">\${n.type}</span></p>
      <p><a href="\${n.id}">open card</a></p><h3>Cited by</h3><ul>\${bl || '<li>—</li>'}</ul><div id="prev">…</div>\`;
    fetch(docOf.get(n.id) ?? n.id, { headers: { Accept: 'text/html' } }).then((r) => r.ok ? r.text() : '')
      .then((t) => { const m = t.match(/<article>([\\s\\S]*?)<\\/article>/); if (m) document.getElementById('prev').innerHTML = m[1]; })
      .catch(() => {});
  };
  cy.on('tap', 'node', (ev) => show(ev.target.data()));
  q.oninput = () => { const s = q.value.toLowerCase();
    cy.nodes().forEach((n) => n.toggleClass('dim', !!s && !n.data('label').toLowerCase().includes(s))); };
  tf.onchange = () => cy.nodes().forEach((n) => n.toggleClass('dim', !!tf.value && n.data('type') !== tf.value));
  const focus = decodeURIComponent((location.hash.match(/focus=([^&]+)/) || [])[1] ?? '');
  if (focus && nodes.has(focus)) { const n = cy.getElementById(focus); n.select(); cy.center(n); show(nodes.get(focus)); }
}).catch((e) => { document.body.innerHTML = '<p id="err">graph unavailable: ' + e.message + '</p>'; });
</script></body></html>`
}
