# Spec 02: Typed OpenAPI 3.0 Spec for Customer & Health Routes

**Status:** Done (2026-11-27). Verified: `npm run openapi:export` writes OpenAPI 3.0.3 `docs/r2-contract/openapi.json`, `r2OpenApi.spec.js` and `test/bidirectional-and-customers.spec.js` passing (8/8). Follow `AGENTS.md`, `specs/r2-boundary/00-order.md`, and `.agents/skills/spec-runner/SKILL.md`.

## 1. Goal

Enable R2 to review and generate typed clients from our HTTP API without running the service by exporting a static, typed OpenAPI 3.0.3 specification (`docs/r2-contract/openapi.json`) via `npm run openapi:export`, scoped strictly to:

- `POST /api/v1/customers/{customerId}/inbound/{template}`
- `POST /api/v1/customers/{customerId}/outbound/{template}`
- `GET /healthz`
- `GET /readyz`

## 2. Current behavior (verified from code)

- `src/routes/fhirAndOps.routes.js` runs `swagger-jsdoc` (`^6.2.1`) in Swagger 2.0 mode (`swaggerDefinition`) over all `src/routes/*.js` files and serves `/api-docs` and `/api-docs.json` only at runtime; there is no static OpenAPI export script.
- `src/routes/customers.routes.js` documents inbound/outbound with untyped Swagger 2.0 `schema: type: string` / `schema: type: object` bodies and no response schemas, no security schemes, and no header parameters (`X-Request-Id`, `traceparent`, `timezone`).
- `sendCustomerError` in `src/routes/customers.routes.js` returns `{ error: { code, message }, requestId?, phase?, detail? }` — **not** a FHIR `OperationOutcome`. Additionally, non-200 conversion results returned by `runCustomerInbound` / `runCustomerOutbound` bypass `sendCustomerError` and return `{ error: { code, message } }` directly.
- `/healthz` and `/readyz` in `src/routes/fhirAndOps.routes.js` have no OpenAPI annotations.
- **Verified inbound response status codes in code today:**
  - `200`: conversion succeeded (with optional `delivery` when `deliver=true` or `autoDeliverInbound=true`).
  - `400`: invalid `customerId`/`templateName`/empty `srcData`, HL7 v2 parse/template error from `worker.js`, missing `targets.fhirServer.baseUrl`, **or** any downstream FHIR target non-2xx / network error / timeout from `sendResource.js`.
  - `401`: missing or invalid per-customer inbound auth or `CONVERT_API_KEY`.
  - `403`: `ENABLE_OUTBOUND_DELIVERY=false` when delivery is requested.
  - `404`: unknown `customerId` or template not found.
  - `502`: OAuth2 `client_credentials` token endpoint failure (`src/lib/auth/outboundAuth.js`).

### Gaps (not yet returned by code; NOT documented as fiction in `openapi.json`)

The following target inbound responses from the R2 contract are **not** returned by the current code and are tracked here for follow-up implementation:

1. **Inbound `422 Unprocessable Entity`** for unparseable or unmapped HL7 v2 messages — `src/lib/workers/worker.js` currently returns `400` for HL7 v2 parse/mapping errors (`422` is only returned on outbound `MissingCorrelationId` / empty HL7 v2 / gateway `MSA` NACK).
2. **Inbound `502 Bad Gateway` for downstream FHIR target unreachable / 5xx** — `src/lib/fhir/sendResource.js` currently collapses all downstream FHIR HTTP errors and transport errors into `400`. Today `502` on inbound is only returned when OAuth2 `client_credentials` token exchange fails.
3. **Inbound `504 Gateway Timeout` for downstream FHIR target timeout** — `src/lib/fhir/sendResource.js` currently catches `AbortSignal.timeout` errors and throws `400`.

## 3. Files you may edit

- `specs/r2-boundary/00-order.md`
- `specs/r2-boundary/02-typed-openapi-for-customer-routes.md`
- `specs/ORDER.md`
- `src/routes/customers.routes.js`
- `src/lib/openapi/r2OpenApi.js`
- `src/lib/openapi/r2OpenApi.spec.js`
- `scripts/export-openapi.mjs`
- `package.json`
- `docs/r2-contract/openapi.json`

