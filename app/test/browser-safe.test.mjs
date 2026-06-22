// browser-safe.test.mjs
// Regression guard: none of the browser-loaded source modules may have a
// TOP-LEVEL static `import ... from 'node:...'`. Dynamic `await import('node:...')`
// inside a function body is allowed.
//
// A top-level static node: import looks like:
//   import ... from 'node:...'   (at start of line, possibly with leading spaces)
// but NOT inside a function — we test for the pattern at the start of a statement.

import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { describe, it, expect } from 'vitest'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const srcDir = path.resolve(__dirname, '../src')

// All modules in the browser's static import graph
const browserModules = [
  'graph.js',
  'pod.js',
  'parse.js',
  'esc.js',
  'components/wm-app.js',
  'components/wm-card.js',
  'components/wm-index.js',
  'components/wm-graph.js',
  'components/wm-editor.js',
  'components/wm-login.js',
]

// Matches a top-level static import from node: — i.e. a line beginning with optional
// whitespace then `import` then anything then `from` then a 'node:...' specifier.
// This does NOT match `await import('node:...')` because that line begins with
// `await` or is inside a function body (indented with a statement prefix), not
// with the keyword `import` at line-start.
const TOP_LEVEL_NODE_IMPORT = /^\s*import\b[^(].*from\s+['"]node:/m

describe('browser-safe source modules', () => {
  for (const rel of browserModules) {
    it(`${rel} has no top-level static node: import`, async () => {
      const fullPath = path.join(srcDir, rel)
      const source = await readFile(fullPath, 'utf8')
      const match = source.match(TOP_LEVEL_NODE_IMPORT)
      if (match) {
        throw new Error(
          `${rel} contains a top-level static node: import which breaks browser loading:\n  ${match[0].trim()}`
        )
      }
      expect(match).toBeNull()
    })
  }
})

// Regression guard: N3's Store.match() throws "Class constructor E cannot be invoked
// without 'new'" in the esm.sh browser build (it pulls in readable-stream). Node tests
// pass because Node's N3 build is fine, so this is invisible to unit tests — encode it.
// Use store.getObjects / getSubjects / getQuads instead.
it('graph.js does not call N3 store.match() (browser-broken via esm.sh)', async () => {
  const source = await readFile(path.join(srcDir, 'graph.js'), 'utf8')
  expect(source).not.toMatch(/\.match\s*\(/)
})

// Sanity-check: verify the regex WOULD catch a top-level static import
it('regex catches top-level node: import (sanity check)', () => {
  const bad = `import { readFile } from 'node:fs/promises'\n\nexport function foo() {}`
  expect(TOP_LEVEL_NODE_IMPORT.test(bad)).toBe(true)
})

// Sanity-check: verify the regex does NOT flag a dynamic import inside a function
it('regex does not flag dynamic await import inside function body', () => {
  const good = `export async function loadStore(url) {\n  const { readFile } = await import('node:fs/promises')\n  return readFile(url, 'utf8')\n}`
  expect(TOP_LEVEL_NODE_IMPORT.test(good)).toBe(false)
})
