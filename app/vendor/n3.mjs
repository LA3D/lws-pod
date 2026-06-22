// ESM wrapper around the self-contained UMD browser bundle (n3/browser/n3.min.js).
// The UMD IIFE has no module/exports/AMD in ESM scope, so it falls through to
// setting globalThis.N3; we re-export the named bindings graph.js uses.
import './n3.umd.js'
const N3 = globalThis.N3
export const { Store, Parser, Writer, DataFactory, StreamParser, StreamWriter, Util } = N3
export default N3
