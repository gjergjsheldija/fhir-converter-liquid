# Spec 05: Declared segment list

**Status:** Done (2026-11-20). Verified with 6 focused tests, an end-to-end local-project check (no file: no property; `PID`/`PV1` list with `ZDG` in message: `["ZDG"]`; debug off: no property), and `node scripts/test-summary.mjs` (743 passing, 0 unexpected failures, eslint and diff check clean). Follow `.agents/skills/spec-runner/SKILL.md`, `.agents/skills/test-baseline/SKILL.md`, and `AGENTS.md`. Do not start another gap spec in this change.

## 1. Goal

A local HL7 v2 project can list the segment ids it expects. Conversion still succeeds. The debug payload reports segment ids that were in the message and not on the list. This spec does not vendor HL7 structure definitions and does not check fields or versions.

## 2. Current behavior

- The HL7 v2 parser accepts the segments present in the message. `unusedSegments` reports segments the template did not read. There is no project-owned allow list.
- A project manifest does not have a structure file.
- C-CDA projects have no segments.

If a segment allow list is already applied, stop and report the file name.

## 3. Files you may edit

- `src/lib/parsers/hl7v2/declaredSegments.js` and `declaredSegments.spec.js` (create both)
- `src/lib/projects/convertProject.js` to pass the list through for a local HL7 v2 project
- `src/lib/workers/worker.js` to set `debugInfo.undeclaredSegments` when debug is on
- `src/routes.js` for `POST /api/v1/projects/convert` only, to copy `prep.declaredSegments` onto the worker message
- This spec's `**Status:**` line, the row in `specs/gap/00-order.md`, and the bullet in `specs/ORDER.md`

Do not edit the parser's field splitting. Do not edit templates or samples. Do not add a dependency. Do not fail conversion because a segment is missing from the list.

## 4. Requirements

1. The list file is `structures/segments.txt` at the project root. One segment id per line, trimmed. Blank lines and lines starting with `#` are ignored. A missing file means the check is off.
2. `undeclaredSegments(messageSegments, allowed)` returns the distinct segment ids from the message that are not in the allowed set, in message order. `MSH` is never reported. Comparison is case-sensitive.
3. When the check is off, or the project is not a local HL7 v2 project, `debugInfo` has no `undeclaredSegments` property.
4. When the check is on and debug is on, `debugInfo.undeclaredSegments` is that array. The FHIR resource is unchanged. Debug off does not add the property.
5. The unit test uses segment ids `MSH`, `PID`, `ZDG` and an allow list of `PID` and `PV1`. The result is `["ZDG"]`.

## 5. Validation

```sh
npx mocha --no-package --no-config src/lib/parsers/hl7v2/declaredSegments.spec.js --exit --timeout 10000
node scripts/test-summary.mjs
```

Official classification stays 132 pass / 0 count / 0 content. ESLint and `git diff --check` must pass.

## 6. Acceptance criteria

- A missing list file does not change conversion or debug.
- An extra segment id is reported and the conversion still returns the bundle.
- No HL7 structure package is added.
- Status, `specs/gap/00-order.md`, and `specs/ORDER.md` say Done with the date.

## 7. Git

Branch from current `main`: `feat/gap-05-declared-segments`. One commit, then merge into `main`. Push with `gh auth switch --user gjergjsheldija`, then `git push origin main`, then `gh auth switch --user gjergjsheldija-recare`. Do not force-push.
