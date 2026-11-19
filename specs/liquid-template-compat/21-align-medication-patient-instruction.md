# Spec 21: Align MedicationRequest patientInstruction

**Status:** Done (2026-11-19). Trace on ORM-O01-06 MedicationRequest `1dbb1f11-fb42-d773-10ed-907a2d3caa08`: `orm_rxo_7.Value` is `^1 tablet by oral route 2 times daily.`, so `textString` = `1 tablet by oral route 2 times daily.` but `textstring` = empty (LiquidJS is case-sensitive); actual `dosageInstruction[0].patientInstruction` absent (empty), expected `1 tablet by oral route 2 times daily.`. Fixed in `normalizeVariableNameTypos` (`dotLiquidCompat.js`): `textstring` → `textString` only in content that captures/assigns `textString` and never `textstring`. `classification.json` is now 117 pass / 0 count / 15 content; all 7 cases pass (`dosageInstruction.0.text` cleared too), none regressed.

## 1. Goal

Seven official cases differ first at `MedicationRequest.dosageInstruction[0].patientInstruction`. After this change, none of those cases still lists that path. Cases that already pass stay passing. `summary.count` stays 0.

## 2. Verified set

From `classification.json` on `main` at `ecf43f1`. Every content row whose first path is `dosageInstruction.0.patientInstruction` is in this set. There are 7:

- `ORM_O01` / `ORM-O01-06.hl7`
- `RDE_O11` / `RDE-O11-01.hl7` and `RDE-O11-02.hl7`
- `RDE_O25` / `RDE-O25-01.hl7` and `RDE-O25-02.hl7`
- `RDS_O13` / `RDS-O13-01.hl7` and `RDS-O13-02.hl7`

The representative is `ORM-O01-06.hl7` / `ORM_O01`, MedicationRequest `1dbb1f11-fb42-d773-10ed-907a2d3caa08`. Expected `dosageInstruction[0].patientInstruction` is `1 tablet by oral route 2 times daily.`

Several of these rows also list `dosageInstruction.0.text`. That second path may clear with the same fix. Do not require it.

`Resource/_MedicationRequest.liquid` builds the instruction around lines 167–184. It captures `textString` from `orm_rxo_7.Value`, then reads `textstring` (different spelling) on the next line, then captures `textStringValue` from that result. The same `textString` / `textstring` pair is used for `text` on lines 178–184. What the actual `patientInstruction` string is, and whether `textstring` is empty because of that spelling, is not known yet. Trace this message before editing.

## 3. Files you may edit

- Engine code under `src/lib/liquid-converter/**` and `src/lib/parsers/hl7v2/**`, plus a focused unit test next to the code you change
- `src/lib/outputProcessor/**` only if the trace shows the merger, not the render, changes this string
- `.agents/skills/fhir-template-compat/PROJECT_CONTEXT.md` with the verified result
- `test/e2e-test/liquid-regression/classification.json` by re-running the classifier
- Section 7 of `specs/liquid-template-compat/13-classify-content-diffs.md`
- This spec's `**Status:**` line and a spec 21 bullet in `specs/ORDER.md`

Do not edit any `*.liquid` file, samples, expected fixtures, `compare.js`, or the classifier's status and same-instant rules. Do not add a dependency. Do not extend `normalizeNullNilLiteralAssignment`. Do not add a general case-insensitive variable lookup. A named spelling in `normalizeVariableNameTypos` is allowed only when the trace shows that exact spelling mismatch.

## 4. Requirements

1. Record the actual and expected `patientInstruction` for that MedicationRequest, and the value of `textString` and `textstring` during that render, before changing code.
2. Change the engine behavior that selects the wrong instruction. Do not hard-code this sentence, this MedicationRequest id, or these filenames.
3. Re-run `node test/e2e-test/liquid-regression/classify-diffs.mjs`.
4. Stop and do not merge if any of these become true:
   - You cannot name the value that selects the actual `patientInstruction`.
   - Any of the 7 cases still lists `dosageInstruction.0.patientInstruction` in `contentDelta.fields`.
   - Any case that was `pass` at `ecf43f1` becomes `count` or `content`.
   - Any case gains a non-empty `byType` count delta.
   - `summary.pass` drops below 110 or `summary.count` is not 0.

A case in the 7 may remain `content` because of another path. A new count delta is not allowed.

## 5. Validation

```sh
npx mocha --no-package --no-config <the new unit test> --exit --timeout 10000
node test/e2e-test/liquid-regression/classify-diffs.mjs
node scripts/test-summary.mjs
```

The summary must show 0 unexpected failures. ESLint and `git diff --check` must pass. Use `--no-package --no-config` for a single mocha file. Mocha's package.json spec glob runs the whole suite if a single file is passed without those flags.

## 6. Acceptance criteria

- None of the 7 cases lists `dosageInstruction.0.patientInstruction` in `contentDelta.fields`.
- `summary.pass` is at least 110 and `summary.count` is 0.
- No previously passing case regressed.
- No Liquid template, sample, or expected fixture was modified.
- Status and `specs/ORDER.md` say Done with the date, the actual-versus-expected instruction, and the new pass/count/content totals.
