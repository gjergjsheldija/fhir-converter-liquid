# Mapper-to-R2 FHIR Bundle API Contract

> **Status:** Draft contract (2026-11-27) — spec `specs/r2-boundary/01-mapper-to-r2-contract.md`
>
> **Architecture context (agreed with R2 on 2026-11-24; fixed):**
> - This service (`fhir-converter-liquid`) is the **stateless mapper**. It runs inside the R2 cluster, is invoked over HTTP by the Interop gateway with HL7 v2 messages, and pushes FHIR Bundles to an R2 server-to-server bundle API over REST/HTTP with **no message broker**.
> - **R2 owns** the bundle API and all persistence. This document defines what the mapper sends and expects; R2 implements against it.
> - `customerId` is carried in the HTTP route. Correlation IDs (`X-Request-Id` and `traceparent`) flow end-to-end: `Interop gateway → mapper → R2`.
> - The agreed boundary FHIR version is **FHIR R4B**, while this service currently emits **FHIR R4**. This discrepancy is tracked as an open question under **`R2-1967`**; no template or output changes are made in this document.


> **Decided (spec 06, 2026-11-27):** the mapper sends a **`transaction`** using **conditional update** (`PUT {Type}?identifier={system}|{value}`), not conditional create. Conditional create would leave an existing `Patient`/`Encounter` untouched, so `ADT^A08` updates and the `ADT^A03` discharge end time would be silently dropped. `customers/example-hospital/config.yaml` uses `targets.fhirServer.mode: conditional_update`. The exact bodies are in `examples/*/sent.json`. Where the sections below still compare both modes, conditional update is the proposed contract; whether R2 accepts it per resource type stays open in Section 7.

Throughout this document, **Today (code)** states only what is verified in this repository (`src/routes/customers.routes.js`, `src/lib/customers/customerPipeline.js`, `src/lib/fhir/sendResource.js`, `src/middleware/requestContext.js`, and directly referenced helpers), and **Proposed (R2 contract)** defines the target contract between the mapper and R2. Anything that cannot be confirmed from this repository is explicitly marked **unverified**.

---

## 1. Endpoint Shape, Method, and Content Type

### Today (code)

- **Gateway → Mapper inbound route** (`src/routes/customers.routes.js`, `POST /api/v1/customers/:customerId/inbound/:template(*)`):
  - Accepts `text/plain`, `application/hl7-v2`, or `application/json` (`{ "srcData": "<HL7v2>" }`).
  - Triggers downstream FHIR delivery only when `?deliver=true` (or `?deliver=1`) is passed, or when `defaults.autoDeliverInbound: true` is set in `customers/{customerId}/config.yaml` (`src/lib/customers/customerPipeline.js`).
  - Can be globally disabled via `ENABLE_OUTBOUND_DELIVERY=false` or `0` (returns HTTP `403` with `phase: "delivery"`).
- **Mapper → FHIR server target URL** (`src/lib/fhir/sendResource.js`, `fhirTarget(baseUrl, resource)`):
  - Reads `targets.fhirServer.baseUrl` from the customer's `config.yaml` and strips trailing slashes.
  - If `resource.resourceType === "Bundle"` and `resource.type` is `"transaction"` or `"batch"`, posts directly to `baseUrl` (e.g. `POST https://fhir.example-hospital.org/fhir/r4`).
  - Otherwise, posts to `${baseUrl}/${encodeURIComponent(resource.resourceType)}` (e.g. `POST {baseUrl}/Bundle` for `collection` or `document` bundles in `standard` mode).
  - Does **not** construct a `/customers/{customerId}/bundles` path automatically; `customerId` is only included in the outbound URL today if manually baked into `targets.fhirServer.baseUrl`.
- **Method:** Always `POST` (`executeFhirPost` in `src/lib/fhir/sendResource.js`).
- **Media types:** `Content-Type: application/fhir+json` and `Accept: application/fhir+json` (`FHIR_BASE_HEADERS` in `src/lib/fhir/sendResource.js`).

### Proposed (R2 contract)

