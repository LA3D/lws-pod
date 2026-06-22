# vendored runtime dependencies

The app loads these four modules at runtime via the import map in `../index.html`.
They are **vendored** (committed here, served as static files) rather than loaded from a
CDN, so the app's availability does not depend on esm.sh or any third party. Total ~880 KB,
well under the `jss install` 10 MB body limit.

| Import specifier | File | Source | Notes |
|---|---|---|---|
| `marked` | `marked.mjs` | `node_modules/marked/lib/marked.esm.js` | self-contained ESM (zero deps) |
| `js-yaml` | `js-yaml.mjs` | `node_modules/js-yaml/dist/js-yaml.mjs` | self-contained ESM (zero deps) |
| `cytoscape` | `cytoscape.mjs` | `node_modules/cytoscape/dist/cytoscape.esm.min.mjs` | self-contained ESM (zero deps) |
| `n3` | `n3.mjs` + `n3.umd.js` | `node_modules/n3/browser/n3.min.js` | n3 has transitive deps (buffer, readable-stream); its official browserify **UMD** build inlines them. `n3.mjs` is a thin ESM wrapper that re-exports the globals the UMD sets. |

## Re-vendoring (when bumping a dependency)

Bump the version in `../package.json`, `npm install`, then:

```bash
cd app
cp node_modules/marked/lib/marked.esm.js            vendor/marked.mjs
cp node_modules/js-yaml/dist/js-yaml.mjs            vendor/js-yaml.mjs
cp node_modules/cytoscape/dist/cytoscape.esm.min.mjs vendor/cytoscape.mjs
cp node_modules/n3/browser/n3.min.js               vendor/n3.umd.js
# vendor/n3.mjs (the ESM wrapper) is hand-written — leave it unless n3's public API changes.
```

`test/browser-safe.test.mjs` and the node test suite import these from `node_modules` (not the
import map), so the vendored copies only affect the browser. Keep the vendored versions in sync
with the `package.json` devDependencies.
