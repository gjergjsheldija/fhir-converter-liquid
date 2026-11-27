# Customer pipelines & Vault

[Features](../features.md)

Customer pipelines organize bidirectional `HL7v2 -> FHIR` (`inbound`) and `FHIR -> HL7v2` (`outbound`) integrations per hospital, clinic, or tenant under `CUSTOMERS_ROOT` (default `./customers`). Each customer directory pairs Liquid templates with a declarative `config.yaml` whose target credentials are resolved at runtime from AWS Secrets Manager, OpenBao / HashiCorp Vault, Infisical, mounted Kubernetes secret files, or environment variables — keeping git repositories completely free of plaintext secrets.

## Folder layout under `CUSTOMERS_ROOT`

Each customer lives in `./customers/<customerId>/`:

```text
customers/
└── klinikum-mitte/
    ├── config.yaml              # Identifiers, MSH headers, targets, and secretRef URIs
    ├── input/                   # HL7v2 -> FHIR templates & partial overrides
    │   ├── ADT_A01.liquid
    │   ├── ORU_R01.liquid
    │   └── DataType/
    │       └── _Patient.liquid
    ├── output/                  # FHIR -> HL7v2 templates & partial overrides
    │   ├── MDM_T02.liquid
    │   ├── ADT_A03.liquid
    │   └── ORU_R01.liquid
    ├── conceptmaps/             # Optional inbound ConceptMap JSON files (site pack)
    └── identifiers.json         # Optional inbound Assigning Authority identifier map
```

- `config.yaml`: Defines customer identifiers, outbound/inbound `MSH` header defaults, correlation ID enforcement (`requireCorrelationIds`), and delivery targets (`targets.fhirServer` and `targets.hl7v2Gateway`).
- `input/`: Holds customer-specific `HL7v2 -> FHIR` templates and partials. Any partial not overridden in `input/` falls back automatically to the built-in `Hl7v2` template library.
- `output/`: Holds customer-specific [FHIR to HL7 v2](fhir-to-hl7v2.md) templates (`MDM_T02.liquid`, `ADT_A03.liquid`, `ORU_R01.liquid`) and partials, falling back to the built-in `FhirToHl7v2` template library when a template or partial is not overridden locally.

## Annotated `config.yaml`

```yaml
customerId: klinikum-mitte
name: Klinikum Mitte
description: Bidirectional inpatient ADT/ORU ingest and discharge MDM/ADT outbound feed

# Enforces non-empty message correlation IDs (MSH-10 on inbound HL7v2,
# Bundle.id / patient & encounter identifiers on outbound FHIR Bundles)
requireCorrelationIds: true

# Exposed to Liquid templates as customer.identifiers.*
identifiers:
  mrnSystem: "urn:oid:1.2.276.0.76.4.8"
  visitNumberSystem: "https://klinikum-mitte.example/fhir/sid/visit-number"
  assigningAuthority: "KLINIKUM_MITTE"
  facilityOid: "1.2.276.0.76.4.8"

# Exposed to outbound Liquid templates as customer.msh.*
msh:
  sendingApplication: "FHIR_CONVERTER"
  sendingFacility: "CLOUD_HUB"
  receivingApplication: "KIS_ORBIS"
  receivingFacility: "KLINIKUM_MITTE"
  processingId: "P"
  versionId: "2.5.1"
  characterSet: "UTF-8"

targets:
  # Inbound target: receives FHIR R4 Bundles converted from HL7v2
  fhirServer:
    baseUrl: "https://fhir.klinikum-mitte.example/fhir"
    timeoutMs: 15000
    # transactionMode: "none" | "conditional_create" (If-None-Exist) | "conditional_update" (PUT)
    transactionMode: "conditional_update"
    auth:
      type: "oauth2_client_credentials"
      tokenUrl: "https://idp.klinikum-mitte.example/oauth2/token"
      clientId: "fhir-converter-ingestor"
      clientSecretRef: "aws-sm://prod/customers/klinikum-mitte#fhirClientSecret"
      scope: "system/*.write"

  # Outbound target: receives HL7v2 ER7 messages converted from FHIR R4 Bundles
  hl7v2Gateway:
    url: "https://edge.klinikum-mitte.example/hl7v2/inbound"
    timeoutMs: 10000
    # format: "json_envelope" | "raw_er7"
    format: "json_envelope"
    # Verify MSA|AA (and matching MSA-2 control ID) in the gateway response
    requireApplicationAck: true
    auth:
      type: "bearer"
      tokenRef: "vault://secret/data/customers/klinikum-mitte#hl7GatewayToken"
```