| Property | Value |
| --- | --- |
| **Endpoint** | `POST {r2Base}/customers/{customerId}/bundles` |
| **Method** | `POST` |
| **Request `Content-Type`** | `application/fhir+json; charset=utf-8` (or `application/fhir+json`; R2 must accept both with or without charset parameter) |
| **Request `Accept`** | `application/fhir+json` |
| **Response `Content-Type`** | `application/fhir+json` |
| **Route parameter** | `{customerId}` — matches `^[a-z0-9][a-z0-9._-]{0,62}$` (`CUSTOMER_ID_REGEX` in `src/lib/customers/customerConfig.js`), propagated from the inbound route into the R2 URL |

**Delta to implement in mapper (future spec):** Allow configuring a shared cluster `{r2Base}` (or R2 target mode) so the mapper targets `{r2Base}/customers/{customerId}/bundles` rather than requiring a per-customer full `baseUrl` or relying on FHIR base-URL posting.

---

## 2. Bundle Type Sent (`transaction` vs `batch`)

### Today (code)

- **Raw template output:** Built-in Microsoft v7.0 HL7 v2 templates (e.g., `src/templates/Hl7v2/ADT_A01.liquid`, `src/templates/Hl7v2/MDM_T02.liquid`) and the reference customer template (`customers/example-hospital/input/ADT_A01.liquid`) emit `"resourceType": "Bundle", "type": "batch"` without per-entry `request` objects.
- **Delivery transformation** (`src/lib/customers/customerPipeline.js` → `mapFhirDeliveryMode`, `src/lib/fhir/sendResource.js` → `sendResource`):
  - `targets.fhirServer.mode: standard` (default, or `none`): sends the converted Bundle **unmodified** (`type: "batch"`, no `entry[].request` added).
  - `targets.fhirServer.mode: conditional_create`: calls `conditionalTransaction(resource)`, which deep-copies any `batch`, `collection`, or `document` Bundle and rewrites `type` to `"transaction"`, populates `entry[].request`, promotes `entry[].fullUrl` to `urn:uuid:<id>`, rewrites internal `ResourceType/id` references to `urn:uuid:<id>`, and deletes `entry.resource.id` on promoted `POST` entries.
  - `targets.fhirServer.mode: conditional_update`: calls `conditionalUpdate(resource)`, performing the same `type: "transaction"` rewrite, `urn:uuid:` reference rewriting, and `id` stripping for `POST` and conditional `PUT` entries.

### Proposed (R2 contract)

- **Bundle type:** **`transaction`** (`"resourceType": "Bundle", "type": "transaction"`).
- **Why `transaction` instead of `batch`:**
  1. **All-or-nothing atomicity per HL7 v2 message:** An HL7 v2 event (e.g. `ADT^A01`, `MDM^T02`) produces interconnected resources (`Patient`, `Encounter`, `DocumentReference`, `Observation`, etc.). Partial commits (e.g. persisting an `Encounter` when `Patient` fails validation) leave R2 in an inconsistent state and make safe gateway retries impossible.
  2. **Intra-bundle reference resolution:** FHIR `transaction` semantics guarantee that internal `urn:uuid:<id>` references (e.g. `Encounter.subject.reference` → `Patient`) are resolved to the created or matched server IDs within the same atomic unit of work. FHIR `batch` prohibits cross-entry reference resolution.
  3. **Clean ACK/NACK semantics:** A single atomic outcome maps cleanly to an HL7 v2 gateway ACK (all entries committed) or NACK / retry (nothing committed).

---

## 3. Conditional Create / Update Semantics

### Today (code)

In `src/lib/fhir/sendResource.js` (`firstValidIdentifier` and `prepareTransactionEntries`):

- **Resource-type scope:** Applies uniformly to **every** entry in the Bundle; there is **no** resource-type allowlist or per-resource-type strategy.
- **Identifier selection:** Inspects **only `entry.resource.identifier[0]`** and requires both `identifier[0].system` and `identifier[0].value` to be non-empty strings.
  - If `identifier[0]` is valid:
    - In `conditional_create` mode:
      ```json
      "request": {
        "method": "POST",
        "url": "<ResourceType>",
        "ifNoneExist": "identifier=<encodeURIComponent(system)>|<encodeURIComponent(value)>"
      }
      ```
    - In `conditional_update` mode:
      ```json
      "request": {
        "method": "PUT",
        "url": "<ResourceType>?identifier=<encodeURIComponent(system)>|<encodeURIComponent(value)>"
      }
      ```
  - If `identifier[0]` is missing or lacks a non-empty `system` or `value`: falls back to unconditional create:
    ```json
    "request": {
      "method": "POST",
      "url": "<ResourceType>"
    }
    ```
