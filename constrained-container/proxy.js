// Standalone constrained-container admission proxy.
//
// Sits in front of an LDP/Solid server (JSS by default). For writes (PUT/POST/PATCH)
// into a container that declares `ldp:constrainedBy <shape>` in its metadata, it
// SHACL-validates the request body against the shape and rejects non-conforming
// writes with 422 + the `constrainedBy` Link header (Solid Protocol §5.6). Every other
// request — and every write to an UNconstrained container — passes through unchanged.
import http from 'node:http';
import { Parser } from 'n3';
import rdf from 'rdf-ext';
import { Validator } from 'shacl-engine';
import { extractCard, quadsToTurtle } from '../projection/profiles/wiki-memory/extract.mjs';

const UPSTREAM = process.env.UPSTREAM || 'http://localhost:3838';
const PORT = Number(process.env.PORT || 3839);
const CB = 'http://www.w3.org/ns/ldp#constrainedBy';

const mkDataset = (ttl, base) => rdf.dataset(new Parser({ baseIRI: base }).parse(ttl));
const shapeCache = new Map();   // container path -> shape URL | null
const shapeDsCache = new Map(); // shape URL -> validator

function containerOf(url, method) {
  if (method === 'POST') return url.endsWith('/') ? url : url + '/';
  return url.slice(0, url.lastIndexOf('/') + 1); // PUT/PATCH -> parent container
}

async function constrainedBy(container, auth) {
  const key = `${auth || ''} ${container}`;
  if (shapeCache.has(key)) return shapeCache.get(key);
  let shape = null;
  try {
    const r = await fetch(`${UPSTREAM}${container}.meta`, {
      headers: { Accept: 'text/turtle', ...(auth ? { Authorization: auth } : {}) },
    });
    if (r.ok) for (const q of mkDataset(await r.text(), `${UPSTREAM}${container}`))
      if (q.predicate.value === CB) { shape = q.object.value; break; }
  } catch { /* no .meta / unreadable -> unconstrained */ }
  shapeCache.set(key, shape);
  return shape;
}

async function validatorFor(shapeUrl, auth) {
  const key = `${auth || ''} ${shapeUrl}`;
  if (shapeDsCache.has(key)) return shapeDsCache.get(key);
  const r = await fetch(shapeUrl, {
    headers: { Accept: 'text/turtle', ...(auth ? { Authorization: auth } : {}) },
  });
  const v = new Validator(mkDataset(await r.text(), shapeUrl), { factory: rdf });
  shapeDsCache.set(key, v);
  return v;
}

const readBody = req => new Promise(res => { const c = []; req.on('data', d => c.push(d)); req.on('end', () => res(Buffer.concat(c))); });

const server = http.createServer(async (req, res) => {
  const body = await readBody(req);
  const { method, url } = req;
  const isWrite = method === 'PUT' || method === 'POST' || method === 'PATCH';
  const auth = req.headers['authorization'];

  if (isWrite) {
    const shapeUrl = await constrainedBy(containerOf(url, method), auth);
    if (shapeUrl) {
      try {
        const validator = await validatorFor(shapeUrl, auth);
        const ctype = req.headers['content-type'] || '';
        const baseIri = `${UPSTREAM}${url}`;
        let ds;
        if (ctype.includes('markdown')) {
          const ttl = await quadsToTurtle(extractCard(body.toString('utf8'), baseIri));
          ds = mkDataset(ttl, baseIri);
        } else {
          ds = mkDataset(body.toString('utf8'), baseIri);
        }
        const report = await validator.validate({ dataset: ds });
        if (!report.conforms) {
          const lines = report.results.map(r => {
            const msg = (Array.isArray(r.message) ? r.message[0]?.value : r.message) || 'constraint violation';
            return `#   - ${msg}${r.path?.value ? ` (path: ${r.path.value})` : ''}`;
          }).join('\n');
          res.writeHead(422, { 'Content-Type': 'text/plain', 'Link': `<${shapeUrl}>; rel="${CB}"` });
          res.end(`# 422 Unprocessable: this container is constrained by <${shapeUrl}>\n${lines}\n# Fix the cited fields and retry. (Discover the shape via the constrainedBy Link header.)\n`);
          console.log(`[reject] ${method} ${url} -> 422 (shape ${shapeUrl})`);
          return;
        }
        console.log(`[admit]  ${method} ${url} (conforms to ${shapeUrl})`);
      } catch (e) { console.error(`[error] validation ${url}: ${e.message} -> passing through`); }
    }
  }

  // transparent forward
  const headers = { ...req.headers }; delete headers.host; delete headers['content-length'];
  const up = await fetch(`${UPSTREAM}${url}`, { method, headers, body: isWrite ? body : undefined, redirect: 'manual' });
  const out = {}; up.headers.forEach((v, k) => { if (k !== 'content-length') out[k] = v; });

  // advertise the constraint on container reads (Solid §5.6: Link may appear on other responses)
  if (!isWrite && url.endsWith('/')) {
    const sh = await constrainedBy(url, auth);
    if (sh) out['link'] = (out['link'] ? out['link'] + ', ' : '') + `<${sh}>; rel="${CB}"`;
  }
  const buf = Buffer.from(await up.arrayBuffer());
  res.writeHead(up.status, out);
  res.end(buf);
});

server.listen(PORT, () => console.log(`constrained-container admission proxy: :${PORT} -> ${UPSTREAM}`));
