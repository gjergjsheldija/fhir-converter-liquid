# FHIR to HL7 v2

[Features](../features.md)

The reverse conversion engine renders HL7 v2.x ER7 messages from FHIR R4 resources using Liquid templates. Where `HL7v2 -> FHIR` parses pipe-delimited segments into a FHIR Bundle, `FHIR -> HL7v2` accepts a self-contained FHIR R4 `Bundle` (`document` or `collection`), indexes every resource and intra-Bundle link in memory, and emits `\r`-terminated HL7 v2 segments ready for hospital interface engines and downstream EHRs.

## Why reverse conversion takes a self-contained Bundle

An outbound HL7 v2 message (`MDM^T02`, `ADT^A03`, `ORU^R01`) is a self-contained wire snapshot: a single transmission carries header routing (`MSH`), event context (`EVN`), patient demographics (`PID`), inpatient visit details (`PV1`), clinical narratives or discrete observations (`TXA`, `OBR`, `OBX`), diagnoses (`DG1`), procedures (`PR1`), and allergies (`AL1`).

A standalone FHIR `Composition` or `QuestionnaireResponse` holds only relative or `urn:uuid:` pointers (`Patient/pat-1`, `Encounter/enc-1`, `Condition/cond-1`) rather than inline demographics or clinical entries. Accepting a self-contained FHIR R4 `Bundle` (`type: "document"` or `type: "collection"`) gives the converter three guarantees:

- **Zero external round-trips:** Every referenced `Patient`, `Encounter`, `Practitioner`, `Organization`, `Condition`, `Procedure`, `AllergyIntolerance`, `MedicationRequest`, and `DocumentReference` resolves in memory with no N+1 HTTP calls back to a FHIR server.
- **Point-in-time clinical consistency:** The outbound HL7 v2 message reflects the exact resource versions assembled at discharge or form sign-off.
- **Stateless execution:** Both standalone API calls (`POST /api/v1/convert/fhir/:template`) and [customer pipelines](customer-pipelines.md) (`POST /api/v1/customers/:customerId/outbound/:template`) run deterministically in isolated worker execution.

## Hospital Discharge workflows

Hospital discharge typically produces either a narrative/PDF clinical discharge letter or a structured discharge assessment form. Both map cleanly into HL7 v2 from self-contained FHIR R4 Bundles.

### 1. Clinical Discharge Summary (`Composition` Document Bundle)

A clinical discharge letter is packaged as a FHIR `Bundle` with `type: "document"` whose first entry is a `Composition` coded with LOINC `18842-5` (`Discharge summary`). Supporting entries carry the full inpatient context:

- `Composition` (LOINC `18842-5`) with `status`, `date`, `title`, `author`, and clinical `section[]` narratives (`Hospital course`, `Discharge diagnoses`, `Discharge medications`, `Follow-up plan`)
- `Patient` with hospital MRN, national or insurance identifiers, name, birthDate, gender, address, and telecom
- `Encounter` with visit/case number (`VN`), inpatient class (`IMP`), ward/room/bed location, admission/discharge `period`, and `hospitalization.dischargeDisposition`
- `Condition` entries with ICD-10 (`http://hl7.org/fhir/sid/icd-10-gm` or `http://hl7.org/fhir/sid/icd-10-cm`) or SNOMED CT discharge diagnoses
- `Procedure` entries with OPS, CPT, or SNOMED CT inpatient procedures
- `AllergyIntolerance` entries with allergen code, criticality, and reaction manifestations
- `MedicationRequest` entries representing discharge medication instructions
- `DocumentReference` (optional) carrying a signed Base64-encoded PDF clinical letter (`content[].attachment.contentType: "application/pdf"`, `content[].attachment.data`)