### Target authentication and delivery modes

Both `targets.fhirServer.auth` and `targets.hl7v2Gateway.auth` support four authentication modes without storing raw secrets in `config.yaml`:

| `auth.type` | Required fields | Behavior |
| --- | --- | --- |
| `none` | None | Sends unauthenticated HTTP requests (for cluster-local mTLS / service-mesh sidecars) |
| `bearer` | `tokenRef` | Resolves the secret reference and sends `Authorization: Bearer <token>` |
| `basic` | `username`, `passwordRef` (or `usernameRef`, `passwordRef`) | Resolves credentials and sends HTTP Basic `Authorization` |
| `oauth2_client_credentials` | `tokenUrl`, `clientId`, `clientSecretRef` (optional `scope`, `audience`) | Resolves `clientSecretRef`, exchanges client credentials at `tokenUrl`, caches the access token until expiry, and sends `Authorization: Bearer <access_token>` |

For `targets.fhirServer`, `transactionMode` controls how converted FHIR Bundles are written (matching [Conditional send](conditional-send.md)):

- `none` (default): Posts the Bundle as produced by the template.
- `conditional_create`: Rewrites `batch`/`collection` Bundles into a `urn:uuid:` `transaction` using `POST` + `If-None-Exist: identifier={system}|{value}` and strips client `resource.id`.
- `conditional_update`: Rewrites `batch`/`collection` Bundles into a `urn:uuid:` `transaction` using conditional `PUT {resourceType}?identifier={system}|{value}` and strips client `resource.id`.

For `targets.hl7v2Gateway`, `format` selects the wire payload:

- `json_envelope`: Posts `Content-Type: application/json` with `{ "hl7Message": "...", "controlId": "...", "messageType": "...", "customerId": "..." }` and reads the gateway's HL7 ACK from JSON (`ack`, `hl7Ack`, `response`) or plain text.
- `raw_er7`: Posts `Content-Type: application/hl7-v2; charset=utf-8` with the `\r`-terminated ER7 message body directly and parses the raw ER7 ACK response.

## Pluggable `secretRef` schemes

Any field ending in `Ref` (such as `clientSecretRef`, `tokenRef`, `passwordRef`) uses a URI scheme to select its secret provider at runtime:

| Scheme | Example `secretRef` | Backing provider and environment variables |
| --- | --- | --- |
| `aws-sm://` | `aws-sm://prod/customers/klinikum-mitte#fhirClientSecret` | AWS Secrets Manager via `@aws-sdk/client-secrets-manager` using the standard AWS credential chain (IRSA, EKS Pod Identity, ECS task role, or env credentials) and `AWS_REGION` |
| `vault://` | `vault://secret/data/customers/klinikum-mitte#hl7GatewayToken` | OpenBao or HashiCorp Vault KV v2 HTTP API using `VAULT_ADDR` and `VAULT_TOKEN` (plus optional `VAULT_NAMESPACE`) |
| `infisical://` | `infisical://prod/customers/klinikum-mitte#fhirClientSecret` | Infisical Secrets REST API using `INFISICAL_URL` and `INFISICAL_TOKEN` |
| `file://` | `file://klinikum-mitte/credentials.json#clientSecret` | Mounted secret files resolved strictly inside `SECRETS_FILE_ROOT` (Kubernetes `Secret` mounts, Secrets Store CSI Driver, External Secrets, or `/run/secrets`; `..` path traversal is rejected) |
| `env://` | `env://KLINIKUM_MITTE_CLIENT_SECRET` | Process environment variable lookup for local development and CI tests |

### `#jsonKey` extraction, TTL caching, and automatic `401` refresh

- **`#jsonKey` fragment extraction:** Appending `#<key>` (for example `aws-sm://prod/fhir/klinikum#clientSecret` or `file://klinikum/oauth.json#clientSecret`) parses the secret payload as JSON and extracts that property. Omitting `#<key>` returns the trimmed raw string secret.
- **In-memory TTL caching:** Resolved secrets and OAuth2 `client_credentials` access tokens are cached in memory with bounded TTL (honoring OAuth2 `expires_in` minus a safety refresh window) so sustained HL7 v2 / FHIR message bursts do not throttle Vault or AWS Secrets Manager.
- **Automatic `401` secret & token refresh:** If a downstream FHIR server or HL7 v2 REST gateway responds with HTTP `401 Unauthorized` (for example right after a secret or signing key rotation), the delivery client evicts both the cached secret and any cached OAuth2 access token, resolves fresh credentials from the Vault provider, mints a new token if needed, and retries the outbound delivery once automatically.

