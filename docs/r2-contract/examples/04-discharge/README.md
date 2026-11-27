# 04-discharge (`ADT^A03`)

Discharges the same patient and visit, through the customer `ADT_A03.liquid`. `PV1-45` sets `Encounter.period.end` and `status: finished`.

`output.json` is the converter result. `sent.json` is the exact transaction the mapper POSTs to R2 (`conditional_update`: `PUT {Type}?identifier={system}|{value}`, `urn:uuid:` references between entries).
