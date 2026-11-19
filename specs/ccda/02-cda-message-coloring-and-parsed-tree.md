# Spec 02: Color a C-CDA message and show its parsed tree

**Status:** Done (2026-11-19). A local C-CDA project converts through `CCD.liquid` to a Bundle in the browser, the message uses XML tokens, and the Debug tab reads Parsed CDA; an HL7 v2 project keeps mode `hl7v2` and Parsed HL7; 710 tests pass with 0 unexpected failures. Follow `.agents/skills/codemirror5-vanilla-ui/SKILL.md`, `.agents/skills/spec-runner/SKILL.md`, `.agents/skills/test-baseline/SKILL.md`, `.agents/skills/spec-handoff/SKILL.md`, and `AGENTS.md`. Spec 01 is Done and on `origin/main` at `171e188`. Do not implement spec 03 in this change.

## 1. Goal

A C-CDA document in the message editor is colored as XML, conversion runs, and the Debug drawer shows the parsed elements and attributes. HL7 v2 keeps its segment coloring and the Parsed HL7 tree.

## 2. Current behavior

- `src/static/js/editor-modes.js` defines the `hl7v2` mode. CodeMirror's `xml` mode is already loaded from `/codemirror/mode/xml/xml.js`.
- `projects.js` and `template-menu.js` set the message editor mode to `xml` for a ccda project, then call `applyCcdaNoConvertState`, which clears the result and sets the status to `C-CDA conversion is not available yet.`
- `convertData` in `src/static/js/template-editor.js` returns immediately when the active project family is `ccda`. A project conversion otherwise POSTs `/api/v1/projects/convert` with `debug=true`.
- For `srcDataType: "ccda"`, `src/lib/workers/worker.js` stores `debugInfo` with `parsedHl7v2: null`. `parseCcda` in `src/lib/parsers/ccda/ccda.js` returns `ClinicalDocument` with attribute keys such as `root` and text on `_`.
- The Debug drawer tab is labeled **Parsed HL7** and `debug-drawer.js` renders only `parsedHl7v2.segments`.

If a ccda project conversion already returns a Bundle from the page, stop and report the mismatch.

## 3. Files you may edit

- `src/lib/parsers/ccda/ccda.js` and `src/lib/parsers/ccda/ccda.spec.js`
- `src/lib/workers/worker.js` for the ccda debug payload only
- `src/static/js/debug-drawer.js`
- `src/static/js/template-editor.js`, `src/static/js/projects.js`, and `src/static/js/template-menu.js` for the ccda convert path and the message mode
- `src/routes.js`, `src/lib/projects/convertProject.js`, and `src/lib/projects/convertProject.spec.js` so the project convert route sends `srcDataType` `ccda` for a ccda-only project and `hl7v2` otherwise
- `src/static/index.html` for the Parsed tab label id and for the New project C-CDA help line that still says conversion is not available
- This spec's `**Status:**` line, the row in `specs/ccda/00-order.md`, and a bullet in `specs/ORDER.md`

Do not edit templates, samples, or official fixtures. Do not add a dependency. Do not add `import` or `export` in `src/static/js/`. Do not add a hex color. Do not change the HL7 v2 mode or the HL7 parsed-segment tree.

## 4. Requirements

1. A ccda project sets the message editor mode to `xml` and then converts. `prepareProjectConversion` returns `srcDataType`: `ccda` when the project's only family is `ccda`, and `hl7v2` otherwise. `POST /api/v1/projects/convert` passes that value to the worker instead of always sending `hl7v2`. Remove the `C-CDA conversion is not available yet` stop, including the New project help line. `currentDataType` is `ccda` for that project, so the HL7 unused-segment highlighter does not run. An hl7v2 project still uses mode `hl7v2`, `srcDataType` `hl7v2`, and still converts.
2. `summarizeCcda(parsed)` walks the `parseCcda` object, skips `_originalData`, and returns `{ name, attributes, text, children }`. `attributes` are the string-valued keys other than `_`. `text` is the string `_`, or null. A nested object is one child. An array is one child per item, each with that property name. A null element is skipped.
3. A `debug=true` ccda conversion sets `debugInfo.parsedCcda` to that summary and leaves `parsedHl7v2` null. An HL7 v2 debug conversion still sets `parsedHl7v2` and does not set `parsedCcda`.
4. The first Debug tab reads **Parsed CDA** when `parsedCcda` is present and **Parsed HL7** otherwise. The CDA panel lists each element name, its attributes as `key=value`, and its text. Nested elements are indented children. A copy button copies `msg.` plus the dot path (`ClinicalDocument.id.root`). With no document, the panel says `Convert a C-CDA document to inspect elements and attributes.` The HL7 empty text stays `Convert an HL7 v2 message to inspect parsed segments and fields.`
5. Unit-test `summarizeCcda` with the spec 01 document: `ClinicalDocument.id` has attribute `root` = `1.2.3`, `title` has text `Hello`, and `given` has two children. Do not call a live FHIR server.

## 5. Validation

```sh
npx mocha --no-package --no-config src/lib/parsers/ccda/ccda.spec.js --exit --timeout 10000
node scripts/test-summary.mjs
```

The summary must show 0 unexpected failures. Official HL7 classification stays 132 pass / 0 count / 0 content. ESLint and `git diff --check` must pass. If the sandbox reports concurrency 0, rerun `node scripts/test-summary.mjs` outside the sandbox.

Restart the server and check `http://127.0.0.1:2019`. Create or open a local C-CDA project, paste a short `ClinicalDocument`, and convert. The message editor tokens include an XML tag token, the result is a Bundle when `CCD.liquid` is the root template, and the Debug tab shows **Parsed CDA** with `ClinicalDocument`. Switch back to an HL7 v2 project and confirm the tab reads **Parsed HL7** and the message mode is `hl7v2`. If you cannot open the browser, say so in the handoff.

## 6. Acceptance criteria

- A C-CDA message is colored with the XML mode and converts.
- The Debug drawer shows the parsed elements and attributes, and a copy path starts with `msg.`.
- HL7 v2 coloring, conversion, and the Parsed HL7 tree are unchanged.
- No Liquid template, sample, or official fixture was modified.
- Status, `specs/ccda/00-order.md`, and `specs/ORDER.md` say Done with the date.

## 7. Git

Branch from current `main`: `feat/ccda-02-parsed-tree`. One commit, then a normal merge into `main` (no rebase, no amend). Push with `gh auth switch --user gjergjsheldija`, then `git push origin main`, then `gh auth switch --user gjergjsheldija-recare`. Do not force-push. Do not commit `docs/mappings/`, `opencode.json`, `relative_test.mjs`, or `scripts/omlx-swap.mjs`. Do not update git config and do not skip hooks.
