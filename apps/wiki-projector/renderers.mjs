// Application-#1 renderers: what the wiki family materializes per declared
// representation. links = the memory's typed edges as flat #it JSON-LD (the
// SHACL-governed face); index = the OKF navigation channel. The neutral
// instantiate() step drives these; content (markdown) is the canonical
// resource itself and is never transformed.
import { parseFrontmatter, isConformant } from './frontmatter.mjs'
import { cardToQuads } from './card.mjs'
import { makeEngineProfile } from './engine-profile.mjs'
import { renderIndex } from './index-channel.mjs'
import { renderCardHtml, renderIndexHtml } from './html-face.mjs'
import { renderViz } from './viewer/viz-template.mjs'
import { loadNamespaces } from '../../projection/prof/namespaces.mjs'
import { quadsToFlat } from '../../projection/prof/jsonld-graph.mjs'

const isMarkdown = (src) => src.contentType.startsWith('text/markdown') || /\.md$/.test(src.url)
const localName = (t) => { const s = String(t); return s.includes(':') ? s.slice(s.lastIndexOf(':') + 1) : s }

export function makeRenderers(loaded, authority) {
  const profile = makeEngineProfile(loaded, authority)
  const ns = loadNamespaces(profile.context)
  const policy = profile.identityPolicy
  const ctx = profile.context['@context']
  const edgeKeys = Object.entries(ns.term).filter(([, t]) => typeof t === 'object' && t?.['@type'] === '@id').map(([k]) => k)

  const cardOf = (src) => {
    if (!isMarkdown(src)) return null
    const { frontmatter, body } = parseFrontmatter(src.body)
    return isConformant(frontmatter) ? { url: src.url, frontmatter, body } : null
  }

  return {
    profile,
    renderers: {
      links: async (src) => {
        if (!cardOf(src)) return null
        const { quads } = cardToQuads(src.body, src.url, ns, policy)
        return quads.length ? JSON.stringify(await quadsToFlat(quads, ctx), null, 2) : null
      },
      html: async (src) => renderCardHtml(src, ns, policy),
      index: async (containerUrl, sources, members) => {
        const cards = sources.map(cardOf).filter(Boolean)
          .map((c) => ({ ...c, frontmatter: { ...c.frontmatter, type: localName(c.frontmatter.type ?? 'Concept') } }))
        return renderIndex(containerUrl, cards, members.map((m) => ({ ...m, type: m.isContainer ? 'container' : 'data' })))
      },
      'index-html': async (containerUrl, sources, members) =>
        renderIndexHtml(containerUrl, sources.map(cardOf).filter(Boolean),
          members.map((m) => ({ url: m.url, isContainer: m.isContainer }))),
      viz: async () => { try { return renderViz({ edgeKeys }) } catch (e) { console.warn(`[viz] ${e.message}`); return null } },
    },
  }
}
