# Spec 17: Align Patient citizenship display text

**Status:** Done (2026-11-19) — Dropped the missing Patient `patient-citizenship` text: `_PatientCitizenship.liquid` tests `CWE_5_doubleDash == null` where `CWE_5_doubleDash = citizen.5.Value | append: '--'`; with CWE_2 = `United States of America` and CWE_5/CWE_11 nil, DotLiquid `Append` returns null for a nil input (so the first branch emits `text` = CWE_2), while LiquidJS's built-in `append` returned `--`, so no branch matched and `text` was omitted. Actual `valueCodeableConcept.text` (ADT-A01-01 Patient 9e909e52-61a1-be50-1878-a12ef8c36346, extension 7): absent; expected: `United States of America`. Registered a DotLiquid-compatible `append` helper (`filters/append.js`: nil input stays nil). Classification is now 93 pass, 0 count, 39 content (all 43 cases no longer list the path; the 20 `extension.5` cases also cleared; 62 content cases became pass, none regressed). Original note: Follow `.agents/skills/fhir-template-compat/SKILL.md` and `AGENTS.md`. Spec 16 is Done. Fix only this Patient text difference.

## 1. Goal

Forty-three official cases differ first at `Patient.extension[7].extension[0].valueCodeableConcept.text`. After this change, none of those cases still lists that path. Cases that already pass stay passing. `summary.count` stays 0.

## 2. Verified set

From `classification.json` on `main` at `dc385ff`. Every content row whose `contentDelta.fields[0].paths[0]` is `extension.7.extension.0.valueCodeableConcept.text` and whose field key starts with `Patient/` is in this set. There are 43. The representative is `ADT-A01-01.hl7` / `ADT_A01`, Patient `9e909e52-61a1-be50-1878-a12ef8c36346`. On the expected bundle, extension index 7 is `patient-citizenship`, and the code text is `United States of America`. The same Patient also differs at extension indexes 8 and 9 on that same text path.

`Extensions/_PatientCitizenship.liquid` sets `text` from `CWE_2`, `CWE_5`, and `CWE_11`, using comparisons such as `CWE_5_doubleDash == null`. What the actual text is, and which comparison chooses it, is not known yet. Trace this Patient and record the actual and expected text before editing. Do not assume every one of the 43 extensions is citizenship. Twenty further cases lead with `extension.5.extension.0.valueCodeableConcept.text`. They may improve if this is the same comparison. Do not require that.

## 3. Files you may edit

- Engine code under `src/lib/liquid-converter/**` and `src/lib/parsers/hl7v2/**`, plus a focused unit test next to the code you change
- `.agents/skills/fhir-template-compat/PROJECT_CONTEXT.md` with the verified result
- `test/e2e-test/liquid-regression/classification.json` by re-running the classifier
- Section 7 of `specs/liquid-template-compat/13-classify-content-diffs.md`
- This spec's `**Status:**` line and a spec 17 bullet in `specs/ORDER.md`

Do not edit any `*.liquid` file, samples, expected fixtures, `compare.js`, or the classifier's status and same-instant rules. Do not add a dependency.

## 4. Requirements

1. Record the actual and expected `valueCodeableConcept.text` at extension index 7 for that Patient, and the CWE component values the citizenship template reads.
2. Change the engine behavior that selects the wrong text. Do not hard-code `United States of America`, this Patient id, or these filenames.
3. Re-run `node test/e2e-test/liquid-regression/classify-diffs.mjs`.
4. Stop and do not merge if any of these become true:
   - You cannot name the comparison or value that produces the actual text.
   - Any of the 43 cases still lists `extension.7.extension.0.valueCodeableConcept.text`.
   - Any case that was `pass` at `dc385ff` becomes `count` or `content`.
   - Any case gains a non-empty `byType` count delta.
   - `summary.pass` drops below 31 or `summary.count` is not 0.

A case in the 43 may remain `content` because of another path. The extension-5 text signature may improve. A new count delta is not allowed.

## 5. Validation

```sh
npx mocha --no-package --no-config <the new unit test> --exit --timeout 10000
node test/e2e-test/liquid-regression/classify-diffs.mjs
node scripts/test-summary.mjs
```

The summary must show 0 unexpected failures. ESLint and `git diff --check` must pass. Use `--no-package --no-config` for a single mocha file.

## 6. Acceptance criteria

- None of the 43 cases lists `extension.7.extension.0.valueCodeableConcept.text`.
- `summary.pass` is at least 31 and `summary.count` is 0.
- No previously passing case regressed.
- No Liquid template, sample, or expected fixture was modified.
- Status and `specs/ORDER.md` say Done with the date, the actual-versus-expected text, and the new pass/count/content totals.
