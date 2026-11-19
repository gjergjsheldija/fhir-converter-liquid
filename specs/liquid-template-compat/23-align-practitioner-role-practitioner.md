# Spec 23: Align PractitionerRole practitioner

**Status:** Done (2026-11-19). Actual `practitioner` for PractitionerRole `9f64bd3b-d5e9-678b-2f14-b0d756a4e7f1` was absent (empty); expected `Practitioner/ae62dffe-1a0f-c68b-e7a3-e33cfce7761e`. The value that selects it is `collection_collector_practitioner` (`requestor_practitioner1` is nil: OBR.16 is empty so that include never renders); the Specimen collector include (`MDM_T02.liquid` line 397, same in 16 other templates incl. `ORU_R01.liquid` line 929) passes `practitionerId_obr_10`, which is never assigned, while the id is assigned as `practitionerId_OBR_10`. DotLiquid lookup is case-insensitive; `normalizeVariableNameTypos` now maps it. Classification: 120 pass, 0 count, 12 content (3 cases now pass, none regressed).

## 1. Goal

Three official cases differ first at `PractitionerRole.practitioner`. After this change, none of those cases still lists that path. Cases that already pass stay passing. `summary.count` stays 0.

## 2. Verified set

From `classification.json` on `main` at `4e51680`. Every content row whose first path is `practitioner` is in this set. There are 3:

- `MDM_T02` / `MDM-T02-03.hl7`, PractitionerRole `9f64bd3b-d5e9-678b-2f14-b0d756a4e7f1`. Expected `practitioner.reference` is `Practitioner/ae62dffe-1a0f-c68b-e7a3-e33cfce7761e`.
- `ORU_R01` / `LAB-ORU-1.hl7` and `LAB-ORU-2.hl7`, PractitionerRole `be571888-010e-9a32-e87f-f1ee1bd631a8`. Expected `practitioner.reference` is `Practitioner/da437276-fd7c-eb21-1885-4041aa59c483`.

`Resource/_PractitionerRole.liquid` lines 495–516 set `practitioner.reference` from `requestor_practitioner1`, `requestor_practitioner2`, `collection_collector_practitioner`, `REF_SCH_12`, `REF_SCH_16`, `REF_SCH_20`, or `practitionerId_TXA`. `MDM_T02.liquid` line 332 includes `Resource/PractitionerRole` with `requestor_practitioner1: practitionerId_OBR_16` and `ID: practitionerRoleId_OBR_16`. `ORU_R01.liquid` line 825 does the same. What the actual `practitioner` value is, and which of those variables the template sees, is not known yet. Trace `MDM-T02-03` before editing.

## 3. Files you may edit

- Engine code under `src/lib/liquid-converter/**` and `src/lib/parsers/hl7v2/**`, plus a focused unit test next to the code you change
- `src/lib/outputProcessor/**` only if the trace shows the merger, not the render, changes this reference
- `.agents/skills/fhir-template-compat/PROJECT_CONTEXT.md` with the verified result
- `test/e2e-test/liquid-regression/classification.json` by re-running the classifier
- Section 7 of `specs/liquid-template-compat/13-classify-content-diffs.md`
- This spec's `**Status:**` line and a spec 23 bullet in `specs/ORDER.md`

Do not edit any `*.liquid` file, samples, expected fixtures, `compare.js`, or the classifier's status and same-instant rules. Do not add a dependency. Do not extend `normalizeNullNilLiteralAssignment`. Do not add a general case-insensitive variable lookup. A named spelling in `normalizeVariableNameTypos` is allowed only when the trace shows that exact spelling mismatch. Do not special-case these filenames or resource ids.

## 4. Requirements

1. Record the actual and expected `practitioner` for PractitionerRole `9f64bd3b-d5e9-678b-2f14-b0d756a4e7f1`, and the value of `requestor_practitioner1` seen by that render, before changing code.
2. Change the engine behavior that selects the wrong practitioner. Do not hard-code these Practitioner ids.
3. Re-run `node test/e2e-test/liquid-regression/classify-diffs.mjs`.
4. Stop and do not merge if any of these become true:
   - You cannot name the value that selects the actual `practitioner`.
   - Any of the 3 cases still lists `practitioner` as a PractitionerRole path in `contentDelta.fields`.
   - Any case that was `pass` at `4e51680` becomes `count` or `content`.
   - Any case gains a non-empty `byType` count delta.
   - `summary.pass` drops below 117 or `summary.count` is not 0.

A case in the 3 may remain `content` because of another path. A new count delta is not allowed.

## 5. Validation

```sh
npx mocha --no-package --no-config <the new unit test> --exit --timeout 10000
node test/e2e-test/liquid-regression/classify-diffs.mjs
node scripts/test-summary.mjs
```

The summary must show 0 unexpected failures. ESLint and `git diff --check` must pass. Use `--no-package --no-config` for a single mocha file. Mocha's package.json spec glob runs the whole suite if a single file is passed without those flags.

## 6. Acceptance criteria

- None of the 3 cases lists PractitionerRole `practitioner` in `contentDelta.fields`.
- `summary.pass` is at least 117 and `summary.count` is 0.
- No previously passing case regressed.
- No Liquid template, sample, or expected fixture was modified.
- Status and `specs/ORDER.md` say Done with the date, the actual-versus-expected practitioner, and the new pass/count/content totals.
