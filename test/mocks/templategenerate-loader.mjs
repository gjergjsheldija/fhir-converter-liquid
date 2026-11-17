// ESM `--experimental-loader` that redirects `src/lib/ai/generateTemplate.js` to the
// in-process mock `test/mocks/templategenerate-stub.mjs`.
//
// The redirect is done in the `load` hook by mapping *any* request URL that ends in
// `lib/ai/generateTemplate.js` to the stub's absolute file URL. This guarantees that
// the handler's dynamic `import("./lib/ai/generateTemplate.js")` and the test's
// `import("./test/mocks/templategenerate-stub.mjs")` resolve to the **same** module
// instance — one shared `_candidates`/`_errors`/`_calls` state — rather than two
// independent copies of the mock. A test that drives `stub.__resetState()` therefore
// controls exactly what the handler's provider call sees.
import { pathToFileURL } from 'url';

const root = process.cwd();
const stubUrl = pathToFileURL(`${root}/test/mocks/templategenerate-stub.mjs`).href;

export function resolve(specifier, context, nextResolve) {
    if (specifier.endsWith('lib/ai/generateTemplate.js')) {
        // Remap to the stub URL; the load hook below then loads stub source for it.
        return nextResolve(stubUrl, context);
    }
    return nextResolve(specifier, context);
}

export function load(url, context, nextLoad) {
    if (url === stubUrl) {
        // Nothing to rewrite: the stub file is already being loaded.
        return nextLoad(url, context);
    }
    if (url.endsWith('lib/ai/generateTemplate.js')) {
        // A real file URL still appears (e.g. the pre-existing binding) — serve the
        // stub source for it so the handler and the test share one module.
        return nextLoad(stubUrl, { ...context, shortCircuit: true });
    }
    return nextLoad(url, context);
}