## Customer HTTP endpoints

When `CONVERT_API_KEY` is set, all `/api/v1/customers*` endpoints require `Authorization: Bearer <CONVERT_API_KEY>` (see [Convert API key](convert-api-key.md)).

### Inspect customers (`GET /api/v1/customers` and `GET /api/v1/customers/:customerId`)

`GET /api/v1/customers` lists every valid customer directory under `CUSTOMERS_ROOT`. `GET /api/v1/customers/:customerId` returns the customer metadata, discovered `input/` and `output/` templates, and target configuration with secret references redacted so credentials are never leaked over HTTP:

```bash
curl -H "Authorization: Bearer $CONVERT_API_KEY" \
  http://localhost:2019/api/v1/customers/klinikum-mitte
```

### Inbound pipeline: `HL7v2 -> FHIR` (`POST /api/v1/customers/:customerId/inbound/:template`)

Converts an inbound HL7 v2 ER7 message into a FHIR R4 `Bundle` using `customers/<customerId>/input/<template>.liquid` (falling back to built-in `Hl7v2` templates/partials) and applies any customer `conceptmaps/*.json` and `identifiers.json` rules. Pass `?deliver=true` to push the resulting FHIR Bundle directly to `targets.fhirServer`:

```bash
# Convert HL7v2 ADT^A01 -> FHIR R4 and deliver to the customer's FHIR server
curl -X POST "http://localhost:2019/api/v1/customers/klinikum-mitte/inbound/ADT_A01?deliver=true" \
  -H "Authorization: Bearer $CONVERT_API_KEY" \
  -H "Content-Type: text/plain" \
  --data-binary @adt-a01.hl7
```

- Without `?deliver=true`: Returns the converted FHIR R4 Bundle (`fhirResource`) without contacting `targets.fhirServer`.
- With `?deliver=true`: Resolves `targets.fhirServer.auth` via Vault/Secrets Manager, applies the configured `transactionMode` (`conditional_create` or `conditional_update`), posts to `targets.fhirServer.baseUrl`, and returns both `fhirResource` and `delivery` status.

### Outbound pipeline: `FHIR -> HL7v2` (`POST /api/v1/customers/:customerId/outbound/:template`)

Converts a self-contained FHIR R4 `Bundle` (`document` or `collection`, such as a Hospital Discharge `Composition` or `QuestionnaireResponse` Bundle) into an HL7 v2 ER7 message using `customers/<customerId>/output/<template>.liquid` (falling back to built-in `FhirToHl7v2` templates) with `customer` context (`msh`, `identifiers`) injected. Pass `?deliver=true` to transmit the ER7 message to `targets.hl7v2Gateway` and verify `MSA|AA`:

```bash
# Convert FHIR Discharge Bundle -> HL7v2 MDM^T02, deliver to gateway, and verify MSA|AA
curl -X POST "http://localhost:2019/api/v1/customers/klinikum-mitte/outbound/MDM_T02?deliver=true" \
  -H "Authorization: Bearer $CONVERT_API_KEY" \
  -H "Content-Type: application/fhir+json" \
  --data-binary @discharge-bundle.json
```

- Enforces `requireCorrelationIds` before conversion/delivery when enabled in `config.yaml`.
- Without `?deliver=true`: Negotiates JSON envelope (`Accept: application/json`) or raw ER7 (`Accept: application/hl7-v2`) just like `/api/v1/convert/fhir/:template`.
- With `?deliver=true`: Resolves `targets.hl7v2Gateway.auth` via Vault/Secrets Manager, posts the rendered HL7 v2 message in `json_envelope` or `raw_er7` format, parses the returned HL7 ACK, verifies `MSA|AA` (and matching `MSA-2` control ID) when `requireApplicationAck: true`, and returns `{ status, controlId, messageType, hl7Message, delivery }`. If the gateway returns `MSA|AE` or `MSA|AR`, the request fails with the parsed ACK error details so upstream callers or queues can retry safely.
