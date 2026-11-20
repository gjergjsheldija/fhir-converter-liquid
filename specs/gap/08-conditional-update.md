# Spec 08: Conditional update on identifier

**Status:** Done (2026-11-20). Verified: sendResource.spec.js 19 passing, test-summary 759 passing, 0 unexpected failures, eslint 0, diff check 0, browser boxes start unchecked and clear each other. Follow `.agents/skills/spec-runner/SKILL.md`, `.agents/skills/test-baseline/SKILL.md`, `.agents/skills/codemirror5-vanilla-ui/SKILL.md`, and `AGENTS.md`. Editor spec 08 is Done. Do not start another gap spec in this change.

## 1. Goal

The existing checkbox still sends a conditional create (`If-None-Exist`). A second checkbox, off by default, sends a conditional update for each entry that has an identifier: one PUT to `{resourceType}?identifier=`. The two checkboxes cannot both be on. This spec does not compare message time with the resource already on the server.

## 2. Current behavior

- `conditionalTransaction` rewrites a `batch` or `collection` Bundle into a `transaction` of POST entries. An identifier becomes `request.ifNoneExist`.
- Settings checkbox `#settings-fhir-conditional` stores `fhirConditional`.
- Send still performs one POST of the whole bundle when that option is on.
- There is no PUT and no update option.

If a conditional update path already exists, stop and report it.

## 3. Files you may edit

- `src/lib/fhir/sendResource.js` and `src/lib/fhir/sendResource.spec.js`
- `src/routes.js` for `POST /api/v1/fhir/send` only
- `src/static/js/template-editor.js` and `src/static/index.html` for the second checkbox
- This spec's `**Status:**` line, the row in `specs/gap/00-order.md`, and the bullet in `specs/ORDER.md`

Do not add a dependency. Do not change the create option's POST body. Do not add an out-of-order check. Do not change Convert or Validate.

## 4. Requirements

1. `conditionalUpdate(resource)` returns a deep copy when `resource` is a Bundle of type `batch` or `collection`. The copy has `type` `"transaction"`. For an entry whose first identifier has non-empty string `system` and `value`, `request.method` is `PUT` and `request.url` is `resourceType + "?identifier=" + encodeURIComponent(system) + "|" + encodeURIComponent(value)`. An entry without that identifier keeps a POST to the resource type and has no search URL. The input is not mutated.
2. `sendResource` uses `conditionalUpdate` only when `options.update` is true. It uses `conditionalTransaction` only when `options.conditional` is true and `options.update` is not true. Both false posts the original resource once.
3. The route passes `update: true` only when the body says `update: true`. If the body sets both `conditional` and `update` to true, respond 400 with message `Choose create or update, not both.` and do not call `fetch`.
4. Settings checkbox `#settings-fhir-update`, labeled **Update the resource that already has this identifier**, is stored as `fhirUpdate`, default off. Checking it unchecks the create checkbox, and checking the create checkbox unchecks it. Send sends `update: true` only when this box is checked, and then does not send `conditional`.
5. Unit tests mock `fetch`. Cover a Patient identifier `http://hospital.example/mrn` / `12345`: one POST of a transaction whose Patient request URL decodes to `Patient?identifier=http://hospital.example/mrn|12345` and whose method is PUT. Cover the option off: the posted type is still `batch`.

## 5. Validation

```sh
npx mocha --no-package --no-config src/lib/fhir/sendResource.spec.js --exit --timeout 10000
node scripts/test-summary.mjs
```

Official classification stays 132 pass / 0 count / 0 content. ESLint and `git diff --check` must pass. In the browser both boxes start unchecked, and checking one clears the other. If the browser is unavailable, say so.

## 6. Acceptance criteria

- Create behavior from editor spec 08 is unchanged when only that box is on.
- Update sends one transaction of PUTs for entries that have an identifier.
- Both flags together never reach the FHIR server.
- Status, `specs/gap/00-order.md`, and `specs/ORDER.md` say Done with the date.

## 7. Git

Branch from current `main`: `feat/gap-08-conditional-update`. One commit, then merge into `main`. Push with `gh auth switch --user gjergjsheldija`, then `git push origin main`, then `gh auth switch --user gjergjsheldija-recare`. Do not force-push.
