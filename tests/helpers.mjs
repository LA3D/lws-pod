export const BASE = process.env.BASE || 'http://localhost:3838'
export const POD = { name: 'alice', email: 'alice@example.com', password: 'alicepassword123' }

// Best-effort pod creation: created (2xx) and already-exists (409) are both fine.
export async function ensurePod(pod = POD) {
  const r = await fetch(`${BASE}/.pods`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(pod),
  })
  return r.status
}

// Headless agent credential — the replayable RS256 bearer from the built-in IdP.
export async function getToken(pod = POD) {
  const r = await fetch(`${BASE}/idp/credentials`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: pod.email, password: pod.password }),
  })
  if (!r.ok) throw new Error(`/idp/credentials -> ${r.status}`)
  const j = await r.json()
  return { token: j.access_token, webid: j.webid }
}
