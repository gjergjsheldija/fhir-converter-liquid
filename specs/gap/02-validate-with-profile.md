# Spec 02: Validate against one profile

**Status:** Done (2026-11-20). Verified by 15 passing sendResource tests, a clean test-summary run (0 unexpected failures), and a browser check that an empty profile adds no `profile` property while a saved profile adds `?profile=` on Validate only. Follow `.agents/skills/spec-runner/SKILL.md`, `.agents/skills/test-baseline/SKILL.md`, `.agents/skills/codemirror5-vanilla-ui/SKILL.md`, and `AGENTS.md`. Gap spec 01 is independent. Do not start another gap spec in this change.

## 1. Goal

Validate keeps posting to the FHIR server at `{base}/$validate`. A Settings field can add one profile canonical URL to that request. Convert still does not call the server. This spec does not embed the HL7 validator and does not download an IG package.

## 2. Current behavior

- `validateTarget` in `src/lib/fhir/sendResource.js` returns `{base}/$validate` with no query.
- `validateResource` POSTs the resource JSON and reads an OperationOutcome into `issues`.
- `POST /api/v1/fhir/validate` passes `baseUrl`, `resource`, and the auth fields.
- The editor sends that body from the Validate button. Settings stores the FHIR base URL and auth, not a profile.
- Editor spec 07 is Done.

If `validateTarget` already accepts a profile, stop and report the signature.

## 3. Files you may edit

- `src/lib/fhir/sendResource.js` and `src/lib/fhir/sendResource.spec.js`
- `src/routes.js` for `POST /api/v1/fhir/validate` only
- `src/static/js/template-editor.js` and `src/static/index.html` for the one Settings field and the Validate request body
- This spec's `**Status:**` line, the row in `specs/gap/00-order.md`, and the bullet in `specs/ORDER.md`

Do not add a dependency. Do not add `import` or `export` in `src/static/js/`. Do not change Convert or Send.

## 4. Requirements

1. `validateTarget(baseUrl, profile)` appends `?profile=` plus `encodeURIComponent(profile)` when `profile` is a non-empty string. Otherwise the URL is unchanged.
2. `validateResource(baseUrl, resource, auth, options)` passes `options.profile` into `validateTarget`. The POST body is still the resource.
3. The route reads `profile` from the JSON body and passes it through. A missing or blank profile leaves the URL without a query.
4. Settings has a text input `#settings-fhir-profile`, labeled **Profile canonical URL**, stored as `fhirProfile`. It is restored with the other FHIR settings. When it is non-empty, Validate includes `profile`. When it is empty, the body has no `profile` property.
5. Unit tests mock `fetch`. One call with profile `http://hl7.org/fhir/us/core/StructureDefinition/us-core-patient` posts to a URL whose query decodes to that value. One call with no profile posts to `{base}/$validate` with no query. Do not call a real FHIR server.

## 5. Validation

```sh
npx mocha --no-package --no-config src/lib/fhir/sendResource.spec.js --exit --timeout 10000
node scripts/test-summary.mjs
```

Official classification stays 132 pass / 0 count / 0 content. ESLint and `git diff --check` must pass. In the browser, an empty profile field leaves Validate behaving as it does today. If the browser is unavailable, say so.

## 6. Acceptance criteria

- An empty profile does not change the Validate URL.
- A saved profile is sent as the `profile` query parameter and nowhere else.
- Convert does not validate. No validator runtime is added.
- Status, `specs/gap/00-order.md`, and `specs/ORDER.md` say Done with the date.

## 7. Git

Branch from current `main`: `feat/gap-02-validate-profile`. One commit, then merge into `main`. Push with `gh auth switch --user gjergjsheldija`, then `git push origin main`, then `gh auth switch --user gjergjsheldija-recare`. Do not force-push.
