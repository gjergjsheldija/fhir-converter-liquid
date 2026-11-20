# Spec 07: Optional API key and an audit line

**Status:** Not started (2026-11-20). Follow `.agents/skills/spec-runner/SKILL.md`, `.agents/skills/test-baseline/SKILL.md`, and `AGENTS.md`. Do not start another gap spec in this change.

## 1. Goal

When `CONVERT_API_KEY` is set, convert routes require that key. When it is unset, the routes stay open, so the local editor keeps working. Each convert attempt writes one audit line with the time, the result status, the template name, and MSH-10. The line does not contain the message body or the key.

## 2. Current behavior

- `POST /api/v1/convert/:srcDataType`, `POST /api/v1/convert/:srcDataType/:template`, and `POST /api/v1/projects/convert` do not check an API key.
- The editor calls those routes without an `Authorization` header.
- Server logs from morgan include request metadata. They are not an audit of MSH-10.

If those routes already reject a missing key, stop and report the header they require.

## 3. Files you may edit

- `src/lib/conversions/convertAudit.js` and `convertAudit.spec.js` (create both)
- `src/routes.js` for the three convert routes only
- `src/static/js/template-editor.js` to send the key from a Settings field when the user has stored one
- `src/static/index.html` for that field
- `.env.example` to document `CONVERT_API_KEY`
- This spec's `**Status:**` line, the row in `specs/gap/00-order.md`, and the bullet in `specs/ORDER.md`

Do not add a dependency. Do not require a key when the environment variable is empty. Do not log the request body. Do not protect Validate, Send, or the static UI.

## 4. Requirements

1. `authorizeConvert(envValue, headerValue)` returns true when `envValue` is empty or when `headerValue` equals `Bearer ` plus `envValue`. Otherwise it returns false.
2. A false result is HTTP 401 with the existing error JSON shape and message `Convert API key is required.` The conversion function is not called.
3. The editor Settings field `#settings-convert-api-key` is stored in the browser as `convertApiKey`. When it is non-empty, convert requests send `Authorization: Bearer <key>`. When it is empty, they send no Authorization header. The key is not sent to Generate, Validate, or Send.
4. `auditLine(entry)` returns one JSON line `{at, status, template, controlId}`. `controlId` uses the same MSH-10 rule as gap spec 06. The function does not accept a body property. Tests pass a fixture string only to derive `controlId`, and assert the returned line has no message text.
5. Both 200 and non-200 convert attempts append that line to `data/conversion-audit.jsonl`, gitignored. A 401 appends `status: 401` and an empty `controlId` without reading the body.

## 5. Validation

```sh
npx mocha --no-package --no-config src/lib/conversions/convertAudit.spec.js --exit --timeout 10000
node scripts/test-summary.mjs
```

Official classification stays 132 pass / 0 count / 0 content. ESLint and `git diff --check` must pass. With `CONVERT_API_KEY` unset, a convert from the page still succeeds.

## 6. Acceptance criteria

- An unset key leaves convert open.
- A set key rejects a missing or wrong Bearer token with 401 and does not convert.
- The audit line has MSH-10 and the status, and not the message or the key.
- Status, `specs/gap/00-order.md`, and `specs/ORDER.md` say Done with the date.

## 7. Git

Branch from current `main`: `feat/gap-07-convert-audit`. One commit, then merge into `main`. Push with `gh auth switch --user gjergjsheldija`, then `git push origin main`, then `gh auth switch --user gjergjsheldija-recare`. Do not force-push. Do not commit a real key.
