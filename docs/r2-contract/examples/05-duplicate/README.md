# 05-duplicate (`ADT^A01` replay)

Re-sends `01-admit/input.hl7` unchanged, with the same `MSH-10` (`SYN-MSG-0001`). `sent.json` is byte-identical to 01: the conditional `PUT` on the MRN and the visit number match the existing resources, so R2 ends up with the same single `Patient` and `Encounter` and creates nothing new. An `Idempotency-Key` from `MSH-10` is proposed on top of this (see `mapper-to-r2.md`).

`output.json` is the converter result. `sent.json` is the exact transaction the mapper POSTs to R2 (`conditional_update`: `PUT {Type}?identifier={system}|{value}`, `urn:uuid:` references between entries).