Do not add npm dependencies. Do not modify `src/templates/**`, `src/service-templates/**`, `src/sample-data/**`, or `test/e2e-test/liquid-fixtures/**`. Do not break existing `/api-docs.json` Swagger 2.0 routes.

## 4. Requirements

1. **Named schemas & `OperationOutcome` errors:**
   - Define named OpenAPI 3.0.3 schemas under `components.schemas`: `InboundResult` (typed `FhirBundle` + optional `FhirDeliveryResult` + optional metadata), `OutboundResult` (typed `hl7v2Message` + metadata + optional `Hl7v2DeliveryResult`), `OperationOutcome` (FHIR `OperationOutcome`-shaped error with `resourceType: "OperationOutcome"`, `issue[]`, and optional `id`/`requestId`/`phase`/`detail`), `HealthResponse`, and `ReadinessResponse`.
   - Minimally update `sendCustomerError` in `src/routes/customers.routes.js` to return this `OperationOutcome` shape, and route non-200 conversion results on inbound/outbound customer routes through `sendCustomerError` so all customer route errors match the schema. Cover with tests.
2. **Security schemes:**
   - Declare `CustomerApiKey` (`type: apiKey`, `in: header`, `name: X-Customer-Key`, noting that the header name is configurable per customer in `config.yaml` and defaults to `X-Customer-Key`) and `ConvertBearerAuth` (`type: http`, `scheme: bearer`, for `CONVERT_API_KEY` or bearer-mode customer inbound auth).
3. **Headers:**
   - Document `X-Request-Id` (request + response header), `traceparent` (request header), and `timezone` (request header on inbound/outbound).
4. **Accurate inbound responses:**
   - Document only responses the code actually returns today (`200`, `400`, `401`, `403`, `404`, and `502` scoped to OAuth2 token-exchange failure), and document the `422` / FHIR-target `502` / `504` gaps in this spec rather than fabricating them in `openapi.json`.
5. **Static OpenAPI export:**
   - Add `"openapi:export": "node scripts/export-openapi.mjs"` in `package.json`, emitting OpenAPI `3.0.3` via `swagger-jsdoc` (no new dependency) to `docs/r2-contract/openapi.json`.
   - Add tests verifying the export runs cleanly, produces valid OpenAPI `3.0.3`, contains exactly the four scoped routes, named schemas, security schemes, and headers, and verifying `sendCustomerError` returns `OperationOutcome`.

## 5. Validation

```sh
env NODE_ENV=testing AI_OPENAI_API_KEY=test-mock-key NODE_OPTIONS="--import ./test/mocks/register-templategenerate-loader.mjs" npx mocha src/lib/openapi/r2OpenApi.spec.js test/bidirectional-and-customers.spec.js --exit --timeout 10000
npm run openapi:export
node scripts/test-summary.mjs
```

`unexpected failures: 0`, `npm run eslint` clean, `git diff --check` clean, and zero immutable files modified.

## 6. Acceptance criteria

- `npm run openapi:export` writes `docs/r2-contract/openapi.json` (OpenAPI 3.0.3) containing only the 4 scoped routes (`POST /api/v1/customers/{customerId}/inbound/{template}`, `POST /api/v1/customers/{customerId}/outbound/{template}`, `GET /healthz`, `GET /readyz`).
- `InboundResult`, `OutboundResult`, and `OperationOutcome` are named schemas under `components.schemas`, and `sendCustomerError` returns the `OperationOutcome` shape verified by tests.
- Security schemes (`CustomerApiKey`, `ConvertBearerAuth`) and headers (`X-Request-Id`, `traceparent`, `timezone`) are declared and referenced.
- Inbound responses match real code behavior; `422` and FHIR-target `502`/`504` are documented as gaps in this spec rather than fiction.
- Full validation (`node scripts/test-summary.mjs`) passes with 0 unexpected failures and 0 lint errors.