- **Customer identifier config:** `customers/{customerId}/config.yaml` can declare `identifiers.mrnSystem` (aliased to `patientMrnSystem` in `src/lib/customers/customerConfig.js`), `identifiers.visitNumberSystem`, and `identifiers.documentIdSystem`, which are injected into Liquid templates via `customerContext` (`src/lib/customers/customerPipeline.js`). However, `sendResource.js` does **not** consult `customer.identifiers` when selecting which identifier to key on.
- **No out-of-order guard:** `sendResource.js` does not send `If-Match` / `If-Modified-Since` or compare HL7 event timestamps against persisted state.

### Proposed (R2 contract)

Conditional operations key on customer-scoped business identifiers so repeated or updated HL7 v2 events resolve to the same R2 entity rather than creating duplicates:

| Resource type | HL7 v2 source (typical) | Key identifier meaning | Customer config key (reference) | Conditional create (`If-None-Exist`) | Conditional update (`PUT`) |
| --- | --- | --- | --- | --- | --- |
| `Patient` | `PID-3` (MRN) | Patient Medical Record Number | `identifiers.mrnSystem` | `POST Patient` with `ifNoneExist: "identifier={mrnSystem}\|{mrn}"` | `PUT Patient?identifier={mrnSystem}\|{mrn}` |
| `Encounter` | `PV1-19` (Visit Number) | Hospital Visit / Case Number | `identifiers.visitNumberSystem` | `POST Encounter` with `ifNoneExist: "identifier={visitNumberSystem}\|{visitNumber}"` | `PUT Encounter?identifier={visitNumberSystem}\|{visitNumber}` |
| `DocumentReference` | `TXA-12` (Unique Document Number) | Document ID | `identifiers.documentIdSystem` | `POST DocumentReference` with `ifNoneExist: "identifier={documentIdSystem}\|{documentId}"` | `PUT DocumentReference?identifier={documentIdSystem}\|{documentId}` |
| Other resources (e.g. `Observation`, `Condition`, `DiagnosticReport`, `Practitioner`, `Organization`) | Varies by message type | Resource's primary business identifier if present, else unconditional `POST` | Open (`R2-1967`) | `POST {ResourceType}` (with `ifNoneExist` if a configured key identifier is present) | `PUT {ResourceType}?identifier={system}\|{value}` if keyed, else `POST {ResourceType}` |

**Requirements on R2:**
- All conditional lookups (`If-None-Exist` and conditional `PUT`) **must be tenant-scoped to `{customerId}`** from the route.
- If a conditional search matches **0** resources: create the resource (`201 Created`).
- If a conditional search matches **1** resource:
  - Conditional create (`POST` + `ifNoneExist`): return existing resource (`200 OK`) without overwriting, and resolve intra-bundle `urn:uuid:` references to that existing resource ID.
  - Conditional update (`PUT` + `?identifier=`): update the existing resource (`200 OK`) and resolve intra-bundle `urn:uuid:` references to that resource ID.
- If a conditional search matches **>1** resources (ambiguous match): reject the transaction with HTTP `412 Precondition Failed` or `409 Conflict` (FHIR standard is `412`; exact status to be confirmed with R2 — see Section 6 and `R2-1968`).

**Delta to implement in mapper (future spec):** Match the configured identifier `system` (`mrnSystem`, `visitNumberSystem`, `documentIdSystem`) rather than blindly taking `identifier[0]`, because HL7 v2 messages with multiple `PID-3` repeats may not place the customer's MRN system at index `0`.

---

## 4. Request Headers

### Today (code)

