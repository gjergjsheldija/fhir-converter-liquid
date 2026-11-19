# Spec 11: Drop the extra ORM_O01 MedicationRequest

**Status:** Done (2026-11-19). The extra id-less `MedicationRequest` came from the `ORM_O01.liquid` line 773 include (`Resource/MedicationRequest ORM_ORC_7, ORM_RXO, ID: medicationRequestID`); LiquidJS's case-sensitive lookup left `medicationRequestID` empty while DotLiquid resolves it to `medicationRequestId`, so `normalizeVariableNameTypos` now maps it. `ORM-O01-06.hl7` moved count to content; classification is 29 pass, 1 count, 102 content. Follow `.agents/skills/fhir-template-compat/SKILL.md` and `AGENTS.md`. Spec 10 is Done. Fix only this case.

## 1. Goal

`ORM-O01-06.hl7` with template `ORM_O01` emits one more `MedicationRequest` than the pinned Microsoft v7.0 expected bundle. After this change that case has no `MedicationRequest` count delta. Every other official case stays at least as close as `classification.json` on `main` at `54e3b88`.

## 2. Verified case

From `classification.json` at that commit. `status` is `count`. `byType` is exactly one row: `MedicationRequest` actual 2, expected 1, delta +1. Bundle entry counts are actual 56, expected 55.

`ORM_O01.liquid` includes `Resource/MedicationRequest` from `ORM_ORC_7` (twice), from `ORC`/`RXO`, and from `NTE`. The id variable is spelled `medicationRequestId` in most includes and `medicationRequestID` in one of them. Which include emits the extra resource is not known yet. Trace `ORM-O01-06.hl7` / `ORM_O01` before editing. Do not assume it is the same bug as the SIU Device scope or the doubled-comma DiagnosticReport.

## 3. Files you may edit

- Engine code under `src/lib/liquid-converter/**` and `src/lib/parsers/hl7v2/**`, plus a focused unit test next to the code you change
- `.agents/skills/fhir-template-compat/PROJECT_CONTEXT.md` with the verified result
- `test/e2e-test/liquid-regression/classification.json` by re-running `node test/e2e-test/liquid-regression/classify-diffs.mjs`
- Section 7 of `specs/liquid-template-compat/08-classify-official-bundle-diffs.md`, so it matches the regenerated file
- This spec's `**Status:**` line and a spec 11 bullet in `specs/ORDER.md`

Do not edit any `*.liquid` file, `src/sample-data/**`, or `test/e2e-test/liquid-fixtures/**`. Do not add a dependency. Do not change `compare.js` or the classifier's rules.

## 4. Requirements

1. On `ORM-O01-06.hl7` with template `ORM_O01`, identify the one `MedicationRequest` entry whose id is absent from the expected bundle, or the id-less entry if it has no id. Record which include emitted it in the status sentence.
2. Change the engine behavior that emits that extra resource. Do not drop every MedicationRequest, and do not special-case this filename.
3. Re-run the classifier and commit the new `classification.json`.
4. Stop and do not merge if any of these become true:
   - You cannot name the include and the engine difference that emits the extra MedicationRequest.
   - `ORM-O01-06.hl7` still has a `MedicationRequest` delta.
   - Any case that was `pass` at `54e3b88` becomes `count` or `content`.
   - Any of the 14 SIU cases regains a `Device` delta.
   - Either `OUL_R23` case regains a `DiagnosticReport` delta.
   - `ADT-A08-01.hl7` gains a resource-type delta.
   - `ORM-O01-03.hl7` changes its Account delta (actual 2, expected 3, delta −1) unless you can show the same traced engine difference removes that gap. A move of `ORM-O01-03` from `count` toward `content` or `pass`, with no new resource-type delta, is allowed. A new delta, or a larger Account gap, is a stop.
   - A previously passing official case fails `compareContent`.

`ORM-O01-06.hl7` may remain `content` when its MedicationRequest counts match and some other field still differs. That still meets this spec.

## 5. Validation

```sh
node test/e2e-test/liquid-regression/classify-diffs.mjs
npx mocha --no-package --no-config <the new unit test> --exit --timeout 10000
node scripts/test-summary.mjs
```

The summary must show 0 unexpected failures. ESLint and `git diff --check` must pass. Mocha's `package.json` spec glob runs the whole suite when you pass one file; use `--no-package --no-config` for the focused test.

## 6. Acceptance criteria

- `ORM-O01-06.hl7` has no `MedicationRequest` entry in `byType`.
- `summary.pass` is greater than or equal to 29.
- The SIU, OUL_R23, and ADT-A08-01 guards in section 4 hold.
- No Liquid template, sample, or expected fixture was modified.
- Status and `specs/ORDER.md` say Done with the date, the include, and the new pass/count/content totals.
