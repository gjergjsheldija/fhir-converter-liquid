# C-CDA specs

These specs add C-CDA conversion and make the editor treat a C-CDA document the way it treats an HL7 v2 message. HL7 v2 behavior stays.

## Rules

1. Implement one numbered spec per change.
2. Edit only the files listed in the selected spec.
3. Do not hand-edit files under `src/templates/`. A C-CDA template sync uses `scripts/sync-upstream-assets.js` only, and only the Ccda asset.
4. Do not edit `src/sample-data/**` or `test/e2e-test/liquid-fixtures/**`.
5. Do not add a dependency.
6. Do not commit unless the user explicitly asks.

## Order

| Spec | Status | File | What it changes |
| --- | --- | --- | --- |
| 01 | Done | `01-convert-ccda.md` | Sync the pinned Ccda templates and convert a C-CDA document through `msg.ClinicalDocument`. |
| 02 | Not started | `02-cda-message-coloring-and-parsed-tree.md` | Color the C-CDA message and show its parsed tree in the Debug drawer. |
| 03 | Not started | `03-cda-debug-and-send.md` | Hover values, expected diff, Validate, and conditional Send work for a C-CDA result. |
