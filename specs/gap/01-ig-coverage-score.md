# Spec 01: Coverage score against the v2-to-FHIR IG

**Status:** Not started (2026-11-20). Follow `.agents/skills/spec-runner/SKILL.md`, `.agents/skills/test-baseline/SKILL.md`, and `AGENTS.md`. Do not start another gap spec in this change.

## 1. Goal

Generate maps already writes a ConceptMap of fields a template reads. This spec adds a score that says, for one message, how many of those mappings also appear in the HL7 v2-to-FHIR implementation guide, and how many guide mappings the template does not read. It is a report. It does not change conversion output.

## 2. Current behavior

- `generateFieldMaps` in `src/static/js/file-browser.js` builds the field-map ConceptMap, Markdown, and HTML. The export is not compared with the IG.
- `docs/mappings/` is a local export and is not the source of truth for this spec.
- No file under `src/` reads `hl7.fhir.uv.v2mappings`.

If a coverage score already exists, stop and report where it is computed.

## 3. Files you may edit

- `src/lib/mappings/igCoverage.js` and `src/lib/mappings/igCoverage.spec.js` (create both)
- `src/static/js/file-browser.js` only to show the score next to the existing Generate maps result
- This spec's `**Status:**` line, the row in `specs/gap/00-order.md`, and the bullet in `specs/ORDER.md`

Do not edit Liquid templates, samples, or official expected JSON. Do not add a dependency. Do not vendor the IG package. Do not commit `docs/mappings/`.

## 4. Requirements

1. `coverageScore(generated, guide)` takes two ConceptMap-shaped objects. A mapping key is `group.source`, `element.code`, `group.target`, and the first `element.target[0].code`, joined by `|`. Return `{shared, onlyGenerated, onlyGuide}`. Missing groups or elements count as empty. Do not throw on a ConceptMap with no `group`.
2. The unit test uses two small objects in the test file. One shared key, one key only in the generated map, one key only in the guide. Assert the three counts are 1.
3. Generate maps, after it has built the in-memory ConceptMap for the open template, calls the same function. The guide object for this spec is a single ConceptMap the caller passes in. When the page has no guide loaded, the score area says **No IG ConceptMap loaded** and does not invent counts.
4. Add a file input, next to Generate maps, that accepts one ConceptMap JSON file. It is read in the browser and is not uploaded to the server. A file that is not a ConceptMap shows the same empty sentence.
5. The score text is `Shared N · Only in template N · Only in IG N`.

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
