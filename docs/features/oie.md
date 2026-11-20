# Open Integration Engine

[Features](../features.md)

`integrations/oie/hl7v2-to-fhir.xml` is a channel you import into Open Integration Engine. This server does not listen on TCP and does not speak MLLP. OIE receives the HL7 v2 message over MLLP, posts it to the converter over HTTP, and returns an HL7 ACK or NACK to the upstream sender.

## What the channel does

1. A sender opens TCP port `6661` on OIE and transmits an MLLP-framed HL7 v2 message. The source connector is a TCP Listener with `respondAfterProcessing` enabled, so the sender waits for the HTTP destination result.
2. The channel reads `MSH-9` to derive `templateName` dynamically: `MSH-9.3` (for example `ADT_A01`) when populated, otherwise `MSH-9.1_MSH-9.2` (for example `ORU_R01`), with `ADT_A01` as fallback.
3. It builds the request payload with `JSON.stringify({ srcData, template: templateName })`, preserving `\r` segment breaks, quotes, and HL7 escape sequences (`\F\`, `\S\`, `\T\`, `\R\`, `\E\`).
4. When `CONVERT_API_KEY` is defined in OIE's `configurationMap`, the HTTP Sender forwards `Authorization: Bearer <CONVERT_API_KEY>`.
5. On an HTTP `2xx` response from `http://127.0.0.1:2019/api/v1/convert/hl7v2`, the channel returns an HL7 ACK containing `MSA|AA|<MSH-10>`. On an HTTP error or connection failure, it returns an HL7 NACK containing `MSA|AE|<MSH-10>` so the upstream EHR or interface engine can retry or alert instead of silently dropping the message.

## Routing through a customer project pack

To convert through a customer project under `PROJECTS_ROOT` (default `./projects`) — applying that project's Liquid overrides, `declaredSegments`, and [site pack](site-pack.md) — change the HTTP Sender URL path in OIE from `/api/v1/convert/hl7v2` to:

```text
/api/v1/projects/<projectId>/convert/${templateName}
```

For example, `/api/v1/projects/hosp-a/convert/${templateName}` routes `ADT^A01` to `hosp-a`'s `ADT_A01.liquid` and `ORU^R01` to `hosp-a`'s `ORU_R01.liquid`.

## PHI and logging

This server does not archive inbound HL7 message bodies on disk. Audit and failure entries written during OIE calls record only timestamp, HTTP status, template name, and `MSH-10`, as described in [Convert API key](convert-api-key.md) and [Failure log](failure-log.md).
