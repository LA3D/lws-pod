// Prototype wiki-memory renderer.
// Reads concept cards (markdown + YAML frontmatter) and emits, per card, a clean
// document page (card.html) and, per bundle, a typed-graph view (viz.html).
// One remark/rehype parse drives the render; the same frontmatter edges drive the graph.
import { readFileSync, writeFileSync, readdirSync, mkdirSync } from 'node:fs';
import { join, basename } from 'node:path';
import matter from 'gray-matter';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import remarkRehype from 'remark-rehype';
import rehypeKatex from 'rehype-katex';
import rehypeHighlight from 'rehype-highlight';
import rehypeStringify from 'rehype-stringify';

const CARDS = 'cards', OUT = 'out';
mkdirSync(OUT, { recursive: true });

const slug = s => String(s).toLowerCase().replace(/[^\w]+/g, '-').replace(/^-|-$/g, '');
const EDGE_FIELDS = ['broader', 'narrower', 'implementedBy', 'implements', 'extends', 'related'];

const proc = unified()
  .use(remarkParse).use(remarkGfm).use(remarkMath)
  .use(remarkRehype, { allowDangerousHtml: true })
  .use(rehypeKatex).use(rehypeHighlight).use(rehypeStringify, { allowDangerousHtml: true });

// [[Wikilink]] / [[Target|alias]] -> [alias](target.html) before parsing.
const wikilinks = b => b.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g,
  (_, t, alt) => `[${alt || t}](${slug(t)}.html)`);

const HEAD = `<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/highlight.js@11/styles/github.min.css">
<style>
body{font:16px/1.65 -apple-system,system-ui,"Segoe UI",sans-serif;max-width:760px;margin:2rem auto;padding:0 1.2rem;color:#1a1a1a}
.fm{background:#f6f8fa;border:1px solid #d0d7de;border-radius:8px;padding:.7rem 1rem;margin-bottom:1.6rem;font-size:.9rem}
.fm .type{display:inline-block;background:#3b82f6;color:#fff;border-radius:5px;padding:1px 9px;font-size:.76rem;font-weight:600}
.fm .tags{color:#777}.fm .desc{color:#555;margin-top:.45rem}
h1{font-weight:600;margin:.2rem 0 1rem}h2{margin-top:1.8rem}
table{border-collapse:collapse;margin:1rem 0}td,th{border:1px solid #d0d7de;padding:5px 11px}th{background:#f6f8fa}
code{background:#f6f8fa;padding:1px 5px;border-radius:4px;font-size:.92em}pre code{display:block;padding:.8rem 1rem;overflow:auto}
a{color:#0969da;text-decoration:none}a:hover{text-decoration:underline}
.related{margin-top:2.2rem;border-top:1px solid #eaecef;padding-top:1rem;font-size:.92rem}
.related h3{font-size:.78rem;text-transform:uppercase;color:#999;letter-spacing:.05em;margin:0 0 .4rem}
.related b{color:#3b82f6;font-weight:600}.nav{font-size:.85rem;margin-bottom:1rem}
</style></head>`;

function renderCard(file) {
  const { data: fm, content } = matter(readFileSync(join(CARDS, file), 'utf8'));
  const body = String(proc.processSync(wikilinks(content)));
  const id = slug(fm.title || basename(file, '.md'));
  const related = EDGE_FIELDS.flatMap(f => {
    const v = fm[f]; if (!v) return [];
    return (Array.isArray(v) ? v : [v]).map(x => {
      const name = String(x).replace(/\[\[|\]\]/g, '');
      return `<li><b>${f}</b> &rarr; <a href="${slug(name)}.html">${name}</a></li>`;
    });
  }).join('');
  const tags = Array.isArray(fm.tags) ? fm.tags.join(', ') : '';
  writeFileSync(join(OUT, id + '.html'),
`<!doctype html><html lang="en">${HEAD}<body>
<div class="nav"><a href="viz.html">&#9783; graph</a> &middot; <a href="index.html">index</a></div>
<div class="fm"><span class="type">${fm.type || 'Note'}</span>${tags ? ` <span class="tags">${tags}</span>` : ''}
${fm.description ? `<div class="desc">${fm.description}</div>` : ''}</div>
<article>${body}</article>
${related ? `<div class="related"><h3>Related</h3><ul>${related}</ul></div>` : ''}
</body></html>`);
  return { id, title: fm.title || file, type: fm.type || 'Note', fm };
}

const cards = readdirSync(CARDS).filter(f => f.endsWith('.md')).map(renderCard);

// index.html (OKF-style nav)
writeFileSync(join(OUT, 'index.html'),
`<!doctype html><html lang="en">${HEAD}<body><div class="nav"><a href="viz.html">&#9783; graph</a></div>
<h1>Concepts</h1><ul>${cards.map(c => `<li><a href="${c.id}.html">${c.title}</a> &mdash; ${c.fm.description || ''}</li>`).join('')}</ul></body></html>`);

// viz.html — cytoscape graph from typed edges. Edge targets that aren't cards yet become
// faded "stub" nodes (not-yet-written knowledge) so every edge has a valid endpoint.
const deslug = s => s.split('-').map(w => w ? w[0].toUpperCase() + w.slice(1) : w).join(' ');
const nodeIds = new Set(cards.map(c => c.id));
const nodes = cards.map(c => ({ data: { id: c.id, label: c.title, type: c.type } }));
const edges = [];
for (const c of cards) for (const f of EDGE_FIELDS) {
  const v = c.fm[f]; if (!v) continue;
  for (const x of (Array.isArray(v) ? v : [v])) {
    const t = slug(String(x).replace(/\[\[|\]\]/g, ''));
    if (!nodeIds.has(t)) { nodeIds.add(t); nodes.push({ data: { id: t, label: deslug(t), type: '(not yet written)', stub: 1 } }); }
    edges.push({ data: { id: `${c.id}-${f}-${t}`, source: c.id, target: t, label: f } });
  }
}
writeFileSync(join(OUT, 'viz.html'),
`<!doctype html><html><head><meta charset="utf-8"><title>concept graph</title>
<script src="https://cdn.jsdelivr.net/npm/cytoscape@3.28.1/dist/cytoscape.min.js"></script>
<style>body{margin:0;font:14px sans-serif}#cy{width:100vw;height:100vh}</style></head>
<body><div id="cy"></div><script>
cytoscape({container:document.getElementById('cy'),
elements:${JSON.stringify([...nodes, ...edges])},
style:[{selector:'node',style:{'label':'data(label)','background-color':'#3b82f6','color':'#111','font-size':11,'text-valign':'bottom','width':26,'height':26}},
{selector:'node[?stub]',style:{'background-color':'#fff','border-width':2,'border-style':'dashed','border-color':'#cbd5e1','color':'#94a3b8'}},
{selector:'edge',style:{'label':'data(label)','width':2,'line-color':'#cbd5e1','target-arrow-color':'#cbd5e1','target-arrow-shape':'triangle','curve-style':'bezier','font-size':9,'color':'#94a3b8'}}],
layout:{name:'cose',animate:false,padding:60}}).on('tap','node',e=>{if(!e.target.data('stub'))location.href=e.target.id()+'.html';});
</script></body></html>`);

console.log(`rendered ${cards.length} cards + index.html + viz.html -> ${OUT}/`);
