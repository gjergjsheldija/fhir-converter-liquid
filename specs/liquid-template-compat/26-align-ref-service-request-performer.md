# Spec 26: Align REF ServiceRequest performer

**Status:** Done (2026-11-19). Actual `performer` on ServiceRequest `7b0b2ae9-0381-7dd9-e7a7-c4bd1ac4dd1f` (REF-I12-01) was `[Organization/80ff74d2…, Practitioner/e5175c8f…]` (no index 2); expected `[2]` = `PractitionerRole/51be9b51-6b32-13cf-3375-c6e493fccca1`, now emitted; `requester` also cleared (`PractitionerRole/e2c956ec…`). `REF_I12.liquid`/`REF_I14.liquid` line 150 pass `REF_prac:`, `_ServiceRequest.liquid` lines 324-346 read `REF_Prac`; `normalizeVariableNameTypos` maps it. Classification: 129 pass / 0 count / 3 content; the 4 REF cases now pass. Original note: Follow `.agents/skills/fhir-template-compat/SKILL.md` and `AGENTS.md`. Spec 25 is Done and on `origin/main` at `75ec087`. Spec 22 stays Blocked. Do not change `now`, `compare.js`, or the Provenance clock normalizer in `test/e2e-test/util/interceptors.js`. Fix only this ServiceRequest `performer[2]` path.

## 1. Goal

Four official cases still differ on `ServiceRequest.performer[2]`. After this change, none of those cases still lists that path. Cases that already pass stay passing. `summary.count` stays 0.

## 2. Verified set

From `classification.json` on `main` at `75ec087`. The four referral cases are:

- `REF_I12` / `REF-I12-01.hl7` and `REF-I12-02.hl7`, ServiceRequest `7b0b2ae9-0381-7dd9-e7a7-c4bd1ac4dd1f`
- `REF_I14` / `REF-I14-01.hl7`, the same ServiceRequest id
- `REF_I14` / `REF-I14-02.hl7`, ServiceRequest `0dde495c-51b7-d47f-febd-19d8e4e764db`

Each row also lists Provenance `text.div` first. That narrative clock is already normalized before the official compare (`interceptors.js` `__normalizeProvenanceTextDiv`). `contentDelta` does not apply that normalizer, so `text.div` stays the first classification path even when the compare failure is later. Do not try to clear `text.div`. Do not change the interceptor.

Expected `performer` on ServiceRequest `7b0b2ae9-0381-7dd9-e7a7-c4bd1ac4dd1f` in `REF-I12-01`:

- `[0].reference` = `Organization/80ff74d2-6469-90ca-3a77-3574d4c04598`
- `[1].reference` = `Practitioner/e5175c8f-a538-de38-de67-e60dd1974cd5`
- `[2].reference` = `PractitionerRole/51be9b51-6b32-13cf-3375-c6e493fccca1`

Expected `requester.reference` on that resource is `PractitionerRole/e2c956ec-0fec-19c6-ec84-91181e279d6b`. The same rows also list `requester`. That path may clear with the same fix. Do not require it.

`Resource/_ServiceRequest.liquid` lines 324–346 set `requester` from `REF_Prac` when `PRD.1` is `"RP"`, and `performer` from `Organization_ID_RF1_19`, `REF_Prac` when `PRD.1` is `"RT"`, and `Practitioner_ID_RF1_20`. What the actual `performer[2]` is, and which of those variables the template sees, is not known yet. Trace `REF-I12-01` before editing.

## 3. Files you may edit

- Engine code under `src/lib/liquid-converter/**` and `src/lib/parsers/hl7v2/**`, plus a focused unit test next to the code you change
- `src/lib/outputProcessor/**` only if the trace shows the merger, not the render, changes this array
- `.agents/skills/fhir-template-compat/PROJECT_CONTEXT.md` with the verified result
- `test/e2e-test/liquid-regression/classification.json` by re-running the classifier
- Section 7 of `specs/liquid-template-compat/13-classify-content-diffs.md`
- This spec's `**Status:**` line and a spec 26 bullet in `specs/ORDER.md`

Do not edit any `*.liquid` file, samples, expected fixtures, `compare.js`, `interceptors.js`, or the classifier's status and same-instant rules. Do not add a dependency. Do not extend `normalizeNullNilLiteralAssignment`. Do not add a general case-insensitive variable lookup. A named spelling in `normalizeVariableNameTypos` is allowed only when the trace shows that exact spelling mismatch. Do not special-case these filenames or resource ids. Do not change `nowFilter` or `prepend`.

## 4. Requirements

1. Record the actual and expected `performer` references for ServiceRequest `7b0b2ae9-0381-7dd9-e7a7-c4bd1ac4dd1f`, and the value that selects actual index 2, before changing code.
2. Change the engine behavior that selects the wrong reference. Do not hard-code these ids.
3. Re-run `node test/e2e-test/liquid-regression/classify-diffs.mjs`.
4. Stop and do not merge if any of these become true:
   - You cannot name the value that selects the actual `performer[2]`.
   - Any of the 4 cases still lists `performer.2` as a ServiceRequest path in `contentDelta.fields`.
   - Any case that was `pass` at `75ec087` becomes `count` or `content`.
   - Any case gains a non-empty `byType` count delta.
   - `summary.pass` drops below 125 or `summary.count` is not 0.

A case in the 4 may remain `content` because of Provenance `text.div` or `requester`. A new count delta is not allowed.

## 5. Validation

```sh
npx mocha --no-package --no-config <the new unit test> --exit --timeout 10000
node test/e2e-test/liquid-regression/classify-diffs.mjs
node scripts/test-summary.mjs
```

The summary must show 0 unexpected failures. A single timeout on a case that the classifier marks `pass` is a rerun, not an engine regression. ESLint and `git diff --check` must pass. Use `--no-package --no-config` for a single mocha file.

## 6. Acceptance criteria

- None of the 4 cases lists ServiceRequest `performer.2` in `contentDelta.fields`.
- `summary.pass` is at least 125 and `summary.count` is 0.
- No previously passing case regressed.
- No Liquid template, sample, or expected fixture was modified.
- Status and `specs/ORDER.md` say Done with the date, the actual-versus-expected `performer[2]`, and the new pass/count/content totals.
