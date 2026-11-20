# Spec 01: Coverage score against the v2-to-FHIR IG

**Status:** Done (2026-11-20). Focused spec passes (3 tests); in the browser, Generate maps showed "No IG ConceptMap loaded" with no file, and a guide sharing one code showed "Shared 1 · Only in template 4740 · Only in IG 1". Follow `.agents/skills/spec-runner/SKILL.md`, `.agents/skills/test-baseline/SKILL.md`, and `AGENTS.md`. Do not start another gap spec in this change.

## 1. Goal

Generate maps already writes a ConceptMap of fields a template reads. This spec adds a score that says, for one message, how many of those mappings also appear in the HL7 v2-to-FHIR implementation guide, and how many guide mappings the template does not read. It is a report. It does not change conversion output.

## 2. Current behavior

- `generateFieldMaps` in `src/static/js/file-browser.js` POSTs `{path, write: true}` to `/api/v1/field-map`. It does not build a ConceptMap. The success text uses `result.files.length` and `result.dir`.
- `POST /api/v1/field-map` in `src/routes.js` calls `fieldMapFiles(dir)`. On `write: true` it writes three files and responds `{dir, files}` where `files` is the three file names. It does not return the ConceptMap body.
- `renderFieldMapConceptMaps` in `scripts/hl7-fhir-map.mjs` returns a JSON string. The parsed value is a Bundle: `resourceType` `"Bundle"`, `type` `"collection"`, and `entry[].resource` is one ConceptMap per message. There is no single ConceptMap for the open template.
- `docs/mappings/` is a local export and is not the source of truth for this spec.
- No file under `src/` reads `hl7.fhir.uv.v2mappings`.

If a coverage score already exists, stop and report where it is computed.

## 3. Files you may edit

- `src/lib/mappings/igCoverage.js` and `src/lib/mappings/igCoverage.spec.js` (create both)
- `src/routes.js` for `POST /api/v1/field-map` only, to add `conceptMap` to the `write: true` JSON response
- `src/static/js/file-browser.js` only to show the score next to the existing Generate maps result
- This spec's `**Status:**` line, the row in `specs/gap/00-order.md`, and the bullet in `specs/ORDER.md`

Do not edit `scripts/hl7-fhir-map.mjs`. Do not edit Liquid templates, samples, or official expected JSON. Do not add a dependency. Do not vendor the IG package. Do not commit `docs/mappings/`. The zip response (`write` not true) stays a zip.

## 4. Requirements

1. `groupsOf(resource)` returns `resource.group` when `resource.resourceType` is `"ConceptMap"`. When `resource.resourceType` is `"Bundle"`, return the concatenation of `entry[].resource.group` for entries whose resource is a ConceptMap. Any other value, or a missing `group`, is an empty array. Do not throw.
2. `coverageScore(generated, guide)` uses `groupsOf` on each argument. A mapping key is `group.source`, `element.code`, `group.target`, and the first `element.target[0].code`, joined by `|`. Return `{shared, onlyGenerated, onlyGuide}`. Missing groups or elements count as empty.
3. The unit test uses two small ConceptMaps in the test file. One shared key, one key only in the generated map, one key only in the guide. Assert the three counts are 1. A second assertion passes a Bundle with one ConceptMap entry and scores it the same way as that ConceptMap alone.
4. On `write: true`, the JSON response keeps `dir` and `files` and adds `conceptMap`, the parsed object from `files.conceptMap`. A parse failure is the existing 400 "Could not write the field maps." Do not add the body to the zip response.
5. Generate maps keeps the current request. When the response includes `conceptMap` and a guide is loaded, call `coverageScore`. When no guide is loaded, the score area says **No IG ConceptMap loaded** and does not invent counts. The existing "Wrote N files…" status stays.
6. Add a file input, next to Generate maps, that accepts one JSON file. It is read in the browser and is not uploaded. The file may be a ConceptMap or a Bundle of ConceptMaps. Anything else shows the same empty sentence.
7. The score text is `Shared N · Only in template N · Only in IG N`.

## 5. Validation

```sh
npx mocha --no-package --no-config src/lib/mappings/igCoverage.spec.js --exit --timeout 10000
node scripts/test-summary.mjs
```

Official classification stays 132 pass / 0 count / 0 content. ESLint and `git diff --check` must pass. In the browser, Generate maps with no file selected shows the empty sentence. Loading a ConceptMap that shares one code with the generated map changes the three counts. If the browser is unavailable, say so.

## 6. Acceptance criteria

- The score is computed from the two ConceptMaps and does not change a conversion.
- No IG package is vendored and no dependency is added.
- `docs/mappings/` is not committed.
- Status, `specs/gap/00-order.md`, and `specs/ORDER.md` say Done with the date.

## 7. Git

Branch from current `main`: `feat/gap-01-ig-coverage`. One commit, then merge into `main`. Push with `gh auth switch --user gjergjsheldija`, then `git push origin main`, then `gh auth switch --user gjergjsheldija-recare`. Do not force-push.