| Header | Sent today? | Verified code behavior |
| --- | --- | --- |
| `Content-Type` | Yes | Always `application/fhir+json` (`src/lib/fhir/sendResource.js`). |
| `Accept` | Yes | Always `application/fhir+json` (`src/lib/fhir/sendResource.js`). |
| `X-Request-Id` | Yes | `requestContextMiddleware` (`src/middleware/requestContext.js`) accepts incoming `x-request-id` matching `/^[A-Za-z0-9._:/-]+$/` (max 128 chars) or generates a UUIDv4, echoes it on the HTTP response, and attaches `req.requestId`. `customerPipeline.js` passes it to `sendResource.js`, which sets `X-Request-Id` on the outbound POST. |
| `traceparent` | Yes (when present) | `requestContextMiddleware` (`src/middleware/requestContext.js`) trims incoming `traceparent` (non-empty, max 128 chars; no W3C regex check) and attaches `req.traceparent`; does not synthesize one if absent. Forwarded on the outbound POST by `sendResource.js`. |
| Auth (`Authorization` or custom API-key header) | Configurable | `buildOutboundHeaders` (`src/lib/auth/outboundAuth.js`) supports `none`, `bearer`, `basic`, `api_key` / `header` / `api_key_header` (default `X-API-Key`), and `oauth2_client_credentials` (with in-memory token cache, 30s safety margin, and single retry on HTTP `401` when `isRefreshableAuth(auth)` is true). |
| `Idempotency-Key` (from `MSH-10`) | **No** | **Not propagated on inbound FHIR delivery today.** `controlIdOf(raw)` (`src/lib/conversions/failureLog.js`) extracts `MSH-10` for local audit and failure logs (`src/lib/conversions/runConversion.js`), and `sendHl7v2ToGateway` sets `Idempotency-Key` from `MSH-10` on *outbound* HL7 v2 delivery (`src/lib/hl7v2/sendHl7v2.js`), but `sendResource.js` neither accepts nor sends `Idempotency-Key` or any `MSH-10` header. *(Note: built-in HL7 v2 templates do place `MSH.10.Value` in `Bundle.identifier.value` inside the JSON body.)* |

### Proposed (R2 contract)

| Header | Required | Proposed value / semantics | Status |
| --- | --- | --- | --- |
| `Authorization` (or cluster auth mechanism) | Yes | Service-to-service auth between mapper and R2 inside the R2 cluster. Candidate options: OAuth2 `client_credentials` Bearer JWT, mTLS / service-mesh identity, or scoped internal service token. | **Proposed — open decision** |
| `X-Request-Id` | Yes | Correlation ID propagated verbatim from Interop gateway (or UUIDv4 generated by mapper if absent). R2 logs it and echoes it on responses. | **Aligned with today** |
| `traceparent` | Optional (when present) | W3C Trace Context header propagated verbatim from Interop gateway → mapper → R2. | **Aligned with today** |
| `Idempotency-Key` | Yes (when `MSH-10` is non-empty) | Derived from HL7 v2 `MSH-10` Message Control ID, scoped so collisions across customers/sending apps cannot occur — proposed format: `{customerId}:{msh10}` (or raw `{msh10}` since `{customerId}` is already in the route; exact format to confirm with R2). R2 deduplicates retries with the same key within its deduplication window (see `R2-1968`). | **Proposed — not yet in `sendResource.js`** |

---

## 5. Expected Success Response and Reporting Back to Gateway

### Today (code)

- **Mapper handling of R2 response** (`src/lib/fhir/sendResource.js`, `sendResource`):
  - Treats any `response.ok` (`2xx`) as success.
  - Reads `response.text()` and parses JSON (falling back to the first 500 characters of raw text if non-JSON).
  - Does **not** verify that `body.resourceType === "Bundle"` or `body.type === "transaction-response"`, and does **not** inspect per-entry `entry[].response.status`.
  - Returns:
    ```json
    {
      "ok": true,
      "status": 200,
      "location": "<Location response header or empty string>",
      "body": "<parsed JSON body or 500-char text>"
    }
    ```
