# Spec 14: Align Condition asserted-date formatting

**Status:** Blocked (2026-11-19). Do not implement. On `ADT-A01-01`, Condition `481123a1-ca9c-c3c8-0284-e6926c3a50d8`, `valueDateTime` is actual `2020-05-01T13:30:15+02:15` versus expected `2020-05-01T16:45:15+05:30`, and `onsetDateTime` is actual `2004-01-25T11:40:25+04:20` versus expected `2004-01-25T12:50:25+05:30`. Both are the same instant. Other official fixtures keep the source offset for the same kind of input, including `+0215` on `ADT-A47-01`. `compareContent` already compares those instants as equal. Rewriting `formatAsDateTime` to `+05:30` would change cases that already match.

## 1. Goal

Twenty-nine official cases differ first on `Condition.extension[0].valueDateTime`. That value is `DG1.19` passed through `format_as_date_time` in `Extensions/_Condition-assertedDate.liquid`. The same filter writes `Condition.onsetDateTime` from `DG1.5`. After this change, none of those 29 cases still lists `extension.0.valueDateTime` on that Condition. Cases that already pass stay passing.

## 2. Verified set

From `classification.json` on `main` at `a48786d`. Every content row whose `contentDelta.fields[0].paths[0]` is `extension.0.valueDateTime` is in this set. There are 29. Every such field key starts with `Condition/`. The first eight are `ADT-A01-01.hl7`, `ADT-A03-01.hl7`, `ADT-A04-01.hl7`, `ADT-A05-01.hl7`, `ADT-A06-01.hl7`, `ADT-A07-01.hl7`, `ADT-A08-01.hl7`, and `ADT-A13-01.hl7`. Read the full set from that file. Do not hard-code the filenames in the engine.

`formatAsDateTime` in `src/lib/liquid-converter/filters/dateFilters.js` is the filter those templates call. When the source has no timezone it returns `Date.toJSON()`, which is a UTC instant with milliseconds and a `Z`. Whether the expected string differs in precision, offset, or timezone is not known yet. Trace `ADT-A01-01.hl7` / `ADT_A01`, Condition id `481123a1-ca9c-c3c8-0284-e6926c3a50d8`, and record the actual and expected `extension[0].valueDateTime` and `onsetDateTime` before editing.

## 3. Files you may edit

- `src/lib/liquid-converter/filters/dateFilters.js` and `src/lib/liquid-converter/filters/dateFilters.spec.js`
- `.agents/skills/fhir-template-compat/PROJECT_CONTEXT.md` with the verified result
- `test/e2e-test/liquid-regression/classification.json` by re-running `node test/e2e-test/liquid-regression/classify-diffs.mjs`
- Section 7 of `specs/liquid-template-compat/13-classify-content-diffs.md`, so it matches the regenerated file
- This spec's `**Status:**` line and a spec 14 bullet in `specs/ORDER.md`

Do not edit any `*.liquid` file, `src/sample-data/**`, `test/e2e-test/liquid-fixtures/**`, or `compare.js`. Do not add a dependency. Do not change `classify-diffs.mjs` status rules.

## 4. Requirements

1. Record the actual and expected datetime strings for that Condition before changing the filter.
2. Change `formatAsDateTime` so those strings match the expected bundle for an input with no request timezone. Add a unit test that uses the HL7 value you traced, not a guessed format. The test fails on the current `toJSON()` output and passes after the change.
3. Re-run the classifier and commit the new `classification.json`.
4. Stop and do not merge if any of these become true:
   - The actual and expected strings do not both come from `format_as_date_time`, or you cannot say which part of the format differs.
   - Any of the 29 cases still has `extension.0.valueDateTime` on a `Condition` in `contentDelta.fields`.
   - Any case that was `pass` at `a48786d` becomes `count` or `content`.
   - Any case gains a non-empty `byType` count delta.
   - `summary.pass` drops below 29.

A case in the 29 may remain `content` because of some other path. `period.start` and `end` may also move if this same filter change fixes them. That is allowed. A new count delta is not.

## 5. Validation

```sh
npx mocha --no-package --no-config src/lib/liquid-converter/filters/dateFilters.spec.js --exit --timeout 10000
node test/e2e-test/liquid-regression/classify-diffs.mjs
node scripts/test-summary.mjs
```

The summary must show 0 unexpected failures. ESLint and `git diff --check` must pass.

## 6. Acceptance criteria

- None of the 29 cases lists `extension.0.valueDateTime` on a Condition.
- `summary.pass` is at least 29 and `summary.count` is 0.
- No previously passing case regressed.
- No Liquid template, sample, or expected fixture was modified.
- Status and `specs/ORDER.md` say Done with the date, the actual-versus-expected datetime pair you traced, and the new pass/count/content totals.
