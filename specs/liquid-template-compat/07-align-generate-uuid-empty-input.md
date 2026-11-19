# Spec 07: Align `generate_uuid` empty and null handling with pinned Microsoft v7.0

**Status:** Done (2026-11-19). `generateUuid` returns `null` for null/undefined/whitespace input; all 11 `generate_uuid` tests pass, `0` previously passing regression cases regressed, and the full run is 444 passing / 105 failing (all official `Bundle.entry` baseline diffs). Follow `.agents/skills/fhir-template-compat/SKILL.md` and `AGENTS.md`. Implement this file only after `specs/runtime/02-worker-pool-and-loader-cleanup.md` is in place so `npm test` runs cleanly.

## 1. Goal

Resolve the `4` failing `generate_uuid` unit tests in `src/lib/liquid-converter/liquid-helpers.spec.js` and verify pipeline behavior against the `132` pinned official Microsoft `v7.0` expected JSON fixtures.

## 2. Verified evidence in the current worktree

1. **Direct filter unit failures (`4` cases):**
   `src/lib/liquid-converter/liquid-helpers.spec.js` lines `96–107` assert that `generateUuid(null)`, `generateUuid(undefined)`, `generateUuid('')`, and `generateUuid('   ')` return `null`, matching C# `GeneralFilters.GenerateUUID(string input)`:
   ```csharp
   if (string.IsNullOrWhiteSpace(input))
   {
       return null;
   }
   ```
2. **Why `src/lib/liquid-converter/filters/generateUuid.js` currently returns `984e2374-e7af-8f49-b5da-f1f36ac2d78a`:**
   Commit `949fc92` coerced null/empty/whitespace input to the 4-character string `'null'` (whose SHA-256 Guid is `984e2374-e7af-8f49-b5da-f1f36ac2d78a`) before commit `17231b1` replaced the repository's self-generated expected outputs (`a3d5d4a`) with official Microsoft `v7.0` fixtures (`253307fe6063a42b024ef7dbeb6aae157f1c2f61`).
3. **Ripgrep check against official `v7.0` fixtures (verified 2026-11-17):**
   Searching `test/e2e-test/liquid-fixtures/Expected/Hl7v2/` for `984e2374-e7af-8f49-b5da-f1f36ac2d78a` returns **`0` matches across all `132` official expected files**. Official Microsoft `v7.0` outputs never emit the hash of `"null"`.

## 3. Files you may edit

- `src/lib/liquid-converter/filters/generateUuid.js`
- `src/lib/liquid-converter/liquid-helpers.spec.js` (only to add a Liquid pipeline test alongside the existing direct-call tests; do not weaken or delete existing assertions)
- `.agents/skills/fhir-template-compat/PROJECT_CONTEXT.md` (handoff update upon completion)

Do **not** edit any `*.liquid` file, sample message, or `Expected/Hl7v2/*.json` file.

## 4. Requirements

1. Trace both call levels required by `SKILL.md`:
   - **Direct function call:** `generateUuid(null)`, `generateUuid(undefined)`, `generateUuid('')`, and `generateUuid('   ')` return `null`.
   - **Liquid filter pipeline:** `{% capture empty %}{% endcapture %}{{ empty | generate_id_input: 'Location', false | generate_uuid }}` renders `''` (empty string), matching `GeneralFilters.GenerateUUID(null)` returning `null` to DotLiquid.
2. Update `src/lib/liquid-converter/filters/generateUuid.js` so `null`, `undefined`, and whitespace-only strings return `null`, and update its comment so it accurately cites `GeneralFilters.GenerateUUID` at pinned commit `253307fe6063a42b024ef7dbeb6aae157f1c2f61` rather than the pre-resync `'null'` sentinel.
3. Add a focused Liquid pipeline test in `src/lib/liquid-converter/liquid-helpers.spec.js` verifying `{{ empty | generate_id_input: 'Location', false | generate_uuid }}` renders `''` and a non-empty input renders the deterministic UUID.
4. **Stop condition check (`SKILL.md`):**
   Before editing, record the exact list of currently passing cases in `test/e2e-test/liquid-regression/liquid-regression.spec.js`. After the change, re-run all `132` regression cases:
   - Confirm how many previously failing official fixtures now pass (where bogus `984e2374-e7af-8f49-b5da-f1f36ac2d78a` resources/references disappeared).
   - If **any** previously passing official `v7.0` fixture fails after returning `null`, **stop and report** the exact case and diff rather than guessing a workaround.

## 5. Validation

Run and report exact counts:

```sh
npx mocha src/lib/liquid-converter/liquid-helpers.spec.js
npx mocha test/e2e-test/liquid-regression/liquid-regression.spec.js --timeout 10000 --exit
npm test
npm run eslint
git diff --check
```

## 6. Acceptance criteria

- All `generate_uuid` unit tests (direct call and Liquid pipeline) pass.
- Zero previously passing official `v7.0` regression cases regress.
- No `*.liquid` or fixture files are modified.
- `PROJECT_CONTEXT.md` is updated with the verified post-fix pass/fail count.
