# ADT coverage: what a full admission, discharge and transfer needs

What an HL7 v2 ADT feed carries, which FHIR R4 resources it maps to, which events a full admission–discharge–transfer lifecycle needs, and the design decisions R2 has to make before the mapper can cover it. Input for R2-1967 (resources) and R2-1968 (immutability, corrections, history).

> **Core finding:** most of ADT maps cleanly to an upsert (conditional `PUT`). Four things do not: transfer history, lists without IDs (DG1/PR1/AL1), merges and re-keys, and out-of-order messages. Those need decisions on the R2 side, not more mapping.

## 1. Segments → FHIR R4

| Segment | Content | FHIR resource |
|---|---|---|
| MSH / EVN | Message ID (MSH-10), sender (MSH-3/4), message time (MSH-7), event time (EVN-2) | `Provenance` or `meta.source`; ordering |
| PID | MRN (PID-3), name, birth date, sex, address, telecom | `Patient` |
| PD1 | GP, patient preferences | `Patient.generalPractitioner` |
| NK1 | Relatives, contact persons | `Patient.contact` or `RelatedPerson` |
| PV1 | Case number (PV1-19), class (PV1-2), ward/room/bed (PV1-3), prior location (PV1-6), department (PV1-10), doctors (PV1-7/8/9/17), admit source (PV1-14), discharge disposition (PV1-36), admit/discharge time (PV1-44/45) | `Encounter`, `Location`, `Practitioner` |
| PV2 | Admit reason, expected discharge date | `Encounter.reasonCode`, `Encounter.period` |
| ZBE (DE) | Movement ID (ZBE-1), movement time, action INSERT/UPDATE/DELETE, department | Identifier of the department stay (see 3.1) |
| DG1 | ICD-10-GM code, type (admitting/working/final), certainty, main diagnosis, diagnosis ID (DG1-20) | `Condition` + `Encounter.diagnosis` |
| PR1 | OPS code, date, surgeon/anaesthetist, procedure ID (PR1-19) | `Procedure` |
| AL1 | Allergies | `AllergyIntolerance` |
| OBX | Height, weight, etc. | `Observation` |
| IN1 / IN2 | Health insurer (IK number), insured number (KVNR), insurance status | `Coverage` + `Organization` (payer) |
| GT1 | Guarantor | `RelatedPerson` / `Coverage.policyHolder` |
| ROL | Other care roles | `PractitionerRole` |
| MSH-4 / PV1-3.4 | Hospital / facility | `Organization` |

## 2. Events for the full lifecycle

| Group | Events | Effect in R2 |
|---|---|---|
| Admit | A01 inpatient, A04 outpatient, A05 pre-admit, A14 pending admit | Encounter `planned` → `in-progress` |
| Transfer | A02 transfer, A06 outpatient→inpatient, A07 inpatient→outpatient, A21/A22 leave of absence / return | Location and department history, class change, `onleave` |
| Discharge | A03 discharge, A16 pending discharge | `finished`, period end, discharge disposition |
| Update | A08 visit + patient, A31 person, A60 allergies | New version of the resource |
| Cancel | A11 admit, A12 transfer, A13 discharge, A27/A25/A38 cancel pending admit / pending discharge / pre-admit | `entered-in-error` / `cancelled`; A13 reopens the case |
| Doctor change | A54/A55 change attending doctor / cancel it | `Encounter.participant` |
| Identity | A40 merge patients, A42 merge visits, A45 move visit, A47 change identifier, A50 change case number, A24/A37 link/unlink | Merge, link or re-key; **not an upsert** |

## 3. Decisions R2 needs to make

### 3.1 Transfer history (R2-1967)
Each ADT message carries only the *current* ward and department. The mapper is stateless, so a conditional `PUT` of one Encounter overwrites the earlier locations, and A12 (cancel transfer) can't remove a stay the mapper never kept.

**Proposal:** use the ISiK encounter levels (gematik):
- Facility-level Encounter for the whole case, keyed on PV1-19.
- Department-level Encounter per department stay, keyed on the ZBE movement ID, `partOf` the case Encounter.
- Optionally a ward-level Encounter below that.

Each level has its own key, so `PUT` still works and A12 only cancels one department stay. This also answers the open project question "how multiple department contacts map to Encounters".

### 3.2 Lists without stable IDs (R2-1967)
DG1, PR1 and AL1 arrive as the *full current list*. If the hospital deletes a diagnosis, the mapper can't delete it in R2, because it never saw the previous list.

Options:
- R2 treats the latest list per Encounter as replacing the previous one.
- Key each entry on DG1-20 / PR1-19 where the hospital sends them, and fall back to case + code + type otherwise. Without IDs the fallback can produce duplicates.

### 3.3 Merges and re-keys (R2-1968)
A40, A42, A45, A47 and A50 are operations, not data. R2 needs explicit merge/link semantics or an endpoint for them; an upsert can't express them.

### 3.4 Ordering (R2-1968)
A late A08 must not overwrite a newer A03. Ordering has to use EVN-2 / MSH-7, not arrival order. This needs a rule on the R2 side, for example rejecting or parking a version older than the stored one.

## 4. Phasing

| Phase | Resources | Events |
|---|---|---|
| First case | Patient, Encounter (case + department level), Location, Practitioner, Condition, Procedure, DocumentReference | A01, A02, A03, A08, A11, A12, A13, MDM^T02 |
| Next | Coverage + payer Organization, AllergyIntolerance, Observation, RelatedPerson | A04–A07, A14/A16, A21/A22, A31, A54/A55, A60; merges and re-keys (A40, A42, A45, A47, A50) once 3.3 is decided |

Today the mapper's customer templates cover Patient, Encounter (case level only) and DocumentReference, for A01, A08, A03 and MDM^T02. See `examples/`.
