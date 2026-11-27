# R2 Boundary Specs

These specs define the HTTP/FHIR integration boundary between this stateless HL7 v2-to-FHIR mapper (running in the R2 cluster) and the R2 server-to-server bundle API.

## Agreed context (2026-11-24, fixed)

- This service is the stateless mapper. It runs in the R2 cluster, receives HL7 v2 from the Interop gateway, and pushes FHIR bundles to an R2 server-to-server bundle API over REST/HTTP (no broker).
- R2 owns the bundle API and persistence. This track specifies what the mapper sends and expects; R2 implements against it.
- `customerId` is carried in the route. Correlation IDs (`X-Request-Id` and `traceparent`) flow `gateway → mapper → R2`.
- Agreed boundary FHIR version is **FHIR R4B**; this service emits **FHIR R4** today (tracked as an open question under `R2-1967`; do not alter template output until decided).

## Rules

1. Implement one numbered spec per change, then stop.
2. Read `AGENTS.md`, `specs/ORDER.md`, this file, and the single target spec before editing.
3. Edit only the files listed in that spec.
4. Never edit `src/templates/**`, `src/service-templates/**`, `src/sample-data/**`, or `test/e2e-test/liquid-fixtures/**`.
5. If a behavior cannot be confirmed from code, write "unverified" rather than guessing.
6. Do not commit unless the user explicitly asks.

## Order

| Spec | Status | File | What it changes |
| --- | --- | --- | --- |
| 01 | Done (2026-11-27) | `01-mapper-to-r2-contract.md` | Document the mapper-to-R2 HTTP/FHIR bundle contract (`docs/r2-contract/mapper-to-r2.md`), separating current code behavior from the proposed R2 contract. No code changes. |
| 02 | Done (2026-11-27) | `02-typed-openapi-for-customer-routes.md` | Export typed OpenAPI 3.0.3 (`docs/r2-contract/openapi.json`) via `npm run openapi:export` for customer inbound/outbound + `/healthz` + `/readyz`, and return FHIR `OperationOutcome` from `sendCustomerError`. |
| 03 | Done (2026-11-27) | `03-first-case-examples.md` | Generate 6 synthetic first-case examples under `docs/r2-contract/examples/` via `scripts/build-r2-examples.mjs` (`npm run examples:build`) with zero-drift test `src/lib/customers/r2Examples.spec.js`. |
| 04 | Done (2026-11-27) | `04-identifier-conventions.md` | Document identifier systems, `CX-4` mapping, `identifiers.json` site-pack rules, uniqueness scope, and `requireCorrelationIds` gaps in `docs/r2-contract/identifiers.md`. No code changes. |
| 05 | Done (2026-11-27) | `05-sequence-diagrams.md` | Document ownership overview and 5 Mermaid sequence diagrams (success, duplicate, rejected, R2 unavailable, outbound) in `docs/r2-contract/flows.md`. No code changes. |
| 06 | Done (2026-11-27) | `06-examples-as-sent-to-r2.md` | Examples as R2 receives them (`sent.json`, conditional update), minimal customer templates, PDF in `DocumentReference.content`, inbound `422` for missing identifiers. |
