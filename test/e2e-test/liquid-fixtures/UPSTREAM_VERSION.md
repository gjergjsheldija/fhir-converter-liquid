# Upstream pin

Templates and test fixtures in this tree (`src/templates/Hl7v2/`,
`test/e2e-test/liquid-fixtures/`) are vendored verbatim from
https://github.com/microsoft/FHIR-Converter at tag `v7.0`
(commit `253307fe6063a42b024ef7dbeb6aae157f1c2f61`).

Do not hand-edit vendored files. To re-sync with a newer upstream tag,
re-run the copy commands in
docs/superpowers/plans/2026-08-17-liquid-hl7v2-engine.md Task 1
against the new tag and update this file.
