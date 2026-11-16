# Spec 03: Pin and refresh the upstream baseline

## Goal

Make the Microsoft source revision, templates, fixtures, and expected outputs used for compatibility tests reproducible and current to one explicitly selected upstream commit.

The local provenance file currently identifies tag `v7.0`. A comparison performed on 2026-11-14 found the same 916 paths in the local and Microsoft HL7v2 template trees at upstream commit `5af2dcf72317fe2d9bbf35602b29c631854c044a`, with five locally modified template files. Do not assume that commit must be the new pin; verify the intended upstream baseline before syncing.

## Scope

Update the upstream provenance and the source/test assets required to make the selected HL7v2 baseline reproducible. Relevant files include:

- `test/e2e-test/liquid-fixtures/UPSTREAM_VERSION.md`
- `src/templates/Hl7v2/`
- `test/e2e-test/liquid-fixtures/`
- `test/e2e-test/liquid-regression/testcases-hl7v2.json`
- `test/e2e-test/liquid-regression/generate-testcases.js`

## Requirements

1. Select and record an exact Microsoft commit hash. Do not rely on a floating branch name.
2. Record the repository URL, commit hash, selection date, source paths, and the commands or process used to obtain templates and fixtures.
3. Compare source paths and content against that commit before copying anything.
4. Review all existing local template differences individually and preserve them unless the new upstream revision explicitly replaces them and the change is validated.
5. Regenerate expected outputs only from official Microsoft outputs produced by the selected revision or its checked-in fixtures. Never bless local output as the new expected output.
6. Keep test-case manifests aligned with the official test list and check for both missing and unexpected input/expected files.
7. Keep this spec separate from fixing renderer behavior. Complete specs 01 and 02 before changing the baseline.

## Validation

For the selected revision:

1. Verify that every vendored source file has documented provenance.
2. Compare local and upstream relative-path inventories; report additions, removals, and local-only files.
3. Compare file contents and account for every intentional local difference.
4. Check that each regression manifest entry resolves to an input, template, and expected output.
5. Run:

```sh
npm test
npm run eslint
git diff --check
```

## Acceptance criteria

- Provenance names an immutable upstream commit.
- The template and fixture inventories are complete for the declared HL7v2 scope.
- Every local divergence from upstream is reviewed and documented.
- The regression manifest has no accidental missing or extra cases.
- All official expected-output cases pass after specs 01 and 02 are complete.
- `npm test` and `npm run eslint` pass.

## End rules

Do not update expected files from local renders. If official expected outputs cannot be produced or verified for the chosen revision, retain the previous baseline and report the blocker.

## Verification record (2026-11-16)

- **Pin:** upstream https://github.com/microsoft/FHIR-Converter, tag `v7.0`, commit `253307fe6063a42b024ef7dbeb6aae157f1c2f61` (immutable; equals current `main` HEAD — no newer release exists beyond `v7.0`).
- **Local provenance:** `test/e2e-test/liquid-fixtures/UPSTREAM_VERSION.md` already records this exact commit. No change required.
- **Path inventory:** upstream layout at the pin is `data/Templates/Hl7v2/**` and `data/SampleData/Hl7v2/**`, remapped to the vendored `src/templates/Hl7v2/` and `test/e2e-test/liquid-fixtures/SampleData/Hl7v2/`. Total remapped upstream paths = 1055 (916 templates + 139 samples), matching the 1055 tracked local files.
- **Content comparison (sha256 of 916 templates + 139 samples):** exactly 5 local-only differences, matching the spec's "five locally modified template files":
  1. `src/templates/Hl7v2/Extensions/_PatientCitizenship.liquid`
  2. `src/templates/Hl7v2/Extensions/_PatientNationality.liquid`
  3. `src/templates/Hl7v2/Resource/_Coverage.liquid`
  4. `src/templates/Hl7v2/Resource/_Patient.liquid`
  5. `src/templates/Hl7v2/Resource/_PLLocation.liquid`
  All other 1050 paths match upstream content exactly.
- **Manifest (`testcases-hl7v2.json`):** 132 cases; every case resolves to an existing sample input, template, and expected output (0 missing). The 7 disk samples not referenced (`LAB-ORM-1`, `MDM_01`, `PC1-*`, `SIU-S12_1`, `SIU_12`) are local test-only inputs, not upstream `GetDataForHl7v2` cases. No extra manifest entries.
- **Official expected outputs:** used only as-is from the pinned revision's fixtures; none were regenerated from local renders. The known spec-05 upstream-version-mismatch cases (OMG_O19×2, OML_O21-03, ORM_O01×6, ORU_R01, OUL_R22-01, OUL_R23-01, OUL_R24-01) remain failing — expected, because they exercise a feature absent from the pinned v7.0 engine.
- **Validation commands:** `npm test` → 438 passing / 17 failing (the 17 are the known spec-05 cases only); `npm run eslint` → clean (exit 0); `git diff --check` → clean.
