# Spec 10: Drop the extra OUL_R23 DiagnosticReport

**Status:** Done (2026-11-19). The extra `DiagnosticReport` came from the `diagnosticId` include (`Reference/DiagnosticReport/Encounter`, `REF: …,, ID: diagnosticId`): LiquidJS stops reading include arguments at a doubled comma and dropped `ID`, DotLiquid ignores it. `normalizeRepeatedTagArgumentCommas` fixes this; `classification.json` is now 29 pass / 2 count / 101 content (both `OUL_R23` pass, `ADT-A08-01.hl7` count → content). Follow `.agents/skills/fhir-template-compat/SKILL.md` and `AGENTS.md`. Spec 09 is Done. Fix only this family.

## 1. Goal

The two official `OUL_R23` cases each emit one more `DiagnosticReport` than the pinned Microsoft v7.0 expected bundle. After this change, neither case has a `DiagnosticReport` count delta. Every other official case stays at least as close as `classification.json` on `main` at `6314b2e`.

## 2. Verified cases

From `classification.json` at that commit. Each row is `status: "count"` with `byType` exactly one `DiagnosticReport` delta of `+1`.

| Template | dataFile | actual | expected |
| --- | --- | --- | --- |
| OUL_R23 | OUL-R23-01.hl7 | 109 | 108 |
| OUL_R23 | OUL-R23-02.hl7 | 84 | 83 |

`OUL_R23.liquid` includes `Resource/DiagnosticReport` from an OBX (`obx_diagnosticReportID1`), from a specimen OBX (`spm_obx_diagnosticReportID`), from an OBR (`diagnosticId`), and from a later OBX (`obx_diagnosticReportID2`). Which include emits the extra resource is not known yet. Trace `OUL-R23-01.hl7` / `OUL_R23` before editing. Spec 09 found that `{% evaluate %}` used to render in an isolated scope and overwrite an id with null. That tag now renders on the caller stack. Do not assume this extra report is the same bug.

## 3. Files you may edit

- Engine code under `src/lib/liquid-converter/**` and `src/lib/parsers/hl7v2/**`, plus a focused unit test next to the code you change
- `.agents/skills/fhir-template-compat/PROJECT_CONTEXT.md` with the verified result
- `test/e2e-test/liquid-regression/classification.json` by re-running `node test/e2e-test/liquid-regression/classify-diffs.mjs`
- Section 7 of `specs/liquid-template-compat/08-classify-official-bundle-diffs.md`, so it matches the regenerated file
- This spec's `**Status:**` line and a spec 10 bullet in `specs/ORDER.md`

Do not edit any `*.liquid` file, `src/sample-data/**`, or `test/e2e-test/liquid-fixtures/**`. Do not add a dependency. Do not change `compare.js` or the classifier's rules.

## 4. Requirements

1. On `OUL-R23-01.hl7` with template `OUL_R23`, identify the one `DiagnosticReport` entry whose id is absent from the expected bundle, or the id-less entry if it has no id. Record which include variable emitted it (`obx_diagnosticReportID1`, `spm_obx_diagnosticReportID`, `diagnosticId`, or `obx_diagnosticReportID2`) in the status sentence.
2. Change the engine behavior that emits that extra resource. Do not drop every DiagnosticReport, and do not special-case these two filenames.
3. Re-run the classifier and commit the new `classification.json`.
4. Stop and do not merge if any of these become true:
   - You cannot name the include variable and the engine difference that emits the extra DiagnosticReport.
   - Either OUL_R23 case still has a `DiagnosticReport` delta.
   - Any case that was `pass` becomes `count` or `content`.
   - Any of the 14 SIU cases regains a `Device` delta.
   - `ORM-O01-03.hl7` Account −1 or `ORM-O01-06.hl7` MedicationRequest +1 changes resource type or the sign of its delta.
   - `ADT-A08-01.hl7` gains a new resource-type delta. It may move from EpisodeOfCare +1 (`count`) to `content` or `pass` when that delta disappears. The same `,,` include bug is in `ADT_A08.liquid`, so a correct comma collapse improves that row. That improvement is required, not a stop.
   - A previously passing official case fails `compareContent`.

Either OUL case may remain `content` when its DiagnosticReport counts match and some other field still differs. That still meets this spec.

## 5. Validation

```sh
node test/e2e-test/liquid-regression/classify-diffs.mjs
npx mocha --no-package --no-config <the new unit test> --exit --timeout 10000
node scripts/test-summary.mjs
```

The summary must show 0 unexpected failures. ESLint and `git diff --check` must pass. Mocha's `package.json` spec glob runs the whole suite when you pass one file; use `--no-package --no-config` for the focused test.

## 6. Acceptance criteria

- Both `OUL_R23` rows have no `DiagnosticReport` entry in `byType`.
- `summary.pass` is greater than or equal to 27.
- The 14 SIU rows still have no `Device` delta.
- `ORM-O01-03.hl7` and `ORM-O01-06.hl7` are unchanged.
- `ADT-A08-01.hl7` has no EpisodeOfCare delta.
- No Liquid template, sample, or expected fixture was modified.
- Status and `specs/ORDER.md` say Done with the date, the include variable, and the new pass/count/content totals.
