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

const UPSTREAM = process.env.UPSTREAM || 'http://localhost:3838';
const PORT = Number(process.env.PORT || 3839);
const CB = 'http://www.w3.org/ns/ldp#constrainedBy';

const dataset = (ttl, base) => rdf.dataset(new Parser({ baseIRI: base }).parse(ttl));
const shapeCache = new Map();   // container path -> shape URL | null
const shapeDsCache = new Map(); // shape URL -> validator

function containerOf(url, method) {
  if (method === 'POST') return url.endsWith('/') ? url : url + '/';
  return url.slice(0, url.lastIndexOf('/') + 1); // PUT/PATCH -> parent container
}

async function constrainedBy(container) {
  if (shapeCache.has(container)) return shapeCache.get(container);
  let shape = null;
  try {
    const r = await fetch(`${UPSTREAM}${container}.meta`, { headers: { Accept: 'text/turtle' } });
    if (r.ok) for (const q of dataset(await r.text(), `${UPSTREAM}${container}`))
      if (q.predicate.value === CB) { shape = q.object.value; break; }
  } catch { /* no .meta / unreadable -> unconstrained */ }
  shapeCache.set(container, shape);
  return shape;
}

async function validatorFor(shapeUrl) {
  if (shapeDsCache.has(shapeUrl)) return shapeDsCache.get(shapeUrl);
  const r = await fetch(shapeUrl, { headers: { Accept: 'text/turtle' } });
  const v = new Validator(dataset(await r.text(), shapeUrl), { factory: rdf });
  shapeDsCache.set(shapeUrl, v);
  return v;
}

const readBody = req => new Promise(res => { const c = []; req.on('data', d => c.push(d)); req.on('end', () => res(Buffer.concat(c))); });

const server = http.createServer(async (req, res) => {
  const body = await readBody(req);
  const { method, url } = req;
  const isWrite = method === 'PUT' || method === 'POST' || method === 'PATCH';

  if (isWrite) {
    const shapeUrl = await constrainedBy(containerOf(url, method));
    if (shapeUrl) {
      try {
        const validator = await validatorFor(shapeUrl);
        const report = await validator.validate({ dataset: dataset(body.toString('utf8'), `${UPSTREAM}${url}`) });
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
    const sh = await constrainedBy(url);
    if (sh) out['link'] = (out['link'] ? out['link'] + ', ' : '') + `<${sh}>; rel="${CB}"`;
  }
  const buf = Buffer.from(await up.arrayBuffer());
  res.writeHead(up.status, out);
  res.end(buf);
});

server.listen(PORT, () => console.log(`constrained-container admission proxy: :${PORT} -> ${UPSTREAM}`));