```json
{
  "resourceType": "Bundle",
  "id": "discharge-doc-001",
  "type": "document",
  "timestamp": "2026-11-26T15:10:00+01:00",
  "entry": [
    {
      "fullUrl": "urn:uuid:comp-1",
      "resource": {
        "resourceType": "Composition",
        "id": "comp-1",
        "status": "final",
        "type": {
          "coding": [{ "system": "http://loinc.org", "code": "18842-5", "display": "Discharge summary" }]
        },
        "subject": { "reference": "Patient/pat-1" },
        "encounter": { "reference": "Encounter/enc-1" },
        "date": "2026-11-26T15:00:00+01:00",
        "author": [{ "reference": "Practitioner/prac-1" }],
        "title": "Medical Discharge Summary",
        "section": [
          {
            "title": "Hospital Course",
            "text": { "status": "generated", "div": "<div xmlns=\"http://www.w3.org/1999/xhtml\"><p>Uncomplicated recovery; discharged home in stable condition.</p></div>" }
          }
        ]
      }
    },
    {
      "fullUrl": "Patient/pat-1",
      "resource": {
        "resourceType": "Patient",
        "id": "pat-1",
        "identifier": [{ "system": "urn:oid:1.2.276.0.76.4.8", "type": { "coding": [{ "code": "MR" }] }, "value": "00998877" }],
        "name": [{ "family": "Weber", "given": ["anna"] }],
        "gender": "female",
        "birthDate": "1968-04-19"
      }
    },
    {
      "fullUrl": "Encounter/enc-1",
      "resource": {
        "resourceType": "Encounter",
        "id": "enc-1",
        "status": "finished",
        "class": { "code": "IMP" },
        "identifier": [{ "type": { "coding": [{ "code": "VN" }] }, "value": "VISIT-2026-4412" }],
        "period": { "start": "2026-11-21T08:15:00+01:00", "end": "2026-11-26T14:45:00+01:00" },
        "hospitalization": {
          "dischargeDisposition": { "coding": [{ "code": "01", "display": "Discharged to home" }] }
        }
      }
    }
  ]
}
```

### 2. Structured Discharge Assessment Form (`QuestionnaireResponse` Bundle)

Digital nursing handoffs, post-acute care checklists, and structured discharge assessments are captured as a `QuestionnaireResponse` bundled with `Patient` and `Encounter` (`type: "collection"`):

```json
{
  "resourceType": "Bundle",
  "id": "discharge-qr-001",
  "type": "collection",
  "entry": [
    {
      "fullUrl": "QuestionnaireResponse/qr-1",
      "resource": {
        "resourceType": "QuestionnaireResponse",
        "id": "qr-1",
        "questionnaire": "https://klinikum.example/Questionnaire/discharge-assessment",
        "status": "completed",
        "subject": { "reference": "Patient/pat-1" },
        "encounter": { "reference": "Encounter/enc-1" },
        "authored": "2026-11-26T14:50:00+01:00",
        "item": [
          {
            "linkId": "mobility",
            "text": "Mobility status",
            "answer": [{ "valueCoding": { "system": "http://snomed.info/sct", "code": "160685001", "display": "Mobile" } }]
          },
          {
            "linkId": "pain-score",
            "text": "Pain score at discharge (0-10)",
            "answer": [{ "valueInteger": 1 }]
          },
          {
            "linkId": "followup-notes",
            "text": "Follow-up instructions",
            "answer": [{ "valueString": "Cardiology clinic follow-up in 14 days." }]
          }
        ]
      }
    },
    { "fullUrl": "Patient/pat-1", "resource": { "resourceType": "Patient", "id": "pat-1" } },
    { "fullUrl": "Encounter/enc-1", "resource": { "resourceType": "Encounter", "id": "enc-1" } }
  ]
}
```

## Built-in templates and when to use each

Built-in reverse templates live in `src/templates/FhirToHl7v2/` (copied to `src/service-templates/FhirToHl7v2/` on startup). Customer-specific overrides live in `customers/<customerId>/output/`.

| Template | HL7 v2 trigger | Primary segments | When to use |
| --- | --- | --- | --- |
| `MDM_T02.liquid` | `MDM^T02^MDM_T02` | `MSH`, `EVN`, `PID`, `PV1`, `TXA`, `OBX` | Clinical discharge letters, signed PDFs (`DocumentReference` Base64 `ED` in `OBX-5`), and narrative or form summaries requiring document lifecycle tracking in `TXA-12` (unique document ID) and `TXA-17` (completion status such as `AU` or `IP`) |
| `ADT_A03.liquid` | `ADT^A03^ADT_A03` | `MSH`, `EVN`, `PID`, `PV1`, `DG1`, `PR1`, `AL1` | Administrative hospital discharge feeds, HIS/PAS census updates, and billing/DRG systems expecting discharge date/time (`PV1-45`), disposition (`PV1-36`), ICD-10 diagnoses (`DG1`), OPS/CPT procedures (`PR1`), and allergies (`AL1`) |
| `ORU_R01.liquid` | `ORU^R01^ORU_R01` | `MSH`, `PID`, `PV1`, `ORC`, `OBR`, `OBX`, `NTE` | Observation-centric EHR inboxes, clinical repositories, and form engines that ingest `QuestionnaireResponse` answers or `Observation` entries as discrete typed `OBX` rows (`NM`, `CWE`, `CE`, `ST`, `TX`, `DT`) |

## Pre-indexed Liquid context

