# Spec 28: Align ORU PractitionerRole code

**Status:** Done (2026-11-19) — `normalizeVariableNameTypos` passes the `obr_34`/`obr_35` loop variable for the `OBR_34: OBR_34` / `OBR_35: OBR_35` include argument. PractitionerRole `6f4104a9…`: actual `code` absent (the render saw `OBR_34` = nil), expected `TN` / `Technician`. `ORU-R01-01` passes; classification is 132 pass, 0 count, 0 content. Follow `.agents/skills/fhir-template-compat/SKILL.md` and `AGENTS.md`. Spec 27 is Done and on `origin/main` at `23900aa`. Spec 22 stays Blocked. Do not change `now`, `compare.js`, or the Provenance clock normalizer. Fix only this PractitionerRole `code` path.

## 1. Goal

`ORU-R01-01.hl7` is the last official content case. It differs first at `PractitionerRole.code`. After this change, that case no longer lists `code`, `location`, or `period` on those PractitionerRoles, and `compareContent` passes it. Cases that already pass stay passing. `summary.count` stays 0.

## 2. Verified set

From `classification.json` on `main` at `23900aa`. The only content row is `ORU_R01` / `ORU-R01-01.hl7`.

PractitionerRole `6f4104a9-6928-bcaf-7719-2fb47f0c2df5` differs at `code` and `location`. Expected:

- `code[0].coding[0]` is `TN` / `Technician` / `http://terminology.hl7.org/CodeSystem/v2-0443`
- `location[0].reference` is `Location/59b00d6f-7e90-a8a3-eec1-19d7f88514ea`
- `practitioner.reference` is `Practitioner/8c441677-2d13-b04b-260c-45f02d79bc0e`

PractitionerRole `f035eb01-dd52-98c8-42f4-08d3a63e5aa2` differs at `code`, `location`, and `period`. Expected:

- `code[0].coding[0]` is `TR` / `Transcriptionist` / `http://terminology.hl7.org/CodeSystem/v2-0443`
- `period` is `2002-11-11` through `2002-11-12`
- `location[0].reference` is `Location/ce40a46d-eaed-b5a4-ef6e-463cae637157`
- `practitioner.reference` is `Practitioner/c6073275-8b6b-8315-211c-f96e9700b6ae`

`Resource/_PractitionerRole.liquid` emits the `TN` code when `OBR_34` is set (lines 19–31) and the `TR` code when `OBR_35` is set (lines 33–45). `DataType/NDLPractitionerRole` is included with `OBR_34` and `OBR_35`. `period` at lines 180–193 is written from `PRD.8` and `PRD.9`. `location` starts at line 207. What the actual `code`, `location`, and `period` are, and which of `OBR_34` and `OBR_35` the template sees, is not known yet. Trace `ORU-R01-01` before editing.

The row also lists Provenance `text.div`. `compareContent` already normalizes that clock. Do not try to clear it, and do not change `now`. If that is the only path left and `compareContent` passes, the case is a pass.

## 3. Files you may edit

- Engine code under `src/lib/liquid-converter/**` and `src/lib/parsers/hl7v2/**`, plus a focused unit test next to the code you change
- `src/lib/outputProcessor/**` only if the trace shows the merger, not the render, changes these properties
- `.agents/skills/fhir-template-compat/PROJECT_CONTEXT.md` with the verified result
- `test/e2e-test/liquid-regression/classification.json` by re-running the classifier
- Section 7 of `specs/liquid-template-compat/13-classify-content-diffs.md`
- This spec's `**Status:**` line and a spec 28 bullet in `specs/ORDER.md`

Do not edit any `*.liquid` file, samples, expected fixtures, `compare.js`, `interceptors.js`, or the classifier's status and same-instant rules. Do not add a dependency. Do not extend `normalizeNullNilLiteralAssignment`. Do not add a general case-insensitive member lookup beyond the `.value` alias from spec 27. A named spelling in `normalizeVariableNameTypos` is allowed only when the trace shows that exact spelling mismatch. Do not special-case this filename or these resource ids. Do not change `nowFilter`, `prepend`, or `format_as_date_time`.

## 4. Requirements

1. Record the actual and expected `code` for PractitionerRole `6f4104a9-6928-bcaf-7719-2fb47f0c2df5`, and the value of `OBR_34` that render sees, before changing code.
2. Change the engine behavior that selects the wrong code. Do not hard-code `TN`, `TR`, or these ids.
3. Re-run `node test/e2e-test/liquid-regression/classify-diffs.mjs`.
4. Stop and do not merge if any of these become true:
   - You cannot name the value that selects the actual `code`.
   - `ORU-R01-01` still lists `code`, `location`, or `period` on a PractitionerRole in `contentDelta.fields`.
   - Any case that was `pass` at `23900aa` becomes `count` or `content`.
   - Any case gains a non-empty `byType` count delta.
   - `summary.pass` drops below 131 or `summary.count` is not 0.
   - `compareContent` still fails `ORU-R01-01`.

`ORU-R01-01` may remain `content` only when the sole remaining path is Provenance `text.div` and `compareContent` still passes. A new count delta is not allowed.

## 5. Validation

```sh
npx mocha --no-package --no-config <the new unit test> --exit --timeout 10000
node test/e2e-test/liquid-regression/classify-diffs.mjs
node scripts/test-summary.mjs
```

The summary must show 0 unexpected failures. A single timeout on a case the classifier marks `pass` is a rerun, not an engine regression. ESLint and `git diff --check` must pass. Use `--no-package --no-config` for a single mocha file.

## 6. Acceptance criteria

- `ORU-R01-01` does not list PractitionerRole `code`, `location`, or `period` in `contentDelta.fields`.
- `compareContent` passes `ORU-R01-01`.
- `summary.pass` is at least 131 and `summary.count` is 0.
- No previously passing case regressed.
- No Liquid template, sample, or expected fixture was modified.
- Status and `specs/ORDER.md` say Done with the date, the actual-versus-expected code, and the new pass/count/content totals.
