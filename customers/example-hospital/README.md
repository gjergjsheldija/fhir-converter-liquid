# Example University Hospital (`example-hospital`)

Reference per-customer profile demonstrating bidirectional HL7v2 <-> FHIR R4 conversion, secret resolution, and outbound delivery.

## Directory Layout

- `config.yaml` — Customer identifiers, HL7v2 MSH defaults, inbound authentication, and outbound FHIR / HL7v2 REST gateway targets. No plaintext credentials are stored in YAML; all secrets use `secretRef` URIs.
- `input/` — Customer-specific `HL7v2 -> FHIR` Liquid overrides (falls back to built-in `Hl7v2` templates when `defaults.fallbackToBuiltin: true`).
  - `input/ADT_A01.liquid` — Minimal custom Patient + Encounter `Bundle` override using Example University Hospital identifier systems.
- `output/` — Customer-specific `FHIR -> HL7v2` Liquid overrides (falls back to built-in `FhirToHl7v2` templates when `defaults.fallbackToBuiltin: true`).
  - `output/MDM_T02.liquid` — Custom `MDM^T02` discharge summary outbound template reading `customerContext`.

## Local Quickstart

Set the JSON secret bundle referenced by `config.yaml` in your environment:

```sh
export EXAMPLE_HOSPITAL_SECRETS='{
  "inboundApiKey": "local-dev-customer-key",
  "fhirBearerToken": "local-dev-fhir-token",
  "hl7v2GatewayApiKey": "local-dev-gateway-key"
}'
```

In production deployments, point `secretRef` fields in `config.yaml` at AWS Secrets Manager (`aws-sm://`), OpenBao / HashiCorp Vault KV v2 (`vault://`), Infisical (`infisical://`), or Kubernetes CSI mounted secret files (`file://`).
