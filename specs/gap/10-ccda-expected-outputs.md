# Spec 10: Official C-CDA expected outputs

**Status:** Not started (2026-11-20). Follow `.agents/skills/fhir-template-compat/SKILL.md`, `.agents/skills/spec-runner/SKILL.md`, `.agents/skills/test-baseline/SKILL.md`, and `AGENTS.md`. Do not start another gap spec in this change.

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
