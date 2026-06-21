// Headless LWS-CID experiment — can an agent self-issue identity WITHOUT the browser doctor?
//
// Phase 1: provision a JsonWebKey verificationMethod into the pod profile, headless,
//          via the doctor's own recipe (authenticated GET-merge-PUT with If-Match).
// Phase 2: mint a self-signed LWS-CID JWT with that key and prove it authenticates
//          as the WebID (per the verifier in jss-server features/lws.md), plus
//          negative controls that must be rejected.
//
//   node run.mjs                 # BASE=http://localhost:3838
//   BASE=http://host:port node run.mjs
import { generateKeyPair, exportJWK, SignJWT } from 'jose';

const BASE   = process.env.BASE  || 'http://localhost:3838';
const ORIGIN = new URL(BASE).origin;
const EMAIL  = process.env.EMAIL || 'alice@example.com';
const PW     = process.env.PW    || 'alicepassword123';
const NAME   = process.env.NAME  || 'alice';

const log  = (...a) => console.log(...a);
const head = (s) => log(`\n=== ${s} ===`);
let PASS = true;
const check = (ok, msg) => { log(`  [${ok ? 'PASS' : 'FAIL'}] ${msg}`); if (!ok) PASS = false; return ok; };

// ---------------------------------------------------------------- owner token
head('0. owner token  POST /idp/credentials');
await fetch(`${BASE}/.pods`, {                       // idempotent — ignore 409 if pod exists
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ name: NAME, email: EMAIL, password: PW }),
}).catch(() => {});
const tokRes = await fetch(`${BASE}/idp/credentials`, {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ email: EMAIL, password: PW }),
});
const tok = await tokRes.json().catch(() => ({}));
const OWNER = tok.access_token;
const WEBID = tok.webid;
check(!!OWNER && !!WEBID, `got owner bearer + webid (${WEBID || 'none'})`);
if (!OWNER || !WEBID) { log('cannot continue without owner token'); process.exit(0); }
const CARD = WEBID.split('#')[0];          // the profile document URL
const VMID = `${CARD}#lws-key-1`;          // verificationMethod id == JWT kid

// ---------------------------------------------------------------- Phase 1
head('1. generate ES256 (P-256) keypair');
const { publicKey, privateKey } = await generateKeyPair('ES256');
const pub = await exportJWK(publicKey); pub.alg = 'ES256';
check(pub.kty === 'EC' && pub.crv === 'P-256' && pub.x && pub.y, `public JWK ${pub.kty}/${pub.crv}`);

head('2. GET profile card (capture ETag)');
const getRes = await fetch(CARD, { headers: { authorization: `Bearer ${OWNER}`, accept: 'application/ld+json' } });
const etag = getRes.headers.get('etag');
const card = await getRes.json();
check(getRes.ok && card['@context'], `GET ${getRes.status}, has @context, ETag=${etag || 'none'}`);

head('3. merge VM + authentication, PUT back (preserving @context)');
card.verificationMethod = [{
  id: VMID, type: 'JsonWebKey', controller: WEBID,
  publicKeyJwk: { kty: pub.kty, crv: pub.crv, alg: 'ES256', x: pub.x, y: pub.y },
}];
card.authentication = [VMID];
const putHeaders = { authorization: `Bearer ${OWNER}`, 'content-type': 'application/ld+json' };
if (etag) putHeaders['if-match'] = etag;
const putRes = await fetch(CARD, { method: 'PUT', headers: putHeaders, body: JSON.stringify(card) });
check(putRes.ok || putRes.status === 205 || putRes.status === 204,
  `PUT card -> ${putRes.status}${etag ? ' (If-Match)' : ''}`);
if (!putRes.ok && putRes.status !== 205 && putRes.status !== 204) {
  log('  body:', (await putRes.text()).slice(0, 300));
}

head('4. verify VM landed (re-GET)');
const card2 = await (await fetch(CARD, { headers: { authorization: `Bearer ${OWNER}`, accept: 'application/ld+json' } })).json();
const vm = (card2.verificationMethod || []).find?.(v => v && v.id === VMID) ||
           ([].concat(card2.verificationMethod || [])).find(v => v && v.id === VMID);
