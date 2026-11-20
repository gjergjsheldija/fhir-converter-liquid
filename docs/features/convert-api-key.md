# Convert API key

[Features](../features.md)

Set `CONVERT_API_KEY` in the server environment to require `Authorization: Bearer <CONVERT_API_KEY>` on conversion and sensitive studio API routes:

- Convert routes: `POST /api/v1/convert/{srcDataType}`, `POST /api/v1/convert/{srcDataType}/{template}`, `POST /api/v1/projects/convert`, and `POST /api/v1/projects/{projectId}/convert/{template}`
- Studio and management routes: `/api/v1/browse/*`, `PUT /api/v1/templates/*`, `/api/v1/projects*`, `/api/v1/fhir/*`, `POST /api/v1/templategenerate`, `POST /api/v1/field-map`, and `GET /api/v1/conversions/failures`

The variable is read on each request. When it is unset or empty, those routes stay open and any `Authorization` header is ignored. When it is set, the header must be exactly `Bearer ` followed by the variable's value. `bearer`, a missing prefix, and a trailing space are rejected. The comparison does not stop at the first differing character.

A rejected request returns 401 and `Convert API key is required.` The handler does not read the body. `/health`, `/version`, and `/metrics` remain reachable for container probes.

## The editor

**Settings → Editor → Convert API key** is stored in this browser as `convertApiKey`. When set, the browser editor attaches `Authorization: Bearer <CONVERT_API_KEY>` automatically to server API requests (conversion, project open/save, folder browse, template writes, field map, AI template generation, failure log, and the `/api/v1/fhir/*` proxy calls).

![Convert API key on the Editor settings tab](../images/convert-api-key.png)

Leave the field empty when the server has no key. Target FHIR server credentials for Validate and Send remain configured separately under **Settings → FHIR server**.

## Headless project convert route

`POST /api/v1/projects/:projectId/convert/:template` runs a conversion against a local project on disk without opening a browser session:

```bash
curl -X POST http://localhost:2019/api/v1/projects/hosp-a/convert/ADT_A01 \
  -H "Authorization: Bearer $CONVERT_API_KEY" \
  -H "Content-Type: text/plain" \
  --data-binary @message.hl7
```

`:projectId` is resolved under `PROJECTS_ROOT` (default `./projects`; path traversal outside `PROJECTS_ROOT` is rejected). The endpoint loads `fhir-converter.json`, renders with the project's templates and built-in partial fallback, enforces `declaredSegments` when debug/diagnostics are requested, applies the project's [site pack](site-pack.md) (`conceptmaps/*.json` and `identifiers.json`), and writes PHI-free `MSH-10` entries to the audit and failure logs.

## Headless runtime mode

Set `HEADLESS_RUNTIME=true` in cloud or production deployments to run the converter strictly as a stateless conversion service:

- Browser studio pages, folder browse (`/api/v1/browse/*`), template and sample writes (`PUT /api/v1/templates/*`, `PUT /api/v1/sample-data/*`), studio project management, and outbound FHIR proxy routes (`/api/v1/fhir/*`) are disabled and return HTTP `403`.
- `/health`, `/version`, `/metrics`, and the authenticated convert routes (`POST /api/v1/convert/*` and `POST /api/v1/projects/:projectId/convert/:template`) stay active.

Combine `HEADLESS_RUNTIME=true` with `CONVERT_API_KEY` and `PROJECTS_ROOT` when deploying behind an integration engine or API gateway.

## Audit line

Attempts on the inline convert route, the studio project convert route, and `POST /api/v1/projects/:projectId/convert/:template` append one JSON line to `data/conversion-audit.jsonl`:

```json
{"at":"2026-11-20T09:00:00.000Z","status":200,"template":"ADT_A01","controlId":"MSG00001"}
```

| Field | Meaning |
| --- | --- |
| `at` | Time the line was written, UTC |
| `status` | HTTP status of the attempt, including 401 |
| `template` | Template name when the request named one. Empty on a 401 when the template was in the unread request body |
| `controlId` | MSH-10 when the body was read and the message has one. Empty on a 401, because the body is not read |

The line has no message body and no key. Writes are queued asynchronously so disk I/O does not block conversion responses, and `data/conversion-audit.jsonl` rotates automatically to `data/conversion-audit.jsonl.1` once it reaches `5 MB`. A write error while appending the line does not change the conversion response.

The process access log is separate and can still contain the request body, including a 401.
