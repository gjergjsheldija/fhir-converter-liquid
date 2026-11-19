# Spec 08: Optional conditional create when sending a Bundle

**Status:** Done (2026-11-19) — focused spec 12 passing, full summary 650 passing / 0 unexpected, eslint and diff check clean; checkbox unchecked by default and Convert finishes at http://127.0.0.1:2019 (Send confirm not exercised in browser; no real FHIR server called). Follow `.agents/skills/codemirror5-vanilla-ui/SKILL.md`, `.agents/skills/spec-runner/SKILL.md`, `.agents/skills/test-baseline/SKILL.md`, `.agents/skills/spec-handoff/SKILL.md`, and `AGENTS.md`. Editor spec 07 is Done. Local `main` is `0dcce2b` and is two commits ahead of `origin/main` (`7d0793d`). Do not reset those commits. Do not start C-CDA in this change.

## 1. Goal

Send stays a single POST. A Settings option, off by default, rewrites a `batch` or `collection` Bundle into one transaction whose entries use `If-None-Exist` on the first identifier. A second send of the same MRN is still that one request. With the option off, the POST body is the result unchanged.

## 2. Current behavior

- `fhirTarget` in `src/lib/fhir/sendResource.js` posts a `transaction` or `batch` Bundle to the server root and every other resource to `{base}/{resourceType}`.
- `sendResource` POSTs the resource JSON once with `fhirHeaders`. There is no rewrite and no `ifNoneExist`.
- `POST /api/v1/fhir/send` passes `baseUrl`, `resource`, and the auth fields through to `sendResource`.
- The result pane has **Send** (`#send-fhir-button`) and **Validate**. Send confirms, then POSTs `/api/v1/fhir/send`. Settings stores `fhirBaseUrl`, `fhirAuth`, `fhirToken`, `fhirUsername`, and `fhirPassword` from `#settings-fhir-url` and the related fields.
- Official HL7 v2 results are Bundles with `"type": "batch"`.
- `src/lib/fhir/sendResource.spec.js` covers `$validate` only.

If `sendResource` already rewrites Bundles, stop and report the mismatch.

## 3. Files you may edit

- `src/lib/fhir/sendResource.js` and `src/lib/fhir/sendResource.spec.js`
- `src/routes.js` for `POST /api/v1/fhir/send` only
- `src/static/js/template-editor.js` for the Settings field and the Send body
- `src/static/index.html` for that checkbox only
- This spec's `**Status:**` line, a row in `specs/web-ui/editor/00-order.md`, and a bullet in `specs/ORDER.md`

Do not edit templates, samples, official fixtures, or `validateResource`. Do not add a dependency. Do not add `import` or `export` in `src/static/js/`. Do not add a hex color. Do not change the default Send URL or method.

## 4. Requirements

1. `conditionalTransaction(resource)` returns a deep copy when `resource` is a Bundle of type `batch` or `collection`. The copy has `type` `"transaction"`. Each entry keeps its existing fields and gains `request`. `request.method` is `POST` and `request.url` is the entry resource's `resourceType`. When the resource has an `identifier` whose first object has non-empty string `system` and `value`, `request.ifNoneExist` is `identifier=` plus `encodeURIComponent(system)`, a literal `|`, and `encodeURIComponent(value)`. Entries with no such identifier have no `ifNoneExist`. The input object is not mutated. Any other resource, including a Bundle of another type, is returned as-is.
2. `sendResource(baseUrl, resource, auth, options)` uses that copy only when `options.conditional` is true. It still performs one `fetch` POST. With the option off or omitted, the posted JSON is the original resource and the URL is the current `fhirTarget` result.
3. `POST /api/v1/fhir/send` reads `conditional: true` from the JSON body and passes it through. Any other value leaves the option off.
4. Settings has a checkbox, `#settings-fhir-conditional`, labeled **Match existing resources by identifier**, stored as `fhirConditional`. It defaults to off and is restored with the other FHIR settings. When it is checked, Send includes `conditional: true`. When it is not, the request body has no `conditional` property. The existing confirm stays the only dialog. Convert and Validate do not send this flag.
5. Unit tests mock `fetch`. Cover a batch Bundle with a Patient identifier `http://hospital.example/mrn` / `12345` and an Observation with no identifier: one POST to the server root, Patient `ifNoneExist` uses those encoded parts, Observation has no `ifNoneExist`, and the input Bundle's `type` is still `batch`. Cover the option off: the posted `type` is still `batch`. Cover a plain Patient with the option on: one POST to `{base}/Patient` and no transaction wrapper. Do not call a real FHIR server.

## 5. Validation

```sh
npx mocha --no-package --no-config src/lib/fhir/sendResource.spec.js --exit --timeout 10000
node scripts/test-summary.mjs
```

The summary must show 0 unexpected failures. Official classification stays 132 pass / 0 count / 0 content. ESLint and `git diff --check` must pass. If the sandbox reports concurrency 0, rerun `node scripts/test-summary.mjs` outside the sandbox.

Restart the server and check `http://127.0.0.1:2019`. The checkbox is unchecked on a fresh settings state. Convert still finishes. With a FHIR URL set, Send still asks for confirmation. If you cannot open the browser, say so in the handoff.

## 6. Acceptance criteria

- The option off posts the original result once.
- The option on posts one transaction for a `batch` or `collection` Bundle, and the Patient entry's `ifNoneExist` carries the first identifier.
- A second send is still one POST.
- Validate and Convert are unchanged.
- No Liquid template, sample, or official fixture was modified.
- Status, `specs/web-ui/editor/00-order.md`, and `specs/ORDER.md` say Done with the date.

## 7. Git

Branch from current `main`: `feat/editor-08-conditional-send`. One commit, then a normal merge into `main` (no rebase, no amend). Push with `gh auth switch --user gjergjsheldija`, then `git push origin main`, then `gh auth switch --user gjergjsheldija-recare`. That push also publishes the two local OIE commits if they are still ahead of origin. Do not force-push. If the push is rejected, fetch and merge `origin/main`, then push. Do not commit `docs/mappings/`, `opencode.json`, `relative_test.mjs`, or `scripts/omlx-swap.mjs`. Do not update git config and do not skip hooks.
