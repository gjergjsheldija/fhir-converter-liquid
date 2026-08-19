# FHIR Bundle Conversion

The FHIR Converter transforms HL7v2 messages to FHIR R4 bundles using Liquid templates.

## APIs

To convert data, use the POST endpoints:

| Function | Syntax                    | Details                                         |
|----------|---------------------------|-------------------------------------------------|
|POST      |/api/convert/{srcDataType} |Takes data and templates as input, outputs FHIR data. Entry-point template passed base64-encoded in `templateBase64` parameter. Optional overriding templates passed in `templatesOverrideBase64`.|
|POST      |/api/convert/{template}    |Converts data using a stored template.|

### Query Parameters

- `unusedSegments=true` - Returns segments present in the message but not accessed by the template
- `invalidAccess=true` - Returns segments the template tried to access that didn't exist

### Examples

1. `/api/convert/hl7v2/ADT_A01`
   - Convert HL7v2 data using the ADT_A01 template

2. `/api/convert/hl7v2/ADT_A01?unusedSegments=true&invalidAccess=true`
   - Convert and return diagnostic information

## Conversion Response

Each conversion returns up to three pieces of information:

| Section | Details |
|---------|---------|
| **fhirResource** | The resulting FHIR R4 bundle |
| **unusedSegments** | Segments in the message not accessed by the template (when requested) |
| **invalidAccess** | Segments the template tried to access but didn't exist (when requested) |

## Timezone Handling

Add a `timezone` header to convert date/times to a specific timezone:

```
POST /api/convert/hl7v2/ADT_A01
Content-Type: text/plain
timezone: America/New_York
```
