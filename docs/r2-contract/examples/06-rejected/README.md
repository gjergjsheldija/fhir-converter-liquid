# 06-rejected (unparseable message → `400`)

The payload has no `MSH` segment, so the HL7 v2 parser rejects it. Result: HTTP `400` with an `OperationOutcome` (`code: invalid`, `phase: conversion`). Nothing is sent to R2. For a parseable message that lacks an identifier, see 07.
