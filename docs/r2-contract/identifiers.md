# Identifier Conventions (Mapper → R2)

> **Status:** Spec `specs/r2-boundary/04-identifier-conventions.md` (2026-11-27)
>
> **Sources verified in code:** `customers/example-hospital/config.yaml`, `customers/example-hospital/input/ADT_A01.liquid`, `src/lib/customers/customerConfig.js`, `src/lib/projects/sitePack.js`, `src/lib/fhir/sendResource.js`, `src/lib/parsers/fhir/fhir.js`, and generated outputs under `docs/r2-contract/examples/`. Anything not enforced in code today is marked as an **Open question**.

---

## 1. Identifiers Emitted to R2

| Identifier | HL7 v2 source field | FHIR element | System URI construction (Today in code) | Concrete example (`docs/r2-contract/examples/`) |
| --- | --- | --- | --- | --- |
| **Patient MRN** | `PID-3.1` (value), `PID-3.4` (`CX-4` assigning authority), `PID-3.5` (`CX-5` type code, e.g. `MR`) | `Patient.identifier[]` | **Custom template** (`customers/example-hospital/input/ADT_A01.liquid`): uses customer URI `https://fhir.example-hospital.org/sid/mrn` (mirrors `config.yaml` `identifiers.mrnSystem`, aliased to `patientMrnSystem` in `customerConfig.js`).<br>**Built-in fallback template** (`ADT_A08`, `MDM_T02`, `ADT_A03`): emits `http://example.com/v2-to-fhir-converter/Identifier/<CX-4>` unless rewritten by `{customerDir}/identifiers.json` (`sitePack.js`). | `01-admit/output.json`: `{ "system": "https://fhir.example-hospital.org/sid/mrn", "value": "SYN-MRN-0001", "type": { "coding": [{ "code": "MR" }] } }`<br>`03-document/output.json` (built-in fallback): `{ "system": "http://example.com/v2-to-fhir-converter/Identifier/EXHOSP", "value": "SYN-MRN-0001" }` |
| **Visit / Case Number** | `PV1-19.1` (value), `PV1-19.4` (`CX-4`), `PV1-19.5` (`VN`) | `Encounter.identifier[]` | **Custom template** (`ADT_A01.liquid`): uses `https://fhir.example-hospital.org/sid/visit-number` (mirrors `config.yaml` `identifiers.visitNumberSystem`).<br>**Built-in fallback template**: emits `http://example.com/v2-to-fhir-converter/Identifier/<CX-4>` unless rewritten by `{customerDir}/identifiers.json`. | `01-admit/output.json`: `{ "system": "https://fhir.example-hospital.org/sid/visit-number", "value": "SYN-VISIT-1001" }`<br>`03-document/output.json` (built-in fallback): `{ "system": "http://example.com/v2-to-fhir-converter/Identifier/EXHOSP", "value": "SYN-VISIT-1001" }` |
| **Document ID** | `TXA-12.1` (Unique Document Number) | `DocumentReference.masterIdentifier` (built-in `MDM_T02.liquid`) | **Config** declares `identifiers.documentIdSystem: https://fhir.example-hospital.org/sid/document-id`, but `customers/example-hospital/input/` has no `MDM_T02.liquid` and no `identifiers.json`. Built-in `MDM_T02.liquid` emits `masterIdentifier.value` with **no `system`** and **no `DocumentReference.identifier[]`**. `sitePack.js` (`isIdentifierContext`) recognizes keys ending in `Identifier` (including `masterIdentifier`), so an `identifiers.json` wildcard rule can stamp a `system`. | `03-document/output.json`: `"masterIdentifier": { "value": "SYN-DOC-9001" }` (no `system`) |
| **Message Control ID** | `MSH-10` | `Bundle.identifier` | **Custom template** (`ADT_A01.liquid`): `system: "https://fhir.example-hospital.org/sid/message-control-id"`, `value: "<MSH-10>"`.<br>**Built-in fallback templates**: emit `Bundle.identifier.value` with **no `system`**. | `01-admit/output.json`: `{ "system": "https://fhir.example-hospital.org/sid/message-control-id", "value": "SYN-MSG-0001" }`<br>`03-document/output.json`: `{ "value": "SYN-MSG-0003" }` |
| **Sending Facility / Organization** | `MSH-4` (built-in templates) | `Organization.identifier[]` | Built-in templates emit `{ "value": "<MSH-4>" }` with no `system` unless rewritten by `identifiers.json`. | `03-document/output.json`: `Organization.identifier[0] = { "value": "EXHOSP" }` |

