# Spec 07: Validate the result against the Settings FHIR server

**Status:** Done (2026-11-19) — `$validate` route, Validate button, and Debug drawer Validation tab verified by mocked-fetch unit tests, full validation (633 passing, 0 unexpected, official 132/0/0) and a live browser check. Follow `.agents/skills/codemirror5-vanilla-ui/SKILL.md`, `.agents/skills/spec-runner/SKILL.md`, and `AGENTS.md`. Editor spec 06 is Done and on `origin/main` at `91902b7`. Do not start the site pack in this change.

## 1. Goal

A separate **Validate** action posts the current FHIR result to the Settings FHIR server at `{base}/$validate` and shows the OperationOutcome issues in the Debug drawer. Convert does not call the server.

## 2. Current behavior

- Settings stores `fhirBaseUrl`, `fhirAuth`, `fhirToken`, `fhirUsername`, and `fhirPassword` in the browser (`#settings-fhir-url` and the related fields in `src/static/index.html`, read in `src/static/js/template-editor.js`).
- `POST /api/v1/fhir/send` calls `sendResource` in `src/lib/fhir/sendResource.js`. That POSTs the resource to the server root for a transaction or batch Bundle, and to `{base}/{resourceType}` otherwise. It uses bearer or basic auth from `fhirHeaders`.
- There is no `$validate` call. The Debug drawer has no validation list.
- Convert writes `window.latestDebugInfo.fhirResource` and does not contact the FHIR server. A down server must not fail Convert.

## 3. Files you may edit

- `src/lib/fhir/sendResource.js` and `src/lib/fhir/sendResource.spec.js` (create the spec file if it does not exist)
- `src/routes.js` and `src/routes.spec.js` for `POST /api/v1/fhir/validate` only
- `src/static/js/template-editor.js` for the Validate button and the request
- `src/static/js/debug-drawer.js` to render OperationOutcome issues
- `src/static/index.html` and `src/static/css/template-editor.css` only for that button and the issue list
- This spec's `**Status:**` line, a row in `specs/web-ui/editor/00-order.md`, and a bullet in `specs/ORDER.md`

Do not edit `*.liquid` files, templates, samples, or official fixtures. Do not add a dependency. Do not add `import` or `export` inside `src/static/js/`. Do not change the default Send URL or method. Do not call validate from the convert request.

## 4. Requirements

1. `validateTarget(baseUrl)` returns `{base}/$validate` with the same URL checks as `fhirTarget` (http or https, no trailing slash on the base). It does not append a resource type.
2. `validateResource(baseUrl, resource, auth)` POSTs the resource JSON to that URL with `fhirHeaders(auth)`. It returns `{ ok, status, issues }`. `issues` is the `issue` array when the body is an OperationOutcome, otherwise an empty array plus `body` set to the parsed JSON or the first 500 characters of text.
3. A network failure or a non-2xx response is a 400 from this route with the server status or the error message. It does not throw from Convert.
4. `POST /api/v1/fhir/validate` accepts `{ baseUrl, resource, auth, token, username, password }` in the same shape Send already uses.
5. The navbar has a **Validate** button next to Send. It is enabled only when the result editor has a resource and Settings has a base URL. It does not use `window.alert`, `window.prompt`, or `window.confirm`.
6. The Debug drawer shows each issue's `severity`, `code`, and `diagnostics` or `details.text`. An empty issue list says the server returned no issues. A request error is shown in that same list.
7. Unit tests mock `fetch`. Cover the `$validate` URL, an OperationOutcome with two issues, and a network failure. Do not call a real FHIR server.

## 5. Validation

```sh
npx mocha --no-package --no-config src/lib/fhir/sendResource.spec.js --exit --timeout 10000
node scripts/test-summary.mjs
```

The summary must show 0 unexpected failures. Official classification stays 132 pass / 0 count / 0 content. ESLint and `git diff --check` must pass.

Restart the server and check `http://127.0.0.1:2019`: Convert still finishes when the FHIR URL is empty or the host is down. Validate with an empty URL does not send. If you cannot open the browser, say so in the handoff.

## 6. Acceptance criteria

- Validate posts to `{base}/$validate` and lists OperationOutcome issues in the Debug drawer.
- Convert does not call the FHIR server.
- Send still posts to the same URL it used before this spec.
- No Liquid template, sample, or official fixture was modified.
- Status, `specs/web-ui/editor/00-order.md`, and `specs/ORDER.md` say Done with the date.
