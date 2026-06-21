// CDC trigger: subscribe to a container on JSS's solid-0.1 notification socket and
// re-project on change. One socket, debounced (the protocol does no dedup, so bursts
// coalesce). Decouples projection from the write path; catches all writes, not only proxied.
import WebSocket from 'ws'
import { project } from '../engine.mjs'
import { wikiMemoryProfile } from '../profiles/wiki-memory/index.mjs'

export function watch(containerUrl, opts = {}) {
  const { token = null, debounceMs = 300, profile = wikiMemoryProfile, onProject, onReady } = opts
  const wsUrl = opts.wsUrl || `ws://${new URL(containerUrl).host}/.notifications`
  const wsOpts = token ? { headers: { Authorization: `Bearer ${token}` } } : {}
  const ws = new WebSocket(wsUrl, wsOpts)
  let timer = null

  const schedule = () => {
    clearTimeout(timer)
    timer = setTimeout(async () => {
      try { onProject?.(await project(containerUrl, token, profile)) }
      catch (e) { console.error('[project]', e.message) }
    }, debounceMs)
  }

  ws.on('open', () => ws.send('sub ' + containerUrl))
  ws.on('message', d => {
    const s = d.toString()
    if (s.startsWith('ack ')) onReady?.()
    else if (s.startsWith('pub ')) schedule()
    else if (s.startsWith('err ')) console.error('[ws] subscribe failed:', s.slice(4))
  })
  ws.on('error', e => console.error('[ws]', e.message))
  ws.on('close', () => { clearTimeout(timer); console.error('[ws] socket closed — watcher halted (no auto-reconnect)') })
  return ws
}

// Run standalone: TOKEN=<bearer> node triggers/notifications.mjs <containerUrl>
if (import.meta.url === `file://${process.argv[1]}`) {
  const container = process.argv[2]
  if (!container) { console.error('usage: TOKEN=<bearer> node triggers/notifications.mjs <containerUrl>'); process.exit(2) }
  watch(container, { token: process.env.TOKEN || null, onProject: r => console.log('[projected]', JSON.stringify(r)) })
  console.log('watching', container)
}