- **Mapper → Interop gateway response** (`src/lib/customers/customerPipeline.js`, `src/routes/customers.routes.js`):
  - Attaches the delivery result at `resultMessage.delivery`.
  - Responds to the caller with **HTTP `200`** and JSON body `{ "fhirResource": { ... }, "delivery": { "ok": true, "status": 200, "location": "...", "body": { ... } } }` (plus `X-Request-Id` response header).
  - The mapper does **not** construct HL7 v2 `MSA` ACK/NACK segments on the inbound route; how the Interop gateway translates this HTTP `200` JSON payload into an HL7 v2 `MSA|AA` ACK is **unverified** in this repository (the gateway implementation lives outside this repo).

### Proposed (R2 contract)

- **R2 → Mapper success response:**
  - HTTP `200 OK` with `Content-Type: application/fhir+json` and echoed `X-Request-Id`.
  - Body is a FHIR `Bundle` with `"type": "transaction-response"`, containing one `entry` per request entry in the same order:
    ```json
    {
      "resourceType": "Bundle",
      "type": "transaction-response",
      "entry": [
        {
          "response": {
            "status": "201 Created",
            "location": "Patient/12345/_history/1",
            "etag": "W/\"1\""
          }
        },
        {
          "response": {
            "status": "200 OK",
            "location": "Encounter/67890/_history/2",
            "etag": "W/\"2\""
          }
        }
      ]
    }
    ```
  - On idempotent replay (duplicate `Idempotency-Key` already committed), R2 returns `200 OK` with the original `transaction-response` (or an equivalent success `transaction-response` referencing the persisted resource locations) rather than creating duplicates.
- **Mapper → Interop gateway reporting:**
  - Mapper validates that the R2 response is a `200` `transaction-response` Bundle (and that no entry reports a non-2xx status).
  - Mapper responds **HTTP `200 OK`** to the Interop gateway with `X-Request-Id`, `delivery.status`, and a summary/body of the `transaction-response` (persisted resource locations/IDs).
  - Interop gateway treats HTTP `200` from the mapper as delivery success and emits an HL7 v2 Application Accept (`MSA|AA`) to the hospital sender (**exact gateway ACK construction is unverified in this repo**).

---

## 6. Error Handling

### Today (code)

Verified in `src/lib/fhir/sendResource.js`, `src/lib/customers/customerPipeline.js`, `src/lib/auth/outboundAuth.js`, and `src/routes/customers.routes.js`:

- **Timeout:** Default `15000` ms (`DEFAULT_FHIR_TIMEOUT_MS`), overridable per customer via `targets.fhirServer.timeoutMs`, enforced with `AbortSignal.timeout(timeoutMs)`.
- **Retries:** **Only one retry exists today:** on HTTP `401` when `isRefreshableAuth(auth)` is true (`oauth2_client_credentials` or any `*Ref` secret field), `executeFhirPost` invalidates cached secrets/tokens and retries the POST once. There is **no** retry for `429`, `5xx`, or timeouts.
- **Status code collapse:**
  - Any `fetch` network error or timeout throws `httpError(400, "FHIR server request failed: <message>")`.
  - Any non-2xx HTTP response from the FHIR server (`400`, `401`, `403`, `409`, `422`, `429`, `500`, `502`, `503`, `504`) throws `httpError(400, "FHIR server returned <status>.")` with `error.detail = body`.
  - Only an OAuth2 token-exchange failure in `outboundAuth.js` throws `502` (and `ENABLE_OUTBOUND_DELIVERY=false` throws `403`).
  - `customerPipeline.js` attaches `err.phase = "delivery"`.
  - `sendCustomerError` (`src/routes/customers.routes.js`) returns `{ "error": { "code": "...", "message": "..." }, "requestId": "...", "phase": "delivery", "detail": ... }` with `err.status`. Consequently, **today the gateway receives HTTP `400` for every R2 error status and timeout**, making terminal vs retryable errors indistinguishable by HTTP status alone.

### Proposed (R2 contract)

R2 should return a FHIR `OperationOutcome` JSON body on 4xx/5xx errors. The mapper must preserve the distinction between **terminal** failures (do not retry; gateway NACKs) and **retryable** failures (gateway retries / backs off):

