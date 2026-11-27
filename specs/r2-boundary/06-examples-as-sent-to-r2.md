# 06 — Examples as sent to R2

**Status:** Done (2026-11-27)

## Problem
The 03 examples showed raw converter output (`batch`, no `entry.request`), not what R2 receives. Messages 02–04 fell back to the built-in templates, so R2 would get very different resource sets for one stay. The PDF sat in `DiagnosticReport.presentedForm`, and a missing `PID-3` produced an `UNKNOWN-MRN` patient instead of an error.

## Decisions
- Delivery mode is `conditional_update`; conditional create would drop A08/A03 changes.
- First-case resource set: `Patient`, `Encounter`, plus `DocumentReference` for MDM. No MessageHeader, Provenance, Organization or Location until R2-1967 asks for them.

## Changes
- `customers/example-hospital/input/`: `ADT_A01` rewritten, and `ADT_A08`, `ADT_A03`, `MDM_T02` added, sharing partials in `R2/` (`_BundleHeader`, `_Patient`, `_Encounter`). PV1-2 is mapped to valid v3 ActCode classes, and `PV1-44/45` drive `Encounter.period` and `status`.
- `MDM_T02`: the PDF goes in `DocumentReference.content[0].attachment`, keyed on `TXA-12` with `document-id`, and linked to Patient and Encounter.
- `src/lib/customers/inboundCorrelation.js` + spec: inbound `422` for an empty `MSH-10`, `PID-3`, `PV1-19` (when PV1 is present) or `TXA-12` (when TXA is present), enforced unless `requireCorrelationIds: false`.
- `scripts/build-r2-examples.mjs`: writes `sent.json` per example using `conditionalUpdate`/`conditionalTransaction` from `sendResource.js`, and adds `07-missing-identifier`. The drift test covers both files.
- The documents (`mapper-to-r2.md`, `identifiers.md`, `flows.md`, the example READMEs) were updated to match.
- Tests: `customers.spec.js` now expects four reference templates, and `bidirectional-and-customers.spec.js` copies the `R2/` partials alongside `ADT_A01`.

## Acceptance
- [x] Every first-case example emits the same minimal resource set.
- [x] `sent.json` is generated, not hand-written, and drift-checked.
- [x] The PDF is in `DocumentReference.content`.
- [x] 06 = 400 (parse), 07 = 422 (missing identifier).