**Important code observation (`config.yaml` vs `identifiers.json`):**
`config.yaml` `identifiers.*` values are injected into Liquid `customerContext` (`src/lib/customers/customerPipeline.js`), **not** automatically applied as post-processing rules. Post-processing of built-in template outputs happens **only** via `{customerDir}/identifiers.json` loaded by `loadSitePack(customer.customerDir)` (`src/lib/projects/sitePack.js`). Because `customers/example-hospital/` has no `identifiers.json` today, `01-admit` emits `https://fhir.example-hospital.org/sid/...` while `02-update`/`03-document`/`04-discharge` emit `http://example.com/v2-to-fhir-converter/Identifier/EXHOSP`.

---

## 2. How Assigning Authority (`CX-4`) Maps to `system`

### Today (code)

1. **Built-in upstream templates (`DataType/_CX.liquid`):**
   - When `CX-4` is present (e.g. `EXHOSP`), upstream templates emit `"system": "http://example.com/v2-to-fhir-converter/Identifier/EXHOSP"`.
   - When `CX-4` is missing, upstream templates omit `system` (or leave it empty).
2. **Site-pack `identifiers.json` (`src/lib/projects/sitePack.js`, `identifierSystemFor`):**
   Evaluated in strict precedence order for each Identifier object (matching `type.coding`, `assigner`, `identifier`, or `*Identifier` parent keys):
   1. **Type-specific by assigner or existing system** (for each `type.coding[].code`, e.g. `MR`, `VN`):
      - `"<code >@<assigner.display>"` (e.g. `"MR@EXHOSP"`)
      - `"<code>@<existingSystem>"` (e.g. `"MR@http://example.com/v2-to-fhir-converter/Identifier/EXHOSP"`)
      - `identifiers[code].bySystem[existingSystem]`
      - `identifiers[code].byAssigner[assigner.display]`
   2. **Type-specific default:**
      - String `identifiers[code]`: applied **only when `system` is missing/empty**.
      - Object `identifiers[code].default`: applied when `system` is missing/empty, **or** when `override: true`.
   3. **Wildcard `"*"` specific rules:** `*@<assigner.display>`, `*@<existingSystem>`, `identifiers["*"].bySystem`, `identifiers["*"].byAssigner`.
   4. **Wildcard `"*"` default:** `identifiers["*"]` (when missing) or `identifiers["*"].default` (when missing or `override: true`).
3. **When `CX-4` is missing or unknown:**
   - **Missing `CX-4`:** `existingSystem` is absent, so type-specific or wildcard default rules in `identifiers.json` fill in `system`. If no `identifiers.json` rule matches, `system` stays absent — and `sendResource.js` `firstValidIdentifier()` ignores identifiers without a non-empty `system`, falling back to unconditional `POST`.
   - **Unknown `CX-4`:** Built-in templates emit `http://example.com/v2-to-fhir-converter/Identifier/<unknownCX4>`. Because `hasSystem` is true, plain string defaults in `identifiers.json` do **not** overwrite it unless `override: true` is set; the unknown `example.com` URI passes through unchanged to R2.
   - **No rejection on unknown/missing `CX-4`:** Neither `sitePack.js` nor `customerPipeline.js` rejects an unknown or missing assigning authority. *(Open question below.)*

---

## 3. Uniqueness Scope (Per Customer vs Global)

- **Tenant boundary in the contract:** `{customerId}` is carried in the HTTP route (`POST {r2Base}/customers/{customerId}/bundles`), so R2 conditional lookups (`If-None-Exist` / conditional `PUT`) are **per-customer** (tenant-scoped).
- **Multi-hospital customer (same `customerId`, two hospitals reusing an MRN):**
  - If two hospitals under the same `customerId` share the **same** `system` URI (e.g. `https://fhir.example-hospital.org/sid/mrn`) and emit the same MRN value `12345`, a conditional lookup on `identifier={system}|12345` **will collide** and merge/overwrite the wrong patient in R2.
  - To avoid collisions within one customer, each hospital/facility assigning authority (`CX-4`) must map to a **distinct system URI** via `identifiers.json` (`MR@HOSP_A` / `bySystem` / `byAssigner`, e.g. `https://fhir.<customer>/sid/<facility>/mrn`).
  - **Not enforced in code (Open question):** The mapper does not validate system URI uniqueness across facilities or across customers.

---

## 4. Required Identifiers for Conditional Create & Missing-Identifier Behavior

### Today (code)

- **`sendResource.js` (`firstValidIdentifier`, `prepareTransactionEntries`):**
  - Conditional create (`If-None-Exist`) and conditional update (`PUT ?identifier=`) require `entry.resource.identifier[0]` to have **both** a non-empty string `system` and a non-empty string `value`.
  - **Update (spec 06):** the customer `input/MDM_T02.liquid` now puts `TXA-12` in `DocumentReference.identifier[0]` with `documentIdSystem`, so it is conditionally updated (`examples/03-document/sent.json`). The gap below applies only to the built-in fallback template.
  - **DocumentReference gap (built-in template only):** Built-in `MDM_T02.liquid` puts `TXA-12` in `DocumentReference.masterIdentifier.value` (not `identifier[0]`, and with no `system`), so `sendResource.js` currently sends unconditional `POST DocumentReference` instead of conditional create/update!
  - **When an identifier is missing:** `sendResource.js` does **not** fail; it silently falls back to unconditional `POST <ResourceType>`.
