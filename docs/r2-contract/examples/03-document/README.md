# 03-document (`MDM^T02`)

Synthetic Base64 PDF (`OBX-5` `ED`) for visit `SYN-VISIT-1001`, through the customer `MDM_T02.liquid`. Emits `Patient`, `Encounter` and `DocumentReference`. The PDF sits in `DocumentReference.content[0].attachment` (`application/pdf`). The document is keyed on `TXA-12` (`SYN-DOC-9001`) with the `document-id` system and linked to the Patient (`subject`) and the Encounter (`context.encounter`).

`output.json` is the converter result. `sent.json` is the exact transaction the mapper POSTs to R2 (`conditional_update`: `PUT {Type}?identifier={system}|{value}`, `urn:uuid:` references between entries).
