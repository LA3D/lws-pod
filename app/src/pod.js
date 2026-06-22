// Data-access core. The ONE module that talks to the pod/proxy. No DOM.
let session = { podUrl: '', token: '', proxyUrl: '' }
export const setSession = s => { session = { ...session, ...s } }
export const getSession = () => ({ ...session })

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
