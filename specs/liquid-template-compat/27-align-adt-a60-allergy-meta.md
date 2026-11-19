# Spec 27: Align ADT A60 AllergyIntolerance meta

**Status:** Done (2026-11-19). Verified: ADT-A60-01/02 AllergyIntolerance `373c1fcc-c86b-470a-6469-b7642c16262d` now emits `meta.lastUpdated` `2020-10-15T16:00:00+02:15` (actual; was absent) = expected `2020-10-15T19:15:00+05:30` (same instant, 13:45:00Z); classification 131 pass / 0 count / 1 content; `npm test` 605 passing / 1 failing (ORU-R01-01 compare diff), eslint exit 0. Follow `.agents/skills/fhir-template-compat/SKILL.md` and `AGENTS.md`. Spec 26 is Done and on `origin/main` at `1d3fdcd`. Spec 22 stays Blocked. Do not change `now`, `compare.js`, or the Provenance clock normalizer. Fix only this AllergyIntolerance `meta` path.

## 1. Goal

Two official cases differ first at `AllergyIntolerance.meta`. After this change, neither case still lists that path. Cases that already pass stay passing. `summary.count` stays 0.

## 2. Verified set

From `classification.json` on `main` at `1d3fdcd`. Every content row whose first path is `meta` is in this set. There are 2, both `ADT_A60`: `ADT-A60-01.hl7` and `ADT-A60-02.hl7`. The representative is `ADT-A60-01.hl7`, AllergyIntolerance `373c1fcc-c86b-470a-6469-b7642c16262d`.

Expected `meta` on that resource:

```json
"meta": { "lastUpdated": "2020-10-15T19:15:00+05:30" }
```

`Resource/_AllergyIntolerance.liquid` lines 193–195 always emit `meta.lastUpdated` from `IAM.26.value | format_as_date_time`. What the actual `meta` is, and what `IAM.26` contains, is not known yet. Trace `ADT-A60-01` before editing.

Both rows also list Provenance `occurredDateTime` and `text.div`. Those may be the generation clock. Do not require them to clear, and do not change `now`.

Spec 14 is Blocked: do not rewrite `format_as_date_time` to force `+05:30` when the instants already match. If the only difference is the same instant with a different offset, stop and mark this spec Blocked.

## 3. Files you may edit

- Engine code under `src/lib/liquid-converter/**` and `src/lib/parsers/hl7v2/**`, plus a focused unit test next to the code you change
- `.agents/skills/fhir-template-compat/PROJECT_CONTEXT.md` with the verified result
- `test/e2e-test/liquid-regression/classification.json` by re-running the classifier, only when the engine changed
- Section 7 of `specs/liquid-template-compat/13-classify-content-diffs.md`, only when the engine changed
- This spec's `**Status:**` line and a spec 27 bullet in `specs/ORDER.md`

Do not edit any `*.liquid` file, samples, expected fixtures, `compare.js`, `interceptors.js`, or the classifier's status and same-instant rules. Do not add a dependency. Do not extend `normalizeNullNilLiteralAssignment`. Do not add a general case-insensitive variable lookup. A named spelling in `normalizeVariableNameTypos` is allowed only when the trace shows that exact spelling mismatch. Do not special-case these filenames or resource ids. Do not change `nowFilter` or `prepend`.

## 4. Requirements

1. Record the actual and expected `meta.lastUpdated` for that AllergyIntolerance, and the `IAM.26` value the template sees, before changing code.
2. If the values are the same instant, stop. Set status to Blocked and do not change `format_as_date_time`.
3. Otherwise change the engine behavior that selects the wrong `lastUpdated`. Do not hard-code `2020-10-15T19:15:00+05:30`.
4. Re-run the classifier only when the engine changed.
5. Stop and do not merge an engine change if any of these become true:
   - You cannot name the value that selects the actual `meta`.
   - Either of the 2 cases still lists `meta` as an AllergyIntolerance path in `contentDelta.fields`.
   - Any case that was `pass` at `1d3fdcd` becomes `count` or `content`.
   - Any case gains a non-empty `byType` count delta.
   - `summary.pass` drops below 129 or `summary.count` is not 0.

A case in the 2 may remain `content` because of Provenance. A new count delta is not allowed. A blocked result merges only the spec status and the `specs/ORDER.md` bullet.

## 5. Validation

When the engine changed:

```sh
npx mocha --no-package --no-config <the new unit test> --exit --timeout 10000
node test/e2e-test/liquid-regression/classify-diffs.mjs
node scripts/test-summary.mjs
```

When blocked, do not run the full suite. `git diff --check` must pass. Use `--no-package --no-config` for a single mocha file. A single timeout on a case the classifier marks `pass` is a rerun, not an engine regression.

## 6. Acceptance criteria

Either:

- Neither of the 2 cases lists AllergyIntolerance `meta` in `contentDelta.fields`.
- `summary.pass` is at least 129 and `summary.count` is 0.
- No previously passing case regressed.
- No Liquid template, sample, or expected fixture was modified.
- Status and `specs/ORDER.md` say Done with the date, the actual-versus-expected `lastUpdated`, and the new pass/count/content totals.

Or:

- Status and `specs/ORDER.md` say Blocked with the date and the actual and expected instants.
- No engine file, template, sample, or expected fixture was modified.
