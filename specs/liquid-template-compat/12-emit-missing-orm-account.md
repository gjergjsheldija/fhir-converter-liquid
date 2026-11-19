# Spec 12: Emit the missing ORM_O01 Account

**Status:** Done (2026-11-19). Missing Account is the first BLG Account (`AI167`, id `8ad2f1f3…`); include `BLG` (`ORM_O01.liquid` line 978, `ID: AccountId_BLG` vs `{% evaluate accountId_BLG … %}`): case-sensitive LiquidJS left `ID` empty so both BLG Accounts merged into one id-less Account, while DotLiquid resolves it case-insensitively; `normalizeVariableNameTypos` maps it. `classification.json`: 29 pass / 0 count / 103 content. Follow `.agents/skills/fhir-template-compat/SKILL.md` and `AGENTS.md`. Spec 11 is Done. This is the last `count` row in `classification.json`. Fix only this case.

## 1. Goal

`ORM-O01-03.hl7` with template `ORM_O01` emits one fewer `Account` than the pinned Microsoft v7.0 expected bundle. After this change that case has no `Account` count delta. Every other official case stays at least as close as `classification.json` on `main` at `2fae594`.

## 2. Verified case

From `classification.json` at that commit. `status` is `count`. `byType` is exactly one row: `Account` actual 2, expected 3, delta −1. Bundle entry counts are actual 45, expected 46.

`ORM_O01.liquid` builds an Account from `PID.18`, from the first `GT1`, and from `BLG`. The BLG id is assigned as `accountId_BLG` and passed to `Resource/Account` as `ID: AccountId_BLG`. Which Account is missing is not known yet. Trace `ORM-O01-03.hl7` / `ORM_O01` before editing. Spec 11 rewrote one MedicationRequest spelling because DotLiquid variable names are case-insensitive. Do not assume this gap is the same spelling, and do not turn every variable lookup into a case-insensitive lookup unless the trace shows that is the engine difference.

## 3. Files you may edit

- Engine code under `src/lib/liquid-converter/**` and `src/lib/parsers/hl7v2/**`, plus a focused unit test next to the code you change
- `.agents/skills/fhir-template-compat/PROJECT_CONTEXT.md` with the verified result
- `test/e2e-test/liquid-regression/classification.json` by re-running `node test/e2e-test/liquid-regression/classify-diffs.mjs`
- Section 7 of `specs/liquid-template-compat/08-classify-official-bundle-diffs.md`, so it matches the regenerated file
- This spec's `**Status:**` line and a spec 12 bullet in `specs/ORDER.md`

Do not edit any `*.liquid` file, `src/sample-data/**`, or `test/e2e-test/liquid-fixtures/**`. Do not add a dependency. Do not change `compare.js` or the classifier's rules.

## 4. Requirements

1. On `ORM-O01-03.hl7` with template `ORM_O01`, identify the `Account` id that is present in the expected bundle and absent from the actual bundle. Record which include should have emitted it (`PID.18`, `GT1`, or `BLG`) in the status sentence.
2. Change the engine behavior that drops that resource. Do not invent an Account, and do not special-case this filename.
3. Re-run the classifier and commit the new `classification.json`.
4. Stop and do not merge if any of these become true:
   - You cannot name the include and the engine difference that drops the Account.
   - `ORM-O01-03.hl7` still has an `Account` delta, or it gains any other resource-type delta.
   - Any case that was `pass` at `2fae594` becomes `count` or `content`.
   - Any of the 14 SIU cases regains a `Device` delta.
   - Either `OUL_R23` case regains a `DiagnosticReport` delta.
   - `ADT-A08-01.hl7` gains a resource-type delta.
   - `ORM-O01-06.hl7` regains a `MedicationRequest` delta.
   - A previously passing official case fails `compareContent`.

`ORM-O01-03.hl7` may remain `content` when its Account counts match and some other field still differs. That still meets this spec.

## 5. Validation

```sh
node test/e2e-test/liquid-regression/classify-diffs.mjs
npx mocha --no-package --no-config <the new unit test> --exit --timeout 10000
node scripts/test-summary.mjs
```

The summary must show 0 unexpected failures. ESLint and `git diff --check` must pass. Mocha's `package.json` spec glob runs the whole suite when you pass one file; use `--no-package --no-config` for the focused test.

## 6. Acceptance criteria

- `ORM-O01-03.hl7` has no `Account` entry in `byType`.
- `summary.count` is 0, and `summary.pass` is greater than or equal to 29.
- The SIU, OUL_R23, ADT-A08-01, and ORM-O01-06 guards in section 4 hold.
- No Liquid template, sample, or expected fixture was modified.
- Status and `specs/ORDER.md` say Done with the date, the include, and the new pass/count/content totals.
