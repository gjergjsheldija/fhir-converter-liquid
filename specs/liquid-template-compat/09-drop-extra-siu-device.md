# Spec 09: Drop the extra SIU Device

**Status:** Done (2026-11-19). The extra `Device` came from the `AIG` include path: the `NTE` under `AIG` re-includes `Resource/Device`, and `Resource/_Appointment.liquid` first re-ran `evaluate device_Id_AIG_3 using 'ID/Device' CWE: AIG.3`, which the `{% evaluate %}` tag rendered in an isolated scope (no `AIG`) and assigned `null`, clobbering the caller's id (upstream `Evaluate.cs` renders in `context.Stack`, so the partial sees the caller's variables). Fixed in `evaluate.js`; regenerated `classification.json`: 27 pass, 5 count, 100 content, no `Device` delta left. Follow `.agents/skills/fhir-template-compat/SKILL.md` and `AGENTS.md`. Spec 08 classified this family. Fix only this family.

## 1. Goal

The 14 official SIU cases below each emit one more `Device` than the pinned Microsoft v7.0 expected bundle. After this change, none of those cases has a `Device` count delta. Conversion of every other official case stays at least as close as `classification.json` on `main` at `382b9e0`.

## 2. Verified cases

From `test/e2e-test/liquid-regression/classification.json` at that commit. Each row is `status: "count"` with `byType` exactly `[{ "resourceType": "Device", "delta": 1 }]` (actual and expected counts differ by 1).

| Template | dataFile | actual | expected |
| --- | --- | --- | --- |
| SIU_S12 | SIU-S12-01.hl7 | 49 | 48 |
| SIU_S12 | SIU-S12-02.hl7 | 42 | 41 |
| SIU_S13 | SIU-S13-01.hl7 | 32 | 31 |
| SIU_S13 | SIU-S13-02.hl7 | 42 | 41 |
| SIU_S14 | SIU-S14-01.hl7 | 32 | 31 |
| SIU_S14 | SIU-S14-02.hl7 | 42 | 41 |
| SIU_S15 | SIU-S15-01.hl7 | 32 | 31 |
| SIU_S15 | SIU-S15-02.hl7 | 42 | 41 |
| SIU_S16 | SIU-S16-01.hl7 | 32 | 31 |
| SIU_S16 | SIU-S16-02.hl7 | 42 | 41 |
| SIU_S17 | SIU-S17-01.hl7 | 32 | 31 |
| SIU_S17 | SIU-S17-02.hl7 | 42 | 41 |
| SIU_S26 | SIU-S26-01.hl7 | 32 | 31 |
| SIU_S26 | SIU-S26-02.hl7 | 42 | 41 |

These entry templates include `Resource/Device` from `MSH.3`, from `OBX.18`, and from `AIG`. `Resource/_Appointment.liquid` also evaluates an id from `AIG.3`. Which of those emits the extra resource is not known yet. Trace `SIU-S12-01.hl7` / `SIU_S12` before editing.

## 3. Files you may edit

- Engine code under `src/lib/liquid-converter/**` and `src/lib/parsers/hl7v2/**`, plus a focused unit test next to the code you change
- `test/e2e-test/liquid-regression/classification.json` by re-running `node test/e2e-test/liquid-regression/classify-diffs.mjs`
- Section 7 of `specs/liquid-template-compat/08-classify-official-bundle-diffs.md`, so it matches the regenerated file
- This spec's `**Status:**` line and the spec 09 bullet in `specs/ORDER.md`

Do not edit any `*.liquid` file, `src/sample-data/**`, or `test/e2e-test/liquid-fixtures/**`. Do not add a dependency. Do not change `compare.js` or the classifier's rules.

## 4. Requirements

1. On `SIU-S12-01.hl7` with template `SIU_S12`, identify the one `Device` entry whose id is absent from the expected bundle. Record which include path emitted it (`MSH.3`, `OBX.18`, or `AIG`) in the status sentence.
2. Change the engine behavior that emits that extra resource. Do not drop every Device, and do not special-case these 14 filenames.
3. Re-run `node test/e2e-test/liquid-regression/classify-diffs.mjs` and commit the new `classification.json`.
4. Stop and do not merge if any of these become true:
   - You cannot name the include path and the engine difference that emits the extra Device.
   - Any of the 14 cases still has a `Device` delta.
   - Any case that was `pass` in the spec 08 file becomes `count` or `content`.
   - The other count families change their resource type or the sign of their delta: `ADT-A08-01.hl7` EpisodeOfCare +1, `ORM-O01-03.hl7` Account −1, `ORM-O01-06.hl7` MedicationRequest +1, `OUL-R23-01.hl7` and `OUL-R23-02.hl7` DiagnosticReport +1.
   - A previously passing official case fails `compareContent`.

A case in the 14 may remain `content` when its Device counts match and some other field still differs. That still meets this spec.

## 5. Validation

```sh
node test/e2e-test/liquid-regression/classify-diffs.mjs
npx mocha --no-package --no-config <the new unit test> --exit --timeout 10000
node scripts/test-summary.mjs
```

The summary must show 0 unexpected failures. ESLint and `git diff --check` must pass.

## 6. Acceptance criteria

- All 14 SIU rows have no `Device` entry in `byType`.
- `summary.pass` is greater than or equal to 27.
- The five non-SIU count rows listed in section 4 are unchanged.
- No Liquid template, sample, or expected fixture was modified.
- Status and `specs/ORDER.md` say Done with the date, the include path, and the new pass/count/content totals.
