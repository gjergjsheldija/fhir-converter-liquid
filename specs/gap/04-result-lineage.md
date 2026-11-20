# Spec 04: Lineage from a FHIR element back to the source

**Status:** Done (2026-11-20). Debug convert records the include that wrote each result value and the result pane names it on click; `sourcePath` stays empty because the debug scopes do not say which variable an include read. Follow `.agents/skills/spec-runner/SKILL.md`, `.agents/skills/test-baseline/SKILL.md`, `.agents/skills/codemirror5-vanilla-ui/SKILL.md`, and `AGENTS.md`. Do not start another gap spec in this change.

## 1. Goal

Hover already explains a Liquid path and an HL7 field or a C-CDA node. This spec makes a click on a value in the FHIR result show the include that wrote it and the source path that include read. Conversion output stays the same. Debug stays opt-in.

## 2. Current behavior

- `debug=true` returns `debugInfo` with parsed source data and template scopes. It does not record which include assigned which output path.
- The result pane is a read-only CodeMirror JSON buffer. Clicking it does not open a source location.
- Message hover and template hover live in `src/static/js/debug-hover.js`.

If debug output already maps a result path to an include and a source path, stop and report that structure.

## 3. Files you may edit

- `src/lib/liquid-converter/liquid-converter.js` to record assignments only when debug is on
- `src/lib/workers/worker.js` to pass that trace through on `debugInfo.lineage`
- A new `src/lib/liquid-converter/lineage.js` and `lineage.spec.js` for the pure mapping
- `src/static/js/debug-hover.js` to show the trace when a result-pane token is clicked
- This spec's `**Status:**` line, the row in `specs/gap/00-order.md`, and the bullet in `specs/ORDER.md`

Do not edit Liquid templates. Do not add a dependency. Do not change `fhirResource` when debug is off or on. Do not add `import` or `export` in `src/static/js/`.

## 4. Requirements

1. `lineage` is an array of `{outputPath, template, sourcePath}`. `outputPath` is a JSON path in the rendered resource. `template` is the include or root template name. `sourcePath` is the Liquid variable path read for that assignment, or an empty string when the assignment is a literal.
2. The recorder runs only when the convert call already has debug enabled. With debug off, the worker does not add `lineage`, and the rendered JSON string is unchanged.
3. A click on a string or number token in the result pane looks up the longest `outputPath` that is a prefix of that token's JSON path. The existing hover tooltip shows the template name and the source path. A miss shows **No source recorded**.
4. The unit test builds a trace with `outputPath` `entry.0.resource.name.0.family`, template `Resource/_Patient`, and source path `PID.5.1`. A lookup of that path returns that row. A lookup of `entry.0.resource.id` returns no row. Do not render a full ADT template in the unit test.
5. If the debug scopes do not contain enough information to name both the template and a source path, record the row with the template name and an empty `sourcePath` rather than guessing a field.

## 5. Validation

```sh
npx mocha --no-package --no-config src/lib/liquid-converter/lineage.spec.js --exit --timeout 10000
node scripts/test-summary.mjs
```

Official classification stays 132 pass / 0 count / 0 content. A debug convert and a non-debug convert of the same built-in sample produce the same `fhirResource`. ESLint and `git diff --check` must pass. In the browser, click one result value and confirm the tooltip names a template. If the browser is unavailable, say so.

## 6. Acceptance criteria

- Debug off omits `lineage` and does not change the bundle.
- A recorded row names the template. The tooltip uses that row and does not invent a field.
- Status, `specs/gap/00-order.md`, and `specs/ORDER.md` say Done with the date.

## 7. Git

Branch from current `main`: `feat/gap-04-result-lineage`. One commit, then merge into `main`. Push with `gh auth switch --user gjergjsheldija`, then `git push origin main`, then `gh auth switch --user gjergjsheldija-recare`. Do not force-push.
