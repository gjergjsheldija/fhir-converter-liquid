# Spec 10: Official C-CDA expected outputs

**Status:** Blocked (2026-11-20). Upstream has 22 official C-CDA expected files, but this engine's output differs from all 22 (see "Evidence"). The spec forbids editing templates to fix a mismatch, so nothing was synced or committed. Follow `.agents/skills/fhir-template-compat/SKILL.md`, `.agents/skills/spec-runner/SKILL.md`, `.agents/skills/test-baseline/SKILL.md`, and `AGENTS.md`. Do not start another gap spec in this change.

## 1. Goal

HL7 v2 has 132 pinned expected bundles. C-CDA has the pinned templates and no official expected JSON. This spec adds those expected files only by syncing them from the same Microsoft commit. If that commit has none, stop. Do not generate expected JSON from this engine.

## 2. Current behavior

- `scripts/sync-upstream-assets.js` syncs `ccda-templates` from `data/Templates/Ccda` at tag `v7.0`, commit `253307fe6063a42b024ef7dbeb6aae157f1c2f61`.
- The `expected-results` asset syncs HL7 v2 expected JSON only.
- One synthetic sample converts through `CCD.liquid`. There is no C-CDA entry in the official regression suite.
- `src/templates/Ccda/**` is already vendored. Do not hand-edit those files.

## 3. Files you may edit

- `scripts/sync-upstream-assets.js` to add an asset only if the upstream path exists
- The Makefile target that runs that asset
- A new regression test that reads the synced expected files
- This spec's `**Status:**` line, the row in `specs/gap/00-order.md`, and the bullet in `specs/ORDER.md`

Do not edit `src/templates/Ccda/**` by hand. Do not edit HL7 v2 expected fixtures. Do not add a dependency.

## 4. Requirements

1. At the pinned commit, look for a directory of C-CDA expected JSON. Check `data/SampleData/Ccda` and any sibling of the HL7 v2 expected-results path whose name contains `Ccda`.
2. If no such directory contains `.json` files, stop. Set this spec's status to **Blocked** and write the paths you listed. Do not create expected JSON, and do not convert a sample to manufacture one.
3. If a directory exists, add a sync asset that copies those files and only those files. The destination is `test/e2e-test/ccda-fixtures/Expected/`. The sync must verify the pinned commit the same way the other assets do.
4. Add one test that converts each synced pair through the template the upstream fixture names. Compare with `compareContent`. A missing template name in the fixture is a failure, not a skip.
5. HL7 v2 classification stays 132 pass / 0 count / 0 content. A C-CDA mismatch is a failure of this spec, not a reason to edit a template.

## 5. Validation

Run the new sync only after step 2 finds files. Then:

```sh
npx mocha --no-package --no-config test/e2e-test/ccda-fixtures/ccda-regression.spec.js --exit --timeout 20000
node scripts/test-summary.mjs
```

If step 2 finds no files, do not run a new suite. Report the search paths and leave the status Blocked.

## 6. Acceptance criteria

- Either the expected files are byte-copies of the pinned commit, or the spec is Blocked and no expected file was added.
- No C-CDA Liquid file was hand-edited.
- HL7 v2 official results are unchanged.
- Status, `specs/gap/00-order.md`, and `specs/ORDER.md` say Done or Blocked with the date and the evidence.

## 7. Git

Branch from current `main`: `feat/gap-10-ccda-expected`. One commit, then merge into `main`, only when the sync found upstream files. A Blocked result is committed as the spec status change only. Push with `gh auth switch --user gjergjsheldija`, then `git push origin main`, then `gh auth switch --user gjergjsheldija-recare`. Do not force-push.

## 8. Evidence (2026-11-20)

Pinned tag `v7.0`, commit `253307fe6063a42b024ef7dbeb6aae157f1c2f61`, fetched with the same `git fetch --depth=1` the sync script uses. Paths checked:

- `data/SampleData/Ccda/` has 22 `.ccda` inputs and no `.json` files.
- `src/Microsoft.Health.Fhir.Liquid.Converter.FunctionalTests/TestData/Expected/` has `Ccda`, `Hl7v2`, `Json`, and `Stu3ToR4`.
- `src/Microsoft.Health.Fhir.Liquid.Converter.FunctionalTests/TestData/Expected/Ccda/` is the HL7 v2 expected-results sibling. It has 22 `*-expected.json` files in the template folders `CCD` (4), `ConsultationNote` (4), `DischargeSummary` (2), `HistoryandPhysical` (2), `OperativeNote` (2), `ProcedureNote` (2), `ProgressNote` (2), `ReferralNote` (2), and `TransferSummary` (2).
- Upstream `BaseConvertDataFunctionalTests.GetDataForCcda()` names each pair: template folder, `<name>.ccda`, `<name>-expected.json`.

So the expected JSON exists. The blocker is the comparison, not the sync. A trial sync (`ccda-expected-results` to `test/e2e-test/ccda-fixtures/Expected/` and `ccda-samples` to `test/e2e-test/ccda-fixtures/SampleData/`, both byte-verified by the script) plus a `compareContent` test over the 22 pairs through `POST /api/v1/convert/ccda` gave 1 passing (the file-count check) and 22 failing. Using `classify-diffs.mjs`, 0 pairs match, 0 differ in entry count, and 22 differ in content. Recurring paths: `status` on `DiagnosticReport`, `Observation`, `MedicationStatement`, and `Immunization`; `address.0.use`, `telecom.0.use`, and `telecom.0.value` on `Organization`; `clinicalStatus.coding.0.code` on `AllergyIntolerance`; and `Patient` `gender`, `name.0.use`, and `communication.0.language.*`. Each bundle also has unmatched resources. The trial files were removed, and no template, HL7 v2 fixture, or other fixture was edited.

## 9. Open decision

Decide whether to (a) open a compatibility spec to find why the C-CDA engine output differs (likely code-system or ValueSet lookup, because the differing fields are coded fields), then redo this spec, or (b) accept the 22 as a recorded baseline classification like the HL7 v2 `classification.json`. Do not edit `src/templates/Ccda/**` to settle this.
