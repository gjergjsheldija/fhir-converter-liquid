# Spec 13: Classify official content diffs by resource field

**Status:** Done (2026-11-19). `contentDelta` added; regenerated classification is still 132 cases, 29 pass, 0 count, 103 content, and every content row has a `contentDelta`. Follow `.agents/skills/fhir-template-compat/SKILL.md` and `AGENTS.md`. Spec 12 left 29 pass, 0 count, and 103 content. This spec records where the content differs. It does not fix it.

## 1. Goal

`compareContent` throws `different property: [entry.Array]` for a Bundle whose entries differ anywhere, because array comparison stops at the whole `entry` array. That message does not say which resource or field differs. Add a field-level signature for every `content` case and a grouped table of those signatures. Do not change conversion behavior, and do not change the pass, count, or content status rules.

## 2. Current behavior

`test/e2e-test/liquid-regression/classify-diffs.mjs` sets `status` from `compareContent` and `entryDelta`. On `main` at `7079066`, `classification.json` has `summary` `{ "cases": 132, "pass": 29, "count": 0, "content": 103 }`. Content rows have an empty `byType`. They do not name a resource id or a FHIR path.

## 3. Files you may edit

- `test/e2e-test/liquid-regression/classify-diffs.mjs`
- `test/e2e-test/liquid-regression/classify-diffs.spec.js`
- `test/e2e-test/liquid-regression/classification.json`, by re-running the classifier
- This spec's `**Status:**` line, section 7, and a spec 13 bullet in `specs/ORDER.md`

Do not edit `src/**`, `compare.js`, any `*.liquid` file, `src/sample-data/**`, or `test/e2e-test/liquid-fixtures/**`. Do not add a dependency.

## 4. Requirements

1. Export `contentDelta(actualBundle, expectedBundle)` from `classify-diffs.mjs`. Match `Bundle.entry` items by `resource.resourceType` plus `resource.id`. A missing id uses `(no id)`. If that key repeats, append `#2`, `#3`, and so on, in entry order, separately for each bundle. Return:

```json
{
  "unmatched": [{ "kind": "extra", "key": "Device/(no id)" }],
  "fields": [{ "key": "Patient/abc", "paths": ["gender", "name.0.family"] }]
}
```

`unmatched.kind` is `extra` when the key is only in the actual bundle and `missing` when it is only in the expected bundle. `fields` lists keys present in both bundles whose resources are not deep-equal. `paths` are dot paths relative to `resource`, array indexes are decimal segments, paths are sorted, and each resource keeps at most the first 8 paths. Omit resources with no differing paths. Sort `unmatched` and `fields` by `key`.

2. Extend `classify-diffs.spec.js` with three assertions and keep the existing `entryDelta` tests: two Patients with the same id and a different `gender` yield `fields: [{ key: "Patient/p1", paths: ["gender"] }]`; an actual-only Device with no id yields `unmatched: [{ kind: "extra", key: "Device/(no id)" }]`; two identical Patients yield empty `unmatched` and empty `fields`.

3. On each `content` row, set `contentDelta` to that return value. Omit `contentDelta` on `pass` and `count` rows. Do not change how `status` is chosen.

4. Re-run `node test/e2e-test/liquid-regression/classify-diffs.mjs`. The summary must stay exactly 132 cases, 29 pass, 0 count, 103 content. If it does not, stop and do not commit.

5. Fill section 7 from `classification.json`. One row per distinct first path (`fields[0].paths[0]` when `fields` is non-empty, otherwise the first `unmatched` key). Columns are the signature, the number of content cases, and one example `dataFile`. Sort by count descending. Do not estimate the rows.

## 5. Validation

```sh
npx mocha --no-package --no-config test/e2e-test/liquid-regression/classify-diffs.spec.js --exit --timeout 10000
node test/e2e-test/liquid-regression/classify-diffs.mjs
node scripts/test-summary.mjs
```

The full summary must show 0 unexpected failures. The 103 official compare failures stay. ESLint and `git diff --check` must pass.

## 6. Acceptance criteria

- The three new assertions pass, and the existing `entryDelta` assertions still pass.
- Every content row has a `contentDelta`, and no pass row has one.
- Summary counts are unchanged from section 2.
- Section 7 is filled from the file.
- No file under `src/`, `src/templates/`, `src/sample-data/`, or `test/e2e-test/liquid-fixtures/` changed.
- Status and `specs/ORDER.md` say Done with the date and the summary counts.

## 7. Content signatures

Filled by the implementer from `classification.json`. Do not leave this section as a placeholder when status is Done.

Refreshed from `classification.json` after spec 16: 132 cases, 31 pass, 0 count, 101 content.

| First path signature | Content cases | Example `dataFile` |
|---|---|---|
| `extension.7.extension.0.valueCodeableConcept.text` | 43 | ADT-A01-01.hl7 |
| `extension.5.extension.0.valueCodeableConcept.text` | 20 | ADT-A06-01.hl7 |
| `participant.1.actor.reference` | 14 | SIU-S12-01.hl7 |
| `dosageInstruction.0.patientInstruction` | 7 | ORM-O01-06.hl7 |
| `address.1` | 5 | ADT01-23.hl7 |
| `account.1` | 2 | DFT-P11-01.hl7 |
| `encounter` | 2 | IZ_1_1.1_Admin_Child_Max_Message.hl7 |
| `identifier.1` | 2 | OMG-O19-02.hl7 |
| `meta` | 2 | ADT-A60-01.hl7 |
| `account` | 1 | ORU-R01-01.hl7 |
| `identifier.1.system` | 1 | MDM-T02-03.hl7 |
| `presentedForm.0.contentType` | 1 | BAR-P12-01.hl7 |
| `text.div` | 1 | MDHHS-OML-O21-2.hl7 |
