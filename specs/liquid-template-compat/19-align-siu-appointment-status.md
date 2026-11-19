# Spec 19: Align SIU Appointment status

**Status:** Done (2026-11-19). Actual `Appointment.status`: absent (`type_sch` is the number 15; `== "15"` was false in LiquidJS); expected: `cancelled`; fixed by DotLiquid number/string equality (`dotLiquidEquality.js`); classification is 96 pass, 0 count, 36 content. Follow `.agents/skills/fhir-template-compat/SKILL.md` and `AGENTS.md`. Spec 18 is Done. Fix only this Appointment status.

## 1. Goal

Eight official cases differ first at `Appointment.status`. After this change, none of those cases still lists that path. Cases that already pass stay passing. `summary.count` stays 0.

## 2. Verified set

From `classification.json` on `main` at `0ca8c87`. Every content row whose `contentDelta.fields[0]` is an `Appointment` and whose first path is `status` is in this set. There are 8. The representative is `SIU-S15-01.hl7` / `SIU_S15`, Appointment `b7121f46-cf50-5cec-7cfb-5de8e42b82d2`. The expected status is `cancelled`.

`Resource/_Appointment.liquid` sets `cancelled` when `type_sch` is `"15"` or `"16"`, `entered-in-error` when it is `"17"`, and `noshow` when it is `"26"`. Otherwise, when `SCH` is present and `type_sch` is absent, it uses `SCH.25` or `"booked"`. What the actual status is, and what `type_sch` is during that render, is not known yet. Trace this message before editing. Six other SIU cases lead with `supportingInformation.1.reference`. They may improve if this is the same cause. Do not require that.

## 3. Files you may edit

- Engine code under `src/lib/liquid-converter/**` and `src/lib/parsers/hl7v2/**`, plus a focused unit test next to the code you change
- `.agents/skills/fhir-template-compat/PROJECT_CONTEXT.md` with the verified result
- `test/e2e-test/liquid-regression/classification.json` by re-running the classifier
- Section 7 of `specs/liquid-template-compat/13-classify-content-diffs.md`
- This spec's `**Status:**` line and a spec 19 bullet in `specs/ORDER.md`

Do not edit any `*.liquid` file, samples, expected fixtures, `compare.js`, or the classifier's status and same-instant rules. Do not add a dependency.

## 4. Requirements

1. Record the actual and expected `Appointment.status` for that resource, and the value of `type_sch` seen by the template, before changing code.
2. Change the engine behavior that selects the wrong status. Do not hard-code `cancelled`, this Appointment id, or these filenames.
3. Re-run `node test/e2e-test/liquid-regression/classify-diffs.mjs`.
4. Stop and do not merge if any of these become true:
   - You cannot name the value that selects the actual status.
   - Any of the 8 cases still lists `status` as an Appointment path in `contentDelta.fields`.
   - Any case that was `pass` at `0ca8c87` becomes `count` or `content`.
   - Any case gains a non-empty `byType` count delta.
   - `summary.pass` drops below 93 or `summary.count` is not 0.

A case in the 8 may remain `content` because of another path. The supporting-information signature may improve. A new count delta is not allowed.

## 5. Validation

```sh
npx mocha --no-package --no-config <the new unit test> --exit --timeout 10000
node test/e2e-test/liquid-regression/classify-diffs.mjs
node scripts/test-summary.mjs
```

The summary must show 0 unexpected failures. ESLint and `git diff --check` must pass. Use `--no-package --no-config` for a single mocha file.

## 6. Acceptance criteria

- None of the 8 cases lists Appointment `status` in `contentDelta.fields`.
- `summary.pass` is at least 93 and `summary.count` is 0.
- No previously passing case regressed.
- No Liquid template, sample, or expected fixture was modified.
- Status and `specs/ORDER.md` say Done with the date, the actual-versus-expected status, and the new pass/count/content totals.
