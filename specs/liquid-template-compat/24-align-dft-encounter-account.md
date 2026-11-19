# Spec 24: Align DFT Encounter account

**Status:** Done (2026-11-19). Actual `account[1]` before: absent (only `Account/4ad7c7d0-b69a-0653-9ea9-0979b8a66b39`); expected `Account/72ed164a-0115-37a3-6648-6eb0d0624048`; now equal. `normalizeVariableNameTypos` maps `AccountId` → `accountId`. `classification.json`: 122 pass / 0 count / 10 content (DFT-P11-01 and -02 now pass, none regressed). Follow `.agents/skills/fhir-template-compat/SKILL.md` and `AGENTS.md`. Spec 22 stays Blocked: do not change `now` or `compare.js`.

## 1. Goal

Two official cases differ first at `Encounter.account[1]`. After this change, neither case still lists that path. Cases that already pass stay passing. `summary.count` stays 0.

## 2. Verified set

From `classification.json` on `main` at `f80850f`. Every content row whose first path is `account.1` is in this set. There are 2, both `DFT_P11`: `DFT-P11-01.hl7` and `DFT-P11-02.hl7`. The representative is `DFT-P11-01.hl7`, Encounter `4b192760-03d2-aec4-b0a6-fde323912e1e`.

Expected `account` on that Encounter:

- `[0].reference` = `Account/4ad7c7d0-b69a-0653-9ea9-0979b8a66b39`
- `[1].reference` = `Account/72ed164a-0115-37a3-6648-6eb0d0624048`

`Resource/_Encounter.liquid` lines 742–748 emit one `account` entry from `AccountId` when that variable is set. The same Encounter id is rendered more than once, and the resource merger unions arrays across renders. What the actual `account` references are, and which render produced index 1, is not known yet. Trace `DFT-P11-01` before editing.

`ORU-R01-01.hl7` differs first at ChargeItem `account`. That is a different signature. It may improve if this is the same cause. Do not require it.

## 3. Files you may edit

- Engine code under `src/lib/liquid-converter/**` and `src/lib/parsers/hl7v2/**`, plus a focused unit test next to the code you change
- `src/lib/outputProcessor/**` only if the trace shows the merger, not the render, changes this array
- `.agents/skills/fhir-template-compat/PROJECT_CONTEXT.md` with the verified result
- `test/e2e-test/liquid-regression/classification.json` by re-running the classifier
- Section 7 of `specs/liquid-template-compat/13-classify-content-diffs.md`
- This spec's `**Status:**` line and a spec 24 bullet in `specs/ORDER.md`

Do not edit any `*.liquid` file, samples, expected fixtures, `compare.js`, or the classifier's status and same-instant rules. Do not add a dependency. Do not extend `normalizeNullNilLiteralAssignment`. Do not add a general case-insensitive variable lookup. A named spelling in `normalizeVariableNameTypos` is allowed only when the trace shows that exact spelling mismatch. Do not special-case these filenames or resource ids. Do not change `nowFilter`.

## 4. Requirements

1. Record the actual and expected `account` references for that Encounter, and the `AccountId` value each render sees, before changing code.
2. Change the engine behavior that selects the wrong index 1. Do not hard-code these Account ids.
3. Re-run `node test/e2e-test/liquid-regression/classify-diffs.mjs`.
4. Stop and do not merge if any of these become true:
   - You cannot name the value that selects the actual `account[1]`.
   - Either of the 2 cases still lists `account.1` as an Encounter path in `contentDelta.fields`.
   - Any case that was `pass` at `f80850f` becomes `count` or `content`.
   - Any case gains a non-empty `byType` count delta.
   - `summary.pass` drops below 120 or `summary.count` is not 0.

A case in the 2 may remain `content` because of another path, including Provenance `text.div`. A new count delta is not allowed.

## 5. Validation

```sh
npx mocha --no-package --no-config <the new unit test> --exit --timeout 10000
node test/e2e-test/liquid-regression/classify-diffs.mjs
node scripts/test-summary.mjs
```

The summary must show 0 unexpected failures. ESLint and `git diff --check` must pass. Use `--no-package --no-config` for a single mocha file. Mocha's package.json spec glob runs the whole suite if a single file is passed without those flags.

## 6. Acceptance criteria

- Neither of the 2 cases lists Encounter `account.1` in `contentDelta.fields`.
- `summary.pass` is at least 120 and `summary.count` is 0.
- No previously passing case regressed.
- No Liquid template, sample, or expected fixture was modified.
- Status and `specs/ORDER.md` say Done with the date, the actual-versus-expected `account[1]`, and the new pass/count/content totals.
