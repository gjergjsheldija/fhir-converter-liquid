# Spec 03: Convert a project from the command line and check goldens

**Status:** Done (2026-11-19). Verified with `convertCli.spec.js` (3 passing) and `node scripts/test-summary.mjs` (642 passing, 0 unexpected failures, ESLint and `git diff --check` clean). Follow `.agents/skills/spec-runner/SKILL.md`, `.agents/skills/test-baseline/SKILL.md`, `.agents/skills/spec-handoff/SKILL.md`, and `AGENTS.md`. Project spec 12 is Done and on `origin/main` at `2c04ff9`. Do not start the OIE channel, conditional write, or C-CDA in this change.

## 1. Goal

`node bin/convert.mjs --project <dir> --message <file> --template ADT_A01` prints one FHIR resource. `node bin/convert.mjs --project <dir> --check-goldens` exits 0 when every `tests/expected` file matches, and exits 1 with the case name when one differs.

## 2. Current behavior

- There is no `bin/` directory and no `convert:project` script in `package.json`.
- `prepareProjectConversion` in `src/lib/projects/convertProject.js` returns `templateDirectory`, `fallbackTemplateDirectory`, `templatesOverride`, `strictOverridesOnly`, and `projectRoot` for a local project.
- `convertInlineHl7v2` in `src/lib/workers/worker.js` accepts `{ srcDataType, srcData, template, templatesOverride, templateDirectory, fallbackTemplateDirectory, strictOverridesOnly }` and resolves `{ status, resultMsg }`. A success has `resultMsg.fhirResource`.
- `loadSitePack` and `applySitePack` in `src/lib/projects/sitePack.js` are what `POST /api/v1/projects/convert` uses for a local project.
- `compareContent` in `test/e2e-test/util/compare.js` takes two JSON strings and throws `The conversion result has different property: [...]` when they differ. It already ignores the Provenance generation clock.
- Expected files are `tests/expected/<sample basename>.json`, where the sample basename is the sample filename with its last extension removed.

If `prepareProjectConversion` no longer returns `projectRoot` and `fallbackTemplateDirectory`, stop and report the mismatch.

## 3. Files you may edit

- `bin/convert.mjs` (create)
- `src/lib/projects/convertCli.spec.js` (create)
- `package.json` for one script, `convert:project`
- This spec's `**Status:**` line, a row in `specs/runtime/00-order.md`, and a bullet in `specs/ORDER.md`

Do not edit `src/templates/**`, `src/service-templates/**`, `src/sample-data/**`, or `test/e2e-test/liquid-fixtures/**`. Do not add a dependency. Do not change conversion, the site pack, or `compareContent`.

## 4. Requirements

1. `node bin/convert.mjs --project <dir> --message <file> --template <name>` reads the message file and the template `<project templates root>/<name>.liquid` (if `<name>` already ends in `.liquid`, do not append it again). It runs the same local project conversion as the route: `prepareProjectConversion`, `convertInlineHl7v2` with `srcDataType: "hl7v2"`, then `applySitePack(resultMsg.fhirResource, await loadSitePack(projectRoot))`. It writes the resulting JSON to stdout and exits 0. A missing file, a conversion status other than 200, or a missing `fhirResource` writes the error message to stderr and exits 1.
2. `--check-goldens` ignores `--message`. For each `tests/expected/*.json` in sorted order, the sample is `<samples root>/<basename>.hl7`. The template is `--template` when that flag is present, otherwise the manifest `startup.template` file. Convert that sample, then `compareContent(JSON.stringify(actual), expectedText)`. The first thrown comparison, missing sample, or conversion failure writes the expected basename to stderr and exits 1. When every file matches, exit 0 and write nothing to stderr. An empty `tests/expected` directory exits 0.
3. `--project` is an absolute path. Any other invocation writes one usage line to stderr and exits 1.
4. `package.json` has `"convert:project": "node bin/convert.mjs"`. `npm run convert:project -- --project <dir> --check-goldens` forwards those arguments.
5. `convertCli.spec.js` builds a temporary empty HL7 v2 project with `createProject`. Use a root template whose body is `{ "resourceType": "Patient", "id": "cli-1" }` and a one-line `.hl7` message. Do not call a live server and do not read the official fixtures. Spawn `node bin/convert.mjs`. One expected file that matches exits 0. One expected file whose `id` differs exits 1 and stderr contains that expected basename. A single `--message` run prints JSON whose `id` is `cli-1`.

## 5. Validation

```sh
npx mocha --no-package --no-config src/lib/projects/convertCli.spec.js --exit --timeout 10000
node scripts/test-summary.mjs
```

The summary must show 0 unexpected failures. Official classification stays 132 pass / 0 count / 0 content. ESLint and `git diff --check` must pass. If the sandbox reports concurrency 0, rerun `node scripts/test-summary.mjs` outside the sandbox.

## 6. Acceptance criteria

- `node bin/convert.mjs --project <dir> --message <file> --template <name>` prints the converted resource.
- `--check-goldens` exits 0 when every `tests/expected` file matches and exits 1 with the case name when one differs.
- `package.json` has `convert:project`.
- No Liquid template, sample, or official fixture was modified.
- Status, `specs/runtime/00-order.md`, and `specs/ORDER.md` say Done with the date.

## 7. Git

Branch from current `main`: `feat/runtime-03-project-cli`. One commit, then a normal merge into `main` (no rebase, no amend). Push with `gh auth switch --user gjergjsheldija`, then `git push origin main`, then `gh auth switch --user gjergjsheldija-recare`. Do not force-push. Do not commit `docs/mappings/`, `opencode.json`, `relative_test.mjs`, or `scripts/omlx-swap.mjs`. Do not update git config and do not skip hooks.