Before rendering an outbound `.liquid` template, the engine indexes the input FHIR `Bundle` and injects top-level Liquid variables so templates never have to loop manually over `bundle.entry` to find core resources or resolve references:

| Variable | Value |
| --- | --- |
| `bundle` | Raw input FHIR R4 `Bundle` object (`bundle.id`, `bundle.type`, `bundle.timestamp`, `bundle.entry`) |
| `byType` | Map of `resourceType` to an array of resources in Bundle order (`byType.Condition`, `byType.Procedure`, `byType.AllergyIntolerance`, `byType.MedicationRequest`, `byType.DocumentReference`, `byType.Observation`) |
| `byRef` | Dictionary keyed by `ResourceType/id`, `fullUrl` (including `urn:uuid:...`), and bare `id` for instant reference lookup |
| `patient` | Primary `Patient` resource (resolved from `Composition.subject` or `QuestionnaireResponse.subject`, falling back to `byType.Patient[0]`) |
| `encounter` | Primary `Encounter` resource (resolved from `Composition.encounter` or `QuestionnaireResponse.encounter`, falling back to `byType.Encounter[0]`) |
| `composition` | First `Composition` resource in `byType.Composition` when present |
| `questionnaireResponse` | First `QuestionnaireResponse` resource in `byType.QuestionnaireResponse` when present |
| `customer` | Active customer settings (`id`, `name`, `msh`, `identifiers`) when invoked via `/api/v1/customers/:customerId/outbound/:template`, or default MSH values on standalone calls |

## Healthcare output filters

Eleven dedicated Liquid filters handle HL7 v2 ER7 escaping, XHTML narrative stripping, HL7 timestamps, Bundle reference traversal, code/identifier selection, HL7 table mapping, and recursive `QuestionnaireResponse` flattening:

