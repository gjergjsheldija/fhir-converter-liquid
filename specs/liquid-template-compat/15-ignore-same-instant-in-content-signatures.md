# Spec 15: Ignore same-instant timestamps in content signatures

**Status:** Done (2026-11-19). `contentDelta` skips same-instant dateTime pairs; classification is still 132 cases, 29 pass, 0 count, 103 content, and the new top signature is `costToBeneficiary.1` (33 cases). Follow `.agents/skills/fhir-template-compat/SKILL.md` and `AGENTS.md`. Spec 14 is Blocked. This spec changes the classifier only.

## 1. Goal

`contentDelta` reports `extension.0.valueDateTime` for 29 Condition resources whose actual and expected values are the same instant in different offsets. `compareContent` already treats those as equal. Skip FHIR dateTime pairs that are the same instant, then regenerate the signatures so the first path is a difference the official compare still fails.

## 2. Current behavior

`contentDelta` in `test/e2e-test/liquid-regression/classify-diffs.mjs` deep-compares resource JSON as strings. On `main` at `a48786d`, 29 content rows have first path `extension.0.valueDateTime`. For Condition `481123a1-ca9c-c3c8-0284-e6926c3a50d8` in `ADT-A01-01`, actual `2020-05-01T13:30:15+02:15` and expected `2020-05-01T16:45:15+05:30` are one instant. `summary` is 29 pass, 0 count, 103 content. Pass and count status still come from `compareContent` and `entryDelta`.

## 3. Files you may edit

- `test/e2e-test/liquid-regression/classify-diffs.mjs`
- `test/e2e-test/liquid-regression/classify-diffs.spec.js`
- `test/e2e-test/liquid-regression/classification.json`, by re-running the classifier
- Section 7 of `specs/liquid-template-compat/13-classify-content-diffs.md`
- `specs/liquid-template-compat/14-align-condition-asserted-date.md` (the blocked status line is already written; include that file)
- This spec's `**Status:**` line and a spec 15 bullet in `specs/ORDER.md`

Do not edit `src/**`, `compare.js`, any `*.liquid` file, samples, or expected fixtures. Do not add a dependency. Do not change `formatAsDateTime`.

## 4. Requirements

1. When both sides of a leaf are strings matching `YYYY-MM-DDThh:mm:ss` with an optional fraction and an offset or `Z`, and `Date.parse` of both is the same number, treat them as equal. A date-only value, a different instant, or an unparseable string still differs.
2. Add unit assertions: `2020-05-01T13:30:15+02:15` equals `2020-05-01T16:45:15+05:30`; `2020-05-01T13:30:15Z` does not equal `2020-05-01T13:30:16Z`; `2020-05-01` does not equal `2020-05-01T00:00:00Z`.
3. Do not change how `status` is chosen. Re-run the classifier. `summary` must stay 132 cases, 29 pass, 0 count, 103 content. If it does not, stop.
4. After the run, zero content rows may have `extension.0.valueDateTime` as `fields[0].paths[0]` when that pair is the same instant. Fill section 7 of spec 13 from the new file, sorted by count descending, with one example `dataFile` per signature.

## 5. Validation

```sh
npx mocha --no-package --no-config test/e2e-test/liquid-regression/classify-diffs.spec.js --exit --timeout 10000
node test/e2e-test/liquid-regression/classify-diffs.mjs
node scripts/test-summary.mjs
```

The full summary must show 0 unexpected failures. ESLint and `git diff --check` must pass.

## 6. Acceptance criteria

- The three datetime assertions pass, and the existing classifier tests still pass.
- Summary counts are unchanged.
- No content row's first path is an offset-only `extension.0.valueDateTime`.
- Section 7 of spec 13 matches the new file.
- No engine, template, sample, or expected fixture file changed.
- Status and `specs/ORDER.md` say Done with the date and the new top signature.