| R2 response / failure | Class | Today (mapper behavior → gateway HTTP) | Proposed mapper behavior | Proposed HTTP status → Interop gateway | Proposed Interop gateway HL7 v2 ACK (gateway behavior is **unverified** in this repo) |
| --- | --- | --- | --- | --- | --- |
| **`400 Bad Request` / `422 Unprocessable Entity`** (malformed bundle, FHIR validation failure, missing required fields) | **Terminal** | No retry. Returns HTTP **`400`** (`phase: "delivery"`, `detail: <R2 body>`). | **No retry.** Log structured error with `requestId`, `customerId`, `MSH-10`, and `OperationOutcome`. Pass through terminal error. | **`422 Unprocessable Entity`** (or preserve **`400`** / **`422`** with `retryable: false`) | **NACK** (`MSA\|AE` / `AR` — terminal; do not retry) |
| **`401 Unauthorized` / `403 Forbidden`** (expired token, invalid credentials, customer not authorized) | **Auth / Ops** | On `401` with refreshable auth: invalidates cache and retries **once**. On second `401`, non-refreshable `401`, or `403`: returns HTTP **`400`**. (OAuth2 token endpoint failure returns `502`.) | On `401`: refresh token/secret and retry **once**. If `401` persists or `403` is returned: do not retry further; alert/log as auth misconfiguration. | **`502 Bad Gateway`** (or `503` if auth outage; never `401` so gateway does not confuse R2 auth with its own inbound auth to the mapper) | **Unverified** — confirm with Interop gateway whether `502`/`503` triggers delayed retry or alert-and-NACK |
| **`409 Conflict`** (or `412 Precondition Failed` on ambiguous conditional match; duplicate / version conflict) | **Conflict / Duplicate** | No retry. Returns HTTP **`400`** (`detail: <R2 body>`). | Distinguish **idempotent duplicate** (same `Idempotency-Key` already committed → R2 should return `200` instead of `409`) from **true conflict** (ambiguous identifier match or concurrent write). If R2 returns `409` for a concurrent-write race, optional single bounded retry; if ambiguous/business conflict, **no retry**. | **`409 Conflict`** (with `retryable: false` and R2 `OperationOutcome` in `detail`) | **NACK** (`MSA\|AE`) for business/ambiguous conflict; **ACK** (`MSA\|AA`) if resolved as idempotent duplicate |
| **`429 Too Many Requests`** (R2 rate limit) | **Retryable** | No retry. Returns HTTP **`400`**. | Respect `Retry-After` if within request budget, or fail fast without holding gateway socket open; return retryable status with `Retry-After` forwarded. | **`503 Service Unavailable`** (or **`429 Too Many Requests`** with `Retry-After` and `retryable: true`) | **Retry** (gateway requeues / retries with backoff; do not send terminal NACK while retries remain) |
| **`5xx` (`500`, `502`, `503`, `504`)** | **Retryable** | No retry. Returns HTTP **`400`**. | Bounded short retry (or zero-retry if gateway owns retry loop — see open question below), using the same `Idempotency-Key`. If still failing, surface retryable status. | **`502 Bad Gateway`** or **`503 Service Unavailable`** (`retryable: true`) | **Retry** (gateway requeues / retries with backoff) |
| **Network error / timeout** (`AbortSignal.timeout`, DNS/TCP reset) | **Retryable** | No retry. Returns HTTP **`400`** (`"FHIR server request failed: ..."`). | Same as `5xx`: outcome is unknown, so any retry **must** carry the same `Idempotency-Key`. | **`504 Gateway Timeout`** (timeout) or **`502 Bad Gateway`** (connect/reset) with `retryable: true` | **Retry** (gateway requeues / retries with backoff) |

