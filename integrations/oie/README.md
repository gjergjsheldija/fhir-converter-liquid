# Open Integration Engine channel: HL7 v2 to FHIR

`hl7v2-to-fhir.xml` is an Open Integration Engine (OIE / Mirth Connect `4.5.0`) channel you can import.

This Node server does not listen on TCP and does not speak MLLP. OIE receives the HL7 v2 message on its TCP Listener source (`0.0.0.0:6661`), serializes a safe JSON request body, posts it to the converter at `http://127.0.0.1:2019/api/v1/convert/hl7v2`, and returns an HL7 v2 ACK or NACK to the upstream MLLP sender.

## Flow

1. The sender opens a TCP/MLLP connection to OIE (port `6661` in the channel) and sends a multi-segment HL7 v2 message.
2. The source `<transformer>` JavaScript step inspects `MSH` using its dynamic field (`MSH[3]`) and component (`MSH[4]`) separators:
   - Extracts `MSH-10` (message control ID) into `msh10`.
   - Derives `templateName` dynamically from `MSH-9`.
   - Serializes `{"srcData": rawMessage, "template": templateName}` via `JSON.stringify(...)` into `${converterPayload}`.
3. The HTTP Sender destination POSTs `${converterPayload}` (`application/json`) to the converter API.
4. The destination `<responseTransformer>` inspects the HTTP status code and returns an HL7 v2 `MSA|AA|<MSH-10>` ACK on `2xx` or `MSA|AE|<MSH-10>|Conversion failed` NACK on `4xx`/`5xx`.

## Dynamic `MSH-9` Template Routing

Hospital MLLP feeds typically multiplex multiple HL7 v2 event types over a single TCP port (`ADT^A01`, `ADT^A04`, `ADT^A08`, `ORU^R01`, `ORM^O01`, `SIU^S12`, `VXU^V04`, etc.).

The source transformer derives `templateName` from `MSH-9`:

- Uses `MSH-9.3` if formatted like `<TYPE>_<EVENT>` (for example `ADT^A04^ADT_A01` -> `ADT_A01`).
- Otherwise combines `MSH-9.1` + `_` + `MSH-9.2` (`MSH-9.1_MSH-9.2`, for example `ORU^R01` -> `ORU_R01`, `VXU^V04` -> `VXU_V04`).
- Falls back to `ADT_A01` if `MSH-9` is missing or malformed.

## RFC-8259 Safe JSON Serialization

Multi-segment HL7 v2 messages use raw `0x0D` (`\r`) segment terminators, backslash characters (`\`) in `MSH-2` encoding characters (`|^~\&|`) and HL7 escape sequences (`\F\`, `\T\`), and double quotes (`"`) in clinical notes (`OBX-5`, `NTE-3`).

Interpolating raw HL7 v2 directly into a JSON string template produces invalid RFC-8259 JSON. The source transformer instead builds `${converterPayload}` with `JSON.stringify({ srcData: rawMessage, template: templateName })`, preserving `\r`, `\`, and `"` byte-for-byte after JSON parsing.

## Authentication (`CONVERT_API_KEY`) and Customer Projects

- **Optional `CONVERT_API_KEY`:** Set `CONVERT_API_KEY` in OIE Settings -> **Configuration Map** (`configurationMap`). When present, the source transformer sets `${authHeader}` to `Bearer <key>` for the HTTP Sender `Authorization` header; when unset or empty, `${authHeader}` is empty so no token is sent.
- **Calling a deployed customer project:** To convert using a custom project instead of the built-in templates endpoint, change the HTTP Sender `<path>` from `/api/v1/convert/hl7v2` to `/api/v1/projects/<projectId>/convert/${templateName}`.

## ACK and NACK (`MSH-10`)

The response echoes the inbound control ID: `MSA-2` always equals the inbound `MSH-10`.

Inbound:

```text
MSH|^~\&|SENDER|FAC|OIE|FAC|20261119120000||ADT^A01|MSG00001|P|2.5
PID|1||12345^^^HOSP^MR||DOE^JANE
```

ACK (`2xx` HTTP response, `>= 200 && < 300`):

```text
MSH|^~\&|OIE|FAC|SENDER|FAC|20261119120001||ACK|ACKMSG00001|P|2.5
MSA|AA|MSG00001
```

NACK (`4xx`/`5xx` HTTP response or unreachable converter):

```text
MSH|^~\&|OIE|FAC|SENDER|FAC|20261119120001||ACK|ACKMSG00001|P|2.5
MSA|AE|MSG00001|Conversion failed
```

Here `MSG00001` is the inbound `MSH-10` and is carried in `MSA-2` for both `MSA|AA|MSG00001` and `MSA|AE|MSG00001|Conversion failed`.
