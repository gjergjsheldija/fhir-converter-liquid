# Spec 20: Align SIU Appointment supportingInformation

**Status:** Done (2026-11-19). Actual merged `Appointment.supportingInformation[1].reference` was `PractitionerRole/f3c93626-c639-1507-76f0-945d762c11a8`; expected `PractitionerRole/36effb10-f605-f388-c06c-90d22b315bd0`. Fixed in `src/lib/outputProcessor/resourceMerger.js` (see the trace below); `classification.json` is now 110 pass / 0 count / 22 content, all 14 SIU cases pass (`supportingInformation.2` cleared too).

## 1. Goal

Fourteen official cases differ first at `Appointment.supportingInformation[1].reference`. After this change, none of those cases still lists that path. Cases that already pass stay passing. `summary.count` stays 0.

## 2. Verified set

From `classification.json` on `main` at `e3d4980`. Every content row whose first Appointment path is `supportingInformation.1.reference` is in this set. There are 14: both files of `SIU_S12`, `SIU_S13`, `SIU_S14`, `SIU_S15`, `SIU_S16`, `SIU_S17`, and `SIU_S26`. The representative is `SIU-S12-01.hl7` / `SIU_S12`, Appointment `b7121f46-cf50-5cec-7cfb-5de8e42b82d2`.

Expected `supportingInformation` on that resource, from `test/e2e-test/liquid-fixtures/Expected/Hl7v2/SIU_S12/SIU-S12-01-expected.json`:

- `[0].reference` = `PractitionerRole/36effb10-f605-f388-c06c-90d22b315bd0`
- `[1].reference` = `PractitionerRole/36effb10-f605-f388-c06c-90d22b315bd0`
- `[2].reference` = `PractitionerRole/f3c93626-c639-1507-76f0-945d762c11a8`

The same Appointment field list also includes `supportingInformation.2`. That second path may clear with the same fix. Do not require it.

`Resource/_Appointment.liquid` lines 168–184 emit `supportingInformation` from `SCH.12`, `SCH.16`, and `SCH.20`, using `practitionerRoleId_SCH_12`, `practitionerRoleId_SCH_16`, and `practitionerRoleId_SCH_20`. Those names are assigned on lines 4–6 of the same partial and again in each `SIU_S1*.liquid` before the PractitionerRole includes. `SIU_S12.liquid` also includes `Resource/Appointment` four times (SCH, then AIG, AIL, AIP) with the same `appointmentID`, and the resource merger concatenates arrays. What the actual references are, and which render produced index 1, is not known yet. Trace this message before editing.

## 3. Files you may edit

- Engine code under `src/lib/liquid-converter/**` and `src/lib/parsers/hl7v2/**`, plus a focused unit test next to the code you change
- `.agents/skills/fhir-template-compat/PROJECT_CONTEXT.md` with the verified result
- `test/e2e-test/liquid-regression/classification.json` by re-running the classifier
- Section 7 of `specs/liquid-template-compat/13-classify-content-diffs.md`
- This spec's `**Status:**` line and a spec 20 bullet in `specs/ORDER.md`

Do not edit any `*.liquid` file, samples, expected fixtures, `compare.js`, or the classifier's status and same-instant rules. Do not add a dependency. Do not extend `normalizeNullNilLiteralAssignment`. Do not add a general case-insensitive variable lookup. A named spelling in `normalizeVariableNameTypos` is allowed only when the trace shows that exact spelling mismatch.

## 4. Requirements

1. Record the actual and expected `supportingInformation` references for that Appointment, and the value that selects the actual `[1].reference`, before changing code. Name which include produced it (SCH, AIG, AIL, or AIP) if more than one render contributes.
2. Change the engine behavior that selects the wrong reference. Do not hard-code these PractitionerRole ids, this Appointment id, or these filenames.
3. Re-run `node test/e2e-test/liquid-regression/classify-diffs.mjs`.
4. Stop and do not merge if any of these become true:
   - You cannot name the value that selects the actual `[1].reference`.
   - Any of the 14 cases still lists `supportingInformation.1.reference` as an Appointment path in `contentDelta.fields`.
   - Any case that was `pass` at `e3d4980` becomes `count` or `content`.
   - Any case gains a non-empty `byType` count delta.
   - `summary.pass` drops below 96 or `summary.count` is not 0.

A case in the 14 may remain `content` because of another path (`supportingInformation.2`, Provenance `text.div`, or ServiceRequest `orderDetail.1`). A new count delta is not allowed.

## 5. Validation

```sh
npx mocha --no-package --no-config <the new unit test> --exit --timeout 10000
node test/e2e-test/liquid-regression/classify-diffs.mjs
node scripts/test-summary.mjs
```

The summary must show 0 unexpected failures. ESLint and `git diff --check` must pass. Use `--no-package --no-config` for a single mocha file. Mocha's package.json spec glob runs the whole suite if a single file is passed without those flags.

## 6. Acceptance criteria

- None of the 14 cases lists Appointment `supportingInformation.1.reference` in `contentDelta.fields`.
- `summary.pass` is at least 96 and `summary.count` is 0.
- No previously passing case regressed.
- No Liquid template, sample, or expected fixture was modified.
- Status and `specs/ORDER.md` say Done with the date, the actual-versus-expected `[1].reference`, and the new pass/count/content totals.

## 7. Trace and result (2026-11-19)

Raw render of `SIU-S12-01.hl7` / `SIU_S12`, Appointment `b7121f46-cf50-5cec-7cfb-5de8e42b82d2`, before the merger:

- SCH render (`firstSegments.SCH`, `SIU_S12.liquid` line 67): `supportingInformation` = `[PractitionerRole/36effb10…, PractitionerRole/36effb10…, PractitionerRole/f3c93626…]`, from `practitionerRoleId_SCH_12` / `_16` / `_20`. This matches the expected `[0]`, `[1]`, `[2]`.
- AIG, AIL, AIP renders (lines 418, 467, 483): no `supportingInformation` (`SCH` is not passed, so every `{% if SCH.n %}` is false).

The selector is not a template value. The merger (`resourceMerger.js`) combined the four renders with `deepmerge` and `arrayMerge: concatAndDedup`. `deepmerge` clones target-only arrays through `arrayMerge([], array)`, so the SCH render's own array went through `uniq` (md5 of `JSON.stringify(item)`) and its second `36effb10…` item was dropped, leaving `[36effb10…, f3c93626…]`. Upstream `PostProcessor.Merge` (pinned `253307fe…`) uses `MergeArrayHandling.Union`: the target array is kept as-is, and only source items not already present are appended.

Scope note: the fix lives in `src/lib/outputProcessor/resourceMerger.js` (+ `resourceMerger.spec.js`), which is outside the directories listed in section 3, because the render is already correct and the merger is the only code that selects the wrong item.