**Retry ownership note:** Because the Interop gateway already sits upstream of this stateless mapper and there is no broker between mapper and R2, retry ownership (gateway-only retries vs 1–2 short in-mapper retries within the gateway's HTTP timeout) must be aligned so total latency stays below the gateway's HL7 v2 MLLP/HTTP ACK timeout.

---

## 7. Open Questions

### Linked to `R2-1967` (Minimum resources & FHIR R4 vs R4B)

1. **FHIR R4 vs FHIR R4B boundary mismatch (critical):**
   - Agreed boundary version with R2 is **FHIR R4B**.
   - This mapper currently emits **FHIR R4** (upstream Microsoft FHIR Converter `v7.0` templates emit R4; `src/lib/projects/manifest.js` enforces `fhirVersion: "R4"`).
   - **Open decision:** Which R4B-specific fields/changes (if any) affect the in-scope resources (`Patient`, `Encounter`, `DocumentReference`, etc.)? Can R2 accept R4 payloads for the MVP resource subset where R4 and R4B are wire-compatible, or does the mapper need an R4→R4B transform / validation profile? *(No mapper output is changed until this is decided.)*
2. **Minimum required resource set per message type:**
   - Which HL7 v2 message types (e.g. `ADT^A01`/`A03`/`A08`, `MDM^T02`, `ORU^R01`) and which FHIR resource types inside their bundles are required by R2 for MVP, and should R2 ignore or reject extra resources emitted by built-in templates (e.g. `MessageHeader`, `Provenance`, `Organization`)?
3. **Identifier systems for non-core resources:**
   - Beyond `Patient` (MRN), `Encounter` (visit number), and `DocumentReference` (document ID), which other resources require conditional create/update vs unconditional `POST`, and what identifier systems will be configured per customer?

### Linked to `R2-1968` (Corrections, history, and replay after 14-day gateway retention)

4. **Idempotency key format and deduplication window:**
   - Confirm whether `Idempotency-Key` should be `{msh10}` or `{customerId}:{msh10}` (or include `MSH-3`/`MSH-4` sending app/facility), and how long R2 retains idempotency keys relative to the Interop gateway's **14-day** retention window.
5. **Updates, corrections, and out-of-order messages:**
   - Does R2 expect `conditional_update` (`PUT ?identifier=`) or `conditional_create` (`POST` + `If-None-Exist`) per resource type?
   - When an HL7 v2 correction (`ADT^A08`, amended `MDM^T02`/`ORU^R01`, or replay) arrives, how are resource history/versioning and out-of-order timestamps handled? (Today, `sendResource.js` has no `If-Match` or timestamp guard.)
6. **Ambiguous conditional matches (`409` vs `412`):**
   - What exact HTTP status code and `OperationOutcome` code will R2 return when a conditional `PUT` or `If-None-Exist` matches more than one resource, vs when an idempotent duplicate arrives?
7. **Replay after the gateway's 14-day retention:**
   - Because this mapper is stateless and does not persist raw HL7 v2 messages (`src/lib/conversions/failureLog.js` stores only `MSH-10`, template, and error message), any replay beyond the gateway's 14-day retention must come from R2 or an external archive. Confirm whether R2 stores the received FHIR Bundle (or raw payload) for re-processing/audit.

### Linked to `R2-1969` (Outbound: R2 → Mapper → Interop gateway)

8. **Outbound trigger and endpoint contract:**
   - Today the mapper exposes `POST /api/v1/customers/:customerId/outbound/:template(*)` (`src/routes/customers.routes.js`), accepting a self-contained FHIR R4 Bundle (`document` or `collection`) and optionally delivering HL7 v2 to `targets.hl7v2Gateway` with `Idempotency-Key` from `MSH-10` and `MSA` ACK verification (`src/lib/customers/customerPipeline.js`).
   - Confirm how R2 will invoke outbound conversion (synchronous REST call to the mapper with a FHIR R4B Bundle?), which FHIR resources/profiles R2 will send (e.g. discharge `DocumentReference`/`Composition`), and whether R4B→R4 compatibility impacts `src/reverse-templates/FhirToHl7v2/`.

### Cross-cutting (unassigned / architecture)

9. **Service-to-service authentication (Mapper → R2):**
   - Confirm the cluster authentication mechanism between mapper and R2 (OAuth2 `client_credentials`, mTLS / service mesh, or scoped internal token) and whether `401` token-refresh retry is required.
10. **Gateway HTTP-to-HL7v2 ACK mapping & retry ownership:**
    - Confirm how the Interop gateway maps mapper HTTP status codes (`200`, `400`/`422`, `409`, `429`, `502`/`503`/`504`) to HL7 v2 `MSA` codes (`AA`, `AE`, `AR`) and retry queues (**unverified** in this repository), and confirm whether transient retries (`429`/`5xx`/timeout) live exclusively in the gateway or also in the mapper.
