// Data-access core. The ONE module that talks to the pod/proxy. No DOM.
// Session is persisted to localStorage so a page reload keeps the bearer (design §6).
const KEY = 'wm-session'
const blank = { podUrl: '', token: '', proxyUrl: '', webid: '' }
const storage = () => { try { return globalThis.localStorage ?? null } catch { return null } }   // lazy: always available in a browser
const load = () => { try { return { ...blank, ...JSON.parse(storage()?.getItem(KEY) || '{}') } } catch { return { ...blank } } }

let session = load()
export const setSession = s => { session = { ...session, ...s }; try { storage()?.setItem(KEY, JSON.stringify(session)) } catch {} }
export const getSession = () => ({ ...session })
export const clearSession = () => { session = { ...blank }; try { storage()?.removeItem(KEY) } catch {} }

const pathOf = url => new URL(url).pathname

export async function login(podUrl, email, password) {
  const res = await fetch(`${podUrl}/idp/credentials`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  if (!res.ok) throw new Error(`login failed (${res.status})`)
  const j = await res.json()
  return { token: j.access_token, webid: j.webid }
}

export function podFetch(url, opts = {}) {
  const headers = { ...(opts.headers || {}) }
  if (session.token) headers.Authorization = `Bearer ${session.token}`
  return fetch(url, { ...opts, headers })
}

export async function getText(url, accept = 'text/markdown') {
  const res = await podFetch(url, { headers: { Accept: accept } })
  if (!res.ok) throw new Error(`GET ${url} -> ${res.status}`)
  return res.text()
}

export async function listContainer(url) { return getText(url, 'text/turtle') }

export async function getGraph(containerUrl) {
  return getText(`${containerUrl}graph.ttl`, 'text/turtle')
}

export async function putCard(cardUrl, markdown) {
  const target = session.proxyUrl ? `${session.proxyUrl}${pathOf(cardUrl)}` : cardUrl
  const res = await podFetch(target, {
    method: 'PUT', headers: { 'Content-Type': 'text/markdown' }, body: markdown,
  })
  return { status: res.status, message: await res.text() }
}