const authRefs = [].concat(card2.authentication || []);
check(!!vm, `verificationMethod ${VMID} present on the node`);
check(authRefs.includes(VMID), `authentication references ${VMID}`);
check(card2.controller === WEBID, `profile controller === WebID (${card2.controller})`);

// ---------------------------------------------------------------- Phase 2
const mint = async ({ kid = VMID, iss = WEBID, sub = WEBID, aud = ORIGIN, exp = '10m' } = {}) =>
  new SignJWT({ client_id: WEBID })
    .setProtectedHeader({ alg: 'ES256', kid })
    .setIssuer(iss).setSubject(sub).setAudience(aud)
    .setIssuedAt().setExpirationTime(exp)
    .sign(privateKey);

const PROOF = `${CARD.replace(/\/profile\/.*$/, '')}/notes/cid-proof.ttl`; // a resource the owner controls
const body = '<#p> <http://www.w3.org/2000/01/rdf-schema#label> "written via self-issued LWS-CID JWT" .';
const put = (auth) => fetch(PROOF, {
  method: 'PUT',
  headers: { ...(auth ? { authorization: `Bearer ${auth}` } : {}), 'content-type': 'text/turtle' },
  body,
});

const phase1 = PASS;   // everything up to here = headless provisioning
let phase2 = 'untested';

head('5. control: write with NO auth must be rejected');
check((await put(null)).status === 401, 'unauthenticated PUT -> 401 (resource is protected)');

head('6. LWS-CID auth round-trip (self-signed JWT)');
const jwt = await mint();
const r6 = await put(jwt);
const body6 = await r6.clone().text();
if ([200, 201, 204, 205].includes(r6.status)) {
  phase2 = 'works';
  check(true, `LWS-CID PUT -> ${r6.status} (authenticated as the WebID) ✓`);
  check((await fetch(PROOF, { headers: { authorization: `Bearer ${jwt}` } })).ok, 'GET it back with the same JWT');
  head('7. negative controls (verifier must reject)');
  check((await put(await mint({ exp: '-1m' }))).status === 401, 'expired exp -> 401');
  check((await put(await mint({ sub: `${WEBID}-tampered` }))).status === 401, 'sub !== iss -> 401');
  check((await put(await mint({ kid: `${CARD}#does-not-exist` }))).status === 401, 'unknown kid -> 401');
} else if (/kid must use https/i.test(body6)) {
  phase2 = 'blocked-http';
  log(`  PUT -> ${r6.status}; server: "${body6.slice(0, 120)}"`);
  log('  [BLOCKED — not a failure] The LWS-CID verifier requires an https WebID/kid.');
  log('  This pod is http — the kid is an http URL, so the LWS-CID path is unreachable.');
  log('  Re-run over TLS (make cert && make up-tls && make cid-tls).');
} else if (/SSRF|private IP|localhost URLs/i.test(body6)) {
  phase2 = 'blocked-ssrf';
  log(`  PUT -> ${r6.status}; server: "${body6.slice(0, 200)}"`);
  log('  [BLOCKED — by design] JSS hardcodes blockPrivateIPs:true in the CID-document');
  log('  fetcher (src/auth/cid-doc-fetch.js). The verifier refuses to dereference a WebID');
  log('  that resolves to a loopback/private IP, so LWS-CID auth cannot be exercised on any');
  log('  local/private deployment. It requires a PUBLIC-IP WebID (public DNS + TLS).');
} else {
  phase2 = 'unexpected';
  check(false, `LWS-CID PUT -> ${r6.status}: ${body6.slice(0, 200)}`);
  log('  www-authenticate:', r6.headers.get('www-authenticate') || '(none)');
  log('  JWT:', jwt);
}

head('RESULT');
log(`  Phase 1 (headless key provisioning):  ${phase1 ? 'WORKS ✓ — no browser doctor needed' : 'FAILED — read above'}`);
log(`  Phase 2 (self-signed LWS-CID auth):   ${
  phase2 === 'works' ? 'WORKS ✓' :
  phase2 === 'blocked-http' ? 'BLOCKED on http — requires an https/TLS deployment' :
  phase2 === 'blocked-ssrf' ? 'BLOCKED by design — verifier requires a public-IP WebID (SSRF guard); needs a public deployment' :
  'UNEXPECTED — read above'}`);
log(`  (BASE=${BASE}, WebID=${WEBID}, kid=${VMID})`);
process.exit(0);
