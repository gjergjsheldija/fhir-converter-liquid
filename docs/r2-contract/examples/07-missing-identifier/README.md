# 07-missing-identifier (empty `PID-3` → `422`)

A valid message whose `PID-3` (MRN) is empty. `runCustomerInbound` checks `MSH-10`, `PID-3`, `PV1-19` (when `PV1` is present) and `TXA-12` (when `TXA` is present) before conversion. It rejects the message with HTTP `422` and an `OperationOutcome` (`code: processing`, `phase: validation`), so it can't be merged into a placeholder patient. Nothing is sent to R2. A customer can turn the check off with `hl7v2.requireCorrelationIds: false`.
