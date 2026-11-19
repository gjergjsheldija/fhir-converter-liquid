# Spec 18: Align the SIU Appointment device participant

**Status:** Done (2026-11-19). Actual `participant[1].actor.reference` `Device/` vs expected `Device/0434a8f4-6ef0-5dc7-d1a1-91ad4b080b00` (variable `device_ID_AIG_3` is never assigned; the id is assigned as `device_Id_AIG_3`); `normalizeVariableNameTypos` maps it. Classification: 93 pass / 0 count / 39 content; the 14 cases no longer list `participant.1.actor.reference`. Follow `.agents/skills/fhir-template-compat/SKILL.md` and `AGENTS.md`. Spec 17 is Done. Fix only this Appointment reference.

## 1. Goal

Fourteen official SIU cases differ first at `Appointment.participant[1].actor.reference`. After this change, none of those cases still lists that path. Cases that already pass stay passing. `summary.count` stays 0.

## 2. Verified set

From `classification.json` on `main` at `508fd5c`. Every content row whose `contentDelta.fields[0].paths[0]` is `participant.1.actor.reference` and whose field key starts with `Appointment/` is in this set. There are 14: `SIU_S12`, `SIU_S13`, `SIU_S14`, `SIU_S15`, `SIU_S16`, `SIU_S17`, and `SIU_S26`, each with `*-01.hl7` and `*-02.hl7`. Every one of those rows names Appointment `b7121f46-cf50-5cec-7cfb-5de8e42b82d2`.

On the expected `SIU-S12-01` bundle, participant index 1 is `Device/0434a8f4-6ef0-5dc7-d1a1-91ad4b080b00`. `Resource/_Appointment.liquid` writes that actor as `Device/{{ device_ID_AIG_3 }}` when `AIG.3` is present. The id is evaluated elsewhere as `device_Id_AIG_3`. What the actual reference string is, and whether the spelling or the id input differs, is not known yet. Trace `SIU-S12-01.hl7` / `SIU_S12` and record the actual and expected `participant[1].actor.reference` before editing. Do not assume this is the spec 09 evaluate-scope bug. That fix stays.

## 3. Files you may edit

- Engine code under `src/lib/liquid-converter/**` and `src/lib/parsers/hl7v2/**`, plus a focused unit test next to the code you change
- `.agents/skills/fhir-template-compat/PROJECT_CONTEXT.md` with the verified result
- `test/e2e-test/liquid-regression/classification.json` by re-running the classifier
- Section 7 of `specs/liquid-template-compat/13-classify-content-diffs.md`
- This spec's `**Status:**` line and a spec 18 bullet in `specs/ORDER.md`

Do not edit any `*.liquid` file, samples, expected fixtures, `compare.js`, or the classifier's status and same-instant rules. Do not add a dependency.

## 4. Requirements

1. Record the actual and expected participant-1 actor reference for that Appointment before changing code. Name the variable or id input that produces the actual string.
2. Change that engine behavior. Do not hard-code `0434a8f4-6ef0-5dc7-d1a1-91ad4b080b00`, this Appointment id, or these filenames.
3. Re-run `node test/e2e-test/liquid-regression/classify-diffs.mjs`.
4. Stop and do not merge if any of these become true:
   - You cannot name the variable or id input that produces the actual reference.
   - Any of the 14 cases still lists `participant.1.actor.reference`.
   - Any case that was `pass` at `508fd5c` becomes `count` or `content`.
   - Any case gains a non-empty `byType` count delta.
   - `summary.pass` drops below 93 or `summary.count` is not 0.

A case in the 14 may remain `content` because of another path. Another signature may improve. A new count delta is not allowed.

## 5. Validation

```sh
npx mocha --no-package --no-config <the new unit test> --exit --timeout 10000
node test/e2e-test/liquid-regression/classify-diffs.mjs
node scripts/test-summary.mjs
```

The summary must show 0 unexpected failures. ESLint and `git diff --check` must pass. Use `--no-package --no-config` for a single mocha file.

## 6. Acceptance criteria

- None of the 14 cases lists `participant.1.actor.reference`.
- `summary.pass` is at least 93 and `summary.count` is 0.
- No previously passing case regressed.
- No Liquid template, sample, or expected fixture was modified.
- Status and `specs/ORDER.md` say Done with the date, the actual-versus-expected reference, and the new pass/count/content totals.
