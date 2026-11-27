# Spec 01: Mapper-to-R2 Bundle API Contract

**Status:** Done (2026-11-27). Deliverable `docs/r2-contract/mapper-to-r2.md` written from verified code inspection; no code changes.

## 1. Goal

Produce a single, reviewable contract document (`docs/r2-contract/mapper-to-r2.md`) defining what this stateless mapper sends to and expects from the R2 server-to-server FHIR bundle API, clearly separating **Today (implemented in code)** from **Proposed (target R2 contract)** so R2 can implement against it and follow-up mapper specs can close the gaps.

## 2. Current behavior (verified from code)

- `src/routes/customers.routes.js`: exposes `POST /api/v1/customers/:customerId/inbound/:template(*)`, extracts `req.requestId` and `req.traceparent`, runs `runCustomerInbound`, and returns `HTTP 200` with `{ fhirResource, delivery, ... }` or passes thrown errors through `sendCustomerError` (which maps only `401` and `404` to distinct error codes and defaults everything else to `BadRequest`).
- `src/lib/customers/customerPipeline.js`: runs HL7 v2 conversion via `runConversion`, maps `targets.fhirServer.mode` (`standard`, `conditional_create`, `conditional_update`), and calls `sendResource` when `?deliver=true` or `defaults.autoDeliverInbound === true`.
- `src/lib/fhir/sendResource.js`: posts `application/fhir+json` to `baseUrl` (for `transaction`/`batch` bundles) or `baseUrl/{resourceType}` (otherwise). Supports `conditionalTransaction` (`If-None-Exist`) and `conditionalUpdate` (conditional `PUT`), both rewriting `batch`/`collection`/`document` bundles into `transaction` bundles keyed on `entry.resource.identifier[0]` across all resource types. Forwards `X-Request-Id` and `traceparent`, does **not** send `Idempotency-Key` / MSH-10, retries once only on `401` with refreshable auth, and collapses all non-2xx responses and transport/timeout errors into HTTP `400`.
- `src/middleware/requestContext.js`: validates incoming `x-request-id` (or generates a UUIDv4), echoes `X-Request-Id` on responses, and forwards sanitized `traceparent` when present.

## 3. Files you may edit

- `specs/r2-boundary/00-order.md`
- `specs/r2-boundary/01-mapper-to-r2-contract.md`
- `specs/ORDER.md`
- `docs/r2-contract/mapper-to-r2.md`

**No code changes** in this spec. Do not edit any file under `src/`, `test/`, `src/templates/`, `src/sample-data/`, or `test/e2e-test/liquid-fixtures/`.

## 4. Requirements

`docs/r2-contract/mapper-to-r2.md` must clearly separate **Today (code)** from **Proposed (R2 contract)** and cover all seven sections:

1. **Endpoint shape**: proposed `POST {r2Base}/customers/{customerId}/bundles`, HTTP method, `Content-Type` / `Accept`, and comparison with current `fhirTarget()`.
2. **Bundle type**: `transaction` vs `batch`, rationale, and current template + `sendResource.js` behavior.
3. **Conditional create / update**: target resource types and identifier systems (`Patient` by MRN, `Encounter` by visit number, `DocumentReference` by document ID) vs current `firstValidIdentifier` (`identifier[0]`) behavior across all entries.
4. **Headers**: auth (proposed and open), `X-Request-Id`, `traceparent`, and an `Idempotency-Key` derived from `MSH-10` — explicitly stating whether `MSH-10` is propagated today.
5. **Expected success response**: `transaction-response` Bundle shape and how the mapper reports it back to the Interop gateway.
6. **Error handling table**: R2 `400`/`422` (terminal: no retry, NACK the gateway), `401`/`403`, `409` (conflict/duplicate), `429`/`5xx`/timeout (retryable) — what the mapper does and what HTTP status / gateway ACK behavior results, contrasting Today vs Proposed.
7. **Open questions**: linked to `R2-1967` (minimum resources, FHIR R4 vs R4B), `R2-1968` (corrections, history, replay after the gateway's 14-day retention), and `R2-1969` (outbound).

Any behavior that cannot be confirmed from code must be explicitly marked `unverified` rather than guessed.

## 5. Validation

- `git diff --check`
- `git status --short` — confirm only the four allowed documentation/spec files were added/edited and zero files under `src/`, `test/`, `src/templates/`, `src/sample-data/`, or `test/e2e-test/liquid-fixtures/` were touched.

## 6. Acceptance criteria

- `specs/r2-boundary/00-order.md` exists and is linked from `specs/ORDER.md`.
- `docs/r2-contract/mapper-to-r2.md` covers all 7 required sections, separates Today from Proposed, cites exact source files for Today behavior, marks any unconfirmed behavior as `unverified`, and flags R4 vs R4B under `R2-1967` without changing any code or template output.
- Status headers in this spec, `specs/r2-boundary/00-order.md`, and `specs/ORDER.md` are updated.
