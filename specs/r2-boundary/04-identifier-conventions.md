# Spec 04: Identifier Conventions for R2 Conditional Create & Deduplication

**Status:** Done (2026-11-27). Deliverable `docs/r2-contract/identifiers.md` derived strictly from `customers/example-hospital/config.yaml`, `src/lib/customers/customerConfig.js`, `src/lib/projects/sitePack.js`, `src/lib/fhir/sendResource.js`, `src/lib/parsers/fhir/fhir.js`, and `docs/r2-contract/examples/`. No code changes.

## 1. Goal

Document stable identifier conventions (`docs/r2-contract/identifiers.md`) so R2 can reliably deduplicate and execute conditional create/update against emitted FHIR resources, derived strictly from existing code and examples without inventing unimplemented behavior.

## 2. Current behavior (verified from code)

- `customers/example-hospital/config.yaml` defines `identifiers.mrnSystem`, `visitNumberSystem`, `documentIdSystem`, `assigningAuthority`, `assigningAuthorityUniversalId`, and `assigningAuthorityUniversalIdType`. `src/lib/customers/customerConfig.js` normalizes `mrnSystem` ↔ `patientMrnSystem` and injects them into Liquid `customerContext`.
- `src/lib/projects/sitePack.js` loads optional `{customerDir}/identifiers.json` and rewrites `Identifier.system` (including `masterIdentifier`) by type code (`MR`, `VN`, etc.), `assigner.display`, existing `system`, or wildcard `*`. `customers/example-hospital/` has no `identifiers.json` today, so built-in fallback templates (`ADT_A08`, `MDM_T02`, `ADT_A03`) emit upstream `http://example.com/v2-to-fhir-converter/Identifier/<CX-4>` systems.
- `src/lib/fhir/sendResource.js` keys conditional create/update solely on `entry.resource.identifier[0]` (requiring non-empty `system` and `value`).
- `requireCorrelationIds` (`src/lib/parsers/fhir/fhir.js`) enforces `PID-3` and `PV1-19` with HTTP `422` (`MissingCorrelationId`) on **outbound** FHIR→HL7 v2 only; inbound HL7 v2→FHIR has no equivalent enforcement today.

## 3. Files you may edit

- `specs/r2-boundary/00-order.md`
- `specs/r2-boundary/04-identifier-conventions.md`
- `specs/ORDER.md`
- `docs/r2-contract/identifiers.md`

No code changes unless a test is needed to pin down existing behavior.

## 4. Requirements

`docs/r2-contract/identifiers.md` must cover:
1. Every identifier R2 sees (Patient MRN, Encounter visit/case number, DocumentReference document ID, plus Bundle MSH-10 and Organization identifiers emitted by code): HL7 v2 source field, FHIR element, per-customer system URI construction, and concrete example from `docs/r2-contract/examples/`.
2. How assigning authority (`CX-4`) maps to `system` (in custom templates, built-in templates, and `identifiers.json` site-pack rules), and what happens when `CX-4` is missing or unknown.
3. Uniqueness scope (per customer vs global) and what happens when two hospitals under one customer reuse an MRN.
4. Which identifiers are required for conditional create and what the mapper does when they are missing (contrasting inbound behavior with outbound `requireCorrelationIds` HTTP `422`).
5. A short "Rules for adding a new customer" checklist.
6. Explicitly mark everything not enforced in code as an open question.

## 5. Validation

- `git diff --check`
- Verify every citation matches `customers/example-hospital/config.yaml`, `src/lib/customers/customerConfig.js`, `src/lib/projects/sitePack.js`, `src/lib/fhir/sendResource.js`, `src/lib/parsers/fhir/fhir.js`, and `docs/r2-contract/examples/*/output.json`.

## 6. Acceptance criteria

- `docs/r2-contract/identifiers.md` covers all 5 sections with zero invented behavior and clear open questions for unimplemented enforcement.
- Status updated in this spec, `specs/r2-boundary/00-order.md`, and `specs/ORDER.md`.
