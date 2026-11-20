# Failure log

[Features](../features.md)

A failed conversion appends one JSON line to `data/conversion-failures.jsonl`. The directory is created if needed. The file is gitignored.

A row is written when `POST /api/v1/convert/{srcDataType}`, `POST /api/v1/projects/convert`, or `POST /api/v1/projects/:projectId/convert/:template` returns a status other than 200. Validate and Send are not counted. A successful conversion increments a counter and writes nothing to this file.

Writes are non-blocking async appends, and `data/conversion-failures.jsonl` rotates automatically to `data/conversion-failures.jsonl.1` when the file reaches `5 MB`.

## What a row contains

```json
{"at":"2026-11-20T09:00:00.000Z","template":"ADT_A01","message":"Unable to parse input data.","controlId":"MSG00001"}
```

| Field | Meaning |
| --- | --- |
| `at` | Time the row was written, UTC |
| `template` | Template name from the request or URL. Empty when the request did not name one |
| `message` | Error text, cut at 500 characters |
| `controlId` | MSH-10 when the first segment is `MSH` and field 10 is present. Otherwise empty |

The raw message is read only to find MSH-10. It is not stored in the row. A C-CDA document has no MSH segment, so `controlId` is empty. A write error while appending the row does not change the conversion response.

The process access log is separate. It can still contain the request body. This file does not.

## Reading the log

```bash
curl http://localhost:2019/api/v1/conversions/failures \
  -H "Authorization: Bearer $CONVERT_API_KEY"
```

When `CONVERT_API_KEY` is set on the server, `GET /api/v1/conversions/failures` requires `Authorization: Bearer <CONVERT_API_KEY>`. When no key is configured, omit the header.

The response is:

```json
{"failures":[],"failed":0,"succeeded":0}
```

`failures` is the last 50 rows in the file, oldest first in that slice. A missing file is an empty list. A damaged line is skipped. `failed` and `succeeded` count since this process started. They reset when the process restarts. The file does not.
