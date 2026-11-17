// Mock provider module replacing `src/lib/ai/generateTemplate.js` in the templategenerate
// mock test. The test drives these before each request via `__resetState`.
//
// NB: ESM *exports* are read-only bindings, so the mock cannot expose mutable state
// directly as a reassignable `export let` and expect a caller to overwrite it. Instead
// the mock keeps its mutable state inside a **single mutable holder object** (`state`)
// named export `__state` and mutates it in place. Both `routes.js` (via the loader's
// redirect) and the test import *the same module instance*, so they observe the same
// holder. The `--experimental-loader` rewrites the handler's dynamic
// `import("./lib/ai/generateTemplate.js")` to this stub, and `load`-short-circuiting
// means the stub's top-level `export let` never runs — so we must NOT rely on any
// top-level mutable export being initialized by the module body.

// Holder object: mutable state lives *inside* it (safe to mutate from anywhere).
const state = { calls: 0, candidates: [], errors: [], sentInput: null };

// The single provider invocation used by the generate loop. Errors are consumed in
// order first, then candidates. `_calls` counts invocations for assertions.
export async function callExternalAI({ prompt, model, temperature, provider, baseUrl, apiKey }) {
    state.calls += 1;
    state.sentInput = { prompt, model, temperature, provider, baseUrl, apiKey };
    const next = state.errors.shift() ?? state.candidates.shift();
    if (next === undefined) {
        return '';
    }
    if (next instanceof Error) {
        throw next;
    }
    return next;
}

// Both named exports used by routes.js (initial + fix prompts).
export function buildInitialPrompt(message, prompt) {
    return ['Propose an HL7v2-to-FHIR Liquid template.', prompt ? 'Guidance: ' + prompt : '', 'Raw message:', message].filter((p) => p !== '').join('\n');
}

export function buildFixPrompt(currentTemplate, message, unusedSegmentsText) {
    return [
        'The following Liquid template does not render for the message.',
        'Fix it and return the full updated template text only.',
        '',
        'Current template:',
        currentTemplate,
        '',
        'Converter error:',
        message,
    ].filter((p) => p !== '').join('\n') + (unusedSegmentsText ? '\n\nUnused segments (context, not required to be empty):\n' + unusedSegmentsText : '');
}

// Test-side accessor: snapshot of the recorded state.
export function __getState() {
    return state;
}

// Drive the next request(s): set candidates/errors and reset the provider-call counter.
// Example: __resetState({ candidates: ['{% set msg = this %}{ msg.MSH }'], errors: [] });
export function __resetState(next) {
    state.calls = 0;
    state.candidates = (next && next.candidates) || [];
    state.errors = (next && next.errors) || [];
    state.sentInput = (next && next.sentInput) || null;
}

// Recorded provider-call count (via the holder).
export function _callCount() {
    return state.calls;
}
