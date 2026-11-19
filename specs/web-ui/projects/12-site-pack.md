# Spec 12: Site pack for a local HL7 v2 project

**Status:** Done (2026-11-19). Focused mocha (8 passing) and `node scripts/test-summary.mjs` (639 passing, 0 unexpected failures, eslint and diff check clean) verify it. Follow `.agents/skills/spec-runner/SKILL.md`, `.agents/skills/test-baseline/SKILL.md`, `.agents/skills/spec-handoff/SKILL.md`, and `AGENTS.md`. Editor spec 07 is Done and on `origin/main` at `7100532`. Do not start the CLI, the OIE channel, conditional write, or C-CDA in this change.

## 1. Goal

A local HL7 v2 project can add `templates/Hl7v2/Z/_ZDG.liquid` and have a project template include it, while every other partial still comes from the built-in template tree. After that conversion, `conceptmaps/*.json` rewrites one Coding and `identifiers.json` fills one missing Identifier system. Files under `src/templates/` and `src/service-templates/` stay byte-identical.

## 2. Current behavior

- `prepareProjectConversion` in `src/lib/projects/convertProject.js` sets `templateDirectory` to the project's HL7 v2 templates directory and `strictOverridesOnly` to false for a local project. A partial that is not in that directory is not read from anywhere else.
- `src/lib/projects/convertProject.spec.js` asserts that an empty project include of `Resource/MessageHeader` rejects with status 400. That file exists in the built-in tree and not in the empty project. The comment mentions `service-templates`; the engine constant `HL7V2_LIQUID_TEMPLATE_LOCATION` in `src/lib/constants/constants.js` points at `src/service-templates/Hl7v2`.
- GitHub conversion sets `strictOverridesOnly` true and fetches only referenced project files.
- `GetLiquidInstance` in `src/lib/workers/worker.js` passes `templateDirectory` and `strictOverridesOnly` into the Liquid filesystem in `src/lib/liquid-converter/liquid-converter.js`. Overrides win, then the template directory is read. There is no second directory.
- `POST /api/v1/projects/convert` in `src/routes.js` returns `result.resultMsg` unchanged. `POST /api/v1/convert/:srcDataType` does not take a project.
- Nothing reads `conceptmaps/` or `identifiers.json`.

If that test no longer rejects `Resource/MessageHeader`, stop and report the mismatch.

## 3. Files you may edit

- `src/lib/liquid-converter/liquid-converter.js` for the fallback read only
- `src/lib/workers/worker.js` to pass `fallbackTemplateDirectory`
- `src/routes.js` for `POST /api/v1/projects/convert` only
- `src/lib/projects/convertProject.js` and `src/lib/projects/convertProject.spec.js`
- `src/lib/projects/sitePack.js` and `src/lib/projects/sitePack.spec.js` (create both)
- This spec's `**Status:**` line, a row in `specs/web-ui/projects/00-order.md`, and a bullet in `specs/ORDER.md`

Do not edit `src/templates/**`, `src/service-templates/**`, `src/sample-data/**`, `test/e2e-test/liquid-fixtures/**`, or `src/static/**`. Do not edit `manifest.js`. Do not add a dependency. Do not change GitHub strict mode. Do not call the site pack from `POST /api/v1/convert/:srcDataType`.

## 4. Requirements

1. Local conversion keeps `templateDirectory` as the project templates directory. It also returns `fallbackTemplateDirectory` set to `HL7V2_LIQUID_TEMPLATE_LOCATION`. GitHub conversion does not set a fallback.
2. The Liquid filesystem checks the project file first. When `strictOverridesOnly` is false and the project file is missing, it reads the same relative path under `fallbackTemplateDirectory`. When that file is also missing, the current error stays. `POST /api/v1/convert/:srcDataType` does not pass a fallback.
3. A project file wins when the same relative path exists in both trees. The built-in tree is only a read fallback. Do not write or copy files into either tree.
4. Replace the empty-project `Resource/MessageHeader` rejection. Keep the project-only partial assertion (`Resource/OnlyInProject` id `proj-only-1`). An include of `Resource/DoesNotExistAnywhere` still rejects with status 400. Add a conversion where the project contains `templates/Hl7v2/Z/_ZDG.liquid` with the body `{ "resourceType": "Basic", "id": "from-z" }`, the root template is `{% include 'Z/ZDG' %}`, and the result id is `from-z`. Assert that `Z/_ZDG.liquid` does not exist under `HL7V2_LIQUID_TEMPLATE_LOCATION`.
5. `loadSitePack(projectRoot)` reads non-recursive `conceptmaps/*.json` and optional `identifiers.json` from the project root. A missing directory or a missing `identifiers.json` is an empty pack. Invalid JSON, or a JSON value that is not an object, throws an error with `status` 400.
6. `applySitePack(resource, pack)` returns a deep copy. A Coding is a plain object with string `system` and string `code` and no `resourceType`. A ConceptMap group matches when `group.source` equals `system` and `element.code` equals `code`. Set `system` to `group.target`, `code` to the first `element.target[0].code`, and `display` to `element.target[0].display` when that display is a string. Leave every other Coding unchanged. Ignore a group that is not an object.
7. `identifiers.json` is an object whose keys are type codes and whose values are system URLs. An Identifier is a plain object with a string `value`, no `resourceType`, and `type.coding[].code`. When `system` is absent and one of those codes is a key, set `system` to that URL. Do not replace an existing `system`.
8. On `POST /api/v1/projects/convert`, a local project with status 200 and a `fhirResource` gets that resource replaced by `applySitePack`. GitHub project results are unchanged. A site-pack read error is the route's existing project error response.
9. `sitePack.spec.js` uses no network and no official fixtures. Cover one rewritten Coding, one unchanged Coding, one filled Identifier system, one Identifier whose existing system stays, and invalid JSON with status 400.

## 5. Validation

```sh
npx mocha --no-package --no-config src/lib/projects/sitePack.spec.js src/lib/projects/convertProject.spec.js --exit --timeout 10000
node scripts/test-summary.mjs
```

The summary must show 0 unexpected failures. Official classification stays 132 pass / 0 count / 0 content. ESLint and `git diff --check` must pass. If the sandbox reports concurrency 0, rerun `node scripts/test-summary.mjs` outside the sandbox.

## 6. Acceptance criteria

- A local project include of `Z/ZDG` renders the project partial, and the built-in tree has no such file.
- A partial missing from both the project and the built-in tree still fails.
- One ConceptMap rewrites one Coding after a local project conversion, and one `identifiers.json` entry fills a missing Identifier system.
- `POST /api/v1/convert/:srcDataType` and GitHub project conversion are unchanged.
- No file under `src/templates/`, `src/service-templates/`, `src/sample-data/`, or `test/e2e-test/liquid-fixtures/` was modified.
- Status, `specs/web-ui/projects/00-order.md`, and `specs/ORDER.md` say Done with the date.

## 7. Git

Branch from current `main`: `feat/projects-12-site-pack`. One commit, then a normal merge into `main` (no rebase, no amend). Push with `gh auth switch --user gjergjsheldija`, then `git push origin main`, then `gh auth switch --user gjergjsheldija-recare`. Do not force-push. Do not commit `docs/mappings/`, `opencode.json`, `relative_test.mjs`, or `scripts/omlx-swap.mjs`. Do not update git config and do not skip hooks.