| Filter | Input and arguments | Output |
| --- | --- | --- |
| `hl7_escape` | Any string value | Escapes ER7 delimiters (`\` to `\E\`, field separator to `\F\`, `^` to `\S\`, `&` to `\T\`, `~` to `\R\`, and CR/LF newlines to `\.br\`) |
| `strip_xhtml` | FHIR `Narrative.div` XHTML string | Removes XML/XHTML tags, converts `<br>` and block breaks cleanly, and decodes HTML entities into plain text |
| `hl7_datetime` | ISO-8601 `instant`, `dateTime`, or `date` | Formats HL7 `DTM` or `DT` (`YYYYMMDDHHMMSS±ZZZZ`, `YYYYMMDDHHMMSS`, or `YYYYMMDD`) |
| `hl7_control_id` | Seed string (such as `bundle.id`) | Produces a clean, deterministic `MSH-10` control ID (up to 20 safe ASCII characters) |
| `resolve_ref` | FHIR `Reference` object or reference string, plus `byRef` (or implicit context index) | Returns the target FHIR resource from the Bundle (`Practitioner`, `Organization`, `Patient`, `Encounter`, etc.) |
| `identifier_by_system` | Resource or `Identifier[]`, plus system URI | Returns the first `Identifier.value` matching `Identifier.system` |
| `identifier_by_type` | Resource or `Identifier[]`, plus HL7 v2 type code (`MR`, `VN`, `AN`, `NPI`) | Returns the first `Identifier.value` whose `Identifier.type.coding[].code` matches |
| `coding_by_system` | `CodeableConcept` or `Coding[]`, plus code system URI | Returns the first matching `Coding` object (`code`, `display`, `system`) |
| `map_gender` | FHIR `Patient.gender` (`male`, `female`, `other`, `unknown`) | Returns HL7 Table 0001 code (`M`, `F`, `O`, `U`) |
| `map_doc_status` | `Composition.status` or `QuestionnaireResponse.status` | Maps lifecycle status to HL7 Table 0271 `TXA-17` document completion code (`IP` for preliminary/in-progress, `AU` for final/completed, `LA` for amended, `CA` for entered-in-error) |
| `flatten_qr_items` | `QuestionnaireResponse` or `item[]` | Recursively flattens nested groups and answers into `{ linkId, text, valueType, value, coding, unit }` rows for `OBX` generation |

Example Liquid snippet combining context variables and output filters:

```liquid
{% assign author = composition.author[0] | resolve_ref -%}
{% assign mrn = patient | identifier_by_system: customer.identifiers.mrnSystem -%}
{% assign visitNo = encounter | identifier_by_type: 'VN' -%}
MSH|^~\&|{{ customer.msh.sendingApplication | default: 'FHIR_CONV' }}|{{ customer.msh.sendingFacility | default: 'HOSP' }}|{{ customer.msh.receivingApplication | default: 'HIS' }}|{{ customer.msh.receivingFacility | default: 'KLINIK' }}|{{ bundle.timestamp | hl7_datetime }}||MDM^T02^MDM_T02|{{ bundle.id | hl7_control_id }}|P|2.5.1|||AL|NE||UTF-8
PID|1||{{ mrn | hl7_escape }}^^^HOSP^MR||{{ patient.name[0].family | hl7_escape }}^{{ patient.name[0].given[0] | hl7_escape }}||{{ patient.birthDate | hl7_datetime }}|{{ patient.gender | map_gender }}
PV1|1|I||||||{{ author.identifier[0].value | hl7_escape }}^{{ author.name[0].family | hl7_escape }}|||||||||||{{ visitNo | hl7_escape }}|||||||||||||||||||||||||{{ encounter.period.start | hl7_datetime }}|{{ encounter.period.end | hl7_datetime }}
TXA|1|DS|TX|{{ composition.date | hl7_datetime }}||||||||{{ composition.id | hl7_escape }}|||||{{ composition.status | map_doc_status }}
{% for sec in composition.section -%}
OBX|{{ forloop.index }}|TX|{{ sec.code.coding[0].code | default: 'DISC' | hl7_escape }}^{{ sec.title | hl7_escape }}||{{ sec.text.div | strip_xhtml | hl7_escape }}||||||F
{% endfor -%}
```

## HTTP usage

### Convert a FHIR Bundle with a built-in template

`POST /api/v1/convert/fhir/:template` accepts either a raw FHIR R4 `Bundle` JSON body or `{ "bundle": { ... } }` and negotiates the response format from the `Accept` header:

- `Accept: application/json` (default): returns a JSON object containing `hl7Message` (`\r`-delimited ER7 string), `controlId` (`MSH-10`), `messageType` (`MSH-9`), and `template`.
- `Accept: application/hl7-v2` (or `Accept: text/plain`): returns the raw `\r`-terminated ER7 payload directly with `Content-Type: application/hl7-v2; charset=utf-8`.

```bash
# JSON envelope response (default)
curl -X POST http://localhost:2019/api/v1/convert/fhir/MDM_T02 \
  -H "Content-Type: application/fhir+json" \
  -H "Accept: application/json" \
  --data-binary @discharge-bundle.json

# Raw ER7 HL7 v2 wire output
curl -X POST http://localhost:2019/api/v1/convert/fhir/MDM_T02 \
  -H "Content-Type: application/fhir+json" \
  -H "Accept: application/hl7-v2" \
  --data-binary @discharge-bundle.json
```

To test an inline Liquid template without saving it to disk, post `{ "bundle": { ... }, "templateBase64": "..." }` to `POST /api/v1/convert/fhir`.

### Send to an HL7 v2 REST Gateway with `MSA` ACK verification

`POST /api/v1/hl7v2/send` forwards a rendered ER7 HL7 v2 message to an HTTP/REST HL7 v2 gateway (such as an Open Integration Engine HTTP Listener, Mirth Connect, Rhapsody, or hospital edge adapter) and parses the returned HL7 ACK message:

- Supports `format: "json_envelope"` (posts JSON `{ "hl7Message": "...", "controlId": "..." }`) and `format: "raw_er7"` (posts raw `application/hl7-v2` body).
- Supports Bearer token or HTTP Basic authentication.
- Extracts the `MSA` segment from the gateway response (`MSA-1` acknowledgment code, `MSA-2` echoed control ID, and `MSA-3` / `ERR` error text).
- When `requireApplicationAck: true` (default), `MSA|AA` (or `MSA|CA` when commit ACKs are accepted) with a matching control ID succeeds, whereas `MSA|AE`, `MSA|AR`, `MSA|CE`, `MSA|CR`, or a missing ACK fails with status `400` / `502` and surfaces the exact rejection reason.

```bash
curl -X POST http://localhost:2019/api/v1/hl7v2/send \
  -H "Content-Type: application/json" \
  -d '{
    "url": "http://127.0.0.1:8081/hl7/inbound",
    "format": "raw_er7",
    "requireApplicationAck": true,
    "hl7Message": "MSH|^~\\&|FHIR_CONV|HOSP|HIS|KLINIK|20261126151000||MDM^T02^MDM_T02|MSG00001|P|2.5.1\rPID|1||00998877^^^HOSP^MR||Weber^Anna||19680419|F\r"
  }'
```

For automated per-hospital routing, Vault-backed OAuth2/Bearer credentials, and single-call conversion + delivery (`?deliver=true`), see [Customer pipelines & Vault](customer-pipelines.md).
