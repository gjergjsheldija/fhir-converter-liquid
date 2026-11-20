# Spec 06: Failure log

**Status:** Done (2026-11-20). Verified by unit tests and real HTTP: a failed convert added a row with MSH-10 and no body, a 200 convert added none, counts matched. Follow `.agents/skills/spec-runner/SKILL.md`, `.agents/skills/test-baseline/SKILL.md`, and `AGENTS.md`. Do not start another gap spec in this change.

## 1. Goal

A conversion that returns an error is appended to a local log the API can list. Each row has the time, the template name, the error message, and MSH-10 when the body is HL7 v2. The raw message is not stored. There is no replay in this spec.

## 2. Current behavior

- Convert routes return the error JSON and keep no history.
- `GET /health` and the logs do not count successes against failures.
- Nothing in `src/` writes a dead-letter file.

If a failure list route already exists, stop and report it.

## 3. Files you may edit

- `src/lib/conversions/failureLog.js` and `failureLog.spec.js` (create both)
- `src/routes.js` for the convert error paths and a new `GET /api/v1/conversions/failures`
- `.gitignore` for the log directory
- This spec's `**Status:**` line, the row in `specs/gap/00-order.md`, and the bullet in `specs/ORDER.md`

Do not edit templates. Do not add a dependency. Do not store the request body. Do not add a replay route.

## 4. Requirements

1. The log file is `data/conversion-failures.jsonl`, gitignored. `appendFailure(entry)` writes one JSON line. `listFailures(limit)` returns the last `limit` objects, newest last, up to 50. A missing file is an empty list.
2. An entry is `{at, template, message, controlId}`. `at` is an ISO time. `template` is the template name or an empty string. `message` is the error string, truncated to 500 characters. `controlId` is MSH-10 when the raw text's first segment id is `MSH` and field 10 is present, otherwise an empty string. The raw text is not a property.
3. On a non-200 convert response from `POST /api/v1/convert/:srcDataType` and `POST /api/v1/projects/convert`, append one entry. A 200 response appends nothing.
4. `GET /api/v1/conversions/failures` returns `{failures, failed, succeeded}` where `failed` and `succeeded` are counts since process start. `succeeded` increments on a 200 convert from those two routes. Do not count Validate or Send.
5. The unit test calls `appendFailure` and `listFailures` against a temp file. Assert the raw message is absent and a second failure is the second row.

## 5. Validation

```sh
npx mocha --no-package --no-config src/lib/conversions/failureLog.spec.js --exit --timeout 10000
node scripts/test-summary.mjs
```

Official classification stays 132 pass / 0 count / 0 content. ESLint and `git diff --check` must pass. Confirm `data/conversion-failures.jsonl` is gitignored.

## 6. Acceptance criteria

- A failed conversion adds one row with MSH-10 when the message has one.
- The row does not contain the HL7 body.
- A successful conversion increments `succeeded` and adds no row.
- Status, `specs/gap/00-order.md`, and `specs/ORDER.md` say Done with the date.

## 7. Git

Branch from current `main`: `feat/gap-06-failure-log`. One commit, then merge into `main`. Push with `gh auth switch --user gjergjsheldija`, then `git push origin main`, then `gh auth switch --user gjergjsheldija-recare`. Do not force-push.
