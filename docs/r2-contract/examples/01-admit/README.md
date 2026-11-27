# 01-admit (`ADT^A01`)

Admits synthetic patient `MUSTER^MAX` (MRN `SYN-MRN-0001`, visit `SYN-VISIT-1001`) through `customers/example-hospital/input/ADT_A01.liquid`. Emits `Patient` and `Encounter` (`status: in-progress`, class `IMP`).

`output.json` is the converter result. `sent.json` is the exact transaction the mapper POSTs to R2 (`conditional_update`: `PUT {Type}?identifier={system}|{value}`, `urn:uuid:` references between entries).
