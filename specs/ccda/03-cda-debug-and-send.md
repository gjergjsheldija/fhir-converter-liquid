# Spec 03: Debug hover, expected diff, Validate, and Send for C-CDA

**Status:** Done (2026-11-19). Verified in the browser: C-CDA title hover shows `msg.ClinicalDocument.title._`, Expected diff, Validate, and Send work on a C-CDA result, HL7 hover shows `PID-5.1`; `ccdaHover.spec.js` 10/10 and `test-summary` 720 passing, 0 unexpected. The editor hover is now attached through the wrapper element (`this.CodeMirror` plus DOM `mousemove`/`mouseleave`), because CodeMirror 5 never signals those events. Follow `.agents/skills/codemirror5-vanilla-ui/SKILL.md`, `.agents/skills/spec-runner/SKILL.md`, `.agents/skills/test-baseline/SKILL.md`, `.agents/skills/spec-handoff/SKILL.md`, and `AGENTS.md`. Spec 02 is Done and on `origin/main` at `385ee04`. This is the last C-CDA spec.

## 1. Goal

The features that already work for an HL7 v2 result also work for a C-CDA document: hovering the message shows the Liquid path, the expected-bundle diff compares the result, and Validate and Send stay available. HL7 v2 hover and the HL7 prompt stay as they are.

## 2. Current behavior

- `handleMessageHover` in `src/static/js/debug-hover.js` always reads the line as HL7 fields split on the MSH separators. A C-CDA line has no pipes, so the tooltip does not describe an element or attribute.
- The Debug drawer already shows **Parsed CDA** from `parsedCcda`. Copy paths look like `msg.ClinicalDocument.title._` and `given[1]`.
- `expectedRelativePath` in `src/static/js/debug-drawer.js` maps the open sample's basename to `tests/expected/<basename>.json` for any extension. It does not check the family.
- Validate and Send read the result editor and the Settings FHIR URL. They do not check the source family. The default AI prompt in `src/static/js/template-editor.js` tells the model the message is `hl7v2Data`.

If message hover already shows `msg.ClinicalDocument` for a C-CDA document, stop and report the mismatch.

## 3. Files you may edit

- `src/lib/parsers/ccda/ccdaHover.js` and `src/lib/parsers/ccda/ccdaHover.spec.js` (create both)
- `src/static/js/debug-hover.js` for the C-CDA message hover only
- `src/static/js/template-editor.js` for the C-CDA AI prompt text only
- This spec's `**Status:**` line, the row in `specs/ccda/00-order.md`, and a bullet in `specs/ORDER.md`

Do not edit templates, samples, or official fixtures. Do not add a dependency. Do not add `import` or `export` in `src/static/js/`. Do not add a hex color. Do not change Validate, Send, or the expected-diff path. Do not change HL7 field hover.

## 4. Requirements

1. `ccdaHoverAt(documentText, line, ch)` returns `{ path, value }` or null. Walk the document from the start to the cursor. Skip the XML declaration and comments. The path starts with `msg.` and uses the open element stack. A repeated sibling uses `[index]` starting at 0, matching the Parsed CDA copy path. An attribute under the cursor appends `.name` and `value` is the attribute value. Text under the cursor appends `._` and `value` is that text. A cursor on a tag name returns the element path and a null value. A cursor outside an element returns null.
2. Use the spec 01 document. At the `root` attribute, the path is `msg.ClinicalDocument.id.root` and the value is `1.2.3`. At the title text, the path is `msg.ClinicalDocument.title._` and the value is `Hello`. At the second `given` text, the path is `msg.ClinicalDocument.recordTarget.patientRole.patient.name.given[1]._` and the value is `Frankie`. A tag prefix uses the parsed name, so `sdtc:raceCode` is `sdtc_raceCode` in the path.
3. When the message editor mode is `xml`, message hover uses `ccdaHoverAt` and shows the path and value. The same function body lives in `debug-hover.js` with no `export`. When the mode is `hl7v2`, the field-splitting logic stays as it is. `attachEditor` must read the CodeMirror instance from the wrapper element's `CodeMirror` property. jQuery `.data('CodeMirror')` does not see that property, so no `mousemove` handler is attached for either family. Do not change how an HL7 field coordinate is calculated.
4. When the active project family is `ccda`, the AI prompt says the message is `msg`, an attribute is `msg.ClinicalDocument.id.root`, and text is `msg.ClinicalDocument.title._`. The HL7 prompt is unchanged for an hl7v2 project.
5. Do not hide Expected diff, Validate, or Send for a C-CDA result. Their requests stay the ones they use today.

## 5. Validation

```sh
npx mocha --no-package --no-config src/lib/parsers/ccda/ccdaHover.spec.js --exit --timeout 10000
node scripts/test-summary.mjs
```

The summary must show 0 unexpected failures. Official HL7 classification stays 132 pass / 0 count / 0 content. ESLint and `git diff --check` must pass. If the sandbox reports concurrency 0, rerun `node scripts/test-summary.mjs` outside the sandbox.

Restart the server and check `http://127.0.0.1:2019`. In a local C-CDA project, convert a short document. Hover the title text and confirm the tooltip shows `msg.ClinicalDocument.title._`. Put a different id in `tests/expected/<sample basename>.json` and confirm the Expected diff tab lists one change. With a FHIR URL set and no real server, Validate and Send are enabled. Validate shows the request failure in the Validation tab. Do not send to a real FHIR server. Open an HL7 v2 project and confirm a PID field hover still shows an HL7 coordinate such as `PID-5`. If you cannot open the browser, say so in the handoff.

## 6. Acceptance criteria

- C-CDA message hover shows the `msg.` path and the attribute or text value.
- Expected diff, Validate, and Send are available on a C-CDA result.
- HL7 v2 hover and the HL7 AI prompt are unchanged.
- No Liquid template, sample, or official fixture was modified.
- Status, `specs/ccda/00-order.md`, and `specs/ORDER.md` say Done with the date.

## 7. Git

Branch from current `main`: `feat/ccda-03-debug-and-send`. One commit, then a normal merge into `main` (no rebase, no amend). Push with `gh auth switch --user gjergjsheldija`, then `git push origin main`, then `gh auth switch --user gjergjsheldija-recare`. Do not force-push. Do not commit `docs/mappings/`, `opencode.json`, `relative_test.mjs`, or `scripts/omlx-swap.mjs`. Do not update git config and do not skip hooks.
