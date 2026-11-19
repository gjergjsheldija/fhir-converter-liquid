# Editor intelligence and debug specs

These specs turn the three CodeMirror 5 panes into a healthcare conversion IDE: syntax coloring for HL7v2, Liquid, and FHIR JSON; code folding for Liquid blocks and JSON braces; a safe in-buffer Liquid beautifier; mouse-over variable and HL7 path evaluation (`firstSegments.MSH.10`); and a Chrome-DevTools-style collapsible bottom Debug / Inspector drawer.

Implement `specs/runtime/02`, `specs/web-ui/usability/` (`01` through `20`), and `specs/web-ui/theme/` (`01` through `04`) before this folder, and implement this folder before `specs/web-ui/projects/`.

## Rules for every spec

1. Implement one numbered spec, then stop. Do not start the next spec in the same change.
2. Read this file, then the spec you are implementing, then the files that spec names. If the worktree does not match "Current behavior", stop and report the difference.
3. Edit only the files listed in that spec.
4. Do not add an npm runtime dependency or load a CDN script. CodeMirror 5 addons `simple.js`, `multiplex.js`, `foldcode.js`, `foldgutter.js`, `brace-fold.js`, and `javascript.js` are already served from `/codemirror/`.
5. **Never edit, format, or touch any vendored `*.liquid` file, bundled `src/sample-data/**` message, or `Expected/**` fixture.**
6. Preserve conversion output byte-for-byte. Debug instrumentation in spec 04 must be strictly opt-in (`?debug=true`) and must not alter `fhirResource`, `unusedSegments`, or `invalidAccess`.
7. Do not commit unless the user explicitly requests a commit.

## Order

| Spec | Status | File | What it changes |
| --- | --- | --- | --- |
| 01 | Done (2026-11-18) | `01-syntax-coloring-hl7-liquid-json.md` | Custom CodeMirror modes for HL7v2 (`hl7v2`), Liquid + JSON (`liquid-json`), and strict FHIR JSON (`{name: "javascript", json: true}`), plus mode restoration on tab switch and `#editor-main`/`#navbar` flex fixes. |
| 02 | Done (2026-11-18) | `02-liquid-code-folding.md` | Fold gutter and `Ctrl-Q` in the Liquid editor for both Liquid block tags (`comment`, `if`, `for`, `unless`, `capture`, `case`) and JSON `{...}` / `[...]`. |
| 03 | Done (2026-11-18) | `03-liquid-beautifier.md` | `Format` button (`Shift+Alt+F`) in the Template pane that indents Liquid + JSON safely in the editor buffer with single-step undo. |
| 04 | Done (2026-11-18) | `04-debug-trace-and-hover-values.md` | Opt-in `?debug=true` parsed HL7v2 + Liquid scope snapshots and mouse-over value tooltips on variables and HL7 paths (`firstSegments.MSH.10`). |
| 05 | Done (2026-11-18) | `05-bottom-debug-drawer.md` | Collapsible, resizable Chrome-DevTools-style bottom Debug drawer with Parsed HL7 tree, Variables & Console evaluator, and Diagnostics/Bundle jump list. |

## Check

Run focused unit/route tests, `npm test`, `npm run eslint`, and `git diff --check`, and verify live behavior against `http://127.0.0.1:2019` (restarting the server first whenever server files changed).