- **Alignment with `requireCorrelationIds` (`HTTP 422`):**
  - In `src/lib/parsers/fhir/fhir.js` (`postProcessResult`), `requireCorrelationIds: true` (default `true` in `customerPipeline.js`) enforces that **PID-3** (Patient MRN) and **PV1-19** (Visit/Case number) are non-empty, throwing `MissingCorrelationId` → **HTTP `422`**.
  - **Update (spec 06):** inbound now enforces this too. `runCustomerInbound` calls `findMissingInboundCorrelationIds` (`src/lib/customers/inboundCorrelation.js`) before conversion and returns **HTTP `422`** (`phase: "validation"`) when `MSH-10`, `PID-3`, `PV1-19` (if `PV1` is present) or `TXA-12` (if `TXA` is present) is empty. The `UNKNOWN-MRN` fallback is gone. See `examples/07-missing-identifier/`. The paragraph below describes the behavior before spec 06.
  - **Previously — asymmetry (not enforced on inbound):** `requireCorrelationIds` is **only wired into outbound FHIR → HL7 v2** (`runCustomerOutbound`). On **inbound HL7 v2 → FHIR**, `runCustomerInbound` does **not** check `PID-3` or `PV1-19` — and `customers/example-hospital/input/ADT_A01.liquid` even substitutes `'UNKNOWN-MRN'` when `PID-3.1` is empty!

---

## 5. Rules for Adding a New Customer (Checklist)

1. **Create `customers/<customerId>/config.yaml`** with a valid `customerId` (`^[a-z0-9][a-z0-9._-]{0,62}$`, matching the directory name), `name`, `inboundAuth` (secret via `secretRef`, never plaintext), `identifiers` (`mrnSystem`, `visitNumberSystem`, `documentIdSystem`, `assigningAuthority`), `hl7v2`, and `targets`.
2. **Define stable, customer-owned HTTPS URI namespaces** for `mrnSystem`, `visitNumberSystem`, and `documentIdSystem` (e.g. `https://fhir.<customer>.org/sid/<type>`). Never use `http://example.com/...` in production.
3. **Add `customers/<customerId>/identifiers.json`** if the customer relies on built-in fallback templates (`defaults.fallbackToBuiltin: true`), mapping each known `CX-4` assigning authority (`bySystem` / `byAssigner` for `MR`, `VN`, and `*` or explicit `override: true`) so built-in `http://example.com/v2-to-fhir-converter/Identifier/<CX-4>` URIs are rewritten to the customer's real system URIs.
4. **Separate systems per facility** if one `customerId` spans multiple hospitals/HIS instances whose MRNs or visit numbers can overlap.
5. **Verify `DocumentReference` keying** (custom `input/MDM_T02.liquid` or future mapper support for `masterIdentifier`) so `TXA-12` carries `documentIdSystem` and is eligible for conditional create/update.
6. **Add synthetic test messages** (admit, update, document, discharge, duplicate, rejected) and verify generated outputs before onboarding to R2.

---

## 6. Open Questions (Not Enforced in Code Today)

1. **Inbound `requireCorrelationIds` (`422`):** Should `runCustomerInbound` enforce non-empty `PID-3` (MRN) and `PV1-19` (visit number) — and `TXA-12` for `MDM` — returning HTTP `422` `OperationOutcome` to match outbound `requireCorrelationIds`, instead of falling back to `UNKNOWN-MRN` or unconditional `POST`?
2. **Unknown / missing `CX-4` assigning authority:** Should an unrecognized `CX-4` be rejected with `422`, mapped to a customer default (`override: true`), or passed through?
3. **Single source of truth between `config.yaml` and `identifiers.json`:** Should `customerPipeline.js` automatically synthesize default `identifiers.json` rules from `config.yaml` `identifiers.*` (`mrnSystem`, `visitNumberSystem`, `documentIdSystem`) so built-in fallback templates never emit `http://example.com/v2-to-fhir-converter/Identifier/...`?
4. **`DocumentReference.masterIdentifier` vs `identifier[0]`:** Should `sendResource.js` support conditional create/update on `DocumentReference.masterIdentifier` (or should customer `MDM_T02` templates populate `DocumentReference.identifier[0]`)?
5. **Multi-facility MRN collision policy:** Confirm with R2 whether multi-hospital customers will use separate `{customerId}` tenants or separate facility-scoped identifier systems under one `{customerId}`.
