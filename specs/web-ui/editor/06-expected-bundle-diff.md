# Spec 06: Diff the result against a project expected bundle

**Status:** Done (2026-11-19). Verified with unit tests, full validation (621 passing, 0 unexpected failures), and in the browser against a local project (Built-in hides the control; added, removed, and changed resources show after Convert). Follow `.agents/skills/codemirror5-vanilla-ui/SKILL.md`, `.agents/skills/spec-runner/SKILL.md`, and `AGENTS.md`. Editor specs 01–05 are Done. This is the first spec of the post-fidelity queue. Do not start spec 07 in this change.

## 1. Goal

When a project is open and that project contains `tests/expected/<sample-basename>.json`, the Debug drawer shows which Bundle entries the conversion added or removed compared with that file. Built-in mode has no such control.

## 2. Current behavior

- Conversion writes the FHIR Bundle into the result editor and `window.latestDebugInfo.fhirResource` (`src/static/js/template-editor.js`).
- The Debug drawer (`src/static/js/debug-drawer.js`) lists Bundle entries. It does not compare them with an expected file.
- An open project is `activeProject` in `src/static/js/projects.js`, stored in `localStorage` key `fhirConverterProject`. Built-in mode is `activeProject === null`. The header label is `Built-in` in that mode.
- `readProjectFile` in `src/lib/projects/projectFiles.js` refuses any path that is not under the manifest's `samples/` or `templates/` root (`isAllowedRootPrefix`). `tests/expected/` is not readable today.
- A sample opened from the project has a relative path such as `samples/hl7v2/ADT-A01-01.hl7`. The expected file for that sample is `tests/expected/ADT-A01-01.json` (the sample file name with the last extension replaced by `.json`).

## 3. Files you may edit

- `src/lib/projects/bundleResourceDiff.js` (new) and `src/lib/projects/bundleResourceDiff.spec.js`
- `src/lib/projects/projectFiles.js` and `src/lib/projects/projectFiles.spec.js` only to allow reading `tests/expected/<basename>.json`
- `src/static/js/debug-drawer.js`
- `src/static/js/projects.js` only to expose the open project and the active sample relative path the drawer needs, if those are not already readable
- `src/static/index.html` and `src/static/css/template-editor.css` only for the diff control and its result list
- This spec's `**Status:**` line, a row in `specs/web-ui/editor/00-order.md`, and a bullet in `specs/ORDER.md`

Do not edit `*.liquid` files, `src/templates/**`, `src/sample-data/**`, or `test/e2e-test/liquid-fixtures/**`. Do not add a dependency. Do not change conversion output. Do not add `import` or `export` inside `src/static/js/`.

## 4. Requirements

1. `bundleResourceDiff(actual, expected)` returns `{ added, removed, changed }`. Each list contains entries keyed by `resourceType/id`. An entry present only in `actual` is added. An entry present only in `expected` is removed. An entry with the same key whose resource JSON differs is changed. Order of the lists is sorted by that key. A missing `id` uses the fullUrl when it starts with `urn:uuid:`, otherwise the entry is unmatched and listed as added or removed with key `resourceType/` plus its index in that bundle. Do not special-case filenames.
2. Unit tests cover: one added resource, one removed resource, one changed resource, and two equal bundles (all three lists empty).
3. `readProjectFile` accepts `tests/expected/<basename>.json` and still rejects paths outside the project, `..`, and other new prefixes.
4. After a successful conversion, if `activeProject` is set, the drawer looks up `tests/expected/<sample basename>.json`. If the file is missing, the control is hidden. If the file is present, a **Expected diff** control shows the three lists with counts. Built-in mode hides the control.
5. A missing or invalid expected JSON shows the error text in the drawer and does not change the result editor.
6. Use existing color tokens. Do not add hex colors. Do not use `window.alert` or `window.prompt`.

## 5. Validation

```sh
npx mocha --no-package --no-config src/lib/projects/bundleResourceDiff.spec.js src/lib/projects/projectFiles.spec.js --exit --timeout 10000
node scripts/test-summary.mjs
```

The summary must show 0 unexpected failures. The official classification stays 132 pass / 0 count / 0 content. ESLint and `git diff --check` must pass.

Verify the control in the browser at `http://127.0.0.1:2019`: Built-in mode hides it; an open local project with `tests/expected/<sample>.json` shows added and removed resources after Convert. Restart the server if you changed server files. If the browser cannot be opened, say so in the handoff.

## 6. Acceptance criteria

- The four unit cases in requirement 2 pass.
- Built-in mode does not show the expected-diff control.
- A project sample with `tests/expected/<basename>.json` shows added, removed, and changed resources after conversion.
- No Liquid template, sample, or official expected fixture was modified.
- Status, `specs/web-ui/editor/00-order.md`, and `specs/ORDER.md` say Done with the date.
