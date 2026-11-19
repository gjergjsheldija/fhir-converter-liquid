# Spec 25: Align VXU Immunization encounter

**Status:** Done (2026-11-19). Actual Immunization `encounter` was `{"reference":"Encounter/"}`; expected: no `encounter` property. `encounterId` is nil (the VXU messages have no PV1, so `VXU_V04.liquid` line 179 skips the `{% evaluate encounterId %}` at line 295) and `Immunization_encounterId` was `Encounter/` (LiquidJS `prepend` stringifies nil; DotLiquid `Prepend` returns null for a nil input, so `reference` renders empty and the post-processor drops it). A DotLiquid-compatible `prepend` helper (`filters/prepend.js`) fixes it. Classification is now 125 pass, 0 count, 7 content.

## 1. Goal

Two official cases differ first at `Immunization.encounter`. After this change, neither case still lists that path. Cases that already pass stay passing. `summary.count` stays 0.

## 2. Verified set

From `classification.json` on `main` at `dfce26f`. Every content row whose first path is `encounter` is in this set. There are 2, both `VXU_V04`:

- `IZ_1_1.1_Admin_Child_Max_Message.hl7`, Immunization `9d7483ec-3273-a9d9-0d6c-da4895472607`
- `VXU.hl7`, Immunizations `07ff92a4-c57e-8726-a03a-1241de54a9c3`, `c0f2ddcb-f061-279f-d5e1-7b54b437e9db`, and `c82d117c-dc9d-e431-dc92-6ca91243da07`

The expected Immunization `9d7483ec-3273-a9d9-0d6c-da4895472607` has no `encounter` property. Its `patient.reference` is `Patient/1b2dce0f-93ae-fae4-cc64-b90257c96f1b`.

`Resource/_Immunization.liquid` lines 309–312 always emit `encounter.reference` from `Immunization_Encounter_ID`. `VXU_V04.liquid` line 690 assigns `Immunization_encounterId` from `encounterId | prepend: 'Encounter/'`, and line 691 passes that as `Immunization_Encounter_ID`. `encounterId` is evaluated from `firstSegments.PV1` on line 295. What the actual `encounter` value is, and what `encounterId` is during that render, is not known yet. Trace `IZ_1_1.1_Admin_Child_Max_Message` before editing.

Both cases also list Provenance `text.div`. `VXU.hl7` also lists Provenance `occurredDateTime` and `recorded`. Those may be the generation clock from spec 22. Do not require them to clear, and do not change `now`.

## 3. Files you may edit

- Engine code under `src/lib/liquid-converter/**` and `src/lib/parsers/hl7v2/**`, plus a focused unit test next to the code you change
- `src/lib/outputProcessor/**` only if the trace shows a post-render step, not the Liquid value, changes this property
- `.agents/skills/fhir-template-compat/PROJECT_CONTEXT.md` with the verified result
- `test/e2e-test/liquid-regression/classification.json` by re-running the classifier
- Section 7 of `specs/liquid-template-compat/13-classify-content-diffs.md`
- This spec's `**Status:**` line and a spec 25 bullet in `specs/ORDER.md`

Do not edit any `*.liquid` file, samples, expected fixtures, `compare.js`, or the classifier's status and same-instant rules. Do not add a dependency. Do not extend `normalizeNullNilLiteralAssignment`. Do not add a general case-insensitive variable lookup. A named spelling in `normalizeVariableNameTypos` is allowed only when the trace shows that exact spelling mismatch. Do not special-case these filenames or resource ids. Do not change `nowFilter`.

## 4. Requirements

1. Record the actual `encounter` for Immunization `9d7483ec-3273-a9d9-0d6c-da4895472607`, and the values of `encounterId` and `Immunization_encounterId`, before changing code. The expected resource has no `encounter` property.
2. Change the engine behavior that emits the wrong encounter. Do not hard-code an Encounter id or delete the property by filename.
3. Re-run `node test/e2e-test/liquid-regression/classify-diffs.mjs`.
4. Stop and do not merge if any of these become true:
   - You cannot name the value that selects the actual `encounter`.
   - Either of the 2 cases still lists `encounter` as an Immunization path in `contentDelta.fields`.
   - Any case that was `pass` at `dfce26f` becomes `count` or `content`.
   - Any case gains a non-empty `byType` count delta.
   - `summary.pass` drops below 122 or `summary.count` is not 0.

A case in the 2 may remain `content` because of Provenance. A new count delta is not allowed.

## 5. Validation

```sh
npx mocha --no-package --no-config <the new unit test> --exit --timeout 10000
node test/e2e-test/liquid-regression/classify-diffs.mjs
node scripts/test-summary.mjs
```

The summary must show 0 unexpected failures. ESLint and `git diff --check` must pass. Use `--no-package --no-config` for a single mocha file. Mocha's package.json spec glob runs the whole suite if a single file is passed without those flags.

## 6. Acceptance criteria

- Neither of the 2 cases lists Immunization `encounter` in `contentDelta.fields`.
- `summary.pass` is at least 122 and `summary.count` is 0.
- No previously passing case regressed.
- No Liquid template, sample, or expected fixture was modified.
- Status and `specs/ORDER.md` say Done with the date, the actual-versus-expected encounter, and the new pass/count/content totals.
