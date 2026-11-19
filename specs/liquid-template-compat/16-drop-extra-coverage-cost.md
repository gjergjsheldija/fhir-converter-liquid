# Spec 16: Drop the extra Coverage costToBeneficiary

**Status:** Done (2026-11-19). The extra element came from the second `Resource/Coverage` render (`ADT_A01.liquid` line 695, `IN2` include, no `IN1`): `DataType/_IDCoding` tested `{% if ID.3 %}` with `ID` bound to the Coverage id string, LiquidJS read `ID.3` as a character and emitted a bare `http://example.com/v2-to-fhir-converter/CodeSystem/` coding; the merger's concat-and-dedup then kept it as index 1. Numeric keys on strings now read as nil like DotLiquid. `classification.json`: 31 pass, 0 count, 101 content; none of the 33 lists `costToBeneficiary.1`; no pass was lost. Follow `.agents/skills/fhir-template-compat/SKILL.md` and `AGENTS.md`. Spec 15 is Done. Fix only this Coverage difference.

## 1. Goal

Thirty-three official cases differ first at `Coverage.costToBeneficiary[1]`. After this change, none of those cases still lists `costToBeneficiary.1` in `contentDelta`. Cases that already pass stay passing. `summary.count` stays 0.

## 2. Verified set

From `classification.json` on `main` at `1223883`. Every content row whose `contentDelta.fields[0].paths[0]` is `costToBeneficiary.1` is in this set. There are 33, and every field key starts with `Coverage/`. The first cases are `ADT-A01-01.hl7` through `ADT-A07-01.hl7`, all with Coverage id `dfab6985-a691-c4f5-d2b2-6481fdfd59e4`. Read the full set from that file. Do not hard-code the filenames in the engine.

The expected bundle for `ADT-A01-01` has one `costToBeneficiary` on that Coverage: type code `DC` (`http://terminology.hl7.org/CodeSystem/v2-0205`), value 150, currency `USD`. `Resource/_Coverage.liquid` writes a single object in that array from `IN1.37`. Why the actual resource has a difference at index 1 is not known yet. Trace `ADT-A01-01.hl7` / `ADT_A01` and print the actual and expected `costToBeneficiary` arrays before editing. The resource merger in `src/lib/outputProcessor/resourceMerger.js` combines repeated renders of the same id. Do not assume it is the cause.

## 3. Files you may edit

- Engine code under `src/lib/liquid-converter/**`, `src/lib/outputProcessor/**`, and `src/lib/parsers/hl7v2/**`, plus a focused unit test next to the code you change
- `.agents/skills/fhir-template-compat/PROJECT_CONTEXT.md` with the verified result
- `test/e2e-test/liquid-regression/classification.json` by re-running the classifier
- Section 7 of `specs/liquid-template-compat/13-classify-content-diffs.md`
- This spec's `**Status:**` line and a spec 16 bullet in `specs/ORDER.md`

Do not edit any `*.liquid` file, samples, expected fixtures, `compare.js`, or the classifier's status rules and same-instant rule. Do not add a dependency.

## 4. Requirements

1. Record the actual and expected `costToBeneficiary` arrays for Coverage `dfab6985-a691-c4f5-d2b2-6481fdfd59e4` before changing code. Name the render or merge step that adds the extra element.
2. Change that engine behavior. Do not delete every `costToBeneficiary`, and do not special-case these filenames or this Coverage id.
3. Re-run `node test/e2e-test/liquid-regression/classify-diffs.mjs`.
4. Stop and do not merge if any of these become true:
   - You cannot name the step that creates index 1.
   - Any of the 33 cases still lists `costToBeneficiary.1`.
   - Any case that was `pass` at `1223883` becomes `count` or `content`.
   - Any case gains a non-empty `byType` count delta.
   - `summary.pass` drops below 29 or `summary.count` is not 0.

A case in the 33 may remain `content` because of another path. Another signature may improve when this same change fixes it. A new count delta is not allowed.

## 5. Validation

```sh
npx mocha --no-package --no-config <the new unit test> --exit --timeout 10000
node test/e2e-test/liquid-regression/classify-diffs.mjs
node scripts/test-summary.mjs
```

The summary must show 0 unexpected failures. ESLint and `git diff --check` must pass. Use `--no-package --no-config` for a single mocha file.

## 6. Acceptance criteria

- None of the 33 cases lists `costToBeneficiary.1`.
- `summary.pass` is at least 29 and `summary.count` is 0.
- No previously passing case regressed.
- No Liquid template, sample, or expected fixture was modified.
- Status and `specs/ORDER.md` say Done with the date, the step that added index 1, and the new pass/count/content totals.
